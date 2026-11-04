import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { compareProfiles, coverage, sameProfile } from './compare';
import { defaultNotificationPrefs, detectMilestones, inQuietHours, planDelivery, sanitizePrefs } from './milestones';
import { applyProject, collectProject, decryptProject, deriveAccount, diffProjects, encryptProject, generateSyncKey, mergeProjects, normalizeSyncKey, parseProject } from './projectSync';
import { buildCharts } from './charts';
import { makeWeeks } from './calendar';
import { defaults, type CachedWeek } from './types';
import { handleSync, memoryStore } from '../../server/sync.mjs';

const weeks = makeWeeks(defaults, Date.parse('2016-07-22T12:00Z'));
const week = (i: number, plays: Array<[string, number]>, user = 'a'): CachedWeek => ({ key: `${user}:${weeks[i].id}`, week: weeks[i], cutoff: weeks[i].end, fetchedAt: 1, duplicates: 0,
  scrobbles: plays.flatMap(([track, n]) => Array.from({ length: n }, (_, k) => ({ timestamp: weeks[i].start + 60 * k + track.length, artist: 'Artista', track, album: 'Disco', image: '' }))) });

describe('F02 · comparação de perfis', () => {
  const a = [week(0, [['Comum', 6], ['Só A', 4]]), week(1, [['Comum', 2]])];
  const b = [week(0, [['Comum', 1], ['Só B', 9]], 'b')];
  const range = { start: weeks[0].start, end: weeks[2].end };
  it('compara o mesmo intervalo, com comuns, exclusivos, posições e sobreposição explicada', () => {
    const result = compareProfiles({ name: 'A', cached: a }, { name: 'B', cached: b }, { kind: 'tracks', ...range, totalWeeks: 3 });
    expect(result.a.plays).toBe(12);
    expect(result.b.plays).toBe(10);
    expect(result.shared).toEqual([expect.objectContaining({ name: 'Comum', playsA: 8, playsB: 1, rankA: 1, rankB: 2 })]);
    expect(result.onlyA.map(i => i.name)).toEqual(['Só A']);
    expect(result.onlyB.map(i => i.name)).toEqual(['Só B']);
    expect(result.overlap).toBeCloseTo(10);
  });
  it('cobertura diferente fica explícita e semana não baixada não vira zero', () => {
    expect(coverage(a, range.start, range.end).weeks).toBe(2);
    expect(coverage(b, range.start, range.end).ratio).toBeCloseTo(1 / 3);
    const empty = compareProfiles({ name: 'A', cached: a }, { name: 'B', cached: [] }, { kind: 'tracks', ...range, totalWeeks: 3 });
    expect(empty.b).toMatchObject({ plays: 0, coverage: 0 });
    expect(empty.overlap).toBeNull();
    expect(sameProfile(' Iknowjauregui', 'iknowjauregui')).toBe(true);
  });
});

describe('F05 · marcos e notificações', () => {
  const cached = [week(0, [['Alpha', 30]]), week(1, [['Alpha', 12], ['Beta', 9]]), week(2, [['Beta', 20]])];
  const charts = buildCharts(weeks, cached, 'tracks');
  it('detecta novo #1, certificação e deduplica', () => {
    const events = detectMilestones(charts, Date.parse('2016-07-22T12:00Z'), 'UTC');
    expect(events.map(e => e.type)).toEqual(expect.arrayContaining(['number-one', 'certification']));
    const prefs = { ...defaultNotificationPrefs, enabled: true, frequency: 'each' as const, quietStart: '00:00', quietEnd: '00:00' };
    const first = planDelivery(events, prefs, new Set(), null, Date.now(), 'UTC');
    expect(first.send.length).toBeGreaterThan(0);
    expect(planDelivery(events, prefs, new Set(first.mark), null, Date.now(), 'UTC').send).toHaveLength(0);
  });
  it('respeita opt-in, horário silencioso em 24 h, fuso e resumo diário', () => {
    const events = detectMilestones(charts, Date.now(), 'UTC');
    expect(planDelivery(events, defaultNotificationPrefs, new Set(), null, Date.now(), 'UTC').send).toHaveLength(0);
    const at23 = Date.parse('2026-11-04T23:30:00Z');
    expect(inQuietHours({ quietStart: '22:00', quietEnd: '08:00' }, at23, 'UTC')).toBe(true);
    expect(inQuietHours({ quietStart: '22:00', quietEnd: '08:00' }, at23, 'America/Sao_Paulo')).toBe(false);
    const daily = { ...defaultNotificationPrefs, enabled: true, quietStart: '00:00', quietEnd: '00:00' };
    const once = planDelivery(events, daily, new Set(), null, at23, 'UTC');
    expect(once.send).toHaveLength(1);
    expect(planDelivery(events.map(e => ({ ...e, id: `${e.id}:x` })), daily, new Set(once.mark), once.day, at23, 'UTC').send).toHaveLength(0);
    expect(sanitizePrefs({ quietStart: '25:00', frequency: 'x', enabled: 'yes' })).toMatchObject({ quietStart: '22:00', frequency: 'daily', enabled: false });
    expect(detectMilestones([], Date.now(), 'UTC')).toEqual([]);
  });
});

