import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { getFirestore, doc, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const FIREBASE_CONFIG = Object.freeze({
  apiKey: 'AIzaSyDP8KBmUQzvH9iH9YQlFa-A87fcOIV09aM',
  authDomain: 'reniv-erp-135a3.firebaseapp.com',
  projectId: 'reniv-erp-135a3',
  storageBucket: 'reniv-erp-135a3.firebasestorage.app',
  messagingSenderId: '462652770421',
  appId: '1:462652770421:web:0ac37bf92ec724e70f903c'
});
const API_BASE = 'https://asia-northeast3-reniv-erp-135a3.cloudfunctions.net/nexusApi';
const ERP_URL = 'https://renivcto.github.io/ERP/';
const HUDDLE_URL = 'https://app.slack.com/huddle/T0AU32P7W0Y/C0ATMM25KB3';
const POLL_MS = 60000;
const KRW_FALLBACK = Object.freeze({ USD:1380, AUD:900, EUR:1480, JPY:9, CNY:190, GBP:1750 });

const STAFF = Object.freeze([
  { id:'jaeho', name:'이재호', title:'대표', kind:'사람', role:'대표이사 · 경영 총괄', color:'#2f4858' },
  { id:'tim', name:'Tim', title:'비서', kind:'AI', role:'대표이사실 AI 비서 · 일정과 보고 정리', color:'#2a9e96' },
  { id:'dabin', name:'권다빈', title:'이사', kind:'사람', role:'마케팅팀 이사 · 캠페인과 광고', color:'#a8823f' },
  { id:'greg', name:'Greg', title:'', kind:'AI', role:'마케팅팀 AI · 광고 소재 분석', color:'#d9a441' },
  { id:'heeka', name:'송희강', title:'이사', kind:'사람', role:'R&D팀 이사 · 원료와 제품 연구', color:'#c9467e' },
  { id:'jony', name:'Jony', title:'', kind:'AI', role:'디자인팀 AI · 콘텐츠와 시안 정리', color:'#c96a50' },
  { id:'chansik', name:'백찬식', title:'이사', kind:'사람', role:'국내영업팀 이사 · 주문과 거래처', color:'#3b78c4' },
  { id:'ian', name:'Ian', title:'', kind:'AI', role:'국내영업팀 AI · 주문 수집과 정리', color:'#2f8fd8' },
  { id:'juyeon', name:'이주연', title:'본부장', kind:'사람', role:'재무팀 본부장 · 예산과 지출', color:'#3f8a63' }
]);
const STAFF_PAIRS = Object.freeze([['jaeho','tim'],['dabin','greg'],['heeka','jony'],['chansik','ian'],['juyeon',null]]);
const ID_ALIASES=Object.freeze({'auth-title':'auth-title-live','auth-message':'auth-message-live','login-button':'login-live','auth-logout-button':'logout-live','auth-overlay':'auth-overlay-live','logout-button':'viewer-badge-live','viewer-name':'viewer-name36','viewer-role':'viewer-role36','viewer-avatar':'viewer-face36','metric-approvals':'led-approvals','metric-expenses':'led-expenses','metric-due':'led-payment-live','personal-task-count':'my-count35','personal-tasks':'my-tasks35','calendar-source-filter':'company-board37','calendar-title-filter':'company-search37','calendar-count':'company-count37','company-calendar':'company-list37','slack-connect-button':'slack-connect-live','slack-channel-select':'slack-channel35','slack-feed':'slack-feed35','slack-text':'slack-text-live','slack-send-button':'slack-send-live','slack-form':'slack-form-live','slack-reload-button':'slack-refresh-live','slack-composer-note':'slack-note-live','reply-target':'slack-reply-live','meeting-new-button':'meeting-btn','meeting-close-button':'meeting-close','meeting-cancel-button':'meeting-cancel','meeting-delete-button':'meeting-delete','meeting-save-button':'meeting-save','meeting-dialog-title':'meeting-heading','meeting-list':'meeting-list-live','refresh-button':'erp-connect','home-button':'home-logo','subpage':'drawer','subpage-title':'drawer-title-live','subpage-content':'drawer-content-live','subpage-close':'drawer-close-live'});
const $ = id => document.getElementById(ID_ALIASES[id]||id);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const safeUrl = value => { try { const u = new URL(String(value || '')); return u.protocol === 'https:' ? u.href : ''; } catch { return ''; } };
const ymdKst = () => new Date(Date.now() + 9 * 3600000).toISOString().slice(0,10);
const uniq = arr => [...new Set(arr)];
const app = getApps()[0] || initializeApp(FIREBASE_CONFIG);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt:'select_account' });

const state = {
  user:null, profile:null, authorized:false, firestoreUnsubs:[], pollTimer:null, polling:false,
  erp:{approvals:[],expenses:[],orders:[],tasks:[],productions:[],items:[],poOverrides:{},expenseOverrides:{},sources:{},error:''},
  status:null, trello:{items:[],boards:[],me:null,fetchedAt:null,error:''},
  slack:{channels:[],messages:[],channel:'',replies:new Map(),replyTarget:null,error:'',loading:false,partial:false,failedChannelCount:0,truncated:false,fetchedAt:null,canPost:false,canReply:false,requestSeq:0},
  meetings:[], meetingError:'', meetingRequestId:null, meetingPayloadKey:null, scene:null, selectedPerson:'jaeho', selectedDate:ymdKst(), weekOffset:0, lastPollAt:null
};

let toastTimer;
function toast(message, isError=false){ const el=$('toast'); el.textContent=message; el.style.borderColor=isError?'#e2bcbc':''; el.style.color=isError?'#9d4545':''; el.classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.classList.remove('show'),3500); }
function setAuthOverlay(title,message,{login=false,logout=false}={}){ $('auth-title').textContent=title; $('auth-message').textContent=message; $('login-button').hidden=!login; $('auth-logout-button').hidden=!logout; $('auth-overlay').hidden=false; $('app').hidden=true; }
function showApp(){ $('auth-overlay').hidden=true; $('app').hidden=false; document.body.classList.remove('auth-pending'); }
function setBadge(id,text,mode=''){ const el=$(id); el.textContent=text; el.className='status-badge'+(mode?' '+mode:''); }
function newRequestId(){ return (globalThis.crypto?.randomUUID?.() || `req-${Date.now()}-${Math.random().toString(36).slice(2)}`); }
function formatKrw(value){ const n=Number(value)||0; return `₩${Math.round(n).toLocaleString('ko-KR')}`; }
function formatDateTime(value,timezone='Asia/Seoul'){
  if(!value) return '-'; const d=new Date(value); if(Number.isNaN(d.getTime())) return String(value);
  return new Intl.DateTimeFormat('ko-KR',{timeZone:timezone,month:'numeric',day:'numeric',weekday:'short',hour:'2-digit',minute:'2-digit',hour12:false}).format(d);
}
function getPath(obj,path){ return path.split('.').reduce((v,k)=>v && v[k],obj); }
function flag(obj,paths,fallback=false){ for(const path of paths){ const v=getPath(obj,path); if(typeof v==='boolean') return v; } return fallback; }
function apiErrorMessage(data,status){ return data?.error?.message || data?.message || `서버 요청 실패 (${status})`; }

async function api(path,options={}){
  const user=auth.currentUser;
  if(!user) throw Object.assign(new Error('로그인이 필요합니다.'),{code:'auth-required'});
  const token=await user.getIdToken();
  const headers={Accept:'application/json',Authorization:`Bearer ${token}`,...(options.headers||{})};
  if(options.body && !headers['Content-Type']) headers['Content-Type']='application/json';
  const response=await fetch(`${API_BASE}${path}`,{...options,headers,cache:'no-store'});
  let data=null; try{ data=await response.json(); }catch{ data={}; }
  if(!response.ok){ const err=new Error(apiErrorMessage(data,response.status)); err.code=data?.error?.code || `http-${response.status}`; err.status=response.status; if((response.status===401||response.status===403)&&state.authorized) lockApi(err.message); throw err; }
  return data;
}

