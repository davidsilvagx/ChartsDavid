import { Temporal } from '@js-temporal/polyfill';
import type { Settings, Week } from './types';
export function validateCalendar(start: string, timezone: string): void {
  const date = Temporal.PlainDate.from(start);
  if (date.dayOfWeek !== 5) throw new Error('O início da contagem deve ser uma sexta-feira.');
  date.toZonedDateTime(timezone);
  if (Temporal.PlainDate.compare(date, Temporal.Now.plainDateISO(timezone)) > 0) throw new Error('A data inicial não pode estar no futuro.');
  if (date.year < 2002) throw new Error('Escolha uma data a partir de 2002.');
}
export function makeWeeks(settings: Pick<Settings, 'startDate' | 'timezone'>, now = Date.now()): Week[] {
  validateCalendar(settings.startDate, settings.timezone);
  const today = Temporal.Instant.fromEpochMilliseconds(now).toZonedDateTimeISO(settings.timezone).toPlainDate();
  let date = Temporal.PlainDate.from(settings.startDate);
  const weeks: Week[] = [];
  while (Temporal.PlainDate.compare(date, today) <= 0) {
    const next = date.add({ days: 7 });
    const start = Number(date.toZonedDateTime(settings.timezone).epochMilliseconds) / 1000;
    const end = Number(next.toZonedDateTime(settings.timezone).epochMilliseconds) / 1000;
    const last = next.subtract({ days: 1 });
    const fmt = (d: Temporal.PlainDate) => `${String(d.day).padStart(2, '0')}/${String(d.month).padStart(2, '0')}`;
    weeks.push({ id: date.toString(), number: weeks.length + 1, start, end, label: `${fmt(date)} — ${fmt(last)}`, year: date.year, partial: end * 1000 > now });
    date = next;
  }
  return weeks;
}
export const namespace = (s: Pick<Settings, 'user' | 'startDate' | 'timezone'>) => JSON.stringify([s.user.trim().toLowerCase(), s.startDate, s.timezone]);
export const weekKey = (s: Pick<Settings, 'user' | 'startDate' | 'timezone'>, id: string) => `${namespace(s)}:${id}`;
