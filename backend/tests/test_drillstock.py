"""DrillStock Pro backend tests — auth, role scoping, requests, counts,
equipment, uploads, bins/QR, Zoho mock, dashboard, notifications."""
import io
import os
import uuid

import pytest
import requests

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://drill-stockroom.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"

CREDS = {
    "admin": ("admin@drillstock.com", "Admin@12345"),
    "qld_mgr": ("qld.manager@drillstock.com", "Manager@123"),
    "nsw_mgr": ("nsw.manager@drillstock.com", "Manager@123"),
    "jake": ("jake@drillstock.com", "Driller@123"),
    "liam": ("liam@drillstock.com", "Driller@123"),
    "sam": ("sam@drillstock.com", "Driller@123"),
}


def _login(email, pw):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def H(tok):
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="session")
def tokens():
    return {k: _login(*v) for k, v in CREDS.items()}


# ---------------------------- auth
def test_login_bad_creds():
    r = requests.post(f"{API}/auth/login", json={"email": "admin@drillstock.com", "password": "wrong"}, timeout=10)
    assert r.status_code == 401


def test_me_all_roles(tokens):
    for role, tok in tokens.items():
        r = requests.get(f"{API}/auth/me", headers=H(tok), timeout=10)
        assert r.status_code == 200, (role, r.text)
        assert "email" in r.json() and "role" in r.json()


def test_me_unauth():
    assert requests.get(f"{API}/auth/me", timeout=10).status_code == 401


# ---------------------------- role scoping
def test_manager_qld_cannot_view_nsw_bins(tokens):
    r = requests.get(f"{API}/bins?warehouse_id=NSW", headers=H(tokens["qld_mgr"]), timeout=10)
    assert r.status_code == 403


def test_driller_cannot_approve(tokens):
    # pick any pending request first - create a new one so we always have an id
    tok = tokens["jake"]
    whs = requests.get(f"{API}/products?warehouse_id=QLD", headers=H(tok), timeout=15).json()
    prod = next(p for p in whs if p["locations"])
    loc = next(l for l in prod["locations"] if l["warehouse_id"] == "QLD" and l["qty"] > 0)
    body = {"type": "take", "warehouse_id": "QLD", "driller_name": "Jake Turner", "rig_number": "RIG-01",
            "items": [{"product_id": prod["id"], "bin_id": loc["bin_id"], "qty": 1}],
            "client_ref": f"test-{uuid.uuid4()}", "notes": "role-scope test"}
    r = requests.post(f"{API}/requests", json=body, headers=H(tok), timeout=15)
    assert r.status_code == 200
    rid = r.json()["id"]
    r2 = requests.post(f"{API}/requests/{rid}/approve", json={"note": ""}, headers=H(tok), timeout=15)
    assert r2.status_code == 403


def test_admin_only_users(tokens):
    assert requests.get(f"{API}/users", headers=H(tokens["qld_mgr"]), timeout=10).status_code == 403
    assert requests.get(f"{API}/users", headers=H(tokens["admin"]), timeout=10).status_code == 200


def test_admin_only_zoho_settings(tokens):
    assert requests.get(f"{API}/zoho/settings", headers=H(tokens["qld_mgr"]), timeout=10).status_code == 403
    assert requests.get(f"{API}/zoho/settings", headers=H(tokens["admin"]), timeout=10).status_code == 200


def test_manager_approve_other_warehouse_forbidden(tokens):
    # create a QLD request as jake, then try to approve as NSW manager
    tok = tokens["jake"]
    prods = requests.get(f"{API}/products?warehouse_id=QLD", headers=H(tok), timeout=15).json()
    prod = next(p for p in prods if p["locations"])
    loc = next(l for l in prod["locations"] if l["warehouse_id"] == "QLD" and l["qty"] > 0)
    body = {"type": "take", "warehouse_id": "QLD", "driller_name": "Jake", "rig_number": "RIG-01",
            "items": [{"product_id": prod["id"], "bin_id": loc["bin_id"], "qty": 1}],
            "client_ref": f"test-{uuid.uuid4()}", "notes": ""}
    rid = requests.post(f"{API}/requests", json=body, headers=H(tok), timeout=15).json()["id"]
    r = requests.post(f"{API}/requests/{rid}/approve", json={"note": ""}, headers=H(tokens["nsw_mgr"]), timeout=15)
    assert r.status_code == 403


