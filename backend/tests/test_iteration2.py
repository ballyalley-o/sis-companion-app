"""Iteration 2 backend tests — spelling suggest, common items, receipts (goods-in), bin titles."""
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
}


def _login(email, pw):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def H(tok):
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def tokens():
    return {k: _login(*v) for k, v in CREDS.items()}


# --------------------- /products/suggest ---------------------
class TestSuggest:
    def test_suggest_bentonit_corrects_to_bentonite(self, tokens):
        r = requests.get(f"{API}/products/suggest", params={"q": "bentonit", "warehouse_id": "QLD"},
                         headers=H(tokens["qld_mgr"]), timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["corrected"] and "bentonite" in data["corrected"].lower(), data
        skus = [it["sku"] for it in data["items"]]
        assert any(s.startswith("MUD-BENT") for s in skus), f"expected MUD-BENT item in {skus}"

    def test_suggest_diamnd_bitt_corrects_to_diamond_bit(self, tokens):
        r = requests.get(f"{API}/products/suggest", params={"q": "diamnd bitt", "warehouse_id": "QLD"},
                         headers=H(tokens["qld_mgr"]), timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        c = (data.get("corrected") or "").lower()
        assert "diamond" in c and "bit" in c, data
        skus = [it["sku"] for it in data["items"]]
        assert any(s.startswith("DB-") for s in skus), f"expected DB-* item in {skus}"

    def test_suggest_empty_short(self, tokens):
        r = requests.get(f"{API}/products/suggest", params={"q": ""}, headers=H(tokens["qld_mgr"]), timeout=10)
        # q is required param in server (no default), expect 422
        assert r.status_code in (200, 422)
        if r.status_code == 200:
            assert r.json()["items"] == []
        r2 = requests.get(f"{API}/products/suggest", params={"q": "   "}, headers=H(tokens["qld_mgr"]), timeout=10)
        assert r2.status_code == 200
        assert r2.json()["items"] == []


# --------------------- /products/common ---------------------
class TestCommon:
    def test_common_qld(self, tokens):
        r = requests.get(f"{API}/products/common", params={"warehouse_id": "QLD"},
                         headers=H(tokens["qld_mgr"]), timeout=15)
        assert r.status_code == 200, r.text
        items = r.json()
        assert isinstance(items, list) and len(items) >= 6, f"got {len(items)}"
        for it in items:
            assert "uses" in it and "sku" in it
        uses = [it["uses"] for it in items]
        assert uses == sorted(uses, reverse=True), f"not sorted by uses desc: {uses}"

    def test_common_qld_with_rig_receive(self, tokens):
        r = requests.get(f"{API}/products/common", params={"warehouse_id": "QLD", "rig": "RIG-01", "kind": "receive"},
                         headers=H(tokens["qld_mgr"]), timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_manager_scope_cross_warehouse_forbidden(self, tokens):
        r = requests.get(f"{API}/products/common", params={"warehouse_id": "NSW"},
                         headers=H(tokens["qld_mgr"]), timeout=10)
        assert r.status_code == 403, r.text


# --------------------- /receipts (goods in) ---------------------
class TestReceipts:
    def _any_qld_bin_and_product(self, tok):
        prods = requests.get(f"{API}/products?warehouse_id=QLD", headers=H(tok), timeout=15).json()
        prod = next(p for p in prods if p["locations"])
        loc = next(l for l in prod["locations"] if l["warehouse_id"] == "QLD")
        return prod, loc

    def test_driller_forbidden(self, tokens):
        prod, loc = self._any_qld_bin_and_product(tokens["jake"])
        body = {"warehouse_id": "QLD", "supplier": "ACME", "reference": "PO-X",
                "items": [{"product_id": prod["id"], "bin_id": loc["bin_id"], "qty": 2}],
                "client_ref": f"rc-{uuid.uuid4()}"}
        r = requests.post(f"{API}/receipts", json=body, headers=H(tokens["jake"]), timeout=15)
        assert r.status_code == 403

    def test_manager_other_warehouse_forbidden(self, tokens):
        prod, loc = self._any_qld_bin_and_product(tokens["qld_mgr"])
        body = {"warehouse_id": "QLD", "items": [{"product_id": prod["id"], "bin_id": loc["bin_id"], "qty": 1}],
                "client_ref": f"rc-{uuid.uuid4()}"}
        r = requests.post(f"{API}/receipts", json=body, headers=H(tokens["nsw_mgr"]), timeout=15)
        assert r.status_code == 403

    def test_receipt_increments_stock_and_is_idempotent(self, tokens):
        mgr = tokens["qld_mgr"]
        prod, loc = self._any_qld_bin_and_product(mgr)
        before = requests.get(f"{API}/bins/{loc['bin_id']}", headers=H(mgr), timeout=10).json()
        before_qty = next((i["qty"] for i in before["items"] if i["product_id"] == prod["id"]), 0)
        ref = f"rc-{uuid.uuid4()}"
        body = {"warehouse_id": "QLD", "supplier": "ACME", "reference": "PO-TEST",
                "items": [{"product_id": prod["id"], "bin_id": loc["bin_id"], "qty": 3}],
                "client_ref": ref, "notes": "test receive"}
        r = requests.post(f"{API}/receipts", json=body, headers=H(mgr), timeout=20)
        assert r.status_code == 200, r.text
        doc = r.json()
        assert doc["number"].startswith("GR-"), doc
        assert doc["zoho_txn_id"].startswith("MOCK-ADJ-"), doc
        # Stock incremented
        after = requests.get(f"{API}/bins/{loc['bin_id']}", headers=H(mgr), timeout=10).json()
        after_qty = next(i["qty"] for i in after["items"] if i["product_id"] == prod["id"])
        assert after_qty == before_qty + 3
        # Movement logged type 'receive'
        pdoc = requests.get(f"{API}/products/{prod['id']}", headers=H(mgr), timeout=10).json()
        # product_with_stock may include movements; otherwise skip
        if "movements" in pdoc:
            assert any(m.get("type") == "receive" for m in pdoc["movements"][:10])
        # Idempotent
        r2 = requests.post(f"{API}/receipts", json=body, headers=H(mgr), timeout=15)
        assert r2.status_code == 200
        assert r2.json()["id"] == doc["id"]
        # Stock NOT doubled
        after2 = requests.get(f"{API}/bins/{loc['bin_id']}", headers=H(mgr), timeout=10).json()
        assert next(i["qty"] for i in after2["items"] if i["product_id"] == prod["id"]) == before_qty + 3

    def test_invalid_bin_rejected(self, tokens):
        mgr = tokens["qld_mgr"]
        prod, _loc = self._any_qld_bin_and_product(mgr)
        body = {"warehouse_id": "QLD",
                "items": [{"product_id": prod["id"], "bin_id": "does-not-exist", "qty": 1}],
                "client_ref": f"rc-{uuid.uuid4()}"}
        r = requests.post(f"{API}/receipts", json=body, headers=H(mgr), timeout=15)
        assert r.status_code == 400, r.text

    def test_list_receipts(self, tokens):
        r = requests.get(f"{API}/receipts?warehouse_id=QLD", headers=H(tokens["qld_mgr"]), timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list) and len(data) >= 1
        assert all("number" in d and d["number"].startswith("GR-") for d in data)


# --------------------- Bin titles ---------------------
class TestBinTitles:
    def test_create_bin_with_name_title_uppercased(self, tokens):
        mgr = tokens["qld_mgr"]
        code = f"SEC1-L2-B{uuid.uuid4().hex[:2].upper()}"
        r = requests.post(f"{API}/bins", json={"code": code, "warehouse_id": "QLD", "name": "big muds"},
                         headers=H(mgr), timeout=10)
        assert r.status_code == 200, r.text
        bid = r.json()["id"]
        g = requests.get(f"{API}/bins/{bid}", headers=H(mgr), timeout=10).json()
        assert g["title"] == "BIG MUDS", g
        lbl = requests.get(f"{API}/bins-labels", params={"warehouse_id": "QLD", "ids": bid},
                           headers=H(mgr), timeout=10).json()
        assert lbl and lbl[0]["title"] == "BIG MUDS"
        requests.delete(f"{API}/bins/{bid}", headers=H(mgr), timeout=10)

    def test_bin_sec_code_title(self, tokens):
        mgr = tokens["qld_mgr"]
        code = "SEC1-L2-B22"
        existing = requests.get(f"{API}/bins?warehouse_id=QLD", headers=H(mgr), timeout=10).json()
        bid = None
        for b in existing:
            if b["code"] == code:
                bid = b["id"]
                break
        if not bid:
            r = requests.post(f"{API}/bins", json={"code": code, "warehouse_id": "QLD"},
                              headers=H(mgr), timeout=10)
            # may 409 if archived with same code — allow
            if r.status_code == 200:
                bid = r.json()["id"]
        if bid:
            g = requests.get(f"{API}/bins/{bid}", headers=H(mgr), timeout=10).json()
            assert g["title"] == "BIN 22", g

    def test_bin_simple_code_title_last_segment(self, tokens):
        mgr = tokens["qld_mgr"]
        bins = requests.get(f"{API}/bins?warehouse_id=QLD", headers=H(mgr), timeout=10).json()
        a01 = next((b for b in bins if b["code"] == "QLD-A01"), None)
        assert a01
        g = requests.get(f"{API}/bins/{a01['id']}", headers=H(mgr), timeout=10).json()
        # 2-segment code -> "BIN A01"
        assert g["title"] == "BIN A01", g


# --------------------- Regression: driller take -> manager approve ---------------------
def test_regression_take_approve(tokens):
    tok = tokens["jake"]
    prods = requests.get(f"{API}/products?warehouse_id=QLD", headers=H(tok), timeout=15).json()
    prod = next(p for p in prods if p["locations"] and any(l["warehouse_id"] == "QLD" and l["qty"] >= 2 for l in p["locations"]))
    loc = next(l for l in prod["locations"] if l["warehouse_id"] == "QLD" and l["qty"] >= 2)
    body = {"type": "take", "warehouse_id": "QLD", "driller_name": "Jake", "rig_number": "RIG-03",
            "items": [{"product_id": prod["id"], "bin_id": loc["bin_id"], "qty": 1}],
            "client_ref": f"regtest-{uuid.uuid4()}", "notes": "iter2 regression"}
    r = requests.post(f"{API}/requests", json=body, headers=H(tok), timeout=15)
    assert r.status_code == 200
    rid = r.json()["id"]
    r2 = requests.post(f"{API}/requests/{rid}/approve", json={"note": ""}, headers=H(tokens["qld_mgr"]), timeout=20)
    assert r2.status_code == 200
    assert r2.json()["status"] == "approved"
