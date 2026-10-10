"""Zoho Inventory integration layer.

Mode is "mock" until real OAuth credentials are saved and ZOHO_MODE=live.
In mock mode every transaction is simulated and logged, so the full
approval flow works end-to-end without Zoho credentials.
"""
import os
import uuid
from datetime import datetime, timezone

import requests

ACCOUNTS = {"com": "accounts.zoho.com", "com.au": "accounts.zoho.com.au", "eu": "accounts.zoho.eu", "in": "accounts.zoho.in"}
SCOPES = "ZohoInventory.inventoryadjustments.CREATE,ZohoInventory.items.READ,ZohoInventory.settings.READ"


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def is_live(settings: dict) -> bool:
    return os.environ.get("ZOHO_MODE") == "live" and bool(settings.get("refresh_token"))


def auth_url(settings: dict) -> str:
    dc = settings.get("data_center", "com.au")
    return (
        f"https://{ACCOUNTS.get(dc, ACCOUNTS['com.au'])}/oauth/v2/auth?scope={SCOPES}"
        f"&client_id={settings.get('client_id', '')}&response_type=code&access_type=offline"
        f"&redirect_uri={settings.get('redirect_uri', '')}&prompt=consent"
    )


def exchange_code(settings: dict, code: str) -> dict:
    dc = settings.get("data_center", "com.au")
    r = requests.post(
        f"https://{ACCOUNTS.get(dc)}/oauth/v2/token",
        params={
            "code": code, "client_id": settings["client_id"], "client_secret": settings["client_secret"],
            "redirect_uri": settings["redirect_uri"], "grant_type": "authorization_code",
        }, timeout=30,
    )
    r.raise_for_status()
    return r.json()


def _access_token(settings: dict) -> str:
    dc = settings.get("data_center", "com.au")
    r = requests.post(
        f"https://{ACCOUNTS.get(dc)}/oauth/v2/token",
        params={
            "refresh_token": settings["refresh_token"], "client_id": settings["client_id"],
            "client_secret": settings["client_secret"], "grant_type": "refresh_token",
        }, timeout=30,
    )
    r.raise_for_status()
    return r.json()["access_token"]


def create_adjustment(settings: dict, *, reason: str, warehouse_zoho_id: str, lines: list) -> dict:
    """lines: [{zoho_item_id, sku, quantity_adjusted (+/-)}]. Returns {txn_id, mode}."""
    if not is_live(settings):
        return {"txn_id": f"MOCK-ADJ-{uuid.uuid4().hex[:8].upper()}", "mode": "mock"}
    dc = settings.get("data_center", "com.au")
    token = _access_token(settings)
    body = {
        "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "reason": reason, "adjustment_type": "quantity",
        "line_items": [
            {"item_id": ln["zoho_item_id"], "quantity_adjusted": ln["quantity_adjusted"], "warehouse_id": warehouse_zoho_id}
            for ln in lines
        ],
    }
    r = requests.post(
        f"https://www.zohoapis.{dc}/inventory/v1/inventoryadjustments",
        params={"organization_id": settings["organization_id"]},
        headers={"Authorization": f"Zoho-oauthtoken {token}"}, json=body, timeout=30,
    )
    r.raise_for_status()
    return {"txn_id": r.json()["inventory_adjustment"]["inventory_adjustment_id"], "mode": "live"}
