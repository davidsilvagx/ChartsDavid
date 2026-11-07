import { packCharts } from '../lib/chartTransfer';
import { buildCharts, getLibrary } from '../lib/charts';
import { closedCache } from '../lib/closedWeeks';
import type { AliasRule, CachedWeek, Kind, SourceFilter, Week } from '../lib/types';

self.onmessage = (
  event: MessageEvent<{
    id: number;
    weeks: Week[];
    cached: CachedWeek[];
    kind: Kind;
    deduplicate: boolean;
    aliases?: AliasRule[];
    sourceFilter?: SourceFilter;
  }>,
) => {
  const { id, weeks, cached, kind, deduplicate, aliases, sourceFilter = 'all' } = event.data;
  try {
    const closed = closedCache(weeks, cached);
    const open = new Set(weeks.filter(w => w.partial).map(w => w.id));
    const series = buildCharts(weeks, [...closed, ...cached.filter(c => open.has(c.week.id))], kind, deduplicate, aliases, sourceFilter);
    self.postMessage({
      id,
      packed: packCharts(series),
      library: getLibrary(closed, kind, deduplicate, aliases, sourceFilter),
    });
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
};
