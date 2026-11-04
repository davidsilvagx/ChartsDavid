import type { ChartWeek, Item } from './types';

export interface SpotlightAward { id:string; title:string; rule:string; unit:string; value:number; nominees:Item[]; ties:number }
const counts=(chart:ChartWeek)=>chart.playCounts??chart.entries.map(entry=>[entry.id,entry.plays] as [string,number]);
const compare=(a:Item,b:Item)=>b.plays-a.plays||a.name.localeCompare(b.name)||a.id.localeCompare(b.id);
function totals(charts:ChartWeek[]){const map=new Map<string,number>();for(const chart of charts)if(chart.status==='loaded')for(const [id,plays] of counts(chart))map.set(id,(map.get(id)??0)+plays);return map;}

export function buildSpotlight(charts:ChartWeek[],library:Item[],now=Date.now()){
  const ordered=[...charts].sort((a,b)=>a.start-b.start),loaded=ordered.filter(c=>c.status==='loaded');
  const all=totals(ordered),ranking=library.filter(item=>(all.get(item.id)??0)>0).map(item=>({...item,plays:all.get(item.id)!})).sort(compare);
  const byId=new Map(ranking.map(item=>[item.id,item]));
  const numberOnes=new Map<string,number>(),top10=new Map<string,number>(),longevity=new Map<string,number>(),jumps=new Map<string,number>(),returns=new Map<string,number>();
  for(const chart of loaded)for(const entry of chart.entries){
    longevity.set(entry.id,(longevity.get(entry.id)??0)+1);
    if(entry.rank===1)numberOnes.set(entry.id,(numberOnes.get(entry.id)??0)+1);
    if(entry.rank<=10)top10.set(entry.id,(top10.get(entry.id)??0)+1);
    if(typeof entry.change==='number'&&entry.change>0)jumps.set(entry.id,Math.max(jumps.get(entry.id)??0,entry.change));
    if(entry.change==='RE'&&entry.hiatusWeeks&&entry.hiatusWeeks>0)returns.set(entry.id,Math.max(returns.get(entry.id)??0,entry.hiatusWeeks));
  }
  const awards:SpotlightAward[]=[];
  const award=(id:string,title:string,rule:string,unit:string,values:Map<string,number>)=>{
    const candidates=[...values].filter(([id,value])=>value>0&&byId.has(id)).sort((a,b)=>b[1]-a[1]||compare(byId.get(a[0])!,byId.get(b[0])!));
    if(!candidates.length)return;
    const value=candidates[0][1],ties=candidates.filter(([,score])=>score===value).length;
    awards.push({id,title,rule,unit,value,ties,nominees:candidates.slice(0,5).map(([id])=>byId.get(id)!)});
  };
  award('plays','Fenômeno do período','Mais reproduções verificadas nas datas incluídas.','reproduções',all);
  award('crown','Reinado do #1','Mais períodos em primeiro lugar no chart oficial.','períodos em #1',numberOnes);
  award('top10','Presença de elite','Mais períodos dentro do Top 10 oficial.','períodos no Top 10',top10);
  award('longevity','Ícone de consistência','Mais aparições no Top 100 oficial.','aparições',longevity);
  award('rise','Ascensão extraordinária','Maior subida entre períodos consecutivos conhecidos.','posições de subida',jumps);
  award('return','Retorno triunfal','Maior ausência confirmada antes de retornar ao Top 100. Lacunas de download não contam.','períodos fora antes do retorno',returns);
  const totalPlays=loaded.reduce((sum,c)=>sum+c.plays,0),missing=ordered.length-loaded.length;
  const complete=ordered.filter(c=>!c.partial&&c.end<=now/1000);
  const recentEight=complete.slice(-8);
  const comparison=recentEight.length===8&&recentEight.every(c=>c.status==='loaded')?(()=>{
    const before=recentEight.slice(0,4),after=recentEight.slice(4),previous=before.reduce((n,c)=>n+c.plays,0),current=after.reduce((n,c)=>n+c.plays,0);
    return {previous,current,delta:current-previous,percent:previous?((current-previous)/previous)*100:null,before,after};
  })():null;
  const recent=complete.slice(-8),recentIds=new Set(ordered.filter(c=>c.start>=(recent[0]?.start??Infinity)).flatMap(c=>counts(c).filter(([,n])=>n>0).map(([id])=>id)));
  const rediscover=recent.length===8&&recent.every(c=>c.status==='loaded')?ranking.filter(item=>!recentIds.has(item.id)).slice(0,6):[];
  return {ranking,awards,totalPlays,loaded:loaded.length,missing,partial:ordered.some(c=>c.partial||c.provisional),top5Share:totalPlays?ranking.slice(0,5).reduce((n,i)=>n+i.plays,0)/totalPlays*100:0,comparison,rediscover,pulse:ordered.slice(-12),first:ordered[0],last:ordered.at(-1)};
}
