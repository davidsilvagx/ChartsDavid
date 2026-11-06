import { buildCharts, getLibrary, itemOf, normalize } from './charts';
import { closedCache } from './closedWeeks';
import { makeWeeks } from './calendar';
import type { CachedWeek, Item, Settings, SourceFilter } from './types';

export function annualRecords(cached: CachedWeek[], settings: Settings, source: SourceFilter, year: number) {
  const calendar = makeWeeks(settings).filter(w => !w.partial), data = closedCache(calendar, cached);
  const tracks = buildCharts(calendar, data, 'tracks', settings.deduplicate, settings.aliases, source);
  const artists = buildCharts(calendar, data, 'artists', settings.deduplicate, settings.aliases, source);
  const annual = tracks.filter(w => w.year === year), selected = data.filter(w => w.week.year === year);
  const ones = new Map<string, { name: string; songs: Set<string> }>();
  const simultaneous = new Map<string, { name: string; count: number; week: string; songs: Item[] }>();
  for (const week of annual) {
    const leader = week.entries[0];
    if (leader) { const key = normalize(leader.artist), row = ones.get(key) ?? { name: leader.artist, songs: new Set<string>() }; row.songs.add(leader.id); ones.set(key, row); }
    const grouped = new Map<string, Item[]>();
    for (const e of week.entries) { const key = normalize(e.artist), rows = grouped.get(key) ?? []; rows.push(e); grouped.set(key, rows); }
    for (const [key, songs] of grouped) if (songs.length > (simultaneous.get(key)?.count ?? 0)) simultaneous.set(key, { name: songs[0].artist, count: songs.length, week: week.label, songs });
  }
  const debutants = new Set(artists.filter(w => w.year === year).flatMap(w => w.entries.filter(e => e.change === 'NEW').map(e => e.id)));
  const ranking = getLibrary(selected, 'artists', settings.deduplicate, settings.aliases, source);
  return {
    loaded: annual.filter(w => w.status === 'loaded').length, total: annual.length,
    numberOnes: [...ones.values()].map(r => ({ name: r.name, count: r.songs.size, songs: [...r.songs] })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, 5),
    artists: ranking.slice(0, 5), albums: getLibrary(selected, 'albums', settings.deduplicate, settings.aliases, source).slice(0, 5),
    debuts: annual.flatMap(w => w.entries.filter(e => e.change === 'NEW').map(e => ({ ...e, label: w.label }))).sort((a, b) => a.rank - b.rank || b.plays - a.plays).slice(0, 5),
    simultaneous: [...simultaneous.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, 5),
    breakthrough: ranking.filter(a => debutants.has(a.id)).slice(0, 5),
    missingBefore: calendar.some(w => w.year < year && !data.some(d => d.week.id === w.id)),
  };
}
