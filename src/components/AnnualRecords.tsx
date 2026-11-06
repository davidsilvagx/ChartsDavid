import { useEffect, useMemo, useState } from 'react';
import { Trophy } from 'lucide-react';
import type { annualRecords } from '../lib/annualRecords';
import type { CachedWeek, Settings, SourceFilter } from '../lib/types';
import { Cover, MusicLoader, number } from './UI';

export function AnnualRecords({ cached, settings, source, initialYear }: { cached: CachedWeek[]; settings: Settings; source: SourceFilter; initialYear: string }) {
  const years = useMemo(() => [...new Set(cached.map(w => w.week.year))].sort((a, b) => b - a), [cached]);
  const [chosen, setChosen] = useState(initialYear), [result, setResult] = useState<ReturnType<typeof annualRecords> | null>(null), [error, setError] = useState('');
  const year = years.includes(Number(chosen)) ? Number(chosen) : years[0];
  useEffect(() => { setResult(null); setError(''); if (!year) return; const worker = new Worker(new URL('../workers/annual.worker.ts', import.meta.url), { type: 'module' }); worker.onmessage = ({ data }) => { if (data.error) setError(data.error); else setResult(data.result); worker.terminate(); }; worker.onerror = () => { setError('Não foi possível calcular os recordes anuais.'); worker.terminate(); }; worker.postMessage({ cached, settings, source, year }); return () => worker.terminate(); }, [cached, settings, source, year]);
  return <section className="annual-records"><div className="panel-heading"><div><span className="eyebrow">CHARTS & PRÊMIOS</span><h3><Trophy size={20}/> As maiores eras de {year ?? 'cada ano'}</h3></div><select aria-label="Ano dos recordes anuais" value={year ?? ''} onChange={e => setChosen(e.target.value)}>{years.map(y => <option key={y}>{y}</option>)}</select></div>
    {!year ? <p className="note">Sincronize semanas encerradas para descobrir seus recordes anuais.</p> : error ? <p role="alert">{error}</p> : !result ? <div className="spotlight-loading" role="status"><MusicLoader size="sm"/> Calculando a sua era…</div> : <><p className="note">{result.loaded}/{result.total} semanas encerradas baixadas. Ano atribuído pela sexta-feira inicial de cada chart. Empates mantêm o mesmo valor; ordem alfabética ou plays organiza a exibição. {result.missingBefore && 'Há lacunas anteriores: estreias e revelações só aparecem quando puderem ser confirmadas.'}</p><div className="annual-grid">
    <article><h4>Hits no topo</h4><p>Artistas com mais músicas diferentes em #1 no ano.</p><ol>{result.numberOnes.map(r => <li key={r.name}><strong>{r.name}</strong><span>{r.count} músicas em #1</span></li>)}</ol></article>
    {(['artists', 'albums'] as const).map(kind => <article key={kind}><h4>{kind === 'artists' ? 'Headliners do ano' : 'Álbuns que dominaram'}</h4><p>Mais reproduções nas semanas encerradas do ano.</p><ol>{result[kind].map(item => <li key={item.id}><Cover item={item}/><div><strong>{item.name}</strong>{kind === 'albums' && <small>{item.artist}</small>}</div><span>{number(item.plays)} plays</span></li>)}</ol></article>)}
    <article><h4>Cheguei causando</h4><p>Estreias confirmadas: melhor posição, depois plays na semana.</p><ol>{result.debuts.map(e => <li key={e.id}><strong>#{e.rank} · {e.name}<small>{e.artist} · {e.label}</small></strong><span>{e.plays} plays</span></li>)}</ol>{!result.debuts.length && <small>Sem estreias confirmadas. Lacunas não viram estreias.</small>}</article>
    <article><h4>Ocupou o chart inteiro</h4><p>Maior número de músicas simultâneas por artista no ano.</p>{result.simultaneous.map(r => <details key={r.name}><summary>{r.name} · {r.count} músicas</summary><small>{r.week} · primeira semana do máximo</small><ol>{r.songs.map(s => <li key={s.id}><span>{s.name}</span><small>{s.album || 'Álbum não informado'}</small></li>)}</ol></details>)}</article>
    <article><h4>Revelação da sua era</h4><p>Mais plays entre artistas cuja primeira entrada confirmada no seu Top 100 aconteceu neste ano. Não é a estreia profissional.</p><ol>{result.breakthrough.map(a => <li key={a.id}><Cover item={a}/><strong>{a.name}</strong><span>{number(a.plays)} plays</span></li>)}</ol>{!result.breakthrough.length && <small>Nenhuma revelação confirmada com os dados disponíveis.</small>}</article>
    </div></>}
  </section>;
}
