/**
 * Sincronização de projetos do LastChart. O servidor guarda apenas dados cifrados no aparelho (AES-GCM);
 * nunca recebe a chave de sincronização. Armazenamento: Upstash Redis (Vercel Marketplace) com revisão atômica.
 */
const ID = /^[a-f0-9]{40}$/;
const BLOB = /^[a-f0-9]{64}\.\d{1,2}$/;
const MAX_PROJECT = 1_500_000;
const MAX_CHUNK = 3_200_000;
const ACCOUNT_QUOTA = 64 * 1024 * 1024;
const TTL = 400 * 24 * 3600;
const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export function upstashStore(url, token) {
  const call = async (...command) => {
    const response = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(command), signal: AbortSignal.timeout(15000) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body.error) throw new Error(body.error || `Upstash HTTP ${response.status}`);
    return body.result;
  };
  const CAS = "local cur = redis.call('HGET', KEYS[1], 'revision') or '0' if cur ~= ARGV[1] then return {0, cur} end redis.call('HSET', KEYS[1], 'revision', ARGV[2], 'payload', ARGV[3], 'updatedAt', ARGV[4], 'device', ARGV[6]) redis.call('EXPIRE', KEYS[1], ARGV[5]) return {1, ARGV[2]}";
  return {
    async read(id) { const r = await call('HGETALL', `sync:${id}:project`); if (!r || !r.length) return null; const o = {}; for (let i = 0; i < r.length; i += 2) o[r[i]] = r[i + 1]; return { revision: Number(o.revision), updatedAt: Number(o.updatedAt), device: o.device ?? '', payload: JSON.parse(o.payload) }; },
    async write(id, base, payload, device) { const next = base + 1, now = Date.now(); const [ok, cur] = await call('EVAL', CAS, '1', `sync:${id}:project`, String(base), String(next), JSON.stringify(payload), String(now), String(TTL), device); return ok ? { ok: true, revision: next, updatedAt: now } : { ok: false, revision: Number(cur) }; },
    async usage(id) { return Number(await call('GET', `sync:${id}:bytes`)) || 0; },
    async putBlob(id, name, base64, bytes) { await call('SET', `sync:${id}:blob:${name}`, base64, 'EX', String(TTL)); await call('SADD', `sync:${id}:blobs`, name); await call('INCRBY', `sync:${id}:bytes`, String(bytes)); await call('EXPIRE', `sync:${id}:bytes`, String(TTL)); await call('EXPIRE', `sync:${id}:blobs`, String(TTL)); },
    async hasBlob(id, name) { return (await call('EXISTS', `sync:${id}:blob:${name}`)) === 1; },
    async getBlob(id, name) { return call('GET', `sync:${id}:blob:${name}`); },
    async remove(id) { const names = (await call('SMEMBERS', `sync:${id}:blobs`)) ?? []; const keys = [`sync:${id}:project`, `sync:${id}:bytes`, `sync:${id}:blobs`, ...names.map(n => `sync:${id}:blob:${n}`)]; for (let i = 0; i < keys.length; i += 100) await call('DEL', ...keys.slice(i, i + 100)); },
  };
}

/**
 * Vercel Blob (privado), nativo da conta Vercel do projeto. Revisão atômica com ETag (ifMatch):
 * dois aparelhos salvando ao mesmo tempo não se sobrescrevem; um recebe conflito.
 */
export function vercelBlobStore(token, sdk) {
  const base = id => `sync/${id}`;
  const readJson = async path => {
    const result = await sdk.get(path, { access: 'private', token, useCache: false }).catch(error => { if (/not.?found|404/i.test(String(error?.message ?? error))) return null; throw error; });
    if (!result || result.statusCode !== 200) return null;
    return { value: JSON.parse(await new Response(result.stream).text()), etag: result.blob.etag };
  };
  const writeJson = (path, value, etag) => sdk.put(path, JSON.stringify(value), { access: 'private', token, contentType: 'application/json', cacheControlMaxAge: 60, addRandomSuffix: false, ...(etag ? { ifMatch: etag } : { allowOverwrite: false }) });
  const conflict = error => /precondition|already exists|412|409/i.test(`${error?.name ?? ''} ${error?.message ?? ''}`);
  return {
    async read(id) { const hit = await readJson(`${base(id)}/project.json`); return hit ? hit.value : null; },
    async write(id, baseRevision, payload, device) {
      const hit = await readJson(`${base(id)}/project.json`);
      const current = hit?.value.revision ?? 0;
      if (current !== baseRevision) return { ok: false, revision: current };
      const value = { revision: baseRevision + 1, updatedAt: Date.now(), device, payload };
      try { await writeJson(`${base(id)}/project.json`, value, hit?.etag); }
      catch (error) { if (conflict(error)) return { ok: false, revision: (await readJson(`${base(id)}/project.json`))?.value.revision ?? current + 1 }; throw error; }
      return { ok: true, revision: value.revision, updatedAt: value.updatedAt };
    },
    async usage(id) { return (await readJson(`${base(id)}/usage.json`))?.value.bytes ?? 0; },
    async putBlob(id, name, base64, bytes) {
      await sdk.put(`${base(id)}/blob/${name}`, Buffer.from(base64, 'base64'), { access: 'private', token, contentType: 'application/octet-stream', addRandomSuffix: false, allowOverwrite: false }).catch(error => { if (!conflict(error)) throw error; });
      for (let attempt = 0; attempt < 3; attempt++) {
        const hit = await readJson(`${base(id)}/usage.json`);
        try { await writeJson(`${base(id)}/usage.json`, { bytes: (hit?.value.bytes ?? 0) + bytes }, hit?.etag); return; } catch (error) { if (!conflict(error)) throw error; }
      }
    },
    async hasBlob(id, name) { try { await sdk.head(`${base(id)}/blob/${name}`, { token }); return true; } catch { return false; } },
    async getBlob(id, name) {
      const result = await sdk.get(`${base(id)}/blob/${name}`, { access: 'private', token }).catch(() => null);
      return result?.statusCode === 200 ? Buffer.from(await new Response(result.stream).arrayBuffer()).toString('base64') : null;
    },
    async remove(id) {
      let cursor;
      do { const page = await sdk.list({ prefix: `${base(id)}/`, token, cursor }); if (page.blobs.length) await sdk.del(page.blobs.map(b => b.url), { token }); cursor = page.hasMore ? page.cursor : undefined; } while (cursor);
    },
  };
}

