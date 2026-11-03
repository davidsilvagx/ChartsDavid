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
  const spotifyClientId = typeof s.spotifyClientId === 'string' ? s.spotifyClientId.slice(0, 120) : '';
  const googleClientId = typeof s.googleClientId === 'string' ? s.googleClientId.slice(0, 180) : '';
  const settings: Settings = { ...defaults, user: s.user, startDate: s.startDate, timezone: s.timezone, theme: ['light','dark','system'].includes(s.theme) ? s.theme : 'system', deduplicate: s.deduplicate === true, reducedMotion: s.reducedMotion === true, apiKey: '', avatar, aliases, spotifyClientId, googleClientId };
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
      const source = s.source === 'spotify' || s.source === 'ytmusic' ? s.source : undefined;
      const key = JSON.stringify([s.timestamp, s.artist, s.track, s.album, source ?? 'lastfm']);
      if (seen.has(key)) duplicates++;
      seen.add(key);
      return { timestamp: s.timestamp, artist: s.artist.slice(0,1000), track: s.track.slice(0,1000), album: s.album.slice(0,1000), image: typeof s.image === 'string' && /^https:\/\//.test(s.image) ? s.image : '', ...(source ? { source } : {}) };
    });
    return { key: '', week, scrobbles, fetchedAt: w.fetchedAt, cutoff: w.cutoff, duplicates };
  });
  // Profile is refetched rather than trusting arbitrary imported links or metadata.
  return { settings, weeks, profile: null };
}

/** A single-page PDF embeds the same designed card as a JPEG, preserving artwork and type. */
export async function shareCardPDF(png: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(png);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width; canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas indisponível.');
  ctx.drawImage(bitmap, 0, 0); bitmap.close();
  const jpeg = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('Falha ao gerar PDF.')), 'image/jpeg', .94));
  const bytes = new Uint8Array(await jpeg.arrayBuffer());
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = []; const offsets = [0]; let length = 0;
  const append = (v: string | Uint8Array) => { const b = typeof v === 'string' ? encoder.encode(v) : v; parts.push(b); length += b.length; };
  const object = (id: number, body: string) => { offsets[id] = length; append(`${id} 0 obj\n${body}\nendobj\n`); };
  append('%PDF-1.4\n');
  object(1, '<< /Type /Catalog /Pages 2 0 R >>');
  object(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  object(3, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 540 675] /Resources << /XObject << /Card 4 0 R >> >> /Contents 5 0 R >>');
  offsets[4] = length;
  append(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytes.length} >>\nstream\n`);
  append(bytes); append('\nendstream\nendobj\n');
  const commands = 'q 540 0 0 675 0 0 cm /Card Do Q\n';
  object(5, `<< /Length ${encoder.encode(commands).length} >>\nstream\n${commands}endstream`);
  const xref = length;
  append(`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(n => `${String(n).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return new Blob(parts as BlobPart[], { type: 'application/pdf' });
}
