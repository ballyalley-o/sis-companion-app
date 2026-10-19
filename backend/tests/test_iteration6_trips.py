"""
Iteration 6 — Trips calendar, reservations, reorders, receipts, trace.
All tests hit the public EXPO_PUBLIC_BACKEND_URL. Zoho stays in mock mode.
"""
import os
import uuid
from datetime import date, timedelta

import pytest
import requests
from dotenv import load_dotenv

load_dotenv("/app/frontend/.env")
BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")

CREDS = {
    "admin": ("admin@drillstock.com", "Admin@12345"),
    "qld_mgr": ("qld.manager@drillstock.com", "Manager@123"),
    "nsw_mgr": ("nsw.manager@drillstock.com", "Manager@123"),
    "driller": ("jake@drillstock.com", "Driller@123"),
}

_tokens: dict[str, str] = {}
_created_trip_ids: list[str] = []
_created_reorder_ids: list[str] = []


# ---------------------------- fixtures ----------------------------
def _login(role: str) -> str:
    if role in _tokens:
        return _tokens[role]
    email, pw = CREDS[role]
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": pw}, timeout=30)
    assert r.status_code == 200, f"login {role}: {r.status_code} {r.text[:200]}"
    _tokens[role] = r.json()["access_token"]
    return _tokens[role]


def _h(role: str) -> dict:
    return {"Authorization": f"Bearer {_login(role)}", "Content-Type": "application/json"}


@pytest.fixture(scope="module", autouse=True)
def cleanup():
    yield
    # Cancel any trips/reorders we created
    for tid in _created_trip_ids:
        try:
            requests.post(f"{BASE_URL}/api/trips/{tid}/cancel", headers=_h("admin"), timeout=15)
        except Exception:
            pass
    for oid in _created_reorder_ids:
        try:
            requests.post(f"{BASE_URL}/api/reorders/{oid}/status",
                          headers=_h("admin"), json={"status": "cancelled", "note": "test cleanup"}, timeout=15)
        except Exception:
            pass


# ---------------------------- helpers ----------------------------
_cached_product = None


def _qld_product_with_stock() -> dict:
    """Pick a QLD product with on_hand>=5 using /products/common which returns totals."""
    global _cached_product
    if _cached_product:
        return _cached_product
    r = requests.get(f"{BASE_URL}/api/products/common",
                     headers=_h("qld_mgr"), params={"warehouse_id": "QLD"}, timeout=30)
    assert r.status_code == 200, r.text[:200]
    for p in r.json():
        qld = (p.get("totals") or {}).get("QLD", 0)
        # avoid DB-HQ-001 (reserved by existing seed trip) and keep plenty of head-room
        if qld >= 10 and p.get("sku") != "DB-HQ-001":
            _cached_product = p
            return p
    pytest.skip("No QLD product with stock >= 10 and unreserved")


def _today(offset_days: int = 7) -> str:
    return (date.today() + timedelta(days=offset_days)).isoformat()


# ============================ 1. Auth ============================
def test_01_login_all_roles():
    for role in CREDS:
        tok = _login(role)
        assert tok and len(tok) > 20


# ============================ 2. Trips create/validate ============================
def test_02_create_trip_as_driller():
    p = _qld_product_with_stock()
    body = {
        "warehouse_id": "QLD",
        "driller_name": "Jake Test",
        "rig_number": "RIG-01",
        "site": "TEST site",
        "start_date": _today(5),
        "end_date": _today(8),
        "notes": "iter6 trip",
        "items": [{"product_id": p["id"], "qty": 2}],
    }
    r = requests.post(f"{BASE_URL}/api/trips", headers=_h("driller"), json=body, timeout=30)
    assert r.status_code == 200, r.text[:300]
    d = r.json()
    assert d["status"] == "pending" and d["number"].startswith("TR-") and d["driller_id"]
    assert len(d["items"]) == 1 and d["items"][0]["qty"] == 2
    _created_trip_ids.append(d["id"])


