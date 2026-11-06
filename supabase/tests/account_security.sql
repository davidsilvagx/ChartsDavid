-- Run in SQL Editor. Assertions roll back all fixture rows; no e-mails or passwords involved.
begin;
insert into auth.users(id,email) values ('11111111-1111-4111-8111-111111111111','lastchart-rls-a@example.invalid'),('22222222-2222-4222-8222-222222222222','lastchart-rls-b@example.invalid');
insert into public.lastchart_snapshots(user_id,revision,object_path,sha256) values
 ('11111111-1111-4111-8111-111111111111',1,'11111111-1111-4111-8111-111111111111/snapshots/11111111-0000-4000-8000-111111111111.gz',repeat('a',64)),
 ('22222222-2222-4222-8222-222222222222',1,'22222222-2222-4222-8222-222222222222/snapshots/22222222-0000-4000-8000-222222222222.gz',repeat('b',64));
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
do $$ begin
 if (select count(*) from public.lastchart_snapshots) <> 1 then raise exception 'RLS account isolation failed'; end if;
 if exists(select 1 from public.lastchart_snapshots where user_id='22222222-2222-4222-8222-222222222222') then raise exception 'Other account visible'; end if;
 begin
  insert into storage.objects(bucket_id,name,owner_id) values('lastchart-private','22222222-2222-4222-8222-222222222222/audio/forbidden','11111111-1111-4111-8111-111111111111');
  raise exception 'Cross-account upload allowed';
 exception when insufficient_privilege then null; end;
end $$;
insert into storage.objects(bucket_id,name,owner_id) values('lastchart-private','11111111-1111-4111-8111-111111111111/snapshots/11111111-0000-4000-8000-111111111111.gz','11111111-1111-4111-8111-111111111111');
do $$ declare saved public.lastchart_snapshots; begin
 saved:=public.lastchart_commit_snapshot(1,'11111111-1111-4111-8111-111111111111/snapshots/11111111-0000-4000-8000-111111111111.gz',repeat('a',64));
 if saved.revision<>2 then raise exception 'Revision increment failed'; end if;
 begin
  perform public.lastchart_commit_snapshot(1,'11111111-1111-4111-8111-111111111111/snapshots/11111111-0000-4000-8000-111111111111.gz',repeat('a',64));
  raise exception 'Stale revision overwrote the snapshot';
 exception when sqlstate 'PT409' then null; end;
 begin
  perform public.lastchart_commit_snapshot(2,'22222222-2222-4222-8222-222222222222/snapshots/22222222-0000-4000-8000-222222222222.gz',repeat('a',64));
  raise exception 'Cross-account commit allowed';
 exception when invalid_parameter_value then null; end;
end $$;
set local role anon;
do $$ begin
 begin perform * from public.lastchart_snapshots;raise exception 'Anonymous read allowed';exception when insufficient_privilege then null;end;
 begin perform public.lastchart_commit_snapshot(0,'invalid',repeat('a',64));raise exception 'Anonymous write allowed';exception when insufficient_privilege then null;end;
end $$;
rollback;
select 'PASS: own-only reads, uploads, atomic revisions, stale conflicts, foreign paths and anonymous denial. All fixtures rolled back.' as lastchart_security;
