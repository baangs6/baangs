import asyncio
from datetime import datetime, timedelta

from .notifications import notify_users
from .timezone import IST, now_ist, now_ist_str


def _parse_job_datetime(job: dict):
    scheduled_date = (job.get("scheduled_date") or "").strip()
    preferred_time = (job.get("preferred_time") or "").strip()
    if not scheduled_date or not preferred_time:
        return None

    for fmt in ("%Y-%m-%d %H:%M", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d %I:%M %p"):
        try:
            return IST.localize(datetime.strptime(f"{scheduled_date} {preferred_time}", fmt))
        except ValueError:
            continue
    return None


async def send_due_job_reminders(db):
    now = now_ist()
    date_floor = (now - timedelta(days=1)).strftime("%Y-%m-%d")
    date_ceiling = (now + timedelta(days=1)).strftime("%Y-%m-%d")
    jobs = await db.jobs.find({
        "assigned_staff_id": {"$ne": None},
        "status": {"$in": ["pending", "in_progress"]},
        "scheduled_date": {"$gte": date_floor, "$lte": date_ceiling},
        "preferred_time": {"$nin": [None, ""]},
        "reminder_15_sent_at": {"$exists": False},
    }).to_list(1000)

    for job in jobs:
        job_at = _parse_job_datetime(job)
        if not job_at:
            continue

        reminder_at = job_at - timedelta(minutes=15)
        if not (reminder_at <= now < job_at):
            continue

        result = await db.jobs.update_one(
            {"job_id": job["job_id"], "reminder_15_sent_at": {"$exists": False}},
            {"$set": {"reminder_15_sent_at": now_ist_str()}},
        )
        if result.modified_count != 1:
            continue

        tech_user = await db.users.find_one({
            "staff_id": job.get("assigned_staff_id"),
            "role": "technician",
            "status": "active",
        })
        if not tech_user or not tech_user.get("user_id"):
            continue

        await notify_users(
            db,
            [tech_user["user_id"]],
            "Job Reminder",
            f"{job['job_id']} starts in 15 minutes - {job.get('customer_name', '')}",
            {"job_id": job["job_id"], "type": "job_reminder_15"},
        )


async def job_reminder_loop(db, interval_seconds: int = 60):
    while True:
        try:
            await send_due_job_reminders(db)
        except Exception as exc:
            print(f"Job reminder loop failed: {exc}")
        await asyncio.sleep(interval_seconds)
