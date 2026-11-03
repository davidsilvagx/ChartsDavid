export type Kind = 'tracks' | 'albums' | 'artists';
export type Theme = 'light' | 'dark' | 'system';
export type MusicSource = 'lastfm' | 'spotify' | 'ytmusic';
export type SourceFilter = 'all' | 'lastfm' | 'spotify' | 'ytmusic' | 'streaming';
export type SyncScope = 'recent' | 'all' | number;

export interface AliasRule {
  id: string;
  kind: Kind;
  artist: string;
  from: string;
  to: string;
}

export interface Settings {
  user: string;
  startDate: string;
  timezone: string;
  theme: Theme;
  apiKey: string;
  deduplicate: boolean;
  reducedMotion: boolean;
  avatar?: string;
  aliases?: AliasRule[];
  spotifyClientId?: string;
  googleClientId?: string;
}

export interface Scrobble {
  timestamp: number;
  artist: string;
  track: string;
  album: string;
  image: string;
  mbid?: string;
  source?: MusicSource;
}

export interface Week {
  id: string;
  number: number;
  start: number;
  end: number;
  label: string;
  year: number;
  partial: boolean;
}

export interface CachedWeek {
  lastfmSynced?: boolean;
  key: string;
  week: Week;
  scrobbles: Scrobble[];
  fetchedAt: number;
  cutoff: number;
  duplicates: number;
}

export interface Item {
  id: string;
  name: string;
  artist: string;
  album: string;
  image: string;
  plays: number;
}

export interface ChartRunStep {
  week: string;
  rank: number | null | undefined;
  plays?: number;
}

export interface ChartEntry extends Item {
  rank: number;
  previous: number | null;
  change: number | 'NEW' | 'RE' | '?';
  hiatusWeeks?: number | null;
  weeksOut?: number;
  peak: number;
  weeks: number;
  weeksAtOne?: number;
  totalPlays: number;
  run: ChartRunStep[];
}

export interface ChartWeek extends Week {
  status: 'loaded' | 'missing';
  entries: ChartEntry[];
  plays: number;
  unique: number;
  provisional: boolean;
}

export interface Profile {
  name: string;
  realname: string;
  image: string;
  playcount: number;
  registered: number;
  url: string;
}

export interface SyncProgress {
  completed: number;
  total: number;
  message: string;
  pages: number;
  scope?: SyncScope;
  force?: boolean;
  phase?: 'connecting' | 'fetching' | 'done';
}

export interface StudioSettings {
  mode: 'lines' | 'bars';
  barMetric: 'cumulative' | 'weekly';
  barCount: number;
  canvasTheme: 'dark' | 'light';
  top: number;
  speed: number;
  spacing: number;
  lineWidth: number;
  coverSize: number;
  fontSize: number;
  effects: boolean;
  format: 'landscape' | 'portrait' | 'square';
  palette: 'neon' | 'garden' | 'sunset' | 'aurora';
  colors: Record<string, string>;
}

export const defaults: Settings = {
  user: 'Iknowjauregui',
  startDate: '2016-06-24',
  timezone: 'UTC',
  theme: 'dark',
  apiKey: '',
  deduplicate: false,
  reducedMotion: false,
  avatar: 'lastfm',
  aliases: [],
  spotifyClientId: '',
  googleClientId: '',
};

export const studioDefaults: StudioSettings = {
  mode: 'lines',
  barMetric: 'cumulative',
  barCount: 10,
  canvasTheme: 'dark',
  top: 100,
  speed: 1,
  spacing: 100,
  lineWidth: 3,
  coverSize: 30,
  fontSize: 13,
  effects: true,
  format: 'landscape',
  palette: 'neon',
  colors: {},
};
