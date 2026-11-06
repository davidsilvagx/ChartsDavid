import { useMemo, useState } from 'react';
import { History, ArrowRight } from 'lucide-react';
import { makeWeeks } from '../lib/calendar';
import { closedCache } from '../lib/closedWeeks';
import { getLibrary, normalize } from '../lib/charts';
import type { CachedWeek, Settings, SourceFilter } from '../lib/types';
import { number } from './UI';

export function PastSelf({ cached, settings, source }: { cached: CachedWeek[]; settings: Settings; source: SourceFilter }) {
  const [size, setSize] = useState(4), [past, setPast] = useState('');
  const calendar = useMemo(() => makeWeeks(settings).filter(w => !w.partial), [settings.startDate, settings.timezone, cached]);
  const windows = useMemo(() => { const out = []; for (let end = calendar.length; end > 0; end -= size) { const weeks = calendar.slice(Math.max(0, end - size), end); out.push({ id: weeks[0].id, label: `${weeks[0].label.split(' — ')[0]} — ${weeks.at(-1)!.label.split(' — ')[1]}`, weeks }); } return out; }, [calendar, size]);
  const current = windows[0], previous = windows.slice(1).find(w => w.id === past) ?? windows[1];
  const compare = useMemo(() => {
    if (!current || !previous) return null;
    const data = closedCache(calendar, cached), ids = new Set(data.map(w => w.week.id));
    const summarize = (window: typeof current) => { const wanted = new Set(window.weeks.map(w => w.id)); const rows = data.filter(w => wanted.has(w.week.id)); const artists = getLibrary(rows, 'artists', settings.deduplicate, settings.aliases, source); const total = artists.reduce((n, a) => n + a.plays, 0); return { artists, total, loaded: window.weeks.filter(w => ids.has(w.id)).length, weeks: window.weeks.length }; };
    const now = summarize(current), before = summarize(previous);
    const old = new Map(before.artists.map(a => [normalize(a.artist), a]));
    const overlap = now.artists.reduce((n, a) => n + Math.min(a.plays / Math.max(1, now.total), (old.get(normalize(a.artist))?.plays ?? 0) / Math.max(1, before.total)), 0);
    const changes = now.artists.slice(0, 5).map(a => ({ name: a.artist, share: a.plays / Math.max(1, now.total) * 100, old: (old.get(normalize(a.artist))?.plays ?? 0) / Math.max(1, before.total) * 100 }));
    const newFaces = now.artists.filter(a => !old.has(normalize(a.artist))).slice(0, 3);
    const loyal = now.artists.filter(a => old.has(normalize(a.artist))).slice(0, 3);
    return { now, before, overlap, changes, newFaces, loyal };
  }, [cached, calendar, current, previous, settings.deduplicate, settings.aliases, source]);
  return <section className="past-self"><div className="panel-heading"><div><span className="eyebrow"><History size={14}/> MEU EU DO PASSADO</span><h3>Mudou de era ou segue fiel?</h3></div></div><p>Seu bloco mais recente de semanas encerradas versus uma fase anterior. A participação de cada artista permite comparar blocos com volumes diferentes.</p><div className="mission-filters"><label>Blocos de<select aria-label="Tamanho dos períodos da comparação" value={size} onChange={e => { setSize(Number(e.target.value)); setPast(''); }}><option value={1}>1 semana</option><option value={4}>4 semanas</option><option value={13}>13 semanas</option><option value={52}>52 semanas</option></select></label><label>Voltar para<select aria-label="Período anterior" value={previous?.id ?? ''} onChange={e => setPast(e.target.value)}>{windows.slice(1).map(w => <option key={w.id} value={w.id}>{w.label}</option>)}</select></label></div>
    {!compare || !current || !previous ? <p className="note">Precisamos de dois blocos de semanas encerradas para comparar suas eras.</p> : <><div className="era-summary"><div><small>ERA ANTERIOR · {previous.label}</small><strong>{number(compare.before.total)} plays</strong><small>{compare.before.loaded}/{compare.before.weeks} semanas baixadas</small></div><ArrowRight size={20}/><div><small>ERA MAIS RECENTE · {current.label}</small><strong>{number(compare.now.total)} plays</strong><small>{compare.now.loaded}/{compare.now.weeks} semanas baixadas</small></div></div>
    {compare.before.loaded < compare.before.weeks || compare.now.loaded < compare.now.weeks ? <p className="note">A comparação está incompleta: faltam semanas baixadas. Ausências podem ser lacunas do histórico.</p> : null}
    {!compare.before.total || !compare.now.total ? <p className="note">Um dos períodos não tem reproduções disponíveis. Sincronize ou escolha outra era.</p> : <><p className="era-overlap"><strong>{Math.round(compare.overlap * 100)}%</strong> da mistura de artistas segue em comum.</p><div className="era-changes">{compare.changes.map(a => <div key={a.name}><strong>{a.name}</strong><span>{a.old.toFixed(1)}% <ArrowRight size={12}/> {a.share.toFixed(1)}%</span><small>{a.share - a.old >= 0 ? '+' : ''}{(a.share - a.old).toFixed(1)} pontos percentuais</small></div>)}</div><p><strong>Não estavam na era anterior:</strong> {compare.newFaces.map(a => a.artist).join(', ') || 'Seu line-up segue fiel.'}</p><p><strong>Seguem no seu coração:</strong> {compare.loyal.map(a => a.artist).join(', ') || 'Uma era de mudanças.'}</p></>}
    </>}
  </section>;
}
