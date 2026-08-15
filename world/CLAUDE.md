# RENIV WORLD — 3D 가상 오피스 (작업 인계 문서)

이 폴더(`ERP/world/`)는 르니브 ERP 데이터를 픽셀 아트 3D 오피스로 시각화하는 단일 HTML 앱이다.
Claude Code에서 이어서 작업할 때 **이 문서를 먼저 읽을 것.**

---

## 1. 목적과 원칙

- **ERP 시각화가 목적이다.** 예쁜 3D가 아니라, ERP 숫자를 한눈에 보는 화면이다.
  새 오브젝트를 추가할 때는 반드시 "이건 ERP의 어떤 값인가"가 있어야 한다.
- **더미 데이터를 화면에 넣지 않는다.** 데모 모드(`?demo=1`)의 `DEMO_SNAP`만 예외이고,
  이건 로그인 없이 보여주기 위한 고정 샘플이다.
- **파일은 단일 HTML 하나.** CSS·JS를 분리하지 않는다. (ERP 본체 `index.html`과 같은 방침)

---

## 2. 파일 구조

```
ERP/
├─ index.html          ← ERP 본체 (4MB, 건드리지 말 것)
├─ firebase.json       ← hosting 섹션 없음. 배포는 GitHub Pages
├─ .nojekyll
└─ world/
   ├─ index.html       ← 이 앱 (약 43KB)
   ├─ CLAUDE.md        ← 이 문서
   └─ vo_snapshot.py   ← 참고용 사본 (실행본은 서버에 있음. 3-1 참고)
```

### ⚠️ 저장소 경로 — 반드시 E 드라이브

이 PC에는 OneDrive 폴더가 **두 개** 있고, 둘 다 `0.RENIV\ERP` 를 갖고 있다.

| 경로 | 상태 |
|---|---|
| `E:\OneDrive\0.RENIV\ERP\ERP\` | ✅ **진짜.** git 저장소이자 배포본 |
| `C:\Users\heeka\OneDrive\0.RENIV\ERP\` | ❌ 낡은 사본. `world/` 자체가 없음 |

C 쪽을 고치면 작업이 통째로 날아간다. 작업 시작 전에 `pwd` 로 E 드라이브인지 확인할 것.

배포: `https://renivcto.github.io/ERP/world/index.html`
로그인 없이 보기: `https://renivcto.github.io/ERP/world/index.html?demo=1`

---

## 3. 데이터 흐름

```
Firestore erp_data/*  (shopOrders, items, approvals, productions, expenses, feedPosts)
        │
        │  서버 /opt/vaultsync/vo_snapshot.py  (cron 10분마다, /etc/cron.d/reniv-vo)
        ▼
Firestore erp_data/vo_snapshot   { data: "<JSON 문자열>", ts: <ms> }
        │
        │  브라우저에서 Firebase Auth 구글 로그인 후 읽기
        ▼
   world/index.html  →  loadData() → renderData(snap)
```

### 3-1. `vo_snapshot.py` 는 이 저장소에서 실행되지 않는다

저장소를 `grep vo_snapshot` 해도 `world/index.html` 밖에 안 나오는 게 정상이다. **버그가 아니다.**
스냅샷을 만드는 쪽은 **GCP VM(`hermes-server`)** 에서 cron으로 돈다.

```
서버 /opt/vaultsync/vo_snapshot.py      ← 실행본 (root 소유)
     /etc/cron.d/reniv-vo               ← 10분마다 실행
world/vo_snapshot.py                    ← 참고용 사본 (스키마 확인용, 실행 안 됨)
```

스키마를 바꿔야 하면 **서버 파일을 직접 고쳐야 한다.** 저장소 사본만 고치면 아무 일도 안 일어난다.
서버 접속은 GCP 콘솔의 브라우저 SSH를 쓰는데, **긴 붙여넣기가 잘린다.**
30~50줄씩 나눠 넣고 `wc -l` 로 줄 수를 확인할 것. 프롬프트가 `>` 로 바뀌면 Ctrl+C.

