import { makeWeeks, validateCalendar } from './calendar';
import { defaults, type CachedWeek, type ChartEntry, type Profile, type Settings } from './types';
export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
export function csvCell(value: unknown) {
  let s = String(value ?? '');
  if (/^[\s]*[=+@\-\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}
export function chartCSV(entries: ChartEntry[]) {
  return '\ufeff' + [['Posição', 'Variação', 'Semanas fora antes do retorno', 'Total semanas fora', 'Título', 'Artista', 'Álbum', 'Reproduções', 'Pico Top 100', 'Semanas Top 100', 'Chart run'], ...entries.map(e => [e.rank, e.change, e.hiatusWeeks ?? '', e.weeksOut ?? 0, e.name, e.artist, e.album, e.plays, e.peak, e.weeks, e.run.map(r => `${r.week}:${r.rank === undefined ? '?' : r.rank ?? `OUT(${r.plays ?? 0}p)`}`).join(' | ')])].map(row => row.map(csvCell).join(',')).join('\r\n');
}
export function backupJSON(settings: Settings, weeks: CachedWeek[], profile: Profile | null) {
  const { apiKey: _key, ...safeSettings } = settings;
  return JSON.stringify({ app: 'LastChartStudioPro', version: 1, exportedAt: new Date().toISOString(), settings: safeSettings, profile, weeks });
}
export function parseBackup(text: string): { settings: Settings; weeks: CachedWeek[]; profile: Profile | null } {
  const data = JSON.parse(text);
  if (data.app !== 'LastChartStudioPro' || data.version !== 1 || !data.settings || !Array.isArray(data.weeks)) throw new Error('Este arquivo não é um backup LastChart v1.');
  const s = data.settings;
  if (typeof s.user !== 'string' || !/^[\w.-]{1,100}$/.test(s.user) || typeof s.startDate !== 'string' || typeof s.timezone !== 'string') throw new Error('Perfil ou calendário inválido no backup.');
  validateCalendar(s.startDate, s.timezone);
  const aliases = Array.isArray(s.aliases)
    ? s.aliases
        .filter((r: unknown): r is NonNullable<Settings['aliases']>[number] => !!r && typeof r === 'object' && ['tracks', 'albums', 'artists'].includes((r as { kind?: string }).kind ?? '') && typeof (r as { from?: unknown }).from === 'string' && typeof (r as { to?: unknown }).to === 'string')
        .slice(0, 500)
        .map((r: NonNullable<Settings['aliases']>[number]) => ({ id: String(r.id ?? crypto.randomUUID()), kind: r.kind, artist: String(r.artist ?? '').slice(0, 300), from: r.from.slice(0, 300), to: r.to.slice(0, 300) }))
    : [];
  const avatar = typeof s.avatar === 'string' && /^[\w-]{1,40}$/.test(s.avatar) ? s.avatar : 'lastfm';
  const settings: Settings = { ...defaults, user: s.user, startDate: s.startDate, timezone: s.timezone, theme: ['light','dark','system'].includes(s.theme) ? s.theme : 'system', deduplicate: s.deduplicate === true, reducedMotion: s.reducedMotion === true, apiKey: '', avatar, aliases };
  const canonical = new Map(makeWeeks(settings).map(w => [w.id, w]));
  const ids = new Set<string>();
  const weeks = data.weeks.map((w: CachedWeek) => {
    const week = canonical.get(w?.week?.id);
    if (!week || ids.has(week.id) || !Array.isArray(w.scrobbles) || !Number.isFinite(w.fetchedAt) || !Number.isFinite(w.cutoff) || w.cutoff < week.start || w.cutoff > week.end) throw new Error('Semana inválida ou duplicada no backup.');
    ids.add(week.id);
    let duplicates = 0;
    const seen = new Set<string>();
    const scrobbles = w.scrobbles.map(s => {
      if (!s || !Number.isInteger(s.timestamp) || s.timestamp < week.start || s.timestamp >= w.cutoff || typeof s.artist !== 'string' || !s.artist || typeof s.track !== 'string' || !s.track || typeof s.album !== 'string') throw new Error('Scrobble inválido no backup.');
      const key = JSON.stringify([s.timestamp, s.artist, s.track, s.album]);
      if (seen.has(key)) duplicates++;
      seen.add(key);
      return { timestamp: s.timestamp, artist: s.artist.slice(0,1000), track: s.track.slice(0,1000), album: s.album.slice(0,1000), image: typeof s.image === 'string' && /^https:\/\//.test(s.image) ? s.image : '' };
    });
    return { key: '', week, scrobbles, fetchedAt: w.fetchedAt, cutoff: w.cutoff, duplicates };
  });
  // Profile is refetched rather than trusting arbitrary imported links or metadata.
  return { settings, weeks, profile: null };
}
