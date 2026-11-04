import { describe, expect, it } from 'vitest';
import { careerFrom, metaKey, type EffectiveMeta } from './metadata';
import { emptyBallot, newArtistCheck, suggestNominees, type Eligibility, type RevealCard } from './ballot';
import { grammyById } from './grammy';
import { ceremonyHeadlines, juryQuote, weekHeadlines } from './press';
import { personalAwards } from './achievements';
import { buildCharts } from './charts';
import { makeWeeks } from './calendar';
import { defaults, type CachedWeek, type Item, type Kind } from './types';

const rules2026: Eligibility = { mode: 'release', start: Date.parse('2026-01-02T00:00Z') / 1000, end: Date.parse('2026-11-04T00:00Z') / 1000, year: 2026 };
const meta = (kind: Kind, item: Item, extra: Partial<EffectiveMeta>): [string, EffectiveMeta] => [metaKey(kind, item), { key: metaKey(kind, item), kind, artist: item.artist, name: item.name, album: item.album, status: 'matched', source: 'itunes', fetchedAt: 1, versions: [], reviewed: false, ...extra }];
const item = (kind: Kind, name: string, artist: string, plays: number): Item => ({ id: JSON.stringify([kind, artist.toLowerCase(), name.toLowerCase()]), name, artist, album: kind === 'albums' ? name : '', image: '', plays });

describe('Elegibilidade realista', () => {
  it('estima a carreira pelo catálogo, ignorando singles e EPs', () => {
    expect(careerFrom([{ collectionName: 'Debut - Single', releaseDate: '2023-03-01', trackCount: 1 }, { collectionName: 'Primeiro', releaseDate: '2024-05-01', trackCount: 11 }, { collectionName: 'EP - EP', releaseDate: '2023-09-01', trackCount: 5 }])).toEqual({ firstRelease: '2023-03-01', albumCount: 1 });
    expect(careerFrom([])).toBeNull();
  });
  it('carreira de catálogo permanece disponível, mas não define a revelação pessoal', () => {
    const veteran = item('artists', 'Lady Gaga', 'Lady Gaga', 900), rookie = item('artists', 'Nova Voz', 'Nova Voz', 120), unknown = item('artists', 'Sem Dados', 'Sem Dados', 50);
    const artists = new Map([meta('artists', veteran, { firstRelease: '2008-04-08', albumCount: 7 }), meta('artists', rookie, { firstRelease: '2024-06-01', albumCount: 1 })]);
    expect(newArtistCheck(artists.get(metaKey('artists', veteran)), rules2026).ok).toBe(false);
    expect(newArtistCheck(artists.get(metaKey('artists', rookie)), rules2026).ok).toBe(true);
    expect(newArtistCheck(undefined, rules2026).ok).toBeNull();
    const row = { plays: 100, weeksActive: 1, weeksAtOne: 0, weeksTop10: 0, firstHalf: 50, secondHalf: 50 };
    const stats = { artists: { [veteran.id]: { ...row, chartDebut: { week: '02/01/26 — 08/01/26', year: 2026, start: rules2026.start, missingBefore: 0, provisional: false } }, [rookie.id]: { ...row, chartDebut: { week: '05/01/24 — 11/01/24', year: 2024, start: 1, missingBefore: 0, provisional: false } } } };
    const s = suggestNominees(grammyById.get('best-new-artist')!, { artists: [veteran, rookie, unknown] }, { artists }, 5, rules2026, stats);
    expect(s.nominees.map(n => n.name)).toEqual(['Lady Gaga']);
    expect(s.unknown).toBe(1);
    expect(s.nominees[0].basis).toMatch(/seu Top 100.*26/);
  });
  it('Álbum do Ano só com lançamentos da janela; sem data fica de fora; “qualquer lançamento” libera', () => {
    const old = item('albums', 'Antigo', 'A', 500), fresh = item('albums', 'Novo', 'B', 100), edge = item('albums', 'Setembro', 'C', 90), nodate = item('albums', 'Sem Data', 'D', 80);
    const albums = new Map([meta('albums', old, { releaseDate: '2010-01-01' }), meta('albums', fresh, { releaseDate: '2026-03-01' }), meta('albums', edge, { releaseDate: '2025-10-15' })]);
    const pools = { albums: [old, fresh, edge, nodate] };
    const strict = suggestNominees(grammyById.get('album-of-the-year')!, pools, { albums }, 5, rules2026);
    expect(strict.nominees.map(n => n.name)).toEqual(['Novo', 'Setembro']);
    expect(strict.unknown).toBe(1);
    expect(strict.criterion).toMatch(/janela/);
    expect(suggestNominees(grammyById.get('album-of-the-year')!, pools, { albums }, 5, { ...rules2026, mode: 'any' }).nominees[0].name).toBe('Antigo');
    expect(suggestNominees(grammyById.get('album-of-the-year')!, { albums: [old] }, { albums }, 5, rules2026).insufficient).toMatch(/qualquer lançamento/);
  });
});