**중요:** 3D 앱은 `vo_snapshot` **하나만** 읽는다. 850KB짜리 `shopOrders`를 직접 읽지 않는다.
무거워지기도 하고, 샤딩(`shopOrders_arch1..N`) 처리를 클라이언트에서 다시 할 이유가 없다.

### vo_snapshot 스키마

```jsonc
{
  "ts": 1786000000000,
  "stamp": "2026-08-15 13:00",
  "kpi": { "todayRevenue": 0, "monthRevenue": 0, "monthOrders": 0, "aov": 0 },
  "channels":   [{ "name": "바로팜", "rev": 0, "cnt": 0 }],        // 최대 6
  "regions":    [{ "name": "경기 성남시", "rev": 0, "cnt": 0 }],   // 바로팜만, 최대 6
  "warehouses": [{ "name": "바로팜 창고",
                   "items": [{ "code": "P-GS-01", "name": "...", "qty": 0, "low": false }] }],
  "stockAlerts": [{ "code": "", "name": "", "qty": 0, "wh": "" }],  // qty <= 20, 최대 6
  "approvals":  { "pending": 0 },
  "productions":[{ "name": "", "qty": 0, "status": "생산중" }],     // 최대 6
  "payments":   { "today": 0, "todayCnt": 0, "month": 0, "monthCnt": 0, "over": 0, "overCnt": 0 },
  "pharmacies": { "total": 0, "repeat": 0 },
  "feed":       [{ "title": "", "cat": "", "date": "" }],
  "employees":  [{ "id": "tim", "name": "Tim", "team": "비서", "room": "ceo" }]
}
```

스키마를 바꿔야 하면 **서버의 `vo_snapshot.py`와 이 앱을 같이** 고쳐야 한다.
서버 스크립트 사본은 옵시디언 볼트 `_scripts/vo_snapshot.py` 에도 있다.

### 보안

- 3D 앱이 쓰는 계정은 **읽기 전용**이다. 쓰기 코드를 절대 넣지 말 것.
- `firestore.rules` 의 `allow read: if isActive()` 로 보호된다.
- 스냅샷에는 **약국명·주소 상세·개인정보가 들어가지 않는다.** `regions` 는 시/군/구 2어절까지만.
  여기에 고객 식별정보를 추가하지 말 것.

---

## 4. 화면 구성

| 구역 | 좌표 (x, z) | 보여주는 ERP 데이터 |
|---|---|---|
| 대표이사실 `ceo` | -32, -16 | 결재 대기 문서 더미, 지급예정 금고 |
| 디자인팀 `design` | 32, -16 | 생산 진행 이젤 (productions) |
| 국내영업팀 `sales` | -32, 16 | 지역별 매출 블록, 약국 수·재구매 |
| 마케팅팀 `marketing` | 32, 16 | 채널별 매출 블록 |
| 회의실 `meeting` | 0, -8 | AI 직원 4명 소집 |
| 창고 `warehouse` | 0, 25 | 창고별 재고 상자 (재고 20 이하는 빨간색 + 깜빡임) |

상단 전광판 = 이번 달 매출 / 오늘 매출 / 주문 건수.
좌하단 KPI 칩, 우하단 재고 경고.

---

## 5. 캐릭터 (직원 개성)

`EMP` 배열 하나에서 얼굴·머리·옷·액세서리를 전부 설정한다.

| | Tim (비서) | IAN (국내영업) | Greg (마케팅) | Jony (디자인) |
|---|---|---|---|---|
| 성격 | 차분·단정 | 활발·붙임성 | 장난기·아이디어 | 진지·감각적 |
| 얼굴 | 안경, 잔잔한 미소 | 활짝 웃음, 진한 볼터치 | 윙크 + 씩 웃음, 주근깨 | 또렷한 눈매, 각진 눈썹 |
| 머리 | 갈색 가르마 | 검정 단정 | 밝은 갈색 곱슬 + 뻗친 머리 | 검정 단발 |
| 옷 | 민트 셔츠 + 네이비 조끼 | 파란 셔츠 + 빨간 넥타이 | 보라 후디 + 헤드폰 | 핑크 셔츠 + 카멜 베레모 + 스카프 |

