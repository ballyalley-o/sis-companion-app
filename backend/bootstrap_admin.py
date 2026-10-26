import asyncio
import os
import uuid
from datetime import datetime, timezone

import bcrypt
from motor.motor_asyncio import AsyncIOMotorClient


async def main():
    if os.environ.get("APP_ENV", "production").lower() == "development":
        raise RuntimeError("Use the development demo seed instead of bootstrapping a production admin")
    email = os.environ["BOOTSTRAP_ADMIN_EMAIL"].strip().lower()
    password = os.environ["BOOTSTRAP_ADMIN_PASSWORD"]
    if len(password) < 14:
        raise RuntimeError("BOOTSTRAP_ADMIN_PASSWORD must contain at least 14 characters")

    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    try:
        db = client[os.environ["DB_NAME"]]
        await db.users.create_index("email", unique=True)
        if await db.users.count_documents({"role": "admin"}, limit=1):
            raise RuntimeError("An administrator already exists; bootstrap is only for an empty deployment")
        if await db.users.find_one({"email": email}, {"_id": 1}):
            raise RuntimeError("That email already exists; account setup requires manual review")
        await db.warehouses.update_one(
            {"id": "QLD"},
            {"$setOnInsert": {"code": "QLD", "name": "Queensland Warehouse", "location": "Brisbane, QLD", "zoho_warehouse_id": ""}},
            upsert=True,
        )
        await db.warehouses.update_one(
            {"id": "NSW"},
            {"$setOnInsert": {"code": "NSW", "name": "New South Wales Warehouse", "location": "Newcastle, NSW", "zoho_warehouse_id": ""}},
            upsert=True,
        )
        await db.users.insert_one({
            "id": uuid.uuid4().hex,
            "email": email,
            "password_hash": bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode(),
            "name": "Site Admin",
            "role": "admin",
            "warehouse_id": None,
            "active": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        print(f"Created initial administrator: {email}")
    finally:
        client.close()


if __name__ == "__main__":
    asyncio.run(main())
