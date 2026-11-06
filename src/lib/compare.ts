import { itemOf, selectScrobblesForFilter } from './charts';
import type { CachedWeek, Item, Kind, SourceFilter } from './types';

export interface SideSummary { name: string; plays: number; items: number; coverage: number; coveredWeeks: number; totalWeeks: number; ranked: Item[] }
export interface SharedItem { id: string; name: string; artist: string; image: string; playsA: number; playsB: number; rankA: number; rankB: number }
export interface ProfileComparison { a: SideSummary; b: SideSummary; shared: SharedItem[]; onlyA: Item[]; onlyB: Item[]; overlap: number | null; start: number; end: number; kind: Kind }

/**
 * Cobertura = fração do intervalo civil pedido coberta por semanas realmente baixadas daquele perfil.
 * Semana não baixada não vira zero: reduz a cobertura e aparece na interface.
 */
export function coverage(cached: CachedWeek[], start: number, end: number) {
  const span = Math.max(1, end - start);
  let covered = 0, weeks = 0;
  for (const week of cached) {
    if (week.week.end > Date.now() / 1000) continue;
    const from = Math.max(start, week.week.start), to = Math.min(end, week.cutoff, week.week.end);
    if (to > from) { covered += to - from; weeks++; }
  }
  return { ratio: Math.min(1, covered / span), weeks };
}

function aggregate(cached: CachedWeek[], kind: Kind, start: number, end: number, source: SourceFilter, deduplicate: boolean) {
  const map = new Map<string, Item>();
  let plays = 0;
  for (const week of cached) {
    if (week.week.end > Date.now() / 1000) continue;
    if (week.week.end <= start || week.week.start >= end) continue;
    for (const s of selectScrobblesForFilter(week.scrobbles, deduplicate, source, start, end)) {
      // Sem aliases: a identidade é a mesma para os dois perfis (artista + título + álbum normalizados).
      const base = itemOf(s, kind);
      if (!base) continue;
      plays++;
      const hit = map.get(base.id);
      if (hit) { hit.plays++; if (!hit.image && base.image) hit.image = base.image; } else map.set(base.id, { ...base, plays: 1 });
    }
  }
  const ranked = [...map.values()].sort((x, y) => y.plays - x.plays || x.name.localeCompare(y.name) || x.id.localeCompare(y.id));
  return { plays, ranked };
}

export function compareProfiles(
  a: { name: string; cached: CachedWeek[] }, b: { name: string; cached: CachedWeek[] },
  options: { kind: Kind; start: number; end: number; source?: SourceFilter; deduplicate?: boolean; totalWeeks: number; limit?: number },
): ProfileComparison {
  const source = options.source ?? 'all', dedupe = options.deduplicate ?? false, limit = options.limit ?? 30;
  const left = aggregate(a.cached, options.kind, options.start, options.end, source, dedupe);
  const right = aggregate(b.cached, options.kind, options.start, options.end, source, dedupe);
  const rankA = new Map(left.ranked.map((item, i) => [item.id, i + 1])), rankB = new Map(right.ranked.map((item, i) => [item.id, i + 1]));
  const byB = new Map(right.ranked.map(item => [item.id, item]));
  const shared: SharedItem[] = left.ranked.filter(item => byB.has(item.id)).map(item => ({ id: item.id, name: item.name, artist: item.artist, image: item.image || byB.get(item.id)!.image, playsA: item.plays, playsB: byB.get(item.id)!.plays, rankA: rankA.get(item.id)!, rankB: rankB.get(item.id)! }))
    .sort((x, y) => (x.rankA + x.rankB) - (y.rankA + y.rankB) || x.name.localeCompare(y.name));
  // Sobreposição de gosto: soma, item a item, da menor fatia de reproduções entre os dois perfis (0–100%).
  const overlap = left.plays && right.plays ? shared.reduce((sum, item) => sum + Math.min(item.playsA / left.plays, item.playsB / right.plays), 0) * 100 : null;
  const side = (name: string, data: typeof left, cached: CachedWeek[]): SideSummary => {
    const cov = coverage(cached, options.start, options.end);
    return { name, plays: data.plays, items: data.ranked.length, coverage: cov.ratio, coveredWeeks: cov.weeks, totalWeeks: options.totalWeeks, ranked: data.ranked.slice(0, limit) };
  };
  return {
    a: side(a.name, left, a.cached), b: side(b.name, right, b.cached), shared: shared.slice(0, limit),
    onlyA: left.ranked.filter(item => !byB.has(item.id)).slice(0, limit), onlyB: right.ranked.filter(item => !rankA.has(item.id)).slice(0, limit),
    overlap, start: options.start, end: options.end, kind: options.kind,
  };
}

