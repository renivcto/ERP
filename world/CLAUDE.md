# RENIV OFFICE — 3D 가상 오피스 (작업 인계 문서)

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
   ├─ index.html       ← 이 앱 (약 55KB)
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

표기명은 **RENIV OFFICE** 지만 **폴더명·URL·`vo_snapshot`·`VO_VERSION`·`__VO__` 는 `world`/`vo` 그대로**다.
(2026-08-15 개명. 경로까지 바꾸면 배포 URL 과 서버 cron 이 깨진다.)

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

### 3-2. 서버의 다른 동기화 스크립트 (2026-08-15 파악)

`/opt/vaultsync/` 에는 `vo_snapshot.py` 말고도 AI 직원용 스크립트가 같이 산다.

| 파일 | 하는 일 | 내려받는 곳 |
|---|---|---|
| `baro_sync.py` | 바로팜 주문 엑셀 다운로드 (IAN) | `/srv/reniv-orders` |
| `baro_clean.py` → `erp_write.py --apply` | 정제 후 ERP 입력 | `/srv/reniv-orders-clean`, `-full` |
| `vault_sync.py` | AI 학습 볼트(옵시디언) 동기화 | `/srv/reniv-brand` |
| `baro_check.py` · `baro_stock_alert.py` | 업로드 독촉 · 재고 경고 | — |
| `/home/ian/ian_render.py` | IAN 렌더 (계정 `ian` 으로 실행) | — |

cron 은 `/etc/cron.d/reniv-vo`(10분마다 vo_snapshot)와 바로팜 파이프라인(10분마다,
`flock` 로 중복 실행 방지) 두 갈래다. 로그는 전부 `/var/log/baro_sync.log`.

**⚠️ 드라이브 폴더는 반드시 ID로 지정할 것.** 원래 `ROOT_NAME` 으로 이름 **정확일치**
검색을 했는데(`name='바로팜'`), 드라이브에서 폴더 이름만 바꿔도 **에러 없이 조용히 멈춘다.**
2026-08-15 실제 사고: `바로팜`→`바로팜 주문수집`, `노트 for Obsidian`→`AI 학습시키기` 로
개명하자 두 스크립트가 동시에 중단됐고, 알림이 없어 며칠 뒤에나 알 뻔했다.
게다가 협력사 드라이브에 같은 이름의 폴더가 생기면 **엉뚱한 폴더를 읽을 수도** 있다
(실제로 같은 날 협력사 계정에 `바로팜` 폴더가 생겼다).

지금은 두 스크립트 모두 `ROOT_ID` 를 우선 쓴다:

```
ROOT_NAME = "바로팜"                                 # 폴백. 지우지 말 것
ROOT_ID   = "1uZev4_VtzL2F_VDf_QqZJ0McEbZ8-LZ3"     # 바로팜 주문수집
                                                     # 학습볼트는 1bU-PPvs4bg2AttbcjjcD-E6rfwEUu2nZ
def find_root(s):
    if ROOT_ID:
        return ROOT_ID        # 아래 기존 이름검색은 그대로 남아 있음
```

`find_root()` 는 폴더 **id 문자열**을 반환한다(`return fs[0]["id"]`). 백업본은
`*.py.bak` 로 같은 폴더에 있다. 수정 후엔 `venv/bin/python -m py_compile` 로 문법을 보고,
`flock -n /var/lock/reniv-baro.lock` 을 걸어 수동 1회 실행해 확인할 것.

### 3-3. 구글 드라이브는 로컬에 마운트돼 있다

