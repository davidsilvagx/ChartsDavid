import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Download, Gavel, Info, ListChecks, Lock, Plus, Search, Sparkles, Star, Trash2, UserRound, Wand2 } from 'lucide-react';
import { ARTIST_OF_YEAR, GRAMMY_EDITION, grammyAreas, awardById, grammyCategories, needLabels, searchCategories, subjectLabels, type GrammyArea } from '../lib/grammy';
import { ballotKey, categoryOrder, ceremonyReadiness, conveneJury, type Eligibility, emptyBallot, freezeCeremony, hasPersonalYearRules, personalEntryIssue, manualNominee, nomineeFromItem, sanitizeBallot, subjectKind, suggestNominees, type Ballot, type BallotEntry, type RevealCard } from '../lib/ballot';
import { artistYearScores, judges, runJury, type ItemStats } from '../lib/jury';
import { personalDebutCheck } from '../lib/awardStats';
import { enrichItems, metaKey, type EffectiveMeta } from '../lib/metadata';
import type { Item, Kind } from '../lib/types';
import { Cover, MusicLoader, number } from './UI';
import { GramophoneIcon } from './Gramophone';
import { Ceremony } from './Ceremony';
import { JurorAvatar } from './Emblems';

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

export function Awards({ profile, period, periodLabel, title, pools, stats, meta, window: periodWindow, apiKey, onMetaRefresh, loading, error, reduced, onExport }: {
  profile: string; period: string; periodLabel: string; title: string; pools: Pools | null; stats: Partial<Record<Kind, Record<string, ItemStats>>>; meta: MetaPools; loading: boolean; error: string; reduced: boolean;
  window: { start: number; end: number; year: number } | null; apiKey: string; onMetaRefresh: () => Promise<void>;
  onExport: (card: RevealCard, pdf: boolean) => Promise<void>;
}) {
  const [ballot, save] = useBallot(profile, period);
  const [step, setStep] = useState<'catalog' | 'ballot' | 'ceremony'>('ballot');
  const [query, setQuery] = useState(''), [area, setArea] = useState<GrammyArea | 'all'>('all'), [onlyFav, setOnlyFav] = useState(false);
  const [ceremony, setCeremony] = useState<RevealCard[] | null>(null), [exporting, setExporting] = useState(false), [exportId, setExportId] = useState('');
  const [juryReport, setJuryReport] = useState<{ decided: number; skipped: Array<{ categoryId: string; reason: string }> } | null>(null), [peek, setPeek] = useState(false);
  const jury = ballot.mode === 'jury';
  // Regras de elegibilidade: janela de lançamento do período (ou qualquer lançamento) e ano de referência.
  const rules: Eligibility = useMemo(() => periodWindow ? { mode: ballot.eligibility, ...periodWindow, period } : { mode: 'any', start: 0, end: Date.now() / 1000, year: period === 'all' ? new Date().getFullYear() : Number(period), period }, [periodWindow?.start, periodWindow?.end, period, ballot.eligibility]);
  const convene = () => { if (!pools) return; const result = conveneJury(ballot, pools, meta, stats, Date.now(), rules); save(result.ballot); setJuryReport({ decided: result.decided, skipped: result.skipped }); setPeek(false); };
  // Um toque só: verifica datas/durações necessárias no catálogo antes de convocar o júri.
  const [pendingConvene, setPendingConvene] = useState(false);
  const [verify, setVerify] = useState<{ done: number; total: number; current?: string } | null>(null);
  const verifyAbort = useRef<AbortController | null>(null);
  useEffect(() => () => verifyAbort.current?.abort(), []);
  const missing = (kind: Kind, n: number, need: (m?: EffectiveMeta) => boolean) => (pools?.[kind] ?? []).slice(0, n).filter(item => { const m = meta[kind]?.get(metaKey(kind, item)); return m?.status !== 'not-found' && need(m); });
  const toVerify = pools ? { tracks: ballot.selected.some(id => subjectKind(awardById.get(id)!) === 'tracks') ? missing('tracks', 25, m => !m?.releaseDate || !m?.durationMs) : [], albums: ballot.selected.some(id => subjectKind(awardById.get(id)!) === 'albums') ? missing('albums', 15, m => !m?.releaseDate) : [] } : null;
  const verifyCount = toVerify ? toVerify.tracks.length + toVerify.albums.length : 0;
  useEffect(() => { if (pendingConvene && !verify) { setPendingConvene(false); convene(); } }, [pendingConvene, verify, meta]);
  const conveneSmart = () => { if (verifyCount > 0 && navigator.onLine) { setPendingConvene(true); void runVerify(); } else convene(); };
  const runVerify = async () => {
    if (!toVerify) return;
    verifyAbort.current?.abort(); const abort = new AbortController(); verifyAbort.current = abort;
    let base = 0; setVerify({ done: 0, total: verifyCount });
    try {
      for (const kind of ['tracks', 'albums'] as const) {
        const items = toVerify[kind];
        await enrichItems(kind, items, { signal: abort.signal, refresh: true, apiKey, onProgress: p => setVerify({ done: base + p.done, total: verifyCount, current: p.current }) });
        base += items.length;
        await onMetaRefresh();
      }
    } catch { /* cancelado: o que já foi consultado fica salvo */ } finally { await onMetaRefresh(); setVerify(null); }
  };
  const favorites = useMemo(() => new Set(ballot.favorites), [ballot.favorites]);
  const selected = useMemo(() => new Set(ballot.selected), [ballot.selected]);
  const visible = useMemo(() => searchCategories(query, area, onlyFav ? favorites : undefined, true), [query, area, onlyFav, favorites]);
  const ruleIssues = useMemo(() => Object.fromEntries(Object.values(ballot.entries).flatMap(entry => { const reason = personalEntryIssue(entry, pools, stats, rules); return reason ? [[entry.categoryId, reason]] : []; })), [ballot, pools, stats, rules]);
  const readiness = useMemo(() => ceremonyReadiness(ballot, ruleIssues), [ballot, ruleIssues]);
  const orderedSelected = useMemo(() => [...ballot.selected].sort((a, b) => (categoryOrder.get(a) ?? 0) - (categoryOrder.get(b) ?? 0)), [ballot.selected]);
  const frozenForExport = useMemo(() => freezeCeremony(ballot, ruleIssues), [ballot, ruleIssues]);

  const toggle = (list: 'selected' | 'favorites', id: string) => save({ ...ballot, [list]: ballot[list].includes(id) ? ballot[list].filter(v => v !== id) : [...ballot[list], id] });
  const setEntry = (id: string, entry: BallotEntry | null) => { const entries = { ...ballot.entries }; if (entry) entries[id] = { ...entry, updatedAt: Date.now() }; else delete entries[id]; save({ ...ballot, entries }); };

  return <div className="awards">
    <div className="awards-intro"><GramophoneIcon size={44} /><div><h3>Premiação pessoal · {GRAMMY_EDITION.label}</h3><p>Categorias com os nomes do Grammy (traduzidos e com o nome oficial). Você vota; o app sugere candidatos só com critérios explícitos. Simulação independente, sem vínculo com a Recording Academy.</p></div></div>
    <div className="awards-steps" role="tablist" aria-label="Etapas da premiação">
      {([['catalog', 'Categorias', `${ballot.selected.length} escolhidas`], ['ballot', 'Cédula', `${readiness.ready.length} prontas`], ['ceremony', 'Cerimônia', readiness.ready.length ? 'revisar' : '—']] as const).map(([value, label, hint]) =>
        <button key={value} role="tab" type="button" aria-selected={step === value} className={`awards-step ${step === value ? 'active' : ''}`} onClick={() => setStep(value)}><strong>{label}</strong><small>{hint}</small></button>)}
    </div>
    {error && <p className="alert error" role="alert">{error}</p>}

    {step === 'catalog' && <section className="awards-catalog" aria-label="Catálogo de categorias">
      <div className="awards-filters">
        <label className="search-field"><Search size={16} /><input type="search" aria-label="Buscar categoria" placeholder="Buscar: Álbum do Ano, R&B, Song…" value={query} onChange={e => setQuery(e.target.value)} /></label>
        <select aria-label="Área do catálogo" value={area} onChange={e => setArea(e.target.value as GrammyArea | 'all')}><option value="all">Todas as áreas</option>{Object.entries(grammyAreas).map(([id, a]) => <option key={id} value={id}>{a.label}</option>)}</select>
        <button type="button" className={`button small ${onlyFav ? 'primary' : ''}`} aria-pressed={onlyFav} onClick={() => setOnlyFav(!onlyFav)}><Star size={14} /><span>Favoritas</span></button>
      </div>
      <p className="note">{visible.length} de 101 categorias (100 do Grammy + Artista do Ano, exclusiva LastChart) · {ballot.selected.length} na sua cerimônia. Toque no nome para incluir ou retirar.</p>
      {(Object.keys(grammyAreas) as GrammyArea[]).map(areaId => {
        const list = visible.filter(c => c.area === areaId);
        if (!list.length) return null;
        return <details className="awards-area" key={areaId} open={!!query || area !== 'all' || onlyFav || areaId === 'general'}>
          <summary><span>{grammyAreas[areaId].label}</span><small lang="en">{grammyAreas[areaId].official}</small><b>{list.filter(c => selected.has(c.id)).length}/{list.length}</b><ChevronDown size={16} /></summary>
          <ul>{list.map(category => <li key={category.id} className={selected.has(category.id) ? 'is-selected' : ''}>
            <button type="button" className="awards-pick" aria-pressed={selected.has(category.id)} onClick={() => toggle('selected', category.id)}>
              <i aria-hidden="true">{selected.has(category.id) && <Check size={13} />}</i>
              <span><strong>{category.label}{category.personal && <em className="tag">LastChart</em>}{category.change === 'new' && <em className="tag">novo em 2027</em>}</strong><small lang="en">{category.official}</small><small>{subjectLabels[category.subject]}{category.needs.length ? ` · ${category.needs.map(n => needLabels[n]).join('; ')}` : ''}</small></span>
            </button>
            <button type="button" className={`icon-button ${favorites.has(category.id) ? 'is-favorite' : ''}`} aria-label={`${favorites.has(category.id) ? 'Remover' : 'Marcar'} ${category.label} como favorita`} aria-pressed={favorites.has(category.id)} onClick={() => toggle('favorites', category.id)}><Star size={15} fill={favorites.has(category.id) ? 'currentColor' : 'none'} /></button>
          </li>)}</ul>
        </details>;
      })}
      {!visible.length && <p className="note">Nenhuma categoria encontrada. Tente “Álbum”, “Canção” ou o nome em inglês.</p>}
    </section>}

    {step === 'ballot' && <section className="awards-ballot" aria-label="Cédula de votação">
      <div className="jury-mode" role="radiogroup" aria-label="Quem decide os vencedores">
        <button type="button" role="radio" aria-checked={!jury} className={!jury ? 'active' : ''} onClick={() => save({ ...ballot, mode: 'vote' })}><UserRound size={18} /><span><strong>Seu voto</strong><small>Você escolhe cada vencedor</small></span></button>
        <button type="button" role="radio" aria-checked={jury} className={jury ? 'active' : ''} onClick={() => save({ ...ballot, mode: 'jury' })}><Gavel size={18} /><span><strong>Júri automático</strong><small>Surpresa revelada na cerimônia</small></span></button>
      </div>
      <div className="eligibility-panel">
        <div className="segmented compact-seg" role="group" aria-label="Elegibilidade">{([['release', 'Lançados no período'], ['any', 'Qualquer lançamento']] as const).map(([value, label]) => <button key={value} type="button" disabled={!periodWindow} className={rules.mode === value ? 'selected' : ''} aria-pressed={rules.mode === value} onClick={() => save({ ...ballot, eligibility: value })}>{label}</button>)}</div>
        <small>{periodWindow ? rules.mode === 'release' ? 'Para as demais obras, vale a janela de lançamento com quatro meses de tolerância.' : 'Para as demais obras, vale qualquer data de lançamento.' : 'Escolha um ano para Gravação do Ano, Artista Revelação e Artista do Ano.'} Gravação do Ano usa o Top 20 ouvido; Revelação exige estreia no seu chart naquele ano; Artista do Ano considera só o desempenho no ano. Não dependem da carreira real nem da data de lançamento.</small>
        {verify ? <div className="catalog-progress" role="status"><MusicLoader size="sm" /><span>Verificando {verify.done}/{verify.total}{verify.current ? ` · ${verify.current}` : ''}</span><progress max={verify.total || 1} value={verify.done} /><button type="button" className="button small" onClick={() => verifyAbort.current?.abort()}>Parar</button></div>
          : verifyCount > 0 && <button type="button" className="button small" disabled={!navigator.onLine} onClick={() => void runVerify()}><Search size={14} /><span>Verificar elegibilidade no catálogo · {verifyCount} itens · ~{Math.max(1, Math.ceil(verifyCount * 3.6 / 60))} min</span></button>}
      </div>
      {jury && <div className="jury-panel">
        <p>Seis jurados analisam o seu histórico, cada um por um critério, e somam pontos (contagem Borda: 1º lugar vale mais). O resultado fica <strong>lacrado</strong> até a cerimônia. Eles não avaliam qualidade artística: só os seus hábitos. Artista do Ano usa uma pontuação própria: 45% faixas diferentes no Top 10, 35% plays e 20% semanas com música em #1.</p>
        <div className="jury-faces" aria-hidden="true">{judges.map((j, i) => <span key={j.id} style={{ animationDelay: `${i * 70}ms` }}><JurorAvatar id={j.id} size={36} /></span>)}</div>
        <details><summary>Conheça os jurados</summary><ul className="jury-list">{judges.map(j => <li key={j.id}><JurorAvatar id={j.id} size={30} /><span><strong>{j.name}</strong><small>{j.criterion}</small></span></li>)}</ul><small>Quem não tem dado para todos os indicados se abstém, sem chutar. Empate final: mais reproduções.</small></details>
        <div className="inline-actions"><button type="button" className="button primary" disabled={!pools || !ballot.selected.length || !!verify} onClick={conveneSmart}>{!pools ? <MusicLoader size="sm" tone="ink" /> : <Gavel size={16} />}<span>{Object.values(ballot.entries).some(e => e.method === 'jury') ? 'Convocar o júri de novo' : 'Convocar o júri'}</span></button>
          {Object.values(ballot.entries).some(e => e.method === 'jury') && <button type="button" className="text-button" aria-pressed={peek} onClick={() => setPeek(!peek)}>{peek ? 'Lacrar resultados' : 'Espiar resultados (estraga a surpresa)'}</button>}</div>
        {pendingConvene && verify && <p className="ballot-status" role="status"><MusicLoader size="sm" /> Conferindo metadados das obras antes de o júri votar…</p>}
        {juryReport && <p className="ballot-status ok" role="status"><Lock size={14} /> {juryReport.decided} {juryReport.decided === 1 ? 'categoria decidida' : 'categorias decididas'} e lacradas.{juryReport.skipped.length ? ` ${juryReport.skipped.length} sem dados para o júri: vote nelas ou indique manualmente.` : ''}</p>}
        {!!juryReport?.skipped.length && <details className="jury-skipped"><summary>Por que algumas ficaram de fora?</summary><ul>{juryReport.skipped.map(x => <li key={x.categoryId}><strong>{awardById.get(x.categoryId)?.label}</strong><small>{x.reason}</small></li>)}</ul></details>}
      </div>}
      {!selected.has(ARTIST_OF_YEAR) && <button type="button" className="button small" onClick={() => toggle('selected', ARTIST_OF_YEAR)}><Plus size={15}/><span>Adicionar Artista do Ano · exclusiva LastChart</span></button>}
      <details className="period-help"><summary>Como votar?</summary><p>Para cada categoria, aceite as sugestões, procure no seu acervo ou digite um indicado manual. Depois marque o vencedor (mais de um vira empate). Sugestões usam reproduções e gênero do catálogo; elas não comprovam créditos, formação, subgênero ou elegibilidade oficial. Período: {periodLabel}.</p></details>
      {loading && <div className="spotlight-loading" role="status"><MusicLoader size="md" /><span>Reunindo músicas, álbuns e artistas do período…</span></div>}
      {!orderedSelected.length && <p className="note">Nenhuma categoria escolhida. Abra Categorias e selecione as que entrarão na sua cerimônia.</p>}
      {orderedSelected.map(id => <BallotCard key={id} categoryId={id} entry={ballot.entries[id]} pools={pools} meta={meta} stats={stats} rules={rules} sealed={ballot.entries[id]?.method === 'jury' && !peek} skipped={jury ? juryReport?.skipped.find(x => x.categoryId === id)?.reason : undefined} onChange={entry => setEntry(id, entry)} onRemove={() => toggle('selected', id)} />)}
      {!!orderedSelected.length && <button type="button" className="button primary" onClick={() => setStep('ceremony')}><ListChecks size={16} /><span>Revisar e abrir cerimônia</span></button>}
    </section>}

    {step === 'ceremony' && <section className="awards-review" aria-label="Revisão da cerimônia">
      <h4>Revisão antes da cerimônia</h4>
      <p>{title} · {periodLabel}. O resultado é congelado ao começar: mudanças posteriores não alteram a revelação em andamento.</p>
      <ul className="awards-readiness">
        {readiness.ready.map(id => { const entry = ballot.entries[id]; return <li key={id} className="ok">{entry.method === 'jury' ? <Lock size={15} /> : <Check size={15} />}<span><strong>{awardById.get(id)!.label}</strong><small>{entry.method === 'jury' && !peek ? 'Decidido pelo júri · lacrado até a revelação' : `${entry.winners.length > 1 ? 'Empate: ' : 'Vencedor: '}${entry.nominees.filter(n => entry.winners.includes(n.id)).map(n => n.name).join(' & ')}`} · {entry.nominees.length} indicados</small></span></li>; })}
        {readiness.issues.map(issue => <li key={issue.categoryId} className="warn"><Info size={15} /><span><strong>{awardById.get(issue.categoryId)!.label}</strong><small>{issue.reason} Fica fora da cerimônia até resolver.</small></span></li>)}
      </ul>
      <div className="awards-actions">
        <button type="button" className="button primary" disabled={!readiness.ready.length} onClick={() => setCeremony(freezeCeremony(ballot, ruleIssues))}><GramophoneIcon size={19} /><span>Começar cerimônia · {readiness.ready.length} {readiness.ready.length === 1 ? 'categoria' : 'categorias'}</span></button>
        <button type="button" className="button" onClick={() => setStep('ballot')}>Voltar à cédula</button>
      </div>
      {!!frozenForExport.length && <div className="spotlight-export"><span>Card do prêmio</span><label>Categoria<select aria-label="Categoria do card" value={exportId || frozenForExport[0].category.id} onChange={e => setExportId(e.target.value)}>{frozenForExport.map(c => <option key={c.category.id} value={c.category.id}>{c.category.label}</option>)}</select></label>
        {[false, true].map(pdf => <button key={String(pdf)} type="button" className="button small" disabled={exporting} onClick={async () => { const card = frozenForExport.find(c => c.category.id === (exportId || frozenForExport[0].category.id))!; setExporting(true); try { await onExport(card, pdf); } finally { setExporting(false); } }}>{exporting ? <MusicLoader size="sm" /> : <Download size={15} />}<span>{pdf ? 'PDF' : 'PNG'}</span></button>)}
      </div>}
    </section>}
    {ceremony && <Ceremony cards={ceremony} title={title} period={periodLabel} reduced={reduced} onClose={() => setCeremony(null)} />}
  </div>;
}

