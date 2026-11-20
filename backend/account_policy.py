"""Shared account and regional access rules."""
REGIONAL_ROLES = ("manager", "senior_drilling_manager")
OPERATIONAL_ROLES = (*REGIONAL_ROLES, "general_manager", "administrator_2", "admin")
USER_ROLES = ("driller", *OPERATIONAL_ROLES)


def role_allowed(role, allowed):
    return role in allowed or ("manager" in allowed and role in OPERATIONAL_ROLES)


def can_view_rig(user, rig):
    if user["role"] == "driller":
        return bool(user.get("warehouse_id")) and bool(user.get("rig_id")) and user["rig_id"] == rig["id"] and user.get("warehouse_id") == rig.get("warehouse_id")
    if user["role"] in REGIONAL_ROLES:
        return bool(user.get("warehouse_id")) and user["warehouse_id"] == rig.get("warehouse_id")
    return user["role"] in ("admin", "general_manager", "administrator_2")


def session_current(payload, user):
    return payload.get("version", 0) == user.get("token_version", 0)
