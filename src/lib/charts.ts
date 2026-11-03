import type { AliasRule, CachedWeek, ChartEntry, ChartWeek, Item, Kind, Scrobble, Week } from './types';

export const normalize = (s: string) => s.normalize('NFC').trim().toLowerCase();
export const scrobbleKey = (s: Scrobble) => JSON.stringify([s.timestamp, normalize(s.artist), normalize(s.track), normalize(s.album)]);

function applyAliases(s: Scrobble, kind: Kind, aliases?: AliasRule[]): Scrobble {
  if (!aliases?.length) return s;
  let { artist, track, album } = s;
  for (const rule of aliases) {
    if (rule.kind === 'artists' && normalize(artist) === normalize(rule.from)) {
      artist = rule.to.trim() || artist;
    } else if (
      rule.kind === 'tracks' &&
      kind === 'tracks' &&
      (!rule.artist || normalize(artist) === normalize(rule.artist)) &&
      normalize(track) === normalize(rule.from)
    ) {
      track = rule.to.trim() || track;
    } else if (
      rule.kind === 'albums' &&
      (!rule.artist || normalize(artist) === normalize(rule.artist)) &&
      normalize(album) === normalize(rule.from)
    ) {
      album = rule.to.trim() || album;
    }
  }
  return artist === s.artist && track === s.track && album === s.album ? s : { ...s, artist, track, album };
}

export function itemOf(raw: Scrobble, kind: Kind, aliases?: AliasRule[]): Omit<Item, 'plays'> | null {
  const s = applyAliases(raw, kind, aliases);
  if (!s.artist || (kind === 'albums' && !s.album)) return null;
  const name = kind === 'artists' ? s.artist : kind === 'albums' ? s.album : s.track;
  if (!name) return null;
  const id = JSON.stringify(
    kind === 'artists'
      ? [kind, normalize(s.artist)]
      : kind === 'albums'
        ? [kind, normalize(s.artist), normalize(s.album)]
        : [kind, normalize(s.artist), normalize(s.track), normalize(s.album)],
  );
  return { id, name, artist: s.artist, album: s.album, image: s.image };
}

