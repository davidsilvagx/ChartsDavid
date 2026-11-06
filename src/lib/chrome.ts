import { cacheImageUrl } from './canvas';

/**
 * Cor do topo do app (área da câmera/relógio/bateria). Calculada da capa em destaque e aplicada
 * ao mesmo tempo no meta theme-color e na faixa superior do layout (--chrome), para as duas ficarem iguais.
 */
export type RGB = [number, number, number];
const BG: Record<'dark' | 'light', RGB> = { dark: [7, 10, 17], light: [242, 245, 250] };
const ACCENT: Record<'dark' | 'light', RGB> = { dark: [34, 220, 110], light: [5, 150, 105] };
const BACKDROP: RGB = [4, 8, 15];
export const mixRGB = (a: RGB, b: RGB, t: number): RGB => [0, 1, 2].map(i => Math.round(a[i] + (b[i] - a[i]) * t)) as RGB;
export const toHex = (c: RGB) => `#${c.map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('')}`;
const parseHex = (hex: string): RGB => { const v = hex.replace('#', ''); return [0, 2, 4].map(i => parseInt(v.slice(i, i + 2), 16)) as RGB; };

/** Média ponderada que favorece pixels com cor (ignora quase branco/preto), como o fundo de capas do Apple Music. */
export function dominantColor(data: Uint8ClampedArray): RGB | null {
  let r = 0, g = 0, b = 0, w = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const pr = data[i], pg = data[i + 1], pb = data[i + 2];
    const max = Math.max(pr, pg, pb), min = Math.min(pr, pg, pb), light = (max + min) / 510, sat = max ? (max - min) / max : 0;
    const weight = 0.15 + sat * (1 - Math.abs(light - 0.5) * 1.6);
    r += pr * weight; g += pg * weight; b += pb * weight; w += weight;
  }
  return w ? [r / w, g / w, b / w].map(Math.round) as RGB : null;
}

const colorCache = new Map<string, Promise<RGB | null>>();
export function artworkColor(url: string): Promise<RGB | null> {
  if (!url) return Promise.resolve(null);
  let hit = colorCache.get(url);
  if (!hit) {
    hit = cacheImageUrl(url).then(image => {
      if (!image) return null;
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 12;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return null;
      ctx.drawImage(image, 0, 0, 12, 12);
      try { return dominantColor(ctx.getImageData(0, 0, 12, 12).data); } catch { return null; }
    }).catch(() => null);
    colorCache.set(url, hit);
    if (colorCache.size > 64) colorCache.delete(colorCache.keys().next().value!);
  }
  return hit;
}

export function chromeFor(theme: 'dark' | 'light', art: RGB | null) {
  return toHex(art ? mixRGB(BG[theme], art, theme === 'dark' ? 0.2 : 0.13) : mixRGB(BG[theme], ACCENT[theme], theme === 'dark' ? 0.06 : 0.05));
}

let base = toHex(BG.dark);
const overlays: Array<(base: string) => string> = [];
function apply() {
  if (typeof document === 'undefined') return;
  const isLight = document.documentElement.dataset.theme === 'light';
  const top = overlays.length ? overlays[overlays.length - 1](base) : base;
  document.documentElement.style.setProperty('--chrome', base);
  document.documentElement.style.setProperty('--system-chrome', top);
  document.documentElement.style.colorScheme = isLight ? 'light' : 'dark';
  document.querySelectorAll('meta[name="theme-color"]').forEach(meta => meta.setAttribute('content', top));
  const appleBar = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
  if (appleBar) {
    appleBar.setAttribute('content', isLight ? 'default' : 'black-translucent');
  }
}
export function setChromeBase(color: string) { base = color; apply(); }
/** Janela aberta: o topo mostra o fundo escurecido do diálogo (::backdrop rgba(4,8,15,.72)). */
export const backdropOver = (color: string) => toHex(mixRGB(parseHex(color), BACKDROP, 0.72));
export function pushChrome(compute: (base: string) => string = backdropOver) {
  overlays.push(compute); apply();
  return () => { const i = overlays.lastIndexOf(compute); if (i >= 0) overlays.splice(i, 1); apply(); };
}
