import { useEffect, useMemo, useState } from 'react';
import { BellRing, BellOff, CloudSun, Send } from 'lucide-react';
import { detectMilestones, milestoneLabels, planDelivery, sanitizePrefs, type MilestoneType, type NotificationPrefs } from '../lib/milestones';
import type { ChartWeek } from '../lib/types';

export const notifyPrefsKey = (user: string) => `lastchart-notify:v1:${user.trim().toLowerCase()}`;
const deliveredKey = (user: string) => `lastchart-notified:v1:${user.trim().toLowerCase()}`;
export function readNotifyPrefs(user: string): NotificationPrefs { try { return sanitizePrefs(JSON.parse(localStorage.getItem(notifyPrefsKey(user)) ?? 'null')); } catch { return sanitizePrefs(null); } }
// Horário sempre em 24 h (o seletor nativo de hora segue o idioma do sistema e pode mostrar AM/PM).
const halfHours = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`);
const supported = () => typeof window !== 'undefined' && 'Notification' in window;

async function show(title: string, body: string, tag: string) {
  const options: NotificationOptions = { body, tag, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', lang: 'pt-BR' };
  // Android exige notificação via Service Worker; no desktop sem SW (desenvolvimento) usa o construtor.
  const registration = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration().catch(() => undefined) : undefined;
  if (registration) await registration.showNotification(title, options); else new Notification(title, options);
}

/** Entrega marcos enquanto o app está aberto (ou ao reabrir). Não há push com o PWA fechado. */
export function useMilestoneNotifications(user: string, charts: ChartWeek[], computing: boolean, timeZone: string) {
  useEffect(() => {
    if (computing || !charts.length || !supported() || Notification.permission !== 'granted') return;
    const prefs = readNotifyPrefs(user);
    if (!prefs.enabled) return;
    const timer = setTimeout(() => {
      let state: { ids: string[]; day: string | null } = { ids: [], day: null };
      try { state = { ids: [], day: null, ...JSON.parse(localStorage.getItem(deliveredKey(user)) ?? '{}') }; } catch { /* vazio */ }
      const plan = planDelivery(detectMilestones(charts, Date.now(), timeZone), prefs, new Set(state.ids), state.day, Date.now(), timeZone);
      if (!plan.send.length && !plan.mark.length) return;
      void Promise.all(plan.send.map(n => show(n.title, n.body, n.id))).then(() => {
        try { localStorage.setItem(deliveredKey(user), JSON.stringify({ ids: [...state.ids, ...plan.mark].slice(-500), day: plan.day })); } catch { /* opcional */ }
      }).catch(() => {});
    }, 1500);
    return () => clearTimeout(timer);
  }, [user, charts, computing, timeZone]);
}

const b64ToBytes = (b64: string) => { const pad = '='.repeat((4 - (b64.length % 4)) % 4); const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(raw, c => c.charCodeAt(0)); };
type PushState = 'checking' | 'off' | 'on' | 'unsupported' | 'busy';
/** Assinatura Web Push: avisos diários mesmo com o app fechado (cron do servidor). */
function usePush(user: string, timeZone: string, prefs: NotificationPrefs, onError: (s: string) => void) {
  const [state, setState] = useState<PushState>('checking');
  const supported = typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window;
  const registration = async () => supported ? navigator.serviceWorker.getRegistration() : undefined;
  useEffect(() => { if (!supported) { setState('unsupported'); return; } void registration().then(async reg => setState(reg && await reg.pushManager.getSubscription() ? 'on' : 'off')).catch(() => setState('off')); }, []);
  const send = async (sub: PushSubscription) => {
    const response = await fetch('/api/push', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscription: sub.toJSON(), user, timezone: timeZone, prefs }) });
    if (!response.ok) throw new Error((await response.json().catch(() => ({}))).message ?? 'Servidor recusou a assinatura.');
  };
  // Mantém as preferências do servidor iguais às do aparelho.
  useEffect(() => { if (state !== 'on') return; const t = setTimeout(() => void registration().then(reg => reg?.pushManager.getSubscription()).then(sub => sub && send(sub)).catch(() => {}), 800); return () => clearTimeout(t); }, [state, user, timeZone, prefs.types['number-one'], prefs.types.record, prefs.quietStart, prefs.quietEnd]);
  const enable = async () => {
    setState('busy');
    try {
      const reg = await registration();
      if (!reg) throw new Error('Abra o app publicado (ou instalado) para ativar: o modo de desenvolvimento não tem Service Worker.');
      const config = await fetch('/api/push').then(r => r.json()).catch(() => ({}));
      if (!config.publicKey) throw new Error('Push ainda não configurado no servidor.');
      const sub = await reg.pushManager.getSubscription() ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(config.publicKey) });
      await send(sub);
      setState('on');
    } catch (e) { onError(e instanceof Error ? e.message : 'Não foi possível ativar.'); setState('off'); }
  };
  const disable = async () => {
    setState('busy');
    try { const sub = await (await registration())?.pushManager.getSubscription(); if (sub) { await fetch(`/api/push?endpoint=${encodeURIComponent(sub.endpoint)}`, { method: 'DELETE' }).catch(() => {}); await sub.unsubscribe(); } }
    finally { setState('off'); }
  };
  return { state, enable, disable };
}

export function NotificationsPanel({ user, charts, timeZone, onError, onNotice }: { user: string; charts: ChartWeek[]; timeZone: string; onError: (s: string) => void; onNotice: (s: string) => void }) {
  const [prefs, setPrefs] = useState<NotificationPrefs>(() => readNotifyPrefs(user));
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(() => supported() ? Notification.permission : 'unsupported');
  useEffect(() => { setPrefs(readNotifyPrefs(user)); }, [user]);
  const save = (next: NotificationPrefs) => { setPrefs(next); try { localStorage.setItem(notifyPrefsKey(user), JSON.stringify(next)); } catch { onError('Não foi possível salvar as preferências.'); } };
  const recent = useMemo(() => detectMilestones(charts, Date.now(), timeZone).slice(0, 6), [charts, timeZone]);
  const push = usePush(user, timeZone, prefs, onError);
  const enable = async (on: boolean) => {
    if (!on) { save({ ...prefs, enabled: false }); return; }
    if (!supported()) { onError('Este navegador não oferece notificações.'); return; }
    // A permissão só é pedida aqui, depois do toque explícito.
    const result = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
    setPermission(result);
    if (result !== 'granted') { onError(result === 'denied' ? 'Notificações bloqueadas no navegador. Libere nas permissões do site para ativar.' : 'Permissão não concedida.'); return; }
    save({ ...prefs, enabled: true });
    onNotice('Notificações de marcos ativadas neste aparelho.');
  };
  return <div className="notify-panel">
    <label className="switch-row"><span>Avisar sobre marcos<small>{permission === 'unsupported' ? 'Indisponível neste navegador.' : permission === 'denied' ? 'Bloqueado nas permissões do navegador.' : permission === 'granted' ? 'Permissão concedida neste aparelho.' : 'Pediremos permissão ao ativar.'}</small></span><input type="checkbox" role="switch" checked={prefs.enabled && permission === 'granted'} disabled={permission === 'unsupported'} onChange={e => void enable(e.target.checked)} /></label>
    <fieldset className="notify-types" disabled={!prefs.enabled}><legend>Tipos</legend>{(Object.keys(milestoneLabels) as MilestoneType[]).map(type => <label key={type} className="check-row"><input type="checkbox" checked={prefs.types[type]} onChange={e => save({ ...prefs, types: { ...prefs.types, [type]: e.target.checked } })} /><span>{milestoneLabels[type]}</span></label>)}</fieldset>
    <div className="notify-grid">
      <label>Frequência<select value={prefs.frequency} disabled={!prefs.enabled} onChange={e => save({ ...prefs, frequency: e.target.value as NotificationPrefs['frequency'] })}><option value="daily">Resumo diário</option><option value="each">A cada marco</option></select></label>
      <label>Silêncio das<select aria-label="Início do horário silencioso" value={prefs.quietStart} disabled={!prefs.enabled} onChange={e => save({ ...prefs, quietStart: e.target.value })}>{halfHours.map(t => <option key={t} value={t}>{t}</option>)}</select></label>
      <label>até<select aria-label="Fim do horário silencioso" value={prefs.quietEnd} disabled={!prefs.enabled} onChange={e => save({ ...prefs, quietEnd: e.target.value })}>{halfHours.map(t => <option key={t} value={t}>{t}</option>)}</select></label>
    </div>
    <label className="switch-row"><span><CloudSun size={15} /> Também com o app fechado<small>{push.state === 'unsupported' ? 'Este navegador não oferece push.' : 'Um aviso por dia, por volta das 19h (Brasília), com novo #1 da semana e recorde semanal, consultando o seu Last.fm. A entrega depende do navegador: pensado para o app instalado no celular (no iPhone, só pela tela inicial); no Opera de computador não chegou nos testes.'}</small></span><input type="checkbox" role="switch" aria-label="Notificações com o app fechado" checked={push.state === 'on'} disabled={push.state === 'unsupported' || push.state === 'busy' || push.state === 'checking' || !prefs.enabled || permission !== 'granted'} onChange={e => void (e.target.checked ? push.enable() : push.disable())} /></label>
    <small>Resumo diário: no máximo uma notificação por dia. A cada marco: até 3 por vez. Horário em 24 h no fuso {timeZone}. Com o app aberto, os marcos são verificados ao calcular os charts. Com o app fechado, o servidor verifica uma vez por dia (limite do plano gratuito do Vercel).</small>
    <div className="inline-actions"><button type="button" className="button small" disabled={permission !== 'granted'} onClick={() => void show('LastChart · teste', 'As notificações de marcos estão funcionando neste aparelho.', 'test').then(() => onNotice('Notificação de teste enviada.')).catch(() => onError('O navegador recusou a notificação.'))}><Send size={14} /><span>Testar</span></button></div>
    <div className="notify-recent"><strong>{recent.length ? <BellRing size={15} /> : <BellOff size={15} />} Marcos da semana mais recente baixada</strong>{recent.length ? <ul>{recent.map(m => <li key={m.id}><b>{milestoneLabels[m.type]}</b> {m.title}<small>{m.body}</small></li>)}</ul> : <small>Nenhum marco novo nos dados baixados. Isso não é falta de música: apenas nenhum critério foi atingido.</small>}</div>
  </div>;
}