function stopFirestore(){ state.firestoreUnsubs.splice(0).forEach(fn=>{ try{fn();}catch{} }); }
function stopPolling(){ if(state.pollTimer) clearInterval(state.pollTimer); state.pollTimer=null; state.polling=false; }
function clearExternal(){ state.status=null; state.trello={items:[],boards:[],me:null,fetchedAt:null,error:''}; state.slack={channels:[],messages:[],channel:'',replies:new Map(),replyTarget:null,error:'',loading:false,partial:false,failedChannelCount:0,truncated:false,fetchedAt:null,canPost:false,canReply:false,requestSeq:(state.slack?.requestSeq||0)+1}; state.meetings=[]; state.meetingError=''; }
function clearERP(error=''){ state.erp={approvals:[],expenses:[],orders:[],tasks:[],productions:[],items:[],poOverrides:{},expenseOverrides:{},sources:{},error}; if(window.NEXUS)window.NEXUS.workMode='offline'; renderAll(); }
function clearAll(){ stopFirestore(); stopPolling(); clearExternal(); state.authorized=false; state.user=null; state.profile=null; state.meetingRequestId=null; state.meetingPayloadKey=null; if($('meeting-dialog').open)$('meeting-dialog').close(); $('slack-text').value=''; $('erp-shell37').hidden=true; $('erp-frame37').removeAttribute('src'); closeSubpage(); clearERP(''); $('viewer-name').textContent='사용자 확인 중'; $('viewer-role').textContent='읽기 전용'; $('logout-button').textContent='나'; if(state.scene) state.scene.returnSeats(); }

function parseJson(value,fallback){ if(value == null) return fallback; if(typeof value==='string'){ try{return JSON.parse(value);}catch{return fallback;} } return value; }
function parseErpDoc(snap,fallback=[]){ if(!snap.exists()) return fallback; const data=snap.data()||{}; const parsed=parseJson(data.data,fallback); return Array.isArray(fallback) ? (Array.isArray(parsed)?parsed:fallback) : (parsed && typeof parsed==='object'&&!Array.isArray(parsed)?parsed:fallback); }
function parseSharedDoc(snap){ if(!snap.exists()) return {}; const data=snap.data()||{}; const parsed=parseJson(data.value ?? data.data,{}); return parsed && typeof parsed==='object'&&!Array.isArray(parsed)?parsed:{}; }
function subscribeERP(){
  stopFirestore();
  const defs=[
    ['approvals','erp_data','approvals','array'],['expenses','erp_data','expenses','array'],['orders','erp_data','orders','array'],
    ['tasks','erp_data','tasks','array'],['productions','erp_data','productions','array'],['items','erp_data','items','array'],
    ['poOverrides','shared','po_approval_overrides','object'],['expenseOverrides','shared','expense_paid_overrides','object']
  ];
  setBadge('erp-live-badge','ERP 연결 중','pending');
  for(const [key,col,id,type] of defs){
    const unsub=onSnapshot(doc(db,col,id),{includeMetadataChanges:true},snap=>{
      state.erp[key]=type==='array'?parseErpDoc(snap,[]):parseSharedDoc(snap);
      state.erp.sources[key]={fromCache:!!snap.metadata?.fromCache,at:Date.now()};
      state.erp.error=''; renderAll();
      const all=defs.every(([k])=>state.erp.sources[k]);
      if(all){ const cached=Object.values(state.erp.sources).some(s=>s.fromCache); setBadge('erp-live-badge',cached?'ERP 캐시 · 서버 확인 중':'ERP 실시간',''); window.NEXUS.workMode=cached?'offline':'live'; }
    },error=>{
      clearERP(`ERP 읽기 실패: ${error.code||'오류'}`);
      setBadge('erp-live-badge',error.code==='permission-denied'?'ERP 권한 없음':'ERP 오류','error');
    });
    state.firestoreUnsubs.push(unsub);
  }
}