# ---------------------------- stock request flow
@pytest.fixture
def qld_take_request(tokens):
    tok = tokens["jake"]
    prods = requests.get(f"{API}/products?warehouse_id=QLD", headers=H(tok), timeout=15).json()
    prod = next(p for p in prods if p["locations"] and any(l["warehouse_id"] == "QLD" and l["qty"] >= 2 for l in p["locations"]))
    loc = next(l for l in prod["locations"] if l["warehouse_id"] == "QLD" and l["qty"] >= 2)
    ref = f"test-{uuid.uuid4()}"
    body = {"type": "take", "warehouse_id": "QLD", "driller_name": "Jake Turner", "rig_number": "RIG-02",
            "items": [{"product_id": prod["id"], "bin_id": loc["bin_id"], "qty": 1}],
            "client_ref": ref, "notes": "fixture"}
    r = requests.post(f"{API}/requests", json=body, headers=H(tok), timeout=15)
    assert r.status_code == 200, r.text
    return {"id": r.json()["id"], "body": body, "product": prod, "loc": loc, "before_qty": loc["qty"], "ref": ref}


def test_request_idempotent(qld_take_request, tokens):
    """resubmit same client_ref -> same doc"""
    r = requests.post(f"{API}/requests", json=qld_take_request["body"], headers=H(tokens["jake"]), timeout=15)
    assert r.status_code == 200
    assert r.json()["id"] == qld_take_request["id"]


def test_take_more_than_bin_qty(tokens):
    tok = tokens["jake"]
    prods = requests.get(f"{API}/products?warehouse_id=QLD", headers=H(tok), timeout=15).json()
    prod = next(p for p in prods if p["locations"])
    loc = next(l for l in prod["locations"] if l["warehouse_id"] == "QLD")
    body = {"type": "take", "warehouse_id": "QLD", "driller_name": "Jake", "rig_number": "RIG-02",
            "items": [{"product_id": prod["id"], "bin_id": loc["bin_id"], "qty": loc["qty"] + 999}],
            "client_ref": f"test-{uuid.uuid4()}", "notes": ""}
    r = requests.post(f"{API}/requests", json=body, headers=H(tok), timeout=15)
    assert r.status_code == 400


def test_manager_approve_decrements_stock_and_notifies(qld_take_request, tokens):
    rid = qld_take_request["id"]
    pid = qld_take_request["product"]["id"]
    bid = qld_take_request["loc"]["bin_id"]
    r = requests.post(f"{API}/requests/{rid}/approve", json={"note": "ok"}, headers=H(tokens["qld_mgr"]), timeout=20)
    assert r.status_code == 200, r.text
    doc = r.json()
    assert doc["status"] == "approved"
    assert doc["zoho_txn_id"] and doc["zoho_txn_id"].startswith("MOCK-ADJ-")
    # verify stock decremented
    bin_doc = requests.get(f"{API}/bins/{bid}", headers=H(tokens["qld_mgr"]), timeout=10).json()
    new_qty = next((i["qty"] for i in bin_doc["items"] if i["product_id"] == pid), 0)
    assert new_qty == qld_take_request["loc"]["qty"] - 1
    # double approve -> 409
    r2 = requests.post(f"{API}/requests/{rid}/approve", json={"note": ""}, headers=H(tokens["qld_mgr"]), timeout=15)
    assert r2.status_code == 409
    # notification to driller
    notifs = requests.get(f"{API}/notifications", headers=H(tokens["jake"]), timeout=10).json()
    assert any(doc["number"] in (n.get("title") or "") for n in notifs)


def test_reject_and_cancel(tokens):
    tok = tokens["sam"]
    prods = requests.get(f"{API}/products?warehouse_id=QLD", headers=H(tok), timeout=15).json()
    prod = next(p for p in prods if p["locations"])
    loc = next(l for l in prod["locations"] if l["warehouse_id"] == "QLD" and l["qty"] > 0)
    # one for reject
    body1 = {"type": "take", "warehouse_id": "QLD", "driller_name": "Sam", "rig_number": "RIG-02",
             "items": [{"product_id": prod["id"], "bin_id": loc["bin_id"], "qty": 1}],
             "client_ref": f"test-{uuid.uuid4()}", "notes": ""}
    rid = requests.post(f"{API}/requests", json=body1, headers=H(tok), timeout=15).json()["id"]
    r = requests.post(f"{API}/requests/{rid}/reject", json={"note": "no"}, headers=H(tokens["qld_mgr"]), timeout=15)
    assert r.status_code == 200 and r.json()["status"] == "rejected"
    # another for cancel
    body2 = dict(body1, client_ref=f"test-{uuid.uuid4()}")
    rid2 = requests.post(f"{API}/requests", json=body2, headers=H(tok), timeout=15).json()["id"]
    rc = requests.post(f"{API}/requests/{rid2}/cancel", headers=H(tok), timeout=15)
    assert rc.status_code == 200


