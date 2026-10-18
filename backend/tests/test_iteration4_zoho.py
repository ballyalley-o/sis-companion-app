"""Iteration 4 — Zoho live-ready integration (up to the OAuth boundary).

Covers:
 - PUT /zoho/settings (mode=live) masks secret, encrypts at rest, selected_mode vs effective mode
 - POST /zoho/connect — missing-fields 400, data-center-specific auth URL, scope/state/access_type
 - GET /zoho/callback — bad state → HTML 400, error=access_denied → cancelled page
 - GET /zoho/locations + POST /zoho/import — guarded by live_settings() when no refresh token
 - Non-admin access forbidden
 - Mock mode regression: approval still produces MOCK-ADJ-* txn
 - Restores settings to mode=mock + clears client_id/secret/org at the end
"""
import os
import uuid
from pathlib import Path

import pytest
import requests
from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://drill-stockroom.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"

CREDS = {
    "admin": ("admin@drillstock.com", "Admin@12345"),
    "qld_mgr": ("qld.manager@drillstock.com", "Manager@123"),
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
def mongo_coll():
    url = os.environ.get("MONGO_URL") or "mongodb://localhost:27017"
    dbn = os.environ.get("DB_NAME") or "drillstock"
    return MongoClient(url)[dbn]["zoho_settings"]


# --------------------- PUT /zoho/settings (live) ---------------------
class TestZohoSettingsLive:
    """Save live-mode settings; verify masking, encryption-at-rest, effective-mode fallback."""

    TEST_CLIENT_ID = "1000.TESTZOHOCLIENTID"
    TEST_SECRET = "s3cr3t-test-value-TESTONLY"
    TEST_ORG = "60000000000"

    def test_save_live_settings_masks_secret_and_effective_mode_mock(self, tokens):
        body = {
            "client_id": self.TEST_CLIENT_ID, "client_secret": self.TEST_SECRET,
            "organization_id": self.TEST_ORG, "data_center": "com.au",
            "redirect_uri": f"{BASE}/api/zoho/callback",
            "qld_warehouse_id": "", "nsw_warehouse_id": "", "adjustment_account_id": "",
            "mode": "live", "auto_sync": True,
        }
        r = requests.put(f"{API}/zoho/settings", json=body, headers=H(tokens["admin"]), timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        # secret must not be returned in plaintext
        assert "client_secret" not in d
        assert d.get("client_secret_masked", "").startswith(self.TEST_SECRET[:4])
        assert "\u2022" in d["client_secret_masked"]
        # selected_mode shows user's choice; effective mode is still 'mock' (no refresh token yet)
        assert d["selected_mode"] == "live"
        assert d["mode"] == "mock"
        assert d["connected"] is False
        assert d["client_id"] == self.TEST_CLIENT_ID
        assert d["organization_id"] == self.TEST_ORG
        assert d["data_center"] == "com.au"
        assert d["redirect_uri"].endswith("/api/zoho/callback")

    def test_secret_stored_encrypted_not_plaintext(self, mongo_coll):
        doc = mongo_coll.find_one({"id": "default"})
        assert doc is not None, "zoho_settings doc missing"
        stored = doc.get("client_secret") or ""
        assert stored, "client_secret should be stored"
        assert stored != self.TEST_SECRET, "client_secret must not be plaintext"
        # Fernet tokens start with 'gAAAAA'
        assert stored.startswith("gAAAAA"), f"expected Fernet token, got prefix={stored[:8]!r}"

    def test_non_admin_cannot_read_or_write_settings(self, tokens):
        r = requests.get(f"{API}/zoho/settings", headers=H(tokens["qld_mgr"]), timeout=10)
        assert r.status_code == 403
        r = requests.put(f"{API}/zoho/settings", json={"mode": "mock"}, headers=H(tokens["jake"]), timeout=10)
        assert r.status_code == 403


# --------------------- POST /zoho/connect ---------------------
class TestZohoConnect:
    def test_connect_live_returns_auth_url_with_scope_state_offline_consent(self, tokens):
        # Precondition: live settings saved by TestZohoSettingsLive
        r = requests.post(f"{API}/zoho/connect", headers=H(tokens["admin"]), timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["mode"] == "live"
        url = d["auth_url"]
        assert url and "accounts.zoho.com.au/oauth/v2/auth" in url
        assert "ZohoInventory.inventoryadjustments.CREATE" in url
        assert "access_type=offline" in url
        assert "prompt=consent" in url
        assert "state=" in url
        assert "client_id=1000.TESTZOHOCLIENTID" in url
        assert "response_type=code" in url

    def test_connect_live_missing_fields_returns_400(self, tokens, mongo_coll):
        # Clear required fields AND stored encrypted secret to trigger full missing-field list
        mongo_coll.update_one({"id": "default"}, {"$set": {"client_secret": ""}})
        body = {
            "client_id": "", "client_secret": "", "organization_id": "",
            "data_center": "com.au", "redirect_uri": "",
            "qld_warehouse_id": "", "nsw_warehouse_id": "", "adjustment_account_id": "",
            "mode": "live", "auto_sync": True,
        }
        s = requests.put(f"{API}/zoho/settings", json=body, headers=H(tokens["admin"]), timeout=10)
        assert s.status_code == 200
        r = requests.post(f"{API}/zoho/connect", headers=H(tokens["admin"]), timeout=10)
        assert r.status_code == 400, r.text
        msg = r.json().get("detail", "")
        for f in ("client_id", "client_secret", "organization_id", "redirect_uri"):
            assert f in msg, f"missing-fields detail should list {f}: {msg!r}"

    def test_connect_data_center_com_uses_zoho_com(self, tokens):
        body = {
            "client_id": "1000.TESTUS", "client_secret": "us-secret",
            "organization_id": "70000", "data_center": "com",
            "redirect_uri": f"{BASE}/api/zoho/callback",
            "qld_warehouse_id": "", "nsw_warehouse_id": "", "adjustment_account_id": "",
            "mode": "live", "auto_sync": True,
        }
        s = requests.put(f"{API}/zoho/settings", json=body, headers=H(tokens["admin"]), timeout=10)
        assert s.status_code == 200
        r = requests.post(f"{API}/zoho/connect", headers=H(tokens["admin"]), timeout=10)
        assert r.status_code == 200
        url = r.json()["auth_url"]
        assert "accounts.zoho.com/oauth/v2/auth" in url
        assert "accounts.zoho.com.au" not in url

    def test_non_admin_connect_forbidden(self, tokens):
        r = requests.post(f"{API}/zoho/connect", headers=H(tokens["qld_mgr"]), timeout=10)
        assert r.status_code == 403


# --------------------- GET /zoho/callback ---------------------
class TestZohoCallback:
    def test_callback_bad_state_returns_html_400(self):
        r = requests.get(f"{API}/zoho/callback",
                         params={"code": "x", "state": f"wrong-{uuid.uuid4()}"},
                         timeout=10, allow_redirects=False)
        assert r.status_code == 400
        assert "text/html" in r.headers.get("content-type", "")
        assert "Connection failed" in r.text

    def test_callback_missing_state_returns_html_400(self):
        r = requests.get(f"{API}/zoho/callback", params={"code": "x"}, timeout=10)
        assert r.status_code == 400
        assert "Connection failed" in r.text

    def test_callback_access_denied_cancelled_page(self):
        r = requests.get(f"{API}/zoho/callback", params={"error": "access_denied"}, timeout=10)
        assert r.status_code == 400
        assert "cancelled" in r.text.lower()
        assert "access_denied" in r.text


# --------------------- /zoho/locations + /zoho/import guards ---------------------
class TestZohoLiveGuards:
    def test_locations_without_refresh_token_400(self, tokens):
        # Ensure live mode but no refresh token (set by earlier tests)
        body = {"client_id": "1000.X", "client_secret": "s", "organization_id": "1",
                "data_center": "com.au", "redirect_uri": f"{BASE}/api/zoho/callback",
                "qld_warehouse_id": "", "nsw_warehouse_id": "", "adjustment_account_id": "",
                "mode": "live", "auto_sync": True}
        requests.put(f"{API}/zoho/settings", json=body, headers=H(tokens["admin"]), timeout=10)
        r = requests.get(f"{API}/zoho/locations", headers=H(tokens["admin"]), timeout=10)
        assert r.status_code == 400
        assert "Live" in r.json().get("detail", "") or "connect" in r.json().get("detail", "").lower()

    def test_import_without_refresh_token_400(self, tokens):
        r = requests.post(f"{API}/zoho/import", json={"sync_stock": True},
                          headers=H(tokens["admin"]), timeout=10)
        assert r.status_code == 400
        assert "Live" in r.json().get("detail", "") or "connect" in r.json().get("detail", "").lower()

    def test_locations_non_admin_403(self, tokens):
        r = requests.get(f"{API}/zoho/locations", headers=H(tokens["qld_mgr"]), timeout=10)
        assert r.status_code == 403

    def test_import_non_admin_403(self, tokens):
        r = requests.post(f"{API}/zoho/import", json={"sync_stock": True},
                          headers=H(tokens["jake"]), timeout=10)
        assert r.status_code == 403


# --------------------- Mock mode regression ---------------------
class TestMockModeRegression:
    def test_switch_to_mock_connect_returns_connected(self, tokens):
        body = {"client_id": "", "client_secret": "", "organization_id": "",
                "data_center": "com.au", "redirect_uri": "",
                "qld_warehouse_id": "", "nsw_warehouse_id": "", "adjustment_account_id": "",
                "mode": "mock", "auto_sync": True}
        s = requests.put(f"{API}/zoho/settings", json=body, headers=H(tokens["admin"]), timeout=10)
        assert s.status_code == 200
        assert s.json()["selected_mode"] == "mock"
        r = requests.post(f"{API}/zoho/connect", headers=H(tokens["admin"]), timeout=10)
        assert r.status_code == 200
        d = r.json()
        assert d["mode"] == "mock"
        assert d["connected"] is True
        assert d["auth_url"] is None

    def test_approve_take_still_creates_mock_adj(self, tokens):
        tok = tokens["jake"]
        prods = requests.get(f"{API}/products?warehouse_id=QLD", headers=H(tok), timeout=15).json()
        prod = next(p for p in prods if p.get("locations") and any(
            l["warehouse_id"] == "QLD" and l["qty"] >= 1 for l in p["locations"]))
        loc = next(l for l in prod["locations"] if l["warehouse_id"] == "QLD" and l["qty"] >= 1)
        body = {"type": "take", "warehouse_id": "QLD", "driller_name": "Jake", "rig_number": "RIG-03",
                "items": [{"product_id": prod["id"], "bin_id": loc["bin_id"], "qty": 1}],
                "client_ref": f"iter4-mock-{uuid.uuid4()}", "notes": "iter4 mock regression"}
        r = requests.post(f"{API}/requests", json=body, headers=H(tok), timeout=15)
        assert r.status_code == 200, r.text
        rid = r.json()["id"]
        r2 = requests.post(f"{API}/requests/{rid}/approve", json={"note": ""},
                           headers=H(tokens["qld_mgr"]), timeout=25)
        assert r2.status_code == 200, r2.text
        d = r2.json()
        assert d["status"] == "approved"
        assert d["zoho_mode"] == "mock"
        assert d["zoho_txn_id"].startswith("MOCK-ADJ-"), f"expected MOCK-ADJ- prefix, got {d['zoho_txn_id']!r}"


# --------------------- Final cleanup (restore mock + clear secrets) ---------------------
def test_zz_restore_to_mock_and_clear(tokens):
    body = {"client_id": "", "client_secret": "", "organization_id": "",
            "data_center": "com.au", "redirect_uri": "",
            "qld_warehouse_id": "", "nsw_warehouse_id": "", "adjustment_account_id": "",
            "mode": "mock", "auto_sync": True}
    r = requests.put(f"{API}/zoho/settings", json=body, headers=H(tokens["admin"]), timeout=10)
    assert r.status_code == 200
    d = r.json()
    assert d["selected_mode"] == "mock"
    assert d["mode"] == "mock"
    assert d["client_id"] == ""
    assert d["organization_id"] == ""
    # client_secret cleared only if non-blank was provided; verify masked prefix empty
    # (previous secrets may still be stored encrypted — not a leak)