function orderTotal(o){
  let total=(o?.rows||[]).reduce((sum,row)=>sum+(parseFloat(row?.qty)||0)*(parseFloat(row?.price)||0),0);
  if(o?.__overseasConvertedToKrw) return total;
  if(o?.isOverseas && String(o.currency||'KRW').toUpperCase()!=='KRW') total=Math.round(total*(KRW_FALLBACK[String(o.currency).toUpperCase()]||0));
  return total;
}
function orderTotalVat(o){ if(o?.isOverseas){ const rate=KRW_FALLBACK[String(o.currency||'').toUpperCase()]||0; return orderTotal(o)+Math.round((parseFloat(o.oceanFreight)||0)*rate); } return Math.round(orderTotal(o)*1.1); }
function poSig(o){ return [String(o?.orderNo||''),String(o?.vendorId||''),String(o?.orderDate||'').slice(0,10),Math.round(Number(orderTotalVat(o))||0)].join('|'); }
function poOverrideOf(o){ const map=state.erp.poOverrides||{}; for(const key of [`id:${o?.id}`,`sig:${poSig(o)}`]) if(map[key] && typeof map[key]==='object') return map[key]; return null; }
function hasStamp(o){ return !!(o&&(o.stampData||o.stampName||o.stampedAt||o.stampNotRequired||o.approvalStampImage)); }
function orderApprovalStatus(o){
  if(!o) return 'pending'; if(hasStamp(o)) return 'approved';
  const ap=state.erp.approvals.find(a=>a?.type==='po_approval'&&String(a.refId)===String(o.id));
  if(ap?.status==='rejected') return 'rejected'; if(poOverrideOf(o)?.approved) return 'approved'; return ap?.status||'pending';
}
function expenseSig(e){ return `sig:${[e?.category||'',String(e?.vendor||'').trim(),String(e?.title||'').trim(),Math.round(Number(e?.amount)||0),e?.dueDate||'',e?.orderId||'',e?.sampleId||''].join('|')}`; }
function expenseKeys(e){ const keys=[]; if(e?.orderId&&['po_prepay','po_balance'].includes(e.category)) keys.push(`po:${e.orderId}:${e.category}`); if(e?.id!=null) keys.push(`id:${e.id}`); keys.push(expenseSig(e)); return keys; }
function effectiveExpensePaid(e){
  const map=state.erp.expenseOverrides||{},sig=expenseSig(e); let rec=null;
  for(const key of expenseKeys(e)){ const r=map[key]; if(!r) continue; if(key.startsWith('id:')&&r.sig&&r.sig!==sig) continue; rec=r; break; }
  if(rec) return !rec.notPaid; return e?.paidStatus==='paid';
}
function approvalMetrics(){
  const orders=state.erp.orders,approvals=state.erp.approvals;
  const stampedIds=new Set(orders.filter(hasStamp).map(o=>String(o.id)));
  const allIds=new Set(orders.map(o=>o?.id!=null?String(o.id):null).filter(Boolean));
  const pendingOrders=orders.filter(o=>!hasStamp(o)&&orderApprovalStatus(o)!=='approved');
  const pendingOrderIds=new Set(pendingOrders.map(o=>String(o.id)));
  const pendingApprovals=approvals.filter(a=>{
    if(!a||a.status!=='pending') return false;
    if(a.type==='po_approval'&&a.refId!=null){ const id=String(a.refId); if(!allIds.has(id)||stampedIds.has(id)||pendingOrderIds.has(id)) return false; }
    return true;
  });
  const unpaid=state.erp.expenses.filter(e=>e&&!effectiveExpensePaid(e));
  const now=new Date(),endYmd=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(new Date(now.getFullYear(),now.getMonth()+1,0).getDate()).padStart(2,'0')}`;
  const dueThisMonth=unpaid.filter(e=>{const due=String(e.dueDate||'').slice(0,10);return !due||due<=endYmd;}).reduce((s,e)=>s+(Number(e.amount)||0),0);
  return {approvals:pendingOrders.length+pendingApprovals.length,expenses:unpaid.length,dueThisMonth,pendingOrders,pendingApprovals,unpaid};
}
function explicitUidOfTask(t){
  const scalar=[t?.assigneeUid,t?.ownerUid,t?.assignedToUid,t?.uid].filter(Boolean).map(String);
  const arrays=[t?.assigneeUids,t?.ownerUids,t?.assignees].filter(Array.isArray).flatMap(list=>list.map(v=>String(typeof v==='object'?(v.uid||v.id||''):v)).filter(Boolean));
  return uniq([...scalar,...arrays]);
}
function taskDone(t){ return t?.done===true || ['완료','done','closed','complete','completed'].includes(String(t?.status||'').toLowerCase()); }
function erpOpenTasks(){ return state.erp.tasks.filter(t=>t&&!taskDone(t)); }
function trelloOpenCards(){ return state.trello.items.filter(c=>c&&!c.closed&&!c.dueComplete&&!c.badges?.dueComplete); }
function personalTasks(){
  if(!state.user) return [];
  const uid=state.user.uid,meId=state.trello.me?.id;
  const erp=erpOpenTasks().filter(t=>explicitUidOfTask(t).includes(uid)).map(t=>({id:`erp:${t.id}`,title:t.title||t.name||'제목 없음',due:t.due||t.dueDate||'',status:t.status||'진행 중',source:'ERP',url:ERP_URL}));
  const trello=meId?trelloOpenCards().filter(c=>(c.idMembers||[]).map(String).includes(String(meId))).map(c=>({id:`trello:${c.id}`,title:c.name||'제목 없음',due:c.due||c.start||'',status:c.dueComplete?'완료':'진행 중',source:'Trello',url:safeUrl(c.url||c.shortUrl)})):[];
  return [...erp,...trello].sort((a,b)=>String(a.due||'9999').localeCompare(String(b.due||'9999')));
}
function unmappedCount(){
  const erp=erpOpenTasks().filter(t=>explicitUidOfTask(t).length===0).length;
  const trello=trelloOpenCards().filter(c=>!Array.isArray(c.idMembers)||c.idMembers.length===0).length;
  return erp+trello;
}

function renderMetrics(){ const m=approvalMetrics(); $('metric-approvals').textContent=`${m.approvals}건`; $('metric-expenses').textContent=`${m.expenses}건`; $('metric-due').textContent=formatKrw(m.dueThisMonth); $('metric-unmapped').textContent=`${unmappedCount()}건`; }
function renderPersonal(){
  const tasks=personalTasks(); $('personal-task-count').textContent=String(tasks.length);
  $('personal-tasks').innerHTML=tasks.length?tasks.map(t=>`<article class="task-row"><a href="${escapeHtml(t.url||ERP_URL)}" target="_blank" rel="noopener noreferrer">${escapeHtml(t.title)}</a><div class="task-meta"><span class="task-source">${escapeHtml(t.source)}</span><span>${escapeHtml(t.status)}</span><span>${escapeHtml(t.due?formatDateTime(t.due):'일정 없음')}</span></div></article>`).join(''):'<div class="empty">현재 로그인 사용자에게 명시적으로 배정된 미처리 업무가 없습니다.</div>';
}
function productName(p){ const item=state.erp.items.find(i=>String(i?.id)===String(p?.productId)); return item?.name||p?.productName||'품목'; }
function boardMap(){ return new Map(state.trello.boards.map(b=>[String(b.id),b])); }
function toYmd(value,timezone='Asia/Seoul'){ if(!value) return ''; const d=new Date(value); if(Number.isNaN(d.getTime())) return String(value).slice(0,10); const parts=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d); const get=t=>parts.find(p=>p.type===t)?.value; return `${get('year')}-${get('month')}-${get('day')}`; }
function expandRange(start,end,max=400){ const out=[],s=new Date(`${start}T00:00:00Z`),e=new Date(`${end}T00:00:00Z`); if(Number.isNaN(s.getTime())||Number.isNaN(e.getTime())) return out; let cur=s; while(cur<=e&&out.length<max){ out.push(cur.toISOString().slice(0,10)); cur=new Date(cur.getTime()+86400000); } return out; }
function calendarEvents(){
  const boards=boardMap(),events=[];
  for(const c of state.trello.items){
    if(!c?.due&&!c?.start) continue; let start=toYmd(c.start||c.due),end=toYmd(c.due||c.start); if(!start||!end) continue; if(start>end) start=end;
    const board=boards.get(String(c.idBoard)); const dates=expandRange(start,end); dates.forEach((date,index)=>events.push({date,title:c.name||'제목 없음',source:board?.name||'Trello',color:board?.color||'#6c83a1',url:safeUrl(c.url||c.shortUrl),done:!!(c.closed||c.dueComplete||c.badges?.dueComplete),meta:dates.length>1?`${index+1}/${dates.length}일`:''}));
  }
  const productionOrderIds=new Set(state.erp.productions.map(p=>p?.orderId!=null?String(p.orderId):null).filter(Boolean));
  for(const p of state.erp.productions){
    const date=String(p?.inDate||'').slice(0,10); if(!date) continue;
    const labels={입고완료:'입고 완료',지연:'납기 지연',생산중:'입고 예정',생산대기:'생산 예정'}; if(!labels[p.status]) continue;
    events.push({date,title:`${productName(p)} ${labels[p.status]}`,source:'ERP 생산',color:p.status==='지연'?'#c95d57':p.status==='입고완료'?'#4e9a73':'#7b72b5',url:ERP_URL,done:p.status==='입고완료',meta:p.status});
  }
  for(const o of state.erp.orders){
    if(o?.orderId!=null&&productionOrderIds.has(String(o.orderId))) continue;
    if(productionOrderIds.has(String(o?.id))) continue;
    const date=String(o?.inDate||'').slice(0,10); if(!date) continue; const rows=o.rows||[],first=String(rows[0]?.name||'품목').replace(/<[^>]+>/g,'').trim(),extra=rows.length>1?` 외 ${rows.length-1}개`:'';
    events.push({date,title:`${first}${extra} 입고예정`,source:'ERP 발주',color:'#c9a53b',url:ERP_URL,done:o.stockStatus==='입고완료',meta:o.stockStatus||'입고전'});
  }
  return events.sort((a,b)=>a.date.localeCompare(b.date)||a.title.localeCompare(b.title));
}
function renderCalendar(){
  const source=$('calendar-source-filter').value,query=$('calendar-title-filter').value.trim().toLowerCase(),all=calendarEvents(),sources=uniq(all.map(e=>e.source)),prior=source;
  $('calendar-source-filter').innerHTML='<option value="">전체 출처</option>'+sources.map(s=>`<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');$('calendar-source-filter').value=sources.includes(prior)?prior:'';
  const filtered=all.filter(e=>(!$('calendar-source-filter').value||e.source===$('calendar-source-filter').value)&&(!query||e.title.toLowerCase().includes(query)));$('calendar-count').textContent=`${filtered.length}건`;
  const groups=new Map();filtered.forEach(e=>{if(!groups.has(e.date))groups.set(e.date,[]);groups.get(e.date).push(e)});$('company-calendar').innerHTML=groups.size?[...groups].map(([date,list])=>`<section class="calendar-group"><div class="calendar-date">${escapeHtml(date)}</div><div>${list.map(e=>`<article class="calendar-event ${e.done?'done':''}" style="--event-color:${escapeHtml(e.color)}"><i></i><div>${e.url?`<a href="${escapeHtml(e.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(e.title)}</a>`:`<span class="title">${escapeHtml(e.title)}</span>`}<small>${escapeHtml(e.meta||'')}</small></div><span class="event-source">${escapeHtml(e.source)}</span></article>`).join('')}</div></section>`).join(''):'<div class="empty">조건에 맞는 실제 일정이 없습니다.</div>';
  const base=new Date(state.selectedDate+'T00:00:00Z');base.setUTCDate(base.getUTCDate()-base.getUTCDay()+state.weekOffset*7);const days=Array.from({length:7},(_,i)=>{const d=new Date(base);d.setUTCDate(base.getUTCDate()+i);return d});const end=days[6];$('week-title32').textContent=`${base.getUTCMonth()+1}.${base.getUTCDate()} - ${end.getUTCMonth()+1}.${end.getUTCDate()}`;$('week-days32').innerHTML=days.map(d=>{const y=d.toISOString().slice(0,10),count=filtered.filter(e=>e.date===y).length;return `<button class="week-day32 ${y===state.selectedDate?'selected':''} ${y===ymdKst()?'today':''}" type="button" data-live-date="${y}"><span>${['일','월','화','수','목','금','토'][d.getUTCDay()]}</span><b>${d.getUTCDate()}</b>${count?'<i class="event-dot32"></i>':''}</button>`}).join('');
  const chosen=filtered.filter(e=>e.date===state.selectedDate);$('agenda-title32').textContent=state.selectedDate;$('agenda-count33').textContent=`${chosen.length}건`;$('agenda-content32').innerHTML=chosen.length?chosen.map(e=>`<a class="company-day37" href="${escapeHtml(e.url||ERP_URL)}" target="_blank" rel="noopener noreferrer"><b>${escapeHtml(e.title)}</b><small>${escapeHtml(e.source)} · ${escapeHtml(e.meta||'')}</small></a>`).join(''):'<div class="agenda-empty32">선택 날짜의 일정이 없습니다.</div>';$('progress-total32').textContent=`${chosen.filter(e=>e.done).length} / ${chosen.length}`;$('progress-note32').textContent=`미처리 ${chosen.filter(e=>!e.done).length}건`;$('progress-fill32').style.width=chosen.length?Math.round(chosen.filter(e=>e.done).length/chosen.length*100)+'%':'0%';
}
function normalizeTrello(data){
  const members=new Map((Array.isArray(data?.members)?data.members:[]).map(member=>[String(member.id),member]));
  const items=(Array.isArray(data?.items)?data.items:[]).map(card=>({...card,members:Array.isArray(card.members)?card.members:(card.idMembers||[]).map(id=>members.get(String(id))).filter(Boolean)}));
  const boards=Array.isArray(data?.boards)?data.boards:[];
  state.trello={items,boards,me:data?.me||null,fetchedAt:data?.fetchedAt||null,error:''}; renderAll();
}
const SLACK_SYSTEM_SUBTYPES=new Set(['channel_join','channel_leave','channel_topic','channel_purpose','channel_name','channel_archive','channel_unarchive','group_join','group_leave']);
const SLACK_KO_COLLATOR=new Intl.Collator('ko-KR',{sensitivity:'base',numeric:true});
function slackTsNumber(value){ const n=Number(value); return Number.isFinite(n)?n:0; }
function isSlackSystemMessage(m){ const rawType=String(m?.type||'').toLowerCase(),subtype=String(m?.subtype||m?.eventType||m?.event_type||(rawType!=='message'?rawType:'')).toLowerCase(); return m?.isSystem===true||SLACK_SYSTEM_SUBTYPES.has(subtype); }
function sortSlackChannels(channels){ return [...channels].sort((a,b)=>slackTsNumber(b?.latestMessageTs)-slackTsNumber(a?.latestMessageTs)||SLACK_KO_COLLATOR.compare(String(a?.name||a?.displayName||a?.id||''),String(b?.name||b?.displayName||b?.id||''))); }
function slackActivityTs(m){ return m?.activityTs||m?.latestReply||m?.ts||m?.timestamp||''; }
function sortSlackMessages(messages){ return [...messages].sort((a,b)=>slackTsNumber(slackActivityTs(b))-slackTsNumber(slackActivityTs(a))||slackTsNumber(b?.ts||b?.timestamp)-slackTsNumber(a?.ts||a?.timestamp)); }
function slackThreadKey(channelId,ts){ return `${String(channelId||'')}::${String(ts||'')}`; }
function slackRecipient(selectedChannel,replyTarget){ if(replyTarget?.channelId&&replyTarget?.ts)return {channelId:String(replyTarget.channelId),threadTs:String(replyTarget.ts)}; if(selectedChannel)return {channelId:String(selectedChannel),threadTs:''}; return null; }
function normalizeChannels(data){ const rows=Array.isArray(data?.channels)?data.channels:(Array.isArray(data?.items)?data.items:[]); state.slack.channels=sortSlackChannels(rows.filter(c=>c?.id)); if(state.slack.channel&&!state.slack.channels.some(c=>String(c.id)===String(state.slack.channel))){state.slack.channel='';state.slack.messages=[];state.slack.replies.clear();state.slack.replyTarget=null;} }
function applySlackMeta(data){ if(typeof data?.canPost==='boolean')state.slack.canPost=data.canPost;if(typeof data?.canReply==='boolean')state.slack.canReply=data.canReply;state.slack.fetchedAt=data?.fetchedAt||null;state.slack.partial=data?.partial===true;state.slack.failedChannelCount=Math.max(0,Number(data?.failedChannelCount)||0);state.slack.truncated=data?.truncated===true; }
function normalizeMessages(data,{aggregate=false}={}){ const rows=Array.isArray(data?.messages)?data.messages:(Array.isArray(data?.items)?data.items:[]); const selected=String(state.slack.channel||''); state.slack.messages=sortSlackMessages(rows.filter(m=>!isSlackSystemMessage(m)).map(m=>({...m,channelId:m?.channelId||(!aggregate?selected:''),channelName:m?.channelName||''}))); applySlackMeta(data); state.slack.error=''; }
function slackAuthor(m){ return m?.user?.real_name||m?.user?.name||m?.userName||m?.username||m?.displayName||(typeof m?.user==='string'?m.user:'')||'사용자'; }
function slackText(m){ return String(m?.text||m?.message||''); }
function slackTimeValue(value){ if(!value)return ''; const sec=Number(String(value).split('.')[0]); const d=Number.isFinite(sec)&&sec>1000000000?new Date(sec*1000):new Date(value); return Number.isNaN(d.getTime())?String(value):new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(d); }
function slackTime(m){ return slackTimeValue(m?.ts||m?.timestamp||m?.createdAt); }
function slackChannelName(m){ const id=String(m?.channelId||state.slack.channel||''); return m?.channelName||state.slack.channels.find(c=>String(c.id)===id)?.name||state.slack.channels.find(c=>String(c.id)===id)?.displayName||id||'채널'; }
function slackReplyPreview(m){ const preview=m?.latestReplyPreview; if(!preview)return null; if(typeof preview==='string')return {text:preview}; return typeof preview==='object'?preview:null; }
function renderSlack(){
  const connected=flag(state.status,['slackConnected','slack.connected','flags.slackConnected','connections.slack.connected','integrations.slack.connected']);
  const canPost=flag(state.status,['slackCanPost','slack.canPost','flags.slackCanPost','permissions.slackPost'],state.slack.canPost===true); const canReply=flag(state.status,['slackCanReply','slack.canReply','flags.slackCanReply','permissions.slackReply'],state.slack.canReply===true);
  state.slack.canPost=canPost; state.slack.canReply=canReply; setBadge('slack-status',connected?'연결됨':'연결 필요',connected?'':'pending'); $('slack-connect-button').hidden=connected;
  const prior=String(state.slack.channel||''); $('slack-channel-select').innerHTML='<option value="">내 참여 채널 전체 · 최신순</option>'+state.slack.channels.map(c=>`<option value="${escapeHtml(c.id)}"># ${escapeHtml(c.name||c.displayName||c.id)}</option>`).join(''); $('slack-channel-select').value=prior;
  const q=($('slack-search35')?.value||'').trim().toLowerCase(); const visible=state.slack.messages.filter(m=>{const preview=slackReplyPreview(m);return !q||slackText(m).toLowerCase().includes(q)||slackAuthor(m).toLowerCase().includes(q)||slackChannelName(m).toLowerCase().includes(q)||String(preview?.text||'').toLowerCase().includes(q)}); const feed=$('slack-feed');
  const notices=[]; if(state.slack.loading)notices.push('<div class="slack-feed-note loading">Slack 최신 대화를 불러오는 중입니다.</div>'); if(state.slack.error&&state.slack.messages.length)notices.push(`<div class="slack-feed-note error">Slack 새로고침 실패: ${escapeHtml(state.slack.error)}</div>`); if(state.slack.partial)notices.push(`<div class="slack-feed-note partial">일부 채널을 불러오지 못했습니다${state.slack.failedChannelCount?` (${state.slack.failedChannelCount}개)`:''}.</div>`); if(state.slack.truncated)notices.push('<div class="slack-feed-note partial">메시지가 많아 최신 대화 일부만 표시합니다.</div>');
  if(!connected) feed.innerHTML='<div class="empty">Slack OAuth 연결 후 본인이 참여한 채널 대화만 표시됩니다.</div>'; else if(state.slack.error&&!state.slack.messages.length) feed.innerHTML=`<div class="empty">${escapeHtml(state.slack.error)}</div>`; else if(state.slack.loading&&!state.slack.messages.length) feed.innerHTML=notices.join(''); else feed.innerHTML=notices.join('')+(visible.length?visible.map(m=>{
    const ts=String(m.ts||m.timestamp||''),channelId=String(m.channelId||state.slack.channel||''),channelName=slackChannelName(m),threadTs=String(m.threadTs||ts),replies=state.slack.replies.get(slackThreadKey(channelId,threadTs))||[],preview=slackReplyPreview(m),replyCount=Number(m.reply_count||m.replyCount||0),activity=slackTimeValue(slackActivityTs(m));
    return `<article class="slack-message"><div class="slack-card-top"><span class="slack-channel-badge">#${escapeHtml(channelName)}</span><time>최근 활동 ${escapeHtml(activity||'-')}</time></div><header><b>${escapeHtml(slackAuthor(m))}</b><time>${escapeHtml(slackTime(m))}</time></header><p>${escapeHtml(slackText(m))}</p>${preview?`<div class="slack-thread-preview"><strong>최근 답글${preview.displayName||preview.userName||preview.user?' · '+escapeHtml(slackAuthor(preview)):''}</strong>${preview.ts?`<time>${escapeHtml(slackTime(preview))}</time>`:''}<p>${escapeHtml(slackText(preview))}</p></div>`:''}<div class="slack-actions">${channelId&&threadTs&&canReply?`<button class="text-button" type="button" data-reply-ts="${escapeHtml(threadTs)}" data-reply-channel="${escapeHtml(channelId)}" data-reply-channel-name="${escapeHtml(channelName)}" data-reply-name="${escapeHtml(slackAuthor(m))}">답글</button>`:''}${channelId&&threadTs&&replyCount>0?`<button class="text-button" type="button" data-load-replies="${escapeHtml(threadTs)}" data-reply-channel="${escapeHtml(channelId)}">답글 ${replyCount}</button>`:''}</div>${replies.filter(r=>!isSlackSystemMessage(r)).map(r=>`<article class="slack-message"><header><b>${escapeHtml(slackAuthor(r))}</b><time>${escapeHtml(slackTime(r))}</time></header><p>${escapeHtml(slackText(r))}</p></article>`).join('')}</article>`;
  }).join(''):`<div class="empty">${state.slack.channel?'이 채널에 표시할 메시지가 없습니다.':'내 참여 채널에 표시할 대화가 없습니다.'}</div>`);
  const recipient=slackRecipient(state.slack.channel,state.slack.replyTarget),canSend=!!(connected&&recipient&&(recipient.threadTs?canReply:canPost)); $('slack-text').disabled=!canSend; $('slack-send-button').disabled=!canSend; $('slack-composer-note').textContent=!canPost&&!canReply?'현재 토큰 범위에서는 메시지 전송 권한이 없습니다.':state.slack.replyTarget?`#${state.slack.replyTarget.channelName||state.slack.replyTarget.channelId} 답글로 전송합니다.`:state.slack.channel?'보내기 버튼을 누른 경우에만 선택 채널로 전송합니다.':'새 메시지를 보내려면 위에서 채널을 선택하세요.'; renderReplyTarget(); renderV45Status();
}
function renderReplyTarget(){ const target=state.slack.replyTarget,el=$('reply-target'); el.hidden=!target; if(target) el.innerHTML=`<span>#${escapeHtml(target.channelName||target.channelId)} · ${escapeHtml(target.name)} 메시지에 답글</span><button type="button" data-clear-reply aria-label="답글 취소">×</button>`; }

