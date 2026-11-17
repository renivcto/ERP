/* RENIV NEXUS service worker: makes the site installable. Always uses the network (live data, no stale cache). */
self.addEventListener('install',e=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch',e=>{ if(e.request.method!=='GET') return; e.respondWith(fetch(e.request).catch(()=>new Response('<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width"><body style="font-family:sans-serif;padding:40px;color:#2f6f5c"><h2>인터넷 연결을 확인해 주세요</h2><p>RENIV NEXUS는 실시간 데이터를 사용하므로 연결이 필요합니다.</p>',{headers:{'Content-Type':'text/html; charset=utf-8'}}))); });

/* ── 푸시 알림 (push140) ──────────────────────────────────────────────
   서버(/srv/push/pushd.py)가 보내는 payload: {title, body, url, tag, type}
   ⚠️ userVisibleOnly 구독이라 푸시를 받으면 **반드시** 알림을 하나 띄워야 한다.
      안 띄우면 브라우저가 "이 사이트가 백그라운드에서 실행됨" 을 대신 띄우고,
      반복되면 구독을 끊어 버린다. 그래서 내용이 깨져도 기본 문구로 띄운다. */
self.addEventListener('push',e=>{
  let d={};
  try{ d=e.data?e.data.json():{}; }
  catch(_){ try{ d={body:e.data?e.data.text():''}; }catch(__){ d={}; } }
  const title=d.title||'RENIV';
  const opts={
    body:d.body||'',
    icon:'./icon-192.png',
    badge:'./icon-192.png',
    lang:'ko',
    data:{url:d.url||'./',type:d.type||''},
    timestamp:Date.now()
  };
  /* 같은 건이 두 번 와도 알림은 하나로 합쳐지게 tag 를 쓴다 */
  if(d.tag){ opts.tag=String(d.tag); opts.renotify=true; }
  e.waitUntil(self.registration.showNotification(title,opts));
});

self.addEventListener('notificationclick',e=>{
  e.notification.close();
  const url=(e.notification.data&&e.notification.data.url)||'./';
  e.waitUntil((async()=>{
    const wins=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    /* 이미 NEXUS 가 열려 있으면 새 창을 띄우지 않고 그 창에게 "여기로 가라" 고 알린다 */
    for(const w of wins){
      if(w.url.indexOf('/ERP/nexus/')>=0){
        try{ await w.focus(); }catch(_){}
        try{ w.postMessage({nexusPush:true,url:url}); }catch(_){}
        return;
      }
    }
    try{ await self.clients.openWindow(url); }catch(_){}
  })());
});
