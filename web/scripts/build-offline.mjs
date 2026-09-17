import { readdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const assets = (await readdir(new URL("../dist/assets/", import.meta.url)))
  .filter((f) => !f.endsWith(".map"))
  .map((f) => `/assets/${f}`);
const version = createHash("sha256")
  .update(JSON.stringify(assets))
  .digest("hex")
  .slice(0, 16);
const code = `const CACHE='record-life-shell-${version}';
const FILES=${JSON.stringify(["/index.html", "/manifest.webmanifest", "/icon.svg", ...assets])};
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil((async()=>{const old=(await caches.keys()).filter(k=>k.startsWith('record-life-shell-')&&k!==CACHE);await Promise.all(old.slice(0,-1).map(k=>caches.delete(k)));await self.clients.claim()})()));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api'))return;
 if(event.request.mode==='navigate'){event.respondWith((async()=>{try{const response=await fetch(event.request,{signal:AbortSignal.timeout(4000)});if(response.ok)return response}catch{}return (await caches.open(CACHE)).match('/index.html')})());return}
 if(FILES.includes(url.pathname)||url.pathname.startsWith('/assets/'))event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request)));
});
`;
await writeFile(new URL("../dist/sw.js", import.meta.url), code);
console.log(
  `Offline shell ${version}: ${assets.length} local assets; no trip data in service-worker caches.`,
);
