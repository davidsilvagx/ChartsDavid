import { getLibrary, normalize, selectScrobblesForFilter } from './charts';
import { metaKey, type EffectiveMeta } from './metadata';
import type { CachedWeek, Settings, SourceFilter } from './types';

export interface Mission { id: string; name: string; group: string; criterion: string; target: number; value: number; unit: string; level: number; needsMetadata: boolean }
const fandoms = [
  ['Lady Gaga', 'Little Monster'], ['Taylor Swift', 'Swiftie'], ['Beyoncé', 'BeyHive'], ['Rihanna', 'Navy'],
  ['Katy Perry', 'KatyCat'], ['Ariana Grande', 'Arianator'], ['Britney Spears', 'Britney Army'], ['Madonna', 'Material Icon'],
  ['Dua Lipa', 'Future Nostalgia'], ['Sabrina Carpenter', 'Espresso Club'], ['Olivia Rodrigo', 'GUTS Club'], ['Chappell Roan', 'Pink Pony Club'],
  ['Charli XCX', 'Angel'], ['Billie Eilish', 'Ocean Eyes'], ['Lana Del Rey', 'Sad Girl Summer'], ['Miley Cyrus', 'Smiler'],
  ['Demi Lovato', 'Lovatic'], ['Selena Gomez', 'Selenator'], ['Christina Aguilera', 'Fighter'], ['Shakira', 'Loba'],
  ['Anitta', 'Anitter'], ['Pabllo Vittar', 'Vittar Lover'], ['Gloria Groove', 'Lady Leste'], ['Ludmilla', 'Numanice Club'],
  ['IZA', 'Dona de Mim'], ['Marina', 'Primadonna'], ['Lauren Jauregui', 'Expectations'], ['Fifth Harmony', 'Harmonizer'],
  ['Little Mix', 'Mixer'], ['BLACKPINK', 'BLINK'], ['BTS', 'ARMY'], ['TWICE', 'ONCE'],
  ['Harry Styles', 'Golden Club'], ['One Direction', 'Directioner'], ['The Weeknd', 'XO'], ['Bruno Mars', 'Hooligan'],
  ['Michael Jackson', 'Moonwalker'], ['Whitney Houston', 'Voz de Diamante'], ['Mariah Carey', 'Lamb'], ['Céline Dion', 'Power of Love'],
  ['ABBA', 'Dancing Queen'], ['Queen', 'Champions'], ['Paramore', 'Still Into You'], ['Rosalía', 'Motomami'], ['Karol G', 'Bichota'],
] as const;
const genres: Array<[string, string, RegExp]> = [
  ['pop', 'Pop é meu sobrenome', /\bpop\b/i], ['rock', 'Rockstar Energy', /rock/i], ['dance', 'Pista liberada', /dance|electronic|house/i],
  ['rnb', 'R&B na veia', /r&b|soul/i], ['hiphop', 'Flow de milhões', /hip.hop|rap/i], ['country', 'Cowboy Era', /country/i],
  ['latin', 'Sabor latino', /latin|reggaeton/i], ['jazz', 'Jazz & Chill', /jazz/i], ['classical', 'Dramática de orquestra', /classical|clássic/i],
  ['brazil', 'Jeitinho Brasileiro', /brazil|brasil|mpb|samba|bossa nova|forr[oó]|sertanejo|pagode|ax[eé]/i],
  ['kpop', 'Seoul do meu coração', /k.pop/i], ['alternative', 'Indie darling', /alternative|indie/i],
];

