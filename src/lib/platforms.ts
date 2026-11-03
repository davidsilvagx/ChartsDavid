import { makeWeeks, weekKey } from './calendar';
import { normalize } from './charts';
import { importWeeks, readWeeks } from './storage';
import type { CachedWeek, MusicSource, Scrobble, Settings, SourceFilter } from './types';

export interface ConnectedPlatformAccount {
  platform: 'spotify' | 'ytmusic';
  id: string;
  displayName: string;
  avatarUrl?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  lastSyncedAt: number;
  importedPlays?: number;
}

const SPOTIFY_ACCOUNT_KEY = 'lastchart-studio:spotify-account:v1';
const YTMUSIC_ACCOUNT_KEY = 'lastchart-studio:ytmusic-account:v1';
const SPOTIFY_PKCE_KEY = 'lastchart-studio:spotify-pkce:v1';
const YTMUSIC_OAUTH_KEY = 'lastchart-studio:ytmusic-oauth:v1';

export const sourceLabels: Record<SourceFilter, string> = {
  all: 'Todas as fontes',
  lastfm: 'Last.fm',
  spotify: 'Spotify',
  ytmusic: 'YouTube Music',
  streaming: 'Spotify + YT Music',
};

export function scrobbleSource(s: Scrobble): MusicSource {
  return s.source === 'spotify' || s.source === 'ytmusic' ? s.source : 'lastfm';
}

export function matchesSourceFilter(source: MusicSource | undefined, filter: SourceFilter): boolean {
  const src: MusicSource = source === 'spotify' || source === 'ytmusic' ? source : 'lastfm';
  if (filter === 'all') return true;
  if (filter === 'streaming') return src === 'spotify' || src === 'ytmusic';
  return src === filter;
}

export function countScrobblesBySource(cached: CachedWeek[]): Record<SourceFilter, number> {
  const counts: Record<SourceFilter, number> = {
    all: 0,
    lastfm: 0,
    spotify: 0,
    ytmusic: 0,
    streaming: 0,
  };
  for (const w of cached) {
    for (const s of w.scrobbles) {
      const src = scrobbleSource(s);
      counts[src]++;
      counts.all++;
      if (src === 'spotify' || src === 'ytmusic') counts.streaming++;
    }
  }
  return counts;
}

function parseFlexibleTimestamp(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw > 10_000_000_000 ? Math.floor(raw / 1000) : Math.floor(raw);
  }
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^\d{9,13}$/.test(trimmed)) {
    const n = Number(trimmed);
    return n > 10_000_000_000 ? Math.floor(n / 1000) : Math.floor(n);
  }
  // Spotify basic history uses "YYYY-MM-DD HH:mm" in UTC
  const normalizedIso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(trimmed)
    ? `${trimmed.replace(' ', 'T')}${trimmed.length === 16 ? ':00' : ''}Z`
    : trimmed;
  const ms = Date.parse(normalizedIso);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
}