def test_return_increments_stock(tokens):
    tok = tokens["jake"]
    prods = requests.get(f"{API}/products?warehouse_id=QLD", headers=H(tok), timeout=15).json()
    prod = next(p for p in prods if p["locations"])
    loc = next(l for l in prod["locations"] if l["warehouse_id"] == "QLD")
    before = loc["qty"]
    body = {"type": "return", "warehouse_id": "QLD", "driller_name": "Jake", "rig_number": "RIG-02",
            "items": [{"product_id": prod["id"], "bin_id": loc["bin_id"], "qty": 2}],
            "client_ref": f"test-{uuid.uuid4()}", "notes": ""}
    rid = requests.post(f"{API}/requests", json=body, headers=H(tok), timeout=15).json()["id"]
    r = requests.post(f"{API}/requests/{rid}/approve", json={"note": ""}, headers=H(tokens["qld_mgr"]), timeout=20)
    assert r.status_code == 200
    bin_doc = requests.get(f"{API}/bins/{loc['bin_id']}", headers=H(tokens["qld_mgr"]), timeout=10).json()
    after = next(i["qty"] for i in bin_doc["items"] if i["product_id"] == prod["id"])
    assert after == before + 2


# ---------------------------- counts
def test_cycle_count_flow(tokens):
    mgr = tokens["qld_mgr"]
    bins = requests.get(f"{API}/bins?warehouse_id=QLD", headers=H(mgr), timeout=10).json()
    bin_ids = [b["id"] for b in bins[:1]]
    body = {"warehouse_id": "QLD", "type": "cycle", "bin_ids": bin_ids, "name": "TEST cycle"}
    r = requests.post(f"{API}/counts", json=body, headers=H(mgr), timeout=15)
    assert r.status_code == 200, r.text
    c = r.json()
    cid = c["id"]
    # try complete without counting -> 400
    r_bad = requests.post(f"{API}/counts/{cid}/complete", headers=H(mgr), timeout=15)
    assert r_bad.status_code == 400
    # record all lines with +1 to create variance
    for ln in c["lines"]:
        rr = requests.post(f"{API}/counts/{cid}/lines", json={"line_id": ln["id"], "counted": ln["expected"] + 1},
                           headers=H(mgr), timeout=10)
        assert rr.status_code == 200
    rc = requests.post(f"{API}/counts/{cid}/complete", headers=H(mgr), timeout=25)
    assert rc.status_code == 200, rc.text
    assert rc.json()["status"] == "completed"
    # discrepancies
    disc = requests.get(f"{API}/reports/discrepancies?warehouse_id=QLD", headers=H(mgr), timeout=10).json()
    assert any(d["count_id"] == cid for d in disc)


# ---------------------------- equipment
def test_equipment_overdue_seeded(tokens):
    r = requests.get(f"{API}/equipment?status=overdue", headers=H(tokens["qld_mgr"]), timeout=10)
    assert r.status_code == 200
    codes = [e["code"] for e in r.json()]
    assert "EQ-1003" in codes


def test_equipment_checkout_return_damaged(tokens):
    tok = tokens["jake"]
    eqs = requests.get(f"{API}/equipment?status=available&warehouse_id=QLD", headers=H(tok), timeout=10).json()
    assert eqs, "no available QLD equipment"
    eid = eqs[0]["id"]
    body = {"driller_name": "Jake", "rig_number": "RIG-01", "condition": "good", "notes": "test", "photos": []}
    r = requests.post(f"{API}/equipment/{eid}/checkout", json=body, headers=H(tok), timeout=15)
    assert r.status_code == 200
    # checkout again -> 409
    r2 = requests.post(f"{API}/equipment/{eid}/checkout", json=body, headers=H(tok), timeout=15)
    assert r2.status_code == 409
    # return damaged -> maintenance
    rr = requests.post(f"{API}/equipment/{eid}/return",
                      json={"condition": "damaged", "notes": "test", "photos": []}, headers=H(tok), timeout=15)
    assert rr.status_code == 200
    e = requests.get(f"{API}/equipment/{eid}", headers=H(tok), timeout=10).json()
    assert e["status"] == "maintenance"
    # mark available (manager)
    rm = requests.post(f"{API}/equipment/{eid}/available", headers=H(tokens["qld_mgr"]), timeout=10)
    assert rm.status_code == 200
    e2 = requests.get(f"{API}/equipment/{eid}", headers=H(tok), timeout=10).json()
    assert e2["status"] == "available"


