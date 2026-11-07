import { entryWithoutRun } from '../lib/chartTransfer';
import { useContext, useEffect, useMemo, useState, type ReactElement } from 'react';
import { ArrowDownRight, ArrowUpRight, Download, Film, Fingerprint, History, Medal, Sparkles, Trophy, Users } from 'lucide-react';
import type { CachedWeek, ChartWeek, Item, Kind, Settings, SourceFilter } from '../lib/types';
import type { buildSpotlight } from '../lib/spotlight';
import { download, shareCardPDF } from '../lib/export';
import { renderSpotlightCard } from '../lib/spotlightShare';
import { loadMetadata, type EffectiveMeta } from '../lib/metadata';
import type { RevealCard } from '../lib/ballot';
import type { ItemStats } from '../lib/jury';
import { Cover, Empty, Modal, MusicLoader, number, useArtworkUrl } from './UI';
import { Awards } from './Awards';
import { Compare } from './Compare';
import { MusicProfile } from './MusicProfile';
import { Achievements } from './Achievements';
import { AnnualRecords } from './AnnualRecords';
import { Duration, DurationContext } from './Duration';
import { formatWeeks } from '../lib/duration';
import { GramophoneIcon } from './Gramophone';

type SpotlightData=ReturnType<typeof buildSpotlight>;
export type SpotlightTab='chart'|'awards'|'profile'|'records'|'insights'|'compare'|'achievements';
type Tab=SpotlightTab;
export { GramophoneIcon } from './Gramophone';

