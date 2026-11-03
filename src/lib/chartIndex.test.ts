import { expect, it } from 'vitest';
import { buildCharts } from './charts';
import { makeWeeks } from './calendar';
import { fitStudioCanvas, getChartIndex } from './chartIndex';
import { defaults, type CachedWeek } from './types';

it('encaixa o vídeo inteiro na área restante, sem ultrapassar controles ou margens',()=>{
  for(const [width,height,aspect] of [[806,170,16/9],[336,620,16/9],[806,260,16/9],[336,620,9/16],[300,200,1]]){
    const size=fitStudioCanvas(width,height,aspect);
    expect(size.width).toBeLessThanOrEqual(width);expect(size.height).toBeLessThanOrEqual(height);
    expect(Math.abs(size.width/size.height-aspect)).toBeLessThan(.02);
  }
  expect(fitStudioCanvas(0,100,16/9)).toEqual({width:0,height:0});
});
it('indexa apenas competidores selecionados e não aloca acumulados para linhas',()=>{
  const weeks=makeWeeks(defaults,Date.parse('2016-07-10T12:00Z'));
  const cached:CachedWeek[]=weeks.map(w=>({key:w.id,week:w,fetchedAt:1,cutoff:w.end,duplicates:0,scrobbles:Array.from({length:100},(_,i)=>({timestamp:w.start+100+i,track:`Track ${i}`,artist:'Artist',album:'Album',image:''}))}));
  const charts=buildCharts(weeks,cached,'tracks');
  const items=[charts[0].entries[0]];
  const line=getChartIndex(charts,items);
  expect(line.cumPlayMaps).toEqual([]);
  expect(line.rankMaps.every(m=>m.size===1)).toBe(true);
  expect(getChartIndex(charts,items)).toBe(line);
  const bars=getChartIndex(charts,items,true);
  expect(bars.cumPlayMaps.map(m=>m.get(items[0].id))).toEqual([1,2,3]);
  expect(bars.cumPlayMaps.every(m=>m.size===1)).toBe(true);
  const different=[charts[0].entries[1]];
  expect(getChartIndex(charts,different).rankMaps[0].has(items[0].id)).toBe(false);
});