export function parseSpotifyHistoryJSON(text: string): Scrobble[] {
  const parsed = JSON.parse(text);
  const rows: unknown[] = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as { items?: unknown[] })?.items)
      ? (parsed as { items: unknown[] }).items
      : [];

  if (!rows.length) {
    throw new Error('O arquivo JSON do Spotify está vazio ou em formato não reconhecido.');
  }

  const scrobbles: Scrobble[] = [];
  for (const raw of rows) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;

    // Spotify Web API recently-played item shape: { track: { name, artists, album }, played_at }
    if (r.track && typeof r.track === 'object' && typeof r.played_at === 'string') {
      const t = r.track as Record<string, unknown>;
      const artists = Array.isArray(t.artists) ? (t.artists as Array<{ name?: string }>) : [];
      const albumObj = (t.album && typeof t.album === 'object' ? t.album : {}) as {
        name?: string;
        images?: Array<{ url?: string }>;
      };
      const ts = parseFlexibleTimestamp(r.played_at);
      const artist = String(artists[0]?.name ?? '').trim();
      const track = String(t.name ?? '').trim();
      if (ts && artist && track) {
        scrobbles.push({
          timestamp: ts,
          artist: artist.slice(0, 500),
          track: track.slice(0, 500),
          album: String(albumObj.name ?? '').trim().slice(0, 500),
          image: typeof albumObj.images?.[0]?.url === 'string' ? albumObj.images[0].url : '',
          source: 'spotify',
        });
      }
      continue;
    }

    // Ignore podcast episodes in Extended Streaming History
    if (r.episode_name && !r.master_metadata_track_name && !r.trackName) continue;

    const msPlayed =
      typeof r.ms_played === 'number'
        ? r.ms_played
        : typeof r.msPlayed === 'number'
          ? r.msPlayed
          : undefined;
    if (msPlayed !== undefined && msPlayed < 30_000) continue;

    const artist = String(
      r.master_metadata_album_artist_name ?? r.artistName ?? r.artist ?? '',
    ).trim();
    const track = String(
      r.master_metadata_track_name ?? r.trackName ?? r.track ?? '',
    ).trim();
    const album = String(
      r.master_metadata_album_album_name ?? r.albumName ?? r.album ?? '',
    ).trim();
    const ts = parseFlexibleTimestamp(r.ts ?? r.endTime ?? r.timestamp ?? r.played_at);

    if (!ts || !artist || !track) continue;
    scrobbles.push({
      timestamp: ts,
      artist: artist.slice(0, 500),
      track: track.slice(0, 500),
      album: album.slice(0, 500),
      image: typeof r.image === 'string' && /^https:\/\//.test(r.image) ? r.image : '',
      source: 'spotify',
    });
  }

  return scrobbles.sort((a, b) => a.timestamp - b.timestamp);
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (ch === ',' && !quoted) {
      cells.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  cells.push(cur.trim());
  return cells;
}

function cleanYouTubeTitle(rawTitle: string): string {
  return rawTitle
    .replace(/^(Watched|Assistiu a|Assistiu|Viste|Has visto)\s+/i, '')
    .trim();
}

function cleanYouTubeArtist(rawChannel: string): string {
  return rawChannel
    .replace(/\s*-\s*Topic$/i, '')
    .replace(/\s*Official$/i, '')
    .trim();
}

