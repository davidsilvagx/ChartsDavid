import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { readdirSync, writeFileSync } from 'node:fs';
import { lastfmProxy } from './netlify/functions/lastfm.mjs';
import { itunesProxy } from './netlify/functions/itunes.mjs';
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), {
      name: 'lastchart-local-api',
      configureServer(server) {
        server.middlewares.use('/api/lastfm', async (req, res) => {
          const response = await lastfmProxy(new URL(req.url ?? '/', 'http://localhost').search, env.LASTFM_API_KEY);
          res.statusCode = response.status;
          res.setHeader('Content-Type', 'application/json');
          res.end(await response.text());
        });
        server.middlewares.use('/api/itunes', async (req, res) => {
          const response = await itunesProxy(new URL(req.url ?? '/', 'http://localhost').search);
          res.statusCode = response.status;
          res.setHeader('Content-Type', 'application/json');
          res.end(await response.text());
        });
      },
    }, {
      name: 'lastchart-offline', apply: 'build',
      closeBundle() {
        const assets = readdirSync('dist/assets').map(name => `/assets/${name}`);
        const files = ['/index.html', '/favicon.svg', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/maskable-512.png', ...assets];
        const version = `lastchart-${Date.now()}`;
        writeFileSync('dist/sw.js', `const CACHE=${JSON.stringify(version)};const FILES=${JSON.stringify(files)};
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('message',event=>{if(event.data==='SKIP_WAITING')self.skipWaiting()});
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
    server: { port: 5173, strictPort: true },
  };
});
