import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, Disc3, ExternalLink, LoaderCircle, Minus, Pause, Play, Volume2, X } from 'lucide-react';
import type { ChartEntry, Item } from '../lib/types';
import { peekCatalogMedia, resolveCatalogMedia } from '../lib/catalog';

let supportsDisplayTransition: boolean | undefined;
function canTransitionDisplay(): boolean {
  if (supportsDisplayTransition !== undefined) return supportsDisplayTransition;
  if (typeof window === 'undefined' || !window.CSS?.supports?.('transition-behavior', 'allow-discrete') || !document.body) {
    return false;
  }
  const probe = document.createElement('div');
  probe.style.cssText = 'transition: display 1s allow-discrete !important; display: block;';
  document.body.appendChild(probe);
  getComputedStyle(probe).display;
  probe.style.display = 'none';
  supportsDisplayTransition = getComputedStyle(probe).display === 'block';
  probe.remove();
  return supportsDisplayTransition;
}

function supportsTopLayerExit(): boolean {
  return typeof window !== 'undefined' && !!window.CSS?.supports?.('overlay', 'auto') && canTransitionDisplay();
}

export function Cover({
  item,
  size = '',
  round = false,
}: {
  item: Pick<Item, 'id' | 'image' | 'name' | 'artist' | 'album'>;
  size?: string;
  round?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const [fallbackUrl, setFallbackUrl] = useState<string>(() => peekCatalogMedia(item)?.artworkUrl ?? '');

  useEffect(() => {
    setFailed(false);
    if (item.image) {
      setFallbackUrl('');
      return;
    }
    const cached = peekCatalogMedia(item);
    if (cached !== undefined) {
      setFallbackUrl(cached?.artworkUrl ?? '');
      return;
    }
    let active = true;
    resolveCatalogMedia(item).then(media => {
      if (active && media?.artworkUrl) {
        setFallbackUrl(media.artworkUrl);
      }
    });
    return () => {
      active = false;
    };
  }, [item.id, item.image, item.artist, item.name, item.album]);

  const src = !failed ? item.image || fallbackUrl : '';

  return (
    <span className={`cover ${size} ${round ? 'round' : ''}`}>
      {src ? (
        <img src={src} alt={`Capa de ${item.name}`} loading="lazy" onError={() => setFailed(true)} />
      ) : (
        <Disc3 aria-hidden="true" />
      )}
    </span>
  );
}

export function Change({ value, hiatusWeeks }: { value: ChartEntry['change']; hiatusWeeks?: number | null }) {
  if (value === 'NEW') return <span className="change new" title="Estreia no Top 100" aria-label="Estreia no Top 100">NEW</span>;
  if (value === 'RE') {
    const label = hiatusWeeks && hiatusWeeks > 0 ? `Retorno após ${hiatusWeeks} ${hiatusWeeks === 1 ? 'semana' : 'semanas'} fora do chart` : 'Retorno ao Top 100';
    return (
      <span className="change re" title={label} aria-label={label}>
        RE{hiatusWeeks && hiatusWeeks > 0 ? <small className="re-gap">·{hiatusWeeks}s</small> : null}
      </span>
    );
  }
  if (value === '?') return <span className="change neutral" title="Semana anterior não sincronizada — variação não inventada" aria-label="Semana anterior não sincronizada">—</span>;
  return (
    <span
      className={`change ${value > 0 ? 'up' : value < 0 ? 'down' : 'neutral'}`}
      aria-label={value > 0 ? `Subiu ${value} posições` : value < 0 ? `Caiu ${-value} posições` : 'Sem mudança'}
    >
      {value > 0 ? <ArrowUp /> : value < 0 ? <ArrowDown /> : <Minus />}
      {value !== 0 && Math.abs(value)}
    </span>
  );
}

export function Modal({
  title,
  subtitle,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const closingRef = useRef(false);
  const pressedOutsideRef = useRef(false);

  const requestDismiss = async () => {
    const d = dialogRef.current;
    if (!d || closingRef.current) return;
    closingRef.current = true;
    if (!supportsTopLayerExit()) {
      d.setAttribute('data-closing', '');
      const animations = d.getAnimations({ subtree: true });
      if (animations.length > 0) {
        await Promise.race([
          Promise.allSettled(animations.map(a => a.finished)),
          new Promise(r => setTimeout(r, 260)),
        ]);
      }
      d.removeAttribute('data-closing');
    }
    onClose();
  };

  useEffect(() => {
    const d = dialogRef.current;
    if (d && !d.open) d.showModal();
    return () => {
      if (d?.open) d.close();
    };
  }, []);

  const isOutside = (e: React.PointerEvent<HTMLDialogElement>) => {
    const d = dialogRef.current;
    if (!d) return false;
    const r = d.getBoundingClientRect();
    return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
  };

  return (
    <dialog
      ref={dialogRef}
      {...({ closedby: 'any' } as Record<string, string>)}
      className={`modal ${wide ? 'wide' : ''}`}
      aria-labelledby={titleId}
      onCancel={e => {
        e.preventDefault();
        void requestDismiss();
      }}
      onPointerDown={e => {
        pressedOutsideRef.current = isOutside(e);
      }}
      onPointerUp={e => {
        if (pressedOutsideRef.current && isOutside(e)) {
          void requestDismiss();
        }
        pressedOutsideRef.current = false;
      }}
    >
      <div className="modal-shell">
        <header>
          <div>
            <h2 id={titleId}>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button type="button" className="icon-button" onClick={() => void requestDismiss()} aria-label="Fechar janela">
            <X size={18} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </dialog>
  );
}

export function Empty({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Disc3 size={28} />
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}

export function Sparkline({ values, color = 'var(--accent)' }: { values: Array<number | null | undefined>; color?: string }) {
  const defined = values.filter((v): v is number => typeof v === 'number');
  if (!defined.length) return <span className="muted">—</span>;
  const max = Math.max(10, ...defined);
  let d = '';
  let pen = false;
  values.forEach((v, i) => {
    if (typeof v !== 'number') {
      pen = false;
      return;
    }
    const x = values.length <= 1 ? 45 : 4 + (i / (values.length - 1)) * 82;
    const y = 5 + ((v - 1) / Math.max(1, max - 1)) * 24;
    d += `${pen ? 'L' : 'M'} ${x.toFixed(1)} ${y.toFixed(1)} `;
    pen = true;
  });
  const lastDefinedIdx = values.map((v, idx) => (typeof v === 'number' ? idx : -1)).filter(idx => idx >= 0).at(-1) ?? 0;
  const endX = values.length <= 1 ? 45 : 4 + (lastDefinedIdx / (values.length - 1)) * 82;
  const endY = 5 + (((values[lastDefinedIdx] as number) - 1) / Math.max(1, max - 1)) * 24;
  return (
    <svg
      className="sparkline"
      viewBox="0 0 90 34"
      role="img"
      aria-label={`Trajetória: ${values.map(v => (v === undefined ? 'não sincronizado' : v ?? 'fora')).join(', ')}`}
    >
      <path d={d} stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle cx={endX} cy={endY} r="3" fill={color} />
    </svg>
  );
}

export interface PreviewPlayerState {
  item: Item;
  loading: boolean;
  previewUrl: string;
  externalUrl: string;
  playing: boolean;
  progress: number;
  unavailable: boolean;
}

export function MiniPlayer({
  state,
  onToggle,
  onClose,
}: {
  state: PreviewPlayerState | null;
  onToggle: () => void;
  onClose: () => void;
}) {
  if (!state) return null;
  const spotifyQuery = encodeURIComponent(`${state.item.artist} ${state.item.name}`);
  return (
    <aside className="mini-player" aria-label="Reprodutor de prévia musical">
      <div className="mini-player-bar" style={{ transform: `scaleX(${state.progress})` }} />
      <Cover item={state.item} round />
      <div className="mini-player-meta">
        <div className="mini-player-badge">
          <Volume2 size={12} />
          <span>{state.loading ? 'Buscando prévia…' : state.unavailable ? 'Prévia indisponível no catálogo' : 'Prévia 30s · Catálogo'}</span>
        </div>
        <strong>{state.item.name}</strong>
        <small>{state.item.artist}</small>
      </div>
      <div className="mini-player-actions">
        {state.loading ? (
          <span className="icon-button" aria-label="Carregando áudio">
            <LoaderCircle size={18} className="spin" />
          </span>
        ) : state.unavailable ? (
          <a
            className="button small"
            href={`https://open.spotify.com/search/${spotifyQuery}`}
            target="_blank"
            rel="noreferrer"
          >
            Spotify
            <ExternalLink size={13} />
          </a>
        ) : (
          <button
            type="button"
            className="play-pill"
            onClick={onToggle}
            aria-label={state.playing ? 'Pausar prévia' : 'Tocar prévia'}
          >
            {state.playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
          </button>
        )}
        <button type="button" className="icon-button" onClick={onClose} aria-label="Fechar reprodutor">
          <X size={16} />
        </button>
      </div>
    </aside>
  );
}

export const number = (n: number) => new Intl.NumberFormat('pt-BR').format(n);