function normalizeMeetings(data){ state.meetings=Array.isArray(data?.items)?data.items:(Array.isArray(data?.meetings)?data.meetings:[]); state.meetingError=''; renderMeetings(); renderV45Status(); }
function renderMeetings(){
  const list=state.meetings.filter(m=>m?.status!=='canceled').sort((a,b)=>String(a.startAt||'').localeCompare(String(b.startAt||''))); $('meeting-list').innerHTML=state.meetingError?`<div class="empty">${escapeHtml(state.meetingError)}</div>`:list.length?list.map(m=>{
    const candidate=safeUrl(m.huddleUrl||m.huddleURL); const huddle=candidate===HUDDLE_URL?candidate:HUDDLE_URL; const attendeeIds=Array.isArray(m.attendeeIds)?m.attendeeIds:[];
    return `<article class="meeting-row"><div><strong>${escapeHtml(m.title||'회의')}</strong><small>${escapeHtml(formatDateTime(m.startAt,m.timezone||'Asia/Seoul'))} · ${attendeeIds.length}명 · ${escapeHtml(m.timezone||'Asia/Seoul')}</small></div><div class="meeting-actions">${huddle?`<a href="${escapeHtml(huddle)}" target="_blank" rel="noopener" data-start-meeting="${escapeHtml(m.id)}">회의 시작</a>`:'<span class="muted">허들 준비 중</span>'}<button type="button" data-edit-meeting="${escapeHtml(m.id)}">수정</button></div></article>`;
  }).join(''):'<div class="empty">예약된 회의가 없습니다.</div>';
}
function renderConnectionState(){
  const status=state.status||{}; const connected={erp:!state.erp.error,trello:flag(status,['trelloConnected','trello.connected','flags.trelloConnected','connections.trello.connected','integrations.trello.available'],!!state.trello.fetchedAt),slack:flag(status,['slackConnected','slack.connected','flags.slackConnected','connections.slack.connected','integrations.slack.connected']),meetings:flag(status,['meetingsReady','meetings.ready','flags.meetingsReady'],true)};
  return connected;
}
function renderAll(){ renderMetrics(); renderPersonal(); renderCalendar(); renderSlack(); renderMeetings(); if(state.scene) state.scene.updateWork(personWorkCounts()); renderV45Status(); }
function renderV45Status(){
  const mine=personalTasks(),sources=Object.keys(state.erp.sources).length,slackOn=flag(state.status,['flags.slackConnected','integrations.slack.connected']),trelloOn=flag(state.status,['flags.trelloConnected','integrations.trello.available']);
  $('led-tasks-live').textContent=mine.length+'건';$('erp-led-source').textContent=state.erp.error?'읽기 오류':sources?'실시간':'연결 대기';$('erp-work-state').textContent=state.erp.error|| (sources?'ERP 읽기 전용 연결':'실시간 연결 대기');
  $('share-erp-state').textContent=state.erp.error?'ERP · 읽기 오류':sources?'ERP · 실시간 읽기':'ERP · 연결 대기';$('share-trello-state').textContent=state.trello.error?'Trello · 읽기 오류':trelloOn?'Trello · '+state.trello.items.length+'개 카드':'Trello · 설정 확인';$('share-slack-state').textContent=state.slack.error?'Slack · 읽기 오류':slackOn?'Slack · 연결됨':'Slack · OAuth 연결 필요';$('live-updated-at').textContent=state.lastPollAt?new Date(state.lastPollAt).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'}):'확인 중';
  $('calendar-source32').textContent=trelloOn?'Trello + ERP':'ERP';$('company-source37').textContent=state.lastPollAt?'라이브 연결':'연결 대기';$('slack-scope35').textContent=slackOn?'내 참여 채널 · 최신 대화순':'OAuth 연결 필요';$('slack-result35').textContent=state.slack.loading?'불러오는 중':state.slack.error|| (state.slack.partial?`일부 ${state.slack.messages.length}건`:state.slack.messages.length+'건');
  const next=state.meetings.filter(m=>m?.status!=='canceled'&&new Date(m.endAt)>new Date()).sort((a,b)=>String(a.startAt).localeCompare(String(b.startAt)))[0];$('meeting-next').textContent=next?'예정 · '+formatDateTime(next.startAt,next.timezone||'Asia/Seoul')+' · '+(next.title||'회의'):'예정된 회의 없음';const candidate=safeUrl(next?.huddleUrl||next?.huddleURL);const h=next?(candidate===HUDDLE_URL?candidate:HUDDLE_URL):'';$('meeting-huddle34').hidden=!h;if(h){$('meeting-huddle34').href=h;$('meeting-huddle34').dataset.meetingId=next.id}else{$('meeting-huddle34').removeAttribute('href');delete $('meeting-huddle34').dataset.meetingId}
}
function personWorkCounts(){
  const counts=Object.fromEntries(STAFF.map(p=>[p.id,0]));
  for(const card of trelloOpenCards()){
    const members=Array.isArray(card.members)?card.members:[];
    for(const member of members){ const label=String(member.fullName||member.name||member.username||'').trim().toLowerCase(); const p=STAFF.find(s=>s.name.toLowerCase()===label); if(p) counts[p.id]++; }
  }
  if(state.profile?.name){ const p=STAFF.find(s=>s.name===state.profile.name); if(p) counts[p.id]+=personalTasks().filter(t=>t.source==='ERP').length; }
  return counts;
}

