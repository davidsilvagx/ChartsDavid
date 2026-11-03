import { useEffect, useMemo, useRef, useState } from 'react';
import { defaults, type CachedWeek, type ChartWeek, type Item, type Kind, type Profile, type Settings, type SyncProgress } from './types';
import { makeWeeks } from './calendar';
import { getMeta, readWeeks } from './storage';
import { synchronize } from './sync';
const SETTINGS_KEY = 'lastchart-studio:settings:v1';
export function readSettings(): Settings {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
    const candidate = { ...defaults, ...s };
    makeWeeks(candidate);
    return candidate;
  } catch { return defaults; }
}
export function useData(kind: Kind) {
  const [settings, setSettings] = useState<Settings>(readSettings);
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
  const weeks = useMemo(() => makeWeeks(settings), [settings.startDate, settings.timezone, revision]);
  useEffect(() => {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { setError('Não foi possível salvar os ajustes neste navegador.'); }
  }, [settings]);
  useEffect(() => {
    let active = true;
    setCached([]); setProfile(null); setCharts([]); setLibrary([]);
    Promise.all([readWeeks(settings), getMeta<Profile>(`profile:${settings.user.toLowerCase()}`)]).then(([data, p]) => {
      if (active) { setCached(data); setProfile(p ?? null); }
    }).catch(e => { if (active) setError(`Armazenamento indisponível: ${e.message}`); });
    return () => { active = false; };
  }, [settings.user, settings.startDate, settings.timezone, revision]);
  useEffect(() => {
    setComputing(true);
    const worker = new Worker(new URL('../workers/charts.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => {
      if (data.error) setError(data.error);
      else { setCharts(data.charts); setLibrary(data.library); }
      setComputing(false);
    };
    worker.onerror = () => { setComputing(false); setError('Falha ao calcular os charts. Recarregue a página.'); };
    worker.postMessage({ id: 1, weeks, cached, kind, deduplicate: settings.deduplicate, aliases: settings.aliases });
    return () => worker.terminate();
  }, [weeks, cached, kind, settings.deduplicate, settings.aliases]);
  useEffect(() => () => controller.current?.abort(), []);
  const sync = async (scope: 'recent' | 'all' | number = 'recent', force = false, useSettings = settings) => {
    if (controller.current) return;
    if (!useSettings.user.trim()) { setError('Informe seu usuário Last.fm em Ajustes para começar.'); return; }
    const abort = new AbortController();
    controller.current = abort;
    setError(''); setNotice(''); setProgress({ completed: 0, total: 0, pages: 0, message: 'Conectando ao Last.fm…' });
    try {
      await synchronize(useSettings, scope, abort.signal, setProgress, force);
      setNotice('Seu histórico está atualizado.');
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') setNotice('Sincronização pausada. Semanas concluídas foram salvas; você pode continuar depois.');
      else setError(e instanceof Error ? e.message : 'Falha ao sincronizar.');
    } finally { controller.current = null; setProgress(null); setRevision(v => v + 1); }
  };
  return { settings, setSettings, cached, charts, library, profile, progress, computing, error, setError, notice, setNotice, sync, cancel: () => controller.current?.abort(), refresh: () => setRevision(v => v + 1), weeks };
}
