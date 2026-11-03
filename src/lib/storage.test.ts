import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { readWeeks, saveWeek, importWeeks } from './storage';
import { defaults } from './types';
import { makeWeeks, weekKey } from './calendar';
it('cache isola usuários e importação substitui semana atomicamente',async()=>{
 const a={...defaults,user:'Alice'},b={...defaults,user:'Bob'};const week=makeWeeks(a,Date.parse('2016-06-25'))[0];
 const value={key:weekKey(a,week.id),week,scrobbles:[],fetchedAt:1,cutoff:week.end,duplicates:0};
 await saveWeek(value);expect(await readWeeks(a)).toHaveLength(1);expect(await readWeeks(b)).toHaveLength(0);
 await importWeeks(a,[{...value,fetchedAt:2}]);expect((await readWeeks(a))[0].fetchedAt).toBe(2);
});
