/* RENIV NEXUS service worker: makes the site installable. Always uses the network (live data, no stale cache). */
self.addEventListener('install',e=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch',e=>{ if(e.request.method!=='GET') return; e.respondWith(fetch(e.request).catch(()=>new Response('<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width"><body style="font-family:sans-serif;padding:40px;color:#2f6f5c"><h2>인터넷 연결을 확인해 주세요</h2><p>RENIV NEXUS는 실시간 데이터를 사용하므로 연결이 필요합니다.</p>',{headers:{'Content-Type':'text/html; charset=utf-8'}}))); });
