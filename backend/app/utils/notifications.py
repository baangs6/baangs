from typing import Iterable, Optional
import uuid

from .timezone import now_ist_str


def _new_notification_id() -> str:
    return f"NTF-{uuid.uuid4().hex[:10].upper()}"


async def notify_users(db, user_ids: Iterable[str], title: str, message: str, meta: Optional[dict] = None):
    docs = []
    now = now_ist_str()
    for uid in user_ids:
        docs.append({
            "notification_id": _new_notification_id(),
            "user_id": uid,
            "title": title,
            "message": message,
            "meta": meta or {},
            "is_read": False,
            "created_at": now,
        })
    if docs:
        await db.notifications.insert_many(docs)


async def notify_roles(db, roles: Iterable[str], title: str, message: str, meta: Optional[dict] = None):
    users = await db.users.find({"role": {"$in": list(roles)}, "status": "active"}).to_list(1000)
    user_ids = [u.get("user_id") for u in users if u.get("user_id")]
    await notify_users(db, user_ids, title, message, meta)
