import { describe, expect, it } from 'vitest';
import { addPersonalAwardStats, personalDebutCheck } from './awardStats';
import { ballotKey, ceremonyReadiness, conveneJury, emptyBallot, freezeCeremony, personalEntryIssue, sanitizeBallot, suggestNominees, type BallotEntry, type Eligibility } from './ballot';
import { ARTIST_OF_YEAR, awardById, grammyCategories, searchCategories } from './grammy';
import { artistYearScores, runJury, type ItemStats } from './jury';
import { buildPools } from './pools';
import { buildCharts } from './charts';
import { makeWeeks } from './calendar';
import { defaults, type CachedWeek, type Item } from './types';

const weeks = makeWeeks({ ...defaults, startDate: '2024-12-27' }, Date.parse('2026-01-15T12:00Z'));
const first2026 = weeks.findIndex(w => w.year === 2026);
const rows = (i: number, tracks: Array<[artist: string, name: string, plays: number]>): CachedWeek => ({
  key: weeks[i].id, week: weeks[i], cutoff: weeks[i].end, fetchedAt: 1, duplicates: 0,
  scrobbles: tracks.flatMap(([artist, track, n], j) => Array.from({ length: n }, (_, k) => ({ artist, track, album: artist, image: '', timestamp: weeks[i].start + 100 + j * 100 + k }))),
});
const history = weeks.map((_, i) => rows(i, i === 0 ? [['Jade', 'Antes', 20], ['Só em 2024', 'Passado', 300], ...Array.from({ length: 101 }, (_, j): [string, string, number] => [`Antigo ${j}`, 'Disco antigo', 2]), ['Escondida', 'Quase estreou', 1]] : i === first2026 ? [['Madonna', 'Um', 15], ['Madonna', 'Dois', 12], ['Jade', 'Agora', 10], ['Escondida', 'Estreia real no chart', 8]] : i === first2026 + 1 ? [['Madonna', 'Um', 20], ['Madonna', 'Dois', 12], ['Jade', 'Agora', 10]] : []));
const selected = history.filter(w => w.week.year === 2026);
const rules: Eligibility = { mode: 'any', year: 2026, period: '2026', start: selected[0].week.start, end: selected.at(-1)!.week.end };
const row = (extra: Partial<ItemStats> = {}): ItemStats => ({ plays: 1, weeksActive: 1, weeksAtOne: 0, weeksTop10: 1, firstHalf: 1, secondHalf: 0, ...extra });
const pool = () => buildPools(selected, false, undefined, 'all', { history, calendar: weeks });

