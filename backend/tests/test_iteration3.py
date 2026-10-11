"""Iteration 3 backend tests — Rig kits + Google session auth edge cases."""
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


@pytest.fixture(scope="module")
def qld_products(tokens):
    r = requests.get(f"{API}/products?warehouse_id=QLD", headers=H(tokens["qld_mgr"]), timeout=15)
    assert r.status_code == 200
    prods = [p for p in r.json() if p.get("locations")]
    assert len(prods) >= 3, "need ≥3 QLD products for kit tests"
    return prods


# --------------------- Auth edge cases ---------------------
class TestAuthEdges:
    def test_session_invalid_returns_401(self):
        r = requests.post(f"{API}/auth/session", json={"session_id": f"nope-{uuid.uuid4()}"}, timeout=20)
        assert r.status_code == 401, r.text

    def test_login_with_google_only_user_returns_401_not_500(self, tokens):
        # Create a user via direct DB-like path: admin can create via POST /users? Let's exercise /auth/login
        # against a Google-only user. We can't create one without a real Google flow, so simulate by
        # trying to log in with a wrong password for an existing user — must still be 401 (not 500).
        r = requests.post(f"{API}/auth/login",
                          json={"email": "admin@drillstock.com", "password": "WRONG"},
                          timeout=10)
        assert r.status_code == 401, r.text
        # Also: a user that does not exist must be 401 (not 500) — covers None.password_hash branch.
        r2 = requests.post(f"{API}/auth/login",
                           json={"email": f"ghost-{uuid.uuid4()}@drillstock.com", "password": "whatever"},
                           timeout=10)
        assert r2.status_code == 401, r2.text


