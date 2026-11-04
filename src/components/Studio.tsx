import { useEffect, useLayoutEffect, useMemo, useRef, useState, type SetStateAction } from 'react';
import {
  BarChart2,
  CalendarDays,
  Check,
  Crown,
  Download,
  Flame,
  ImageDown,
  Maximize2,
  Minimize2,
  Monitor,
  Pause,
  Play,
  Plus,
  RectangleHorizontal,
  RotateCcw,
  Search,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  Square,
  TrendingUp,
  Upload,
  X,
} from 'lucide-react';
import { studioDefaults, type ChartWeek, type Item, type Kind, type StudioSettings } from '../lib/types';
import { trimTimeline } from '../lib/charts';
import { cacheImageUrl, drawChart, palettes, prepareImages } from '../lib/canvas';
import { resolveCatalogMedia } from '../lib/catalog';
import { createLeaderResolver, LeaderAudioSession, resolveClipBank, type AudioStatus } from '../lib/leaderAudio';
import { LeaderSoundtrack, useLeaderClips } from './LeaderSoundtrack';
import { download } from '../lib/export';
import { ChartCanvas, type ChartCanvasHandle } from './ChartCanvas';
import { fitStudioCanvas } from '../lib/chartIndex';
import { selectionInRange } from '../lib/studio';
import { Cover, Empty, Modal, MusicLoader, number } from './UI';

export type StudioViewMode = 'normal' | 'widescreen';