async function loadStatus(){ try{ const next=await api('/status'); if(String(next?.identity?.uid||'')!==String(auth.currentUser?.uid||'')) throw Object.assign(new Error('서버 사용자와 현재 로그인 계정이 일치하지 않습니다.'),{status:403}); state.status=next; state.slack.error=''; renderAll(); return next; }catch(error){ clearExternal(); state.status=null; renderAll(); throw error; } }
async function loadTrello(){ try{ normalizeTrello(await api('/trello')); }catch(error){ state.trello={items:[],boards:[],me:null,fetchedAt:null,error:error.message}; renderAll(); } }
async function loadMeetings(){ try{ normalizeMeetings(await api('/meetings')); }catch(error){ state.meetings=[]; state.meetingError=error.message; renderMeetings(); } }
function slackRequestIsCurrent(requestId,uid,channel){ return requestId===state.slack.requestSeq&&String(auth.currentUser?.uid||'')===uid&&String(state.slack.channel||'')===channel; }
async function loadSlackFeed({channelsOnly=false}={}){
  const uid=String(auth.currentUser?.uid||''),channel=String(state.slack.channel||''),requestId=++state.slack.requestSeq;
  if(!channelsOnly){state.slack.loading=true;state.slack.error='';renderSlack();}
  try{const data=await api('/slack/feed');if(!slackRequestIsCurrent(requestId,uid,channel))return false;normalizeChannels(data);applySlackMeta(data);if(!channelsOnly){normalizeMessages(data,{aggregate:true});state.slack.loading=false;}renderSlack();return true;}
  catch(error){if(!slackRequestIsCurrent(requestId,uid,channel))return false;if(!channelsOnly)state.slack.messages=[];state.slack.loading=false;state.slack.error=error.message;renderSlack();return false;}
}
async function loadSlackChannels(){
  if(!flag(state.status,['slackConnected','slack.connected','flags.slackConnected','connections.slack.connected','integrations.slack.connected'])){ state.slack.channels=[]; state.slack.messages=[]; state.slack.loading=false; state.slack.error=''; renderSlack(); return; }
  if(state.slack.channel){const feedOk=await loadSlackFeed({channelsOnly:true});if(feedOk&&state.slack.channel)await loadSlackMessages();}else await loadSlackFeed();
}
async function loadSlackMessages(){
  const channel=String(state.slack.channel||'');if(!channel)return;const uid=String(auth.currentUser?.uid||''),requestId=++state.slack.requestSeq;state.slack.loading=true;state.slack.error='';renderSlack();
  try{const data=await api(`/slack/messages?channel=${encodeURIComponent(channel)}`);if(!slackRequestIsCurrent(requestId,uid,channel))return;normalizeMessages(data);state.slack.loading=false;renderSlack();}
  catch(error){if(!slackRequestIsCurrent(requestId,uid,channel))return;state.slack.messages=[];state.slack.loading=false;state.slack.error=error.message;renderSlack();}
}
async function pollAll({manual=false}={}){
  if(!state.user||document.hidden||state.polling)return; state.polling=true; if(manual) $('refresh-button').disabled=true;
  try{ await loadStatus(); await Promise.all([loadTrello(),loadMeetings(),loadSlackChannels()]); state.lastPollAt=Date.now(); if(manual) toast('최신 서버 상태를 확인했습니다.'); }
  catch(error){ if(manual) toast(error.message,true); }
  finally{ state.polling=false; $('refresh-button').disabled=false; }
}
function startPolling(){ stopPolling(); if(!state.user||document.hidden)return; state.pollTimer=setInterval(()=>pollAll(),POLL_MS); }

