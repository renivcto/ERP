<!doctype html><meta charset="utf-8"><style>
/* v1.9.237 — DIVE editorial typography applied globally (Pretendard) */
@import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.css');
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;700&display=swap');
:root {
  --sky-50:#f0f9ff;--sky-100:#e0f2fe;--sky-200:#bae6fd;--sky-300:#7dd3fc;
  --sky-400:#38bdf8;--sky-500:#0ea5e9;--sky-600:#0284c7;--sky-700:#0369a1;
  --sky-800:#075985;--sky-900:#0c4a6e;
  --gray-50:#f8fafc;--gray-100:#f1f5f9;--gray-200:#e2e8f0;--gray-300:#cbd5e1;
  --gray-400:#94a3b8;--gray-500:#64748b;--gray-600:#475569;--gray-700:#334155;--gray-800:#1e293b;
  --green-50:#f0fdf4;--green-100:#dcfce7;--green-400:#4ade80;--green-500:#22c55e;--green-600:#16a34a;--green-700:#15803d;
  --amber-50:#fffbeb;--amber-100:#fef3c7;--amber-500:#f59e0b;--amber-600:#d97706;--amber-700:#b45309;
  --red-50:#fef2f2;--red-100:#fee2e2;--red-400:#f87171;--red-500:#ef4444;--red-600:#dc2626;--red-700:#b91c1c;
  --purple-50:#faf5ff;--purple-100:#f3e8ff;--purple-500:#a855f7;--purple-600:#9333ea;--purple-700:#7e22ce;
  --font:'Pretendard Variable','Pretendard','Noto Sans KR',-apple-system,BlinkMacSystemFont,'SF Pro KR','SF Pro Display','Helvetica Neue',system-ui,sans-serif;
  --sidebar:220px; --header:58px; --r:12px;
  --shadow:0 1px 3px rgba(0,0,0,.06),0 1px 2px rgba(0,0,0,.03);
  --shadow-md:0 4px 12px rgba(0,0,0,.06);
}
*{margin:0;padding:0;box-sizing:border-box}
html,body,input,textarea,select,button{font-family:var(--font)}
body{font-family:var(--font);background:var(--gray-50);color:var(--gray-800);height:100vh;overflow:hidden;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;letter-spacing:-0.2px;font-feature-settings:'ss01','ss02','cv01','cv11','tnum'}

