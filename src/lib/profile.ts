import { genreGroupsOf, type GenreGroup } from './grammy';
import { normalize, selectScrobblesForFilter } from './charts';
import { metaKey, type EffectiveMeta } from './metadata';
import type { CachedWeek, SourceFilter } from './types';

/**
 * Perfil musical original do LastChart: 4 eixos medidos nos seus scrobbles (sem pesos secretos),
 * 16 combinações e selos extras. Inspirado em sistemas de “personalidade de audição”, sem copiar nomes.
 */
export const AXES = {
  orbit: { high: 'F', low: 'X', highLabel: 'Fidelidade', lowLabel: 'Exploração', threshold: 0.4, metric: 'Fatia das reproduções vinda dos 5 artistas mais ouvidos' },
  era: { high: 'N', low: 'T', highLabel: 'Novidades', lowLabel: 'Clássicos pessoais', threshold: 0.5, metric: 'Reproduções feitas até 90 dias depois da primeira vez que você ouviu a faixa' },
  loop: { high: 'R', low: 'V', highLabel: 'Repetição', lowLabel: 'Rotação', threshold: 0.3, metric: 'Reproduções que repetem uma faixa já ouvida no mesmo dia' },
  flow: { high: 'A', low: 'S', highLabel: 'Álbum inteiro', lowLabel: 'Faixas soltas', threshold: 0.45, metric: 'Trocas para outra faixa que continuam no mesmo álbum (intervalo de até 20 min)' },
} as const;
export type AxisId = keyof typeof AXES;

export const PERSONAS: Record<string, { name: string; tagline: string }> = {
  FNRA: { name: 'Fã de Primeira Fila', tagline: 'Chega cedo a cada lançamento dos favoritos, ouve o álbum inteiro e aperta o replay.' },
  FNRS: { name: 'Hitmaker do Próprio Fone', tagline: 'Pega o single novo dos seus artistas e transforma em hino pessoal.' },
  FNVA: { name: 'Colecionador de Eras', tagline: 'Cada era nova dos favoritos merece ser ouvida de ponta a ponta.' },
  FNVS: { name: 'Radar dos Favoritos', tagline: 'Acompanha toda faixa nova de quem você ama, sem ficar preso a uma só.' },
  FTRA: { name: 'Guardião do Clássico', tagline: 'Volta aos discos que marcaram a sua história, de novo e de novo.' },
  FTRS: { name: 'Coração em Loop', tagline: 'As mesmas faixas queridas, repetidas com carinho.' },
  FTVA: { name: 'Arquivista Afetivo', tagline: 'Revisita discografias conhecidas por inteiro, como quem relê um livro.' },
  FTVS: { name: 'Memória Viva', tagline: 'Passeia pelas faixas antigas dos artistas de sempre.' },
  XNRA: { name: 'Caçador de Estreias', tagline: 'Descobre álbuns novos e mergulha neles até decorar.' },
  XNRS: { name: 'Detector de Hits', tagline: 'Encontra a faixa nova antes de todo mundo e não larga mais.' },
  XNVA: { name: 'Explorador de Discos', tagline: 'Um álbum novo atrás do outro, de artistas bem diferentes.' },
  XNVS: { name: 'Curador Nômade', tagline: 'Sua playlist é um mapa de descobertas sempre em movimento.' },
  XTRA: { name: 'Viajante do Tempo', tagline: 'Muitos artistas, discos de outras épocas no repeat.' },
  XTRS: { name: 'Jukebox Humana', tagline: 'Variedade enorme de artistas e hinos que voltam sempre.' },
  XTVA: { name: 'Enciclopédia Musical', tagline: 'Percorre catálogos amplos e antigos por inteiro.' },
  XTVS: { name: 'DJ de Memórias', tagline: 'Mistura sem medo um acervo enorme de faixas conhecidas.' },
};

