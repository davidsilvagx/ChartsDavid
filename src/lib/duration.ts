export type DurationMode = 'weeks' | 'equivalent';
/** Display only. Rankings and thresholds always keep their exact original units. */
export function formatDays(days: number, mode: DurationMode = 'equivalent'): string {
  const safe = Number.isFinite(days) ? Math.max(0, days) : 0;
  const unit = mode === 'weeks' ? 7 : safe >= 365 ? 365 : safe >= 28 ? 30.4375 : safe >= 7 ? 7 : 1;
  const label = mode === 'weeks' ? ['semana', 'semanas'] : unit === 365 ? ['ano', 'anos'] : unit === 30.4375 ? ['mês', 'meses'] : unit === 7 ? ['semana', 'semanas'] : ['dia', 'dias'];
  const value = Math.max(unit === 30.4375 ? 1 : 0, Math.round(safe / unit * 10) / 10);
  return `${unit >= 28 ? '≈ ' : ''}${value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} ${label[value === 1 ? 0 : 1]}`;
}
export const formatWeeks = (weeks: number, mode: DurationMode = 'weeks') => formatDays(weeks * 7, mode);