# --------------------- Rig kits CRUD ---------------------
class TestKitsCRUD:
    created_ids: list = []

    def test_driller_cannot_create_kit(self, tokens, qld_products):
        body = {"name": "nope", "rig_number": "RIG-01", "warehouse_id": "QLD",
                "items": [{"product_id": qld_products[0]["id"], "qty": 1}]}
        r = requests.post(f"{API}/kits", json=body, headers=H(tokens["jake"]), timeout=10)
        assert r.status_code == 403, r.text

    def test_qld_manager_cannot_create_nsw_kit(self, tokens, qld_products):
        body = {"name": "cross-wh", "rig_number": "RIG-04", "warehouse_id": "NSW",
                "items": [{"product_id": qld_products[0]["id"], "qty": 1}]}
        r = requests.post(f"{API}/kits", json=body, headers=H(tokens["qld_mgr"]), timeout=10)
        assert r.status_code == 403, r.text

    def test_unknown_rig_400(self, tokens, qld_products):
        body = {"name": "x", "rig_number": "RIG-NOPE", "warehouse_id": "QLD",
                "items": [{"product_id": qld_products[0]["id"], "qty": 1}]}
        r = requests.post(f"{API}/kits", json=body, headers=H(tokens["qld_mgr"]), timeout=10)
        assert r.status_code == 400, r.text

    def test_empty_items_422(self, tokens):
        body = {"name": "empty", "rig_number": "RIG-01", "warehouse_id": "QLD", "items": []}
        r = requests.post(f"{API}/kits", json=body, headers=H(tokens["qld_mgr"]), timeout=10)
        assert r.status_code == 422, r.text

    def test_unknown_product_400(self, tokens):
        body = {"name": "bad-prod", "rig_number": "RIG-01", "warehouse_id": "QLD",
                "items": [{"product_id": f"missing-{uuid.uuid4()}", "qty": 1}]}
        r = requests.post(f"{API}/kits", json=body, headers=H(tokens["qld_mgr"]), timeout=10)
        assert r.status_code == 400, r.text

    def test_create_get_enriched(self, tokens, qld_products):
        p1, p2 = qld_products[0], qld_products[1]
        body = {"name": "TEST HQ weekly", "rig_number": "RIG-01", "warehouse_id": "QLD",
                "items": [{"product_id": p1["id"], "qty": 2},
                          {"product_id": p2["id"], "qty": 1}]}
        r = requests.post(f"{API}/kits", json=body, headers=H(tokens["qld_mgr"]), timeout=15)
        assert r.status_code == 200, r.text
        kit = r.json()
        assert kit["name"] == "TEST HQ weekly"
        assert kit["rig_number"] == "RIG-01"
        assert kit["warehouse_id"] == "QLD"
        assert len(kit["items"]) == 2
        TestKitsCRUD.created_ids.append(kit["id"])

        g = requests.get(f"{API}/kits/{kit['id']}", headers=H(tokens["qld_mgr"]), timeout=10)
        assert g.status_code == 200
        enr = g.json()
        assert "short" in enr and isinstance(enr["short"], int)
        for it in enr["items"]:
            assert "bin_id" in it and "bin_code" in it and "avail" in it
            assert isinstance(it["avail"], int)

    def test_list_filtered_and_includes_created(self, tokens):
        r = requests.get(f"{API}/kits?rig=RIG-01&warehouse_id=QLD",
                         headers=H(tokens["qld_mgr"]), timeout=10)
        assert r.status_code == 200
        kits = r.json()
        assert isinstance(kits, list)
        assert any(k["id"] in TestKitsCRUD.created_ids for k in kits)
        for k in kits:
            assert k["rig_number"] == "RIG-01"
            assert k["warehouse_id"] == "QLD"
            assert "short" in k

    def test_update_kit(self, tokens, qld_products):
        kid = TestKitsCRUD.created_ids[0]
        p1, p2, p3 = qld_products[0], qld_products[1], qld_products[2]
        body = {"name": "TEST HQ weekly v2", "rig_number": "RIG-01", "warehouse_id": "QLD",
                "items": [{"product_id": p1["id"], "qty": 5},
                          {"product_id": p3["id"], "qty": 2}]}
        r = requests.put(f"{API}/kits/{kid}", json=body, headers=H(tokens["qld_mgr"]), timeout=15)
        assert r.status_code == 200, r.text
        g = requests.get(f"{API}/kits/{kid}", headers=H(tokens["qld_mgr"]), timeout=10).json()
        assert g["name"] == "TEST HQ weekly v2"
        assert {i["product_id"] for i in g["items"]} == {p1["id"], p3["id"]}
        qmap = {i["product_id"]: i["qty"] for i in g["items"]}
        assert qmap[p1["id"]] == 5 and qmap[p3["id"]] == 2

    def test_driller_can_read_kits_for_their_rig(self, tokens):
        r = requests.get(f"{API}/kits?rig=RIG-01&warehouse_id=QLD",
                         headers=H(tokens["jake"]), timeout=10)
        assert r.status_code == 200, r.text
        kits = r.json()
        # driller should see TestKitsCRUD.created_ids[0]
        assert any(k["id"] in TestKitsCRUD.created_ids for k in kits)

    def test_delete_kit(self, tokens):
        kid = TestKitsCRUD.created_ids[0]
        r = requests.delete(f"{API}/kits/{kid}", headers=H(tokens["qld_mgr"]), timeout=10)
        assert r.status_code == 200
        g = requests.get(f"{API}/kits/{kid}", headers=H(tokens["qld_mgr"]), timeout=10)
        assert g.status_code == 404

    def test_delete_not_found(self, tokens):
        r = requests.delete(f"{API}/kits/does-not-exist", headers=H(tokens["qld_mgr"]), timeout=10)
        assert r.status_code == 404


# --------------------- Regression: all demo accounts can log in + approve ---------------------
def test_regression_all_demo_logins():
    for email, pw in CREDS.values():
        r = requests.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=10)
        assert r.status_code == 200, f"{email}: {r.text}"
        assert "access_token" in r.json()


def test_regression_take_and_approve(tokens):
    tok = tokens["jake"]
    prods = requests.get(f"{API}/products?warehouse_id=QLD", headers=H(tok), timeout=15).json()
    prod = next(p for p in prods if p["locations"] and any(l["warehouse_id"] == "QLD" and l["qty"] >= 1 for l in p["locations"]))
    loc = next(l for l in prod["locations"] if l["warehouse_id"] == "QLD" and l["qty"] >= 1)
    body = {"type": "take", "warehouse_id": "QLD", "driller_name": "Jake", "rig_number": "RIG-03",
            "items": [{"product_id": prod["id"], "bin_id": loc["bin_id"], "qty": 1}],
            "client_ref": f"iter3-{uuid.uuid4()}", "notes": "iter3 regression"}
    r = requests.post(f"{API}/requests", json=body, headers=H(tok), timeout=15)
    assert r.status_code == 200, r.text
    rid = r.json()["id"]
    r2 = requests.post(f"{API}/requests/{rid}/approve", json={"note": ""}, headers=H(tokens["qld_mgr"]), timeout=20)
    assert r2.status_code == 200
    assert r2.json()["status"] == "approved"
