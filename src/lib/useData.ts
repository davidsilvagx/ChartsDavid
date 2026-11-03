import { useEffect, useMemo, useRef, useState } from 'react';
import {
  defaults,
  type CachedWeek,
  type ChartWeek,
  type Item,
  type Kind,
  type Profile,
  type Settings,
  type SourceFilter,
  type SyncProgress,
  type SyncScope,
} from './types';
import { makeWeeks, namespace } from './calendar';
import { getMeta, readWeeks } from './storage';
import { synchronize } from './sync';
import {
  completeSpotifyCallbackIfPresent,
  completeYouTubeCallbackIfPresent,
  countScrobblesBySource,
  mergePlatformScrobbles,
} from './platforms';

const SETTINGS_KEY = 'lastchart-studio:settings:v1';
const SOURCE_FILTER_KEY = 'lastchart-studio:source-filter:v1';

export function readSettings(): Settings {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
    const candidate = { ...defaults, ...s };
    makeWeeks(candidate);
    return candidate;
  } catch {
    return defaults;
  }
}

function readInitialSourceFilter(): SourceFilter {
  try {
    const raw = localStorage.getItem(SOURCE_FILTER_KEY);
    if (raw === 'all' || raw === 'lastfm' || raw === 'spotify' || raw === 'ytmusic' || raw === 'streaming') {
      return raw;
    }
  } catch {
    /* ignore */
  }
  return 'all';
}

export function useData(kind: Kind) {
  const [settings, setSettings] = useState<Settings>(readSettings);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>(readInitialSourceFilter);
  const [cached, setCached] = useState<CachedWeek[]>([]);
  const [charts, setCharts] = useState<ChartWeek[]>([]);
  const [library, setLibrary] = useState<Item[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [computing, setComputing] = useState(false);
  const [revision, setRevision] = useState(0);

  const controller = useRef<AbortController | null>(null);
  const lastNamespaceRef = useRef<string>(namespace(settings));
  const workerReqId = useRef(0);

  const weeks = useMemo(() => makeWeeks(settings), [settings.startDate, settings.timezone, revision]);
  const sourceCounts = useMemo(() => countScrobblesBySource(cached), [cached]);

  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      setError('Não foi possível salvar os ajustes neste navegador.');
    }
  }, [settings]);

  useEffect(() => {
    try {
      localStorage.setItem(SOURCE_FILTER_KEY, sourceFilter);
    } catch {
      /* optional */
    }
  }, [sourceFilter]);

  // Handle OAuth redirect callbacks from Spotify PKCE or YouTube/Google
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const spotifyResult = await completeSpotifyCallbackIfPresent();
        if (spotifyResult && active) {
          const merged = await mergePlatformScrobbles(settings, spotifyResult.scrobbles, 'spotify');
          setRevision(v => v + 1);
          setNotice(
            `Spotify conectado (${spotifyResult.account.displayName}) · ${merged.addedPlays} novas reproduções importadas.`,
          );
        }
        const ytResult = await completeYouTubeCallbackIfPresent();
        if (ytResult && active) {
          const merged = await mergePlatformScrobbles(settings, ytResult.scrobbles, 'ytmusic');
          setRevision(v => v + 1);
          setNotice(
            `YouTube Music conectado (${ytResult.account.displayName}) · ${merged.addedPlays} faixas musicais sincronizadas.`,
          );
        }
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : 'Falha ao conectar conta de streaming.');
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const nextNs = namespace(settings);
    if (lastNamespaceRef.current !== nextNs) {
      lastNamespaceRef.current = nextNs;
      setCached([]);
      setProfile(null);
      setCharts([]);
      setLibrary([]);
    }
    Promise.all([readWeeks(settings), getMeta<Profile>(`profile:${settings.user.toLowerCase()}`)])
      .then(([data, p]) => {
        if (active) {
          setCached(data);
          setProfile(p ?? null);
        }
      })
      .catch(e => {
        if (active) setError(`Armazenamento indisponível: ${e.message}`);
      });
    return () => {
      active = false;
    };
  }, [settings.user, settings.startDate, settings.timezone, revision]);

  useEffect(() => {
    const reqId = ++workerReqId.current;
    setComputing(true);
    const worker = new Worker(new URL('../workers/charts.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => {
      if (data.id !== reqId) return;
      if (data.error) setError(data.error);
      else {
        setCharts(data.charts);
        setLibrary(data.library);
      }
      setComputing(false);
    };
    worker.onerror = () => {
      setComputing(false);
      setError('Falha ao calcular os charts. Recarregue a página.');
    };
    worker.postMessage({
      id: reqId,
      weeks,
      cached,
      kind,
      deduplicate: settings.deduplicate,
      aliases: settings.aliases,
      sourceFilter,
    });
    return () => worker.terminate();
  }, [weeks, cached, kind, settings.deduplicate, settings.aliases, sourceFilter]);

  useEffect(() => () => controller.current?.abort(), []);

  const sync = async (scope: SyncScope = 'recent', force = false, useSettings = settings) => {
    if (controller.current) return;
    if (!useSettings.user.trim()) {
      setError('Informe seu usuário Last.fm em Ajustes para começar.');
      return;
    }
    const abort = new AbortController();
    controller.current = abort;
    setError('');
    setNotice('');
    setProgress({
      completed: 0,
      total: 0,
      pages: 0,
      scope,
      force,
      phase: 'connecting',
      message: `Conectando ao Last.fm (@${useSettings.user})…`,
    });

    const pendingWeeks = new Map<string, CachedWeek>();
    let flushTimer: ReturnType<typeof setTimeout> | null = null;

    const flushSavedWeeks = () => {
      flushTimer = null;
      if (!pendingWeeks.size) return;
      const batch = new Map(pendingWeeks);
      pendingWeeks.clear();
      setCached(prev => {
        const byId = new Map(prev.map(w => [w.week.id, w]));
        for (const [id, wk] of batch) byId.set(id, wk);
        return [...byId.values()].sort((a, b) => a.week.start - b.week.start);
      });
    };

    try {
      const syncedProfile = await synchronize(
        useSettings,
        scope,
        abort.signal,
        setProgress,
        force,
        savedWeek => {
          pendingWeeks.set(savedWeek.week.id, savedWeek);
          if (!flushTimer) {
            flushTimer = setTimeout(flushSavedWeeks, 420);
          }
        },
      );
      if (flushTimer) clearTimeout(flushTimer);
      flushSavedWeeks();
      setProfile(syncedProfile);
      setNotice('Seu histórico Last.fm está sincronizado e atualizado.');
    } catch (e) {
      if (flushTimer) clearTimeout(flushTimer);
      flushSavedWeeks();
      if (e instanceof DOMException && e.name === 'AbortError') {
        setNotice('Sincronização pausada. As semanas já baixadas foram salvas; você pode retomar quando quiser.');
      } else {
        setError(e instanceof Error ? e.message : 'Falha ao sincronizar.');
      }
    } finally {
      controller.current = null;
      setProgress(null);
      setRevision(v => v + 1);
    }
  };

  return {
    settings,
    setSettings,
    sourceFilter,
    setSourceFilter,
    sourceCounts,
    cached,
    charts,
    library,
    profile,
    progress,
    computing,
    error,
    setError,
    notice,
    setNotice,
    sync,
    cancel: () => controller.current?.abort(),
    refresh: () => setRevision(v => v + 1),
    weeks,
  };
}
