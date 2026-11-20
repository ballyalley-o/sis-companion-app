"""Account route tests with a stub database: never connects to production services."""
import copy
import unittest
from types import SimpleNamespace
import bcrypt
from fastapi import APIRouter, Depends, FastAPI, HTTPException, Request
from fastapi.testclient import TestClient
from pymongo.errors import DuplicateKeyError
from account_api import register_account_routes
from account_policy import can_view_rig, role_allowed, session_current


def matches(doc, query):
    for key, expected in query.items():
        value = doc.get(key)
        if isinstance(expected, dict):
            if "$in" in expected and value not in expected["$in"]:
                return False
            if "$nin" in expected and value in expected["$nin"]:
                return False
            if "$gte" in expected and (value is None or value < expected["$gte"]):
                return False
        elif value != expected:
            return False
    return True


def project(doc, projection):
    if doc is None:
        return None
    if projection and any(v == 1 for v in projection.values()):
        return {k: copy.deepcopy(v) for k, v in doc.items() if projection.get(k) == 1}
    return {k: copy.deepcopy(v) for k, v in doc.items() if not projection or projection.get(k) != 0}


class Cursor:
    def __init__(self, rows):
        self.rows = rows
    def sort(self, key, direction):
        self.rows.sort(key=lambda row: row.get(key) or "", reverse=direction < 0)
        return self
    async def to_list(self, limit):
        return copy.deepcopy(self.rows[:limit])


class Collection:
    def __init__(self, rows=None):
        self.rows = rows or []
    async def find_one(self, query, projection=None):
        return project(next((d for d in self.rows if matches(d, query)), None), projection)
    def find(self, query, projection=None):
        return Cursor([project(d, projection) for d in self.rows if matches(d, query)])
    async def insert_one(self, doc):
        if "_id" in doc and any(d.get("_id") == doc["_id"] for d in self.rows):
            raise DuplicateKeyError("duplicate")
        self.rows.append(copy.deepcopy(doc))
    async def update_one(self, query, update):
        doc = next((d for d in self.rows if matches(d, query)), None)
        if doc is None:
            return SimpleNamespace(modified_count=0)
        doc.update(update.get("$set", {}))
        for key, value in update.get("$inc", {}).items():
            doc[key] = doc.get(key, 0) + value
        return SimpleNamespace(modified_count=1)


