// Service worker MediSlot : rouvrir l'application et relire les dernières données sans réseau.
// - Coquille (page + fichiers construits) : mise en cache à l'installation.
// - Lectures API utiles hors ligne : réseau d'abord, dernière réponse réussie en secours (marquée X-MediSlot-Offline).
// - Jamais en cache : écritures, flux SSE, test A/B, CSRF. Une réservation hors ligne est gérée par la page (file d'envoi).
const VERSION='v1';
const SHELL=`medislot-shell-${VERSION}`,API=`medislot-api-${VERSION}`;
const CACHED_API=/^\/api\/(professionals(\/\d+(\/slots)?)?|appointments|notifications|me)$/;

self.addEventListener('install',event=>{event.waitUntil((async()=>{
 const cache=await caches.open(SHELL);
 const html=await (await fetch('/index.html',{cache:'no-store'})).text();
 const assets=[...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map(m=>m[1]);
 await cache.put('/index.html',new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8'}}));
 await cache.addAll(assets);
 await self.skipWaiting();
})())});

self.addEventListener('activate',event=>{event.waitUntil((async()=>{
 for(const key of await caches.keys())if(key.startsWith('medislot-')&&key!==SHELL&&key!==API)await caches.delete(key);
 await self.clients.claim();
})())});

self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==self.location.origin)return;
 if(url.pathname.startsWith('/api/')){if(CACHED_API.test(url.pathname))event.respondWith(networkFirst(request,API));return;}
 if(request.mode==='navigate'){event.respondWith(networkFirst(request,SHELL,'/index.html'));return;}
 if(url.pathname.startsWith('/assets/'))event.respondWith(cacheFirst(request));
});

async function networkFirst(request,cacheName,key=request){
 const cache=await caches.open(cacheName);
 try{
  const response=await fetch(request);
  if(response.ok)await cache.put(key,response.clone());
  // 502-504 : le proxy répond mais le serveur est injoignable, comme hors ligne pour la personne.
  if(response.status<502||response.status>504)return response;
  return (await cachedCopy(cache,key))??response;
 }catch(error){
  const cached=await cachedCopy(cache,key);
  if(!cached)throw error;
  return cached;
 }
}

async function cachedCopy(cache,key){
 const cached=await cache.match(key);
 if(!cached)return null;
 const headers=new Headers(cached.headers);headers.set('X-MediSlot-Offline','1');
 return new Response(cached.body,{status:cached.status,statusText:cached.statusText,headers});
}

// Fichiers construits : noms avec empreinte, donc immuables.
async function cacheFirst(request){
 const cache=await caches.open(SHELL);
 const cached=await cache.match(request);if(cached)return cached;
 const response=await fetch(request);if(response.ok)await cache.put(request,response.clone());return response;
}
