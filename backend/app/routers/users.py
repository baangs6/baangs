from fastapi import APIRouter, HTTPException, Depends, Query
from typing import List, Optional
from ..models.user import UserCreate, UserUpdate, UserResponse, PasswordReset
from ..auth.utils import hash_password, require_admin, get_current_user
from ..database import get_db
from ..utils.id_generator import generate_user_id
from ..utils.timezone import now_ist_str

router = APIRouter(prefix="/users", tags=["Users"])


async def _audit(db, actor, target, action, fields=()):
    # Record field names, never passwords, tokens, or contact values.
    await db.user_audit.insert_one({"actor": actor.get("username"), "actor_id": actor.get("user_id"),
        "target_id": target, "action": action, "fields": list(fields), "created_at": now_ist_str()})


async def _validate_staff(db, staff_id):
    if staff_id and not await db.staff.find_one({"staff_id": staff_id}):
        raise HTTPException(status_code=400, detail="Linked staff record not found")


def _protect_self(actor, user_id, changes):
    if actor.get("user_id") == user_id and (changes.get("status") == "inactive" or ("role" in changes and changes["role"] != "admin")):
        raise HTTPException(status_code=400, detail="You cannot deactivate or demote your own account")


@router.get("/audit-logs")
async def user_audit_logs(limit: int = Query(100, ge=1, le=200), _=Depends(require_admin)):
    db = get_db()
    return await db.user_audit.find({}, {"_id": 0}).sort("created_at", -1).to_list(limit)


def _format_user(u: dict) -> dict:
    return {
        "user_id": u["user_id"],
        "username": u["username"],
        "role": u["role"],
        "status": u["status"],
        "full_name": u.get("full_name"),
        "phone": u.get("phone"),
        "staff_id": u.get("staff_id"),
        "created_at": u["created_at"],
    }


@router.get("/", response_model=List[UserResponse])
async def list_users(_=Depends(require_admin)):
    db = get_db()
    users = await db.users.find({}, {"password_hash": 0}).to_list(500)
    return [_format_user(u) for u in users]


@router.post("/", response_model=UserResponse)
async def create_user(data: UserCreate, _=Depends(require_admin)):
    db = get_db()
    await _validate_staff(db, data.staff_id)
    existing = await db.users.find_one({"username": data.username})
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists")

    user_doc = {
        "user_id": generate_user_id(),
        "username": data.username,
        "password_hash": hash_password(data.password),
        "role": data.role,
        "status": "active",
        "full_name": data.full_name,
        "phone": data.phone,
        "staff_id": data.staff_id,
        "created_at": now_ist_str(),
    }
    await db.users.insert_one(user_doc)
    await _audit(db, _, user_doc["user_id"], "created")
    return _format_user(user_doc)


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(user_id: str, _=Depends(require_admin)):
    db = get_db()
    user = await db.users.find_one({"user_id": user_id}, {"password_hash": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return _format_user(user)


@router.put("/{user_id}", response_model=UserResponse)
async def update_user(user_id: str, data: UserUpdate, _=Depends(require_admin)):
    db = get_db()
    update_data = data.model_dump(exclude_unset=True)
    if any(key in update_data and update_data[key] is None for key in ("role", "status")):
        raise HTTPException(status_code=400, detail="Role and status cannot be empty")
    if "staff_id" in update_data:
        update_data["staff_id"] = update_data["staff_id"] or None
        await _validate_staff(db, update_data["staff_id"])
    _protect_self(_, user_id, update_data)
    if not update_data:
        raise HTTPException(status_code=400, detail="No data to update")
    result = await db.users.find_one_and_update(
        {"user_id": user_id},
        {"$set": update_data, "$inc": {"token_version": 1}},
        return_document=True
    )
    if not result:
        raise HTTPException(status_code=404, detail="User not found")
    await db.push_tokens.update_many(
        {"user_id": user_id}, {"$set": {"status": "inactive", "updated_at": now_ist_str()}}
    )
    await _audit(db, _, user_id, "updated", update_data.keys())
    return _format_user(result)


@router.patch("/{user_id}/deactivate")
async def deactivate_user(user_id: str, _=Depends(require_admin)):
    _protect_self(_, user_id, {"status": "inactive"})
    db = get_db()
    result = await db.users.find_one_and_update(
        {"user_id": user_id},
        {"$set": {"status": "inactive"}, "$inc": {"token_version": 1}},
        return_document=True
    )
    if not result:
        raise HTTPException(status_code=404, detail="User not found")
    await db.push_tokens.update_many(
        {"user_id": user_id}, {"$set": {"status": "inactive", "updated_at": now_ist_str()}}
    )
    await _audit(db, _, user_id, "deactivated")
    return {"message": "User deactivated", "user_id": user_id}


@router.patch("/{user_id}/activate")
async def activate_user(user_id: str, _=Depends(require_admin)):
    db = get_db()
    result = await db.users.find_one_and_update(
        {"user_id": user_id},
        {"$set": {"status": "active"}, "$inc": {"token_version": 1}},
        return_document=True
    )
    if not result:
        raise HTTPException(status_code=404, detail="User not found")
    await _audit(db, _, user_id, "activated")
    return {"message": "User activated", "user_id": user_id}


@router.put("/{user_id}/reset-password")
async def reset_password(user_id: str, body: PasswordReset, _=Depends(require_admin)):
    new_password = body.new_password
    db = get_db()
    result = await db.users.find_one_and_update(
        {"user_id": user_id},
        {"$set": {"password_hash": hash_password(new_password)}, "$inc": {"token_version": 1}},
        return_document=True
    )
    if not result:
        raise HTTPException(status_code=404, detail="User not found")
    await db.push_tokens.update_many(
        {"user_id": user_id}, {"$set": {"status": "inactive", "updated_at": now_ist_str()}}
    )
    await _audit(db, _, user_id, "password_reset")
    return {"message": "Password reset successfully"}


@router.post("/{user_id}/revoke-sessions")
async def revoke_sessions(user_id: str, actor: dict = Depends(require_admin)):
    db = get_db()
    result = await db.users.find_one_and_update({"user_id": user_id}, {"$inc": {"token_version": 1}}, return_document=True)
    if not result:
        raise HTTPException(status_code=404, detail="User not found")
    await db.push_tokens.update_many({"user_id": user_id}, {"$set": {"status": "inactive", "updated_at": now_ist_str()}})
    await _audit(db, actor, user_id, "sessions_revoked")
    return {"message": "All existing sessions revoked"}


@router.delete("/{user_id}")
async def delete_user(
    user_id: str,
    current_user: dict = Depends(require_admin),
):
    if current_user.get("user_id") == user_id:
        raise HTTPException(status_code=400, detail="You cannot delete your own account")

    db = get_db()
    result = await db.users.delete_one({"user_id": user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    await db.push_tokens.delete_many({"user_id": user_id})
    await db.notifications.delete_many({"user_id": user_id})
    await _audit(db, current_user, user_id, "deleted")
    return {"message": "User deleted", "user_id": user_id}
