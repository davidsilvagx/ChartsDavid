import { putMeta, readMetaRange } from './storage';
import type { ClipBank } from './leaderAudio';

/**
 * Projeto = tudo que o usuário configurou e não pode ser baixado de novo do Last.fm:
 * ajustes (sem chave de API nem tokens), estúdio, favoritos, nomes de edição, épocas, cédulas de premiação,
 * preferências de notificação/comparação, revisões manuais de metadados e o mapa de trechos de áudio.
 * Scrobbles NÃO entram: o histórico local continua sendo a fonte recuperável (e pode ser rebaixado do Last.fm).
 */
const LOCAL_KEYS = ['lastchart-studio:settings:v1', 'lastchart-studio:studio', 'lastchart-studio:favorites', 'lastchart-studio:source-filter:v1', 'lastchart-studio:view-mode'];
const LOCAL_PREFIXES = ['spotlight-name:v1:', 'saved-eras:v1:', 'lastchart-awards:v1:', 'lastchart-notify:v1:', 'lastchart-compare:v1:'];
const META_PREFIXES = ['meta-review:v1:'];
const SECRET_FIELDS = ['apiKey'];

export interface ClipManifestEntry { hash: string; name: string; type: string; size: number; duration: number; origin?: 'manual' | 'auto'; matchedBy?: string }
export interface ProjectFile {
  app: 'LastChartStudioPro'; type: 'project'; version: 1; exportedAt: string; device: string;
  local: Record<string, string>; meta: Record<string, unknown>;
  audio: Record<string, Record<string, ClipManifestEntry>>;
}

export const deviceLabel = () => {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : 'Navegador';
  const browser = /OPR\//.test(ua) ? 'Opera' : /SamsungBrowser/.test(ua) ? 'Samsung Internet' : /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : /Firefox\//.test(ua) ? 'Firefox' : '';
  return `${browser ? `${browser} · ` : ''}${os}`;
};

const allowedLocal = (key: string) => LOCAL_KEYS.includes(key) || LOCAL_PREFIXES.some(prefix => key.startsWith(prefix));
function stripSecrets(key: string, value: string) {
  if (key !== 'lastchart-studio:settings:v1') return value;
  try { const parsed = JSON.parse(value); for (const field of SECRET_FIELDS) delete parsed[field]; return JSON.stringify(parsed); } catch { return value; }
}

export async function sha256Hex(data: BufferSource | string) {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function collectProject(storage: Storage = localStorage): Promise<ProjectFile> {
  const local: Record<string, string> = {};
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key && allowedLocal(key)) { const value = storage.getItem(key); if (value !== null) local[key] = stripSecrets(key, value); }
  }
  const meta: Record<string, unknown> = {};
  const audio: ProjectFile['audio'] = {};
  try {
    for (const prefix of META_PREFIXES) for (const [key, value] of await readMetaRange(prefix)) meta[key] = value;
    for (const prefix of ['leader-clips:v1:', 'leader-auto:v1:']) for (const [key, bank] of await readMetaRange<ClipBank>(prefix)) {
      const entries: Record<string, ClipManifestEntry> = {};
      for (const [itemId, clip] of Object.entries(bank ?? {})) if (clip?.file) entries[itemId] = { hash: await sha256Hex(await clip.file.arrayBuffer()), name: clip.name, type: clip.file.type, size: clip.file.size, duration: clip.duration, origin: clip.origin, matchedBy: clip.matchedBy };
      audio[key] = entries;
    }
  } catch { /* IndexedDB indisponível: segue só com preferências locais. */ }
  return { app: 'LastChartStudioPro', type: 'project', version: 1, exportedAt: new Date().toISOString(), device: deviceLabel(), local, meta, audio };
}

export function parseProject(text: string): ProjectFile {
  let data: Partial<ProjectFile>;
  try { data = JSON.parse(text); } catch { throw new Error('Arquivo de projeto inválido.'); }
  if (data.app !== 'LastChartStudioPro' || data.type !== 'project' || data.version !== 1 || typeof data.local !== 'object' || !data.local) throw new Error('Este arquivo não é um projeto LastChart v1. Para histórico de scrobbles, use Importar backup.');
  const local: Record<string, string> = {};
  for (const [key, value] of Object.entries(data.local)) if (allowedLocal(key) && typeof value === 'string' && value.length < 2_000_000) local[key] = stripSecrets(key, value);
  const meta: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data.meta ?? {})) if (META_PREFIXES.some(prefix => key.startsWith(prefix)) && value && typeof value === 'object') meta[key] = value;
  const audio: ProjectFile['audio'] = {};
  for (const [key, bank] of Object.entries(data.audio ?? {})) {
    if (!/^leader-(clips|auto):v1:/.test(key) || !bank || typeof bank !== 'object') continue;
    audio[key] = {};
    for (const [itemId, entry] of Object.entries(bank as Record<string, ClipManifestEntry>)) if (entry && /^[a-f0-9]{64}$/.test(entry.hash) && typeof entry.name === 'string') audio[key][itemId] = { ...entry, name: entry.name.slice(0, 200) };
  }
  return { app: 'LastChartStudioPro', type: 'project', version: 1, exportedAt: String(data.exportedAt ?? ''), device: String(data.device ?? '').slice(0, 60), local, meta, audio };
}

