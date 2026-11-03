import type { AliasRule, CachedWeek, ChartEntry, ChartWeek, Item, Kind, MusicSource, Scrobble, SourceFilter, Week } from './types';

export const normalize = (s: string) => s.normalize('NFC').trim().toLowerCase();
export const scrobbleKey = (s: Scrobble) =>
  JSON.stringify([s.timestamp, normalize(s.artist), normalize(s.track), normalize(s.album), s.source ?? 'lastfm']);

function scrobbleSrc(s: Scrobble): MusicSource {
  return s.source === 'spotify' || s.source === 'ytmusic' ? s.source : 'lastfm';
}

function allowSource(s: Scrobble, filter: SourceFilter): boolean {
  const src = scrobbleSrc(s);
  if (filter === 'all') return true;
  if (filter === 'streaming') return src === 'spotify' || src === 'ytmusic';
  return src === filter;
}

export function selectScrobblesForFilter(
  raw: Scrobble[],
  deduplicate = false,
  sourceFilter: SourceFilter = 'all',
  start?: number,
  end?: number,
): Scrobble[] {
  const filtered = raw.filter(
    s =>
      (start === undefined || s.timestamp >= start) &&
      (end === undefined || s.timestamp < end) &&
      allowSource(s, sourceFilter),
  );
  if (!filtered.length) return [];

  const multiSource = sourceFilter === 'all' || sourceFilter === 'streaming';
  const hasMultipleSources =
    multiSource && filtered.some(s => scrobbleSrc(s) !== scrobbleSrc(filtered[0]));

  // Fast path for single-source (preserves 100% original behavior & performance)
  if (!hasMultipleSources) {
    if (!deduplicate) return filtered;
    const seen = new Set<string>();
    return filtered.filter(s => {
      const k = scrobbleKey(s);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  // Multi-source path: deduplicate cross-platform mirror scrobbles (e.g. Spotify play also forwarded to Last.fm within ±180s)
  const ordered = [...filtered].sort(
    (a, b) =>
      a.timestamp - b.timestamp ||
      Number(Boolean(b.album)) - Number(Boolean(a.album)) ||
      Number(Boolean(b.image)) - Number(Boolean(a.image)),
  );
  const seenExact = new Set<string>();
  const kept: Scrobble[] = [];
  const recentByTrack = new Map<string, Array<{ source: MusicSource; timestamp: number; keptIdx: number }>>();

  for (const s of ordered) {
    const k = scrobbleKey(s);
    if (deduplicate && seenExact.has(k)) continue;
    seenExact.add(k);

    const src = scrobbleSrc(s);
    const trackSig = JSON.stringify([normalize(s.artist), normalize(s.track)]);
    const candidates = recentByTrack.get(trackSig);

    if (candidates?.length) {
      const matchIdx = candidates.findIndex(
        c => c.source !== src && Math.abs(s.timestamp - c.timestamp) <= 180,
      );
      if (matchIdx >= 0) {
        const matched = candidates[matchIdx];
        candidates.splice(matchIdx, 1);
        const target = kept[matched.keptIdx];
        if ((!target.album && s.album) || (!target.image && s.image)) {
          kept[matched.keptIdx] = {
            ...target,
            album: target.album || s.album,
            image: target.image || s.image,
          };
        }
        continue;
      }
    }

    const keptIdx = kept.length;
    kept.push(s);
    const list = candidates ?? [];
    list.push({ source: src, timestamp: s.timestamp, keptIdx });
    recentByTrack.set(trackSig, list);
  }

  return kept;
}

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

interface InternalHistory {
  peak: number;
  weeks: number;
  weeksAtOne: number;
  weeksOut: number;
  currentOut: number;
  hasMissingGapSinceLast: boolean;
  totalPlays: number;
  run: ChartEntry['run'];
}

export function buildCharts(
  weeks: Week[],
  cached: CachedWeek[],
  kind: Kind,
  deduplicate = false,
  aliases?: AliasRule[],
  sourceFilter: SourceFilter = 'all',
): ChartWeek[] {
  const data = new Map(cached.map(w => [w.week.id, w]));
  const history = new Map<string, InternalHistory>();
  let previous = new Map<string, number>();
  let previousKnown = false;
  let complete = true;
  return weeks.map(week => {
    const raw = data.get(week.id);
    if (!raw) {
      complete = false;
      previousKnown = false;
      previous = new Map();
      for (const h of history.values()) {
        h.run.push({ week: week.id, rank: undefined, plays: undefined });
        h.hasMissingGapSinceLast = true;
      }
      return { ...week, status: 'missing', entries: [], plays: 0, unique: 0, provisional: true };
    }
    const counts = new Map<string, Item>();
    let plays = 0;
    const weekScrobbles = selectScrobblesForFilter(raw.scrobbles, deduplicate, sourceFilter, week.start, week.end);
    for (const s of weekScrobbles) {
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
    // Strict safeguard: only items with >= 1 verified play in [week.start, week.end) can ever enter the chart
    const sorted = [...counts.values()]
      .filter(item => item.plays >= 1)
      .sort((a, b) => b.plays - a.plays || (previous.get(a.id) ?? Infinity) - (previous.get(b.id) ?? Infinity) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .slice(0, 100);
    const ranked = new Map(sorted.map((item, i) => [item.id, i + 1]));
    const preEntryState = new Map<string, { outStreak: number; hadMissing: boolean }>();

    for (const [id, h] of history) {
      const rankInWeek = ranked.get(id) ?? null;
      const weekPlays = counts.get(id)?.plays ?? 0;
      preEntryState.set(id, { outStreak: h.currentOut, hadMissing: h.hasMissingGapSinceLast });
      h.run.push({ week: week.id, rank: rankInWeek, plays: weekPlays });
      h.totalPlays += weekPlays;
      if (rankInWeek === null) {
        h.weeksOut++;
        h.currentOut++;
      } else {
        h.currentOut = 0;
        h.hasMissingGapSinceLast = false;
      }
    }

    const entries = sorted.map((item, i): ChartEntry => {
      const rank = i + 1;
      const prior = previous.get(item.id);
      const old = history.get(item.id);
      const pre = preEntryState.get(item.id);
      const change = prior ? prior - rank : !previousKnown && week.number !== 1 ? '?' : old ? 'RE' : complete ? 'NEW' : '?';
      const hiatusWeeks = change === 'RE' && pre && !pre.hadMissing && pre.outStreak > 0 ? pre.outStreak : null;
      const h: InternalHistory = old ?? {
        peak: rank,
        weeks: 0,
        weeksAtOne: 0,
        weeksOut: 0,
        currentOut: 0,
        hasMissingGapSinceLast: false,
        totalPlays: item.plays,
        run: [{ week: week.id, rank, plays: item.plays }],
      };
      h.peak = Math.min(h.peak, rank);
      h.weeks++;
      if (rank === 1) h.weeksAtOne++;
      history.set(item.id, h);
      return {
        ...item,
        rank,
        previous: prior ?? null,
        change,
        hiatusWeeks,
        weeksOut: h.weeksOut,
        peak: h.peak,
        weeks: h.weeks,
        weeksAtOne: h.weeksAtOne,
        totalPlays: h.totalPlays,
        // Steps are immutable. Share them between snapshots to avoid millions of
        // duplicate objects when loading years of history on a phone.
        run: h.run.slice(),
      };
    });
    previous = ranked;
    previousKnown = true;
    return { ...week, status: 'loaded', entries, plays, unique: counts.size, provisional: !complete };
  });
}

export interface ItemAuditHistory {
  charted: boolean;
  peak: number | null;
  weeks: number;
  weeksAtOne: number;
  totalPlays: number;
  totalWeeksOut: number;
  currentOutStreak: number;
  longestOutStreak: number;
  zeroPlayWeeks: number;
  missingWeeksSinceDebut: number;
  run: Array<{ week: string; label: string; year: number; number: number; rank: number | null | undefined; plays: number | undefined }>;
}

export function getItemAuditHistory(charts: ChartWeek[], itemId: string, fallbackPlays = 0): ItemAuditHistory {
  const firstIdx = charts.findIndex(w => w.status === 'loaded' && w.entries.some(e => e.id === itemId));
  if (firstIdx < 0) {
    return {
      charted: false,
      peak: null,
      weeks: 0,
      weeksAtOne: 0,
      totalPlays: fallbackPlays,
      totalWeeksOut: 0,
      currentOutStreak: 0,
      longestOutStreak: 0,
      zeroPlayWeeks: 0,
      missingWeeksSinceDebut: 0,
      run: [],
    };
  }
  // Find latest loaded week at or after debut so post-chart OUT streaks are never hidden
  let lastLoadedIdx = firstIdx;
  for (let i = charts.length - 1; i >= firstIdx; i--) {
    if (charts[i].status === 'loaded') {
      lastLoadedIdx = i;
      break;
    }
  }

  let peak = Infinity;
  let weeks = 0;
  let weeksAtOne = 0;
  let totalWeeksOut = 0;
  let currentOutStreak = 0;
  let longestOutStreak = 0;
  let zeroPlayWeeks = 0;
  let missingWeeksSinceDebut = 0;
  let latestEntryPlays = fallbackPlays;
  const run: ItemAuditHistory['run'] = [];

  for (let i = firstIdx; i <= lastLoadedIdx; i++) {
    const w = charts[i];
    if (w.status === 'missing') {
      missingWeeksSinceDebut++;
      run.push({ week: w.id, label: w.label, year: w.year, number: w.number, rank: undefined, plays: undefined });
      continue;
    }
    const entry = w.entries.find(e => e.id === itemId);
    if (entry) {
      peak = Math.min(peak, entry.rank);
      weeks++;
      if (entry.rank === 1) weeksAtOne++;
      currentOutStreak = 0;
      latestEntryPlays = Math.max(latestEntryPlays, entry.totalPlays);
      run.push({ week: w.id, label: w.label, year: w.year, number: w.number, rank: entry.rank, plays: entry.plays });
    } else {
      totalWeeksOut++;
      currentOutStreak++;
      longestOutStreak = Math.max(longestOutStreak, currentOutStreak);
      // Check if an entry later recorded exact week plays in its run snapshot
      const laterWithEntry = charts.slice(i + 1, lastLoadedIdx + 1).find(lw => lw.entries.some(le => le.id === itemId));
      const snap = laterWithEntry?.entries.find(le => le.id === itemId)?.run.find(r => r.week === w.id);
      const p = snap?.plays ?? 0;
      if (p === 0) zeroPlayWeeks++;
      run.push({ week: w.id, label: w.label, year: w.year, number: w.number, rank: null, plays: p });
    }
  }

  return {
    charted: true,
    peak: Number.isFinite(peak) ? peak : null,
    weeks,
    weeksAtOne,
    totalPlays: Math.max(latestEntryPlays, fallbackPlays),
    totalWeeksOut,
    currentOutStreak,
    longestOutStreak,
    zeroPlayWeeks,
    missingWeeksSinceDebut,
    run,
  };
}

export function getLibrary(
  weeks: CachedWeek[],
  kind: Kind,
  deduplicate = false,
  aliases?: AliasRule[],
  sourceFilter: SourceFilter = 'all',
): Item[] {
  const items = new Map<string, Item>();
  for (const week of weeks) {
    const selected = selectScrobblesForFilter(week.scrobbles, deduplicate, sourceFilter, week.week.start, week.week.end);
    for (const s of selected) {
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
        jumps.push({ entry: e, jump: e.change, weekLabel: w.label, weekNumber: w.number });
      }
      if (e.change === 'NEW') {
        debuts.push({ entry: e, weekLabel: w.label, weekNumber: w.number });
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
