/** Roteiro da cerimônia: indicados → suspense → cortinas → vencedor → próxima/final. */
export type CeremonyPhase = 'nominees' | 'suspense' | 'curtains' | 'revealed' | 'finished';
export interface CeremonyState { index: number; total: number; phase: CeremonyPhase; reveals: number }
export type CeremonyEvent =
  | { type: 'begin' } | { type: 'suspense-done' } | { type: 'curtains-done' }
  | { type: 'skip' } | { type: 'next' } | { type: 'replay' } | { type: 'restart' } | { type: 'goto'; index: number };

export const ceremonyTiming = { suspenseMs: 1600, curtainsMs: 650, confettiMs: 1100 } as const;

export const initialCeremony = (total: number): CeremonyState => ({ index: 0, total, phase: total ? 'nominees' : 'finished', reveals: 0 });

/** Puro e determinístico. Eventos fora de ordem (clique duplo, timer atrasado) são ignorados. */
export function ceremonyReducer(state: CeremonyState, event: CeremonyEvent, reduced = false): CeremonyState {
  if (!state.total) return { ...state, phase: 'finished' };
  switch (event.type) {
    case 'begin':
      if (state.phase !== 'nominees') return state;
      return reduced ? { ...state, phase: 'revealed', reveals: state.reveals + 1 } : { ...state, phase: 'suspense' };
    case 'suspense-done':
      return state.phase === 'suspense' ? { ...state, phase: 'curtains' } : state;
    case 'curtains-done':
      return state.phase === 'curtains' ? { ...state, phase: 'revealed', reveals: state.reveals + 1 } : state;
    case 'skip':
      return state.phase === 'suspense' || state.phase === 'curtains' || state.phase === 'nominees' ? { ...state, phase: 'revealed', reveals: state.reveals + 1 } : state;
    case 'next':
      if (state.phase !== 'revealed') return state;
      return state.index + 1 < state.total ? { ...state, index: state.index + 1, phase: 'nominees' } : { ...state, phase: 'finished' };
    case 'replay':
      if (state.phase !== 'revealed') return state;
      return reduced ? { ...state, reveals: state.reveals + 1 } : { ...state, phase: 'suspense' };
    case 'restart':
      return initialCeremony(state.total);
    case 'goto':
      return Number.isInteger(event.index) && event.index >= 0 && event.index < state.total ? { ...state, index: event.index, phase: 'nominees' } : state;
  }
}

/** Confetes limitados e determinísticos por revelação (sem Math.random por quadro). */
export function confettiPieces(seed: number, count = 34) {
  let x = (seed * 2654435761) >>> 0 || 1;
  const rand = () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
  const colors = ['var(--accent)', 'var(--gold)', '#f6f8fc', 'color-mix(in oklab,var(--accent) 60%,var(--gold))'];
  return Array.from({ length: Math.min(60, Math.max(0, count)) }, (_, i) => ({
    id: i, left: rand() * 100, delay: rand() * 160, drift: (rand() - .5) * 140, rotate: (rand() - .5) * 720, fall: 55 + rand() * 40,
    size: 5 + rand() * 6, color: colors[i % colors.length], shape: rand() > .5 ? 'strip' : 'dot',
  }));
}