describe('Revelação do histórico pessoal', () => {
  it('Madonna estreando no chart em 2026 é elegível; quem já entrou em 2024 não volta como revelação', () => {
    const { pools, stats } = pool();
    const suggestion = suggestNominees(awardById.get('best-new-artist')!, pools, {}, 6, rules, stats);
    expect(suggestion.nominees.map(n => n.name)).toEqual(['Madonna', 'Escondida']);
    expect(suggestion.nominees[0].basis).toMatch(/Estreia no seu Top 100/);
    const jade = pools.artists.find(a => a.name === 'Jade')!;
    expect(personalDebutCheck(stats.artists[jade.id], 2026)).toMatchObject({ ok: false });
  });
  it('primeira audição fora do Top 100 não antecipa a estreia no chart', () => {
    const { pools, stats } = pool(), hidden = pools.artists.find(a => a.name === 'Escondida')!;
    expect(history[0].scrobbles.some(s => s.artist === 'Escondida')).toBe(true);
    expect(stats.artists[hidden.id].chartDebut?.year).toBe(2026);
    expect(personalDebutCheck(stats.artists[hidden.id], 2026).ok).toBe(true);
  });
  it('semanas anteriores ausentes não viram uma estreia confirmada', () => {
    const incomplete = history.filter((_, i) => i !== 2);
    const { pools, stats } = buildPools(selected, false, undefined, 'all', { history: incomplete, calendar: weeks });
    const madonna = pools.artists.find(a => a.name === 'Madonna')!;
    expect(personalDebutCheck(stats.artists[madonna.id], 2026)).toMatchObject({ ok: null });
    expect(personalDebutCheck(stats.artists[madonna.id], 2026).basis).toMatch(/falta 1 semana anterior/);
  });
  it('ranking semanal e desempate permanecem alinhados ao motor oficial do app', () => {
    const { pools, stats } = pool(), official = buildCharts(weeks, history, 'tracks').filter(w => w.year === 2026);
    for (const artist of pools.artists) {
      const top10 = new Set(official.flatMap(w => w.entries.filter(e => e.rank <= 10 && e.artist === artist.name).map(e => e.id)));
      const crowns = official.filter(w => w.entries.some(e => e.rank === 1 && e.artist === artist.name)).length;
      expect(stats.artists[artist.id]).toMatchObject({ top10Tracks: top10.size, trackWeeksAtOne: crowns });
    }
  });
  it('conta músicas diferentes, não soma a mesma música novamente a cada semana', () => {
    const { pools, stats } = pool(), madonna = pools.artists.find(a => a.name === 'Madonna')!;
    expect(stats.artists[madonna.id]).toMatchObject({ top10Tracks: 2, trackWeeksAtOne: 2, plays: 59 });
    expect(pools.artists.some(a => a.name === 'Só em 2024')).toBe(false);
  });
  it('calendário vazio e ausência de estatística produzem estado desconhecido, sem estreias inventadas', () => {
    const stats = { tracks: {}, albums: {}, artists: {} }; addPersonalAwardStats(stats, [], [], [], false, undefined, 'all');
    expect(stats).toEqual({ tracks: {}, albums: {}, artists: {} });
    expect(personalDebutCheck(undefined, 2026).ok).toBeNull();
    expect(personalDebutCheck(undefined, null).basis).toMatch(/Escolha um ano/);
  });
  it('respeita a fonte escolhida e não confirma estreia sobre uma semana histórica incompleta', () => {
    const mixed = history.map(w => ({ ...w, scrobbles: w.scrobbles.map(s => ({ ...s, source: w.week.year === 2026 ? 'spotify' as const : 'lastfm' as const })) }));
    const current = mixed.filter(w => w.week.year === 2026);
    const { pools, stats } = buildPools(current, false, undefined, 'spotify', { history: mixed, calendar: weeks });
    const jade = pools.artists.find(a => a.name === 'Jade')!;
    expect(personalDebutCheck(stats.artists[jade.id], 2026).ok).toBe(true);
    const incomplete = mixed.map((w, i) => i === 2 ? { ...w, cutoff: w.week.end - 1 } : w);
    const result = buildPools(current, false, undefined, 'spotify', { history: incomplete, calendar: weeks });
    expect(personalDebutCheck(result.stats.artists[jade.id], 2026).ok).toBeNull();
  });
});

describe('Curadoria de Gravação do Ano', () => {
  const tracks: Item[] = Array.from({ length: 25 }, (_, i) => ({ id: `track-${i}`, name: `Faixa ${i}`, artist: `Artista ${Math.floor(i / 4)}`, album: 'Álbum', image: '', plays: 100 - i }));
  const stats = { tracks: Object.fromEntries(tracks.map((t, i) => [t.id, row({ plays: t.plays, weeksActive: i + 1, weeksAtOne: i % 5, weeksTop10: i + 1, firstHalf: 1, secondHalf: i + 5, artistId: t.artist })])), artists: Object.fromEntries(tracks.map(t => [t.artist, row({ plays: 1000 })])) };
  const category = awardById.get('record-of-the-year')!;
  it('escolhe exatamente cinco do Top 20 por critérios reais, sem repetir simplesmente o Top 5', () => {
    const s = suggestNominees(category, { tracks }, {}, 6, rules, stats);
    expect(s.nominees).toHaveLength(5);
    expect(s.nominees.every(n => tracks.slice(0, 20).some(t => t.id === n.id))).toBe(true);
    expect(s.nominees.map(n => n.id)).not.toEqual(tracks.slice(0, 5).map(t => t.id));
    for (const artist of new Set(s.nominees.map(n => n.artist))) expect(s.nominees.filter(n => n.artist === artist).length).toBeLessThanOrEqual(2);
    expect(s.criterion).toMatch(/afinidade/);
    expect(s.criterion).toMatch(/sem sorteio/);
    expect(suggestNominees(category, { tracks: [...tracks].reverse() }, {}, 5, rules, stats).nominees.map(n => n.id)).toEqual(s.nominees.map(n => n.id));
  });
  it('permite gravações antigas ouvidas no ano e mantém os casos com menos de cinco músicas', () => {
    const s = suggestNominees(category, { tracks: tracks.slice(0, 3) }, {}, 6, { ...rules, mode: 'release' }, stats);
    expect(s.nominees).toHaveLength(3);
    expect(suggestNominees(category, { tracks }, {}, 0, rules, stats).nominees).toEqual([]);
    expect(suggestNominees(category, { tracks: [] }, {}, 6, rules, stats).nominees).toEqual([]);
    expect(suggestNominees(category, { tracks }, {}, 5, { ...rules, period: 'all' }, stats).insufficient).toMatch(/Escolha um ano/);
  });
  it('convocação usa cinco, preserva regras na gravação e mantém o vencedor entre os indicados', () => {
    const ballot = { ...emptyBallot('perfil', '2026'), selected: [category.id] };
    const result = conveneJury(ballot, { tracks }, {}, stats, 1, rules).ballot;
    expect(result.entries[category.id].nominees).toHaveLength(5);
    expect(result.entries[category.id].rulesVersion).toBe(2);
    const saved = sanitizeBallot(JSON.parse(JSON.stringify(result)), 'perfil', '2026');
    expect(saved.entries[category.id]).toEqual(result.entries[category.id]);
    expect(freezeCeremony(saved)[0].nominees.map(n => n.id)).toContain(saved.entries[category.id].winners[0]);
  });
});