작업 PC에 Google Drive for Desktop 이 `G:\` 로 붙어 있어서, 볼트 파일을 **직접 편집**할 수 있다.

```
G:\내 드라이브\르니브 드라이브\르니브 CREW\AI직원용 폴더\
├─ AI 학습시키기\      ← 옵시디언 볼트 (.obsidian, _scripts, 퍼포먼스 마케팅 전략 …)
└─ 바로팜 주문수집\    ← 바로팜_상품별_*.xlsx
```

Drive MCP 커넥터의 `update_file` 은 **제목·위치만** 바꾸고 본문은 못 고친다. 본문 수정은
이 G: 경로에서 파일로 직접 하면 되고, 구글 드라이브가 알아서 올려준다.
편집 전 원본을 스크래치패드에 복사해 둘 것.

---

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

부지는 **사무동**(x 4 중심)과 **창고동**(x -58)이 연결 통로로 이어진 형태다. (v2026-08-15m 개편)

| 구역 | 좌표 (x, z) | 크기 (w×d) | 보여주는 ERP 데이터 |
|---|---|---|---|
| 대표이사실 `ceo` | -26, -20 | 28×22 | 결재 대기 문서 더미, 지급예정 금고 |
| 디자인팀 `design` | 34, -20 | 28×22 | 생산 진행 이젤 (productions) |
| 국내영업팀 `sales` | -26, 20 | 28×22 | 지역별 매출 블록, 약국 수·재구매 |
| 마케팅팀 `marketing` | 34, 20 | 28×22 | 채널별 매출 블록 |
| 회의실 `meeting` | 4, 0 | 26×16 | AI 직원 4명 소집 (사무동 한가운데) |
| 창고 `warehouse` | -58, 0 | 18×48 | 창고 6칸 일렬 — 칸마다 창고명 + 재고 상자 |

**창고는 `WH` 상수가 좌표를 잡는다.**

```js
const WH = {
  x: -58,
  bayZ:  [-20, -12, -4, 4, 12, 20],
  names: ['르니브 창고', '르니브 본사', '쿠팡 창고',
          '바로팜 창고', '바이오코스텍 창고', '내추럴솔루션 창고'],
};
```

- **칸은 '자리'다.** `names` 순서로 6칸이 항상 존재하고, 데이터가 없어도 간판은 걸린다.
  스냅샷의 창고를 **이름으로 매칭**해 채운다(공백 무시). 순서에 의존하지 않는다.
- 매칭 안 된 창고는 화면에서 빠지고 콘솔에 `[창고] 칸에 매칭되지 않은 창고: [...]` 로 찍힌다.
  **이 경고가 보이면 `WH.names` 나 서버 `WH_NAMES` 중 하나가 틀린 것이다.**
- ERP 에 창고를 추가·개명하면 `WH.names` 도 같이 고쳐야 한다. (앱이 아는 유일한 하드코딩 목록)
- 간판: 통로 위 레일(`whRail`, y 11.3)에 이름판을 매단다. 칸을 가리지 않게 y 9.05 로 띄웠으니
  판을 키우거나 내리면 상자가 가려진다.
- 칸마다 명패(클릭 → 품목수·총수량·부족수), 그 앞에 재고 상자 최대 3개.

**재고 상자에 품목 이미지 입히기** — `crate()` 가 맨 위 상자를 반환하고, `faceCrate(mesh, src)` 가
`+x`(통로 쪽) 면에만 텍스처를 씌운다. 이미지 출처는 두 가지다.

1. `it.img` — 스냅샷이 이미지 URL 을 실어주면 바로 사용 (권장, 가볍다)
2. `it.id` — 품목 id 가 있으면 `itemImages/item_{id}` 를 직접 읽는다.
   ERP 는 품목 이미지를 이 컬렉션에 **base64** 로 넣는다(`data` 필드).
   무거워서 화면당 `IMG_MAX`(12)개까지만 읽고 캐시한다.
   **vo_snapshot 외 컬렉션을 읽는 유일한 예외**다 (§3-1 원칙의 의도적 예외).

⚠️ **지금은 스냅샷에 `id` 도 `img` 도 없어서 상자에 이미지가 안 붙는다.** 서버
`vo_snapshot.py` 의 재고 수집부에서 항목에 품목 id 를 추가해야 동작한다.

```python
whs[wn].append({"code": code, "name": name, "qty": q, "low": q <= LOW,
                "id": str(it.get("id") or "")})     # ← 이 한 줄
