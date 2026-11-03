import { ApiError, fetchWeek, getProfile } from './api';
import { makeWeeks, weekKey } from './calendar';
import { isLastfmWeekSynced, readWeeks, saveWeek, putMeta } from './storage';
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
  const todo = selected.filter(w => force || !cached.has(w.id) || !isLastfmWeekSynced(cached.get(w.id)!) ||
    (cached.get(w.id)!.cutoff < w.end && w.end * 1000 <= now) ||
    w.end * 1000 > now - 14 * 86400000).sort((a, b) => b.start - a.start);

  let completed = 0;
  let pages = 0;
  let cursor = 0;
  let failure: unknown;

  const update = (message: string, phase: SyncProgress['phase'] = 'fetching') =>
    onProgress({
      completed,
      total: todo.length,
      pages,
      scope,
      force,
      phase,
      message,
    });

  if (todo.length === 0) {
    update('Todas as semanas deste período já estão sincronizadas', 'done');
    return profile;
  }

  update(`Baixando ${todo.length} ${todo.length === 1 ? 'semana' : 'semanas'} em paralelo…`, 'fetching');

  let queue = todo;
  for (let round = 0; round < 2 && queue.length; round++) {
    const failed: typeof todo = [];
    cursor = 0;
    await Promise.all(
      Array.from({ length: Math.min(5, queue.length) }, async () => {
        while (cursor < queue.length && !failure && !signal.aborted) {
          const week = queue[cursor++];
          let data: Awaited<ReturnType<typeof fetchWeek>>;
          try {
            data = await fetchWeek(
              settings,
              week,
              signal,
              (page, totalPages) => {
                pages++;
                update(`Sem. ${week.number} · ${week.label} · página ${page} de ${Math.max(1, totalPages)}`);
              },
              now,
              attempt => update(`Last.fm demorou a responder · semana ${week.number} · nova tentativa ${attempt} de 3…`),
            );
          } catch (error) {
            if (signal.aborted) return;
            if (error instanceof ApiError && [6, 10, 26, 401, 403].includes(error.code)) failure = error;
            else failed.push(week);
            update(`Semana ${week.number} aguardando nova tentativa; continuando as demais…`);
            continue;
          }
          try {
            signal.throwIfAborted();
            const prevOtherSources = (cached.get(week.id)?.scrobbles ?? []).filter(
              s => s.source === 'spotify' || s.source === 'ytmusic',
            );
            const mergedScrobbles = prevOtherSources.length
              ? [...prevOtherSources, ...data.scrobbles].sort((a, b) => a.timestamp - b.timestamp)
              : data.scrobbles;
            const record: CachedWeek = {
              lastfmSynced: true,
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
            update(`Semana ${week.number} salva · ${week.label}`);
          } catch (error) {
            failure = error;
          }
        }
      }),
    );
    queue = failed;
    if (round === 0 && queue.length && !failure) update(`Retentando ${queue.length} semanas pendentes. As demais já estão salvas…`);
  }

  if (failure) throw failure;
  signal.throwIfAborted();
  if (queue.length) throw new Error(`${completed} de ${todo.length} semanas deste download foram salvas. ${queue.length} ficaram pendentes por falha do Last.fm ou da conexão. Toque em “Continuar histórico” para retomar sem perder o que já baixou.`);
  update('Histórico sincronizado com sucesso', 'done');
  return profile;
}
