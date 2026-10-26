"""Zoho Inventory client (server-side only).

mode="mock" (default): every transaction is simulated so the app works without Zoho.
mode="live": requires OAuth connection (refresh token). Secrets are encrypted at rest.
"""
import os
import time
import uuid
from datetime import datetime, timezone
from urllib.parse import urlencode

import requests
from cryptography.fernet import Fernet, InvalidToken

DCS = {
    "com.au": ("https://accounts.zoho.com.au", "https://www.zohoapis.com.au/inventory/v1"),
    "com": ("https://accounts.zoho.com", "https://www.zohoapis.com/inventory/v1"),
    "eu": ("https://accounts.zoho.eu", "https://www.zohoapis.eu/inventory/v1"),
    "in": ("https://accounts.zoho.in", "https://www.zohoapis.in/inventory/v1"),
}
SCOPES = ("ZohoInventory.items.READ,ZohoInventory.settings.READ,"
          "ZohoInventory.inventoryadjustments.READ,ZohoInventory.inventoryadjustments.CREATE,"
          "ZohoInventory.purchaseorders.READ")

_fernet = Fernet(os.environ["ZOHO_TOKEN_KEY"].encode())
_token = {"value": None, "exp": 0.0, "key": None}


class ZohoError(Exception):
    pass


def enc(v: str) -> str:
    return _fernet.encrypt(v.encode()).decode() if v else ""


def dec(v: str) -> str:
    if not v:
        return ""
    try:
        return _fernet.decrypt(v.encode()).decode()
    except InvalidToken:
        return v  # legacy plaintext value


def urls(s):
    return DCS.get(s.get("data_center", "com.au"), DCS["com.au"])


def is_live(s: dict) -> bool:
    return s.get("mode") == "live" and bool(s.get("refresh_token"))


def auth_url(s: dict, state: str) -> str:
    accounts, _ = urls(s)
    q = {"scope": SCOPES, "client_id": s.get("client_id", ""), "response_type": "code", "access_type": "offline",
         "prompt": "consent", "redirect_uri": s.get("redirect_uri", ""), "state": state}
    return f"{accounts}/oauth/v2/auth?{urlencode(q)}"


def exchange_code(s: dict, code: str, accounts_server: str = "") -> dict:
    accounts = accounts_server or urls(s)[0]
    r = requests.post(f"{accounts}/oauth/v2/token", data={
        "code": code, "client_id": s["client_id"], "client_secret": dec(s.get("client_secret", "")),
        "redirect_uri": s["redirect_uri"], "grant_type": "authorization_code"}, timeout=30)
    data = r.json() if r.content else {}
    if r.status_code >= 400 or "error" in data:
        raise ZohoError(f"Token exchange failed: {data.get('error', r.status_code)}")
    if not data.get("refresh_token"):
        raise ZohoError("Zoho returned no refresh token (re-try Connect so consent is shown)")
    return data


def _access_token(s: dict) -> str:
    key = s.get("refresh_token")
    if _token["value"] and _token["key"] == key and time.time() < _token["exp"]:
        return _token["value"]
    r = requests.post(f"{urls(s)[0]}/oauth/v2/token", data={
        "refresh_token": dec(key), "client_id": s["client_id"], "client_secret": dec(s.get("client_secret", "")),
        "grant_type": "refresh_token"}, timeout=30)
    data = r.json() if r.content else {}
    if r.status_code >= 400 or "access_token" not in data:
        raise ZohoError(f"Zoho token refresh failed ({data.get('error', r.status_code)}). Reconnect Zoho.")
    _token.update(value=data["access_token"], exp=time.time() + int(data.get("expires_in", 3600)) - 120, key=key)
    return data["access_token"]


def call(s: dict, method: str, path: str, params=None, json=None, with_org: bool = True) -> dict:
    """Authenticated request with retry/backoff on 429/5xx."""
    p = {**(params or {}), **({"organization_id": s.get("organization_id", "")} if with_org else {})}
    last = None
    for attempt in range(4):
        r = requests.request(method, f"{urls(s)[1]}{path}", params=p, json=json, timeout=45,
                             headers={"Authorization": f"Zoho-oauthtoken {_access_token(s)}"})
        if r.status_code == 401 and attempt == 0:
            _token["value"] = None
            continue
        if r.status_code in (429, 500, 502, 503, 504):
            last = r
            time.sleep(1.5 * (2 ** attempt))
            continue
        data = r.json() if r.content else {}
        if r.status_code >= 400 or data.get("code", 0) != 0:
            raise ZohoError(f"Zoho {r.status_code}: {data.get('message', r.text[:300])}")
        return data
    raise ZohoError(f"Zoho unavailable ({last.status_code if last else 'n/a'}), please retry")


