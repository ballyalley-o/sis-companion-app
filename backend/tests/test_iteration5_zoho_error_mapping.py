"""Iteration 5 — Zoho org-missing & live-error mapping tests.

Verifies the Zoho bug fix (502 -> 424/400 with JSON detail):
 - GET /zoho/locations with REAL org 7007711688 returns 200, kind=location, 3 locations
 - With bogus organization_id='1' -> Zoho responds 401 -> backend 424 with JSON {detail}
 - With organization_id='' -> backend 400 "Pick your Zoho organization first..."
 - CRITICAL: RESTORES organization_id='7007711688' after each mutation
"""
import os
from pathlib import Path

import pytest
import requests
from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://drill-stockroom.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"
REAL_ORG = "7007711688"
EXPECTED_LOCATIONS = {
    "352785000000029045": "Head Office",
    "352785000000029162": "Queensland Logistics",
    "352785000000029177": "New South Wales Logistics",
}


def H(tok):
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def admin_tok():
    r = requests.post(f"{API}/auth/login",
                      json={"email": "admin@drillstock.com", "password": "Admin@12345"},
                      timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def coll():
    url = os.environ.get("MONGO_URL") or "mongodb://localhost:27017"
    dbn = os.environ.get("DB_NAME") or "test_database"
    return MongoClient(url)[dbn]["zoho_settings"]


def _set_org(coll, org):
    coll.update_one({"id": "default"}, {"$set": {"organization_id": org}})


@pytest.fixture(autouse=True)
def restore_org(coll):
    """SAFETY NET: Always restore real org after each test."""
    yield
    _set_org(coll, REAL_ORG)
    doc = coll.find_one({"id": "default"})
    assert doc["organization_id"] == REAL_ORG, "FAILED to restore org!"


class TestZohoLocationsRealOrg:
    """Happy path with the REAL org already stored."""

    def test_locations_200_with_real_org(self, admin_tok, coll):
        _set_org(coll, REAL_ORG)
        r = requests.get(f"{API}/zoho/locations", headers=H(admin_tok), timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["kind"] == "location"
        locs = d["locations"]
        assert len(locs) == 3, f"expected 3 locations, got {len(locs)}: {locs}"
        got = {str(x["id"]): x["name"] for x in locs}
        for lid, name in EXPECTED_LOCATIONS.items():
            assert lid in got, f"missing location {lid} ({name}); got {got}"
            assert got[lid] == name


class TestZohoLocationsBogusOrg:
    """Zoho responds 401 for bogus org -> backend must raise 424 with JSON detail (not 502)."""

    def test_bogus_org_returns_424_json_detail(self, admin_tok, coll):
        _set_org(coll, "1")
        r = requests.get(f"{API}/zoho/locations", headers=H(admin_tok), timeout=30)
        assert r.status_code == 424, f"expected 424, got {r.status_code}: {r.text}"
        assert "application/json" in r.headers.get("content-type", "")
        detail = r.json().get("detail", "")
        assert detail, "expected non-empty detail"
        # Should surface a Zoho error, typically 'Zoho 401:' or token-refresh failure
        low = detail.lower()
        assert ("zoho" in low) or ("token" in low) or ("401" in detail), (
            f"detail should reference Zoho/token: {detail!r}")


class TestZohoLocationsEmptyOrg:
    """Empty org -> backend returns 400 'Pick your Zoho organization first...'"""

    def test_empty_org_returns_400_pick_your_org(self, admin_tok, coll):
        _set_org(coll, "")
        r = requests.get(f"{API}/zoho/locations", headers=H(admin_tok), timeout=15)
        assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text}"
        assert "application/json" in r.headers.get("content-type", "")
        detail = r.json().get("detail", "")
        assert "Pick your Zoho organization first" in detail, (
            f"expected 'Pick your Zoho organization first' in detail: {detail!r}")


class TestZohoConnectionStatus:
    """Verify Connected + Live state visible to admin."""

    def test_settings_show_connected_live(self, admin_tok, coll):
        _set_org(coll, REAL_ORG)
        r = requests.get(f"{API}/zoho/settings", headers=H(admin_tok), timeout=10)
        assert r.status_code == 200
        d = r.json()
        assert d["mode"] == "live"
        assert d["selected_mode"] == "live"
        assert d["connected"] is True
        assert d["has_refresh_token"] is True
        assert d["organization_id"] == REAL_ORG
        orgs = d.get("organizations") or []
        ids = {o["id"] for o in orgs}
        assert "7007711688" in ids
        assert "7007714803" in ids


def test_zz_final_restoration(coll):
    """Final belt-and-braces check that real org is set after the suite runs."""
    _set_org(coll, REAL_ORG)
    doc = coll.find_one({"id": "default"})
    assert doc["organization_id"] == REAL_ORG
