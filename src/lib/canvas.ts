import { formatDateBR } from './calendar';
import { getChartIndex } from './chartIndex';
import { ResourceCache } from './resourceCache';
import type { ChartWeek, Item, Kind, StudioSettings } from './types';

export const palettes = {
  neon: ['#22dc6e', '#38bdf8', '#f5c451', '#f472b6', '#a78bfa', '#fb923c', '#2dd4bf', '#60a5fa'],
  garden: ['#4ade80', '#eab308', '#38bdf8', '#e879f9', '#818cf8', '#34d399', '#fb7185', '#a3e635'],
  sunset: ['#fb7185', '#fbbf24', '#c084fc', '#38bdf8', '#f97316', '#34d399', '#f43f5e', '#fde047'],
  aurora: ['#2dd4bf', '#60a5fa', '#c084fc', '#34d399', '#f472b6', '#facc15', '#818cf8', '#fb923c'],
};

const disposeImage=(image:CanvasImageSource)=>{if(typeof (image as ImageBitmap).close==='function')(image as ImageBitmap).close();else if(image instanceof HTMLImageElement)image.src='';};
const imageCache = new ResourceCache<CanvasImageSource>(48,disposeImage);
const pendingImages=new Map<string,Promise<CanvasImageSource|null>>();
let activeImages=0;
const imageQueue:Array<()=>void>=[];

export function cacheImageUrl(url: string): Promise<CanvasImageSource | null> {
  if (!url) return Promise.resolve(null);
  const hit = imageCache.get(url);
  if (hit) return Promise.resolve(hit);
  const pending=pendingImages.get(url);
  if(pending)return pending;
  const promise=new Promise<CanvasImageSource|null>(resolve=>{
  const load=()=>{
    activeImages++;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    let finished=false;
    const finish=(image:CanvasImageSource|null)=>{
      if(finished){if(image)disposeImage(image);return;}
      finished=true;clearTimeout(timeout);pendingImages.delete(url);activeImages--;img.onload=null;img.onerror=null;
      if(image)imageCache.set(url,image);else img.src='';
      resolve(image);imageQueue.shift()?.();
    };
    const timeout = setTimeout(() => finish(null), 6000);
    img.onload = async () => {
      try {
        if (typeof createImageBitmap === 'function') {
          const scale=Math.min(1,512/Math.max(img.naturalWidth,img.naturalHeight));
          const bmp = await createImageBitmap(img,{resizeWidth:Math.max(1,Math.round(img.naturalWidth*scale)),resizeHeight:Math.max(1,Math.round(img.naturalHeight*scale)),resizeQuality:'medium'});
          finish(bmp);
          return;
        }
      } catch {
        // Fallback to HTMLImageElement
      }
      finish(img);
    };
    img.onerror = () => {
      finish(null);
    };
    img.src = url;
  };
  if(activeImages<4)load();else imageQueue.push(load);
  });
  pendingImages.set(url,promise);
  return promise;
}

export async function prepareImages(items: Array<Pick<Item, 'image'>>) {
  const urls=[...new Set(items.map(item=>item.image).filter(Boolean))].slice(0,48);
  await Promise.all(urls.map(cacheImageUrl));
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
}

export interface DrawOptions {
  charts: ChartWeek[];
  items: Item[];
  settings: StudioSettings;
  position: number;
  dark?: boolean;
  title?: string;
  reduced?: boolean;
  username?: string;
  kind?: Kind;
}

const UI_FONT = `'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, system-ui, sans-serif`;

export function drawChart(ctx: CanvasRenderingContext2D, width: number, height: number, options: DrawOptions) {
  drawChartFrame(ctx, width, height, options);
  ctx.save();
  ctx.font = `400 ${width < 540 ? 6.5 : 8}px ${UI_FONT}`;
  ctx.textAlign = 'right';
  ctx.fillStyle = (options.dark ?? (options.settings.canvasTheme !== 'light'))
    ? 'rgba(255, 255, 255, 0.22)'
    : 'rgba(15, 23, 42, 0.25)';
  ctx.fillText('feito com ❤️ por william santos', width - (width < 540 ? 10 : 14), height - (width < 540 ? 4 : 5));
  ctx.restore();
}