export function buildCharts(weeks: Week[], cached: CachedWeek[], kind: Kind, deduplicate = false, aliases?: AliasRule[]): ChartWeek[] {
  const data = new Map(cached.map(w => [w.week.id, w]));
  const history = new Map<string, { peak: number; weeks: number; weeksAtOne: number; totalPlays: number; run: ChartEntry['run'] }>();
  let previous = new Map<string, number>();
  let previousKnown = false;
  let complete = true;
  return weeks.map(week => {
    const raw = data.get(week.id);
    if (!raw) {
      complete = false;
      previousKnown = false;
      previous = new Map();
      for (const h of history.values()) h.run.push({ week: week.id, rank: undefined });
      return { ...week, status: 'missing', entries: [], plays: 0, unique: 0, provisional: true };
    }
    const counts = new Map<string, Item>();
    const seen = new Set<string>();
    let plays = 0;
    for (const s of raw.scrobbles) {
      if (s.timestamp < week.start || s.timestamp >= week.end) continue;
      const duplicateKey = scrobbleKey(s);
      if (deduplicate && seen.has(duplicateKey)) continue;
      seen.add(duplicateKey);
      const item = itemOf(s, kind, aliases);
      if (!item) continue;
      plays++;
      const existing = counts.get(item.id);
      if (existing) {
        existing.plays++;
        if (!existing.image && item.image) existing.image = item.image;
      } else {
        counts.set(item.id, { ...item, plays: 1 });
      }
    }
    const sorted = [...counts.values()]
      .sort((a, b) => b.plays - a.plays || (previous.get(a.id) ?? Infinity) - (previous.get(b.id) ?? Infinity) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .slice(0, 100);
    const ranked = new Map(sorted.map((item, i) => [item.id, i + 1]));
    for (const [id, h] of history) {
      h.run.push({ week: week.id, rank: ranked.get(id) ?? null });
      h.totalPlays += counts.get(id)?.plays ?? 0;
    }
    const entries = sorted.map((item, i): ChartEntry => {
      const rank = i + 1;
      const prior = previous.get(item.id);
      const old = history.get(item.id);
      const change = prior ? prior - rank : !previousKnown && week.number !== 1 ? '?' : old ? 'RE' : complete ? 'NEW' : '?';
      const h = old ?? { peak: rank, weeks: 0, weeksAtOne: 0, totalPlays: item.plays, run: [{ week: week.id, rank }] };
      h.peak = Math.min(h.peak, rank);
      h.weeks++;
      if (rank === 1) h.weeksAtOne++;
      history.set(item.id, h);
      return {
        ...item,
        rank,
        previous: prior ?? null,
        change,
        peak: h.peak,
        weeks: h.weeks,
        weeksAtOne: h.weeksAtOne,
        totalPlays: h.totalPlays,
        run: h.run.map(r => ({ ...r })),
      };
    });
    previous = ranked;
    previousKnown = true;
    return { ...week, status: 'loaded', entries, plays, unique: counts.size, provisional: !complete };
  });
}

export function getLibrary(weeks: CachedWeek[], kind: Kind, deduplicate = false, aliases?: AliasRule[]): Item[] {
  const items = new Map<string, Item>();
  const seen = new Set<string>();
  for (const week of weeks) {
    for (const s of week.scrobbles) {
      const key = scrobbleKey(s);
      if (deduplicate && seen.has(key)) continue;
      seen.add(key);
      const item = itemOf(s, kind, aliases);
      if (!item) continue;
      const existing = items.get(item.id);
      if (existing) {
        existing.plays++;
        if (!existing.image && item.image) existing.image = item.image;
      } else {
        items.set(item.id, { ...item, plays: 1 });
      }
    }
  }
  return [...items.values()].sort((a, b) => b.plays - a.plays || a.name.localeCompare(b.name));
}

export function trimTimeline(charts: ChartWeek[], selected: string[]): ChartWeek[] {
  const ids = new Set(selected);
  const indices = charts.flatMap((week, i) => (week.entries.some(e => ids.has(e.id)) ? [i] : []));
  return indices.length ? charts.slice(indices[0], indices[indices.length - 1] + 1) : [];
}

export type CertificationTier = { label: string; tier: 'diamond' | 'double-platinum' | 'platinum' | 'gold' | 'silver' | 'none'; threshold: number; nextThreshold: number | null };

export function getCertification(plays: number): CertificationTier {
  if (plays >= 200) return { label: 'Diamante', tier: 'diamond', threshold: 200, nextThreshold: null };
  if (plays >= 100) return { label: '2× Platina', tier: 'double-platinum', threshold: 100, nextThreshold: 200 };
  if (plays >= 50) return { label: 'Platina', tier: 'platinum', threshold: 50, nextThreshold: 100 };
  if (plays >= 25) return { label: 'Ouro', tier: 'gold', threshold: 25, nextThreshold: 50 };
  if (plays >= 12) return { label: 'Prata', tier: 'silver', threshold: 12, nextThreshold: 25 };
  return { label: 'Em ascensão', tier: 'none', threshold: 0, nextThreshold: 12 };
}

export interface ChartRecords {
  mostWeeksAtOne: Array<{ item: ChartEntry; weeksAtOne: number; weeks: number; totalPlays: number }>;
  longestRun: Array<{ item: ChartEntry; weeks: number; peak: number; totalPlays: number }>;
  biggestJumps: Array<{ entry: ChartEntry; jump: number; weekLabel: string; weekNumber: number }>;
  biggestDebuts: Array<{ entry: ChartEntry; weekLabel: string; weekNumber: number }>;
}

export function computeRecords(charts: ChartWeek[]): ChartRecords {
  const latestByItem = new Map<string, ChartEntry>();
  const jumps: ChartRecords['biggestJumps'] = [];
  const debuts: ChartRecords['biggestDebuts'] = [];

  for (const w of charts) {
    if (w.status !== 'loaded') continue;
    for (const e of w.entries) {
      latestByItem.set(e.id, e);
      if (typeof e.change === 'number' && e.change > 0) {
        jumps.push({ entry: e, jump: e.change, weekLabel: `${w.label}/${String(w.year).slice(2)}`, weekNumber: w.number });
      }
      if (e.change === 'NEW') {
        debuts.push({ entry: e, weekLabel: `${w.label}/${String(w.year).slice(2)}`, weekNumber: w.number });
      }
    }
  }

  const allEntries = [...latestByItem.values()];
  const mostWeeksAtOne = allEntries
    .filter(e => (e.weeksAtOne ?? 0) > 0)
    .sort((a, b) => (b.weeksAtOne ?? 0) - (a.weeksAtOne ?? 0) || b.weeks - a.weeks || b.totalPlays - a.totalPlays)
    .slice(0, 6)
    .map(item => ({ item, weeksAtOne: item.weeksAtOne ?? 0, weeks: item.weeks, totalPlays: item.totalPlays }));

  const longestRun = [...allEntries]
    .sort((a, b) => b.weeks - a.weeks || a.peak - b.peak || b.totalPlays - a.totalPlays)
    .slice(0, 6)
    .map(item => ({ item, weeks: item.weeks, peak: item.peak, totalPlays: item.totalPlays }));

  const biggestJumps = jumps
    .sort((a, b) => b.jump - a.jump || a.entry.rank - b.entry.rank)
    .slice(0, 6);

  const biggestDebuts = debuts
    .sort((a, b) => a.entry.rank - b.entry.rank || b.entry.plays - a.entry.plays)
    .slice(0, 6);

  return { mostWeeksAtOne, longestRun, biggestJumps, biggestDebuts };
}
