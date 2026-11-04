import { describe, expect, it } from 'vitest';
import { GRAMMY_EDITION, genreGroupsOf, grammyAreas, grammyCategories, searchCategories } from './grammy';
import { ballotKey, ceremonyReadiness, emptyBallot, freezeCeremony, sanitizeBallot, subjectKind, suggestNominees } from './ballot';
import { ceremonyReducer, confettiPieces, initialCeremony } from './ceremony';
import { metaKey, type EffectiveMeta } from './metadata';
import type { Item } from './types';

describe('Catálogo Grammy 2027', () => {
  it('tem exatamente 100 categorias únicas em 12 áreas, com as contagens do rulebook', () => {
    expect(GRAMMY_EDITION.number).toBe(69);
    expect(grammyCategories).toHaveLength(100);
    expect(new Set(grammyCategories.map(c => c.id)).size).toBe(100);
    expect(new Set(grammyCategories.map(c => c.official)).size).toBe(100);
    expect(new Set(grammyCategories.map(c => c.label)).size).toBe(100);
    const counts = Object.fromEntries(Object.keys(grammyAreas).map(area => [area, grammyCategories.filter(c => c.area === area).length]));
    expect(counts).toEqual({ general: 6, pop: 8, rock: 6, rnb: 11, jazz: 10, country: 15, gospel: 5, latin: 11, media: 9, package: 4, production: 7, classical: 8 });
    expect(grammyCategories.map(c => c.number)).toEqual(Array.from({ length: 100 }, (_, i) => i + 1));
  });
  it('preserva os nomes oficiais e os rótulos pedidos, incluindo as mudanças de 2027', () => {
    const byOfficial = new Map(grammyCategories.map(c => [c.official, c]));
    expect(byOfficial.get('Album Of The Year')?.label).toBe('Álbum do Ano');
    expect(byOfficial.get('Record Of The Year')?.label).toBe('Gravação do Ano');
    expect(byOfficial.get('Song Of The Year')?.label).toBe('Canção do Ano');
    expect(byOfficial.get('Best New Artist')?.label).toBe('Artista Revelação');
    expect(byOfficial.get('Best R&B Album')?.label).toBe('Melhor Álbum de R&B');
    expect(byOfficial.get('Best R&B Song')?.label).toBe('Melhor Canção de R&B');
    expect(grammyCategories.filter(c => c.change === 'new').map(c => c.official).sort()).toEqual([
      'Best Asian Pop Music Performance', 'Best Latin Song', 'Best R&B Collaboration or Duo/Group Performance', 'Best Traditional Folk Album', 'Best Traditional Pop Vocal Performance',
    ]);
    expect(grammyCategories.some(c => /^Best R&B$/.test(c.official))).toBe(false);
    expect(subjectKind(byOfficial.get('Album Of The Year')!)).toBe('albums');
    expect(subjectKind(byOfficial.get('Song Of The Year')!)).toBe('tracks');
    expect(byOfficial.get('Song Of The Year')!.needs).toContain('credits');
  });
  it('busca sem acento por nome pt-BR, oficial e área', () => {
    expect(searchCategories('cancao do ano').map(c => c.id)).toContain('song-of-the-year');
    expect(searchCategories('R&B', 'rnb')).toHaveLength(6);
    expect(searchCategories('', 'general')).toHaveLength(6);
    expect(searchCategories('', 'all', new Set(['best-rnb-album']))).toHaveLength(1);
  });
  it('mapeia só nomes explícitos de gênero do catálogo', () => {
    expect(genreGroupsOf('R&B/Soul')).toContain('rnb');
    expect(genreGroupsOf('Hip-Hop/Rap')).toContain('rap');
    expect(genreGroupsOf('K-Pop')).toEqual(expect.arrayContaining(['asian-pop']));
    expect(genreGroupsOf(undefined)).toEqual([]);
    expect(genreGroupsOf('Singer/Songwriter')).toEqual([]);
  });
});

const item = (name: string, plays: number, kind = 'tracks', image = ''): Item => ({ id: JSON.stringify([kind, name]), name, artist: 'Artista', album: 'Disco', image, plays });
const meta = (target: Item, genre: string): [string, EffectiveMeta] => [metaKey('tracks', target), { key: metaKey('tracks', target), kind: 'tracks', artist: target.artist, name: target.name, album: target.album, status: 'matched', source: 'itunes', fetchedAt: 1, versions: [], genre, reviewed: false }];