export const sameProfile = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export interface GroupMember { name: string; cached: CachedWeek[] }
export interface GroupResult {
  members: Array<{ name: string; plays: number; items: number; coverage: number; eclectic: number }>;
  matrix: Array<Array<number | null>>;
  chart: Array<{ id: string; name: string; artist: string; image: string; score: number; listeners: string[] }>;
  sharedAll: Array<{ id: string; name: string; artist: string; image: string }>;
  trendsetters: Array<{ name: string; firsts: number }>;
  closest: { a: string; b: string; overlap: number } | null;
}
/**
 * Comparação em grupo (até 5 perfis): afinidade par a par, parada do grupo (soma das fatias, para quem ouve
 * muito não dominar), itens em comum a todos e “quem ouviu primeiro” entre os itens compartilhados.
 */
export function compareGroup(members: GroupMember[], options: { kind: Kind; start: number; end: number; source?: SourceFilter; deduplicate?: boolean }): GroupResult {
  const list = members.slice(0, 5);
  const source = options.source ?? 'all', dedupe = options.deduplicate ?? false;
  const data = list.map(m => {
    const agg = aggregate(m.cached, options.kind, options.start, options.end, source, dedupe);
    const first = new Map<string, number>();
    for (const week of m.cached.filter(w => w.week.end <= Date.now() / 1000)) for (const s of selectScrobblesForFilter(week.scrobbles, dedupe, source, week.week.start, week.week.end)) {
      const base = itemOf(s, options.kind); if (!base) continue;
      const seen = first.get(base.id); if (seen === undefined || s.timestamp < seen) first.set(base.id, s.timestamp);
    }
    const artists = new Set(agg.ranked.map(i => i.artist.toLowerCase()));
    return { m, agg, first, byId: new Map(agg.ranked.map(i => [i.id, i])), eclectic: agg.plays ? artists.size / agg.plays * 100 : 0 };
  });
  const overlap = (x: typeof data[number], y: typeof data[number]) => {
    if (!x.agg.plays || !y.agg.plays) return null;
    let sum = 0; for (const [id, item] of x.byId) { const o = y.byId.get(id); if (o) sum += Math.min(item.plays / x.agg.plays, o.plays / y.agg.plays); }
    return sum * 100;
  };
  const matrix = data.map((x, i) => data.map((y, j) => i === j ? 100 : overlap(x, y)));
  let closest: GroupResult['closest'] = null;
  for (let i = 0; i < data.length; i++) for (let j = i + 1; j < data.length; j++) { const v = matrix[i][j]; if (v !== null && (!closest || v > closest.overlap)) closest = { a: list[i].name, b: list[j].name, overlap: v }; }
  const scores = new Map<string, { item: Item; score: number; listeners: string[] }>();
  for (const d of data) for (const item of d.agg.ranked) {
    const share = d.agg.plays ? item.plays / d.agg.plays : 0, row = scores.get(item.id) ?? { item, score: 0, listeners: [] };
    row.score += share; row.listeners.push(d.m.name); if (!row.item.image && item.image) row.item = { ...row.item, image: item.image }; scores.set(item.id, row);
  }
  const chart = [...scores.values()].sort((a, b) => b.listeners.length - a.listeners.length || b.score - a.score).filter(r => r.listeners.length >= Math.min(2, data.length)).slice(0, 10)
    .map(r => ({ id: r.item.id, name: r.item.name, artist: r.item.artist, image: r.item.image, score: r.score / data.length * 100, listeners: r.listeners }));
  const sharedAll = [...scores.values()].filter(r => r.listeners.length === data.length && data.length > 1).sort((a, b) => b.score - a.score).slice(0, 12).map(r => ({ id: r.item.id, name: r.item.name, artist: r.item.artist, image: r.item.image }));
  const firsts = new Map(list.map(m => [m.name, 0]));
  for (const r of scores.values()) {
    if (r.listeners.length < 2) continue;
    const order = data.filter(d => d.byId.has(r.item.id)).map(d => ({ name: d.m.name, t: d.first.get(r.item.id) ?? Infinity })).sort((a, b) => a.t - b.t);
    if (order[0] && order[0].t < (order[1]?.t ?? Infinity)) firsts.set(order[0].name, (firsts.get(order[0].name) ?? 0) + 1);
  }
  return {
    members: data.map(d => ({ name: d.m.name, plays: d.agg.plays, items: d.agg.ranked.length, coverage: coverage(d.m.cached, options.start, options.end).ratio, eclectic: d.eclectic })),
    matrix, chart, sharedAll, trendsetters: [...firsts].map(([name, n]) => ({ name, firsts: n })).sort((a, b) => b.firsts - a.firsts), closest,
  };
}