export interface Badge { id: string; label: string; detail: string }
export interface ProfileResult {
  plays: number; tracks: number; artists: number; albums: number; days: number; activeDays: number;
  axes: Record<AxisId, number>; code: string | null; badges: Badge[]; hours: number[]; weekendShare: number;
  topArtists: Array<{ name: string; plays: number }>; topTracks: Array<{ artist: string; name: string; album: string; plays: number }>;
  streak: { artist: string; count: number }; insufficient?: string;
  artistStats: ArtistStat[];
}
/** Como você ouve cada um dos artistas mais tocados no período (base do signo musical). */
export interface ArtistStat { name: string; plays: number; share: number; days: number; streak: number; replay: number; flow: number; novelty: number; yearsKnown: number; daypart: 'madrugada' | 'manhã' | 'tarde' | 'noite' }
const NINETY_DAYS = 90 * 86400;
const pct = (v: number) => `${Math.round(v * 100)}%`;

/** Divide o tempo em blocos de 30 min para converter fuso (inclusive horário de verão e fusos de :30) uma vez por bloco. */
function localClock(timeZone: string) {
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', hour: '2-digit', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit' });
  const cache = new Map<number, { hour: number; weekend: boolean; day: string }>();
  return (ts: number) => {
    const bucket = Math.floor(ts / 1800);
    let hit = cache.get(bucket);
    if (!hit) {
      const parts = Object.fromEntries(fmt.formatToParts(new Date(bucket * 1800 * 1000)).map(p => [p.type, p.value]));
      hit = { hour: Number(parts.hour) % 24, weekend: parts.weekday === 'Sat' || parts.weekday === 'Sun', day: `${parts.year}-${parts.month}-${parts.day}` };
      cache.set(bucket, hit);
    }
    return hit;
  };
}