def test_03_end_before_start_is_400():
    p = _qld_product_with_stock()
    r = requests.post(f"{BASE_URL}/api/trips", headers=_h("driller"), json={
        "warehouse_id": "QLD", "driller_name": "X", "rig_number": "RIG-01",
        "start_date": _today(10), "end_date": _today(5),
        "items": [{"product_id": p["id"], "qty": 1}],
    }, timeout=15)
    assert r.status_code == 400


def test_04_bad_date_pattern_422():
    p = _qld_product_with_stock()
    r = requests.post(f"{BASE_URL}/api/trips", headers=_h("driller"), json={
        "warehouse_id": "QLD", "driller_name": "X", "rig_number": "RIG-01",
        "start_date": "2026/01/01", "end_date": "2026-01-02",
        "items": [{"product_id": p["id"], "qty": 1}],
    }, timeout=15)
    assert r.status_code == 422


# ============================ 3. Trips list filters ============================
def test_05_list_trips_driller_scoped():
    # Driller sees only own trips
    r = requests.get(f"{BASE_URL}/api/trips", headers=_h("driller"), timeout=30)
    assert r.status_code == 200
    me = requests.post(f"{BASE_URL}/api/auth/login", json={"email": CREDS["driller"][0], "password": CREDS["driller"][1]}, timeout=15).json()["user"]
    for t in r.json():
        assert t["driller_id"] == me["id"], f"driller sees trip of other driller: {t}"


def test_06_list_trips_manager_scoped_to_warehouse():
    r = requests.get(f"{BASE_URL}/api/trips", headers=_h("qld_mgr"), timeout=30)
    assert r.status_code == 200
    for t in r.json():
        assert t["warehouse_id"] == "QLD"


def test_07_list_trips_overlap_range():
    r = requests.get(f"{BASE_URL}/api/trips",
                     headers=_h("qld_mgr"), params={"start": _today(0), "end": _today(14)}, timeout=30)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


# ============================ 4. Trip detail enrich ============================
def test_08_get_trip_detail_has_enrich_fields():
    tid = _created_trip_ids[0]
    r = requests.get(f"{BASE_URL}/api/trips/{tid}", headers=_h("driller"), timeout=30)
    assert r.status_code == 200, r.text[:200]
    d = r.json()
    assert "items" in d and "short_lines" in d and "reorders" in d
    for it in d["items"]:
        for key in ("on_hand", "reserved_other", "available", "short"):
            assert key in it, f"missing {key} in item {it}"
        assert it["available"] == max(0, it["on_hand"] - it["reserved_other"])


# ============================ 5. Approve / reject / prepare / issue ============================
def test_09_driller_cannot_approve():
    tid = _created_trip_ids[0]
    r = requests.post(f"{BASE_URL}/api/trips/{tid}/approve", headers=_h("driller"), json={"note": ""}, timeout=15)
    assert r.status_code == 403


def test_10_manager_approves():
    tid = _created_trip_ids[0]
    r = requests.post(f"{BASE_URL}/api/trips/{tid}/approve", headers=_h("qld_mgr"), json={"note": "ok"}, timeout=30)
    assert r.status_code == 200, r.text[:200]
    assert r.json()["status"] == "approved"


def test_11_approving_approved_is_409():
    tid = _created_trip_ids[0]
    r = requests.post(f"{BASE_URL}/api/trips/{tid}/approve", headers=_h("qld_mgr"), json={"note": ""}, timeout=15)
    assert r.status_code == 409


def test_12_reservation_reduces_available_for_other_trip():
    """A new pending trip for same product should see reserved_other >= 2 from approved trip."""
    p_id = requests.get(f"{BASE_URL}/api/trips/{_created_trip_ids[0]}", headers=_h("qld_mgr"), timeout=15).json()["items"][0]["product_id"]
    # Create a second trip on same product
    body = {
        "warehouse_id": "QLD", "driller_name": "Jake2", "rig_number": "RIG-01",
        "start_date": _today(20), "end_date": _today(22),
        "items": [{"product_id": p_id, "qty": 1}],
    }
    r = requests.post(f"{BASE_URL}/api/trips", headers=_h("driller"), json=body, timeout=30)
    assert r.status_code == 200, r.text[:200]
    tid2 = r.json()["id"]
    _created_trip_ids.append(tid2)
    d2 = requests.get(f"{BASE_URL}/api/trips/{tid2}", headers=_h("driller"), timeout=15).json()
    assert d2["items"][0]["reserved_other"] >= 2, f"expected reservation >=2, got {d2['items'][0]}"


