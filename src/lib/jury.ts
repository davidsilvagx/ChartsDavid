import { ARTIST_OF_YEAR, genreGroupsOf, type GrammyCategory } from './grammy';
import { metaKey, type EffectiveMeta } from './metadata';
import type { Nominee } from './ballot';
import type { Kind } from './types';

/** Estatísticas do período por item, calculadas no Worker a partir das semanas baixadas. */
export interface ItemStats {
  plays: number; weeksActive: number; weeksAtOne: number; weeksTop10: number; firstHalf: number; secondHalf: number;
  artistId?: string;
  top10Tracks?: number;
  trackWeeksAtOne?: number;
  chartDebut?: { week: string; start: number; year: number; missingBefore: number; provisional: boolean };
}
export interface JudgeVote { judge: string; ranking: string[]; points: Record<string, number>; scores: Record<string, number>; abstain?: string; name?: string; criterion?: string }
export interface JuryResult { judges: JudgeVote[]; totals: Record<string, number>; winner: string; decidedAt: number; algorithm?: 'artist-year' }

export const artistYearFormula = '45% músicas diferentes no Top 10 + 35% reproduções + 20% semanas com música em #1, somente no ano escolhido. Cada componente é dividido pelo maior valor do ano.';
export function artistYearScores(stats: Record<string, ItemStats>) {
  const rows = Object.entries(stats).filter(([, row]) => row.plays > 0 && row.top10Tracks !== undefined && row.trackWeeksAtOne !== undefined);
  const max = rows.reduce((max, [, row]) => ({ top: Math.max(max.top, row.top10Tracks!), volume: Math.max(max.volume, row.plays), steady: Math.max(max.steady, row.trackWeeksAtOne!) }), { top: 0, volume: 0, steady: 0 });
  return Object.fromEntries(rows.map(([id, row]) => [id, {
    top: max.top ? 45 * row.top10Tracks! / max.top : 0,
    volume: max.volume ? 35 * row.plays / max.volume : 0,
    steady: max.steady ? 20 * row.trackWeeksAtOne! / max.steady : 0,
  }]));
}

/** Jurados virtuais: cada um olha um aspecto do SEU histórico. Nenhum avalia qualidade artística. */
export const judges = [
  { id: 'volume', name: 'Jurada do Volume', criterion: 'Mais reproduções no período.' },
  { id: 'time', name: 'Jurado do Tempo', criterion: 'Mais tempo estimado ouvindo (duração catalogada × plays). Só músicas com duração confirmada.' },
  { id: 'top', name: 'Jurada do Topo', criterion: 'Desempenho no chart semanal do período: 3 pontos por semana em #1 e 1 por semana no Top 10.' },
  { id: 'steady', name: 'Jurado da Constância', criterion: 'Em quantas semanas do período o item foi ouvido.' },
  { id: 'rise', name: 'Jurada da Ascensão', criterion: 'Crescimento: reproduções na segunda metade do período menos na primeira.' },
  { id: 'style', name: 'Jurado do Estilo', criterion: 'Afinidade com o gênero da categoria, pelo gênero verificado no catálogo. Abstém-se nas categorias gerais.' },
] as const;
export type JudgeId = typeof judges[number]['id'];

type Scorer = (nominee: Nominee) => number | null;

/** Contagem Borda: n pontos ao 1º, n−1 ao 2º…; empates dividem os pontos das posições ocupadas. */
export function borda(ids: string[], scores: Record<string, number>) {
  const ordered = [...ids].sort((a, b) => scores[b] - scores[a]);
  const points: Record<string, number> = {};
  let i = 0;
  while (i < ordered.length) {
    let j = i;
    while (j + 1 < ordered.length && scores[ordered[j + 1]] === scores[ordered[i]]) j++;
    const share = Array.from({ length: j - i + 1 }, (_, k) => ordered.length - (i + k)).reduce((a, b) => a + b, 0) / (j - i + 1);
    for (let k = i; k <= j; k++) points[ordered[k]] = share;
    i = j + 1;
  }
  return { ordered, points };
}

