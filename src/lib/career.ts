import { normalize } from './charts';
import { getMeta, putMeta } from './storage';
import type { Item } from './types';

export interface GrammyEntry { kind: 'win' | 'nomination'; label: string; year: number | null }
export interface CareerInfo {
  status: 'matched' | 'not-found' | 'ambiguous' | 'error'; checkedAt?: number; message?: string; chosen?: boolean;
  candidates?: Array<{ id: string; name: string; disambiguation: string }>;
  artist?: { mbid: string; name: string; type: string; country: string; disambiguation: string; begin: string };
  career?: { firstRelease: string; albums: number };
  grammys?: { entity: string; available: boolean; artist: { wins: GrammyEntry[]; nominations: GrammyEntry[] }; work: { entity: string; wins: GrammyEntry[]; nominations: GrammyEntry[] } | null };
  sources?: { musicbrainz: string; wikidata: string };
}
const TTL = 7 * 86400_000;
const memory = new Map<string, Promise<CareerInfo>>();
/** Carreira (MusicBrainz) e Grammys oficiais (Wikidata) com cache de 7 dias no aparelho. */
export function fetchCareer(item: Pick<Item, 'id' | 'name' | 'artist'>, chooseMbid?: string): Promise<CareerInfo> {
  const kind = item.id.startsWith('["albums"') ? 'albums' : item.id.startsWith('["artists"') ? 'artists' : 'tracks';
  const work = kind === 'artists' ? '' : item.name;
  const key = `career:v1:${normalize(item.artist)}::${normalize(work)}`;
  const hit = chooseMbid ? undefined : memory.get(key);
  if (hit) return hit;
  const task = (async () => {
    const stored = chooseMbid ? undefined : await getMeta<CareerInfo>(key).catch(() => undefined);
    // Escolha manual entre homônimos fica guardada por mais tempo (30 dias).
    if (stored?.checkedAt && Date.now() - stored.checkedAt < (stored.chosen ? TTL * 4 : TTL)) return stored;
    const response = await fetch(`/api/career?${new URLSearchParams({ artist: item.artist, ...(work ? { work } : {}), ...(chooseMbid ? { mbid: chooseMbid } : {}) })}`, { signal: AbortSignal.timeout(30000) } /* a consulta é compartilhada: quem pediu e saiu não cancela para os outros */);
    const body = await response.json().catch(() => ({ status: 'error' })) as CareerInfo;
    if (body.status === 'matched' || body.status === 'not-found' || body.status === 'ambiguous') await putMeta(key, { ...body, checkedAt: body.checkedAt ?? Date.now() }).catch(() => {});
    return body;
  })();
  memory.set(key, task);
  void task.then(r => { if (r.status === 'error') memory.delete(key); }, () => memory.delete(key));
  return task;
}
export const grammyYears = (info?: CareerInfo) => [...(info?.grammys?.artist.wins ?? []), ...(info?.grammys?.artist.nominations ?? [])].map(g => g.year).filter((y): y is number => !!y);
