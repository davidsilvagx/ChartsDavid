import { useEffect, useRef, useState } from 'react';
import { Temporal } from '@js-temporal/polyfill';
import { ChevronLeft, ChevronRight, Film } from 'lucide-react';
import { formatDateBR, parseDateBR } from '../lib/calendar';
import { periodLabels, type buildPeriodCharts, type PeriodUnit } from '../lib/periods';
import type { CachedWeek, Kind, Settings, SourceFilter } from '../lib/types';
import { Cover, MusicLoader, number } from './UI';
import { monthNames } from '../lib/history';
import { studioDateRange } from '../lib/studio';

export type PeriodResult = ReturnType<typeof buildPeriodCharts>;
export function PeriodExplorer({settings,cached,kind,source,disabled,onAnimate,onDownload,initialYear='all'}: {
  settings:Settings;cached:CachedWeek[];kind:Kind;source:SourceFilter;disabled:boolean;
  onAnimate:(result:PeriodResult)=>void;onDownload:()=>void;
  initialYear?:string;
}) {
  const today = Temporal.Now.plainDateISO(settings.timezone).toString();
  const initialRange=(()=>{try{return studioDateRange(settings,today,'year',initialYear==='all'?today.slice(0,4):initialYear);}catch{return {from:settings.startDate,to:today};}})();
  const [unit,setUnit]=useState<PeriodUnit>('week');
  const [rangeType,setRangeType]=useState<'year'|'month'|'week'|'all'|'custom'>('year');
  const [rangeYear,setRangeYear]=useState(initialYear==='all'?today.slice(0,4):initialYear);
  const [rangeMonth,setRangeMonth]=useState(today.slice(5,7));
  const [anchor,setAnchor]=useState(formatDateBR(today));
  const [from,setFrom]=useState(()=>formatDateBR(initialRange.from));
  const [to,setTo]=useState(()=>formatDateBR(initialRange.to));
  const [result,setResult]=useState<PeriodResult|null>(null);
  const [index,setIndex]=useState(0);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const worker=useRef<Worker|null>(null);
  const reset = () => { worker.current?.terminate();worker.current=null;setLoading(false);setResult(null);setError(''); };
  useEffect(()=>{reset();return()=>worker.current?.terminate();},[settings.user,settings.startDate,settings.timezone,settings.deduplicate,settings.aliases,kind,source,cached]);
  const applyRange=(type:typeof rangeType,y=rangeYear,m=rangeMonth,day=anchor)=>{
    reset();setRangeType(type);setRangeYear(y);setRangeMonth(m);
    if(type==='custom')return;
    try{const dates=studioDateRange(settings,today,type,y,m,type==='week'?parseDateBR(day):today);setFrom(formatDateBR(dates.from));setTo(formatDateBR(dates.to));setUnit(type==='week'?'day':'week');}catch(e){setError(e instanceof Error?e.message:'Período inválido.');}
  };
  const finerUnit:PeriodUnit=unit==='year'?'month':unit==='month'?'week':'day';
  const run = (animate=false) => {
    reset();
    try {
      const request={settings,cached,kind,source,unit:animate?finerUnit:unit,from:parseDateBR(from),to:parseDateBR(to)};
      setLoading(true);
      const current=new Worker(new URL('../workers/periods.worker.ts',import.meta.url),{type:'module'});
      worker.current=current;
      current.onmessage=({data})=>{if(worker.current!==current)return;current.terminate();worker.current=null;setLoading(false);if(data.error)setError(data.error);else if(animate&&data.charts.length>1){onAnimate(data);}else {setResult(data);setUnit(data.unit);setIndex(Math.max(0,data.charts.length-1));}};
      current.onerror=()=>{current.terminate();worker.current=null;setLoading(false);setError('Não foi possível calcular o período. Tente um intervalo menor.');};
      current.postMessage(request);
    } catch(e) {setLoading(false);setError(e instanceof Error?e.message:'Período inválido.');}
  };
  const selected=result?.charts[index];
  const dateInput=(value:string)=>value.replace(/\D/g,'').slice(0,8).replace(/^(\d{2})(\d)/,'$1/$2').replace(/^(\d{2}\/\d{2})(\d)/,'$1/$2');
  return <section className="period-explorer">
    <h3>Datas e evolução do vídeo</h3><p>Primeiro escolha as datas incluídas. Depois defina se cada quadro mostra um dia, semana, mês ou ano. Fuso: {settings.timezone}.</p>
    <details className="period-help"><summary>Como criar o vídeo de uma época?</summary><p>Para agosto de 2026, escolha “Um mês”, 2026 e Agosto. Gere os charts e toque em “Animar” para usar essas datas no estúdio; lá você escolhe Linhas ou Barras e o Top. Para uma semana específica, informe qualquer dia dela: o intervalo de sexta a quinta é preenchido automaticamente.</p></details>
    <div className="history-filters">
      <label>Intervalo do vídeo<select aria-label="Intervalo do vídeo" value={rangeType} onChange={e=>applyRange(e.target.value as typeof rangeType)}><option value="year">Ano completo</option><option value="month">Um mês</option><option value="week">Uma semana</option><option value="custom">Datas personalizadas</option><option value="all">Todo o histórico</option></select></label>
      {(rangeType==='year'||rangeType==='month')&&<label>Ano<select aria-label="Ano do vídeo" value={rangeYear} onChange={e=>applyRange(rangeType,e.target.value)}>{Array.from({length:Number(today.slice(0,4))-Number(settings.startDate.slice(0,4))+1},(_,i)=>String(Number(today.slice(0,4))-i)).map(y=><option key={y} value={y}>{y}</option>)}</select></label>}
      {rangeType==='month'&&<label>Mês<select aria-label="Mês do vídeo" value={rangeMonth} onChange={e=>applyRange('month',rangeYear,e.target.value)}>{monthNames.map((name,i)=><option key={name} value={String(i+1).padStart(2,'0')}>{name}</option>)}</select></label>}
      {rangeType==='week'&&<label>Um dia da semana<input aria-label="Dia da semana do vídeo" inputMode="numeric" placeholder="dd/mm/aa" value={anchor} onChange={e=>{reset();setAnchor(dateInput(e.target.value));}} onBlur={()=>applyRange('week')}/><small>A semana vai de sexta a quinta; o vídeo mostra a evolução diária.</small></label>}
    </div>
    <div className="history-filters">
      <label>Um quadro por<select aria-label="Agrupar charts por" value={unit} onChange={e=>{reset();setUnit(e.target.value as PeriodUnit);}}>{Object.entries(periodLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
      <label>De<input aria-label="Data inicial do período" inputMode="numeric" value={from} onChange={e=>{reset();setRangeType('custom');setFrom(dateInput(e.target.value));}} placeholder="dd/mm/aa" /></label>
      <label>Até<input aria-label="Data final do período" inputMode="numeric" value={to} onChange={e=>{reset();setRangeType('custom');setTo(dateInput(e.target.value));}} placeholder="dd/mm/aa" /></label>
    </div>
    <p className="history-calendar-note">Um ano agrupado por semanas ou meses gera uma sequência. Agrupar somente esse ano por “Ano” gera um ranking estático.</p>
    <div className="period-actions"><button type="button" className="text-button" onClick={()=>applyRange('all')}>Usar todo o histórico</button><button type="button" className="button primary" disabled={disabled||loading||!!error} onClick={()=>run()}>{loading&&<MusicLoader size="sm" tone="ink" />}<span>{loading?'Calculando charts…':'Ver charts do período'}</span></button></div>
    {unit==='day'&&<small className="history-calendar-note">Consulte qualquer dia ou ano, em intervalos de até 366 dias. Para uma animação de todos os anos juntos, escolha semanas, meses ou anos.</small>}
    {loading&&<p role="status" className="history-loading"><MusicLoader size="sm" />Calculando posições a partir das reproduções salvas…</p>}
    {error&&<p className="alert error" role="alert">{error}</p>}
    {result&&selected&&<div className="period-results">
      {result.charts.length===1&&<p className="history-summary">Este filtro gerou um quadro único. {result.unit==='day'?'Amplie as datas para animar mais de um dia.':'Para reproduzir a evolução, divida o mesmo intervalo em períodos menores.'}</p>}
      <button type="button" className="button primary" disabled={!result.library.length||disabled||loading||(result.charts.length===1&&result.unit==='day')} onClick={()=>result.charts.length===1?run(true):onAnimate(result)}><Film size={16}/><span>{result.charts.length===1?`Criar vídeo por ${finerUnit==='month'?'meses':finerUnit==='week'?'semanas':'dias'}`:`Animar estes ${result.charts.length} períodos no estúdio`}</span></button>
      <div className="period-navigation"><button type="button" className="icon-button" aria-label="Período anterior" disabled={index===0} onClick={()=>setIndex(i=>i-1)}><ChevronLeft size={18}/></button><label>{periodLabels[result.unit]}<select aria-label="Período do ranking" value={index} onChange={e=>setIndex(Number(e.target.value))}>{result.charts.map((c,i)=><option key={c.id} value={i}>{c.label}{c.status==='missing'?' · não baixado':c.plays===0?' · sem reproduções':''}</option>)}</select></label><button type="button" className="icon-button" aria-label="Próximo período" disabled={index===result.charts.length-1} onClick={()=>setIndex(i=>i+1)}><ChevronRight size={18}/></button></div>
      {selected.status==='missing'?<div className="history-summary"><strong>Este período ainda está incompleto</strong><p>Faltam semanas do arquivo. Baixe o histórico para ver o ranking completo; ausência de download não significa ausência de músicas.</p><button type="button" className="button" disabled={disabled} onClick={onDownload}>Baixar histórico completo</button></div>:!selected.plays?<p className="history-summary">Nenhuma reprodução encontrada entre {selected.label}, para a fonte selecionada{selected.partial ? ', no arquivo sincronizado até agora (período parcial)' : ''}.</p>:<>
        <p>{number(selected.plays)} {selected.plays===1?'reprodução':'reproduções'} · {number(selected.unique)} {selected.unique===1?'item':'itens'}{selected.partial?' · período parcial':''}</p>
        <ol className="period-ranking">{selected.entries.map(e=><li key={e.id}><b>{e.rank}</b><Cover item={e}/><span className="truncate"><strong>{e.name}</strong><small>{e.artist}</small></span><strong>{number(e.plays)}</strong></li>)}</ol>
      </>}
      <small>A animação usa a mesma divisão por {periodLabels[result.unit].toLowerCase()} e as datas acima. Períodos não baixados permanecem sinalizados.</small>
    </div>}
  </section>;
}
