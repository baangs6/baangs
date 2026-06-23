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


def _normalize_role(role):
    return (role or "").strip().lower()


def _matches_role_group(user, role_group):
    if role_group == "admin_sales":
        return _normalize_role(user.get("role")) in {"admin", "sales"}
    if role_group == "others":
        return _normalize_role(user.get("role")) not in {"admin", "sales"}
    return True


async def _active_staff_users_needing_attendance(db, today: str, mode: str, role_group: str = "all"):
    users = await db.users.find({
        "status": "active",
        "staff_id": {"$nin": [None, ""]},
    }).to_list(2000)
    if not users:
        return []

    staff_ids = [u.get("staff_id") for u in users if u.get("staff_id")]
    active_staff = await db.staff.find({
        "staff_id": {"$in": staff_ids},
        "is_active": {"$ne": False},
    }).to_list(2000)
    active_staff_ids = {s.get("staff_id") for s in active_staff if s.get("staff_id")}

    rows = await db.attendance.find({"date": today, "staff_id": {"$in": list(active_staff_ids)}}).to_list(2000)
    attendance_by_staff = {row.get("staff_id"): row for row in rows}

    targets = []
    for user in users:
        if not _matches_role_group(user, role_group):
            continue
        staff_id = user.get("staff_id")
        if staff_id not in active_staff_ids:
            continue
        attendance = attendance_by_staff.get(staff_id)
        if mode == "login" and not attendance:
            targets.append(user)
        elif mode == "logout" and attendance and not attendance.get("is_checked_out"):
            targets.append(user)
    return targets


async def _send_attendance_reminder(
    db,
    reminder_type: str,
    hour: int,
    minute: int,
    title: str,
    message: str,
    mode: str,
    role_group: str = "all",
):
    now = now_ist()
    if now.hour != hour or now.minute != minute:
        return

    today = now.strftime("%Y-%m-%d")
    already = await db.reminder_log.find_one({"type": reminder_type, "date": today})
    if already:
        return

    target_users = await _active_staff_users_needing_attendance(db, today, mode, role_group)
    await db.reminder_log.insert_one({
        "type": reminder_type,
        "date": today,
        "target_count": len(target_users),
        "created_at": now_ist_str(),
    })
    user_ids = [u.get("user_id") for u in target_users if u.get("user_id")]
    if not user_ids:
        return

    await notify_users(
        db,
        user_ids,
        title,
        message,
        {"type": reminder_type},
    )
    print(f"[{today}] {reminder_type} sent to {len(user_ids)} user(s).")


async def send_attendance_login_reminder(db):
    """At 10:00 IST, remind active staff who have not checked in today."""
    await _send_attendance_reminder(
        db,
        "attendance_login_reminder",
        10,
        0,
        "Attendance Login Reminder",
        "Please check in for today.",
        "login",
    )


async def send_admin_sales_logout_reminder(db):
    """At 17:00 IST, remind admin and sales staff who checked in but have not checked out."""
    await _send_attendance_reminder(
        db,
        "attendance_logout_reminder_admin_sales",
        17,
        0,
        "Attendance Logout Reminder",
        "Please check out for today before closing your work.",
        "logout",
        "admin_sales",
    )


async def send_other_staff_logout_reminder(db):
    """At 20:00 IST, remind non-admin/sales staff who checked in but have not checked out."""
    await _send_attendance_reminder(
        db,
        "attendance_logout_reminder_others",
        20,
        0,
        "Attendance Logout Reminder",
        "Please check out for today before closing your work.",
        "logout",
        "others",
    )


async def logout_reminder_loop(db, interval_seconds: int = 60):
    """Check every minute for attendance login/logout reminders."""
    while True:
        try:
            await send_attendance_login_reminder(db)
            await send_admin_sales_logout_reminder(db)
            await send_other_staff_logout_reminder(db)
        except Exception as exc:
            print(f"Attendance reminder loop failed: {exc}")
        await asyncio.sleep(interval_seconds)