# ---------------------------- bins / scan
def test_bin_lifecycle_and_qr(tokens):
    mgr = tokens["qld_mgr"]
    code = f"QLD-T{uuid.uuid4().hex[:4].upper()}"
    r = requests.post(f"{API}/bins", json={"code": code, "warehouse_id": "QLD", "zone": "Test", "description": "test"},
                     headers=H(mgr), timeout=10)
    assert r.status_code == 200
    bid = r.json()["id"]
    # labels
    lb = requests.get(f"{API}/bins-labels?warehouse_id=QLD&ids={bid}", headers=H(mgr), timeout=10)
    assert lb.status_code == 200 and lb.json()[0]["data_uri"].startswith("data:image/png")
    # archive empty -> ok
    da = requests.delete(f"{API}/bins/{bid}", headers=H(mgr), timeout=10)
    assert da.status_code == 200


def test_archive_bin_with_stock_fails(tokens):
    mgr = tokens["qld_mgr"]
    bins = requests.get(f"{API}/bins?warehouse_id=QLD", headers=H(mgr), timeout=10).json()
    non_empty = next((b for b in bins if b.get("sku_count", 0) > 0), None)
    assert non_empty, "need a non-empty bin"
    r = requests.delete(f"{API}/bins/{non_empty['id']}", headers=H(mgr), timeout=10)
    assert r.status_code == 400


def test_scan_resolves(tokens):
    tok = tokens["admin"]
    r1 = requests.get(f"{API}/scan/BIN:QLD-A01", headers=H(tok), timeout=10)
    assert r1.status_code == 200 and r1.json()["type"] == "bin"
    r2 = requests.get(f"{API}/scan/EQ-1001", headers=H(tok), timeout=10)
    assert r2.status_code == 200 and r2.json()["type"] == "equipment"
    r3 = requests.get(f"{API}/scan/NOSUCH", headers=H(tok), timeout=10)
    assert r3.status_code == 404


# ---------------------------- zoho
def test_zoho_settings_save_and_connect(tokens):
    tok = tokens["admin"]
    body = {"client_id": "cid-test", "client_secret": "", "organization_id": "org-1", "data_center": "com.au",
            "redirect_uri": "https://example/cb", "qld_warehouse_id": "ZWH-Q", "nsw_warehouse_id": "ZWH-N",
            "auto_sync": True}
    r = requests.put(f"{API}/zoho/settings", json=body, headers=H(tok), timeout=10)
    assert r.status_code == 200 and r.json()["organization_id"] == "org-1"
    rc = requests.post(f"{API}/zoho/connect", headers=H(tok), timeout=10)
    assert rc.status_code == 200
    j = rc.json()
    assert j["mode"] == "mock" and j["connected"] is True
    lg = requests.get(f"{API}/zoho/sync-log", headers=H(tok), timeout=10)
    assert lg.status_code == 200 and isinstance(lg.json(), list)


# ---------------------------- upload / files
def test_upload_and_get(tokens):
    tok = tokens["jake"]
    # tiny 1x1 PNG
    png = bytes.fromhex("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6300010000000500010d0a2db40000000049454e44ae426082")
    files = {"file": ("test.png", io.BytesIO(png), "image/png")}
    r = requests.post(f"{API}/upload", files=files, headers=H(tok), timeout=30)
    assert r.status_code == 200, r.text
    path = r.json()["path"]
    rg = requests.get(f"{API}/files/{path}?token={tok}", timeout=15)
    assert rg.status_code == 200
    assert rg.headers.get("content-type", "").startswith("image/")


# ---------------------------- dashboard + notifications
def test_dashboard(tokens):
    for role in ("admin", "qld_mgr", "jake"):
        r = requests.get(f"{API}/dashboard", headers=H(tokens[role]), timeout=15)
        assert r.status_code == 200, r.text
        assert "pending_requests" in r.json()


def test_notifications_unread_and_readall(tokens):
    tok = tokens["jake"]
    u1 = requests.get(f"{API}/notifications/unread-count", headers=H(tok), timeout=10)
    assert u1.status_code == 200
    r = requests.post(f"{API}/notifications/read-all", headers=H(tok), timeout=10)
    assert r.status_code == 200
    u2 = requests.get(f"{API}/notifications/unread-count", headers=H(tok), timeout=10).json()
    assert u2["count"] == 0


def test_low_stock(tokens):
    r = requests.get(f"{API}/reports/low-stock?warehouse_id=QLD", headers=H(tokens["qld_mgr"]), timeout=10)
    assert r.status_code == 200
    assert isinstance(r.json(), list)
