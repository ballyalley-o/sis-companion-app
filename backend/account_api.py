"""User self-service, rig account dashboards, and operational pallet records."""
import re
from typing import Literal, Optional
import bcrypt
from fastapi import Depends, HTTPException
from pydantic import BaseModel, Field, field_validator, ConfigDict
from pymongo.errors import DuplicateKeyError
from account_policy import REGIONAL_ROLES, USER_ROLES, can_view_rig

NOPROJ = {"_id": 0}


class ProfileIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=100)
    photo_path: Optional[str] = Field(default=None, max_length=500)

    @field_validator("name")
    @classmethod
    def name_not_blank(cls, value):
        if not value.strip():
            raise ValueError("Enter a name")
        return value.strip()


class PasswordIn(BaseModel):
    current_password: str = Field(min_length=1, max_length=72)
    new_password: str = Field(min_length=12, max_length=72)

    @field_validator("current_password", "new_password")
    @classmethod
    def byte_limit(cls, value):
        if len(value.encode()) > 72:
            raise ValueError("Password must be at most 72 UTF-8 bytes")
        return value


class AssignmentIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    rig_id: Optional[str] = None
    warehouse_id: Optional[Literal["QLD", "NSW"]] = None
    role: Literal["driller", "manager", "senior_drilling_manager", "general_manager", "administrator_2", "admin"]
    active: Optional[bool] = None


class RigProfileIn(BaseModel):
    warehouse_id: Literal["QLD", "NSW"]
    base_area: str = Field(default="", max_length=200)
    supervisor_id: Optional[str] = None


class PalletIn(BaseModel):
    reference: str = Field(min_length=1, max_length=80)
    description: str = Field(default="", max_length=1000)
    bin_id: str

    @field_validator("reference")
    @classmethod
    def reference_not_blank(cls, value):
        if not value.strip():
            raise ValueError("Enter a pallet reference")
        return value.strip().upper()


class PalletMoveIn(BaseModel):
    status: Literal["stored", "released"]
    bin_id: Optional[str] = None


