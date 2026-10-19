import logging
import os
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import List, Literal, Optional

import base64
import io
import re
from difflib import SequenceMatcher, get_close_matches

import bcrypt
import httpx
import jwt
import qrcode
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, FastAPI, File, HTTPException, Query, Request, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import HTMLResponse, Response
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field
from starlette.middleware.cors import CORSMiddleware

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import seed as seed_mod  # noqa: E402
import storage  # noqa: E402
import zoho_api as zoho  # noqa: E402

client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]
JWT_SECRET = os.environ["JWT_SECRET"]
APP_NAME = os.environ["APP_NAME"]

app = FastAPI(title="DrillStock Pro API")
api = APIRouter(prefix="/api")
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("drillstock")

NOPROJ = {"_id": 0}


def nid():
    return uuid.uuid4().hex


def now():
    return datetime.now(timezone.utc)


def iso():
    return now().isoformat()


# ---------------------------------------------------------------- auth
def make_token(user):
    payload = {"sub": user["id"], "role": user["role"], "iat": now(), "exp": now() + timedelta(days=7)}
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


def public_user(u):
    return {k: u.get(k) for k in ("id", "email", "name", "role", "warehouse_id", "active")}


async def current_user(request: Request):
    auth = request.headers.get("Authorization", "")
    token = auth[7:] if auth.startswith("Bearer ") else request.query_params.get("token")
    if not token:
        raise HTTPException(401, "Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid or expired token")
    user = await db.users.find_one({"id": payload.get("sub"), "active": True}, NOPROJ)
    if not user:
        raise HTTPException(401, "Invalid or expired token")
    return user


def roles(*allowed):
    async def dep(user=Depends(current_user)):
        if user["role"] not in allowed:
            raise HTTPException(403, "Insufficient permissions")
        return user
    return dep


def scope_wh(user, warehouse_id: Optional[str]):
    """Managers are locked to their warehouse; others may filter or see all."""
    if user["role"] == "manager":
        if warehouse_id and warehouse_id != user["warehouse_id"]:
            raise HTTPException(403, "Managers can only access their own warehouse")
        return user["warehouse_id"]
    return warehouse_id


def ensure_wh_access(user, warehouse_id):
    if user["role"] == "manager" and warehouse_id != user["warehouse_id"]:
        raise HTTPException(403, "Managers can only access their own warehouse")


class LoginIn(BaseModel):
    email: str
    password: str


@api.post("/auth/login")
async def login(body: LoginIn):
    user = await db.users.find_one({"email": body.email.strip().lower()}, NOPROJ)
    ok = user and user.get("password_hash") and bcrypt.checkpw(body.password.encode(), user["password_hash"].encode())
    if not ok or not user.get("active"):
        raise HTTPException(401, "Incorrect email or password")
    await audit(user, "auth.login", "user", user["id"], {})
    return {"access_token": make_token(user), "user": public_user(user)}


@api.get("/auth/me")
async def me(user=Depends(current_user)):
    return public_user(user)


class SessionIn(BaseModel):
    session_id: str


