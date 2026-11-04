import { describe, expect, it } from 'vitest';
import { borda, judges, runJury, sanitizeJury } from './jury';
import { conveneJury, emptyBallot, freezeCeremony, sanitizeBallot, type Nominee } from './ballot';
import { grammyById } from './grammy';
import { AXES, PERSONAS, computeProfile, genreBadge, popularityBadge } from './profile';
import { buildPools } from './pools';
import { makeWeeks } from './calendar';
import { metaKey, type EffectiveMeta } from './metadata';
import { defaults, type CachedWeek } from './types';

const nominee = (name: string, plays: number): Nominee => ({ id: JSON.stringify(['tracks', 'a', name.toLowerCase(), 'd']), kind: 'tracks', name, artist: 'A', album: 'D', image: '', plays, basis: 'teste' });

describe('Júri automático', () => {
  it('Borda divide pontos em empate', () => {
    expect(borda(['a', 'b', 'c'], { a: 5, b: 5, c: 1 }).points).toEqual({ a: 2.5, b: 2.5, c: 1 });
  });
  it('cada jurado vota pelo próprio critério; quem não tem dado se abstém', () => {
    const [x, y] = [nominee('X', 50), nominee('Y', 40)];
    const stats = { tracks: { [x.id]: { plays: 50, weeksActive: 2, weeksAtOne: 0, weeksTop10: 2, firstHalf: 40, secondHalf: 10 }, [y.id]: { plays: 40, weeksActive: 5, weeksAtOne: 3, weeksTop10: 5, firstHalf: 5, secondHalf: 35 } } };
    const result = runJury(grammyById.get('record-of-the-year')!, [x, y], stats, {}, 1)!;
    const vote = (id: string) => result.judges.find(j => j.judge === id)!;
    expect(vote('volume').ranking[0]).toBe(x.id);
    expect(vote('top').ranking[0]).toBe(y.id);
    expect(vote('steady').ranking[0]).toBe(y.id);
    expect(vote('rise').ranking[0]).toBe(y.id);
    expect(vote('time').abstain).toBeTruthy();
    expect(vote('style').abstain).toMatch(/geral/);
    expect(result.winner).toBe(y.id);
    expect(result.judges).toHaveLength(judges.length);
  });
  it('usa duração confirmada e gênero verificado; sem indicados suficientes não decide', () => {
    const [x, y] = [nominee('X', 10), nominee('Y', 10)];
    const record = (n: Nominee, durationMs: number, genre: string): [string, EffectiveMeta] => [metaKey('tracks', n), { key: '', kind: 'tracks', artist: n.artist, name: n.name, album: n.album, status: 'matched', source: 'itunes', fetchedAt: 1, versions: [], reviewed: false, durationMs, genre }];
    const meta = { tracks: new Map([record(x, 300000, 'R&B/Soul'), record(y, 200000, 'Pop')]) };
    const result = runJury(grammyById.get('best-rnb-song')!, [x, y], {}, meta)!;
    expect(result.judges.find(j => j.judge === 'time')!.ranking[0]).toBe(x.id);
    expect(result.judges.find(j => j.judge === 'style')!.ranking[0]).toBe(x.id);
    expect(runJury(grammyById.get('best-rnb-song')!, [x], {}, meta)).toBeNull();
    expect(sanitizeJury({ ...result, winner: 'outro' }, new Set([x.id, y.id]))).toBeUndefined();
  });
  it('convoca o júri, lacra o resultado e preserva tudo ao recarregar', () => {
    const weeks = makeWeeks(defaults, Date.parse('2016-07-15T12:00Z'));
    const cached: CachedWeek[] = weeks.map((week, i) => ({ key: week.id, week, cutoff: week.end, fetchedAt: 1, duplicates: 0, scrobbles: [
      ...Array.from({ length: i ? 3 : 9 }, (_, k) => ({ timestamp: week.start + 10 + k, artist: 'Artista', track: 'Cedo', album: 'Disco', image: '' })),
      ...Array.from({ length: i ? 8 : 1 }, (_, k) => ({ timestamp: week.start + 100 + k, artist: 'Banda', track: 'Tarde', album: 'Outro', image: '' })),
    ] }));
    const { pools, stats } = buildPools(cached, false, undefined, 'all');
    expect(stats.tracks[pools.tracks.find(i => i.name === 'Tarde')!.id]).toMatchObject({ weeksActive: 4, weeksAtOne: 3 });
    const ballot = { ...emptyBallot('p', '2016'), selected: ['record-of-the-year', 'best-new-artist'] };
    const { ballot: decided, decided: n, skipped } = conveneJury(ballot, pools, {}, stats);
    expect(n).toBe(1);
    expect(skipped[0].categoryId).toBe('best-new-artist');
    expect(decided.mode).toBe('jury');
    const round = sanitizeBallot(JSON.parse(JSON.stringify(decided)), 'p', '2016');
    expect(round.entries['record-of-the-year'].jury?.winner).toBe(decided.entries['record-of-the-year'].winners[0]);
    expect(freezeCeremony(round)[0].jury?.judges.length).toBe(judges.length);
  });
});

