import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  AudioLines,
  Award,
  BarChart3,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Crown,
  Download,
  Disc3,
  ExternalLink,
  Film,
  Flame,
  GitMerge,
  Grid2X2,
  Headphones,
  Heart,
  History,
  ImageDown,
  Library,
  Link2,
  Moon,
  Music2,
  Pause,
  Play,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Sun,
  Trash2,
  TrendingUp,
  Trophy,
  Upload,
  Users,
  Volume2,
  WifiOff,
  X,
} from 'lucide-react';
import { useData } from './lib/useData';
import { HistoryExplorer } from './components/HistoryExplorer';
import type { PeriodResult } from './components/PeriodExplorer';
import { summarizePeriod, weeksInPeriod } from './lib/history';
import {
  type AliasRule,
  type ChartEntry,
  type ChartWeek,
  type Item,
  type Kind,
  type Profile,
  type Settings,
  type SourceFilter,
  type SyncProgress,
  type SyncScope,
  studioDefaults,
} from './lib/types';
import { formatDateBR, parseDateBR, validateCalendar } from './lib/calendar';
import { computeRecords, getCertification, getItemAuditHistory, selectScrobblesForFilter } from './lib/charts';
import { renderWeeklyShareCard, palettes } from './lib/canvas';
import { resolveCatalogMedia } from './lib/catalog';
import { backupJSON, chartCSV, download, parseBackup, shareCardPDF } from './lib/export';
import { importWeeks, isLastfmWeekSynced } from './lib/storage';
import {
  AmbientBackdrop,
  Cover,
  Change,
  Empty,
  MiniPlayer,
  Modal,
  ModalArtworkContext,
  MusicLoader,
  Sparkline,
  SyncProgressCard,
  number,
  useArtworkUrl,
  type PreviewPlayerState,
} from './components/UI';
import { AvatarPickerModal, ProfileAvatar, getAvatarLabel } from './components/Avatars';
import { PlatformsHub, PlatformsModal, SourceFilterBar } from './components/Platforms';
import { ChartCanvas } from './components/ChartCanvas';
import { GramophoneIcon } from './components/Gramophone';
import { emptyMetaFilter, metaMatches, type MetaFilter } from './lib/metaFilter';
import type { EffectiveMeta } from './lib/metadata';
import { artworkColor, chromeFor, setChromeBase } from './lib/chrome';
import { NotificationsPanel, useMilestoneNotifications } from './components/Notifications';
import './styles.css';

type Page = 'overview' | 'charts' | 'studio' | 'library' | 'settings';
interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}

const nav = [
  { id: 'overview', label: 'Visão geral', shortLabel: 'Início', icon: Grid2X2 },
  { id: 'charts', label: 'Meus charts', shortLabel: 'Charts', icon: BarChart3 },
  { id: 'studio', label: 'Estúdio', shortLabel: 'Estúdio', icon: Film },
  { id: 'library', label: 'Biblioteca', shortLabel: 'Acervo', icon: Library },
  { id: 'settings', label: 'Ajustes', shortLabel: 'Ajustes', icon: Settings2 },
] as const;

// Telas pesadas carregam sob demanda: abertura mais rápida e menos trabalho no celular.
const Studio = lazy(() => import('./components/Studio').then(m => ({ default: m.Studio })));
const Spotlight = lazy(() => import('./components/Spotlight').then(m => ({ default: m.Spotlight })));
const CatalogPanel = lazy(() => import('./components/CatalogPanel').then(m => ({ default: m.CatalogPanel })));
const DeviceSync = lazy(() => import('./components/DeviceSync').then(m => ({ default: m.DeviceSync })));
const Loading = () => <div className="spotlight-loading" role="status"><MusicLoader size="md" /><span>Carregando…</span></div>;

const kindLabels: Record<Kind, string> = { tracks: 'Músicas', albums: 'Álbuns', artists: 'Artistas' };