@api.post("/auth/session")
async def google_session(body: SessionIn):
    """Exchange Emergent Google-auth session_id (one-time) for the app's JWT."""
    async with httpx.AsyncClient(timeout=20) as hc:
        r = await hc.get("https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
                         headers={"X-Session-ID": body.session_id})
    if r.status_code != 200:
        raise HTTPException(401, "Google sign-in failed or expired, please try again")
    data = r.json()
    email = (data.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(401, "Google account has no email")
    user = await db.users.find_one({"email": email}, NOPROJ)
    if not user:
        user = {"id": nid(), "email": email, "password_hash": None, "name": data.get("name") or email.split("@")[0],
                "role": "driller", "warehouse_id": None, "active": True, "auth_provider": "google",
                "picture": data.get("picture"), "created_at": iso()}
        await db.users.insert_one(dict(user))
        await audit(user, "user.create_google", "user", user["id"], {"email": email})
        await notify("New Google sign-up", f"{user['name']} ({email}) joined as a driller", kind="info", roles_=["admin"])
    elif not user.get("active"):
        raise HTTPException(403, "Your account is deactivated. Contact an admin.")
    await audit(user, "auth.login_google", "user", user["id"], {})
    token = make_token(user)
    return {"session_token": token, "access_token": token, "user": public_user(user)}


# ---------------------------------------------------------------- helpers
async def audit(user, action, entity, entity_id, details):
    await db.audit_logs.insert_one({"id": nid(), "at": iso(), "user_id": user["id"], "user_name": user["name"],
                                    "role": user["role"], "action": action, "entity": entity,
                                    "entity_id": entity_id, "details": details})


async def notify(title, body, *, kind="info", user_id=None, roles_=None, warehouse_id=None, ref=None):
    await db.notifications.insert_one({"id": nid(), "at": iso(), "title": title, "body": body, "kind": kind,
                                       "user_id": user_id, "roles": roles_ or [], "warehouse_id": warehouse_id,
                                       "ref": ref, "read_by": []})


async def warehouse_totals(warehouse_id=None):
    match = {"warehouse_id": warehouse_id} if warehouse_id else {}
    rows = await db.stock.aggregate([{"$match": match},
                                     {"$group": {"_id": {"p": "$product_id", "w": "$warehouse_id"}, "qty": {"$sum": "$qty"}}}]).to_list(5000)
    return {(r["_id"]["p"], r["_id"]["w"]): r["qty"] for r in rows}


async def low_stock_list(warehouse_id=None):
    totals = await warehouse_totals(warehouse_id)
    prods = {p["id"]: p for p in await db.products.find({}, NOPROJ).to_list(5000)}
    whs = [warehouse_id] if warehouse_id else [w["id"] for w in await db.warehouses.find({}, NOPROJ).to_list(50)]
    out = []
    for pid, p in prods.items():
        for w in whs:
            q = totals.get((pid, w), 0)
            if q <= p["reorder_level"]:
                out.append({"product_id": pid, "sku": p["sku"], "name": p["name"], "warehouse_id": w,
                            "qty": q, "reorder_level": p["reorder_level"], "unit": p["unit"]})
    return sorted(out, key=lambda x: x["qty"] - x["reorder_level"])


async def check_low_stock(warehouse_id, product_ids):
    low = {x["product_id"]: x for x in await low_stock_list(warehouse_id)}
    for pid in product_ids:
        if pid in low:
            x = low[pid]
            await notify(f"Low stock: {x['sku']}", f"{x['name']} at {x['qty']} {x['unit']} in {warehouse_id} (reorder {x['reorder_level']})",
                         kind="warning", roles_=["manager", "admin"], warehouse_id=warehouse_id, ref={"type": "product", "id": pid})


async def zoho_settings():
    return await db.zoho_settings.find_one({"id": "default"}, NOPROJ) or {}


async def zoho_adjust(user, reason, warehouse_id, lines, ref):
    """lines: [{product_id, sku, delta}]; returns txn result, logs sync."""
    settings = await zoho_settings()
    wh = await db.warehouses.find_one({"id": warehouse_id}, NOPROJ)
    prods = {p["id"]: p for p in await db.products.find({"id": {"$in": [ln["product_id"] for ln in lines]}}, NOPROJ).to_list(500)}
    zlines = [{"zoho_item_id": prods[ln["product_id"]].get("zoho_item_id"), "sku": ln["sku"], "quantity_adjusted": ln["delta"]} for ln in lines]
    log = {"id": nid(), "at": iso(), "reason": reason, "warehouse_id": warehouse_id, "ref": ref, "lines": zlines, "user_name": user["name"]}
    try:
        res = await run_in_threadpool(zoho.create_adjustment, settings, reason=reason,
                                      warehouse_zoho_id=wh.get("zoho_warehouse_id", ""), lines=zlines,
                                      reference=f"DS-{ref.get('type', '')[:3].upper()}-{ref.get('id', '')[:8]}")
        log.update({"status": "success", "txn_id": res["txn_id"], "mode": res["mode"]})
        await db.zoho_sync_log.insert_one(log)
        return res
    except Exception as e:  # noqa: BLE001
        log.update({"status": "failed", "error": str(e)[:500]})
        await db.zoho_sync_log.insert_one(log)
        raise HTTPException(424, f"Zoho transaction failed: {str(e)[:200]}")


async def apply_stock(warehouse_id, bin_id, product_id, delta, *, mtype, ref, user, rig=None, driller=None, note=None):
    if delta < 0:
        res = await db.stock.update_one({"warehouse_id": warehouse_id, "bin_id": bin_id, "product_id": product_id, "qty": {"$gte": -delta}},
                                        {"$inc": {"qty": delta}})
        if res.modified_count == 0:
            return False
    else:
        await db.stock.update_one({"warehouse_id": warehouse_id, "bin_id": bin_id, "product_id": product_id},
                                  {"$inc": {"qty": delta}, "$setOnInsert": {"id": nid()}}, upsert=True)
    p = await db.products.find_one({"id": product_id}, NOPROJ)
    b = await db.bins.find_one({"id": bin_id}, NOPROJ)
    await db.movements.insert_one({"id": nid(), "at": iso(), "type": mtype, "warehouse_id": warehouse_id, "bin_id": bin_id,
                                   "bin_code": b["code"] if b else None, "product_id": product_id, "sku": p["sku"], "product_name": p["name"],
                                   "delta": delta, "ref": ref, "user_name": user["name"], "rig_number": rig, "driller_name": driller, "note": note})
    return True


# ---------------------------------------------------------------- reference data
@api.get("/warehouses")
async def list_warehouses(user=Depends(current_user)):
    return await db.warehouses.find({}, NOPROJ).to_list(50)


@api.get("/rigs")
async def list_rigs(user=Depends(current_user)):
    return await db.rigs.find({}, NOPROJ).sort("number", 1).to_list(200)


class RigIn(BaseModel):
    number: str


@api.post("/rigs")
async def add_rig(body: RigIn, user=Depends(roles("admin", "manager"))):
    num = body.number.strip().upper()
    if await db.rigs.find_one({"number": num}):
        raise HTTPException(409, "Rig already exists")
    doc = {"id": nid(), "number": num}
    await db.rigs.insert_one(dict(doc))
    return doc


@api.get("/drillers")
async def list_drillers(user=Depends(current_user)):
    return await db.users.find({"role": "driller", "active": True}, {"_id": 0, "id": 1, "name": 1, "warehouse_id": 1}).sort("name", 1).to_list(500)


# ---------------------------------------------------------------- users (admin)
class UserIn(BaseModel):
    email: str
    password: str = Field(min_length=8)
    name: str
    role: Literal["driller", "manager", "admin"]
    warehouse_id: Optional[str] = None


@api.get("/users")
async def list_users(user=Depends(roles("admin"))):
    return [public_user(u) for u in await db.users.find({}, NOPROJ).sort("name", 1).to_list(1000)]


@api.post("/users")
async def create_user(body: UserIn, user=Depends(roles("admin"))):
    email = body.email.strip().lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(409, "Email already registered")
    if body.role == "manager" and not body.warehouse_id:
        raise HTTPException(400, "Managers must be assigned a warehouse")
    doc = {"id": nid(), "email": email, "password_hash": bcrypt.hashpw(body.password.encode(), bcrypt.gensalt()).decode(),
           "name": body.name.strip(), "role": body.role, "warehouse_id": body.warehouse_id, "active": True, "created_at": iso()}
    await db.users.insert_one(dict(doc))
    await audit(user, "user.create", "user", doc["id"], {"email": email, "role": body.role})
    return public_user(doc)


@api.patch("/users/{uid}/toggle")
async def toggle_user(uid: str, user=Depends(roles("admin"))):
    u = await db.users.find_one({"id": uid}, NOPROJ)
    if not u:
        raise HTTPException(404, "User not found")
    if u["id"] == user["id"]:
        raise HTTPException(400, "You cannot deactivate yourself")
    await db.users.update_one({"id": uid}, {"$set": {"active": not u["active"]}})
    await audit(user, "user.toggle", "user", uid, {"active": not u["active"]})
    return {"ok": True}


# ---------------------------------------------------------------- products & bins
async def product_with_stock(p, warehouse_id=None):
    match = {"product_id": p["id"], **({"warehouse_id": warehouse_id} if warehouse_id else {})}
    rows = await db.stock.find(match, NOPROJ).to_list(500)
    bins = {b["id"]: b for b in await db.bins.find({"id": {"$in": [r["bin_id"] for r in rows]}}, NOPROJ).to_list(500)}
    locs = [{"bin_id": r["bin_id"], "bin_code": bins.get(r["bin_id"], {}).get("code"), "warehouse_id": r["warehouse_id"], "qty": r["qty"]} for r in rows]
    totals = {}
    for loc in locs:
        totals[loc["warehouse_id"]] = totals.get(loc["warehouse_id"], 0) + loc["qty"]
    return {**p, "locations": locs, "totals": totals}


@api.get("/products")
async def list_products(q: str = "", warehouse_id: Optional[str] = None, user=Depends(current_user)):
    wh = scope_wh(user, warehouse_id) if user["role"] == "manager" else warehouse_id
    filt = {}
    if q.strip():
        rx = {"$regex": q.strip(), "$options": "i"}
        filt = {"$or": [{"sku": rx}, {"name": rx}, {"description": rx}]}
    prods = await db.products.find(filt, NOPROJ).sort("sku", 1).to_list(200)
    return [await product_with_stock(p, wh) for p in prods]


def _vocab(p):
    return set(re.findall(r"[a-z0-9]+", f"{p['sku']} {p['name']} {p.get('description', '')}".lower())) | {p["sku"].lower()}


@api.get("/products/suggest")
async def suggest_products(q: str, warehouse_id: Optional[str] = None, user=Depends(current_user)):
    """Spelling helper: fuzzy matches + a corrected query (e.g. 'bentonit' -> 'bentonite')."""
    toks = [t for t in re.findall(r"[a-z0-9]+", q.lower()) if t]
    if not toks:
        return {"corrected": None, "items": []}
    prods = await db.products.find({}, NOPROJ).to_list(5000)
    vocab = set()
    for p in prods:
        vocab |= _vocab(p)
    vocab_l = sorted(vocab)
    fixed = [(get_close_matches(t, vocab_l, n=1, cutoff=0.6) or [t])[0] for t in toks]
    corrected = " ".join(fixed)
    scored = []
    for p in prods:
        words = _vocab(p)
        per = [max(SequenceMatcher(None, t, w).ratio() for w in words) for t in toks]
        score = sum(per) / len(per)
        if score >= 0.6:
            scored.append((score, p))
    scored.sort(key=lambda x: -x[0])
    wh = scope_wh(user, warehouse_id)
    items = [{**(await product_with_stock(p, wh)), "score": round(sc, 2)} for sc, p in scored[:5]]
    return {"corrected": corrected if corrected != " ".join(toks) else None, "items": items}


@api.get("/products/common")
async def common_products(warehouse_id: Optional[str] = None, rig: Optional[str] = None, kind: str = "request",
                          user=Depends(current_user)):
    """Most frequently requested (or received) items, optionally for a rig; padded with low-stock/seed items."""
    wh = scope_wh(user, warehouse_id)
    since = (now() - timedelta(days=120)).isoformat()
    coll = db.receipts if kind == "receive" else db.stock_requests
    match = {"created_at": {"$gte": since}, **({"warehouse_id": wh} if wh else {})}
    if kind != "receive":
        match["status"] = {"$in": ["pending", "approved"]}
        if rig:
            match["rig_number"] = rig
    rows = await coll.aggregate([{"$match": match}, {"$unwind": "$items"},
                                 {"$group": {"_id": "$items.product_id", "uses": {"$sum": 1}, "qty": {"$sum": "$items.qty"}}},
                                 {"$sort": {"uses": -1, "qty": -1}}, {"$limit": 8}]).to_list(8)
    ids = [r["_id"] for r in rows]
    uses = {r["_id"]: r["uses"] for r in rows}
    if len(ids) < 6:
        for p in await db.products.find({"id": {"$nin": ids}}, NOPROJ).sort("sku", 1).to_list(6 - len(ids)):
            ids.append(p["id"])
    prods = {p["id"]: p for p in await db.products.find({"id": {"$in": ids}}, NOPROJ).to_list(50)}
    return [{**(await product_with_stock(prods[i], wh)), "uses": uses.get(i, 0)} for i in ids if i in prods]


@api.get("/products/{pid}")
async def get_product(pid: str, user=Depends(current_user)):
    p = await db.products.find_one({"id": pid}, NOPROJ)
    if not p:
        raise HTTPException(404, "Product not found")
    return await product_with_stock(p)


class ProductIn(BaseModel):
    sku: str
    name: str
    description: str = ""
    unit: str = "ea"
    reorder_level: int = Field(ge=0, default=0)
    zoho_item_id: str = ""


@api.post("/products")
async def create_product(body: ProductIn, user=Depends(roles("admin", "manager"))):
    if await db.products.find_one({"sku": body.sku.strip().upper()}):
        raise HTTPException(409, "SKU already exists")
    doc = {"id": nid(), **body.model_dump(), "sku": body.sku.strip().upper()}
    await db.products.insert_one(dict(doc))
    await audit(user, "product.create", "product", doc["id"], {"sku": doc["sku"]})
    return doc


@api.get("/bins")
async def list_bins(warehouse_id: Optional[str] = None, user=Depends(current_user)):
    wh = scope_wh(user, warehouse_id)
    bins = await db.bins.find({"active": True, **({"warehouse_id": wh} if wh else {})}, NOPROJ).sort("code", 1).to_list(2000)
    counts = {}
    for r in await db.stock.find({"bin_id": {"$in": [b["id"] for b in bins]}, "qty": {"$gt": 0}}, NOPROJ).to_list(10000):
        counts[r["bin_id"]] = counts.get(r["bin_id"], 0) + 1
    return [{**b, "sku_count": counts.get(b["id"], 0), "qr_payload": f"BIN:{b['code']}"} for b in bins]


class BinIn(BaseModel):
    code: str
    warehouse_id: str
    zone: str = ""
    description: str = ""
    name: str = ""


def bin_title(b):
    if b.get("name"):
        return b["name"].upper()
    parts = b["code"].split("-")
    seg = parts[-1]
    m = re.match(r"^[Bb](\d+)$", seg) if len(parts) >= 3 else None
    return f"BIN {m.group(1) if m else seg}".upper()


@api.post("/bins")
async def create_bin(body: BinIn, user=Depends(roles("admin", "manager"))):
    ensure_wh_access(user, body.warehouse_id)
    code = body.code.strip().upper()
    if await db.bins.find_one({"code": code}):
        raise HTTPException(409, "Bin code already exists")
    doc = {"id": nid(), "code": code, "warehouse_id": body.warehouse_id, "zone": body.zone, "description": body.description,
           "name": body.name.strip(), "active": True}
    await db.bins.insert_one(dict(doc))
    await audit(user, "bin.create", "bin", doc["id"], {"code": code})
    return doc


@api.delete("/bins/{bid}")
async def archive_bin(bid: str, user=Depends(roles("admin", "manager"))):
    b = await db.bins.find_one({"id": bid}, NOPROJ)
    if not b:
        raise HTTPException(404, "Bin not found")
    ensure_wh_access(user, b["warehouse_id"])
    if await db.stock.find_one({"bin_id": bid, "qty": {"$gt": 0}}):
        raise HTTPException(400, "Bin still holds stock; move or count it to zero first")
    await db.bins.update_one({"id": bid}, {"$set": {"active": False}})
    await audit(user, "bin.archive", "bin", bid, {"code": b["code"]})
    return {"ok": True}


@api.get("/bins/{bid}")
async def get_bin(bid: str, user=Depends(current_user)):
    b = await db.bins.find_one({"id": bid}, NOPROJ)
    if not b:
        raise HTTPException(404, "Bin not found")
    rows = await db.stock.find({"bin_id": bid}, NOPROJ).to_list(1000)
    prods = {p["id"]: p for p in await db.products.find({"id": {"$in": [r["product_id"] for r in rows]}}, NOPROJ).to_list(1000)}
    items = [{"product_id": r["product_id"], "sku": prods[r["product_id"]]["sku"], "name": prods[r["product_id"]]["name"],
              "description": prods[r["product_id"]]["description"], "unit": prods[r["product_id"]]["unit"], "qty": r["qty"]}
             for r in rows if r["product_id"] in prods]
    return {**b, "title": bin_title(b), "items": sorted(items, key=lambda x: x["sku"]), "qr_payload": f"BIN:{b['code']}"}


def qr_data_uri(payload: str) -> str:
    img = qrcode.make(payload, box_size=10, border=2)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


@api.get("/qr")
async def qr(payload: str, user=Depends(current_user)):
    return {"payload": payload, "data_uri": qr_data_uri(payload)}


@api.get("/bins-labels")
async def bin_labels(warehouse_id: Optional[str] = None, ids: str = "", user=Depends(current_user)):
    wh = scope_wh(user, warehouse_id)
    filt = {"active": True, **({"warehouse_id": wh} if wh else {})}
    if ids:
        filt["id"] = {"$in": ids.split(",")}
    bins = await db.bins.find(filt, NOPROJ).sort("code", 1).to_list(500)
    return [{"id": b["id"], "code": b["code"], "title": bin_title(b), "warehouse_id": b["warehouse_id"], "zone": b.get("zone", ""),
             "description": b.get("description", ""), "data_uri": qr_data_uri(f"BIN:{b['code']}")} for b in bins]


@api.get("/scan/{payload:path}")
async def resolve_scan(payload: str, user=Depends(current_user)):
    raw = payload.strip()
    code = raw.split(":", 1)[1] if ":" in raw else raw
    code = code.strip().upper()
    b = await db.bins.find_one({"code": code, "active": True}, NOPROJ)
    if b:
        return {"type": "bin", "id": b["id"], "code": b["code"]}
    e = await db.equipment.find_one({"code": code}, NOPROJ)
    if e:
        return {"type": "equipment", "id": e["id"], "code": e["code"]}
    p = await db.products.find_one({"sku": code}, NOPROJ)
    if p:
        return {"type": "product", "id": p["id"], "code": p["sku"]}
    raise HTTPException(404, f"No bin, equipment or SKU matches '{code}'")


# ---------------------------------------------------------------- stock requests
class ReqItem(BaseModel):
    product_id: str
    bin_id: str
    qty: int = Field(gt=0, le=10000)


class StockRequestIn(BaseModel):
    type: Literal["take", "return"]
    warehouse_id: str
    driller_name: str
    rig_number: str
    items: List[ReqItem] = Field(min_length=1)
    notes: str = ""
    client_ref: str


@api.post("/requests")
async def create_request(body: StockRequestIn, user=Depends(current_user)):
    existing = await db.stock_requests.find_one({"client_ref": body.client_ref}, NOPROJ)
    if existing:  # idempotent resubmission (e.g. flaky network retry)
        return existing
    items = []
    for it in body.items:
        p = await db.products.find_one({"id": it.product_id}, NOPROJ)
        b = await db.bins.find_one({"id": it.bin_id, "warehouse_id": body.warehouse_id}, NOPROJ)
        if not p or not b:
            raise HTTPException(400, "Invalid product or bin for this warehouse")
        if body.type == "take":
            s = await db.stock.find_one({"product_id": p["id"], "bin_id": b["id"]}, NOPROJ)
            if not s or s["qty"] < it.qty:
                raise HTTPException(400, f"Only {s['qty'] if s else 0} {p['unit']} of {p['sku']} in bin {b['code']}")
        items.append({"product_id": p["id"], "sku": p["sku"], "name": p["name"], "unit": p["unit"],
                      "bin_id": b["id"], "bin_code": b["code"], "qty": it.qty})
    doc = {"id": nid(), "number": f"SR-{now().strftime('%y%m%d')}-{uuid.uuid4().hex[:4].upper()}", "type": body.type,
           "warehouse_id": body.warehouse_id, "driller_name": body.driller_name, "rig_number": body.rig_number,
           "submitted_by_id": user["id"], "submitted_by": user["name"], "items": items, "notes": body.notes,
           "status": "pending", "client_ref": body.client_ref, "created_at": iso(), "decided_at": None,
           "decided_by": None, "decision_note": None, "zoho_txn_id": None, "zoho_mode": None,
           "history": [{"at": iso(), "status": "pending", "by": user["name"]}]}
    await db.stock_requests.insert_one(dict(doc))
    await audit(user, "request.create", "stock_request", doc["id"], {"number": doc["number"], "type": body.type})
    await notify(f"New {body.type} request {doc['number']}", f"{body.driller_name} ({body.rig_number}) · {len(items)} line(s)",
                 kind="request", roles_=["manager", "admin"], warehouse_id=body.warehouse_id, ref={"type": "request", "id": doc["id"]})
    return doc


@api.get("/requests")
async def list_requests(status: Optional[str] = None, mine: bool = False, warehouse_id: Optional[str] = None, user=Depends(current_user)):
    filt = {}
    if user["role"] == "driller" or mine:
        filt["submitted_by_id"] = user["id"]
    else:
        wh = scope_wh(user, warehouse_id)
        if wh:
            filt["warehouse_id"] = wh
    if status and status != "all":
        filt["status"] = status
    return await db.stock_requests.find(filt, NOPROJ).sort("created_at", -1).to_list(300)


@api.get("/requests/{rid}")
async def get_request(rid: str, user=Depends(current_user)):
    r = await db.stock_requests.find_one({"id": rid}, NOPROJ)
    if not r:
        raise HTTPException(404, "Request not found")
    if user["role"] == "driller" and r["submitted_by_id"] != user["id"]:
        raise HTTPException(403, "Not your request")
    ensure_wh_access(user, r["warehouse_id"])
    return r


class DecisionIn(BaseModel):
    note: str = ""


@api.post("/requests/{rid}/approve")
async def approve_request(rid: str, body: DecisionIn, user=Depends(roles("manager", "admin"))):
    r = await db.stock_requests.find_one({"id": rid}, NOPROJ)
    if not r:
        raise HTTPException(404, "Request not found")
    ensure_wh_access(user, r["warehouse_id"])
    # Lock: only one approver can move pending -> processing
    locked = await db.stock_requests.find_one_and_update({"id": rid, "status": "pending"}, {"$set": {"status": "processing"}})
    if not locked:
        raise HTTPException(409, f"Request is already {r['status']}")
    sign = -1 if r["type"] == "take" else 1
    try:
        if sign < 0:
            for it in r["items"]:
                s = await db.stock.find_one({"product_id": it["product_id"], "bin_id": it["bin_id"]}, NOPROJ)
                if not s or s["qty"] < it["qty"]:
                    raise HTTPException(400, f"Insufficient stock for {it['sku']} in {it['bin_code']} (have {s['qty'] if s else 0})")
        res = await zoho_adjust(user, f"Driller {r['type']} {r['number']} ({r['rig_number']})", r["warehouse_id"],
                                [{"product_id": it["product_id"], "sku": it["sku"], "delta": sign * it["qty"]} for it in r["items"]],
                                {"type": "request", "id": rid})
        applied = []
        for it in r["items"]:
            ok = await apply_stock(r["warehouse_id"], it["bin_id"], it["product_id"], sign * it["qty"], mtype=f"request_{r['type']}",
                                   ref={"type": "request", "id": rid, "number": r["number"]}, user=user,
                                   rig=r["rig_number"], driller=r["driller_name"])
            if not ok:
                for a in applied:  # compensate
                    await db.stock.update_one({"product_id": a["product_id"], "bin_id": a["bin_id"]}, {"$inc": {"qty": a["qty"]}})
                raise HTTPException(409, f"Stock changed during approval for {it['sku']}; please retry")
            applied.append(it)
    except HTTPException:
        await db.stock_requests.update_one({"id": rid}, {"$set": {"status": "pending"}})
        raise
    await db.stock_requests.update_one({"id": rid}, {"$set": {
        "status": "approved", "decided_at": iso(), "decided_by": user["name"], "decision_note": body.note,
        "zoho_txn_id": res["txn_id"], "zoho_mode": res["mode"]},
        "$push": {"history": {"at": iso(), "status": "approved", "by": user["name"], "note": body.note}}})
    await audit(user, "request.approve", "stock_request", rid, {"number": r["number"], "zoho_txn_id": res["txn_id"]})
    await notify(f"Request {r['number']} approved", f"{user['name']} approved your {r['type']} request. Zoho txn {res['txn_id']}",
                 kind="success", user_id=r["submitted_by_id"], ref={"type": "request", "id": rid})
    await check_low_stock(r["warehouse_id"], [it["product_id"] for it in r["items"]])
    return await db.stock_requests.find_one({"id": rid}, NOPROJ)


@api.post("/requests/{rid}/reject")
async def reject_request(rid: str, body: DecisionIn, user=Depends(roles("manager", "admin"))):
    r = await db.stock_requests.find_one({"id": rid}, NOPROJ)
    if not r:
        raise HTTPException(404, "Request not found")
    ensure_wh_access(user, r["warehouse_id"])
    upd = await db.stock_requests.find_one_and_update({"id": rid, "status": "pending"}, {"$set": {
        "status": "rejected", "decided_at": iso(), "decided_by": user["name"], "decision_note": body.note},
        "$push": {"history": {"at": iso(), "status": "rejected", "by": user["name"], "note": body.note}}})
    if not upd:
        raise HTTPException(409, f"Request is already {r['status']}")
    await audit(user, "request.reject", "stock_request", rid, {"number": r["number"], "note": body.note})
    await notify(f"Request {r['number']} rejected", body.note or f"{user['name']} rejected your request",
                 kind="error", user_id=r["submitted_by_id"], ref={"type": "request", "id": rid})
    return await db.stock_requests.find_one({"id": rid}, NOPROJ)


@api.post("/requests/{rid}/cancel")
async def cancel_request(rid: str, user=Depends(current_user)):
    upd = await db.stock_requests.find_one_and_update({"id": rid, "status": "pending", "submitted_by_id": user["id"]},
                                                      {"$set": {"status": "cancelled"},
                                                       "$push": {"history": {"at": iso(), "status": "cancelled", "by": user["name"]}}})
    if not upd:
        raise HTTPException(409, "Only your own pending requests can be cancelled")
    await audit(user, "request.cancel", "stock_request", rid, {})
    return {"ok": True}


# ---------------------------------------------------------------- receiving (goods in)
class ReceiptIn(BaseModel):
    warehouse_id: str
    supplier: str = ""
    reference: str = ""
    notes: str = ""
    items: List[ReqItem] = Field(min_length=1)
    client_ref: str
    reorder_id: Optional[str] = None


@api.post("/receipts")
async def create_receipt(body: ReceiptIn, user=Depends(roles("manager", "admin"))):
    ensure_wh_access(user, body.warehouse_id)
    existing = await db.receipts.find_one({"client_ref": body.client_ref}, NOPROJ)
    if existing:
        return existing
    items = []
    for it in body.items:
        p = await db.products.find_one({"id": it.product_id}, NOPROJ)
        b = await db.bins.find_one({"id": it.bin_id, "warehouse_id": body.warehouse_id, "active": True}, NOPROJ)
        if not p or not b:
            raise HTTPException(400, "Invalid product or bin for this warehouse")
        items.append({"product_id": p["id"], "sku": p["sku"], "name": p["name"], "unit": p["unit"],
                      "bin_id": b["id"], "bin_code": b["code"], "qty": it.qty})
    rid = nid()
    number = f"GR-{now().strftime('%y%m%d')}-{uuid.uuid4().hex[:4].upper()}"
    res = await zoho_adjust(user, f"Goods received {number}{f' ({body.reference})' if body.reference else ''}", body.warehouse_id,
                            [{"product_id": it["product_id"], "sku": it["sku"], "delta": it["qty"]} for it in items], {"type": "receipt", "id": rid})
    for it in items:
        await apply_stock(body.warehouse_id, it["bin_id"], it["product_id"], it["qty"], mtype="receive",
                          ref={"type": "receipt", "id": rid, "number": number}, user=user, note=body.reference or body.supplier)
    doc = {"id": rid, "number": number, "warehouse_id": body.warehouse_id, "supplier": body.supplier, "reference": body.reference,
           "notes": body.notes, "items": items, "received_by": user["name"], "created_at": iso(), "client_ref": body.client_ref,
           "zoho_txn_id": res["txn_id"], "zoho_mode": res["mode"], "reorder_id": body.reorder_id}
    await db.receipts.insert_one(dict(doc))
    if body.reorder_id:
        ro = await db.reorders.find_one({"id": body.reorder_id}, NOPROJ)
        if ro and ro["status"] in ("open", "ordered"):
            got = {}
            for it in items:
                got[it["product_id"]] = got.get(it["product_id"], 0) + it["qty"]
            new_items = [{**i, "received": i.get("received", 0) + got.get(i["product_id"], 0)} for i in ro["items"]]
            status = "received" if all(i["received"] >= i["qty"] for i in new_items) else "partial"
            await db.reorders.update_one({"id": ro["id"]}, {"$set": {"items": new_items, "status": status if status == "received" else ro["status"]},
                                                         "$push": {"history": {"at": iso(), "status": status, "by": user["name"], "note": number}}})
    await audit(user, "receipt.create", "receipt", rid, {"number": number, "lines": len(items), "zoho_txn_id": res["txn_id"]})
    await notify(f"Stock received {number}", f"{len(items)} line(s) into {body.warehouse_id}{f' from {body.supplier}' if body.supplier else ''}",
                 kind="success", roles_=["manager", "admin"], warehouse_id=body.warehouse_id, ref={"type": "receipt", "id": rid})
    return doc


@api.get("/receipts")
async def list_receipts(warehouse_id: Optional[str] = None, user=Depends(roles("manager", "admin"))):
    wh = scope_wh(user, warehouse_id)
    return await db.receipts.find({"warehouse_id": wh} if wh else {}, NOPROJ).sort("created_at", -1).to_list(200)


# ---------------------------------------------------------------- rig kits
class KitItem(BaseModel):
    product_id: str
    qty: int = Field(gt=0, le=10000)


class KitIn(BaseModel):
    name: str
    rig_number: str
    warehouse_id: str
    items: List[KitItem] = Field(min_length=1)


async def kit_doc(body: KitIn, user):
    ensure_wh_access(user, body.warehouse_id)
    if not await db.rigs.find_one({"number": body.rig_number}):
        raise HTTPException(400, "Unknown rig number")
    items = []
    for it in body.items:
        p = await db.products.find_one({"id": it.product_id}, NOPROJ)
        if not p:
            raise HTTPException(400, "Unknown product in kit")
        items.append({"product_id": p["id"], "sku": p["sku"], "name": p["name"], "unit": p["unit"], "qty": it.qty})
    return {"name": body.name.strip() or f"{body.rig_number} kit", "rig_number": body.rig_number,
            "warehouse_id": body.warehouse_id, "items": items, "updated_by": user["name"], "updated_at": iso()}


async def enrich_kit(k):
    """Attach the best bin (most stock) in the kit's warehouse for each item."""
    out = []
    for it in k["items"]:
        best = await db.stock.find({"product_id": it["product_id"], "warehouse_id": k["warehouse_id"]}, NOPROJ).sort("qty", -1).to_list(1)
        b = await db.bins.find_one({"id": best[0]["bin_id"]}, NOPROJ) if best else None
        out.append({**it, "bin_id": b["id"] if b else None, "bin_code": b["code"] if b else None, "avail": best[0]["qty"] if best else 0})
    return {**k, "items": out, "short": sum(1 for i in out if i["avail"] < i["qty"])}


@api.get("/kits")
async def list_kits(rig: Optional[str] = None, warehouse_id: Optional[str] = None, user=Depends(current_user)):
    wh = scope_wh(user, warehouse_id)
    filt = {**({"warehouse_id": wh} if wh else {}), **({"rig_number": rig} if rig else {})}
    kits = await db.rig_kits.find(filt, NOPROJ).sort([("rig_number", 1), ("name", 1)]).to_list(500)
    return [await enrich_kit(k) for k in kits]


@api.get("/kits/{kid}")
async def get_kit(kid: str, user=Depends(current_user)):
    k = await db.rig_kits.find_one({"id": kid}, NOPROJ)
    if not k:
        raise HTTPException(404, "Kit not found")
    ensure_wh_access(user, k["warehouse_id"])
    return await enrich_kit(k)


@api.post("/kits")
async def create_kit(body: KitIn, user=Depends(roles("manager", "admin"))):
    doc = {"id": nid(), **(await kit_doc(body, user)), "created_at": iso()}
    await db.rig_kits.insert_one(dict(doc))
    await audit(user, "kit.create", "kit", doc["id"], {"name": doc["name"], "rig": doc["rig_number"]})
    return doc


@api.put("/kits/{kid}")
async def update_kit(kid: str, body: KitIn, user=Depends(roles("manager", "admin"))):
    k = await db.rig_kits.find_one({"id": kid}, NOPROJ)
    if not k:
        raise HTTPException(404, "Kit not found")
    ensure_wh_access(user, k["warehouse_id"])
    upd = await kit_doc(body, user)
    await db.rig_kits.update_one({"id": kid}, {"$set": upd})
    await audit(user, "kit.update", "kit", kid, {"name": upd["name"]})
    return await db.rig_kits.find_one({"id": kid}, NOPROJ)


@api.delete("/kits/{kid}")
async def delete_kit(kid: str, user=Depends(roles("manager", "admin"))):
    k = await db.rig_kits.find_one({"id": kid}, NOPROJ)
    if not k:
        raise HTTPException(404, "Kit not found")
    ensure_wh_access(user, k["warehouse_id"])
    await db.rig_kits.delete_one({"id": kid})
    await audit(user, "kit.delete", "kit", kid, {"name": k["name"]})
    return {"ok": True}


# ---------------------------------------------------------------- trips (calendar of planned driller trips)
class TripItem(BaseModel):
    product_id: str
    qty: int = Field(gt=0, le=10000)


class TripIn(BaseModel):
    warehouse_id: str
    driller_name: str
    rig_number: str
    site: str = ""
    start_date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    end_date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    notes: str = ""
    items: List[TripItem] = Field(min_length=1)


RESERVING = ["approved", "prepared"]


async def reserved_qty(product_id, warehouse_id, exclude_trip=None):
    rows = await db.trips.aggregate([
        {"$match": {"warehouse_id": warehouse_id, "status": {"$in": RESERVING}, **({"id": {"$ne": exclude_trip}} if exclude_trip else {})}},
        {"$unwind": "$items"}, {"$match": {"items.product_id": product_id}},
        {"$group": {"_id": None, "q": {"$sum": "$items.qty"}}}]).to_list(1)
    return rows[0]["q"] if rows else 0


async def enrich_trip(t):
    totals = await warehouse_totals(t["warehouse_id"])
    items = []
    for it in t["items"]:
        on_hand = totals.get((it["product_id"], t["warehouse_id"]), 0)
        reserved = await reserved_qty(it["product_id"], t["warehouse_id"], exclude_trip=t["id"])
        avail = max(0, on_hand - reserved)
        items.append({**it, "on_hand": on_hand, "reserved_other": reserved, "available": avail, "short": max(0, it["qty"] - avail)})
    reorders = await db.reorders.find({"trip_id": t["id"]}, NOPROJ).sort("created_at", -1).to_list(20)
    return {**t, "items": items, "short_lines": sum(1 for i in items if i["short"]), "reorders": reorders}


async def trip_items(body_items):
    out = []
    for it in body_items:
        p = await db.products.find_one({"id": it.product_id}, NOPROJ)
        if not p:
            raise HTTPException(400, "Unknown product")
        out.append({"product_id": p["id"], "sku": p["sku"], "name": p["name"], "unit": p["unit"], "qty": it.qty})
    return out


def _check_dates(body):
    if body.end_date < body.start_date:
        raise HTTPException(400, "End date must be on or after start date")


async def get_trip_or_404(tid, user):
    t = await db.trips.find_one({"id": tid}, NOPROJ)
    if not t:
        raise HTTPException(404, "Trip not found")
    if user["role"] == "driller" and t["driller_id"] != user["id"]:
        raise HTTPException(403, "Not your trip")
    ensure_wh_access(user, t["warehouse_id"])
    return t


@api.post("/trips")
async def create_trip(body: TripIn, user=Depends(current_user)):
    _check_dates(body)
    ensure_wh_access(user, body.warehouse_id)
    doc = {"id": nid(), "number": f"TR-{now().strftime('%y%m%d')}-{uuid.uuid4().hex[:4].upper()}", **body.model_dump(exclude={"items"}),
           "items": await trip_items(body.items), "driller_id": user["id"], "created_by": user["name"], "status": "pending",
           "created_at": iso(), "issued_request_id": None, "history": [{"at": iso(), "status": "pending", "by": user["name"]}]}
    await db.trips.insert_one(dict(doc))
    await audit(user, "trip.create", "trip", doc["id"], {"number": doc["number"], "start": body.start_date})
    await notify(f"Trip planned {doc['number']}", f"{body.driller_name} · {body.rig_number} · {body.start_date} → {body.end_date} · {len(doc['items'])} item(s)",
                 kind="request", roles_=["manager", "admin"], warehouse_id=body.warehouse_id, ref={"type": "trip", "id": doc["id"]})
    return doc


@api.put("/trips/{tid}")
async def update_trip(tid: str, body: TripIn, user=Depends(current_user)):
    t = await get_trip_or_404(tid, user)
    if t["status"] not in ("pending", "rejected"):
        raise HTTPException(409, f"Trip is {t['status']}; only pending or rejected trips can be edited")
    _check_dates(body)
    upd = {**body.model_dump(exclude={"items"}), "items": await trip_items(body.items), "status": "pending"}
    await db.trips.update_one({"id": tid}, {"$set": upd, "$push": {"history": {"at": iso(), "status": "pending", "by": user["name"], "note": "edited"}}})
    await audit(user, "trip.update", "trip", tid, {})
    return await db.trips.find_one({"id": tid}, NOPROJ)


@api.get("/trips")
async def list_trips(start: Optional[str] = None, end: Optional[str] = None, status: Optional[str] = None,
                     warehouse_id: Optional[str] = None, user=Depends(current_user)):
    filt = {}
    if user["role"] == "driller":
        filt["driller_id"] = user["id"]
    else:
        wh = scope_wh(user, warehouse_id)
        if wh:
            filt["warehouse_id"] = wh
    if start and end:  # overlap with range
        filt["start_date"] = {"$lte": end}
        filt["end_date"] = {"$gte": start}
    if status and status != "all":
        filt["status"] = status
    return await db.trips.find(filt, NOPROJ).sort("start_date", 1).to_list(500)


@api.get("/trips/{tid}")
async def get_trip(tid: str, user=Depends(current_user)):
    return await enrich_trip(await get_trip_or_404(tid, user))


async def trip_transition(tid, user, frm, to, note="", extra=None):
    upd = await db.trips.find_one_and_update({"id": tid, "status": {"$in": frm}}, {
        "$set": {"status": to, **(extra or {})}, "$push": {"history": {"at": iso(), "status": to, "by": user["name"], "note": note}}})
    if not upd:
        t = await db.trips.find_one({"id": tid}, NOPROJ)
        raise HTTPException(409, f"Trip is {t['status'] if t else 'missing'}")
    await audit(user, f"trip.{to}", "trip", tid, {"note": note})
    return upd


@api.post("/trips/{tid}/approve")
async def approve_trip(tid: str, body: DecisionIn, user=Depends(roles("manager", "admin"))):
    t = await get_trip_or_404(tid, user)
    await trip_transition(tid, user, ["pending"], "approved", body.note)
    await notify(f"Trip {t['number']} approved", f"Stock for {t['start_date']} is reserved{f': {body.note}' if body.note else ''}",
                 kind="success", user_id=t["driller_id"], ref={"type": "trip", "id": tid})
    return await enrich_trip(await db.trips.find_one({"id": tid}, NOPROJ))


@api.post("/trips/{tid}/reject")
async def reject_trip(tid: str, body: DecisionIn, user=Depends(roles("manager", "admin"))):
    t = await get_trip_or_404(tid, user)
    await trip_transition(tid, user, ["pending", "approved"], "rejected", body.note)
    await notify(f"Trip {t['number']} rejected", body.note or "Contact your warehouse manager", kind="error", user_id=t["driller_id"], ref={"type": "trip", "id": tid})
    return await enrich_trip(await db.trips.find_one({"id": tid}, NOPROJ))


@api.post("/trips/{tid}/prepare")
async def prepare_trip(tid: str, body: DecisionIn, user=Depends(roles("manager", "admin"))):
    t = await get_trip_or_404(tid, user)
    await trip_transition(tid, user, ["approved"], "prepared", body.note)
    await notify(f"Trip {t['number']} packed & ready", f"Collect from {t['warehouse_id']} warehouse", kind="success", user_id=t["driller_id"], ref={"type": "trip", "id": tid})
    return await enrich_trip(await db.trips.find_one({"id": tid}, NOPROJ))


@api.post("/trips/{tid}/cancel")
async def cancel_trip(tid: str, user=Depends(current_user)):
    t = await get_trip_or_404(tid, user)
    if user["role"] == "driller" and t["status"] != "pending":
        raise HTTPException(409, "Ask a manager to cancel an approved trip")
    await trip_transition(tid, user, ["pending", "approved", "prepared", "rejected"], "cancelled")
    return {"ok": True}


@api.post("/trips/{tid}/issue")
async def issue_trip(tid: str, user=Depends(roles("manager", "admin"))):
    """Hand stock over: creates a take request from the trip and approves it (Zoho first, then stock)."""
    t = await enrich_trip(await get_trip_or_404(tid, user))
    if t["status"] not in RESERVING:
        raise HTTPException(409, f"Trip is {t['status']}; approve it first")
    lines = []
    for it in t["items"]:
        need = it["qty"]
        for r in await db.stock.find({"product_id": it["product_id"], "warehouse_id": t["warehouse_id"], "qty": {"$gt": 0}}, NOPROJ).sort("qty", -1).to_list(50):
            if need <= 0:
                break
            take = min(need, r["qty"])
            b = await db.bins.find_one({"id": r["bin_id"]}, NOPROJ)
            lines.append({"product_id": it["product_id"], "sku": it["sku"], "name": it["name"], "unit": it["unit"],
                          "bin_id": r["bin_id"], "bin_code": b["code"] if b else "", "qty": take})
            need -= take
        if need > 0:
            raise HTTPException(400, f"Not enough {it['sku']} on hand ({it['on_hand']}); reorder or reduce the trip")
    rid = nid()
    req = {"id": rid, "number": f"SR-{now().strftime('%y%m%d')}-{uuid.uuid4().hex[:4].upper()}", "type": "take",
           "warehouse_id": t["warehouse_id"], "driller_name": t["driller_name"], "rig_number": t["rig_number"],
           "submitted_by_id": t["driller_id"], "submitted_by": t["created_by"], "items": lines, "notes": f"Trip {t['number']} · {t['site']}",
           "status": "pending", "client_ref": f"trip-{tid}", "created_at": iso(), "decided_at": None, "decided_by": None,
           "decision_note": None, "zoho_txn_id": None, "zoho_mode": None, "trip_id": tid,
           "history": [{"at": iso(), "status": "pending", "by": user["name"], "note": f"from trip {t['number']}"}]}
    existing = await db.stock_requests.find_one({"client_ref": req["client_ref"]}, NOPROJ)
    if existing:
        rid = existing["id"]
    else:
        await db.stock_requests.insert_one(dict(req))
    done = await approve_request(rid, DecisionIn(note=f"Issued for trip {t['number']}"), user)
    await trip_transition(tid, user, RESERVING, "issued", extra={"issued_request_id": rid, "issued_at": iso()})
    return {"trip_id": tid, "request": done}


class ReorderIn(BaseModel):
    items: List[TripItem] = []  # empty -> all shortages
    supplier: str = ""
    notes: str = ""


@api.post("/trips/{tid}/reorder")
async def reorder_trip(tid: str, body: ReorderIn, user=Depends(roles("manager", "admin"))):
    t = await enrich_trip(await get_trip_or_404(tid, user))
    if body.items:
        items = await trip_items(body.items)
    else:
        items = [{k: i[k] for k in ("product_id", "sku", "name", "unit")} | {"qty": i["short"]} for i in t["items"] if i["short"] > 0]
    if not items:
        raise HTTPException(400, "Nothing is short for this trip")
    return await make_reorder(user, t["warehouse_id"], items, body.supplier, body.notes, trip=t)


async def make_reorder(user, warehouse_id, items, supplier="", notes="", trip=None):
    doc = {"id": nid(), "number": f"RO-{now().strftime('%y%m%d')}-{uuid.uuid4().hex[:4].upper()}", "warehouse_id": warehouse_id,
           "items": [{**i, "received": 0} for i in items], "supplier": supplier, "notes": notes, "status": "open",
           "trip_id": trip["id"] if trip else None, "trip_number": trip["number"] if trip else None,
           "needed_by": trip["start_date"] if trip else None, "created_by": user["name"], "created_at": iso(),
           "history": [{"at": iso(), "status": "open", "by": user["name"]}]}
    await db.reorders.insert_one(dict(doc))
    await audit(user, "reorder.create", "reorder", doc["id"], {"number": doc["number"], "trip": doc["trip_number"]})
    await notify(f"Reorder {doc['number']} raised", f"{len(items)} line(s) for {warehouse_id}" + (f" · trip {trip['number']} on {trip['start_date']}" if trip else ""),
                 kind="warning", roles_=["manager", "admin"], warehouse_id=warehouse_id, ref={"type": "reorder", "id": doc["id"]})
    return doc


class ReorderNewIn(BaseModel):
    warehouse_id: str
    items: List[TripItem] = Field(min_length=1)
    supplier: str = ""
    notes: str = ""


@api.post("/reorders")
async def create_reorder(body: ReorderNewIn, user=Depends(roles("manager", "admin"))):
    ensure_wh_access(user, body.warehouse_id)
    return await make_reorder(user, body.warehouse_id, await trip_items(body.items), body.supplier, body.notes)


@api.get("/reorders")
async def list_reorders(status: Optional[str] = None, warehouse_id: Optional[str] = None, user=Depends(roles("manager", "admin"))):
    wh = scope_wh(user, warehouse_id)
    filt = {**({"warehouse_id": wh} if wh else {}), **({"status": status} if status and status != "all" else {})}
    return await db.reorders.find(filt, NOPROJ).sort("created_at", -1).to_list(300)


@api.get("/reorders/{oid}")
async def get_reorder(oid: str, user=Depends(roles("manager", "admin"))):
    r = await db.reorders.find_one({"id": oid}, NOPROJ)
    if not r:
        raise HTTPException(404, "Reorder not found")
    ensure_wh_access(user, r["warehouse_id"])
    return r


class ReorderStatusIn(BaseModel):
    status: Literal["ordered", "cancelled"]
    note: str = ""


@api.post("/reorders/{oid}/status")
async def reorder_status(oid: str, body: ReorderStatusIn, user=Depends(roles("manager", "admin"))):
    r = await get_reorder(oid, user)
    allowed = {"ordered": ["open"], "cancelled": ["open", "ordered"]}[body.status]
    upd = await db.reorders.find_one_and_update({"id": oid, "status": {"$in": allowed}}, {"$set": {"status": body.status},
                                                "$push": {"history": {"at": iso(), "status": body.status, "by": user["name"], "note": body.note}}})
    if not upd:
        raise HTTPException(409, f"Reorder is {r['status']}")
    await audit(user, f"reorder.{body.status}", "reorder", oid, {"note": body.note})
    return await db.reorders.find_one({"id": oid}, NOPROJ)


# ---------------------------------------------------------------- stock trace (full history of one product)
@api.get("/products/{pid}/trace")
async def product_trace(pid: str, warehouse_id: Optional[str] = None, user=Depends(current_user)):
    p = await db.products.find_one({"id": pid}, NOPROJ)
    if not p:
        raise HTTPException(404, "Product not found")
    wh = scope_wh(user, warehouse_id)
    whf = {"warehouse_id": wh} if wh else {}
    moves = await db.movements.find({"product_id": pid, **whf}, NOPROJ).sort("at", -1).to_list(500)
    # running balance (newest first): walk backwards from current totals
    totals = await warehouse_totals(wh)
    bal = {w: totals.get((pid, w), 0) for w in (["QLD", "NSW"] if not wh else [wh])}
    for m in moves:
        m["balance_after"] = bal.get(m["warehouse_id"], 0)
        bal[m["warehouse_id"]] = bal.get(m["warehouse_id"], 0) - m["delta"]
    trips = await db.trips.find({"items.product_id": pid, "status": {"$in": ["pending", *RESERVING]}, **whf}, NOPROJ).sort("start_date", 1).to_list(100)
    reservations = [{"trip_id": t["id"], "number": t["number"], "status": t["status"], "start_date": t["start_date"], "warehouse_id": t["warehouse_id"],
                     "driller_name": t["driller_name"], "rig_number": t["rig_number"],
                     "qty": sum(i["qty"] for i in t["items"] if i["product_id"] == pid)} for t in trips]
    ros = await db.reorders.find({"items.product_id": pid, "status": {"$in": ["open", "ordered"]}, **whf}, NOPROJ).sort("created_at", -1).to_list(50)
    reorders = [{"id": r["id"], "number": r["number"], "status": r["status"], "warehouse_id": r["warehouse_id"], "needed_by": r.get("needed_by"),
                 "qty": sum(i["qty"] - i.get("received", 0) for i in r["items"] if i["product_id"] == pid)} for r in ros]
    full = await product_with_stock(p, wh)
    return {"product": full, "movements": moves, "reservations": reservations, "reorders": reorders}


# ---------------------------------------------------------------- stock counts
class CountIn(BaseModel):
    warehouse_id: str
    type: Literal["stocktake", "cycle"]
    bin_ids: List[str] = []
    name: str = ""


@api.post("/counts")
async def create_count(body: CountIn, user=Depends(roles("manager", "admin"))):
    ensure_wh_access(user, body.warehouse_id)
    filt = {"warehouse_id": body.warehouse_id}
    if body.type == "cycle":
        if not body.bin_ids:
            raise HTTPException(400, "Select at least one bin for a cycle count")
        filt["bin_id"] = {"$in": body.bin_ids}
    rows = await db.stock.find(filt, NOPROJ).to_list(10000)
    prods = {p["id"]: p for p in await db.products.find({}, NOPROJ).to_list(5000)}
    bins = {b["id"]: b for b in await db.bins.find({"warehouse_id": body.warehouse_id}, NOPROJ).to_list(5000)}
    lines = [{"id": nid(), "product_id": r["product_id"], "sku": prods[r["product_id"]]["sku"], "name": prods[r["product_id"]]["name"],
              "bin_id": r["bin_id"], "bin_code": bins.get(r["bin_id"], {}).get("code"), "expected": r["qty"], "counted": None}
             for r in rows if r["product_id"] in prods]
    lines.sort(key=lambda x: (x["bin_code"] or "", x["sku"]))
    doc = {"id": nid(), "number": f"CC-{now().strftime('%y%m%d')}-{uuid.uuid4().hex[:4].upper()}", "type": body.type,
           "name": body.name or ("Full stocktake" if body.type == "stocktake" else "Cycle count"),
           "warehouse_id": body.warehouse_id, "status": "open", "lines": lines, "created_by": user["name"],
           "created_at": iso(), "completed_at": None, "zoho_txn_id": None}
    await db.counts.insert_one(dict(doc))
    await audit(user, "count.create", "count", doc["id"], {"number": doc["number"], "type": body.type})
    return doc


@api.get("/counts")
async def list_counts(warehouse_id: Optional[str] = None, user=Depends(roles("manager", "admin"))):
    wh = scope_wh(user, warehouse_id)
    docs = await db.counts.find({"warehouse_id": wh} if wh else {}, {"_id": 0}).sort("created_at", -1).to_list(200)
    for d in docs:
        d["progress"] = sum(1 for ln in d["lines"] if ln["counted"] is not None)
        d["total"] = len(d["lines"])
        d["variances"] = sum(1 for ln in d["lines"] if ln["counted"] is not None and ln["counted"] != ln["expected"])
        d.pop("lines")
    return docs


@api.get("/counts/{cid}")
async def get_count(cid: str, user=Depends(roles("manager", "admin"))):
    c = await db.counts.find_one({"id": cid}, NOPROJ)
    if not c:
        raise HTTPException(404, "Count not found")
    ensure_wh_access(user, c["warehouse_id"])
    return c


class CountLineIn(BaseModel):
    line_id: str
    counted: int = Field(ge=0)


@api.post("/counts/{cid}/lines")
async def record_count(cid: str, body: CountLineIn, user=Depends(roles("manager", "admin"))):
    c = await db.counts.find_one({"id": cid}, NOPROJ)
    if not c or c["status"] != "open":
        raise HTTPException(400, "Count is not open")
    ensure_wh_access(user, c["warehouse_id"])
    res = await db.counts.update_one({"id": cid, "lines.id": body.line_id},
                                     {"$set": {"lines.$.counted": body.counted, "lines.$.counted_by": user["name"], "lines.$.counted_at": iso()}})
    if res.matched_count == 0:
        raise HTTPException(404, "Line not found")
    return {"ok": True}


@api.post("/counts/{cid}/complete")
async def complete_count(cid: str, user=Depends(roles("manager", "admin"))):
    c = await db.counts.find_one({"id": cid}, NOPROJ)
    if not c:
        raise HTTPException(404, "Count not found")
    ensure_wh_access(user, c["warehouse_id"])
    if any(ln["counted"] is None for ln in c["lines"]):
        raise HTTPException(400, "All lines must be counted before completing")
    locked = await db.counts.find_one_and_update({"id": cid, "status": "open"}, {"$set": {"status": "processing"}})
    if not locked:
        raise HTTPException(409, "Count already completed")
    # variance against live stock at completion time
    adj = []
    for ln in c["lines"]:
        live = await db.stock.find_one({"product_id": ln["product_id"], "bin_id": ln["bin_id"]}, NOPROJ)
        delta = ln["counted"] - (live["qty"] if live else 0)
        if delta:
            adj.append({**ln, "delta": delta})
    txn = None
    try:
        if adj:
            res = await zoho_adjust(user, f"{c['type'].title()} {c['number']}", c["warehouse_id"],
                                    [{"product_id": a["product_id"], "sku": a["sku"], "delta": a["delta"]} for a in adj], {"type": "count", "id": cid})
            txn = res["txn_id"]
    except HTTPException:
        await db.counts.update_one({"id": cid}, {"$set": {"status": "open"}})
        raise
    for a in adj:
        await db.stock.update_one({"product_id": a["product_id"], "bin_id": a["bin_id"]}, {"$set": {"qty": a["counted"]}, "$setOnInsert": {"id": nid(), "warehouse_id": c["warehouse_id"]}}, upsert=True)
        p = await db.products.find_one({"id": a["product_id"]}, NOPROJ)
        await db.movements.insert_one({"id": nid(), "at": iso(), "type": "count_adjust", "warehouse_id": c["warehouse_id"], "bin_id": a["bin_id"],
                                       "bin_code": a["bin_code"], "product_id": a["product_id"], "sku": p["sku"], "product_name": p["name"],
                                       "delta": a["delta"], "ref": {"type": "count", "id": cid, "number": c["number"]}, "user_name": user["name"]})
        await db.discrepancies.insert_one({"id": nid(), "at": iso(), "count_id": cid, "count_number": c["number"], "warehouse_id": c["warehouse_id"],
                                           "product_id": a["product_id"], "sku": a["sku"], "name": a["name"], "bin_code": a["bin_code"],
                                           "expected": a["counted"] - a["delta"], "counted": a["counted"], "variance": a["delta"], "by": user["name"]})
    await db.counts.update_one({"id": cid}, {"$set": {"status": "completed", "completed_at": iso(), "zoho_txn_id": txn, "adjusted_lines": len(adj)}})
    await audit(user, "count.complete", "count", cid, {"number": c["number"], "adjusted": len(adj), "zoho_txn_id": txn})
    if adj:
        await notify(f"{c['number']} completed with {len(adj)} variance(s)", "Review the discrepancy report", kind="warning",
                     roles_=["manager", "admin"], warehouse_id=c["warehouse_id"], ref={"type": "count", "id": cid})
        await check_low_stock(c["warehouse_id"], [a["product_id"] for a in adj])
    return await db.counts.find_one({"id": cid}, NOPROJ)


# ---------------------------------------------------------------- reports
@api.get("/reports/low-stock")
async def report_low(warehouse_id: Optional[str] = None, user=Depends(current_user)):
    return await low_stock_list(scope_wh(user, warehouse_id))


@api.get("/reports/discrepancies")
async def report_disc(warehouse_id: Optional[str] = None, user=Depends(roles("manager", "admin"))):
    wh = scope_wh(user, warehouse_id)
    return await db.discrepancies.find({"warehouse_id": wh} if wh else {}, NOPROJ).sort("at", -1).to_list(500)


@api.get("/movements")
async def list_movements(warehouse_id: Optional[str] = None, product_id: Optional[str] = None, user=Depends(current_user)):
    wh = scope_wh(user, warehouse_id)
    filt = {**({"warehouse_id": wh} if wh else {}), **({"product_id": product_id} if product_id else {})}
    return await db.movements.find(filt, NOPROJ).sort("at", -1).to_list(300)


@api.get("/audit")
async def list_audit(user=Depends(roles("admin", "manager"))):
    return await db.audit_logs.find({}, NOPROJ).sort("at", -1).to_list(300)


@api.get("/dashboard")
async def dashboard(warehouse_id: Optional[str] = None, user=Depends(current_user)):
    wh = scope_wh(user, warehouse_id)
    whf = {"warehouse_id": wh} if wh else {}
    req_f = {"submitted_by_id": user["id"]} if user["role"] == "driller" else whf
    pending = await db.stock_requests.count_documents({**req_f, "status": "pending"})
    low = await low_stock_list(wh)
    out = await db.equipment.count_documents({**whf, "status": "checked_out"})
    avail = await db.equipment.count_documents({**whf, "status": "available"})
    overdue = await db.equipment_loans.count_documents({**whf, "status": "out", "due_at": {"$lt": iso()}})
    my_out = await db.equipment_loans.count_documents({"driller_id": user["id"], "status": "out"})
    open_counts = await db.counts.count_documents({**whf, "status": "open"}) if user["role"] != "driller" else 0
    recent = await db.movements.find(whf, NOPROJ).sort("at", -1).to_list(6)
    zs = await zoho_settings()
    return {"pending_requests": pending, "low_stock_count": len(low), "low_stock": low[:5], "equipment_out": out,
            "equipment_available": avail, "equipment_overdue": overdue, "my_equipment_out": my_out, "open_counts": open_counts,
            "recent_movements": recent, "zoho_connected": bool(zs.get("connected")), "zoho_mode": "live" if zoho.is_live(zs) else "mock"}


# ---------------------------------------------------------------- notifications
def notif_filter(user):
    return {"$or": [{"user_id": user["id"]},
                    {"user_id": None, "roles": user["role"],
                     **({"warehouse_id": {"$in": [user["warehouse_id"], None]}} if user["role"] == "manager" else {})}]}


@api.get("/notifications")
async def list_notifs(user=Depends(current_user)):
    docs = await db.notifications.find(notif_filter(user), NOPROJ).sort("at", -1).to_list(200)
    for d in docs:
        d["read"] = user["id"] in d.pop("read_by", [])
    return docs


@api.get("/notifications/unread-count")
async def unread(user=Depends(current_user)):
    return {"count": await db.notifications.count_documents({**notif_filter(user), "read_by": {"$ne": user["id"]}})}


@api.post("/notifications/read-all")
async def read_all(user=Depends(current_user)):
    await db.notifications.update_many(notif_filter(user), {"$addToSet": {"read_by": user["id"]}})
    return {"ok": True}


# ---------------------------------------------------------------- equipment
@api.get("/equipment")
async def list_equipment(status: Optional[str] = None, warehouse_id: Optional[str] = None, user=Depends(current_user)):
    wh = scope_wh(user, warehouse_id)
    eqs = await db.equipment.find({"warehouse_id": wh} if wh else {}, NOPROJ).sort("code", 1).to_list(1000)
    loans = {ln["id"]: ln for ln in await db.equipment_loans.find({"status": "out"}, NOPROJ).to_list(1000)}
    out = []
    nowi = iso()
    for e in eqs:
        loan = loans.get(e.get("current_loan_id"))
        e["current_loan"] = loan
        e["overdue"] = bool(loan and loan.get("due_at") and loan["due_at"] < nowi)
        if status == "available" and e["status"] != "available":
            continue
        if status == "out" and e["status"] != "checked_out":
            continue
        if status == "overdue" and not e["overdue"]:
            continue
        if status == "mine" and not (loan and loan["driller_id"] == user["id"]):
            continue
        out.append(e)
    return out


class EquipmentIn(BaseModel):
    code: str
    name: str
    category: str = ""
    warehouse_id: str


@api.post("/equipment")
async def create_equipment(body: EquipmentIn, user=Depends(roles("admin", "manager"))):
    ensure_wh_access(user, body.warehouse_id)
    code = body.code.strip().upper()
    if await db.equipment.find_one({"code": code}):
        raise HTTPException(409, "Equipment ID already exists")
    doc = {"id": nid(), "code": code, "name": body.name, "category": body.category, "warehouse_id": body.warehouse_id,
           "status": "available", "notes": "", "current_loan_id": None}
    await db.equipment.insert_one(dict(doc))
    await audit(user, "equipment.create", "equipment", doc["id"], {"code": code})
    return doc


@api.get("/equipment/{eid}")
async def get_equipment(eid: str, user=Depends(current_user)):
    e = await db.equipment.find_one({"id": eid}, NOPROJ)
    if not e:
        raise HTTPException(404, "Equipment not found")
    hist = await db.equipment_loans.find({"equipment_id": eid}, NOPROJ).sort("checkout_at", -1).to_list(200)
    loan = next((h for h in hist if h["id"] == e.get("current_loan_id")), None)
    return {**e, "current_loan": loan, "overdue": bool(loan and loan.get("due_at") and loan["due_at"] < iso()), "history": hist}


Condition = Literal["good", "fair", "damaged"]


class CheckoutIn(BaseModel):
    driller_name: str
    rig_number: str
    condition: Condition
    notes: str = ""
    photos: List[str] = []
    due_days: int = Field(ge=1, le=90, default=7)


@api.post("/equipment/{eid}/checkout")
async def checkout(eid: str, body: CheckoutIn, user=Depends(current_user)):
    loan_id = nid()
    e = await db.equipment.find_one_and_update({"id": eid, "status": "available"},
                                               {"$set": {"status": "checked_out", "current_loan_id": loan_id}})
    if not e:
        raise HTTPException(409, "Equipment is not available")
    loan = {"id": loan_id, "equipment_id": eid, "equipment_code": e["code"], "equipment_name": e["name"], "warehouse_id": e["warehouse_id"],
            "driller_id": user["id"], "driller_name": body.driller_name, "rig_number": body.rig_number,
            "checkout_at": iso(), "due_at": (now() + timedelta(days=body.due_days)).isoformat(),
            "checkout_condition": body.condition, "checkout_notes": body.notes, "checkout_photos": body.photos,
            "return_at": None, "return_condition": None, "return_notes": None, "return_photos": [], "status": "out",
            "checked_out_by": user["name"]}
    await db.equipment_loans.insert_one(dict(loan))
    await audit(user, "equipment.checkout", "equipment", eid, {"code": e["code"], "rig": body.rig_number})
    return loan


class ReturnIn(BaseModel):
    condition: Condition
    notes: str = ""
    photos: List[str] = []


@api.post("/equipment/{eid}/return")
async def return_equipment(eid: str, body: ReturnIn, user=Depends(current_user)):
    e = await db.equipment.find_one({"id": eid, "status": "checked_out"}, NOPROJ)
    if not e:
        raise HTTPException(409, "Equipment is not checked out")
    loan = await db.equipment_loans.find_one_and_update({"id": e["current_loan_id"], "status": "out"}, {"$set": {
        "status": "returned", "return_at": iso(), "return_condition": body.condition, "return_notes": body.notes,
        "return_photos": body.photos, "returned_by": user["name"]}})
    if not loan:
        raise HTTPException(409, "Loan already closed")
    new_status = "maintenance" if body.condition == "damaged" else "available"
    await db.equipment.update_one({"id": eid}, {"$set": {"status": new_status, "current_loan_id": None}})
    await audit(user, "equipment.return", "equipment", eid, {"code": e["code"], "condition": body.condition})
    if body.condition == "damaged":
        await notify(f"{e['code']} returned damaged", f"{e['name']} returned by {loan['driller_name']}: {body.notes or 'no notes'}",
                     kind="error", roles_=["manager", "admin"], warehouse_id=e["warehouse_id"], ref={"type": "equipment", "id": eid})
    return await db.equipment_loans.find_one({"id": loan["id"]}, NOPROJ)


@api.post("/equipment/{eid}/available")
async def mark_available(eid: str, user=Depends(roles("admin", "manager"))):
    e = await db.equipment.find_one_and_update({"id": eid, "status": "maintenance"}, {"$set": {"status": "available"}})
    if not e:
        raise HTTPException(409, "Equipment is not in maintenance")
    await audit(user, "equipment.available", "equipment", eid, {})
    return {"ok": True}


# ---------------------------------------------------------------- uploads
ALLOWED = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}


