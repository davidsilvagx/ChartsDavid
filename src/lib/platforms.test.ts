import { describe, expect, it } from 'vitest';
import {
  parseSpotifyHistoryJSON,
  parseYouTubeMusicHistory,
  countScrobblesBySource,
} from './platforms';
import { buildCharts, getLibrary } from './charts';
import { makeWeeks } from './calendar';
import { defaults, type CachedWeek, type Scrobble } from './types';

const settings = { ...defaults, user: 'test', timezone: 'UTC' };
const weeks = makeWeeks(settings, Date.parse('2016-07-23T12:00:00Z'));

describe('Parse e importação Spotify', () => {
  it('converte formato clássico Account Data (StreamingHistory_music)', () => {
    const raw = JSON.stringify([
      {
        endTime: '2023-05-12 18:45',
        artistName: 'Dua Lipa',
        trackName: 'Dance the Night',
        msPlayed: 176000,
      },
      {
        endTime: '2023-05-12 18:50',
        artistName: 'Dua Lipa',
        trackName: 'Skipped Track',
        msPlayed: 12000, // < 30s -> deve ser ignorado
      },
    ]);
    const scrobbles = parseSpotifyHistoryJSON(raw);
    expect(scrobbles).toHaveLength(1);
    expect(scrobbles[0].track).toBe('Dance the Night');
    expect(scrobbles[0].artist).toBe('Dua Lipa');
    expect(scrobbles[0].source).toBe('spotify');
    expect(scrobbles[0].timestamp).toBeGreaterThan(0);
  });

  it('converte formato Extended Streaming History com metadados completos', () => {
    const raw = JSON.stringify([
      {
        ts: '2023-10-27T10:00:00Z',
        master_metadata_track_name: 'Is It Over Now?',
        master_metadata_album_artist_name: 'Taylor Swift',
        master_metadata_album_album_name: "1989 (Taylor's Version)",
        ms_played: 229000,
      },
      {
        ts: '2023-10-27T10:05:00Z',
        episode_name: 'Podcast Episode 42',
        ms_played: 1800000, // podcast deve ser ignorado
      },
    ]);
    const scrobbles = parseSpotifyHistoryJSON(raw);
    expect(scrobbles).toHaveLength(1);
    expect(scrobbles[0].track).toBe('Is It Over Now?');
    expect(scrobbles[0].artist).toBe('Taylor Swift');
    expect(scrobbles[0].album).toBe("1989 (Taylor's Version)");
    expect(scrobbles[0].source).toBe('spotify');
  });

  it('converte payload da Web API recentemente reproduzidas', () => {
    const raw = JSON.stringify({
      items: [
        {
          played_at: '2024-03-15T12:00:00Z',
          track: {
            name: 'Saturn',
            artists: [{ name: 'SZA' }],
            album: { name: 'Saturn - Single', images: [{ url: 'https://cdn/cover.jpg' }] },
            duration_ms: 186000,
          },
        },
      ],
    });
    const scrobbles = parseSpotifyHistoryJSON(raw);
    expect(scrobbles).toHaveLength(1);
    expect(scrobbles[0].track).toBe('Saturn');
    expect(scrobbles[0].artist).toBe('SZA');
    expect(scrobbles[0].image).toBe('https://cdn/cover.jpg');
  });
});

describe('Parse e importação YouTube Music', () => {
  it('converte histórico Takeout em inglês limpando prefixo Watched e Topic', () => {
    const raw = JSON.stringify([
      {
        header: 'YouTube Music',
        title: 'Watched Espresso',
        titleUrl: 'https://www.youtube.com/watch?v=123',
        time: '2024-05-01T15:30:00Z',
        subtitles: [{ name: 'Sabrina Carpenter - Topic' }],
      },
      {
        header: 'YouTube',
        title: 'Watched Random Gameplay Video',
        time: '2024-05-01T16:00:00Z',
      },
    ]);
    const scrobbles = parseYouTubeMusicHistory(raw);
    expect(scrobbles).toHaveLength(1);
    expect(scrobbles[0].track).toBe('Espresso');
    expect(scrobbles[0].artist).toBe('Sabrina Carpenter');
    expect(scrobbles[0].source).toBe('ytmusic');
  });

  it('converte histórico Takeout em português (Assistiu a)', () => {
    const raw = JSON.stringify([
      {
        header: 'YouTube Music',
        title: 'Assistiu a Birds of a Feather',
        time: '2024-06-01T14:00:00Z',
        subtitles: [{ name: 'Billie Eilish' }],
      },
    ]);
    const scrobbles = parseYouTubeMusicHistory(raw);
    expect(scrobbles).toHaveLength(1);
    expect(scrobbles[0].track).toBe('Birds of a Feather');
    expect(scrobbles[0].artist).toBe('Billie Eilish');
    expect(scrobbles[0].source).toBe('ytmusic');
  });

  it('converte histórico tabular CSV exportado por scrobblers', () => {
    const csv = `Track name,Artist name,Album,Date\nGood Luck Babe!,Chappell Roan,The Rise and Fall of a Midwest Princess,2024-04-10 18:00:00`;
    const scrobbles = parseYouTubeMusicHistory(csv, 'history.csv');
    expect(scrobbles).toHaveLength(1);
    expect(scrobbles[0].track).toBe('Good Luck Babe!');
    expect(scrobbles[0].artist).toBe('Chappell Roan');
  });
});

