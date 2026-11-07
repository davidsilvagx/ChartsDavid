import type { ChartEntry, ChartWeek } from './types';
type PackedEntry=Omit<ChartEntry,'run'>&{run:number};
export interface PackedCharts { weeks:Array<Omit<ChartWeek,'entries'>&{entries:PackedEntry[]}>; runs:Array<[string,ChartEntry['run']]> }
/** Excluding the getter avoids materializing an archive merely to omit it. */
export function entryWithoutRun(entry:ChartEntry):Omit<ChartEntry,'run'>{
 const result:Record<string,unknown>={};for(const key of Object.keys(entry))if(key!=='run')result[key]=entry[key as keyof ChartEntry];return result as Omit<ChartEntry,'run'>;
}
export function packCharts(weeks:ChartWeek[]):PackedCharts {
 const runs=new Map<string,ChartEntry['run']>();
 for(const week of weeks)for(const entry of week.entries){const old=runs.get(entry.id);if(!old||old.length<entry.run.length)runs.set(entry.id,entry.run);}
 return {runs:[...runs],weeks:weeks.map(week=>({...week,entries:week.entries.map(entry=>({...entryWithoutRun(entry),run:entry.run.length}))}))};
}
function decodeWeek(week:PackedCharts['weeks'][number],runs:Map<string,ChartEntry['run']>):ChartWeek {
 for(const packed of week.entries){const length=packed.run,master=runs.get(packed.id)??[];let cached:ChartEntry['run']|undefined;
  Object.defineProperty(packed,'run',{enumerable:true,configurable:true,get:()=>cached??=master.slice(0,length)});
 }
 return week as unknown as ChartWeek;
}
export function unpackCharts(packet:PackedCharts):ChartWeek[]{
 const runs=new Map(packet.runs);return packet.weeks.map(week=>decodeWeek(week,runs));
}
export async function unpackChartsProgressively(packet:PackedCharts):Promise<ChartWeek[]>{
 const runs=new Map(packet.runs),weeks:ChartWeek[]=[];let started=performance.now();
 for(const week of packet.weeks){weeks.push(decodeWeek(week,runs));if(performance.now()-started>8){await new Promise<void>(resolve=>setTimeout(resolve,0));started=performance.now();}}
 return weeks;
}