export function computeProfile(cached: CachedWeek[], options: { start: number; end: number; timeZone: string; deduplicate?: boolean; source?: SourceFilter }): ProfileResult {
  const source = options.source ?? 'all';
  const firstHeard = new Map<string, number>();
  const inRange: Array<{ ts: number; artist: string; track: string; album: string; key: string }> = [];
  for (const week of cached) {
    for (const s of selectScrobblesForFilter(week.scrobbles, options.deduplicate, source, week.week.start, week.week.end)) {
      const key = `${normalize(s.artist)}\u0000${normalize(s.track)}`;
      const seen = firstHeard.get(key);
      if (seen === undefined || s.timestamp < seen) firstHeard.set(key, s.timestamp);
      if (s.timestamp >= options.start && s.timestamp < options.end) inRange.push({ ts: s.timestamp, artist: s.artist, track: s.track, album: s.album, key });
    }
  }
  inRange.sort((a, b) => a.ts - b.ts);
  const days = Math.max(1, Math.ceil((options.end - options.start) / 86400));
  const empty: ProfileResult = { plays: inRange.length, tracks: 0, artists: 0, albums: 0, days, activeDays: 0, axes: { orbit: 0, era: 0, loop: 0, flow: 0 }, code: null, badges: [], hours: Array(24).fill(0), weekendShare: 0, topArtists: [], topTracks: [], streak: { artist: '', count: 0 }, artistStats: [] };
  const artistFirst = new Map<string, number>();
  for (const [key, ts] of firstHeard) { const a = key.split('\u0000')[0]; const seen = artistFirst.get(a); if (seen === undefined || ts < seen) artistFirst.set(a, ts); }
  if (inRange.length < 30) return { ...empty, insufficient: 'São necessárias pelo menos 30 reproduções baixadas no período para calcular o perfil.' };
  const clock = localClock(options.timeZone);
  const artists = new Map<string, { name: string; plays: number }>(), tracks = new Map<string, { artist: string; name: string; album: string; plays: number }>(), albums = new Set<string>(), daySeen = new Set<string>(), sameDay = new Set<string>();
  const hours = Array(24).fill(0);
  let novel = 0, repeats = 0, flowPairs = 0, flowSame = 0, weekend = 0, streak = { artist: '', count: 0 }, run = { artist: '', count: 0 };
  const per = new Map<string, { days: Set<string>; repeats: number; pairs: number; same: number; novel: number; parts: number[]; streak: number }>();
  inRange.forEach((s, i) => {
    const a = normalize(s.artist);
    const ar = artists.get(a) ?? { name: s.artist, plays: 0 }; ar.plays++; artists.set(a, ar);
    const tr = tracks.get(s.key) ?? { artist: s.artist, name: s.track, album: s.album, plays: 0 }; tr.plays++; tracks.set(s.key, tr);
    if (s.album) albums.add(`${a}\u0000${normalize(s.album)}`);
    const isNovel = s.ts - (firstHeard.get(s.key) ?? s.ts) < NINETY_DAYS;
    if (isNovel) novel++;
    const local = clock(s.ts);
    const pa = per.get(a) ?? { days: new Set<string>(), repeats: 0, pairs: 0, same: 0, novel: 0, parts: [0, 0, 0, 0], streak: 0 };
    pa.days.add(local.day); if (isNovel) pa.novel++; pa.parts[local.hour < 5 ? 0 : local.hour < 12 ? 1 : local.hour < 18 ? 2 : 3]++; per.set(a, pa);
    hours[local.hour]++; if (local.weekend) weekend++; daySeen.add(local.day);
    const dayKey = `${local.day}\u0000${s.key}`; if (sameDay.has(dayKey)) { repeats++; pa.repeats++; } else sameDay.add(dayKey);
    const prev = inRange[i - 1];
    // Só trocas entre faixas diferentes: repetir a mesma faixa não conta como “ouvir o álbum”.
    if (prev && s.ts - prev.ts <= 1200 && prev.key !== s.key) {
      flowPairs++;
      const same = !!s.album && !!prev.album && normalize(s.album) === normalize(prev.album) && normalize(prev.artist) === a;
      if (same) flowSame++;
      if (normalize(prev.artist) === a) { pa.pairs++; if (same) pa.same++; }
    }
    run = run.artist === a ? { artist: a, count: run.count + 1 } : { artist: a, count: 1 };
    if (run.count > pa.streak) pa.streak = run.count;
    if (run.count > streak.count) streak = { artist: s.artist, count: run.count };
  });
  const plays = inRange.length;
  const topArtists = [...artists.values()].sort((x, y) => y.plays - x.plays);
  const axes = {
    orbit: topArtists.slice(0, 5).reduce((n, x) => n + x.plays, 0) / plays,
    era: novel / plays,
    loop: repeats / plays,
    flow: flowPairs ? flowSame / flowPairs : 0,
  };
  const code = (Object.keys(AXES) as AxisId[]).map(id => axes[id] >= AXES[id].threshold ? AXES[id].high : AXES[id].low).join('');
  const share = (from: number, to: number) => hours.slice(from, to).reduce((n, v) => n + v, 0) / plays;
  const badges: Badge[] = [];
  const add = (cond: boolean, id: string, label: string, detail: string) => { if (cond) badges.push({ id, label, detail }); };
  add(share(0, 5) >= 0.22, 'owl', 'Coruja da madrugada', `${pct(share(0, 5))} das reproduções entre 00h e 05h.`);
  add(share(5, 9) >= 0.2, 'dawn', 'Madrugador', `${pct(share(5, 9))} das reproduções entre 05h e 09h.`);
  add(share(9, 18) >= 0.55, 'work', 'Trilha do expediente', `${pct(share(9, 18))} das reproduções entre 09h e 18h.`);
  add(share(18, 24) >= 0.45, 'night', 'Noites de som', `${pct(share(18, 24))} das reproduções entre 18h e 24h.`);
  add(weekend / plays >= 0.4, 'weekend', 'Fim de semana sonoro', `${pct(weekend / plays)} das reproduções no sábado e domingo.`);
  const activeShare = daySeen.size / days, perDay = plays / Math.max(1, daySeen.size);
  add(perDay >= 80, 'nonstop', 'Trilha contínua', `${Math.round(perDay)} reproduções por dia ativo.`);
  add(days >= 7 && activeShare >= 0.85, 'daily', 'Companhia diária', `Música em ${daySeen.size} de ${days} dias.`);
  add(days >= 14 && activeShare < 0.35, 'occasional', 'Ouvinte de ocasião', `Música em ${daySeen.size} de ${days} dias.`);
  add(streak.count >= 25, 'marathon', `Maratonista de ${streak.artist}`, `${streak.count} reproduções seguidas do mesmo artista.`);
  add(topArtists[0] && topArtists[0].plays / plays >= 0.25, 'superfan', `Fã nº 1 de ${topArtists[0]?.name}`, `${pct((topArtists[0]?.plays ?? 0) / plays)} de todas as reproduções.`);
  add(artists.size / plays >= 0.25, 'palette', 'Paleta ampla', `${artists.size} artistas diferentes em ${plays} reproduções.`);
  add(axes.era >= 0.7, 'radar', 'Radar ligado', `${pct(axes.era)} das reproduções foram de faixas recém-descobertas.`);
  return {
    plays, tracks: tracks.size, artists: artists.size, albums: albums.size, days, activeDays: daySeen.size, axes, code, badges, hours, weekendShare: weekend / plays,
    topArtists: topArtists.slice(0, 8).map(({ name, plays }) => ({ name, plays })),
    topTracks: [...tracks.values()].sort((x, y) => y.plays - x.plays).slice(0, 300), streak,
    artistStats: topArtists.slice(0, 12).map(({ name, plays: n }) => {
      const k = normalize(name), d = per.get(k)!;
      const parts = ['madrugada', 'manhã', 'tarde', 'noite'] as const;
      return { name, plays: n, share: n / plays, days: d.days.size, streak: d.streak, replay: d.repeats / n, flow: d.pairs ? d.same / d.pairs : 0, novelty: d.novel / n,
        yearsKnown: Math.max(0, (options.end - (artistFirst.get(k) ?? options.end)) / (365.25 * 86400)), daypart: parts[d.parts.indexOf(Math.max(...d.parts))] };
    }),
  };
}