describe('Filtros de plataforma e deduplicação de espelhamento ±180s', () => {
  const t0 = weeks[0].start + 1000;
  const mockScrobbles: Scrobble[] = [
    // Last.fm ouviu às 1000s
    { timestamp: t0, track: 'Levitating', artist: 'Dua Lipa', album: 'Future Nostalgia', image: 'dua.jpg', source: 'lastfm' },
    // Spotify ouviu a mesma música no mesmo horário (±30s) gerando scrobble espelhado
    { timestamp: t0 + 25, track: 'Levitating', artist: 'Dua Lipa', album: '', image: '', source: 'spotify' },
    // Spotify ouviu faixa exclusiva
    { timestamp: t0 + 400, track: 'Physical', artist: 'Dua Lipa', album: 'Future Nostalgia', image: '', source: 'spotify' },
    // YouTube Music ouviu faixa exclusiva
    { timestamp: t0 + 800, track: 'Houdini', artist: 'Dua Lipa', album: 'Radical Optimism', image: '', source: 'ytmusic' },
  ];

  const cachedWeek: CachedWeek = {
    key: '0',
    week: weeks[0],
    scrobbles: mockScrobbles,
    cutoff: weeks[0].end,
    fetchedAt: 1,
    duplicates: 0,
  };

  it('conta scrobbles corretamente por fonte', () => {
    const counts = countScrobblesBySource([cachedWeek]);
    expect(counts.lastfm).toBe(1);
    expect(counts.spotify).toBe(2);
    expect(counts.ytmusic).toBe(1);
    expect(counts.streaming).toBe(3); // 2 spotify + 1 ytmusic
    expect(counts.all).toBe(4);
  });

  it('filtra apenas Spotify quando sourceFilter="spotify"', () => {
    const charts = buildCharts(weeks.slice(0, 1), [cachedWeek], 'tracks', false, undefined, 'spotify');
    expect(charts[0].plays).toBe(2);
    const names = charts[0].entries.map(e => e.name);
    expect(names).toContain('Levitating');
    expect(names).toContain('Physical');
    expect(names).not.toContain('Houdini');
  });

  it('filtra apenas YouTube Music quando sourceFilter="ytmusic"', () => {
    const charts = buildCharts(weeks.slice(0, 1), [cachedWeek], 'tracks', false, undefined, 'ytmusic');
    expect(charts[0].plays).toBe(1);
    expect(charts[0].entries[0].name).toBe('Houdini');
  });

  it('deduplica reproduções espelhadas entre plataformas no modo combinado ("all")', () => {
    // "Levitating" foi ouvida no Last.fm e Spotify com 25s de diferença (±180s)
    // O modo "all" deve deduplicar para 1 play em vez de inflar para 2, e enriquecer metadados
    const charts = buildCharts(weeks.slice(0, 1), [cachedWeek], 'tracks', false, undefined, 'all');
    expect(charts[0].plays).toBe(3); // Levitating (1 deduplicado) + Physical (1) + Houdini (1) = 3
    const levitating = charts[0].entries.find(e => e.name === 'Levitating');
    expect(levitating).toBeDefined();
    expect(levitating?.plays).toBe(1);
    expect(levitating?.album).toBe('Future Nostalgia'); // preservou metadado do Last.fm

    const lib = getLibrary([cachedWeek], 'tracks', false, undefined, 'all');
    expect(lib).toHaveLength(3);
    const libLevitating = lib.find(i => i.name === 'Levitating');
    expect(libLevitating?.plays).toBe(1);
    expect(libLevitating?.image).toBe('dua.jpg');
  });
});
