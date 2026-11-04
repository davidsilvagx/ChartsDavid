import { expect, it } from 'vitest';
import { buildSpotlight } from './spotlight';
import { buildCharts, getLibrary } from './charts';
import { makeWeeks } from './calendar';
import { defaults, type CachedWeek } from './types';

const settings={...defaults,startDate:'2026-08-07'},now=Date.parse('2026-10-02T12:00Z'),weeks=makeWeeks(settings,now);
const cache:CachedWeek[]=weeks.map((week,i)=>({key:week.id,week,cutoff:week.end,fetchedAt:1,duplicates:0,scrobbles:[...Array.from({length:i<4?2:i<8?4:0},(_,j)=>({timestamp:week.start+10+j,track:i<4?'Alpha':'Beta',artist:'Artist',album:'Album',image:''})),...(i===0?Array.from({length:20},(_,j)=>({timestamp:week.start+100+j,track:'Old favourite',artist:'Old Artist',album:'Old Album',image:''})):[])]}));
const charts=buildCharts(weeks,cache,'tracks'),library=getLibrary(cache,'tracks');
it('usa contagens reais e compara duas janelas completas, sem incluir o período atual',()=>{
  const data=buildSpotlight(charts,library,now);
  expect(data.totalPlays).toBe(44);expect(data.ranking[0].name).toBe('Old favourite');
  expect(data.comparison).toMatchObject({previous:28,current:16,delta:-12});
  expect(data.comparison?.percent).toBeCloseTo(-12/28*100);
  expect(data.awards.find(a=>a.id==='crown')?.nominees[0].name).toBe('Beta');
  expect(data.top5Share).toBe(100);
});
it('lacunas não viram zero nem são puladas para fabricar comparação',()=>{
  const missing=charts.map((c,i)=>i===3?{...c,status:'missing' as const,entries:[],playCounts:[],plays:0}:c);
  const data=buildSpotlight(missing,library,now);expect(data.missing).toBe(1);expect(data.comparison).toBeNull();
  expect(data.rediscover).toEqual([]);
});
it('inclui itens abaixo do Top 100 sem inventar posição oficial',()=>{
  const many=cache.slice(0,1).map(c=>({...c,scrobbles:Array.from({length:110},(_,i)=>({timestamp:c.week.start+100+i,track:`Track ${i}`,artist:'Artist',album:'Album',image:''}))}));
  const series=buildCharts([weeks[0]],many,'tracks');const data=buildSpotlight(series,getLibrary(many,'tracks'),now);
  expect(series[0].entries).toHaveLength(100);expect(data.ranking).toHaveLength(110);expect(data.totalPlays).toBe(110);
  expect(data.top5Share).toBeCloseTo(5/110*100);
});
it('empates são explícitos e dados vazios não ganham prêmios',()=>{
  const tied=cache.slice(0,1).map(c=>({...c,scrobbles:['A','B'].map((track,i)=>({timestamp:c.week.start+10+i,track,artist:'Artist',album:'Album',image:''}))}));
  const data=buildSpotlight(buildCharts([weeks[0]],tied,'tracks'),getLibrary(tied,'tracks'),now);
  expect(data.awards.find(a=>a.id==='plays')?.ties).toBe(2);
  expect(buildSpotlight([],[],now)).toMatchObject({totalPlays:0,ranking:[],awards:[],comparison:null,rediscover:[]});
});
it('redescoberta só usa ausência em oito períodos completos, com histórico anterior',()=>{
  const more=[...charts,{...charts.at(-1)!,id:'2026-10-09',start:charts.at(-1)!.end,end:charts.at(-1)!.end+604800,partial:false,status:'loaded' as const,entries:[],playCounts:[],plays:0}];
  const data=buildSpotlight(more,library,Date.parse('2026-10-17T12:00Z'));
  expect(data.rediscover.some(item=>item.name==='Old favourite')).toBe(true);
});
