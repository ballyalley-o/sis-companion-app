"""Opt-in, additive map fixtures. Never reassign existing stock or equipment."""
import asyncio
import os
import uuid

from motor.motor_asyncio import AsyncIOMotorClient


def demo_id(kind, key):
    return uuid.uuid5(uuid.NAMESPACE_URL, f"sis-map-demo/{kind}/{key}").hex


async def seed_map_demo(db):
    if os.environ.get("APP_ENV") != "development" or os.environ.get("SEED_DEMO_DATA", "").lower() != "true":
        raise RuntimeError("Map demo fixtures require development mode and SEED_DEMO_DATA=true")
    count = 0
    for wh in ("QLD", "NSW"):
        for section, counts in [(1, [15]*4), (2, [6]*2), (3, [12]*4), (4, [8, 8, 14, 14])]:
            for level, bays in enumerate(counts, 1):
                for bay in range(1, bays+1):
                    code = f"SEC{section}-L{level}-B{bay}"
                    await db.bins.update_one({"warehouse_id": wh, "code": code}, {"$setOnInsert": {
                        "id": demo_id("bin", f"{wh}/{code}"), "code": code, "warehouse_id": wh,
                        "zone": f"SEC{section}", "description": f"Map test layout · level {level}, bay {bay}",
                        "active": True, "map_demo": True,
                    }}, upsert=True)
        fixtures = [
            ("GLOVES", "Safety gloves · map test", "SEC1-L1-B3", 24),
            ("HELMET", "Safety helmet · map test", "SEC1-L4-B15", 12),
            ("BOLTS", "Rack bolts · map test", "SEC2-L2-B6", 60),
            ("GREASE", "Drill grease · map test", "SEC3-L2-B7", 18),
            ("FILTER", "Oil filter · map test", "SEC3-L4-B12", 10),
            ("HOSE", "Water hose · map test", "SEC4-L1-B8", 8),
            ("COUPLING", "Drill coupling · map test", "SEC4-L2-B4", 16),
            ("BENTONITE", "Bentonite bags · map test", "SEC4-L4-B14", 30),
        ]
        for sku, name, code, qty in fixtures:
            sku = f"MAP-DEMO-{sku}"
            pid = demo_id("product", sku)
            await db.products.update_one({"sku": sku}, {"$setOnInsert": {
                "id": pid, "sku": sku, "name": name, "description": "Sample stock for warehouse locator testing only",
                "unit": "ea", "reorder_level": 0, "zoho_item_id": "", "map_demo": True,
            }}, upsert=True)
            # Avoid attaching stock to a pre-existing product that happens to share a SKU.
            product = await db.products.find_one({"id": pid, "map_demo": True})
            if not product:
                continue
            b = await db.bins.find_one({"warehouse_id": wh, "code": code})
            await db.stock.update_one({"product_id": pid, "warehouse_id": wh, "bin_id": b["id"]}, {"$setOnInsert": {
                "id": demo_id("stock", f"{wh}/{sku}"), "product_id": pid,
                "warehouse_id": wh, "bin_id": b["id"], "qty": qty, "map_demo": True,
            }}, upsert=True)
            count += 1
        for index, (name, code) in enumerate([
            ("Cordless drill · map test", "SEC1-L1-B5"),
            ("Torque wrench · map test", "SEC2-L1-B2"),
            ("Pressure gauge · map test", "SEC3-L3-B9"),
            ("Water pump · map test", "SEC4-L1-B6"),
        ], 1):
            eid = f"MAP-DEMO-{wh}-EQ{index}"
            b = await db.bins.find_one({"warehouse_id": wh, "code": code})
            await db.equipment.update_one({"code": eid}, {"$setOnInsert": {
                "id": demo_id("equipment", eid), "code": eid, "name": name,
                "category": "Map test equipment", "warehouse_id": wh, "status": "available",
                "notes": "Map test fixture", "current_loan_id": None, "home_bin_id": b["id"], "map_demo": True,
            }}, upsert=True)
    print(f"Map demo ready: {count} product locations; 4 equipment examples per warehouse. Existing records preserved.")


async def main():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    try:
        await seed_map_demo(client[os.environ["DB_NAME"]])
    finally:
        client.close()


if __name__ == "__main__":
    asyncio.run(main())
