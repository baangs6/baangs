from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel
from typing import List
from ..auth.utils import get_current_user
from ..database import get_db
from ..utils.timezone import now_ist_str

router = APIRouter(prefix="/notifications", tags=["Notifications"])


class PushTokenRegister(BaseModel):
    token: str
    device_id: str | None = None
    platform: str | None = None


def _fmt(n: dict) -> dict:
    return {
        "notification_id": n["notification_id"],
        "title": n.get("title"),
        "message": n.get("message"),
        "meta": n.get("meta", {}),
        "is_read": n.get("is_read", False),
        "created_at": n.get("created_at"),
    }


@router.get("/", response_model=List[dict])
async def list_notifications(limit: int = Query(30, ge=1, le=200), current_user: dict = Depends(get_current_user)):
    db = get_db()
    rows = await db.notifications.find({"user_id": current_user["user_id"]}).sort("created_at", -1).limit(limit).to_list(limit)
    return [_fmt(r) for r in rows]


@router.get("/unread-count")
async def unread_count(current_user: dict = Depends(get_current_user)):
    db = get_db()
    count = await db.notifications.count_documents({"user_id": current_user["user_id"], "is_read": False})
    return {"count": count}


@router.post("/push-token")
async def register_push_token(data: PushTokenRegister, current_user: dict = Depends(get_current_user)):
    token = data.token.strip()
    if not (token.startswith("ExponentPushToken[") or token.startswith("ExpoPushToken[")):
        raise HTTPException(status_code=400, detail="Invalid Expo push token")

    db = get_db()
    now = now_ist_str()
    await db.push_tokens.update_one(
        {"token": token},
        {
            "$set": {
                "token": token,
                "user_id": current_user["user_id"],
                "role": current_user.get("role"),
                "staff_id": current_user.get("staff_id"),
                "device_id": data.device_id,
                "platform": data.platform,
                "status": "active",
                "updated_at": now,
            },
            "$setOnInsert": {"created_at": now},
        },
        upsert=True,
    )
    return {"message": "Push token registered"}


@router.patch("/{notification_id}/read")
async def mark_read(notification_id: str, current_user: dict = Depends(get_current_user)):
    db = get_db()
    row = await db.notifications.find_one_and_update(
        {"notification_id": notification_id, "user_id": current_user["user_id"]},
        {"$set": {"is_read": True}},
        return_document=True,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"message": "Marked as read"}


@router.delete("/clear")
async def clear_notifications(current_user: dict = Depends(get_current_user)):
    db = get_db()
    result = await db.notifications.delete_many({"user_id": current_user["user_id"]})
    return {"message": "Notifications cleared", "deleted_count": result.deleted_count}

