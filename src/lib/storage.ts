import { openDB, type DBSchema } from 'idb';
import type { CachedWeek, Settings } from './types';
import { namespace, weekKey } from './calendar';
interface ChartDB extends DBSchema { weeks: { key: string; value: CachedWeek }; meta: { key: string; value: unknown } }
export const isLastfmWeekSynced = (week: CachedWeek) => week.lastfmSynced ??
  (week.scrobbles.length === 0 || week.scrobbles.some(s => !s.source || s.source === 'lastfm'));
let connection: ReturnType<typeof openDB<ChartDB>> | undefined;
export const databaseName = (owner:string) => owner === 'guest' ? 'lastchart-studio-pro-v1' : `lastchart-studio-pro-v1:account:${owner}`;
const owner = () => { try { return localStorage.getItem('lastchart-account:workspace-owner') || 'guest'; } catch { return 'guest'; } };
const changed = (key:string) => { if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('lastchart-data-changed',{detail:key})); };
const db = () => connection ??= openDB<ChartDB>(databaseName(owner()), 1, {
  upgrade(database) { database.createObjectStore('weeks', { keyPath: 'key' }); database.createObjectStore('meta'); },
  blocking() { void connection?.then(database => database.close()); connection = undefined; },
  terminated() { connection = undefined; },
}).catch(error => { connection = undefined; throw error; });
export async function readWeeks(settings: Settings) {
  const database = await db();
  const prefix = `${namespace(settings)}:`;
  return database.getAll('weeks', IDBKeyRange.bound(prefix, `${prefix}\uffff`));
}
export async function saveWeek(week: CachedWeek) { const result=await (await db()).put('weeks', week); changed('history'); return result; }
export async function putMeta(key: string, value: unknown) { await (await db()).put('meta', value, key); if(!key.startsWith('account-sync:'))changed(key); if(typeof window!=='undefined'&&/^meta(-review)?:v1:/.test(key))window.dispatchEvent(new Event('lastchart-catalog-changed')); }
export async function getMeta<T>(key: string): Promise<T | undefined> { return (await db()).get('meta', key) as Promise<T | undefined>; }
export async function importWeeks(settings: Settings, weeks: CachedWeek[]) {
  const database = await db();
  const tx = database.transaction('weeks', 'readwrite');
  for (const week of weeks) await tx.store.put({ ...week, key: weekKey(settings, week.week.id) });
  await tx.done;
  changed('history');
}
/** Reads every meta value whose key starts with the prefix (keys are strings). */
export async function readMetaRange<T>(prefix: string): Promise<Array<[string, T]>> {
  const database = await db();
  const range = IDBKeyRange.bound(prefix, `${prefix}￿`);
  const [keys, values] = await Promise.all([database.getAllKeys('meta', range), database.getAll('meta', range)]);
  return keys.map((key, i) => [String(key), values[i] as T]);
}
export async function deleteMeta(key: string) { await (await db()).delete('meta', key); changed(key); }

/** Copy guest data once, before switching namespaces; the original database remains intact. */
export async function copyGuestDatabaseToAccount(accountId:string) {
  const target=await openDB<ChartDB>(databaseName(accountId),1,{upgrade(d){d.createObjectStore('weeks',{keyPath:'key'});d.createObjectStore('meta');}});
  try {
    if(await target.count('weeks')||await target.count('meta'))return;
    const current=await db();const weeks=await current.getAll('weeks');const keys=await current.getAllKeys('meta');const values=await current.getAll('meta');
    const tx=target.transaction(['weeks','meta'],'readwrite');for(const week of weeks)await tx.objectStore('weeks').put(week);for(let i=0;i<keys.length;i++)await tx.objectStore('meta').put(values[i],keys[i]);await tx.done;
  } finally {target.close();}
}
