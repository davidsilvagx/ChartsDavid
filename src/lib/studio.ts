import { Temporal } from '@js-temporal/polyfill';
import { makeWeeks } from './calendar';
import type { ChartWeek, Item, Settings } from './types';

export function studioDateRange(settings: Settings, today: string, type: 'year'|'month'|'week'|'all', year: string, month = '01', day = today) {
  let from = settings.startDate, to = today;
  if(type==='year'){from=`${year}-01-01`;to=`${year}-12-31`;}
  if(type==='month'){const first=Temporal.PlainDate.from(`${year}-${month}-01`);from=first.toString();to=first.with({day:first.daysInMonth}).toString();}
  if(type==='week'){
    const date=Temporal.PlainDate.from(day);
    if(day>today)throw new Error('Esta semana ainda não começou. Escolha uma data até hoje.');
    const timestamp=Number(date.toZonedDateTime(settings.timezone).epochMilliseconds)/1000;
    const now=Number(Temporal.PlainDate.from(today).add({days:1}).toZonedDateTime(settings.timezone).epochMilliseconds)-1;
    const week=makeWeeks(settings,now).find(w=>timestamp>=w.start&&timestamp<w.end);
    if(!week)throw new Error('Esta data está fora do calendário sincronizado.');
    const local=(seconds:number)=>Temporal.Instant.fromEpochMilliseconds(seconds*1000).toZonedDateTimeISO(settings.timezone).toPlainDate().toString();
    from=local(week.start);to=local(week.end-1);
  }
  from=from<settings.startDate?settings.startDate:from;to=to>today?today:to;
  if(from>to)throw new Error('Este período ainda não começou ou está fora do seu calendário.');
  return {from,to};
}

// Include every item that reaches the requested Top during the selected range.
// This keeps real overtakes without indexing the entire listening library.
export function automaticBarItems<T extends Pick<Item,'id'|'name'>>(charts: Array<Pick<ChartWeek,'status'|'playCounts'> & {entries: Array<Pick<Item,'id'|'plays'>>}>, library: T[], count: number, metric: 'weekly' | 'cumulative'): T[] {
  const totals = new Map<string, number>();
  const candidates = new Set<string>();
  const names = new Map(library.map(item=>[item.id,item.name]));
  const heap: Array<[string,number]> = [];
  const positions = new Map<string,number>();
  const compare=(a:[string,number],b:[string,number])=>b[1]-a[1] || (names.get(a[0])??a[0]).localeCompare(names.get(b[0])??b[0]) || a[0].localeCompare(b[0]);
  const swap=(a:number,b:number)=>{[heap[a],heap[b]]=[heap[b],heap[a]];positions.set(heap[a][0],a);positions.set(heap[b][0],b);};
  const sink=(start:number)=>{let i=start;while(i*2+1<heap.length){let next=i*2+1;if(next+1<heap.length&&compare(heap[next+1],heap[next])>0)next++;if(compare(heap[next],heap[i])<=0)break;swap(i,next);i=next;}};
  const offer=(entry:[string,number])=>{
    if(entry[1]<=0||count<=0)return;
    const existing=positions.get(entry[0]);
    if(existing!==undefined){heap[existing]=entry;sink(existing);return;}
    if(heap.length<count){heap.push(entry);let i=heap.length-1;positions.set(entry[0],i);while(i>0){const parent=(i-1)>>1;if(compare(heap[i],heap[parent])<=0)break;swap(i,parent);i=parent;}return;}
    if(compare(entry,heap[0])<0){positions.delete(heap[0][0]);heap[0]=entry;positions.set(entry[0],0);sink(0);}
  };
  for (const chart of charts) {
    if (chart.status !== 'loaded') continue;
    const counts = chart.playCounts ?? chart.entries.map(e => [e.id, e.plays] as [string,number]);
    if(metric==='weekly'){heap.length=0;positions.clear();}
    for(const [id,plays] of counts){const value=metric==='weekly'?plays:(totals.get(id)??0)+plays;totals.set(id,value);offer([id,value]);}
    for(const [id] of heap)candidates.add(id);
  }
  return library.filter(item => candidates.has(item.id));
}

export function selectionInRange(charts: ChartWeek[], selected: string[]): string[] {
  const available = new Set(charts.flatMap(chart => chart.entries.map(e => e.id)));
  const retained = selected.filter(id => available.has(id));
  return retained.length ? retained : [...charts].reverse().find(c => c.status === 'loaded' && c.entries.length)?.entries.slice(0,5).map(e => e.id) ?? [];
}
