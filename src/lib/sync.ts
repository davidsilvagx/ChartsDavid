import { fetchWeek, getProfile } from './api';
import { makeWeeks, weekKey } from './calendar';
import { readWeeks, saveWeek, putMeta } from './storage';
import type { CachedWeek, Settings, SyncProgress, SyncScope } from './types';

export async function synchronize(
  settings: Settings,
  scope: SyncScope,
  signal: AbortSignal,
  onProgress: (p: SyncProgress) => void,
  force = false,
  onWeekSaved?: (week: CachedWeek) => void,
) {
  onProgress({
    completed: 0,
    total: 0,
    pages: 0,
    scope,
    force,
    phase: 'connecting',
    message: `Conectando ao Last.fm (@${settings.user})…`,
  });

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

  const update = (message: string, phase: SyncProgress['phase'] = 'fetching') =>
    onProgress({
      completed,
      total: Math.max(1, selected.length),
      pages,
      scope,
      force,
      phase,
      message,
    });

  if (todo.length === 0) {
    completed = selected.length;
    update('Todas as semanas deste período já estão sincronizadas', 'done');
    return profile;
  }

  update(`Baixando ${todo.length} ${todo.length === 1 ? 'semana' : 'semanas'} em paralelo…`, 'fetching');

  await Promise.all(
    Array.from({ length: Math.min(5, todo.length) }, async () => {
      while (cursor < todo.length && !failure && !signal.aborted) {
        const week = todo[cursor++];
        try {
          const data = await fetchWeek(
            settings,
            week,
            signal,
            () => {
              pages++;
              update(`Recebendo Sem. ${week.number} (${week.label}/${week.year})…`);
            },
            now,
          );
          signal.throwIfAborted();
          const prevOtherSources = (cached.get(week.id)?.scrobbles ?? []).filter(
            s => s.source === 'spotify' || s.source === 'ytmusic',
          );
          const mergedScrobbles = prevOtherSources.length
            ? [...prevOtherSources, ...data.scrobbles].sort((a, b) => a.timestamp - b.timestamp)
            : data.scrobbles;
          const record: CachedWeek = {
            key: weekKey(settings, week.id),
            week,
            scrobbles: mergedScrobbles,
            cutoff: data.cutoff,
            duplicates: data.duplicates,
            fetchedAt: Date.now(),
          };
          await saveWeek(record);
          completed++;
          onWeekSaved?.(record);
          update(`Semana ${week.number} salva (${completed}/${selected.length})`);
        } catch (error) {
          failure = error;
        }
      }
    }),
  );

  if (failure) throw failure;
  signal.throwIfAborted();
  update('Histórico sincronizado com sucesso', 'done');
  return profile;
}
