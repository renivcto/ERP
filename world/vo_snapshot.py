# -*- coding: utf-8 -*-
"""르니브 3D 가상 오피스용 ERP 스냅샷 생성기

ERP 데이터를 읽어 3D 앱이 가볍게 쓸 수 있는 요약 문서
erp_data/vo_snapshot 를 만든다. (읽기 전용 계산 + 이 문서 하나만 쓰기)

v2 (2026-08-15)
  - 창고 이름 하드코딩(WH_NAMES) 제거. shared/warehouse_list 를 읽어 id→이름 자동 매핑.
    ERP 에서 창고를 추가·개명해도 따라간다.
  - 미배정 잔여를 '르니브 본창고'라는 없는 이름으로 만들지 않고, ERP 와 똑같이
    품목의 defaultWh(기본 창고)에 귀속시킨다. 기본 창고가 없으면 어느 칸에도 안 넣는다.
  - 완제품만 담던 필터 제거 → 부자재·원자재도 창고에 표시(3D 창고를 실제처럼).
    단 stockAlerts(재고 경고)는 종전대로 완제품만.
  - 품목 id 를 함께 실어 3D 앱이 itemImages/item_{id} 에서 제품 이미지를 붙일 수 있게 함.
"""
import datetime
import json
import re
import sys
from zoneinfo import ZoneInfo

from google.cloud import firestore
from google.oauth2 import service_account

KEY = "/etc/reniv/erp-writer-key.json"
PID = "reniv-erp-135a3"
KST = ZoneInfo("Asia/Seoul")
LOW = 20
PER_WH = 8          # 창고당 스냅샷에 담을 품목 수 (3D 는 선반 6자리까지 표시)


def db():
    cred = service_account.Credentials.from_service_account_file(KEY)
    return firestore.Client(project=PID, credentials=cred)


def load(c, name):
    try:
        d = (c.collection("erp_data").document(name).get().to_dict() or {}).get("data")
    except Exception:
        return []
    if isinstance(d, str):
        try:
            return json.loads(d)
        except Exception:
            return []
    return d if isinstance(d, list) else (d or [])


def load_shared(c, key):
    """shared/<key> 문서. saveSharedSetting 이 {value: "<JSON 문자열>"} 로 저장한다."""
    try:
        d = c.collection("shared").document(key).get().to_dict() or {}
    except Exception as e:
        print("  [경고] shared/{} 읽기 실패: {}".format(key, e))
        return None
    v = d.get("value")
    if isinstance(v, str):
        try:
            return json.loads(v)
        except Exception:
            return None
    return v


def num(v):
    try:
        return float(re.sub(r"[^0-9.\-]", "", str(v or "")) or 0)
    except Exception:
        return 0.0


def qfmt(v):
    """수량: 정수면 int, 아니면 소수 4자리 (원자재 kg 대응)."""
    v = round(float(v), 4)
    return int(v) if abs(v - int(v)) < 1e-9 else v


def base_no(no):
    s = str(no or "").strip()
    m = re.match(r"^(.*-\d{4,})-\d{1,2}$", s)
    return m.group(1) if m else s


def all_orders(c):
    rows = list(load(c, "shopOrders"))
    for i in range(1, 8):
        rows += load(c, "shopOrders_arch{}".format(i))
    return [r for r in rows if isinstance(r, dict)]


def top(d, n=6):
    return sorted(d.items(), key=lambda kv: -kv[1]["rev"])[:n]


def is_final(it):
    """완제품 여부. type/category 가 비어 있으면 종전 동작대로 완제품 취급."""
    t = str(it.get("type") or it.get("category") or "")
    return ("완제품" in t) or (t == "")


