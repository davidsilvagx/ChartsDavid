import { useEffect, useMemo, useRef, useState } from 'react';
import { BarChart2, Crown, Download, Flame, ImageDown, Pause, Play, Plus, RotateCcw, Search, Settings2, SlidersHorizontal, Sparkles, Square, TrendingUp, Upload, X } from 'lucide-react';
import { studioDefaults, type ChartWeek, type Item, type StudioSettings } from '../lib/types';
import { trimTimeline } from '../lib/charts';
import { cacheImageUrl, drawChart, palettes, prepareImages } from '../lib/canvas';
import { resolveCatalogMedia } from '../lib/catalog';
import { download } from '../lib/export';
import { ChartCanvas, type ChartCanvasHandle } from './ChartCanvas';
import { Cover, Empty, Modal } from './UI';

export function Studio({
  charts,
  library,
  reduced,
  dark,
  initialSelected,
  onConsumeInitial,
  onError,
}: {
  charts: ChartWeek[];
  library: Item[];
  reduced: boolean;
  dark: boolean;
  initialSelected?: string[];
  onConsumeInitial?: () => void;
  onError: (s: string) => void;
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
  const [selected, setSelected] = useState<string[]>([]);
  const [autoSeeded, setAutoSeeded] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(100);
  const [controls, setControls] = useState(true);
  const [recording, setRecording] = useState(false);
  const [recordProgress, setRecordProgress] = useState(0);
  const [audioFile, setAudioFile] = useState<File | null>(null);

  const abortRecord = useRef<AbortController | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const canvasHandle = useRef<ChartCanvasHandle>(null);
  const sliderRef = useRef<HTMLInputElement>(null);
  const counterRef = useRef<HTMLSpanElement>(null);
  const positionRef = useRef(0);

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const selectedItems = useMemo(() => library.filter(i => selectedSet.has(i.id)), [library, selectedSet]);
  const timeline = useMemo(() => trimTimeline(charts, selected), [charts, selected]);
  const shown = useMemo(
    () => (picking ? library.filter(i => `${i.name} ${i.artist} ${i.album}`.toLowerCase().includes(query.toLowerCase())) : []),
    [library, query, picking],
  );
  const artists = useMemo(
    () => (picking ? [...new Set(library.map(i => i.artist))].sort((a, b) => a.localeCompare(b)) : []),
    [library, picking],
  );

  // Auto-seed Studio with latest week's Top 5 or external selection so Studio opens vibrant and ready
  useEffect(() => {
    if (initialSelected?.length) {
      setSelected(initialSelected.filter(id => library.some(i => i.id === id)));
      setAutoSeeded(true);
      onConsumeInitial?.();
      return;
    }
    if (!autoSeeded && !selected.length && charts.length && library.length) {
      const latestLoaded = [...charts].reverse().find(w => w.status === 'loaded' && w.entries.length > 0);
      if (latestLoaded) {
        setSelected(latestLoaded.entries.slice(0, 5).map(e => e.id));
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
    setSelected(ids => ids.filter(id => library.some(i => i.id === id)));
  }, [charts, library]);

  useEffect(() => {
    setPosition(0);
    positionRef.current = 0;
    setPlaying(false);
  }, [selected]);

  useEffect(() => () => abortRecord.current?.abort(), []);

  // Zero-re-render 60fps animation loop
  useEffect(() => {
    if (!playing || timeline.length < 2) return;
    let frame = 0;
    let last = 0;
    let lastWeekShown = Math.floor(positionRef.current);

    const loop = (now: number) => {
      if (!last) last = now;
      const delta = (Math.min(now - last, 80) / 1000) * settings.speed;
      last = now;
      const maxPos = timeline.length - 1;
      const next = Math.min(maxPos, positionRef.current + delta);
      positionRef.current = next;

      // Paint directly on Canvas without React reconciliation
      canvasHandle.current?.drawAt(next);
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
  }, [playing, timeline.length, settings.speed]);

  useEffect(() => {
    if (sliderRef.current) sliderRef.current.value = String(position);
  }, [position, timeline.length]);

  const update = <K extends keyof StudioSettings>(key: K, value: StudioSettings[K]) =>
    setSettings(s => ({ ...s, [key]: value }));

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

    try {
      // Ensure catalog artwork is loaded before recording
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
      if (audioFile) {
        ac = new AudioContext();
        await ac.resume();
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

      const useDarkCanvas = settings.canvasTheme !== 'light';
      drawChart(ctx, w, h, { charts: timeline, items: selectedItems, settings, position: 0, dark: useDarkCanvas, reduced });
      recorder.start(1000);
      source?.start();

      const start = performance.now();
      const duration = Math.max(2, (timeline.length - 1) / settings.speed + 1);
      const tick = (now: number) => {
        if (controller.signal.aborted) return;
        const elapsed = (now - start) / 1000;
        const p = Math.min(timeline.length - 1, elapsed * settings.speed);
        drawChart(ctx, w, h, { charts: timeline, items: selectedItems, settings, position: p, dark: useDarkCanvas, reduced });
        positionRef.current = p;
        canvasHandle.current?.drawAt(p);
        if (sliderRef.current) sliderRef.current.value = String(p);
        setRecordProgress(Math.min(100, (elapsed / duration) * 100));
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
  const useDarkCanvas = settings.canvasTheme ? settings.canvasTheme === 'dark' : dark;

  return (
    <div className="studio-layout">
      <div className="studio-main">
        <div className="panel studio-preview">
          <div className="panel-heading studio-header-bar">
            <div>
              <span className="eyebrow">ESTÚDIO DE ANIMAÇÃO · 60 FPS</span>
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
                  onClick={() => update('mode', 'bars')}
                >
                  <BarChart2 size={15} />
                  <span>Barras</span>
                </button>
              </div>
              <button
                type="button"
                className="icon-button surface-btn"
                onClick={() => setControls(v => !v)}
                aria-label="Mostrar controles do estúdio"
                aria-expanded={controls}
              >
                <SlidersHorizontal size={18} />
              </button>
            </div>
          </div>

          {!!library.length && (
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
              <button type="button" className="chip-btn accent" disabled={recording} onClick={() => setPicking(true)}>
                <Plus size={13} />
                <span>Escolher / Discografia</span>
              </button>
            </div>
          )}

          <div className="canvas-stage">
            <ChartCanvas
              canvasRef={canvas}
              handleRef={canvasHandle}
              options={{
                charts: timeline,
                items: selectedItems,
                settings,
                position,
                dark: useDarkCanvas,
                reduced,
              }}
              height={settings.format === 'portrait' ? 560 : settings.format === 'square' ? 480 : 410}
            />
          </div>

          <div className="transport">
            <button
              type="button"
              className="icon-button"
              disabled={recording || !timeline.length}
              onClick={() => {
                setPlaying(false);
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
              disabled={recording || timeline.length < 2}
              onClick={() => {
                if (positionRef.current >= timeline.length - 1) {
                  positionRef.current = 0;
                  setPosition(0);
                }
                setPlaying(p => !p);
              }}
              aria-label={playing ? 'Pausar animação' : 'Reproduzir animação'}
            >
              {playing ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}
            </button>
            <input
              ref={sliderRef}
              name="studio-timeline-slider"
              aria-label="Semana da animação"
              type="range"
              min="0"
              max={Math.max(0, timeline.length - 1)}
              step="0.01"
              defaultValue={0}
              disabled={recording || !timeline.length}
              onChange={e => {
                const val = Number(e.target.value);
                setPlaying(false);
                positionRef.current = val;
                setPosition(val);
              }}
            />
            <span ref={counterRef} className="transport-count">
              {timeline.length ? Math.floor(position) + 1 : 0} / {timeline.length}
            </span>
          </div>

          {recording && (
            <div className="record-status" role="status">
              <progress max="100" value={recordProgress} />
              <span>Gravando {Math.round(recordProgress)}% · mantenha esta aba visível</span>
              <button type="button" className="button small" onClick={() => abortRecord.current?.abort()}>
                <Square size={14} />
                <span>Cancelar</span>
              </button>
            </div>
          )}

          <div className="studio-actions">
            <button type="button" className="button primary" disabled={recording || !timeline.length} onClick={record}>
              <Download size={17} />
              <span>{recording ? 'Gravando…' : 'Gravar e baixar vídeo'}</span>
            </button>
            <button type="button" className="button" disabled={recording || !timeline.length} onClick={exportPNG}>
              <ImageDown size={17} />
              <span>Salvar frame PNG</span>
            </button>
            <span className="muted small-text">Renderização fluida 60 fps · WebM/MP4 nativo</span>
          </div>
        </div>

        <div className="panel">
          <div className="panel-heading">
            <div>
              <h2>
                Competidores <span className="count-badge">{selectedItems.length}</span>
              </h2>
              <p>Posições reais disputadas contra o Top 100 completo de cada semana.</p>
            </div>
            <button type="button" className="button small" disabled={recording} onClick={() => setPicking(true)}>
              <Plus size={16} />
              <span>Selecionar</span>
            </button>
          </div>
          {!selectedItems.length ? (
            <Empty
              title="Escolha quem vai disputar"
              description="Selecione faixas avulsas ou coloque toda a discografia ouvida de um artista para competir."
              action={
                <button type="button" className="button primary" onClick={() => setPicking(true)}>
                  <Plus size={16} />
                  <span>Escolher competidores</span>
                </button>
              }
            />
          ) : (
            <div className="competitors">
              {selectedItems.map((item, i) => (
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
        <aside className="panel studio-controls">
          <div className="panel-heading">
            <h2>
              <Settings2 size={18} />
              <span>Painel do Estúdio</span>
            </h2>
          </div>
          <fieldset disabled={recording}>
            {settings.mode === 'lines' ? (
              <label>
                Escala vertical fixa
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
                    <option value="weekly">Plays em cada semana</option>
                  </select>
                </label>
                <label>
                  Barras visíveis
                  <select value={settings.barCount} onChange={e => update('barCount', Number(e.target.value))}>
                    {[10, 15, 20].map(n => (
                      <option key={n} value={n}>
                        Top {n} barras
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}

            <label>
              Formato do vídeo
              <select value={settings.format} onChange={e => update('format', e.target.value as StudioSettings['format'])}>
                <option value="landscape">Paisagem · 16:9 (YouTube)</option>
                <option value="portrait">Vertical · 9:16 (Reels / TikTok)</option>
                <option value="square">Quadrado · 1:1 (Feed)</option>
              </select>
            </label>

            <label>
              Fundo do gráfico
              <select value={settings.canvasTheme} onChange={e => update('canvasTheme', e.target.value as StudioSettings['canvasTheme'])}>
                <option value="dark">Obsidiana Studio (Escuro)</option>
                <option value="light">Cristal Editorial (Claro)</option>
              </select>
            </label>

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
                      { key: 'spacing', label: 'Distância entre semanas', min: 40, max: 180, step: 10, suffix: ' px' } as const,
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
        </aside>
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
              <strong>{selected.length}</strong> selecionados
            </span>
            <button
              type="button"
              className="text-button"
              onClick={() => setSelected(s => [...new Set([...s, ...shown.map(i => i.id)])])}
            >
              Marcar filtrados ({shown.length})
            </button>
            <button type="button" className="text-button" onClick={() => setSelected([])}>
              Limpar seleção
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
                <span className="picker-plays">{item.plays} plays</span>
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
              Concluir · {selected.length} itens
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
