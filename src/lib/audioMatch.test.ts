import { describe, expect, it } from 'vitest';
import { matchAudioFiles, parseFilename, parseId3, parseMp4, parseVorbis, type AudioTags } from './audioMatch';
import { resolveClipBank, type AudioClip } from './leaderAudio';
import type { Item } from './types';

const enc = new TextEncoder();
const concat = (...parts: Uint8Array[]) => { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let i = 0; for (const p of parts) { out.set(p, i); i += p.length; } return out; };
const be32 = (n: number) => new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
const le32 = (n: number) => new Uint8Array([n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255]);
const syncsafe = (n: number) => new Uint8Array([(n >> 21) & 127, (n >> 14) & 127, (n >> 7) & 127, n & 127]);
const frame = (id: string, text: string) => { const body = concat(new Uint8Array([3]), enc.encode(text)); return concat(enc.encode(id), be32(body.length), new Uint8Array([0, 0]), body); };
const id3 = (frames: Uint8Array[]) => { const body = concat(...frames); return concat(enc.encode('ID3'), new Uint8Array([3, 0, 0]), syncsafe(body.length), body, new Uint8Array(64)).buffer; };
const latin = (t: string) => new Uint8Array([...t].map(c => c.charCodeAt(0)));
const atom = (type: string, ...children: Uint8Array[]) => { const body = concat(...children); return concat(be32(body.length + 8), latin(type), body); };
const dataAtom = (text: string) => atom('data', be32(1), be32(0), enc.encode(text));

describe('Etiquetas de arquivos locais', () => {
  it('lê ID3v2.3 em UTF-8 e ID3v1', () => {
    expect(parseId3(id3([frame('TIT2', 'Film Noir'), frame('TPE1', 'Faouzia'), frame('TALB', 'Film Noir')]))).toMatchObject({ title: 'Film Noir', artist: 'Faouzia', album: 'Film Noir', via: 'id3' });
    const v1 = new Uint8Array(256); v1.set(enc.encode('TAG'), 128); v1.set(enc.encode('Songs'), 131); v1.set(enc.encode('Band'), 161);
    expect(parseId3(v1.buffer)).toMatchObject({ title: 'Songs', artist: 'Band' });
    expect(parseId3(new Uint8Array(20).buffer)).toBeNull();
  });
  it('lê MP4/M4A (ilst) e FLAC (Vorbis comment)', () => {
    const mp4 = concat(atom('ftyp', enc.encode('M4A ')), atom('moov', atom('udta', atom('meta', be32(0), atom('ilst', atom('©nam', dataAtom('Tears')), atom('©ART', dataAtom('Faouzia')))))));
    expect(parseMp4(mp4.buffer)).toMatchObject({ title: 'Tears', artist: 'Faouzia', via: 'mp4' });
    const comments = ['TITLE=Minefields', 'ARTIST=Faouzia'].map(c => concat(le32(enc.encode(c).length), enc.encode(c)));
    const block = concat(le32(3), enc.encode('lib'), le32(comments.length), ...comments);
    const flac = concat(enc.encode('fLaC'), new Uint8Array([0x84, (block.length >> 16) & 255, (block.length >> 8) & 255, block.length & 255]), block);
    expect(parseVorbis(flac.buffer)).toMatchObject({ title: 'Minefields', artist: 'Faouzia', via: 'vorbis' });
  });
  it('usa nome “Artista - Título” e não adivinha sem separador', () => {
    expect(parseFilename('03 - Faouzia - Film Noir.mp3')).toMatchObject({ via: 'filename', title: 'Faouzia - Film Noir' });
    expect(parseFilename('Faouzia - Film Noir.mp3')).toMatchObject({ artist: 'Faouzia', title: 'Film Noir' });
    expect(parseFilename('faixa1.mp3').via).toBe('none');
  });
});

const track = (name: string, artist = 'Faouzia', album = 'Disco'): Item => ({ id: JSON.stringify(['tracks', artist.toLowerCase(), name.toLowerCase(), album.toLowerCase()]), name, artist, album, image: '', plays: 1 });
const file = (name: string) => new File([new Uint8Array(4)], name, { type: 'audio/mpeg' });
const entry = (name: string, tags: Partial<AudioTags>) => ({ file: file(name), tags: { via: 'id3', ...tags } as AudioTags });

describe('Associação automática', () => {
  const items = [track('Film Noir'), track('Tears'), track('Tears', 'Faouzia', 'Ao Vivo'), track('Minefields', 'Faouzia & John Legend'), track('Other', 'Outra')];
  it('associa exato, marca variante e recusa ambíguos ou ausentes', () => {
    const [variant] = matchAudioFiles([entry('b.mp3', { title: 'Film Noir (Remastered)', artist: 'faouzia' })], items);
    const [exact, ambiguous, missing, collab, noTags] = matchAudioFiles([
      entry('a.mp3', { title: 'Film Noir', artist: 'Faouzia' }),
      entry('c.mp3', { title: 'Tears', artist: 'Faouzia' }),
      entry('d.mp3', { title: 'Não Existe', artist: 'Faouzia' }),
      entry('e.mp3', { title: 'Minefields', artist: 'Faouzia & John Legend' }),
      entry('f.mp3', { title: 'Film Noir' }),
    ], items);
    expect(exact).toMatchObject({ confidence: 'exata', itemId: items[0].id });
    expect(variant).toMatchObject({ confidence: 'variante', itemId: items[0].id });
    expect(ambiguous).toMatchObject({ confidence: 'ambígua', itemId: null });
    expect(ambiguous.candidates).toHaveLength(2);
    expect(missing.confidence).toBe('sem correspondência');
    expect(collab).toMatchObject({ confidence: 'exata', itemId: items[3].id });
    expect(noTags.itemId).toBeNull();
  });
  it('álbum desfaz homônimos e dois arquivos para o mesmo item exigem escolha', () => {
    expect(matchAudioFiles([entry('c.mp3', { title: 'Tears', artist: 'Faouzia', album: 'Ao Vivo' })], items)[0].itemId).toBe(items[2].id);
    const twice = matchAudioFiles([entry('1.mp3', { title: 'Film Noir', artist: 'Faouzia' }), entry('2.mp3', { title: 'Film Noir', artist: 'Faouzia' })], items);
    expect(twice.every(m => m.itemId === null && m.confidence === 'ambígua')).toBe(true);
  });
  it('modos: manual, automático e automático com prioridade manual', () => {
    const clip = (name: string, origin: AudioClip['origin']): AudioClip => ({ file: file(name), name, duration: 30, origin });
    const manual = { a: clip('m.mp3', 'manual') }, auto = { a: clip('x.mp3', 'auto'), b: clip('y.mp3', 'auto') };
    expect(Object.keys(resolveClipBank('manual', manual, auto))).toEqual(['a']);
    expect(resolveClipBank('auto', manual, auto).a.name).toBe('x.mp3');
    const both = resolveClipBank('auto-manual', manual, auto);
    expect(both.a.name).toBe('m.mp3');
    expect(both.b.name).toBe('y.mp3');
  });
});
