import { useEffect, useState } from 'react';
import { Award, Download, LockKeyhole, Search, Share2, Trophy } from 'lucide-react';
import { missionBadge, missionPNG, type Mission } from '../lib/missions';
import { loadMetadata, type EffectiveMeta } from '../lib/metadata';
import { download } from '../lib/export';
import type { CachedWeek, Settings, SourceFilter } from '../lib/types';
import { MusicLoader, number } from './UI';

export function Achievements({ cached, settings, source }: { cached: CachedWeek[]; settings: Settings; source: SourceFilter }) {
  const [meta, setMeta] = useState(new Map<string, EffectiveMeta>()), [group, setGroup] = useState('Todas'), [query, setQuery] = useState(''), [filter, setFilter] = useState('all'), [notice, setNotice] = useState(''), [limit, setLimit] = useState(36);
  useEffect(() => { let active = true; void loadMetadata('tracks').then(m => { if (active) setMeta(m); }).catch(() => {}); return () => { active = false; }; }, [cached]);
  const [missions, setMissions] = useState<Mission[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState('');
  useEffect(() => {
    setLoading(true); setError('');
    const worker = new Worker(new URL('../workers/missions.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => { setLoading(false); if (data.error) setError(data.error); else setMissions(data.missions); worker.terminate(); };
    worker.onerror = () => { setLoading(false); setError('Não foi possível calcular as conquistas. Tente reabrir a coleção.'); worker.terminate(); };
    worker.postMessage({ cached, settings, source, meta }); return () => worker.terminate();
  }, [cached, settings, source, meta]);
  const unlocked = missions.filter(m => m.value >= m.target).length;
  const [exporting, setExporting] = useState('');
  const visible = missions.filter(m => (group === 'Todas' || m.group === group) && `${m.name} ${m.criterion}`.toLowerCase().includes(query.toLowerCase()) && (filter === 'all' || (m.value >= m.target) === (filter === 'unlocked')));
  const share = async (m: Mission) => { setExporting(m.id); try { const text = `${m.name}: ${m.criterion} Meu progresso: ${Math.min(m.value, m.target)}/${m.target} ${m.unit}. #LastChart`; const file = new File([await missionPNG(m, settings.user)], `lastchart-${m.id}.png`, { type: 'image/png' }); if (navigator.canShare?.({ files: [file] })) await navigator.share({ title: m.name, text, files: [file] }); else if (navigator.share) await navigator.share({ title: m.name, text }); else { await navigator.clipboard.writeText(text); setNotice('Conquista copiada. Bora mostrar pro fandom!'); } } catch (e) { if (!(e instanceof DOMException && e.name === 'AbortError')) setNotice('Compartilhamento indisponível. Você pode baixar o selo.'); } finally { setExporting(''); } };
  const savePNG = async (m: Mission) => { setExporting(m.id); try { download(await missionPNG(m, settings.user), `lastchart-${m.id}.png`); } catch { setNotice('Não foi possível gerar o PNG. Use a opção SVG.'); } finally { setExporting(''); } };
  return <section className="achievements"><div className="collection-hero"><Trophy size={40}/><div><span className="eyebrow">HALL DA FAMA PESSOAL</span><h3>Sua música vale troféu.</h3><p>{unlocked} de {missions.length} conquistas · {number(unlocked * 10)} pontos de fã</p></div><progress value={unlocked} max={missions.length} aria-label="Conquistas desbloqueadas"/></div>
    <p className="note">Só semanas encerradas contam. Gêneros, décadas e minutos usam o catálogo consultado no Acervo; sem metadados, o progresso dessas missões fica incompleto. Os pontos são pessoais, sem raridades inventadas.</p>
    <div className="mission-filters"><label className="search-field"><Search size={16}/><input aria-label="Buscar conquista" placeholder="Seu fandom, uma era, um desafio…" value={query} onChange={e => { setQuery(e.target.value); setLimit(36); }}/></label><select aria-label="Grupo de conquistas" value={group} onChange={e => { setGroup(e.target.value); setLimit(36); }}>{['Todas', ...new Set(missions.map(m => m.group))].map(g => <option key={g}>{g}</option>)}</select><select aria-label="Estado da conquista" value={filter} onChange={e => { setFilter(e.target.value); setLimit(36); }}><option value="all">Toda a coleção</option><option value="unlocked">Desbloqueadas</option><option value="locked">Próximas conquistas</option></select></div>
    {notice && <p role="status">{notice}</p>}{error && <p role="alert">{error}</p>}{loading && <div className="spotlight-loading" role="status"><MusicLoader size="sm"/> Preparando sua coleção…</div>}
    <div className="mission-grid">{visible.slice(0, limit).map(m => { const done = m.value >= m.target; return <article key={m.id} className={`mission-card tier-${m.level} ${done ? 'unlocked' : ''}`}><div className="mission-top"><span>{m.group}</span>{done ? <Trophy size={16}/> : <LockKeyhole size={16}/>}</div><div className="mission-seal" aria-hidden="true"><Award size={36}/><b>{['I', 'II', 'III', 'IV'][m.level]}</b></div><h4>{m.name}</h4><p>{m.criterion}</p><progress value={Math.min(m.value, m.target)} max={m.target} aria-label={`Progresso de ${m.name}`}/><small>{number(Math.min(m.value, m.target))} / {number(m.target)} {m.unit} · {done ? '10 pontos ✦' : `${Math.floor(Math.min(100, m.value / m.target * 100))}%`}</small><div className="inline-actions"><button type="button" className="button small" disabled={!!exporting} onClick={() => void savePNG(m)}><Download size={14}/> {exporting === m.id ? 'Criando…' : 'Selo PNG'}</button><button type="button" className="text-button" onClick={() => download(missionBadge(m, settings.user), `lastchart-${m.id}.svg`)}>SVG</button><button type="button" className="icon-button" aria-label={`Compartilhar ${m.name}`} disabled={!!exporting} onClick={() => void share(m)}><Share2 size={16}/></button></div></article>; })}</div>
    {!visible.length && <p className="note">Nenhuma conquista com esse filtro. Tente outro fandom ou grupo.</p>}{visible.length > limit && <button type="button" className="button load-more" onClick={() => setLimit(n => n + 36)}>Mais 36 conquistas</button>}
  </section>;
}
