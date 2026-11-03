import { useMemo, useState } from 'react';
import { CalendarDays, Check, ChevronDown, Download, Music2 } from 'lucide-react';
import { Modal, MusicLoader, number, SyncProgressCard } from './UI';
import { formatDateBR } from '../lib/calendar';
import { monthNames, summarizePeriod, weeksInPeriod } from '../lib/history';
import type { CachedWeek, ChartWeek, Kind, Settings, SourceFilter, SyncProgress, SyncScope, Week } from '../lib/types';
import { PeriodExplorer, type PeriodResult } from './PeriodExplorer';

export function HistoryExplorer({ weeks, charts, initialYear, selectedId, startDate, computing, progress, error, onCancel, onSync, onChoose, onClose, onCalendar, settings, cached, kind, source, onAnimate, initialMode = 'archive' }: {
  weeks: Week[]; charts: ChartWeek[]; initialYear: string; selectedId?: string; startDate: string;
  computing: boolean; progress: SyncProgress | null; error: string;
  onCancel: () => void; onSync: (scope: SyncScope) => void;
  onChoose: (week: Week) => void; onClose: () => void; onCalendar: () => void;
  settings:Settings;cached:CachedWeek[];kind:Kind;source:SourceFilter;onAnimate:(result:PeriodResult)=>void;
  initialMode?: 'archive' | 'period';
}) {
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState('all');
  const [mode, setMode] = useState(initialMode);
  const years = useMemo(() => [...new Set(weeks.map(w => w.year))].reverse(), [weeks]);
  const visible = useMemo(() => weeksInPeriod(weeks, year, month), [weeks, year, month]);
  const byId = useMemo(() => new Map(charts.map(w => [w.id, w])), [charts]);
  const coverage = useMemo(() => summarizePeriod(visible, charts), [visible, charts]);
  const busy = !!progress;
  const scope: SyncScope = year === 'all' ? 'all' : Number(year);
  const periodName = year === 'all' ? 'todo o histórico' : `o ano de ${year}`;

  const description = coverage.state === 'missing' ? 'Este período ainda não foi baixado. Baixe para consultar as músicas e confirmar se houve reproduções.'
    : coverage.state === 'partial' ? `${number(coverage.missing)} semanas ainda não foram baixadas. O período está incompleto; isso não significa ausência de músicas.`
    : coverage.state === 'empty' ? month === 'all' ? 'Nenhuma reprodução encontrada nas semanas deste período para a fonte selecionada. Todas foram consultadas.' : 'Nenhuma reprodução nas semanas iniciadas neste mês, para a fonte selecionada. Para consultar o mês civil completo, use “Charts por período”.'
    : coverage.state === 'unavailable' ? 'Não há semanas iniciadas neste mês dentro do calendário configurado. Meses futuros aparecem quando começarem.'
    : `${number(coverage.plays)} reproduções nas semanas deste período, para a fonte selecionada.`;

  return <Modal title={initialMode==='period'?'Filtrar vídeo':'Histórico completo'} subtitle={initialMode==='period'?'Escolha a época e a divisão dos quadros. Depois envie a sequência para Linhas ou Barras.':'Todos os anos, meses e semanas do seu calendário. Sem limite de oito semanas.'} onClose={onClose} wide>
    <div className="history-explorer">
      <div className="history-mode" role="group" aria-label="Visualização do histórico"><button type="button" className={`button ${mode==='archive'?'primary':''}`} aria-pressed={mode==='archive'} onClick={()=>setMode('archive')}>Arquivo completo</button><button type="button" className={`button ${mode==='period'?'primary':''}`} aria-pressed={mode==='period'} onClick={()=>setMode('period')}>Charts por período</button></div>
      {mode==='period' ? <><PeriodExplorer settings={settings} cached={cached} kind={kind} source={source} initialYear={initialYear} disabled={busy || computing} onAnimate={onAnimate} onDownload={()=>onSync('all')} />{progress&&<SyncProgressCard progress={progress} onCancel={onCancel} compact/>}{error&&<p role="alert" className="alert error">{error}</p>}</> : <>
      <h3>Arquivo semanal por ano e mês</h3>
      <div className="history-filters">
        <label>Ano<select aria-label="Ano do histórico" value={year} onChange={e => { setYear(e.target.value); setMonth('all'); }}>
          <option value="all">Todos os anos</option>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select></label>
        <label>Mês de início da semana<select aria-label="Mês do histórico" value={month} onChange={e => setMonth(e.target.value)}>
          <option value="all">Todos os meses</option>
          {monthNames.map((name, i) => <option key={name} value={String(i + 1).padStart(2, '0')}>{name}</option>)}
        </select></label>
      </div>
      {progress && <SyncProgressCard progress={progress} onCancel={onCancel} compact />}
      {computing && !progress && <div className="history-loading" role="status"><MusicLoader size="sm" /><span>Organizando todas as semanas do histórico…</span></div>}
      {error && <p className="alert error" role="alert">{error}</p>}
      <div className="history-summary" aria-live="polite">
        <strong>{number(coverage.loaded)} de {number(coverage.total)} semanas disponíveis no aparelho</strong>
        <p>{computing || progress ? 'As semanas estão listadas abaixo. Os números e rankings são atualizados ao terminar ou pausar o download.' : description}</p>
        <button type="button" className="button primary" disabled={busy || !visible.length} onClick={() => onSync(scope)}>
          {busy ? <MusicLoader size="sm" tone="ink" /> : <Download size={16} />}
          <span>{busy ? 'Baixando histórico…' : coverage.missing ? `Baixar ${periodName} completo` : `Atualizar ${periodName}`}</span>
        </button>
        {month !== 'all' && <small>O download inclui o ano inteiro. O filtro mensal organiza semanas pela sexta-feira inicial.</small>}
      </div>
      <div className="history-years">
        {years.filter(y => year === 'all' || String(y) === year).map(y => {
          const yearWeeks = weeksInPeriod(visible, String(y));
          if (!yearWeeks.length) return null;
          const summary = summarizePeriod(yearWeeks, charts);
          return <details className="history-year" key={`${y}-${year}-${month}`} open={year !== 'all' || y === years[0]}>
            <summary><span><strong>{y}</strong><small>{summary.loaded}/{summary.total} semanas baixadas{!computing && !busy && summary.state === 'empty' ? ' · Sem reproduções' : summary.missing ? ' · Download pendente' : ''}</small></span><ChevronDown size={18} /></summary>
            <div className="history-months">
              {monthNames.map((name, i) => {
                const monthWeeks = weeksInPeriod(yearWeeks, String(y), String(i + 1).padStart(2, '0'));
                if (!monthWeeks.length) return null;
                return <section key={name}><h3>{name} <span>{monthWeeks.length} semanas</span></h3><div className="history-week-grid">
                  {monthWeeks.map(w => {
                    const chart = byId.get(w.id);
                    const loaded = chart?.status === 'loaded';
                    return <button type="button" key={w.id} className={`history-week ${loaded ? 'is-loaded' : 'is-missing'} ${selectedId === w.id ? 'is-selected' : ''}`} onClick={() => onChoose(w)} aria-label={`Abrir semana ${w.number}, ${w.label}, ${loaded ? `${chart.plays} reproduções` : 'ainda não baixada'}`}>
                      <span><CalendarDays size={14} />Semana {w.number}{w.partial ? ' · atual' : ''}</span>
                      <strong>{w.label}</strong>
                      <small>{loaded ? <Check size={13} /> : <Download size={13} />}{loaded ? chart.plays ? `${number(chart.plays)} reproduções` : 'Sem reproduções' : 'Ainda não baixada'}</small>
                      {loaded && chart.entries[0] && <em><Music2 size={12} />#1 {chart.entries[0].name}</em>}
                    </button>;
                  })}
                </div></section>;
              })}
            </div>
          </details>;
        })}
      </div>
      </>}
      <p className="history-calendar-note">Calendário desde {formatDateBR(startDate)} até hoje. Para incluir anos anteriores, <button type="button" className="text-button" onClick={onCalendar}>alterar o início da contagem</button>. Semanas futuras não geram posições ou reproduções.</p>
    </div>
  </Modal>;
}