@api.post("/upload")
async def upload(file: UploadFile = File(...), user=Depends(current_user)):
    ctype = file.content_type or "image/jpeg"
    if ctype not in ALLOWED:
        raise HTTPException(400, "Only JPEG, PNG or WEBP images are allowed")
    data = await file.read()
    if len(data) > 8 * 1024 * 1024:
        raise HTTPException(400, "Image too large (max 8MB)")
    path = f"{APP_NAME}/uploads/{user['id']}/{uuid.uuid4()}.{ALLOWED[ctype]}"
    try:
        res = await run_in_threadpool(storage.put_object, path, data, ctype)
    except Exception as e:  # noqa: BLE001
        logger.error("upload failed: %s", e)
        raise HTTPException(424, "Photo upload failed, please retry")
    await db.files.insert_one({"id": nid(), "storage_path": res["path"], "owner_id": user["id"], "content_type": ctype,
                               "size": len(data), "created_at": iso(), "is_deleted": False})
    return {"path": res["path"]}


@api.get("/files/{path:path}")
async def get_file(path: str, user=Depends(current_user)):
    rec = await db.files.find_one({"storage_path": path, "is_deleted": False})
    if not rec:
        raise HTTPException(404, "File not found")
    data, ctype = await run_in_threadpool(storage.get_object, path)
    return Response(content=data, media_type=rec.get("content_type", ctype), headers={"Cache-Control": "private, max-age=86400"})


