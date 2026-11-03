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
  width,
  className = '',
}: {
  options: DrawOptions;
  canvasRef?: RefObject<HTMLCanvasElement | null>;
  handleRef?: Ref<ChartCanvasHandle>;
  height?: number | string;
  width?: number;
  className?: string;
}) {
  const internal = useRef<HTMLCanvasElement>(null);
  const ref = canvasRef ?? internal;
  const optionsRef = useRef(options);
  const visibleRef = useRef(true);
  const imagePeriodRef = useRef(-1);
  const paintCountRef = useRef(0);
  optionsRef.current = options;

  const paint = (pos = optionsRef.current.position) => {
    const canvas = ref.current;
    if (!canvas) return;
    if(document.hidden||!visibleRef.current)return;
    const width = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!width || !h) return;
    const mobile = window.matchMedia('(pointer: coarse)').matches || window.innerWidth <= 860;
    const dpr = Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2);
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
    if(import.meta.env.DEV)canvas.dataset.previewPaints=String(++paintCountRef.current);
    const period=Math.floor(pos);
    if(period!==imagePeriodRef.current){
      imagePeriodRef.current=period;
      const ids=new Set(optionsRef.current.items.map(i=>i.id));
      const active=optionsRef.current.charts[period]?.entries.filter(e=>ids.has(e.id)).slice(0,16)??[];
      if(active.length)void prepareImages(active).then(()=>{if(ref.current===canvas)paint();});
    }
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
    imagePeriodRef.current=-1;
    const render = () => {
      if (alive) paint();
    };
    const observer = new ResizeObserver(render);
    observer.observe(canvas);
    const visibility = new IntersectionObserver(entries => {
      visibleRef.current = entries[0]?.isIntersecting ?? true;
      if(visibleRef.current)render();
    });
    visibility.observe(canvas);
    const onVisible = () => {if(!document.hidden)render();};
    document.addEventListener('visibilitychange',onVisible);
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
      visibility.disconnect();
      document.removeEventListener('visibilitychange',onVisible);
    };
  }, [ref, options.items, height]);

  useEffect(() => {
    paint(options.position);
  }, [options]);

  return (
    <canvas
      ref={ref}
      className={`history-canvas ${className}`.trim()}
      style={{height,width}}
      role="img"
      aria-label={
        options.settings.mode === 'bars'
          ? `Corrida de barras com ${options.items.length} itens selecionados.`
          : `Trajetória das músicas no ranking Top ${options.settings.top}. ${options.items.length} itens selecionados.`
      }
    />
  );
}