function showSubpage(kind){
  const titles={overview:'경영 현황',tasks:'실제 업무',team:'함께 일하는 동료',connections:'연동 상태'}; $('subpage-title').textContent=titles[kind]||'상세'; $('drawer-path-live').textContent='WORKSPACE / '+kind.toUpperCase(); const m=approvalMetrics(); let html='';
  if(kind==='overview') html=`<div class="notice-box">Firestore 원본의 읽기 결과입니다. 결재·지출 상태는 ERP의 날인 증거 및 shared override 기준을 적용합니다.</div><div class="summary-grid"><div class="summary-card"><span>결재 대기</span><strong>${m.approvals}건</strong></div><div class="summary-card"><span>지출 결의 대기</span><strong>${m.expenses}건</strong></div><div class="summary-card"><span>이번 달 지급 예정</span><strong>${formatKrw(m.dueThisMonth)}</strong></div><div class="summary-card"><span>담당 미매핑</span><strong>${unmappedCount()}건</strong></div></div><table class="data-table"><thead><tr><th>구분</th><th>제목</th><th>상태</th><th>일정</th></tr></thead><tbody>${[...m.pendingApprovals.map(a=>({kind:'결재',title:a.title||'결재 요청',status:a.status,due:a.dueDate||a.date||''})),...m.pendingOrders.map(o=>({kind:'발주',title:o.serial||o.orderNo||`발주 ${o.id}`,status:orderApprovalStatus(o),due:o.inDate||o.orderDate||''})),...m.unpaid.map(e=>({kind:'지출',title:e.title||'지출 결의',status:'지급 대기',due:e.dueDate||''}))].map(r=>`<tr><td>${escapeHtml(r.kind)}</td><td>${escapeHtml(r.title)}</td><td>${escapeHtml(r.status)}</td><td>${escapeHtml(r.due)}</td></tr>`).join('')||'<tr><td colspan="4">대기 데이터가 없습니다.</td></tr>'}</tbody></table>`;
  if(kind==='tasks'){
    const erp=erpOpenTasks().map(t=>({source:'ERP',title:t.title||t.name||'제목 없음',assignee:explicitUidOfTask(t).join(', ')||'미지정',due:t.due||t.dueDate||'',url:ERP_URL}));
    const trello=trelloOpenCards().map(c=>({source:'Trello',title:c.name||'제목 없음',assignee:(c.members||[]).map(x=>x.fullName||x.name||x.username).filter(Boolean).join(', ')||(c.idMembers||[]).join(', ')||'미지정',due:c.due||c.start||'',url:safeUrl(c.url||c.shortUrl)}));
    html=`<div class="notice-box">부서명으로 담당자를 추정하지 않습니다. ERP UID와 Trello 카드 멤버처럼 원본에 명시된 배정만 표시합니다.</div><table class="data-table"><thead><tr><th>출처</th><th>업무</th><th>명시 담당</th><th>일정</th></tr></thead><tbody>${[...erp,...trello].map(r=>`<tr><td>${escapeHtml(r.source)}</td><td>${r.url?`<a href="${escapeHtml(r.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(r.title)}</a>`:escapeHtml(r.title)}</td><td>${escapeHtml(r.assignee)}</td><td>${escapeHtml(r.due?formatDateTime(r.due):'')}</td></tr>`).join('')||'<tr><td colspan="4">실제 미처리 업무가 없습니다.</td></tr>'}</tbody></table>`;
  }
  if(kind==='team') html=`<span class="demo">확인된 조직 구성 · 실제 접속 상태 아님</span><div class="team-pairs44"><div class="team-columns44"><h3>사람</h3><h3>AI</h3></div>${STAFF_PAIRS.map(([human,ai])=>`<div class="team-pair44">${teamCard(human)}${ai?teamCard(ai):'<div class="team-empty44" aria-label="AI 미배치"></div>'}</div>`).join('')}</div><p>현재 접속 상태나 업무 배정은 실제 데이터가 있을 때만 별도로 표시합니다.</p>`;
  if(kind==='connections'){
    const c=renderConnectionState(); html=`<div class="notice-box">ERP·Trello는 읽기 전용입니다. 회의는 서버에 저장되며, Slack 메시지는 사용자가 전송 버튼을 누른 경우에만 보냅니다. Firebase ID 토큰은 메모리에서 Authorization 헤더에만 사용하며 저장하거나 로그로 남기지 않습니다.</div><div class="connection-list">${connectionCard('ERP 실시간',c.erp,state.erp.error||'활성 계정의 Firestore 읽기 권한 사용')}${connectionCard('Trello',c.trello,state.trello.error||`${state.trello.items.length}개 카드 수신`)}${connectionCard('Slack',c.slack,state.slack.error||`${state.slack.channels.length}개 참여 채널`)}${connectionCard('회의 저장',c.meetings,state.meetingError||`${state.meetings.filter(meeting=>meeting.status!=='canceled').length}개 예약`)}</div>`;
  }
  $('subpage-content').innerHTML=html; $('subpage').hidden=false; $('subpage').classList.add('open'); $('app').classList.add('subpage-open'); document.querySelectorAll('.navicon').forEach(b=>b.classList.toggle('active',b.dataset.panel===kind)); $('subpage').focus();
}
function teamPortrait(p){const ai=p.kind==='AI';const H={jaeho:'#2b2724',tim:'#45352c',chansik:'#3a332d',ian:'#2c2b33',juyeon:'#5a4133',greg:'#3e342d',heeka:'#4a3b33',dabin:'#342c29',jony:'#322d36'}[p.id]||'#3e3732';const long=['juyeon','heeka','jony'].includes(p.id);const suit=ai?'#27313a':p.color;const bg=ai?'#1f2a33':'#edf0ee';return '<svg viewBox="0 0 60 60" aria-hidden="true"><rect width="60" height="60" fill="'+bg+'"/>'+(ai?'<circle cx="30" cy="28" r="23" fill="none" stroke="'+p.color+'" stroke-width="1.4" opacity=".8"/>':'')+'<path d="M10 60V53Q11 44 23 41H37Q49 44 50 53V60Z" fill="'+suit+'"/>'+(ai?'<path d="M23 42L30 56 37 42" fill="none" stroke="'+p.color+'" stroke-width="1.8"/>':'<path d="M23 42L30 58 37 42Z" fill="#f9f7f0"/>')+'<rect x="26" y="34" width="8" height="10" rx="3" fill="#e2bda3"/><ellipse cx="30" cy="23" rx="13" ry="16" fill="'+H+'"/>'+(long?'<ellipse cx="18.5" cy="30" rx="3.5" ry="8" fill="'+H+'"/><ellipse cx="41.5" cy="30" rx="3.5" ry="8" fill="'+H+'"/>':'')+'<ellipse cx="30" cy="26" rx="10.5" ry="13.5" fill="#ebc6ab"/><path d="M19 21Q18 8 30 10Q42 8 41 22L35 17 30 15Q24 20 19 21" fill="'+H+'"/><circle cx="25.5" cy="25.5" r="1.3" fill="#2d2522"/><circle cx="34.5" cy="25.5" r="1.3" fill="#2d2522"/><circle cx="23" cy="30" r="2.2" fill="#f3a59a" opacity=".55"/><circle cx="37" cy="30" r="2.2" fill="#f3a59a" opacity=".55"/><path d="M27 32q3 2.2 6 0" fill="none" stroke="#b06d60" stroke-width="1.1"/>'+(p.id==='jony'?'<rect x="22.5" y="23" width="6" height="5" rx="1.5" fill="none" stroke="#524b6f" stroke-width=".9"/><rect x="31.5" y="23" width="6" height="5" rx="1.5" fill="none" stroke="#524b6f" stroke-width=".9"/><path d="M28.5 25h3" stroke="#524b6f" stroke-width=".9"/>':'')+(ai?'<circle cx="41.3" cy="27" r="2.1" fill="'+p.color+'"/>':'')+'</svg>'}
function teamCard(id){ const p=STAFF.find(x=>x.id===id); return `<button class="info-card team-card44" data-person="${escapeHtml(p.id)}"><div class="portrait">${teamPortrait(p)}</div><div class="team-copy44"><h3>${escapeHtml(p.name)}${p.id==='jaeho'?' · 대표이사':''}</h3><p>${escapeHtml(p.role)}</p></div></button>`; }
function connectionCard(name,ok,detail){ return `<article class="connection-card"><strong>${escapeHtml(name)}</strong><div><span class="status-badge ${ok?'':'error'}">${ok?'연결':'확인 필요'}</span><p>${escapeHtml(detail)}</p></div></article>`; }
function closeSubpage(){ $('subpage').hidden=true; $('subpage').classList.remove('open'); $('app').classList.remove('subpage-open'); document.querySelectorAll('.navicon').forEach(b=>b.classList.remove('active')); }

