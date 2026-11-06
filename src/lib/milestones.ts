import { Temporal } from '@js-temporal/polyfill';
import { getCertification } from './charts';
import type { ChartWeek } from './types';

export type MilestoneType = 'number-one' | 'certification' | 'anniversary' | 'record';
export const milestoneLabels: Record<MilestoneType, string> = { 'number-one': 'Novo #1', certification: 'Certificações', anniversary: 'Aniversários de #1', record: 'Recordes semanais' };
export interface NotificationPrefs { enabled: boolean; types: Record<MilestoneType, boolean>; frequency: 'each' | 'daily'; quietStart: string; quietEnd: string }
export const defaultNotificationPrefs: NotificationPrefs = { enabled: false, types: { 'number-one': true, certification: true, anniversary: true, record: true }, frequency: 'daily', quietStart: '22:00', quietEnd: '08:00' };
export interface Milestone { id: string; type: MilestoneType; title: string; body: string; weekId: string }

const hhmm = /^([01]\d|2[0-3]):([0-5]\d)$/;
export function sanitizePrefs(raw: unknown): NotificationPrefs {
  const value = (raw && typeof raw === 'object' ? raw : {}) as Partial<NotificationPrefs>;
  const types = { ...defaultNotificationPrefs.types };
  for (const key of Object.keys(types) as MilestoneType[]) if (typeof value.types?.[key] === 'boolean') types[key] = value.types[key];
  return {
    enabled: value.enabled === true, types, frequency: value.frequency === 'each' ? 'each' : 'daily',
    quietStart: typeof value.quietStart === 'string' && hhmm.test(value.quietStart) ? value.quietStart : defaultNotificationPrefs.quietStart,
    quietEnd: typeof value.quietEnd === 'string' && hhmm.test(value.quietEnd) ? value.quietEnd : defaultNotificationPrefs.quietEnd,
  };
}

/** Horário silencioso no fuso do calendário; aceita janelas que atravessam a meia-noite (22:00–08:00). */
export function inQuietHours(prefs: Pick<NotificationPrefs, 'quietStart' | 'quietEnd'>, now: number, timeZone: string) {
  const time = Temporal.Instant.fromEpochMilliseconds(now).toZonedDateTimeISO(timeZone);
  const minutes = time.hour * 60 + time.minute;
  const toMin = (v: string) => Number(v.slice(0, 2)) * 60 + Number(v.slice(3));
  const start = toMin(prefs.quietStart), end = toMin(prefs.quietEnd);
  if (start === end) return false;
  return start < end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
}

/** Marcos derivados só das semanas baixadas; semanas ausentes não geram eventos. */
export function detectMilestones(charts: ChartWeek[], now: number, timeZone: string): Milestone[] {
  const loaded = charts.filter(chart => chart.status === 'loaded' && chart.end <= now / 1000);
  const latest = loaded.at(-1);
  if (!latest) return [];
  const events: Milestone[] = [];
  const leader = latest.entries.find(entry => entry.rank === 1);
  if (leader) {
    const previous = loaded.at(-2);
    const wasLeader = previous?.entries.find(entry => entry.rank === 1)?.id === leader.id;
    if (!wasLeader) events.push({ id: `n1:${latest.id}:${leader.id}`, type: 'number-one', weekId: latest.id, title: `Novo #1: ${leader.name}`, body: `${leader.artist} lidera a semana ${latest.number} com ${leader.plays.toLocaleString('pt-BR')} reproduções.` });
  }
  for (const entry of latest.entries.slice(0, 100)) {
    const before = getCertification(entry.totalPlays - entry.plays), after = getCertification(entry.totalPlays);
    if (after.tier !== 'none' && after.threshold !== before.threshold && entry.totalPlays - entry.plays < after.threshold) {
      events.push({ id: `cert:${entry.id}:${after.tier}`, type: 'certification', weekId: latest.id, title: `${entry.name} virou ${after.label}`, body: `${entry.totalPlays.toLocaleString('pt-BR')} reproduções no histórico baixado.` });
    }
  }
  const history = loaded.slice(0, -1);
  if (history.length >= 4 && !latest.provisional && latest.plays > Math.max(...history.map(chart => chart.plays))) {
    events.push({ id: `rec:${latest.id}`, type: 'record', weekId: latest.id, title: 'Recorde semanal de reproduções', body: `${latest.plays.toLocaleString('pt-BR')} reproduções na semana ${latest.number}, acima de todas as ${history.length} semanas anteriores baixadas.` });
  }
  const today = Temporal.Instant.fromEpochMilliseconds(now).toZonedDateTimeISO(timeZone).toPlainDate();
  const firstNumberOne = new Map<string, { week: ChartWeek; name: string; artist: string }>();
  for (const chart of loaded) { const top = chart.entries.find(entry => entry.rank === 1); if (top && !firstNumberOne.has(top.id)) firstNumberOne.set(top.id, { week: chart, name: top.name, artist: top.artist }); }
  for (const [id, first] of firstNumberOne) {
    const date = Temporal.PlainDate.from(first.week.id);
    const years = today.year - date.year;
    if (years >= 1 && date.month === today.month && date.day === today.day) {
      events.push({ id: `anv:${id}:${today.year}`, type: 'anniversary', weekId: first.week.id, title: `${years} ${years === 1 ? 'ano' : 'anos'} do primeiro #1 de ${first.name}`, body: `${first.artist} chegou ao topo na semana iniciada em ${date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })}.` });
    }
  }
  return events;
}

/** Filtra por preferências e deduplica pelo id já entregue. “Diário” agrupa em um resumo por dia. */
export function planDelivery(events: Milestone[], prefs: NotificationPrefs, delivered: Set<string>, lastDailyDay: string | null, now: number, timeZone: string) {
  if (!prefs.enabled) return { send: [] as Array<{ id: string; title: string; body: string }>, mark: [] as string[], day: lastDailyDay, quiet: false };
  const fresh = events.filter(event => prefs.types[event.type] && !delivered.has(event.id));
  const day = Temporal.Instant.fromEpochMilliseconds(now).toZonedDateTimeISO(timeZone).toPlainDate().toString();
  if (!fresh.length) return { send: [], mark: [], day: lastDailyDay, quiet: false };
  if (inQuietHours(prefs, now, timeZone)) return { send: [], mark: [], day: lastDailyDay, quiet: true };
  if (prefs.frequency === 'each') return { send: fresh.slice(0, 3).map(({ id, title, body }) => ({ id, title, body })), mark: fresh.map(event => event.id), day: lastDailyDay, quiet: false };
  if (lastDailyDay === day) return { send: [], mark: [], day, quiet: false };
  const title = fresh.length === 1 ? fresh[0].title : `${fresh.length} marcos novos no seu LastChart`;
  const body = fresh.length === 1 ? fresh[0].body : fresh.slice(0, 3).map(event => event.title).join(' · ');
  return { send: [{ id: `daily:${day}`, title, body }], mark: fresh.map(event => event.id), day, quiet: false };
}