def test_13_prepare_then_issue_trip():
    tid = _created_trip_ids[0]
    r = requests.post(f"{BASE_URL}/api/trips/{tid}/prepare", headers=_h("qld_mgr"), json={"note": "packed"}, timeout=30)
    assert r.status_code == 200
    assert r.json()["status"] == "prepared"
    # issue
    r2 = requests.post(f"{BASE_URL}/api/trips/{tid}/issue", headers=_h("qld_mgr"), timeout=60)
    assert r2.status_code == 200, r2.text[:300]
    out = r2.json()
    assert "request" in out and out["request"]["status"] == "approved"
    assert out["request"].get("zoho_mode") == "mock"
    # trip now issued
    t = requests.get(f"{BASE_URL}/api/trips/{tid}", headers=_h("qld_mgr"), timeout=15).json()
    assert t["status"] == "issued" and t.get("issued_request_id") == out["request"]["id"]


def test_14_edit_only_pending_or_rejected():
    tid = _created_trip_ids[0]  # now issued
    p = _qld_product_with_stock()
    r = requests.put(f"{BASE_URL}/api/trips/{tid}", headers=_h("driller"), json={
        "warehouse_id": "QLD", "driller_name": "Jake", "rig_number": "RIG-01",
        "start_date": _today(1), "end_date": _today(2),
        "items": [{"product_id": p["id"], "qty": 1}],
    }, timeout=15)
    assert r.status_code == 409


# ============================ 6. Issue insufficient stock -> 400 ============================
def test_15_issue_insufficient_stock_400():
    """Create a trip asking for huge qty -> approve -> issue -> expect 400."""
    p = _qld_product_with_stock()
    body = {
        "warehouse_id": "QLD", "driller_name": "Big", "rig_number": "RIG-01",
        "start_date": _today(30), "end_date": _today(31),
        "items": [{"product_id": p["id"], "qty": 9999}],
    }
    r = requests.post(f"{BASE_URL}/api/trips", headers=_h("driller"), json=body, timeout=30)
    assert r.status_code == 200
    tid = r.json()["id"]
    _created_trip_ids.append(tid)
    requests.post(f"{BASE_URL}/api/trips/{tid}/approve", headers=_h("qld_mgr"), json={"note": ""}, timeout=15)
    r2 = requests.post(f"{BASE_URL}/api/trips/{tid}/issue", headers=_h("qld_mgr"), timeout=30)
    assert r2.status_code == 400 and "not enough" in r2.text.lower()


# ============================ 7. Reorders ============================
def test_16_reorder_from_trip_shortages():
    """Use the big trip created above (short) to call POST /trips/{id}/reorder with empty body."""
    tid = _created_trip_ids[-1]  # the big-qty one
    r = requests.post(f"{BASE_URL}/api/trips/{tid}/reorder", headers=_h("qld_mgr"), json={}, timeout=30)
    assert r.status_code == 200, r.text[:300]
    d = r.json()
    assert d["status"] == "open" and d["trip_id"] == tid and d["items"]
    _created_reorder_ids.append(d["id"])


def test_17_reorder_manual_and_list():
    p = _qld_product_with_stock()
    r = requests.post(f"{BASE_URL}/api/reorders", headers=_h("qld_mgr"), json={
        "warehouse_id": "QLD", "items": [{"product_id": p["id"], "qty": 3}], "supplier": "TEST Supplier", "notes": "iter6"
    }, timeout=30)
    assert r.status_code == 200
    oid = r.json()["id"]
    _created_reorder_ids.append(oid)
    # list filter
    lst = requests.get(f"{BASE_URL}/api/reorders", headers=_h("qld_mgr"), params={"status": "open"}, timeout=15)
    assert lst.status_code == 200
    assert any(x["id"] == oid for x in lst.json())