# ---------------------------------------------------------------- zoho settings
class ZohoSettingsIn(BaseModel):
    client_id: str = ""
    client_secret: str = ""
    organization_id: str = ""
    data_center: Literal["com", "com.au", "eu", "in"] = "com.au"
    redirect_uri: str = ""
    qld_warehouse_id: str = ""
    nsw_warehouse_id: str = ""
    adjustment_account_id: str = ""
    mode: Literal["mock", "live"] = "mock"
    auto_sync: bool = True


def mask(s: str):
    return (s[:4] + "\u2022" * 8) if s else ""


@api.get("/zoho/settings")
async def get_zoho(user=Depends(roles("admin"))):
    s = await zoho_settings()
    whs = {w["id"]: w for w in await db.warehouses.find({}, NOPROJ).to_list(10)}
    return {"client_id": s.get("client_id", ""), "client_secret_masked": mask(zoho.dec(s.get("client_secret", ""))),
            "organization_id": s.get("organization_id", ""), "data_center": s.get("data_center", "com.au"),
            "redirect_uri": s.get("redirect_uri", ""), "auto_sync": s.get("auto_sync", True),
            "adjustment_account_id": s.get("adjustment_account_id", ""), "selected_mode": s.get("mode", "mock"),
            "qld_warehouse_id": whs.get("QLD", {}).get("zoho_warehouse_id", ""), "nsw_warehouse_id": whs.get("NSW", {}).get("zoho_warehouse_id", ""),
            "connected": bool(s.get("refresh_token")) if s.get("mode") == "live" else bool(s.get("connected")),
            "connected_at": s.get("connected_at"), "has_refresh_token": bool(s.get("refresh_token")),
            "location_kind": s.get("location_kind", "location"), "last_import": s.get("last_import"),
            "organizations": s.get("organizations") or [],
            "mode": "live" if zoho.is_live(s) else "mock"}


