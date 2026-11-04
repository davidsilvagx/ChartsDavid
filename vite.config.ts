import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { readdirSync, writeFileSync } from 'node:fs';
import { lastfmProxy } from './netlify/functions/lastfm.mjs';
import { itunesProxy } from './netlify/functions/itunes.mjs';
import { handleSync, memoryStore, storeFromEnv } from './server/sync.mjs';
import { handlePush, memoryPushStore, pushStoreFromEnv } from './server/push.mjs';
import { handleCareer } from './server/career.mjs';
import webpush from 'web-push';
import type { Connect } from 'vite';

function mountApi(middlewares: Connect.Server, env: Record<string, string>) {
  const syncStorePromise = storeFromEnv(env).then(store => store ?? memoryStore());
  const pushStorePromise = pushStoreFromEnv(env).then(store => store ?? memoryPushStore());
  const toRequest = async (req: Connect.IncomingMessage) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const body = chunks.length && req.method !== 'GET' && req.method !== 'HEAD' ? Buffer.concat(chunks) : undefined;
    return new Request(new URL(req.originalUrl ?? req.url ?? '/', 'http://localhost'), { method: req.method, body, headers: req.headers as Record<string, string> });
  };
  const send = async (res: import('node:http').ServerResponse, response: Response) => { res.statusCode = response.status; response.headers.forEach((value, key) => res.setHeader(key, value)); res.end(Buffer.from(await response.arrayBuffer())); };
  middlewares.use('/api/lastfm', async (req, res) => send(res, await lastfmProxy(new URL(req.url ?? '/', 'http://localhost').search, env.LASTFM_API_KEY)));
  middlewares.use('/api/itunes', async (req, res) => send(res, await itunesProxy(new URL(req.url ?? '/', 'http://localhost').search)));
  middlewares.use('/api/career', async (req, res) => send(res, await handleCareer(await toRequest(req))));
  middlewares.use('/api/sync', async (req, res) => send(res, await handleSync(await toRequest(req), await syncStorePromise)));
  middlewares.use('/api/push-cron', async (req, res) => send(res, await handlePush(await toRequest(req), env, await pushStorePromise, webpush)));
  middlewares.use('/api/push', async (req, res) => send(res, await handlePush(await toRequest(req), env, await pushStorePromise, webpush)));
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), {
      name: 'lastchart-local-api',
      // Mesmas rotas /api no servidor de desenvolvimento e no preview do build (testes do PWA com Service Worker).
      configureServer(server) { mountApi(server.middlewares, env); },
      configurePreviewServer(server) { mountApi(server.middlewares, env); },
    }, {
      name: 'lastchart-offline', apply: 'build',
      closeBundle() {
        const assets = readdirSync('dist/assets').map(name => `/assets/${name}`);
        const files = ['/index.html', '/favicon.svg', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/maskable-512.png', '/icons/apple-touch-icon.png', ...assets];
        const version = `lastchart-${Date.now()}`;
        writeFileSync('dist/sw.js', `const CACHE=${JSON.stringify(version)};const FILES=${JSON.stringify(files)};
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('message',event=>{if(event.data==='SKIP_WAITING')self.skipWaiting()});
self.addEventListener('push',event=>{let d={};try{d=event.data?event.data.json():{}}catch{d={title:'LastChart',body:event.data?event.data.text():''}}event.waitUntil(self.registration.showNotification(d.title||'LastChart',{body:d.body||'',tag:d.tag||'lastchart',icon:'/icons/icon-192.png',badge:'/icons/icon-192.png',data:{url:d.url||'/'},lang:'pt-BR'}));});
self.addEventListener('notificationclick',event=>{event.notification.close();event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>list[0]?list[0].focus():self.clients.openWindow('/')));});
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('lastchart-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/')||url.pathname.startsWith('/.netlify/'))return;
  if(event.request.mode==='navigate'){
    event.respondWith(fetch(event.request,{cache:'no-store'}).then(res=>{
      if(res.ok){
        const copy=res.clone();
        caches.open(CACHE).then(cache=>cache.put('/index.html',copy));
      }
      return res;
    }).catch(()=>caches.match('/index.html')));
    return;
  }
  if(FILES.includes(url.pathname))event.respondWith(caches.match(event.request).then(hit=>hit||fetch(event.request)));
});`);
      },
    }],
    build: { chunkSizeWarningLimit: 700 },
    // NO_HMR=1: testes longos (sincronização) sem recarregar a página a cada edição.
    server: { port: 5173, strictPort: true, ...(process.env.NO_HMR ? { hmr: false } : {}) },
  };
});
