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


async def _is_visible_notification(db, notification: dict, current_user: dict) -> bool:
    if current_user.get("role") != "technician":
        return True

    meta = notification.get("meta") or {}
    job_id = meta.get("job_id")
    if not job_id:
        return True

    job = await db.jobs.find_one({"job_id": job_id}, {"assigned_staff_id": 1})
    return bool(job and job.get("assigned_staff_id") == current_user.get("staff_id"))


async def _visible_notifications(db, rows: list[dict], current_user: dict) -> list[dict]:
    visible = []
    for row in rows:
        if await _is_visible_notification(db, row, current_user):
            visible.append(row)
    return visible


@router.get("/", response_model=List[dict])
async def list_notifications(limit: int = Query(30, ge=1, le=200), current_user: dict = Depends(get_current_user)):
    db = get_db()
    fetch_limit = limit if current_user.get("role") != "technician" else min(limit * 5, 500)
    rows = await db.notifications.find({"user_id": current_user["user_id"]}).sort("created_at", -1).limit(fetch_limit).to_list(fetch_limit)
    visible = await _visible_notifications(db, rows, current_user)
    return [_fmt(r) for r in visible[:limit]]


@router.get("/unread-count")
async def unread_count(current_user: dict = Depends(get_current_user)):
    db = get_db()
    if current_user.get("role") == "technician":
        rows = await db.notifications.find({
            "user_id": current_user["user_id"],
            "is_read": False,
        }).sort("created_at", -1).limit(1000).to_list(1000)
        visible = await _visible_notifications(db, rows, current_user)
        return {"count": len(visible)}

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

