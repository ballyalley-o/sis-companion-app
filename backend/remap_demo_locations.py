"""Explicit, resumable development-only bin relabelling. Run --apply to mutate."""
import argparse
import asyncio
import os
import re
from datetime import datetime, timezone
from pathlib import Path

from bson import json_util
from motor.motor_asyncio import AsyncIOMotorClient

MIGRATION = "warehouse-structure-v1"
COUNTS = {1: [15, 15, 15, 15], 2: [6, 6], 3: [12, 12, 12, 12], 4: [8, 8, 14, 14]}


def mapped(code):
    match = re.fullmatch(r"SEC([1-4])-L([1-4])-B([1-9]\d*)", code or "")
    if not match:
        return False
    section, level, bay = map(int, match.groups())
    return level <= len(COUNTS[section]) and bay <= COUNTS[section][level - 1]


def strings(value):
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for child in value.values():
            yield from strings(child)
    elif isinstance(value, list):
        for child in value:
            yield from strings(child)


async def remap(db, apply=False):
    if os.environ.get("APP_ENV") != "development" or os.environ.get("SEED_DEMO_DATA", "").lower() != "true":
        raise RuntimeError("Location remapping requires development mode and SEED_DEMO_DATA=true")
    settings = await db.zoho_settings.find_one({"id": "default"}) or {}
    if settings.get("refresh_token"):
        raise RuntimeError("Refusing demo remapping on a database with live Zoho credentials")
    journal = await db.map_location_migrations.find_one({"id": MIGRATION})
    if journal and journal.get("state") == "complete":
        print("Location remapping already complete; no changes made.")
        return journal
    if not journal:
        # Capture all references before planning: only unused demo placeholders may be retired.
        snapshot = {name: await db[name].find({}).to_list(None) for name in await db.list_collection_names()}
        refs = set()
        for name, docs in snapshot.items():
            if name not in {"bins", "map_location_migrations"}:
                refs.update(strings(docs))
        bins = snapshot.get("bins", [])
        by_id = {b["id"]: b for b in bins}
        if any(row["bin_id"] not in by_id for row in snapshot.get("stock", [])):
            raise RuntimeError("Stock contains missing bin references; review before remapping")
        plan, used = [], set()
        preferred = ["SEC1-L1-B1", "SEC1-L2-B2", "SEC2-L1-B1", "SEC3-L1-B1", "SEC4-L1-B1", "SEC4-L3-B1"]
        legacy = sorted([b for b in bins if b.get("active") and not mapped(b.get("code"))], key=lambda b: (b["warehouse_id"], b["code"]))
        for index, old in enumerate(legacy):
            free = [b for b in bins if b.get("active") and b.get("map_demo") and mapped(b.get("code"))
                    and b["warehouse_id"] == old["warehouse_id"] and b["id"] not in refs and b["id"] not in used]
            if not free:
                raise RuntimeError(f"No unused structured placeholder for {old['code']}")
            target = min(free, key=lambda b: (b["code"] != preferred[index % 6], b["code"]))
            used.add(target["id"])
            plan.append({"id": old["id"], "old_code": old["code"], "code": target["code"],
                         "warehouse_id": old["warehouse_id"], "placeholder_id": target["id"]})
        # Home storage changes do not alter equipment status, loans, signatures or history.
        equipment = []
        for index, e in enumerate(sorted(snapshot.get("equipment", []), key=lambda e: e["code"])):
            home = by_id.get(e.get("home_bin_id"))
            if home and mapped(home["code"]) or any(p["id"] == e.get("home_bin_id") for p in plan):
                continue
            options = sorted([b for b in bins if b.get("active") and mapped(b.get("code")) and b["warehouse_id"] == e["warehouse_id"] and b["id"] not in used], key=lambda b: b["code"])
            if not options:
                raise RuntimeError(f"No structured home storage for equipment {e['code']}")
            chosen = options[(index * 17) % len(options)]
            equipment.append({"id": e["id"], "code": e["code"], "old_home_bin_id": e.get("home_bin_id"), "home_bin_id": chosen["id"]})
        journal = {"id": MIGRATION, "state": "planned", "bins": plan, "equipment": equipment,
                   "created_at": datetime.now(timezone.utc).isoformat()}
        print(f"Plan: relabel {len(plan)} bins, assign {len(equipment)} equipment home bins; stock rows and quantities unchanged.")
        for change in plan:
            print(f"  {change['old_code']} -> {change['code']} ({change['warehouse_id']})")
        if not apply:
            return journal
        backup = Path(f"/tmp/{MIGRATION}-backup.json")
        with backup.open("x") as handle:
            os.chmod(backup, 0o600)
            handle.write(json_util.dumps(snapshot))
        journal["backup_path"] = str(backup)
        await db.map_location_migrations.insert_one(journal)
    if not apply:
        print("Pending migration can be resumed with --apply.")
        return journal
    # Refuse newly referenced placeholders if an earlier attempt was interrupted.
    placeholders = {p["placeholder_id"] for p in journal["bins"]}
    for name in await db.list_collection_names():
        if name in {"bins", "map_location_migrations"}:
            continue
        for document in await db[name].find({}).to_list(None):
            if placeholders.intersection(strings(document)):
                raise RuntimeError("A placeholder gained references; review before resuming the migration")
    for change in journal["bins"]:
        # Keep placeholder QR URLs resolvable, while the original occupied bin keeps its ID.
        await db.bins.update_one({"id": change["placeholder_id"]}, {"$set": {
            "active": False, "code": f"RETIRED-{change['placeholder_id']}",
            "previous_code": change["code"], "redirect_bin_id": change["id"], "location_migration": MIGRATION,
        }})
        await db.bins.update_one({"id": change["id"]}, {"$set": {
            "code": change["code"], "zone": change["code"].split("-")[0], "location_migration": MIGRATION,
            "description": f"Mock warehouse location · {change['code']}",
        }, "$addToSet": {"aliases": change["old_code"]}})
    for change in journal["equipment"]:
        await db.equipment.update_one({"id": change["id"]}, {"$set": {"home_bin_id": change["home_bin_id"], "location_migration": MIGRATION}})
    await db.map_location_migrations.update_one({"id": MIGRATION}, {"$set": {"state": "complete", "completed_at": datetime.now(timezone.utc).isoformat()}})
    print("All mock locations remapped. Original bin IDs, stock quantities and transaction history preserved.")
    return journal


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    try:
        await remap(client[os.environ["DB_NAME"]], args.apply)
    finally:
        client.close()


if __name__ == "__main__":
    asyncio.run(main())
