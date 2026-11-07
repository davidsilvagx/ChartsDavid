import { expect, it, vi } from 'vitest';
import { drawChart } from './canvas';
import { buildCharts, getLibrary } from './charts';
import { makeWeeks } from './calendar';
import { defaults, studioDefaults, type CachedWeek } from './types';

it.each([5,10,15,20,30])('desenha exatamente Top %i barras, sem barra extra ou posição repetida no quadro final',count=>{
  const weeks=makeWeeks(defaults,Date.parse('2016-06-25T12:00Z'));
  const cache:CachedWeek[]=weeks.map(w=>({key:w.id,week:w,cutoff:w.end,fetchedAt:1,duplicates:0,scrobbles:Array.from({length:40},(_,i)=>({track:`Track ${i}`,artist:'Artist',album:'',image:'',timestamp:w.start+100+i}))}));
  const charts=buildCharts(weeks,cache,'tracks');
  const texts:string[]=[];
  const gradient={addColorStop:vi.fn()};
  const ctx=new Proxy({fillText:(text:string)=>texts.push(text),measureText:(text:string)=>({width:text.length*6}),createLinearGradient:()=>gradient,createRadialGradient:()=>gradient} as unknown as CanvasRenderingContext2D,{get(target,key){return Reflect.get(target,key)??vi.fn();}});
  drawChart(ctx,720,720,{charts,items:getLibrary(cache,'tracks'),settings:{...studioDefaults,mode:'bars',barCount:count,effects:false},position:charts.length-1,dark:true});
  const ranks=texts.filter(t=>/^#\d+$/.test(t));
  expect(ranks).toHaveLength(count);
  expect(new Set(ranks).size).toBe(count);
  expect(ranks).not.toContain(`#${count+1}`);
});

it.each([5,10,15,20,30])('não desenha barra extra ou posição repetida no início ou durante a transição para Top %i',count=>{
  const weeks=makeWeeks(defaults,Date.parse('2016-06-25T12:00Z'));
  const cache:CachedWeek[]=weeks.map((w,wIdx)=>({key:w.id,week:w,cutoff:w.end,fetchedAt:1,duplicates:0,scrobbles:Array.from({length:40},(_,i)=>({track:`Track ${i + (wIdx % 2 === 0 ? 0 : 5)}`,artist:'Artist',album:'',image:'',timestamp:w.start+100+i}))}));
  const charts=buildCharts(weeks,cache,'tracks');

  for (const pos of [0, 0.5, 1]) {
    const texts:string[]=[];
    const gradient={addColorStop:vi.fn()};
    const ctx=new Proxy({fillText:(text:string)=>texts.push(text),measureText:(text:string)=>({width:text.length*6}),createLinearGradient:()=>gradient,createRadialGradient:()=>gradient} as unknown as CanvasRenderingContext2D,{get(target,key){return Reflect.get(target,key)??vi.fn();}});
    drawChart(ctx,720,720,{charts,items:getLibrary(cache,'tracks'),settings:{...studioDefaults,mode:'bars',barCount:count,effects:false},position:pos,dark:true});
    const ranks=texts.filter(t=>/^#\d+$/.test(t));
    expect(ranks).not.toContain(`#${count+1}`);
    expect(new Set(ranks).size).toBe(ranks.length);
    if (pos === 0 || pos === 1) {
      expect(ranks).toHaveLength(count);
    }
  }
});

it('renderiza títulos dentro da bolha no celular, watermark com nome do usuário e assinatura discreta', () => {
  const weeks = makeWeeks(defaults, Date.parse('2026-06-25T12:00Z'));
  const cache: CachedWeek[] = weeks.map(w => ({
    key: w.id,
    week: w,
    cutoff: w.end,
    fetchedAt: 1,
    duplicates: 0,
    scrobbles: Array.from({ length: 20 }, (_, i) => ({
      track: `Track ${i}`,
      artist: `Artist ${i}`,
      album: '',
      image: '',
      timestamp: w.start + 100 + i * (20 - i),
    })),
  }));
  const charts = buildCharts(weeks, cache, 'tracks');
  const texts: string[] = [];
  const gradient = { addColorStop: vi.fn() };
  const ctx = new Proxy({
    fillText: (text: string) => texts.push(text),
    measureText: (text: string) => ({ width: text.length * 5 }),
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
  } as unknown as CanvasRenderingContext2D, {
    get(target, key) {
      return Reflect.get(target, key) ?? vi.fn();
    },
  });

  drawChart(ctx, 360, 640, {
    charts,
    items: getLibrary(cache, 'tracks'),
    settings: { ...studioDefaults, mode: 'bars', barCount: 10, effects: false },
    position: charts.length - 1,
    dark: true,
    username: 'David',
  });

  // Marca d'água no fundo contém o usuário David e Top 10 Songs
  expect(texts).toContain('TOP 10 SONGS · DAVID CHARTS');

  // Assinatura é discreta em caixa baixa
  expect(texts).toContain('feito com ❤️ por william santos');

  // Todas as 10 faixas têm seus nomes e artistas renderizados dentro das barras
  const trackLabels = texts.filter(t => t.includes(' · Artist '));
  expect(trackLabels).toHaveLength(10);
  for (let rank = 1; rank <= 10; rank++) {
    expect(texts).toContain(`#${rank}`);
  }
});

it('groups line history into a single glowing stroke per competitor without bridging an OUT gap',()=>{
 const weeks=makeWeeks({...defaults,startDate:'2026-01-02'},Date.parse('2026-06-25T12:00Z'));
 const cache:CachedWeek[]=weeks.map((week,i)=>({key:week.id,week,cutoff:week.end,fetchedAt:1,duplicates:0,scrobbles:i===10?[]:[{track:'Trajectory',artist:'QA',album:'',image:'',timestamp:week.start+100}]}));
 const charts=buildCharts(weeks,cache,'tracks');const items=getLibrary(cache,'tracks');let glow=0,moves=0,curves=0;const stack:number[]=[];
 const gradient={addColorStop:vi.fn()};
 const ctx=new Proxy({shadowBlur:0,save(){stack.push(ctx.shadowBlur);},restore(){ctx.shadowBlur=stack.pop()??0;},stroke(){if(ctx.shadowBlur>0)glow++;},moveTo(){moves++;},bezierCurveTo(){curves++;},fillText(){},measureText:(s:string)=>({width:s.length*5}),createLinearGradient:()=>gradient,createRadialGradient:()=>gradient} as unknown as CanvasRenderingContext2D,{get(target,key){return Reflect.get(target,key)??vi.fn();}});
 drawChart(ctx,1280,720,{charts,items,settings:{...studioDefaults,mode:'lines',spacing:15},position:charts.length-1,dark:true});
 expect(glow).toBe(1);expect(curves).toBeGreaterThan(10);expect(moves).toBeGreaterThan(curves-1);
});