export function runJury(category: GrammyCategory, nominees: Nominee[], stats: Partial<Record<Kind, Record<string, ItemStats>>>, meta: Partial<Record<Kind, Map<string, EffectiveMeta>>>, now = Date.now()): JuryResult | null {
  const pool = nominees.filter(n => n.kind !== 'manual');
  if (pool.length < 2) return null;
  const kind = pool[0].kind as Kind;
  const st = (n: Nominee) => stats[kind]?.[n.id];
  if (category.id === ARTIST_OF_YEAR) {
    if (pool.some(n => n.kind !== 'artists')) return null;
    const scores = artistYearScores(stats.artists ?? {}), ids = pool.map(n => n.id);
    if (ids.some(id => !scores[id])) return null;
    const criteria = [
      { judge: 'top', name: 'Jurada da Presença', criterion: '45% · músicas diferentes no Top 10 do ano.' },
      { judge: 'volume', name: 'Jurada do Volume', criterion: '35% · reproduções do artista no ano.' },
      { judge: 'steady', name: 'Jurado do Domínio', criterion: '20% · semanas com uma música em #1 no ano.' },
    ] as const;
    const votes: JudgeVote[] = criteria.map(c => { const values = Object.fromEntries(ids.map(id => [id, scores[id][c.judge]])); return { ...c, scores: values, points: values, ranking: [...ids].sort((a, b) => values[b] - values[a] || a.localeCompare(b)) }; });
    const totals = Object.fromEntries(ids.map(id => [id, scores[id].top + scores[id].volume + scores[id].steady]));
    const winner = [...pool].sort((a, b) => totals[b.id] - totals[a.id] || (st(b)?.plays ?? 0) - (st(a)?.plays ?? 0) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id))[0].id;
    return { judges: votes, totals, winner, decidedAt: now, algorithm: 'artist-year' };
  }
  const scorers: Record<JudgeId, Scorer> = {
    volume: n => st(n)?.plays ?? n.plays ?? null,
    time: n => { if (kind !== 'tracks') return null; const d = meta.tracks?.get(metaKey('tracks', n)); return d?.durationMs && d.status === 'matched' && !d.durationConflict ? d.durationMs * (st(n)?.plays ?? n.plays ?? 0) : null; },
    top: n => { const s = st(n); return s ? s.weeksAtOne * 3 + s.weeksTop10 : null; },
    steady: n => st(n)?.weeksActive ?? null,
    rise: n => { const s = st(n); return s ? s.secondHalf - s.firstHalf : null; },
    style: n => { if (category.id === 'record-of-the-year') { const id = st(n)?.artistId; return id ? stats.artists?.[id]?.plays ?? null : null; } if (!category.genre) return null; const g = meta[kind]?.get(metaKey(kind, n))?.genre; return g === undefined ? null : genreGroupsOf(g).includes(category.genre) ? 1 : 0; },
  };
  const ids = pool.map(n => n.id);
  const votes: JudgeVote[] = judges.map(({ id }) => {
    const raw = Object.fromEntries(pool.map(n => [n.id, scorers[id](n)]));
    const known = ids.filter(x => raw[x] !== null);
    // Um jurado só vota se tiver dado para todos os indicados; senão se abstém (sem chutar valores).
    if (known.length < ids.length) return { judge: id, ranking: [], points: {}, scores: {}, abstain: id === 'time' && kind !== 'tracks' ? 'Só avalia músicas.' : id === 'style' && !category.genre && category.id !== 'record-of-the-year' ? 'Categoria geral, sem gênero.' : 'Faltam dados de algum indicado.' };
    const scores = raw as Record<string, number>;
    if (new Set(Object.values(scores)).size === 1) return { judge: id, ranking: ids, points: {}, scores, abstain: 'Todos empatados neste critério.' };
    const { ordered, points } = borda(ids, scores);
    return { judge: id, ranking: ordered, points, scores };
  });
  if (category.id === 'record-of-the-year') { const affinity = votes.find(v => v.judge === 'style')!; affinity.name = 'Jurado da Afinidade'; affinity.criterion = 'Afinidade com o artista: reproduções dele no ano escolhido, sem usar gênero ou fama externa.'; }
  const active = votes.filter(v => !v.abstain);
  if (!active.length) return null;
  const totals = Object.fromEntries(ids.map(x => [x, active.reduce((sum, v) => sum + (v.points[x] ?? 0), 0)]));
  const plays = (x: string) => st(pool.find(n => n.id === x)!)?.plays ?? pool.find(n => n.id === x)!.plays ?? 0;
  // Desempate declarado: mais reproduções; depois ordem alfabética.
  const winner = [...ids].sort((a, b) => totals[b] - totals[a] || plays(b) - plays(a) || pool.find(n => n.id === a)!.name.localeCompare(pool.find(n => n.id === b)!.name))[0];
  return { judges: votes, totals, winner, decidedAt: now };
}

export function sanitizeJury(raw: unknown, nomineeIds: Set<string>): JuryResult | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const value = raw as Partial<JuryResult>;
  if (typeof value.winner !== 'string' || !nomineeIds.has(value.winner) || !Array.isArray(value.judges)) return undefined;
  const known = new Set<string>(judges.map(j => j.id));
  const clean = (rec: unknown) => Object.fromEntries(Object.entries(rec && typeof rec === 'object' ? rec : {}).filter(([k, v]) => nomineeIds.has(k) && Number.isFinite(v)));
  return {
    winner: value.winner, decidedAt: Number(value.decidedAt) || Date.now(), totals: clean(value.totals), ...(value.algorithm === 'artist-year' ? { algorithm: value.algorithm } : {}),
    judges: value.judges.filter(v => v && known.has(v.judge)).map(v => ({ judge: v.judge, ranking: (Array.isArray(v.ranking) ? v.ranking : []).filter(id => nomineeIds.has(id)), points: clean(v.points), scores: clean(v.scores), abstain: typeof v.abstain === 'string' ? v.abstain.slice(0, 120) : undefined, ...(typeof v.name === 'string' ? { name: v.name.slice(0, 100) } : {}), ...(typeof v.criterion === 'string' ? { criterion: v.criterion.slice(0, 400) } : {}) })),
  };
}