describe('Cédula pessoal', () => {
  const cat = (id: string) => grammyCategories.find(c => c.id === id)!;
  it('sugere por reproduções nas gerais e exige gênero verificado nas de gênero', () => {
    const tracks = [item('A', 5), item('B', 9), item('C', 1)];
    const general = suggestNominees(cat('song-of-the-year'), { tracks }, {});
    expect(general.nominees.map(n => n.name)).toEqual(['B', 'A', 'C']);
    expect(general.criterion).toMatch(/não oficial/);
    const noMeta = suggestNominees(cat('best-rnb-song'), { tracks }, {});
    expect(noMeta.nominees).toHaveLength(0);
    expect(noMeta.insufficient).toMatch(/gêneros verificados/);
    const withMeta = suggestNominees(cat('best-rnb-song'), { tracks }, { tracks: new Map([meta(tracks[0], 'R&B/Soul'), meta(tracks[1], 'Pop')]) });
    expect(withMeta.nominees.map(n => n.name)).toEqual(['A']);
    expect(withMeta.criterion).toMatch(/créditos/);
  });
  it('não infere Artista Revelação, pessoas ou vídeos', () => {
    expect(suggestNominees(cat('best-new-artist'), { artists: [item('X', 99, 'artists')] }, {}).insufficient).toMatch(/Escolha um ano/);
    expect(suggestNominees(cat('producer-of-the-year-non-classical'), {}, {}).insufficient).toMatch(/créditos/);
    expect(suggestNominees(cat('best-music-video'), {}, {}).insufficient).toMatch(/vídeos/);
  });
  it('sanitiza dados externos, remove categorias e vencedores inválidos', () => {
    const raw = { version: 1, edition: 'grammy-2027', selected: ['album-of-the-year', 'falsa', 'album-of-the-year'], entries: { 'album-of-the-year': { nominees: [{ id: 'a', name: 'Disco', artist: 'X', image: 'javascript:alert(1)', kind: 'albums' }], winners: ['a', 'b'] }, falsa: { nominees: [], winners: [] } } };
    const ballot = sanitizeBallot(raw, 'p', 'all');
    expect(ballot.selected).toEqual(['album-of-the-year']);
    expect(Object.keys(ballot.entries)).toEqual(['album-of-the-year']);
    expect(ballot.entries['album-of-the-year'].winners).toEqual(['a']);
    expect(ballot.entries['album-of-the-year'].nominees[0].image).toBe('');
    expect(sanitizeBallot({ version: 1, edition: 'grammy-2026' }, 'p', 'all').entries).toEqual({});
    expect(ballotKey('Perfil', '2026')).toBe('lastchart-awards:v1:perfil:grammy-2027:2026');
  });
  it('explica categorias sem indicado ou vencedor e congela o resultado', () => {
    const ballot = emptyBallot('p', 'all');
    ballot.selected = ['album-of-the-year', 'record-of-the-year', 'song-of-the-year'];
    const nominee = { id: 'n1', kind: 'albums' as const, name: 'Disco', artist: 'X', album: 'Disco', image: '', basis: 'voto' };
    ballot.entries['album-of-the-year'] = { categoryId: 'album-of-the-year', nominees: [nominee], winners: ['n1'], method: 'vote', updatedAt: 1 };
    ballot.entries['record-of-the-year'] = { categoryId: 'record-of-the-year', nominees: [nominee], winners: [], method: 'vote', updatedAt: 1 };
    const { ready, issues } = ceremonyReadiness(ballot);
    expect(ready).toEqual(['album-of-the-year']);
    expect(issues.map(i => i.categoryId)).toEqual(['record-of-the-year', 'song-of-the-year']);
    const frozen = freezeCeremony(ballot);
    ballot.entries['album-of-the-year'].nominees[0].name = 'Alterado';
    expect(frozen[0].winners[0].name).toBe('Disco');
  });
});

describe('Roteiro da cerimônia', () => {
  it('segue indicados → suspense → cortinas → vencedor → próxima → final', () => {
    let s = initialCeremony(2);
    s = ceremonyReducer(s, { type: 'begin' }); expect(s.phase).toBe('suspense');
    s = ceremonyReducer(s, { type: 'curtains-done' }); expect(s.phase).toBe('suspense');
    s = ceremonyReducer(s, { type: 'suspense-done' }); expect(s.phase).toBe('curtains');
    s = ceremonyReducer(s, { type: 'curtains-done' }); expect(s).toMatchObject({ phase: 'revealed', reveals: 1 });
    s = ceremonyReducer(s, { type: 'next' }); expect(s).toMatchObject({ index: 1, phase: 'nominees' });
    s = ceremonyReducer(s, { type: 'skip' }); expect(s.phase).toBe('revealed');
    s = ceremonyReducer(s, { type: 'next' }); expect(s.phase).toBe('finished');
  });
  it('clique duplo e timers atrasados não pulam categorias; replay e movimento reduzido funcionam', () => {
    let s = ceremonyReducer(initialCeremony(3), { type: 'skip' });
    s = ceremonyReducer(s, { type: 'next' }); s = ceremonyReducer(s, { type: 'next' });
    expect(s).toMatchObject({ index: 1, phase: 'nominees' });
    s = ceremonyReducer(s, { type: 'suspense-done' }); expect(s.phase).toBe('nominees');
    const reduced = ceremonyReducer(s, { type: 'begin' }, true); expect(reduced.phase).toBe('revealed');
    const replay = ceremonyReducer(reduced, { type: 'replay' }); expect(replay.phase).toBe('suspense');
    expect(ceremonyReducer(initialCeremony(0), { type: 'begin' }).phase).toBe('finished');
    expect(ceremonyReducer(initialCeremony(2), { type: 'goto', index: 5 }).index).toBe(0);
  });
  it('confetes são limitados e determinísticos', () => {
    expect(confettiPieces(3)).toEqual(confettiPieces(3));
    expect(confettiPieces(3, 500)).toHaveLength(60);
    expect(confettiPieces(1).every(p => p.left >= 0 && p.left <= 100)).toBe(true);
  });
});
