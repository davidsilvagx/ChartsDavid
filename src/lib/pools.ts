import { getLibrary, itemOf, selectScrobblesForFilter } from './charts';
import type { ItemStats } from './jury';
import { addPersonalAwardStats } from './awardStats';
import type { AliasRule, CachedWeek, Item, Kind, SourceFilter, Week } from './types';

const kinds: Kind[] = ['tracks', 'albums', 'artists'];
/** Até 400 obras por tipo e todos os artistas do período; estatísticas semanais para o júri automático. */
export function buildPools(cached: CachedWeek[], deduplicate: boolean, aliases: AliasRule[] | undefined, source: SourceFilter, context?: { history: CachedWeek[]; calendar: Week[] }) {
  const pools = Object.fromEntries(kinds.map(kind => { const items = getLibrary(cached, kind, deduplicate, aliases, source); return [kind, kind === 'artists' ? items : items.slice(0, 400)]; })) as Record<Kind, Item[]>;
  const stats = Object.fromEntries(kinds.map(kind => [kind, {} as Record<string, ItemStats>])) as Record<Kind, Record<string, ItemStats>>;
  if (!cached.length) return { pools, stats };
  const start = Math.min(...cached.map(w => w.week.start)), end = Math.max(...cached.map(w => w.week.end)), mid = start + (end - start) / 2;
  for (const kind of kinds) {
    const wanted = new Set(pools[kind].map(i => i.id)), table = stats[kind];
    for (const id of wanted) table[id] = { plays: 0, weeksActive: 0, weeksAtOne: 0, weeksTop10: 0, firstHalf: 0, secondHalf: 0 };
    for (const week of cached) {
      const counts = new Map<string, number>();
      for (const s of selectScrobblesForFilter(week.scrobbles, deduplicate, source, week.week.start, week.week.end)) {
        const item = itemOf(s, kind, aliases); if (!item) continue;
        counts.set(item.id, (counts.get(item.id) ?? 0) + 1);
        const row = table[item.id]; if (row) { row.plays++; if (s.timestamp < mid) row.firstHalf++; else row.secondHalf++; }
      }
      const ranked = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
      ranked.forEach(([id], i) => { const row = table[id]; if (!row) return; row.weeksActive++; if (i === 0) row.weeksAtOne++; if (i < 10) row.weeksTop10++; });
    }
  }
  if (context) addPersonalAwardStats(stats, cached, context.history, context.calendar, deduplicate, aliases, source);
  return { pools, stats };
}