- 얼굴은 `faceTexture(f)` 가 **64×64 캔버스**에 픽셀로 그린다. `NearestFilter` 로 도트감 유지.
  파라미터: `fringe`(flat/split/wave/bob), `brow`(flat/raised/angled), `eye`(round/calm/sharp),
  `mouth`(smile/grin/smirk/calm), `wink`, `glasses`, `blush`(true/'strong'/false), `freckles`, `skin`, `hairHex`
- 3D 액세서리는 `makeChar()` 안 `cfg.acc` 로 분기: `vest` / `tie` / `headphones` / `beret`.
  머리 모양은 `cfg.hairLong` `cfg.hairSide` `cfg.hairTuft`.
- 직원을 추가하려면 `EMP` 에 한 항목 + `ZONES` 에 방 하나 + 서버 `vo_snapshot.py` 의 `employees` 에 추가.

**얼굴만 따로 확인하는 법**은 아래 7번 참고.

---

## 6. 글씨(라벨) 처리 — 여기가 제일 자주 깨진다

글씨는 **CanvasTexture 스프라이트가 아니라 `CSS2DObject`(HTML div)** 로 그린다.
캔버스 텍스처를 쓰면 저해상도에서 글씨가 뭉개져서 바꾼 것이다. 되돌리지 말 것.

```js
label('창고', { cls:'zone' })   // → CSS2DObject, div.tg.zone
```

- 클래스: `.tg` 기본 / `.zone` 방 이름 / `.name` 직원 이름표 / `.small` 데이터 수치 /
  `.scr` 모니터 화면 / `.bubble` 회의 말풍선 / `.warnc` 재고 부족(빨강)
- `cls` 를 안 주면 `o.size` 로 자동 판단한다 (44↑ zone, 32↓ small).
- 렌더는 **두 번** 돈다:
  ```js
  renderer.render(scene, camera);
  tagRenderer.render(scene, camera);   // 이 줄 빠지면 글씨가 전부 사라진다
  ```
- **라벨이 붙은 그룹을 씬에서 뺄 때는 반드시 `dropTags(그룹)` 을 먼저 호출**할 것.
  CSS2DRenderer는 직계 자식이 제거될 때만 DOM을 정리해서, 그룹째 빼면 div가 화면에 남는다.
  `clearDataPicks()` 에 이미 들어가 있다. (중복이던 `clearData()` 는 제거함)
- `fadeTags()` 가 3프레임마다 돌면서 거리에 따라 라벨을 흐리게/숨긴다.
  임계값: `small` 104, `scr` 58, 나머지 175. 라벨이 안 보이면 여기를 먼저 의심할 것.

---

## 7. 로컬에서 확인하기

`file://` 로 열면 ES 모듈 CORS 때문에 안 뜬다. 반드시 HTTP 서버로 띄울 것.

```bash
cd ERP/world
python -m http.server 8899
# → http://localhost:8899/index.html?demo=1
```

CDN(`cdn.jsdelivr.net`)이 막힌 환경이면 three를 로컬에 받아서 importmap을 바꾼다:

```bash
npm i three@0.161.0
# index.html 의 importmap 두 줄을
#   "three": "./node_modules/three/build/three.module.js"
#   "three/addons/": "./node_modules/three/examples/jsm/"
# 로 바꾼 사본(index.test.html)을 만들어 테스트. 원본은 CDN 그대로 둘 것.
```

### 얼굴만 빠르게 보기

`faceTexture()` 와 `EMP` 를 떼어내 캔버스 4개에 256px로 확대해 그리는
`faces.html` 을 만들어 보면 픽셀 단위로 확인하기 쉽다. (3D를 안 띄워도 된다)

### Playwright 스크린샷 검증

```bash
npx playwright install chromium   # 최초 1회
node shot.js
```
swiftshader 옵션이 필요하다:
```js
chromium.launch({ args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'] })
```
디버깅용으로 `window.__VO__ = { camera, controls, scene, chars }` 를 테스트 사본에만 넣으면
`page.evaluate()` 로 카메라를 원하는 위치에 놓고 찍을 수 있다. **원본에는 넣지 말 것.**

---

