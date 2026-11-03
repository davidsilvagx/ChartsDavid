import { describe, expect, it } from 'vitest';
import { makeWeeks } from './calendar';
import { buildCharts, getLibrary } from './charts';
import { getChartIndex } from './chartIndex';
import { automaticBarItems, selectionInRange, studioDateRange } from './studio';
import { defaults, type CachedWeek } from './types';

const settings={...defaults,startDate:'2026-08-07'};
const weeks=makeWeeks(settings,Date.parse('2026-08-20T12:00Z'));
const cache:CachedWeek[]=weeks.map((w,wi)=>({key:w.id,week:w,cutoff:w.end,fetchedAt:1,duplicates:0,scrobbles:Array.from({length:102},(_,i)=>Array.from({length:i===101?2:3},(_,j)=>({track:i===101?'Steady':`Week ${wi} song ${i}`,artist:'Artist',album:'Album',image:'',timestamp:w.start+100+i*3+j}))).flat()}));
const charts=buildCharts(weeks,cache,'tracks');
const library=getLibrary(cache,'tracks');

describe('Top automático do estúdio',()=>{
  it.each([5,10,15,20,30])('Top %i considera todo o ranking, sem ficar nos cinco selecionados',count=>{
    const items=automaticBarItems([charts[0]],library,count,'weekly');
    expect(items).toHaveLength(count);
    expect(new Set(items.map(i=>i.id)).size).toBe(count);
  });
  it('inclui novos competidores e preserva plays de fora do Top 100',()=>{
    const steady=library.find(i=>i.name==='Steady')!;
    expect(charts.every(c=>!c.entries.some(e=>e.id===steady.id))).toBe(true);
    const pool=automaticBarItems(charts,library,1,'cumulative');
    expect(pool.some(i=>i.id===steady.id)).toBe(true);
    const index=getChartIndex(charts,pool,true);
    expect(index.cumPlayMaps.at(-1)?.get(steady.id)).toBe(4);
    expect(index.rankMaps.at(-1)?.has(steady.id)).toBe(false);
    expect(automaticBarItems(charts,library,20,'weekly').length).toBeGreaterThan(20);
  });
  it('não inventa músicas quando há menos itens, zero plays ou download pendente',()=>{
    expect(automaticBarItems([],library,20,'weekly')).toEqual([]);
    expect(automaticBarItems([{...charts[0],status:'missing'}],library,20,'weekly')).toEqual([]);
    expect(automaticBarItems([{...charts[0],playCounts:[],entries:[]}],library,20,'cumulative')).toEqual([]);
  });
  it('o heap mantém os mesmos líderes que a ordenação completa em cada período',()=>{
    const items=Array.from({length:70},(_,i)=>({id:String(i),name:`Track ${i%13}`}));
    const periods=Array.from({length:15},(_,w)=>({status:'loaded' as const,entries:[],playCounts:items.filter((_,i)=>(i+w)%3!==0).map((item,i)=>[item.id,1+(i*17+w*11)%27] as [string,number])}));
    for(const count of [5,10,15,20,30])for(const metric of ['weekly','cumulative'] as const){
      const totals=new Map<string,number>(),expected=new Set<string>();
      for(const p of periods){if(metric==='weekly')totals.clear();for(const [id,plays] of p.playCounts)totals.set(id,(totals.get(id)??0)+plays);[...totals].sort((a,b)=>b[1]-a[1]||items[Number(a[0])].name.localeCompare(items[Number(b[0])].name)||a[0].localeCompare(b[0])).slice(0,count).forEach(([id])=>expected.add(id));}
      expect(new Set(automaticBarItems(periods,items,count,metric).map(i=>i.id))).toEqual(expected);
    }
  });
  it('trocar de época substitui competidores ausentes por itens reais desse período',()=>{
    const old=charts[0].entries[0].id;
    expect(selectionInRange([charts[1]],[old])).toEqual(charts[1].entries.slice(0,5).map(e=>e.id));
    const current=charts[1].entries[1].id;
    expect(selectionInRange([charts[1]],[old,current])).toEqual([current]);
  });
});
describe('Intervalos intuitivos do vídeo',()=>{
  it('preenche mês, ano e semana de sexta a quinta usando datas reais',()=>{
    expect(studioDateRange(defaults,'2026-11-03','month','2026','08')).toEqual({from:'2026-08-01',to:'2026-08-31'});
    expect(studioDateRange(defaults,'2026-11-03','year','2026')).toEqual({from:'2026-01-01',to:'2026-11-03'});
    expect(studioDateRange(defaults,'2026-11-03','week','2026','08','2026-08-19')).toEqual({from:'2026-08-14',to:'2026-08-20'});
    expect(studioDateRange(defaults,'2026-11-03','year','2016')).toEqual({from:'2016-06-24',to:'2016-12-31'});
  });
  it('limita semana atual e rejeita períodos futuros ou anteriores ao calendário',()=>{
    expect(studioDateRange(defaults,'2026-11-03','week','2026','11','2026-11-03')).toEqual({from:'2026-10-30',to:'2026-11-03'});
    expect(()=>studioDateRange(defaults,'2026-11-03','month','2026','12')).toThrow('ainda não começou');
    expect(()=>studioDateRange(defaults,'2026-11-03','week','2010','01','2010-01-01')).toThrow('fora do calendário');
  });
});
