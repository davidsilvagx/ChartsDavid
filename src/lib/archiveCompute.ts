import type { AccountSnapshot } from './accountSync';
import { parseBackup, backupJSON } from './export';
import type { Settings, CachedWeek, Profile } from './types';
const sha256Hex=async(text:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))).map(n=>n.toString(16).padStart(2,'0')).join('');
export const stable = (value: unknown): string =>
  JSON.stringify(value, (_, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, v[k]]),
        )
      : v,
  );
export function snapshotFields(snapshot: AccountSnapshot) {
  const fields: Record<string, unknown> = {
    "secret:apiKey": snapshot.lastfmApiKey,
  };
  for (const group of ["local", "meta", "audio"] as const)
    for (const [key, value] of Object.entries(snapshot.project[group]))
      fields[`${group}:${key}`] = value;
  return fields;
}
export async function fingerprint(snapshot: AccountSnapshot) {
  let history: unknown = null;
  if (snapshot.project.history) {
    const parsed = parseBackup(snapshot.project.history);
    history = {
      user: parsed.settings.user.toLowerCase(),
      startDate: parsed.settings.startDate,
      timezone: parsed.settings.timezone,
      weeks: parsed.weeks.sort((a, b) => a.week.start - b.week.start).map(w => ({
        ...w,
        scrobbles: w.scrobbles.map(value=>({value,key:stable(value)})).sort((a,b)=>a.key<b.key?-1:a.key>b.key?1:0).map(row=>row.value),
      })),
    };
  }
  return sha256Hex(stable({ ...snapshotFields(snapshot), history }));
}
export type ArchiveJob={method:'fingerprint';snapshot:AccountSnapshot}|{method:'backup';settings:Settings;weeks:CachedWeek[];profile:Profile|null};
export async function computeArchive(job:ArchiveJob){return job.method==='fingerprint'?fingerprint(job.snapshot):backupJSON(job.settings,job.weeks,job.profile);}
