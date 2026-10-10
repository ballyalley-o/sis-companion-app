"""Idempotent demo seed: only inserts when collections are empty / users missing."""
import os
import uuid
from datetime import datetime, timedelta, timezone

import bcrypt


def hp(p: str) -> str:
    return bcrypt.hashpw(p.encode(), bcrypt.gensalt()).decode()


def nid():
    return uuid.uuid4().hex


PRODUCTS = [
    ("DB-HQ-001", "HQ Diamond Core Bit", "HQ size impregnated diamond core bit, series 10", "ea", 6),
    ("DB-NQ-002", "NQ Diamond Core Bit", "NQ size impregnated diamond core bit, series 8", "ea", 6),
    ("RD-HQ-3M", "HQ Drill Rod 3m", "HQ wireline drill rod, 3 metre", "ea", 20),
    ("RD-NQ-3M", "NQ Drill Rod 3m", "NQ wireline drill rod, 3 metre", "ea", 20),
    ("MUD-POLY-25", "Polymer Drilling Mud 25kg", "PHPA polymer drilling fluid additive", "bag", 15),
    ("MUD-BENT-25", "Bentonite 25kg", "Premium bentonite drilling mud", "bag", 30),
    ("CS-HQ-3M", "HQ Core Barrel Inner Tube", "HQ inner tube assembly 3m", "ea", 4),
    ("RS-HQ", "HQ Reaming Shell", "HQ diamond reaming shell", "ea", 5),
    ("CT-TRAY-HQ", "HQ Core Trays", "Plastic core tray HQ, 5 rows", "ea", 50),
    ("GRS-ROD-20", "Rod Grease 20kg", "Drill rod thread compound grease", "tub", 4),
    ("PPE-GLV-L", "Impact Gloves L", "Hi-vis impact resistant gloves, large", "pair", 24),
    ("FLT-HYD-01", "Hydraulic Filter", "Rig hydraulic return filter element", "ea", 6),
]
EQUIPMENT = [
    ("EQ-1001", "Generator 20kVA", "Power"), ("EQ-1002", "Mud Mixer Pump", "Pumps"),
    ("EQ-1003", "Core Orientation Tool", "Survey"), ("EQ-1004", "Downhole Survey Camera", "Survey"),
    ("EQ-1005", "Hydraulic Torque Wrench", "Tools"), ("EQ-1006", "Water Pump 3in", "Pumps"),
    ("EQ-2001", "Lighting Tower", "Power"), ("EQ-2002", "Rod Handler", "Tools"),
]


async def seed(db):
    now = datetime.now(timezone.utc)
    if await db.warehouses.count_documents({}) == 0:
        await db.warehouses.insert_many([
            {"id": "QLD", "code": "QLD", "name": "Queensland Warehouse", "location": "Brisbane, QLD", "zoho_warehouse_id": ""},
            {"id": "NSW", "code": "NSW", "name": "New South Wales Warehouse", "location": "Newcastle, NSW", "zoho_warehouse_id": ""},
        ])
    if await db.rigs.count_documents({}) == 0:
        await db.rigs.insert_many([{"id": nid(), "number": f"RIG-{i:02d}"} for i in range(1, 9)])

    users = [
        (os.environ["ADMIN_EMAIL"], os.environ["ADMIN_PASSWORD"], "Site Admin", "admin", None),
        ("qld.manager@drillstock.com", "Manager@123", "Kate Morrison", "manager", "QLD"),
        ("nsw.manager@drillstock.com", "Manager@123", "Ben Walsh", "manager", "NSW"),
        ("jake@drillstock.com", "Driller@123", "Jake Turner", "driller", "QLD"),
        ("liam@drillstock.com", "Driller@123", "Liam O'Neill", "driller", "NSW"),
        ("sam@drillstock.com", "Driller@123", "Sam Patel", "driller", "QLD"),
    ]
    for email, pw, name, role, wh in users:
        await db.users.update_one({"email": email}, {"$setOnInsert": {
            "id": nid(), "email": email, "password_hash": hp(pw), "name": name, "role": role,
            "warehouse_id": wh, "active": True, "created_at": now.isoformat()}}, upsert=True)

    if await db.products.count_documents({}) == 0:
        prods = [{"id": nid(), "sku": s, "name": n, "description": d, "unit": u, "reorder_level": r,
                  "zoho_item_id": f"ZI-{s}"} for s, n, d, u, r in PRODUCTS]
        await db.products.insert_many([dict(p) for p in prods])
        bins = []
        for wh in ("QLD", "NSW"):
            for aisle in ("A", "B", "C"):
                for shelf in (1, 2):
                    code = f"{wh}-{aisle}{shelf:02d}"
                    bins.append({"id": nid(), "code": code, "warehouse_id": wh, "zone": f"Aisle {aisle}",
                                 "description": f"Aisle {aisle} shelf {shelf}", "active": True})
        await db.bins.insert_many([dict(b) for b in bins])
        stock = []
        for i, p in enumerate(prods):
            for wh in ("QLD", "NSW"):
                whbins = [b for b in bins if b["warehouse_id"] == wh]
                b = whbins[i % len(whbins)]
                qty = (p["reorder_level"] * 2 + i * 3) if (i + (wh == "NSW")) % 4 else max(p["reorder_level"] - 2, 1)
                stock.append({"id": nid(), "product_id": p["id"], "warehouse_id": wh, "bin_id": b["id"], "qty": qty})
        await db.stock.insert_many(stock)

    if await db.equipment.count_documents({}) == 0:
        await db.equipment.insert_many([
            {"id": nid(), "code": c, "name": n, "category": cat, "warehouse_id": "QLD" if c.startswith("EQ-1") else "NSW",
             "status": "available", "notes": "", "current_loan_id": None}
            for c, n, cat in EQUIPMENT])
        # One overdue demo loan
        eq = await db.equipment.find_one({"code": "EQ-1003"})
        jake = await db.users.find_one({"email": "jake@drillstock.com"})
        loan_id = nid()
        await db.equipment_loans.insert_one({
            "id": loan_id, "equipment_id": eq["id"], "equipment_code": eq["code"], "equipment_name": eq["name"],
            "warehouse_id": eq["warehouse_id"], "driller_id": jake["id"], "driller_name": jake["name"], "rig_number": "RIG-03",
            "checkout_at": (now - timedelta(days=5)).isoformat(), "due_at": (now - timedelta(days=1)).isoformat(),
            "checkout_condition": "good", "checkout_notes": "Calibrated before dispatch", "checkout_photos": [],
            "return_at": None, "return_condition": None, "return_notes": None, "return_photos": [], "status": "out"})
        await db.equipment.update_one({"id": eq["id"]}, {"$set": {"status": "checked_out", "current_loan_id": loan_id}})
