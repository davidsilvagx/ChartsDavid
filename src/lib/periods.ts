import { Temporal } from '@js-temporal/polyfill';
import { buildCharts, getLibrary } from './charts';
import { formatDateBR, makeWeeks } from './calendar';
import type { CachedWeek, Kind, Settings, SourceFilter, Week } from './types';

export type PeriodUnit = 'day' | 'week' | 'month' | 'year';
export const periodLabels: Record<PeriodUnit, string> = { day: 'Dia', week: 'Semana', month: 'Mês', year: 'Ano' };

export function buildPeriodCharts(settings: Settings, cached: CachedWeek[], kind: Kind, source: SourceFilter, unit: PeriodUnit, from: string, to: string, now = Date.now()) {
  const first = Temporal.PlainDate.from(from);
  const last = Temporal.PlainDate.from(to);
  const today = Temporal.Instant.fromEpochMilliseconds(now).toZonedDateTimeISO(settings.timezone).toPlainDate();
  if (Temporal.PlainDate.compare(first, last) > 0) throw new Error('A data inicial deve vir antes da data final.');
  if (Temporal.PlainDate.compare(first, Temporal.PlainDate.from(settings.startDate)) < 0) throw new Error('Esse intervalo começa antes do seu calendário. Altere o início da contagem em Ajustes para incluir anos anteriores.');
  if (Temporal.PlainDate.compare(last, today) > 0) throw new Error('Escolha uma data final até hoje. Não há reproduções futuras.');
  if (unit === 'day' && first.until(last).days >= 366) throw new Error('Para charts diários, escolha até 366 dias por vez. Você pode consultar qualquer ano; para animar todos os anos juntos, use semanas, meses ou anos.');
  const epoch = (date: Temporal.PlainDate) => Number(date.toZonedDateTime(settings.timezone).epochMilliseconds) / 1000;
  const rangeStart = epoch(first);
  const rangeEnd = Math.min(epoch(last.add({ days: 1 })), Math.floor(now / 1000));
  if (rangeEnd <= rangeStart) throw new Error('Este dia acabou de começar. Aguarde as primeiras reproduções antes de gerar seu chart.');
  const calendarWeeks = makeWeeks(settings, now);
  const byId = new Map(cached.map(w => [w.week.id, w]));
  const periods: Week[] = [];
  let date = unit === 'year' ? first.with({month:1,day:1}) : unit === 'month' ? first.with({day:1}) : first;
  const steps = unit === 'week' ? calendarWeeks.filter(w => w.end > rangeStart && w.start < rangeEnd) : null;
  while (steps ? periods.length < steps.length : Temporal.PlainDate.compare(date, last) <= 0) {
    const index = periods.length;
    const next = unit === 'year' ? date.add({years:1}) : unit === 'month' ? date.add({months:1}) : date.add({days:1});
    const rawStart = steps ? steps[index].start : epoch(date);
    const rawEnd = steps ? steps[index].end : epoch(next);
    const start = Math.max(rawStart, rangeStart);
    const end = Math.min(rawEnd, rangeEnd);
    const startDate = Temporal.Instant.fromEpochMilliseconds(start * 1000).toZonedDateTimeISO(settings.timezone).toPlainDate();
    const endDate = Temporal.Instant.fromEpochMilliseconds((end - 1) * 1000).toZonedDateTimeISO(settings.timezone).toPlainDate();
    periods.push({id:steps ? steps[index].id : date.toString(),number:steps ? steps[index].number : index+1,start,end,year:startDate.year,unit,
      label:unit === 'day' ? formatDateBR(startDate.toString()) : `${formatDateBR(startDate.toString())} — ${formatDateBR(endDate.toString())}`,
      partial:start > rawStart || end < rawEnd});
    date = next;
  }
  const periodCache: CachedWeek[] = [];
  for (const period of periods) {
    const needed = calendarWeeks.filter(w => w.start < period.end && w.end > period.start);
    if (!needed.length || needed.some(w => !byId.has(w.id) || byId.get(w.id)!.cutoff <= period.start || (!w.partial && byId.get(w.id)!.cutoff < Math.min(w.end, period.end)))) continue;
    period.partial ||= needed.some(w => byId.get(w.id)!.cutoff < Math.min(w.end, period.end));
    const scrobbles = needed.flatMap(w => byId.get(w.id)!.scrobbles.filter(s => s.timestamp >= period.start && s.timestamp < period.end));
    periodCache.push({key:period.id,week:period,scrobbles,cutoff:period.end,fetchedAt:now,duplicates:0});
  }
  return { charts:buildCharts(periods, periodCache, kind, settings.deduplicate, settings.aliases, source),
    library:getLibrary(periodCache, kind, settings.deduplicate, settings.aliases, source), unit };
}
