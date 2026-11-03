import type { ChartWeek, Item } from './types';
interface ChartIndex {
  rankMaps:Array<Map<string,number>>;playMaps:Array<Map<string,number>>;
  cumPlayMaps:Array<Map<string,number>>;hiatusMaps:Array<Map<string,number>>;
}
const indexes=new WeakMap<ChartWeek[],{items:Item[];cumulative:boolean;index:ChartIndex}>();

// Index only competitors that are actually being drawn. Line charts never
// allocate cumulative snapshots for the entire listening library.
export function getChartIndex(charts:ChartWeek[],items:Item[],cumulative=false):ChartIndex {
  const cached=indexes.get(charts);
  if(cached?.items===items&&cached.cumulative===cumulative)return cached.index;
  const ids=new Set(items.map(i=>i.id));
  const running=new Map<string,number>();
  const index:ChartIndex={rankMaps:[],playMaps:[],cumPlayMaps:[],hiatusMaps:[]};
  for(const week of charts){
    const ranks=new Map<string,number>(),plays=new Map<string,number>(),hiatus=new Map<string,number>();
    if(week.status==='loaded')for(const entry of week.entries){
      if(!ids.has(entry.id))continue;
      ranks.set(entry.id,entry.rank);
      if(entry.hiatusWeeks&&entry.hiatusWeeks>0)hiatus.set(entry.id,entry.hiatusWeeks);
    }
    if(week.status==='loaded')for(const [id,count] of week.playCounts ?? week.entries.map(e=>[e.id,e.plays] as const)){
      if(!ids.has(id))continue;
      plays.set(id,count);
      if(cumulative)running.set(id,(running.get(id)??0)+count);
    }
    index.rankMaps.push(ranks);index.playMaps.push(plays);index.hiatusMaps.push(hiatus);
    if(cumulative)index.cumPlayMaps.push(new Map(running));
  }
  indexes.set(charts,{items,cumulative,index});
  return index;
}

export function fitStudioCanvas(width:number,height:number,aspect:number){
  if(!Number.isFinite(width)||!Number.isFinite(height)||!Number.isFinite(aspect)||width<=0||height<=0||aspect<=0)return {width:0,height:0};
  const w=Math.min(width,height*aspect);
  return {width:Math.floor(w),height:Math.floor(w/aspect)};
}
