import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, Download, Info, ListChecks, Plus, Search, Sparkles, Star, Trash2, Wand2 } from 'lucide-react';
import { GRAMMY_EDITION, grammyAreas, grammyById, grammyCategories, needLabels, searchCategories, subjectLabels, type GrammyArea } from '../lib/grammy';
import { ballotKey, categoryOrder, ceremonyReadiness, emptyBallot, freezeCeremony, manualNominee, nomineeFromItem, sanitizeBallot, subjectKind, suggestNominees, type Ballot, type BallotEntry, type RevealCard } from '../lib/ballot';
import type { EffectiveMeta } from '../lib/metadata';
import type { Item, Kind } from '../lib/types';
import { Cover, MusicLoader, number } from './UI';
import { GramophoneIcon } from './Gramophone';
import { Ceremony } from './Ceremony';

type Pools = Partial<Record<Kind, Item[]>>;
type MetaPools = Partial<Record<Kind, Map<string, EffectiveMeta>>>;
const kindNames: Record<Kind, string> = { tracks: 'músicas', albums: 'álbuns', artists: 'artistas' };

function useBallot(profile: string, period: string) {
  const key = ballotKey(profile, period);
  const read = () => { try { return sanitizeBallot(JSON.parse(localStorage.getItem(key) ?? 'null'), profile, period); } catch { return emptyBallot(profile, period); } };
  const [ballot, setBallot] = useState<Ballot>(read);
  useEffect(() => { setBallot(read()); }, [key]);
  const save = (next: Ballot) => { const value = { ...next, updatedAt: Date.now() }; setBallot(value); try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* armazenamento cheio: mantém em memória */ } };
  return [ballot, save] as const;
}