function drawChartFrame(ctx: CanvasRenderingContext2D, width: number, height: number, options: DrawOptions) {
  const { charts, items, settings: s, title = s.mode === 'bars' ? 'CORRIDA DE REPRODUÇÕES' : 'CHART HISTORY', reduced = false } = options;
  const dark = options.dark ?? (s.canvasTheme !== 'light');
  const position = Math.max(0, Math.min(options.position, Math.max(0, charts.length - 1)));
  const current = Math.floor(position);
  const fraction = position - current;

  const bg = dark ? '#090d14' : '#f4f7fb';
  const surface = dark ? 'rgba(20, 28, 42, 0.88)' : 'rgba(255, 255, 255, 0.92)';
  const fg = dark ? '#f1f5f9' : '#0f172a';
  const muted = dark ? '#8b9bb4' : '#64748b';
  const accent = dark ? '#22dc6e' : '#059669';

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  // Subtle architectural ambient glow
  const glow = ctx.createRadialGradient(width * 0.22, 0, 10, width * 0.22, 0, Math.max(width, height) * 0.72);
  glow.addColorStop(0, dark ? 'rgba(34, 220, 110, 0.10)' : 'rgba(16, 185, 129, 0.08)');
  glow.addColorStop(0.55, dark ? 'rgba(56, 189, 248, 0.04)' : 'rgba(56, 189, 248, 0.03)');
  glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);

  const compact = width < 540;
  const padX = compact ? 18 : 34;

  // Header (collision-safe across 280px..1920px & 9:16 vertical canvases)
  const ultraCompact = width < 380;
  let badgeLeftEdge = width - padX;
  if (charts[current]) {
    const badgeText = ultraCompact
      ? `${charts[current].unit === 'day' ? 'D.' : charts[current].unit === 'month' ? 'M.' : charts[current].unit === 'year' ? 'A.' : 'S.'}${charts[current].number} · ${charts[current].label}`
      : compact
        ? `${charts[current].unit === 'day' ? 'DIA' : charts[current].unit === 'month' ? 'MÊS' : charts[current].unit === 'year' ? 'ANO' : 'SEM.'} ${charts[current].number} · ${charts[current].label}`
        : `${charts[current].unit === 'day' ? 'DIA' : charts[current].unit === 'month' ? 'MÊS' : charts[current].unit === 'year' ? 'ANO' : 'SEM.'} ${charts[current].number}  ·  ${charts[current].label}`;
    ctx.font = `600 ${ultraCompact ? 8.5 : compact ? 9.5 : 11}px ${UI_FONT}`;
    const tw = ctx.measureText(badgeText).width;
    const bw = tw + (compact ? 14 : 22);
    const bh = compact ? 21 : 26;
    const bx = width - padX - bw;
    const by = compact ? 14 : 20;
    badgeLeftEdge = bx;
    roundRectPath(ctx, bx, by, bw, bh, bh / 2);
    ctx.fillStyle = dark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)';
    ctx.fill();
    ctx.strokeStyle = dark ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.10)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = fg;
    ctx.textAlign = 'center';
    ctx.fillText(badgeText, bx + bw / 2, by + bh * 0.66);
    ctx.textAlign = 'left';
  }

  ctx.fillStyle = accent;
  ctx.font = `700 ${ultraCompact ? 8.5 : compact ? 9.5 : 11}px ${UI_FONT}`;
  const eyebrowText = ultraCompact ? 'LASTCHART PRO' : 'LASTCHART  ·  STUDIO PRO';
  ctx.fillText(truncateCanvasText(ctx, eyebrowText, Math.max(60, badgeLeftEdge - padX - 8)), padX, compact ? 24 : 30);

  ctx.fillStyle = fg;
  ctx.font = `800 ${ultraCompact ? 14.5 : compact ? 16 : 22}px ${UI_FONT}`;
  ctx.fillText(truncateCanvasText(ctx, title, width - padX * 2), padX, compact ? 46 : 56);

  if (!charts.length || !items.length) {
    roundRectPath(ctx, width / 2 - Math.min(210, width * 0.42), height / 2 - 44, Math.min(420, width * 0.84), 88, 18);
    ctx.fillStyle = dark ? 'rgba(255,255,255,0.03)' : 'rgba(15,23,42,0.03)';
    ctx.fill();
    ctx.strokeStyle = dark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillStyle = fg;
    ctx.font = `700 ${compact ? 13 : 15}px ${UI_FONT}`;
    ctx.fillText('Pronto para dar movimento ao seu chart', width / 2, height / 2 - 6, width - 56);
    ctx.fillStyle = muted;
    ctx.font = `500 ${compact ? 11 : 12}px ${UI_FONT}`;
    ctx.fillText('Sincronize seu Last.fm ou escolha competidores abaixo.', width / 2, height / 2 + 18, width - 56);
    ctx.textAlign = 'left';
    return;
  }

  if (s.mode === 'bars') {
    drawBarRace(ctx, width, height, { charts, items, s, current, fraction, dark, fg, muted, accent, compact, padX, reduced, username: options.username, kind: options.kind });
    return;
  }

  const left = compact ? 34 : 54;
  const right = compact ? Math.min(138, Math.round(width * 0.38)) : Math.min(248, Math.round(width * 0.28));
  const top = compact ? 66 : 80;
  const bottom = height - (compact ? 38 : 46);
  const edge = width - right;
  const chartHeight = Math.max(80, bottom - top);
  const y = (rank: number) => top + ((rank - 1) / Math.max(1, s.top - 1)) * chartHeight;

  // Top 10 highlight zone
  const top10Bottom = y(Math.min(10, s.top));
  roundRectPath(ctx, left, top - 8, width - left - (compact ? 12 : 20), Math.max(16, top10Bottom - top + 16), 10);
  ctx.fillStyle = dark ? 'rgba(34, 220, 110, 0.055)' : 'rgba(16, 185, 129, 0.065)';
  ctx.fill();

  const paletteColors = palettes[s.palette] ?? palettes.neon;
  const gridRanks = [1, 10, 20, 40, 60, 80, 100].filter(r => r <= s.top);
  for (const rank of gridRanks) {
    const gy = y(rank);
    const isTop1 = rank === 1;
    const isTop10 = rank === 10;
    ctx.strokeStyle = isTop1
      ? dark ? 'rgba(245, 196, 81, 0.42)' : 'rgba(217, 119, 6, 0.35)'
      : isTop10
        ? dark ? 'rgba(34, 220, 110, 0.36)' : 'rgba(5, 150, 105, 0.32)'
        : dark ? 'rgba(255, 255, 255, 0.07)' : 'rgba(15, 23, 42, 0.08)';
    ctx.lineWidth = isTop1 || isTop10 ? 1.25 : 1;
    ctx.setLineDash(isTop10 ? [5, 5] : []);
    ctx.beginPath();
    ctx.moveTo(left, gy);
    ctx.lineTo(width - (compact ? 12 : 20), gy);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = isTop1 ? (dark ? '#f5c451' : '#b45309') : isTop10 ? accent : muted;
    ctx.font = `${isTop1 || isTop10 ? 700 : 600} ${compact ? 9.5 : 10.5}px ${UI_FONT}`;
    ctx.textAlign = 'right';
    ctx.fillText(`#${rank}`, left - 8, gy + 3.5);
    ctx.textAlign = 'left';
  }

  const spacing = s.spacing * (compact ? 0.54 : 1);
  const visible = Math.max(1, (edge - left) / spacing);
  const origin = Math.max(0, position - visible);
  const x = (i: number) => left + (i - origin) * spacing;
  const endpoint = Math.min(edge, x(position));
  const first = Math.max(0, Math.floor(origin));
  const { rankMaps, hiatusMaps } = getChartIndex(charts, items);

  const cardRows: Array<{ item: Item; color: string; rank: number; cy: number; prev?: number; iy: number; hiatus?: number }> = [];
  const enableGlow = !reduced && items.length <= 18;

  items.forEach((item, index) => {
    const color = s.colors[item.id] ?? paletteColors[index % paletteColors.length];
    ctx.save();
    ctx.beginPath();
    ctx.rect(left - 2, top - 10, width - left + 2, chartHeight + 20);
    ctx.clip();

    ctx.strokeStyle = color;
    ctx.lineWidth = s.lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (enableGlow) {
      ctx.shadowColor = color;
      ctx.shadowBlur = 8;
    }

    for (let i = first; i <= current; i++) {
      const rank = rankMaps[i]?.get(item.id);
      const next = rankMaps[i + 1]?.get(item.id);
      if (!rank || rank > s.top || charts[i].status !== 'loaded') continue;
      const px = x(i);
      const py = y(rank);
      if (next && next <= s.top && charts[i + 1]?.status === 'loaded' && (i < current || fraction > 0)) {
        const t = i < current ? 1 : fraction;
        const ease = t * t * (3 - 2 * t);
        const ny = py + (y(next) - py) * ease;
        ctx.beginPath();
        ctx.moveTo(px, py);
        if (t === 1) {
          ctx.bezierCurveTo(px + spacing / 2, py, px + spacing / 2, y(next), px + spacing, y(next));
        } else {
          const steps = 18;
          for (let n = 1; n <= steps; n++) {
            const f = (t * n) / steps;
            ctx.lineTo(px + spacing * f, py + (y(next) - py) * (f * f * (3 - 2 * f)));
          }
        }
        ctx.stroke();
        if (i === current) {
          // Discrete rank switch without intermediate roulette numbers
          const shownRank = fraction >= 0.85 ? next : rank;
          const prevRank = fraction >= 0.85 ? rank : rankMaps[current - 1]?.get(item.id);
          const hiatus = fraction >= 0.85 ? hiatusMaps[current + 1]?.get(item.id) : hiatusMaps[current]?.get(item.id);
          cardRows.push({ item, color, rank: shownRank, cy: ny, iy: ny, prev: prevRank, hiatus });
        }
      } else if (i === current) {
        const hiatus = hiatusMaps[current]?.get(item.id);
        cardRows.push({ item, color, rank, cy: py, iy: py, prev: rankMaps[current - 1]?.get(item.id), hiatus });
      }
    }
    ctx.restore();
  });

  // Honest visual indicator when a week is empty on Last.fm, unsynced, or all selected items had 0 plays / OUT
  const curWeek = charts[current];
  if (curWeek && cardRows.length === 0) {
    const statusLabel =
      curWeek.status === 'missing'
        ? compact
          ? 'Período não sincronizado (sem posições fictícias)'
          : 'PERÍODO NÃO SINCRONIZADO · NENHUMA POSIÇÃO FICTÍCIA GERADA'
        : curWeek.plays === 0
          ? compact
            ? 'Last.fm vazio neste período (0 plays)'
            : 'PERÍODO VAZIO NO LAST.FM · 0 REPRODUÇÕES REGISTRADAS'
          : compact
            ? 'Competidores fora do chart neste período (OUT)'
            : `COMPETIDORES FORA DO TOP ${s.top} NESTE PERÍODO (0 PLAYS / OUT)`;
    ctx.save();
    ctx.font = `600 ${compact ? 9.5 : 11}px ${UI_FONT}`;
    const msgW = Math.min(width - padX * 2, ctx.measureText(statusLabel).width + 26);
    const msgX = left + Math.max(0, (width - left - padX - msgW) / 2);
    const msgY = top + chartHeight / 2 - 15;
    roundRectPath(ctx, msgX, msgY, msgW, 30, 15);
    ctx.fillStyle = dark ? 'rgba(15, 23, 42, 0.82)' : 'rgba(255, 255, 255, 0.88)';
    ctx.fill();
    ctx.strokeStyle = dark ? 'rgba(56, 189, 248, 0.35)' : 'rgba(14, 165, 233, 0.35)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = dark ? '#bae6fd' : '#0369a1';
    ctx.textAlign = 'center';
    ctx.fillText(truncateCanvasText(ctx, statusLabel, msgW - 16), msgX + msgW / 2, msgY + 19);
    ctx.textAlign = 'left';
    ctx.restore();
  }

  const rowHeight = compact ? 32 : Math.max(34, s.fontSize * 2.55);
  const maxCards = Math.max(1, Math.floor(chartHeight / rowHeight));
  const sorted = cardRows.sort((a, b) => a.iy - b.iy || a.rank - b.rank);
  const cards = sorted.length > maxCards ? sorted.slice(0, maxCards) : sorted;
  const gap = Math.min(rowHeight, chartHeight / Math.max(1, cards.length));

  cards.forEach((card, i) => {
    card.cy = Math.max(card.cy, top + i * gap, i > 0 ? cards[i - 1].cy + gap : top);
  });
  for (let i = cards.length - 1; i >= 0; i--) {
    cards[i].cy = Math.min(cards[i].cy, bottom - (cards.length - 1 - i) * gap);
  }

  for (const row of sorted) {
    ctx.fillStyle = row.color;
    ctx.beginPath();
    ctx.arc(endpoint, row.iy, compact ? 3.5 : 4.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = bg;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  for (const row of cards) {
    const { item, color, rank, iy, cy, prev, hiatus } = row;
    const radius = Math.min(s.coverSize / 2, compact ? 11.5 : 18);
    const cardX = Math.min(width - right + (compact ? 10 : 16), endpoint + (compact ? 10 : 16));

    // Top 1 gold crown + confetti & Top 10 neon pulse + stars
    const burstProgress =
      fraction >= 0.85
        ? (fraction - 0.85) / 0.87
        : fraction > 0.005 && fraction < 0.72
          ? (0.15 + fraction) / 0.87
          : -1;
    if (
      s.effects &&
      !reduced &&
      burstProgress >= 0 &&
      ((rank === 1 && prev !== 1) || (rank >= 2 && rank <= 10 && (prev === undefined || prev > 10)))
    ) {
      const p = Math.min(1, burstProgress);
      const gold = rank === 1;
      ctx.save();
      ctx.strokeStyle = gold ? '#f5c451' : '#38bdf8';
      ctx.globalAlpha = Math.max(0, 1 - p);
      ctx.lineWidth = gold ? 2.4 : 2;
      ctx.beginPath();
      ctx.arc(endpoint, iy, radius + 6 + p * 26, 0, Math.PI * 2);
      ctx.stroke();

      const count = gold ? 14 : 7;
      for (let k = 0; k < count; k++) {
        const angle = (k * Math.PI * 2) / count + p * 0.5;
        const dist = 12 + p * (gold ? 54 : 42);
        const px = endpoint + Math.cos(angle) * dist;
        const py = iy + Math.sin(angle) * dist;
        ctx.fillStyle = gold ? (k % 2 === 0 ? '#f5c451' : '#fde68a') : (k % 2 === 0 ? '#22dc6e' : '#38bdf8');
        if (gold) {
          ctx.save();
          ctx.translate(px, py);
          ctx.rotate(angle);
          ctx.fillRect(-2, -3.5, 4, 7);
          ctx.restore();
        } else {
          ctx.beginPath();
          ctx.moveTo(px - 3.5, py);
          ctx.lineTo(px, py - 5);
          ctx.lineTo(px + 3.5, py);
          ctx.lineTo(px, py + 5);
          ctx.closePath();
          ctx.fill();
        }
      }
      ctx.restore();
    }

    // Connector line
    ctx.strokeStyle = color + '88';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(endpoint, iy);
    ctx.lineTo(cardX, cy);
    ctx.stroke();

    // Card pill background
    const maxPillW = Math.max(92, right - (compact ? 18 : 28));
    const pillW = Math.min(maxPillW, Math.max(64, width - cardX - (compact ? 8 : 14)));
    const pillH = Math.max(radius * 2 + 4, compact ? 26 : 32);
    roundRectPath(ctx, cardX - 2, cy - pillH / 2, pillW, pillH, pillH / 2);
    ctx.fillStyle = surface;
    ctx.fill();
    ctx.strokeStyle = rank === 1 ? '#f5c45188' : color + '55';
    ctx.lineWidth = rank === 1 ? 1.4 : 1;
    ctx.stroke();

    // Circular cover at left of card
    ctx.save();
    ctx.beginPath();
    ctx.arc(cardX + radius, cy, radius, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = color;
    ctx.fillRect(cardX, cy - radius, radius * 2, radius * 2);
    const image = imageCache.get(item.image);
    if (image) {
      ctx.drawImage(image, cardX, cy - radius, radius * 2, radius * 2);
    } else {
      ctx.fillStyle = '#090d14';
      ctx.beginPath();
      ctx.arc(cardX + radius, cy, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.16)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cardX + radius, cy, radius * 0.68, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(cardX + radius, cy, radius * 0.38, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#090d14';
      ctx.beginPath();
      ctx.arc(cardX + radius, cy, Math.max(1.4, radius * 0.12), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Cover border ring
    ctx.strokeStyle = rank === 1 ? '#f5c451' : color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cardX + radius, cy, radius, 0, Math.PI * 2);
    ctx.stroke();

    const tx = cardX + radius * 2 + (compact ? 6 : 8);
    const textLimit = Math.max(28, cardX + pillW - 2 - tx - (compact ? 8 : 12));
    const titleSize = Math.min(s.fontSize, compact ? 10 : 14);
    ctx.fillStyle = rank === 1 ? (dark ? '#fde68a' : '#92400e') : fg;
    ctx.font = `700 ${titleSize}px ${UI_FONT}`;
    const rawTitle = `#${rank} ${item.name}`;
    ctx.fillText(truncateCanvasText(ctx, rawTitle, textLimit), tx, cy - (compact ? 1 : 1.5));

    ctx.fillStyle = hiatus ? '#38bdf8' : muted;
    ctx.font = `${hiatus ? 600 : 500} ${compact ? 8.5 : Math.max(9.5, titleSize - 2)}px ${UI_FONT}`;
    const subText = hiatus ? `${item.artist} · RE (${hiatus}s fora)` : item.artist;
    ctx.fillText(truncateCanvasText(ctx, subText, textLimit), tx, cy + (compact ? 8.5 : 10.5));

    if (rank === 1 && s.effects) {
      drawCrown(ctx, cardX + radius, cy - radius - 3, compact ? 10 : 13);
    }
  }

  // Timeline axis dates
  ctx.fillStyle = muted;
  ctx.font = `600 ${compact ? 9 : 10}px ${UI_FONT}`;
  const labelStep = Math.max(1, Math.ceil((compact ? 62 : 76) / spacing));
  for (let i = first; i <= current; i++) {
    const px = x(i);
    if (px < left || px > edge) continue;
    if (i % labelStep === 0) {
      ctx.fillText(formatDateBR(charts[i].id), px - 14, bottom + (compact ? 16 : 20));
    }
  }

  if (sorted.length > cards.length) {
    ctx.fillStyle = muted;
    ctx.font = `500 ${compact ? 9 : 10}px ${UI_FONT}`;
    ctx.fillText(`+${sorted.length - cards.length} faixas ativas no período`, left, height - 10);
  }
}

function drawBarRace(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  params: {
    charts: ChartWeek[];
    items: Item[];
    s: StudioSettings;
    current: number;
    fraction: number;
    dark: boolean;
    fg: string;
    muted: string;
    accent: string;
    compact: boolean;
    padX: number;
    reduced: boolean;
    username?: string;
    kind?: Kind;
  },
) {
  const { charts, items, s, current, fraction, dark, fg, muted, compact, padX, username, kind } = params;
  const { playMaps, cumPlayMaps } = getChartIndex(charts, items, s.barMetric !== 'weekly');
  const maps = s.barMetric === 'weekly' ? playMaps : cumPlayMaps;
  const paletteColors = palettes[s.palette] ?? palettes.neon;
  const ease = fraction * fraction * (3 - 2 * fraction);

  const curMap = maps[current] ?? new Map<string, number>();
  const nextMap = maps[current + 1] ?? curMap;

  const scored = items.map((item, idx) => {
    const v0 = curMap.get(item.id) ?? 0;
    const v1 = nextMap.get(item.id) ?? v0;
    const value = v0 + (v1 - v0) * ease;
    return {
      item,
      v0,
      v1,
      value,
      color: s.colors[item.id] ?? paletteColors[idx % paletteColors.length],
    };
  });

  const rank0Order = [...scored].sort((a, b) => b.v0 - a.v0 || a.item.name.localeCompare(b.item.name) || a.item.id.localeCompare(b.item.id));
  const rank1Order = [...scored].sort((a, b) => b.v1 - a.v1 || a.item.name.localeCompare(b.item.name) || a.item.id.localeCompare(b.item.id));
  const r0 = new Map(rank0Order.map((x, i) => [x.item.id, i]));
  const r1 = new Map(rank1Order.map((x, i) => [x.item.id, i]));

  const maxBars = Math.min(s.barCount || 10, items.length);
  const active = scored
    .filter(x => x.v0 > 0 || x.v1 > 0)
    .map(x => {
      const p0 = x.v0 > 0 && (r0.get(x.item.id) ?? maxBars) < maxBars ? r0.get(x.item.id)! : maxBars + 0.8;
      const p1 = x.v1 > 0 && (r1.get(x.item.id) ?? maxBars) < maxBars ? r1.get(x.item.id)! : maxBars + 0.8;
      return { ...x, visualSlot: p0 + (p1 - p0) * ease, liveRank: (r1.get(x.item.id) ?? 0) + 1 };
    })
    .filter(x => x.visualSlot < maxBars + 0.35 && x.value > 0.01)
    .sort((a, b) => b.visualSlot - a.visualSlot);

  const top = compact ? 64 : 78;
  const bottom = height - (compact ? 26 : 34);
  const areaH = Math.max(100, bottom - top);
  const slotH = areaH / Math.max(1, maxBars);
  const barH = Math.max(3, Math.min(38, slotH * 0.74));
  const rowScale = Math.min(1, slotH / 18);
  const maxVal = Math.max(1, ...active.map(a => a.value));
  const rankColW = compact ? 28 : 36;
  const barStartX = padX + rankColW;
  const barMaxW = Math.max(80, width - barStartX - (compact ? 64 : 96));

  // Watermark year and user charts branding in bottom-right (classic YouTube chart race aesthetic)
  if (charts[current]) {
    ctx.save();
    ctx.textAlign = 'right';
    const yearStr = String(charts[current].year || '');
    const brandName = (username && username.toLowerCase() !== 'iknowjauregui' ? username : 'David').trim();
    const metricText = s.barMetric === 'weekly' ? 'PLAYS NO PERÍODO' : 'PLAYS ACUMULADOS';

    // Giant watermark number in the background behind bars
    ctx.fillStyle = dark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)';
    ctx.font = `800 ${compact ? 46 : 72}px ${UI_FONT}`;
    ctx.fillText(yearStr, width - padX, bottom - (compact ? 14 : 20));

    // Refined branding subtitle in foreground
    const idKind = items[0]?.id?.startsWith('["artists"')
      ? 'artists'
      : items[0]?.id?.startsWith('["albums"')
        ? 'albums'
        : 'tracks';
    const effectiveKind = kind ?? idKind;
    const kindLabel = effectiveKind === 'artists' ? 'ARTISTS' : effectiveKind === 'albums' ? 'ALBUMS' : 'SONGS';
    ctx.fillStyle = dark ? 'rgba(255,255,255,0.22)' : 'rgba(15,23,42,0.24)';
    ctx.font = `700 ${compact ? 9 : 11}px ${UI_FONT}`;
    const watermarkSub = `TOP ${maxBars} ${kindLabel} · ${brandName.toUpperCase()} CHARTS`;
    ctx.fillText(watermarkSub, width - padX, bottom);
    ctx.restore();
  }

  if (charts[current] && active.length === 0) {
    const emptyMsg =
      charts[current].status === 'missing'
        ? 'Período não sincronizado — nenhuma posição inventada'
        : charts[current].plays === 0
          ? 'Last.fm sem scrobbles neste período (0 plays)'
          : 'Competidores sem reproduções registradas até esta semana (0 plays)';
    ctx.save();
    ctx.font = `600 ${compact ? 10 : 11.5}px ${UI_FONT}`;
    ctx.fillStyle = dark ? '#bae6fd' : '#0369a1';
    ctx.textAlign = 'center';
    ctx.fillText(truncateCanvasText(ctx, emptyMsg, width - padX * 2), width / 2, top + areaH / 2);
    ctx.textAlign = 'left';
    ctx.restore();
  }

  for (const row of active) {
    const cy = top + row.visualSlot * slotH + slotH / 2;
    if (cy - barH / 2 > bottom + 8) continue;
    const opacity = row.visualSlot > maxBars - 0.65 ? Math.max(0, 1 - (row.visualSlot - (maxBars - 0.65))) : 1;
    ctx.save();
    ctx.globalAlpha = opacity;

    const dispRank = Math.round(row.visualSlot) + 1;
    if (dispRank <= maxBars) {
      ctx.fillStyle = dispRank === 1 ? '#f5c451' : muted;
      ctx.font = `700 ${(compact ? 10 : 12) * rowScale}px ${UI_FONT}`;
      ctx.textAlign = 'right';
      ctx.fillText(`#${dispRank}`, barStartX - 8, cy + 3.5 * rowScale);
      ctx.textAlign = 'left';
    }

    const minBarW = Math.max(barH * 2.2, compact ? 52 : 72);
    const w = Math.min(barMaxW, Math.max(minBarW, (row.value / maxVal) * barMaxW));
    const grad = ctx.createLinearGradient(barStartX, 0, barStartX + w, 0);
    grad.addColorStop(0, row.color + (dark ? '44' : '33'));
    grad.addColorStop(1, row.color);

    roundRectPath(ctx, barStartX, cy - barH / 2, w, barH, barH / 2);
    ctx.fillStyle = grad;
    ctx.fill();

    // Circular cover at tip of bar
    const radius = Math.max(1, (barH - 2) / 2);
    const cx = barStartX + w - radius - 2;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = dark ? '#0f172a' : '#ffffff';
    ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
    const img = imageCache.get(row.item.image);
    if (img) ctx.drawImage(img, cx - radius, cy - radius, radius * 2, radius * 2);
    ctx.restore();

    if (dispRank === 1 && s.effects) {
      drawCrown(ctx, cx, cy - radius - 2, (compact ? 9 : 12) * rowScale);
    }

    // Label inside bar (always neatly centered inside the bubble)
    const labelLimit = Math.max(12, w - radius * 2 - (compact ? 16 : 20));
    const labelText = `${row.item.name} · ${row.item.artist}`;
    ctx.font = `700 ${(compact ? 9.5 : 11.5) * rowScale}px ${UI_FONT}`;
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 4;
    ctx.fillText(truncateCanvasText(ctx, labelText, labelLimit), barStartX + (compact ? 8 : 10), cy + 3.5 * rowScale);
    ctx.shadowBlur = 0;

    // Play count right of bar (aligned at same vertical baseline)
    ctx.fillStyle = fg;
    ctx.font = `700 ${(compact ? 10 : 12) * rowScale}px ${UI_FONT}`;
    const countStr = String(Math.round(row.value));
    const countX = barStartX + w + 8;
    ctx.fillText(countStr, countX, cy + 3.5 * rowScale);

    ctx.restore();
  }
}

function drawCrown(ctx: CanvasRenderingContext2D, cx: number, bottomY: number, size: number) {
  const half = size / 2;
  const h = size * 0.68;
  ctx.save();
  ctx.fillStyle = '#f5c451';
  ctx.strokeStyle = '#92400e';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - half, bottomY);
  ctx.lineTo(cx - half - 1, bottomY - h * 0.85);
  ctx.lineTo(cx - half * 0.38, bottomY - h * 0.42);
  ctx.lineTo(cx, bottomY - h);
  ctx.lineTo(cx + half * 0.38, bottomY - h * 0.42);
  ctx.lineTo(cx + half + 1, bottomY - h * 0.85);
  ctx.lineTo(cx + half, bottomY);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function truncateCanvasText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let low = 0;
  let high = text.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (ctx.measureText(text.slice(0, mid) + '…').width <= maxWidth) low = mid;
    else high = mid - 1;
  }
  return low > 0 ? text.slice(0, low).trimEnd() + '…' : '';
}

export async function renderWeeklyShareCard(week: ChartWeek, kind: Kind, username: string): Promise<Blob | null> {
  const top10 = week.entries.slice(0, 10);
  await prepareImages(top10);
  const canvas = document.createElement('canvas');
  const W = 1080;
  const H = 1350;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Obsidian + Sonic Emerald background
  const bgGrad = ctx.createLinearGradient(0, 0, W, H);
  bgGrad.addColorStop(0, '#070b12');
  bgGrad.addColorStop(0.5, '#0d1522');
  bgGrad.addColorStop(1, '#080c14');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  const glow = ctx.createRadialGradient(W * 0.78, 210, 20, W * 0.78, 210, 560);
  glow.addColorStop(0, 'rgba(34, 220, 110, 0.24)');
  glow.addColorStop(0.55, 'rgba(56, 189, 248, 0.08)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  const artwork = top10[0]?.image ? imageCache.get(top10[0].image) : undefined;
  if (artwork) {
    ctx.save();
    ctx.globalAlpha = 0.38;
    ctx.filter = 'blur(28px)';
    ctx.drawImage(artwork, -50, -180, W + 100, W + 100);
    ctx.restore();
    const fade = ctx.createLinearGradient(0, 0, 0, 850);
    fade.addColorStop(0, 'rgba(7,11,18,0.25)');
    fade.addColorStop(1, '#080c14');
    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, W, H);
  }

  // Decorative concentric rings
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 1.5;
  for (const r of [160, 250, 340]) {
    ctx.beginPath();
    ctx.arc(W - 190, 230, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  const kindTitle = kind === 'tracks' ? 'TOP 10 MÚSICAS' : kind === 'albums' ? 'TOP 10 ÁLBUNS' : 'TOP 10 ARTISTAS';
  ctx.fillStyle = '#22dc6e';
  ctx.font = `700 22px ${UI_FONT}`;
  ctx.fillText(`LASTCHART STUDIO PRO  ·  @${username}`, 68, 78);

  ctx.fillStyle = '#f8fafc';
  ctx.font = `800 54px ${UI_FONT}`;
  ctx.fillText(kindTitle, 68, 146);

  ctx.fillStyle = '#94a3b8';
  ctx.font = `600 24px ${UI_FONT}`;
  ctx.fillText(`Semana ${week.number}  ·  ${week.label}  ·  ${week.plays} plays`, 68, 188);

  // #1 Hero Card
  const leader = top10[0];
  if (leader) {
    roundRectPath(ctx, 64, 224, W - 128, 224, 32);
    ctx.fillStyle = 'rgba(34, 220, 110, 0.10)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(245, 196, 81, 0.45)';
    ctx.lineWidth = 2;
    ctx.stroke();

    const coverSize = 172;
    ctx.save();
    roundRectPath(ctx, 90, 250, coverSize, coverSize, 22);
    ctx.clip();
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(90, 250, coverSize, coverSize);
    const heroImg = imageCache.get(leader.image);
    if (heroImg) ctx.drawImage(heroImg, 90, 250, coverSize, coverSize);
    ctx.restore();

    ctx.fillStyle = '#f5c451';
    ctx.font = `800 22px ${UI_FONT}`;
    ctx.fillText('#1 DA SEMANA', 292, 290);

    ctx.fillStyle = '#ffffff';
    ctx.font = `800 38px ${UI_FONT}`;
    ctx.fillText(truncateCanvasText(ctx, leader.name, W - 380), 292, 344);

    ctx.fillStyle = '#cbd5e1';
    ctx.font = `600 25px ${UI_FONT}`;
    ctx.fillText(truncateCanvasText(ctx, leader.artist, W - 380), 292, 384);

    ctx.fillStyle = '#22dc6e';
    ctx.font = `700 21px ${UI_FONT}`;
    ctx.fillText(`${leader.plays} reproduções  ·  Pico #${leader.peak}  ·  ${leader.weeks} sem.`, 292, 422);
  }

  // Rows #2 - #10
  const startY = 478;
  const rowH = 84;
  top10.slice(1).forEach((entry, idx) => {
    const ry = startY + idx * (rowH + 8);
    roundRectPath(ctx, 64, ry, W - 128, rowH, 20);
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = '#f1f5f9';
    ctx.font = `800 26px ${UI_FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(String(entry.rank).padStart(2, '0'), 112, ry + 51);
    ctx.textAlign = 'left';

    // Variation badge
    const ch = entry.change;
    const chLabel = ch === 'NEW' ? 'NEW' : ch === 'RE' ? (entry.hiatusWeeks ? `RE·${entry.hiatusWeeks}s` : 'RE') : ch === '?' || ch === 0 ? '—' : ch > 0 ? `+${ch}` : `${ch}`;
    ctx.fillStyle = ch === 'NEW' || (typeof ch === 'number' && ch > 0) ? '#22dc6e' : ch === 'RE' ? '#38bdf8' : typeof ch === 'number' && ch < 0 ? '#fb7185' : '#64748b';
    ctx.font = `700 18px ${UI_FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(chLabel, 174, ry + 49);
    ctx.textAlign = 'left';

    // Mini cover
    ctx.save();
    roundRectPath(ctx, 214, ry + 13, 58, 58, 12);
    ctx.clip();
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(214, ry + 13, 58, 58);
    const img = imageCache.get(entry.image);
    if (img) ctx.drawImage(img, 214, ry + 13, 58, 58);
    ctx.restore();

    ctx.fillStyle = '#f8fafc';
    ctx.font = `700 24px ${UI_FONT}`;
    ctx.fillText(truncateCanvasText(ctx, entry.name, 510), 292, ry + 39);

    ctx.fillStyle = '#94a3b8';
    ctx.font = `500 19px ${UI_FONT}`;
    ctx.fillText(truncateCanvasText(ctx, entry.artist, 510), 292, ry + 66);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#f8fafc';
    ctx.font = `800 23px ${UI_FONT}`;
    ctx.fillText(`${entry.plays} plays`, W - 92, ry + 39);
    ctx.fillStyle = '#64748b';
    ctx.font = `600 17px ${UI_FONT}`;
    ctx.fillText(`PK #${entry.peak} · ${entry.weeks}s`, W - 92, ry + 65);
    ctx.textAlign = 'left';
  });

  ctx.fillStyle = '#64748b';
  ctx.font = `600 19px ${UI_FONT}`;
  ctx.fillText('Sexta a quinta · Feito com ❤️ por William Santos', 68, H - 36);

  return new Promise(resolve => canvas.toBlob(b => resolve(b), 'image/png'));
}
