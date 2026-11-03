import { buildCharts, getLibrary } from '../lib/charts';
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
    self.postMessage({
      id,
      charts: buildCharts(weeks, cached, kind, deduplicate, aliases, sourceFilter),
      library: getLibrary(cached, kind, deduplicate, aliases, sourceFilter),
    });
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
};