/** Aplica um projeto preservando o histórico local. Retorna quantas chaves mudaram. */
export async function applyProject(project: ProjectFile, storage: Storage = localStorage) {
  let changed = 0;
  for (const [key, value] of Object.entries(project.local)) {
    if (key === 'lastchart-studio:settings:v1') {
      // A chave de API pessoal deste aparelho é mantida.
      try { const current = JSON.parse(storage.getItem(key) ?? '{}'); const incoming = JSON.parse(value); value !== storage.getItem(key) && changed++; storage.setItem(key, JSON.stringify({ ...incoming, apiKey: current.apiKey ?? '' })); continue; } catch { continue; }
    }
    if (storage.getItem(key) !== value) { storage.setItem(key, value); changed++; }
  }
  for (const [key, value] of Object.entries(project.meta)) { await putMeta(key, value); changed++; }
  return changed;
}

/** Diferenças por chave, para resolver conflitos sem apagar nada em silêncio. */
export function diffProjects(local: ProjectFile, remote: ProjectFile) {
  const keys = new Set([...Object.keys(local.local), ...Object.keys(remote.local)]);
  return [...keys].filter(key => local.local[key] !== remote.local[key]).map(key => ({ key, local: local.local[key], remote: remote.local[key] }));
}
/** Mescla: mantém do aparelho tudo que difere e acrescenta o que só existe na nuvem. */
export function mergeProjects(local: ProjectFile, remote: ProjectFile): ProjectFile {
  const audio: ProjectFile['audio'] = { ...remote.audio };
  for (const [key, bank] of Object.entries(local.audio)) audio[key] = { ...(remote.audio[key] ?? {}), ...bank };
  return { ...local, local: { ...remote.local, ...local.local }, meta: { ...remote.meta, ...local.meta }, audio, exportedAt: new Date().toISOString() };
}

// ——— Chave de sincronização e criptografia ponta a ponta ———
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export function generateSyncKey(random: (n: number) => Uint8Array = n => crypto.getRandomValues(new Uint8Array(n))) {
  const bytes = random(20);
  let bits = 0, value = 0, out = '';
  for (const byte of bytes) { value = (value << 8) | byte; bits += 8; while (bits >= 5) { out += ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5; } }
  return out.match(/.{4}/g)!.join('-');
}
export function normalizeSyncKey(input: string) {
  const compact = input.toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  if (!/^[0-9A-HJKMNP-TV-Z]{32}$/.test(compact)) throw new Error('Chave inválida. Ela tem 32 caracteres, em grupos de 4.');
  return compact.match(/.{4}/g)!.join('-');
}
export interface SyncAccount { id: string; key: CryptoKey }
export async function deriveAccount(syncKey: string, iterations = 150_000): Promise<SyncAccount> {
  const normalized = normalizeSyncKey(syncKey);
  const id = (await sha256Hex(`lastchart-sync-id:v1:${normalized}`)).slice(0, 40);
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(normalized), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode('lastchart-sync-v1'), iterations }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  return { id, key };
}
const b64 = (bytes: Uint8Array) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = (text: string) => Uint8Array.from(atob(text), c => c.charCodeAt(0));
export async function encryptBytes(key: CryptoKey, bytes: Uint8Array<ArrayBuffer>) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes));
  const out = new Uint8Array(12 + data.length); out.set(iv); out.set(data, 12); return out;
}
export async function decryptBytes(key: CryptoKey, bytes: Uint8Array<ArrayBuffer>) {
  try { return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.subarray(0, 12) }, key, bytes.subarray(12))); }
  catch { throw new Error('Não foi possível decifrar. Confira se a chave de sincronização é a mesma do outro aparelho.'); }
}
export async function encryptProject(account: SyncAccount, project: ProjectFile) {
  const sealed = await encryptBytes(account.key, new TextEncoder().encode(JSON.stringify(project)));
  return { iv: b64(sealed.subarray(0, 12)), data: b64(sealed.subarray(12)) };
}
export async function decryptProject(account: SyncAccount, payload: { iv: string; data: string }) {
  const iv = unb64(payload.iv), data = unb64(payload.data), joined = new Uint8Array(iv.length + data.length);
  joined.set(iv); joined.set(data, iv.length);
  return parseProject(new TextDecoder().decode(await decryptBytes(account.key, joined)));
}

