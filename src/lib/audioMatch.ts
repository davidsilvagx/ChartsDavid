import { normalize } from './charts';
import type { Item } from './types';

/** Etiquetas lidas do próprio arquivo do usuário. Nada é enviado à rede. */
export interface AudioTags { title?: string; artist?: string; album?: string; via: 'id3' | 'mp4' | 'vorbis' | 'filename' | 'none' }

const latin1 = new TextDecoder('latin1');
const utf8 = new TextDecoder('utf-8');
const clean = (value: string | undefined) => value?.replace(/\0+$/g, '').replace(/\0/g, ' / ').trim() || undefined;

function decodeId3Text(bytes: Uint8Array): string | undefined {
  if (!bytes.length) return undefined;
  const encoding = bytes[0], body = bytes.subarray(1);
  if (encoding === 0) return clean(latin1.decode(body));
  if (encoding === 3) return clean(utf8.decode(body));
  if (encoding === 1 || encoding === 2) {
    let le = encoding === 1, start = 0;
    if (encoding === 1 && body.length >= 2) { if (body[0] === 0xfe && body[1] === 0xff) { le = false; start = 2; } else if (body[0] === 0xff && body[1] === 0xfe) { le = true; start = 2; } }
    return clean(new TextDecoder(le ? 'utf-16le' : 'utf-16be').decode(body.subarray(start, start + ((body.length - start) & ~1))));
  }
  return undefined;
}
const syncsafe = (b: Uint8Array, i: number) => ((b[i] & 0x7f) << 21) | ((b[i + 1] & 0x7f) << 14) | ((b[i + 2] & 0x7f) << 7) | (b[i + 3] & 0x7f);

export function parseId3(buffer: ArrayBuffer): AudioTags | null {
  const b = new Uint8Array(buffer);
  if (b.length > 10 && b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) {
    const major = b[3], end = Math.min(b.length, 10 + syncsafe(b, 6));
    const tags: AudioTags = { via: 'id3' };
    let i = 10;
    if (b[5] & 0x40 && major >= 3) i += major === 4 ? syncsafe(b, 10) : ((b[10] << 24) | (b[11] << 16) | (b[12] << 8) | b[13]) + 4;
    const idLength = major === 2 ? 3 : 4, headerLength = major === 2 ? 6 : 10;
    while (i + headerLength <= end) {
      const id = latin1.decode(b.subarray(i, i + idLength));
      if (!/^[A-Z0-9]+$/.test(id)) break;
      const size = major === 2 ? (b[i + 3] << 16) | (b[i + 4] << 8) | b[i + 5] : major === 4 ? syncsafe(b, i + 4) : ((b[i + 4] << 24) >>> 0) + (b[i + 5] << 16) + (b[i + 6] << 8) + b[i + 7];
      if (size <= 0 || i + headerLength + size > end) break;
      const value = () => decodeId3Text(b.subarray(i + headerLength, i + headerLength + size));
      if (id === 'TIT2' || id === 'TT2') tags.title = value();
      else if (id === 'TPE1' || id === 'TP1') tags.artist = value();
      else if (id === 'TALB' || id === 'TAL') tags.album = value();
      i += headerLength + size;
    }
    if (tags.title || tags.artist) return tags;
  }
  if (b.length >= 128 && latin1.decode(b.subarray(b.length - 128, b.length - 125)) === 'TAG') {
    const field = (offset: number) => clean(latin1.decode(b.subarray(b.length - 128 + offset, b.length - 128 + offset + 30)));
    const tags: AudioTags = { via: 'id3', title: field(3), artist: field(33), album: field(63) };
    if (tags.title || tags.artist) return tags;
  }
  return null;
}

export function parseMp4(buffer: ArrayBuffer): AudioTags | null {
  const view = new DataView(buffer), b = new Uint8Array(buffer);
  const tags: AudioTags = { via: 'mp4' };
  const walk = (start: number, end: number, depth: number) => {
    let i = start;
    while (i + 8 <= end && depth < 8) {
      let size = view.getUint32(i), header = 8;
      const type = latin1.decode(b.subarray(i + 4, i + 8));
      if (size === 1 && i + 16 <= end) { size = Number(view.getBigUint64(i + 8)); header = 16; }
      if (size === 0) size = end - i;
      if (size < header || i + size > end) break;
      if (type === 'moov' || type === 'udta' || type === 'ilst') walk(i + header, i + size, depth + 1);
      else if (type === 'meta') walk(i + header + 4, i + size, depth + 1);
      else if (type === '©nam' || type === '©ART' || type === '©alb' || type === 'aART') {
        const data = i + header;
        if (data + 16 <= i + size && latin1.decode(b.subarray(data + 4, data + 8)) === 'data') {
          const text = clean(utf8.decode(b.subarray(data + 16, i + size)));
          if (type === '©nam') tags.title = text; else if (type === '©ART') tags.artist = text; else if (type === '©alb') tags.album = text; else tags.artist ??= text;
        }
      }
      i += size;
    }
  };
  if (b.length > 12 && latin1.decode(b.subarray(4, 8)) === 'ftyp') walk(0, b.length, 0);
  return tags.title || tags.artist ? tags : null;
}