```
- **재고 상자 라벨은 품목코드가 아니라 품목명**(`it.name`)이다. 코드는 클릭 패널에만 보인다.
- 방·소품 좌표는 `ZONES` 를 따라가지 않고 **하드코딩**돼 있다(`makeShelf(-36.5, -26.5, 0)` 등).
  `ZONES` 를 옮기면 소품·`renderData` 안의 오브젝트 위치도 같이 손봐야 한다. 책상·의자·직원은
  `EMP.forEach` 가 `ZONES` 에서 계산하므로 자동으로 따라온다.

⚠️ **서버 `vo_snapshot.py` 의 `WH_NAMES` 에는 창고 ID가 3개만 등록돼 있다**
(`르니브 본창고`·`바로팜 창고`·`쿠팡 창고`). ERP 창고는 6개(르니브 창고, 쿠팡 창고,
바이오코스텍 창고, 르니브 본사, 내추럴솔루션 창고, 바로팜 창고)이므로, 나머지는
`wid[-3:]` 폴백 때문에 `568` 같은 조각으로 표시된다. 6칸을 제대로 채우려면 서버의
`WH_NAMES` 에 나머지 창고 ID를 추가해야 한다.

상단 전광판 = 이번 달 매출 / 오늘 매출 / 주문 건수.
좌하단 KPI 칩, 우하단 재고 경고.

---

## 4-1. 방 구조 — 좌우 대칭 + 가운데 복도 (2026-08-15h)

네 방은 **가운데 복도(z ≈ 0~4)를 향해 열려 있다.** 북쪽 두 방(ceo·design)은 +z 쪽이,
남쪽 두 방(sales·marketing)은 -z 쪽이 출입구다. 코드에서는 `sg = z.z > 0 ? -1 : 1` 하나로
책상·직원·의자·카메라·이름표 위치를 전부 뒤집는다. **한쪽만 고치면 대칭이 깨진다.**

- `makeRoom(zone, {flip, backH, sideH, window})` — `flip:true` 면 뒷벽이 +z 쪽.
  기본 뒷벽 5.2 / 옆 칸막이 3.0 높이. 창문(유리+창틀+창살+창턱)은 뒷벽에만 붙는다.
- 직원은 항상 **출입구(= 방 카메라) 쪽을 본다.** 책상은 직원과 카메라 사이,
  직원은 모니터에 얼굴이 가리지 않게 `x + 1.7` 만큼 옆으로 비켜 서 있다.
- 회의 소집 시 이동 경로: 방 출입구(`doorZ`) → 복도(`CORR = 3.2`) → 좌석.
  `ch.queue` 에 웨이포인트를 넣고 `tick()` 이 하나씩 소비한다.
  **직선으로 보내면 벽을 뚫고 지나간다.** 좌석·책상 위치를 옮기면 이 경로도 같이 확인할 것.

## 4-2. 가구 (장식)

`makeShelf` `makeSofa` `makeLowTable` `makeWhiteboard` `makeCabinet` `makeWaterCooler`
`makeCoffee` `makePrinter` `makeClock` — 전부 `(x, z, ...)` 를 받고 `scene` 에 바로 붙는다.
ERP 데이터와 무관한 **장식**이므로 `dataGroup` 에 넣지 말 것 (새로고침 때 지워진다).

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

## 5-1. 색감 규칙 (2026-08-15f 갱신)

전체를 **밝은 파스텔 톤**으로 맞춰 뒀다. 색을 만질 때 지킬 것:

- 색은 `const P = {...}` 팔레트에 모아 두고, 개별 오브젝트에 새 hex를 흩뿌리지 말 것.
- **밝게 = 흰색을 섞는 게 아니다. 명도(L)를 올리되 채도(S)는 오히려 높게 잡는 것.**
  "채도를 낮추고 명도를 올린다"로 가면 물빠진 화면이 된다 — v2026-08-15d 가 실제로 그랬다.
  **L 이 0.88 을 넘으면 S 를 아무리 올려도 화면에선 그냥 흰색으로 보인다.**
  큰 면일수록 S 를 올리기 전에 L 을 먼저 내릴 것.
  기준값(v2026-08-15f): 큰 면(바닥·러그·잔디) `L 0.74~0.91 / S 0.60~0.75`,
  가구·상자 `L 0.55~0.68 / S 0.66~0.86`, 강조색(셔츠·데이터 막대) `L 0.60~0.70 / S 0.74~0.86`.
  그래도 전부 흰색에 가깝게 만들면 창고처럼 물건이 바닥에 묻혀 안 보인다 (한 번 그렇게 됐다).
- **색을 일괄 조정할 때 hex 를 손으로 찍지 말 것.** `hue 는 그대로 두고 S·L 만 카테고리
  기준값으로 정규화`하는 파이썬 스크립트를 쓴다 (`colorsys.rgb_to_hls` → 목표 S/L →
  `hls_to_rgb`). 40개 색을 일관되게 맞출 수 있고, 매칭 0건으로 빠뜨린 색이 잡힌다.
  실제로 이 방식으로 '재고 부족 상자'만 혼자 물빠져 있던 걸 발견했다.
- 바닥·러그와 그 위에 놓이는 물건은 **색상(hue)으로 구분**한다. 명암 차이로만 구분하면 파스텔에서 무너진다.
  예) 크림색 바닥(`#F8F1E5`) 위의 재고 상자는 살구색(`#F0B876`).
