import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeWeeks } from './calendar';
import { closedCache } from './closedWeeks';
import { formatDays, formatWeeks } from './duration';
import { buildCharts, getLibrary } from './charts';
import { buildMissions, missionBadge } from './missions';
import { annualRecords } from './annualRecords';
import { gapTimeline, playbackMap } from './timeline';
import { metaKey, type EffectiveMeta } from './metadata';
import { defaults, type CachedWeek, type Scrobble } from './types';
import { handleArtistPhoto } from '../../server/artist-photo.mjs';

const settings = { ...defaults, user: 'pop-test', startDate: '2025-12-26' };
const now = Date.parse('2026-02-06T12:00:00Z');
const weeks = makeWeeks(settings, now);
const play = (index: number, track = 'Firework', artist = 'Katy Perry', album = 'Teenage Dream', offset = 30): Scrobble => ({ timestamp: weeks[index].start + offset, track, artist, album, image: 'https://example.com/album.jpg' });
const cache = (index: number, scrobbles: Scrobble[]): CachedWeek => ({ key: weeks[index].id, week: weeks[index], scrobbles, cutoff: Math.min(weeks[index].end, now / 1000), fetchedAt: now, duplicates: 0 });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('Closed weeks and duration', () => {
  it('keeps an open week only in the live series and reconciles stale stored partial flags', () => {
    const cached = [cache(0, [play(0)]), cache(6, [play(6, 'Provisional')])];
    const closed = closedCache(weeks, cached, now);
    expect(closed.map(w => w.week.id)).toEqual([weeks[0].id]);
    expect(getLibrary(closed, 'tracks').map(t => t.name)).toEqual(['Firework']);
    const live = buildCharts(weeks, cached, 'tracks').find(w => w.partial)!;
    expect(live.entries[0].name).toBe('Provisional');
    expect(closedCache(makeWeeks(settings, weeks[6].end * 1000), cached, weeks[6].end * 1000).at(-1)?.week.partial).toBe(false);
  });
  it('handles conversion boundaries, zero, invalid values and the original weeks setting', () => {
    expect(formatDays(6)).toBe('6 dias'); expect(formatDays(7)).toBe('1 semana');
    expect(formatDays(28)).toContain('mês'); expect(formatDays(365)).toBe('≈ 1 ano');
    expect(formatWeeks(52, 'weeks')).toBe('52 semanas'); expect(formatWeeks(52, 'equivalent')).toContain('meses');
    expect(formatDays(NaN)).toBe('0 dias'); expect(formatDays(-1)).toBe('0 dias');
  });
  it('does not promote a saved draft to an official week without fetching the final cutoff', () => {
    const boundary = weeks[6].end * 1000;
    const calendar = makeWeeks(settings, boundary);
    const draft = cache(6, [play(6)]);
    expect(closedCache(calendar, [draft], boundary)).toEqual([]);
    expect(closedCache(calendar, [{ ...draft, cutoff: weeks[6].end }], boundary)[0].week).toMatchObject({ id: weeks[6].id, partial: false });
  });
  it('never uses an album cover for an artist domain item', () => {
    const data = [cache(0, [play(0)])];
    expect(getLibrary(data, 'artists')[0]).toMatchObject({ image: '', album: '' });
    expect(getLibrary(data, 'tracks')[0].image).toContain('album.jpg');
  });
});

describe('280 collectible missions', () => {
  it('has unique IDs, clear nonzero criteria and zero progress for an empty archive', () => {
    const missions = buildMissions([], settings, 'all', new Map());
    expect(missions).toHaveLength(280); expect(new Set(missions.map(m => m.id)).size).toBe(280);
    expect(missions.every(m => m.target > 0 && m.criterion && m.value === 0)).toBe(true);
  });
  it('tracks fandom plays with source filtering, without counting the open week', () => {
    vi.useFakeTimers(); vi.setSystemTime(now);
    const data = [cache(0, [play(0, 'Applause', 'Lady Gaga'), { ...play(0, 'Poker Face', 'Lady Gaga'), source: 'spotify' }]), cache(6, [play(6, 'Rain on Me', 'Lady Gaga')])];
    expect(buildMissions(data, settings, 'lastfm', new Map()).find(m => m.id === 'fandom-lady gaga-25')?.value).toBe(1);
  });
  it('requires confirmed metadata for genres, release decades and catalog minutes', () => {
    const data = [cache(0, [play(0)])], item = getLibrary(data, 'tracks')[0];
    const record = { status: 'matched', match: 'exact', genre: 'Pop', releaseDate: '1985-01-01', durationMs: 180000 } as EffectiveMeta;
    const meta = new Map([[metaKey('tracks', item), record]]);
    const missions = buildMissions(data, settings, 'all', meta);
    expect(missions.find(m => m.id === 'genre-pop-25')?.value).toBe(1);
    expect(missions.find(m => m.id === 'decade-1980-25')?.value).toBe(1);
    expect(missions.find(m => m.id === 'minutes-60')?.value).toBe(3);
    expect(buildMissions(data, settings, 'all', new Map()).filter(m => m.needsMetadata).every(m => m.value === 0)).toBe(true);
    meta.set(metaKey('tracks', item), { ...record, status: 'ambiguous' });
    expect(buildMissions(data, settings, 'all', meta).find(m => m.id === 'minutes-60')?.value).toBe(0);
  });
  it('escapes shared SVGs and accurately labels locked badges', async () => {
    const mission = buildMissions([], settings, 'all', new Map())[0];
    const svg = await missionBadge(mission, '<script>alert(1)</script>').text();
    expect(svg).not.toContain('<script>'); expect(svg).toContain('&lt;script&gt;'); expect(svg).toContain('MINHA PRÓXIMA ERA');
  });
});