describe('Perfil musical', () => {
  const weeks = makeWeeks(defaults, Date.parse('2016-12-30T12:00Z'));
  const mk = (i: number, list: Array<[string, string, string, number]>): CachedWeek => ({ key: weeks[i].id, week: weeks[i], cutoff: weeks[i].end, fetchedAt: 1, duplicates: 0,
    scrobbles: list.flatMap(([artist, track, album, n], j) => Array.from({ length: n }, (_, k) => ({ timestamp: weeks[i].start + 3600 * 23 + j * 4000 + k * 240, artist, track, album, image: '' }))) });
  it('tem 16 perfis únicos, um para cada combinação dos 4 eixos', () => {
    const codes = Object.keys(PERSONAS);
    expect(codes).toHaveLength(16);
    expect(new Set(Object.values(PERSONAS).map(p => p.name)).size).toBe(16);
    const combos = ['F', 'X'].flatMap(a => ['N', 'T'].flatMap(b => ['R', 'V'].flatMap(c => ['A', 'S'].map(d => a + b + c + d))));
    expect(codes.sort()).toEqual(combos.sort());
    expect(Object.keys(AXES)).toEqual(['orbit', 'era', 'loop', 'flow']);
  });
  it('fã fiel que repete o álbum novo vira Fã de Primeira Fila; clássicos antigos mudam o eixo', () => {
    const cached = [mk(0, [['Velha', 'Antiga', 'Arquivo', 5]]), mk(4, [['Ídolo', 'Um', 'Disco', 20], ['Ídolo', 'Dois', 'Disco', 20], ['Ídolo', 'Três', 'Disco', 10]])];
    const p = computeProfile(cached, { start: weeks[4].start, end: weeks[4].end, timeZone: 'UTC' });
    expect(p.plays).toBe(50);
    expect(p.code).toBe('FNRA');
    expect(p.badges.map(b => b.id)).toEqual(expect.arrayContaining(['superfan', 'marathon']));
    const old = computeProfile([mk(0, [['Ídolo', 'Um', 'Disco', 1], ['Ídolo', 'Dois', 'Disco', 1], ['Ídolo', 'Três', 'Disco', 1]]), mk(20, [['Ídolo', 'Um', 'Disco', 20], ['Ídolo', 'Dois', 'Disco', 20], ['Ídolo', 'Três', 'Disco', 10]])], { start: weeks[20].start, end: weeks[20].end, timeZone: 'UTC' });
    expect(old.code?.[1]).toBe('T');
  });
  it('poucos dados não viram perfil; fuso muda o relógio; selos de gênero e popularidade exigem cobertura', () => {
    expect(computeProfile([mk(0, [['A', 'B', 'C', 5]])], { start: weeks[0].start, end: weeks[0].end, timeZone: 'UTC' }).insufficient).toBeTruthy();
    const cached = [mk(1, [['A', 'B', 'C', 40]])];
    const utc = computeProfile(cached, { start: weeks[1].start, end: weeks[1].end, timeZone: 'UTC' });
    const sp = computeProfile(cached, { start: weeks[1].start, end: weeks[1].end, timeZone: 'America/Sao_Paulo' });
    expect(utc.hours.indexOf(Math.max(...utc.hours))).not.toBe(sp.hours.indexOf(Math.max(...sp.hours)));
    const meta = new Map<string, EffectiveMeta>([[metaKey('tracks', { artist: 'A', name: 'B', album: 'C' }), { key: '', kind: 'tracks', artist: 'A', name: 'B', album: 'C', status: 'matched', source: 'itunes', fetchedAt: 1, versions: [], reviewed: false, genre: 'R&B/Soul' }]]);
    expect(genreBadge(utc.topTracks, meta, utc.plays)?.label).toBe('Alma R&B');
    expect(genreBadge(utc.topTracks, new Map(), utc.plays)).toBeNull();
    expect(popularityBadge([100, 200_000, 50_000])?.id).toBe('underground');
    expect(popularityBadge([5_000_000, 3_000_000, 9_000_000])?.id).toBe('stadium');
    expect(popularityBadge([1, 2])).toBeNull();
  });
});

describe('Signo musical', () => {
  it('escolhe o artista mais parecido com o seu jeito de ouvir e explica com habilidades', async () => {
    const { musicalSign } = await import('./profile');
    const weeks = makeWeeks(defaults, Date.parse('2016-07-15T12:00Z'));
    const plays = (artist: string, track: string, album: string, n: number, offset: number) => Array.from({ length: n }, (_, k) => ({ timestamp: weeks[1].start + offset + k * 200, artist, track: `${track}${k % 3}`, album, image: '' }));
    const cached: CachedWeek[] = [{ key: weeks[1].id, week: weeks[1], cutoff: weeks[1].end, fetchedAt: 1, duplicates: 0, scrobbles: [...plays('Diva', 'Hit', 'Era', 40, 0), ...plays('Banda', 'Faixa', 'Outro', 12, 40000)] }];
    const profile = computeProfile(cached, { start: weeks[1].start, end: weeks[1].end, timeZone: 'UTC' });
    const sign = musicalSign(profile)!;
    expect(sign.artist).toBe('Diva');
    expect(sign.skills).toHaveLength(6);
    expect(sign.skills.every(s => s.level >= 0 && s.level <= 5)).toBe(true);
    expect(sign.skills.find(s => s.id === 'devotion')!.level).toBe(5);
    expect(sign.reason).toMatch(/Diva/);
    expect(musicalSign({ ...profile, code: null })).toBeNull();
  });
});
