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
    const from = Math.max(start, week.week.start), to = Math.min(end, week.cutoff, week.week.end);
    if (to > from) { covered += to - from; weeks++; }
  }
  return { ratio: Math.min(1, covered / span), weeks };
}

function aggregate(cached: CachedWeek[], kind: Kind, start: number, end: number, source: SourceFilter, deduplicate: boolean) {
  const map = new Map<string, Item>();
  let plays = 0;
  for (const week of cached) {
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