describe('Annual awards derived from full chart history', () => {
  it('uses distinct #1 tracks, preserves simultaneous songs and albums, excludes established artists from breakthrough', () => {
    vi.useFakeTimers(); vi.setSystemTime(now);
    const data = [cache(0, [play(0, 'Old', 'Veteran')]), cache(1, [play(1, 'One', 'Newcomer', 'Album A'), play(1, 'One', 'Newcomer', 'Album A', 60), play(1, 'Two', 'Newcomer', 'Album B'), play(1, 'Old', 'Veteran')]), ...[2, 3, 4, 5].map(i => cache(i, [play(i, 'Two', 'Newcomer', 'Album B')])), cache(6, [play(6, 'Open', 'Provisional')])];
    const result = annualRecords(data, settings, 'all', 2026);
    expect(result.breakthrough.map(a => a.name)).toContain('Newcomer'); expect(result.breakthrough.map(a => a.name)).not.toContain('Veteran');
    expect(result.artists.map(a => a.name)).not.toContain('Provisional');
    expect(result.simultaneous.find(a => a.name === 'Newcomer')?.songs.map(s => s.album).sort()).toEqual(['Album A', 'Album B']);
    expect(result.numberOnes.find(a => a.name === 'Newcomer')?.count).toBe(2);
  });
  it('does not invent a debut across missing downloads', () => {
    vi.useFakeTimers(); vi.setSystemTime(now);
    const result = annualRecords([cache(2, [play(2, 'Unknown', 'Unknown')])], settings, 'all', 2026);
    expect(result.breakthrough).toEqual([]); expect(result.debuts).toEqual([]); expect(result.missingBefore).toBe(true);
  });
});

describe('Optional gaps in exported and preview timelines', () => {
  const raw = [cache(0, [play(0)]), cache(1, []), cache(2, []), cache(3, []), cache(4, [play(4)])];
  const charts = buildCharts(weeks.slice(0, 5), raw, 'tracks'), ids = [charts[0].entries[0].id];
  it('preserves the original by default, and keeps a real OUT frame when skipping', () => {
    expect(gapTimeline(charts, ids)).toBe(charts);
    expect(gapTimeline(charts, ids, 'compact').map(w => w.number)).toEqual([1, 2, 4, 5]);
    expect(gapTimeline(charts, ids, 'skip').map(w => w.number)).toEqual([1, 2, 5]);
    expect(charts).toHaveLength(5);
  });
  it('never skips unknown weeks and never treats another selected artist as a gap', () => {
    const missing = charts.map((w, i) => i === 2 ? { ...w, status: 'missing' as const } : w);
    expect(gapTimeline(missing, ids, 'skip').some(w => w.number === 3)).toBe(true);
    expect(gapTimeline(charts, [], 'skip')).toHaveLength(1);
  });
  it('accelerates only known absence transitions and maps recording time to the same positions', () => {
    const full = playbackMap(charts, ids, false), fast = playbackMap(charts, ids, true);
    expect(full.duration).toBe(4); expect(fast.duration).toBe(2.25);
    expect(fast.at(1.125)).toBe(2); expect(fast.advance(1, 0.125)).toBe(2);
    expect(fast.at(999)).toBe(4); expect(playbackMap([], [], true).at(9)).toBe(0);
  });
});

describe('Exact artist catalog portraits', () => {
  it('matches exact names and refuses an unrelated artist or an album image URL', async () => {
    const request = new Request('https://lastchart.test/api/artist-photo?artist=Lady%20Gaga');
    const fetcher = async () => Response.json({ data: [{ name: 'Lady Gaga Tribute', picture_xl: 'https://cdns-images.dzcdn.net/images/artist/wrong.jpg' }, { name: 'Lady Gaga', picture_xl: 'https://cdns-images.dzcdn.net/images/artist/right.jpg' }] });
    expect(await (await handleArtistPhoto(request, fetcher)).json()).toMatchObject({ image: expect.stringContaining('right.jpg') });
    const noMatch = await handleArtistPhoto(request, async () => Response.json({ data: [{ name: 'Katy Perry', picture_xl: 'https://example.com/album.jpg' }] }));
    expect(await noMatch.json()).toMatchObject({ image: '' });
  });
});