function zonedIso(date,time,timezone){
  const [y,m,d]=date.split('-').map(Number),[hh,mm]=time.split(':').map(Number); const guess=Date.UTC(y,m-1,d,hh,mm,0);
  const offsetAt=ms=>{ const parts=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).formatToParts(new Date(ms)); const get=t=>Number(parts.find(p=>p.type===t)?.value); return Date.UTC(get('year'),get('month')-1,get('day'),get('hour')%24,get('minute'),get('second'))-ms; };
  let utc=guess-offsetAt(guess); utc=guess-offsetAt(utc); return new Date(utc).toISOString();
}
function defaultMeetingDate(){ const d=new Date(Date.now()+15*60000); d.setMinutes(Math.ceil(d.getMinutes()/15)*15,0,0); return d; }
function openMeetingDialog(meeting=null){
  const d=meeting?new Date(meeting.startAt):defaultMeetingDate(),tz=meeting?.timezone||'Asia/Seoul';
  $('meeting-dialog-title').textContent=meeting?'회의 수정':'회의 예약'; $('meeting-id').value=meeting?.id||''; $('meeting-revision').value=meeting?.revision??''; $('meeting-title').value=meeting?.title||'';
  $('meeting-date').value=toYmd(d,tz); $('meeting-time').value=new Intl.DateTimeFormat('en-GB',{timeZone:tz,hour:'2-digit',minute:'2-digit',hour12:false}).format(d); $('meeting-timezone').value=tz;
  const duration=meeting?.startAt&&meeting?.endAt?Math.max(15,Math.round((new Date(meeting.endAt)-new Date(meeting.startAt))/60000)):30; $('meeting-duration').value=String([15,30,60,90].includes(duration)?duration:30);
  const selected=new Set(meeting?.attendeeIds||STAFF.map(p=>p.id)); $('meeting-attendees').innerHTML=STAFF.map(p=>`<label><input type="checkbox" value="${escapeHtml(p.id)}" ${selected.has(p.id)?'checked':''}><span>${escapeHtml(p.name)}</span></label>`).join('');
  $('meeting-delete-button').hidden=!meeting; $('meeting-error').textContent=''; state.meetingRequestId=newRequestId(); state.meetingPayloadKey=null; $('meeting-dialog').showModal();
}
async function saveMeeting(){
  const id=$('meeting-id').value||undefined,revisionRaw=$('meeting-revision').value,revision=revisionRaw===''?undefined:Number(revisionRaw),title=$('meeting-title').value.trim(),timezone=$('meeting-timezone').value,date=$('meeting-date').value,time=$('meeting-time').value;
  const attendeeIds=[...$('meeting-attendees').querySelectorAll('input:checked')].map(el=>el.value); if(!title||!date||!time||!attendeeIds.length){ $('meeting-error').textContent='회의 제목, 시간, 3D 이동 참석자를 확인해 주세요.'; return; }
  let startAt; try{startAt=zonedIso(date,time,timezone);}catch{ $('meeting-error').textContent='회의 시간을 변환할 수 없습니다.'; return; } const endAt=new Date(new Date(startAt).getTime()+Number($('meeting-duration').value)*60000).toISOString();
  const payloadKey=JSON.stringify({id:id||'',revision:revision??null,title,startAt,endAt,timezone,attendeeIds}); if(state.meetingPayloadKey!==payloadKey){state.meetingRequestId=newRequestId();state.meetingPayloadKey=payloadKey;} const requestId=state.meetingRequestId; const body={requestId,title,startAt,endAt,timezone,attendeeIds}; if(id) body.id=id; if(revision!==undefined) body.revision=revision;
  $('meeting-save-button').disabled=true; $('meeting-error').textContent=navigator.onLine?'서버에 저장 중입니다.':'오프라인입니다. 연결 후 같은 요청으로 다시 시도할 수 있습니다.';
  try{ const data=await api('/meetings',{method:'POST',body:JSON.stringify(body)}); const saved=data.meeting||data.item||data; if(!saved?.id) throw new Error('서버가 저장된 회의를 반환하지 않았습니다.'); $('meeting-error').textContent=''; $('meeting-dialog').close(); state.meetingRequestId=null; state.meetingPayloadKey=null; await loadMeetings(); toast('회의가 서버에 저장되었습니다.'); }
  catch(error){ $('meeting-error').textContent=`저장 실패: ${error.message}`; }
  finally{ $('meeting-save-button').disabled=false; }
}
async function deleteMeeting(){ const id=$('meeting-id').value; if(!id)return; $('meeting-delete-button').disabled=true; try{ await api(`/meetings/${encodeURIComponent(id)}`,{method:'DELETE'}); $('meeting-dialog').close(); state.meetingRequestId=null; state.meetingPayloadKey=null; await loadMeetings(); toast('회의를 삭제했습니다.'); }catch(error){ $('meeting-error').textContent=`삭제 실패: ${error.message}`; }finally{$('meeting-delete-button').disabled=false;} }

const PEOPLE=STAFF.map(p=>({...p,type:p.kind,team:p.role.split(' ')[0]||'',tasks:[],messages:[],thread:'',color:p.color}));
function syncScenePeople(counts){for(const p of PEOPLE){const n=counts[p.id]||0;p.tasks=Array.from({length:n},(_,i)=>({id:`live-${p.id}-${i}`,title:'명시 배정 업무',status:'진행 중',kind:'task',done:false,erp:true,url:ERP_URL}))}window.NEXUS?.refreshDeskDialog?.()}
function selectV45Person(id){state.selectedPerson=id;document.querySelectorAll('[data-person]').forEach(el=>el.classList.toggle('selected',el.dataset.person===id));window.onPersonSelect?.(id)}
window.NEXUS={PEOPLE,WAREHOUSES:[],workMode:'offline',workConnection:'unconnected',personalMode35:true,selectPerson:selectV45Person,renderTasks:()=>{},toast,openDeskWork:id=>showSubpage('tasks',id),openERPTask:t=>window.open(safeUrl(t?.url)||ERP_URL,'_blank','noopener'),openShare:()=>showSubpage('connections'),openWarehouse:()=>{},refreshCalendar32:renderCalendar,showLiveErpTip:()=>{},showLiveBoardTip:()=>{}};
window.__resolveNexusBridge?.();
function bindOriginalScene(){state.scene={setView:v=>window.NEXUS.setView?.(v),callMeeting:(title,ids)=>window.NEXUS.callMeeting?.(title,ids),returnSeats:()=>window.NEXUS.endMeeting?.(),updateWork:syncScenePeople};syncScenePeople(personWorkCounts())}
window.addEventListener('nexus-scene-ready',bindOriginalScene,{once:true});if(window.NEXUS.sceneReady)bindOriginalScene();