def wh_effective(it, wh_ids):
    """ERP _itemWhEffective 와 동일: 배정(whStock) + 미배정 잔여를 defaultWh 에 귀속.
    기본 창고가 없으면 잔여는 버린다(물리적 칸이 없는 재고이므로 3D 에 자리가 없다)."""
    raw = it.get("whStock") or {}
    eff = {}
    if isinstance(raw, dict):
        for wid, q in raw.items():
            if str(wid) in wh_ids:
                q = round(num(q), 4)
                if q != 0:
                    eff[str(wid)] = eff.get(str(wid), 0) + q
    stock = round(num(it.get("stock")), 4)
    remainder = round(stock - sum(eff.values()), 4)
    if remainder != 0:
        dw = str(it.get("defaultWh") or "")
        if dw in wh_ids:
            eff[dw] = round(eff.get(dw, 0) + remainder, 4)
            if eff[dw] == 0:
                del eff[dw]
    return eff


def main():
    c = db()
    now = datetime.datetime.now(KST)
    today = now.strftime("%Y-%m-%d")
    ym = now.strftime("%Y-%m")

    orders = all_orders(c)
    items = [i for i in load(c, "items") if isinstance(i, dict)]

    # ── 매출 ─────────────────────────────────────────────
    t_rev = m_rev = 0.0
    m_nos, ch, reg, ph_days = set(), {}, {}, {}
    for o in orders:
        od = str(o.get("orderDate") or "")[:10]
        amt = num(o.get("paymentAmount") or o.get("totalPrice"))
        if od == today:
            t_rev += amt
        if od[:7] != ym:
            continue
        m_rev += amt
        m_nos.add(base_no(o.get("orderNo") or o.get("id")))
        s = str(o.get("shopName") or "미분류")
        ch.setdefault(s, {"rev": 0.0, "cnt": 0})
        ch[s]["rev"] += amt
        ch[s]["cnt"] += 1
        if str(o.get("source") or "") == "baropharm":
            a = " ".join(str(o.get("address") or "").split()[:2]) or "미상"
            reg.setdefault(a, {"rev": 0.0, "cnt": 0})
            reg[a]["rev"] += amt
            reg[a]["cnt"] += 1
            nm = str(o.get("customerName") or "").strip()
            if nm:
                ph_days.setdefault(nm, set()).add(od)

    m_cnt = len(m_nos)

    # ── 창고 마스터 (shared/warehouse_list) ───────────────
    wh_list = load_shared(c, "warehouse_list") or []
    wh_name = {}
    for w in wh_list:
        if isinstance(w, dict) and w.get("id"):
            wh_name[str(w["id"])] = str(w.get("name") or w["id"])
    if not wh_name:
        print("  [경고] shared/warehouse_list 가 비어 있음 — 창고 배치를 만들 수 없습니다")
    wh_ids = set(wh_name.keys())

    # ── 재고 (완제품 + 부자재 + 원자재) ───────────────────
    whs, alerts = {}, []
    for it in items:
        code = str(it.get("code") or "")
        name = str(it.get("name") or "")
        iid = str(it.get("id") or "")
        final = is_final(it)
        for wid, q in wh_effective(it, wh_ids).items():
            if q <= 0:
                continue
            wn = wh_name[wid]
            whs.setdefault(wn, [])
            whs[wn].append({"code": code, "name": name, "id": iid,
                            "qty": qfmt(q), "low": q <= LOW})
            if final and q <= LOW:
                alerts.append({"code": code, "name": name, "qty": qfmt(q), "wh": wn})

    for k in whs:
        whs[k] = sorted(whs[k], key=lambda x: -float(x["qty"]))[:PER_WH]

    # ── 결재 / 생산 / 지급 ────────────────────────────────
    apv = [a for a in load(c, "approvals") if isinstance(a, dict)]
    pend = [a for a in apv
            if str(a.get("status") or "") != "approved"
            and str(a.get("type") or "") != "po_approval"]

    prods = [p for p in load(c, "productions") if isinstance(p, dict)]
    running = [{"name": str(p.get("itemName") or p.get("name") or p.get("productName") or "-"),
                "qty": int(num(p.get("qty") or p.get("quantity"))),
                "status": str(p.get("status") or "")}
               for p in prods if "생산" in str(p.get("status") or "")][:6]

    exp = [e for e in load(c, "expenses") if isinstance(e, dict)]
    pay_t = pay_m = pay_o = 0.0
    ct = cm = co = 0
    for e in exp:
        if str(e.get("status") or "") in ("paid", "지급완료"):
            continue
        d = ""
        for k in ("dueDate", "payDate", "scheduledDate", "date", "expectedDate"):
            if e.get(k):
                d = str(e.get(k))[:10]
                break
        a = num(e.get("amount") or e.get("total") or e.get("price"))
        if not d or a <= 0:
            continue
        if d == today:
            pay_t += a
            ct += 1
        if d[:7] == ym:
            pay_m += a
            cm += 1
        if d < today:
            pay_o += a
            co += 1

    feed = [{"title": str(f.get("title") or "")[:40],
             "cat": str(f.get("category") or f.get("cat") or ""),
             "date": str(f.get("createdAt") or f.get("date") or "")[:10]}
            for f in load(c, "feedPosts") if isinstance(f, dict)][-5:]

    snap = {
        "ts": int(now.timestamp() * 1000),
        "stamp": now.strftime("%Y-%m-%d %H:%M"),
        "kpi": {
            "todayRevenue": int(t_rev),
            "monthRevenue": int(m_rev),
            "monthOrders": m_cnt,
            "aov": int(m_rev / m_cnt) if m_cnt else 0,
        },
        "channels": [{"name": k, "rev": int(v["rev"]), "cnt": v["cnt"]} for k, v in top(ch)],
        "regions": [{"name": k, "rev": int(v["rev"]), "cnt": v["cnt"]} for k, v in top(reg)],
        "warehouses": [{"name": k, "items": v} for k, v in sorted(whs.items())],
        "stockAlerts": sorted(alerts, key=lambda x: float(x["qty"]))[:6],
        "approvals": {"pending": len(pend)},
        "productions": running,
        "payments": {"today": int(pay_t), "todayCnt": ct,
                     "month": int(pay_m), "monthCnt": cm,
                     "over": int(pay_o), "overCnt": co},
        "pharmacies": {"total": len(ph_days),
                       "repeat": sum(1 for v in ph_days.values() if len(v) >= 2)},
        "feed": feed,
        "employees": [
            {"id": "tim", "name": "Tim", "team": "비서", "room": "ceo"},
            {"id": "ian", "name": "IAN", "team": "국내영업팀", "room": "sales"},
            {"id": "greg", "name": "Greg", "team": "마케팅팀", "room": "marketing"},
            {"id": "jony", "name": "Jony", "team": "디자인팀", "room": "design"},
        ],
    }

    c.collection("erp_data").document("vo_snapshot").set(
        {"data": json.dumps(snap, ensure_ascii=False), "ts": snap["ts"]})

    print("스냅샷 저장 완료 —", snap["stamp"])
    print("  이번달 매출 {:,}원 / 주문 {}건".format(snap["kpi"]["monthRevenue"],
                                              snap["kpi"]["monthOrders"]))
    print("  채널 {} / 지역 {}".format(len(snap["channels"]), len(snap["regions"])))
    print("  창고 마스터 {}개 등록".format(len(wh_name)))
    for w in snap["warehouses"]:
        n_img = sum(1 for x in w["items"] if x["id"])
        print("    - {:<16} 품목 {}종 (id 있는 것 {})".format(w["name"], len(w["items"]), n_img))
    print("  재고경고 {} / 결재대기 {} / 생산중 {}".format(
        len(snap["stockAlerts"]), snap["approvals"]["pending"], len(snap["productions"])))
    print("  약국 {}곳(재구매 {}) / 지급예정 이번달 {:,}원".format(
        snap["pharmacies"]["total"], snap["pharmacies"]["repeat"],
        snap["payments"]["month"]))
    if not snap["warehouses"]:
        print("  [참고] 창고가 하나도 없음 — shared/warehouse_list 또는 품목 whStock 확인 필요")
    if not snap["productions"]:
        print("  [참고] 생산중 항목 없음 — productions 필드명 확인 필요할 수 있음")
    if snap["payments"]["month"] == 0:
        print("  [참고] 지급예정 0원 — expenses 날짜/금액 필드명 확인 필요할 수 있음")


if __name__ == "__main__":
    main()
