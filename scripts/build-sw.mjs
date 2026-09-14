import { readdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const files = await readdir("out", { recursive: true });
const assets = files.filter(
  (f) =>
    /\.(html|js|css|png|svg|webmanifest|woff2?|txt)$/.test(f) && f !== "sw.js",
);
const hash = createHash("sha256");
for (const f of assets) hash.update(await readFile(`out/${f}`));
const cache = `finanze-${hash.digest("hex").slice(0, 12)}`;
await writeFile(
  "out/sw.js",
  `const CACHE=${JSON.stringify(cache)};const ASSETS=${JSON.stringify(assets.map((f) => "/" + f))};
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith('finanze-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (!['GET', 'HEAD'].includes(request.method) || url.origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // Next.js may percent-encode dynamic route names in chunk URLs.
    const pathname = decodeURI(url.pathname);
    const htmlPath = pathname.endsWith('/') ? pathname + 'index.html' : pathname.includes('.') ? pathname : pathname + '/index.html';
    const key = request.mode === 'navigate' || request.method === 'HEAD' ? htmlPath : pathname;
    const cached = await cache.match(key, {ignoreSearch: true});
    if (cached) return request.method === 'HEAD' ? new Response(null, {status: cached.status, headers: cached.headers}) : cached;
    return fetch(request);
  })());
});`,
);
console.log(`Offline cache: ${assets.length} assets, ${cache}`);
