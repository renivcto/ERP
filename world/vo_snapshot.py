# -*- coding: utf-8 -*-
"""르니브 3D 가상 오피스용 ERP 스냅샷 생성기

ERP 데이터를 읽어 3D 앱이 가볍게 쓸 수 있는 요약 문서
erp_data/vo_snapshot 를 만든다. (읽기 전용 계산 + 이 문서 하나만 쓰기)
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

WH_NAMES = {
    "wh_1782913612232_568": "르니브 본창고",
    "wh_1784554236594_573": "바로팜 창고",
    "wh_1782915176925_360": "쿠팡 창고",
}


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


def num(v):
    try:
        return float(re.sub(r"[^0-9.\-]", "", str(v or "")) or 0)
    except Exception:
        return 0.0


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

    # ── 재고 ─────────────────────────────────────────────
    whs, alerts = {}, []
    for it in items:
        if "완제품" not in str(it.get("type") or it.get("category") or "완제품"):
            continue
        code = str(it.get("code") or "")
        name = str(it.get("name") or "")
        ws = it.get("whStock") or {}
        total = int(num(it.get("stock")))
        sub = 0
        for wid, q in ws.items():
            q = int(num(q))
            sub += q
            wn = WH_NAMES.get(wid, wid[-3:] if len(wid) > 3 else wid)
            whs.setdefault(wn, [])
            whs[wn].append({"code": code, "name": name, "qty": q, "low": q <= LOW})
            if q <= LOW:
                alerts.append({"code": code, "name": name, "qty": q, "wh": wn})
        base = total - sub
        if base > 0:
            wn = "르니브 본창고"
            whs.setdefault(wn, [])
            whs[wn].append({"code": code, "name": name, "qty": base, "low": False})

    for k in whs:
        whs[k] = sorted(whs[k], key=lambda x: -x["qty"])[:8]

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
        "stockAlerts": sorted(alerts, key=lambda x: x["qty"])[:6],
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
    print("  채널 {} / 지역 {} / 창고 {}".format(
        len(snap["channels"]), len(snap["regions"]), len(snap["warehouses"])))
    print("  재고경고 {} / 결재대기 {} / 생산중 {}".format(
        len(snap["stockAlerts"]), snap["approvals"]["pending"], len(snap["productions"])))
    print("  약국 {}곳(재구매 {}) / 지급예정 이번달 {:,}원".format(
        snap["pharmacies"]["total"], snap["pharmacies"]["repeat"],
        snap["payments"]["month"]))
    if not snap["productions"]:
        print("  [참고] 생산중 항목 없음 — productions 필드명 확인 필요할 수 있음")
    if snap["payments"]["month"] == 0:
        print("  [참고] 지급예정 0원 — expenses 날짜/금액 필드명 확인 필요할 수 있음")


if __name__ == "__main__":
    main()