def register_account_routes(api, db, current_user, roles, public_user, audit, make_token, iso, nid):
    async def rig_for(rig_id, user):
        rig = await db.rigs.find_one({"id": rig_id}, NOPROJ)
        if not rig:
            raise HTTPException(404, "Rig not found")
        if not can_view_rig(user, rig):
            raise HTTPException(403, "This rig is outside your account access")
        return rig

    async def supervisor_for(rig):
        if not rig.get("supervisor_id"):
            return None
        return await db.users.find_one({"id": rig["supervisor_id"], "active": True}, {"_id": 0, "id": 1, "name": 1, "role": 1, "warehouse_id": 1})

    async def operations_bin(bin_id, warehouse):
        bin_ = await db.bins.find_one({"id": bin_id, "warehouse_id": warehouse, "active": True}, NOPROJ)
        if not bin_ or not re.fullmatch(r"SEC1-L[1-4]-B(?:[1-9]|1[0-5])", bin_.get("code", "")):
            raise HTTPException(422, "Choose an active SEC1 Operations rack bin in the rig's warehouse")
        return bin_

    @api.get("/account")
    async def account(user=Depends(current_user)):
        rig = await db.rigs.find_one({"id": user.get("rig_id")}, NOPROJ) if user.get("rig_id") else None
        if rig and not can_view_rig(user, rig):
            rig = None
        return {"user": public_user(user), "rig": rig, "supervisor": await supervisor_for(rig) if rig else None}

    @api.patch("/account")
    async def update_profile(body: ProfileIn, user=Depends(current_user)):
        if body.photo_path and not await db.files.find_one({"storage_path": body.photo_path, "owner_id": user["id"], "is_deleted": False, "content_type": {"$in": ["image/jpeg", "image/png", "image/webp"]}}):
            raise HTTPException(403, "Choose a photo uploaded by your account")
        await db.users.update_one({"id": user["id"]}, {"$set": body.model_dump(exclude_unset=True)})
        await audit(user, "account.profile", "user", user["id"], {})
        return public_user(await db.users.find_one({"id": user["id"]}, NOPROJ))

    @api.post("/account/password")
    async def change_password(body: PasswordIn, user=Depends(current_user)):
        old_hash = user.get("password_hash")
        if not old_hash or not bcrypt.checkpw(body.current_password.encode(), old_hash.encode()):
            raise HTTPException(400, "Current password is incorrect or password sign-in is not configured")
        if body.current_password == body.new_password:
            raise HTTPException(422, "Choose a different password")
        result = await db.users.update_one({"id": user["id"], "password_hash": old_hash}, {"$set": {"password_hash": bcrypt.hashpw(body.new_password.encode(), bcrypt.gensalt()).decode()}, "$inc": {"token_version": 1}})
        if not result.modified_count:
            raise HTTPException(409, "Account changed; sign in again before retrying")
        fresh = await db.users.find_one({"id": user["id"]}, NOPROJ)
        await audit(user, "account.password", "user", user["id"], {})
        return {"access_token": make_token(fresh), "user": public_user(fresh)}

    @api.patch("/users/{uid}/assignment")
    async def assignment(uid: str, body: AssignmentIn, user=Depends(roles("admin"))):
        target = await db.users.find_one({"id": uid}, NOPROJ)
        if not target:
            raise HTTPException(404, "User not found")
        if uid == user["id"] and (body.role != "admin" or body.active is False):
            raise HTTPException(409, "Another administrator must change your own admin role")
        if body.role in REGIONAL_ROLES and body.warehouse_id not in ("QLD", "NSW"):
            raise HTTPException(422, "Regional managers need QLD or NSW")
        if body.rig_id:
            rig = await db.rigs.find_one({"id": body.rig_id}, NOPROJ)
            if not rig or not body.warehouse_id or rig.get("warehouse_id") != body.warehouse_id:
                raise HTTPException(422, "Rig and user must belong to the same warehouse")
        manages = await db.rigs.find({"supervisor_id": uid}, NOPROJ).to_list(200)
        if manages and (body.role != "senior_drilling_manager" or any(r.get("warehouse_id") != body.warehouse_id for r in manages)):
            raise HTTPException(409, "Reassign this user's supervised rigs before changing their role or region")
        values = body.model_dump(exclude={"active"})
        if body.active is not None:
            values["active"] = body.active
        await db.users.update_one({"id": uid}, {"$set": values, "$inc": {"token_version": 1}})
        await audit(user, "user.assignment", "user", uid, values)
        fresh = await db.users.find_one({"id": uid}, NOPROJ)
        result = public_user(fresh)
        if uid == user["id"]:
            result["access_token"] = make_token(fresh)
        return result

    @api.get("/rig-accounts")
    async def rig_accounts(user=Depends(current_user)):
        if user["role"] not in USER_ROLES or (user["role"] in REGIONAL_ROLES and user.get("warehouse_id") not in ("QLD", "NSW")):
            raise HTTPException(403, "Valid account and warehouse assignment required")
        query = {}
        if user["role"] == "driller":
            query = {"id": user.get("rig_id") or "unassigned", "warehouse_id": user.get("warehouse_id")}
        elif user["role"] in REGIONAL_ROLES:
            query = {"warehouse_id": user.get("warehouse_id")}
        return await db.rigs.find(query, NOPROJ).sort("number", 1).to_list(200)

    @api.patch("/rig-accounts/{rig_id}")
    async def rig_profile(rig_id: str, body: RigProfileIn, user=Depends(roles("manager", "admin"))):
        rig = await db.rigs.find_one({"id": rig_id}, NOPROJ)
        if not rig:
            raise HTTPException(404, "Rig not found")
        # Existing unassigned rigs can be configured only by an administrator or GM.
        if user["role"] in REGIONAL_ROLES and (rig.get("warehouse_id") != user.get("warehouse_id") or body.warehouse_id != user.get("warehouse_id")):
            raise HTTPException(403, "Rig is outside your warehouse")
        if rig.get("warehouse_id") and rig["warehouse_id"] != body.warehouse_id:
            raise HTTPException(409, "Cross-warehouse rig transfers require a separate reviewed migration")
        if body.supervisor_id:
            supervisor = await db.users.find_one({"id": body.supervisor_id, "role": "senior_drilling_manager", "active": True, "warehouse_id": body.warehouse_id}, NOPROJ)
            if not supervisor:
                raise HTTPException(422, "Select an active Senior Drilling Manager in this warehouse")
        await db.rigs.update_one({"id": rig_id}, {"$set": body.model_dump()})
        await audit(user, "rig.profile", "rig", rig_id, body.model_dump())
        return await db.rigs.find_one({"id": rig_id}, NOPROJ)

    @api.get("/rig-supervisors")
    async def rig_supervisors(user=Depends(roles("manager", "admin"))):
        query = {"role": "senior_drilling_manager", "active": True}
        if user["role"] in REGIONAL_ROLES:
            query["warehouse_id"] = user.get("warehouse_id")
        return await db.users.find(query, {"_id": 0, "id": 1, "name": 1, "warehouse_id": 1}).sort("name", 1).to_list(200)

    @api.get("/rig-accounts/{rig_id}")
    async def rig_account(rig_id: str, user=Depends(current_user)):
        rig = await rig_for(rig_id, user)
        query = {"rig_number": rig["number"], "warehouse_id": rig.get("warehouse_id")}
        trips = await db.trips.find(query, {"_id": 0, "id": 1, "number": 1, "site": 1, "start_date": 1, "end_date": 1, "status": 1, "driller_id": 1}).sort("start_date", -1).to_list(100)
        upcoming = await db.trips.find({**query, "end_date": {"$gte": iso()[:10]}, "status": {"$nin": ["cancelled", "rejected"]}}, {"_id": 0, "id": 1, "number": 1, "site": 1, "start_date": 1, "end_date": 1, "status": 1, "driller_id": 1}).sort("start_date", 1).to_list(100)
        loans = await db.equipment_loans.find(query, {"_id": 0, "id": 1, "equipment_id": 1, "equipment_code": 1, "equipment_name": 1, "driller_name": 1, "status": 1, "checkout_at": 1, "due_at": 1, "return_at": 1}).sort("checkout_at", -1).to_list(100)
        requests = await db.stock_requests.find(query, {"_id": 0, "id": 1, "number": 1, "type": 1, "status": 1, "created_at": 1, "submitted_by_id": 1}).sort("created_at", -1).to_list(100)
        movements = await db.movements.find(query, {"_id": 0, "id": 1, "at": 1, "type": 1, "sku": 1, "bin_code": 1, "delta": 1}).sort("at", -1).to_list(100)
        pallets = await db.pallet_allocations.find({"rig_id": rig_id}, NOPROJ).sort("updated_at", -1).to_list(200)
        crew = await db.users.find({"rig_id": rig_id, "active": True, "warehouse_id": rig.get("warehouse_id")}, {"_id": 0, "id": 1, "name": 1, "role": 1}).sort("name", 1).to_list(200)
        history = await db.audit_logs.find({"entity": "rig", "entity_id": rig_id}, {"_id": 0, "id": 1, "at": 1, "action": 1, "user_name": 1}).sort("at", -1).to_list(100)
        return {"rig": rig, "supervisor": await supervisor_for(rig), "crew": crew, "trips": trips, "upcoming": upcoming, "loans": loans, "requests": requests, "movements": movements, "pallets": pallets, "history": history}

    @api.post("/rig-accounts/{rig_id}/pallet")
    async def allocate_pallet(rig_id: str, body: PalletIn, user=Depends(roles("manager", "admin"))):
        rig = await rig_for(rig_id, user)
        bin_ = await operations_bin(body.bin_id, rig.get("warehouse_id"))
        doc = {"_id": f"{rig['warehouse_id']}:{body.reference}", "id": nid(), "rig_id": rig_id, "warehouse_id": rig["warehouse_id"], "reference": body.reference, "description": body.description, "bin_id": bin_["id"], "bin_code": bin_["code"], "status": "stored", "updated_at": iso(), "updated_by": user["name"]}
        try:
            await db.pallet_allocations.insert_one(dict(doc))
        except DuplicateKeyError:
            raise HTTPException(409, "This pallet reference already exists in the warehouse")
        await audit(user, "rig.pallet_allocate", "rig", rig_id, {"reference": body.reference, "bin_code": bin_["code"]})
        doc.pop("_id")
        return doc

    @api.patch("/rig-accounts/{rig_id}/pallet/{pallet_id}")
    async def move_pallet(rig_id: str, pallet_id: str, body: PalletMoveIn, user=Depends(roles("manager", "admin"))):
        rig = await rig_for(rig_id, user)
        pallet = await db.pallet_allocations.find_one({"id": pallet_id, "rig_id": rig_id}, NOPROJ)
        if not pallet:
            raise HTTPException(404, "Pallet allocation not found")
        values = {"status": body.status, "updated_at": iso(), "updated_by": user["name"]}
        if body.bin_id:
            bin_ = await operations_bin(body.bin_id, rig.get("warehouse_id"))
            values.update(bin_id=bin_["id"], bin_code=bin_["code"])
        await db.pallet_allocations.update_one({"id": pallet_id, "rig_id": rig_id}, {"$set": values})
        await audit(user, "rig.pallet_update", "rig", rig_id, {"reference": pallet["reference"], **values})
        return await db.pallet_allocations.find_one({"id": pallet_id}, NOPROJ)
