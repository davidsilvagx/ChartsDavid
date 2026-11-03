import type { Profile, Scrobble, Settings, Week } from './types';
import { scrobbleKey } from './charts';
export class ApiError extends Error { constructor(message: string, public code: number) { super(message); this.name = 'ApiError'; } }
export const delay = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  signal?.throwIfAborted();
  const abort = () => { clearTimeout(timer); reject(new DOMException('Sincronização cancelada.', 'AbortError')); };
  const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, ms);
  signal?.addEventListener('abort', abort, { once: true });
});
let nextSlot = 0;
export async function api<T>(method: string, params: Record<string, string | number>, key = '', signal?: AbortSignal): Promise<T> {
  const query = new URLSearchParams({ method, ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])) });
  if (key) { query.set('api_key', key); query.set('format', 'json'); }
  const url = `${key ? 'https://ws.audioscrobbler.com/2.0/' : '/api/lastfm'}?${query}`;
  for (let attempt = 0; attempt < 4; attempt++) {
    const wait = Math.max(0, nextSlot - Date.now());
    nextSlot = Date.now() + wait + 300;
    await delay(wait, signal);
    try {
      const response = await fetch(url, { signal: AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(25000)]) });
      if (response.status === 429 || response.status >= 500) {
        if (attempt < 3) { await delay(1000 * 2 ** attempt + Math.random() * 400, signal); continue; }
      }
      const body = await response.json();
      if (body.error) {
        if ([11, 16, 29].includes(Number(body.error)) && attempt < 3) { await delay(1000 * 2 ** attempt, signal); continue; }
        const messages: Record<number, string> = { 6: 'Usuário não encontrado ou parâmetro inválido.', 10: 'Chave Last.fm ausente ou inválida. Verifique os Ajustes.', 26: 'Esta chave foi suspensa pelo Last.fm.', 29: 'Limite de consultas atingido. Aguarde e tente novamente.' };
        throw new ApiError(messages[body.error] ?? body.message ?? 'Erro no Last.fm.', Number(body.error));
      }
      if (!response.ok) throw new ApiError(`Last.fm respondeu HTTP ${response.status}.`, response.status);
      return body as T;
    } catch (error) {
      if (signal?.aborted) throw new DOMException('Sincronização cancelada.', 'AbortError');
      if (error instanceof ApiError || attempt === 3) throw error;
      await delay(1000 * 2 ** attempt, signal);
    }
  }
  throw new ApiError('Não foi possível conectar ao Last.fm.', 11);
}
interface LastImage { '#text': string; size: string }
interface LastTrack { name?: string; artist?: { '#text'?: string; name?: string }; album?: { '#text'?: string }; image?: LastImage[]; mbid?: string; date?: { uts: string }; '@attr'?: { nowplaying?: string } }
interface RecentResponse { recenttracks: { track?: LastTrack[] | LastTrack; '@attr': { user: string; totalPages: string; total: string; page: string } } }
const safeImage = (images?: LastImage[]) => {
  const url = [...(images ?? [])].reverse().find(i => i['#text'])?.['#text'] ?? '';
  return url.startsWith('https://') && !url.includes('2a96cbd8b46e442fc41c2b86b821562f') ? url : '';
};
export function parseTrack(t: LastTrack): Scrobble | null {
  const timestamp = Number(t.date?.uts);
  if (t['@attr']?.nowplaying === 'true' || !Number.isSafeInteger(timestamp) || timestamp <= 0 || !t.name || !(t.artist?.['#text'] || t.artist?.name)) return null;
  return { timestamp, track: t.name.trim(), artist: (t.artist?.['#text'] ?? t.artist?.name ?? '').trim(), album: t.album?.['#text']?.trim() ?? '', image: safeImage(t.image), mbid: t.mbid };
}
export async function getProfile(settings: Pick<Settings, 'user' | 'apiKey'>, signal?: AbortSignal): Promise<Profile> {
  const response = await api<{ user: { name: string; realname: string; image: LastImage[]; playcount: string; registered: { unixtime: string }; url: string } }>('user.getInfo', { user: settings.user.trim() }, settings.apiKey, signal);
  if (!response.user?.name) throw new ApiError('Resposta de perfil inválida.', 6);
  const u = response.user;
  return { name: u.name, realname: u.realname, image: safeImage(u.image), playcount: Number(u.playcount) || 0, registered: Number(u.registered?.unixtime) || 0, url: `https://www.last.fm/user/${encodeURIComponent(u.name)}` };
}
export async function fetchWeek(settings: Settings, week: Week, signal: AbortSignal, onPage: () => void, now = Date.now()) {
  const cutoff = Math.min(week.end, Math.floor(now / 1000));
  const params = { user: settings.user.trim(), from: week.start - 1, to: cutoff, limit: 200 };
  const first = await api<RecentResponse>('user.getRecentTracks', { ...params, page: 1 }, settings.apiKey, signal);
  const attrs = first.recenttracks?.['@attr'];
  if (!attrs || attrs.user?.toLowerCase() !== settings.user.trim().toLowerCase()) throw new ApiError('O Last.fm retornou um perfil diferente. Nada foi salvo.', 6);
  const pages = Number(attrs.totalPages);
  const total = Number(attrs.total);
  if (!Number.isInteger(pages) || pages < 0 || pages > 10000 || !Number.isInteger(total) || total < 0) throw new ApiError('Paginação inválida do Last.fm.', 6);
  let rawCount = 0;
  const scrobbles: Scrobble[] = [];
  const collect = (data: RecentResponse) => {
    const a = data.recenttracks?.['@attr'];
    if (a?.user?.toLowerCase() !== settings.user.trim().toLowerCase() || Number(a.total) !== total || Number(a.totalPages) !== pages) throw new ApiError('O histórico mudou durante a consulta. Repita a sincronização desta semana.', 16);
    const raw = data.recenttracks.track ?? [];
    for (const t of Array.isArray(raw) ? raw : [raw]) {
      if (t['@attr']?.nowplaying !== 'true') rawCount++;
      const parsed = parseTrack(t);
      if (parsed && parsed.timestamp >= week.start && parsed.timestamp < cutoff) scrobbles.push(parsed);
    }
    onPage();
  };
  collect(first);
  for (let page = 2; page <= pages; page++) collect(await api<RecentResponse>('user.getRecentTracks', { ...params, page }, settings.apiKey, signal));
  if (rawCount !== total) throw new ApiError('O Last.fm retornou uma semana incompleta. Tente sincronizar novamente.', 16);
  const unique = new Set(scrobbles.map(scrobbleKey));
  return { scrobbles, cutoff, duplicates: scrobbles.length - unique.size };
}
