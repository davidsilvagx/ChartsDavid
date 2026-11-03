import { useEffect, useImperativeHandle, useRef, type Ref, type RefObject } from 'react';
import { cacheImageUrl, drawChart, prepareImages, type DrawOptions } from '../lib/canvas';
import { resolveCatalogMedia } from '../lib/catalog';

export interface ChartCanvasHandle {
  drawAt: (position: number) => void;
  getCanvas: () => HTMLCanvasElement | null;
}

export function ChartCanvas({
  options,
  canvasRef,
  handleRef,
  height = 380,
  className = '',
}: {
  options: DrawOptions;
  canvasRef?: RefObject<HTMLCanvasElement | null>;
  handleRef?: Ref<ChartCanvasHandle>;
  height?: number | string;
  className?: string;
}) {
  const internal = useRef<HTMLCanvasElement>(null);
  const ref = canvasRef ?? internal;
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const paint = (pos = optionsRef.current.position) => {
    const canvas = ref.current;
    if (!canvas) return;
    const width = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!width || !h) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const targetW = Math.round(width * dpr);
    const targetH = Math.round(h * dpr);
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawChart(ctx, width, h, { ...optionsRef.current, position: pos });
  };

  useImperativeHandle(handleRef, () => ({
    drawAt: (pos: number) => {
      optionsRef.current = { ...optionsRef.current, position: pos };
      paint(pos);
    },
    getCanvas: () => ref.current,
  }));

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let alive = true;
    const render = () => {
      if (alive) paint();
    };
    const observer = new ResizeObserver(render);
    observer.observe(canvas);
    render();

    const items = optionsRef.current.items;
    prepareImages(items).then(() => {
      if (alive) paint();
    });

    // Enrich missing covers via iTunes catalog without mutating domain IDs
    const missing = items.filter(it => !it.image).slice(0, 24);
    if (missing.length) {
      Promise.all(
        missing.map(async it => {
          const media = await resolveCatalogMedia(it);
          if (media?.artworkUrl) {
            it.image = media.artworkUrl;
            await cacheImageUrl(media.artworkUrl);
          }
        }),
      ).then(() => {
        if (alive) paint();
      });
    }

    return () => {
      alive = false;
      observer.disconnect();
    };
  }, [ref, options.items, height]);

  useEffect(() => {
    paint(options.position);
  }, [options]);

  return (
    <canvas
      ref={ref}
      className={`history-canvas ${className}`.trim()}
      style={height !== undefined ? { height } : undefined}
      role="img"
      aria-label={
        options.settings.mode === 'bars'
          ? `Corrida de barras com ${options.items.length} itens selecionados.`
          : `Trajetória das músicas no ranking Top ${options.settings.top}. ${options.items.length} itens selecionados.`
      }
    />
  );
}