// ——— Cliente remoto ———
export class SyncError extends Error { constructor(message: string, public code: string, public revision?: number) { super(message); this.name = 'SyncError'; } }
const endpoint = (id: string, extra = '') => `/api/sync?id=${id}${extra}`;
async function failure(response: Response): Promise<never> {
  const body = await response.json().catch(() => ({})) as { code?: string; message?: string; revision?: number };
  throw new SyncError(body.message ?? (response.status === 404 ? 'Nenhum projeto salvo com esta chave.' : `Sincronização respondeu HTTP ${response.status}.`), body.code ?? String(response.status), body.revision);
}
export interface RemoteState { revision: number; updatedAt: number; device: string; payload: { iv: string; data: string }; usage: number; quota: number }
export async function fetchRemote(account: SyncAccount, signal?: AbortSignal): Promise<RemoteState | null> {
  const response = await fetch(endpoint(account.id), { signal, cache: 'no-store' });
  if (response.status === 404) { const body = await response.json().catch(() => ({})); if (body.code === 'not-found') return null; }
  if (!response.ok) return failure(response);
  return response.json();
}
export async function pushRemote(account: SyncAccount, baseRevision: number, project: ProjectFile, signal?: AbortSignal) {
  const response = await fetch(endpoint(account.id), { method: 'PUT', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ baseRevision, device: project.device, payload: await encryptProject(account, project) }) });
  if (!response.ok) return failure(response);
  return response.json() as Promise<{ revision: number; updatedAt: number }>;
}
export async function deleteRemote(account: SyncAccount) {
  const response = await fetch(endpoint(account.id), { method: 'DELETE' });
  if (!response.ok) return failure(response);
}

const CHUNK = 3_000_000;
/** Envia um trecho cifrado em partes de 3 MB, com progresso e cancelamento. Partes já enviadas são puladas. */
export async function uploadClip(account: SyncAccount, hash: string, file: Blob, onProgress: (sent: number, total: number) => void, signal: AbortSignal) {
  const sealed = await encryptBytes(account.key, new Uint8Array(await file.arrayBuffer()));
  const parts = Math.ceil(sealed.length / CHUNK);
  for (let n = 0; n < parts; n++) {
    signal.throwIfAborted();
    const name = `${hash}.${n}`;
    const head = await fetch(endpoint(account.id, `&blob=${name}`), { method: 'HEAD', signal });
    if (head.ok) { onProgress(Math.min(sealed.length, (n + 1) * CHUNK), sealed.length); continue; }
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', endpoint(account.id, `&blob=${name}`));
      xhr.upload.onprogress = event => onProgress(n * CHUNK + event.loaded, sealed.length);
      xhr.onload = () => xhr.status < 300 ? resolve() : reject(new SyncError((() => { try { return JSON.parse(xhr.responseText).message; } catch { return ''; } })() || `Envio do áudio falhou (HTTP ${xhr.status}).`, xhr.status === 413 ? 'quota' : String(xhr.status)));
      xhr.onerror = () => reject(new SyncError('Sem conexão durante o envio do áudio.', 'offline'));
      const abort = () => { xhr.abort(); reject(new DOMException('Envio cancelado.', 'AbortError')); };
      signal.addEventListener('abort', abort, { once: true });
      xhr.onloadend = () => signal.removeEventListener('abort', abort);
      xhr.send(sealed.subarray(n * CHUNK, (n + 1) * CHUNK));
    });
  }
  return parts;
}
export async function downloadClip(account: SyncAccount, entry: ClipManifestEntry, signal: AbortSignal) {
  const total = Math.ceil((entry.size + 28) / CHUNK), parts: Uint8Array[] = [];
  for (let n = 0; n < total; n++) {
    const response = await fetch(endpoint(account.id, `&blob=${entry.hash}.${n}`), { signal });
    if (!response.ok) return null;
    parts.push(new Uint8Array(await response.arrayBuffer()));
  }
  const joined = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let i = 0; for (const p of parts) { joined.set(p, i); i += p.length; }
  const bytes = await decryptBytes(account.key, joined);
  if (await sha256Hex(bytes) !== entry.hash) throw new Error('Trecho recebido não confere com o original.');
  return new File([bytes], entry.name, { type: entry.type || 'audio/mpeg' });
}
