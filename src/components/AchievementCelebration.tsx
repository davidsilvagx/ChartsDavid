import { useEffect, useState } from "react";
import { Trophy, X } from "lucide-react";
import { useMissionCollection } from "../lib/useMissionCollection";
import {
  detectUnlocks,
  type CollectionMemory,
} from "../lib/achievementUnlocks";
import type { Mission } from "../lib/missions";
import type { CachedWeek, Settings, SourceFilter } from "../lib/types";
import { MissionSeal } from "./MissionSeal";

export function AchievementCelebration({
  cached,
  settings,
  source,
  onOpen,
}: {
  cached: CachedWeek[];
  settings: Settings;
  source: SourceFilter;
  onOpen: () => void;
}) {
  const [queue, setQueue] = useState<Mission[]>([]),
    [expanded, setExpanded] = useState(false);
  const scope = JSON.stringify([
    settings.user.toLowerCase(),
    settings.startDate,
    settings.timezone,
    source,
  ]);
  const { missions, loading } = useMissionCollection(cached, settings, source);
  useEffect(() => {
    setQueue([]);
  }, [scope]);
  useEffect(() => {
    if (
      loading ||
      !missions.length ||
      !cached.some((w) => w.week.end <= Date.now() / 1000)
    )
      return;
    const key = `lastchart-achievements:v2:${scope}`;
    let previous: CollectionMemory | null = null;
    try {
      const p = JSON.parse(localStorage.getItem(key) ?? "null");
      if (Array.isArray(p?.known) && Array.isArray(p?.unlocked)) previous = p;
    } catch {
      /* First collection. */
    }
    const { fresh, memory } = detectUnlocks(missions, previous);
    try {
      localStorage.setItem(key, JSON.stringify(memory));
    } catch {
      /* Optional storage. */
    }
    if (fresh.length)
      setQueue((q) => [
        ...q,
        ...fresh.filter((m) => !q.some((n) => n.id === m.id)),
      ]);
  }, [missions, loading, scope, cached]);
  const current = queue[0];
  useEffect(() => setExpanded(false), [current?.id]);
  useEffect(() => {
    if (!current || expanded) return;
    const timer = setTimeout(() => setQueue((q) => q.slice(1)), 8500);
    return () => clearTimeout(timer);
  }, [current?.id, expanded]);
  if (!current) return null;
  return (
    <aside
      key={current.id}
      className={`achievement-celebration ${expanded ? "expanded" : ""}`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      onFocus={() => setExpanded(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null))
          setExpanded(false);
      }}
    >
      <MissionSeal mission={current} compact />
      <div className="achievement-celebration-copy">
        <small>
          <Trophy size={13} /> CONQUISTA DESBLOQUEADA · +10
        </small>
        <strong>{current.name}</strong>
        <span>
          {queue.length > 1 ? `Mais ${queue.length - 1} na fila · ` : ""}Essa
          era é sua ✦
        </span>
        <button
          type="button"
          className="text-button"
          onClick={() => {
            setQueue([]);
            onOpen();
          }}
        >
          Ver minha coleção
        </button>
      </div>
      <button
        className="icon-button"
        aria-label="Dispensar conquista"
        onClick={() => setQueue((q) => q.slice(1))}
      >
        <X size={16} />
      </button>
    </aside>
  );
}
