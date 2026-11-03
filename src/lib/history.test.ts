import { describe, expect, it } from 'vitest';
import { makeWeeks } from './calendar';
import { summarizePeriod, weeksInPeriod } from './history';
import { defaults, type ChartWeek } from './types';

const weeks=makeWeeks(defaults,Date.parse('2026-11-03T12:00Z'));
const empty=(index:number):ChartWeek=>({...weeks[index],status:'loaded',entries:[],plays:0,unique:0,provisional:false});
describe('Arquivo completo',()=>{
  it('mantém todas as semanas e permite acessar 2026 inteiro até hoje',()=>{
    expect(weeksInPeriod(weeks,'all')).toHaveLength(541);
    expect(weeksInPeriod(weeks,'2026')).toHaveLength(44);
    expect(weeksInPeriod(weeks,'2026','01').map(w=>w.id)).toEqual(['2026-01-02','2026-01-09','2026-01-16','2026-01-23','2026-01-30']);
  });
  it('distingue ano vazio de semanas não baixadas',()=>{
    expect(summarizePeriod(weeks.slice(0,2),[])).toMatchObject({state:'missing',missing:2});
    expect(summarizePeriod(weeks.slice(0,2),[empty(0)])).toMatchObject({state:'partial',missing:1});
    expect(summarizePeriod(weeks.slice(0,2),[empty(0),empty(1)])).toMatchObject({state:'empty',missing:0});
    expect(summarizePeriod(weeks.slice(0,2),[{...empty(0),plays:10},empty(1)])).toMatchObject({state:'ready',plays:10});
  });
  it('não inventa semanas futuras ou anteriores ao calendário',()=>{
    expect(weeksInPeriod(weeks,'2026','12')).toEqual([]);
    expect(summarizePeriod([],[]).state).toBe('unavailable');
    expect(weeksInPeriod(weeks,'2015')).toEqual([]);
  });
});
