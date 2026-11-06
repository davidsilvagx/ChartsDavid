import { normalize } from './charts';
import { getMeta, putMeta } from './storage';
const cache = new Map<string, { image: string; at: number }>();
const requests = new Map<string, Promise<string>>();
export const peekArtistPhoto = (artist: string) => cache.get(normalize(artist))?.image ?? '';
export async function artistPhoto(artist: string): Promise<string> {
  const name = normalize(artist), key = `artist-photo:v1:${name}`, ttl = 7 * 86400_000;
  const hit = cache.get(name); if (hit && Date.now() - hit.at < ttl) return hit.image;
  if (requests.has(name)) return requests.get(name)!;
  const task = (async () => {
    const stored = await getMeta<{ image: string; at: number }>(key).catch(() => undefined);
    if (stored && Date.now() - stored.at < (stored.image ? ttl : 3600_000)) { cache.set(name, stored); return stored.image; }
    try {
      const response = await fetch(`/api/artist-photo?${new URLSearchParams({ artist })}`, { signal: AbortSignal.timeout(10000) });
      if (!response.ok) return '';
      const body = await response.json(), image = typeof body.image === 'string' && /^https:\/\//.test(body.image) ? body.image : '';
      const record = { image, at: Date.now() }; cache.set(name, record); void putMeta(key, record).catch(() => {}); return image;
    } catch { return ''; }
  })().finally(() => requests.delete(name));
  requests.set(name, task); return task;
}
