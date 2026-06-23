from typing import Iterable, Optional
import uuid

import httpx

from .timezone import now_ist_str

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"


def _new_notification_id() -> str:
    return f"NTF-{uuid.uuid4().hex[:10].upper()}"


def _is_expo_push_token(token: str) -> bool:
    return isinstance(token, str) and (token.startswith("ExponentPushToken[") or token.startswith("ExpoPushToken["))


async def send_push_to_users(db, user_ids: Iterable[str], title: str, message: str, meta: Optional[dict] = None):
    clean_user_ids = [uid for uid in set(user_ids) if uid]
    if not clean_user_ids:
        return

    data = meta or {}
    channel_id = "baangs-stack"
    sound = "attendance-reminder.wav"

    token_rows = await db.push_tokens.find({"user_id": {"$in": clean_user_ids}, "status": "active"}).to_list(1000)
    messages = []
    for row in token_rows:
        token = row.get("token")
        if not _is_expo_push_token(token):
            continue
        messages.append({
            "to": token,
            "sound": sound,
            "title": title,
            "body": message,
            "data": data,
            "channelId": channel_id,
            "categoryId": "baangs_notifications",
        })

    if not messages:
        return

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            await client.post(EXPO_PUSH_URL, json=messages)
    except Exception as exc:
        print(f"Push notification failed: {exc}")


async def notify_users(db, user_ids: Iterable[str], title: str, message: str, meta: Optional[dict] = None):
    docs = []
    now = now_ist_str()
    clean_user_ids = [uid for uid in set(user_ids) if uid]
    for uid in clean_user_ids:
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
    await send_push_to_users(db, clean_user_ids, title, message, meta)


async def notify_roles(db, roles: Iterable[str], title: str, message: str, meta: Optional[dict] = None):
    users = await db.users.find({"role": {"$in": list(roles)}, "status": "active"}).to_list(1000)
    user_ids = [u.get("user_id") for u in users if u.get("user_id")]
    await notify_users(db, user_ids, title, message, meta)
