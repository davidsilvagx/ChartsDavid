import { expect,it } from 'vitest';
import { packCharts,unpackCharts } from './chartTransfer';
import { buildCharts } from './charts';
import { makeWeeks } from './calendar';
import { defaults } from './types';
it('transfers each run once and preserves every historical snapshot, OUT gap and unknown week',()=>{
 const weeks=makeWeeks({...defaults,startDate:'2026-01-02'},Date.parse('2026-02-10T12:00Z'));
 const cached=weeks.filter((_,i)=>i!==2).map((week,i)=>({key:week.id,week,cutoff:week.end,fetchedAt:1,duplicates:0,scrobbles:i===1?[]:[{timestamp:week.start+10,artist:'QA',track:'Song',album:'',image:''}]}));
 const original=buildCharts(weeks,cached,'tracks');const packed=packCharts(original);const restored=unpackCharts(structuredClone(packed));
 expect(JSON.stringify(restored)).toBe(JSON.stringify(original));expect(packed.runs).toHaveLength(1);
 expect(restored[0].entries[0].run).toHaveLength(1);expect(restored[0].entries[0].run).not.toBe(restored.at(-1)?.entries[0]?.run);
});