/** No guessed nationality, releases or minutes. Only confirmed catalog values contribute. */
export function buildMissions(cached: CachedWeek[], settings: Settings, source: SourceFilter, metadata: Map<string, EffectiveMeta>): Mission[] {
  const closed = cached.filter(c => c.week.end <= Date.now() / 1000);
  const tracks = getLibrary(closed, 'tracks', settings.deduplicate, settings.aliases, source);
  const artists = getLibrary(closed, 'artists', settings.deduplicate, settings.aliases, source);
  const albums = getLibrary(closed, 'albums', settings.deduplicate, settings.aliases, source);
  const artistPlays = new Map(artists.map(a => [normalize(a.artist), a.plays]));
  const result: Mission[] = [];
  const add = (id: string, name: string, group: string, targets: number[], value: number, unit: string, criterion: string, needsMetadata = false) => targets.forEach((target, level) => result.push({ id: `${id}-${target}`, name: `${name} · ${['Bronze', 'Prata', 'Ouro', 'Diamante'][level]}`, group, criterion: criterion.replace('{n}', target.toLocaleString('pt-BR')), target, value, unit, level, needsMetadata }));
  for (const [artist, title] of fandoms) add(`fandom-${normalize(artist)}`, title, 'Fandoms', [25, 100, 500, 2000], artistPlays.get(normalize(artist)) ?? 0, 'plays', `Ouvir {n} músicas de ${artist} em semanas encerradas.`);
  const verified = tracks.flatMap(t => { const m = metadata.get(metaKey('tracks', t)); return m?.status === 'matched' && (m.match === 'exact' || m.reviewed) ? [{ t, m }] : []; });
  const genreLabels: Record<string, string> = { pop: 'Pop', rock: 'Rock', dance: 'Dance, Electronic ou House', rnb: 'R&B ou Soul', hiphop: 'Hip-Hop ou Rap', country: 'Country', latin: 'Latin ou Reggaeton', jazz: 'Jazz', classical: 'Classical ou Clássico', brazil: 'brasileiro: MPB, samba, bossa nova, forró, sertanejo, pagode, axé, Brazil ou Brasil', kpop: 'K-Pop', alternative: 'Alternative ou Indie' };
  for (const [id, title, pattern] of genres) add(`genre-${id}`, title, 'Gêneros', [25, 100, 500], verified.reduce((n, { t, m }) => n + (m.genre && pattern.test(m.genre) ? t.plays : 0), 0), 'plays', `Ouvir {n} músicas com gênero ${genreLabels[id]} confirmado no catálogo. Cada reprodução conta uma vez por missão.`, true);
  for (let decade = 1950; decade <= 2020; decade += 10) add(`decade-${decade}`, `De Volta aos Anos ${String(decade).slice(-2)}`, 'Décadas', [25, 100, 500], verified.reduce((n, { t, m }) => { const y = Number(m.releaseDate?.slice(0, 4)); return n + (y >= decade && y < decade + 10 ? t.plays : 0); }, 0), 'plays', `Ouvir {n} músicas com lançamento confirmado entre ${decade} e ${decade + 9}. Reedições seguem a data da edição do catálogo.`, true);
  const scrobbles = closed.flatMap(w => selectScrobblesForFilter(w.scrobbles, settings.deduplicate, source, w.week.start, w.week.end));
  const clock = new Intl.DateTimeFormat('en-CA', { timeZone: settings.timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' });
  const days = new Set<string>(); let night = 0, morning = 0;
  for (const s of scrobbles) { const parts = Object.fromEntries(clock.formatToParts(new Date(s.timestamp * 1000)).map(p => [p.type, p.value])); days.add(`${parts.year}-${parts.month}-${parts.day}`); const hour = Number(parts.hour); if (hour < 6) night++; if (hour >= 6 && hour < 12) morning++; }
  const minutes = verified.reduce((n, { t, m }) => n + (!m.durationConflict && m.durationMs && Number.isFinite(m.durationMs) && m.durationMs >= 1000 && m.durationMs <= 4 * 3600_000 ? t.plays * m.durationMs / 60000 : 0), 0);
  add('plays', 'Main Pop Listener', 'Marcos', [100, 1000, 10000, 100000], scrobbles.length, 'plays', 'Registrar {n} reproduções em semanas encerradas.');
  add('artists', 'Line-up de festival', 'Marcos', [10, 50, 200, 1000], artists.length, 'artistas', 'Ouvir {n} artistas diferentes.');
  add('tracks', 'Playlist sem fim', 'Marcos', [50, 250, 1000, 5000], tracks.length, 'músicas', 'Ouvir {n} músicas diferentes, respeitando as versões do acervo.');
  add('albums', 'Album Era', 'Marcos', [10, 50, 200, 1000], albums.length, 'álbuns', 'Ouvir faixas de {n} álbuns identificados no histórico.');
  add('days', 'Presença VIP', 'Hábitos', [7, 30, 100, 365], days.size, 'dias', 'Ouvir música em {n} dias diferentes no seu fuso.');
  add('night', 'After Hours', 'Hábitos', [25, 100, 500, 2000], night, 'plays', 'Ouvir {n} músicas entre 00h e 05h59 no seu fuso.');
  add('morning', 'Bom dia, headliner', 'Hábitos', [25, 100, 500, 2000], morning, 'plays', 'Ouvir {n} músicas entre 06h e 11h59 no seu fuso.');
  add('weeks', 'World Tour', 'Marcos', [4, 12, 52, 200], closed.filter(w => w.scrobbles.length > 0).length, 'semanas', 'Ter música registrada em {n} semanas encerradas.');
  add('minutes', 'Tempo de diva', 'Tempo de reprodução', [60, 600, 6000, 60000], Math.floor(minutes), 'min', 'Somar {n} minutos de catálogo: duração confirmada × plays. Não mede o tempo real de execução; faixas sem duração ficam de fora.', true);
  add('replay', 'Replay de milhões', 'Hábitos', [10, 50, 100, 500], tracks.reduce((max, t) => Math.max(max, t.plays), 0), 'plays', 'Ouvir uma mesma música {n} vezes.');
  return result;
}

export function missionBadge(m: Mission, owner: string): Blob {
  const escape = (v: string) => v.replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]!);
  const unlocked = m.value >= m.target;
  return new Blob([`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080"><defs><radialGradient id="g"><stop stop-color="#174b40"/><stop offset="1" stop-color="#080e18"/></radialGradient><linearGradient id="a"><stop stop-color="#66ffc2"/><stop offset="1" stop-color="#b8a4ff"/></linearGradient></defs><rect width="1080" height="1080" rx="72" fill="url(#g)"/><path d="M540 160 720 270 690 490 540 610 390 490 360 270Z" fill="none" stroke="url(#a)" stroke-width="12"/><text x="540" y="430" text-anchor="middle" fill="#66ffc2" font-family="sans-serif" font-size="130">${unlocked ? '★' : '☆'}</text><text x="540" y="680" text-anchor="middle" fill="#66ffc2" font-family="sans-serif" font-size="24">${unlocked ? 'CONQUISTA DESBLOQUEADA' : 'MINHA PRÓXIMA ERA'}</text><text x="540" y="745" text-anchor="middle" fill="white" font-family="sans-serif" font-size="36">${escape(m.name)}</text><text x="540" y="810" text-anchor="middle" fill="#c4d4db" font-family="sans-serif" font-size="28">${escape(owner)} · ${Math.min(m.value, m.target)} / ${m.target} ${escape(m.unit)}</text><text x="540" y="976" text-anchor="middle" fill="#93a5b0" font-family="sans-serif" font-size="22">LASTCHART · SUA MÚSICA, SEUS TROFÉUS</text></svg>`], { type: 'image/svg+xml' });
}

export async function missionPNG(m: Mission, owner: string): Promise<Blob> {
  const url = URL.createObjectURL(missionBadge(m, owner));
  try {
    const image = new Image(); image.src = url; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1080;
    const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Não foi possível criar o selo.');
    ctx.drawImage(image, 0, 0);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Não foi possível criar o selo.')), 'image/png'));
  } finally { URL.revokeObjectURL(url); }
}
