from typing import Iterable, Optional
import uuid
import logging

import httpx

from .timezone import now_ist_str

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"
logger = logging.getLogger(__name__)


def _new_notification_id() -> str:
    return f"NTF-{uuid.uuid4().hex[:10].upper()}"


def _is_expo_push_token(token: str) -> bool:
    return isinstance(token, str) and (token.startswith("ExponentPushToken[") or token.startswith("ExpoPushToken["))


async def send_push_to_users(db, user_ids: Iterable[str], title: str, message: str, meta: Optional[dict] = None, notification_ids=None):
    clean_user_ids = [uid for uid in set(user_ids) if uid]
    if not clean_user_ids:
        return

    data = meta or {}
    channel_id = "baangs-alerts-v2"
    sound = "attendance_reminder.wav"

    token_rows = await db.push_tokens.find({"user_id": {"$in": clean_user_ids}, "status": "active"}).to_list(None)
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
            "data": {**data, "notification_id": (notification_ids or {}).get(row.get("user_id"))},
            "priority": "high",
            "channelId": channel_id,
            "categoryId": "baangs_notifications",
        })

    if not messages:
        return

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            for start in range(0, len(messages), 100):
                batch = messages[start:start + 100]
                response = await client.post(EXPO_PUSH_URL, json=batch)
                response.raise_for_status()
                payload = response.json()
                if payload.get("errors"):
                    logger.error("Expo push request errors: %s", payload["errors"])
                tickets = payload.get("data") or []
                if isinstance(tickets, dict):
                    tickets = [tickets]
                for message_doc, ticket in zip(batch, tickets):
                    if ticket.get("status") == "error":
                        code = (ticket.get("details") or {}).get("error")
                        logger.error("Expo push rejected: %s: %s", code, ticket.get("message"))
                        if code == "DeviceNotRegistered":
                            await db.push_tokens.update_one({"token": message_doc["to"]}, {"$set": {"status": "inactive"}})
                    elif ticket.get("id"):
                        await db.push_tokens.update_one({"token": message_doc["to"]}, {"$set": {"last_push_ticket": ticket["id"], "last_push_at": now_ist_str()}})
    except Exception as exc:
        logger.exception("Push notification delivery failed: %s", exc)


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
    await send_push_to_users(db, clean_user_ids, title, message, meta, {doc["user_id"]: doc["notification_id"] for doc in docs})


async def notify_roles(db, roles: Iterable[str], title: str, message: str, meta: Optional[dict] = None):
    users = await db.users.find({"role": {"$in": list(roles)}, "status": "active"}).to_list(1000)
    user_ids = [u.get("user_id") for u in users if u.get("user_id")]
    await notify_users(db, user_ids, title, message, meta)