const genreNames: Partial<Record<GenreGroup, string>> = { pop: 'Pop', 'asian-pop': 'Pop asiático', dance: 'Dance', rock: 'Rock', metal: 'Metal', alternative: 'Alternativo', rnb: 'R&B', rap: 'Rap', jazz: 'Jazz', country: 'Country', latin: 'Latino', urbano: 'Urbano', reggae: 'Reggae', classical: 'Clássico', soundtrack: 'Trilhas', folk: 'Folk', gospel: 'Gospel', christian: 'Cristã', african: 'Africana', 'new-age': 'Ambient' };
/** Selo de gênero só com cobertura suficiente de gêneros verificados. */
export function genreBadge(topTracks: ProfileResult['topTracks'], meta: Map<string, EffectiveMeta>, plays: number): Badge | null {
  const counts = new Map<GenreGroup, number>(); let covered = 0;
  for (const t of topTracks) {
    const g = meta.get(metaKey('tracks', { artist: t.artist, name: t.name, album: t.album }))?.genre;
    if (!g) continue;
    covered += t.plays;
    for (const group of genreGroupsOf(g)) counts.set(group, (counts.get(group) ?? 0) + t.plays);
  }
  if (!plays || covered / plays < 0.3) return null;
  const [group, n] = [...counts].sort((a, b) => b[1] - a[1])[0] ?? [];
  if (!group || n / covered < 0.35 || !genreNames[group]) return null;
  return { id: 'genre', label: `Alma ${genreNames[group]}`, detail: `${pct(n / covered)} das reproduções com gênero verificado (cobertura ${pct(covered / plays)}).` };
}
/** Popularidade global (ouvintes no Last.fm) dos artistas mais ouvidos; inspira-se em medidas de “obscuridade”. */
export function popularityBadge(listeners: number[]): Badge | null {
  const valid = listeners.filter(n => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
  if (valid.length < 3) return null;
  const median = valid[Math.floor(valid.length / 2)];
  const text = `Mediana de ${median.toLocaleString('pt-BR')} ouvintes no Last.fm entre seus ${valid.length} artistas mais ouvidos.`;
  if (median < 250_000) return { id: 'underground', label: 'Garimpeiro underground', detail: text };
  if (median < 1_500_000) return { id: 'between', label: 'Entre nichos e hits', detail: text };
  return { id: 'stadium', label: 'Pop de estádio', detail: text };
}

export interface Skill { id: string; name: string; level: number; detail: string }
export interface MusicalSign { artist: string; skills: Skill[]; reason: string; match: number }
const level = (value: number, steps: number[]) => steps.filter(t => value >= t).length;
/**
 * Signo musical: entre os 12 artistas mais ouvidos no período, o que você ouve de um jeito mais parecido
 * com o seu perfil geral (novidade, repetição, álbum) pesado pela fatia de reproduções. Tudo vem dos scrobbles.
 */
export function musicalSign(profile: ProfileResult): MusicalSign | null {
  if (!profile.code || !profile.artistStats.length) return null;
  const maxShare = Math.max(...profile.artistStats.map(a => a.share));
  const ranked = profile.artistStats.filter(a => a.plays >= 5).map(a => {
    const similarity = 1 - (Math.abs(a.novelty - profile.axes.era) + Math.abs(a.replay - profile.axes.loop) + Math.abs(a.flow - profile.axes.flow)) / 3;
    return { a, similarity, score: 0.55 * (a.share / maxShare) + 0.45 * similarity };
  }).sort((x, y) => y.score - x.score || y.a.plays - x.a.plays);
  const best = ranked[0];
  if (!best) return null;
  const a = best.a;
  const memory = a.novelty >= 0.5
    ? { id: 'discovery', name: 'Descoberta', level: level(a.novelty, [0.5, 0.6, 0.7, 0.8, 0.9]), detail: `${pct(a.novelty)} das reproduções foram de faixas que você conheceu há menos de 90 dias.` }
    : { id: 'history', name: 'História', level: level(a.yearsKnown, [0.5, 1, 2, 4, 7]), detail: `Você ouve ${a.name} há ${a.yearsKnown < 1 ? `${Math.max(1, Math.round(a.yearsKnown * 12))} meses` : `${a.yearsKnown.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} anos`} no histórico baixado.` };
  const skills: Skill[] = [
    { id: 'devotion', name: 'Devoção', level: level(a.share, [0.02, 0.05, 0.1, 0.2, 0.35]), detail: `${pct(a.share)} de todas as suas reproduções no período.` },
    { id: 'constancy', name: 'Constância', level: level(a.days / Math.max(1, profile.activeDays), [0.1, 0.25, 0.45, 0.65, 0.85]), detail: `Presente em ${a.days} de ${profile.activeDays} dias com música.` },
    { id: 'marathon', name: 'Maratona', level: level(a.streak, [3, 6, 12, 25, 50]), detail: `Sequência máxima de ${a.streak} reproduções seguidas.` },
    { id: 'replay', name: 'Replay', level: level(a.replay, [0.1, 0.2, 0.3, 0.45, 0.6]), detail: `${pct(a.replay)} das reproduções repetiram uma faixa no mesmo dia.` },
    { id: 'album', name: 'Álbum', level: level(a.flow, [0.1, 0.25, 0.4, 0.6, 0.8]), detail: `${pct(a.flow)} das trocas de faixa seguiram no mesmo álbum.` },
    memory,
  ];
  const top = [...skills].sort((x, y) => y.level - x.level).slice(0, 2).filter(x => x.level > 0);
  const traits = top.map(x => x.name.toLowerCase()).join(' e ');
  const reason = `Você ouve ${a.name} do mesmo jeito que ouve música em geral (${pct(best.similarity)} de semelhança com o seu perfil)${traits ? `, com destaque para ${traits}` : ''}. O horário favorito é de ${a.daypart}.`;
  return { artist: a.name, skills, reason, match: best.similarity };
}
