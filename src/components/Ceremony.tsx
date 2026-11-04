import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight, FastForward, RotateCcw, X } from 'lucide-react';
import type { RevealCard } from '../lib/ballot';
import { ceremonyReducer, ceremonyTiming, confettiPieces, initialCeremony, type CeremonyEvent, type CeremonyState } from '../lib/ceremony';
import { GRAMMY_EDITION, grammyAreas } from '../lib/grammy';
import { judges } from '../lib/jury';
import { JurorAvatar } from './Emblems';
import { ceremonyHeadlines, juryQuote } from '../lib/press';
import { Cover, useArtworkUrl } from './UI';
import { GramophoneIcon } from './Gramophone';
import { pushChrome } from '../lib/chrome';

/**
 * Cerimônia pessoal: resultado congelado antes de começar, suspense curto, cortinas próprias (CSS),
 * confetes limitados por ~1 s e nada animando em repouso. Movimento reduzido revela direto.
 */
export function Ceremony({ cards, title, period, reduced, onClose }: { cards: RevealCard[]; title: string; period: string; reduced: boolean; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const [state, rawDispatch] = useReducer((s: CeremonyState, e: CeremonyEvent) => ceremonyReducer(s, e, reduced), cards.length, initialCeremony);
  const dispatch = rawDispatch;
  const [confetti, setConfetti] = useState(false);
  const card = cards[state.index];
  const winner = card?.winners[0];
  const art = useArtworkUrl(state.phase === 'revealed' || state.phase === 'curtains' || state.phase === 'finished' ? winner ?? null : null);
  const pieces = useMemo(() => confettiPieces(state.reveals + state.index * 7), [state.reveals, state.index]);

  useEffect(() => { const d = dialogRef.current; if (d && !d.open) d.showModal(); const release = pushChrome(() => '#05080e'); return () => { release(); if (d?.open) d.close(); }; }, []);
  // Timers do roteiro: sempre limpos ao mudar de fase, fechar ou desmontar.
  useEffect(() => {
    // Com júri, a deliberação dura um pouco mais (2 s) para os jurados “votarem” um a um.
    if (state.phase === 'suspense') { const t = setTimeout(() => dispatch({ type: 'suspense-done' }), card?.jury ? 2000 : ceremonyTiming.suspenseMs); return () => clearTimeout(t); }
    if (state.phase === 'curtains') { const t = setTimeout(() => dispatch({ type: 'curtains-done' }), ceremonyTiming.curtainsMs); return () => clearTimeout(t); }
  }, [state.phase, state.index]);
  useEffect(() => {
    if (state.phase !== 'revealed' || reduced) { setConfetti(false); return; }
    setConfetti(true);
    const t = setTimeout(() => setConfetti(false), ceremonyTiming.confettiMs + 250);
    return () => clearTimeout(t);
  }, [state.phase, state.reveals, reduced]);
  // Segundo plano: não anima escondido; revela direto.
  useEffect(() => {
    const hidden = () => { if (document.hidden) dispatch({ type: 'skip' }); };
    document.addEventListener('visibilitychange', hidden);
    return () => document.removeEventListener('visibilitychange', hidden);
  }, []);
  useEffect(() => { primaryRef.current?.focus({ preventScroll: true }); }, [state.phase, state.index]);

  const animating = state.phase === 'suspense' || state.phase === 'curtains';
  const curtainsClosed = state.phase === 'nominees' || state.phase === 'suspense';
  const announce = state.phase === 'revealed' && card ? `${card.category.label}: ${card.winners.map(w => `${w.name}, ${w.artist}`).join(' e ')}` : '';

  // Portal no body: o palco não herda estilos nem cliques da janela do Spotlight.
  return createPortal(<dialog ref={dialogRef} className={`ceremony-dialog phase-${state.phase} ${reduced ? 'is-reduced' : ''}`} aria-label={`Cerimônia ${title}`}
    onCancel={e => { e.preventDefault(); onClose(); }}
    onKeyDown={e => { if (e.key === 'ArrowRight' && state.phase === 'revealed') dispatch({ type: 'next' }); }}>
    <div className="cer-stage">
      {art && <div className="cer-art" aria-hidden="true"><img src={art} alt="" decoding="async" /></div>}
      <div className="cer-light" aria-hidden="true" />
      <header className="cer-top">
        <span className="cer-brand"><GramophoneIcon size={22} /> <span>{title}</span></span>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Fechar cerimônia"><X size={18} /></button>
      </header>
      <p className="sr-only" aria-live="assertive">{announce}</p>
      {state.phase === 'finished' ? <div className="cer-finale">
        <span className="eyebrow">{GRAMMY_EDITION.label} · edição pessoal</span>
        <h2>Os vencedores da sua noite</h2>
        <p>{period}</p>
        {(() => { const heads = ceremonyHeadlines(cards); return heads.length ? <div className="cer-press"><span className="eyebrow">O QUE A IMPRENSA DIZ · ficção com seus dados</span>{heads.map(h => <article key={h.id}><strong>{h.title}</strong><small>{h.dek}</small></article>)}</div> : null; })()}
        <ol className="cer-summary">{cards.map((c, i) => <li key={c.category.id}><button type="button" onClick={() => dispatch({ type: 'goto', index: i })}><Cover item={c.winners[0]} /><span className="truncate"><small>{c.category.label}</small><strong>{c.winners.map(w => w.name).join(' · ')}</strong><em>{c.winners[0].artist}</em></span></button></li>)}</ol>
        <div className="cer-actions"><button ref={primaryRef} type="button" className="button primary" onClick={() => dispatch({ type: 'restart' })}><RotateCcw size={16} /><span>Recomeçar cerimônia</span></button><button type="button" className="button" onClick={onClose}>Fechar</button></div>
        <small className="cer-disclaimer">Simulação pessoal independente, com categorias inspiradas nos nomes oficiais. Não é um resultado da Recording Academy.</small>
      </div> : card && <>
        <div className="cer-head">
          <span className="eyebrow">Categoria {state.index + 1} de {cards.length} · {grammyAreas[card.category.area].label}</span>
          <h2>{card.category.label}</h2>
          <p lang="en">{card.category.official}</p>
        </div>
        <div className="cer-curtain-frame">
          <div className={`cer-curtains ${curtainsClosed ? 'is-closed' : 'is-open'}`} aria-hidden="true"><i className="left" /><i className="right" /><b className="valance" /></div>
          <div className="cer-window">
            {(state.phase === 'revealed' || state.phase === 'curtains') && winner ? <div className="cer-winner" key={state.reveals}>
              <div className="cer-cover"><Cover item={winner} size="large" /></div>
              <span className="cer-label">{card.winners.length > 1 ? `Empate · ${card.winners.length} vencedores` : 'E o prêmio vai para'}</span>
              <h3>{card.winners.map(w => w.name).join(' & ')}</h3>
              <p>{[...new Set(card.winners.map(w => w.artist))].join(' · ')}</p>
              <small>{card.method === 'jury' ? `Decisão do júri · ${card.jury?.totals[winner.id] ?? 0} pontos` : card.method === 'vote' ? 'Seu voto pessoal' : 'Sugestão aceita por você'} · {winner.basis}</small>
              {card.jury && state.phase === 'revealed' && <details className="cer-jury" open><summary>Como o júri votou</summary><ul>{card.jury.judges.map((v, i) => { const judge = judges.find(j => j.id === v.judge); const pick = card.nominees.find(n => n.id === v.ranking[0]); return <li key={v.judge} style={{ animationDelay: `${500 + i * 180}ms` }}><strong><JurorAvatar id={v.judge as never} size={22} /> {judge?.name}</strong><span>{v.abstain ? `Absteve-se: ${v.abstain}` : `1º: ${pick?.name ?? '—'}`}<em>{juryQuote(v, card)}</em></span></li>; })}</ul><small>Placar: {card.nominees.map(n => `${n.name} ${card.jury!.totals[n.id] ?? 0}`).join(' · ')}</small></details>}
            </div> : <div className="cer-nominees">
              <span className="cer-label">{state.phase === 'nominees' ? 'Os indicados são' : 'E o prêmio vai para…'}</span>
              <ul>{card.nominees.slice(0, 6).map(n => <li key={n.id}><Cover item={n} /><span className="truncate"><strong>{n.name}</strong><small>{n.artist}</small></span></li>)}</ul>
              {state.phase === 'suspense' && (card.jury ? <div className="cer-deliberation" aria-hidden="true"><small>O júri está deliberando…</small><div>{card.jury.judges.map((v, i) => <span key={v.judge} className={v.abstain ? 'abstain' : ''} style={{ animationDelay: `${i * 260}ms` }}><JurorAvatar id={v.judge as never} size={34} /></span>)}</div></div> : <span className="cer-dots" aria-hidden="true"><i /><i /><i /></span>)}
            </div>}
          </div>
        </div>
        {confetti && <div className="cer-confetti" aria-hidden="true">{pieces.map(p => <i key={p.id} className={p.shape} style={{ left: `${p.left}%`, width: p.size, height: p.shape === 'strip' ? p.size * 2.2 : p.size, background: p.color, animationDelay: `${p.delay}ms`, ['--drift' as string]: `${p.drift}px`, ['--spin' as string]: `${p.rotate}deg`, ['--fall' as string]: `${p.fall}vh` }} />)}</div>}
        <div className="cer-actions">
          {state.phase === 'nominees' && <button ref={primaryRef} type="button" className="button primary" onClick={() => dispatch({ type: 'begin' })}><GramophoneIcon size={19} /><span>Revelar vencedor</span></button>}
          {animating && <button ref={primaryRef} type="button" className="button" onClick={() => dispatch({ type: 'skip' })}><FastForward size={16} /><span>Pular animação</span></button>}
          {state.phase === 'revealed' && <>
            <button ref={primaryRef} type="button" className="button primary" onClick={() => dispatch({ type: 'next' })}><span>{state.index + 1 < cards.length ? 'Próxima categoria' : 'Ver todos os vencedores'}</span><ChevronRight size={16} /></button>
            <button type="button" className="button" onClick={() => dispatch({ type: 'replay' })}><RotateCcw size={16} /><span>Rever revelação</span></button>
          </>}
        </div>
      </>}
    </div>
  </dialog>, document.body);
}