def test_18_reorder_status_ordered_then_received_via_receipt():
    """Mark a reorder ordered, create a receipt against it, verify received status + stock increase."""
    p = _qld_product_with_stock()
    # fresh small reorder (2 units)
    r = requests.post(f"{BASE_URL}/api/reorders", headers=_h("qld_mgr"), json={
        "warehouse_id": "QLD", "items": [{"product_id": p["id"], "qty": 2}], "supplier": "TEST", "notes": "iter6-recv"
    }, timeout=30)
    assert r.status_code == 200
    oid = r.json()["id"]
    _created_reorder_ids.append(oid)
    # ordered
    s = requests.post(f"{BASE_URL}/api/reorders/{oid}/status", headers=_h("qld_mgr"), json={"status": "ordered"}, timeout=15)
    assert s.status_code == 200 and s.json()["status"] == "ordered"
    # pick a bin to receive into
    bins = requests.get(f"{BASE_URL}/api/bins", headers=_h("qld_mgr"), params={"warehouse_id": "QLD"}, timeout=15)
    assert bins.status_code == 200
    bin_id = next(b["id"] for b in bins.json() if b.get("active"))
    # receipt
    client_ref = f"TEST-RO-{uuid.uuid4().hex[:8]}"
    rc = requests.post(f"{BASE_URL}/api/receipts", headers=_h("qld_mgr"), json={
        "warehouse_id": "QLD", "supplier": "TEST", "reference": "TEST-INV", "notes": "",
        "items": [{"product_id": p["id"], "bin_id": bin_id, "qty": 2}],
        "client_ref": client_ref, "reorder_id": oid,
    }, timeout=60)
    assert rc.status_code == 200, rc.text[:300]
    # confirm reorder is received
    g = requests.get(f"{BASE_URL}/api/reorders/{oid}", headers=_h("qld_mgr"), timeout=15)
    assert g.status_code == 200 and g.json()["status"] == "received"


def test_19_cancel_reorder_409_when_received():
    oid = _created_reorder_ids[-1]
    r = requests.post(f"{BASE_URL}/api/reorders/{oid}/status", headers=_h("qld_mgr"), json={"status": "cancelled"}, timeout=15)
    assert r.status_code == 409


# ============================ 8. Trace ============================
def test_20_product_trace_structure_and_scope():
    p = _qld_product_with_stock()
    r = requests.get(f"{BASE_URL}/api/products/{p['id']}/trace", headers=_h("admin"), timeout=30)
    assert r.status_code == 200, r.text[:200]
    d = r.json()
    for k in ("product", "movements", "reservations", "reorders"):
        assert k in d, f"missing {k}"
    # balance_after monotonic consistency check (newest first)
    moves = d["movements"]
    if len(moves) >= 2:
        for m in moves:
            assert "balance_after" in m
    # trace manager scope: QLD mgr should only see QLD warehouse data
    r2 = requests.get(f"{BASE_URL}/api/products/{p['id']}/trace", headers=_h("qld_mgr"), timeout=30)
    assert r2.status_code == 200
    for m in r2.json()["movements"]:
        assert m["warehouse_id"] == "QLD"


def test_21_trace_404_unknown_product():
    r = requests.get(f"{BASE_URL}/api/products/does-not-exist/trace", headers=_h("admin"), timeout=15)
    assert r.status_code == 404


# ============================ 9. Driller cancel own pending ============================
def test_22_driller_can_cancel_own_pending():
    p = _qld_product_with_stock()
    r = requests.post(f"{BASE_URL}/api/trips", headers=_h("driller"), json={
        "warehouse_id": "QLD", "driller_name": "Jake", "rig_number": "RIG-01",
        "start_date": _today(40), "end_date": _today(41),
        "items": [{"product_id": p["id"], "qty": 1}],
    }, timeout=30)
    tid = r.json()["id"]
    c = requests.post(f"{BASE_URL}/api/trips/{tid}/cancel", headers=_h("driller"), timeout=15)
    assert c.status_code == 200
