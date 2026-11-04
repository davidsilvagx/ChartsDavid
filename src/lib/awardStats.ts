import { itemOf, selectScrobblesForFilter } from './charts';
import type { ItemStats } from './jury';
import type { AliasRule, CachedWeek, Kind, SourceFilter, Week } from './types';

/** Compact history scan: same weekly tie-break as buildCharts, without allocating chart runs. */
export function addPersonalAwardStats(stats: Record<Kind, Record<string, ItemStats>>, selected: CachedWeek[], history: CachedWeek[], calendar: Week[], deduplicate: boolean, aliases: AliasRule[] | undefined, source: SourceFilter) {
  const cache = new Map(history.map(week => [week.week.id, week]));
  const period = new Set(selected.map(week => week.week.id));
  const topTracks = new Map<string, Set<string>>();
  const rank = (counts: Map<string, number>, previous: Map<string, number>) => new Map([...counts]
    .sort((a, b) => b[1] - a[1] || (previous.get(a[0]) ?? Infinity) - (previous.get(b[0]) ?? Infinity) || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .slice(0, 100).map(([id], index) => [id, index + 1]));
  let previousTracks = new Map<string, number>(), previousArtists = new Map<string, number>(), missing = 0;
  for (const row of Object.values(stats.artists)) { row.top10Tracks = 0; row.trackWeeksAtOne = 0; row.weeksAtOne = 0; row.weeksTop10 = 0; }
  for (const row of Object.values(stats.tracks)) { row.weeksAtOne = 0; row.weeksTop10 = 0; }
  for (const week of [...calendar].sort((a, b) => a.start - b.start)) {
    const raw = cache.get(week.id);
    if (!raw) { missing++; previousTracks.clear(); previousArtists.clear(); continue; }
    const artists = new Map<string, number>(), tracks = new Map<string, number>(), owner = new Map<string, string>();
    for (const scrobble of selectScrobblesForFilter(raw.scrobbles, deduplicate, source, week.start, week.end)) {
      const artist = itemOf(scrobble, 'artists', aliases), track = itemOf(scrobble, 'tracks', aliases);
      if (artist) artists.set(artist.id, (artists.get(artist.id) ?? 0) + 1);
      if (track) {
        tracks.set(track.id, (tracks.get(track.id) ?? 0) + 1);
        if (artist) { owner.set(track.id, artist.id); if (stats.tracks[track.id]) stats.tracks[track.id].artistId = artist.id; }
      }
    }
    const rankedArtists = rank(artists, previousArtists), rankedTracks = rank(tracks, previousTracks);
    for (const id of rankedArtists.keys()) {
      const artist = stats.artists[id];
      if (artist && !artist.chartDebut) artist.chartDebut = { week: week.label, start: week.start, year: week.year, missingBefore: missing + (!week.partial && raw.cutoff < week.end ? 1 : 0), provisional: week.partial || raw.cutoff < week.end };
      if (artist && period.has(week.id)) { const position = rankedArtists.get(id)!; if (position === 1) artist.weeksAtOne++; if (position <= 10) artist.weeksTop10++; }
    }
    if (period.has(week.id)) for (const [id, position] of rankedTracks) {
      const track = stats.tracks[id];
      if (track) { if (position === 1) track.weeksAtOne++; if (position <= 10) track.weeksTop10++; }
      if (position > 10) continue;
      const artistId = owner.get(id), artist = artistId ? stats.artists[artistId] : undefined;
      if (!artist || !artistId) continue;
      const songs = topTracks.get(artistId) ?? new Set<string>(); songs.add(id); topTracks.set(artistId, songs);
      artist.top10Tracks = songs.size;
      if (position === 1) artist.trackWeeksAtOne = (artist.trackWeeksAtOne ?? 0) + 1;
    }
    previousArtists = rankedArtists; previousTracks = rankedTracks;
    if (!week.partial && raw.cutoff < week.end) missing++;
  }
}

/** Personal breakthrough means first Top 100 artist-chart entry, not professional debut. */
export function personalDebutCheck(stats: ItemStats | undefined, year: number | null): { ok: boolean | null; basis: string } {
  if (year === null) return { ok: null, basis: 'Escolha um ano para verificar a estreia no seu chart.' };
  const debut = stats?.chartDebut;
  if (!debut) return { ok: null, basis: 'Primeira entrada no seu Top 100 de artistas ainda não verificada.' };
  if (debut.year !== year) return { ok: false, basis: `Já entrou no seu chart em ${debut.year}.` };
  if (debut.missingBefore) return { ok: null, basis: `Entrada observada em ${year}, mas ${debut.missingBefore === 1 ? 'falta 1 semana anterior' : `faltam ${debut.missingBefore} semanas anteriores`} para confirmar a estreia.` };
  return { ok: true, basis: `Estreia no seu Top 100 de artistas · ${debut.week}${debut.provisional ? ' · semana parcial' : ''}` };
}
