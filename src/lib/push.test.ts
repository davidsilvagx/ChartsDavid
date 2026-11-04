import { describe, expect, it } from 'vitest';
import { handlePush, inQuiet, memoryPushStore, planPush, subscriptionId, validateSubscription, weekStart } from '../../server/push.mjs';

const sub = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: 'p', auth: 'a' } };
describe('Notificações com o app fechado', () => {
  it('valida assinatura e recusa serviços desconhecidos', () => {
    expect(validateSubscription({ subscription: sub, user: 'RJ', timezone: 'UTC' })).toBe('');
    expect(validateSubscription({ subscription: { ...sub, endpoint: 'https://evil.example/x' }, user: 'RJ', timezone: 'UTC' })).toMatch(/não reconhecido/);
    expect(validateSubscription({ subscription: sub, user: 'a b', timezone: 'UTC' })).toMatch(/inválido/);
    expect(validateSubscription({ subscription: sub, user: 'RJ', timezone: 'Lua/Base' })).toMatch(/Fuso/);
  });
  it('semana começa na sexta 00:00 do fuso, inclusive com fuso negativo', () => {
    const now = Date.parse('2026-11-04T12:00:00Z'); // quarta
    expect(weekStart(now, 'UTC')).toEqual({ id: '2026-10-30', start: Date.parse('2026-10-30T00:00:00Z') / 1000 });
    expect(weekStart(now, 'America/Sao_Paulo')).toEqual({ id: '2026-10-30', start: Date.parse('2026-10-30T03:00:00Z') / 1000 });
    expect(inQuiet({ quietStart: '22:00', quietEnd: '08:00' }, Date.parse('2026-11-04T23:30:00Z'), 'UTC')).toBe(true);
  });
  it('avisa novo #1 e recorde só quando muda, sem repetir', () => {
    const w = (id: string, plays: number, name: string) => ({ id, plays, leader: { key: name.toLowerCase(), name, artist: 'X', plays: 9 } });
    let r = planPush({}, w('2026-10-30', 50, 'A'), {});
    expect(r.notifications).toHaveLength(0);
    r = planPush(r.state, w('2026-10-30', 60, 'B'), {});
    expect(r.notifications[0].title).toMatch(/Novo #1 da semana: B/);
    r = planPush(r.state, w('2026-10-30', 70, 'B'), {});
    expect(r.notifications).toHaveLength(0);
    r = planPush(r.state, w('2026-11-06', 10, 'C'), {});
    expect(r.notifications[0].title).toMatch(/Começou a semana com C/);
    expect(r.state.bestWeek).toBe(70);
    r = planPush(r.state, w('2026-11-06', 90, 'C'), {});
    expect(r.notifications.map(n => n.tag)).toEqual(['rec:2026-11-06']);
    expect(planPush(r.state, w('2026-11-06', 95, 'D'), { types: { 'number-one': false, record: false } }).notifications).toEqual([]);
  });
  it('rotas: sem configuração 503; assinar, atualizar e cancelar; cron exige segredo', async () => {
    const store = memoryPushStore();
    const env = { VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv', CRON_SECRET: 's' };
    const call = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => handlePush(new Request(`http://x${path}`, { method, body: body ? JSON.stringify(body) : undefined, headers }), env, store, { setVapidDetails() {}, async sendNotification() {} });
    expect((await handlePush(new Request('http://x/api/push'), {}, store, {})).status).toBe(503);
    expect(await (await call('GET', '/api/push')).json()).toEqual({ publicKey: 'pub' });
    expect((await call('POST', '/api/push', { subscription: sub, user: 'RJ', timezone: 'UTC', prefs: { quietStart: '23:00', quietEnd: '07:00' } })).status).toBe(200);
    expect((await store.load(subscriptionId(sub.endpoint))).prefs.quietStart).toBe('23:00');
    expect((await call('GET', '/api/push-cron')).status).toBe(401);
    expect((await call('DELETE', `/api/push?endpoint=${encodeURIComponent(sub.endpoint)}`)).status).toBe(200);
    expect(await store.all()).toEqual([]);
  });
});
