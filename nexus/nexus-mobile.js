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
    document.getElementById('home-logo')&&document.getElementById('home-logo').addEventListener('click',goHome);
    // name badge opens a small menu (settings, connections, logout)
    var nm=document.getElementById('rail-name114'); if(nm) nm.addEventListener('click',function(){ if(!mq.matches) return; var s=sheet(); document.getElementById('msheet-name').textContent=nm.textContent.replace(/관리자|임원|조회 권한/,'').trim()||'내 계정';
      /* 항상 보여 준다 — 설치를 못 띄우는 경우에도 이유를 알려 주는 게 낫다 */
      var ib=document.getElementById('msheet-install');
      if(ib){ ib.hidden=false;
        ib.textContent = (window.NEXUS_INSTALL && window.NEXUS_INSTALL.installed())
          ? '📱 앱 설치 상태 확인' : '📱 앱으로 설치'; }
      s.hidden=false; });
    setTimeout(function(){ window.dispatchEvent(new Event('resize')); },600);
    buildOffice3();
    quickMenu();
    shortMeetingLabel();
    railIcons();
    backStack();
    setupPullRefresh();
  }

  /* 빠른 메뉴 + 하단 한 줄 + 뒤로가기 (2026-11-13) */

  /* ERP 는 부팅 끝에 localStorage reniv_last_page 와 sessionStorage
     reniv_session_active 를 보고 시작 페이지를 정한다(index.html doRender).
     아이프레임은 늘 '새 세션' 이라 dashboard 로 갔다 — 그래서 눌러 둔 페이지가
     잠깐 보이다 홈으로 넘어갔다. NEXUS 와 ERP 는 같은 오리진이니 열기 전에
     그 두 값을 넣어 두면 부팅이 목표 페이지에서 끝난다. */
  function openErp(page){
    var fr=document.getElementById('erp-frame37'), sh=document.getElementById('erp-shell37');
    if(!fr||!sh) return;
    try{ localStorage.setItem('reniv_last_page', page); }catch(e){}
    try{ sessionStorage.setItem('reniv_session_active','1'); }catch(e){}
    sh.hidden=false;
    if(!erpLayer){ erpLayer=true; nxPush(); }
    if(!fr.getAttribute('src')) fr.src=new URL('../',location.href).href;
    var seq=(openErp.seq=(openErp.seq||0)+1), want='page-'+page, tries=0, held=0;
    function at(){
      if(seq!==openErp.seq||sh.hidden) return;
      tries++;
      var ready=false;
      try{
        var cw=fr.contentWindow, cd=cw&&cw.document;
        if(cd&&cd.readyState==='complete'&&typeof cw.go==='function'&&cd.getElementById(want)){
          ready=true;
          var cur=cd.querySelector('#content .page.active');
          if(!cur||cur.id!==want){ cw.go(page); held=0; } else held++;
        }
      }catch(e){}
      /* 목표 페이지에 3번 연속 머무르면(약 3.6초) 손을 뗀다 — 그 뒤 사용자가
         ERP 메뉴로 이동하는 것을 방해하지 않기 위해서다. */
      if(ready){ if(held<3) setTimeout(at,1200); return; }
      if(tries<120) setTimeout(at,250);
    }
    at();
  }

  /* 뒤로가기 — 폰에서 ERP 화면이나 대표이사실로 들어간 뒤 뒤로가기를 누르면
     사이트를 통째로 나가 버렸다. 들어갈 때 히스토리에 한 겹을 쌓아 두고,
     뒤로가기는 맨 위의 겹 하나만 닫는다. */
  var backBusy=false, inPop=false, erpLayer=false;
  function nxPush(){ try{ history.pushState({nxLayer:((history.state&&history.state.nxLayer)||0)+1},''); }catch(e){} }
  function nxPop(){ if(inPop) return; try{ if(history.state&&history.state.nxLayer){ backBusy=true; history.back(); setTimeout(function(){ backBusy=false; },400); } }catch(e){} }
  function closeTop(){
    var s=document.getElementById('msheet'); if(s&&!s.hidden){ s.hidden=true; return true; }
    var sh=document.getElementById('erp-shell37');
    if(sh&&!sh.hidden){ erpLayer=false; var hb=document.getElementById('erp-home37'); if(hb) hb.click(); else sh.hidden=true; return true; }
    var dr=document.getElementById('drawer');
    if(dr&&!dr.hidden){ var c=document.getElementById('drawer-close-live'); if(c) c.click(); else dr.hidden=true; return true; }
    try{ if(window.NEXUS&&window.NEXUS.currentView&&window.NEXUS.currentView()!=='office'){ window.NEXUS.setView('office'); syncCam(); return true; } }catch(e){}
    if(idx>0){ go(0); return true; }
    return false;
  }
  function backStack(){
    if(window.__nxBackHooked) return; window.__nxBackHooked=true;
    window.addEventListener('popstate',function(){
      if(backBusy){ backBusy=false; return; }
      if(!mq.matches) return;
      /* 이 겹은 이미 브라우저가 걷어냈다. 닫는 동안 nxPop 이 또 부르지 않게 막는다. */
      inPop=true; try{ closeTop(); } finally { setTimeout(function(){ inPop=false; },0); }
    });
    /* 셸 머리말의 '홈으로' 로 닫았을 때도 겹을 같이 걷어낸다 */
    var hb=document.getElementById('erp-home37');
    if(hb) hb.addEventListener('click',function(){ erpLayer=false; nxPop(); });
    /* ERP 탭은 언제나 ERP 홈으로. 빠른 메뉴로 다른 페이지를 열면 reniv_last_page 가
       그 값으로 남아 부팅이 거기로 복원된다 — 'dashboard' 로 덮어쓴다. */
    var nb=document.getElementById('nav-erp37');
    if(nb) nb.addEventListener('click',function(){ if(mq.matches) openErp('dashboard'); });
  }

  function quickMenu(){
    if(document.getElementById('mquick')) return;
    var wrap=document.querySelector('.stage-wrap'); if(!wrap) return;
    var q=document.createElement('div'); q.id='mquick';
    q.innerHTML='<button type="button" data-q="erp:hsbroadcast">📺 홈쇼핑 분석</button>'
      +'<button type="button" data-q="panel:3">🗂️ 업무 현황</button>'
      +'<button type="button" data-q="erp:approval">🧾 결재 현황</button>'
      +'<button type="button" data-q="erp:stock">📦 재고 현황</button>'
      +'<button type="button" data-q="erp:item">🏷️ 품목 현황</button>';
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



  /* 하단 탭바 모양 통일 (2026-11-13)
     ERP 는 테두리 친 글자 배지, 르니브는 잘린 로고 이미지라 혼자 달랐다.
     둘 다 '아이콘 + 글씨' 로 맞춘다. onclick 은 요소 속성이라 내용을 갈아도 남는다. */
  function railIcons(){
    if(!mq.matches) return;
    var e=document.getElementById('nav-erp37');
    if(e&&!e.dataset.mIcon){ e.dataset.mIcon='1';
      e.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><use href="#i-grid"/></svg><span>ERP</span>'; }
    var h=document.getElementById('home-logo');
    if(h&&!h.dataset.mIcon){ h.dataset.mIcon='1'; h.setAttribute('title','홈 화면');
      h.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10.6 12 3.2l9 7.4"/><path d="M5.6 9.6V20.3h12.8V9.6"/><path d="M9.9 20.3v-5h4.2v5"/></svg><span>Home</span>'; }
  }

  /* 홈 버튼은 지금까지 go(0) 만 했다. ERP 셸이 열려 있으면 그 위를 덮고 있어
     화면이 안 바뀌었다 — 열려 있는 것을 먼저 닫는다. */
  function goHome(){
    var sh=document.getElementById('erp-shell37');
    if(sh&&!sh.hidden){ erpLayer=false; var hb=document.getElementById('erp-home37'); if(hb) hb.click(); else { sh.hidden=true; nxPop(); } }
    var dr=document.getElementById('drawer');
    if(dr&&!dr.hidden){ var c=document.getElementById('drawer-close-live'); if(c) c.click(); }
    go(0);
    try{ window.NEXUS.setView('office'); }catch(e){}
    setTimeout(function(){ try{ syncCam(); }catch(e){} },50);
  }


  /* ── 당겨서 새로고침 (2026-11-14) ─────────────────────────────────
     브라우저 기본 동작은 못 쓴다: 가로 4페이지 구조 때문에 html,body 가
     overflow:hidden + overscroll-behavior:none 이라 문서가 세로로 안 움직인다.
     설치한 앱에는 주소창도 없어서 새로고침할 다른 길이 없다. 직접 만든다. */
  function pullRefresh(doc, onRefresh){
    if(!doc || doc.__ptrHooked) return; doc.__ptrHooked=1;
    var TH=72, MAX=120;
    var win=doc.defaultView, ind=null, sc=null, y0=0, x0=0, dist=0, live=false, busy=false;

    function ring(){
      if(ind && ind.isConnected) return ind;
      ind=doc.createElement('div'); ind.className='mptr'; ind.innerHTML='<i></i>';
      (doc.body||doc.documentElement).appendChild(ind);
      return ind;
    }
    function draw(d){
      var e=ring(); e.classList.add('on'); e.classList.remove('spin');
      e.style.transform='translate(-50%,'+Math.round(d)+'px) scale('+(0.7+Math.min(1,d/TH)*0.3)+')';
      e.style.opacity=String(Math.min(1,d/(TH*0.7)));
      e.firstChild.style.transform='rotate('+Math.round(d*3)+'deg)';
    }
    function spin(){
      var e=ring(); e.classList.add('on','spin');
      e.style.transform='translate(-50%,'+TH+'px) scale(1)'; e.style.opacity='1';
      e.firstChild.style.transform='';
    }
    function hide(){ if(ind){ ind.classList.remove('on','spin'); ind.style.opacity='0'; } }

    /* 손이 닿은 지점에서 바깥으로 올라가며 '세로로 스크롤되는 상자' 를 찾는다 */
    function scrollerOf(t){
      for(var n=t; n && n.nodeType===1 && n!==doc.body && n!==doc.documentElement; n=n.parentElement){
        var cs; try{ cs=win.getComputedStyle(n); }catch(e){ break; }
        if(/(auto|scroll)/.test(cs.overflowY) && n.scrollHeight>n.clientHeight+2) return n;
      }
      return doc.scrollingElement||doc.documentElement;
    }

    doc.addEventListener('touchstart',function(e){
      live=false;
      if(busy || !mq.matches || e.touches.length!==1) return;
      var t=e.target;
      if(t && t.closest && t.closest('#stage')) return;     /* 3D 는 시점 조작이 우선 */
      sc=scrollerOf(t);
      if(!sc || (sc.scrollTop||0) > 0) return;
      y0=e.touches[0].clientY; x0=e.touches[0].clientX; dist=0; live=true;
    },{passive:true});

    doc.addEventListener('touchmove',function(e){
      if(!live) return;
      var dy=e.touches[0].clientY-y0, dx=Math.abs(e.touches[0].clientX-x0);
      if(dy<=0 || dx>dy){ live=false; hide(); return; }      /* 가로 스와이프는 페이지 넘김 */
      if(sc && (sc.scrollTop||0)>0){ live=false; hide(); return; }
      dist=Math.min(MAX, dy*0.55);
      if(e.cancelable) e.preventDefault();
      draw(dist);
    },{passive:false});

    function end(){
      if(!live) return; live=false;
      if(dist>=TH){ busy=true; spin(); setTimeout(function(){ onRefresh(function(){ busy=false; hide(); }); },260); }
      else hide();
    }
    doc.addEventListener('touchend',end,{passive:true});
    doc.addEventListener('touchcancel',function(){ live=false; hide(); },{passive:true});
  }

  function setupPullRefresh(){
    pullRefresh(document,function(done){
      /* 슬랙 페이지는 자체 새로고침이 있다 — 통째로 다시 띄우는 것보다 훨씬 빠르다 */
      try{
        if(idx===1){
          var rb=document.querySelector('.slack-panel35 [class*="slack-refresh"]');
          if(rb){ rb.click(); setTimeout(done,1400); return; }
        }
      }catch(e){}
      location.reload();
    });
    /* ERP 화면이 열리면 그 안에서도 되게 한다 (같은 오리진) */
    var fr=document.getElementById('erp-frame37');
    if(fr && !fr.dataset.ptr){
      fr.dataset.ptr='1';
      fr.addEventListener('load',function(){
        try{
          var cd=fr.contentWindow.document;
          injectPtrCss(cd);
          pullRefresh(cd,function(){ try{ fr.contentWindow.location.reload(); }catch(e){} });
        }catch(e){}
      });
    }
  }

  /* 아이프레임 문서에는 nexus-mobile.css 가 없다 — 표시기 모양만 따로 넣어 준다 */
  function injectPtrCss(cd){
    if(!cd || cd.getElementById('mptr-css')) return;
    var s=cd.createElement('style'); s.id='mptr-css';
    s.textContent='.mptr{position:fixed;left:50%;top:0;z-index:2147482000;width:34px;height:34px;border-radius:50%;'
      +'background:#fff;box-shadow:0 2px 10px rgba(22,35,31,.22);display:none;align-items:center;justify-content:center;'
      +'pointer-events:none;opacity:0;transition:opacity .15s}'
      +'.mptr.on{display:flex}'
      +'.mptr i{display:block;width:16px;height:16px;border-radius:50%;border:2px solid #d6e0dc;border-top-color:#27537f}'
      +'.mptr.spin i{animation:mptrspin .7s linear infinite}'
      +'@keyframes mptrspin{to{transform:rotate(360deg)}}';
    (cd.head||cd.documentElement).appendChild(s);
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
  function openStage(v){ var cur=(window.NEXUS&&window.NEXUS.currentView&&window.NEXUS.currentView())||'office'; var next=cur===v?'office':v; try{ window.NEXUS.setView(next); }catch(e){}
    if(mq.matches){ if(next==='office') nxPop(); else if(cur==='office') nxPush(); }
    syncCam(); }
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
    /* 실측으로 확인한 두 가지를 고쳤다 (2026-11-14)
       · 스누즈가 7일이라, ✕ 한 번 또는 설치창 '취소' 한 번으로 설치 경로가 일주일 막혔다.
         -> 1일로 줄이고, 설치창에서 취소한 경우에는 스누즈하지 않는다.
       · 이름 메뉴의 '앱 설치' 가 설치 가능할 때만 보였다 -> 항상 보이고, 못 띄우면 이유를 말한다.
       설치 여부는 추측하지 않고 navigator.getInstalledRelatedApps() 에 묻는다
       (manifest 의 related_applications 에 자기 자신을 적어 뒀다). */
    var SNOOZE='nx_install_snooze', DONE='nx_installed', DAY=24*60*60*1000;
    var deferred=null, bar=null, installedApp=null;

    function standalone(){
      try{ return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; }catch(e){ return false; }
    }
    function snoozed(){
      try{ var t=+localStorage.getItem(SNOOZE)||0; return Date.now()-t < DAY; }catch(e){ return false; }
    }
    function mark(k,v){ try{ v==null?localStorage.removeItem(k):localStorage.setItem(k,String(v)); }catch(e){} }
    function say(msg){
      var el=document.getElementById('toast'); if(!el){ return; }
      el.textContent=msg; el.classList.add('show');
      clearTimeout(say.t); say.t=setTimeout(function(){ el.classList.remove('show'); },5200);
    }
    function checkInstalled(){
      if(typeof navigator.getInstalledRelatedApps!=='function') return Promise.resolve(null);
      return navigator.getInstalledRelatedApps().then(function(list){
        installedApp=(list||[]).filter(function(a){ return a && a.platform==='webapp'; })[0]||null;
        if(installedApp) mark(DONE,'1');
        return installedApp;
      }).catch(function(){ return null; });
    }

    function hide(){ if(bar) bar.hidden=true; }
    function build(kind){
      if(!bar){
        bar=document.createElement('div'); bar.id='minstall'; bar.className='minstall';
        document.body.appendChild(bar);
        bar.addEventListener('click',function(e){
          var b=e.target.closest('button'); if(!b) return;
          if(b.dataset.a==='later'){ mark(SNOOZE,Date.now()); hide(); return; }
          if(b.dataset.a==='how'){ say(whereIsIt()); return; }
          if(b.dataset.a==='go') doPrompt();
        });
      }
      bar.innerHTML = (kind==='installed')
        ? '<span>🏠 설치돼 있습니다 — 홈 화면을 <b>위로 쓸어올려</b> 앱 목록에서 <b>NEXUS</b></span>'
          + '<button type="button" data-a="how">자세히</button>'
          + '<button type="button" data-a="later" aria-label="닫기">✕</button>'
        : '<span>📱 NEXUS를 앱으로 설치하면 주소창 없이 바로 열립니다</span>'
          + '<button type="button" data-a="go">설치</button>'
          + '<button type="button" data-a="later" aria-label="나중에">✕</button>';
      bar.hidden=false;
    }
    function show(force){
      if(!mq.matches || standalone()) return;
      if(deferred){ if(!force && snoozed()) return; build('prompt'); return; }
      if(installedApp){ if(!force && snoozed()) return; build('installed'); return; }
      if(force) say(reason());
    }
    /* ⚠️ 크롬 ⋮ 메뉴의 '앱으로 열기' 는 버전에 따라 없다. 메뉴에 기대지 않는다.
       설치되면 안드로이드가 **일반 앱으로** 등록하므로 앱 목록에는 반드시 있다. */
    function whereIsIt(){
      return '① 홈 버튼을 눌러 홈 화면으로 나갑니다 → ② 화면 가운데를 위로 쓸어올리면 앱 목록이 열립니다 '
        + '→ ③ 맨 위 검색칸에 NEX 를 치면 NEXUS 가 나옵니다 → ④ 누르면 주소창 없이 열립니다. '
        + '길게 눌러 홈 화면으로 끌어다 두면 다음부터 바로 열 수 있습니다.';
    }
    function reason(){
      if(standalone()) return '이미 앱으로 실행 중입니다.';
      if(installedApp) return '이미 설치돼 있습니다. ' + whereIsIt();
      if(/iPhone|iPad|iPod/i.test(navigator.userAgent))
        return 'iPhone은 Safari 공유 버튼 → "홈 화면에 추가" 로 설치합니다.';
      return '크롬 ⋮ 메뉴 → "앱 설치" 또는 "홈 화면에 추가" 를 눌러 주세요. 잠시 뒤 설치 버튼이 다시 나타날 수도 있습니다.';
    }
    function doPrompt(){
      if(!deferred){ say(reason()); return; }
      hide();
      var d=deferred;
      d.prompt();
      d.userChoice.then(function(c){
        if(c && c.outcome==='accepted'){ deferred=null; mark(DONE,'1'); mark(SNOOZE,null); }
        /* 취소는 스누즈하지 않는다 — 오탭일 수 있고, 다시 누를 길을 남긴다 */
        else { setTimeout(function(){ show(false); },1200); }
      }).catch(function(){});
    }

    window.addEventListener('beforeinstallprompt',function(e){
      e.preventDefault(); deferred=e; installedApp=null; show(false);
    });
    window.addEventListener('appinstalled',function(){
      deferred=null; hide(); mark(SNOOZE,null); mark(DONE,'1');
      say('설치했습니다. 홈 화면의 NEXUS 아이콘으로 열어 주세요.');
      setTimeout(checkInstalled,1500);
    });
    mq.addEventListener && mq.addEventListener('change',function(){ if(mq.matches) show(false); else hide(); });

    /* 설치창이 안 뜨는 경우(= 이미 설치됨)를 사실로 확인해 안내한다 */
    checkInstalled().then(function(){ setTimeout(function(){ show(false); },3000); });

    window.NEXUS_INSTALL = {
      available: function(){ return !!deferred; },
      installed: function(){ return !!installedApp || standalone(); },
      show: function(){ mark(SNOOZE,null); show(true); },
      reason: reason,
      diagnose: function(){
        return checkInstalled().then(function(){
          return { deferred:!!deferred, installedApp:installedApp, standalone:standalone(),
                   snoozed:snoozed(), mobile:mq.matches, ua:navigator.userAgent };
        });
      }
    };
  })();
})();
