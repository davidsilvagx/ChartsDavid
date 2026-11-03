import type { ChartWeek, Week } from './types';

export const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

export function weeksInPeriod<T extends Week>(weeks: T[], year: string, month = 'all'): T[] {
  return weeks.filter(w => (year === 'all' || String(w.year) === year) &&
    (month === 'all' || w.id.slice(5, 7) === month));
}

export function summarizePeriod(weeks: Week[], charts: ChartWeek[]) {
  const byId = new Map(charts.map(w => [w.id, w]));
  const loaded = weeks.map(w => byId.get(w.id)).filter((w): w is ChartWeek => w?.status === 'loaded');
  const plays = loaded.reduce((sum, w) => sum + w.plays, 0);
  const missing = weeks.length - loaded.length;
  const state = !weeks.length ? 'unavailable' : !loaded.length ? 'missing' : missing ? 'partial' : plays === 0 ? 'empty' : 'ready';
  return { total: weeks.length, loaded: loaded.length, missing, plays, state };
}
