/**
 * Notificações com o app fechado (Web Push). A assinatura do navegador fica no Blob privado do projeto;
 * um cron diário do Vercel (Hobby: 1×/dia) consulta o Last.fm público de cada assinante e avisa
 * novo #1 da semana e recorde semanal. Sem dados de outras pessoas, sem rastreamento.
 */
import { createHash } from 'node:crypto';

const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const PUSH_HOSTS = /^(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[\w.-]+\.notify\.windows\.com|web\.push\.apple\.com|[\w.-]+\.push\.apple\.com|push\.opera\.com|[\w.-]+\.opera\.com)$/;
const hhmm = /^([01]\d|2[0-3]):([0-5]\d)$/;
export const subscriptionId = endpoint => createHash('sha256').update(endpoint).digest('hex').slice(0, 40);

export function validateSubscription(body) {
  const sub = body?.subscription, user = String(body?.user ?? '').trim();
  let host = '';
  try { host = new URL(sub?.endpoint).hostname; } catch { return 'Assinatura inválida.'; }
  if (!sub.endpoint.startsWith('https://') || !PUSH_HOSTS.test(host)) return 'Serviço de push não reconhecido.';
  if (typeof sub.keys?.p256dh !== 'string' || typeof sub.keys?.auth !== 'string') return 'Chaves da assinatura ausentes.';
  if (!/^[\w.-]{2,100}$/.test(user)) return 'Usuário do Last.fm inválido.';
  try { new Intl.DateTimeFormat('en', { timeZone: body.timezone }); } catch { return 'Fuso horário inválido.'; }
  return '';
}

export function memoryPushStore() {
  const map = new Map();
  return { async save(id, v) { map.set(id, v); }, async load(id) { return map.get(id) ?? null; }, async remove(id) { map.delete(id); }, async all() { return [...map.entries()].map(([id, value]) => ({ id, value })); } };
}
export function blobPushStore(token, sdk) {
  const path = id => `push/${id}.json`;
  return {
    async save(id, value) { await sdk.put(path(id), JSON.stringify(value), { access: 'private', token, contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 60 }); },
    async load(id) { const r = await sdk.get(path(id), { access: 'private', token, useCache: false }).catch(() => null); return r?.statusCode === 200 ? JSON.parse(await new Response(r.stream).text()) : null; },
    async remove(id) { await sdk.del([path(id)], { token }).catch(() => {}); },
    async all() {
      const out = []; let cursor;
      do { const page = await sdk.list({ prefix: 'push/', token, cursor }); for (const b of page.blobs) { const id = b.pathname.slice(5, -5); const value = await this.load(id); if (value) out.push({ id, value }); } cursor = page.hasMore ? page.cursor : undefined; } while (cursor);
      return out;
    },
  };
}

/** Sexta-feira 00:00 da semana atual no fuso do usuário (calendário ZeroCharts), em segundos. */
export function weekStart(now, timeZone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short' }).formatToParts(new Date(now)).map(p => [p.type, p.value]));
  const back = { Fri: 0, Sat: 1, Sun: 2, Mon: 3, Tue: 4, Wed: 5, Thu: 6 }[parts.weekday] ?? 0;
  const local = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) - back);
  const offset = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute)) - Math.floor(now / 60000) * 60000;
  return { id: new Date(local).toISOString().slice(0, 10), start: Math.floor((local - offset) / 1000) };
}
export function inQuiet(prefs, now, timeZone) {
  if (!hhmm.test(prefs?.quietStart ?? '') || !hhmm.test(prefs?.quietEnd ?? '')) return false;
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(now)).map(x => [x.type, x.value]));
  const m = Number(p.hour) * 60 + Number(p.minute), toMin = v => Number(v.slice(0, 2)) * 60 + Number(v.slice(3));
  const a = toMin(prefs.quietStart), b = toMin(prefs.quietEnd);
  return a === b ? false : a < b ? m >= a && m < b : m >= a || m < b;
}

/** Decide os avisos a partir do líder e do volume da semana atual; puro, para testes. */
export function planPush(state, week, prefs) {
  const out = [], next = { ...state };
  if (week.leader) {
    const key = `${week.id}:${week.leader.key}`;
    if (prefs?.types?.['number-one'] !== false && state.leaderKey !== key && state.leaderWeek === week.id && state.leaderKey) out.push({ tag: `n1:${key}`, title: `Novo #1 da semana: ${week.leader.name}`, body: `${week.leader.artist} assumiu o topo com ${week.leader.plays} reproduções.` });
    if (prefs?.types?.['number-one'] !== false && state.leaderWeek !== week.id && state.leaderWeek) out.push({ tag: `n1:${key}`, title: `Começou a semana com ${week.leader.name} no #1`, body: `${week.leader.artist} lidera com ${week.leader.plays} reproduções até agora.` });
    next.leaderKey = key; next.leaderWeek = week.id;
  }
  if (prefs?.types?.record !== false && state.bestWeek && week.plays > state.bestWeek && state.recordWeek !== week.id) { out.push({ tag: `rec:${week.id}`, title: 'Recorde semanal de reproduções', body: `${week.plays} reproduções nesta semana, acima do seu recorde anterior (${state.bestWeek}).` }); next.recordWeek = week.id; }
  if (state.lastWeekId && state.lastWeekId !== week.id) next.bestWeek = Math.max(state.bestWeek ?? 0, state.lastWeekPlays ?? 0);
  next.lastWeekId = week.id; next.lastWeekPlays = week.plays;
  return { notifications: out.slice(0, 2), state: next };
}