export function parseYouTubeMusicHistory(text: string, filename = ''): Scrobble[] {
  const trimmed = text.replace(/^\ufeff/, '').trim();
  if (!trimmed) throw new Error('O arquivo do YouTube Music está vazio.');

  if (trimmed.startsWith('[') || trimmed.startsWith('{') || filename.toLowerCase().endsWith('.json')) {
    const parsed = JSON.parse(trimmed);
    const rows: unknown[] = Array.isArray(parsed)
      ? parsed
      : Array.isArray((parsed as { items?: unknown[] })?.items)
        ? (parsed as { items: unknown[] }).items
        : [];
    const scrobbles: Scrobble[] = [];

    for (const raw of rows) {
      if (!raw || typeof raw !== 'object') continue;
      const r = raw as Record<string, unknown>;

      // Generic scrobble JSON shape
      if (typeof r.artist === 'string' && (typeof r.track === 'string' || typeof r.title === 'string') && !r.header && !r.time) {
        const ts = parseFlexibleTimestamp(r.timestamp ?? r.uts ?? r.date ?? r.played_at);
        const artist = r.artist.trim();
        const track = String(r.track ?? r.title ?? '').trim();
        if (ts && artist && track) {
          scrobbles.push({
            timestamp: ts,
            artist: artist.slice(0, 500),
            track: track.slice(0, 500),
            album: String(r.album ?? '').trim().slice(0, 500),
            image: typeof r.image === 'string' && /^https:\/\//.test(r.image) ? r.image : '',
            source: 'ytmusic',
          });
        }
        continue;
      }

      // Google Takeout watch-history.json shape
      const header = String(r.header ?? '');
      const titleUrl = String(r.titleUrl ?? '');
      const subtitles = Array.isArray(r.subtitles) ? (r.subtitles as Array<{ name?: string }>) : [];
      const channelName = String(subtitles[0]?.name ?? '').trim();
      const isMusicEntry =
        /youtube music/i.test(header) ||
        titleUrl.includes('music.youtube.com') ||
        /\s-\sTopic$/i.test(channelName);

      if (!isMusicEntry) continue;

      const rawTitle = String(r.title ?? '').trim();
      if (
        !rawTitle ||
        /^https?:\/\//i.test(rawTitle) ||
        /video that has been removed|vídeo que foi removido|vídeo privado/i.test(rawTitle)
      ) {
        continue;
      }

      const ts = parseFlexibleTimestamp(r.time ?? r.timestamp);
      if (!ts) continue;

      let track = cleanYouTubeTitle(rawTitle);
      let artist = cleanYouTubeArtist(channelName);

      if (!artist && track.includes(' - ')) {
        const [maybeArtist, ...rest] = track.split(' - ');
        artist = maybeArtist.trim();
        track = rest.join(' - ').trim();
      }

      if (!artist || !track || /^https?:\/\//i.test(track)) continue;

      scrobbles.push({
        timestamp: ts,
        artist: artist.slice(0, 500),
        track: track.slice(0, 500),
        album: '',
        image: '',
        source: 'ytmusic',
      });
    }

    return scrobbles.sort((a, b) => a.timestamp - b.timestamp);
  }

  // CSV fallback (artist, track/title, album, timestamp/date/time)
  const lines = trimmed.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) throw new Error('O arquivo CSV precisa ter cabeçalho e ao menos 1 linha.');
  const norm = (s: string) => s.trim().toLowerCase().replace(/[\s_-]+/g, '');
  const headers = splitCsvLine(lines[0]);
  const artistIdx = headers.findIndex(h => ['artist', 'artista', 'artistname', 'channel'].includes(norm(h)));
  const trackIdx = headers.findIndex(h => ['track', 'title', 'musica', 'música', 'song', 'trackname'].includes(norm(h)));
  const albumIdx = headers.findIndex(h => ['album', 'álbum', 'albumname'].includes(norm(h)));
  const timeIdx = headers.findIndex(h => ['timestamp', 'time', 'date', 'uts', 'playedat', 'data'].includes(norm(h)));

  if (artistIdx < 0 || trackIdx < 0 || timeIdx < 0) {
    throw new Error('Cabeçalhos CSV esperados: artist, track (ou title) e timestamp (ou time/date).');
  }

  const scrobbles: Scrobble[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    const artist = cleanYouTubeArtist(cols[artistIdx] ?? '');
    const track = cleanYouTubeTitle(cols[trackIdx] ?? '');
    const album = albumIdx >= 0 ? (cols[albumIdx] ?? '').trim() : '';
    const ts = parseFlexibleTimestamp(cols[timeIdx]);
    if (!artist || !track || !ts) continue;
    scrobbles.push({
      timestamp: ts,
      artist: artist.slice(0, 500),
      track: track.slice(0, 500),
      album: album.slice(0, 500),
      image: '',
      source: 'ytmusic',
    });
  }
  return scrobbles.sort((a, b) => a.timestamp - b.timestamp);
}