class AccountTest(unittest.TestCase):
    def setUp(self):
        self.password = "Current-pass-123"
        self.driller = dict(id="d", name="Driller", role="driller", active=True, warehouse_id="QLD", rig_id="rq", password_hash=bcrypt.hashpw(self.password.encode(), bcrypt.gensalt()).decode())
        self.senior = dict(id="s", name="Senior", role="senior_drilling_manager", active=True, warehouse_id="QLD")
        self.admin = dict(id="a", name="Admin", role="admin", active=True)
        self.gm = dict(id="g", name="General", role="general_manager", active=True)
        self.db = SimpleNamespace(**{key: Collection() for key in ("users", "rigs", "files", "trips", "equipment_loans", "stock_requests", "movements", "pallet_allocations", "audit_logs", "bins")})
        self.db.users.rows = [self.driller, self.senior, self.admin, self.gm]
        self.db.rigs.rows = [dict(id="rq", number="RIG-Q", warehouse_id="QLD", supervisor_id="s"), dict(id="rn", number="RIG-N", warehouse_id="NSW"), dict(id="ru", number="UNASSIGNED")]
        self.db.bins.rows = [dict(id="op", warehouse_id="QLD", active=True, code="SEC1-L1-B1"), dict(id="cons", warehouse_id="QLD", active=True, code="SEC2-L1-B1")]
        self.db.files.rows = [dict(storage_path="mine.jpg", owner_id="d", is_deleted=False, content_type="image/jpeg"), dict(storage_path="other.jpg", owner_id="a", is_deleted=False, content_type="image/jpeg")]
        async def current_user(request: Request):
            return copy.deepcopy(next(u for u in self.db.users.rows if u["id"] == request.headers.get("x-test-user", "d")))
        def roles(*allowed):
            async def dependency(user=Depends(current_user)):
                if not role_allowed(user["role"], allowed):
                    raise HTTPException(403)
                return user
            return dependency
        self.audit = []
        async def audit(*args):
            self.audit.append(args)
        self.version = []
        def token(user):
            self.version.append(user.get("token_version", 0))
            return "test-token"
        def public(user):
            return {k: v for k, v in user.items() if k not in ("password_hash", "token_version")}
        app = FastAPI()
        api = APIRouter(prefix="/api")
        register_account_routes(api, self.db, current_user, roles, public, audit, token, lambda: "2026-11-21T00:00:00+00:00", lambda: "new-id")
        app.include_router(api)
        self.client = TestClient(app)

    def test_self_account_hides_password_hash(self):
        response = self.client.get("/api/account")
        self.assertEqual(response.status_code, 200)
        self.assertNotIn("password_hash", response.text)
        self.assertEqual(response.json()["supervisor"]["name"], "Senior")

    def test_profile_cannot_elevate_role(self):
        response = self.client.patch("/api/account", json={"name": "New name", "role": "admin"})
        self.assertEqual(response.status_code, 422)
        self.assertEqual(self.driller["role"], "driller")

    def test_profile_photo_ownership(self):
        bad = self.client.patch("/api/account", json={"name": "New name", "photo_path": "other.jpg"})
        self.assertEqual(bad.status_code, 403)
        ok = self.client.patch("/api/account", json={"name": " New name ", "photo_path": "mine.jpg"})
        self.assertEqual(ok.status_code, 200)
        self.assertEqual(ok.json()["name"], "New name")

    def test_password_requires_current_and_revokes_sessions(self):
        bad = self.client.post("/api/account/password", json={"current_password": "incorrect", "new_password": "New-password-123"})
        self.assertEqual(bad.status_code, 400)
        ok = self.client.post("/api/account/password", json={"current_password": self.password, "new_password": "New-password-123"})
        self.assertEqual(ok.status_code, 200)
        self.assertTrue(bcrypt.checkpw(b"New-password-123", self.driller["password_hash"].encode()))
        self.assertEqual(self.version, [1])
        self.assertFalse(session_current({"version": 0}, self.driller))
        self.assertTrue(session_current({"version": 1}, self.driller))
        self.assertNotIn("New-password-123", str(self.audit))

    def test_password_rejects_short_and_multibyte_overflow(self):
        for password in ["short", "界" * 30]:
            response = self.client.post("/api/account/password", json={"current_password": self.password, "new_password": password})
            self.assertEqual(response.status_code, 422)

    def test_driller_can_only_view_assigned_rig(self):
        self.assertEqual(self.client.get("/api/rig-accounts/rq").status_code, 200)
        self.assertEqual(self.client.get("/api/rig-accounts/rn").status_code, 403)
        self.assertEqual([r["id"] for r in self.client.get("/api/rig-accounts").json()], ["rq"])

    def test_senior_is_regional_and_gm_can_view_both(self):
        self.assertEqual(self.client.get("/api/rig-accounts/rn", headers={"x-test-user": "s"}).status_code, 403)
        self.assertEqual(self.client.get("/api/rig-accounts/rn", headers={"x-test-user": "g"}).status_code, 200)
        self.assertFalse(role_allowed("general_manager", ("admin",)))
        self.assertFalse(role_allowed("senior_drilling_manager", ("admin",)))
        self.assertTrue(role_allowed("senior_drilling_manager", ("manager", "admin")))

    def test_admin_only_user_assignment_and_matching_warehouse(self):
        payload = dict(role="driller", warehouse_id="NSW", rig_id="rn")
        self.assertEqual(self.client.patch("/api/users/d/assignment", json=payload, headers={"x-test-user": "g"}).status_code, 403)
        payload["warehouse_id"] = "QLD"
        self.assertEqual(self.client.patch("/api/users/d/assignment", json=payload, headers={"x-test-user": "a"}).status_code, 422)
        payload["rig_id"] = "rq"
        self.assertEqual(self.client.patch("/api/users/d/assignment", json=payload, headers={"x-test-user": "a"}).status_code, 200)

    def test_pallet_is_staff_only_operations_only_and_unique(self):
        payload = dict(reference="PAL-1", bin_id="op", description="Rig supplies")
        self.assertEqual(self.client.post("/api/rig-accounts/rq/pallet", json=payload).status_code, 403)
        payload["bin_id"] = "cons"
        self.assertEqual(self.client.post("/api/rig-accounts/rq/pallet", json=payload, headers={"x-test-user": "s"}).status_code, 422)
        payload["bin_id"] = "op"
        self.assertEqual(self.client.post("/api/rig-accounts/rq/pallet", json=payload, headers={"x-test-user": "s"}).status_code, 200)
        self.assertEqual(self.client.post("/api/rig-accounts/rq/pallet", json=payload, headers={"x-test-user": "s"}).status_code, 409)
        self.assertEqual(self.client.post("/api/rig-accounts/rn/pallet", json=payload, headers={"x-test-user": "s"}).status_code, 403)

    def test_pallet_release_preserves_record(self):
        self.client.post("/api/rig-accounts/rq/pallet", json={"reference": "PAL-1", "bin_id": "op"}, headers={"x-test-user": "s"})
        response = self.client.patch("/api/rig-accounts/rq/pallet/new-id", json={"status": "released"}, headers={"x-test-user": "s"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "released")
        self.assertEqual(len(self.db.pallet_allocations.rows), 1)

    def test_supervisor_must_be_active_senior_in_same_region(self):
        payload = dict(warehouse_id="QLD", base_area="Brisbane", supervisor_id="g")
        self.assertEqual(self.client.patch("/api/rig-accounts/rq", json=payload, headers={"x-test-user": "s"}).status_code, 422)
        payload["supervisor_id"] = "s"
        self.assertEqual(self.client.patch("/api/rig-accounts/rq", json=payload, headers={"x-test-user": "s"}).status_code, 200)
        payload["warehouse_id"] = "NSW"
        self.assertEqual(self.client.patch("/api/rig-accounts/rq", json=payload, headers={"x-test-user": "g"}).status_code, 409)

    def test_unassigned_driller_and_invalid_region_fail_closed(self):
        self.driller["rig_id"] = None
        self.assertEqual(self.client.get("/api/rig-accounts").json(), [])
        self.assertEqual(self.client.get("/api/rig-accounts/rq").status_code, 403)
        self.senior["warehouse_id"] = None
        self.assertEqual(self.client.get("/api/rig-accounts", headers={"x-test-user": "s"}).status_code, 403)

    def test_name_only_update_preserves_existing_photo(self):
        self.driller["photo_path"] = "mine.jpg"
        response = self.client.patch("/api/account", json={"name": "Updated"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["photo_path"], "mine.jpg")

    def test_supervisor_reassignment_required_before_demotion(self):
        response = self.client.patch("/api/users/s/assignment", headers={"x-test-user": "a"}, json={"role": "driller", "warehouse_id": "QLD", "rig_id": None})
        self.assertEqual(response.status_code, 409)
        self.assertEqual(self.senior["role"], "senior_drilling_manager")

    def test_upcoming_trips_exclude_past_and_cancelled(self):
        self.db.trips.rows = [
            dict(id="past", rig_number="RIG-Q", warehouse_id="QLD", start_date="2026-10-01", end_date="2026-10-02", status="issued"),
            dict(id="next", rig_number="RIG-Q", warehouse_id="QLD", start_date="2026-12-01", end_date="2026-12-02", status="approved"),
            dict(id="cancelled", rig_number="RIG-Q", warehouse_id="QLD", start_date="2026-12-01", end_date="2026-12-02", status="cancelled"),
        ]
        response = self.client.get("/api/rig-accounts/rq")
        self.assertEqual([r["id"] for r in response.json()["upcoming"]], ["next"])
        self.assertEqual(len(response.json()["trips"]), 3)

    def test_assignment_can_set_another_users_status(self):
        response = self.client.patch("/api/users/d/assignment", headers={"x-test-user": "a"}, json={"role": "driller", "warehouse_id": "QLD", "rig_id": "rq", "active": False})
        self.assertEqual(response.status_code, 200)
        self.assertFalse(self.driller["active"])
        self.assertEqual(self.driller["token_version"], 1)

    def test_omitted_status_is_preserved(self):
        self.driller["active"] = False
        response = self.client.patch("/api/users/d/assignment", headers={"x-test-user": "a"}, json={"role": "driller", "warehouse_id": "QLD", "rig_id": "rq"})
        self.assertEqual(response.status_code, 200)
        self.assertFalse(self.driller["active"])

    def test_self_access_update_issues_replacement_token(self):
        response = self.client.patch("/api/users/a/assignment", headers={"x-test-user": "a"}, json={"role": "admin", "warehouse_id": "QLD", "rig_id": "rq", "active": True})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["access_token"], "test-token")
        self.assertEqual(self.version, [1])

    def test_self_deactivation_is_blocked(self):
        response = self.client.patch("/api/users/a/assignment", headers={"x-test-user": "a"}, json={"role": "admin", "active": False})
        self.assertEqual(response.status_code, 409)
        self.assertTrue(self.admin["active"])

    def test_email_and_member_since_cannot_be_edited(self):
        for field in ["email", "created_at"]:
            response = self.client.patch("/api/account", json={"name": "Driller", field: "changed"})
            self.assertEqual(response.status_code, 422)

    def test_administrator_2_is_operational_but_not_system_admin(self):
        admin2 = dict(id="a2", name="Administrator 2", role="administrator_2", active=True)
        self.db.users.rows.append(admin2)
        self.assertTrue(role_allowed("administrator_2", ("manager", "admin")))
        self.assertFalse(role_allowed("administrator_2", ("admin",)))
        self.assertTrue(can_view_rig(admin2, self.db.rigs.rows[1]))
        self.assertEqual(self.client.get("/api/rig-accounts/rn", headers={"x-test-user": "a2"}).status_code, 200)
        self.assertEqual(self.client.patch("/api/users/d/assignment", headers={"x-test-user": "a2"}, json={"role": "admin"}).status_code, 403)

    def test_dashboard_filters_activity_and_does_not_expose_signatures(self):
        self.db.equipment_loans.rows = [dict(id="l1", rig_number="RIG-Q", warehouse_id="QLD", status="out", collector_signature="private"), dict(id="l2", rig_number="RIG-Q", warehouse_id="NSW", status="out")]
        response = self.client.get("/api/rig-accounts/rq")
        self.assertEqual([l["id"] for l in response.json()["loans"]], ["l1"])
        self.assertNotIn("collector_signature", response.text)


if __name__ == "__main__":
    unittest.main()