function vorbisComments(view: DataView, b: Uint8Array, start: number): AudioTags | null {
  try {
    const vendor = view.getUint32(start, true);
    let i = start + 4 + vendor;
    const count = view.getUint32(i, true); i += 4;
    const tags: AudioTags = { via: 'vorbis' };
    for (let n = 0; n < Math.min(count, 500) && i + 4 <= b.length; n++) {
      const length = view.getUint32(i, true); i += 4;
      const entry = utf8.decode(b.subarray(i, i + length)); i += length;
      const eq = entry.indexOf('='), key = entry.slice(0, eq).toUpperCase(), value = clean(entry.slice(eq + 1));
      if (key === 'TITLE') tags.title ??= value; else if (key === 'ARTIST') tags.artist ??= value; else if (key === 'ALBUM') tags.album ??= value;
    }
    return tags.title || tags.artist ? tags : null;
  } catch { return null; }
}
export function parseVorbis(buffer: ArrayBuffer): AudioTags | null {
  const view = new DataView(buffer), b = new Uint8Array(buffer);
  if (latin1.decode(b.subarray(0, 4)) === 'fLaC') {
    let i = 4;
    while (i + 4 <= b.length) {
      const header = b[i], type = header & 0x7f, length = (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3];
      if (type === 4) return vorbisComments(view, b, i + 4);
      if (header & 0x80) break;
      i += 4 + length;
    }
    return null;
  }
  const head = latin1.decode(b.subarray(0, Math.min(b.length, 65536)));
  const vorbis = head.indexOf('\x03vorbis'), opus = head.indexOf('OpusTags');
  if (vorbis >= 0) return vorbisComments(view, b, vorbis + 7);
  if (opus >= 0) return vorbisComments(view, b, opus + 8);
  return null;
}

/** “Artista - Título.mp3” (com número de faixa opcional). Sem hífen claro, não adivinha. */
export function parseFilename(name: string): AudioTags {
  const base = name.replace(/\.[a-z0-9]{2,5}$/i, '').replace(/_/g, ' ').trim();
  const parts = base.split(/\s+[-–—]\s+/);
  if (parts.length < 2) return { via: 'none', title: base };
  const artist = parts[0].replace(/^\d{1,3}[\s.)-]+/, '').trim();
  return { via: 'filename', artist, title: parts.slice(1).join(' - ').trim() };
}

export async function readAudioTags(file: File): Promise<AudioTags> {
  const buffer = await file.arrayBuffer();
  return parseId3(buffer) ?? parseMp4(buffer) ?? parseVorbis(buffer) ?? parseFilename(file.name);
}

const strip = (v: string) => normalize(v).replace(/\s*[([].*?[)\]]\s*/g, ' ').replace(/\s+-\s+.*$/, '').replace(/\s+/g, ' ').trim();
const artistMatch = (tag: string, artist: string) => {
  const a = normalize(tag), b = normalize(artist);
  return a === b || a.split(/\s*(?:,|&|;|\/|\bfeat\.?|\bft\.|\bx\b|\band\b)\s*/).map(s => s.trim()).includes(b);
};

export interface FileMatch { file: File; tags: AudioTags; itemId: string | null; confidence: 'exata' | 'variante' | 'ambígua' | 'sem correspondência'; candidates: string[] }
/**
 * Associa arquivos locais a itens do vídeo somente quando artista e título coincidem.
 * Variantes (parênteses, “ - Remaster”) e conflitos exigem confirmação; versões diferentes não são unidas em silêncio.
 */
export function matchAudioFiles(entries: Array<{ file: File; tags: AudioTags }>, items: Item[]): FileMatch[] {
  const tracks = items.filter(item => item.id.startsWith('["tracks"'));
  const result = entries.map(({ file, tags }): FileMatch => {
    if (!tags.title || !tags.artist) return { file, tags, itemId: null, confidence: 'sem correspondência', candidates: [] };
    const byArtist = tracks.filter(item => artistMatch(tags.artist!, item.artist));
    const exact = byArtist.filter(item => normalize(item.name) === normalize(tags.title!));
    const narrowed = exact.length > 1 && tags.album ? exact.filter(item => normalize(item.album) === normalize(tags.album!)) : exact;
    if (narrowed.length === 1) return { file, tags, itemId: narrowed[0].id, confidence: 'exata', candidates: [narrowed[0].id] };
    if (exact.length > 1) return { file, tags, itemId: null, confidence: 'ambígua', candidates: exact.map(i => i.id) };
    const variant = byArtist.filter(item => strip(item.name) === strip(tags.title!) && strip(item.name));
    if (variant.length === 1) return { file, tags, itemId: variant[0].id, confidence: 'variante', candidates: [variant[0].id] };
    return { file, tags, itemId: null, confidence: variant.length ? 'ambígua' : 'sem correspondência', candidates: variant.map(i => i.id) };
  });
  // Dois arquivos para o mesmo item exato: nenhum é escolhido sem confirmação.
  const counts = new Map<string, number>();
  for (const match of result) if (match.itemId) counts.set(match.itemId, (counts.get(match.itemId) ?? 0) + 1);
  return result.map(match => match.itemId && counts.get(match.itemId)! > 1 ? { ...match, itemId: null, confidence: 'ambígua' as const, candidates: [match.itemId] } : match);
}
