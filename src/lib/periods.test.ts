import { describe, expect, it } from 'vitest';
import { buildPeriodCharts } from './periods';
import { makeWeeks } from './calendar';
import { defaults, type CachedWeek, type Scrobble } from './types';

const now=Date.parse('2026-03-20T12:00Z');
const settings={...defaults,startDate:'2025-12-26',timezone:'UTC'};
const canonical=makeWeeks(settings,now);
const play=(iso:string,track='Song',source:Scrobble['source']='lastfm'):Scrobble=>({timestamp:Date.parse(iso)/1000,track,artist:'Artist',album:'Album',image:'',source});
const cache=(plays:Scrobble[]):CachedWeek[]=>canonical.map(w=>({key:w.id,week:w,scrobbles:plays.filter(p=>p.timestamp>=w.start&&p.timestamp<w.end),cutoff:Math.min(w.end,now/1000),fetchedAt:now,duplicates:0,lastfmSynced:true}));
describe('Charts reais por dia, semana, mês e ano',()=>{
  it('divide a virada do mês e do ano pelos timestamps reais',()=>{
    const data=cache([play('2025-12-31T23:59:59Z','December'),play('2026-01-01T00:00:00Z','January')]);
    const monthly=buildPeriodCharts(settings,data,'tracks','all','month','2025-12-26','2026-01-31',now);
    expect(monthly.charts.map(c=>[c.plays,c.entries[0]?.name])).toEqual([[1,'December'],[1,'January']]);
    expect(monthly.charts[0].unit).toBe('month');
    const yearly=buildPeriodCharts(settings,data,'tracks','all','year','2025-12-26','2026-01-31',now);
    expect(yearly.charts.map(c=>c.plays)).toEqual([1,1]);
    expect(yearly.charts[0].partial).toBe(true);
  });
  it('filtra o dia exato sem incluir plays vizinhos e preserva zero real',()=>{
    const data=cache([play('2026-01-01T23:59:59Z','Before'),play('2026-01-02T00:00:00Z','Inside'),play('2026-01-03T00:00:00Z','After')]);
    const result=buildPeriodCharts(settings,data,'tracks','lastfm','day','2026-01-02','2026-01-02',now);
    expect(result.charts).toHaveLength(1);
    expect(result.charts[0].entries.map(e=>e.name)).toEqual(['Inside']);
    expect(result.library).toHaveLength(1);
    expect(buildPeriodCharts(settings,data,'tracks','all','day','2026-01-04','2026-01-04',now).charts[0]).toMatchObject({status:'loaded',plays:0});
  });
  it('preserva sexta a quinta para o agrupamento semanal',()=>{
    const result=buildPeriodCharts(settings,cache([]),'tracks','all','week','2026-01-01','2026-01-09',now);
    expect(result.charts.map(c=>c.id)).toEqual(['2025-12-26','2026-01-02','2026-01-09']);
    expect(result.charts[0].label).toBe('01/01/26 — 01/01/26');
    expect(buildPeriodCharts(settings,cache([]),'tracks','all','week','2026-01-09','2026-01-15',now).charts[0].number).toBe(3);
  });
  it('exclui dias da semana aberta e limita o mês ao último fechamento',()=>{
    const today=Date.parse('2026-03-19T12:00Z');
    const data=cache([]).map(w=>w.week.id==='2026-03-13'?{...w,cutoff:Date.parse('2026-03-18T12:00Z')/1000}:w);
    expect(() => buildPeriodCharts(settings,data,'tracks','all','day','2026-03-19','2026-03-19',today)).toThrow('Live Charts');
    expect(buildPeriodCharts(settings,data,'tracks','all','month','2026-03-01','2026-03-19',today).charts[0].end).toBe(Date.parse('2026-03-13T00:00Z')/1000);
    expect(buildPeriodCharts(settings,data,'tracks','all','month','2026-03-01','2026-03-19',today).charts[0].partial).toBe(true);
  });
  it('respeita o fuso escolhido no chart diário',()=>{
    const local={...settings,timezone:'America/Sao_Paulo'};
    const plays=[play('2026-01-02T02:59:59Z','Before'),play('2026-01-02T03:00:00Z','Inside')];
    const data=makeWeeks(local,now).map(w=>({key:w.id,week:w,scrobbles:plays.filter(p=>p.timestamp>=w.start&&p.timestamp<w.end),cutoff:Math.min(w.end,now/1000),fetchedAt:now,duplicates:0}));
    expect(buildPeriodCharts(local,data,'tracks','all','day','2026-01-02','2026-01-02',now).charts[0].entries.map(e=>e.name)).toEqual(['Inside']);
  });
  it('não chama período incompleto de vazio e mantém o filtro de plataforma',()=>{
    const data=cache([play('2026-01-02T12:00Z','Spotify','spotify'),play('2026-01-02T12:10Z','Last.fm')]);
    expect(buildPeriodCharts(settings,data,'tracks','spotify','month','2026-01-01','2026-01-31',now).charts[0].entries.map(e=>e.name)).toEqual(['Spotify']);
    const missing=data.filter(w=>w.week.id!=='2026-01-02');
    expect(buildPeriodCharts(settings,missing,'tracks','all','month','2026-01-01','2026-01-31',now).charts[0]).toMatchObject({status:'missing',entries:[]});
  });
  it('rejeita datas futuras, invertidas e excesso diário explicitamente',()=>{
    expect(()=>buildPeriodCharts(settings,[],'tracks','all','day','2026-02-01','2026-01-01',now)).toThrow('inicial');
    expect(()=>buildPeriodCharts(settings,[],'tracks','all','day','2026-01-01','2027-01-01',now)).toThrow('futuras');
    expect(()=>buildPeriodCharts({...defaults,startDate:'2024-01-05'},[],'tracks','all','day','2024-01-05','2026-01-01',now)).toThrow('366 dias');
  });
});