/* v1.9.237 — 전역 에디토리얼 타입 스케일 (DIVE 감성) */
.ed-eyebrow{font-size:11px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:var(--gray-400);line-height:1}
.ed-title-hero{font-size:32px;font-weight:800;letter-spacing:-1.1px;line-height:1.15;color:#0a0a0a}
.ed-title-xl{font-size:22px;font-weight:800;letter-spacing:-0.6px;line-height:1.22;color:#0a0a0a}
.ed-title-lg{font-size:17px;font-weight:700;letter-spacing:-0.3px;line-height:1.3;color:#0a0a0a}
.ed-title-md{font-size:15px;font-weight:700;letter-spacing:-0.2px;line-height:1.35;color:#0a0a0a}
.ed-body{font-size:13.5px;font-weight:400;letter-spacing:-0.15px;line-height:1.7;color:var(--gray-700)}
.ed-caption{font-size:11.5px;font-weight:500;letter-spacing:0;color:var(--gray-400);line-height:1.5}
.ed-label{font-size:12px;font-weight:600;letter-spacing:-0.1px;color:var(--gray-600)}
/* 페이지 헤더 섹션 (에디토리얼 대시보드용) */
.page-hero{margin-bottom:10px;padding:2px 0 0}
.page-hero .ed-eyebrow{margin-bottom:10px}
.page-hero .ed-title-hero{margin-bottom:0}
.page-hero .ed-caption{font-size:13px;color:var(--gray-500)}
#app{display:flex;height:100vh}

/* SIDEBAR - cafe24 style */
#sidebar{width:var(--sidebar);background:#14223d;display:flex;flex-direction:column;flex-shrink:0;overflow-y:auto;z-index:20;border-right:1px solid rgba(255,255,255,.04)}
#sidebar::-webkit-scrollbar{width:5px}
#sidebar::-webkit-scrollbar-track{background:transparent}
#sidebar::-webkit-scrollbar-thumb{background:rgba(255,255,255,.08);border-radius:4px}
#sidebar::-webkit-scrollbar-thumb:hover{background:rgba(255,255,255,.15)}
.logo-area{padding:20px 18px 18px 28px;border-bottom:1px solid rgba(255,255,255,.06)}
#sidebar .nav-group:first-of-type{padding-top:16px}
.logo-brand{color:#fff;font-size:23px;font-weight:800;letter-spacing:3px;font-family:var(--font)}
.logo-sub{color:#94b9d9;font-size:23px;font-weight:800;letter-spacing:2px;opacity:.9;font-family:var(--font)}
.logo-ver{display:inline-block;background:var(--sky-500);color:#fff;font-size:9px;padding:2px 7px;border-radius:10px;margin-top:5px;letter-spacing:.4px;font-weight:700}
.nav-group{padding:6px 8px;position:relative}
.nav-group + .nav-group{border-top:1px solid rgba(255,255,255,.10);margin-top:6px;padding-top:10px}
.nav-group-title{display:none}
.nav-item{display:flex;align-items:center;gap:12px;padding:11px 14px;border-radius:8px;cursor:pointer;color:#fff;font-size:14px;transition:all .15s;margin-bottom:2px;user-select:none;position:relative;font-weight:600;line-height:1.25;letter-spacing:-0.2px}
.nav-item:hover{background:#374e6b;color:#fff}
.nav-item.active{background:#2563eb;color:#fff;font-weight:600}
.nav-item.active:hover{background:#2563eb}
.nav-item .ico{width:20px;text-align:center;font-size:15px;flex-shrink:0;color:#fff;opacity:1;filter:brightness(1.05)}
.nav-item-sub{font-size:13px!important;padding:8px 14px 8px 34px!important;color:rgba(255,255,255,.78)!important;font-weight:500!important}
.nav-item-sub::after{content:'';position:absolute;left:22px;top:50%;width:6px;height:1px;background:rgba(255,255,255,.2)}
.nav-item-sub:hover{background:#374e6b!important;color:#fff!important}
.nav-item-sub.active{background:#2563eb!important;color:#fff!important}
.nav-badge{margin-left:auto;background:var(--sky-400);color:#fff;font-size:9px;padding:2px 7px;border-radius:10px;font-weight:700;line-height:1;letter-spacing:.3px}
.nav-badge.red{background:var(--red-500)}
.nav-item.active .nav-badge{background:rgba(255,255,255,.25)}
.sidebar-bottom{margin-top:auto;padding:10px 10px;border-top:1px solid rgba(255,255,255,.06)}
.user-chip{display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:7px}
.user-chip{background:rgba(255,255,255,.04);border-radius:9px}
.user-av{width:32px;height:32px;border-radius:50%;background:var(--sky-500);display:flex;align-items:center;justify-content:center;color:#fff;font-size:11px;font-weight:700;flex-shrink:0}
.user-name{color:#fff;font-size:12.5px;font-weight:600;letter-spacing:.2px}
.user-role{color:#94b9d9;font-size:10px;opacity:.8}

/* MAIN */
#main{flex:1;display:flex;flex-direction:column;overflow:hidden;min-width:0}

/* HEADER — v1.9.237 refined */
#header{height:var(--header);background:#fff;border-bottom:1px solid var(--gray-100);display:flex;align-items:center;padding:0 24px;gap:12px;flex-shrink:0}
.hdr-title{font-size:15px;font-weight:700;letter-spacing:-0.3px;color:var(--gray-800);flex:1}
.hdr-search{display:flex;align-items:center;gap:7px;background:var(--gray-50);border:1px solid transparent;border-radius:999px;padding:6px 14px;width:220px;transition:all .15s}
.hdr-search:focus-within{background:#fff;border-color:var(--gray-200)}
.hdr-search input{border:none;background:transparent;font-size:12.5px;color:var(--gray-700);outline:none;width:100%;font-family:var(--font);letter-spacing:-0.1px}
.hdr-btn{display:flex;align-items:center;gap:5px;padding:7px 14px;border-radius:999px;cursor:pointer;font-size:12px;font-weight:600;letter-spacing:-0.1px;border:1px solid var(--gray-200);background:#fff;font-family:var(--font);transition:all .12s;color:var(--gray-600)}
.hdr-btn:hover{background:var(--gray-50);border-color:var(--gray-300);color:var(--gray-800)}
.hdr-btn.primary{background:#0a0a0a;color:#fff;border-color:#0a0a0a}
.hdr-btn.primary:hover{background:#1f2937;border-color:#1f2937}
.hdr-btn .dot{width:7px;height:7px;background:var(--red-500);border-radius:50%;margin-left:2px}
.sync-dot{width:7px;height:7px;background:var(--green-500);border-radius:50%;display:inline-block;animation:pulse 2s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
@keyframes apBlink{0%,100%{opacity:1;transform:scale(1);box-shadow:0 0 0 0 rgba(244,114,182,.55)}50%{opacity:.75;transform:scale(1.07);box-shadow:0 0 0 8px rgba(244,114,182,0)}}
/* v2.3.558: ⚡ 즉시 지급 전용 / v2.3.559 색상 펄스 / v2.3.560: 파스텔 코랄 숨쉬기 + ⚡ 꼬물 위글 */
@keyframes apBlinkSoft{0%,100%{background:#ffe4e6;color:#be123c;border-color:#fecdd3}50%{background:#fb7185;color:#fff;border-color:#fb7185}}
@keyframes zapWiggle{0%,100%{transform:rotate(0deg) scale(1)}25%{transform:rotate(-14deg) scale(1.25)}50%{transform:rotate(0deg) scale(1)}75%{transform:rotate(14deg) scale(1.25)}}
/* v2.3.564: 지급 독촉 종 — 딸랑딸랑 울리고 잠깐 쉬는 사이클 (종 꼭지 기준 회전) */
@keyframes bellRing{0%,55%,100%{transform:rotate(0deg)}10%{transform:rotate(20deg)}20%{transform:rotate(-16deg)}30%{transform:rotate(11deg)}40%{transform:rotate(-7deg)}48%{transform:rotate(3deg)}}
@keyframes apPulseBadge{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.65;transform:scale(1.12)}}
/* v1.9.344: NEW 라벨 — 배경/테두리 제거, 골드 글씨만 살짝 깜빡 */
@keyframes newGifSoftPulse{
  0%,100%{opacity:1;color:#b45309}
  50%{opacity:.7;color:#d97706}
}
.new-gif-label{display:inline-block;background:transparent;color:#b45309;padding:0 2px;border:none;font-size:10.5px;font-weight:900;letter-spacing:.6px;animation:newGifSoftPulse 2.4s ease-in-out infinite;text-shadow:0 0 1px rgba(180,83,9,.25)}

/* ═══ v1.9.236 — 업무 공유 피드 (DIVE editorial refinement) ═══ */
/* 피드 전체에 Pretendard 패밀리 + 통일된 타입 스케일 */
#feed-section, #feed-section *{font-family:'Pretendard','Pretendard Variable','Noto Sans KR',-apple-system,BlinkMacSystemFont,'SF Pro KR','SF Pro Display','Helvetica Neue',system-ui,sans-serif}
#feed-section{font-feature-settings:'ss01','ss02','cv01','cv11'}

/* 타입 스케일 — DIVE는 eyebrow / title / body / caption 4단계만 사용 */
.feed-eyebrow{font-size:10.5px;font-weight:700;letter-spacing:1.1px;text-transform:uppercase;color:#94a3b8;line-height:1}
.feed-title-xl{font-size:21px;font-weight:800;letter-spacing:-0.5px;line-height:1.25;color:#0a0a0a}
.feed-title-md{font-size:16px;font-weight:700;letter-spacing:-0.3px;line-height:1.4;color:#0a0a0a}
/* v1.9.275: 본문 영역 고정 높이 + 스크롤 — 카드가 내용에 따라 늘어나지 않도록 */
.feed-body{font-size:13.5px;font-weight:400;letter-spacing:-0.1px;line-height:1.62;color:#334155;max-height:560px;overflow-y:auto;overflow-x:hidden;padding-right:8px;scrollbar-width:thin;scrollbar-color:#cbd5e1 transparent}  /* v2.3.418: 본문 읽기 영역 확대 320→560 */
.feed-body::-webkit-scrollbar{width:6px}
.feed-body::-webkit-scrollbar-track{background:transparent}
.feed-body::-webkit-scrollbar-thumb{background:#cbd5e1;border-radius:3px}
.feed-body::-webkit-scrollbar-thumb:hover{background:#94a3b8}
@media (max-width:600px){.feed-body{max-height:240px}}
.feed-caption{font-size:12px;font-weight:500;letter-spacing:-.05px;color:#94a3b8;line-height:1.5}
.feed-label{font-size:12.5px;font-weight:600;letter-spacing:-.15px;color:#475569}

/* v2.3.247: 운영 업무 공유 미니 캘린더 (RECENT POSTS 하단) — 글 있는 날짜 색상 강조 */
.feed-mini-cal{margin-top:14px;padding-top:14px;border-top:1px solid #f1f5f9}
.feed-mini-cal-wrap{max-width:288px}  /* v2.3.249: 폭 고정 — 1열 레이아웃 등에서 셀이 거대해지는 것 방지 */
.fmc-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;max-width:288px}
.fmc-title{font-size:12.5px;font-weight:800;color:#0f172a;letter-spacing:-.2px}
.fmc-nav{background:#f8fafc;border:1px solid #e2e8f0;border-radius:7px;width:24px;height:24px;cursor:pointer;color:#475569;font-size:14px;line-height:1;display:flex;align-items:center;justify-content:center;transition:all .12s;padding:0}
.fmc-nav:hover{background:#eef2ff;border-color:#c7d2fe;color:#4338ca}
.fmc-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:3px;width:100%;max-width:288px}  /* v2.3.394: minmax(0,1fr) — 셀 min-content 블로우아웃으로 날짜/요일 그리드 폭이 어긋나던 버그 방지 */
.fmc-dows{margin-bottom:3px}
.fmc-dow{text-align:center;font-size:9.5px;font-weight:700;color:#94a3b8;padding:2px 0}
.fmc-dow.sun{color:#f87171}
.fmc-dow.sat{color:#60a5fa}
.fmc-cell{position:relative;min-width:0;height:32px;display:flex;align-items:center;justify-content:center;border:0;background:transparent;border-radius:7px;font-size:12px;font-weight:600;color:#334155;cursor:pointer;transition:all .12s;font-variant-numeric:tabular-nums;padding:0}
.fmc-cell.empty{cursor:default;pointer-events:none}
.fmc-cell.nopost{cursor:default;pointer-events:none;color:#cbd5e1;font-weight:600}
.fmc-cell.has:hover{background:#d1fae5}
.fmc-cell.sun:not(.nopost){color:#dc2626}
.fmc-cell.sat:not(.nopost){color:#2563eb}
.fmc-cell.has{background:#ecfdf5;color:#047857;font-weight:800}
.fmc-cell.has .fmc-dot{position:absolute;bottom:3px;left:50%;transform:translateX(-50%);width:4px;height:4px;border-radius:50%;background:#10b981}
.fmc-cell.today{box-shadow:inset 0 0 0 1.5px #0f172a}
.fmc-cell.sel{background:#0a0a0a !important;color:#fff !important}
.fmc-cell.sel .fmc-dot{background:#fff}
.fmc-all{margin-top:8px;width:100%;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:6px;font-size:11px;font-weight:700;color:#475569;cursor:pointer;transition:all .12s}
.fmc-all:hover{background:#f1f5f9}
.fmc-all.active{background:#0a0a0a;color:#fff;border-color:#0a0a0a}
.fmc-legend{display:flex;align-items:center;gap:5px;margin-top:8px;font-size:10px;color:#94a3b8;font-weight:600}
.fmc-legend-dot{width:9px;height:9px;border-radius:3px;background:#ecfdf5;border:1px solid #6ee7b7;flex-shrink:0}

/* v2.3.414: RECENT POSTS 를 심플 리스트로 (제목 + 작성자) */
.feed-lrow{display:flex;flex-direction:column;gap:3px;padding:9px 11px;background:#fff;border:1px solid #eef2f6;border-radius:10px;cursor:pointer;transition:all .15s;position:relative}
.feed-lrow:hover{border-color:#cbd5e1;transform:translateY(-1px);box-shadow:0 2px 6px rgba(15,23,42,.04)}
.feed-lrow.pinned{background:#fffbeb;border-color:#fde68a}
.feed-lrow.cur{background:#e8f4fd;border-color:#a9d5f5}  /* v2.3.420: 본문에 표시 중인 글 — 연한 하늘색 강조 */
.feed-lrow.cur:hover{border-color:#7fc0ef}
.feed-lrow-meta{display:flex;align-items:center;gap:5px;flex-wrap:wrap;line-height:1}
.feed-lrow-title{font-size:13px;font-weight:700;color:#0a0a0a;letter-spacing:-.2px;line-height:1.35;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;word-break:break-all}
.feed-lrow-author{font-size:11px;color:#64748b;font-weight:600}

/* v2.3.414: 운영 업무 공유 전체 캘린더 (하단, 크게) — 글 있는 날 제목/작성자 표시·클릭 시 팝업 */
/* v2.3.424: 하단 캘린더 — 테두리·헤더·오늘/주말·셀 hover 강화로 또렷하게 */
.feed-fullcal{margin-top:20px;background:#fff;border:1px solid rgba(255,255,255,.95);border-radius:16px;padding:18px 20px 20px;box-shadow:0 6px 18px rgba(59,130,246,.12),0 1px 3px rgba(15,23,42,.05)}  /* v2.3.581: 블루 페이지 배경 위 흰 카드 */
.ffc-head{display:flex;align-items:center;gap:10px;margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid #eef2f6}
.ffc-title{font-size:16px;font-weight:800;color:#0f172a;letter-spacing:-.3px}
.ffc-nav{background:#f4f7fb;border:1px solid #dde3ec;border-radius:8px;width:31px;height:31px;cursor:pointer;color:#475569;font-size:17px;line-height:1;display:flex;align-items:center;justify-content:center;transition:all .12s;padding:0}
.ffc-nav:hover{background:#e6edf6;border-color:#b9c4d4;color:#1e3a5f}
.ffc-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:7px}
.ffc-dows{margin-bottom:8px}
/* v2.3.581: 요일 헤더 — 파스텔 알약, 일/토는 로즈·블루 틴트 */
.ffc-dow{text-align:center;font-size:11.5px;font-weight:800;color:#7086ab;padding:5px 0;letter-spacing:.5px;background:#eef4fe;border-radius:999px}
.ffc-dow.sun{color:#e05661;background:#fdeef0}.ffc-dow.sat{color:#3b82f6;background:#e6f0fe}
.ffc-cell{min-height:96px;border:1px solid #e7eefb;border-radius:10px;padding:6px 6px 7px;background:#fff;display:flex;flex-direction:column;gap:3px;overflow:hidden;transition:border-color .12s,box-shadow .12s;box-shadow:0 1px 2px rgba(148,163,184,.08)}  /* v2.3.574: 셀 테두리도 한 톤 밝게 + 옅은 그림자 */
.ffc-cell:not(.empty):hover{border-color:#c3d7f2;box-shadow:0 2px 6px rgba(37,99,235,.06)}
.ffc-cell.empty{border-color:transparent;background:transparent}
.ffc-cell.today{border-color:#3b82f6;background:linear-gradient(180deg,#e3efff 0%,#f2f8ff 100%);box-shadow:inset 0 0 0 1px #3b82f6,0 2px 8px rgba(59,130,246,.15)}  /* v2.3.581: 오늘 칸 그라데이션 */
.ffc-cell.sel{background:#0a0a0a;border-color:#0a0a0a}
.ffc-cell.sel .ffc-daynum{color:#fff}
.ffc-daynum{font-size:12.5px;font-weight:800;color:#334155;cursor:pointer;font-variant-numeric:tabular-nums;width:fit-content;padding:1px 5px;border-radius:6px;line-height:1.4}
.ffc-daynum:hover{background:#e0ecfb;color:#2563eb}
.ffc-daynum.sun{color:#dc2626}.ffc-daynum.sat{color:#2563eb}
.ffc-posts{display:flex;flex-direction:column;gap:3px;overflow:hidden}
.ffc-post{text-align:left;border:0;border-left:3px solid #94a3b8;background:#f1f5f9;border-radius:5px;padding:3px 7px;cursor:pointer;display:flex;flex-direction:column;gap:1px;transition:filter .12s,transform .12s;min-width:0}
.ffc-post:hover{filter:brightness(.96);transform:translateX(1px)}
.ffc-post-t{font-size:11px;font-weight:700;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;letter-spacing:-.2px}
.ffc-post-a{font-size:9.5px;color:#64748b;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
@media (max-width:700px){.ffc-cell{min-height:60px;padding:4px}.ffc-post-a{display:none}.ffc-post-t{font-size:10px}}

/* 카테고리 칩 (색상은 카테고리별 bg/fg 유지) */
.feed-cat-chip{display:inline-flex;align-items:center;gap:4px;padding:6px 12px;border-radius:999px;font-size:11.5px;font-weight:600;letter-spacing:-.1px;cursor:pointer;transition:all .15s;background:#f1f5f9;color:#475569;border:1px solid transparent;user-select:none;line-height:1.2}
.feed-cat-chip:hover{transform:translateY(-1px)}
.feed-cat-chip.active{background:#0a0a0a;color:#fff}

/* 카드 — 그림자 줄이고 border 얇게, 여백 넉넉히 */
/* v1.9.244 — 2컬럼 레이아웃: 왼쪽 메인 카드 + 오른쪽 썸네일 스트립 */
.feed-layout-grid{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:16px;align-items:start}
.feed-layout-grid.collapsed{grid-template-columns:minmax(0,1fr) 46px}  /* v2.3.422: 접힘 — 우측에 얇은 펼치기 핸들 */
/* v2.3.422: 목록 접힘 핸들 — 접힌 걸 한눈에 보이고 클릭해 펼침 */
/* v2.3.427: 라벤더 톤 통일 */
.feed-list-handle{align-self:stretch;min-height:180px;background:linear-gradient(180deg,#f5f3ff 0%,#ede9fe 100%);border:1.5px solid #c4b5fd;border-radius:12px;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;gap:12px;color:#9575e8;transition:all .18s;padding:18px 0}  /* v2.3.429: 텍스트 톤 살짝 연하게 */
.feed-list-handle:hover{background:linear-gradient(180deg,#ede9fe 0%,#ddd6fe 100%);border-color:#a78bfa;color:#7c3aed;box-shadow:0 3px 10px rgba(124,58,237,.12)}
.feed-list-handle .flh-arrow{font-size:21px;font-weight:900;line-height:1;color:#7c3aed}
.feed-list-handle .flh-text{writing-mode:vertical-rl;text-orientation:mixed;font-size:12.5px;font-weight:800;letter-spacing:2px;white-space:nowrap}
.feed-list-handle .flh-count{font-size:10.5px;font-weight:800;background:#7c3aed;color:#fff;border-radius:999px;padding:2px 8px;line-height:1.4;box-shadow:0 1px 3px rgba(124,58,237,.3)}
@media (max-width:1100px){.feed-layout-grid{grid-template-columns:1fr;gap:14px}}
.feed-main-slot{min-width:0}
.feed-thumb-strip{background:#fafbfc;border:1px solid #f1f5f9;border-radius:14px;padding:12px 10px 10px;display:flex;flex-direction:column;gap:8px}
.feed-thumb-head{display:flex;align-items:center;justify-content:space-between;padding:2px 6px 8px;border-bottom:1px solid #eef2f6}
/* v1.9.246 — 3개 썸네일만 보이고 나머지는 스크롤 (68px × 3 + gap 2 × 8) */
.feed-thumb-scroll{overflow-y:auto;display:flex;flex-direction:column;gap:8px;padding:4px 2px 2px;max-height:600px;scrollbar-width:thin;scrollbar-color:#cbd5e1 transparent}  /* v2.3.416: 리스트 길이 고정(넘치면 스크롤) */
.feed-thumb-scroll::-webkit-scrollbar{width:6px}
.feed-thumb-scroll::-webkit-scrollbar-thumb{background:#cbd5e1;border-radius:999px}
.feed-thumb-scroll::-webkit-scrollbar-track{background:transparent}
.feed-thumb{display:flex;gap:9px;padding:8px;background:#fff;border:1px solid #eef2f6;border-radius:10px;cursor:pointer;transition:all .15s;align-items:flex-start;position:relative}
.feed-thumb:hover{border-color:#cbd5e1;transform:translateY(-1px);box-shadow:0 2px 6px rgba(15,23,42,.04)}
.feed-thumb.pinned{background:#fffbeb;border-color:#fde68a}
.feed-thumb-media{width:64px;height:64px;flex-shrink:0;border-radius:8px;overflow:hidden;background:#fff;border:1px solid #e2e8f0;display:flex;align-items:center;justify-content:center;position:relative}
/* v1.9.389: object-fit:cover → contain + 고품질 리샘플링으로 텍스트 스크린샷 가독성 개선 */
.feed-thumb-media img{width:100%;height:100%;object-fit:contain;image-rendering:auto;-webkit-backface-visibility:hidden;backface-visibility:hidden}
.feed-thumb-emoji{font-size:22px;opacity:.75}
.feed-thumb-pin{position:absolute;top:2px;right:2px;font-size:10px;background:#fef3c7;border-radius:50%;width:16px;height:16px;display:inline-flex;align-items:center;justify-content:center;box-shadow:0 1px 2px rgba(0,0,0,.08)}
.feed-thumb-body{min-width:0;flex:1;display:flex;flex-direction:column;gap:4px}
.feed-thumb-meta{display:flex;align-items:center;gap:5px;flex-wrap:wrap;line-height:1}
.feed-thumb-cat{font-size:9.5px;font-weight:700;padding:2px 6px;border-radius:4px;letter-spacing:-.1px;filter:brightness(1.04) saturate(0.78);opacity:.85}
.feed-thumb-time{font-size:10px;color:#94a3b8;font-weight:500}
.feed-thumb-new{font-size:8.5px;font-weight:800;color:#fff;background:#0a0a0a;padding:1.5px 5px;border-radius:3px;letter-spacing:.8px}
.feed-thumb-title{font-size:12.5px;font-weight:700;color:#0a0a0a;letter-spacing:-.2px;line-height:1.35;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;word-break:break-all}

/* v1.9.243 — 카드 최대폭 제한 + 세로 패딩 축소 (노트북 한 화면 fit) */
.feed-card{background:#fff;border:1.5px solid #c2ccdb;border-radius:16px;overflow:hidden;transition:border-color .25s ease;position:relative}  /* v2.3.421: 본문 카드 테두리 진하게 */
.feed-card:hover{border-color:#94a3b8}
.feed-card.pinned{background:#fffbeb;border-color:#fde68a}
/* v1.9.277: 2-column → 세로 스택 (본문 위 · 이미지 아래). 본문이 카드 전체 폭을 쓰도록 */
.feed-card-grid{display:flex;flex-direction:column;gap:0}
.feed-card-body{padding:22px 28px 18px}
@media (max-width:600px){.feed-card-body{padding:16px 18px}}
/* v1.9.266: 이미지 영역이 본문 높이를 따라 늘어나는 문제 수정 — 고정 높이 + align-self:start */
/* v1.9.277: 이미지 영역은 카드 폭 전체, 본문 아래에 배치. 이미지 없으면 아예 렌더하지 않음(JS에서 처리) */
/* v1.9.299: 피드 카드 하단 이미지 블록을 훨씬 작게. 본문 위에 46px 썸네일 스트립이 이미 있고
              클릭 시 라이트박스로 원본 크기를 볼 수 있으므로 하단 미디어는 프리뷰 수준으로 축소. */
.feed-card-media{background:#f8fafc;border-top:1px solid #f1f5f9;border-left:0;display:block;width:100%;aspect-ratio:21/9;max-height:240px;position:relative;overflow:hidden}
@media (max-width:600px){.feed-card-media{aspect-ratio:16/9;max-height:180px}}
.feed-card-media img{width:100%;height:100%;display:block;object-fit:cover;cursor:pointer;transition:transform .45s ease}
.feed-card-media img:hover{transform:scale(1.02)}
/* v1.9.246 — 다중 이미지 캐러셀 (○● 도트 네비게이션) */
.feed-carousel{position:relative;width:100%;height:100%;min-height:0;background:#f8fafc;overflow:hidden}
.feed-carousel-track{position:relative;width:100%;height:100%;min-height:0}
.feed-carousel-slide{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity .3s ease;cursor:pointer;display:block}
.feed-carousel-slide.active{opacity:1;z-index:1}
.feed-carousel-arrow{position:absolute;top:50%;transform:translateY(-50%);background:rgba(15,23,42,.42);backdrop-filter:blur(4px);color:#fff;border:0;width:28px;height:28px;border-radius:50%;cursor:pointer;font-size:18px;line-height:1;display:flex;align-items:center;justify-content:center;transition:background .15s;z-index:2;padding:0;font-weight:700}
.feed-carousel-arrow:hover{background:rgba(15,23,42,.72)}
.feed-carousel-arrow.prev{left:8px}
.feed-carousel-arrow.next{right:8px}
.feed-carousel-dots{position:absolute;bottom:10px;left:50%;transform:translateX(-50%);display:flex;gap:6px;z-index:2;background:rgba(15,23,42,.32);backdrop-filter:blur(4px);padding:5px 9px;border-radius:999px}
.feed-carousel-dot{width:7px;height:7px;border-radius:50%;background:rgba(255,255,255,.5);cursor:pointer;transition:all .18s;border:0;padding:0}
.feed-carousel-dot.active{background:#fff;transform:scale(1.35)}
.feed-carousel-dot:hover{background:rgba(255,255,255,.85)}
.feed-carousel-counter{position:absolute;top:10px;right:10px;background:rgba(15,23,42,.55);backdrop-filter:blur(4px);color:#fff;font-size:10.5px;font-weight:700;padding:3px 8px;border-radius:999px;z-index:2;letter-spacing:.3px}

/* AI 요약 — 더 미니멀하게 */
.feed-ai-summary{background:#f8fafc;border-left:2px solid #6366f1;padding:9px 14px;border-radius:0 10px 10px 0;font-size:12.5px;color:#4338ca;font-weight:500;line-height:1.55;margin:10px 0 12px;display:flex;align-items:flex-start;gap:10px;letter-spacing:-.15px}
.feed-ai-summary .sparkle{font-size:13px;flex-shrink:0;margin-top:2px;opacity:.8}

/* 아바타 */
.feed-avatar{width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#a78bfa,#60a5fa);color:#fff;font-size:13px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;letter-spacing:-.3px;text-transform:uppercase}

/* 반응 바 — 여백 넓히고 옅게 */
.feed-reaction-bar{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:12px;padding-top:12px;border-top:1px solid #f1f5f9}
.feed-reaction{background:#fff;border:1px solid #e5e7eb;border-radius:999px;padding:5px 11px;font-size:12px;font-weight:600;cursor:pointer;transition:all .14s;display:inline-flex;align-items:center;gap:5px;color:#475569;user-select:none;letter-spacing:-.1px}
.feed-reaction:hover{background:#f8fafc;border-color:#cbd5e1}
.feed-reaction.mine{background:#eef2ff;border-color:#a5b4fc;color:#4338ca}
.feed-reaction .emoji{font-size:14px;line-height:1}
.feed-reaction .cnt{font-variant-numeric:tabular-nums;font-weight:700}
/* v1.9.246 — 반응 추가 버튼: 명확한 pill 디자인 (😊 반응 + 작은 + 마크) */
.feed-reaction-add{background:linear-gradient(135deg,#fef3c7,#fde68a);border-color:#fcd34d;color:#92400e;padding:5px 12px}
.feed-reaction-add:hover{background:linear-gradient(135deg,#fde68a,#fcd34d);border-color:#f59e0b;transform:translateY(-1px);box-shadow:0 2px 6px rgba(245,158,11,.18)}
.feed-reaction-add .plus{font-size:11px;font-weight:800;opacity:.7;margin-left:1px}

/* 댓글 */
.feed-comment-area{margin-top:14px;padding:14px 14px 12px;background:#f7f9fc;border:1px solid #dde3ec;border-radius:14px}  /* v2.3.421: 댓글 영역 박스화 — 더 잘 보이게 */
.feed-comment-item{display:flex;gap:10px;padding:10px 0;align-items:flex-start}
.feed-comment-item .feed-avatar{width:30px;height:30px;font-size:11px}
.feed-comment-body{flex:1;font-size:13px;line-height:1.6;color:#334155;min-width:0;letter-spacing:-.15px}
.feed-comment-body .name{font-weight:700;color:#0a0a0a;margin-right:7px}
.feed-comment-body .time{color:#cbd5e1;font-size:11px;margin-left:6px;font-weight:500}

/* 핀/NEW 배지 */
.feed-pin-badge{position:absolute;top:18px;left:-4px;background:#0a0a0a;color:#fde68a;font-size:10px;font-weight:800;padding:4px 12px 4px 14px;border-radius:0 999px 999px 0;letter-spacing:1.2px;z-index:2;text-transform:uppercase}
.feed-new-badge{display:inline-flex;align-items:center;background:#0a0a0a;color:#fff;font-size:9px;font-weight:800;padding:3px 7px;border-radius:3px;letter-spacing:1.5px;margin-left:8px;vertical-align:middle;line-height:1;text-transform:uppercase}

/* 카테고리 배지 (카드 내부) — 색상은 데이터별 유지 */
.feed-cat-badge{display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:6px;font-size:11px;font-weight:700;letter-spacing:-.1px;line-height:1.3}

/* CONTENT — v1.9.237 여백 확장 */
#content{flex:1;overflow-y:auto;padding:28px 32px 40px}
.page{display:none}
.page.active{display:block}

/* CARDS — v1.9.237 DIVE-like refinement */
.card{background:#fff;border-radius:var(--r);border:1px solid var(--gray-100);box-shadow:none;transition:border-color .2s ease}
/* 인사이트 카드 이미지 캐러셀 스크롤바 — 가늘고 옅게 */
.ins-carousel{scrollbar-width:none}
.ins-carousel::-webkit-scrollbar{display:none}
[id^="np-img-car-"]::-webkit-scrollbar{display:none}
.card-hdr{padding:16px 22px;border-bottom:1px solid var(--gray-100);display:flex;align-items:center;justify-content:space-between;gap:8px}
.card-title{font-size:14.5px;font-weight:700;letter-spacing:-0.3px;color:var(--gray-800);display:flex;align-items:center;gap:6px;line-height:1.35}
.card-body{padding:20px 22px}
.card-body.p0{padding:0}

/* STAT CARDS — v1.9.554: 깔끔한 카드 (상단 색상 stripe 제거, 부드러운 그림자 + hover 효과)
   카드 구분은 헤더 아이콘 + 색상 점(dot)으로 해결 */
.stats-row{display:grid;grid-template-columns:minmax(0,1.75fr) minmax(0,1fr);gap:16px;margin-bottom:16px;align-items:stretch}  /* v2.3.436: 업무공유 넓게·매출 좁게 + 높이 동일(stretch) */
.stats-row > .stat, .stats-row > div{height:100%}  /* v2.3.436: 두 열 카드가 열 높이를 꽉 채워 하단 정렬 */
/* v2.3.435: HOME 르니브 업무 일정 캘린더 */
.dcal-head{display:flex;align-items:center;justify-content:center;gap:14px;margin-bottom:10px}
.dcal-title{font-size:14px;font-weight:800;color:#0f172a;letter-spacing:-.2px;min-width:96px;text-align:center}
.dcal-nav{background:#f4f7fb;border:1px solid #dde3ec;border-radius:8px;width:28px;height:28px;cursor:pointer;color:#475569;font-size:16px;line-height:1;display:flex;align-items:center;justify-content:center;transition:all .12s;padding:0}
.dcal-nav:hover{background:#e6edf6;border-color:#b9c4d4;color:#1e3a5f}
.dcal-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:5px}
.dcal-dows{margin-bottom:5px}
.dcal-dow{text-align:center;font-size:11px;font-weight:800;color:#94a3b8;padding:2px 0}
.dcal-dow.sun{color:#f87171}.dcal-dow.sat{color:#60a5fa}
.dcal-cell{min-height:86px;border:1px solid #eef1f6;border-radius:8px;padding:4px 4px 5px;background:#fff;display:flex;flex-direction:column;gap:2px;overflow:hidden}
.dcal-cell.empty{border-color:transparent;background:transparent}
.dcal-cell.today{border-color:#2563eb;background:#f5f9ff;box-shadow:inset 0 0 0 1px #2563eb}
.dcal-daynum{font-size:11.5px;font-weight:700;color:#334155;padding:0 3px;line-height:1.5;font-variant-numeric:tabular-nums}
.dcal-daynum.sun{color:#dc2626}.dcal-daynum.sat{color:#2563eb}
.dcal-evs{display:flex;flex-direction:column;gap:2px;overflow:hidden}
.dcal-ev{text-align:left;border:0;border-left:3px solid #94a3b8;border-radius:4px;padding:2px 5px;cursor:pointer;display:flex;align-items:center;gap:3px;min-width:0;font-family:inherit;transition:filter .12s}
.dcal-ev:hover{filter:brightness(.95)}
.dcal-ev-i{font-size:10px;flex-shrink:0;line-height:1}
.dcal-ev-t{font-size:10.5px;font-weight:700;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;letter-spacing:-.2px}
.dcal-more{font-size:9.5px;color:#94a3b8;font-weight:700;padding-left:3px}
/* v2.3.468 — 일정이 있는 날짜 칸은 클릭하면 전체 일정 팝업 */
.dcal-cell.has-ev{cursor:pointer}
.dcal-cell.has-ev:hover{border-color:#93c5fd;background:#f7fbff}
.dcal-cell.has-ev:hover .dcal-more{color:#3b82f6}
@media(max-width:1100px){.dcal-cell{min-height:58px}.dcal-ev-t{font-size:9.5px}}
.stat{background:#fff;border-radius:var(--r);border:1px solid var(--gray-200);padding:20px 22px;box-shadow:0 1px 2px rgba(15,23,42,0.04);position:relative;overflow:hidden;cursor:default;transition:all .18s ease}
/* v2.3.575: 홈 대시보드 — 스카이블루 배경 위에 흰 카드가 도드라지게 */
/* v2.3.579: 위쪽 + 왼쪽 경계 모두 배경색(gray-50) 페이드 레이어로 부드럽게 번짐 */
#page-dashboard{background:
  linear-gradient(90deg,#f8fafc 0%,rgba(248,250,252,0) 90px),
  linear-gradient(180deg,#f8fafc 0%,rgba(248,250,252,0) 80px),
  linear-gradient(180deg,#e9f3fe 0%,#f3f8ff 60%,#f9fcff 100%);
  border-radius:22px;padding:20px 22px 26px}
#page-dashboard .stat,#page-dashboard .card{border:1px solid rgba(255,255,255,.95);box-shadow:0 6px 18px rgba(59,130,246,.12),0 1px 3px rgba(15,23,42,.05)}
#page-dashboard .stat:hover{box-shadow:0 10px 24px rgba(59,130,246,.16),0 2px 4px rgba(15,23,42,.06)}
/* v2.3.580: 르니브 캘린더·업무공유 페이지도 홈과 동일한 스카이블루 페이드 배경 + 카드 부각 */
#page-feedshare,#page-calendar{background:
  linear-gradient(90deg,#f8fafc 0%,rgba(248,250,252,0) 90px),
  linear-gradient(180deg,#f8fafc 0%,rgba(248,250,252,0) 80px),
  linear-gradient(180deg,#e9f3fe 0%,#f3f8ff 60%,#f9fcff 100%);
  border-radius:22px;padding:18px 20px 24px}
#page-feedshare #feed-section,#page-feedshare .feed-fullcal,#page-calendar .card{border:1px solid rgba(255,255,255,.95);box-shadow:0 6px 18px rgba(59,130,246,.12),0 1px 3px rgba(15,23,42,.05)}
.stat:hover{border-color:var(--gray-300);box-shadow:0 4px 12px rgba(15,23,42,0.06);transform:translateY(-1px)}
/* 카드 헤더 좌측에 작은 색상 점(dot) — 카테고리 식별 */
.stat::before{content:'';position:absolute;left:0;top:24px;width:3px;height:18px;border-radius:0 2px 2px 0;background:var(--gray-300)}
.stat.c-sky::before{background:var(--sky-500)}
.stat.c-green::before{background:#10b981}
.stat.c-amber::before{background:#f59e0b}
.stat.c-purple::before{background:#a78bfa}
.stat.c-red::before{background:#f0a0b8}
.stat.c-blue::before{background:#3b82f6}
.stat-lbl{font-size:12.5px;color:var(--gray-500);font-weight:700;letter-spacing:-0.1px;margin-bottom:10px}
.stat-val{font-size:24px;font-weight:800;letter-spacing:-0.6px;color:#0a0a0a;line-height:1.1}
.stat-sub{font-size:12.5px;color:var(--gray-600);margin-top:6px;line-height:1.7;letter-spacing:-0.1px}
.stat-ico{position:absolute;right:16px;top:50%;transform:translateY(-50%);font-size:26px;opacity:.12}
.stock-warn-label{display:inline-flex;align-items:center;gap:1px;background:#fef2f5;color:#d4628a;font-size:8.5px;padding:0px 5px;border-radius:8px;font-weight:700;line-height:15px;vertical-align:middle;margin-left:4px;border:1.5px solid #f0a0be}

/* CS Tab colors */
.cs-tab{display:inline-flex;align-items:center;padding:8px 20px;border-radius:8px 8px 0 0;cursor:pointer;font-size:13px;font-weight:600;transition:all .15s;border:1px solid transparent;margin-right:0}
.cs-tab.consumer{background:#D4F1E8;color:#2D7A5F;border-color:#2D7A5F}
.cs-tab.consumer.inactive{background:#f0faf6;color:#6dae97;border-color:#e0f0ea}
.cs-tab.pharmacist{background:#D6ECF7;color:#2B6B8F;border-color:#2B6B8F}
.cs-tab.pharmacist.inactive{background:#edf5fa;color:#6d9ab5;border-color:#dce9f2}
.cs-tab.all-tab{background:#fff;color:var(--gray-500);border-color:var(--gray-300)}
.cs-tab.all-tab.inactive{background:var(--gray-50);color:var(--gray-400);border-color:var(--gray-200)}
.cs-icon-btn{transition:all .15s;user-select:none}.cs-icon-btn.active{background:var(--sky-100)!important;border-color:var(--sky-400)!important;box-shadow:0 0 0 2px var(--sky-200)}
.cs-tab.active-tab{border-bottom:3px solid currentColor}
/* Sales sub-nav */
.sales-subnav{display:flex;gap:2px;background:var(--gray-100);border-radius:8px;padding:3px;margin-bottom:16px}
.sales-subnav-item{padding:7px 14px;border-radius:6px;cursor:pointer;font-size:13px;font-weight:500;color:var(--gray-500);transition:all .12s}
.sales-subnav-item:hover{color:var(--gray-700)}
.sales-subnav-item.active{background:#fff;color:var(--sky-700);box-shadow:var(--shadow)}
/* Shop tabs */
.shop-tabs{display:flex;gap:4px;flex-wrap:wrap;margin-bottom:12px}
.shop-tab{padding:5px 14px;border-radius:20px;cursor:pointer;font-size:11.5px;font-weight:500;background:var(--gray-100);color:var(--gray-600);border:1px solid var(--gray-200);transition:all .12s}
.shop-tab:hover{background:var(--sky-50);border-color:var(--sky-300)}
.shop-tab.active{background:var(--sky-500);color:#fff;border-color:var(--sky-500)}
/* Margin colors */
.margin-neg{color:var(--red-600);font-weight:600}
.margin-low{color:var(--amber-600)}
.margin-mid{color:var(--gray-700)}
.margin-high{color:var(--green-600);font-weight:600}
/* Shop mgmt sections */
.shop-section{background:#fff;border:1px solid var(--gray-200);border-radius:var(--r);padding:16px;margin-bottom:14px}
.shop-section-title{font-size:13px;font-weight:700;color:var(--gray-700);margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid var(--gray-100)}
/* Nav sub-items */
.nav-sub{overflow:hidden;max-height:0;transition:max-height .25s ease;position:relative;margin-left:2px}
.nav-sub.open{max-height:240px}
.nav-sub::before{content:'';position:absolute;left:26px;top:2px;bottom:4px;width:1px;background:rgba(255,255,255,.1)}
.nav-sub .nav-item{font-size:13px;padding:8px 14px 8px 36px;margin-bottom:1px;color:rgba(255,255,255,.78);font-weight:500;position:relative}
.nav-sub .nav-item::after{content:'';position:absolute;left:26px;top:50%;width:7px;height:1px;background:rgba(255,255,255,.2)}
.nav-sub .nav-item:hover{background:#374e6b;color:#fff}
.nav-sub .nav-item.active{background:#2563eb;color:#fff}

/* GRID LAYOUTS */
.g2{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px}
.g31{display:grid;grid-template-columns:2fr 1fr;gap:16px;margin-bottom:16px}
.g13{display:grid;grid-template-columns:1fr 2fr;gap:16px;margin-bottom:16px}
.mb16{margin-bottom:16px}

/* TABLE — v1.9.237 여유로운 줄높이 + 한글 letter-spacing 정돈 */
.tbl-wrap{overflow-x:auto}
table{width:100%;border-collapse:collapse;font-size:12.5px;letter-spacing:-0.15px}
/* v1.9.335: 생산 현황 테이블 폰트 override 제거 — 다른 페이지와 동일하게 12.5px 기본값 사용 */
/* v1.9.303: HOME 생산 현황/일정 위젯 내부 스크롤바를 항상 보이도록 커스텀 */
.home-scroll-box{scrollbar-width:thin;scrollbar-color:#cbd5e1 #f8fafc}
.home-scroll-box::-webkit-scrollbar{width:10px;height:10px}
.home-scroll-box::-webkit-scrollbar-track{background:#f8fafc;border-radius:8px}
.home-scroll-box::-webkit-scrollbar-thumb{background:#cbd5e1;border-radius:8px;border:2px solid #f8fafc}
.home-scroll-box::-webkit-scrollbar-thumb:hover{background:#94a3b8}
thead th{text-align:center;padding:12px 12px;font-size:11px;font-weight:700;color:var(--gray-500);border-bottom:1px solid var(--gray-200);background:var(--gray-50);white-space:nowrap;letter-spacing:.3px;vertical-align:middle;text-transform:uppercase}
tbody tr{border-bottom:1px solid var(--gray-100);transition:background .1s}
tbody tr:hover{background:var(--sky-50)}
tbody td{padding:11px 12px;color:var(--gray-700);vertical-align:middle;letter-spacing:-0.15px}
tbody tr:last-child{border-bottom:none}

/* BADGES — 색상 유지, 크기만 통일 */
.badge{display:inline-flex;align-items:center;padding:3px 9px;border-radius:5px;font-size:11.5px;font-weight:600;letter-spacing:-0.1px;white-space:nowrap;border:1px solid transparent}
.badge.sky{background:var(--sky-50);color:var(--sky-700);border-color:var(--sky-200)}
.badge.green{background:var(--green-50);color:var(--green-700);border-color:#bbf7d0}
.badge.amber{background:var(--amber-50);color:var(--amber-700);border-color:#fde68a}
.badge.red{background:var(--red-50);color:var(--red-700);border-color:#fecaca}
.badge.purple{background:var(--purple-50);color:var(--purple-700);border-color:#e9d5ff}
.badge.gray{background:var(--gray-50);color:var(--gray-600);border-color:var(--gray-200)}

/* BUTTONS — v1.9.237 pill 느낌 + 통일된 사이즈 */
.btn{display:inline-flex;align-items:center;gap:5px;padding:8px 16px;border-radius:8px;font-size:12.5px;font-weight:600;letter-spacing:-0.15px;cursor:pointer;border:none;font-family:var(--font);transition:all .14s;user-select:none;line-height:1.3}
.btn-primary{background:#0a0a0a;color:#fff}
.btn-primary:hover{background:#1f2937}
.btn-outline{background:#fff;color:var(--gray-700);border:1px solid var(--gray-200)}
.btn-outline:hover{background:var(--gray-50);border-color:var(--gray-400);color:#0a0a0a}
.btn-danger{background:var(--red-500);color:#fff}
.btn-danger:hover{background:var(--red-600)}
.btn-success{background:var(--green-600);color:#fff}
.btn-success:hover{background:var(--green-700)}
.btn-sm{padding:6px 12px;font-size:11.5px}
.btn-xs{padding:4px 10px;font-size:11px}

/* FORM — v1.9.237 */
.fg{margin-bottom:16px}
.fg label{display:block;font-size:12px;font-weight:700;letter-spacing:-0.1px;color:var(--gray-700);margin-bottom:7px}
.fg label span.req{color:var(--red-500);margin-left:2px}
.np-pane .fg label{font-size:13.5px;font-weight:700;color:var(--gray-800);margin-bottom:7px;letter-spacing:-0.2px}
.np-pane #np-stage-btns,.np-pane > div[style*="margin:10px 0 6px"]{font-size:13.5px !important}
.fi,.fs,.fta{width:100%;padding:9px 13px;border:1px solid var(--gray-200);border-radius:9px;font-size:13px;font-family:var(--font);color:var(--gray-800);outline:none;transition:border .12s,box-shadow .12s;background:#fff;letter-spacing:-0.15px}
.fi:focus,.fs:focus,.fta:focus{border-color:#0a0a0a;box-shadow:0 0 0 3px rgba(10,10,10,.06)}
.fta{resize:vertical;min-height:72px;line-height:1.6}
.fg2{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.fg3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px}
.full{grid-column:1/-1}

/* UNIFIED TOP BAR: tabs, buttons, search (품목/생산/재고/쇼핑몰) */
.pg-chip{display:inline-flex;align-items:center;padding:7px 18px;border-radius:8px 8px 0 0;cursor:pointer;font-size:12.5px;font-weight:600;border:1px solid transparent;border-bottom:1px solid transparent;transition:all .15s;line-height:1.2;height:34px;box-sizing:border-box}
.pg-chip.active{border-bottom:3px solid currentColor}
.pg-topbar-btn{padding:7px 14px!important;font-size:12.5px!important;height:34px;box-sizing:border-box;line-height:1.2}
.pg-topbar-search{padding:7px 10px 7px 32px!important;font-size:12.5px!important;height:34px;box-sizing:border-box;width:220px}
.pg-topbar-search-wrap{position:relative;display:inline-block}
.pg-topbar-search-wrap::before{content:'🔍';position:absolute;left:10px;top:50%;transform:translateY(-50%);font-size:12.5px;color:var(--gray-400);pointer-events:none;line-height:1}
.stamp-new-badge{position:absolute;top:-6px;right:-2px;background:transparent;color:#eab308;font-size:7px;font-weight:700;padding:0;letter-spacing:.5px;pointer-events:none;animation:stampNewPulse .7s ease-in-out infinite alternate;z-index:2;text-shadow:0 0 4px rgba(234,179,8,.8),0 0 2px rgba(234,179,8,.6)}
@keyframes stampNewPulse{from{opacity:1;text-shadow:0 0 6px rgba(250,204,21,1),0 0 3px rgba(250,204,21,.8)}to{opacity:.55;text-shadow:0 0 2px rgba(234,179,8,.4)}}

/* CHIPS — 카테고리 색상은 기본 유지, 크기만 통일 */
.chip{display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:999px;font-size:11.5px;font-weight:600;letter-spacing:-0.1px;background:var(--sky-50);color:var(--sky-700);border:1px solid var(--sky-200);cursor:pointer;transition:all .12s;margin:2px}
.chip:hover{background:var(--sky-100);border-color:var(--sky-400)}
.chip.active{background:var(--sky-500);color:#fff;border-color:var(--sky-500)}

/* PROGRESS */
.pbar{height:5px;background:var(--gray-200);border-radius:3px;overflow:hidden}
.pbar-fill{height:100%;border-radius:3px;background:var(--sky-400);transition:width .3s}

/* TIMELINE */
.tl{position:relative;padding-left:18px}
.tl::before{content:'';position:absolute;left:5px;top:6px;bottom:6px;width:1px;background:var(--gray-200)}
.tl-item{position:relative;padding-bottom:14px}
.tl-dot{position:absolute;left:-16px;top:3px;width:9px;height:9px;border-radius:50%;background:var(--sky-400);border:2px solid #fff;box-shadow:0 0 0 1px var(--sky-300)}
.tl-dot.done{background:var(--green-500);box-shadow:0 0 0 1px var(--green-400)}
.tl-dot.late{background:var(--red-500);box-shadow:0 0 0 1px var(--red-400)}
.tl-dot.plan{background:var(--gray-300);box-shadow:0 0 0 1px var(--gray-200)}
.tl-t{font-size:13px;font-weight:500;color:var(--gray-700)}
.tl-d{font-size:11.5px;color:var(--gray-500);margin-top:2px}

/* KANBAN */
.kanban{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
.kb-col{background:var(--gray-50);border-radius:9px;padding:11px;min-height:300px}
.kb-col-hdr{font-size:11.5px;font-weight:600;color:var(--gray-600);padding-bottom:9px;border-bottom:1px solid var(--gray-200);margin-bottom:9px;display:flex;align-items:center;justify-content:space-between}
.kb-card{background:#fff;border-radius:7px;padding:10px 12px;margin-bottom:7px;border:1px solid var(--gray-200);box-shadow:var(--shadow);cursor:grab;transition:all .12s}
.kb-card:hover{border-color:var(--sky-300);box-shadow:var(--shadow-md);transform:translateY(-1px)}
.kb-card-t{font-size:12px;font-weight:500;color:var(--gray-800);margin-bottom:3px}
.kb-card-m{font-size:10.5px;color:var(--gray-400)}
.kb-card-tags{display:flex;gap:4px;margin-top:6px;flex-wrap:wrap}

/* LINK */
/* v1.9.335: 링크 기본 밑줄 제거 — 마우스 hover 시에만 밑줄 표시 */
.lnk{color:var(--sky-600);cursor:pointer;text-decoration:none;text-underline-offset:2px}
.lnk:hover{color:var(--sky-800);text-decoration:underline}
/* v1.9.213: 발주서 결재 테이블 품목 클릭 링크 (underline은 hover에서만) */
.po-item-link{transition:background .15s ease,color .15s ease}
.po-item-link:hover{background:#f0f9ff;color:var(--sky-800) !important}
.po-item-link:hover > div{color:var(--sky-500)}

/* ALERT */
.alert{border-radius:8px;padding:10px 14px;font-size:12px;display:flex;align-items:flex-start;gap:8px;margin-bottom:14px}
.alert.warning{background:var(--amber-50);border:1px solid var(--amber-500);color:var(--amber-700)}
.alert.danger{background:var(--red-50);border:1px solid var(--red-400);color:var(--red-700)}
.alert.info{background:var(--sky-50);border:1px solid var(--sky-300);color:var(--sky-700)}
.alert.success{background:var(--green-50);border:1px solid var(--green-400);color:var(--green-700)}

/* TABS — v1.9.237 에디토리얼 톤 */
.tabs{display:flex;gap:4px;border-bottom:1px solid var(--gray-100);margin-bottom:20px}
.tab{padding:12px 20px;font-size:14px;cursor:pointer;color:var(--gray-400);border-bottom:2px solid transparent;margin-bottom:-1px;transition:all .14s;font-family:var(--font);font-weight:600;letter-spacing:-0.2px}
.tab.active{color:#0a0a0a;border-bottom-color:#0a0a0a;font-weight:700}
.tab:hover{color:#0a0a0a}

/* MODAL — v1.9.237 */
.overlay{display:none;position:fixed;inset:0;background:rgba(10,10,10,.55);z-index:300;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(4px)}
.overlay.show{display:flex}
.modal{background:#fff;border-radius:18px;width:100%;max-width:580px;max-height:88vh;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 24px 60px rgba(0,0,0,.18);animation:fadeUp .18s ease}
.modal.wide{max-width:760px}
@keyframes fadeUp{from{transform:translateY(16px);opacity:0}to{transform:translateY(0);opacity:1}}
.modal-hdr{padding:20px 24px;border-bottom:1px solid var(--gray-100);display:flex;align-items:center;justify-content:space-between;background:#fff;z-index:1;flex-shrink:0}
.modal-ttl{font-size:16px;font-weight:700;letter-spacing:-0.3px;color:#0a0a0a}
.modal-x{background:none;border:none;font-size:18px;cursor:pointer;color:var(--gray-400);width:30px;height:30px;display:flex;align-items:center;justify-content:center;border-radius:8px;font-family:var(--font);transition:all .15s}
.modal-x:hover{background:var(--gray-100);color:var(--gray-800)}
.modal-body{padding:24px;overflow-y:auto;flex:1}
.modal-ft{padding:14px 24px;border-top:1px solid var(--gray-100);display:flex;justify-content:flex-end;gap:9px;background:#fff;flex-shrink:0}

/* AI PANEL */
#ai-panel{position:fixed;right:0;top:0;bottom:0;width:350px;background:#fff;border-left:1px solid var(--gray-200);box-shadow:-4px 0 20px rgba(0,0,0,.07);z-index:100;display:flex;flex-direction:column;transform:translateX(100%);transition:transform .25s ease}
#ai-panel.open{transform:translateX(0)}
.ai-hdr{padding:14px 18px;border-bottom:1px solid var(--gray-200);display:flex;align-items:center;justify-content:space-between;background:linear-gradient(135deg,var(--sky-50),#fff);flex-shrink:0}
.ai-hdr-t{font-size:13.5px;font-weight:600;color:var(--sky-800);display:flex;align-items:center;gap:7px}
.ai-msgs{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px}
.ai-msg{max-width:88%}
.ai-msg.user{align-self:flex-end}
.ai-msg.ai{align-self:flex-start}
.ai-bubble{padding:9px 13px;border-radius:11px;font-size:12.5px;line-height:1.55}
.ai-msg.user .ai-bubble{background:var(--sky-500);color:#fff;border-bottom-right-radius:3px}
.ai-msg.ai .ai-bubble{background:var(--gray-100);color:var(--gray-800);border-bottom-left-radius:3px}
.ai-time{font-size:9.5px;color:var(--gray-400);margin-top:3px;text-align:right}
.ai-loading{display:none;align-items:center;gap:7px;padding:9px 13px;font-size:12px;color:var(--gray-500)}
.ai-loading.show{display:flex}
.dots span{display:inline-block;width:5px;height:5px;background:var(--sky-400);border-radius:50%;margin:0 2px;animation:bounce .7s infinite}
.dots span:nth-child(2){animation-delay:.14s}
.dots span:nth-child(3){animation-delay:.28s}
@keyframes bounce{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-5px)}}
.ai-foot{padding:10px 14px;border-top:1px solid var(--gray-200);flex-shrink:0}
.ai-quick{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:7px}
.ai-input-row{display:flex;gap:7px}
.ai-inp{flex:1;padding:7px 11px;border:1px solid var(--gray-300);border-radius:7px;font-size:12.5px;font-family:var(--font);outline:none;resize:none;height:36px}
.ai-inp:focus{border-color:var(--sky-400)}
.ai-send{padding:7px 13px;background:var(--sky-500);color:#fff;border:none;border-radius:7px;cursor:pointer;font-size:14px;transition:background .12s}
.ai-send:hover{background:var(--sky-600)}

/* NOTIFY */
#notifs{position:fixed;top:14px;right:14px;z-index:999;display:flex;flex-direction:column;gap:7px;pointer-events:none}
.notif{background:#fff;border-radius:9px;padding:11px 15px;box-shadow:0 4px 16px rgba(0,0,0,.12);border-left:3px solid var(--sky-500);font-size:12px;color:var(--gray-700);min-width:220px;pointer-events:auto;animation:slideIn .25s ease}
.notif.success{border-left-color:var(--green-500)}
.notif.warning{border-left-color:var(--amber-500)}
.notif.error{border-left-color:var(--red-500)}
@keyframes slideIn{from{transform:translateX(16px);opacity:0}to{transform:translateX(0);opacity:1}}

/* DOCUMENT PREVIEW */
.doc-preview{border:1px solid var(--gray-200);border-radius:8px;padding:20px;font-size:12px;background:#fff}
.doc-preview .doc-hdr{text-align:center;margin-bottom:20px;padding-bottom:14px;border-bottom:2px solid var(--sky-500)}
.doc-preview .doc-title{font-size:18px;font-weight:700;color:var(--sky-800)}
.doc-preview .doc-sub{font-size:11px;color:var(--gray-500);margin-top:3px}
.doc-preview .doc-info{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px}
.doc-preview .doc-info-item label{font-size:10px;color:var(--gray-500);display:block;margin-bottom:2px}
.doc-preview .doc-info-item span{font-size:12px;font-weight:500}
.doc-stamp{display:inline-block;border:2px solid var(--red-500);color:var(--red-500);font-size:18px;font-weight:700;padding:4px 12px;border-radius:4px;transform:rotate(-15deg);opacity:.7;margin-top:8px}

/* KPI */
.kpi-row{display:flex;gap:8px;align-items:center;padding:9px 0;border-bottom:1px solid var(--gray-100)}
.kpi-lbl{font-size:12px;color:var(--gray-600);flex:1}
.kpi-val{font-size:13px;font-weight:600}
.kpi-chg{font-size:10.5px}
.kpi-chg.up{color:var(--green-600)}
.kpi-chg.dn{color:var(--red-600)}

/* SCROLLBAR */
::-webkit-scrollbar{width:8px;height:8px}
::-webkit-scrollbar-thumb{background:var(--gray-400);border-radius:4px}
::-webkit-scrollbar-thumb:hover{background:var(--gray-500)}
::-webkit-scrollbar-track{background:var(--gray-100);border-radius:4px}

/* BOM indent */
.bom-child td:first-child{padding-left:12px}
.bom-section td{font-size:11px;font-weight:600;padding:7px 12px;background:var(--sky-50);color:var(--sky-700)}
.bom-section.purple td{background:var(--purple-50);color:var(--purple-700)}

/* STOCK status bar */
.stock-bar{height:8px;border-radius:4px;background:var(--gray-200);overflow:hidden;width:80px}
.stock-fill{height:100%;border-radius:4px;transition:width .3s}

/* PRINT styles (for PDF) */
@media print{
  #sidebar,#header,#ai-panel,#notifs,#modal-overlay,.no-print{display:none!important}
  #content{overflow:visible;padding:0}
  .page{display:block!important}
  body{overflow:auto;height:auto}
  #app{height:auto;display:block}
  #main{overflow:visible}
}

/* COST TABLE */
.cost-row{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--gray-100);font-size:12px}
.cost-row.total{font-weight:700;font-size:13px;border-top:2px solid var(--gray-300);border-bottom:none;padding-top:10px;color:var(--sky-700)}

/* CHECKBOX */
.chk-list{display:flex;flex-direction:column;gap:7px}
.chk-item{display:flex;align-items:center;gap:7px;font-size:12px;cursor:pointer}
.chk-item input[type=checkbox]{width:14px;height:14px;cursor:pointer;accent-color:var(--sky-500)}

/* File input */
input[type=file]{font-size:12px;color:var(--gray-600)}

/* Number input */
input[type=number]{-moz-appearance:textfield}
input[type=number]::-webkit-outer-spin-button,
input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none}

/* Section title — v1.9.237 */
.sec-title{font-size:13.5px;font-weight:700;letter-spacing:-0.2px;color:var(--gray-800);margin-bottom:14px;display:flex;align-items:center;gap:6px;padding-bottom:10px;border-bottom:1px solid var(--gray-100)}

/* Empty state */
.empty{text-align:center;padding:36px;color:var(--gray-400);font-size:13px;letter-spacing:-0.1px}

/* CHART */
.chart-wrap{position:relative;height:200px}

/* DRAG OVER */
.kb-col.drag-over{background:var(--sky-50);border:2px dashed var(--sky-300)}

/* TOOLTIP */
[data-tip]{position:relative;cursor:help}
[data-tip]:hover::after{content:attr(data-tip);position:absolute;bottom:calc(100% + 4px);left:50%;transform:translateX(-50%);background:var(--gray-800);color:#fff;font-size:10px;padding:3px 7px;border-radius:4px;white-space:nowrap;z-index:99;pointer-events:none}

/* ── LOGIN SCREEN ── */
#login-screen{display:none;position:fixed;inset:0;z-index:9999;background:linear-gradient(135deg,#075985 0%,#0c4a6e 50%,#075985 100%);align-items:center;justify-content:center;flex-direction:column}
#login-screen.show{display:flex}
.login-box{background:#fff;border-radius:20px;padding:48px 44px;width:380px;text-align:center;box-shadow:0 24px 60px rgba(0,0,0,.3)}
.login-logo{font-size:32px;font-weight:700;letter-spacing:4px;color:#075985;margin-bottom:4px}
.login-sub{font-size:11px;letter-spacing:2px;color:var(--gray-400);margin-bottom:8px}
.login-divider{width:40px;height:3px;background:#0ea5e9;border-radius:2px;margin:0 auto 28px}
.login-title{font-size:18px;font-weight:600;color:var(--gray-800);margin-bottom:6px}
.login-desc{font-size:12.5px;color:var(--gray-500);margin-bottom:28px;line-height:1.6}
#google-login-btn{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;padding:13px 20px;border:1.5px solid var(--gray-200);border-radius:10px;background:#fff;cursor:pointer;font-size:13.5px;font-weight:500;color:var(--gray-700);transition:all .15s;font-family:var(--font)}
#google-login-btn:hover{background:var(--gray-50);border-color:#0ea5e9;color:#0369a1;box-shadow:0 2px 8px rgba(14,165,233,.15)}
#google-login-btn:disabled{opacity:.6;cursor:not-allowed}
.google-icon{width:20px;height:20px;flex-shrink:0}
.login-footer{font-size:11px;color:var(--gray-400);margin-top:20px;line-height:1.6}
/* ── WAITING SCREEN ── */
#waiting-screen{display:none;position:fixed;inset:0;z-index:9998;background:var(--gray-50);align-items:center;justify-content:center;flex-direction:column}
#waiting-screen.show{display:flex}
.waiting-box{background:#fff;border-radius:20px;padding:48px 44px;width:420px;text-align:center;box-shadow:var(--shadow-md);border:1px solid var(--gray-200)}
.waiting-icon{font-size:48px;margin-bottom:16px}
.waiting-title{font-size:20px;font-weight:600;color:var(--gray-800);margin-bottom:8px}
.waiting-desc{font-size:13px;color:var(--gray-500);line-height:1.7;margin-bottom:24px}
.waiting-user{display:flex;align-items:center;gap:10px;background:var(--sky-50);border:1px solid var(--sky-200);border-radius:10px;padding:12px 16px;margin-bottom:20px;text-align:left}
.waiting-avatar{width:36px;height:36px;border-radius:50%;flex-shrink:0}
.waiting-name{font-size:13px;font-weight:500;color:var(--gray-800)}
.waiting-email{font-size:11.5px;color:var(--gray-500)}
.waiting-status{display:inline-flex;align-items:center;gap:5px;background:var(--amber-100);color:var(--amber-700);font-size:11.5px;font-weight:500;padding:4px 12px;border-radius:20px;margin-bottom:20px}
/* ── AI 협업 버튼 (호버 떠오름 + 로딩 말풍선) ── */
.gemini-btn{padding:14px 16px;background:linear-gradient(135deg,#eef2ff 0%,#e0e7ff 100%);color:#4338ca;border:1px solid #c7d2fe;border-radius:10px;font-size:14px;cursor:pointer;font-weight:800;white-space:normal;letter-spacing:-0.3px;line-height:1.9;transition:transform .22s cubic-bezier(.2,.8,.2,1),box-shadow .22s ease,background .22s ease,border-color .22s ease}
.gemini-btn:hover:not(:disabled){transform:translateY(-3px) scale(1.02);box-shadow:0 10px 22px rgba(67,56,202,.2);background:linear-gradient(135deg,#e0e7ff 0%,#c7d2fe 100%);border-color:#a5b4fc}
.gemini-btn:active:not(:disabled){transform:translateY(-1px) scale(1.005);box-shadow:0 4px 10px rgba(67,56,202,.18)}
.gemini-btn:disabled{cursor:wait;opacity:.98;transform:none;background:linear-gradient(135deg,#eef2ff 0%,#e0e7ff 100%)}
/* Claude 버튼 (주황 톤) */
.claude-btn{background:linear-gradient(135deg,#fff7ed 0%,#fed7aa 100%);color:#9a3412;border-color:#fdba74}
.claude-btn:hover:not(:disabled){background:linear-gradient(135deg,#fed7aa 0%,#fdba74 100%);box-shadow:0 10px 22px rgba(154,52,18,.2);border-color:#fb923c}
.claude-btn:disabled{background:linear-gradient(135deg,#fff7ed 0%,#fed7aa 100%)}
.claude-bubble{border-color:#fdba74 !important;color:#9a3412 !important;box-shadow:0 2px 6px rgba(154,52,18,.1) !important}
.claude-bubble::after{border-right-color:#fdba74 !important;border-bottom-color:#fdba74 !important}
.claude-dots span{background:#9a3412 !important}
.gemini-loading{display:flex;flex-direction:column;align-items:center;gap:6px;padding:2px 0}
.gemini-bubble{display:inline-block;padding:5px 11px;background:#fff;border-radius:14px;border:1.5px solid #c7d2fe;font-size:12px;color:#4338ca;font-weight:700;position:relative;animation:bubbleFloat 1.8s ease-in-out infinite;box-shadow:0 2px 6px rgba(67,56,202,.1);line-height:1.3}
.gemini-bubble::after{content:'';position:absolute;bottom:-6px;left:18px;width:9px;height:9px;background:#fff;border-right:1.5px solid #c7d2fe;border-bottom:1.5px solid #c7d2fe;transform:rotate(45deg)}
.gemini-dots{display:inline-flex;gap:3px;margin-top:3px}
.gemini-dots span{width:5px;height:5px;background:#4338ca;border-radius:50%;animation:dotPulse 1.4s ease-in-out infinite}
.gemini-dots span:nth-child(2){animation-delay:.18s}
.gemini-dots span:nth-child(3){animation-delay:.36s}
.gemini-avatar{font-size:18px;line-height:1;animation:tilt 2.4s ease-in-out infinite}
@keyframes bubbleFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}
@keyframes dotPulse{0%,80%,100%{transform:scale(.55);opacity:.4}40%{transform:scale(1.15);opacity:1}}
@keyframes tilt{0%,100%{transform:rotate(-6deg)}50%{transform:rotate(6deg)}}
@keyframes _spin{to{transform:rotate(360deg)}}

/* v1.9.538 — 시장 메모 contenteditable placeholder */
#np-note:empty:before { content: attr(data-placeholder); color: var(--gray-400); pointer-events: none; }
#np-note:focus { border-color: var(--sky-400); box-shadow: 0 0 0 3px rgba(14,165,233,0.08); }
#np-note ul, #np-note ol { padding-left: 24px; margin: 6px 0; }
#np-note li { margin: 2px 0; }
/* v2.3.464 — 클레임 상세 리치에디터 placeholder/리스트 */
#claim-detail:empty:before { content: attr(data-placeholder); color: var(--gray-400); pointer-events: none; }
#claim-detail:focus { border-color: var(--sky-400); box-shadow: 0 0 0 3px rgba(14,165,233,0.08); }
#claim-detail ul, #claim-detail ol { padding-left: 24px; margin: 6px 0; }
#claim-detail li { margin: 2px 0; }
#claim-detail-body ul, #claim-detail-body ol { padding-left: 24px; margin: 6px 0; }

.overlay{display:flex!important;position:static}</style><div class="overlay" id="overlay-company-info">
      <div class="modal" style="width:780px;max-width:95vw">
        <div class="modal-hdr" style="background:linear-gradient(135deg,#ede9fe,#fce7f3);border-bottom:1px solid #e9d5ff">
          <span class="modal-ttl" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
            <span>🏢</span>
            <span>우리 회사 정보</span>
            <span style="color:#94a3b8;font-weight:500">-</span>
            <span id="ci-company-display" style="font-weight:800;color:#0f172a"></span>
            <span id="ci-company-en-display" style="font-size:12.5px;color:#64748b;font-style:italic;font-weight:500"></span>
          </span>
          <button class="modal-x" onclick="closeModal('company-info')">✕</button>
        </div>
        <div class="modal-body" style="padding:0">
          <!-- v1.9.889: 큰 회사명 헤더 삭제 (헤더로 이동) -->
          <!-- 정보 테이블 -->
          <div style="padding:0">
            <table style="width:100%;border-collapse:collapse;font-size:13px">
              <tbody id="ci-info-tbody"></tbody>
            </table>
          </div>
        </div>
        <div class="modal-ft" style="justify-content:space-between">
          <button class="btn btn-outline" onclick="closeModal('company-info')">닫기</button>
          <div style="display:flex;gap:8px">
            <button class="btn btn-outline" id="ci-edit-btn" onclick="toggleCompanyEdit(true)">✏️ 수정</button>
            <button class="btn btn-primary" id="ci-save-btn" style="display:none" onclick="(window.saveOurCompanyInfo||saveOurCompanyInfo)()">💾 저장</button>
            <button class="btn btn-outline" id="ci-cancel-btn" style="display:none" onclick="toggleCompanyEdit(false)">취소</button>
          </div>
        </div>
      </div>
    </div>

    <!-- ══════════════ PARTNERS (v1.9.613) — 거래처 hub: 협력사 / 생산업체 / 판매업체 ══════════════ -->
    <div class="page" id="page-partners">
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;align-items:center">
        <button id="partners-tab-coop" class="btn partners-tab-btn" onclick="switchPartnersTab('coop')" style="padding:10px 18px;font-weight:700;font-size:14px">🤝 협력사</button>
        <button id="partners-tab-seller" class="btn partners-tab-btn" onclick="switchPartnersTab('seller')" style="padding:10px 18px;font-weight:700;font-size:14px">🛒 판매업체</button>
        <button id="partners-tab-shop" class="btn partners-tab-btn" onclick="switchPartnersTab('shop')" style="padding:10px 18px;font-weight:700;font-size:14px">🏪 쇼핑몰</button>
        <button id="partners-tab-mfr" class="btn partners-tab-btn" onclick="switchPartnersTab('mfr')" style="padding:10px 18px;font-weight:700;font-size:14px">🏭 생산업체</button>
        <!-- v1.9.888: 우리 회사 정보 버튼 -->
        <button onclick="openCompanyInfoModal()" style="margin-left:auto;padding:10px 18px;font-weight:700;font-size:13.5px;background:linear-gradient(135deg,#a78bfa,#7c3aed);color:#fff;border:none;border-radius:8px;cursor:pointer;box-shadow:0 2px 8px rgba(124,58,237,.25);transition:all .15s" onmouseover="this.style.transform='translateY(-1px)';this.style.boxShadow='0 4px 12px rgba(124,58,237,.35)'" onmouseout="this.style.transform='';this.style.boxShadow='0 2px 8px rgba(124,58,237,.25)'">🏢 우리 회사 정보</button>
      </div>

      <!-- 협력사 탭 (default) -->
      <div id="partners-pane-coop" class="partners-pane">
        <div style="display:flex;justify-content:flex-end;margin-bottom:10px">
          <button class="btn btn-pr</div></div></div><script>document.getElementById("ci-info-tbody").innerHTML="<tr><td style=\"padding:12px 16px;background:#f8fafc\">비고</td><td style=\"padding:12px 18px\"><textarea class=\"fi\" id=\"ci-note\" style=\"width:100%;font-size:13px;padding:6px 10px;min-height:60px;resize:vertical\">기존 내용</textarea></td></tr>";</script>