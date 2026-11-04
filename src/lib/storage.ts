import { openDB, type DBSchema } from 'idb';
import type { CachedWeek, Settings } from './types';
import { namespace, weekKey } from './calendar';
interface ChartDB extends DBSchema { weeks: { key: string; value: CachedWeek }; meta: { key: string; value: unknown } }
export const isLastfmWeekSynced = (week: CachedWeek) => week.lastfmSynced ??
  (week.scrobbles.length === 0 || week.scrobbles.some(s => !s.source || s.source === 'lastfm'));
let connection: ReturnType<typeof openDB<ChartDB>> | undefined;
const db = () => connection ??= openDB<ChartDB>('lastchart-studio-pro-v1', 1, {
  upgrade(database) { database.createObjectStore('weeks', { keyPath: 'key' }); database.createObjectStore('meta'); },
  blocking() { void connection?.then(database => database.close()); connection = undefined; },
  terminated() { connection = undefined; },
}).catch(error => { connection = undefined; throw error; });
export async function readWeeks(settings: Settings) {
  const database = await db();
  const prefix = `${namespace(settings)}:`;
  return database.getAll('weeks', IDBKeyRange.bound(prefix, `${prefix}\uffff`));
}
export async function saveWeek(week: CachedWeek) { return (await db()).put('weeks', week); }
export async function putMeta(key: string, value: unknown) { return (await db()).put('meta', value, key); }
export async function getMeta<T>(key: string): Promise<T | undefined> { return (await db()).get('meta', key) as Promise<T | undefined>; }
export async function importWeeks(settings: Settings, weeks: CachedWeek[]) {
  const database = await db();
  const tx = database.transaction('weeks', 'readwrite');
  for (const week of weeks) await tx.store.put({ ...week, key: weekKey(settings, week.week.id) });
  await tx.done;
}
/** Reads every meta value whose key starts with the prefix (keys are strings). */
export async function readMetaRange<T>(prefix: string): Promise<Array<[string, T]>> {
  const database = await db();
  const range = IDBKeyRange.bound(prefix, `${prefix}￿`);
  const [keys, values] = await Promise.all([database.getAllKeys('meta', range), database.getAll('meta', range)]);
  return keys.map((key, i) => [String(key), values[i] as T]);
}
export async function deleteMeta(key: string) { return (await db()).delete('meta', key); }