@api.put("/zoho/settings")
async def save_zoho(body: ZohoSettingsIn, user=Depends(roles("admin"))):
    data = body.model_dump()
    upd = {k: v.strip() if isinstance(v, str) else v for k, v in data.items() if k not in ("qld_warehouse_id", "nsw_warehouse_id", "client_secret")}
    if body.client_secret.strip():
        upd["client_secret"] = zoho.enc(body.client_secret.strip())
    if not upd.get("organization_id"):
        upd.pop("organization_id", None)  # never wipe an auto-detected org with a blank field
    await db.zoho_settings.update_one({"id": "default"}, {"$set": upd, "$setOnInsert": {"id": "default"}}, upsert=True)
    await db.warehouses.update_one({"id": "QLD"}, {"$set": {"zoho_warehouse_id": body.qld_warehouse_id.strip()}})
    await db.warehouses.update_one({"id": "NSW"}, {"$set": {"zoho_warehouse_id": body.nsw_warehouse_id.strip()}})
    await audit(user, "zoho.settings", "zoho", "default", {"org": body.organization_id, "dc": body.data_center, "mode": body.mode})
    return await get_zoho(user)


@api.post("/zoho/connect")
async def connect_zoho(user=Depends(roles("admin"))):
    s = await zoho_settings()
    if s.get("mode") == "live":
        missing = [k for k in ("client_id", "client_secret", "redirect_uri") if not s.get(k)]
        if missing:
            raise HTTPException(400, f"Save these first: {', '.join(missing)}")
        state = uuid.uuid4().hex
        await db.zoho_settings.update_one({"id": "default"}, {"$set": {"oauth_state": state, "oauth_state_at": iso()}})
        await audit(user, "zoho.connect_start", "zoho", "default", {})
        return {"auth_url": zoho.auth_url(s, state), "mode": "live"}
    await db.zoho_settings.update_one({"id": "default"}, {"$set": {"connected": True, "connected_at": iso()}, "$setOnInsert": {"id": "default"}}, upsert=True)
    await audit(user, "zoho.connect", "zoho", "default", {"mode": "mock"})
    return {"auth_url": None, "mode": "mock", "connected": True}