export async function mergePlatformScrobbles(
  settings: Settings,
  incoming: Scrobble[],
  source: 'spotify' | 'ytmusic',
  nowMs = Date.now(),
): Promise<{ addedPlays: number; touchedWeeks: number; skippedBeforeStart: number }> {
  const canonicalWeeks = makeWeeks(settings, nowMs);
  if (!canonicalWeeks.length || !incoming.length) {
    return { addedPlays: 0, touchedWeeks: 0, skippedBeforeStart: 0 };
  }

  const firstStart = canonicalWeeks[0].start;
  const byWeekId = new Map<string, Scrobble[]>();
  let skippedBeforeStart = 0;

  // Binary search each scrobble into its Friday 00:00 -> Thursday 23:59 week
  for (const raw of incoming) {
    if (raw.timestamp < firstStart) {
      skippedBeforeStart++;
      continue;
    }
    let lo = 0;
    let hi = canonicalWeeks.length - 1;
    let matchedIdx = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const w = canonicalWeeks[mid];
      if (raw.timestamp < w.start) hi = mid - 1;
      else if (raw.timestamp >= w.end) lo = mid + 1;
      else {
        matchedIdx = mid;
        break;
      }
    }
    if (matchedIdx < 0) continue;
    const wk = canonicalWeeks[matchedIdx];
    const bucket = byWeekId.get(wk.id) ?? [];
    bucket.push({ ...raw, source });
    byWeekId.set(wk.id, bucket);
  }

  const existing = new Map((await readWeeks(settings)).map(w => [w.week.id, w]));
  const toSave: CachedWeek[] = [];
  let addedPlays = 0;
  const nowSec = Math.floor(nowMs / 1000);

  for (const [weekId, newItems] of byWeekId) {
    const week = canonicalWeeks.find(w => w.id === weekId)!;
    const prev = existing.get(weekId);
    const otherSourceItems = (prev?.scrobbles ?? []).filter(s => scrobbleSource(s) !== source);
    const sameSourceItems = (prev?.scrobbles ?? []).filter(s => scrobbleSource(s) === source);

    const seenSameSource = new Set<string>();
    const mergedSameSource: Scrobble[] = [];

    for (const s of [...sameSourceItems, ...newItems]) {
      const sig = JSON.stringify([s.timestamp, normalize(s.artist), normalize(s.track)]);
      if (seenSameSource.has(sig)) continue;
      seenSameSource.add(sig);
      mergedSameSource.push({ ...s, source });
    }

    addedPlays += Math.max(0, mergedSameSource.length - sameSourceItems.length);
    const combined = [...otherSourceItems, ...mergedSameSource].sort((a, b) => a.timestamp - b.timestamp);
    const cutoff = Math.min(week.end, Math.max(prev?.cutoff ?? week.start, nowSec));

    toSave.push({
      key: weekKey(settings, week.id),
      week,
      scrobbles: combined,
      fetchedAt: nowMs,
      cutoff,
      duplicates: prev?.duplicates ?? 0,
    });
  }

  if (toSave.length > 0) {
    await importWeeks(settings, toSave);
  }

  return { addedPlays, touchedWeeks: toSave.length, skippedBeforeStart };
}

/* ── Spotify OAuth 2.0 PKCE Browser Connector ── */
function randomString(len = 64): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, b => chars[b % chars.length]).join('');
}

function toBase64Url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function getSpotifyRedirectUri(): string {
  if (typeof window === 'undefined') return 'https://charts-david.vercel.app/';
  return `${window.location.origin}/`;
}

export function readSpotifyAccount(): ConnectedPlatformAccount | null {
  try {
    const raw = localStorage.getItem(SPOTIFY_ACCOUNT_KEY);
    return raw ? (JSON.parse(raw) as ConnectedPlatformAccount) : null;
  } catch {
    return null;
  }
}

export function saveSpotifyAccount(acc: ConnectedPlatformAccount | null) {
  try {
    if (!acc) localStorage.removeItem(SPOTIFY_ACCOUNT_KEY);
    else localStorage.setItem(SPOTIFY_ACCOUNT_KEY, JSON.stringify(acc));
  } catch {
    /* ignore storage quota */
  }
}

export function readYouTubeAccount(): ConnectedPlatformAccount | null {
  try {
    const raw = localStorage.getItem(YTMUSIC_ACCOUNT_KEY);
    return raw ? (JSON.parse(raw) as ConnectedPlatformAccount) : null;
  } catch {
    return null;
  }
}

export function saveYouTubeAccount(acc: ConnectedPlatformAccount | null) {
  try {
    if (!acc) localStorage.removeItem(YTMUSIC_ACCOUNT_KEY);
    else localStorage.setItem(YTMUSIC_ACCOUNT_KEY, JSON.stringify(acc));
  } catch {
    /* ignore storage quota */
  }
}

export async function startSpotifyPKCE(clientId: string) {
  const cleanId = clientId.trim();
  if (!cleanId) {
    throw new Error('Informe o Spotify Client ID ou importe diretamente seu arquivo JSON do Spotify.');
  }
  const verifier = randomString(64);
  const state = randomString(24);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  const challenge = toBase64Url(digest);
  const redirectUri = getSpotifyRedirectUri();

  sessionStorage.setItem(SPOTIFY_PKCE_KEY, JSON.stringify({ verifier, state, clientId: cleanId, redirectUri }));

  const params = new URLSearchParams({
    client_id: cleanId,
    response_type: 'code',
    redirect_uri: redirectUri,
    code_challenge_method: 'S256',
    code_challenge: challenge,
    state,
    scope: 'user-read-recently-played user-top-read user-read-private',
  });
  window.location.assign(`https://accounts.spotify.com/authorize?${params.toString()}`);
}

