import { Temporal } from '@js-temporal/polyfill';
import type { Settings, Week } from './types';
export function formatDateBR(iso: string): string {
  const date = Temporal.PlainDate.from(iso);
  return `${String(date.day).padStart(2, '0')}/${String(date.month).padStart(2, '0')}/${String(date.year).slice(-2)}`;
}
export function parseDateBR(value: string): string {
  const match = /^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/.exec(value.trim());
  if (!match) throw new Error('Informe a data no formato dd/mm/aa.');
  const [, day, month, year] = match;
  return Temporal.PlainDate.from(`${year.length === 2 ? `20${year}` : year}-${month}-${day}`).toString();
}
export function formatDateTimeBR(milliseconds: number, timeZone: string): string {
  const date = Temporal.Instant.fromEpochMilliseconds(milliseconds).toZonedDateTimeISO(timeZone);
  return `${formatDateBR(date.toPlainDate().toString())} ${String(date.hour).padStart(2, '0')}:${String(date.minute).padStart(2, '0')}`;
}
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
    weeks.push({ id: date.toString(), number: weeks.length + 1, start, end, label: `${formatDateBR(date.toString())} — ${formatDateBR(last.toString())}`, year: date.year, partial: end * 1000 > now });
    date = next;
  }
  return weeks;
}
export const namespace = (s: Pick<Settings, 'user' | 'startDate' | 'timezone'>) => JSON.stringify([s.user.trim().toLowerCase(), s.startDate, s.timezone]);
export const weekKey = (s: Pick<Settings, 'user' | 'startDate' | 'timezone'>, id: string) => `${namespace(s)}:${id}`;
