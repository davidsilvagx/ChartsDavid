import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, Disc3, ExternalLink, Minus, Pause, Play, Square, Volume2, X } from 'lucide-react';
import type { ChartEntry, Item, SyncProgress } from '../lib/types';
import { peekCatalogMedia, resolveCatalogMedia } from '../lib/catalog';
import { pushChrome } from '../lib/chrome';

export function MusicLoader({
  size = 'sm',
  tone = 'default',
  label,
}: {
  size?: 'sm' | 'md' | 'lg';
  tone?: 'default' | 'ink';
  label?: string;
}) {
  return (
    <span
      className={`music-loader music-loader-${size} ${tone === 'ink' ? 'music-loader-ink' : ''}`}
      role={label ? 'status' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <span className="music-loader-orbit">
        <svg className="music-loader-ring" viewBox="0 0 36 36" fill="none">
          <circle cx="18" cy="18" r="15.5" stroke="currentColor" strokeOpacity="0.18" strokeWidth="2.4" />
          <path
            d="M18 2.5a15.5 15.5 0 0 1 14.2 9.3"
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinecap="round"
          />
          <path
            d="M18 33.5a15.5 15.5 0 0 1-12.6-6.5"
            stroke="currentColor"
            strokeOpacity="0.55"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        </svg>
        <span className="music-loader-bars">
          <i />
          <i />
          <i />
          <i />
        </span>
      </span>
      {label ? <span className="music-loader-text">{label}</span> : null}
    </span>
  );
}

export function SyncProgressCard({
  progress,
  onCancel,
  compact = false,
}: {
  progress: SyncProgress;
  onCancel?: () => void;
  compact?: boolean;
}) {
  const indeterminate = progress.phase === 'connecting';
  const pct = progress.phase === 'done' ? 100 : progress.total > 0 ? Math.min(99, Math.floor((progress.completed / progress.total) * 100)) : 0;
  const scopeTitle =
    progress.force
      ? 'Revalidação completa'
      : progress.scope === 'recent'
        ? 'Últimas 8 semanas'
        : progress.scope === 'all'
          ? 'Histórico 2016–hoje'
          : typeof progress.scope === 'number'
            ? `Ano ${progress.scope}`
            : 'Sincronização ativa';

  return (
    <div className={`sync-status musical-sync-card ${compact ? 'is-compact' : ''}`} role="status" aria-live="polite">
      <MusicLoader size="md" />
      <div className="sync-card-body">
        <div className="sync-card-top">
          <div className="sync-card-titles">
            <span className="sync-scope-pill">{scopeTitle}</span>
            <strong>{progress.message}</strong>
          </div>
          <span className="sync-pct-badge">{indeterminate ? 'Conectando…' : `${pct}%`}</span>
        </div>
        <div
          className={`musical-progress-track ${indeterminate ? 'is-indeterminate' : ''}`}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={indeterminate ? undefined : pct}
          aria-label="Progresso do download atual"
        >
          <span
            className="musical-progress-fill"
            style={indeterminate ? undefined : { width: `${pct}%` }}
          />
        </div>
        {progress.total > 0 ? (
          <div className="sync-stats">
            <span><strong>{number(progress.completed)} / {number(progress.total)}</strong> semanas salvas neste download</span>
            <span><strong>{number(progress.pages)}</strong> páginas recebidas</span>
          </div>
        ) : <small>Validando usuário e preparando o download…</small>}
        {!indeterminate && <small>Mantenha o app aberto. Os charts serão recalculados ao terminar ou pausar.</small>}
      </div>
      {onCancel && (
        <button type="button" className="button small" onClick={onCancel}>
          <Square size={13} />
          <span>Pausar</span>
        </button>
      )}
    </div>
  );
}

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

export type ArtworkTarget = Pick<Item, 'id' | 'image' | 'name' | 'artist' | 'album'>;

export function useArtworkUrl(item?: ArtworkTarget | null): string {
  const [fallbackUrl, setFallbackUrl] = useState<string>(() => (item ? peekCatalogMedia(item)?.artworkUrl ?? '' : ''));

  useEffect(() => {
    if (!item) {
      setFallbackUrl('');
      return;
    }
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
  }, [item?.id, item?.image, item?.artist, item?.name, item?.album]);

  return item?.image || fallbackUrl || '';
}

export function AmbientBackdrop({
  src,
  active = false,
  className = '',
}: {
  src?: string;
  active?: boolean;
  className?: string;
}) {
  if (!src) return null;
  return (
    <div className={`ambient-backdrop ${active ? 'is-playing' : ''} ${className}`} aria-hidden="true">
      <img className="ambient-layer primary" src={src} alt="" loading="lazy" decoding="async" />
      <img className="ambient-layer secondary" src={src} alt="" loading="lazy" decoding="async" />
      <span className="ambient-scrim" />
    </div>
  );
}

export function Cover({
  item,
  size = '',
  round = false,
}: {
  item: ArtworkTarget;
  size?: string;
  round?: boolean;
}) {
  const [failedSrc, setFailedSrc] = useState<string>('');
  const resolved = useArtworkUrl(item);
  const src = resolved && resolved !== failedSrc ? resolved : '';

  return (
    <span className={`cover ${size} ${round ? 'round' : ''}`}>
      {src ? (
        <img src={src} alt={`Capa de ${item.name}`} loading="lazy" onError={() => setFailedSrc(src)} />
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

export const ModalArtworkContext = createContext('');

export function Modal({
  title,
  subtitle,
  onClose,
  children,
  wide = false,
  ambientImage,
  ambientActive = false,
  className = '',
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  ambientImage?: string;
  ambientActive?: boolean;
  className?: string;
}) {
  const fallbackArtwork = useContext(ModalArtworkContext);
  const modalImage = ambientImage ?? fallbackArtwork;
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
    const release = pushChrome();
    return () => {
      release();
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
      className={`modal ${wide ? 'wide' : ''} ${modalImage ? 'has-ambient' : ''} ${className}`}
      aria-labelledby={titleId}
      onCancel={e => {
        e.preventDefault();
        void requestDismiss();
      }}
      onPointerDown={e => {
        // Eventos vindos de outra janela (portal/diálogo aninhado) não fecham esta.
        pressedOutsideRef.current = e.target instanceof Node && !!dialogRef.current?.contains(e.target) && isOutside(e);
      }}
      onPointerUp={e => {
        if (pressedOutsideRef.current && e.target instanceof Node && dialogRef.current?.contains(e.target) && isOutside(e)) {
          void requestDismiss();
        }
        pressedOutsideRef.current = false;
      }}
    >
      <div className="modal-shell">
        {modalImage && <AmbientBackdrop src={modalImage} active={ambientActive} className="modal-ambient" />}
        <header>
          {modalImage&&<div className="modal-header-art" aria-hidden="true"><img src={modalImage} alt=""/><span/></div>}
          <div>
            <h2 id={titleId}>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button type="button" className="icon-button modal-close-btn" onClick={() => void requestDismiss()} aria-label="Fechar janela">
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
  trackName?: string;
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
  const artworkUrl = useArtworkUrl(state?.item ?? null);
  if (!state) return null;
  const spotifyQuery = encodeURIComponent(`${state.item.artist} ${state.item.name}`);
  return (
    <aside className={`mini-player ${state.playing ? 'is-playing' : ''}`} aria-label="Reprodutor de prévia musical">
      {artworkUrl && <AmbientBackdrop src={artworkUrl} active={state.playing} className="mini-player-ambient" />}
      <div className="mini-player-bar" style={{ transform: `scaleX(${state.progress})` }} />
      <Cover item={state.item} />
      <div className="mini-player-meta">
        <div className="mini-player-badge">
          {state.playing ? (
            <span className="eq-bars" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
          ) : (
            <Volume2 size={12} />
          )}
          <span>{state.loading ? 'Buscando prévia…' : state.unavailable ? 'Prévia indisponível no catálogo' : state.playing ? 'Tocando prévia · cortesia do iTunes' : 'Prévia 30 s · cortesia do iTunes'}</span>
        </div>
        <strong>{state.item.name}</strong>
        <small>{state.item.artist}{state.trackName && state.trackName !== state.item.name ? ` · faixa: ${state.trackName}` : ''}</small>
      </div>
      <div className="mini-player-actions">
        {state.loading ? (
          <span className="icon-button" aria-label="Carregando áudio">
            <MusicLoader size="sm" />
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
          <>
          {state.externalUrl && <a className="icon-button" href={state.externalUrl} target="_blank" rel="noreferrer" aria-label="Abrir no Apple Music"><ExternalLink size={14} /></a>}
          <button
            type="button"
            className="play-pill"
            onClick={onToggle}
            aria-label={state.playing ? 'Pausar prévia' : 'Tocar prévia'}
          >
            {state.playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
          </button>
          </>
        )}
        <button type="button" className="icon-button" onClick={onClose} aria-label="Fechar reprodutor">
          <X size={16} />
        </button>
      </div>
    </aside>
  );
}

export const number = (n: number) => new Intl.NumberFormat('pt-BR').format(n);

/** Esconde o botão de prévia quando o catálogo já respondeu que não há prévia para o item. */
export const previewKnownMissing = (item: Pick<Item, 'id' | 'name' | 'artist' | 'album'>) => { const media = peekCatalogMedia(item); return media === null || media?.previewUrl === ''; };