async function fetchWeek(user, timeZone, apiKey, now) {
  const { id, start } = weekStart(now, timeZone);
  const counts = new Map(); let plays = 0;
  for (let page = 1; page <= 15; page++) {
    const params = new URLSearchParams({ method: 'user.getrecenttracks', user, from: String(start), to: String(Math.floor(now / 1000)), limit: '200', page: String(page), api_key: apiKey, format: 'json' });
    const response = await fetch(`https://ws.audioscrobbler.com/2.0/?${params}`, { signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'LastChartStudioPro/1.0 (github.com/davidsilvagx/ChartsDavid)' } });
    const body = await response.json();
    const tracks = [body?.recenttracks?.track ?? []].flat();
    for (const t of tracks) {
      if (t?.['@attr']?.nowplaying === 'true' || !t?.date?.uts) continue;
      const artist = t.artist?.['#text'] ?? '', name = t.name ?? '', key = `${artist.toLowerCase()}::${name.toLowerCase()}`;
      const hit = counts.get(key) ?? { key, name, artist, plays: 0 }; hit.plays++; counts.set(key, hit); plays++;
    }
    if (page >= Number(body?.recenttracks?.['@attr']?.totalPages ?? 1)) break;
  }
  const leader = [...counts.values()].sort((a, b) => b.plays - a.plays || a.key.localeCompare(b.key))[0];
  return { id, plays, leader };
}

export async function handlePush(request, env, store, webpush) {
  const url = new URL(request.url);
  const configured = env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && store;
  if (url.pathname.endsWith('/push-cron')) {
    if (!configured) return json({ code: 'not-configured' }, 503);
    if (!env.CRON_SECRET || request.headers.get('authorization') !== `Bearer ${env.CRON_SECRET}`) return json({ code: 'unauthorized' }, 401);
    webpush.setVapidDetails('https://charts-david.vercel.app', env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
    const now = Date.now(), report = { subscribers: 0, sent: 0, removed: 0, errors: 0 };
    for (const { id, value } of await store.all()) {
      report.subscribers++;
      try {
        const week = await fetchWeek(value.user, value.timezone, env.LASTFM_API_KEY, now);
        const plan = planPush(value.state ?? {}, week, value.prefs);
        const quiet = inQuiet(value.prefs, now, value.timezone);
        for (const n of quiet ? [] : plan.notifications) {
          try { await webpush.sendNotification(value.subscription, JSON.stringify({ ...n, url: '/' }), { TTL: 6 * 3600 }); report.sent++; }
          catch (error) { if (error?.statusCode === 404 || error?.statusCode === 410) { await store.remove(id); report.removed++; break; } throw error; }
        }
        if (!quiet) await store.save(id, { ...value, state: plan.state, checkedAt: now });
      } catch { report.errors++; }
    }
    return json(report);
  }
  if (!configured) return json({ code: 'not-configured', message: 'Push não configurado neste servidor.' }, 503);
  if (request.method === 'GET') return json({ publicKey: env.VAPID_PUBLIC_KEY });
  if (request.method === 'POST') {
    const body = await request.json().catch(() => null);
    const problem = validateSubscription(body);
    if (problem) return json({ code: 'bad-subscription', message: problem }, 400);
    const id = subscriptionId(body.subscription.endpoint), previous = await store.load(id);
    const prefs = { types: { 'number-one': body.prefs?.types?.['number-one'] !== false, record: body.prefs?.types?.record !== false }, quietStart: hhmm.test(body.prefs?.quietStart ?? '') ? body.prefs.quietStart : '22:00', quietEnd: hhmm.test(body.prefs?.quietEnd ?? '') ? body.prefs.quietEnd : '08:00' };
    await store.save(id, { subscription: { endpoint: body.subscription.endpoint, keys: body.subscription.keys }, user: body.user.trim(), timezone: body.timezone, prefs, state: previous?.user?.toLowerCase() === body.user.trim().toLowerCase() ? previous.state ?? {} : {}, createdAt: previous?.createdAt ?? Date.now() });
    return json({ ok: true, id });
  }
  if (request.method === 'DELETE') {
    const endpoint = url.searchParams.get('endpoint') ?? '';
    if (!endpoint.startsWith('https://')) return json({ code: 'bad-endpoint' }, 400);
    await store.remove(subscriptionId(endpoint));
    return json({ ok: true });
  }
  return json({ code: 'method' }, 405);
}

export async function pushStoreFromEnv(env) {
  if (env.BLOB_READ_WRITE_TOKEN) return blobPushStore(env.BLOB_READ_WRITE_TOKEN, await import('@vercel/blob'));
  return null;
}
