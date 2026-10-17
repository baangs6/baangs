from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel, Field
from typing import List
from ..auth.utils import get_current_user
from ..database import get_db
from ..utils.timezone import now_ist_str
from ..utils.job_access import is_assigned_to_job

router = APIRouter(prefix="/notifications", tags=["Notifications"])


class PushTokenRegister(BaseModel):
    token: str
    device_id: str | None = None
    platform: str | None = None


class NotificationSelection(BaseModel):
    notification_ids: List[str] = Field(min_length=1, max_length=200)


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

    job = await db.jobs.find_one({"job_id": job_id}, {"assigned_staff_id": 1, "additional_staff_ids": 1})
    return bool(job and is_assigned_to_job(job, current_user.get("staff_id")))


async def _visible_notifications(db, rows: list[dict], current_user: dict) -> list[dict]:
    if current_user.get("role") != "technician":
        return rows
    job_ids = list({(row.get("meta") or {}).get("job_id") for row in rows if (row.get("meta") or {}).get("job_id")})
    jobs = await db.jobs.find({"job_id": {"$in": job_ids}}, {"job_id": 1, "assigned_staff_id": 1, "additional_staff_ids": 1}).to_list(None)
    accessible = {job["job_id"] for job in jobs if is_assigned_to_job(job, current_user.get("staff_id"))}
    return [row for row in rows if not (row.get("meta") or {}).get("job_id") or (row.get("meta") or {}).get("job_id") in accessible]


@router.get("/", response_model=List[dict])
async def list_notifications(limit: int = Query(30, ge=1, le=200), skip: int = Query(0, ge=0, le=100000), current_user: dict = Depends(get_current_user)):
    db = get_db()
    cursor = db.notifications.find({"user_id": current_user["user_id"]}).sort("created_at", -1)
    if current_user.get("role") == "technician":
        rows = await cursor.to_list(None)
        visible = await _visible_notifications(db, rows, current_user)
        return [_fmt(r) for r in visible[skip:skip + limit]]
    rows = await cursor.skip(skip).limit(limit).to_list(limit)
    return [_fmt(row) for row in rows]


@router.patch("/read-all")
async def mark_all_read(current_user: dict = Depends(get_current_user)):
    db = get_db()
    await db.notifications.update_many({"user_id": current_user["user_id"], "is_read": False}, {"$set": {"is_read": True}})
    return {"message": "All notifications marked as read"}


@router.post("/clear-selected")
async def clear_selected(data: NotificationSelection, current_user: dict = Depends(get_current_user)):
    db = get_db()
    result = await db.notifications.delete_many({"user_id": current_user["user_id"], "notification_id": {"$in": data.notification_ids}})
    return {"deleted_count": result.deleted_count}


@router.get("/unread-count")
async def unread_count(current_user: dict = Depends(get_current_user)):
    db = get_db()
    if current_user.get("role") == "technician":
        rows = await db.notifications.find({
            "user_id": current_user["user_id"],
            "is_read": False,
        }).sort("created_at", -1).to_list(None)
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


@router.delete("/push-token")
async def unregister_push_token(data: PushTokenRegister, current_user: dict = Depends(get_current_user)):
    db = get_db()
    await db.push_tokens.update_one({"token": data.token, "user_id": current_user["user_id"]}, {"$set": {"status": "inactive", "updated_at": now_ist_str()}})
    return {"message": "Push token unregistered"}


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


@router.patch("/{notification_id}/unread")
async def mark_unread(notification_id: str, current_user: dict = Depends(get_current_user)):
    db = get_db()
    row = await db.notifications.find_one_and_update(
        {"notification_id": notification_id, "user_id": current_user["user_id"]},
        {"$set": {"is_read": False}}, return_document=True,
    )
    if not row:
        raise HTTPException(404, "Notification not found")
    return {"message": "Marked as unread"}


@router.delete("/clear")
async def clear_notifications(current_user: dict = Depends(get_current_user)):
    db = get_db()
    result = await db.notifications.delete_many({"user_id": current_user["user_id"]})
    return {"message": "Notifications cleared", "deleted_count": result.deleted_count}