function lockApi(message){clearAll();setAuthOverlay('NEXUS 접근 차단',message||'NEXUS 서버 권한을 확인할 수 없습니다.',{logout:true})}
async function handleActiveUser(user){
  clearExternal();stopFirestore();stopPolling();state.user=user;setAuthOverlay('NEXUS 권한 확인 중','서버의 nexus_access 권한과 활성 임원 계정을 확인하고 있습니다.');
  try{const status=await api('/status');if(String(status?.identity?.uid||'')!==String(user.uid))throw Object.assign(new Error('서버 사용자와 현재 로그인 계정이 일치하지 않습니다.'),{status:403});state.status=status;state.profile={uid:user.uid,name:status.identity.displayName||user.displayName||'',email:status.identity.email||user.email||'',role:status.identity.isAdmin?'관리자':(status.identity.permission==='read'?'조회 권한':'임원')};state.authorized=true;$('viewer-name').textContent=`(${state.profile.name||state.profile.email})`;$('viewer-role').textContent=state.profile.role;$('viewer-avatar').textContent=(state.profile.name||'나').slice(0,1);$('logout-button').textContent=(state.profile.name||'나').slice(0,1);showApp();subscribeERP();await Promise.all([loadTrello(),loadMeetings(),loadSlackChannels()]);state.lastPollAt=Date.now();renderAll();startPolling()}catch(error){clearAll();setAuthOverlay('접근할 수 없습니다',error.message,{logout:true})}
}

$('login-button').onclick=async()=>{ $('login-button').disabled=true; try{await signInWithPopup(auth,provider);}catch(error){if(error.code!=='auth/popup-closed-by-user')setAuthOverlay('로그인 오류',error.message,{login:true});}finally{$('login-button').disabled=false;}};
$('auth-logout-button').onclick=async()=>{clearAll();await signOut(auth);}; $('logout-button').onclick=async()=>{clearAll();await signOut(auth);};
function clearSlackThreadState({invalidate=false}={}){state.slack.replies.clear();state.slack.replyTarget=null;if(invalidate)state.slack.requestSeq++;renderReplyTarget();}
$('refresh-button').onclick=()=>pollAll({manual:true}); $('slack-reload-button').onclick=()=>state.slack.channel?loadSlackMessages():loadSlackFeed();
$('calendar-source-filter').onchange=renderCalendar; $('calendar-title-filter').oninput=renderCalendar; $('week-prev32').onclick=()=>{state.weekOffset--;renderCalendar()}; $('week-next32').onclick=()=>{state.weekOffset++;renderCalendar()}; $('week-today32').onclick=()=>{state.weekOffset=0;state.selectedDate=ymdKst();renderCalendar()}; $('week-days32').onclick=e=>{const b=e.target.closest('[data-live-date]');if(b){state.selectedDate=b.dataset.liveDate;state.weekOffset=0;renderCalendar()}}; $('slack-search35').oninput=()=>{clearSlackThreadState();renderSlack();}; $('meeting-call').onclick=()=>{if(!$('meeting-dialog').open)openMeetingDialog();}; $('meeting-huddle34').onclick=()=>{const m=state.meetings.find(x=>String(x.id)===String($('meeting-huddle34').dataset.meetingId));if(m)state.scene?.callMeeting(m.title,m.attendeeIds||[]);};
$('slack-channel-select').onchange=async e=>{state.slack.channel=e.target.value;state.slack.messages=[];state.slack.error='';state.slack.loading=false;clearSlackThreadState({invalidate:true});renderSlack();if(state.slack.channel)await loadSlackMessages();else await loadSlackFeed();};
$('slack-connect-button').onclick=async()=>{ $('slack-connect-button').disabled=true; try{const data=await api('/slack/connect',{method:'POST',body:'{}'}),url=safeUrl(data?.url);if(!url||!/(^|\.)slack\.com$/.test(new URL(url).hostname))throw new Error('유효한 Slack OAuth 주소를 받지 못했습니다.');window.location.assign(url);}catch(error){toast(error.message,true);}finally{$('slack-connect-button').disabled=false;}};
$('slack-feed').onclick=async e=>{
  const reply=e.target.closest('[data-reply-ts]'); if(reply){const channelId=String(reply.dataset.replyChannel||'');if(!channelId)return;state.slack.replyTarget={ts:String(reply.dataset.replyTs||''),channelId,channelName:reply.dataset.replyChannelName||channelId,name:reply.dataset.replyName||'사용자'};renderSlack();$('slack-text').focus();return;}
  const load=e.target.closest('[data-load-replies]'); if(load){const channelId=String(load.dataset.replyChannel||''),ts=String(load.dataset.loadReplies||''),uid=String(auth.currentUser?.uid||''),requestId=state.slack.requestSeq,filter=String(state.slack.channel||'');if(!channelId||!ts)return;try{const data=await api(`/slack/replies?channel=${encodeURIComponent(channelId)}&ts=${encodeURIComponent(ts)}`);if(!slackRequestIsCurrent(requestId,uid,filter))return;state.slack.replies.set(slackThreadKey(channelId,ts),(Array.isArray(data?.messages)?data.messages:(data?.items||[])).filter(m=>!isSlackSystemMessage(m)&&String(m.ts||'')!==ts));renderSlack();}catch(error){if(slackRequestIsCurrent(requestId,uid,filter))toast(error.message,true);}}
};
$('reply-target').onclick=e=>{if(e.target.closest('[data-clear-reply]')){state.slack.replyTarget=null;renderSlack();}};
$('slack-form').onsubmit=async e=>{e.preventDefault();const text=$('slack-text').value.trim(),recipient=slackRecipient(state.slack.channel,state.slack.replyTarget);if(!text||!recipient||(recipient.threadTs?!state.slack.canReply:!state.slack.canPost))return;const uid=String(auth.currentUser?.uid||''),filter=String(state.slack.channel||''),threadTs=recipient.threadTs;$('slack-send-button').disabled=true;try{await api('/slack/post',{method:'POST',body:JSON.stringify({channel:recipient.channelId,text,...(threadTs?{threadTs}:{})})});if(String(auth.currentUser?.uid||'')!==uid||String(state.slack.channel||'')!==filter)return;$('slack-text').value='';state.slack.replyTarget=null;if(state.slack.channel)await loadSlackMessages();else await loadSlackFeed();toast(threadTs?'Slack 답글을 보냈습니다.':'Slack 메시지를 보냈습니다.');}catch(error){toast(error.message,true);}finally{renderSlack();}};

document.querySelectorAll('[data-view]').forEach(button=>button.onclick=()=>{const view=button.dataset.view;if(view==='home'){closeSubpage();state.scene?.setView('office');}else showSubpage(view);});
document.querySelectorAll('.navicon[data-panel]').forEach(button=>button.onclick=()=>showSubpage(button.dataset.panel));
$('subpage-content').onclick=e=>{const member=e.target.closest('[data-person]');if(member)selectV45Person(member.dataset.person);};
$('home-button').onclick=()=>{closeSubpage();$('erp-shell37').hidden=true;$('erp-frame37').removeAttribute('src');state.scene?.returnSeats();}; $('subpage-close').onclick=closeSubpage;
$('nav-erp37').onclick=()=>{$('erp-frame37').src=ERP_URL;$('erp-shell37').hidden=false;}; $('erp-home37').onclick=()=>{$('erp-shell37').hidden=true;$('erp-frame37').removeAttribute('src');};
$('office-view-button').onclick=()=>state.scene?.setView('office'); $('meeting-view-button').onclick=()=>state.scene?.setView('meeting'); $('return-seats-button').onclick=()=>state.scene?.returnSeats();
$('meeting-new-button').onclick=()=>openMeetingDialog(); $('meeting-close-button').onclick=()=>{$('meeting-dialog').close();state.meetingRequestId=null;state.meetingPayloadKey=null;}; $('meeting-cancel-button').onclick=()=>{state.meetingRequestId=null;state.meetingPayloadKey=null;$('meeting-dialog').close();}; $('meeting-form').onsubmit=e=>{e.preventDefault();saveMeeting();}; $('meeting-delete-button').onclick=deleteMeeting;
$('meeting-list').onclick=e=>{
  const edit=e.target.closest('[data-edit-meeting]'); if(edit){const m=state.meetings.find(x=>String(x.id)===String(edit.dataset.editMeeting));if(m)openMeetingDialog(m);return;}
  const start=e.target.closest('[data-start-meeting]'); if(start){const m=state.meetings.find(x=>String(x.id)===String(start.dataset.startMeeting));if(m)state.scene?.callMeeting(m.title,m.attendeeIds||[]);}
};
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('subpage').hidden)closeSubpage();});
document.addEventListener('visibilitychange',()=>{if(document.hidden)stopPolling();else if(state.user){pollAll();startPolling();}});
window.addEventListener('online',()=>{if(state.user){pollAll();startPolling();}}); window.addEventListener('offline',()=>{stopPolling();setBadge('erp-live-badge','오프라인','offline');}); window.addEventListener('beforeunload',()=>{stopPolling();stopFirestore();});

renderAll();
onAuthStateChanged(auth,user=>{if(!user){clearAll();setAuthOverlay('RENIV NEXUS 로그인','Google 계정으로 로그인한 뒤 활성 사용자 권한을 확인합니다.',{login:true});return;}handleActiveUser(user);});