- 조명 기준값: `AmbientLight 1.34` / `HemisphereLight 1.02` / `DirectionalLight 0.72`.
- **팔레트만 밝혀도 화면은 안 밝아진다 — 조명 배율을 먼저 확인할 것.**
  three r161 은 `useLegacyLights:false`(새 조명 모델)라 같은 intensity 라도 예전보다 약하게 들어간다.
  1.08/0.85/0.78 이던 시절엔 위를 향한 면이 기준색의 **0.85 배**로 렌더돼, 팔레트를 아무리
  밝게 잡아도 화면에선 한 단계 눌렸다. 지금 값에서 **0.92~0.95 배**다.
  측정법: 캔버스를 2D 컨텍스트에 `drawImage` 한 뒤 `getImageData` 로 바닥·잔디 픽셀을 뽑아
  기준 hex 와 나눠 본다. 감으로 고치지 말 것.
  환경광을 더 올릴 때는 직사광(`sun`)을 같이 낮춰야 입체감이 남는다.
- 캐릭터 머리·바지는 순검정(`#1F1F28` 등)을 쓰지 않는다. 차콜(`#3A3A48`)까지만.
- 전광판·모니터는 예외로 어두워도 된다. 흰 글씨가 올라가는 화면이라 대비가 필요하다.
  단 **배경과 글씨를 같이 밝히면 대비가 죽는다.** 밝게 만들고 싶으면 배경은 그대로 두고
  글씨 쪽을 흰색에 가깝게 올릴 것. (현재 배경 `#4A7391`, 본문 흰색, 보조 `#EAF4FA`)

---

## 6. 글씨(라벨) 처리 — 여기가 제일 자주 깨진다

글씨는 **CanvasTexture 스프라이트가 아니라 `CSS2DObject`(HTML div)** 로 그린다.
캔버스 텍스처를 쓰면 저해상도에서 글씨가 뭉개져서 바꾼 것이다. 되돌리지 말 것.

```js
label('창고', { cls:'zone' })   // → CSS2DObject, div.tg.zone
```

- 클래스: `.tg` 기본 / `.zone` 방 이름 / `.name` 직원 이름표 / `.small` 데이터 수치 /
  `.scr` 모니터 화면 / `.bubble` 회의 말풍선 / `.warnc` 재고 부족(빨강)
- **크기·색은 반드시 `cls` 로 지정한다.** 여러 개는 공백으로 (`cls:'small warnc'`).
  예전엔 `{ size, scale }` 로 클래스를 자동 판단하는 폴백과, `color:'#C4364F'` 를 주면
  `warnc` 가 붙는 매직 컬러 분기가 있었으나 **v2026-08-15c 에서 둘 다 제거**했다.
  `cls` 를 빼면 기본 `.tg` 만 붙는다. `color` 는 클래스에 없는 커스텀 색에만 쓴다.
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
7. **캐릭터 부위 구조**: `ch.g`(전체) → `legL/legR`(신발 포함) + `ch.upper`(몸통·어깨·목·팔·머리·액세서리) + `tag`.
   호흡·걷기 반동은 `ch.upper.position.y` 로 준다. `ch.g.position.y` 는 착석(0.46)에만 쓴다.
   손은 팔 메시의 자식, 신발은 다리 메시의 자식이라 회전을 따라간다.
   눈 깜빡임은 얼굴 텍스처 두 벌(`ch.texOpen` / `ch.texBlink`)을 `ch.faceMat.map` 으로 갈아 끼운다.
8. **패치 스크립트는 전부 성공한 뒤에 저장할 것.** 문자열을 하나씩 replace 하다가 중간에
   실패하면 앞의 변경은 메모리에만 남고 파일은 안 바뀐 채 끝난다. 이 상태에서 다음 스크립트를
   돌리면 파일이 어긋난다 (실제로 한 번 깨졌다). → 모든 패턴 존재를 먼저 확인 → replace → 마지막에 한 번만 쓴다.
9. **⚠️ 같은 파일을 코워크와 클로드코드에서 동시에 고치지 말 것.**
   2026-08-15 에 실제로 갈라졌다. 양쪽이 각자 `a→g` 로 버전을 올려서 **같은 `VO_VERSION` 이
   서로 다른 코드**를 가리켰다. 되살릴 때는 공통조상을 기준으로 `git merge-file` 로 3-way 병합하고,
   **구조·좌표는 한쪽 / 색·이름은 다른 한쪽** 식으로 규칙을 정해 충돌을 풀 것.
   앞으로는 한 파일을 한 곳에서만 고치고, 끝나면 바로 커밋·푸시해서 다른 쪽이 pull 하게 한다.

---

## 8-1. 배포 반영 확인 (버전 상수)

`world/index.html` 맨 위에 `VO_VERSION` 상수가 있다.

```js
const VO_VERSION = 'v2026-08-15a';   // 코드를 고칠 때마다 올릴 것
```

- 상단바 오른쪽 시각 옆에 같이 표시되고, 브라우저 콘솔에도 `[RENIV OFFICE] v...` 로 찍힌다.
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
