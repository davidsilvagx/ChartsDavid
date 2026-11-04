import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { applyLastfmDuration, effective, enrichItems, formatDuration, listeningTime, loadMetadata, metaKey, pickCatalogMatch, saveReview, versionTags, type CatalogCandidate, type EffectiveMeta } from './metadata';
import { defaults, type CachedWeek, type Item } from './types';
import { makeWeeks } from './calendar';

const track = (name: string, album = 'Film Noir'): Item => ({ id: name, name, artist: 'Faouzia', album, image: '', plays: 1 });
const result = (over: Partial<CatalogCandidate>): CatalogCandidate => ({ artistName: 'Faouzia', trackName: 'Film Noir', collectionName: 'Film Noir', trackTimeMillis: 200000, primaryGenreName: 'Pop', releaseDate: '2026-02-01T08:00:00Z', trackId: 1, ...over });

describe('Correspondência de catálogo', () => {
  it('aceita só artista e título iguais e registra fonte, data e confiança', () => {
    const record = pickCatalogMatch('tracks', track('Film Noir'), [result({ artistName: 'Outra', trackName: 'Film Noir' }), result({})], 10);
    expect(record).toMatchObject({ status: 'matched', match: 'exact', confidence: 'alta', genre: 'Pop', releaseDate: '2026-02-01', durationMs: 200000, durationSource: 'itunes', fetchedAt: 10 });
    expect(pickCatalogMatch('tracks', track('Outra Música'), [result({})]).status).toBe('not-found');
  });
  it('homônimas com durações diferentes ficam ambíguas, sem duração', () => {
    const record = pickCatalogMatch('tracks', track('Film Noir', ''), [result({ trackTimeMillis: 200000, collectionName: 'A' }), result({ trackTimeMillis: 260000, collectionName: 'B (Live)' })]);
    expect(record.status).toBe('ambiguous');
    expect(record.durationMs).toBeUndefined();
    const albumPick = pickCatalogMatch('tracks', track('Film Noir', 'B (Live)'), [result({ trackTimeMillis: 200000, collectionName: 'A' }), result({ trackTimeMillis: 260000, collectionName: 'B (Live)' })]);
    expect(albumPick).toMatchObject({ status: 'matched', durationMs: 260000 });
    expect(albumPick.versions).toContain('live');
  });
  it('variação de título não fornece duração e gênero do artista é separado', () => {
    const variant = pickCatalogMatch('tracks', track('Film Noir (Sped Up)'), [result({ trackName: 'Film Noir' })]);
    expect(variant.match).toBe('variant');
    expect(variant.durationMs).toBeUndefined();
    const artist = pickCatalogMatch('artists', { artist: 'Faouzia', name: 'Faouzia', album: '' }, [result({ trackName: '' })]);
    expect(artist.note).toMatch(/não é o gênero de cada faixa/);
  });
  it('detecta marcadores de versão sem inventar', () => {
    expect(versionTags('Song - Remastered 2011')).toEqual(['remaster']);
    expect(versionTags('Song (feat. Someone)')).toEqual(['collaboration']);
    expect(versionTags('Song (Live at Wembley)', 'Album (Deluxe Edition)')).toEqual(['live', 'reissue']);
    expect(versionTags('Live Forever Song'.toLowerCase())).toEqual(['live']);
    expect(versionTags('Plain')).toEqual([]);
  });
  it('conflito de duração com Last.fm fica fora da soma; Last.fm completa quando falta', () => {
    const base = pickCatalogMatch('tracks', track('Film Noir'), [result({})]);
    expect(applyLastfmDuration(base, 260000).durationConflict).toBe(true);
    expect(applyLastfmDuration(base, 201000).durationConflict).toBeUndefined();
    const missing = { ...base, durationMs: undefined, durationSource: undefined };
    expect(applyLastfmDuration(missing, 199000)).toMatchObject({ durationMs: 199000, durationSource: 'lastfm' });
    expect(applyLastfmDuration(missing, 0).durationMs).toBeUndefined();
  });
});