function App() {
  const [page, setPage] = useState<Page>('overview');
  const [chartsTab, setChartsTab] = useState<'weekly' | 'records'>('weekly');
  const [kind, setKind] = useState<Kind>('tracks');
  const data = useData(kind);
  const {
    settings,
    setSettings,
    sourceFilter,
    setSourceFilter,
    sourceCounts,
    charts,
    library,
    cached,
    profile,
    progress,
    computing,
    error,
    notice,
    weeks,
  } = data;

  const [year, setYear] = useState('all');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [spotlightOpen,setSpotlightOpen]=useState(false);
  const [studioPeriod, setStudioPeriod] = useState<PeriodResult | null>(null);
  const [weekId, setWeekId] = useState('');
  const [top, setTop] = useState(100);
  const [query, setQuery] = useState('');
  const [favOnly, setFavOnly] = useState(false);
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('lastchart-studio:favorites') ?? '[]');
    } catch {
      return [];
    }
  });
  const [detail, setDetail] = useState<Item | null>(null);
  const [studioSeed, setStudioSeed] = useState<string[] | undefined>(undefined);
  const [exportingCard, setExportingCard] = useState(false);
  const [importingBackup, setImportingBackup] = useState(false);
  const [platformsModal, setPlatformsModal] = useState(false);
  const [help, setHelp] = useState(false);
  const [avatarModal, setAvatarModal] = useState(false);
  const [installHelp, setInstallHelp] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<InstallPrompt | null>(null);
  const [installing,setInstalling]=useState(false);
  const [installed,setInstalled]=useState(()=>matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & {standalone?:boolean}).standalone===true);
  const [online, setOnline] = useState(navigator.onLine);
  const [libraryLimit, setLibraryLimit] = useState(60);
  const [metaFilter, setMetaFilter] = useState<MetaFilter>(emptyMetaFilter);
  const [libraryMeta, setLibraryMeta] = useState<Map<string, EffectiveMeta>>(new Map());
  const [systemDark, setSystemDark] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches);

  // Audio preview state
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [player, setPlayer] = useState<PreviewPlayerState | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const dark = settings.theme === 'dark' || (settings.theme === 'system' && systemDark);
  const reduced = settings.reducedMotion || matchMedia('(prefers-reduced-motion: reduce)').matches;

  const years = useMemo(() => [...new Set(weeks.map(w => w.year))].reverse(), [weeks]);
  const filtered = useMemo(() => charts.filter(w => year === 'all' || w.year === Number(year)), [charts, year]);
  const yearSummary = useMemo(() => summarizePeriod(weeksInPeriod(weeks, year), charts), [weeks, year, charts]);
  const selected = filtered.find(w => w.id === weekId) ?? filtered.filter(w => w.status === 'loaded').at(-1) ?? filtered.at(-1);
  const selectedIndex = filtered.findIndex(w => w.id === selected?.id);
  const loaded = useMemo(() => charts.filter(w => w.status === 'loaded'), [charts]);
  const known = selected?.status === 'loaded';
  const entries = useMemo(
    () => (selected?.entries ?? []).slice(0, top).filter(e => `${e.name} ${e.artist}`.toLowerCase().includes(query.toLowerCase())),
    [selected, top, query],
  );
  const leader = known ? selected.entries[0] : undefined;
  const leaderArtwork = useArtworkUrl(leader ?? null);
  const heroArtwork = useArtworkUrl(player?.item ?? leader ?? null);
  const libraryArtwork = useArtworkUrl(heroArtwork ? null : library[0] ?? null);
  const pageArtwork = heroArtwork || libraryArtwork;
  const recent = useMemo(() => charts.filter(w => w.start <= (selected?.start ?? Infinity)).slice(-8), [charts, selected?.start]);
  const chartItems = useMemo(() => selected?.entries.slice(0, 5) ?? [], [selected]);
  const totalScrobbles = sourceCounts[sourceFilter];
  const lastfmLoaded = useMemo(() => cached.filter(isLastfmWeekSynced).length, [cached]);
  const recentEightLoaded = useMemo(() => {
    const saved = new Set(cached.filter(isLastfmWeekSynced).map(w => w.week.id));
    return weeks.slice(-8).filter(w => saved.has(w.id)).length;
  }, [weeks, cached]);
  const newEntries = selected?.entries.filter(e => e.change === 'NEW').length ?? 0;
  const largestRise = selected?.entries
    .filter(e => typeof e.change === 'number' && e.change > 0)
    .sort((a, b) => Number(b.change) - Number(a.change))[0];

  const records = useMemo(() => computeRecords(filtered), [filtered]);
  useMilestoneNotifications(settings.user, charts, computing, settings.timezone);
  const pulseWeeks = useMemo(() => filtered.slice(-28), [filtered]);
  const maxPulsePlays = useMemo(() => Math.max(1, ...pulseWeeks.map(w => w.plays)), [pulseWeeks]);

  const artistCounts = useMemo(() => {
    const m = new Map<string, number>();
    const week = cached.find(w => w.week.id === selected?.id);
    if (!week) return [];
    const weekScrobbles = selectScrobblesForFilter(
      week.scrobbles,
      settings.deduplicate,
      sourceFilter,
      week.week.start,
      week.week.end,
    );
    weekScrobbles.forEach(s => {
      m.set(s.artist, (m.get(s.artist) ?? 0) + 1);
    });
    return [...m].sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [cached, selected?.id, settings.deduplicate, sourceFilter]);

  const filteredLibrary = useMemo(
    () =>
      library.filter(
        i => (!favOnly || favorites.includes(i.id)) && `${i.name} ${i.artist} ${i.album}`.toLowerCase().includes(query.toLowerCase()) && metaMatches(i, kind, libraryMeta, metaFilter),
      ),
    [library, favOnly, favorites, query, kind, libraryMeta, metaFilter],
  );

  useEffect(() => {
    const m = matchMedia('(prefers-color-scheme: dark)');
    const fn = () => setSystemDark(m.matches);
    m.addEventListener('change', fn);
    return () => m.removeEventListener('change', fn);
  }, []);

  useEffect(() => { setStudioPeriod(null); }, [kind, sourceFilter, settings.user, settings.startDate, settings.timezone, cached]);

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.documentElement.dataset.motion = reduced ? 'reduced' : 'full';
  }, [dark, reduced]);

  // Topo do app e barra de status com a mesma cor, derivada da capa em destaque.
  useEffect(() => {
    let active = true;
    const theme = dark ? 'dark' : 'light';
    setChromeBase(chromeFor(theme, null));
    void artworkColor(pageArtwork).then(rgb => { if (active) setChromeBase(chromeFor(theme, rgb)); });
    return () => { active = false; };
  }, [pageArtwork, dark]);

  useEffect(() => {
    try {
      localStorage.setItem('lastchart-studio:favorites', JSON.stringify(favorites));
    } catch {
      /* optional preference */
    }
  }, [favorites]);

  useEffect(() => {
    const connected = () => setOnline(navigator.onLine);
    const prompt = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as InstallPrompt);
    };
    window.addEventListener('online', connected);
    window.addEventListener('offline', connected);
    window.addEventListener('beforeinstallprompt', prompt);
    const installedApp=()=>{setInstalled(true);setInstallPrompt(null);};
    const visibility=()=>{document.documentElement.dataset.visibility=document.hidden?'hidden':'visible';};
    visibility();
    window.addEventListener('appinstalled',installedApp);
    document.addEventListener('visibilitychange',visibility);
    return () => {
      window.removeEventListener('online', connected);
      window.removeEventListener('offline', connected);
      window.removeEventListener('beforeinstallprompt', prompt);
      window.removeEventListener('appinstalled',installedApp);
      document.removeEventListener('visibilitychange',visibility);
    };
  }, []);

  useEffect(() => {
    if (!progress) return;
    const prevent = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', prevent);
    return () => window.removeEventListener('beforeunload', prevent);
  }, [progress]);

  // Cleanup audio element on unmount
  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);

  const playPreview = async (item: Item) => {
    if (player?.item.id === item.id && player.previewUrl) {
      togglePreview();
      return;
    }
    audioRef.current?.pause();
    setPlayer({
      item,
      loading: true,
      previewUrl: '',
      externalUrl: '',
      playing: false,
      progress: 0,
      unavailable: false,
    });

    const media = await resolveCatalogMedia(item);
    if (!media?.previewUrl) {
      setPlayer({
        item,
        loading: false,
        previewUrl: '',
        externalUrl: media?.trackViewUrl ?? '',
        playing: false,
        progress: 0,
        unavailable: true,
      });
      return;
    }

    const audio = new Audio(media.previewUrl);
    audio.preload = 'auto';
    audioRef.current = audio;

    audio.ontimeupdate = () => {
      const p = audio.duration ? Math.min(1, audio.currentTime / audio.duration) : 0;
      setPlayer(prev => (prev && prev.item.id === item.id ? { ...prev, progress: p } : prev));
    };
    audio.onended = () => {
      setPlayer(prev => (prev && prev.item.id === item.id ? { ...prev, playing: false, progress: 0 } : prev));
    };
    audio.onerror = () => {
      setPlayer(prev => (prev && prev.item.id === item.id ? { ...prev, playing: false, unavailable: true } : prev));
    };

    try {
      await audio.play();
      setPlayer({
        item: media.artworkUrl && !item.image ? { ...item, image: media.artworkUrl } : item,
        loading: false,
        previewUrl: media.previewUrl,
        externalUrl: media.trackViewUrl,
        playing: true,
        progress: 0,
        unavailable: false,
      });
    } catch {
      setPlayer({
        item,
        loading: false,
        previewUrl: media.previewUrl,
        externalUrl: media.trackViewUrl,
        playing: false,
        progress: 0,
        unavailable: false,
      });
    }
  };

  const togglePreview = () => {
    const audio = audioRef.current;
    if (!audio || !player) return;
    if (audio.paused) {
      audio.play().then(() => setPlayer(p => (p ? { ...p, playing: true } : null))).catch(() => {});
    } else {
      audio.pause();
      setPlayer(p => (p ? { ...p, playing: false } : null));
    }
  };

  const closePreview = () => {
    audioRef.current?.pause();
    audioRef.current = null;
    setPlayer(null);
  };

  const navigate = (next: Page) => {
    const apply = () => {
      setPage(next);
      setQuery('');
      setLibraryLimit(60);
    };
    const doc = document as Document & { startViewTransition?: (cb: () => void) => { finished: Promise<void> } };
    if (!reduced && typeof doc.startViewTransition === 'function') {
      const vt = doc.startViewTransition(() => {
        flushSync(apply);
      });
      vt.finished.finally(() => {
        window.scrollTo({ top: 0, behavior: 'instant' });
        headingRef.current?.focus({ preventScroll: true });
      });
    } else {
      apply();
      window.scrollTo({ top: 0, behavior: reduced ? 'instant' : 'smooth' });
      requestAnimationFrame(() => headingRef.current?.focus({ preventScroll: true }));
    }
  };

  const sendToStudio = (ids: string[]) => {
    setStudioSeed(ids);
    navigate('studio');
  };

  const favorite = (id: string) => setFavorites(f => (f.includes(id) ? f.filter(v => v !== id) : [...f, id]));

  const install = async () => {
    if(installing)return;
    setInstalling(true);
    try {
    if (installPrompt) {
      await installPrompt.prompt();
      const choice=await installPrompt.userChoice;
      setInstallPrompt(null);
      data.setNotice(choice.outcome==='accepted'?'Instalação iniciada pelo navegador.':'Você pode instalar depois pelo botão “Instalar”.');
    } else {
      setInstallHelp(true);
    }
    } catch {setInstallHelp(true);}
    finally {setInstalling(false);}
  };

  const saveCSV = () => {
    if (selected) {
      download(new Blob([chartCSV(selected.entries.slice(0, top))], { type: 'text/csv;charset=utf-8' }), `lastchart-${kind}-${selected.id}.csv`);
    }
  };

  const saveWeeklyCard = async (format: 'png' | 'pdf' = 'png') => {
    if (!selected || !known || !selected.entries.length || exportingCard) return;
    setExportingCard(true);
    try {
      const blob = await renderWeeklyShareCard(selected, kind, settings.user);
      if (blob) download(format === 'pdf' ? await shareCardPDF(blob) : blob, `lastchart-card-${kind}-${selected.id}.${format}`);
      else data.setError('Não foi possível gerar o card da semana.');
    } catch {
      data.setError('Falha ao renderizar o card da semana.');
    } finally {
      setExportingCard(false);
    }
  };

  const exportBackup = () =>
    download(new Blob([backupJSON(settings, cached, profile)], { type: 'application/json' }), `lastchart-backup-${settings.user}.json`);

  const loadBackup = async (file?: File) => {
    if (!file || importingBackup) return;
    setImportingBackup(true);
    try {
      if (file.size > 100 * 1024 * 1024) throw new Error('O backup deve ter menos de 100 MB.');
      const result = parseBackup(await file.text());
      await importWeeks(result.settings, result.weeks);
      setSettings(result.settings);
      data.refresh();
      data.setNotice(`${result.weeks.length} semanas importadas de ${result.settings.user}.`);
    } catch (e) {
      data.setError(e instanceof Error ? e.message : 'Backup inválido.');
    } finally {
      setImportingBackup(false);
    }
  };

  const legendPalette = palettes.neon;

  return (
    <ModalArtworkContext.Provider value={heroArtwork}><div className="app-shell">
      <a href="#main" className="skip-link">
        Pular para o conteúdo
      </a>

      <aside className="sidebar">
        <button type="button" className="brand" onClick={() => navigate('overview')} aria-label="LastChart início">
          <span className="brand-mark">
            <AudioLines />
          </span>
          <span>
            lastchart
            <span className="brand-sub">STUDIO PRO</span>
          </span>
        </button>

        <span className="sidebar-caption">PLATAFORMA</span>
        <nav aria-label="Navegação principal">
          {nav.map(({ id, label, icon: Icon }) => (
            <button
              type="button"
              key={id}
              className={`nav-link ${page === id ? 'active' : ''}`}
              onClick={() => navigate(id)}
              aria-current={page === id ? 'page' : undefined}
            >
              <Icon size={19} />
              <span>{label}</span>
              {id === 'studio' && <span className="tiny-badge">60FPS</span>}
            </button>
          ))}
          <button type="button" className={`nav-link ${spotlightOpen?'active':''}`} aria-haspopup="dialog" aria-expanded={spotlightOpen} onClick={()=>setSpotlightOpen(true)}><GramophoneIcon size={19}/><span>Charts & prêmios</span></button>
        </nav>

        <div className="sidebar-bottom">
          <div className="install-card">
            <div className="install-card-top">
              <span className="install-icon">
                <Smartphone size={18} />
              </span>
              <span className="tiny-pill">PWA</span>
            </div>
            <strong>App nativo no celular</strong>
            <p>Acesso offline aos seus charts e tela cheia no Android ou iOS.</p>
            <button type="button" className="button full small" onClick={install}>
              <span>Instalar app</span>
              <ArrowUpRight size={14} />
            </button>
          </div>
          <button type="button" className="sidebar-help" onClick={() => setHelp(true)}>
            <CircleHelp size={16} />
            <span>Metodologia ZeroCharts</span>
            <ArrowUpRight size={13} />
          </button>
          <a className="lastfm-credit" href="https://www.last.fm" target="_blank" rel="noreferrer">
            Sincronizado via <b>Last.fm API</b>
          </a>
        </div>
      </aside>

      <div className="workspace">
        <AmbientBackdrop src={pageArtwork} className="page-artwork" />
        <div className="page-grid" aria-hidden="true" />
        <header className="topbar">
          <div className="breadcrumb">
            <span>LastChart Studio</span>
            <ChevronRight size={14} />
            <strong>{nav.find(n => n.id === page)?.label}</strong>
          </div>

          <button type="button" className="mobile-brand" onClick={() => navigate('overview')}>
            <span className="brand-mark small">
              <AudioLines size={18} />
            </span>
            <span>lastchart</span>
          </button>

          <div className="topbar-actions">
            <span className={`connection ${online ? '' : 'offline'}`}>
              <i />
              <span>{online ? 'Online' : 'Offline'}</span>
            </span>
            {!installed&&<button type="button" className="button small install-header-button" onClick={()=>void install()} disabled={installing} aria-label="Instalar aplicativo no celular">{installing?<MusicLoader size="sm"/>:<Smartphone size={16}/>}<span>Instalar</span></button>}
            <button
              type="button"
              className={`icon-button theme-toggle ${dark ? 'is-dark' : ''}`}
              title={dark ? 'Disco noturno · ativar tema claro' : 'Disco diurno · ativar tema escuro'}
              aria-label={dark ? 'Ativar modo claro' : 'Ativar modo escuro'}
              onClick={() => setSettings({ ...settings, theme: dark ? 'light' : 'dark' })}
            >
              <Disc3 size={18} />
            </button>
            <button
              type="button"
              className="profile-button"
              onClick={() => setAvatarModal(true)}
              aria-label={`Trocar avatar do perfil ${profile?.name ?? settings.user ?? 'Perfil'}`}
            >
              <ProfileAvatar profile={profile} avatar={settings.avatar} className="avatar" />
              <span className="profile-meta">
                <strong>{profile?.name ?? settings.user ?? 'Perfil'}</strong>
                <small>{cached.length} sem. salvas</small>
              </span>
            </button>
          </div>
        </header>

        <main id="main">
          {page==='overview'&&!installed&&<section className="install-banner" aria-label="Instalar LastChart no celular"><Smartphone size={24}/><div><strong>Seu LastChart na tela inicial</strong><small>Instale pelo navegador e abra como aplicativo.</small></div><button type="button" className="button primary" onClick={()=>void install()} disabled={installing}>{installing?<MusicLoader size="sm" tone="ink"/>:<Download size={16}/>}<span>{installing?'Abrindo instalação…':'Instalar no celular'}</span></button></section>}
              {(page==='overview'||page==='charts')&&<section className="spotlight-entry"><div className="spotlight-entry-icon"><GramophoneIcon size={34}/></div><div><span className="eyebrow">SPOTLIGHT</span><h2>Seu gosto merece o palco.</h2><p>Crie sua edição de charts, revele os vencedores e revisite sua história.</p></div><button type="button" className="button" onClick={()=>setSpotlightOpen(true)}><Sparkles size={16}/><span>Charts & premiações</span></button></section>}
          {!online && (
            <div className="alert">
              <WifiOff size={18} />
              <span>Modo offline ativo. Todo o seu histórico já sincronizado continua disponível.</span>
            </div>
          )}
          {error && (
            <div className="alert error" role="alert">
              <CircleHelp size={18} />
              <span>{error}</span>
              <button type="button" aria-label="Fechar erro" className="icon-button" onClick={() => data.setError('')}>
                <X size={16} />
              </button>
            </div>
          )}
          {notice && (
            <div className="alert success" role="status">
              <Check size={18} />
              <span>{notice}</span>
              <button type="button" aria-label="Fechar aviso" className="icon-button" onClick={() => data.setNotice('')}>
                <X size={16} />
              </button>
            </div>
          )}
          {progress && page !== 'settings' && (
            <SyncProgressCard progress={progress} onCancel={data.cancel} />
          )}
          {computing && !progress && (
            <div className="sync-status" role="status" aria-live="polite">
              <MusicLoader size="md" />
              <div><strong>Atualizando seus charts…</strong><small>Organizando as semanas salvas e calculando posições e recordes.</small></div>
            </div>
          )}

          <section className={`hero-banner ${pageArtwork ? 'has-ambient' : ''}`}>
            {pageArtwork && (
              <AmbientBackdrop src={pageArtwork} active={!!player?.playing} className="hero-ambient" />
            )}
            <div className="hero-rings" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <div className="hero-copy">
              <div className="eyebrow">
                <Sparkles size={13} />
                <span>
                  {page === 'overview'
                    ? 'SEU UNIVERSO EM DADOS REAIS'
                    : page === 'studio'
                      ? 'MOTOR GRÁFICO 60 FPS · LINHAS & BARRAS'
                      : page === 'charts'
                        ? 'PADRÃO ZEROCHARTS · SEXTA A QUINTA'
                        : page === 'library'
                          ? 'CATÁLOGO & CERTIFICAÇÕES PESSOAIS'
                          : 'CONTROLE TOTAL & PRIVACIDADE LOCAL'}
                </span>
              </div>
              <h1 ref={headingRef} tabIndex={-1}>
                {page === 'overview'
                  ? 'Sua música em escala cinematográfica.'
                  : page === 'studio'
                    ? 'Dê movimento à sua história.'
                    : page === 'charts'
                      ? 'Rankings semanais auditáveis.'
                      : page === 'library'
                        ? 'Seu acervo e certificações.'
                        : 'Calibre seu estúdio.'}
              </h1>
              <p>
                {page === 'overview'
                  ? `Perfil @${settings.user} · Contagem cravada de sexta 00:00 a quinta 23:59 (${settings.timezone}).`
                  : page === 'studio'
                    ? 'Curvas Bézier estilo Billboard ou Corrida de Barras estilo YouTube, com exportação nativa em vídeo.'
                    : page === 'charts'
                      ? 'Explore picos, variações, estreias, reentradas e gere cards prontos para compartilhar.'
                      : page === 'library'
                        ? 'Ouça prévias de 30s, filtre favoritos e acompanhe discos de Ouro, Platina e Diamante.'
                        : 'Configure início de contagem, plataformas (Last.fm, Spotify, YouTube Music), aliases e backups.'}
              </p>
            </div>
            {page !== 'settings' && (
              <div className="hero-cta-group">
                <button
                  type="button"
                  className={`button primary sync-cta ${progress ? 'is-loading' : ''}`}
                  disabled={!!progress || !online}
                  onClick={() => data.sync(lastfmLoaded < weeks.length ? 'all' : 'recent')}
                >
                  {progress ? <MusicLoader size="sm" tone="ink" /> : <History size={17} />}
                  <span>{progress ? 'Sincronizando…' : lastfmLoaded < weeks.length ? cached.length ? 'Continuar histórico' : 'Conectar Last.fm e baixar histórico' : 'Atualizar Last.fm'}</span>
                </button>
                <button
                  type="button"
                  className="button glass-btn"
                  onClick={() => setPlatformsModal(true)}
                >
                  <Link2 size={16} />
                  <span>Spotify & YT Music</span>
                </button>
                {known && !!selected?.entries.length && page !== 'studio' && (
                  <button
                    type="button"
                    className={`button glass-btn ${exportingCard ? 'is-loading' : ''}`}
                    disabled={exportingCard}
                    onClick={() => void saveWeeklyCard()}
                  >
                    {exportingCard ? <MusicLoader size="sm" /> : <ImageDown size={17} />}
                    <span>{exportingCard ? 'Gerando card…' : 'Card Top 10'}</span>
                  </button>
                )}
              </div>
            )}
          </section>

          {page === 'settings' ? (
            <SettingsPage
              settings={settings}
              profile={profile}
              busy={!!progress}
              progress={progress}
              onCancelSync={data.cancel}
              importingBackup={importingBackup}
              sourceCounts={sourceCounts}
              onDataChanged={data.refresh}
              setSettings={setSettings}
              onPickAvatar={() => setAvatarModal(true)}
              onSync={(scope, force) => data.sync(scope, force)}
              onError={data.setError}
              onNotice={data.setNotice}
              onExport={exportBackup}
              onImport={loadBackup}
              loaded={lastfmLoaded}
              recentEightLoaded={recentEightLoaded}
              total={weeks.length}
              duplicates={cached.reduce((n, w) => n + w.duplicates, 0)}
              years={years}
              onInstall={install}
              charts={charts}
            />
          ) : (
            <>
              <div className="control-deck">
                <div className="segmented" role="group" aria-label="Tipo de ranking">
                  {(['tracks', 'albums', 'artists'] as Kind[]).map(k => (
                    <button
                      type="button"
                      className={kind === k ? 'selected' : ''}
                      key={k}
                      onClick={() => {
                        setKind(k);
                        setQuery('');
                        setMetaFilter(emptyMetaFilter);
                        setLibraryLimit(60);
                      }}
                      aria-pressed={kind === k}
                    >
                      {k === 'tracks' ? <Music2 size={16} /> : k === 'albums' ? <Grid2X2 size={16} /> : <Users size={16} />}
                      <span>{kindLabels[k]}</span>
                    </button>
                  ))}
                </div>

                {page !== 'library' && page !== 'studio' && selected && (
                  <div className="week-stepper" role="group" aria-label="Navegação de semanas">
                    <button
                      type="button"
                      className="icon-button stepper-arrow"
                      aria-label="Semana anterior"
                      disabled={selectedIndex <= 0}
                      onClick={() => setWeekId(filtered[selectedIndex - 1].id)}
                    >
                      <ChevronLeft size={18} />
                    </button>
                    <label className="week-picker-label">
                      <CalendarDays size={15} />
                      <span className="week-picker-text">
                        <strong>Sem. {selected.number}</strong>
                        <span>
                          {selected.label}
                          {selected.status === 'missing' ? ' (não baixada)' : selected.partial ? ' (atual)' : ''}
                        </span>
                      </span>
                      <select
                        aria-label="Selecionar semana"
                        value={selected.id}
                        onChange={e => setWeekId(e.target.value)}
                      >
                        {[...filtered].reverse().map(w => (
                          <option key={w.id} value={w.id}>
                            Sem. {w.number} · {w.label}
                            {w.status === 'missing' ? ' · não baixada' : ''}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      className="icon-button stepper-arrow"
                      aria-label="Próxima semana"
                      disabled={selectedIndex >= filtered.length - 1}
                      onClick={() => setWeekId(filtered[selectedIndex + 1].id)}
                    >
                      <ChevronRight size={18} />
                    </button>
                  </div>
                )}
              </div>

              <SourceFilterBar
                value={sourceFilter}
                counts={sourceCounts}
                computing={computing}
                onChange={setSourceFilter}
                onOpenConnect={() => setPlatformsModal(true)}
              />

              {page !== 'library' && (
                <section className="history-entry" aria-label="Acessar todo o histórico">
                  <div><strong>{page==='studio'?'Datas do vídeo':'Seu histórico completo'}</strong><small>{page==='studio'?'Escolha um ano, mês, semana ou intervalo livre para animar.':`${lastfmLoaded} de ${weeks.length} semanas Last.fm salvas · ${years.at(-1)}–${years[0]}`}</small></div>
                  <button type="button" className="button" onClick={() => setHistoryOpen(true)}><CalendarDays size={16}/><span>{page==='studio'?'Filtrar período do vídeo':'Explorar dias, meses e anos'}</span></button>
                  {lastfmLoaded < weeks.length && <button type="button" className="button primary" disabled={!!progress || !online} onClick={() => void data.sync('all')}>{progress ? <MusicLoader size="sm" tone="ink"/> : <Download size={16}/>}<span>{progress ? 'Baixando histórico…' : 'Baixar histórico completo'}</span></button>}
                </section>
              )}

              {page !== 'library' && (
                <div className="year-strip" role="group" aria-label="Filtrar por ano">
                  <button
                    type="button"
                    className={`year-pill ${year === 'all' ? 'active' : ''}`}
                    onClick={() => {
                      setYear('all');
                      setStudioPeriod(null);
                      setWeekId('');
                    }}
                  >
                    Todo histórico
                  </button>
                  {years.map(y => (
                    <button
                      type="button"
                      key={y}
                      className={`year-pill ${year === String(y) ? 'active' : ''}`}
                      onClick={() => {
                        setYear(String(y));
                        setStudioPeriod(null);
                        setWeekId('');
                      }}
                    >
                      {y}
                    </button>
                  ))}
                </div>
              )}

              {year !== 'all' && page !== 'library' && <div className="history-summary" aria-live="polite"><strong>{year} · {yearSummary.loaded}/{yearSummary.total} semanas baixadas</strong><p>{computing ? 'Atualizando os charts deste ano…' : yearSummary.state==='missing' ? 'Este ano ainda não foi baixado. Isso não significa que não houve músicas ouvidas.' : yearSummary.state==='empty' ? `Nenhuma reprodução encontrada em ${year} para a fonte selecionada, nas semanas até hoje.` : yearSummary.missing ? `Faltam ${yearSummary.missing} semanas para consultar o ano completo.` : `${number(yearSummary.plays)} reproduções no ano, nas semanas disponíveis até hoje.`}</p>{yearSummary.missing > 0 && <button type="button" className="button" disabled={!!progress || !online} onClick={() => void data.sync(Number(year))}>{progress ? <MusicLoader size="sm"/> : <Download size={16}/>}<span>{progress ? 'Baixando…' : `Baixar ${year} completo`}</span></button>}</div>}

              {page === 'overview' && (
                <>
                  <div className="stat-grid">
                    <Stat
                      title="Scrobbles na semana"
                      value={known ? number(selected.plays) : '—'}
                      caption={selected?.partial ? 'Semana em andamento' : `Sem. ${selected?.number ?? '—'} · sexta a quinta`}
                      icon={<Headphones size={16} />}
                    />
                    <Stat
                      title={`${kindLabels[kind]} no período`}
                      value={known ? number(selected.unique) : '—'}
                      caption="Itens distintos ouvidos"
                      icon={<Music2 size={16} />}
                    />
                    <Stat
                      title="Estreias no Top 100"
                      value={known && !selected.provisional ? String(newEntries) : '—'}
                      caption={selected?.provisional ? 'Sincronize tudo p/ confirmar' : 'Entradas inéditas (NEW)'}
                      icon={<Sparkles size={16} />}
                    />
                    <Stat
                      title="Arquivo sincronizado"
                      value={`${number(cached.length)}/${weeks.length}`}
                      caption={`${number(totalScrobbles)} plays armazenados`}
                      icon={<CalendarDays size={16} />}
                    />
                  </div>

                  <div className="overview-grid">
                    <section className="panel trajectory">
                      <div className="panel-heading">
                        <div>
                          <span className="eyebrow">TRAJETÓRIA EM TEMPO REAL</span>
                          <h2>Disputa pelo topo</h2>
                        </div>
                        <button
                          type="button"
                          className="button small"
                          onClick={() => sendToStudio(chartItems.map(i => i.id))}
                        >
                          <Film size={15} />
                          <span>Animar no Estúdio</span>
                        </button>
                      </div>
                      <div className="trajectory-stage">
                        <ChartCanvas
                          options={{
                            charts: recent,
                            items: chartItems,
                            settings: { ...studioDefaults, top: 20, spacing: 84, canvasTheme: dark ? 'dark' : 'light' },
                            position: Math.max(0, recent.length - 1),
                            dark,
                            reduced,
                          }}
                          height={305}
                        />
                      </div>
                      <div className="chart-legend">
                        {chartItems.length ? (
                          chartItems.map((item, i) => (
                            <button type="button" key={item.id} onClick={() => setDetail(item)}>
                              <i style={{ background: legendPalette[i % legendPalette.length] }} />
                              <span>
                                #{i + 1} {item.name}
                              </span>
                            </button>
                          ))
                        ) : (
                          <span className="muted">Sincronize seu perfil Last.fm para visualizar as curvas reais da semana.</span>
                        )}
                      </div>
                    </section>

                    <section className={`number-one ${leaderArtwork ? 'has-ambient' : ''}`}>
                      {leaderArtwork && (
                        <AmbientBackdrop
                          src={leaderArtwork}
                          active={!!(leader && player?.item.id === leader.id && player.playing)}
                          className="spotlight-ambient"
                        />
                      )}
                      <div className="spotlight-orbit" aria-hidden="true" />
                      <span className="eyebrow gold-eyebrow">
                        <Crown size={15} />
                        <span>LÍDER DA SEMANA #1</span>
                      </span>
                      <div className="spotlight-art">
                        {leader ? (
                          <Cover item={leader} size="hero-cover" />
                        ) : (
                          <div className="record-art">
                            <div />
                            <AudioLines size={40} />
                          </div>
                        )}
                        <span className="rank-stamp">#1</span>
                      </div>
                      <div className="spotlight-copy">
                        <h2>{leader?.name ?? 'Pronto para estrear'}</h2>
                        <p>{leader?.artist ?? 'Sincronize as semanas recentes para revelar seu #1.'}</p>
                        {leader && (
                          <div className="spotlight-pills">
                            <span>Pico #{leader.peak}</span>
                            <span>{leader.weeks} sem.</span>
                            {(leader.weeksAtOne ?? 0) > 1 && <span>{leader.weeksAtOne}× #1</span>}
                          </div>
                        )}
                      </div>
                      <div className="spotlight-footer">
                        <div>
                          {leader ? (
                            <>
                              <strong>{number(leader.plays)}</strong>
                              <span>plays</span>
                            </>
                          ) : (
                            <span>@{settings.user}</span>
                          )}
                        </div>
                        <div className="spotlight-btns">
                          {leader && (
                            <button
                              type="button"
                              className="round-action"
                              aria-label={`Ouvir prévia de ${leader.name}`}
                              onClick={() => void playPreview(leader)}
                            >
                              {player?.loading && player.item.id === leader.id ? (
                                <MusicLoader size="sm" />
                              ) : player?.item.id === leader.id && player.playing ? (
                                <Pause size={16} fill="currentColor" />
                              ) : (
                                <Play size={16} fill="currentColor" />
                              )}
                            </button>
                          )}
                          <button
                            type="button"
                            className={`round-action primary-round ${!leader && progress ? 'is-loading' : ''}`}
                            aria-label={leader ? 'Ver histórico completo do número um' : 'Sincronizar agora'}
                            onClick={() => (leader ? setDetail(leader) : data.sync('recent'))}
                            disabled={!!progress}
                          >
                            {!leader && progress ? <MusicLoader size="sm" tone="ink" /> : <ArrowUpRight size={17} />}
                          </button>
                        </div>
                      </div>
                    </section>
                  </div>

                  {loaded.length > 1 && (
                    <section className="panel pulse-panel">
                      <div className="panel-heading">
                        <div>
                          <span className="eyebrow">PULSO DE AUDIÇÃO</span>
                          <h2>Atividade semanal</h2>
                        </div>
                        <span className="muted small-text">Toque em uma barra para abrir a semana</span>
                      </div>
                      <div className="pulse-bars" role="list" aria-label="Atividade nas últimas semanas">
                        {pulseWeeks.map(w => {
                          const pct = w.status === 'loaded' ? Math.max(8, Math.round((w.plays / maxPulsePlays) * 100)) : 6;
                          const isSel = w.id === selected?.id;
                          return (
                            <button
                              type="button"
                              key={w.id}
                              className={`pulse-col ${isSel ? 'active' : ''} ${w.status === 'missing' ? 'missing' : ''}`}
                              onClick={() => setWeekId(w.id)}
                              title={`Sem. ${w.number} (${w.label}): ${w.status === 'loaded' ? `${w.plays} plays` : 'não baixada'}`}
                              aria-label={`Semana ${w.number}, ${w.label}, ${w.status === 'loaded' ? `${w.plays} reproduções` : 'não sincronizada'}`}
                            >
                              <span className="pulse-bar" style={{ height: `${pct}%` }} />
                              <small>{formatDateBR(w.id)}</small>
                            </button>
                          );
                        })}
                      </div>
                    </section>
                  )}

                  <div className="lower-grid">
                    <section className="panel">
                      <div className="panel-heading">
                        <div>
                          <span className="eyebrow">TOP 5 DA SEMANA</span>
                          <h2>Destaques do ranking</h2>
                        </div>
                        <button type="button" className="button small" onClick={() => navigate('charts')}>
                          <span>Top 100</span>
                          <ArrowRight size={15} />
                        </button>
                      </div>
                      {entries.length ? (
                        <Ranking
                          entries={entries.slice(0, 5)}
                          onDetail={setDetail}
                          onPreview={playPreview}
                          playingId={player?.playing ? player.item.id : undefined}
                          loadingId={player?.loading ? player.item.id : undefined}
                          favorites={favorites}
                          onFavorite={favorite}
                          compact
                        />
                      ) : (
                        <Empty
                          title={known ? 'Semana sem reproduções' : 'Conecte seu histórico musical'}
                          description={
                            known
                              ? 'Nenhum play registrado entre sexta 00:00 e quinta 23:59 na plataforma filtrada.'
                              : 'Baixe as semanas recentes do Last.fm ou importe seu histórico do Spotify / YouTube Music.'
                          }
                          action={
                            !known ? (
                              <div className="inline-actions">
                                <button
                                  type="button"
                                  className={`button primary ${progress ? 'is-loading' : ''}`}
                                  disabled={!!progress}
                                  onClick={() => data.sync(lastfmLoaded < weeks.length ? 'all' : 'recent')}
                                >
                                  {progress ? <MusicLoader size="sm" tone="ink" /> : <History size={16} />}
                                  <span>{progress ? 'Sincronizando…' : 'Sincronizar Last.fm'}</span>
                                </button>
                                <button type="button" className="button" onClick={() => setPlatformsModal(true)}>
                                  <Link2 size={16} />
                                  <span>Spotify / YT Music</span>
                                </button>
                              </div>
                            ) : undefined
                          }
                        />
                      )}
                    </section>

                    <section className="panel artist-panel">
                      <div className="panel-heading">
                        <div>
                          <span className="eyebrow">ROTAÇÃO SEMANAL</span>
                          <h2>Artistas dominantes</h2>
                        </div>
                        <Users size={19} />
                      </div>
                      {artistCounts.length ? (
                        <div className="artist-bars">
                          {artistCounts.map(([artist, plays], i) => (
                            <div key={artist} className="artist-bar-row">
                              <div className="artist-bar-label">
                                <span>
                                  <b>{String(i + 1).padStart(2, '0')}</b>
                                  {artist}
                                </span>
                                <strong>{number(plays)} plays</strong>
                              </div>
                              <div className="bar-track">
                                <i style={{ width: `${(plays / artistCounts[0][1]) * 100}%`, opacity: 1 - i * 0.12 }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="quiet-illustration">
                          <AudioLines size={46} />
                          <p>Os artistas mais ouvidos da semana aparecem aqui.</p>
                        </div>
                      )}
                      <div className="insight">
                        <TrendingUp size={19} />
                        <div>
                          <strong>{largestRise ? `Maior subida: +${largestRise.change} posições` : 'Critério de desempate determinístico'}</strong>
                          <p>
                            {largestRise
                              ? `${largestRise.name} (${largestRise.artist}) protagonizou a maior escalada desta semana.`
                              : 'Em caso de empate em plays, vence quem teve melhor posição na semana imediatamente anterior.'}
                          </p>
                        </div>
                      </div>
                    </section>
                  </div>

                  <section className="studio-banner">
                    <div className="banner-icon">
                      <Film size={22} />
                    </div>
                    <div className="banner-copy">
                      <span className="eyebrow">BILLBOARD LINES + YOUTUBE BAR RACE</span>
                      <h2>Transforme anos de scrobbles em vídeo 60fps.</h2>
                      <p>Compare faixas ou discografias inteiras com coroa dourada no #1, pulso Top 10 e exportação direta.</p>
                    </div>
                    <button type="button" className="button primary" onClick={() => navigate('studio')}>
                      <span>Abrir Estúdio Pro</span>
                      <ArrowUpRight size={16} />
                    </button>
                  </section>
                </>
              )}


              {page === 'charts' && (
                <section className="panel">
                  <div className="panel-heading charts-header">
                    <div>
                      <span className="eyebrow">TABELA OFICIAL ZEROCHARTS</span>
                      <h2>
                        {chartsTab === 'weekly' ? `${kindLabels[kind]} · Top ${top}` : `Hall de Recordes · ${kindLabels[kind]}`}
                      </h2>
                      <p>
                        {chartsTab === 'weekly'
                          ? `Semana ${selected?.number ?? '—'} · ${selected?.label ?? ''}${selected?.partial ? ' · Em andamento' : ''}`
                          : `Acumulado nas semanas sincronizadas (${year === 'all' ? 'Todo histórico' : year})`}
                      </p>
                    </div>

                    <div className="inline-actions">
                      <div className="segmented compact-seg" role="group" aria-label="Visualização de charts">
                        <button
                          type="button"
                          className={chartsTab === 'weekly' ? 'selected' : ''}
                          onClick={() => setChartsTab('weekly')}
                        >
                          <BarChart3 size={14} />
                          <span>Tabela</span>
                        </button>
                        <button
                          type="button"
                          className={chartsTab === 'records' ? 'selected' : ''}
                          onClick={() => setChartsTab('records')}
                        >
                          <Trophy size={14} />
                          <span>Recordes</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {chartsTab === 'records' ? (
                    <RecordsBoard records={records} onDetail={setDetail} />
                  ) : (
                    <>
                      <div className="table-toolbar">
                        <div className="search-field">
                          <Search size={17} />
                          <input
                            aria-label="Buscar no chart"
                            placeholder="Filtrar música, álbum ou artista nesta semana…"
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                          />
                        </div>
                        <div className="toolbar-buttons">
                          <select aria-label="Tamanho do ranking" value={top} onChange={e => setTop(Number(e.target.value))}>
                            {[100, 50, 30, 20, 10].map(n => (
                              <option key={n} value={n}>
                                Top {n}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className="button small"
                            disabled={!known || !entries.length}
                            onClick={() => sendToStudio(entries.slice(0, 10).map(e => e.id))}
                          >
                            <Film size={15} />
                            <span>Animar</span>
                          </button>
                          <button
                            type="button"
                            className={`button small ${exportingCard ? 'is-loading' : ''}`}
                            disabled={!known || !entries.length || exportingCard}
                            onClick={() => void saveWeeklyCard()}
                          >
                            {exportingCard ? <MusicLoader size="sm" /> : <ImageDown size={15} />}
                            <span>{exportingCard ? 'Gerando…' : 'Card PNG'}</span>
                          </button>
                          <button type="button" className="button small" disabled={!known || !entries.length || exportingCard} onClick={() => void saveWeeklyCard('pdf')}><Download size={15} /><span>Card PDF</span></button>
                          <button type="button" className="button small" disabled={!known || !entries.length} onClick={saveCSV}>
                            <Download size={15} />
                            <span>CSV</span>
                          </button>
                        </div>
                      </div>

                      {known ? (
                        <Ranking
                          entries={entries}
                          onDetail={setDetail}
                          onPreview={playPreview}
                          playingId={player?.playing ? player.item.id : undefined}
                          loadingId={player?.loading ? player.item.id : undefined}
                          onAnimate={item => sendToStudio([item.id])}
                          favorites={favorites}
                          onFavorite={favorite}
                        />
                      ) : (
                        <Empty
                          title="Esta semana ainda não foi sincronizada"
                          description="Semanas não baixadas são tratadas como lacunas reais (nunca como zero). Sincronize o ano ou importe dados do Spotify/YT Music."
                          action={
                            <button
                              type="button"
                              className={`button primary ${progress ? 'is-loading' : ''}`}
                              disabled={!!progress}
                              onClick={() => data.sync(selected?.year ?? 'recent')}
                            >
                              {progress ? <MusicLoader size="sm" tone="ink" /> : <History size={16} />}
                              <span>{progress ? `Sincronizando ${selected?.year}…` : `Sincronizar ${selected?.year}`}</span>
                            </button>
                          }
                        />
                      )}
                      {known && !entries.length && (
                        <Empty title="Nenhum item encontrado" description="Ajuste sua busca ou escolha outra semana no seletor acima." />
                      )}
                      {selected?.provisional && (
                        <p className="note">
                          <ShieldCheck size={16} />
                          <span>
                            Pico, total de semanas e estreias refletem o trecho já baixado. Sincronize todo o histórico em Ajustes para recordes definitivos desde 2016.
                          </span>
                        </p>
                      )}
                      <p className="table-footnote">
                        NEW estreia inédita · RE retorno ao Top 100 · — sem mudança ou semana anterior não sincronizada. Toque em qualquer item para inspecionar o chart run completo.
                      </p>
                    </>
                  )}
                </section>
              )}

              {page === 'studio' && (
                <>
                {studioPeriod && <div className="history-summary"><strong>Vídeo com {studioPeriod.charts.length} períodos personalizados</strong><p>{studioPeriod.charts[0]?.label} até {studioPeriod.charts.at(-1)?.label}</p><button type="button" className="text-button" onClick={() => setHistoryOpen(true)}>Alterar datas ou agrupamento</button><button type="button" className="text-button" onClick={() => setStudioPeriod(null)}>Voltar aos charts semanais</button></div>}
                <Suspense fallback={<Loading />}><Studio
                  key={studioPeriod ? `${studioPeriod.unit}-${studioPeriod.charts[0]?.id}-${studioPeriod.charts.at(-1)?.id}` : 'weekly'}
                  charts={studioPeriod?.charts ?? filtered}
                  library={studioPeriod?.library ?? library}
                  reduced={reduced}
                  dark={dark}
                  busy={computing}
                  username={profile?.realname || (profile?.name && profile.name !== 'Iknowjauregui' ? profile.name : 'David')}
                  kind={kind}
                  audioNamespace={settings.user}
                  onSoundStart={closePreview}
                  preserveRange={!!studioPeriod || year !== 'all'}
                  onChoosePeriod={() => setHistoryOpen(true)}
                  initialSelected={studioSeed}
                  onConsumeInitial={() => setStudioSeed(undefined)}
                  onError={data.setError}
                /></Suspense>
                </>
              )}

              {page === 'library' && <Suspense fallback={<Loading />}><CatalogPanel kind={kind} library={library} cached={cached} settings={settings} source={sourceFilter} filter={metaFilter} onFilter={value => { setMetaFilter(value); setLibraryLimit(60); }} onMeta={setLibraryMeta} /></Suspense>}
              {page === 'library' && (
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <span className="eyebrow">HISTÓRICO AUDITÁVEL</span>
                      <h2>
                        Seu acervo <span className="count-badge">{number(library.length)}</span>
                      </h2>
                      <p>{number(totalScrobbles)} scrobbles processados · certificações pessoais automáticas</p>
                    </div>
                    <button
                      type="button"
                      className={`button small ${favOnly ? 'favorite-active' : ''}`}
                      onClick={() => setFavOnly(v => !v)}
                      aria-pressed={favOnly}
                    >
                      <Heart size={15} fill={favOnly ? 'currentColor' : 'none'} />
                      <span>Favoritos</span>
                    </button>
                  </div>

                  <div className="table-toolbar">
                    <div className="search-field">
                      <Search size={17} />
                      <input
                        aria-label="Buscar na biblioteca"
                        placeholder="Busque músicas, álbuns ou artistas…"
                        value={query}
                        onChange={e => {
                          setQuery(e.target.value);
                          setLibraryLimit(60);
                        }}
                      />
                    </div>
                  </div>

                  <div className="library-grid">
                    {filteredLibrary.slice(0, libraryLimit).map(item => {
                      const cert = getCertification(item.plays);
                      const isPlaying = player?.playing && player.item.id === item.id;
                      const isLoadingAudio = player?.loading && player.item.id === item.id;
                      return (
                        <article className="library-item" key={item.id}>
                          <div className="library-cover-wrap">
                            <button type="button" className="library-cover" onClick={() => setDetail(item)}>
                              <Cover item={item} />
                            </button>
                            {cert.tier !== 'none' && <span className={`cert-pill ${cert.tier}`}>{cert.label}</span>}
                            <button
                              type="button"
                              className="cover-play-btn"
                              aria-label={`Ouvir prévia de ${item.name}`}
                              onClick={() => void playPreview(item)}
                            >
                              {isLoadingAudio ? (
                                <MusicLoader size="sm" tone="ink" />
                              ) : isPlaying ? (
                                <Pause size={15} fill="currentColor" />
                              ) : (
                                <Play size={15} fill="currentColor" />
                              )}
                            </button>
                          </div>
                          <button type="button" className="item-title" onClick={() => setDetail(item)}>
                            {item.name}
                          </button>
                          <span className="item-artist">{item.artist}</span>
                          <div className="item-footer">
                            <small>{number(item.plays)} plays</small>
                            <button
                              type="button"
                              className={`icon-button fav-mini ${favorites.includes(item.id) ? 'is-favorite' : ''}`}
                              aria-label={`${favorites.includes(item.id) ? 'Remover dos' : 'Adicionar aos'} favoritos: ${item.name}`}
                              onClick={() => favorite(item.id)}
                            >
                              <Heart size={15} fill={favorites.includes(item.id) ? 'currentColor' : 'none'} />
                            </button>
                          </div>
                        </article>
                      );
                    })}
                  </div>

                  {!library.length ? (
                    <Empty
                      title="Sua coleção começa na primeira sincronização"
                      description="Sincronize seu perfil Last.fm para reunir todas as faixas, álbuns e artistas ouvidos."
                    />
                  ) : !filteredLibrary.length ? (
                    <Empty title="Nenhum item corresponde ao filtro" description="Tente outro termo ou desative o filtro de favoritos." />
                  ) : null}

                  {filteredLibrary.length > libraryLimit && (
                    <button type="button" className="button load-more" onClick={() => setLibraryLimit(l => l + 60)}>
                      Mostrar mais ({filteredLibrary.length - libraryLimit})
                    </button>
                  )}
                </section>
              )}
            </>
          )}

          <footer className="page-footer">
            <span>
              <AudioLines size={15} />
              <span>Feito com ❤️ por William Santos</span>
            </span>
            <span>
              {computing ? (
                <>
                  <MusicLoader size="sm" />
                  <span>Processando charts em Web Worker…</span>
                </>
              ) : (
                `${cached.length} de ${weeks.length} semanas salvas no aparelho`
              )}
              <span className="footer-dot">·</span>
              <button type="button" className="text-button" onClick={() => setHelp(true)}>
                Sobre regras e dados
              </button>
            </span>
          </footer>
        </main>
      </div>

      <MiniPlayer state={player} onToggle={togglePreview} onClose={closePreview} />

      <nav className="mobile-nav" aria-label="Navegação móvel">
        {nav.map(({ id, shortLabel, icon: Icon }) => (
          <button
            type="button"
            key={id}
            className={page === id ? 'active' : ''}
            onClick={() => navigate(id)}
            aria-current={page === id ? 'page' : undefined}
          >
            <Icon size={20} />
            <span>{shortLabel}</span>
          </button>
        ))}
      </nav>

      {detail && (
        <Detail
          item={detail}
          charts={charts}
          playing={!!(player && player.item.id === detail.id && player.playing)}
          loadingAudio={!!(player && player.item.id === detail.id && player.loading)}
          onClose={() => setDetail(null)}
          onPreview={() => void playPreview(detail)}
          onAnimate={() => {
            const id = detail.id;
            setDetail(null);
            sendToStudio([id]);
          }}
          favorite={favorites.includes(detail.id)}
          onFavorite={() => favorite(detail.id)}
        />
      )}

      {platformsModal && (
        <PlatformsModal
          settings={settings}
          setSettings={setSettings}
          counts={sourceCounts}
          sourceFilter={sourceFilter}
          onSelectFilter={setSourceFilter}
          syncingLastfm={!!progress}
          onSyncLastfm={() => void data.sync('recent')}
          onDataChanged={data.refresh}
          onNotice={data.setNotice}
          onError={data.setError}
          onClose={() => setPlatformsModal(false)}
        />
      )}

      {historyOpen && <HistoryExplorer weeks={weeks} charts={charts} initialYear={year} selectedId={selected?.id} startDate={settings.startDate} computing={computing} progress={progress} error={error} onCancel={data.cancel} onSync={scope => void data.sync(scope)} onClose={() => setHistoryOpen(false)} onCalendar={() => {setHistoryOpen(false);navigate('settings');}} initialMode={page==='studio'?'period':'archive'} onChoose={week => {setYear(String(week.year));setWeekId(week.id);setHistoryOpen(false);navigate('charts');}} settings={settings} cached={cached} kind={kind} source={sourceFilter} onAnimate={result => {setStudioPeriod(result);setStudioSeed(undefined);setHistoryOpen(false);if(page!=='studio')navigate('studio');}} />}

      {spotlightOpen&&<Suspense fallback={null}><Spotlight charts={charts} library={library} cached={cached} settings={settings} source={sourceFilter} reduced={reduced} owner={profile?.realname||(profile?.name&&profile.name!=='Iknowjauregui'?profile.name:'David')} namespace={settings.user} initialYear={year} dark={dark} kind={kind} timezone={settings.timezone} onClose={()=>setSpotlightOpen(false)} onDownload={value=>{setSpotlightOpen(false);void data.sync(value==='all'?'all':Number(value));}} onStudio={(ids,title,series,items,count)=>{
        try{const saved=JSON.parse(localStorage.getItem('lastchart-studio:studio')??'{}');localStorage.setItem('lastchart-studio:studio',JSON.stringify({...studioDefaults,...saved,chartName:title,top:count,barCount:Math.min(count,30),mode:count>30?'lines':saved.mode??'lines'}));}catch{/* optional preference */}
        setStudioPeriod({charts:series,library:items,unit:'week'});setStudioSeed(ids);setSpotlightOpen(false);navigate('studio');
      }}/></Suspense>}

      {avatarModal && (
        <AvatarPickerModal
          username={profile?.name ?? settings.user}
          profile={profile}
          avatar={settings.avatar}
          onSelect={avatarId => {
            setSettings({ ...settings, avatar: avatarId });
            data.setNotice('Avatar do perfil atualizado.');
            setAvatarModal(false);
          }}
          onOpenSettings={() => navigate('settings')}
          onClose={() => setAvatarModal(false)}
        />
      )}

      {help && (
        <Modal title="Metodologia & Arquitetura" subtitle="Como seus scrobbles viram charts auditáveis" onClose={() => setHelp(false)}>
          <div className="prose">
            <h3>Calendário oficial ZeroCharts</h3>
            <p>
              Toda semana inicia na sexta-feira às 00:00 e encerra na quinta-feira às 23:59:59 no fuso horário configurado (padrão UTC, marco inicial 24/06/16). Usamos a API Temporal para respeitar anos bissextos e mudanças de horário de verão.
            </p>
            <h3>Fidelidade e lacunas</h3>
            <p>
              Cada scrobble finalizado vale 1 reprodução (faixas em reprodução no momento não contam até concluir). Semanas sem música permanecem vazias; semanas ainda não sincronizadas são marcadas como desconhecidas para nunca fabricar estreias falsas.
            </p>
            <h3>Desempate e versões</h3>
            <p>
              Mais reproduções vencem; empates usam a melhor posição na semana imediatamente anterior e depois ordem alfabética. Edições Deluxe/Live permanecem separadas por padrão, com mesclagem opcional e reversível em Ajustes.
            </p>
            <h3>Áudio, capas e privacidade</h3>
            <p>
              Os dados ficam exclusivamente no IndexedDB do seu dispositivo. Prévias de 30s e capas ausentes são consultadas sob demanda no catálogo público do iTunes sem exigir login em serviços de streaming.
            </p>
            <a className="button" href="https://www.last.fm/api/show/user.getRecentTracks" target="_blank" rel="noreferrer">
              <span>Documentação oficial Last.fm</span>
              <ExternalLink size={15} />
            </a>
          </div>
        </Modal>
      )}

      {installHelp && (
        <Modal title="Instalar no seu smartphone" subtitle="Use o LastChart como aplicativo em tela cheia" onClose={() => setInstallHelp(false)}>
          <div className="install-instructions">
            <Smartphone size={40} />
            <h3>Experiência de app nativo</h3>
            <p>
              <strong>Samsung Galaxy / Android:</strong> toque no menu do navegador (três pontos ou ícone na barra de endereço) e selecione “Instalar aplicativo” ou “Adicionar à tela inicial”.
            </p>
            <p>
              <strong>iPhone (iOS):</strong> abra no Safari, toque em Compartilhar e escolha “Adicionar à Tela de Início”.
            </p>
            <p className="note">
              Todo o histórico já sincronizado permanece acessível mesmo quando você estiver sem internet.
            </p>
          </div>
        </Modal>
      )}
    </div></ModalArtworkContext.Provider>
  );
}

function Stat({ title, value, caption, icon }: { title: string; value: string; caption: string; icon: React.ReactNode }) {
  return (
    <article className="stat-card">
      <div className="stat-top">
        <span>{title}</span>
        <span className="stat-icon">{icon}</span>
      </div>
      <strong>{value}</strong>
      <small>{caption}</small>
    </article>
  );
}

function Ranking({
  entries,
  onDetail,
  onPreview,
  playingId,
  loadingId,
  onAnimate,
  favorites,
  onFavorite,
  compact = false,
}: {
  entries: ChartEntry[];
  onDetail: (i: Item) => void;
  onPreview: (i: Item) => void;
  playingId?: string;
  loadingId?: string;
  onAnimate?: (i: Item) => void;
  favorites: string[];
  onFavorite: (id: string) => void;
  compact?: boolean;
}) {
  return (
    <div className={`ranking-container ${compact ? 'compact' : ''}`} role="region" aria-label="Tabela de ranking semanal">
      <table className="ranking-table">
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">Var.</th>
            <th scope="col">Item</th>
            <th scope="col" className="num-col">Plays</th>
            <th scope="col" className="detail-col">Pico</th>
            <th scope="col" className="detail-col">Sem.</th>
            <th scope="col" className="run-col">Chart Run</th>
            <th scope="col" className="actions-col">
              <span className="sr-only">Ações</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {entries.map(e => {
            const isPlaying = playingId === e.id;
            const isLoadingAudio = loadingId === e.id;
            return (
              <tr key={e.id} className={e.rank === 1 ? 'is-leader' : e.rank <= 10 ? 'is-top10' : ''}>
                <td className="rank-cell">
                  <span className={`rank-num ${e.rank === 1 ? 'gold' : e.rank <= 10 ? 'top10' : ''}`}>
                    {String(e.rank).padStart(2, '0')}
                  </span>
                  <span className="mobile-change">
                    <Change value={e.change} />
                  </span>
                </td>
                <td className="desktop-change">
                  <Change value={e.change} hiatusWeeks={e.hiatusWeeks} />
                </td>
                <td className="item-cell">
                  <button type="button" className="track-button" onClick={() => onDetail(e)}>
                    <Cover item={e} />
                    <span className="track-meta">
                      <strong>{e.name}</strong>
                      <small>{e.artist}</small>
                      <span className="mobile-stats-inline">
                        <b>{number(e.plays)} plays</b> · Pico #{e.peak} · {e.weeks} sem.
                        {e.change === 'RE' && e.hiatusWeeks ? ` · voltou após ${e.hiatusWeeks} sem. fora` : ''}
                      </span>
                    </span>
                  </button>
                </td>
                <td className="plays-cell">{number(e.plays)}</td>
                <td className="detail-col">
                  <span className={e.peak === 1 ? 'peak-one' : ''}>#{e.peak}</span>
                </td>
                <td className="detail-col">{e.weeks}</td>
                <td className="run-col">
                  <Sparkline values={e.run.slice(-10).map(r => r.rank)} />
                </td>
                <td className="actions-cell">
                  <div className="row-actions">
                    <button
                      type="button"
                      className={`icon-button mini-action ${isPlaying ? 'playing' : ''}`}
                      aria-label={`Ouvir prévia de ${e.name}`}
                      onClick={() => onPreview(e)}
                    >
                      {isLoadingAudio ? (
                        <MusicLoader size="sm" />
                      ) : isPlaying ? (
                        <Pause size={15} fill="currentColor" />
                      ) : (
                        <Volume2 size={15} />
                      )}
                    </button>
                    {onAnimate && !compact && (
                      <button
                        type="button"
                        className="icon-button mini-action desktop-only-btn"
                        aria-label={`Animar ${e.name} no estúdio`}
                        onClick={() => onAnimate(e)}
                      >
                        <Film size={15} />
                      </button>
                    )}
                    <button
                      type="button"
                      className={`icon-button mini-action favorite-button ${favorites.includes(e.id) ? 'is-favorite' : ''}`}
                      aria-label={`${favorites.includes(e.id) ? 'Remover dos' : 'Adicionar aos'} favoritos: ${e.name}`}
                      onClick={() => onFavorite(e.id)}
                    >
                      <Heart size={15} fill={favorites.includes(e.id) ? 'currentColor' : 'none'} />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function RecordsBoard({
  records,
  onDetail,
}: {
  records: ReturnType<typeof computeRecords>;
  onDetail: (i: Item) => void;
}) {
  const hasAny =
    records.mostWeeksAtOne.length || records.longestRun.length || records.biggestJumps.length || records.biggestDebuts.length;

  if (!hasAny) {
    return (
      <Empty
        title="Recordes prontos para serem descobertos"
        description="Sincronize semanas do seu perfil para calcular maiores #1, longevidade, estreias e subidas históricas."
      />
    );
  }

  return (
    <div className="records-grid">
      <div className="record-card">
        <div className="record-card-head">
          <Crown size={18} />
          <h3>Mais semanas em #1</h3>
        </div>
        {records.mostWeeksAtOne.length ? (
          records.mostWeeksAtOne.map(({ item, weeksAtOne, totalPlays }) => (
            <button type="button" key={item.id} className="record-row" onClick={() => onDetail(item)}>
              <Cover item={item} />
              <div className="truncate">
                <strong>{item.name}</strong>
                <small>{item.artist}</small>
              </div>
              <span className="record-metric gold">{weeksAtOne}× #1 · {number(totalPlays)}p</span>
            </button>
          ))
        ) : (
          <p className="muted small-text">Nenhum #1 registrado no filtro atual.</p>
        )}
      </div>

      <div className="record-card">
        <div className="record-card-head">
          <Trophy size={18} />
          <h3>Maior longevidade (Top 100)</h3>
        </div>
        {records.longestRun.map(({ item, weeks, peak }) => (
          <button type="button" key={item.id} className="record-row" onClick={() => onDetail(item)}>
            <Cover item={item} />
            <div className="truncate">
              <strong>{item.name}</strong>
              <small>{item.artist}</small>
            </div>
            <span className="record-metric">{weeks} sem · PK #{peak}</span>
          </button>
        ))}
      </div>

      <div className="record-card">
        <div className="record-card-head">
          <Flame size={18} />
          <h3>Maiores subidas em 1 semana</h3>
        </div>
        {records.biggestJumps.length ? (
          records.biggestJumps.map(({ entry, jump, weekNumber }, idx) => (
            <button type="button" key={`${entry.id}-${weekNumber}-${idx}`} className="record-row" onClick={() => onDetail(entry)}>
              <Cover item={entry} />
              <div className="truncate">
                <strong>{entry.name}</strong>
                <small>Sem. {weekNumber} · subiu para #{entry.rank}</small>
              </div>
              <span className="record-metric up">+{jump} pos.</span>
            </button>
          ))
        ) : (
          <p className="muted small-text">Sincronize semanas consecutivas para ver subidas.</p>
        )}
      </div>

      <div className="record-card">
        <div className="record-card-head">
          <Award size={18} />
          <h3>Maiores estreias (Hot Shot Debut)</h3>
        </div>
        {records.biggestDebuts.length ? (
          records.biggestDebuts.map(({ entry, weekNumber }, idx) => (
            <button type="button" key={`${entry.id}-${weekNumber}-${idx}`} className="record-row" onClick={() => onDetail(entry)}>
              <Cover item={entry} />
              <div className="truncate">
                <strong>{entry.name}</strong>
                <small>Sem. {weekNumber} · {entry.plays} plays na estreia</small>
              </div>
              <span className="record-metric">Estreou #{entry.rank}</span>
            </button>
          ))
        ) : (
          <p className="muted small-text">Estreias confirmadas exigem semanas anteriores carregadas.</p>
        )}
      </div>
    </div>
  );
}

function Detail({
  item,
  charts,
  playing,
  loadingAudio = false,
  onClose,
  onPreview,
  onAnimate,
  favorite,
  onFavorite,
}: {
  item: Item;
  charts: ChartWeek[];
  playing: boolean;
  loadingAudio?: boolean;
  onClose: () => void;
  onPreview: () => void;
  onAnimate: () => void;
  favorite: boolean;
  onFavorite: () => void;
}) {
  const audit = getItemAuditHistory(charts, item.id, item.plays);
  const cert = getCertification(audit.totalPlays);
  const artworkUrl = useArtworkUrl(item);
  const q = encodeURIComponent(`${item.artist} ${item.name}`);

  return (
    <Modal title={item.name} subtitle={item.artist} onClose={onClose} wide ambientImage={artworkUrl} ambientActive={playing}>
      <div className={`detail-hero apple-stage ${playing ? 'is-playing' : ''}`}>
        <div className="apple-cover-pedestal">
          <Cover item={item} size="large" />
          <span className="apple-cover-glow" aria-hidden="true" />
        </div>
        <div className="detail-hero-meta">
          <div className="detail-badges">
            <span className="eyebrow">HISTÓRICO NO RANKING</span>
            {cert.tier !== 'none' && <span className={`cert-pill ${cert.tier}`}>{cert.label}</span>}
          </div>
          <h3>{item.album || item.artist}</h3>
          <div className="detail-quick-actions">
            <button type="button" className="button apple-play-btn small" onClick={onPreview}>
              {loadingAudio ? (
                <MusicLoader size="sm" tone="ink" />
              ) : playing ? (
                <Pause size={15} fill="currentColor" />
              ) : (
                <Play size={15} fill="currentColor" />
              )}
              <span>{loadingAudio ? 'Carregando…' : playing ? 'Pausar prévia' : 'Prévia 30s'}</span>
            </button>
            <button type="button" className="button apple-glass-pill small" onClick={onAnimate}>
              <Film size={14} />
              <span>Animar trajetória</span>
            </button>
            <button type="button" className={`button apple-glass-pill small ${favorite ? 'favorite-active' : ''}`} onClick={onFavorite}>
              <Heart size={14} fill={favorite ? 'currentColor' : 'none'} />
              <span>{favorite ? 'Favoritado' : 'Favoritar'}</span>
            </button>
          </div>
        </div>
      </div>

      <div className="detail-stats">
        <div>
          <strong>{audit.peak ? `#${audit.peak}` : '—'}</strong>
          <span>Pico no Top 100</span>
        </div>
        <div>
          <strong>{audit.weeks}</strong>
          <span>Semanas no chart</span>
        </div>
        <div>
          <strong>{audit.totalWeeksOut}</strong>
          <span>Semanas fora (OUT)</span>
        </div>
        <div>
          <strong>{number(audit.totalPlays)}</strong>
          <span>Plays acumulados</span>
        </div>
      </div>

      {audit.charted && (audit.totalWeeksOut > 0 || audit.missingWeeksSinceDebut > 0) && (
        <div className="hiatus-banner" role="status">
          <History size={17} />
          <div>
            <strong>
              {audit.currentOutStreak > 0
                ? `Atualmente há ${audit.currentOutStreak} ${audit.currentOutStreak === 1 ? 'semana' : 'semanas'} fora do Top 100`
                : `Presente no chart · esteve fora em ${audit.totalWeeksOut} ${audit.totalWeeksOut === 1 ? 'semana' : 'semanas'} desde a estreia`}
            </strong>
            <p>
              {audit.zeroPlayWeeks > 0 ? `${audit.zeroPlayWeeks} sem. sem nenhum play (0p) · ` : ''}
              Maior hiato fora do chart: {audit.longestOutStreak} sem.
              {audit.weeksAtOne > 0 ? ` · ${audit.weeksAtOne}× em #1` : ''}
              {audit.missingWeeksSinceDebut > 0 ? ` · ${audit.missingWeeksSinceDebut} sem. não sincronizada(s) (?)` : ''}
            </p>
          </div>
        </div>
      )}

      <section className="chart-run-panel" aria-labelledby="chart-run-heading">
        <div className="chart-run-header">
          <h3 id="chart-run-heading" className="section-subhead">
            Chart Run Completo (Estreia até Hoje)
          </h3>
          {audit.charted && (
            <div className="chart-run-legend" aria-hidden="true">
              <span className="legend-dot gold">#1</span>
              <span className="legend-dot emerald">Top 10</span>
              <span className="legend-dot out">OUT</span>
            </div>
          )}
        </div>
        {audit.charted ? (
          <div className="chart-run">
            {audit.run.map(r => (
              <span
                key={r.week}
                title={
                  r.rank === undefined
                    ? `Sem. ${r.number} (${r.label}): não sincronizada`
                    : r.rank === null
                      ? `Sem. ${r.number} (${r.label}): fora do Top 100 (${r.plays ?? 0} plays)`
                      : `Sem. ${r.number} (${r.label}): #${r.rank} (${r.plays ?? 0} plays)`
                }
                className={
                  r.rank === 1
                    ? 'peak'
                    : typeof r.rank === 'number' && r.rank <= 10
                      ? 'top10-cell'
                      : typeof r.rank === 'number'
                        ? 'in-chart'
                        : 'absent'
                }
              >
                <small>{formatDateBR(r.week)}</small>
                <strong>{r.rank === undefined ? '?' : r.rank ? `#${r.rank}` : 'OUT'}</strong>
                <em className="run-plays">{r.rank === undefined ? 's/ dados' : `${r.plays ?? 0}p`}</em>
              </span>
            ))}
          </div>
        ) : (
          <p className="note">Este item não alcançou o Top 100 nas semanas sincronizadas (sem posições inventadas).</p>
        )}
      </section>

      <p className="note">
        Transparência ZeroCharts: apenas faixas com plays reais na janela de sexta 00:00 a quinta 23:59 entram no ranking. OUT indica semana fora do chart (0p = zero plays); ? indica semana ainda não baixada.
      </p>

      <div className="listen-links">
        <a className="button small" href={`https://open.spotify.com/search/${q}`} target="_blank" rel="noreferrer">
          <span>Spotify</span>
          <ExternalLink size={14} />
        </a>
        <a className="button small" href={`https://www.last.fm/search?q=${q}`} target="_blank" rel="noreferrer">
          <span>Last.fm</span>
          <ExternalLink size={14} />
        </a>
        <a className="button small" href={`https://www.youtube.com/results?search_query=${q}`} target="_blank" rel="noreferrer">
          <span>YouTube</span>
          <ExternalLink size={14} />
        </a>
      </div>
    </Modal>
  );
}

function SettingsPage({
  settings,
  profile,
  setSettings,
  onPickAvatar,
  busy,
  progress,
  onCancelSync,
  importingBackup,
  sourceCounts,
  onDataChanged,
  onSync,
  onError,
  onNotice,
  onExport,
  onImport,
  loaded,
  recentEightLoaded,
  total,
  duplicates,
  years,
  onInstall,
  charts,
}: {
  settings: Settings;
  profile: Profile | null;
  setSettings: (s: Settings) => void;
  onPickAvatar: () => void;
  busy: boolean;
  progress: SyncProgress | null;
  onCancelSync: () => void;
  importingBackup: boolean;
  sourceCounts: Record<SourceFilter, number>;
  onDataChanged: () => void;
  onSync: (scope: SyncScope, force?: boolean) => void;
  onError: (s: string) => void;
  onNotice: (s: string) => void;
  onExport: () => void;
  onImport: (f?: File) => void;
  loaded: number;
  recentEightLoaded: number;
  total: number;
  duplicates: number;
  years: number[];
  onInstall: () => void;
  charts: ChartWeek[];
}) {
  const [draft, setDraft] = useState(settings);
  const [dateDraft, setDateDraft] = useState(() => formatDateBR(settings.startDate));
  const [syncYear, setSyncYear] = useState<number>(years[0] ?? 2026);
  const [aliasKind, setAliasKind] = useState<Kind>('tracks');
  const [aliasArtist, setAliasArtist] = useState('');
  const [aliasFrom, setAliasFrom] = useState('');
  const [aliasTo, setAliasTo] = useState('');

  const recentTarget = Math.min(8, Math.max(1, total));
  const recentPct = Math.min(100, Math.round((recentEightLoaded / recentTarget) * 100));
  const archivePct =
    loaded <= 0
      ? 0
      : loaded >= total
        ? 100
        : Math.max(1, Math.round((loaded / Math.max(1, total)) * 100));

  const isSyncingRecent = !!progress && progress.scope === 'recent';
  const isSyncingYear = !!progress && typeof progress.scope === 'number';
  const isSyncingAll = !!progress && progress.scope === 'all' && !progress.force;
  const isRevalidating = !!progress && progress.scope === 'all' && !!progress.force;

  useEffect(() => {
    setDateDraft(formatDateBR(settings.startDate));
    setDraft(d => ({
      ...d,
      user: settings.user,
      startDate: settings.startDate,
      timezone: settings.timezone,
      apiKey: settings.apiKey,
      deduplicate: settings.deduplicate,
    }));
  }, [settings.user, settings.startDate, settings.timezone, settings.apiKey, settings.deduplicate]);

  const change = <K extends keyof Settings>(k: K, v: Settings[K]) => setDraft(d => ({ ...d, [k]: v }));

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const startDate = parseDateBR(dateDraft);
      validateCalendar(startDate, draft.timezone);
      if (!/^[\w.-]{1,100}$/.test(draft.user.trim())) {
        throw new Error('Informe um nome de usuário Last.fm válido, sem o endereço do site.');
      }
      if (draft.apiKey && !/^[a-f\d]{32}$/i.test(draft.apiKey.trim())) {
        throw new Error('A chave Last.fm deve ter 32 caracteres hexadecimais.');
      }
      setSettings({
        ...settings,
        user: draft.user.trim(),
        startDate,
        timezone: draft.timezone,
        apiKey: draft.apiKey.trim(),
        deduplicate: draft.deduplicate,
      });
      onNotice('Ajustes salvos com sucesso. Sincronize para carregar dados neste calendário.');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Configuração inválida.');
    }
  };

  const addAlias = (e: React.FormEvent) => {
    e.preventDefault();
    if (!aliasFrom.trim() || !aliasTo.trim()) {
      onError('Preencha o nome original e o nome unificado para criar a regra.');
      return;
    }
    const rule: AliasRule = {
      id: crypto.randomUUID(),
      kind: aliasKind,
      artist: aliasArtist.trim(),
      from: aliasFrom.trim(),
      to: aliasTo.trim(),
    };
    const next = [...(settings.aliases ?? []), rule];
    setSettings({ ...settings, aliases: next });
    setAliasFrom('');
    setAliasTo('');
    onNotice('Regra de mesclagem aplicada. Você pode desfazê-la a qualquer momento.');
  };

  const removeAlias = (id: string) => {
    setSettings({ ...settings, aliases: (settings.aliases ?? []).filter(a => a.id !== id) });
  };

  return (
    <div className="settings-grid">
      <div className="settings-stack">
        <form className="panel settings-form" onSubmit={save}>
          <div className="panel-heading">
            <div>
              <h2>
                <Users size={19} />
                <span>Perfil e Calendário ZeroCharts</span>
              </h2>
              <p>Independente de outros projetos. Leitura pública da API oficial Last.fm.</p>
            </div>
          </div>
          <fieldset disabled={busy}>
            <div className="profile-avatar-card">
              <ProfileAvatar profile={profile} avatar={settings.avatar} className="avatar avatar-lg" />
              <div className="profile-avatar-copy">
                <strong>Avatar do perfil</strong>
                <small>{getAvatarLabel(settings.avatar, !!profile?.image)}</small>
              </div>
              <button type="button" className="button small" onClick={onPickAvatar}>
                <Sparkles size={15} />
                <span>Escolher avatar</span>
              </button>
            </div>

            <label>
              Usuário Last.fm
              <input
                value={draft.user}
                onChange={e => change('user', e.target.value)}
                placeholder="Ex: Iknowjauregui"
                autoComplete="off"
                required
              />
              <small>Apenas o nome de usuário público. Nenhuma senha ou login OAuth é solicitado.</small>
            </label>

            <div className="form-two">
              <label>
                Marco inicial (Sexta-feira)
                <input type="text" inputMode="numeric" placeholder="dd/mm/aa" value={dateDraft} onChange={e => {
                  const digits = e.target.value.replace(/\D/g, '').slice(0, 8);
                  setDateDraft(digits.replace(/^(\d{2})(\d)/, '$1/$2').replace(/^(\d{2}\/\d{2})(\d)/, '$1/$2'));
                }} required aria-describedby="calendar-format" />
                <small id="calendar-format">dd/mm/aa · exemplo: 24/06/16</small>
              </label>
              <label>
                Fuso horário (IANA)
                <input list="timezones" value={draft.timezone} onChange={e => change('timezone', e.target.value)} required />
                <datalist id="timezones">
                  {['UTC', 'America/Sao_Paulo', 'America/Manaus', 'America/Argentina/Buenos_Aires', 'America/New_York', 'Europe/Lisbon', 'Europe/London', 'Asia/Tokyo'].map(t => (
                    <option key={t} value={t} />
                  ))}
                </datalist>
              </label>
            </div>

            <div className="info-box">
              <CalendarDays size={20} />
              <p>Cada semana abre sexta às 00:00 e fecha quinta às 23:59. Alterar a data ou fuso cria um cache isolado sem apagar o anterior.</p>
            </div>

            <label>
              Chave API Last.fm pessoal <span className="optional">opcional</span>
              <input
                type="password"
                autoComplete="off"
                value={draft.apiKey}
                onChange={e => change('apiKey', e.target.value)}
                placeholder="Usar chave configurada no servidor (Vercel / Netlify)"
              />
              <small>Deixe em branco para usar o proxy do servidor. Chaves pessoais ficam restritas ao seu navegador.</small>
            </label>

            <label className="switch-row">
              <span>
                Filtrar scrobbles duplicados exatos
                <small>Mesmo timestamp, artista, música e álbum ({duplicates} detectados no cache).</small>
              </span>
              <input
                type="checkbox"
                role="switch"
                checked={draft.deduplicate}
                onChange={e => change('deduplicate', e.target.checked)}
              />
            </label>

            <div className="form-actions">
              <button type="submit" className="button primary">
                <Check size={17} />
                <span>Salvar configurações</span>
              </button>
            </div>
          </fieldset>
        </form>

        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>
                <GitMerge size={19} />
                <span>Unificar edições e remasters (Aliases)</span>
              </h2>
              <p>Corrija nomes divididos no Last.fm sem alterar seus scrobbles originais.</p>
            </div>
          </div>
          <form className="settings-content" onSubmit={addAlias}>
            <div className="form-two">
              <label>
                Categoria
                <select value={aliasKind} onChange={e => setAliasKind(e.target.value as Kind)}>
                  <option value="tracks">Música</option>
                  <option value="albums">Álbum</option>
                  <option value="artists">Artista</option>
                </select>
              </label>
              {aliasKind !== 'artists' && (
                <label>
                  Artista <span className="optional">opcional</span>
                  <input value={aliasArtist} onChange={e => setAliasArtist(e.target.value)} placeholder="Ex: Lauren Jauregui" />
                </label>
              )}
            </div>
            <div className="form-two">
              <label>
                Nome como veio no scrobble
                <input value={aliasFrom} onChange={e => setAliasFrom(e.target.value)} placeholder="Ex: Expectations (Live)" />
              </label>
              <label>
                Unificar como
                <input value={aliasTo} onChange={e => setAliasTo(e.target.value)} placeholder="Ex: Expectations" />
              </label>
            </div>
            <button type="submit" className="button">
              <Plus size={16} />
              <span>Adicionar regra auditável</span>
            </button>
            {!!settings.aliases?.length && (
              <div className="alias-list">
                {settings.aliases.map(rule => (
                  <div key={rule.id} className="alias-item">
                    <div className="truncate">
                      <strong>
                        {rule.from} → {rule.to}
                      </strong>
                      <small>
                        {kindLabels[rule.kind]}
                        {rule.artist ? ` · ${rule.artist}` : ''}
                      </small>
                    </div>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Desfazer regra ${rule.from}`}
                      onClick={() => removeAlias(rule.id)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </form>
        </section>
      </div>

      <div className="settings-stack">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>
                <History size={19} />
                <span>Sincronização & Arquivo</span>
              </h2>
              <p>
                {loaded > 0
                  ? `${number(loaded)} semanas salvas localmente · Janela recente: ${recentPct}% pronta`
                  : 'Baixe todo o histórico para preencher seu arquivo de charts.'}
              </p>
            </div>
          </div>
          <div className="settings-content">
            {progress && <SyncProgressCard progress={progress} onCancel={onCancelSync} compact />}

            <div className="archive-coverage-grid">
              <div className="coverage-card">
                <div className="coverage-top">
                  <span>Cobertura recente</span>
                  <strong>{recentPct}%</strong>
                </div>
                <div className="musical-progress-track">
                  <span className="musical-progress-fill" style={{ width: `${recentPct}%` }} />
                </div>
                <small>
                  {recentEightLoaded} de {recentTarget} semanas recentes baixadas
                </small>
              </div>

              <div className="coverage-card">
                <div className="coverage-top">
                  <span>Arquivo completo</span>
                  <strong>{archivePct}%</strong>
                </div>
                <div className="musical-progress-track">
                  <span className="musical-progress-fill" style={{ width: `${archivePct}%` }} />
                </div>
                <small>
                  {number(loaded)} de {number(total)} semanas salvas no aparelho
                </small>
              </div>
            </div>

            <p className="muted small-text">
              A cobertura acima mostra o que está salvo no aparelho, não o progresso do download. “Atualizar recentes” baixa só 8 semanas. Use “Continuar histórico” para preencher todas; você pode pausar e retomar.
            </p>

            <div className="sync-grid-btns">
              <button
                type="button"
                className={`button primary full ${isSyncingRecent ? 'is-loading' : ''}`}
                disabled={busy}
                onClick={() => onSync('recent')}
              >
                {isSyncingRecent ? <MusicLoader size="sm" tone="ink" /> : <History size={16} />}
                <span>{isSyncingRecent ? 'Atualizando recentes…' : 'Atualizar recentes · 8 semanas'}</span>
              </button>
              <div className="year-sync-row">
                <select
                  aria-label="Escolher ano para sincronizar"
                  value={syncYear}
                  disabled={busy}
                  onChange={e => setSyncYear(Number(e.target.value))}
                >
                  {years.map(y => (
                    <option key={y} value={y}>
                      Ano {y}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className={`button ${isSyncingYear ? 'is-loading' : ''}`}
                  disabled={busy}
                  onClick={() => onSync(syncYear)}
                >
                  {isSyncingYear ? <MusicLoader size="sm" /> : <ArrowDownToLine size={16} />}
                  <span>{isSyncingYear ? `Baixando ${progress?.scope}…` : `Baixar ${syncYear}`}</span>
                </button>
              </div>
              <button
                type="button"
                className={`button full ${isSyncingAll ? 'is-loading' : ''}`}
                disabled={busy}
                onClick={() => onSync('all')}
              >
                {isSyncingAll ? <MusicLoader size="sm" /> : <ArrowDownToLine size={16} />}
                <span>{isSyncingAll ? 'Baixando histórico completo…' : loaded < total ? `Continuar histórico · ${number(total - loaded)} semanas` : 'Atualizar histórico completo'}</span>
              </button>
              <button
                type="button"
                className={`button full ${isRevalidating ? 'is-loading' : ''}`}
                disabled={busy}
                onClick={() => onSync('all', true)}
              >
                {isRevalidating ? <MusicLoader size="sm" /> : null}
                <span>{isRevalidating ? 'Revalidando todas as semanas…' : 'Revalidar todas as semanas'}</span>
              </button>
            </div>

            <div className="backup-actions">
              <button type="button" className="button" disabled={!loaded || busy} onClick={onExport}>
                <Download size={16} />
                <span>Exportar JSON</span>
              </button>
              <label className={`button file-button ${busy || importingBackup ? 'disabled is-loading' : ''}`}>
                {importingBackup ? <MusicLoader size="sm" /> : <Upload size={16} />}
                <span>{importingBackup ? 'Importando…' : 'Importar JSON'}</span>
                <input
                  type="file"
                  accept="application/json,.json"
                  disabled={busy || importingBackup}
                  onChange={e => {
                    onImport(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />
              </label>
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>
                <Link2 size={19} />
                <span>Conexões de Streaming</span>
              </h2>
              <p>Conecte ou importe Spotify e YouTube Music além do Last.fm para combinar ou filtrar seus charts.</p>
            </div>
          </div>
          <div className="settings-content">
            <PlatformsHub
              settings={settings}
              setSettings={setSettings}
              counts={sourceCounts}
              syncingLastfm={busy}
              onSyncLastfm={() => onSync('recent')}
              onDataChanged={onDataChanged}
              onNotice={onNotice}
              onError={onError}
            />
          </div>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <h2>
              <Sun size={19} />
              <span>Aparência & Aplicativo</span>
            </h2>
          </div>
          <div className="settings-content">
            <label>
              Tema visual
              <select value={settings.theme} onChange={e => setSettings({ ...settings, theme: e.target.value as Settings['theme'] })}>
                <option value="dark">Escuro Studio (Spotify / Solo)</option>
                <option value="light">Claro Cristal (One UI / iOS)</option>
                <option value="system">Acompanhar o dispositivo</option>
              </select>
            </label>
            <label className="switch-row">
              <span>
                Reduzir animações
                <small>Desativa partículas, transições de página e efeitos intensos.</small>
              </span>
              <input
                type="checkbox"
                role="switch"
                checked={settings.reducedMotion}
                onChange={e => setSettings({ ...settings, reducedMotion: e.target.checked })}
              />
            </label>
            <button type="button" className="button full" onClick={onInstall}>
              <Smartphone size={17} />
              <span>Instalar como aplicativo (PWA)</span>
            </button>
          </div>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>
                <ShieldCheck size={19} />
                <span>Projetos entre aparelhos</span>
              </h2>
              <p>Leve ajustes, premiações e trilhas para outro celular ou computador com uma chave só sua.</p>
            </div>
          </div>
          <div className="settings-content">
            <Suspense fallback={<Loading />}><DeviceSync timezone={settings.timezone} onError={onError} onNotice={onNotice} /></Suspense>
          </div>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>
                <Sparkles size={19} />
                <span>Notificações de marcos</span>
              </h2>
              <p>Opcional: novo #1, certificações, aniversários de #1 e recordes semanais.</p>
            </div>
          </div>
          <div className="settings-content">
            <NotificationsPanel user={settings.user} charts={charts} timeZone={settings.timezone} onError={onError} onNotice={onNotice} />
          </div>
        </section>

        <div className="privacy-note">
          <ShieldCheck size={20} />
          <div>
            <strong>Independente e privado</strong>
            <p>Seu histórico fica no navegador. Só sai dele o que você pedir: consultas ao Last.fm e ao catálogo, e — se ativar a sincronização — o projeto cifrado neste aparelho. Faça backup JSON antes de limpar o cache.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