export function Awards({ profile, period, periodLabel, title, pools, meta, loading, error, reduced, onExport }: {
  profile: string; period: string; periodLabel: string; title: string; pools: Pools | null; meta: MetaPools; loading: boolean; error: string; reduced: boolean;
  onExport: (card: RevealCard, pdf: boolean) => Promise<void>;
}) {
  const [ballot, save] = useBallot(profile, period);
  const [step, setStep] = useState<'catalog' | 'ballot' | 'ceremony'>('ballot');
  const [query, setQuery] = useState(''), [area, setArea] = useState<GrammyArea | 'all'>('all'), [onlyFav, setOnlyFav] = useState(false);
  const [ceremony, setCeremony] = useState<RevealCard[] | null>(null), [exporting, setExporting] = useState(false), [exportId, setExportId] = useState('');
  const favorites = useMemo(() => new Set(ballot.favorites), [ballot.favorites]);
  const selected = useMemo(() => new Set(ballot.selected), [ballot.selected]);
  const visible = useMemo(() => searchCategories(query, area, onlyFav ? favorites : undefined), [query, area, onlyFav, favorites]);
  const readiness = useMemo(() => ceremonyReadiness(ballot), [ballot]);
  const orderedSelected = useMemo(() => [...ballot.selected].sort((a, b) => (categoryOrder.get(a) ?? 0) - (categoryOrder.get(b) ?? 0)), [ballot.selected]);
  const frozenForExport = useMemo(() => freezeCeremony(ballot), [ballot]);

  const toggle = (list: 'selected' | 'favorites', id: string) => save({ ...ballot, [list]: ballot[list].includes(id) ? ballot[list].filter(v => v !== id) : [...ballot[list], id] });
  const setEntry = (id: string, entry: BallotEntry | null) => { const entries = { ...ballot.entries }; if (entry) entries[id] = { ...entry, updatedAt: Date.now() }; else delete entries[id]; save({ ...ballot, entries }); };

  return <div className="awards">
    <div className="awards-intro"><GramophoneIcon size={44} /><div><h3>Premiação pessoal · {GRAMMY_EDITION.label}</h3><p>Categorias com os nomes do Grammy (traduzidos e com o nome oficial). Você vota; o app sugere candidatos só com critérios explícitos. Simulação independente, sem vínculo com a Recording Academy.</p></div></div>
    <div className="awards-steps" role="tablist" aria-label="Etapas da premiação">
      {([['catalog', 'Categorias', `${ballot.selected.length}/100`], ['ballot', 'Cédula', `${readiness.ready.length} prontas`], ['ceremony', 'Cerimônia', readiness.ready.length ? 'revisar' : '—']] as const).map(([value, label, hint]) =>
        <button key={value} role="tab" type="button" aria-selected={step === value} className={`awards-step ${step === value ? 'active' : ''}`} onClick={() => setStep(value)}><strong>{label}</strong><small>{hint}</small></button>)}
    </div>
    {error && <p className="alert error" role="alert">{error}</p>}

    {step === 'catalog' && <section className="awards-catalog" aria-label="Catálogo de categorias">
      <div className="awards-filters">
        <label className="search-field"><Search size={16} /><input type="search" aria-label="Buscar categoria" placeholder="Buscar: Álbum do Ano, R&B, Song…" value={query} onChange={e => setQuery(e.target.value)} /></label>
        <select aria-label="Área do catálogo" value={area} onChange={e => setArea(e.target.value as GrammyArea | 'all')}><option value="all">Todas as áreas</option>{Object.entries(grammyAreas).map(([id, a]) => <option key={id} value={id}>{a.label}</option>)}</select>
        <button type="button" className={`button small ${onlyFav ? 'primary' : ''}`} aria-pressed={onlyFav} onClick={() => setOnlyFav(!onlyFav)}><Star size={14} /><span>Favoritas</span></button>
      </div>
      <p className="note">{visible.length} de 100 categorias · {ballot.selected.length} na sua cerimônia. Toque no nome para incluir ou retirar.</p>
      {(Object.keys(grammyAreas) as GrammyArea[]).map(areaId => {
        const list = visible.filter(c => c.area === areaId);
        if (!list.length) return null;
        return <details className="awards-area" key={areaId} open={!!query || area !== 'all' || onlyFav || areaId === 'general'}>
          <summary><span>{grammyAreas[areaId].label}</span><small lang="en">{grammyAreas[areaId].official}</small><b>{list.filter(c => selected.has(c.id)).length}/{list.length}</b><ChevronDown size={16} /></summary>
          <ul>{list.map(category => <li key={category.id} className={selected.has(category.id) ? 'is-selected' : ''}>
            <button type="button" className="awards-pick" aria-pressed={selected.has(category.id)} onClick={() => toggle('selected', category.id)}>
              <i aria-hidden="true">{selected.has(category.id) && <Check size={13} />}</i>
              <span><strong>{category.label}{category.change === 'new' && <em className="tag">novo em 2027</em>}</strong><small lang="en">{category.official}</small><small>{subjectLabels[category.subject]}{category.needs.length ? ` · ${category.needs.map(n => needLabels[n]).join('; ')}` : ''}</small></span>
            </button>
            <button type="button" className={`icon-button ${favorites.has(category.id) ? 'is-favorite' : ''}`} aria-label={`${favorites.has(category.id) ? 'Remover' : 'Marcar'} ${category.label} como favorita`} aria-pressed={favorites.has(category.id)} onClick={() => toggle('favorites', category.id)}><Star size={15} fill={favorites.has(category.id) ? 'currentColor' : 'none'} /></button>
          </li>)}</ul>
        </details>;
      })}
      {!visible.length && <p className="note">Nenhuma categoria encontrada. Tente “Álbum”, “Canção” ou o nome em inglês.</p>}
    </section>}

    {step === 'ballot' && <section className="awards-ballot" aria-label="Cédula de votação">
      <details className="period-help"><summary>Como votar?</summary><p>Para cada categoria, aceite as sugestões, procure no seu acervo ou digite um indicado manual. Depois marque o vencedor (mais de um vira empate). Sugestões usam reproduções e gênero do catálogo; elas não comprovam créditos, formação, subgênero ou elegibilidade oficial. Período: {periodLabel}.</p></details>
      {loading && <div className="spotlight-loading" role="status"><MusicLoader size="md" /><span>Reunindo músicas, álbuns e artistas do período…</span></div>}
      {!orderedSelected.length && <p className="note">Nenhuma categoria escolhida. Abra Categorias e selecione as que entrarão na sua cerimônia.</p>}
      {orderedSelected.map(id => <BallotCard key={id} categoryId={id} entry={ballot.entries[id]} pools={pools} meta={meta} onChange={entry => setEntry(id, entry)} onRemove={() => toggle('selected', id)} />)}
      {!!orderedSelected.length && <button type="button" className="button primary" onClick={() => setStep('ceremony')}><ListChecks size={16} /><span>Revisar e abrir cerimônia</span></button>}
    </section>}

    {step === 'ceremony' && <section className="awards-review" aria-label="Revisão da cerimônia">
      <h4>Revisão antes da cerimônia</h4>
      <p>{title} · {periodLabel}. O resultado é congelado ao começar: mudanças posteriores não alteram a revelação em andamento.</p>
      <ul className="awards-readiness">
        {readiness.ready.map(id => { const entry = ballot.entries[id]; return <li key={id} className="ok"><Check size={15} /><span><strong>{grammyById.get(id)!.label}</strong><small>{entry.winners.length > 1 ? 'Empate: ' : 'Vencedor: '}{entry.nominees.filter(n => entry.winners.includes(n.id)).map(n => n.name).join(' & ')} · {entry.nominees.length} indicados</small></span></li>; })}
        {readiness.issues.map(issue => <li key={issue.categoryId} className="warn"><Info size={15} /><span><strong>{grammyById.get(issue.categoryId)!.label}</strong><small>{issue.reason} Fica fora da cerimônia até resolver.</small></span></li>)}
      </ul>
      <div className="awards-actions">
        <button type="button" className="button primary" disabled={!readiness.ready.length} onClick={() => setCeremony(freezeCeremony(ballot))}><GramophoneIcon size={19} /><span>Começar cerimônia · {readiness.ready.length} {readiness.ready.length === 1 ? 'categoria' : 'categorias'}</span></button>
        <button type="button" className="button" onClick={() => setStep('ballot')}>Voltar à cédula</button>
      </div>
      {!!frozenForExport.length && <div className="spotlight-export"><span>Card do prêmio</span><label>Categoria<select aria-label="Categoria do card" value={exportId || frozenForExport[0].category.id} onChange={e => setExportId(e.target.value)}>{frozenForExport.map(c => <option key={c.category.id} value={c.category.id}>{c.category.label}</option>)}</select></label>
        {[false, true].map(pdf => <button key={String(pdf)} type="button" className="button small" disabled={exporting} onClick={async () => { const card = frozenForExport.find(c => c.category.id === (exportId || frozenForExport[0].category.id))!; setExporting(true); try { await onExport(card, pdf); } finally { setExporting(false); } }}>{exporting ? <MusicLoader size="sm" /> : <Download size={15} />}<span>{pdf ? 'PDF' : 'PNG'}</span></button>)}
      </div>}
    </section>}
    {ceremony && <Ceremony cards={ceremony} title={title} period={periodLabel} reduced={reduced} onClose={() => setCeremony(null)} />}
  </div>;
}

