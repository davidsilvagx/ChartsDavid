import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyProject, checkAndPullNewer, decryptProject, deriveAccount, fetchRemote, generateSyncKey, mergeHistory, parseProject, pullRemoteProject, pushRemote, sha256Hex, uploadClip, downloadClip, type ProjectFile } from './projectSync';
import { backupJSON } from './export';
import { defaults, type CachedWeek } from './types';
import { makeWeeks } from './calendar';
import { readWeeks } from './storage';
import { handleSync, memoryStore } from '../../server/sync.mjs';

const settings = { ...defaults, user: 'history-roundtrip', startDate: '2026-01-02' };
const week = makeWeeks(settings, Date.parse('2026-01-10T12:00Z'))[0];
const row: CachedWeek = { key: week.id, week, cutoff: week.end, fetchedAt: week.end * 1000, duplicates: 0, scrobbles: [{ timestamp: week.start + 1, artist: 'Lady Gaga', track: 'Applause', album: 'ARTPOP', image: '', source: 'spotify' }] };
const project = (): ProjectFile => ({ app: 'LastChartStudioPro', type: 'project', version: 1, exportedAt: '', device: 'Test', local: {}, meta: {}, audio: {}, history: backupJSON(settings, [row], null) });
afterEach(() => vi.unstubAllGlobals());

function mockCloud(failPart = false) {
  const store = memoryStore(); let failed = false;
  const call = async (input: string | URL | Request, init?: RequestInit) => handleSync(new Request(new URL(String(input), 'https://lastchart.test'), init), store);
  vi.stubGlobal('fetch', call);
  class XHR {
    upload = { onprogress: null }; status = 0; responseText = ''; onload?: () => void; onerror?: () => void; onloadend?: () => void; url = ''; method = '';
    open(method: string, url: string) { this.method = method; this.url = url; }
    abort() {}
    async send(body: BodyInit) {
      if (failPart && !failed && this.url.endsWith('.1')) { failed = true; this.onerror?.(); this.onloadend?.(); return; }
      const result = await call(this.url, { method: this.method, body }); this.status = result.status; this.responseText = await result.text(); this.onload?.(); this.onloadend?.();
    }
  }
  vi.stubGlobal('XMLHttpRequest', XHR); return store;
}

describe('History across devices', () => {
  it('preserves maximum duplicate multiplicity and unions other platform history idempotently', () => {
    const repeated = { ...row, scrobbles: [row.scrobbles[0], row.scrobbles[0]] };
    const extra = { ...row, scrobbles: [...row.scrobbles, { ...row.scrobbles[0], timestamp: row.scrobbles[0].timestamp + 10, source: 'ytmusic' as const }] };
    const merged = mergeHistory([repeated], [extra]);
    expect(merged[0].scrobbles).toHaveLength(3);
    expect(mergeHistory(merged, [extra])[0].scrobbles).toHaveLength(3);
  });
  it('rejects malformed history before any local settings are applied', async () => {
    expect(() => parseProject(JSON.stringify({ ...project(), history: '{"bad":true}' }))).toThrow('backup');
    const storage = { setItem: vi.fn(), getItem: () => null } as unknown as Storage;
    await expect(applyProject({ ...project(), history: '{"bad":true}' }, storage)).rejects.toThrow();
    expect(storage.setItem).not.toHaveBeenCalled();
  });
  it('compresses, encrypts, sends, retrieves, verifies and restores the archive without importing again', async () => {
    mockCloud(); const account = await deriveAccount(generateSyncKey(n => new Uint8Array(n).fill(8)), 1000);
    await pushRemote(account, 0, project());
    const remote = await fetchRemote(account); expect(remote?.revision).toBe(1);
    expect(JSON.stringify(remote)).not.toContain('Applause');
    const restored = await decryptProject(account, remote!.payload);
    expect(restored.historyArchive?.type).toBe('application/gzip'); expect(restored.history).toContain('Applause');
    const storage = { setItem() {}, getItem: () => null } as unknown as Storage;
    await applyProject(restored, storage);
    expect((await readWeeks(settings))[0].scrobbles[0]).toMatchObject({ artist: 'Lady Gaga', source: 'spotify' });
  });
  it('resumes multipart uploads without mixing ciphertext from different nonces', async () => {
    mockCloud(true); const account = await deriveAccount(generateSyncKey(n => new Uint8Array(n).fill(9)), 1000);
    const bytes = new Uint8Array(3_100_000).fill(7), file = new Blob([bytes]), hash = await sha256Hex(bytes), signal = new AbortController().signal;
    await expect(uploadClip(account, hash, file, () => {}, signal)).rejects.toThrow('Sem conexão');
    await uploadClip(account, hash, file, () => {}, signal);
    const restored = await downloadClip(account, { hash, name: 'history.json', type: 'application/json', size: bytes.length, duration: 0 }, signal);
    expect(await sha256Hex(await restored!.arrayBuffer())).toBe(hash);
  });
  it('supports direct pull and auto-pull for seamless cross-device synchronization', async () => {
    mockCloud();
    const rawKey = generateSyncKey(n => new Uint8Array(n).fill(5));
    const account = await deriveAccount(rawKey, 1000);
    await pushRemote(account, 0, project());

    const memoryStorage = new Map<string, string>();
    const fakeLocalStorage = {
      getItem: (k: string) => memoryStorage.get(k) ?? null,
      setItem: (k: string, v: string) => memoryStorage.set(k, v),
      removeItem: (k: string) => memoryStorage.delete(k),
    } as unknown as Storage;
    vi.stubGlobal('localStorage', fakeLocalStorage);

    const pullRes = await pullRemoteProject(rawKey, undefined, 1000);
    expect(pullRes.revision).toBe(1);
    expect(pullRes.changed).toBeGreaterThan(0);
    expect(fakeLocalStorage.getItem('lastchart-sync:v1')).toContain(rawKey.replace(/[\s-]/g, '').slice(0, 4));

    const check1 = await checkAndPullNewer(fakeLocalStorage, undefined, 1000);
    expect(check1).toBeNull();

    await pushRemote(account, 1, { ...project(), local: { 'lastchart-studio:favorites': '["123"]' } });
    const check2 = await checkAndPullNewer(fakeLocalStorage, undefined, 1000);
    expect(check2?.updated).toBe(true);
    expect(check2?.revision).toBe(2);
    expect(fakeLocalStorage.getItem('lastchart-studio:favorites')).toBe('["123"]');
  });
});
