-- LastChart: isolated, private snapshots. No service-role key is sent to the browser.
create table if not exists public.lastchart_snapshots (
  user_id uuid primary key references auth.users(id) on delete cascade,
  revision bigint not null check (revision > 0),
  object_path text not null,
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  updated_at timestamptz not null default now()
);
alter table public.lastchart_snapshots enable row level security;
revoke all on public.lastchart_snapshots from anon, authenticated;
grant select on public.lastchart_snapshots to authenticated;
drop policy if exists "Read own LastChart snapshot" on public.lastchart_snapshots;
create policy "Read own LastChart snapshot" on public.lastchart_snapshots for select to authenticated using (user_id = (select auth.uid()));

create or replace function public.lastchart_commit_snapshot(expected_revision bigint, new_path text, new_sha256 text)
returns public.lastchart_snapshots language plpgsql security definer set search_path = '' as $$
declare owner_id uuid := auth.uid(); result public.lastchart_snapshots;
begin
  if owner_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if new_path !~ ('^' || owner_id::text || '/snapshots/[a-f0-9-]{36}\.gz$') or new_sha256 !~ '^[a-f0-9]{64}$' or expected_revision < 0 then
    raise exception 'Invalid snapshot' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text, 0));
  select * into result from public.lastchart_snapshots where user_id = owner_id;
  if coalesce(result.revision, 0) <> expected_revision then raise exception 'Snapshot changed on another device' using errcode = 'PT409'; end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'lastchart-private' and o.name = new_path and o.owner_id = auth.uid()::text) then
    -- The path itself is already tied to auth.uid(); require the uploaded object to exist.
    raise exception 'Upload snapshot before committing' using errcode = '22023';
  end if;
  insert into public.lastchart_snapshots(user_id, revision, object_path, sha256)
  values (owner_id, expected_revision + 1, new_path, new_sha256)
  on conflict (user_id) do update set revision = excluded.revision, object_path = excluded.object_path, sha256 = excluded.sha256, updated_at = now()
  returning * into result;
  return result;
end;
$$;
revoke all on function public.lastchart_commit_snapshot(bigint,text,text) from public, anon;
grant execute on function public.lastchart_commit_snapshot(bigint,text,text) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit) values ('lastchart-private','lastchart-private',false,67108864)
on conflict(id) do nothing;
drop policy if exists "Read own LastChart files" on storage.objects;
create policy "Read own LastChart files" on storage.objects for select to authenticated using (bucket_id = 'lastchart-private' and (storage.foldername(name))[1] = (select auth.uid()::text));
drop policy if exists "Create own LastChart files" on storage.objects;
create policy "Create own LastChart files" on storage.objects for insert to authenticated with check (bucket_id = 'lastchart-private' and (storage.foldername(name))[1] = (select auth.uid()::text));
-- Files are immutable. CAS in lastchart_commit_snapshot protects concurrent devices.
