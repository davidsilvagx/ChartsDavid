import { useEffect, useMemo, useRef, useState } from 'react';
import { Album, CalendarDays, Clock3, Compass, Download, Flame, Gauge, Globe2, Heart, Moon, Palette, Radar, Repeat2, Sparkles, Sun, Sunrise, Users, Zap } from 'lucide-react';
import { Temporal } from '@js-temporal/polyfill';
import { AXES, PERSONAS, genreBadge, musicalSign, popularityBadge, type AxisId, type Badge, type ProfileResult } from '../lib/profile';
import { loadMetadata, type EffectiveMeta } from '../lib/metadata';
import { makeWeeks } from '../lib/calendar';
import { normalize } from '../lib/charts';
import { api } from '../lib/api';
import { getMeta, putMeta } from '../lib/storage';
import { cacheImageUrl } from '../lib/canvas';
import { download, shareCardPDF } from '../lib/export';
import type { CachedWeek, Item, Settings, SourceFilter } from '../lib/types';
import { Cover, MusicLoader, number, useArtworkUrl } from './UI';
import { PersonaCrest } from './Emblems';

type Unit = 'week' | 'month' | 'year' | 'all';
const badgeIcons: Record<string, typeof Moon> = { owl: Moon, dawn: Sunrise, work: Sun, night: Moon, weekend: CalendarDays, nonstop: Zap, daily: Heart, occasional: Clock3, marathon: Flame, superfan: Heart, palette: Palette, radar: Radar, genre: Album, underground: Compass, between: Globe2, stadium: Users };
const skillIcons: Record<string, typeof Moon> = { devotion: Heart, constancy: CalendarDays, marathon: Flame, replay: Repeat2, album: Album, discovery: Radar, history: Clock3 };
const pct = (v: number) => `${Math.round(v * 100)}%`;

