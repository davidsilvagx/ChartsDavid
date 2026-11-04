import { metaKey, type EffectiveMeta, type VersionTag } from './metadata';
import type { Item, Kind } from './types';

export interface MetaFilter { genre: string; decade: string; version: VersionTag | '' }
export const emptyMetaFilter: MetaFilter = { genre: '', decade: '', version: '' };
export const UNKNOWN = '__unknown__';

export function metaMatches(item: Item, kind: Kind, meta: Map<string, EffectiveMeta>, filter: MetaFilter) {
  if (!filter.genre && !filter.decade && !filter.version) return true;
  const record = meta.get(metaKey(kind, item));
  if (filter.genre && (filter.genre === UNKNOWN ? !!record?.genre : record?.genre !== filter.genre)) return false;
  if (filter.decade) { const year = Number(record?.releaseDate?.slice(0, 4)); if (filter.decade === UNKNOWN ? Number.isFinite(year) && year > 0 : !(year >= Number(filter.decade) && year < Number(filter.decade) + 10)) return false; }
  if (filter.version && !record?.versions.includes(filter.version)) return false;
  return true;
}