export function Studio({
  charts,
  library,
  reduced,
  dark,
  initialSelected,
  onConsumeInitial,
  onError,
  onChoosePeriod,
  onSoundStart,
  busy = false,
  preserveRange = false,
  username = 'David',
  kind = 'tracks',
  audioNamespace = username,
}: {
  charts: ChartWeek[];
  library: Item[];
  reduced: boolean;
  dark: boolean;
  initialSelected?: string[];
  onConsumeInitial?: () => void;
  onError: (s: string) => void;
  onChoosePeriod: () => void;
  onSoundStart?: () => void;
  busy?: boolean;
  preserveRange?: boolean;
  username?: string;
  kind?: Kind;
  audioNamespace?: string;
}) {
  const [settings, setSettings] = useState<StudioSettings>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('lastchart-studio:studio') ?? '{}');
      return {
        ...studioDefaults,
        ...saved,
        palette: saved.palette && saved.palette in palettes ? saved.palette : studioDefaults.palette,
      };
    } catch {
      return studioDefaults;
    }
  });
  const [viewMode, setViewMode] = useState<StudioViewMode>(() => {
    try {
      return localStorage.getItem('lastchart-studio:view-mode') === 'widescreen' ? 'widescreen' : 'normal';
    } catch {
      return 'normal';
    }
  });
  const [expanded, setExpanded] = useState(false);
  const [isPortraitViewport, setIsPortraitViewport] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < window.innerHeight && window.innerWidth <= 860,
  );

  const [selected, setSelectedIds] = useState<string[]>([]);
  const [autoBars, setAutoBars] = useState(true);
  const [automaticIds,setAutomaticIds] = useState<string[]>([]);
  const [preparingBars,setPreparingBars] = useState(false);
  const [barsError,setBarsError] = useState('');
  const [autoSeeded, setAutoSeeded] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState('');
  const [inlineQuery, setInlineQuery] = useState('');
  const [limit, setLimit] = useState(100);
  const [controls, setControls] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordProgress, setRecordProgress] = useState(0);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const audioBank=useLeaderClips(audioNamespace);
  const autoBank=useLeaderClips(audioNamespace,'auto');
  const audioMode=settings.leaderAudioMode??'auto-manual';
  const activeClips=useMemo(()=>resolveClipBank(audioMode,audioBank.clips,autoBank.clips),[audioMode,audioBank.clips,autoBank.clips]);
  const clipsRef=useRef(activeClips);clipsRef.current=activeClips;
  const previewAudio=useRef<LeaderAudioSession|null>(null);
  const [audioStatus,setAudioStatus]=useState<AudioStatus>({phase:'idle',id:null});
  const resumeSound=()=>{
    onSoundStart?.();
    try{
      previewAudio.current??=new LeaderAudioSession(()=>clipsRef.current,setAudioStatus,{volume:settings.leaderVolume??.7});
      void previewAudio.current.resume().catch(()=>setAudioStatus({phase:'error',id:null,message:'Toque em Play novamente para liberar o áudio neste navegador.'}));
    }catch{setAudioStatus({phase:'error',id:null,message:'Áudio indisponível neste navegador. A animação continua funcionando.'});}
  };

  const abortRecord = useRef<AbortController | null>(null);
  const previewPanelRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [stageSize,setStageSize] = useState({width:0,height:0});
  const canvas = useRef<HTMLCanvasElement>(null);
  const canvasHandle = useRef<ChartCanvasHandle>(null);
  const sliderRef = useRef<HTMLInputElement>(null);
  const counterRef = useRef<HTMLSpanElement>(null);
  const positionRef = useRef(0);

  useEffect(()=>{
    if(settings.mode!=='bars'||!autoBars){setPreparingBars(false);setBarsError('');return;}
    setPreparingBars(true);setBarsError('');
    let active=true;
    const worker=new Worker(new URL('../workers/studio.worker.ts',import.meta.url),{type:'module'});
    worker.onmessage=({data})=>{if(!active)return;setPreparingBars(false);if(data.error){setBarsError(data.error);setAutomaticIds([]);}else setAutomaticIds(data.ids);worker.terminate();};
    worker.onerror=()=>{if(!active)return;setPreparingBars(false);setAutomaticIds([]);setBarsError('Não foi possível preparar o Top. Altere o período e tente novamente.');worker.terminate();};
    worker.postMessage({charts:charts.map(c=>({status:c.status,playCounts:c.playCounts,entries:c.entries.map(({id,plays})=>({id,plays}))})),library:library.map(({id,name})=>({id,name})),count:settings.barCount,metric:settings.barMetric});
    return()=>{active=false;worker.terminate();};
  },[charts,library,settings.mode,settings.barCount,settings.barMetric,autoBars]);
  const preparing=busy||preparingBars||(!!settings.leaderAudio&&(audioBank.loading||autoBank.loading));
  const automaticItems = useMemo(() => {const ids=new Set(automaticIds);return library.filter(item=>ids.has(item.id));},[library,automaticIds]);
  const selectedItems = useMemo(() => settings.mode === 'bars' && autoBars ? automaticItems : library.filter(i => selected.includes(i.id)), [library,selected,automaticItems,settings.mode,autoBars]);
  const selectedSet = useMemo(() => new Set(selectedItems.map(i=>i.id)), [selectedItems]);
  const timeline = useMemo(() => preserveRange || (settings.mode === 'bars' && autoBars) ? charts : trimTimeline(charts, [...selectedSet]), [charts,selectedSet,settings.mode,autoBars,preserveRange]);
  const leaderAt=useMemo(()=>settings.leaderAudio?createLeaderResolver(timeline,selectedItems,settings):()=>null,[timeline,selectedItems,settings.mode,settings.barMetric,settings.leaderAudio]);
  const leaderRef=useRef(leaderAt);leaderRef.current=leaderAt;
  const setSelected = (action: SetStateAction<string[]>) => {
    const current = [...selectedSet];
    setAutoBars(false);
    setSelectedIds(typeof action === 'function' ? action(current) : action);
  };

  const inlineResults = useMemo(() => {
    const q = inlineQuery.trim().toLowerCase();
    if (!q) return [];
    return library.filter(i => `${i.name} ${i.artist} ${i.album}`.toLowerCase().includes(q)).slice(0, 24);
  }, [library, inlineQuery]);

  const shown = useMemo(
    () => (picking ? library.filter(i => `${i.name} ${i.artist} ${i.album}`.toLowerCase().includes(query.toLowerCase())) : []),
    [library, query, picking],
  );
  const artists = useMemo(
    () => [...new Set(library.map(i => i.artist))].sort((a, b) => a.localeCompare(b)),
    [library],
  );

  // Track viewport orientation so mobile expanded widescreen ("deitado") rotates cleanly when needed
  useEffect(() => {
    const checkViewport = () => {
      setIsPortraitViewport(window.innerWidth < window.innerHeight && window.innerWidth <= 860);
    };
    window.addEventListener('resize', checkViewport);
    window.visualViewport?.addEventListener('resize',checkViewport);
    return () => {window.removeEventListener('resize', checkViewport);window.visualViewport?.removeEventListener('resize',checkViewport);};
  }, []);

  useLayoutEffect(()=>{
    const el=stageRef.current;
    if(!expanded||!el)return;
    const observer=new ResizeObserver(entries=>{
      const r=entries[0]?.contentRect;
      if(r)setStageSize(previous=>previous.width===r.width&&previous.height===r.height?previous:{width:r.width,height:r.height});
    });
    observer.observe(el);
    return()=>observer.disconnect();
  },[expanded]);

  useEffect(()=>{
    const pause=()=>{if(document.hidden){setPlaying(false);previewAudio.current?.pause();if(abortRecord.current){abortRecord.current.abort();onError('Gravação interrompida ao sair da aba. Mantenha o estúdio visível para gravar.');}}};
    document.addEventListener('visibilitychange',pause);
    return()=>document.removeEventListener('visibilitychange',pause);
  },[]);

  // Sync Escape key and native Fullscreen exits with Cinema Expanded state
  useEffect(() => {
    if (!expanded) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setExpanded(false);
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        }
      }
    };
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) {
        // Keep expanded state controlled cleanly if user pressed browser exit fullscreen
        const orient = screen.orientation as ScreenOrientation & { unlock?: () => void };
        orient?.unlock?.();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
    };
  }, [expanded]);

  useEffect(() => {
    try {
      localStorage.setItem('lastchart-studio:view-mode', viewMode);
    } catch {
      /* optional */
    }
  }, [viewMode]);

  // Auto-seed Studio with latest week's Top 5 or external selection so Studio opens vibrant and ready
  useEffect(() => {
    if (initialSelected?.length) {
      setAutoBars(false);
      setSelectedIds(initialSelected.filter(id => library.some(i => i.id === id)));
      setAutoSeeded(true);
      onConsumeInitial?.();
      return;
    }
    if (!autoSeeded && !selected.length && charts.length && library.length) {
      const latestLoaded = [...charts].reverse().find(w => w.status === 'loaded' && w.entries.length > 0);
      if (latestLoaded) {
        setSelectedIds(latestLoaded.entries.slice(0, 5).map(e => e.id));
        setAutoSeeded(true);
      }
    }
  }, [charts, library, initialSelected, autoSeeded, selected.length, onConsumeInitial]);

  useEffect(() => {
    try {
      localStorage.setItem('lastchart-studio:studio', JSON.stringify(settings));
    } catch {
      /* noncritical preference */
    }
  }, [settings]);

  useEffect(() => {
    setPlaying(false);
    setPosition(0);
    positionRef.current = 0;
    setSelectedIds(ids => selectionInRange(charts,ids));
  }, [charts, library]);

  useEffect(() => {
    setPosition(0);
    positionRef.current = 0;
    setPlaying(false);
  }, [selectedItems]);

  useEffect(() => () => {abortRecord.current?.abort();previewAudio.current?.dispose();}, []);
  useEffect(()=>{if(!playing)previewAudio.current?.pause();},[playing]);
  useEffect(()=>{if(!settings.leaderAudio){previewAudio.current?.dispose();previewAudio.current=null;setAudioStatus({phase:'idle',id:null});}},[settings.leaderAudio]);
  useEffect(()=>{previewAudio.current?.setVolume(settings.leaderVolume??.7);},[settings.leaderVolume]);

  // Zero-re-render 60fps animation loop
  useEffect(() => {
    if (!playing || timeline.length < 2) return;
    let frame = 0;
    let last = 0;
    let lastWeekShown = Math.floor(positionRef.current);
    let lastPaint = 0;
    const mobile = window.matchMedia('(pointer: coarse)').matches || window.innerWidth <= 860;
    const frameInterval = 1000 / (settings.previewFps ?? (mobile ? 30 : 60));

    const loop = (now: number) => {
      if(document.hidden){setPlaying(false);return;}
      if(now-lastPaint < frameInterval-0.5){frame=requestAnimationFrame(loop);return;}
      lastPaint=now;
      if (!last) last = now;
      const delta = (Math.min(now - last, 80) / 1000) * settings.speed;
      last = now;
      const maxPos = timeline.length - 1;
      const next = Math.min(maxPos, positionRef.current + delta);
      positionRef.current = next;

      // Paint directly on Canvas without React reconciliation
      canvasHandle.current?.drawAt(next);
      if(settings.leaderAudio)void previewAudio.current?.setLeader(leaderRef.current(next));
      if (sliderRef.current) sliderRef.current.value = String(next);
      const wk = Math.floor(next);
      if (wk !== lastWeekShown) {
        lastWeekShown = wk;
        if (counterRef.current) counterRef.current.textContent = `${wk + 1} / ${timeline.length}`;
      }

      if (next >= maxPos) {
        setPosition(maxPos);
        setPlaying(false);
        return;
      }
      frame = requestAnimationFrame(loop);
    };

    frame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frame);
      setPosition(positionRef.current);
    };
  }, [playing, timeline.length, settings.speed, settings.previewFps, settings.leaderAudio]);

  useEffect(() => {
    if (sliderRef.current) sliderRef.current.value = String(position);
  }, [position, timeline.length]);

  const update = <K extends keyof StudioSettings>(key: K, value: StudioSettings[K]) =>
    setSettings(s => ({ ...s, [key]: value }));

  const switchViewMode = (nextMode: StudioViewMode) => {
    setViewMode(nextMode);
    if (nextMode === 'widescreen') {
      update('format', 'landscape');
      if (expanded && document.fullscreenElement) {
        const orient = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
        orient?.lock?.('landscape')?.catch(() => {});
      }
    } else if (document.fullscreenElement) {
      const orient = screen.orientation as ScreenOrientation & { unlock?: () => void };
      orient?.unlock?.();
    }
  };

  const toggleExpanded = async (preferWidescreen?: boolean) => {
    const nextExpanded = !expanded;
    if (preferWidescreen) {
      setViewMode('widescreen');
      update('format', 'landscape');
    }
    setExpanded(nextExpanded);

    if (nextExpanded) {
      try {
        const el = previewPanelRef.current;
        if (el?.requestFullscreen && !document.fullscreenElement) {
          await el.requestFullscreen();
          if (preferWidescreen || viewMode === 'widescreen') {
            const orient = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
            await orient?.lock?.('landscape')?.catch(() => {});
          }
        }
      } catch {
        /* CSS Cinema Fullscreen overlay handles browsers like iOS Safari without native Fullscreen API */
      }
    } else if (document.fullscreenElement) {
      const orient = screen.orientation as ScreenOrientation & { unlock?: () => void };
      orient?.unlock?.();
      document.exitFullscreen().catch(() => {});
    }
  };

  const toggleCompetitor = (id: string) => {
    setSelected(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  };

  const applyPreset = (preset: 'recent5' | 'recent10' | 'ones' | 'top10all') => {
    const latest = [...charts].reverse().find(w => w.status === 'loaded' && w.entries.length > 0);
    if (preset === 'recent5' && latest) {
      setSelected(latest.entries.slice(0, 5).map(e => e.id));
    } else if (preset === 'recent10' && latest) {
      setSelected(latest.entries.slice(0, 10).map(e => e.id));
    } else if (preset === 'ones') {
      const ones = new Set<string>();
      for (const w of charts) {
        if (w.status === 'loaded' && w.entries[0]) ones.add(w.entries[0].id);
      }
      setSelected([...ones].slice(0, 18));
    } else if (preset === 'top10all') {
      setSelected(library.slice(0, 10).map(i => i.id));
    }
  };

  const exportPNG = () => {
    try {
      canvas.current?.toBlob(blob => {
        if (blob) download(blob, `lastchart-${settings.mode}-frame.png`);
        else onError('Não foi possível exportar esta imagem.');
      }, 'image/png');
    } catch {
      onError('Uma capa bloqueou a exportação. Tente novamente sem essa imagem.');
    }
  };

  const record = async () => {
    if (!timeline.length || !selectedItems.length) return;
    if (typeof MediaRecorder === 'undefined' || !HTMLCanvasElement.prototype.captureStream) {
      onError('Este navegador não oferece gravação de vídeo. Você ainda pode exportar PNG e CSV.');
      return;
    }
    const mime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'].find(t =>
      MediaRecorder.isTypeSupported(t),
    );
    if (!mime) {
      onError('Nenhum formato de vídeo compatível foi encontrado neste navegador.');
      return;
    }
    const controller = new AbortController();
    abortRecord.current = controller;
    setRecording(true);
    setPlaying(false);
    setRecordProgress(0);
    let stream: MediaStream | null = null;
    let ac: AudioContext | null = null;
    let source: AudioBufferSourceNode | null = null;
    let frame = 0;
    let leaderRecording:LeaderAudioSession|null=null;

    try {
      previewAudio.current?.pause();
      if(settings.leaderAudio||audioFile)onSoundStart?.();
      if(settings.leaderAudio){leaderRecording=new LeaderAudioSession(()=>clipsRef.current,setAudioStatus,{record:true,volume:settings.leaderVolume??.7});await leaderRecording.resume();}
      else if(audioFile){ac=new AudioContext();await ac.resume();}
      await Promise.all(
        selectedItems.slice(0, 24).map(async it => {
          if (!it.image) {
            const media = await resolveCatalogMedia(it);
            if (media?.artworkUrl) it.image = media.artworkUrl;
          }
          await cacheImageUrl(it.image);
        }),
      );
      await prepareImages(selectedItems);
      controller.signal.throwIfAborted();

      const output = document.createElement('canvas');
      const [w, h] = settings.format === 'portrait' ? [720, 1280] : settings.format === 'square' ? [1080, 1080] : [1280, 720];
      output.width = w;
      output.height = h;
      const ctx = output.getContext('2d', { alpha: false });
      if (!ctx) throw new Error('Canvas indisponível.');

      stream = output.captureStream(60);
      if(leaderRecording?.destination){
        for(const track of leaderRecording.destination.stream.getAudioTracks())stream.addTrack(track);
        await leaderRecording.setLeader(leaderAt(0));
      }
      if (audioFile && ac) {
        const buffer = await ac.decodeAudioData(await audioFile.arrayBuffer());
        source = ac.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        const destination = ac.createMediaStreamDestination();
        source.connect(destination);
        for (const t of destination.stream.getAudioTracks()) stream.addTrack(t);
      }
      controller.signal.throwIfAborted();

      const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6_500_000 });
      const chunks: Blob[] = [];
      recorder.ondataavailable = e => {
        if (e.data.size) chunks.push(e.data);
      };
      const stopped = new Promise<void>((resolve, reject) => {
        recorder.onstop = () => resolve();
        recorder.onerror = () => reject(new Error('A gravação falhou. Tente reduzir o tamanho ou fechar outras abas.'));
      });
      const stop = () => {
        cancelAnimationFrame(frame);
        if (recorder.state !== 'inactive') recorder.stop();
      };
      controller.signal.addEventListener('abort', stop, { once: true });

      const useDarkCanvas = dark;
      drawChart(ctx, w, h, { charts: timeline, items: selectedItems, settings, position: 0, dark: useDarkCanvas, reduced, username, kind });
      recorder.start(1000);
      source?.start();

      const start = performance.now();
      const duration = Math.max(2, (timeline.length - 1) / settings.speed + 1);
      let lastPreview=0,lastProgress=0;
      const tick = (now: number) => {
        if (controller.signal.aborted) return;
        const elapsed = (now - start) / 1000;
        const p = Math.min(timeline.length - 1, elapsed * settings.speed);
        drawChart(ctx, w, h, { charts: timeline, items: selectedItems, settings, position: p, dark: useDarkCanvas, reduced, username, kind });
        if(leaderRecording)void leaderRecording.setLeader(leaderAt(p));
        positionRef.current = p;
        if(now-lastPreview>=100){canvasHandle.current?.drawAt(p);lastPreview=now;}
        if (sliderRef.current) sliderRef.current.value = String(p);
        if(now-lastProgress>=250||elapsed>=duration){setRecordProgress(Math.min(100, (elapsed / duration) * 100));lastProgress=now;}
        if (elapsed >= duration) stop();
        else frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
      await stopped;
      controller.signal.throwIfAborted();

      const blob = new Blob(chunks, { type: recorder.mimeType });
      if (!blob.size) throw new Error('A gravação ficou vazia.');
      download(blob, `lastchart-${settings.mode}.${recorder.mimeType.includes('mp4') ? 'mp4' : 'webm'}`);
    } catch (e) {
      if (!controller.signal.aborted) onError(e instanceof Error ? e.message : 'Não foi possível gravar o vídeo.');
    } finally {
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach(t => t.stop());
      leaderRecording?.dispose();
      try {
        source?.stop();
      } catch {
        /* already ended */
      }
      await ac?.close();
      abortRecord.current = null;
      setPosition(positionRef.current);
      setRecording(false);
    }
  };

  const paletteColors = palettes[settings.palette] ?? palettes.neon;
  const useDarkCanvas = dark;
  const rotateMobileWidescreen = expanded && viewMode === 'widescreen' && isPortraitViewport;
  const aspect = viewMode === 'widescreen' || settings.format === 'landscape' ? 16/9 : settings.format === 'portrait' ? 9/16 : 1;
  const fitted = fitStudioCanvas(stageSize.width,stageSize.height,aspect);

  const canvasHeight: number | string = expanded
    ? Math.max(1,fitted.height)
    : viewMode === 'widescreen'
      ? 'clamp(260px, 50vw, 580px)'
      : settings.mode === 'bars'
        ? Math.max(410, settings.barCount * 24 + 100)
      : settings.format === 'portrait'
        ? 560
        : settings.format === 'square'
          ? 480
          : 410;

  return (
    <div className={`studio-layout ${viewMode === 'widescreen' ? 'is-widescreen' : ''}`}>
      <div className="studio-main">
        <div
          ref={previewPanelRef}
          className={`panel studio-preview ${expanded ? 'is-expanded' : ''} ${viewMode === 'widescreen' ? 'view-widescreen' : 'view-normal'} ${rotateMobileWidescreen ? 'is-rotated-landscape' : ''}`}
        >
          <div className="panel-heading studio-header-bar">
            <div>
              <span className="eyebrow">
                {expanded ? 'MODO CINEMA' : 'ESTÚDIO DE ANIMAÇÃO'} · PRÉVIA {settings.previewFps ?? ((window.matchMedia('(pointer: coarse)').matches || window.innerWidth<=860)?30:60)} FPS · EXPORTAÇÃO 60 FPS
              </span>
              <h2>{settings.mode === 'bars' ? 'Corrida de Reproduções' : 'Trajetória no Ranking'}</h2>
            </div>

            <div className="studio-mode-group">
              <div className="segmented compact-seg" role="group" aria-label="Modo de gráfico">
                <button
                  type="button"
                  className={settings.mode === 'lines' ? 'selected' : ''}
                  aria-pressed={settings.mode === 'lines'}
                  onClick={() => update('mode', 'lines')}
                >
                  <TrendingUp size={15} />
                  <span>Linhas</span>
                </button>
                <button
                  type="button"
                  className={settings.mode === 'bars' ? 'selected' : ''}
                  aria-pressed={settings.mode === 'bars'}
                  onClick={() => { setAutoBars(true); update('mode', 'bars'); }}
                >
                  <BarChart2 size={15} />
                  <span>Barras</span>
                </button>
              </div>

              <div className="segmented compact-seg display-mode-seg" role="group" aria-label="Padrão de exibição do vídeo">
                <button
                  type="button"
                  className={viewMode === 'normal' ? 'selected' : ''}
                  aria-pressed={viewMode === 'normal'}
                  onClick={() => switchViewMode('normal')}
                  title="Exibição Padrão (Normal)"
                >
                  <Monitor size={14} />
                  <span>Normal</span>
                </button>
                <button
                  type="button"
                  className={viewMode === 'widescreen' ? 'selected' : ''}
                  aria-pressed={viewMode === 'widescreen'}
                  onClick={() => switchViewMode('widescreen')}
                  title="Exibição Widescreen 16:9 (Deitado)"
                >
                  <RectangleHorizontal size={15} />
                  <span>Widescreen</span>
                </button>
              </div>

              <button
                type="button"
                className={`button small expand-stage-btn ${expanded ? 'primary' : ''}`}
                onClick={() => void toggleExpanded()}
                aria-label={expanded ? 'Reduzir tamanho da animação' : 'Abrir animação em tamanho maior'}
              >
                {expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
                <span>{expanded ? 'Fechar tela cheia' : 'Ver maior'}</span>
              </button>

              {!expanded && (
                <button
                  type="button"
                  className="icon-button surface-btn"
                  onClick={() => setControls(v => !v)}
                  aria-label="Mostrar controles do estúdio"
                  aria-expanded={controls}
                >
                  <SlidersHorizontal size={18} />
                </button>
              )}
            </div>
          </div>

          {!expanded && <div className="studio-period-filter">
            <div><strong>Período do vídeo</strong><small>{charts[0]?.label} até {charts.at(-1)?.label} · {charts.length} {charts[0]?.unit === 'year' ? 'anos' : charts[0]?.unit === 'month' ? 'meses' : charts[0]?.unit === 'day' ? 'dias' : 'semanas'}</small></div>
            <button type="button" className="button small" disabled={recording} onClick={onChoosePeriod}><CalendarDays size={16}/><span>Filtrar ano, mês ou semana</span></button>
            {settings.mode === 'bars' && <>
              <label>Barras no ranking<select aria-label="Quantidade de barras" value={settings.barCount} disabled={recording} onChange={e=>{setAutoBars(true);update('barCount',Number(e.target.value));}}>{[5,10,15,20,30].map(n=><option key={n} value={n}>Top {n} barras</option>)}</select></label>
              <small>{autoBars ? `Top ${settings.barCount} automático em cada período, com todos os competidores que chegam a ele.` : `Seleção manual: ${selectedItems.length} competidores. O limite de barras não adiciona músicas à seleção manual.`} As barras contam todas as reproduções salvas no intervalo, inclusive fora do Top 100.</small>
              {!autoBars && <button type="button" className="text-button" disabled={recording} onClick={()=>setAutoBars(true)}>Usar Top {settings.barCount} automático</button>}
            </>}
          </div>}

          {!expanded && !!library.length && (
            <div className="preset-strip" aria-label="Seleções rápidas">
              <button type="button" className="chip-btn" disabled={recording} onClick={() => applyPreset('recent5')}>
                <Sparkles size={13} />
                <span>Top 5 recente</span>
              </button>
              <button type="button" className="chip-btn" disabled={recording} onClick={() => applyPreset('recent10')}>
                <Flame size={13} />
                <span>Top 10 recente</span>
              </button>
              <button type="button" className="chip-btn" disabled={recording} onClick={() => applyPreset('ones')}>
                <Crown size={13} />
                <span>Campeões #1</span>
              </button>
              <button type="button" className="chip-btn" disabled={recording} onClick={() => applyPreset('top10all')}>
                <BarChart2 size={13} />
                <span>Top 10 geral</span>
              </button>
              <button
                type="button"
                className="chip-btn"
                disabled={recording}
                onClick={() => void toggleExpanded(true)}
              >
                <RectangleHorizontal size={13} />
                <span>Abrir Widescreen (Deitado)</span>
              </button>
              <button type="button" className="chip-btn accent" disabled={recording} onClick={() => setPicking(true)}>
                <Plus size={13} />
                <span>Catálogo / Discografia</span>
              </button>
            </div>
          )}

          {!expanded&&<LeaderSoundtrack items={selectedItems} clips={audioBank.clips} autoClips={autoBank.clips} mode={audioMode} onMode={value=>update('leaderAudioMode',value)} onSaveAuto={autoBank.save} loading={audioBank.loading||autoBank.loading} error={audioBank.error||autoBank.error} enabled={!!settings.leaderAudio} volume={settings.leaderVolume??.7} status={audioStatus} disabled={recording} onSave={audioBank.save} onEnabled={value=>{update('leaderAudio',value);if(value&&playing)resumeSound();if(!value){previewAudio.current?.dispose();previewAudio.current=null;}}} onVolume={value=>update('leaderVolume',value)}/>}

          <div ref={stageRef} className={`canvas-stage ${viewMode === 'widescreen' ? 'widescreen-stage' : ''}`}>
            <ChartCanvas
              canvasRef={canvas}
              handleRef={canvasHandle}
              className={viewMode === 'widescreen' && !expanded ? 'is-widescreen-canvas' : ''}
              options={{
                charts: timeline,
                items: selectedItems,
                settings,
                position,
                dark: useDarkCanvas,
                reduced,
                username,
                kind,
              }}
              height={canvasHeight}
              width={expanded ? Math.max(1,fitted.width) : undefined}
            />
          </div>

          <div className="transport">
            <button
              type="button"
              className="icon-button"
              disabled={recording || !timeline.length}
              onClick={() => {
                setPlaying(false);
                previewAudio.current?.stop();
                positionRef.current = 0;
                setPosition(0);
              }}
              aria-label="Voltar ao início"
            >
              <RotateCcw size={17} />
            </button>
            <button
              type="button"
              className="play-button"
              disabled={recording || preparing || !selectedItems.length || timeline.length < 2}
              onClick={() => {
                if (positionRef.current >= timeline.length - 1) {
                  previewAudio.current?.stop();
                  positionRef.current = 0;
                  setPosition(0);
                }
                if(!playing&&settings.leaderAudio)resumeSound();
                setPlaying(p => !p);
              }}
              aria-label={playing ? 'Pausar animação' : 'Reproduzir animação'}
            >
              {playing ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}
            </button>
            <input
              ref={sliderRef}
              name="studio-timeline-slider"
              aria-label="Período da animação"
              type="range"
              min="0"
              max={Math.max(0, timeline.length - 1)}
              step="0.01"
              defaultValue={0}
              disabled={recording || !timeline.length}
              onChange={e => {
                const val = Number(e.target.value);
                setPlaying(false);
                previewAudio.current?.stop();
                positionRef.current = val;
                setPosition(val);
              }}
            />
            <span ref={counterRef} className="transport-count">
              {timeline.length ? Math.floor(position) + 1 : 0} / {timeline.length}
            </span>
          </div>

          {!expanded && <div className="studio-playback-status" role="status">
            {preparing ? <><MusicLoader size="sm"/><span>Preparando os charts do vídeo…</span></> : barsError ? <span>{barsError}</span> : !selectedItems.length || !timeline.length ? <><span>Nenhum competidor encontrado neste intervalo. Ajuste as datas ou a seleção.</span><button type="button" className="text-button" onClick={onChoosePeriod}>Alterar período</button></> : timeline.length === 1 ? <><span>Quadro único: este filtro gerou apenas um período. Salve o PNG ou escolha semanas, meses ou dias para ver a evolução.</span><button type="button" className="text-button" onClick={onChoosePeriod}>Criar uma sequência de períodos</button></> : <span>{timeline.length} períodos prontos para reproduzir · {timeline[0]?.label} até {timeline.at(-1)?.label}</span>}
          </div>}

          {recording && (
            <div className="record-status" role="status">
              <MusicLoader size="sm" />
              <span>Gravando {Math.round(recordProgress)}% · mantenha esta aba visível</span>
              <button type="button" className="button small" onClick={() => abortRecord.current?.abort()}>
                <Square size={14} />
                <span>Cancelar</span>
              </button>
              <progress max="100" value={recordProgress} />
            </div>
          )}

          {!expanded && (
            <div className="studio-actions">
              <button
                type="button"
                className={`button primary ${recording ? 'is-loading' : ''}`}
                disabled={recording || preparing || !selectedItems.length || !timeline.length}
                onClick={record}
              >
                {recording ? <MusicLoader size="sm" tone="ink" /> : <Download size={17} />}
                <span>{recording ? 'Renderizando vídeo…' : 'Gravar e baixar vídeo'}</span>
              </button>
              <button type="button" className="button" disabled={recording || !timeline.length} onClick={exportPNG}>
                <ImageDown size={17} />
                <span>Salvar frame PNG</span>
              </button>
              <span className="muted small-text">Renderização fluida 60 fps · WebM/MP4 nativo</span>
            </div>
          )}
        </div>

        {/* Inline Music Searcher + Active Competitors Panel */}
        <div className="panel studio-search-panel">
          <div className="panel-heading">
            <div>
              <h2>
                Buscador & Competidores <span className="count-badge">{selectedItems.length}</span>
              </h2>
              <p>Busque músicas, álbuns ou artistas para adicionar ou remover da animação instantaneamente.</p>
            </div>
            <div className="inline-actions">
              {selectedItems.length > 0 && (
                <button
                  type="button"
                  className="text-button"
                  disabled={recording}
                  onClick={() => setSelected([])}
                >
                  Limpar disputa
                </button>
              )}
              <button type="button" className="button small" disabled={recording} onClick={() => setPicking(true)}>
                <Plus size={16} />
                <span>Catálogo completo</span>
              </button>
            </div>
          </div>

          <div className="studio-inline-search">
            <div className="search-field">
              <Search size={17} />
              <input
                aria-label="Buscar músicas para a animação"
                placeholder="Buscar música, álbum ou artista para animar…"
                value={inlineQuery}
                disabled={recording}
                onChange={e => setInlineQuery(e.target.value)}
              />
              {inlineQuery && (
                <button
                  type="button"
                  className="icon-button search-clear-btn"
                  aria-label="Limpar busca"
                  onClick={() => setInlineQuery('')}
                >
                  <X size={15} />
                </button>
              )}
            </div>

            {artists.length > 0 && (
              <select
                aria-label="Adicionar discografia ouvida de um artista"
                value=""
                disabled={recording}
                onChange={e => {
                  if (e.target.value) {
                    const artistItems = library.filter(i => i.artist === e.target.value).map(i => i.id);
                    setSelected(s => [...new Set([...s, ...artistItems])]);
                  }
                }}
              >
                <option value="">+ Discografia de artista…</option>
                {artists.map(a => (
                  <option key={a} value={a}>
                    {a} ({library.filter(i => i.artist === a).length})
                  </option>
                ))}
              </select>
            )}
          </div>

          {inlineQuery.trim() !== '' && (
            <div className="studio-search-results" role="region" aria-label="Resultados da busca no estúdio">
              {inlineResults.length ? (
                inlineResults.map(item => {
                  const isAdded = selectedSet.has(item.id);
                  return (
                    <div key={item.id} className={`studio-search-hit ${isAdded ? 'is-added' : ''}`}>
                      <Cover item={item} />
                      <div className="truncate">
                        <strong>{item.name}</strong>
                        <small>
                          {item.artist}
                          {item.album ? ` · ${item.album}` : ''} · {number(item.plays)} plays
                        </small>
                      </div>
                      <button
                        type="button"
                        className={`button small ${isAdded ? '' : 'primary'}`}
                        disabled={recording}
                        onClick={() => toggleCompetitor(item.id)}
                      >
                        {isAdded ? <Check size={14} /> : <Plus size={14} />}
                        <span>{isAdded ? 'Na disputa' : 'Adicionar'}</span>
                      </button>
                    </div>
                  );
                })
              ) : (
                <p className="muted small-text studio-no-hits">
                  Nenhum item corresponde a “{inlineQuery}” no acervo atual.
                </p>
              )}
            </div>
          )}

          {!selectedItems.length ? (
            <Empty
              title="Escolha quem vai disputar"
              description="Use a busca acima para procurar qualquer música ou coloque toda a discografia de um artista para competir."
              action={
                <button type="button" className="button primary" onClick={() => setPicking(true)}>
                  <Plus size={16} />
                  <span>Escolher no catálogo</span>
                </button>
              }
            />
          ) : (
            <div className="competitors">
              {selectedItems.slice(0,60).map((item, i) => (
                <div key={item.id} className="competitor">
                  <Cover item={item} round />
                  <div className="truncate">
                    <strong>{item.name}</strong>
                    <span>{item.artist}</span>
                  </div>
                  <input
                    type="color"
                    aria-label={`Cor de ${item.name}`}
                    value={settings.colors[item.id] ?? paletteColors[i % paletteColors.length]}
                    disabled={recording}
                    onChange={e => update('colors', { ...settings.colors, [item.id]: e.target.value })}
                  />
                  <button
                    type="button"
                    className="icon-button"
                    disabled={recording}
                    aria-label={`Remover ${item.name}`}
                    onClick={() => setSelected(s => s.filter(id => id !== item.id))}
                  >
                    <X size={15} />
                  </button>
                </div>
              ))}
              {selectedItems.length > 60 && <button type="button" className="button" onClick={()=>setPicking(true)}>Ver os {selectedItems.length} competidores no catálogo</button>}
            </div>
          )}
          {timeline.some(w => w.provisional) && (
            <p className="note">
              Início, fim e recordes referem-se ao trecho sincronizado. Baixe todo o histórico em Ajustes para cobrir 100% desde 2016.
            </p>
          )}
        </div>
      </div>

      {controls && (
        <Modal title="Painel do Estúdio" subtitle="Ajuste a animação sem alterar parâmetros durante a rolagem da página." onClose={() => setControls(false)} wide>
        <div className="studio-controls">
          <div className="panel-heading">
            <h2>
              <Settings2 size={18} />
              <span>Painel do Estúdio</span>
            </h2>
          </div>
          <fieldset disabled={recording}>
            <label>Nome do seu chart<input aria-label="Nome do chart no vídeo" maxLength={48} value={settings.chartName??''} placeholder={`${username} · Hot 100`} onChange={e=>update('chartName',e.target.value)}/><small>Seu nome aparece na prévia e no vídeo, junto com as datas reais.</small></label>
            {settings.mode === 'lines' ? (
              <label>
                Escala vertical fixa (posições)
                <select value={settings.top} onChange={e => update('top', Number(e.target.value))}>
                  {[100, 50, 30, 20, 10].map(n => (
                    <option key={n} value={n}>
                      Top {n}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <>
                <label>
                  Métrica das barras
                  <select value={settings.barMetric} onChange={e => update('barMetric', e.target.value as StudioSettings['barMetric'])}>
                    <option value="cumulative">Plays acumulados (Estilo YouTube)</option>
                    <option value="weekly">Plays em cada período</option>
                  </select>
                </label>
                <label>
                  Barras visíveis
                  <select value={settings.barCount} onChange={e => {setAutoBars(true);update('barCount', Number(e.target.value));}}>
                    {[5, 10, 15, 20, 30].map(n => (
                      <option key={n} value={n}>
                        Top {n} barras
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}

            <label>
              Formato do vídeo exportado
              <select
                value={settings.format}
                onChange={e => {
                  const fmt = e.target.value as StudioSettings['format'];
                  update('format', fmt);
                  if (fmt !== 'landscape' && viewMode === 'widescreen') setViewMode('normal');
                }}
              >
                <option value="landscape">Widescreen · 16:9 Deitado (YouTube)</option>
                <option value="portrait">Vertical · 9:16 (Reels / TikTok)</option>
                <option value="square">Quadrado · 1:1 (Feed)</option>
              </select>
            </label>

            <label>
              Fundo do gráfico
              <small>Acompanha o tema do aplicativo, inclusive nas exportações: {dark ? 'escuro' : 'claro'}.</small>
            </label>
            <label>Fluidez da prévia<select aria-label="Fluidez da prévia" value={settings.previewFps ?? 'auto'} onChange={e=>update('previewFps',e.target.value==='auto'?undefined:Number(e.target.value) as 30|60)}><option value="auto">Automática · 30 fps no celular</option><option value="30">30 fps · menor consumo</option><option value="60">60 fps · maior fluidez</option></select><small>A exportação de vídeo mantém 60 fps.</small></label>

            <label>
              Paleta cromática
              <select value={settings.palette} onChange={e => update('palette', e.target.value as StudioSettings['palette'])}>
                <option value="neon">Esmeralda & Neon</option>
                <option value="aurora">Aurora Boreal</option>
                <option value="garden">Jardim Botânico</option>
                <option value="sunset">Pôr do Sol</option>
              </select>
            </label>

            {(
              [
                { key: 'speed', label: 'Velocidade', min: 0.25, max: 4, step: 0.25, suffix: '×' },
                ...(settings.mode === 'lines'
                  ? [
                      { key: 'spacing', label: 'Distância entre períodos', min: 40, max: 180, step: 10, suffix: ' px' } as const,
                      { key: 'lineWidth', label: 'Espessura das linhas', min: 1.5, max: 6, step: 0.5, suffix: ' px' } as const,
                      { key: 'coverSize', label: 'Tamanho das capas', min: 18, max: 48, step: 2, suffix: ' px' } as const,
                      { key: 'fontSize', label: 'Tamanho dos cards', min: 10, max: 18, step: 1, suffix: ' px' } as const,
                    ]
                  : []),
              ] as const
            ).map(c => (
              <label key={c.key} className="range-label">
                <span>
                  {c.label}
                  <b>
                    {settings[c.key]}
                    {c.suffix}
                  </b>
                </span>
                <input
                  type="range"
                  min={c.min}
                  max={c.max}
                  step={c.step}
                  value={settings[c.key]}
                  onChange={e => update(c.key, Number(e.target.value))}
                />
              </label>
            ))}

            <label className="switch-row">
              <span>
                Efeitos de topo
                <small>#1 coroa e confetes · Top 10 pulso neon</small>
              </span>
              <input
                type="checkbox"
                role="switch"
                checked={settings.effects}
                onChange={e => update('effects', e.target.checked)}
              />
            </label>

            <div className="audio-upload">
              <Upload size={20} />
              <strong>Trilha sonora no vídeo</strong>
              <p>Adicione um arquivo de áudio local opcional para mixar na gravação.</p>
              <label className="button small file-button">
                <span>{audioFile ? audioFile.name : 'Escolher áudio local'}</span>
                <input
                  type="file"
                  accept="audio/*"
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (f && f.size > 40 * 1024 * 1024) onError('Use um áudio menor que 40 MB.');
                    else if (f) setAudioFile(f);
                  }}
                />
              </label>
              {audioFile && (
                <button type="button" className="text-button" onClick={() => setAudioFile(null)}>
                  Remover áudio
                </button>
              )}
            </div>

            <button type="button" className="button full" onClick={() => setSettings(studioDefaults)}>
              Restaurar padrão do estúdio
            </button>
          </fieldset>
        </div>
        </Modal>
      )}

      {picking && (
        <Modal
          title="Competidores e Discografias"
          subtitle="Escolha itens avulsos ou adicione toda a discografia ouvida de um artista sem deixar faixas de fora."
          onClose={() => setPicking(false)}
          wide
        >
          <div className="search-field">
            <Search size={18} />
            <input
              aria-label="Buscar competidores"
              placeholder="Buscar música, álbum ou artista…"
              value={query}
              onChange={e => {
                setQuery(e.target.value);
                setLimit(100);
              }}
            />
          </div>

          <label className="field">
            Competir com discografia completa ouvida do artista
            <select
              value=""
              onChange={e => {
                if (e.target.value) {
                  const artistItems = library.filter(i => i.artist === e.target.value).map(i => i.id);
                  setSelected(s => [...new Set([...s, ...artistItems])]);
                }
              }}
            >
              <option value="">Escolha um artista para adicionar todas as faixas…</option>
              {artists.map(a => (
                <option key={a} value={a}>
                  {a} ({library.filter(i => i.artist === a).length} itens)
                </option>
              ))}
            </select>
          </label>

          <div className="selection-tools">
            <span>
              <strong>{selectedItems.length}</strong> selecionados
            </span>
            <button
              type="button"
              className="text-button"
              onClick={() => setSelected(s => [...new Set([...s, ...shown.map(i => i.id)])])}
            >
              Marcar filtrados ({shown.length})
            </button>
            <button type="button" className="text-button" onClick={() => setSelected([])}>
              Desmarcar todos
            </button>
          </div>

          <div className="picker-list">
            {shown.slice(0, limit).map(item => (
              <label className="picker-item" key={item.id}>
                <input
                  type="checkbox"
                  checked={selectedSet.has(item.id)}
                  onChange={e =>
                    setSelected(s => (e.target.checked ? [...s, item.id] : s.filter(id => id !== item.id)))
                  }
                />
                <Cover item={item} />
                <span className="truncate">
                  <strong>{item.name}</strong>
                  <small>
                    {item.artist}
                    {item.album ? ` · ${item.album}` : ''}
                  </small>
                </span>
                <span className="picker-plays">{number(item.plays)} plays</span>
              </label>
            ))}
            {shown.length > limit && (
              <button type="button" className="button full picker-more" onClick={() => setLimit(n => n + 100)}>
                Mostrar mais ({shown.length - limit})
              </button>
            )}
            {!shown.length && <Empty title="Nenhum item encontrado" description="Sincronize seu perfil ou ajuste sua busca." />}
          </div>

          <div className="modal-footer">
            <p className="muted">
              A seleção usa todo o histórico sincronizado e mantém reentradas reais sem inventar posições.
            </p>
            <button type="button" className="button primary" onClick={() => setPicking(false)}>
              Concluir · {selectedItems.length} itens
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