async function fetchSpotifyRecentWithToken(accessToken: string): Promise<{
  profile: { id: string; displayName: string; avatarUrl: string };
  scrobbles: Scrobble[];
}> {
  const [meRes, recentRes] = await Promise.all([
    fetch('https://api.spotify.com/v1/me', { headers: { Authorization: `Bearer ${accessToken}` } }),
    fetch('https://api.spotify.com/v1/me/player/recently-played?limit=50', {
      headers: { Authorization: `Bearer ${accessToken}` },
    }),
  ]);
  if (!meRes.ok) throw new Error('Sessão do Spotify expirada ou sem permissão.');
  const me = (await meRes.json()) as { id?: string; display_name?: string; images?: Array<{ url?: string }> };
  const recentJson = recentRes.ok ? await recentRes.text() : '{"items":[]}';
  const scrobbles = recentRes.ok ? parseSpotifyHistoryJSON(recentJson) : [];
  return {
    profile: {
      id: String(me.id ?? 'spotify'),
      displayName: String(me.display_name || me.id || 'Conta Spotify'),
      avatarUrl: String(me.images?.[0]?.url ?? ''),
    },
    scrobbles,
  };
}

export async function completeSpotifyCallbackIfPresent(): Promise<{
  account: ConnectedPlatformAccount;
  scrobbles: Scrobble[];
} | null> {
  if (typeof window === 'undefined') return null;
  const url = new URL(window.location.href);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const rawPkce = sessionStorage.getItem(SPOTIFY_PKCE_KEY);
  if (!code || !state || !rawPkce) return null;

  sessionStorage.removeItem(SPOTIFY_PKCE_KEY);
  url.searchParams.delete('code');
  url.searchParams.delete('state');
  window.history.replaceState({}, '', url.pathname + url.search + url.hash);

  const pkce = JSON.parse(rawPkce) as { verifier: string; state: string; clientId: string; redirectUri: string };
  if (pkce.state !== state) throw new Error('Validação de segurança OAuth do Spotify falhou (state divergente).');

  const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: pkce.clientId,
      grant_type: 'authorization_code',
      code,
      redirect_uri: pkce.redirectUri,
      code_verifier: pkce.verifier,
    }),
  });
  if (!tokenRes.ok) {
    throw new Error('Não foi possível concluir a autenticação PKCE com o Spotify.');
  }
  const tokens = (await tokenRes.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  };
  const { profile, scrobbles } = await fetchSpotifyRecentWithToken(tokens.access_token);
  const account: ConnectedPlatformAccount = {
    platform: 'spotify',
    id: profile.id,
    displayName: profile.displayName,
    avatarUrl: profile.avatarUrl,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: Date.now() + (tokens.expires_in ?? 3600) * 1000,
    lastSyncedAt: Date.now(),
  };
  saveSpotifyAccount(account);
  return { account, scrobbles };
}

export async function syncConnectedSpotify(clientId?: string): Promise<{
  account: ConnectedPlatformAccount;
  scrobbles: Scrobble[];
}> {
  const existing = readSpotifyAccount();
  if (!existing?.accessToken) {
    throw new Error('Conecte sua conta do Spotify primeiro.');
  }
  let token = existing.accessToken;
  if (existing.expiresAt && Date.now() > existing.expiresAt - 60_000 && existing.refreshToken && clientId?.trim()) {
    const refreshRes = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: existing.refreshToken,
        client_id: clientId.trim(),
      }),
    });
    if (refreshRes.ok) {
      const next = (await refreshRes.json()) as { access_token: string; refresh_token?: string; expires_in?: number };
      token = next.access_token;
      existing.accessToken = token;
      if (next.refresh_token) existing.refreshToken = next.refresh_token;
      existing.expiresAt = Date.now() + (next.expires_in ?? 3600) * 1000;
    }
  }
  const { profile, scrobbles } = await fetchSpotifyRecentWithToken(token);
  const updated: ConnectedPlatformAccount = {
    ...existing,
    id: profile.id,
    displayName: profile.displayName,
    avatarUrl: profile.avatarUrl || existing.avatarUrl,
    lastSyncedAt: Date.now(),
  };
  saveSpotifyAccount(updated);
  return { account: updated, scrobbles };
}

