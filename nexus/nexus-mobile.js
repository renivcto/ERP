/* RENIV NEXUS — mobile behaviour: swipe pages, bottom nav, page dots, name menu. Desktop untouched. */
(function(){
  var mq=window.matchMedia('(max-width: 820px)');
  var NAMES=['오피스','Slack 대화','내가 처리할 업무','전체 업무'];
  var dots=null, ws=null, labelTimer=null, idx=0;
  function pages(){ return ws?Array.prototype.filter.call(ws.children,function(c){return c.matches('section.panel');}).sort(function(a,b){return a.offsetLeft-b.offsetLeft;}):[]; }
  function go(i){ if(!ws) return; i=Math.max(0,Math.min(pages().length-1,i)); var w=ws.clientWidth||1, to=i*w; ws.style.scrollSnapType='none'; ws.style.scrollBehavior='auto'; var from=ws.scrollLeft, t0=performance.now(); (function step(now){ var k=Math.min(1,(now-t0)/280), e=1-Math.pow(1-k,3); ws.scrollLeft=from+(to-from)*e; if(k<1) requestAnimationFrame(step); else { ws.scrollLeft=to; ws.style.scrollSnapType=''; ws.style.scrollBehavior=''; } })(t0); }
  function mark(){ if(!ws||!dots) return; var w=ws.clientWidth||1, i=Math.round(ws.scrollLeft/w); if(i===idx&&dots.dataset.ready) return; idx=i; dots.dataset.ready='1';
    Array.prototype.forEach.call(dots.querySelectorAll('button'),function(b,k){b.classList.toggle('on',k===i);});
    var l=dots.querySelector('.mlabel'); l.textContent=NAMES[i]||''; dots.classList.add('show'); clearTimeout(labelTimer); labelTimer=setTimeout(function(){dots.classList.remove('show');},1200);
    if(i===0) setTimeout(function(){window.dispatchEvent(new Event('resize'));},350); }
  function sheet(){ var s=document.getElementById('msheet'); if(s) return s; s=document.createElement('div'); s.id='msheet'; s.className='msheet'; s.hidden=true;
    s.innerHTML='<div class="msheet-box"><h4 id="msheet-name"></h4><button type="button" data-a="install" id="msheet-install" hidden>📱 앱으로 설치</button><button type="button" data-a="settings">업무 설정</button><button type="button" data-a="conn">연동 상태</button><button type="button" data-a="pc">PC 화면으로 보기</button><button type="button" class="danger" data-a="logout">로그아웃</button><button type="button" class="cancel" data-a="close">닫기</button></div>';
    document.body.appendChild(s);
    s.addEventListener('click',function(e){ var b=e.target.closest('button'); if(e.target===s||!b){ if(e.target===s) s.hidden=true; return; } s.hidden=true; var a=b.dataset.a;
      if(a==='install'){ try{ window.NEXUS_INSTALL && window.NEXUS_INSTALL.show(); }catch(err){} }
      if(a==='settings') document.getElementById('admin-tasks-btn')&&document.getElementById('admin-tasks-btn').click();
      if(a==='conn') document.querySelector('nav.rail [data-panel="connections"]')&&document.querySelector('nav.rail [data-panel="connections"]').click();
      if(a==='logout') document.getElementById('viewer-badge-live')&&document.getElementById('viewer-badge-live').click();
      if(a==='pc'){ var m=document.querySelector('meta[name=viewport]'); if(m) m.setAttribute('content','width=1280'); }
    }); return s; }
  function setup(){
    if(!mq.matches||dots) return; ws=document.querySelector('.app .workspace'); if(!ws) return;
    dots=document.createElement('div'); dots.className='mdots'; dots.innerHTML='<span class="mlabel"></span>'+NAMES.map(function(n,i){return '<button type="button" aria-label="'+n+'"></button>';}).join('');
    document.body.appendChild(dots);
    Array.prototype.forEach.call(dots.querySelectorAll('button'),function(b,i){ b.addEventListener('click',function(){go(i);}); });
    ws.addEventListener('scroll',function(){ window.requestAnimationFrame(mark); },{passive:true}); mark();
    function tween(to){ ws.style.scrollSnapType='none'; ws.style.scrollBehavior='auto'; var from=ws.scrollLeft, t0=performance.now(), dur=260; (function step(now){ var k=Math.min(1,(now-t0)/dur), e=1-Math.pow(1-k,3); ws.scrollLeft=from+(to-from)*e; if(k<1) requestAnimationFrame(step); else { ws.scrollLeft=to; ws.style.scrollSnapType=''; ws.style.scrollBehavior=''; mark(); } })(t0); }
    (function swipe(){
      var sx=0,sy=0,st=0,base=0,mode='',startIdx=0;
      function scrollableX(el){ for(;el&&el!==ws;el=el.parentElement){ var cs=getComputedStyle(el); if(/(auto|scroll)/.test(cs.overflowX)&&el.scrollWidth>el.clientWidth+4) return true; } return false; }
      ws.addEventListener('touchstart',function(e){ if(e.touches.length!==1){ mode='x-off'; return; } var t=e.touches[0]; sx=t.clientX; sy=t.clientY; st=Date.now(); base=ws.scrollLeft; startIdx=Math.round(base/(ws.clientWidth||1)); mode=(scrollableX(e.target)||(e.target.closest&&e.target.closest('#stage')))?'x-off':''; ws.style.scrollSnapType='none'; ws.style.scrollBehavior='auto'; },{passive:true});
      ws.addEventListener('touchmove',function(e){ if(mode==='x-off'||mode==='y') return; var t=e.touches[0], dx=t.clientX-sx, dy=t.clientY-sy;
        if(!mode){ if(Math.abs(dx)<8&&Math.abs(dy)<8) return; mode=Math.abs(dx)>Math.abs(dy)*1.1?'x':'y'; if(mode==='y') return; }
        if(e.cancelable) e.preventDefault(); ws.scrollLeft=base-dx; },{passive:false});
      ws.addEventListener('touchend',function(e){ var w=ws.clientWidth||1;
        if(mode==='x'){ var t=e.changedTouches[0], dx=t.clientX-sx, v=Math.abs(dx)/Math.max(1,Date.now()-st); var target=startIdx; if(dx<-50||(dx<-20&&v>.35)) target=startIdx+1; else if(dx>50||(dx>20&&v>.35)) target=startIdx-1; target=Math.max(0,Math.min(pages().length-1,target)); tween(target*w); }
        else { ws.style.scrollSnapType=''; ws.style.scrollBehavior=''; } mode=''; },{passive:true});
      ws.addEventListener('touchcancel',function(){ ws.style.scrollSnapType=''; ws.style.scrollBehavior=''; mode=''; },{passive:true});
    })();
    // RENIV logo = home (page 1)
    document.getElementById('home-logo')&&document.getElementById('home-logo').addEventListener('click',function(){ go(0); try{ window.NEXUS.setView('office'); }catch(e){} setTimeout(function(){ try{ syncCam(); }catch(e){} },50); });
    // name badge opens a small menu (settings, connections, logout)
    var nm=document.getElementById('rail-name114'); if(nm) nm.addEventListener('click',function(){ if(!mq.matches) return; var s=sheet(); document.getElementById('msheet-name').textContent=nm.textContent.replace(/관리자|임원|조회 권한/,'').trim()||'내 계정';
      var ib=document.getElementById('msheet-install');
      if(ib) ib.hidden = !(window.NEXUS_INSTALL && window.NEXUS_INSTALL.available());
      s.hidden=false; });
    setTimeout(function(){ window.dispatchEvent(new Event('resize')); },600);
    buildOffice3();
    quickMenu();
    shortMeetingLabel();
  }

  /* 빠른 메뉴 2x2 + 하단 한 줄 (2026-11-13) */
  function openErp(page){
    var fr=document.getElementById('erp-frame37'), sh=document.getElementById('erp-shell37');
    if(!fr||!sh) return;
    if(!fr.getAttribute('src')) fr.src=new URL('../',location.href).href;
    sh.hidden=false;
    /* ERP 는 부팅을 마치며 대시보드로 넘어간다. 한 번만 go() 하면 그 뒤에 덮인다.
       목표 페이지가 될 때까지 다시 부르고, 되면 바로 멈춘다. */
    var n=0, want='page-'+page;
    (function tick(){
      n++;
      var done=false;
      try{
        var cw=fr.contentWindow, cd=cw.document, cur=cd.querySelector('#content .page.active');
        if(typeof cw.go==='function' && cur){
          if(cur.id===want) done=true; else cw.go(page);
        }
      }catch(e){}
      if(!done && n<60) setTimeout(tick,450);
    })();
  }

  function quickMenu(){
    if(document.getElementById('mquick')) return;
    var wrap=document.querySelector('.stage-wrap'); if(!wrap) return;
    var q=document.createElement('div'); q.id='mquick';
    q.innerHTML='<button type="button" data-q="erp:hsbroadcast">📺 홈쇼핑</button>'
      +'<button type="button" data-q="panel:3">🗂️ 업무 현황</button>'
      +'<button type="button" data-q="erp:stock">📦 재고</button>'
      +'<button type="button" data-q="erp:item">🏷️ 품목</button>';
    wrap.appendChild(q);
    q.addEventListener('click',function(e){
      var b=e.target.closest('button'); if(!b) return;
      var v=(b.dataset.q||'').split(':');
      if(v[0]==='panel'){ go(parseInt(v[1],10)||0); return; }
      if(v[0]==='erp') openErp(v[1]);
    });
  }

  /* '예정된 미팅 없음' 은 한 줄에 네 개를 넣기엔 길다. 예정이 있을 때의 날짜 표기는
     그대로 두고, 비어 있을 때만 짧게 바꾼다. nexus-live.js 가 다시 쓰므로 관찰자로 건다. */
  function shortMeetingLabel(){
    var mn=document.getElementById('meeting-next'); if(!mn||mn.dataset.shortHooked) return;
    mn.dataset.shortHooked='1';
    var fix=function(){ if(mn.textContent.trim()==='예정된 미팅 없음') mn.textContent='미팅 없음'; };
    fix();
    try{ new MutationObserver(fix).observe(mn,{childList:true,characterData:true,subtree:true}); }catch(e){}
  }


  /* v3: people grid (2·2·3) with live 3D portraits; CAM buttons open the 3D view full screen */
  var ROWS=[['heeka','juyeon'],['dabin','greg'],['chansik','ian','jony']];
  function person(id){ var P=(window.NEXUS&&window.NEXUS.PEOPLE)||[]; for(var i=0;i<P.length;i++) if(P[i].id===id) return P[i]; return {id:id,name:id}; }
  function buildOffice3(){
    var wrap=document.querySelector('.p-office .stage-wrap'); if(!wrap||document.getElementById('m-cam-ceo')) return;
    var g=null;

    var mc=document.querySelector('.p-office .meeting-control');
    if(mc&&!document.getElementById('m-cam-ceo')){
      [['m-cam-ceo','대표이사실','ceo'],['m-cam-room','미팅룸','room']].forEach(function(x){ var b=document.createElement('button'); b.type='button'; b.id=x[0]; b.className='mini m-cam'; b.textContent=x[1]; b.addEventListener('click',function(){ openStage(x[2]); }); mc.appendChild(b); });
    }
    if(!document.querySelector('.m-stage-close')){ var cb=document.createElement('button'); cb.type='button'; cb.className='m-stage-close'; cb.textContent='✕ 닫기'; cb.addEventListener('click',closeStage); document.body.appendChild(cb); }
    applyLayout(); window.addEventListener('nexus-scene-ready',function(){ setTimeout(applyLayout,300); });
  }
  function refreshPeople(){
    var N=window.NEXUS||{};
    Array.prototype.forEach.call(document.querySelectorAll('#mpeople [data-mp]'),function(c){
      var p=person(c.dataset.mp); c.style.setProperty('--pc',p.color||'#2f7f73');
      c.querySelector('b').innerHTML=(p.name||'')+(p.title?'<em>'+p.title+'</em>':'');
      var act=N.activityOf?N.activityOf(p.id):''; c.querySelector('small').textContent=(p.team||'')+(act?' · '+act:'');
      if(p.kind==='AI'&&!c.querySelector('.ai')){ var t=document.createElement('span'); t.className='ai'; t.textContent='AI'; c.appendChild(t); }
      var url=N.portrait?N.portrait(p.id,220):null;
      if(url){ var ph=c.querySelector('.ph'); if(ph){ var im=new Image(); im.alt=p.name||''; ph.replaceWith(im); } c.querySelector('img').src=url; }
    });
  }
  function applyLayout(){ window.__nxNoOrbit=false; try{ if(window.NEXUS&&window.NEXUS.setMobileLayout) window.NEXUS.setMobileLayout(mq.matches); }catch(e){} }
  function syncCam(){ var cur=(window.NEXUS&&window.NEXUS.currentView&&window.NEXUS.currentView())||'office'; [['ceo','m-cam-ceo','대표이사실'],['room','m-cam-room','미팅룸']].forEach(function(k){ var b=document.getElementById(k[1]); if(!b) return; var on=cur===k[0]; b.classList.toggle('on',on); b.textContent=on?'↩ 오피스로':k[2]; }); }
  function openStage(v){ var cur=(window.NEXUS&&window.NEXUS.currentView&&window.NEXUS.currentView())||'office'; var next=cur===v?'office':v; try{ window.NEXUS.setView(next); }catch(e){} syncCam(); }
  setInterval(function(){ if(mq.matches) syncCam(); },800);
  function closeStage(){ try{ window.NEXUS.setView('office'); }catch(e){} document.body.classList.remove('m-stage-open'); setTimeout(function(){ window.dispatchEvent(new Event('resize')); },50); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',setup); else setup();
  mq.addEventListener&&mq.addEventListener('change',function(){ setup(); try{ applyLayout(); }catch(e){} window.dispatchEvent(new Event('resize')); });
  // PWA: allow "홈 화면에 추가" / 설치
  if('serviceWorker' in navigator){ window.addEventListener('load',function(){ navigator.serviceWorker.register('./sw.js',{scope:'./'}).catch(function(){}); }); }

  /* PWA 설치 버튼 (2026-11-13)
     크롬 메뉴의 '앱 설치'는 버전·기기마다 이름과 위치가 달라 사용자가 못 찾는다.
     beforeinstallprompt 를 잡아 두었다가 앱 안의 버튼으로 설치창을 띄운다.
     이 이벤트가 뜬다는 것 자체가 '설치 요건을 다 갖췄다'는 크롬의 신호다. */
  (function installBar(){
    var SNOOZE='nx_install_snooze', deferred=null, bar=null;
    function installed(){
      return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
    }
    function snoozed(){
      try{ var t=+localStorage.getItem(SNOOZE)||0; return Date.now()-t < 7*24*60*60*1000; }catch(e){ return false; }
    }
    function hide(){ if(bar){ bar.hidden=true; } }
    function show(){
      if(!mq.matches || installed() || snoozed() || !deferred) return;
      if(!bar){
        bar=document.createElement('div'); bar.id='minstall'; bar.className='minstall';
        bar.innerHTML='<span>📱 NEXUS를 앱으로 설치하면 주소창 없이 바로 열립니다</span>'+
          '<button type="button" data-a="go">설치</button>'+
          '<button type="button" data-a="later" aria-label="나중에">✕</button>';
        document.body.appendChild(bar);
        bar.addEventListener('click',function(e){
          var b=e.target.closest('button'); if(!b) return;
          if(b.dataset.a==='later'){ try{ localStorage.setItem(SNOOZE,String(Date.now())); }catch(err){} hide(); return; }
          if(!deferred) return;
          hide();
          deferred.prompt();
          deferred.userChoice.then(function(c){
            if(c && c.outcome==='accepted'){ deferred=null; }
            else { try{ localStorage.setItem(SNOOZE,String(Date.now())); }catch(err){} }
          }).catch(function(){});
        });
      }
      bar.hidden=false;
    }
    window.addEventListener('beforeinstallprompt',function(e){ e.preventDefault(); deferred=e; show(); });
    window.addEventListener('appinstalled',function(){ deferred=null; hide(); try{ localStorage.removeItem(SNOOZE); }catch(e){} });
    mq.addEventListener && mq.addEventListener('change',function(){ if(mq.matches) show(); else hide(); });
    window.NEXUS_INSTALL = { available:function(){ return !!deferred; }, show:function(){ try{ localStorage.removeItem(SNOOZE); }catch(e){} show(); } };
  })();
})();