describe('Tempo ouvido com cobertura', () => {
  const [week] = makeWeeks(defaults, Date.parse('2016-06-30T00:00Z'));
  const cached: CachedWeek[] = [{ key: week.id, week, cutoff: week.end, fetchedAt: 1, duplicates: 0, scrobbles: [
    { timestamp: week.start + 10, artist: 'Faouzia', track: 'Film Noir', album: 'Film Noir', image: '' },
    { timestamp: week.start + 20, artist: 'Faouzia', track: 'Film Noir', album: 'Film Noir', image: '', source: 'spotify' },
    { timestamp: week.start + 4000, artist: 'Faouzia', track: 'Film Noir', album: 'Film Noir', image: '' },
    { timestamp: week.start + 5000, artist: 'Outro', track: 'Sem Catálogo', album: '', image: '' },
  ] }];
  const record = pickCatalogMatch('tracks', track('Film Noir'), [result({})]);
  const meta = new Map<string, EffectiveMeta>([[record.key, effective(record)]]);
  it('soma só gravações confirmadas, sem contar espelho Spotify/Last.fm duas vezes', () => {
    const time = listeningTime(cached, meta);
    expect(time.scrobbles).toBe(3);
    expect(time.timed).toBe(2);
    expect(time.ms).toBe(400000);
    expect(time.coverage).toBeCloseTo(2 / 3);
    expect(time.missing[0]).toMatchObject({ track: 'Sem Catálogo', plays: 1 });
  });
  it('ausência, zero e conflito não entram; revisão manual pode corrigir', () => {
    expect(listeningTime([], meta)).toMatchObject({ scrobbles: 0, ms: 0, coverage: 0 });
    const conflict = new Map([[record.key, effective({ ...record, durationConflict: true })]]);
    expect(listeningTime(cached, conflict)).toMatchObject({ timed: 0, conflicts: 2 });
    const reviewed = new Map([[record.key, effective({ ...record, durationConflict: true }, { durationMs: 180000, reviewedAt: 1 })]]);
    expect(listeningTime(cached, reviewed).ms).toBe(360000);
    expect(formatDuration(400000)).toBe('7 min');
    expect(formatDuration(3 * 3600_000 + 5 * 60_000)).toBe('3 h 5 min');
  });
  it('janela temporal limita a soma a scrobbles dentro do intervalo', () => {
    expect(listeningTime(cached, meta, { start: week.start + 3000, end: week.end }).scrobbles).toBe(2);
  });
});

describe('Enriquecimento em lote', () => {
  it('salva cache, pula itens conhecidos e cancela', async () => {
    const items = [track('Film Noir'), track('Nada')];
    const progress: number[] = [];
    await enrichItems('tracks', items, { signal: new AbortController().signal, pacingMs: 0, fetcher: async () => [result({})], onProgress: p => progress.push(p.done) });
    const stored = await loadMetadata('tracks');
    expect(stored.get(metaKey('tracks', items[0]))?.status).toBe('matched');
    expect(stored.get(metaKey('tracks', items[1]))?.status).toBe('not-found');
    let calls = 0;
    await enrichItems('tracks', items, { signal: new AbortController().signal, pacingMs: 0, known: stored, fetcher: async () => { calls++; return []; }, onProgress: () => {} });
    expect(calls).toBe(0);
    await saveReview(metaKey('tracks', items[1]), { genre: 'R&B/Soul', reviewedAt: 2 });
    expect((await loadMetadata('tracks')).get(metaKey('tracks', items[1]))).toMatchObject({ genre: 'R&B/Soul', reviewed: true });
    const controller = new AbortController(); controller.abort();
    await expect(enrichItems('tracks', [track('X')], { signal: controller.signal, pacingMs: 0, fetcher: async () => [], onProgress: () => {} })).rejects.toThrow();
  });
});