function BallotCard({ categoryId, entry, pools, meta, stats, rules, sealed, skipped, onChange, onRemove }: { categoryId: string; entry?: BallotEntry; pools: Pools | null; meta: MetaPools; stats: Partial<Record<Kind, Record<string, ItemStats>>>; rules: Eligibility; sealed?: boolean; skipped?: string; onChange: (entry: BallotEntry | null) => void; onRemove: () => void }) {
  const category = awardById.get(categoryId)!;
  const kind = subjectKind(category);
  const [adding, setAdding] = useState<'search' | 'manual' | null>(null), [query, setQuery] = useState(''), [manualName, setManualName] = useState(''), [manualArtist, setManualArtist] = useState('');
  const suggestion = useMemo(() => pools ? suggestNominees(category, pools, meta, 5, rules, stats) : null, [category, pools, meta, rules, stats]);
  const issue = entry ? personalEntryIssue(entry, pools, stats, rules) : undefined;
  const annual = hasPersonalYearRules(categoryId);
  const nominees = entry?.nominees ?? [];
  const base: BallotEntry = entry ?? { categoryId, nominees: [], winners: [], method: 'vote', updatedAt: Date.now(), ...(annual ? { rulesVersion: 2 as const } : {}) };
  const candidates = useMemo(() => { const items = kind ? pools?.[kind] ?? [] : []; if (annual && rules.period === 'all') return []; if (categoryId === 'best-new-artist') return items.filter(i => rules.period !== 'all' && personalDebutCheck(stats.artists?.[i.id], rules.year).ok === true); if (categoryId === 'record-of-the-year') return [...items].filter(i => i.plays > 0).sort((a,b) => b.plays-a.plays || a.name.localeCompare(b.name) || a.id.localeCompare(b.id)).slice(0,20); if (categoryId === ARTIST_OF_YEAR) { const scores = artistYearScores(stats.artists ?? {}); return items.filter(i => scores[i.id]); } return items; }, [kind, pools, categoryId, rules, stats, annual]);
  const results = useMemo(() => query.trim().length >= 2 ? candidates.filter(i => `${i.name} ${i.artist}`.toLowerCase().includes(query.toLowerCase()) && !nominees.some(n => n.id === i.id)).slice(0,8) : [], [candidates, query, nominees]);
  const add = (nominee: BallotEntry['nominees'][number]) => { if (nominees.length >= (categoryId === 'record-of-the-year' ? 5 : 10) || annual && rules.period === 'all') return; onChange({ ...base, nominees: [...nominees, nominee], method: 'vote' }); };
  const ready = !!entry?.winners.length && !issue;
  const [juryNote, setJuryNote] = useState('');
  const juryEligible = nominees.filter(n => n.kind !== 'manual');
  // Modo híbrido: você escolhe os indicados e o júri interno decide em segredo.
  const askJury = () => {
    const result = runJury(category, juryEligible, stats, meta);
    if (issue) { setJuryNote(issue); return; }
    if (!result) { setJuryNote('O júri precisa de pelo menos dois indicados do seu acervo com dados no período.'); return; }
    setJuryNote(juryEligible.length < nominees.length ? 'Indicações manuais não entram no júri (não têm dados de audição).' : '');
    onChange({ ...entry!, nominees: juryEligible, method: 'jury', jury: result, winners: [result.winner] });
  };
  return <article className={`ballot-card ${ready ? 'is-ready' : ''}`}>
    <div className="ballot-head"><div><span className="eyebrow">{category.personal ? 'Exclusiva LastChart' : grammyAreas[category.area].label}</span><h4>{category.label}</h4><small lang="en">{category.official}</small></div><button type="button" className="icon-button" aria-label={`Retirar ${category.label} da cerimônia`} onClick={onRemove}><Trash2 size={15} /></button></div>
    {issue && <p className="alert" role="status">{issue}</p>}
    {entry?.note && <details className="ballot-criterion"><summary>Critério desta categoria</summary><p>{entry.note}</p></details>}
    {(!nominees.length || issue) && suggestion && <div className="ballot-suggestion">
      {suggestion.nominees.length ? <><p><Wand2 size={14} /> {suggestion.criterion}</p><button type="button" className="button small" onClick={() => onChange({ categoryId, nominees: suggestion.nominees, winners: [], method: 'suggestion', updatedAt: Date.now(), note: suggestion.criterion, ...(annual ? { rulesVersion: 2 as const } : {}) })}><Sparkles size={14} /><span>{nominees.length ? 'Atualizar indicados' : `Usar ${suggestion.nominees.length} sugestões`}</span></button></>
        : <p className="note">{suggestion.insufficient}</p>}
      {!!nominees.length && <small>Atualizar substitui os indicados e votos apenas desta categoria.</small>}
    </div>}
    {skipped && !entry && <p className="note">Júri sem dados: {skipped}</p>}
    {sealed && entry ? <div className="ballot-sealed"><Lock size={18} /><div><strong>Decidido pelo júri · lacrado</strong><small>{entry.nominees.length} indicados: {entry.nominees.map(n => n.name).join(', ')}. O vencedor aparece na cerimônia.</small></div><button type="button" className="text-button" onClick={() => onChange({ ...entry, method: 'vote', jury: undefined, winners: [] })}>Votar eu mesmo</button></div> :
    !!nominees.length && <ol className="ballot-nominees">{nominees.map(n => {
      const winner = entry!.winners.includes(n.id);
      return <li key={n.id} className={winner ? 'is-winner' : ''}>
        <button type="button" className="ballot-vote" disabled={!!issue} aria-pressed={winner} aria-label={`${winner ? 'Desmarcar' : 'Escolher'} ${n.name} como vencedor`} onClick={() => onChange({ ...entry!, winners: winner ? entry!.winners.filter(w => w !== n.id) : [...entry!.winners, n.id].slice(-3) })}>{winner ? <GramophoneIcon size={18} /> : <span className="vote-ring" />}</button>
        <Cover item={n} /><span className="truncate"><strong>{n.name}</strong><small>{n.artist}{n.plays ? ` · ${number(n.plays)} plays` : ''}</small><small className="basis">{n.basis}</small></span>
        <button type="button" className="icon-button" aria-label={`Remover indicado ${n.name}`} onClick={() => { const next = nominees.filter(x => x.id !== n.id); onChange(next.length ? { ...entry!, nominees: next, winners: entry!.winners.filter(w => w !== n.id) } : null); }}><Trash2 size={14} /></button>
      </li>;
    })}</ol>}
    {!sealed && !issue && juryEligible.length >= 2 && <button type="button" className="button small jury-ask" onClick={askJury}><Gavel size={14} /><span>Júri decide entre os seus {juryEligible.length} indicados</span></button>}
    {juryNote && <p className="note">{juryNote}</p>}
    {sealed || issue ? null : entry?.winners.length ? <p className="ballot-status ok"><Check size={14} /> {entry.winners.length > 1 ? `Empate entre ${entry.winners.length}` : 'Vencedor escolhido'} · {entry.method === 'jury' ? 'pelo júri' : entry.method === 'suggestion' ? 'a partir de sugestões' : 'voto pessoal'}</p> : nominees.length ? <p className="ballot-status">Marque o vencedor tocando no círculo.</p> : null}
    {!sealed && <div className="ballot-add">
      {kind && <button type="button" className="text-button" aria-expanded={adding === 'search'} onClick={() => setAdding(adding === 'search' ? null : 'search')}><Search size={14} /> Procurar {kindNames[kind]}</button>}
      {!annual && <button type="button" className="text-button" aria-expanded={adding === 'manual'} onClick={() => setAdding(adding === 'manual' ? null : 'manual')}><Plus size={14} /> Indicado manual</button>}
    </div>}
    {adding === 'search' && kind && <div className="ballot-search"><input type="search" aria-label={`Buscar ${kindNames[kind]} no período`} placeholder={`Nome ou artista (${kindNames[kind]} do período)`} value={query} onChange={e => setQuery(e.target.value)} />
      {!pools ? <MusicLoader size="sm" /> : <ul>{results.map(item => <li key={item.id}><button type="button" onClick={() => { add(nomineeFromItem(item, kind)); setQuery(''); }}><Cover item={item} /><span className="truncate"><strong>{item.name}</strong><small>{item.artist} · {number(item.plays)} plays</small></span><Plus size={14} /></button></li>)}{query.trim().length >= 2 && !results.length && <li className="note">Nada encontrado neste período.</li>}</ul>}
    </div>}
    {!annual && adding === 'manual' && <form className="ballot-manual" onSubmit={e => { e.preventDefault(); if (!manualName.trim()) return; add(manualNominee(manualName, manualArtist)); setManualName(''); setManualArtist(''); setAdding(null); }}>
      <input aria-label="Nome do indicado" placeholder={category.subject === 'person' ? 'Nome da pessoa' : 'Título'} value={manualName} maxLength={200} onChange={e => setManualName(e.target.value)} required />
      <input aria-label="Artista ou crédito" placeholder="Artista / crédito (opcional)" value={manualArtist} maxLength={200} onChange={e => setManualArtist(e.target.value)} />
      <button type="submit" className="button small">Adicionar</button>
      <small>Indicações manuais ficam identificadas como suas; o app não verifica créditos ou elegibilidade.</small>
    </form>}
  </article>;
}

export const grammyCount = grammyCategories.length;
