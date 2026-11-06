import type { CachedWeek, Week } from './types';

/** Reconcile stored partial flags with today's calendar: a saved open week may now be closed. */
export function closedCache(calendar: Week[], cached: CachedWeek[], now = Date.now()): CachedWeek[] {
  const closed = new Map(calendar.filter(w => w.end <= now / 1000).map(w => [w.id, { ...w, partial: false }]));
  return cached.flatMap(c => {
    const week = closed.get(c.week.id);
    // A draft saved before Friday is not a final result merely because the clock rolled over.
    return week && c.cutoff >= week.end ? [{ ...c, week }] : [];
  });
}

export const isClosed = (week: Pick<Week, 'end'>, now = Date.now()) => week.end <= now / 1000;
