import { useEffect, useState } from "react";
import { loadMetadata } from "./metadata";
import type { Mission } from "./missions";
import type { CachedWeek, Settings, SourceFilter } from "./types";

// The collection and global celebration share one worker job, even for a large archive.
const jobs = new WeakMap<CachedWeek[], Map<string, Promise<Mission[]>>>();
let catalogRevision = 0;
const catalogChanged = () => {
  catalogRevision++;
};
if (typeof window !== "undefined")
  window.addEventListener("lastchart-catalog-changed", catalogChanged);
if (import.meta.hot)
  import.meta.hot.dispose(() =>
    window.removeEventListener("lastchart-catalog-changed", catalogChanged),
  );
function calculate(
  cached: CachedWeek[],
  settings: Settings,
  source: SourceFilter,
  key: string,
) {
  let entries = jobs.get(cached);
  if (!entries) {
    entries = new Map();
    jobs.set(cached, entries);
  }
  if (entries.has(key)) return entries.get(key)!;
  const promise = loadMetadata("tracks")
    .then(
      (meta) =>
        new Promise<Mission[]>((resolve, reject) => {
          const worker = new Worker(
            new URL("../workers/missions.worker.ts", import.meta.url),
            { type: "module" },
          );
          worker.onmessage = ({ data }) => {
            worker.terminate();
            if (data.error) reject(new Error(data.error));
            else resolve(data.missions);
          };
          worker.onerror = () => {
            worker.terminate();
            reject(
              new Error(
                "Não foi possível calcular a coleção. Tente reabrir suas conquistas.",
              ),
            );
          };
          worker.postMessage({ cached, settings, source, meta });
        }),
    )
    .catch((error) => {
      entries!.delete(key);
      throw error;
    });
  // Only keep the newest configuration for this archive; completed results are reclaimed with it.
  entries.clear();
  entries.set(key, promise);
  return promise;
}
export function useMissionCollection(
  cached: CachedWeek[],
  settings: Settings,
  source: SourceFilter,
) {
  const [revision, setRevision] = useState(catalogRevision);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => setRevision(catalogRevision), 750);
    };
    window.addEventListener("lastchart-catalog-changed", refresh);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("lastchart-catalog-changed", refresh);
    };
  }, []);
  const key = JSON.stringify([
    settings.user,
    settings.startDate,
    settings.timezone,
    settings.deduplicate,
    settings.aliases,
    source,
    revision,
  ]);
  const [result, setResult] = useState<{
    cached: CachedWeek[];
    key: string;
    missions: Mission[];
    error: string;
  } | null>(null);
  useEffect(() => {
    let active = true;
    void calculate(cached, settings, source, key)
      .then((missions) => {
        if (active) setResult({ cached, key, missions, error: "" });
      })
      .catch((e) => {
        if (active)
          setResult({
            cached,
            key,
            missions: [],
            error: e instanceof Error ? e.message : "Coleção indisponível.",
          });
      });
    return () => {
      active = false;
    };
  }, [cached, key]);
  const current = result?.cached === cached && result.key === key;
  return {
    missions: current ? result.missions : [],
    error: current ? result.error : "",
    loading: !current,
  };
}