def _page(title, msg, ok=True):
    color = "#00A651" if ok else "#D32F2F"
    return HTMLResponse(f"<html><head><meta name='viewport' content='width=device-width,initial-scale=1'/></head>"
                        f"<body style='font-family:Arial;background:#121212;color:#F2F2F2;padding:32px;text-align:center'>"
                        f"<h1 style='color:{color}'>{title}</h1><p style='font-size:18px'>{msg}</p>"
                        f"<p>You can close this window and return to DrillStock Pro.</p></body></html>", status_code=200 if ok else 400)


@api.get("/zoho/callback")
async def zoho_callback(code: str = "", state: str = "", error: str = "",
                        accounts_server: str = Query("", alias="accounts-server"), location: str = ""):
    s = await zoho_settings()
    if error:
        return _page("Zoho connection cancelled", error, ok=False)
    if not state or state != s.get("oauth_state"):
        return _page("Connection failed", "Invalid or expired request. Tap Connect again in the app.", ok=False)
    allowed = {u[0] for u in zoho.DCS.values()}
    try:
        tok = await run_in_threadpool(zoho.exchange_code, s, code, accounts_server if accounts_server in allowed else "")
    except zoho.ZohoError as e:
        return _page("Connection failed", str(e), ok=False)
    upd = {"refresh_token": zoho.enc(tok["refresh_token"]), "connected": True, "connected_at": iso(), "oauth_state": None}
    dc = {"au": "com.au", "us": "com", "eu": "eu", "in": "in"}.get(location.lower())
    if dc:
        upd["data_center"] = dc  # Zoho tells us the account's real data center
    await db.zoho_settings.update_one({"id": "default"}, {"$set": upd})
    s = await zoho_settings()
    msg = "Next: map your QLD and NSW locations, then import items."
    try:
        orgs = await run_in_threadpool(zoho.list_organizations, s)
        await db.zoho_settings.update_one({"id": "default"}, {"$set": {"organizations": orgs}})
        if not s.get("organization_id") and len(orgs) > 1:
            # prefer the org that actually has multiple locations / items
            best = None
            for o in orgs:
                try:
                    _, locs = await run_in_threadpool(zoho.list_locations, {**s, "organization_id": o["id"]})
                    if best is None or len(locs) > best[1]:
                        best = (o, len(locs))
                except zoho.ZohoError:
                    continue
            if best and best[1] > 1:
                orgs = [best[0]]
        if not s.get("organization_id") and len(orgs) == 1:
            await db.zoho_settings.update_one({"id": "default"}, {"$set": {"organization_id": orgs[0]["id"]}})
            msg = f"Organization “{orgs[0]['name']}” selected. " + msg
        elif not s.get("organization_id") and len(orgs) > 1:
            msg = "Pick your organization in the app, then map locations and import items."
        s = await zoho_settings()
        if s.get("organization_id"):
            kind, _ = await run_in_threadpool(zoho.list_locations, s)
            await db.zoho_settings.update_one({"id": "default"}, {"$set": {"location_kind": kind}})
    except zoho.ZohoError as e:
        logger.warning("post-connect probe failed: %s", e)
    return _page("Zoho connected", msg)


