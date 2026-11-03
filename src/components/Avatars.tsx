import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { Check, SlidersHorizontal, Sparkles } from 'lucide-react';
import type { Profile } from '../lib/types';
import { Modal } from './UI';
import { POP_AVATARS } from './PopAvatars';

export interface AvatarPreset {
  id: string;
  name: string;
  vibe: string;
  accent: string;
  render: (uid: string) => ReactNode;
}

export const AVATAR_PRESETS: AvatarPreset[] = [
  ...POP_AVATARS,
  {
    id: 'vinyl-gold',
    name: 'Vinil Ouro',
    vibe: 'Clássico #1',
    accent: '#f5c451',
    render: uid => (
      <>
        <defs>
          <linearGradient id={`${uid}-bg`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#141d2f" />
            <stop offset="100%" stopColor="#070b12" />
          </linearGradient>
          <linearGradient id={`${uid}-lbl`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#fde68a" />
            <stop offset="55%" stopColor="#f5c451" />
            <stop offset="100%" stopColor="#d97706" />
          </linearGradient>
          <linearGradient id={`${uid}-sheen`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.22" />
            <stop offset="50%" stopColor="#ffffff" stopOpacity="0" />
            <stop offset="100%" stopColor="#22dc6e" stopOpacity="0.18" />
          </linearGradient>
        </defs>
        <rect width="80" height="80" rx="40" fill={`url(#${uid}-bg)`} />
        <circle cx="40" cy="40" r="31" fill="#0b101b" stroke="#26334d" strokeWidth="1.5" />
        <circle cx="40" cy="40" r="26" fill="none" stroke="#1e293b" strokeWidth="1" />
        <circle cx="40" cy="40" r="21.5" fill="none" stroke="#283548" strokeWidth="0.9" />
        <circle cx="40" cy="40" r="17" fill="none" stroke="#1e293b" strokeWidth="1" />
        <path d="M16 24 A30 30 0 0 1 56 14 L40 40 Z" fill={`url(#${uid}-sheen)`} />
        <path d="M64 56 A30 30 0 0 1 24 66 L40 40 Z" fill={`url(#${uid}-sheen)`} />
        <circle cx="40" cy="40" r="11.5" fill={`url(#${uid}-lbl)`} />
        <circle cx="40" cy="40" r="3.2" fill="#070b12" />
        <path d="M63 17 L63 34 L54 43" fill="none" stroke="#e2e8f0" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="63" cy="17" r="3.5" fill="#f5c451" />
      </>
    ),
  },
  {
    id: 'headphones-studio',
    name: 'Monitor Pro',
    vibe: 'Estúdio Neon',
    accent: '#22dc6e',
    render: uid => (
      <>
        <defs>
          <linearGradient id={`${uid}-bg`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#062c1d" />
            <stop offset="55%" stopColor="#0b1926" />
            <stop offset="100%" stopColor="#09131f" />
          </linearGradient>
          <linearGradient id={`${uid}-arc`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#22dc6e" />
            <stop offset="100%" stopColor="#38bdf8" />
          </linearGradient>
        </defs>
        <rect width="80" height="80" rx="40" fill={`url(#${uid}-bg)`} />
        <circle cx="40" cy="42" r="25" fill="#22dc6e" fillOpacity="0.09" />
        <path d="M21 44 V38 A19 19 0 0 1 59 38 V44" fill="none" stroke={`url(#${uid}-arc)`} strokeWidth="5" strokeLinecap="round" />
        <rect x="15" y="40" width="11" height="20" rx="5.5" fill="#e2e8f0" />
        <rect x="18" y="43" width="5" height="14" rx="2.5" fill="#22dc6e" />
        <rect x="54" y="40" width="11" height="20" rx="5.5" fill="#e2e8f0" />
        <rect x="57" y="43" width="5" height="14" rx="2.5" fill="#38bdf8" />
        <path d="M31 50 V44 M35.5 53 V41 M40 55 V38 M44.5 53 V41 M49 50 V44" stroke="#22dc6e" strokeWidth="2.4" strokeLinecap="round" />
      </>
    ),
  },
  {
    id: 'synth-wave',
    name: 'Onda Modular',
    vibe: 'Synth Ciano',
    accent: '#38bdf8',
    render: uid => (
      <>
        <defs>
          <linearGradient id={`${uid}-bg`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#082038" />
            <stop offset="60%" stopColor="#121836" />
            <stop offset="100%" stopColor="#1e1136" />
          </linearGradient>
          <linearGradient id={`${uid}-wave`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#22dc6e" />
            <stop offset="50%" stopColor="#38bdf8" />
            <stop offset="100%" stopColor="#c084fc" />
          </linearGradient>
        </defs>
        <rect width="80" height="80" rx="40" fill={`url(#${uid}-bg)`} />
        <line x1="12" y1="40" x2="68" y2="40" stroke="#38bdf8" strokeOpacity="0.22" strokeWidth="1.2" strokeDasharray="3 3" />
        <path
          d="M12 44 C19 44, 21 23, 27 23 C33 23, 35 57, 41 57 C47 57, 49 19, 55 19 C60 19, 62 44, 68 44"
          fill="none"
          stroke={`url(#${uid}-wave)`}
          strokeWidth="4.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="27" cy="23" r="3" fill="#22dc6e" />
        <circle cx="55" cy="19" r="3.4" fill="#f8fafc" />
      </>
    ),
  },
  {
    id: 'cassette-sunset',
    name: 'Fita Chrome',
    vibe: 'Retrô Sunset',
    accent: '#fb7185',
    render: uid => (
      <>
        <defs>
          <linearGradient id={`${uid}-bg`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#3b1026" />
            <stop offset="55%" stopColor="#1f1530" />
            <stop offset="100%" stopColor="#0f172a" />
          </linearGradient>
          <linearGradient id={`${uid}-lbl`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#fb7185" />
            <stop offset="50%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#38bdf8" />
          </linearGradient>
        </defs>
        <rect width="80" height="80" rx="40" fill={`url(#${uid}-bg)`} />
        <rect x="14" y="23" width="52" height="34" rx="7" fill="#0f172a" stroke="#f472b6" strokeOpacity="0.55" strokeWidth="1.8" />
        <rect x="18" y="27" width="44" height="8" rx="3" fill={`url(#${uid}-lbl)`} />
        <rect x="22" y="38" width="36" height="12" rx="6" fill="#1e293b" />
        <circle cx="30" cy="44" r="4.2" fill="#f8fafc" />
        <circle cx="30" cy="44" r="1.8" fill="#0f172a" />
        <circle cx="50" cy="44" r="4.2" fill="#f8fafc" />
        <circle cx="50" cy="44" r="1.8" fill="#0f172a" />
        <path d="M24 57 L28 52 H52 L56 57" fill="none" stroke="#94a3b8" strokeWidth="1.6" />
      </>
    ),
  },
  {
    id: 'mic-condenser',
    name: 'Voz Studio',
    vibe: 'Broadcast',
    accent: '#c084fc',
    render: uid => (
      <>
        <defs>
          <linearGradient id={`${uid}-bg`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#26133d" />
            <stop offset="100%" stopColor="#0b1324" />
          </linearGradient>
          <linearGradient id={`${uid}-body`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f8fafc" />
            <stop offset="100%" stopColor="#94a3b8" />
          </linearGradient>
        </defs>
        <rect width="80" height="80" rx="40" fill={`url(#${uid}-bg)`} />
        <circle cx="40" cy="34" r="22" fill="#c084fc" fillOpacity="0.14" />
        <rect x="31" y="17" width="18" height="28" rx="9" fill={`url(#${uid}-body)`} />
        <line x1="33" y1="24" x2="47" y2="24" stroke="#334155" strokeWidth="1.6" />
        <line x1="32" y1="29" x2="48" y2="29" stroke="#334155" strokeWidth="1.6" />
        <line x1="33" y1="34" x2="47" y2="34" stroke="#334155" strokeWidth="1.6" />
        <path d="M25 35 A15 15 0 0 0 55 35" fill="none" stroke="#c084fc" strokeWidth="3.2" strokeLinecap="round" />
        <line x1="40" y1="50" x2="40" y2="61" stroke="#c084fc" strokeWidth="3.2" strokeLinecap="round" />
        <line x1="31" y1="61" x2="49" y2="61" stroke="#e2e8f0" strokeWidth="3.2" strokeLinecap="round" />
      </>
    ),
  },
  {
    id: 'equalizer-neon',
    name: 'Equalizador',
    vibe: '5 Bandas',
    accent: '#22dc6e',
    render: uid => (
      <>
        <defs>
          <linearGradient id={`${uid}-bg`} x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor="#07131d" />
            <stop offset="100%" stopColor="#0d2624" />
          </linearGradient>
          <linearGradient id={`${uid}-bar`} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="#22dc6e" />
            <stop offset="65%" stopColor="#38bdf8" />
            <stop offset="100%" stopColor="#f5c451" />
          </linearGradient>
        </defs>
        <rect width="80" height="80" rx="40" fill={`url(#${uid}-bg)`} />
        <rect x="17" y="42" width="6.5" height="18" rx="3.2" fill={`url(#${uid}-bar)`} />
        <rect x="27" y="28" width="6.5" height="32" rx="3.2" fill={`url(#${uid}-bar)`} />
        <rect x="37" y="19" width="6.5" height="41" rx="3.2" fill={`url(#${uid}-bar)`} />
        <rect x="47" y="31" width="6.5" height="29" rx="3.2" fill={`url(#${uid}-bar)`} />
        <rect x="57" y="38" width="6.5" height="22" rx="3.2" fill={`url(#${uid}-bar)`} />
        <circle cx="20.25" cy="36" r="2.2" fill="#f5c451" />
        <circle cx="40.25" cy="14" r="2.4" fill="#fde68a" />
        <circle cx="60.25" cy="32" r="2.2" fill="#38bdf8" />
      </>
    ),
  },
  {
    id: 'turntable-club',
    name: 'Pick-up DJ',
    vibe: 'Club Deck',
    accent: '#38bdf8',
    render: uid => (
      <>
        <defs>
          <linearGradient id={`${uid}-bg`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#0c192c" />
            <stop offset="100%" stopColor="#050912" />
          </linearGradient>
        </defs>
        <rect width="80" height="80" rx="40" fill={`url(#${uid}-bg)`} />
        <rect x="14" y="18" width="52" height="44" rx="9" fill="#111c2d" stroke="#38bdf8" strokeOpacity="0.45" strokeWidth="1.6" />
        <circle cx="35" cy="40" r="16" fill="#070b12" stroke="#38bdf8" strokeWidth="1.5" />
        <circle cx="35" cy="40" r="11" fill="none" stroke="#1e293b" strokeWidth="1" />
        <circle cx="35" cy="40" r="5.5" fill="#22dc6e" />
        <circle cx="35" cy="40" r="1.8" fill="#070b12" />
        <path d="M56 24 V39 L48 46" fill="none" stroke="#f8fafc" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="58" y="45" width="3" height="12" rx="1.5" fill="#38bdf8" />
        <circle cx="20" cy="56" r="2.3" fill="#22dc6e" />
      </>
    ),
  },
  {
    id: 'guitar-electric',
    name: 'Riff Neon',
    vibe: 'Stage Rock',
    accent: '#fb923c',
    render: uid => (
      <>
        <defs>
          <linearGradient id={`${uid}-bg`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#381515" />
            <stop offset="100%" stopColor="#111827" />
          </linearGradient>
          <linearGradient id={`${uid}-pick`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#fb923c" />
            <stop offset="100%" stopColor="#f43f5e" />
          </linearGradient>
        </defs>
        <rect width="80" height="80" rx="40" fill={`url(#${uid}-bg)`} />
        <path
          d="M40 16 C54 16, 61 26, 57 41 C54 53, 45 63, 40 63 C35 63, 26 53, 23 41 C19 26, 26 16, 40 16 Z"
          fill={`url(#${uid}-pick)`}
          stroke="#fde68a"
          strokeOpacity="0.6"
          strokeWidth="1.5"
        />
        <line x1="35" y1="18" x2="35" y2="61" stroke="#0f172a" strokeOpacity="0.55" strokeWidth="1.4" />
        <line x1="40" y1="16" x2="40" y2="63" stroke="#0f172a" strokeOpacity="0.55" strokeWidth="1.4" />
        <line x1="45" y1="18" x2="45" y2="61" stroke="#0f172a" strokeOpacity="0.55" strokeWidth="1.4" />
        <path d="M39 28 L33 40 H41 L37 52 L48 37 H40 Z" fill="#fef3c7" />
      </>
    ),
  },
  {
    id: 'boombox-sub',
    name: 'Subgrave',
    vibe: 'Hi-Fi Bass',
    accent: '#2dd4bf',
    render: uid => (
      <>
        <defs>
          <linearGradient id={`${uid}-bg`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#08292b" />
            <stop offset="100%" stopColor="#0b1120" />
          </linearGradient>
        </defs>
        <rect width="80" height="80" rx="40" fill={`url(#${uid}-bg)`} />
        <rect x="21" y="14" width="38" height="52" rx="10" fill="#111c2d" stroke="#2dd4bf" strokeOpacity="0.5" strokeWidth="1.8" />
        <circle cx="40" cy="27" r="7" fill="#070b12" stroke="#38bdf8" strokeWidth="1.8" />
        <circle cx="40" cy="27" r="2.5" fill="#38bdf8" />
        <circle cx="40" cy="49" r="11.5" fill="#070b12" stroke="#22dc6e" strokeWidth="2.2" />
        <circle cx="40" cy="49" r="7" fill="none" stroke="#2dd4bf" strokeOpacity="0.5" strokeWidth="1.2" />
        <circle cx="40" cy="49" r="3.4" fill="#22dc6e" />
      </>
    ),
  },
  {
    id: 'disc-holo',
    name: 'Laser Disc',
    vibe: 'Holográfico',
    accent: '#a78bfa',
    render: uid => (
      <>
        <defs>
          <linearGradient id={`${uid}-bg`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#171430" />
            <stop offset="100%" stopColor="#091526" />
          </linearGradient>
          <linearGradient id={`${uid}-cd`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#e2e8f0" />
            <stop offset="32%" stopColor="#67e8f9" />
            <stop offset="66%" stopColor="#c084fc" />
            <stop offset="100%" stopColor="#fde68a" />
          </linearGradient>
        </defs>
        <rect width="80" height="80" rx="40" fill={`url(#${uid}-bg)`} />
        <circle cx="40" cy="40" r="28" fill={`url(#${uid}-cd)`} />
        <path d="M40 40 L18 22 A28 28 0 0 1 32 13 Z" fill="#ffffff" fillOpacity="0.55" />
        <path d="M40 40 L62 58 A28 28 0 0 1 48 67 Z" fill="#ffffff" fillOpacity="0.45" />
        <circle cx="40" cy="40" r="9.5" fill="#0f172a" stroke="#e2e8f0" strokeWidth="1.8" />
        <circle cx="40" cy="40" r="3.6" fill="#38bdf8" />
      </>
    ),
  },
  {
    id: 'piano-noir',
    name: 'Teclas Noir',
    vibe: 'Acústico',
    accent: '#e2e8f0',
    render: uid => (
      <>
        <defs>
          <linearGradient id={`${uid}-bg`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#162032" />
            <stop offset="100%" stopColor="#070a10" />
          </linearGradient>
        </defs>
        <rect width="80" height="80" rx="40" fill={`url(#${uid}-bg)`} />
        <rect x="15" y="21" width="50" height="38" rx="7" fill="#f8fafc" stroke="#22dc6e" strokeOpacity="0.45" strokeWidth="1.6" />
        <line x1="27.5" y1="21" x2="27.5" y2="59" stroke="#cbd5e1" strokeWidth="1.4" />
        <line x1="40" y1="21" x2="40" y2="59" stroke="#cbd5e1" strokeWidth="1.4" />
        <line x1="52.5" y1="21" x2="52.5" y2="59" stroke="#cbd5e1" strokeWidth="1.4" />
        <rect x="23.5" y="21" width="8" height="23" rx="2" fill="#0b1120" />
        <rect x="36" y="21" width="8" height="23" rx="2" fill="#0b1120" />
        <rect x="48.5" y="21" width="8" height="23" rx="2" fill="#0b1120" />
      </>
    ),
  },
  {
    id: 'crown-chart',
    name: 'Topo #1',
    vibe: 'Hall of Fame',
    accent: '#f5c451',
    render: uid => (
      <>
        <defs>
          <linearGradient id={`${uid}-bg`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#2b2109" />
            <stop offset="55%" stopColor="#141927" />
            <stop offset="100%" stopColor="#090e18" />
          </linearGradient>
          <linearGradient id={`${uid}-crown`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#fef08a" />
            <stop offset="55%" stopColor="#f5c451" />
            <stop offset="100%" stopColor="#d97706" />
          </linearGradient>
        </defs>
        <rect width="80" height="80" rx="40" fill={`url(#${uid}-bg)`} />
        <path
          d="M19 46 L23 26 L34 35 L40 21 L46 35 L57 26 L61 46 Z"
          fill={`url(#${uid}-crown)`}
          stroke="#fef9c3"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
        <rect x="20" y="49" width="40" height="5" rx="2.5" fill={`url(#${uid}-crown)`} />
        <path d="M18 61 L33 57 L46 59 L62 52" fill="none" stroke="#22dc6e" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="40" cy="20" r="2.4" fill="#ffffff" />
      </>
    ),
  },
];

export function PresetIllustration({ id }: { id: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const preset = AVATAR_PRESETS.find(a => a.id === id) ?? AVATAR_PRESETS.find(a => a.id === 'vinyl-gold')!;
  return (
    <svg viewBox="0 0 80 80" aria-hidden="true" focusable="false">
      {preset.render(uid)}
    </svg>
  );
}

export function ProfileAvatar({
  profile,
  avatar = 'lastfm',
  className = 'avatar',
}: {
  profile: Profile | null;
  avatar?: string;
  className?: string;
}) {
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setImgFailed(false);
  }, [profile?.image]);

  const useLastFmPhoto = (!avatar || avatar === 'lastfm') && !!profile?.image && !imgFailed;

  return (
    <span className={className}>
      {useLastFmPhoto ? (
        <img src={profile.image} alt="" onError={() => setImgFailed(true)} />
      ) : (
        <PresetIllustration id={!avatar || avatar === 'lastfm' ? 'vinyl-gold' : avatar} />
      )}
    </span>
  );
}

export function getAvatarLabel(avatar?: string, hasLastFmPhoto?: boolean): string {
  if (!avatar || avatar === 'lastfm') {
    return hasLastFmPhoto ? 'Foto oficial do Last.fm' : 'Automático · Vinil Ouro';
  }
  return AVATAR_PRESETS.find(a => a.id === avatar)?.name ?? 'Vinil Ouro';
}

type Direction = 'left' | 'right' | 'up' | 'down';

function findSpatialCandidate(container: HTMLElement, current: HTMLElement, dir: Direction): HTMLElement | null {
  const items = Array.from(container.querySelectorAll<HTMLElement>('[data-avatar-option]')).filter(el =>
    typeof el.checkVisibility === 'function' ? el.checkVisibility() : el.offsetParent !== null,
  );
  const cur = current.getBoundingClientRect();
  const tol = 2;

  const candidates = items
    .filter(el => el !== current)
    .map(el => ({ el, rect: el.getBoundingClientRect() }))
    .filter(({ rect }) => {
      if (dir === 'right') return rect.left >= cur.right - tol;
      if (dir === 'left') return rect.right <= cur.left + tol;
      if (dir === 'down') return rect.top >= cur.bottom - tol;
      return rect.bottom <= cur.top + tol;
    });

  if (!candidates.length) return null;

  const curCx = (cur.left + cur.right) / 2;
  const curCy = (cur.top + cur.bottom) / 2;

  const metrics = candidates.map(({ el, rect }) => {
    const cx = (rect.left + rect.right) / 2;
    const cy = (rect.top + rect.bottom) / 2;
    const horizontal = dir === 'left' || dir === 'right';
    const gap =
      dir === 'right'
        ? Math.max(0, rect.left - cur.right)
        : dir === 'left'
          ? Math.max(0, cur.left - rect.right)
          : dir === 'down'
            ? Math.max(0, rect.top - cur.bottom)
            : Math.max(0, cur.top - rect.bottom);
    const overlaps = horizontal
      ? Math.min(cur.bottom, rect.bottom) > Math.max(cur.top, rect.top) + 1
      : Math.min(cur.right, rect.right) > Math.max(cur.left, rect.left) + 1;
    const perpOffset = horizontal ? Math.abs(cy - curCy) : Math.abs(cx - curCx);
    return { el, gap, overlaps, perpOffset };
  });

  const aligned = metrics.filter(m => m.overlaps);
  if (aligned.length) {
    aligned.sort((a, b) => a.gap - b.gap || a.perpOffset - b.perpOffset);
    return aligned[0].el;
  }

  metrics.sort((a, b) => a.gap + 2.5 * a.perpOffset - (b.gap + 2.5 * b.perpOffset));
  return metrics[0].el;
}

export function AvatarPickerModal({
  username,
  profile,
  avatar = 'lastfm',
  onSelect,
  onOpenSettings,
  onClose,
}: {
  username: string;
  profile: Profile | null;
  avatar?: string;
  onSelect: (avatarId: string) => void;
  onOpenSettings: () => void;
  onClose: () => void;
}) {
  const currentId = avatar && (avatar === 'lastfm' || AVATAR_PRESETS.some(a => a.id === avatar)) ? avatar : 'lastfm';
  const [focusedId, setFocusedId] = useState<string>(currentId);
  const gridRef = useRef<HTMLDivElement>(null);

  const handleGridKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const keyMap: Record<string, Direction | undefined> = {
      ArrowRight: 'right',
      ArrowLeft: 'left',
      ArrowDown: 'down',
      ArrowUp: 'up',
    };
    const dir = keyMap[e.key];
    if (!dir || !gridRef.current) return;

    const target = e.nativeEvent.composedPath()[0];
    if (!(target instanceof HTMLElement) || !target.hasAttribute('data-avatar-option')) return;

    const next = findSpatialCandidate(gridRef.current, target, dir);
    if (!next) return;

    e.preventDefault();
    const nextId = next.getAttribute('data-avatar-option') ?? currentId;
    setFocusedId(nextId);
    next.focus();
    next.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };

  return (
    <Modal
      title="Quem está ouvindo?"
      subtitle="Escolha uma arte musical para o seu perfil ou use a foto oficial do Last.fm."
      onClose={onClose}
      wide
    >
      <div className="avatar-picker-hero">
        <ProfileAvatar profile={profile} avatar={currentId} className="avatar avatar-xl" />
        <div className="avatar-picker-meta">
          <span className="eyebrow">
            <Sparkles size={12} />
            <span>IDENTIDADE DO ESTÚDIO</span>
          </span>
          <h3>@{username || 'Perfil'}</h3>
          <p>{getAvatarLabel(currentId, !!profile?.image)}</p>
        </div>
        <button
          type="button"
          className="button small"
          onClick={() => {
            onClose();
            onOpenSettings();
          }}
        >
          <SlidersHorizontal size={15} />
          <span>Ajustes da conta</span>
        </button>
      </div>

      <div
        ref={gridRef}
        className="avatar-grid"
        role="group"
        aria-label="Galeria de avatares musicais"
        onKeyDown={handleGridKeyDown}
      >
        <button
          type="button"
          data-avatar-option="lastfm"
          tabIndex={focusedId === 'lastfm' ? 0 : -1}
          aria-pressed={currentId === 'lastfm'}
          className={`avatar-choice ${currentId === 'lastfm' ? 'selected' : ''}`}
          onFocus={() => setFocusedId('lastfm')}
          onClick={() => onSelect('lastfm')}
        >
          <span className="avatar-choice-art">
            <ProfileAvatar profile={profile} avatar="lastfm" className="avatar avatar-tile" />
            {currentId === 'lastfm' && (
              <span className="avatar-check" aria-hidden="true">
                <Check size={13} strokeWidth={3} />
              </span>
            )}
          </span>
          <strong className="avatar-choice-title">{profile?.image ? 'Foto Last.fm' : 'Automático'}</strong>
          <small className="avatar-choice-vibe">{profile?.image ? 'Oficial da conta' : 'Foto ou Vinil'}</small>
        </button>

        {AVATAR_PRESETS.map(preset => {
          const selected = currentId === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              data-avatar-option={preset.id}
              tabIndex={focusedId === preset.id ? 0 : -1}
              aria-pressed={selected}
              className={`avatar-choice ${selected ? 'selected' : ''}`}
              style={{ '--avatar-accent': preset.accent } as React.CSSProperties}
              onFocus={() => setFocusedId(preset.id)}
              onClick={() => onSelect(preset.id)}
            >
              <span className="avatar-choice-art">
                <span className="avatar avatar-tile">
                  <PresetIllustration id={preset.id} />
                </span>
                {selected && (
                  <span className="avatar-check" aria-hidden="true">
                    <Check size={13} strokeWidth={3} />
                  </span>
                )}
              </span>
              <strong className="avatar-choice-title">{preset.name}</strong>
              <small className="avatar-choice-vibe">{preset.vibe}</small>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}
