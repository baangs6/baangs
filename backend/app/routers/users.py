from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
from ..models.user import UserCreate, UserUpdate, UserResponse
from ..auth.utils import hash_password, require_admin, get_current_user
from ..database import get_db
from ..utils.id_generator import generate_user_id
from ..utils.timezone import now_ist_str

router = APIRouter(prefix="/users", tags=["Users"])


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
    update_data = {k: v for k, v in data.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No data to update")
    result = await db.users.find_one_and_update(
        {"user_id": user_id},
        {"$set": update_data},
        return_document=True
    )
    if not result:
        raise HTTPException(status_code=404, detail="User not found")
    return _format_user(result)


@router.patch("/{user_id}/deactivate")
async def deactivate_user(user_id: str, _=Depends(require_admin)):
    db = get_db()
    result = await db.users.find_one_and_update(
        {"user_id": user_id},
        {"$set": {"status": "inactive"}},
        return_document=True
    )
    if not result:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "User deactivated", "user_id": user_id}


@router.patch("/{user_id}/activate")
async def activate_user(user_id: str, _=Depends(require_admin)):
    db = get_db()
    result = await db.users.find_one_and_update(
        {"user_id": user_id},
        {"$set": {"status": "active"}},
        return_document=True
    )
    if not result:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "User activated", "user_id": user_id}


@router.put("/{user_id}/reset-password")
async def reset_password(user_id: str, body: dict, _=Depends(require_admin)):
    new_password = body.get("new_password")
    if not new_password or len(new_password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    db = get_db()
    result = await db.users.find_one_and_update(
        {"user_id": user_id},
        {"$set": {"password_hash": hash_password(new_password)}},
        return_document=True
    )
    if not result:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "Password reset successfully"}


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
    return {"message": "User deleted", "user_id": user_id}
