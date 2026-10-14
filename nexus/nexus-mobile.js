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
    s.innerHTML='<div class="msheet-box"><h4 id="msheet-name"></h4><button type="button" data-a="settings">업무 설정</button><button type="button" data-a="conn">연동 상태</button><button type="button" data-a="pc">PC 화면으로 보기</button><button type="button" class="danger" data-a="logout">로그아웃</button><button type="button" class="cancel" data-a="close">닫기</button></div>';
    document.body.appendChild(s);
    s.addEventListener('click',function(e){ var b=e.target.closest('button'); if(e.target===s||!b){ if(e.target===s) s.hidden=true; return; } s.hidden=true; var a=b.dataset.a;
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
    var nm=document.getElementById('rail-name114'); if(nm) nm.addEventListener('click',function(){ if(!mq.matches) return; var s=sheet(); document.getElementById('msheet-name').textContent=nm.textContent.replace(/관리자|임원|조회 권한/,'').trim()||'내 계정'; s.hidden=false; });
    setTimeout(function(){ window.dispatchEvent(new Event('resize')); },600);
    buildOffice3();
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
})();