/** Armazenamento em memória para testes e para o servidor local de desenvolvimento. */
export function memoryStore() {
  const projects = new Map(), blobs = new Map(), bytes = new Map();
  return {
    async read(id) { return projects.get(id) ?? null; },
    async write(id, base, payload, device) { const cur = projects.get(id)?.revision ?? 0; if (cur !== base) return { ok: false, revision: cur }; const value = { revision: base + 1, updatedAt: Date.now(), payload, device }; projects.set(id, value); return { ok: true, revision: value.revision, updatedAt: value.updatedAt }; },
    async usage(id) { return bytes.get(id) ?? 0; },
    async putBlob(id, name, base64, size) { blobs.set(`${id}:${name}`, base64); bytes.set(id, (bytes.get(id) ?? 0) + size); },
    async hasBlob(id, name) { return blobs.has(`${id}:${name}`); },
    async getBlob(id, name) { return blobs.get(`${id}:${name}`) ?? null; },
    async remove(id) { projects.delete(id); bytes.delete(id); for (const key of [...blobs.keys()]) if (key.startsWith(`${id}:`)) blobs.delete(key); },
  };
}

export async function storeFromEnv(env) {
  if (env.BLOB_READ_WRITE_TOKEN) return vercelBlobStore(env.BLOB_READ_WRITE_TOKEN, await import('@vercel/blob'));
  const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL, token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? upstashStore(url, token) : null;
}

export async function handleSync(request, store) {
  if (!store) return json({ code: 'not-configured', message: 'A sincronização remota ainda não foi configurada neste servidor. Use Exportar projeto.' }, 503);
  const url = new URL(request.url), id = url.searchParams.get('id') ?? '', blob = url.searchParams.get('blob');
  if (!ID.test(id)) return json({ code: 'bad-id', message: 'Identificador de sincronização inválido.' }, 400);
  if (blob !== null && !BLOB.test(blob)) return json({ code: 'bad-blob', message: 'Arquivo inválido.' }, 400);
  try {
    if (request.method === 'GET' && blob) {
      const data = await store.getBlob(id, blob);
      if (!data) return json({ code: 'not-found' }, 404);
      return new Response(Buffer.from(data, 'base64'), { headers: { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store' } });
    }
    if (request.method === 'HEAD' && blob) return new Response(null, { status: (await store.hasBlob(id, blob)) ? 200 : 404 });
    if (request.method === 'GET') {
      const project = await store.read(id);
      return project ? json({ ...project, usage: await store.usage(id), quota: ACCOUNT_QUOTA }) : json({ code: 'not-found', usage: 0, quota: ACCOUNT_QUOTA }, 404);
    }
    if (request.method === 'PUT' && blob) {
      const bytes = new Uint8Array(await request.arrayBuffer());
      if (!bytes.length || bytes.length > MAX_CHUNK) return json({ code: 'too-large', message: 'Parte de áudio fora do limite.' }, 413);
      if (await store.hasBlob(id, blob)) return json({ ok: true, existing: true });
      if ((await store.usage(id)) + bytes.length > ACCOUNT_QUOTA) return json({ code: 'quota', message: 'Cota de áudio sincronizado (64 MB) atingida. Remova trechos ou sincronize só o projeto.' }, 413);
      await store.putBlob(id, blob, Buffer.from(bytes).toString('base64'), bytes.length);
      return json({ ok: true });
    }
    if (request.method === 'PUT') {
      const text = await request.text();
      if (text.length > MAX_PROJECT) return json({ code: 'too-large', message: 'Projeto grande demais para sincronizar.' }, 413);
      const body = JSON.parse(text);
      if (!Number.isInteger(body.baseRevision) || body.baseRevision < 0 || !body.payload || typeof body.payload.iv !== 'string' || typeof body.payload.data !== 'string') return json({ code: 'bad-body' }, 400);
      const result = await store.write(id, body.baseRevision, { iv: body.payload.iv, data: body.payload.data }, String(body.device ?? '').slice(0, 60));
      return result.ok ? json(result) : json({ code: 'conflict', revision: result.revision, message: 'Outro aparelho salvou uma versão mais nova.' }, 409);
    }
    if (request.method === 'DELETE') { await store.remove(id); return json({ ok: true }); }
    return json({ code: 'method' }, 405);
  } catch (error) {
    return json({ code: 'unavailable', message: 'Armazenamento indisponível. Seus dados locais continuam intactos.' }, 502);
  }
}
