import { describe, expect, it } from 'vitest';
import { handleSync, vercelBlobStore } from '../../server/sync.mjs';

/** SDK simulado com a semântica do @vercel/blob: ifMatch (ETag), allowOverwrite, privado. */
function fakeSdk() {
  const files = new Map<string, { data: Uint8Array; etag: string }>();
  let n = 0;
  const err = (name: string) => Object.assign(new Error(name), { name });
  return {
    files,
    async put(path: string, body: string | Uint8Array, o: { ifMatch?: string; allowOverwrite?: boolean }) {
      const cur = files.get(path);
      if (o.ifMatch && cur?.etag !== o.ifMatch) throw err('BlobPreconditionFailedError');
      if (!o.ifMatch && cur && !o.allowOverwrite) throw err('BlobAlreadyExistsError: blob already exists');
      const data = typeof body === "string" ? new TextEncoder().encode(body) : new Uint8Array(body);
      files.set(path, { data, etag: `e${++n}` }); return { url: `https://x/${path}`, pathname: path };
    },
    async get(path: string) { const f = files.get(path); if (!f) return null; return { statusCode: 200, stream: new Blob([f.data as BlobPart]).stream(), blob: { etag: f.etag } }; },
    async head(path: string) { if (!files.has(path)) throw err('BlobNotFoundError'); return {}; },
    async list({ prefix }: { prefix: string }) { return { blobs: [...files.keys()].filter(k => k.startsWith(prefix)).map(k => ({ url: `https://x/${k}` })), hasMore: false }; },
    async del(urls: string[]) { for (const u of urls) files.delete(u.replace('https://x/', '')); },
  };
}

describe('Sincronização no Vercel Blob', () => {
  it('revisão atômica, conflito, áudio com cota e remoção', async () => {
    const sdk = fakeSdk(), store = vercelBlobStore('tok', sdk);
    const id = 'c'.repeat(40);
    const req = (method: string, query: string, body?: BodyInit) => handleSync(new Request(`http://x/api/sync?${query}`, { method, body }), store);
    expect((await req('GET', `id=${id}`)).status).toBe(404);
    const put = (base: number) => req('PUT', `id=${id}`, JSON.stringify({ baseRevision: base, payload: { iv: 'i', data: 'd' }, device: 'Opera' }));
    expect((await put(0)).status).toBe(200);
    expect((await put(0)).status).toBe(409);
    expect((await put(1)).status).toBe(200);
    const read = await (await req('GET', `id=${id}`)).json();
    expect(read).toMatchObject({ revision: 2, device: 'Opera', payload: { iv: 'i' } });
    const blob = `${'a'.repeat(64)}.0`;
    expect((await req('PUT', `id=${id}&blob=${blob}`, new Uint8Array([1, 2, 3]))).status).toBe(200);
    expect((await req('HEAD', `id=${id}&blob=${blob}`)).status).toBe(200);
    expect(new Uint8Array(await (await req('GET', `id=${id}&blob=${blob}`)).arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect(await store.usage(id)).toBe(3);
    expect([...sdk.files.keys()].every(k => k.startsWith(`sync/${id}/`))).toBe(true);
    expect((await req('DELETE', `id=${id}`)).status).toBe(200);
    expect(sdk.files.size).toBe(0);
  });
  it('corrida entre dois aparelhos: o ETag impede sobrescrever', async () => {
    const sdk = fakeSdk(), store = vercelBlobStore('tok', sdk), id = 'd'.repeat(40);
    await store.write(id, 0, { iv: 'a', data: 'a' }, 'A');
    const realPut = sdk.put.bind(sdk);
    // Outro aparelho grava entre a leitura e a escrita deste.
    let raced = false;
    sdk.put = async (path, body, o) => { if (!raced && path.endsWith('project.json')) { raced = true; await realPut(path, JSON.stringify({ revision: 2, updatedAt: 1, device: 'B', payload: { iv: 'b', data: 'b' } }), { allowOverwrite: true }); } return realPut(path, body, o); };
    const result = await store.write(id, 1, { iv: 'c', data: 'c' }, 'C');
    expect(result).toMatchObject({ ok: false, revision: 2 });
    expect((await store.read(id)).device).toBe('B');
  });
});
