import { getLibrary } from '../lib/charts';
import type { AliasRule, CachedWeek, Kind, SourceFilter } from '../lib/types';

/** Itens de cada tipo no período, para indicados da premiação. Limita a 400 por tipo. */
self.onmessage = (event: MessageEvent<{ cached: CachedWeek[]; deduplicate: boolean; aliases?: AliasRule[]; source: SourceFilter }>) => {
  const { cached, deduplicate, aliases, source } = event.data;
  try {
    const pools = Object.fromEntries((['tracks', 'albums', 'artists'] as Kind[]).map(kind => [kind, getLibrary(cached, kind, deduplicate, aliases, source).slice(0, 400)]));
    self.postMessage({ pools });
  } catch {
    self.postMessage({ error: 'Não foi possível preparar os indicados deste período.' });
  }
};