function BallotCard({ categoryId, entry, pools, meta, onChange, onRemove }: { categoryId: string; entry?: BallotEntry; pools: Pools | null; meta: MetaPools; onChange: (entry: BallotEntry | null) => void; onRemove: () => void }) {
  const category = grammyById.get(categoryId)!;
  const kind = subjectKind(category);
  const [adding, setAdding] = useState<'search' | 'manual' | null>(null), [query, setQuery] = useState(''), [manualName, setManualName] = useState(''), [manualArtist, setManualArtist] = useState('');
  const suggestion = useMemo(() => pools ? suggestNominees(category, pools, meta) : null, [category, pools, meta]);
  const nominees = entry?.nominees ?? [];
  const base: BallotEntry = entry ?? { categoryId, nominees: [], winners: [], method: 'vote', updatedAt: Date.now() };
  const results = useMemo(() => kind && pools?.[kind] && query.trim().length >= 2 ? pools[kind]!.filter(i => `${i.name} ${i.artist}`.toLowerCase().includes(query.toLowerCase()) && !nominees.some(n => n.id === i.id)).slice(0, 8) : [], [kind, pools, query, nominees]);
  const add = (nominee: BallotEntry['nominees'][number]) => { if (nominees.length >= 10) return; onChange({ ...base, nominees: [...nominees, nominee], method: 'vote' }); };
  const ready = !!entry?.winners.length;
  return <article className={`ballot-card ${ready ? 'is-ready' : ''}`}>
    <div className="ballot-head"><div><span className="eyebrow">{grammyAreas[category.area].label}</span><h4>{category.label}</h4><small lang="en">{category.official}</small></div><button type="button" className="icon-button" aria-label={`Retirar ${category.label} da cerimônia`} onClick={onRemove}><Trash2 size={15} /></button></div>
    {!nominees.length && suggestion && <div className="ballot-suggestion">
      {suggestion.nominees.length ? <><p><Wand2 size={14} /> {suggestion.criterion}</p><button type="button" className="button small" onClick={() => onChange({ categoryId, nominees: suggestion.nominees, winners: [], method: 'suggestion', updatedAt: Date.now(), note: suggestion.criterion })}><Sparkles size={14} /><span>Usar {suggestion.nominees.length} sugestões</span></button></>
        : <p className="note">{suggestion.insufficient}</p>}
    </div>}
    {!!nominees.length && <ol className="ballot-nominees">{nominees.map(n => {
      const winner = entry!.winners.includes(n.id);
      return <li key={n.id} className={winner ? 'is-winner' : ''}>
        <button type="button" className="ballot-vote" aria-pressed={winner} aria-label={`${winner ? 'Desmarcar' : 'Escolher'} ${n.name} como vencedor`} onClick={() => onChange({ ...entry!, winners: winner ? entry!.winners.filter(w => w !== n.id) : [...entry!.winners, n.id].slice(-3) })}>{winner ? <GramophoneIcon size={18} /> : <span className="vote-ring" />}</button>
        <Cover item={n} /><span className="truncate"><strong>{n.name}</strong><small>{n.artist}{n.plays ? ` · ${number(n.plays)} plays` : ''}</small><small className="basis">{n.basis}</small></span>
        <button type="button" className="icon-button" aria-label={`Remover indicado ${n.name}`} onClick={() => { const next = nominees.filter(x => x.id !== n.id); onChange(next.length ? { ...entry!, nominees: next, winners: entry!.winners.filter(w => w !== n.id) } : null); }}><Trash2 size={14} /></button>
      </li>;
    })}</ol>}
    {entry?.winners.length ? <p className="ballot-status ok"><Check size={14} /> {entry.winners.length > 1 ? `Empate entre ${entry.winners.length}` : 'Vencedor escolhido'} · {entry.method === 'suggestion' ? 'a partir de sugestões' : 'voto pessoal'}</p> : nominees.length ? <p className="ballot-status">Marque o vencedor tocando no círculo.</p> : null}
    <div className="ballot-add">
      {kind && <button type="button" className="text-button" aria-expanded={adding === 'search'} onClick={() => setAdding(adding === 'search' ? null : 'search')}><Search size={14} /> Procurar {kindNames[kind]}</button>}
      <button type="button" className="text-button" aria-expanded={adding === 'manual'} onClick={() => setAdding(adding === 'manual' ? null : 'manual')}><Plus size={14} /> Indicado manual</button>
    </div>
    {adding === 'search' && kind && <div className="ballot-search"><input type="search" aria-label={`Buscar ${kindNames[kind]} no período`} placeholder={`Nome ou artista (${kindNames[kind]} do período)`} value={query} onChange={e => setQuery(e.target.value)} />
      {!pools ? <MusicLoader size="sm" /> : <ul>{results.map(item => <li key={item.id}><button type="button" onClick={() => { add(nomineeFromItem(item, kind)); setQuery(''); }}><Cover item={item} /><span className="truncate"><strong>{item.name}</strong><small>{item.artist} · {number(item.plays)} plays</small></span><Plus size={14} /></button></li>)}{query.trim().length >= 2 && !results.length && <li className="note">Nada encontrado neste período.</li>}</ul>}
    </div>}
    {adding === 'manual' && <form className="ballot-manual" onSubmit={e => { e.preventDefault(); if (!manualName.trim()) return; add(manualNominee(manualName, manualArtist)); setManualName(''); setManualArtist(''); setAdding(null); }}>
      <input aria-label="Nome do indicado" placeholder={category.subject === 'person' ? 'Nome da pessoa' : 'Título'} value={manualName} maxLength={200} onChange={e => setManualName(e.target.value)} required />
      <input aria-label="Artista ou crédito" placeholder="Artista / crédito (opcional)" value={manualArtist} maxLength={200} onChange={e => setManualArtist(e.target.value)} />
      <button type="submit" className="button small">Adicionar</button>
      <small>Indicações manuais ficam identificadas como suas; o app não verifica créditos ou elegibilidade.</small>
    </form>}
  </article>;
}

export const grammyCount = grammyCategories.length;
