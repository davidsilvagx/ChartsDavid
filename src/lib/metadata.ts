import { api, delay } from './api';
import { normalize, selectScrobblesForFilter } from './charts';
import { deleteMeta, putMeta, readMetaRange } from './storage';
import type { CachedWeek, Item, Kind, SourceFilter } from './types';

/** Marcadores explícitos no título (catálogo ou scrobble). Não classificam gênero. */
export type VersionTag = 'live' | 'remaster' | 'remix' | 'acoustic' | 'demo' | 'reissue' | 'collaboration' | 'instrumental' | 'sped-up';
export const versionLabels: Record<VersionTag, string> = {
  live: 'Ao vivo', remaster: 'Remaster', remix: 'Remix', acoustic: 'Acústica', demo: 'Demo', reissue: 'Reedição/Deluxe', collaboration: 'Colaboração', instrumental: 'Instrumental', 'sped-up': 'Acelerada/lenta',
};
const versionPatterns: Array<[RegExp, VersionTag]> = [
  [/\blive\b|ao vivo|en vivo/, 'live'],
  [/remaster/, 'remaster'],
  [/\bremix\b|\bmix\)|\brmx\b|\bversion remix/, 'remix'],
  [/acoustic|ac[uú]stic/, 'acoustic'],
  [/\bdemo\b/, 'demo'],
  [/deluxe|anniversary|expanded|edition|reissue|reedi[cç][aã]o|taylor'?s version/, 'reissue'],
  [/\bfeat\.?\b|\bft\.\s|featuring|\(with |\bwith [A-Z]/i, 'collaboration'],
  [/instrumental/, 'instrumental'],
  [/sped up|slowed/, 'sped-up'],
];
export function versionTags(...titles: string[]): VersionTag[] {
  const tags = new Set<VersionTag>();
  for (const title of titles) {
    if (!title) continue;
    for (const [pattern, tag] of versionPatterns) if (pattern.test(tag === 'collaboration' ? title : title.toLowerCase())) tags.add(tag);
  }
  return [...tags];
}

export interface CatalogCandidate {
  artistName: string; trackName: string; collectionName: string; artworkUrl?: string; trackViewUrl?: string;
  trackId?: number; collectionId?: number; artistId?: number; trackTimeMillis?: number; primaryGenreName?: string; releaseDate?: string; collectionType?: string; explicit?: boolean;
}
export interface MetaRecord {
  key: string; kind: Kind; artist: string; name: string; album: string;
  status: 'matched' | 'ambiguous' | 'not-found' | 'error';
  source: 'itunes'; fetchedAt: number;
  /** exact: artista e título idênticos após normalização; variant: só difere por parênteses/sufixo. */
  match?: 'exact' | 'variant'; confidence?: 'alta' | 'média' | 'baixa';
  ids?: { trackId?: number; collectionId?: number; artistId?: number };
  genre?: string; releaseDate?: string; catalogTitle?: string; catalogAlbum?: string; url?: string;
  durationMs?: number; durationSource?: 'itunes' | 'lastfm'; lastfmDurationMs?: number; durationConflict?: boolean;
  candidates?: number; versions: VersionTag[]; explicit?: boolean; note?: string;
}
export interface MetaReview { genre?: string; releaseDate?: string; durationMs?: number | null; versions?: VersionTag[]; reviewedAt: number; note?: string }
export interface EffectiveMeta extends MetaRecord { review?: MetaReview; reviewed: boolean }

const PREFIX = 'meta:v1:';
const REVIEW_PREFIX = 'meta-review:v1:';
export const metaKey = (kind: Kind, item: Pick<Item, 'artist' | 'name' | 'album'>) =>
  `${kind}:${normalize(item.artist)}::${kind === 'artists' ? '' : normalize(item.name)}${kind === 'tracks' ? `::${normalize(item.album)}` : ''}`;
const clean = (value: string) => normalize(value).replace(/\s*[([].*?[)\]]\s*/g, ' ').replace(/\s+-\s+.*$/, '').replace(/\s+/g, ' ').trim();
const sameArtist = (candidate: string, target: string) => {
  const a = normalize(candidate), b = normalize(target);
  if (!a || !b) return false;
  if (a === b) return true;
  // Colaborações listadas pelo catálogo: "A & B", "A, B", "A feat. B" contêm o artista do scrobble como participante completo.
  return a.split(/\s*(?:,|&|\bfeat\.?|\bft\.|\bx\b|\be\b|\band\b)\s*/).map(part => part.trim()).includes(b);
};
const DURATION_TOLERANCE_MS = 5000;
const validDuration = (ms: number | undefined) => typeof ms === 'number' && Number.isFinite(ms) && ms >= 1000 && ms <= 4 * 3600_000;

/** Escolhe a correspondência do catálogo de forma conservadora. Pura, testável. */
export function pickCatalogMatch(kind: Kind, item: Pick<Item, 'artist' | 'name' | 'album'>, results: CatalogCandidate[], now = Date.now()): MetaRecord {
  const base = { key: metaKey(kind, item), kind, artist: item.artist, name: item.name, album: item.album, source: 'itunes' as const, fetchedAt: now, versions: versionTags(item.name, kind === 'tracks' ? item.album : '') };
  const artistHits = results.filter(r => sameArtist(r.artistName, item.artist));
  if (kind === 'artists') {
    const hit = artistHits.find(r => normalize(r.artistName) === normalize(item.artist));
    if (!hit) return { ...base, status: 'not-found', candidates: results.length };
    return { ...base, status: 'matched', match: 'exact', confidence: 'alta', ids: { artistId: hit.artistId }, genre: hit.primaryGenreName || undefined, url: hit.trackViewUrl, candidates: 1, note: 'Gênero principal do artista no catálogo; não é o gênero de cada faixa.' };
  }
  const title = (r: CatalogCandidate) => kind === 'albums' ? r.collectionName : r.trackName;
  const exact = artistHits.filter(r => normalize(title(r)) === normalize(item.name));
  const variant = exact.length ? [] : artistHits.filter(r => clean(title(r)) === clean(item.name) && clean(item.name).length > 0);
  const pool = exact.length ? exact : variant;
  if (!pool.length) return { ...base, status: 'not-found', candidates: results.length };
  const albumMatch = kind === 'tracks' && item.album ? pool.filter(r => normalize(r.collectionName) === normalize(item.album) || clean(r.collectionName) === clean(item.album)) : [];
  const chosen = albumMatch[0] ?? pool[0];
  const durations = (albumMatch.length ? albumMatch : pool).map(r => r.trackTimeMillis).filter(validDuration) as number[];
  const durationSpread = durations.length ? Math.max(...durations) - Math.min(...durations) : 0;
  const ambiguous = kind === 'tracks' && !albumMatch.length && pool.length > 1 && durationSpread > DURATION_TOLERANCE_MS;
  const genres = new Set(pool.map(r => r.primaryGenreName).filter(Boolean));
  const record: MetaRecord = {
    ...base,
    status: ambiguous ? 'ambiguous' : 'matched',
    match: exact.length ? 'exact' : 'variant',
    confidence: ambiguous ? 'baixa' : exact.length && (albumMatch.length || pool.length === 1 || durationSpread <= DURATION_TOLERANCE_MS) ? 'alta' : 'média',
    ids: { trackId: chosen.trackId, collectionId: chosen.collectionId, artistId: chosen.artistId },
    genre: genres.size === 1 || albumMatch.length ? chosen.primaryGenreName || undefined : undefined,
    releaseDate: chosen.releaseDate ? chosen.releaseDate.slice(0, 10) : undefined,
    catalogTitle: title(chosen), catalogAlbum: chosen.collectionName, url: chosen.trackViewUrl,
    candidates: pool.length,
    versions: versionTags(item.name, title(chosen), kind === 'tracks' ? item.album : '', chosen.collectionName),
    explicit: chosen.explicit,
  };
  if (kind === 'tracks' && !ambiguous && validDuration(chosen.trackTimeMillis) && record.match === 'exact') {
    record.durationMs = chosen.trackTimeMillis; record.durationSource = 'itunes';
  }
  if (ambiguous) record.note = `${pool.length} gravações homônimas com durações diferentes; escolha manual necessária.`;
  else if (genres.size > 1 && !albumMatch.length) record.note = 'Gêneros diferentes entre versões; gênero deixado como desconhecido.';
  return record;
}

/** Cruza a duração do catálogo com o Last.fm. Diferença acima da tolerância vira conflito, fora da soma. */
export function applyLastfmDuration(record: MetaRecord, lastfmMs: number | undefined): MetaRecord {
  if (!validDuration(lastfmMs)) return record;
  const next = { ...record, lastfmDurationMs: lastfmMs };
  if (record.durationMs) {
    if (Math.abs(record.durationMs - lastfmMs!) > DURATION_TOLERANCE_MS) { next.durationConflict = true; next.note = 'Durações diferentes entre iTunes e Last.fm; revise antes de somar.'; }
  } else if (record.status !== 'ambiguous') {
    next.durationMs = lastfmMs; next.durationSource = 'lastfm';
  }
  return next;
}

export function effective(record: MetaRecord, review?: MetaReview): EffectiveMeta {
  if (!review) return { ...record, reviewed: false };
  return {
    ...record, review, reviewed: true,
    genre: review.genre !== undefined ? review.genre || undefined : record.genre,
    releaseDate: review.releaseDate !== undefined ? review.releaseDate || undefined : record.releaseDate,
    versions: review.versions ?? record.versions,
    ...(review.durationMs !== undefined ? { durationMs: review.durationMs ?? undefined, durationSource: review.durationMs ? record.durationSource : undefined, durationConflict: false } : {}),
  };
}

export async function loadMetadata(kind: Kind): Promise<Map<string, EffectiveMeta>> {
  const [records, reviews] = await Promise.all([readMetaRange<MetaRecord>(`${PREFIX}${kind}:`), readMetaRange<MetaReview>(`${REVIEW_PREFIX}${kind}:`)]);
  const reviewMap = new Map(reviews.map(([key, value]) => [key.slice(REVIEW_PREFIX.length), value]));
  return new Map(records.map(([key, value]) => { const k = key.slice(PREFIX.length); return [k, effective(value, reviewMap.get(k))]; }));
}
export async function saveReview(key: string, review: MetaReview | null) {
  if (review) await putMeta(`${REVIEW_PREFIX}${key}`, review); else await deleteMeta(`${REVIEW_PREFIX}${key}`);
}
export async function forgetMetadata(key: string) { await deleteMeta(`${PREFIX}${key}`); }

export interface EnrichProgress { done: number; total: number; matched: number; current?: string; waitingMs?: number }
type Fetcher = (kind: Kind, item: Item, signal: AbortSignal) => Promise<CatalogCandidate[]>;
const itunesFetcher: Fetcher = async (kind, item, signal) => {
  const entity = kind === 'albums' ? 'album' : kind === 'artists' ? 'musicArtist' : 'song';
  const term = kind === 'artists' ? item.artist : `${item.artist} ${item.name}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(`/api/itunes?${new URLSearchParams({ term, entity })}`, { signal: AbortSignal.any([signal, AbortSignal.timeout(12000)]) });
    if (response.ok) return ((await response.json()) as { results?: CatalogCandidate[] }).results ?? [];
    if (response.status !== 403 && response.status !== 429 && response.status < 500) throw new Error(`Catálogo respondeu HTTP ${response.status}.`);
    await delay(4000 * (attempt + 1), signal);
  }
  throw new Error('Catálogo indisponível no momento.');
};
const lastfmDuration = async (item: Item, apiKey: string, signal: AbortSignal) => {
  try {
    const body = await api<{ track?: { duration?: string } }>('track.getInfo', { artist: item.artist, track: item.name }, apiKey, signal);
    const ms = Number(body.track?.duration);
    return Number.isFinite(ms) && ms > 0 ? ms : undefined;
  } catch (error) { if (signal.aborted) throw error; return undefined; }
};

/**
 * Enriquecimento em lote pequeno: uma consulta por vez, ritmo de ~18/min (limite público aproximado do iTunes),
 * cache em IndexedDB e cancelamento a qualquer momento. Itens já consultados não são repetidos sem pedido.
 */
export async function enrichItems(kind: Kind, items: Item[], options: { signal: AbortSignal; onProgress: (p: EnrichProgress) => void; refresh?: boolean; apiKey?: string; useLastfm?: boolean; fetcher?: Fetcher; pacingMs?: number; known?: Map<string, EffectiveMeta> }) {
  const fetcher = options.fetcher ?? itunesFetcher;
  const pacing = options.pacingMs ?? 3300;
  const todo = items.filter(item => options.refresh || !options.known?.has(metaKey(kind, item)));
  const progress: EnrichProgress = { done: 0, total: todo.length, matched: 0 };
  options.onProgress({ ...progress });
  let last = 0;
  for (const item of todo) {
    options.signal.throwIfAborted();
    const wait = Math.max(0, last + pacing - Date.now());
    if (wait) { options.onProgress({ ...progress, current: item.name, waitingMs: wait }); await delay(wait, options.signal); }
    last = Date.now();
    options.onProgress({ ...progress, current: item.name });
    let record: MetaRecord;
    try {
      record = pickCatalogMatch(kind, item, await fetcher(kind, item, options.signal));
      if (kind === 'tracks' && options.useLastfm) record = applyLastfmDuration(record, await lastfmDuration(item, options.apiKey ?? '', options.signal));
    } catch (error) {
      if (options.signal.aborted) throw error;
      record = { key: metaKey(kind, item), kind, artist: item.artist, name: item.name, album: item.album, status: 'error', source: 'itunes', fetchedAt: Date.now(), versions: versionTags(item.name), note: error instanceof Error ? error.message : 'Falha na consulta.' };
    }
    if (record.status !== 'error') await putMeta(`${PREFIX}${record.key}`, record);
    progress.done++; if (record.status === 'matched') progress.matched++;
    options.onProgress({ ...progress });
  }
  return progress;
}

export interface ListeningTime {
  scrobbles: number; timed: number; ms: number; coverage: number; invalid: number; conflicts: number; ambiguous: number;
  missing: Array<{ artist: string; track: string; plays: number }>;
}
/**
 * Tempo estimado = soma da duração catalogada da gravação de cada scrobble com correspondência confirmada.
 * Não é tempo efetivamente reproduzido (um scrobble não comprova quanto foi ouvido). Sem duração: fora da soma.
 */
export function listeningTime(cached: CachedWeek[], meta: Map<string, EffectiveMeta>, options: { start?: number; end?: number; deduplicate?: boolean; source?: SourceFilter } = {}): ListeningTime {
  const result: ListeningTime = { scrobbles: 0, timed: 0, ms: 0, coverage: 0, invalid: 0, conflicts: 0, ambiguous: 0, missing: [] };
  const missing = new Map<string, { artist: string; track: string; plays: number }>();
  for (const week of cached) {
    if (options.start !== undefined && week.week.end <= options.start) continue;
    if (options.end !== undefined && week.week.start >= options.end) continue;
    // O filtro de fonte remove espelhos Spotify/Last.fm (±180 s) para não contar a mesma audição duas vezes.
    for (const s of selectScrobblesForFilter(week.scrobbles, options.deduplicate, options.source ?? 'all', options.start, options.end)) {
      result.scrobbles++;
      const record = meta.get(metaKey('tracks', { artist: s.artist, name: s.track, album: s.album }));
      const usable = record && record.status === 'matched' && !record.durationConflict && (record.reviewed || record.match === 'exact');
      if (record?.durationConflict) result.conflicts++;
      if (record?.status === 'ambiguous' && !record.reviewed) result.ambiguous++;
      if (usable && record.durationMs !== undefined && !validDuration(record.durationMs)) { result.invalid++; continue; }
      if (usable && record.durationMs) { result.timed++; result.ms += record.durationMs; continue; }
      const key = `${normalize(s.artist)}::${normalize(s.track)}`;
      const entry = missing.get(key) ?? { artist: s.artist, track: s.track, plays: 0 };
      entry.plays++; missing.set(key, entry);
    }
  }
  result.coverage = result.scrobbles ? result.timed / result.scrobbles : 0;
  result.missing = [...missing.values()].sort((a, b) => b.plays - a.plays).slice(0, 12);
  return result;
}

export const formatDuration = (ms: number) => {
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60), rest = minutes % 60;
  return `${hours.toLocaleString('pt-BR')} h${rest ? ` ${rest} min` : ''}`;
};
