import { buildPools } from '../lib/pools';
import type { AliasRule, CachedWeek, SourceFilter } from '../lib/types';
self.onmessage = (event: MessageEvent<{ cached: CachedWeek[]; deduplicate: boolean; aliases?: AliasRule[]; source: SourceFilter }>) => {
  const { cached, deduplicate, aliases, source } = event.data;
  try { self.postMessage(buildPools(cached, deduplicate, aliases, source)); }
  catch { self.postMessage({ error: 'Não foi possível preparar os indicados deste período.' }); }
};