describe('Artista do Ano e conservação das cédulas', () => {
  const a: Item = { id: 'a', name: 'Mais plays', artist: 'Mais plays', album: '', image: '', plays: 1000 };
  const b: Item = { id: 'b', name: 'Mais hits', artist: 'Mais hits', album: '', image: '', plays: 600 };
  const old: Item = { id: 'old', name: 'Só antes', artist: 'Só antes', album: '', image: '', plays: 0 };
  const stats = { artists: { a: row({ plays: 1000, top10Tracks: 1, trackWeeksAtOne: 0 }), b: row({ plays: 600, top10Tracks: 10, trackWeeksAtOne: 4 }), old: row({ plays: 0, top10Tracks: 100, trackWeeksAtOne: 100 }) } };
  it('mantém 100 categorias oficiais e acrescenta Artista do Ano como exclusiva do app', () => {
    expect(grammyCategories).toHaveLength(100);
    expect(searchCategories('Artista do Ano', 'all', undefined, true).map(c => c.id)).toContain(ARTIST_OF_YEAR);
    expect(awardById.get(ARTIST_OF_YEAR)?.personal).toBe(true);
  });
  it('combina 45/35/20 somente com dados do ano e não deixa plays de outro ano vencerem', () => {
    const scores = artistYearScores(stats.artists);
    expect(scores.b).toEqual({ top: 45, volume: 21, steady: 20 });
    expect(scores.a.top + scores.a.volume + scores.a.steady).toBe(39.5);
    expect(scores.old).toBeUndefined();
    const suggestion = suggestNominees(awardById.get(ARTIST_OF_YEAR)!, { artists: [a, b, old] }, {}, 6, rules, stats);
    expect(suggestion.nominees.map(n => n.id)).toEqual(['b', 'a']);
    const jury = runJury(awardById.get(ARTIST_OF_YEAR)!, suggestion.nominees, stats, {}, 1)!;
    expect(jury).toMatchObject({ winner: 'b', algorithm: 'artist-year', totals: { b: 86, a: 39.5 } });
    expect(suggestNominees(awardById.get(ARTIST_OF_YEAR)!, { artists: [a, b] }, {}, 5, { ...rules, period: 'all' }, stats).nominees).toEqual([]);
  });
  it('não inventa estatísticas ausentes nem produz NaN com componentes zerados', () => {
    expect(artistYearScores({ a: row() })).toEqual({});
    const scores = artistYearScores({ a: row({ plays: 10, top10Tracks: 0, trackWeeksAtOne: 0 }) });
    expect(scores.a).toEqual({ top: 0, volume: 35, steady: 0 });
    expect(runJury(awardById.get(ARTIST_OF_YEAR)!, [], stats, {})).toBeNull();
  });
  it('preserva cédulas antigas, mas exige atualizar categorias cujos critérios mudaram', () => {
    const ballot = emptyBallot('p', '2026'); ballot.selected = ['best-new-artist'];
    const entry: BallotEntry = { categoryId: 'best-new-artist', nominees: [{ ...a, kind: 'artists', basis: 'Critério antigo' }], winners: ['a'], method: 'vote', updatedAt: 1 };
    ballot.entries[entry.categoryId] = entry;
    expect(ceremonyReadiness(ballot).ready).toEqual([]);
    expect(ceremonyReadiness(ballot).issues[0].reason).toMatch(/critérios/);
    expect(sanitizeBallot(ballot, 'p', '2026').entries[entry.categoryId].winners).toEqual(['a']);
    expect(personalEntryIssue(entry, { artists: [a] }, stats, rules)).toMatch(/preservado/);
    expect(ballotKey('p', '2026')).not.toBe(ballotKey('p', '2024'));
  });
});
