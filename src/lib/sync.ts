import { fetchWeek, getProfile } from './api';
import { makeWeeks, weekKey } from './calendar';
import { readWeeks, saveWeek, putMeta } from './storage';
import type { Settings, SyncProgress } from './types';
export async function synchronize(settings: Settings, scope: 'recent' | 'all' | number, signal: AbortSignal, onProgress: (p: SyncProgress) => void, force = false) {
  const profile = await getProfile(settings, signal);
  await putMeta(`profile:${settings.user.toLowerCase()}`, profile);
  const now = Date.now();
  const all = makeWeeks(settings, now);
  const selected = scope === 'all' ? all : scope === 'recent' ? all.slice(-8) : all.filter(w => w.year === scope);
  const cached = new Map((await readWeeks(settings)).map(w => [w.week.id, w]));
  const todo = selected.filter(w => force || !cached.has(w.id) || w.end * 1000 > now - 14 * 86400000);
  let completed = selected.length - todo.length;
  let pages = 0;
  let cursor = 0;
  let failure: unknown;
  const update = (message: string) => onProgress({ completed, total: selected.length, pages, message });
  update('Preparando seu histórico…');
  await Promise.all(Array.from({ length: Math.min(5, todo.length) }, async () => {
    while (cursor < todo.length && !failure && !signal.aborted) {
      const week = todo[cursor++];
      try {
        const data = await fetchWeek(settings, week, signal, () => { pages++; update(`Semana ${week.number} · ${week.label}`); }, now);
        signal.throwIfAborted();
        await saveWeek({ key: weekKey(settings, week.id), week, ...data, fetchedAt: Date.now() });
        completed++;
        update(`Semana ${week.number} salva`);
      } catch (error) { failure = error; }
    }
  }));
  if (failure) throw failure;
  signal.throwIfAborted();
  update('Histórico atualizado');
  return profile;
}
