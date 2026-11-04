import { buildPools } from '../lib/pools';
import type { AliasRule, CachedWeek, SourceFilter, Week } from '../lib/types';
self.onmessage = (event: MessageEvent<{ cached: CachedWeek[]; deduplicate: boolean; aliases?: AliasRule[]; source: SourceFilter; year?: number | null; calendar?: Week[] }>) => {
  const { cached, deduplicate, aliases, source, year, calendar } = event.data;
  const selected = year == null ? cached : cached.filter(week => week.week.year === year);
  try { self.postMessage(buildPools(selected, deduplicate, aliases, source, calendar && year != null ? { history: cached, calendar } : undefined)); }
  catch { self.postMessage({ error: 'Não foi possível preparar os indicados deste período.' }); }
};
