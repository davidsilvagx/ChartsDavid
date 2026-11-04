import { useEffect, useMemo, useRef, useState } from 'react';
import { Clock3, Database, ExternalLink, PencilLine, RotateCcw, Square, Tags } from 'lucide-react';
import { enrichItems, formatDuration, listeningTime, loadMetadata, metaKey, saveReview, versionLabels, type EffectiveMeta, type EnrichProgress, type VersionTag } from '../lib/metadata';
import { formatDateBR } from '../lib/calendar';
import type { CachedWeek, Item, Kind, Settings, SourceFilter } from '../lib/types';
import { Cover, Modal, MusicLoader, number } from './UI';
import { emptyMetaFilter, UNKNOWN, type MetaFilter } from '../lib/metaFilter';

const kindLabel: Record<Kind, string> = { tracks: 'músicas', albums: 'álbuns', artists: 'artistas' };

/** F03/F04: catálogo verificado com procedência e tempo estimado com cobertura explícita. */
export function CatalogPanel({ kind, library, cached, settings, source, filter, onFilter, onMeta }: {
  kind: Kind; library: Item[]; cached: CachedWeek[]; settings: Settings; source: SourceFilter; filter: MetaFilter;
  onFilter: (f: MetaFilter) => void; onMeta: (meta: Map<string, EffectiveMeta>) => void;
}) {
  const [meta, setMeta] = useState<Map<string, EffectiveMeta>>(new Map()), [trackMeta, setTrackMeta] = useState<Map<string, EffectiveMeta>>(new Map());
  const [progress, setProgress] = useState<EnrichProgress | null>(null), [error, setError] = useState(''), [count, setCount] = useState(20), [useLastfm, setUseLastfm] = useState(true);
  const [year, setYear] = useState('all'), [review, setReview] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const reload = async () => { const [current, tracks] = await Promise.all([loadMetadata(kind), kind === 'tracks' ? null : loadMetadata('tracks')]); setMeta(current); setTrackMeta(tracks ?? current); onMeta(current); };
  useEffect(() => { void reload().catch(() => setError('Não foi possível ler os metadados salvos neste aparelho.')); return () => controller.current?.abort(); }, [kind]);

  const top = useMemo(() => library.slice(0, 200), [library]);
  const known = top.filter(item => meta.has(metaKey(kind, item)));
  const withGenre = top.filter(item => meta.get(metaKey(kind, item))?.genre);
  const genres = useMemo(() => { const map = new Map<string, number>(); for (const item of library) { const g = meta.get(metaKey(kind, item))?.genre; if (g) map.set(g, (map.get(g) ?? 0) + 1); } return [...map].sort((a, b) => b[1] - a[1]); }, [library, meta, kind]);
  const decades = useMemo(() => [...new Set(library.map(item => Number(meta.get(metaKey(kind, item))?.releaseDate?.slice(0, 4))).filter(y => y > 1900).map(y => Math.floor(y / 10) * 10))].sort((a, b) => b - a), [library, meta, kind]);
  const versions = useMemo(() => [...new Set(library.flatMap(item => meta.get(metaKey(kind, item))?.versions ?? []))], [library, meta, kind]);
  const years = useMemo(() => [...new Set(cached.map(w => w.week.year))].sort((a, b) => b - a), [cached]);
  const time = useMemo(() => { const weeks = cached.filter(w => year === 'all' || w.week.year === Number(year)); return listeningTime(weeks, trackMeta, { deduplicate: settings.deduplicate, source }); }, [cached, trackMeta, year, settings.deduplicate, source]);

  const run = async (items: Item[], targetKind: Kind, refresh = false) => {
    controller.current?.abort(); const abort = new AbortController(); controller.current = abort; setError('');
    try {
      await enrichItems(targetKind, items, { signal: abort.signal, onProgress: setProgress, refresh, apiKey: settings.apiKey, useLastfm: targetKind === 'tracks' && useLastfm, known: targetKind === kind ? meta : trackMeta });
    } catch (e) { if (!abort.signal.aborted) setError(e instanceof Error ? e.message : 'Consulta interrompida.'); }
    finally { setProgress(null); await reload().catch(() => {}); }
  };
  const pending = top.slice(0, count).filter(item => !meta.has(metaKey(kind, item)));
  const missingTracks = time.missing.map(m => library.find(i => i.artist === m.artist && i.name === m.track) ?? { id: `t:${m.artist}:${m.track}`, name: m.track, artist: m.artist, album: '', image: '', plays: m.plays });

  return <section className="panel catalog-panel" aria-label="Gêneros, lançamentos e tempo ouvido">
    <div className="panel-heading"><div><span className="eyebrow">CATÁLOGO VERIFICADO</span><h2><Tags size={19} /> Gêneros, lançamentos e tempo</h2><p>Dados do catálogo iTunes (Apple) e, para duração, do Last.fm. Cada item guarda fonte, data da consulta e confiança. Sem dado = desconhecido.</p></div></div>
    <div className="catalog-grid">
      <div className="catalog-card">
        <h3><Database size={17} /> Cobertura de {kindLabel[kind]}</h3>
        <p><strong>{withGenre.length}</strong> com gênero · <strong>{known.length}</strong> consultados, entre os {Math.min(200, library.length)} mais ouvidos.</p>
        {progress ? <div className="catalog-progress" role="status"><MusicLoader size="sm" /><span>{progress.done}/{progress.total} · {progress.current ? `consultando ${progress.current}` : 'preparando'}{progress.waitingMs ? ' (respeitando o limite do catálogo)' : ''}</span><progress max={progress.total || 1} value={progress.done} /><button type="button" className="button small" onClick={() => controller.current?.abort()}><Square size={13} /><span>Cancelar</span></button></div>
          : <div className="catalog-actions"><label>Consultar<select aria-label="Quantidade de itens para consultar" value={count} onChange={e => setCount(Number(e.target.value))}>{[10, 20, 50, 100].map(n => <option key={n} value={n}>Top {n}</option>)}</select></label>
            <button type="button" className="button small primary" disabled={!pending.length || !navigator.onLine} onClick={() => void run(pending, kind)}><span>{pending.length ? `Consultar ${pending.length} itens · ~${Math.ceil(pending.length * 3.3 / 60)} min` : 'Top já consultado'}</span></button>
            {kind === 'tracks' && <label className="switch-row compact"><input type="checkbox" checked={useLastfm} onChange={e => setUseLastfm(e.target.checked)} /><span>Conferir duração no Last.fm</span></label>}
            <button type="button" className="text-button" onClick={() => setReview(true)}><PencilLine size={14} /> Revisar e corrigir</button></div>}
        {error && <p className="alert error" role="alert">{error}</p>}
        <small>Uma consulta a cada ~3 s para respeitar o limite público do catálogo. Você pode sair da tela; o que já foi salvo fica no aparelho.</small>
      </div>
      <div className="catalog-card">
        <h3><Clock3 size={17} /> Tempo estimado ouvido</h3>
        <label className="inline-select">Período<select aria-label="Período do tempo ouvido" value={year} onChange={e => setYear(e.target.value)}><option value="all">Todo o histórico baixado</option>{years.map(y => <option key={y} value={y}>{y}</option>)}</select></label>
        <strong className="insight-big">{time.timed ? formatDuration(time.ms) : '—'}</strong>
        <p>Soma das durações catalogadas de {number(time.timed)} de {number(time.scrobbles)} scrobbles ({(time.coverage * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% com duração confirmada). Os outros ficam fora da soma.</p>
        <small>Estimativa pela duração da faixa: um scrobble não comprova quanto da música foi realmente reproduzido. Plays espelhados entre Spotify e Last.fm não contam duas vezes.{time.conflicts ? ` ${number(time.conflicts)} plays com durações em conflito aguardam revisão.` : ''}{time.ambiguous ? ` ${number(time.ambiguous)} plays de gravações homônimas aguardam escolha.` : ''}</small>
        {!!missingTracks.length && !progress && <button type="button" className="button small" disabled={!navigator.onLine} onClick={() => void run(missingTracks.slice(0, 12), 'tracks')}><span>Buscar duração das {Math.min(12, missingTracks.length)} músicas mais ouvidas sem duração</span></button>}
      </div>
    </div>
    {(genres.length > 0 || decades.length > 0) && <div className="catalog-filters" role="group" aria-label="Filtrar acervo por metadados">
      <label>Gênero<select aria-label="Filtrar por gênero" value={filter.genre} onChange={e => onFilter({ ...filter, genre: e.target.value })}><option value="">Todos</option>{genres.map(([g, n]) => <option key={g} value={g}>{g} ({n})</option>)}<option value={UNKNOWN}>Desconhecido</option></select></label>
      <label>Lançamento<select aria-label="Filtrar por década de lançamento" value={filter.decade} onChange={e => onFilter({ ...filter, decade: e.target.value })}><option value="">Todas as épocas</option>{decades.map(d => <option key={d} value={d}>Anos {d}</option>)}<option value={UNKNOWN}>Data desconhecida</option></select></label>
      <label>Versão<select aria-label="Filtrar por tipo de versão" value={filter.version} onChange={e => onFilter({ ...filter, version: e.target.value as VersionTag | '' })}><option value="">Todas</option>{versions.map(v => <option key={v} value={v}>{versionLabels[v]}</option>)}</select></label>
      {(filter.genre || filter.decade || filter.version) && <button type="button" className="text-button" onClick={() => onFilter(emptyMetaFilter)}><RotateCcw size={14} /> Limpar</button>}
      <small>Gênero do {kind === 'artists' ? 'artista (não de cada faixa)' : kind === 'albums' ? 'álbum' : 'catálogo da gravação'}; versões vêm de marcadores no título (ao vivo, remaster, remix…).</small>
    </div>}
    {review && <ReviewModal kind={kind} items={top} meta={meta} onClose={() => setReview(false)} onSaved={() => void reload()} />}
  </section>;
}

function ReviewModal({ kind, items, meta, onClose, onSaved }: { kind: Kind; items: Item[]; meta: Map<string, EffectiveMeta>; onClose: () => void; onSaved: () => void }) {
  const [query, setQuery] = useState(''), [editing, setEditing] = useState<string | null>(null), [form, setForm] = useState({ genre: '', date: '', duration: '' }), [error, setError] = useState('');
  const list = items.filter(item => meta.has(metaKey(kind, item)) && `${item.name} ${item.artist}`.toLowerCase().includes(query.toLowerCase())).slice(0, 60);
  const start = (item: Item) => { const r = meta.get(metaKey(kind, item))!; setEditing(r.key); setError(''); setForm({ genre: r.genre ?? '', date: r.releaseDate ? formatDateBR(r.releaseDate) : '', duration: r.durationMs ? `${Math.floor(r.durationMs / 60000)}:${String(Math.round(r.durationMs / 1000) % 60).padStart(2, '0')}` : '' }); };
  const submit = async (key: string) => {
    setError('');
    let releaseDate: string | undefined, durationMs: number | null | undefined;
    if (form.date.trim()) { const m = /^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/.exec(form.date.trim()); if (!m) { setError('Data no formato dd/mm/aa.'); return; } releaseDate = `${m[3].length === 2 ? `${Number(m[3]) > 40 ? '19' : '20'}${m[3]}` : m[3]}-${m[2]}-${m[1]}`; } else releaseDate = '';
    if (kind === 'tracks') { if (form.duration.trim()) { const m = /^(\d{1,3}):([0-5]\d)$/.exec(form.duration.trim()); if (!m || (Number(m[1]) === 0 && Number(m[2]) === 0)) { setError('Duração em minutos:segundos, ex.: 3:25.'); return; } durationMs = (Number(m[1]) * 60 + Number(m[2])) * 1000; } else durationMs = null; }
    await saveReview(key, { genre: form.genre.trim().slice(0, 80), releaseDate, ...(kind === 'tracks' ? { durationMs } : {}), reviewedAt: Date.now(), note: 'Revisão manual identificada' });
    setEditing(null); onSaved();
  };
  return <Modal title="Revisar metadados" subtitle="Corrija gênero, lançamento ou duração. Revisões ficam marcadas como suas e podem ser desfeitas." onClose={onClose} wide>
    <label className="field-label">Buscar<input type="search" aria-label="Buscar item consultado" value={query} onChange={e => setQuery(e.target.value)} placeholder="Título ou artista" /></label>
    {!list.length && <p className="note">Nenhum item consultado ainda. Use “Consultar” no painel do Acervo.</p>}
    <ul className="review-list">{list.map(item => { const r = meta.get(metaKey(kind, item))!; return <li key={r.key}>
      <Cover item={item} /><div className="truncate"><strong>{item.name}</strong><small>{item.artist}</small>
        <small className={`meta-status ${r.status}`}>{r.status === 'matched' ? `${r.match === 'exact' ? 'Correspondência exata' : 'Variação de título'} · confiança ${r.confidence}` : r.status === 'ambiguous' ? 'Ambígua' : r.status === 'not-found' ? 'Não encontrado no catálogo' : 'Erro na consulta'} · {r.source} · {new Date(r.fetchedAt).toLocaleDateString('pt-BR')}{r.reviewed ? ' · revisado por você' : ''}</small>
        <small>{r.genre ?? 'Gênero desconhecido'} · {r.releaseDate ? formatDateBR(r.releaseDate) : 'lançamento desconhecido'}{kind === 'tracks' ? ` · ${r.durationMs ? `${Math.floor(r.durationMs / 60000)}:${String(Math.round(r.durationMs / 1000) % 60).padStart(2, '0')} (${r.durationSource ?? 'revisão'})` : 'sem duração'}` : ''}{r.versions.length ? ` · ${r.versions.map(v => versionLabels[v]).join(', ')}` : ''}</small>
        {r.note && <small className="note">{r.note}</small>}</div>
      <div className="review-actions">{r.url && <a className="icon-button" href={r.url} target="_blank" rel="noreferrer" aria-label={`Abrir ${item.name} no catálogo`}><ExternalLink size={14} /></a>}<button type="button" className="icon-button" aria-label={`Editar ${item.name}`} onClick={() => start(item)}><PencilLine size={14} /></button>{r.reviewed && <button type="button" className="icon-button" aria-label={`Desfazer revisão de ${item.name}`} onClick={async () => { await saveReview(r.key, null); onSaved(); }}><RotateCcw size={14} /></button>}</div>
      {editing === r.key && <form className="review-form" onSubmit={e => { e.preventDefault(); void submit(r.key); }}>
        <input aria-label="Gênero" placeholder="Gênero (ex.: R&B/Soul)" value={form.genre} onChange={e => setForm({ ...form, genre: e.target.value })} />
        <input aria-label="Lançamento dd/mm/aa" placeholder="Lançamento dd/mm/aa" inputMode="numeric" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
        {kind === 'tracks' && <input aria-label="Duração m:ss" placeholder="Duração m:ss" inputMode="numeric" value={form.duration} onChange={e => setForm({ ...form, duration: e.target.value })} />}
        <button type="submit" className="button small primary">Salvar revisão</button><button type="button" className="button small" onClick={() => setEditing(null)}>Cancelar</button>
        {error && <p className="alert error" role="alert">{error}</p>}
      </form>}
    </li>; })}</ul>
  </Modal>;
}