## 8. 함정 모음 (실제로 겪은 것들)

1. **`clock.getElapsedTime()` 을 쓰지 말 것.**
   `getDelta()` 와 같이 쓰면 내부 타이머를 소비해서 카메라 이동 애니메이션이 멈춘다.
   반드시 `const dt = Math.min(clock.getDelta(), 0.05); T += dt;` 패턴만 쓴다.
2. **`tagRenderer.render()` 누락** → 글씨가 통째로 사라짐 (6번 참고).
3. **`dropTags()` 누락** → 새로고침할 때마다 옛 라벨 div가 화면에 눌어붙음.
4. **화질 토글**: `PIX` 가 1이면 `devicePixelRatio`(최대 2)로 선명하게, 0.42면 도트 느낌.
   `renderer.setPixelRatio()` 와 `setSize()` 를 같이 바꿔야 한다.
5. **직원이 뒤통수만 보이면** `EMP.forEach` 안의 `desk.ry` 와 `ZONES[].cam` 을 확인.
   현재는 네 방 모두 책상을 방 앞쪽(z+2)에 두고 직원이 `ry:0`(카메라 쪽)을 본다.
   직원은 모니터에 가리지 않게 `x + 1.7` 만큼 옆으로 비켜 서 있다.
6. **회의 시스템**: `setMeeting(on, manual)`. 30분마다 3분 자동 소집, 수동 소집 후 10분은
   자동 소집을 하지 않는다. 좌석은 `MEET_SEATS` 4석 고정 — 직원이 5명 이상이 되면 좌석을 늘려야 한다.

---

## 8-1. 배포 반영 확인 (버전 상수)

`world/index.html` 맨 위에 `VO_VERSION` 상수가 있다.

```js
const VO_VERSION = 'v2026-08-15a';   // 코드를 고칠 때마다 올릴 것
```

- 상단바 오른쪽 시각 옆에 같이 표시되고, 브라우저 콘솔에도 `[RENIV WORLD] v...` 로 찍힌다.
- 배포 후 이 값이 안 바뀌면 **아직 반영이 안 된 것**이다. Ctrl+Shift+R 후 다시 확인.
- 코드를 고치면 커밋 전에 이 값을 반드시 올릴 것. (a → b → c, 날짜가 바뀌면 날짜부터)

---

## 9. 배포 절차

```bash
git add world/
git commit -m "3D 오피스: <바꾼 내용>"
git push origin main
```

GitHub Pages가 1~3분 뒤 반영한다. 안 바뀌면 브라우저 강력 새로고침(Ctrl+Shift+R).

### 푸시가 안 될 때

- `[rejected]` → 다른 기기에서 먼저 푸시한 것. `git pull --rebase` 후 다시 푸시.
- **PowerShell에서 출력이 멈춤** → 콘솔 "빠른 편집 모드" 때문. 창을 클릭하지 말 것.
  또는 `git push origin main *> push.log; Get-Content push.log` 로 로그를 파일로 받는다.
- **GitHub Desktop이 저장소를 못 찾음** → 리포지토리가 C드라이브에서
  `E:\OneDrive\0.RENIV\ERP\ERP` 로 옮겨졌다. GitHub Desktop에서 기존 항목을 제거하고
  `File → Add local repository` 로 E드라이브 경로를 다시 등록할 것.
- 저장소가 OneDrive 안에 있어서 `.git` 동기화 충돌이 날 수 있다. 푸시 전에 OneDrive
  동기화가 끝났는지 확인하면 안전하다.

---

## 10. 남은 일 / 아이디어

- [ ] `/etc/cron.d/reniv-vo` 등록 확인 (10분마다 `vo_snapshot.py` 실행되는지)
- [ ] 생산팀 Jeff 추가 시 회의실 좌석 6석으로 확장
- [ ] 재고 부족 상자 클릭 → 발주 화면으로 딥링크
- [ ] 모바일 터치 조작 다듬기 (현재 OrbitControls 기본값)
- [ ] 직원이 최근 한 일(feed)을 말풍선으로 띄우기 — `snap.feed` 를 이미 받아오고 있으나 미사용