export function MusicProfile({ cached, settings, source, library, owner, dark }: { cached: CachedWeek[]; settings: Settings; source: SourceFilter; library: Item[]; owner: string; dark: boolean }) {
  const weeks = useMemo(() => makeWeeks(settings).filter(w => cached.some(c => c.week.id === w.id)), [settings.startDate, settings.timezone, cached]);
  const months = useMemo(() => [...new Set(weeks.map(w => w.id.slice(0, 7)))].sort().reverse(), [weeks]);
  const years = useMemo(() => [...new Set(weeks.map(w => w.year))].sort((a, b) => b - a), [weeks]);
  const [unit, setUnit] = useState<Unit>('year');
  const [value, setValue] = useState('');
  const options = unit === 'week' ? [...weeks].reverse().map(w => ({ id: w.id, label: `Sem. ${w.number} · ${w.label}` })) : unit === 'month' ? months.map(m => ({ id: m, label: new Date(`${m}-15T12:00:00Z`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }) })) : unit === 'year' ? years.map(y => ({ id: String(y), label: String(y) })) : [{ id: 'all', label: 'Todo o histórico' }];
  const current = options.find(o => o.id === value) ?? options[0];
  const range = useMemo(() => {
    if (!current) return null;
    const tz = settings.timezone, epoch = (d: Temporal.PlainDate) => Number(d.toZonedDateTime(tz).epochMilliseconds) / 1000;
    if (unit === 'week') { const w = weeks.find(x => x.id === current.id)!; return { start: w.start, end: Math.min(w.end, Date.now() / 1000) }; }
    if (unit === 'month') { const d = Temporal.PlainDate.from(`${current.id}-01`); return { start: epoch(d), end: Math.min(epoch(d.add({ months: 1 })), Date.now() / 1000) }; }
    if (unit === 'year') { const d = Temporal.PlainDate.from(`${current.id}-01-01`); return { start: epoch(d), end: Math.min(epoch(d.add({ years: 1 })), Date.now() / 1000) }; }
    return { start: weeks[0]?.start ?? 0, end: Date.now() / 1000 };
  }, [current?.id, unit, weeks, settings.timezone]);

  const [result, setResult] = useState<ProfileResult | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [trackMeta, setTrackMeta] = useState<Map<string, EffectiveMeta>>(new Map());
  const [popularity, setPopularity] = useState<Badge | null>(null), [measuring, setMeasuring] = useState(false), [exporting, setExporting] = useState(false);
  useEffect(() => { void loadMetadata('tracks').then(setTrackMeta).catch(() => {}); }, []);
  useEffect(() => {
    if (!range) return;
    let active = true; setLoading(true); setError(''); setPopularity(null);
    const worker = new Worker(new URL('../workers/profile.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => { if (!active) return; setLoading(false); if (data.error) setError(data.error); else setResult(data.result); worker.terminate(); };
    worker.onerror = () => { if (active) { setLoading(false); setError('Não foi possível calcular o perfil.'); } worker.terminate(); };
    worker.postMessage({ cached, options: { ...range, timeZone: settings.timezone, deduplicate: settings.deduplicate, source } });
    return () => { active = false; worker.terminate(); };
  }, [range?.start, range?.end, cached, source, settings.deduplicate, settings.timezone]);

  const persona = result?.code ? PERSONAS[result.code] : null;
  const sign = useMemo(() => result ? musicalSign(result) : null, [result]);
  const badges = useMemo(() => { if (!result) return []; const g = genreBadge(result.topTracks, trackMeta, result.plays); return [...result.badges, ...(g ? [g] : []), ...(popularity ? [popularity] : [])]; }, [result, trackMeta, popularity]);
  const imageFor = (artist: string) => library.find(i => normalize(i.artist) === normalize(artist) && i.image)?.image ?? '';
  const signTarget = sign ? { id: JSON.stringify(['artists', normalize(sign.artist)]), name: sign.artist, artist: sign.artist, album: '', image: imageFor(sign.artist) } : null;
  const heroArt = useArtworkUrl(signTarget);

  const measure = async () => {
    if (!result) return; setMeasuring(true);
    try {
      const listeners: number[] = [];
      for (const a of result.topArtists.slice(0, 8)) {
        const key = `artist-pop:v1:${normalize(a.name)}`;
        const hit = await getMeta<{ n: number; at: number }>(key).catch(() => undefined);
        if (hit && Date.now() - hit.at < 7 * 86400_000) { listeners.push(hit.n); continue; }
        const body = await api<{ artist?: { stats?: { listeners?: string } } }>('artist.getInfo', { artist: a.name }, settings.apiKey).catch(() => null);
        const n = Number(body?.artist?.stats?.listeners);
        if (Number.isFinite(n) && n > 0) { listeners.push(n); void putMeta(key, { n, at: Date.now() }).catch(() => {}); }
      }
      setPopularity(popularityBadge(listeners));
      if (listeners.length < 3) setError('O Last.fm não retornou ouvintes suficientes para medir a popularidade.');
    } finally { setMeasuring(false); }
  };

  const share = async (pdf: boolean) => {
    if (!result || !persona) return; setExporting(true);
    try { const png = await renderProfileCard({ owner, period: current?.label ?? '', result, persona, sign, badges, art: heroArt, dark }); download(pdf ? await shareCardPDF(png) : png, `lastchart-perfil.${pdf ? 'pdf' : 'png'}`); }
    catch { setError('Não foi possível criar o card.'); } finally { setExporting(false); }
  };

  return <div className="music-profile">
    <div className="profile-period" role="group" aria-label="Período do perfil">
      <div className="segmented compact-seg">{([['week', 'Semana'], ['month', 'Mês'], ['year', 'Ano'], ['all', 'Tudo']] as const).map(([u, label]) => <button key={u} type="button" className={unit === u ? 'selected' : ''} aria-pressed={unit === u} onClick={() => { setUnit(u); setValue(''); }}>{label}</button>)}</div>
      {unit !== 'all' && <select aria-label="Escolher período" value={current?.id ?? ''} onChange={e => setValue(e.target.value)}>{options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</select>}
    </div>
    {error && <p className="alert error" role="alert">{error}</p>}
    {loading ? <div className="spotlight-loading" role="status"><MusicLoader size="md" /><span>Lendo seus hábitos de audição…</span></div> : !result || result.insufficient || !persona ? <p className="note">{result?.insufficient ?? 'Sem dados baixados neste período.'} Escolha um período maior ou sincronize mais semanas.</p> : <>
      <section className="profile-hero" key={`${result.code}-${current?.id}`}>
        {heroArt && <div className="profile-hero-art" aria-hidden="true"><img src={heroArt} alt="" /></div>}
        <PersonaCrest code={result.code!} size={128} title={`Emblema: ${persona.name}`} />
        <div className="profile-hero-copy">
          <span className="eyebrow"><Sparkles size={13} /> SEU PERFIL MUSICAL · {current?.label}</span>
          <h3>{persona.name}</h3>
          <p>{persona.tagline}</p>
          <div className="profile-code">{(Object.keys(AXES) as AxisId[]).map((id, i) => <span key={id} title={result.axes[id] >= AXES[id].threshold ? AXES[id].highLabel : AXES[id].lowLabel}><b>{result.code![i]}</b>{result.axes[id] >= AXES[id].threshold ? AXES[id].highLabel : AXES[id].lowLabel}</span>)}</div>
          <small>{owner} · {number(result.plays)} reproduções · {number(result.artists)} artistas · música em {result.activeDays} de {result.days} dias</small>
        </div>
      </section>

      <section className="profile-axes" aria-label="Os quatro eixos">
        {(Object.keys(AXES) as AxisId[]).map((id, i) => { const axis = AXES[id], v = result.axes[id], high = v >= axis.threshold; return <div className="axis-row" key={id} style={{ animationDelay: `${i * 90}ms` }}>
          <div className="axis-labels"><span className={!high ? 'on' : ''}>{axis.lowLabel}</span><span className={high ? 'on' : ''}>{axis.highLabel}</span></div>
          <div className="axis-track" role="img" aria-label={`${axis.metric}: ${pct(v)} (corte em ${pct(axis.threshold)})`}><i style={{ ['--v' as string]: `${Math.min(100, v * 100)}%` }} /><b style={{ left: `${axis.threshold * 100}%` }} /></div>
          <small>{axis.metric}: <strong>{pct(v)}</strong> · corte em {pct(axis.threshold)}</small>
        </div>; })}
      </section>

      {sign && signTarget && <section className="sign-card" aria-label="Signo musical">
        <div className="sign-head"><div className="sign-cover"><Cover item={signTarget} size="large" /></div><div><span className="eyebrow"><Gauge size={13} /> SEU SIGNO MUSICAL</span><h3>{sign.artist}</h3><p>{sign.reason}</p></div></div>
        <SkillTree sign={sign} target={signTarget} />
        <small className="note">O signo é escolhido entre os seus 12 artistas mais ouvidos no período: 55% pela fatia de reproduções e 45% pela semelhança entre como você ouve esse artista e como ouve música em geral.</small>
      </section>}

      <section className="profile-badges" aria-label="Selos">
        <h4>Selos do período</h4>
        <div className="badge-grid">{badges.length ? badges.map((b, i) => { const Icon = badgeIcons[b.id] ?? Sparkles; return <div className="badge-tile" key={b.id} style={{ animationDelay: `${120 + i * 70}ms` }}><span className="badge-icon"><Icon size={18} /></span><strong>{b.label}</strong><small>{b.detail}</small></div>; }) : <p className="note">Nenhum selo neste período: seus hábitos ficaram no meio-termo em todos os critérios.</p>}</div>
        {!popularity && <button type="button" className="button small" disabled={measuring || !navigator.onLine} onClick={() => void measure()}>{measuring ? <MusicLoader size="sm" /> : <Globe2 size={15} />}<span>Medir popularidade dos seus artistas (Last.fm)</span></button>}
      </section>

      <section className="profile-clock" aria-label="Relógio de audição">
        <h4><Clock3 size={16} /> Relógio de audição <small>({settings.timezone})</small></h4>
        <div className="clock-bars">{result.hours.map((n, h) => <div key={h} title={`${String(h).padStart(2, '0')}h: ${n} reproduções`}><i style={{ height: `${Math.max(3, n / Math.max(1, ...result.hours) * 100)}%` }} /><span>{h % 6 === 0 ? `${String(h).padStart(2, '0')}h` : ''}</span></div>)}</div>
        <small>{pct(result.weekendShare)} no fim de semana · maior sequência: {result.streak.count} plays de {result.streak.artist}</small>
      </section>

      <details className="period-help"><summary>Os 16 perfis e como calculamos</summary>
        <p>Cada eixo compara uma medida dos seus scrobbles com um corte fixo (mostrado nas barras). A combinação dos quatro dá um dos 16 perfis. Os selos usam horários no seu fuso, dias com música, sequências e, quando disponíveis, gêneros verificados e ouvintes do Last.fm. Nada é inventado: sem dados suficientes, o perfil não é calculado.</p>
        <div className="persona-gallery">{Object.entries(PERSONAS).map(([code, p]) => <div key={code} className={code === result.code ? 'is-you' : ''}><PersonaCrest code={code} size={54} animate={false} /><span><strong>{p.name}</strong><small>{code} · {p.tagline}</small></span></div>)}</div>
      </details>
      <div className="spotlight-export"><span>Compartilhar seu perfil</span><button type="button" className="button small" disabled={exporting} onClick={() => void share(false)}>{exporting ? <MusicLoader size="sm" /> : <Download size={15} />}<span>Card PNG</span></button><button type="button" className="button small" disabled={exporting} onClick={() => void share(true)}>PDF</button></div>
    </>}
  </div>;
}

function SkillTree({ sign, target }: { sign: NonNullable<ReturnType<typeof musicalSign>>; target: { id: string; name: string; artist: string; album: string; image: string } }) {
  const [open, setOpen] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const positions = [[17, 76], [50, 84], [83, 76], [17, 26], [50, 16], [83, 26]];
  const active = sign.skills.find(s => s.id === open);
  return <div className="skill-wrap"><div className="skill-tree" ref={ref}>
    <svg className="skill-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">{sign.skills.map((s, i) => <path key={s.id} d={`M50 52 Q ${(50 + positions[i][0]) / 2} ${positions[i][1] > 52 ? 66 : 38} ${positions[i][0]} ${positions[i][1]}`} className={s.level ? 'lit' : ''} style={{ animationDelay: `${i * 80}ms` }} />)}</svg>
    <div className="skill-root"><Cover item={target} round /></div>
    {sign.skills.map((s, i) => { const Icon = skillIcons[s.id] ?? Sparkles; return <button type="button" key={s.id} className={`skill-node ${s.level ? 'lit' : 'locked'} ${open === s.id ? 'open' : ''}`} style={{ left: `${positions[i][0]}%`, top: `${positions[i][1]}%`, animationDelay: `${200 + i * 90}ms` }} aria-expanded={open === s.id} aria-label={`${s.name}: nível ${s.level} de 5. ${s.detail}`} onClick={() => setOpen(open === s.id ? null : s.id)}>
      <span className="skill-icon"><Icon size={17} /></span><strong>{s.name}</strong><span className="pips" aria-hidden="true">{Array.from({ length: 5 }, (_, k) => <i key={k} className={k < s.level ? 'on' : ''} />)}</span>
    </button>; })}
  </div>
    <p className="skill-detail" aria-live="polite">{active ? <><strong>{active.name} · nível {active.level}/5.</strong> {active.detail}</> : 'Toque em uma habilidade para ver o motivo.'}</p>
  </div>;
}

async function renderProfileCard({ owner, period, result, persona, sign, badges, art, dark }: { owner: string; period: string; result: ProfileResult; persona: { name: string; tagline: string }; sign: ReturnType<typeof musicalSign>; badges: Badge[]; art: string; dark: boolean }) {
  const canvas = document.createElement('canvas'); canvas.width = 1080; canvas.height = 1350;
  const ctx = canvas.getContext('2d')!;
  await Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 1200))]);
  const cover = await cacheImageUrl(art);
  const bg = dark ? '#090e17' : '#f3f5fa', fg = dark ? '#f6f8fc' : '#111c2e', muted = dark ? '#a3b3c8' : '#586a80', accent = dark ? '#43dfa1' : '#067a60';
  ctx.fillStyle = bg; ctx.fillRect(0, 0, 1080, 1350);
  if (cover) { ctx.save(); ctx.globalAlpha = .42; ctx.filter = 'blur(44px)'; ctx.drawImage(cover, -160, -60, 1400, 1400); ctx.restore(); }
  const fade = ctx.createLinearGradient(0, 0, 0, 1350); fade.addColorStop(0, dark ? 'rgba(9,14,23,.15)' : 'rgba(243,245,250,.2)'); fade.addColorStop(1, dark ? 'rgba(9,14,23,.9)' : 'rgba(243,245,250,.88)'); ctx.fillStyle = fade; ctx.fillRect(0, 0, 1080, 1350);
  // Reaproveita o emblema já desenhado na tela (sem renderizador extra no pacote).
  const node = document.querySelector('.profile-hero svg.persona-crest');
  const crestSvg = node ? new XMLSerializer().serializeToString(node).replace(/ class="[^"]*"/, '') : '';
  const crest = new Image(); if (crestSvg) crest.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(crestSvg)}`;
  await crest.decode().catch(() => {});
  const font = (w: number, s: number) => `${w} ${s}px 'Plus Jakarta Sans',sans-serif`;
  const text = (value: string, x: number, y: number, width: number) => { let s = value; while (s.length > 1 && ctx.measureText(s).width > width) s = s.slice(0, -1); ctx.fillText(s === value ? s : `${s.slice(0, -1)}…`, x, y); };
  ctx.fillStyle = accent; ctx.font = font(800, 23); ctx.fillText('LASTCHART · PERFIL MUSICAL', 64, 76);
  ctx.fillStyle = muted; ctx.font = font(500, 22); text(`${owner} · ${period}`, 64, 116, 950);
  if (crest.complete && crest.naturalWidth) ctx.drawImage(crest, 64, 150, 300, 300);
  ctx.fillStyle = fg; ctx.font = font(800, 54); text(persona.name, 396, 270, 640);
  ctx.fillStyle = muted; ctx.font = font(500, 24);
  const words = persona.tagline.split(' '); let line = '', y = 320;
  for (const w of words) { if (ctx.measureText(`${line} ${w}`).width > 620) { ctx.fillText(line, 396, y); line = w; y += 34; } else line = line ? `${line} ${w}` : w; }
  ctx.fillText(line, 396, y);
  (Object.keys(AXES) as AxisId[]).forEach((id, i) => {
    const axis = AXES[id], v = result.axes[id], top = 520 + i * 92;
    ctx.fillStyle = fg; ctx.font = font(700, 22); ctx.fillText(`${axis.lowLabel}  ·  ${axis.highLabel}`, 64, top);
    ctx.fillStyle = dark ? 'rgba(255,255,255,.1)' : 'rgba(15,23,42,.1)'; ctx.beginPath(); ctx.roundRect(64, top + 18, 952, 14, 7); ctx.fill();
    ctx.fillStyle = accent; ctx.beginPath(); ctx.roundRect(64, top + 18, Math.max(14, 952 * Math.min(1, v)), 14, 7); ctx.fill();
    ctx.fillStyle = muted; ctx.font = font(600, 18); ctx.fillText(`${Math.round(v * 100)}%`, 64, top + 58);
  });
  if (sign) { ctx.fillStyle = accent; ctx.font = font(800, 22); ctx.fillText('SIGNO MUSICAL', 64, 940); ctx.fillStyle = fg; ctx.font = font(800, 40); text(sign.artist, 64, 990, 950); ctx.fillStyle = muted; ctx.font = font(500, 21); text(sign.skills.filter(s => s.level).sort((a, b) => b.level - a.level).slice(0, 3).map(s => `${s.name} ${s.level}/5`).join(' · '), 64, 1030, 950); }
  ctx.fillStyle = fg; ctx.font = font(700, 22); text(badges.slice(0, 4).map(b => b.label).join(' · '), 64, 1110, 950);
  ctx.fillStyle = muted; ctx.font = font(500, 18); ctx.fillText(`${result.plays.toLocaleString('pt-BR')} reproduções · ${result.artists.toLocaleString('pt-BR')} artistas · dados do histórico baixado`, 64, 1270);
  ctx.globalAlpha = .65; ctx.font = font(500, 15); ctx.fillText('feito com ❤️ por william santos', 64, 1313); ctx.globalAlpha = 1;
  return new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('card')), 'image/png'));
}