/* ── YouTube Music Google OAuth 2.0 Browser Connector ── */
export function startYouTubeOAuth(googleClientId: string) {
  const cleanId = googleClientId.trim();
  if (!cleanId) {
    throw new Error('Informe o Google Client ID ou importe o histórico do Google Takeout (.json / .csv).');
  }
  const state = randomString(24);
  const redirectUri = getSpotifyRedirectUri();
  sessionStorage.setItem(YTMUSIC_OAUTH_KEY, JSON.stringify({ state, redirectUri }));

  const params = new URLSearchParams({
    client_id: cleanId,
    redirect_uri: redirectUri,
    response_type: 'token',
    scope: 'https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/userinfo.profile',
    include_granted_scopes: 'true',
    state,
  });
  window.location.assign(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
}

export async function completeYouTubeCallbackIfPresent(): Promise<{
  account: ConnectedPlatformAccount;
  scrobbles: Scrobble[];
} | null> {
  if (typeof window === 'undefined' || !window.location.hash.includes('access_token=')) return null;
  const rawState = sessionStorage.getItem(YTMUSIC_OAUTH_KEY);
  if (!rawState) return null;

  const hashParams = new URLSearchParams(window.location.hash.slice(1));
  const accessToken = hashParams.get('access_token');
  const state = hashParams.get('state');
  if (!accessToken || !state) return null;

  sessionStorage.removeItem(YTMUSIC_OAUTH_KEY);
  window.history.replaceState({}, '', window.location.pathname + window.location.search);

  const saved = JSON.parse(rawState) as { state: string };
  if (saved.state !== state) throw new Error('Validação OAuth do Google/YouTube falhou.');

  const [userRes, likedRes] = await Promise.all([
    fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    }),
    fetch(
      'https://www.googleapis.com/youtube/v3/videos?part=snippet&myRating=like&videoCategoryId=10&maxResults=50',
      { headers: { Authorization: `Bearer ${accessToken}` } },
    ),
  ]);
  const userInfo = userRes.ok ? ((await userRes.json()) as { id?: string; name?: string; picture?: string }) : {};
  const scrobbles: Scrobble[] = [];
  if (likedRes.ok) {
    const liked = (await likedRes.json()) as {
      items?: Array<{
        snippet?: {
          title?: string;
          channelTitle?: string;
          publishedAt?: string;
          thumbnails?: { high?: { url?: string }; medium?: { url?: string } };
        };
      }>;
    };
    const nowSec = Math.floor(Date.now() / 1000);
    (liked.items ?? []).forEach((it, idx) => {
      const s = it.snippet;
      if (!s?.title) return;
      let track = cleanYouTubeTitle(s.title);
      let artist = cleanYouTubeArtist(s.channelTitle ?? '');
      if (track.includes(' - ') && (!artist || !/topic/i.test(s.channelTitle ?? ''))) {
        const [a, ...rest] = track.split(' - ');
        artist = a.trim();
        track = rest.join(' - ').trim();
      }
      if (!artist || !track) return;
      scrobbles.push({
        timestamp: nowSec - idx * 240,
        artist: artist.slice(0, 500),
        track: track.slice(0, 500),
        album: '',
        image: s.thumbnails?.high?.url ?? s.thumbnails?.medium?.url ?? '',
        source: 'ytmusic',
      });
    });
  }

  const account: ConnectedPlatformAccount = {
    platform: 'ytmusic',
    id: String(userInfo.id ?? 'ytmusic'),
    displayName: String(userInfo.name || 'YouTube Music'),
    avatarUrl: userInfo.picture,
    accessToken,
    lastSyncedAt: Date.now(),
  };
  saveYouTubeAccount(account);
  return { account, scrobbles };
}

export async function clearPlatformScrobbles(settings: Settings, source: 'spotify' | 'ytmusic'): Promise<number> {
  const existing = await readWeeks(settings);
  const modified: CachedWeek[] = [];
  let removed = 0;

  for (const w of existing) {
    const kept = w.scrobbles.filter(s => scrobbleSource(s) !== source);
    if (kept.length !== w.scrobbles.length) {
      removed += w.scrobbles.length - kept.length;
      modified.push({
        ...w,
        key: weekKey(settings, w.week.id),
        scrobbles: kept,
      });
    }
  }

  if (modified.length > 0) {
    await importWeeks(settings, modified);
  }
  return removed;
}
