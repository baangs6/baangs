import hashlib
import time
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, Request


async def enforce_rate_limit(db, request: Request, scope: str, limit: int, window_seconds: int, identity: str = ""):
    client_ip = request.client.host if request.client else "unknown"
    window = int(time.time()) // window_seconds
    key = hashlib.sha256(f"{scope}:{client_ip}:{identity}:{window}".encode()).hexdigest()
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=window_seconds * 2)
    record = await db.rate_limits.find_one_and_update(
        {"_id": key},
        {"$inc": {"count": 1}, "$setOnInsert": {"expires_at": expires_at}},
        upsert=True,
        return_document=True,
    )
    if record["count"] > limit:
        retry_after = window_seconds - int(time.time()) % window_seconds
        raise HTTPException(
            status_code=429,
            detail="Too many requests; please try again later",
            headers={"Retry-After": str(retry_after)},
        )