@api.post("/zoho/disconnect")
async def disconnect_zoho(user=Depends(roles("admin"))):
    await db.zoho_settings.update_one({"id": "default"}, {"$set": {"connected": False, "refresh_token": None}})
    await audit(user, "zoho.disconnect", "zoho", "default", {})
    return {"ok": True}


async def live_settings():
    s = await zoho_settings()
    if not zoho.is_live(s):
        raise HTTPException(400, "Switch to Live mode and connect Zoho first")
    return s


@api.get("/zoho/locations")
async def zoho_locations(user=Depends(roles("admin"))):
    s = await live_settings()
    if not s.get("organization_id"):
        orgs = s.get("organizations") or []
        raise HTTPException(400, "Pick your Zoho organization first (Organization field), then Save settings"
                            + (f": {', '.join(o['name'] + ' ' + o['id'] for o in orgs)}" if orgs else ""))
    try:
        kind, locs = await run_in_threadpool(zoho.list_locations, s)
    except zoho.ZohoError as e:
        raise HTTPException(424, str(e))
    await db.zoho_settings.update_one({"id": "default"}, {"$set": {"location_kind": kind}})
    return {"kind": kind, "locations": locs}


class ImportIn(BaseModel):
    sync_stock: bool = True


async def unassigned_bin(wh):
    code = f"{wh}-UNASSIGNED"
    b = await db.bins.find_one({"code": code}, NOPROJ)
    if not b:
        b = {"id": nid(), "code": code, "warehouse_id": wh, "zone": "Unassigned", "name": "UNASSIGNED",
             "description": "Stock imported from Zoho awaiting put-away", "active": True}
        await db.bins.insert_one(dict(b))
    elif not b.get("active"):
        await db.bins.update_one({"id": b["id"]}, {"$set": {"active": True}})
    return b