def list_organizations(s: dict):
    d = call(s, "GET", "/organizations", with_org=False)
    return [{"id": str(o["organization_id"]), "name": o.get("name")} for o in d.get("organizations", [])]


def list_locations(s: dict):
    """Returns (kind, [{id,name,state,status}]) using Locations, falling back to legacy Warehouses."""
    try:
        d = call(s, "GET", "/locations")
        rows = d.get("locations", [])
        return "location", [{"id": str(x["location_id"]), "name": x.get("location_name"),
                             "state": (x.get("address") or {}).get("state") or x.get("state"), "status": x.get("status")} for x in rows]
    except ZohoError:
        d = call(s, "GET", "/settings/warehouses")
        rows = d.get("warehouses", [])
        return "warehouse", [{"id": str(x["warehouse_id"]), "name": x.get("warehouse_name"),
                              "state": x.get("state"), "status": x.get("status")} for x in rows]


def list_items(s: dict, location_id: str = "", kind: str = "location"):
    out, page = [], 1
    while True:
        params = {"page": page, "per_page": 200}
        if location_id:
            params["location_id" if kind == "location" else "warehouse_id"] = location_id
        d = call(s, "GET", "/items", params=params)
        out.extend(d.get("items", []))
        if not (d.get("page_context") or {}).get("has_more_page"):
            return out
        page += 1


def list_purchase_orders(s: dict):
    """Read purchase order summaries from Zoho; never creates or changes orders."""
    out, page = [], 1
    while True:
        data = call(s, "GET", "/purchaseorders", params={"page": page, "per_page": 200})
        out.extend(data.get("purchaseorders", []))
        if not (data.get("page_context") or {}).get("has_more_page"):
            return out
        page += 1


def get_purchase_order(s: dict, purchase_order_id: str):
    data = call(s, "GET", f"/purchaseorders/{purchase_order_id}")
    return data.get("purchaseorder") or {}


def item_qty(item: dict, location_id: str) -> float:
    for loc in item.get("locations") or item.get("warehouses") or []:
        if str(loc.get("location_id") or loc.get("warehouse_id")) == str(location_id):
            return float(loc.get("location_stock_on_hand") or loc.get("warehouse_stock_on_hand") or 0)
    for k in ("location_stock_on_hand", "warehouse_stock_on_hand", "stock_on_hand"):
        if item.get(k) not in (None, ""):
            return float(item[k])
    return 0.0


def create_adjustment(s: dict, *, reason: str, warehouse_zoho_id: str, lines: list, reference: str = "") -> dict:
    """lines: [{zoho_item_id, sku, quantity_adjusted (+/-)}] -> {txn_id, mode}."""
    if not is_live(s):
        return {"txn_id": f"MOCK-ADJ-{uuid.uuid4().hex[:8].upper()}", "mode": "mock"}
    if not warehouse_zoho_id:
        raise ZohoError("This warehouse is not mapped to a Zoho location (Zoho settings → Warehouse mapping)")
    missing = [ln["sku"] for ln in lines if not ln.get("zoho_item_id") or str(ln["zoho_item_id"]).startswith("ZI-")]
    if missing:
        raise ZohoError(f"Not linked to a Zoho item: {', '.join(missing)}. Run 'Import items' first.")
    key = "location_id" if s.get("location_kind", "location") == "location" else "warehouse_id"
    acct = s.get("adjustment_account_id") or None
    body = {
        "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"), "reason": reason[:100], "adjustment_type": "quantity",
        "reference_number": reference[:50], "description": reason,
        **({"location_id": warehouse_zoho_id} if key == "location_id" else {}),
        "line_items": [{"item_id": ln["zoho_item_id"], "quantity_adjusted": ln["quantity_adjusted"], key: warehouse_zoho_id,
                        **({"adjustment_account_id": acct} if acct else {})} for ln in lines],
    }
    d = call(s, "POST", "/inventoryadjustments", json=body)
    return {"txn_id": str(d["inventory_adjustment"]["inventory_adjustment_id"]), "mode": "live"}