export function Spotlight({charts,library,cached,settings,source,owner,namespace,initialYear,initialTab='chart',dark,reduced,kind,timezone,onClose,onStudio,onDownload}:{
  initialTab?:SpotlightTab;charts:ChartWeek[];library:Item[];cached:CachedWeek[];settings:Settings;source:SourceFilter;owner:string;namespace:string;initialYear:string;dark:boolean;reduced:boolean;kind:Kind;timezone:string;onClose:()=>void;
  onStudio:(ids:string[],title:string,charts:ChartWeek[],library:Item[],top:number)=>void;onDownload:(year:string)=>void;
}){
  const durationMode = useContext(DurationContext);
  const years=useMemo(()=>[...new Set(charts.map(chart=>chart.year))].sort((a,b)=>b-a),[charts]);
  const [year,setYear]=useState(initialYear),[tab,setTab]=useState<Tab>(initialTab);
  const key=`spotlight-name:v1:${namespace.toLowerCase()}`;
  const [name,setName]=useState(()=>{try{return localStorage.getItem(key)||`${owner} · ${kind==='tracks'?'Hot 100':kind==='albums'?'Top Albums':'Top Artists'}`;}catch{return `${owner} · Hot 100`;}});
  const [top,setTop]=useState(20),[data,setData]=useState<SpotlightData|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true);
  const [exporting,setExporting]=useState(false),[category,setCategory]=useState(0);
  const [pools,setPools]=useState<Partial<Record<Kind,Item[]>>|null>(null),[stats,setStats]=useState<Partial<Record<Kind,Record<string,ItemStats>>>>({}),[poolError,setPoolError]=useState('');
  const [meta,setMeta]=useState<Partial<Record<Kind,Map<string,EffectiveMeta>>>>({});
  const reloadMeta=()=>Promise.all((['tracks','albums','artists'] as Kind[]).map(async k=>[k,await loadMetadata(k)] as const)).then(entries=>setMeta(Object.fromEntries(entries))).catch(()=>{});
  const chosen=useMemo(()=>charts.filter(chart=>year==='all'||chart.year===Number(year)),[charts,year]);
  useEffect(()=>{
    let active=true;setLoading(true);setData(null);setError('');setCategory(0);
    const worker=new Worker(new URL('../workers/spotlight.worker.ts',import.meta.url),{type:'module'});
    worker.onmessage=({data})=>{if(!active)return;setLoading(false);if(data.error)setError(data.error);else setData(data.result);worker.terminate();};
    worker.onerror=()=>{if(active){setLoading(false);setError('Não foi possível abrir este período. Tente novamente.');}worker.terminate();};
    worker.postMessage({charts:chosen.map(chart=>({...chart,entries:chart.entries.map(entry=>({...entryWithoutRun(entry),run:[]}))})),library});
    return()=>{active=false;worker.terminate();};
  },[chosen,library]);
  // Indicados de todos os tipos só quando a premiação é aberta (Worker, sem travar a tela).
  useEffect(()=>{
    if(tab!=='awards')return;
    let active=true;setPools(null);setPoolError('');
    const worker=new Worker(new URL('../workers/pools.worker.ts',import.meta.url),{type:'module'});
    worker.onmessage=({data})=>{if(!active)return;if(data.error)setPoolError(data.error);else{setPools(data.pools);setStats(data.stats??{});}worker.terminate();};
    worker.onerror=()=>{if(active)setPoolError('Não foi possível reunir os indicados deste período.');worker.terminate();};
    worker.postMessage({cached,year:year==='all'?null:Number(year),calendar:charts.map(({id,number,start,end,label,year,partial})=>({id,number,start,end,label,year,partial})),deduplicate:settings.deduplicate,aliases:settings.aliases,source});
    void reloadMeta();
    return()=>{active=false;worker.terminate();};
  },[tab,cached,charts,year,settings.deduplicate,settings.aliases,source]);
  const title=name.trim()||`${owner} · Hot 100`,record=data?.awards[category];
  const backdrop=useArtworkUrl(data?.ranking[0]);
  const date=(seconds:number)=>new Intl.DateTimeFormat('pt-BR',{timeZone:timezone,day:'2-digit',month:'2-digit',year:'2-digit'}).format(new Date(seconds*1000));
  const range=data?.first?`${date(data.first.start)} — ${date(Math.min(data.last!.end-1,Date.now()/1000))}`:'Sem períodos';
  const coverage=data?`${data.loaded}/${chosen.length} semanas com dados${data.missing||data.partial?' · edição parcial':''}`:'';
  const toBlob=async(canvas:HTMLCanvasElement,pdf:boolean)=>{const png=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('Falha ao criar o card.')),'image/png'));return pdf?shareCardPDF(png):png;};
  const share=async(pdf:boolean,recordMode=false)=>{
    if(!data)return;setExporting(true);setError('');
    try{const items=recordMode&&record?record.nominees.slice(0,1):data.ranking.slice(0,5);const canvas=await renderSpotlightCard({title,owner,period:range,items,dark,coverage,award:recordMode&&record?`${record.title} · ${['crown','top10','longevity','return'].includes(record.id) ? formatWeeks(record.value, durationMode) : `${number(record.value)} ${record.unit}`}${record.ties>1?' · empate':''}`:undefined});download(await toBlob(canvas,pdf),`lastchart-${recordMode?'recorde':'spotlight'}.${pdf?'pdf':'png'}`);}
    catch(e){setError(e instanceof Error?e.message:'Não foi possível exportar.');}finally{setExporting(false);}
  };
  const shareAward=async(card:RevealCard,pdf:boolean)=>{
    setError('');
    try{const canvas=await renderSpotlightCard({title,owner,period:range,items:card.winners.slice(0,1),dark,coverage,award:card.winners.length>1?`${card.category.label} · empate`:card.category.label,official:card.category.official,basis:card.method==='vote'?'voto pessoal':'sugestão aceita'});download(await toBlob(canvas,pdf),`lastchart-premio-${card.category.id}.${pdf?'pdf':'png'}`);}
    catch(e){setError(e instanceof Error?e.message:'Não foi possível exportar.');}
  };
  const tabs:Array<[Tab,string,ReactElement]>=[['chart','Seu chart',<Trophy size={16}/>],['awards','Premiação',<GramophoneIcon size={19}/>],['profile','Seu perfil',<Fingerprint size={16}/>],['records','Recordes',<Medal size={16}/>],['insights','Insights',<Sparkles size={16}/>],['compare','Comparar',<Users size={16}/>],['achievements','Conquistas',<Trophy size={16}/>]];
  return <Modal title="Charts & prêmios" subtitle="Spotlight · Seu universo musical, com uma assinatura só sua." onClose={onClose} wide className="spotlight-dialog" ambientImage={backdrop}>
    <div className="spotlight">
      <div className="spotlight-hero">{data?.ranking[0]&&<div className="spotlight-hero-art"><Cover item={data.ranking[0]} size="large"/></div>}<div className="spotlight-hero-copy"><span className="eyebrow"><Sparkles size={13}/> EDIÇÃO PESSOAL</span><h3>{title}</h3><p>{range}</p><small>Charts e prêmios pessoais; sem vínculo com Billboard ou Grammy.</small></div></div>
      {tab!=='profile'&&<div className="spotlight-controls"><label>Nome da sua edição<input aria-label="Nome da edição Spotlight" value={name} maxLength={48} onChange={e=>{setName(e.target.value);try{localStorage.setItem(key,e.target.value);}catch{/* optional preference */}}}/></label><label>Época<select aria-label="Ano do Spotlight" value={year} onChange={e=>setYear(e.target.value)}><option value="all">Todo o histórico</option>{years.map(y=><option key={y} value={y}>{y}</option>)}</select></label></div>}
      <details className="period-help"><summary>Como criar meu chart ou minha premiação?</summary><p>Escolha a época. Em Seu chart, ajuste o Top e anime a edição. Em Premiação, escolha categorias com os nomes do Grammy, vote ou deixe o júri decidir, e comece a cerimônia. Seu perfil mostra seu tipo de ouvinte, selos e signo musical. Recordes mostram estatísticas do período; Insights, seus hábitos; Comparar, outro perfil no mesmo intervalo.</p></details>
      <div className="spotlight-tabs" role="tablist" aria-label="Conteúdo do Spotlight">{tabs.map(([value,label,icon])=><button type="button" role="tab" className={`button small ${tab===value?'primary':''}`} key={value} aria-selected={tab===value} onClick={()=>setTab(value)}>{icon}<span>{label}</span></button>)}</div>
      {error&&<p className="alert error" role="alert">{error}</p>}
      {tab==='achievements'?<Achievements cached={cached} settings={settings} source={source}/>:
      tab==='profile'?<MusicProfile cached={cached} settings={settings} source={source} library={library} owner={owner} dark={dark}/>:
      tab==='compare'?<Compare settings={settings} cached={cached} owner={settings.user} year={year} source={source} dark={dark}/>:
      tab==='awards'?<>{year==='all'&&<p className="note annual-awards-hint">Para os prêmios anuais, escolha um ano em Época. <button type="button" className="text-button" onClick={()=>setYear(String(years[0]))}>Usar {years[0]}</button></p>}<Awards profile={namespace} period={year} periodLabel={`${range} · ${coverage}`} title={title} pools={pools} stats={stats} meta={meta} window={year==='all'?null:data?.first?{start:data.first.start,end:Math.min(data.last!.end,Date.now()/1000),year:Number(year)}:null} apiKey={settings.apiKey} onMetaRefresh={reloadMeta} loading={!pools&&!poolError} error={poolError} reduced={reduced} onExport={shareAward}/></>:
      loading?<div className="spotlight-loading" role="status"><MusicLoader size="md"/><span>Preparando sua edição com dados reais…</span></div>:!data?.ranking.length?<Empty title="Esta edição ainda não tem dados" description={data?.missing?'Há semanas que ainda precisam ser baixadas. Isso não significa ausência de reproduções.':'Nenhuma reprodução encontrada nas semanas deste período e na fonte selecionada.'} action={<button type="button" className="button" onClick={()=>onDownload(year)}>Sincronizar este período</button>}/>:<>
        {(data.missing>0||data.partial)&&<p className="note">{data.missing?`${data.missing} semanas não baixadas. Resultados parciais; lacunas não viram zero.`:'Inclui o período atual ou dados parciais. Os resultados podem mudar após sincronizar.'}</p>}
        {tab==='chart'&&<>
          <div className="spotlight-metrics"><div><strong>{number(data.totalPlays)}</strong><span>reproduções</span></div><div><strong>{number(data.ranking.length)}</strong><span>{kind==='tracks'?'músicas':kind==='albums'?'álbuns':'artistas'}</span></div><div><strong>{data.loaded}</strong><span>semanas com dados</span></div></div>
          <div className="spotlight-actions"><label>Ranking<select aria-label="Top do Spotlight" value={top} onChange={e=>setTop(Number(e.target.value))}>{[10,20,30,50,100].map(n=><option value={n} key={n}>Top {n}</option>)}</select></label><button type="button" className="button primary" onClick={()=>onStudio(data.ranking.slice(0,top).map(item=>item.id),title,chosen,data.ranking,top)}><Film size={16}/><span>Animar esta edição</span></button></div>
          <ol className="spotlight-ranking">{data.ranking.slice(0,top).map((item,i)=><li key={item.id}><b>{String(i+1).padStart(2,'0')}</b><Cover item={item}/><div className="truncate"><strong>{item.name}</strong><small>{item.artist}</small></div><span>{number(item.plays)}<small>plays</small></span></li>)}</ol>
        </>}
        {tab==='records'&&<>
          <AnnualRecords cached={cached} settings={settings} source={source} initialYear={year}/>
          <div className="awards-intro"><Medal size={40}/><div><h3>Recordes do período</h3><p>Estatísticas do seu histórico, com critérios públicos e empates compartilhados. Não são categorias do Grammy.</p></div></div>
          <div className="award-grid">{data.awards.map((entry,i)=><article className={`award-card ${i===category?'is-selected':''}`} key={entry.id}><div className="award-artwork" aria-hidden="true"><Cover item={entry.nominees[0]} size="large"/></div><div className="award-card-top"><Medal size={22}/><span>{entry.title}</span></div><Cover item={entry.nominees[0]} size="large"/><h4>{entry.nominees[0].name}</h4><p>{entry.nominees[0].artist}</p><strong>{['crown','top10','longevity','return'].includes(entry.id) ? <Duration weeks={entry.value}/> : number(entry.value)} {['crown','top10','longevity','return'].includes(entry.id) ? entry.id === 'crown' ? 'em #1' : entry.id === 'top10' ? 'no Top 10' : entry.id === 'return' ? 'fora' : 'no chart' : entry.unit}</strong>{entry.ties>1&&<small>{entry.ties} empatados no primeiro lugar</small>}<details><summary>Critério e top 5</summary><p>{entry.rule}</p><ol>{entry.nominees.map(item=><li key={item.id}>{item.name} · {item.artist}</li>)}</ol></details><button type="button" className="text-button" onClick={()=>setCategory(i)}>{i===category?'Selecionado para o card':'Usar no card'}</button></article>)}</div>
        </>}
        {tab==='insights'&&<div className="spotlight-insights">
          <section className="insight-card"><h3>Seu pulso musical</h3><p>Últimas 12 semanas desta edição. Barras vazias com contorno indicam download pendente.</p><div className="listening-pulse" role="img" aria-label="Reproduções por semana">{data.pulse.map(chart=><div key={chart.id} className={chart.status==='missing'?'is-missing':''} title={`${chart.label}: ${chart.status==='missing'?'não baixada':`${number(chart.plays)} reproduções`}`}><i style={{height:`${chart.status==='missing'?12:Math.max(3,chart.plays/Math.max(1,...data.pulse.map(c=>c.plays))*100)}%`}}/><span>{chart.number}</span></div>)}</div></section>
          <section className="insight-card"><h3>Você, em duas épocas</h3>{data.comparison?<><div className="comparison-values"><div><strong>{number(data.comparison.previous)}</strong><small>{data.comparison.before[0].label} até {data.comparison.before.at(-1)?.label}</small></div><span aria-hidden="true">→</span><div><strong>{number(data.comparison.current)}</strong><small>{data.comparison.after[0].label} até {data.comparison.after.at(-1)?.label}</small></div></div><p className="comparison-delta">{data.comparison.delta>=0?<ArrowUpRight size={18}/>:<ArrowDownRight size={18}/>} {data.comparison.percent===null?'Sem base anterior para calcular porcentagem':`${data.comparison.percent>=0?'+':''}${data.comparison.percent.toLocaleString('pt-BR',{maximumFractionDigits:1})}% de reproduções`}</p><small>Duas janelas de quatro semanas completas. Isso descreve hábitos, sem metas de consumo.</small></>:<p>São necessárias oito semanas completas e consecutivas, todas baixadas, para comparar duas épocas equivalentes.</p>}</section>
          <section className="insight-card"><h3>Assinatura do seu gosto</h3><strong className="insight-big">{data.top5Share.toLocaleString('pt-BR',{maximumFractionDigits:1})}%</strong><p>das reproduções deste período vieram dos cinco primeiros itens. O restante também faz parte da sua história.</p></section>
          <section className="insight-card"><h3><History size={19}/> Tesouros para revisitar</h3><p>Itens presentes antes, mas ausentes das últimas oito semanas completas desta edição.</p>{data.rediscover.length?<div className="rediscovery-list">{data.rediscover.map(item=><div key={item.id}><Cover item={item}/><span className="truncate"><strong>{item.name}</strong><small>{item.artist}</small></span></div>)}</div>:<p className="note">Nenhum item elegível, ou ainda faltam oito semanas completas de dados para confirmar a ausência.</p>}</section>
        </div>}
        {(tab==='chart'||tab==='records')&&<div className="spotlight-export"><span>Leve sua edição com você</span><button type="button" className="button small" disabled={exporting} onClick={()=>void share(false,tab==='records')}>{exporting?<MusicLoader size="sm"/>:<Download size={15}/>}<span>{exporting?'Criando card…':tab==='records'?'Recorde PNG':'Resumo PNG'}</span></button><button type="button" className="button small" disabled={exporting} onClick={()=>void share(true,tab==='records')}>PDF</button><small>{tab==='records'?`Card do recorde selecionado: ${record?.title??''}.`:'O card do chart inclui o Top 5.'}</small></div>}
      </>}
    </div>
  </Modal>;
}