class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length() { return this.map.size; }
  clear() { this.map.clear(); }
  getItem(key: string) { return this.map.get(key) ?? null; }
  key(i: number) { return [...this.map.keys()][i] ?? null; }
  removeItem(key: string) { this.map.delete(key); }
  setItem(key: string, value: string) { this.map.set(key, String(value)); }
}

describe('F01 · projeto e sincronização', () => {
  it('coleta só preferências do projeto, sem chave de API nem tokens', async () => {
    const storage = new MemoryStorage();
    storage.setItem('lastchart-studio:settings:v1', JSON.stringify({ user: 'x', apiKey: 'segredo' }));
    storage.setItem('lastchart-studio:spotify-account:v1', '{"token":"t"}');
    storage.setItem('saved-eras:v1:x', '[]');
    const project = await collectProject(storage);
    expect(Object.keys(project.local).sort()).toEqual(['lastchart-studio:settings:v1', 'saved-eras:v1:x']);
    expect(project.local['lastchart-studio:settings:v1']).not.toContain('segredo');
    const target = new MemoryStorage();
    target.setItem('lastchart-studio:settings:v1', JSON.stringify({ user: 'y', apiKey: 'local' }));
    await applyProject(parseProject(JSON.stringify(project)), target);
    expect(JSON.parse(target.getItem('lastchart-studio:settings:v1')!)).toEqual({ user: 'x', apiKey: 'local' });
    expect(() => parseProject('{"app":"LastChartStudioPro","version":1,"weeks":[]}')).toThrow(/projeto/);
  });
  it('chave legível, cifragem ponta a ponta e chave errada falha', async () => {
    const key = generateSyncKey(n => new Uint8Array(n).fill(7));
    expect(key).toMatch(/^([0-9A-Z]{4}-){7}[0-9A-Z]{4}$/);
    expect(normalizeSyncKey(key.toLowerCase().replace(/-/g, ' '))).toBe(key);
    expect(() => normalizeSyncKey('curta')).toThrow();
    const account = await deriveAccount(key, 1000);
    const project = await collectProject(new MemoryStorage());
    const sealed = await encryptProject(account, project);
    expect(sealed.data).not.toContain('LastChartStudioPro');
    expect((await decryptProject(account, sealed)).app).toBe('LastChartStudioPro');
    const other = await deriveAccount(generateSyncKey(n => new Uint8Array(n).fill(9)), 1000);
    expect(other.id).not.toBe(account.id);
    await expect(decryptProject(other, sealed)).rejects.toThrow(/chave/);
  });
  it('conflitos mostram diferenças e a mescla preserva o aparelho', () => {
    const base = { app: 'LastChartStudioPro', type: 'project', version: 1, exportedAt: '', device: '', meta: {}, audio: {} } as const;
    const local = { ...base, local: { a: '1', b: '2' } }, remote = { ...base, local: { a: '9', c: '3' } };
    expect(diffProjects(local, remote).map(d => d.key).sort()).toEqual(['a', 'b', 'c']);
    expect(mergeProjects(local, remote).local).toEqual({ a: '1', b: '2', c: '3' });
  });
  it('servidor: revisão atômica, conflito 409, cota, isolamento e não configurado', async () => {
    const store = memoryStore();
    const id = 'a'.repeat(40), other = 'b'.repeat(40);
    const req = (method: string, query: string, body?: BodyInit) => handleSync(new Request(`http://x/api/sync?${query}`, { method, body }), store);
    expect((await handleSync(new Request(`http://x/api/sync?id=${id}`), null)).status).toBe(503);
    expect((await req('GET', 'id=../../etc')).status).toBe(400);
    expect((await req('GET', `id=${id}`)).status).toBe(404);
    const put = (base: number) => req('PUT', `id=${id}`, JSON.stringify({ baseRevision: base, payload: { iv: 'x', data: 'y' } }));
    expect((await put(0)).status).toBe(200);
    const conflict = await put(0);
    expect(conflict.status).toBe(409);
    expect((await conflict.json()).revision).toBe(1);
    expect((await put(1)).status).toBe(200);
    expect((await req('GET', `id=${other}`)).status).toBe(404);
    const blob = `${'c'.repeat(64)}.0`;
    expect((await req('PUT', `id=${id}&blob=${blob}`, new Uint8Array(10))).status).toBe(200);
    expect((await req('HEAD', `id=${id}&blob=${blob}`)).status).toBe(200);
    expect((await req('GET', `id=${id}&blob=${blob}`)).status).toBe(200);
    expect((await req('PUT', `id=${id}&blob=${blob}`, new Uint8Array(3_100_000))).status).toBe(200);
    expect((await req('PUT', `id=${id}&blob=${'d'.repeat(64)}.0`, new Uint8Array(3_100_000))).status).toBe(200);
    expect((await req('PUT', `id=${id}&blob=${'e'.repeat(64)}.0`, new Uint8Array(3_300_000))).status).toBe(413);
    const full = { ...memoryStore(), usage: async () => 64 * 1024 * 1024 };
    expect((await handleSync(new Request(`http://x/api/sync?id=${id}&blob=${'f'.repeat(64)}.0`, { method: 'PUT', body: new Uint8Array(5) }), full)).status).toBe(413);
    expect((await req('DELETE', `id=${id}`)).status).toBe(200);
    expect((await req('GET', `id=${id}`)).status).toBe(404);
  });
});
