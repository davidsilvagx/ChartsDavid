import type { Mission } from "./missions";
export interface CollectionMemory {
  known: string[];
  unlocked: string[];
}
/** First visit and newly added catalogue entries establish a baseline, never a popup storm. */
export function detectUnlocks(
  missions: Mission[],
  previous: CollectionMemory | null,
) {
  const unlocked = missions.filter((m) => m.target > 0 && m.value >= m.target);
  const known = new Set(previous?.known ?? []),
    seen = new Set(previous?.unlocked ?? []);
  return {
    fresh: previous
      ? unlocked.filter((m) => known.has(m.id) && !seen.has(m.id))
      : [],
    memory: {
      known: missions.map((m) => m.id),
      unlocked: [...new Set([...seen, ...unlocked.map((m) => m.id)])],
    },
  };
}