describe('Imprensa LastChart', () => {
  const weeks = makeWeeks(defaults, Date.parse('2016-07-15T12:00Z'));
  const cached: CachedWeek[] = weeks.map((week, i) => ({ key: week.id, week, cutoff: week.end, fetchedAt: 1, duplicates: 0, scrobbles: [
    ...Array.from({ length: i < 2 ? 10 : 2 }, (_, k) => ({ timestamp: week.start + k, artist: 'Velha', track: 'Antiga', album: 'X', image: '' })),
    ...Array.from({ length: i < 2 ? 1 : 12 }, (_, k) => ({ timestamp: week.start + 50 + k, artist: 'Nova', track: 'Hit', album: 'Y', image: '' })),
  ] }));
  const charts = buildCharts(weeks, cached, 'tracks');
  it('manchetes da semana usam só o chart real', () => {
    const heads = weekHeadlines(charts[2], charts[1]);
    expect(heads[0].title).toBe('Hit chega ao topo');
    expect(heads[0].dek).toMatch(/12 reproduções/);
    expect(weekHeadlines(charts[3], charts[2])[0].title).toMatch(/2ª semana/);
    expect(weekHeadlines(undefined, undefined)).toEqual([]);
  });
  it('comentários do júri citam o critério e manchetes da cerimônia detectam zebra e unanimidade', () => {
    const nominees = [{ id: 'a', kind: 'tracks' as const, name: 'A', artist: 'X', album: '', image: '', plays: 10, basis: '' }, { id: 'b', kind: 'tracks' as const, name: 'B', artist: 'Y', album: '', image: '', plays: 50, basis: '' }];
    const card: RevealCard = { category: grammyById.get('record-of-the-year')!, nominees, winners: [nominees[0]], method: 'jury', jury: { winner: 'a', decidedAt: 1, totals: { a: 9, b: 8.5 }, judges: [
      { judge: 'volume', ranking: ['b', 'a'], points: { a: 1, b: 2 }, scores: { a: 10, b: 50 } },
      { judge: 'steady', ranking: ['a', 'b'], points: { a: 2, b: 1 }, scores: { a: 6, b: 2 } },
      { judge: 'time', ranking: [], points: {}, scores: {}, abstain: 'x' },
    ] } };
    expect(juryQuote(card.jury!.judges[0], card)).toMatch(/B/);
    expect(juryQuote(card.jury!.judges[1], card)).toMatch(/6 semanas/);
    expect(juryQuote(card.jury!.judges[2], card)).toMatch(/“/);
    const heads = ceremonyHeadlines([card]).map(h => h.id);
    expect(heads).toEqual(expect.arrayContaining(['close-record-of-the-year', 'upset-record-of-the-year']));
  });
});

describe('Prêmios na tela do item', () => {
  class Mem implements Storage { m = new Map<string, string>(); get length() { return this.m.size; } clear() { this.m.clear(); } getItem(k: string) { return this.m.get(k) ?? null; } key(i: number) { return [...this.m.keys()][i] ?? null; } removeItem(k: string) { this.m.delete(k); } setItem(k: string, v: string) { this.m.set(k, v); } }
  it('lista vitórias e indicações da obra e, no artista, das obras dele', () => {
    const storage = new Mem();
    const ballot = emptyBallot('perfil', '2026');
    const song = { id: '["tracks","diva","hit",""]', kind: 'tracks' as const, name: 'Hit', artist: 'Diva', album: '', image: '', plays: 9, basis: '' };
    ballot.entries['record-of-the-year'] = { categoryId: 'record-of-the-year', nominees: [song], winners: [song.id], method: 'jury', updatedAt: 1 };
    ballot.entries['song-of-the-year'] = { categoryId: 'song-of-the-year', nominees: [song, { ...song, id: 'outro', name: 'Outro' }], winners: ['outro'], method: 'vote', updatedAt: 1 };
    storage.setItem('lastchart-awards:v1:perfil:grammy-2027:2026', JSON.stringify(ballot));
    const own = personalAwards({ id: song.id, name: 'Hit', artist: 'Diva' }, 'perfil', storage);
    expect(own.map(a => `${a.result}:${a.category}`)).toEqual(['win:Gravação do Ano', 'nominee:Canção do Ano']);
    const artist = personalAwards({ id: '["artists","diva"]', name: 'Diva', artist: 'Diva' }, 'perfil', storage);
    expect(artist[0]).toMatchObject({ via: 'artista', work: 'Hit', result: 'win' });
    expect(personalAwards({ id: 'x', name: 'x', artist: 'Ninguém' }, 'perfil', storage)).toEqual([]);
  });
});

describe('Comparação em grupo', () => {
  it('matriz de afinidade, parada do grupo, comuns a todos e quem ouviu primeiro (até 5)', async () => {
    const { compareGroup } = await import('./compare');
    const weeks = makeWeeks(defaults, Date.parse('2016-07-15T12:00Z'));
    const mk = (offset: number, list: Array<[string, number]>): CachedWeek[] => weeks.map(week => ({ key: week.id, week, cutoff: week.end, fetchedAt: 1, duplicates: 0, scrobbles: list.flatMap(([t, n]) => Array.from({ length: n }, (_, k) => ({ timestamp: week.start + offset + k, artist: 'Art', track: t, album: '', image: '' }))) }));
    const people = [{ name: 'A', cached: mk(10, [['Hino', 5], ['Só A', 5]]) }, { name: 'B', cached: mk(500, [['Hino', 5], ['Ponte', 5]]) }, { name: 'C', cached: mk(900, [['Hino', 2], ['Ponte', 8]]) }, { name: 'D', cached: [] }, { name: 'E', cached: [] }, { name: 'F', cached: [] }];
    const g = compareGroup(people, { kind: 'tracks', start: weeks[0].start, end: weeks.at(-1)!.end });
    expect(g.members).toHaveLength(5);
    expect(g.matrix[0][0]).toBe(100);
    expect(g.matrix[0][3]).toBeNull();
    expect(g.closest).toMatchObject({ a: 'B', b: 'C' });
    expect(g.chart[0].name).toBe('Hino');
    expect(g.sharedAll).toEqual([]);
    expect(g.trendsetters[0]).toMatchObject({ name: 'A', firsts: 1 });
  });
});