@api.post("/zoho/import")
async def zoho_import(body: ImportIn, user=Depends(roles("admin"))):
    """Match Zoho items to app products by SKU (create missing) and align warehouse stock to Zoho."""
    s = await live_settings()
    kind = s.get("location_kind", "location")
    whs = [w for w in await db.warehouses.find({}, NOPROJ).to_list(10) if w.get("zoho_warehouse_id")]
    if not whs:
        raise HTTPException(400, "Map QLD/NSW to Zoho locations first")
    stats = {"created": 0, "updated": 0, "skipped_no_sku": 0, "stock_adjusted": 0, "warehouses": [w["id"] for w in whs]}
    seen = set()
    for w in whs:
        try:
            items = await run_in_threadpool(zoho.list_items, s, w["zoho_warehouse_id"], kind)
        except zoho.ZohoError as e:
            raise HTTPException(424, f"{w['id']}: {e}")
        for it in items:
            if it.get("product_type") == "service" or it.get("item_type") == "sales" or it.get("status") == "inactive":
                continue
            sku = (it.get("sku") or "").strip().upper()
            if not sku:
                stats["skipped_no_sku"] += 1
                continue
            p = await db.products.find_one({"sku": sku}, NOPROJ)
            fields = {"zoho_item_id": str(it["item_id"]), "name": it.get("name") or sku}
            if it.get("description"):
                fields["description"] = it["description"]
            if it.get("unit"):
                fields["unit"] = it["unit"]
            if it.get("reorder_level") not in (None, ""):
                fields["reorder_level"] = int(float(it["reorder_level"]))
            if p:
                if sku not in seen:
                    await db.products.update_one({"id": p["id"]}, {"$set": fields})
                    stats["updated"] += 1
            else:
                p = {"id": nid(), "sku": sku, "description": "", "unit": "ea", "reorder_level": 0, **fields}
                await db.products.insert_one(dict(p))
                stats["created"] += 1
            seen.add(sku)
            if not body.sync_stock:
                continue
            target = int(round(zoho.item_qty(it, w["zoho_warehouse_id"])))
            rows = await db.stock.find({"product_id": p["id"], "warehouse_id": w["id"]}, NOPROJ).sort("qty", -1).to_list(100)
            delta = target - sum(r["qty"] for r in rows)
            if delta == 0:
                continue
            ref = {"type": "zoho_import", "id": "import"}
            if delta > 0:
                b = await unassigned_bin(w["id"])
                await apply_stock(w["id"], b["id"], p["id"], delta, mtype="zoho_sync", ref=ref, user=user, note="Zoho import")
            else:
                need = -delta
                # take from UNASSIGNED first, then largest bins
                ua = await db.bins.find_one({"code": f"{w['id']}-UNASSIGNED"}, NOPROJ)
                rows.sort(key=lambda r: (r["bin_id"] != (ua or {}).get("id"), -r["qty"]))
                for r in rows:
                    if need <= 0:
                        break
                    take = min(need, r["qty"])
                    if take > 0:
                        await apply_stock(w["id"], r["bin_id"], p["id"], -take, mtype="zoho_sync", ref=ref, user=user, note="Zoho import")
                        need -= take
            stats["stock_adjusted"] += 1
    await db.zoho_settings.update_one({"id": "default"}, {"$set": {"last_import": {"at": iso(), **stats}}})
    await audit(user, "zoho.import", "zoho", "default", stats)
    return stats


@api.get("/zoho/sync-log")
async def zoho_log(user=Depends(roles("admin"))):
    return await db.zoho_sync_log.find({}, NOPROJ).sort("at", -1).to_list(100)


@api.get("/")
async def root():
    return {"app": "DrillStock Pro", "ok": True}


app.include_router(api)
app.add_middleware(CORSMiddleware, allow_credentials=True, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.stock_requests.create_index("client_ref", unique=True)
    await db.receipts.create_index("client_ref", unique=True)
    await db.stock.create_index([("product_id", 1), ("bin_id", 1)], unique=True)
    await seed_mod.seed(db)
    try:
        await run_in_threadpool(storage.init_storage)
        logger.info("object storage ready")
    except Exception as e:  # noqa: BLE001
        logger.error("storage init failed: %s", e)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
