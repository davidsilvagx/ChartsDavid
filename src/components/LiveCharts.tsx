import { useEffect, useState } from 'react';
import { Radio, RefreshCw } from 'lucide-react';
import type { ChartWeek, Item } from '../lib/types';
import { Change, Cover, MusicLoader, number } from './UI';

export function LiveCharts({ chart, busy, online, timezone, updatedAt, onRefresh, onDetail }: { chart: ChartWeek | null; busy: boolean; online: boolean; timezone: string; updatedAt: number; onRefresh: () => void; onDetail: (item: Item) => void }) {
  const [automatic, setAutomatic] = useState(false), [tick, setTick] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setTick(Date.now()), 30000); return () => clearInterval(timer); }, []);
  useEffect(() => { if (!automatic || !online) return; const timer = setInterval(() => { if (!busy && !document.hidden) onRefresh(); }, 120000); return () => clearInterval(timer); }, [automatic, online, busy, onRefresh]);
  const remaining = Math.max(0, Math.ceil(((chart?.end ?? 0) * 1000 - tick) / 3600_000));
  return <section className="panel live-charts"><div className="panel-heading"><div><span className="live-label"><i/> LIVE CHARTS</span><h2>A corrida pelo próximo #1</h2><p>{chart?.label ?? 'Aguardando calendário'} · fechamento em {remaining}h ({timezone})</p></div><button type="button" className="button primary" disabled={busy || !online} onClick={onRefresh}>{busy ? <MusicLoader size="sm"/> : <RefreshCw size={16}/>} Atualizar agora</button></div><div className="live-controls"><label><input type="checkbox" checked={automatic} onChange={e => setAutomatic(e.target.checked)}/> Atualizar a cada 2 minutos enquanto esta tela estiver aberta</label><small>{!online ? 'Offline · mostrando o último retrato salvo.' : updatedAt ? `Dados recebidos às ${new Date(updatedAt).toLocaleTimeString('pt-BR', { timeZone: timezone })}` : 'Sincronize para começar a corrida.'}</small></div><p className="note"><Radio size={14}/> Prévia da semana aberta, sujeita a mudanças. As posições usam plays recebidos do Last.fm e a variação compara com o último fechamento. Estes números não entram em prêmios, conquistas, vídeos ou históricos.</p>
    {!chart || chart.status !== 'loaded' ? <p className="note">A semana atual ainda não foi baixada. Toque em Atualizar agora.</p> : !chart.entries.length ? <p className="note">Nenhuma reprodução recebida nesta semana até agora.</p> : <ol className="live-ranking">{chart.entries.map(e => <li key={e.id}><b className={e.rank === 1 ? 'gold' : ''}>{String(e.rank).padStart(2, '0')}</b><Cover item={e}/><button type="button" className="text-button truncate" onClick={() => onDetail(e)}><strong>{e.name}</strong><small>{e.artist}</small></button><Change value={e.change}/><strong>{number(e.plays)}<small>plays</small></strong></li>)}</ol>}
  </section>;
}
