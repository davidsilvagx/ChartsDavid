import type { ChartWeek, StudioSettings } from './types';

/** Missing downloads are never treated as absence. Dates and original chart records are immutable. */
export function gapTimeline(charts: ChartWeek[], ids: string[], mode: StudioSettings['gapMode'] = 'keep'): ChartWeek[] {
  if (mode === 'keep' || mode === 'accelerate') return charts;
  const selected = new Set(ids), out: ChartWeek[] = [];
  const empty = (w: ChartWeek) => w.status === 'loaded' && !w.entries.some(e => selected.has(e.id));
  for (let i = 0; i < charts.length; i++) {
    if (!empty(charts[i])) { out.push(charts[i]); continue; }
    let end = i; while (end + 1 < charts.length && empty(charts[end + 1])) end++;
    // One OUT frame prevents connecting lines across a disappearance.
    out.push(charts[i]);
    if (mode === 'compact' && end > i) out.push(charts[end]);
    i = end;
  }
  return out;
}
export function playbackMap(charts: ChartWeek[], ids: string[], accelerate: boolean) {
  const selected = new Set(ids), stops = [0];
  const empty = (w: ChartWeek) => w.status === 'loaded' && !w.entries.some(e => selected.has(e.id));
  for (let i = 1; i < charts.length; i++) stops.push(stops[i - 1] + (accelerate && empty(charts[i - 1]) && empty(charts[i]) ? 0.125 : 1));
  const at = (time: number) => { if (stops.length < 2) return 0; let lo = 0, hi = stops.length - 1; const t = Math.max(0, Math.min(time, stops[hi])); while (lo + 1 < hi) { const mid = (lo + hi) >>> 1; if (stops[mid] <= t) lo = mid; else hi = mid; } return lo + (t - stops[lo]) / (stops[hi] - stops[lo]); };
  const timeAt = (position: number) => { const p = Math.max(0, Math.min(position, stops.length - 1)), i = Math.floor(p); return (stops[i] ?? 0) + (p - i) * ((stops[i + 1] ?? stops[i]) - stops[i]); };
  return { duration: stops.at(-1) ?? 0, at, advance: (position: number, delta: number) => at(timeAt(position) + delta) };
}
