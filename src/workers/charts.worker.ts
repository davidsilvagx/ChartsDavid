import { buildCharts, getLibrary } from '../lib/charts';
import type { AliasRule, CachedWeek, Kind, Week } from '../lib/types';

self.onmessage = (event: MessageEvent<{ id: number; weeks: Week[]; cached: CachedWeek[]; kind: Kind; deduplicate: boolean; aliases?: AliasRule[] }>) => {
  const { id, weeks, cached, kind, deduplicate, aliases } = event.data;
  try {
    self.postMessage({
      id,
      charts: buildCharts(weeks, cached, kind, deduplicate, aliases),
      library: getLibrary(cached, kind, deduplicate, aliases),
    });
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
};
