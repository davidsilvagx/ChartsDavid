import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, FileUp, Info, Square, UserPlus, Users } from 'lucide-react';
import { ApiError, fetchWeek, getProfile } from '../lib/api';
import { makeWeeks, weekKey } from '../lib/calendar';
import { compareProfiles, sameProfile, type ProfileComparison } from '../lib/compare';
import { download, parseBackup, shareCardPDF } from '../lib/export';
import { importWeeks, readWeeks, saveWeek } from '../lib/storage';
import { cacheImageUrl } from '../lib/canvas';
import type { CachedWeek, Kind, Profile, Settings, SourceFilter, Week } from '../lib/types';
import { Cover, MusicLoader, number } from './UI';

const pct = (v: number) => `${(v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%`;

/** Segundo perfil em namespace próprio (usuário + calendário). Nada sobrescreve o histórico do primeiro. */
export function Compare({ settings, cached, owner, year, source, dark }: { settings: Settings; cached: CachedWeek[]; owner: string; year: string; source: SourceFilter; dark: boolean }) {
  const memoryKey = `lastchart-compare:v1:${settings.user.toLowerCase()}`;
  const [username, setUsername] = useState(() => { try { return localStorage.getItem(memoryKey) ?? ''; } catch { return ''; } });
  const [other, setOther] = useState<{ settings: Settings; profile: Profile | null; cached: CachedWeek[]; origin: 'lastfm' | 'arquivo' } | null>(null);
  const [kind, setKind] = useState<Kind>('tracks'), [busy, setBusy] = useState(''), [error, setError] = useState(''), [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [exporting, setExporting] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);

  const weeks = useMemo(() => makeWeeks(settings), [settings.startDate, settings.timezone]);
  const range = useMemo(() => {
    const chosen = year === 'all' ? weeks.slice(-52) : weeks.filter(w => w.year === Number(year));
    return { weeks: chosen, start: chosen[0]?.start ?? 0, end: Math.min(chosen.at(-1)?.end ?? 0, Math.floor(Date.now() / 1000)) };
  }, [weeks, year]);
  const label = year === 'all' ? 'Últimas 52 semanas' : `Semanas iniciadas em ${year}`;
  const result: ProfileComparison | null = useMemo(() => other ? compareProfiles({ name: owner, cached }, { name: other.profile?.name ?? other.settings.user, cached: other.cached }, { kind, start: range.start, end: range.end, source, deduplicate: settings.deduplicate, totalWeeks: range.weeks.length, limit: 15 }) : null, [other, owner, cached, kind, range, source, settings.deduplicate]);

  const loadProfile = async () => {
    const name = username.trim();
    setError('');
    if (!/^[\w.-]{2,100}$/.test(name)) { setError('Digite um nome de usuário Last.fm válido.'); return; }
    if (sameProfile(name, settings.user)) { setError('Este é o seu próprio perfil. Escolha outra pessoa para comparar.'); return; }
    controller.current?.abort(); const abort = new AbortController(); controller.current = abort;
    setBusy('Verificando perfil…');
    try {
      const otherSettings: Settings = { ...settings, user: name, aliases: [] };
      const profile = await getProfile(otherSettings, abort.signal);
      try { localStorage.setItem(memoryKey, profile.name); } catch { /* opcional */ }
      const stored = await readWeeks({ ...otherSettings, user: profile.name });
      setOther({ settings: { ...otherSettings, user: profile.name }, profile, cached: stored, origin: 'lastfm' });
    } catch (e) {
      if (!abort.signal.aborted) setError(e instanceof ApiError && e.code === 6 ? 'Perfil Last.fm não encontrado.' : e instanceof ApiError && e.code === 17 ? 'Este perfil mantém o histórico privado no Last.fm.' : e instanceof Error ? e.message : 'Não foi possível verificar o perfil.');
    } finally { setBusy(''); }
  };

  const syncOther = async () => {
    if (!other || other.origin !== 'lastfm') return;
    controller.current?.abort(); const abort = new AbortController(); controller.current = abort;
    const have = new Map(other.cached.map(w => [w.week.id, w]));
    const todo: Week[] = range.weeks.filter(w => !have.has(w.id) || w.partial || have.get(w.id)!.cutoff < Math.min(w.end, Date.now() / 1000 - 3600));
    setError(''); setProgress({ done: 0, total: todo.length }); setBusy('Baixando semanas do segundo perfil…');
    try {
      for (const [i, week] of todo.entries()) {
        const fetched = await fetchWeek(other.settings, week, abort.signal, () => {});
        await saveWeek({ key: weekKey(other.settings, week.id), week, scrobbles: fetched.scrobbles, fetchedAt: Date.now(), cutoff: fetched.cutoff, duplicates: fetched.duplicates, lastfmSynced: true });
        setProgress({ done: i + 1, total: todo.length });
      }
    } catch (e) {
      if (!abort.signal.aborted) setError(e instanceof Error ? `${e.message} As semanas já baixadas foram mantidas.` : 'Falha ao baixar. As semanas concluídas foram mantidas.');
    } finally {
      const stored = await readWeeks(other.settings).catch(() => other.cached);
      setOther(current => current && current.settings.user === other.settings.user ? { ...current, cached: stored } : current);
      setBusy(''); setProgress(null);
    }
  };

  const importOther = async (file?: File) => {
    if (!file) return;
    setError(''); setBusy('Lendo arquivo do segundo perfil…');
    try {
      if (file.size > 100 * 1024 * 1024) throw new Error('O backup deve ter menos de 100 MB.');
      const backup = parseBackup(await file.text());
      if (sameProfile(backup.settings.user, settings.user)) throw new Error('Este backup é do seu próprio perfil. Para restaurá-lo, use Ajustes › Importar backup.');
      await importWeeks(backup.settings, backup.weeks);
      setOther({ settings: backup.settings, profile: null, cached: await readWeeks(backup.settings), origin: 'arquivo' });
      setUsername(backup.settings.user);
    } catch (e) { setError(e instanceof Error ? e.message : 'Arquivo inválido.'); } finally { setBusy(''); }
  };

  const share = async (pdf: boolean) => {
    if (!result) return;
    setExporting(true);
    try {
      const png = await renderCompareCard(result, label, dark);
      download(pdf ? await shareCardPDF(png) : png, `lastchart-comparacao.${pdf ? 'pdf' : 'png'}`);
    } catch { setError('Não foi possível criar o card.'); } finally { setExporting(false); }
  };

  return <div className="compare">
    <div className="awards-intro"><Users size={40} /><div><h3>Compare com outro perfil</h3><p>Mesmo intervalo civil e fuso ({settings.timezone}), mesmo tipo de item. {label}. O segundo histórico fica separado do seu e não é publicado.</p></div></div>
    <form className="compare-form" onSubmit={e => { e.preventDefault(); void loadProfile(); }}>
      <label>Perfil Last.fm<input aria-label="Usuário Last.fm do segundo perfil" placeholder="ex.: nome_de_usuario" value={username} maxLength={100} onChange={e => setUsername(e.target.value)} /></label>
      <button type="submit" className="button" disabled={!!busy}>{busy === 'Verificando perfil…' ? <MusicLoader size="sm" /> : <UserPlus size={16} />}<span>Verificar</span></button>
      <label className="button"><FileUp size={16} /><span>Importar backup</span><input type="file" accept="application/json,.json" className="sr-only" aria-label="Importar backup do segundo perfil" onChange={e => { void importOther(e.target.files?.[0]); e.target.value = ''; }} /></label>
    </form>
    {error && <p className="alert error" role="alert">{error}</p>}
    {other && <div className="compare-sync">
      <div><strong>{other.profile?.name ?? other.settings.user}</strong><small>{other.origin === 'arquivo' ? `Arquivo importado · calendário ${other.settings.startDate} (${other.settings.timezone})` : `${number(other.profile?.playcount ?? 0)} scrobbles no Last.fm`}</small></div>
      {other.origin === 'lastfm' && (progress ? <><progress max={progress.total || 1} value={progress.done} aria-label="Progresso do segundo perfil" /><span>{progress.done}/{progress.total} semanas</span><button type="button" className="button small" onClick={() => controller.current?.abort()}><Square size={13} /><span>Parar</span></button></>
        : <button type="button" className="button small primary" disabled={!!busy} onClick={() => void syncOther()}><Download size={15} /><span>Baixar {label.toLowerCase()}</span></button>)}
    </div>}
    {result && <>
      <div className="segmented compact-seg" role="group" aria-label="Tipo de comparação">{(['tracks', 'albums', 'artists'] as Kind[]).map(k => <button key={k} type="button" className={kind === k ? 'selected' : ''} aria-pressed={kind === k} onClick={() => setKind(k)}>{k === 'tracks' ? 'Músicas' : k === 'albums' ? 'Álbuns' : 'Artistas'}</button>)}</div>
      <div className="compare-sides">{[result.a, result.b].map(side => <div key={side.name} className="compare-side"><strong>{side.name}</strong><span>{number(side.plays)} reproduções · {number(side.items)} itens</span><small className={side.coverage < .999 ? 'is-partial' : ''}>Cobertura {pct(side.coverage)} · {side.coveredWeeks}/{side.totalWeeks} semanas baixadas</small></div>)}</div>
      <section className="insight-card compare-overlap">
        <h3>Sobreposição de gosto</h3>
        <p><Info size={14} /> Para cada item em comum, pegamos a menor fatia entre os dois perfis (reproduções do item ÷ total do período) e somamos. 0% = nada em comum; 100% = mesma distribuição. Não mede qualidade nem amizade.</p>
        {result.overlap === null ? <p className="note">Sem reproduções em um dos lados neste período. Baixe as semanas do segundo perfil ou escolha outra época.</p> : <strong className="insight-big">{result.overlap.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</strong>}
        {(result.a.coverage < .999 || result.b.coverage < .999) && <p className="note">Coberturas diferentes: semanas não baixadas não contam como zero e podem mudar o resultado.</p>}
      </section>
      <div className="compare-lists">
        <section><h4>Em comum · {result.shared.length}</h4>{result.shared.length ? <ol><li className="compare-head" aria-hidden="true"><span /><span>Posição e plays no período</span><b className="truncate">{result.a.name}</b><b className="truncate">{result.b.name}</b></li>{result.shared.map(item => <li key={item.id}><Cover item={{ ...item, album: '' }} /><span className="truncate"><strong>{item.name}</strong><small>{item.artist}</small></span><span className="compare-ranks"><b>#{item.rankA}</b><small>{number(item.playsA)}</small></span><span className="compare-ranks"><b>#{item.rankB}</b><small>{number(item.playsB)}</small></span></li>)}</ol> : <p className="note">Nenhum item em comum neste período.</p>}</section>
        <section><h4>Só {result.a.name}</h4><ol>{result.onlyA.slice(0, 8).map(item => <li key={item.id}><Cover item={item} /><span className="truncate"><strong>{item.name}</strong><small>{item.artist} · {number(item.plays)}</small></span></li>)}</ol></section>
        <section><h4>Só {result.b.name}</h4><ol>{result.onlyB.slice(0, 8).map(item => <li key={item.id}><Cover item={item} /><span className="truncate"><strong>{item.name}</strong><small>{item.artist} · {number(item.plays)}</small></span></li>)}</ol></section>
      </div>
      <div className="spotlight-export"><span>Compartilhar manualmente</span><button type="button" className="button small" disabled={exporting} onClick={() => void share(false)}>{exporting ? <MusicLoader size="sm" /> : <Download size={15} />}<span>Card PNG</span></button><button type="button" className="button small" disabled={exporting} onClick={() => void share(true)}>PDF</button><small>O card mostra nomes públicos, período e números reais; nada é publicado automaticamente.</small></div>
    </>}
  </div>;
}

async function renderCompareCard(result: ProfileComparison, period: string, dark: boolean) {
  const canvas = document.createElement('canvas'); canvas.width = 1080; canvas.height = 1350;
  const ctx = canvas.getContext('2d')!;
  await Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 1200))]);
  const covers = await Promise.all(result.shared.slice(0, 5).map(item => cacheImageUrl(item.image)));
  const bg = dark ? '#090e17' : '#f3f5fa', fg = dark ? '#f6f8fc' : '#111c2e', muted = dark ? '#a3b3c8' : '#586a80', accent = dark ? '#43dfa1' : '#067a60';
  ctx.fillStyle = bg; ctx.fillRect(0, 0, 1080, 1350);
  if (covers[0]) { ctx.save(); ctx.globalAlpha = .38; ctx.filter = 'blur(42px)'; ctx.drawImage(covers[0], -160, -40, 1400, 1400); ctx.restore(); }
  const fade = ctx.createLinearGradient(0, 0, 0, 1100); fade.addColorStop(0, dark ? 'rgba(9,14,23,.1)' : 'rgba(243,245,250,.15)'); fade.addColorStop(1, dark ? 'rgba(9,14,23,.82)' : 'rgba(243,245,250,.78)'); ctx.fillStyle = fade; ctx.fillRect(0, 0, 1080, 1350);
  const font = (w: number, s: number) => `${w} ${s}px 'Plus Jakarta Sans',sans-serif`;
  const text = (value: string, x: number, y: number, width: number) => { let s = value; while (s.length > 1 && ctx.measureText(s).width > width) s = s.slice(0, -1); ctx.fillText(s === value ? s : `${s.slice(0, -1)}…`, x, y); };
  ctx.fillStyle = accent; ctx.font = font(800, 23); ctx.fillText('LASTCHART · COMPARAÇÃO', 64, 76);
  ctx.fillStyle = fg; ctx.font = font(800, 50); text(`${result.a.name} × ${result.b.name}`, 64, 150, 952);
  ctx.fillStyle = muted; ctx.font = font(500, 22); text(`${period} · cobertura ${pct(result.a.coverage)} / ${pct(result.b.coverage)}`, 64, 194, 952);
  ctx.fillStyle = accent; ctx.font = font(800, 120); ctx.fillText(result.overlap === null ? '—' : `${result.overlap.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`, 64, 350);
  ctx.fillStyle = muted; ctx.font = font(600, 24); ctx.fillText('sobreposição de gosto (soma das menores fatias)', 64, 395);
  result.shared.slice(0, 5).forEach((item, i) => {
    const y = 450 + i * 150;
    ctx.fillStyle = dark ? 'rgba(255,255,255,.05)' : 'rgba(255,255,255,.72)'; ctx.beginPath(); ctx.roundRect(48, y, 984, 130, 24); ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.roundRect(70, y + 13, 104, 104, 18); ctx.clip(); ctx.fillStyle = dark ? '#203047' : '#dbe4ef'; ctx.fillRect(70, y + 13, 104, 104); if (covers[i]) ctx.drawImage(covers[i]!, 70, y + 13, 104, 104); ctx.restore();
    ctx.fillStyle = fg; ctx.font = font(750, 28); text(item.name, 198, y + 52, 560); ctx.fillStyle = muted; ctx.font = font(500, 22); text(item.artist, 198, y + 88, 560);
    ctx.fillStyle = accent; ctx.font = font(700, 22); ctx.textAlign = 'right'; ctx.fillText(`#${item.rankA} · #${item.rankB}`, 1006, y + 52); ctx.fillStyle = muted; ctx.fillText(`${item.playsA.toLocaleString('pt-BR')} · ${item.playsB.toLocaleString('pt-BR')} plays`, 1006, y + 88); ctx.textAlign = 'left';
  });
  ctx.fillStyle = muted; ctx.font = font(500, 18); ctx.fillText('Dados públicos do Last.fm baixados no período indicado', 64, 1270);
  ctx.globalAlpha = .65; ctx.font = font(500, 15); ctx.fillText('feito com ❤️ por william santos', 64, 1313); ctx.globalAlpha = 1;
  return new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('card')), 'image/png'));
}
