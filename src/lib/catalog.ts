import { getMeta, putMeta } from './storage';
import { normalize } from './charts';
import type { Item } from './types';

export interface CatalogMedia {
  artworkUrl: string;
  previewUrl: string;
  trackViewUrl: string;
  trackName?: string;
}

interface ItunesResult {
  artistName: string;
  trackName: string;
  collectionName: string;
  artworkUrl: string;
  previewUrl: string;
  trackViewUrl: string;
}

const memoryCache = new Map<string, CatalogMedia | null>();
const inflight = new Map<string, Promise<CatalogMedia | null>>();

function itemCacheKey(item: Pick<Item, 'id' | 'name' | 'artist' | 'album'>): string {
  return `catalog:v1:${normalize(item.artist)}::${normalize(item.name)}`;
}

function artistMatches(candidate: string, target: string): boolean {
  const a = normalize(candidate);
  const b = normalize(target);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

function titleMatches(candidate: string, target: string): boolean {
  const clean = (v: string) => normalize(v).replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
  const a = normalize(candidate);
  const b = normalize(target);
  if (!a || !b) return false;
  return a === b || clean(a) === clean(b);
}

export function peekCatalogMedia(item: Pick<Item, 'id' | 'name' | 'artist' | 'album'>): CatalogMedia | null | undefined {
  return memoryCache.get(itemCacheKey(item));
}

export async function resolveCatalogMedia(item: Pick<Item, 'id' | 'name' | 'artist' | 'album'>): Promise<CatalogMedia | null> {
  const key = itemCacheKey(item);
  if (memoryCache.has(key)) return memoryCache.get(key) ?? null;
  const existing = inflight.get(key);
  if (existing) return existing;

  const task = (async (): Promise<CatalogMedia | null> => {
    try {
      const stored = await getMeta<CatalogMedia | null>(key);
      if (stored !== undefined) {
        memoryCache.set(key, stored);
        return stored;
      }
    } catch {
      // Storage unavailable; continue with network lookup.
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return null;
    }

    const isArtistItem = item.id.startsWith('["artists"');
    const isAlbumItem = item.id.startsWith('["albums"');
    const query = isArtistItem ? item.artist : `${item.artist} ${item.name}`;
    const entity = isAlbumItem ? 'album' : 'song';

    try {
      const res = await fetch(`/api/itunes?${new URLSearchParams({ term: query, entity })}`, {
        signal: AbortSignal.timeout(9000),
      });
      if (!res.ok) return null;
      const body = (await res.json()) as { results?: ItunesResult[] };
      const results = body.results ?? [];

      let match: ItunesResult | undefined;
      if (isArtistItem) {
        match = results.find(r => artistMatches(r.artistName, item.artist));
      } else if (isAlbumItem) {
        match = results.find(r => artistMatches(r.artistName, item.artist) && titleMatches(r.collectionName, item.name));
      } else {
        match =
          results.find(r => artistMatches(r.artistName, item.artist) && normalize(r.trackName) === normalize(item.name)) ??
          results.find(r => artistMatches(r.artistName, item.artist) && titleMatches(r.trackName, item.name));
      }

      const media: CatalogMedia | null = match
        ? {
            artworkUrl: match.artworkUrl || '',
            previewUrl: match.previewUrl || '',
            trackViewUrl: match.trackViewUrl || '',
            trackName: match.trackName || item.name,
          }
        : null;

      memoryCache.set(key, media);
      try {
        await putMeta(key, media);
      } catch {
        // Non-critical cache write.
      }
      return media;
    } catch {
      return null;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, task);
  return task;
}
