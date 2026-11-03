import { buildPeriodCharts, type PeriodUnit } from '../lib/periods';
import type { CachedWeek, Kind, Settings, SourceFilter } from '../lib/types';
self.onmessage = ({data}: MessageEvent<{settings:Settings;cached:CachedWeek[];kind:Kind;source:SourceFilter;unit:PeriodUnit;from:string;to:string}>) => {
  try { self.postMessage(buildPeriodCharts(data.settings,data.cached,data.kind,data.source,data.unit,data.from,data.to)); }
  catch (e) { self.postMessage({error:e instanceof Error ? e.message : 'Não foi possível calcular o período.'}); }
};
