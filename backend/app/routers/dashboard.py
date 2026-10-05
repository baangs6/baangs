from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
from datetime import datetime
from ..auth.utils import get_current_user, require_admin_or_manager
from ..database import get_db
from ..utils.timezone import today_ist_str, IST

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])

def _date_range_filter(date_from: Optional[str], date_to: Optional[str], field_name: str):
    if not (date_from or date_to):
        return {}
    date_filter = {}
    if date_from:
        date_filter["$gte"] = date_from
    if date_to:
        date_filter["$lte"] = date_to
    return {field_name: date_filter}


def _parse_date(date_str: Optional[str]):
    if not date_str:
        return None
    try:
        if "T" in str(date_str):
            value = datetime.fromisoformat(str(date_str).replace("Z", "+00:00"))
            if value.tzinfo is None:
                value = IST.localize(value)
            return value.astimezone(IST).date()
        return datetime.strptime(date_str[:10], "%Y-%m-%d").date()
    except Exception:
        return None


def _technician_name_match(technician_name: Optional[str], staff_name: Optional[str], staff_id: Optional[str]) -> bool:
    if not technician_name:
        return True
    needle = technician_name.strip().lower()
    return needle == (staff_name or "").strip().lower() or needle == (staff_id or "").strip().lower()


def _location_payload(latitude, longitude):
    if latitude is None or longitude is None:
        return None


def _minutes_between(start_value: Optional[str], end_value: Optional[str]) -> int:
    if not start_value or not end_value:
        return 0
    try:
        start = datetime.fromisoformat(str(start_value).replace("Z", "+00:00"))
        end = datetime.fromisoformat(str(end_value).replace("Z", "+00:00"))
        if start.tzinfo is None:
            start = IST.localize(start)
        if end.tzinfo is None:
            end = IST.localize(end)
        return max(0, int((end - start).total_seconds() // 60))
    except Exception:
        return 0
    return {"latitude": latitude, "longitude": longitude}


def _date_in_range(value: Optional[str], date_from: Optional[str], date_to: Optional[str]) -> bool:
    parsed = _parse_date(value)
    if not parsed:
        return not (date_from or date_to)
    start = _parse_date(date_from)
    end = _parse_date(date_to)
    return (not start or parsed >= start) and (not end or parsed <= end)


def _job_location_payload(location):
    if not location:
        return None
    latitude = location.get("latitude")
    longitude = location.get("longitude")
    if latitude is None or longitude is None:
        return None
    return {
        "latitude": latitude,
        "longitude": longitude,
        "accuracy": location.get("accuracy"),
    }


def _map_url(location):
    if not location:
        return None
    return f"https://maps.google.com/?q={location['latitude']},{location['longitude']}"


@router.get("/summary")
async def summary(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user)
):
    if current_user["role"] == "sales":
        raise HTTPException(status_code=403, detail="Sales users can access Tasks only")
    db = get_db()
    jobs_date_query = _date_range_filter(date_from, date_to, "scheduled_date")

    if current_user["role"] == "technician":
        staff_id = current_user.get("staff_id")
        jobs_query = {"assigned_staff_id": staff_id, **jobs_date_query}
        jobs = await db.jobs.find(jobs_query).to_list(1000)
        job_ids = [job["job_id"] for job in jobs]
        customer_ids = {job["customer_id"] for job in jobs if job.get("customer_id")}

        total_jobs = len(jobs)
        pending = sum(1 for job in jobs if job.get("status") == "pending")
        in_progress = sum(1 for job in jobs if job.get("status") == "in_progress")
        complete = sum(1 for job in jobs if job.get("status") == "complete")
        cancelled = sum(1 for job in jobs if job.get("status") == "cancelled")
        total_customers = len(customer_ids)
        total_staff = 1 if staff_id else 0

        billing_records = await db.billing.find({}).to_list(1000)
        job_id_set = set(job_ids)
        relevant_billing = [bill for bill in billing_records if bill.get("job_id") in job_id_set]
        billing = {
            "total_revenue": sum(item.get("invoice_amount", 0) or 0 for item in relevant_billing),
            "total_profit": sum(item.get("profit", 0) or 0 for item in relevant_billing),
            "total_expense": sum(item.get("expense", 0) or 0 for item in relevant_billing),
            "total_collected": sum(item.get("collected_amount", 0) or 0 for item in relevant_billing),
        }
    else:
        total_jobs = await db.jobs.count_documents(jobs_date_query)
        pending = await db.jobs.count_documents({"status": "pending", **jobs_date_query})
        in_progress = await db.jobs.count_documents({"status": "in_progress", **jobs_date_query})
        complete = await db.jobs.count_documents({"status": "complete", **jobs_date_query})
        cancelled = await db.jobs.count_documents({"status": "cancelled", **jobs_date_query})
        if jobs_date_query:
            jobs = await db.jobs.find(jobs_date_query, {"customer_id": 1}).to_list(5000)
            total_customers = len({job.get("customer_id") for job in jobs if job.get("customer_id")})
        else:
            total_customers = await db.customers.count_documents({})
        total_staff = await db.staff.count_documents({"is_active": True})

        billing_date_query = _date_range_filter(date_from, date_to, "complete_date")
        billing_pipeline = [
            {"$match": billing_date_query},
            {"$group": {
                "_id": None,
                "total_revenue": {"$sum": "$invoice_amount"},
                "total_profit": {"$sum": "$profit"},
                "total_expense": {"$sum": "$expense"},
                "total_collected": {"$sum": "$collected_amount"},
            }}
        ]
        billing_result = await db.billing.aggregate(billing_pipeline).to_list(1)
        billing = billing_result[0] if billing_result else {}

    return {
        "jobs": {
            "total": total_jobs,
            "pending": pending,
            "in_progress": in_progress,
            "complete": complete,
            "cancelled": cancelled,
        },
        "customers": {"total": total_customers},
        "staff": {"total": total_staff},
        "revenue": {
            "total": billing.get("total_revenue", 0),
            "profit": billing.get("total_profit", 0),
            "expense": billing.get("total_expense", 0),
            "collected": billing.get("total_collected", 0),
        }
    }


@router.get("/field-staff-status")
async def field_staff_status(_=Depends(require_admin_or_manager)):
    db = get_db()
    today = today_ist_str()
    technician_users = await db.users.find({
        "role": "technician",
        "status": "active",
        "staff_id": {"$ne": None},
    }).to_list(500)
    technician_staff_ids = [user.get("staff_id") for user in technician_users if user.get("staff_id")]

    if not technician_staff_ids:
        return []

    staff_rows = await db.staff.find({
        "staff_id": {"$in": technician_staff_ids},
        "is_active": True,
    }).to_list(500)
    staff_by_id = {staff.get("staff_id"): staff for staff in staff_rows}

    attendance_rows = await db.attendance.find({
        "date": today,
        "staff_id": {"$in": technician_staff_ids},
        "checkin_time": {"$ne": None},
    }).to_list(1000)
    attendance_by_staff = {row.get("staff_id"): row for row in attendance_rows}
    checked_in_staff_ids = list(attendance_by_staff.keys())

    if not checked_in_staff_ids:
        return []

    active_jobs = await db.jobs.find({
        "assigned_staff_id": {"$in": checked_in_staff_ids},
        "status": {"$in": ["pending", "in_progress"]},
    }).sort("work_started_at", -1).to_list(2000)

    latest_job_by_staff = {}
    for job in active_jobs:
        staff_id = job.get("assigned_staff_id")
        if staff_id and staff_id not in latest_job_by_staff:
            latest_job_by_staff[staff_id] = job

    result = []
    for staff_id in checked_in_staff_ids:
        staff = staff_by_id.get(staff_id, {})
        attendance = attendance_by_staff.get(staff_id)
        job = latest_job_by_staff.get(staff_id)

        status = "Checked in"
        location = None
        last_update_time = None
        source = None
        job_id = None
        customer_name = None
        job_status = None

        if attendance.get("checkout_time"):
            status = "Checked out"
            location = _location_payload(attendance.get("checkout_latitude"), attendance.get("checkout_longitude"))
            last_update_time = attendance.get("checkout_time")
            source = "Attendance checkout"
        else:
            location = _location_payload(attendance.get("checkin_latitude"), attendance.get("checkin_longitude"))
            last_update_time = attendance.get("checkin_time")
            source = "Attendance check-in"

        if job:
            job_id = job.get("job_id")
            customer_name = job.get("customer_name")
            job_status = job.get("status")
            if job.get("work_end_location"):
                status = "Job checked out"
                location = _job_location_payload(job.get("work_end_location"))
                last_update_time = job.get("work_ended_at") or last_update_time
                source = "Job checkout"
            elif job.get("work_start_location"):
                status = "On job"
                location = _job_location_payload(job.get("work_start_location"))
                last_update_time = job.get("work_started_at") or last_update_time
                source = "Job check-in"

        result.append({
            "staff_id": staff_id,
            "staff_name": staff.get("name"),
            "phone_number": staff.get("phone_number"),
            "status": status,
            "job_id": job_id,
            "customer_name": customer_name,
            "job_status": job_status,
            "location": location,
            "map_url": _map_url(location),
            "last_update_time": last_update_time,
            "source": source,
        })

    return sorted(result, key=lambda item: item.get("last_update_time") or "", reverse=True)


@router.get("/jobs-by-priority")
async def jobs_by_priority(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    current_user: dict = Depends(require_admin_or_manager)
):
    if current_user["role"] == "sales":
        raise HTTPException(status_code=403, detail="Sales users can access Tasks only")
    db = get_db()
    match_query = _date_range_filter(date_from, date_to, "scheduled_date")
    pipeline = [
        {"$match": match_query},
        {"$group": {"_id": "$priority", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}}
    ]
    result = await db.jobs.aggregate(pipeline).to_list(10)
    return [{"priority": r["_id"], "count": r["count"]} for r in result]


@router.get("/jobs-by-status")
async def jobs_by_status(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    _=Depends(require_admin_or_manager)
):
    db = get_db()
    match_query = _date_range_filter(date_from, date_to, "scheduled_date")
    pipeline = [
        {"$match": match_query},
        {"$group": {"_id": "$status", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}}
    ]
    result = await db.jobs.aggregate(pipeline).to_list(10)
    return [{"status": r["_id"], "count": r["count"]} for r in result]


@router.get("/jobs-by-type")
async def jobs_by_type(_=Depends(require_admin_or_manager)):
    db = get_db()
    pipeline = [
        {"$group": {"_id": "$work_type", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}}
    ]
    result = await db.jobs.aggregate(pipeline).to_list(20)
    return [{"work_type": r["_id"], "count": r["count"]} for r in result]


@router.get("/technician-performance")
async def technician_performance(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    technician_name: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user)
):
    db = get_db()
    jobs_date_query = _date_range_filter(date_from, date_to, "scheduled_date")

    if current_user["role"] == "technician":
        staff_id = current_user.get("staff_id")
        jobs = await db.jobs.find({"assigned_staff_id": staff_id, **jobs_date_query}).to_list(1000)
        return [{
            "staff_id": staff_id,
            "staff_name": current_user.get("full_name") or current_user.get("username"),
            "total_jobs": len(jobs),
            "completed": sum(1 for job in jobs if job.get("status") == "complete"),
            "in_progress": sum(1 for job in jobs if job.get("status") == "in_progress"),
        }]

    pipeline = [
        {"$match": {
            "assigned_staff_id": {"$ne": None},
            **jobs_date_query,
            **({"assigned_staff_name": {"$regex": f"^{technician_name}$", "$options": "i"}} if technician_name else {})
        }},
        {"$group": {
            "_id": "$assigned_staff_id",
            "total_jobs": {"$sum": 1},
            "completed": {"$sum": {"$cond": [{"$eq": ["$status", "complete"]}, 1, 0]}},
            "in_progress": {"$sum": {"$cond": [{"$eq": ["$status", "in_progress"]}, 1, 0]}},
            "staff_name": {"$first": "$assigned_staff_name"},
        }},
        {"$sort": {"total_jobs": -1}}
    ]
    result = await db.jobs.aggregate(pipeline).to_list(50)
    return [{
        "staff_id": r["_id"],
        "staff_name": r.get("staff_name", "Unknown"),
        "total_jobs": r["total_jobs"],
        "completed": r["completed"],
        "in_progress": r["in_progress"],
    } for r in result]


@router.get("/monthly-revenue")
async def monthly_revenue(
    months: int = 6,
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    _=Depends(require_admin_or_manager)
):
    db = get_db()
    billing_date_query = _date_range_filter(date_from, date_to, "complete_date")
    pipeline = [
        {"$match": billing_date_query},
        {"$group": {
            "_id": {"$substr": ["$complete_date", 0, 7]},
            "revenue": {"$sum": "$invoice_amount"},
            "profit": {"$sum": "$profit"},
            "jobs": {"$sum": 1},
        }},
        {"$sort": {"_id": -1}},
        {"$limit": months}
    ]
    result = await db.billing.aggregate(pipeline).to_list(months)
    return sorted([{"month": r["_id"], "revenue": r["revenue"], "profit": r["profit"], "jobs": r["jobs"]}
                   for r in result], key=lambda x: x["month"])


@router.get("/attendance-summary")
async def attendance_summary(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    _=Depends(require_admin_or_manager)
):
    db = get_db()
    query = {}
    if date_from or date_to:
        date_filter = {}
        if date_from:
            date_filter["$gte"] = date_from
        if date_to:
            date_filter["$lte"] = date_to
        query["date"] = date_filter

    pipeline = [
        {"$match": query},
        {"$group": {
            "_id": "$staff_id",
            "staff_name": {"$first": "$staff_name"},
            "total_days": {"$sum": 1},
            "days_checked_out": {"$sum": {"$cond": ["$is_checked_out", 1, 0]}},
        }}
    ]
    result = await db.attendance.aggregate(pipeline).to_list(100)
    return [{
        "staff_id": r["_id"],
        "staff_name": r.get("staff_name"),
        "total_days": r["total_days"],
        "days_checked_out": r["days_checked_out"],
    } for r in result]


@router.get("/technician-performance-report")
async def technician_performance_report(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    technician_name: Optional[str] = Query(None),
    _=Depends(require_admin_or_manager)
):
    detail = await technician_performance_deep_dive(date_from, date_to, technician_name, _)
    durations = [duration for row in detail for duration in row.get("service_completion_days", [])]
    ranked = sorted(detail, key=lambda row: row["total_service_completed"] + row["total_installation_completed"], reverse=True)
    top = ranked[0] if ranked and (ranked[0]["total_service_completed"] + ranked[0]["total_installation_completed"]) else None
    return {
        "total_service_completed": sum(row["total_service_completed"] for row in detail),
        "total_installation_completed": sum(row["total_installation_completed"] for row in detail),
        "average_service_completion_days": round(sum(durations) / len(durations), 2) if durations else 0,
        "top_performer": {
            "staff_id": top["staff_id"], "staff_name": top["staff_name"],
            "completed_jobs": top["total_service_completed"] + top["total_installation_completed"],
        } if top else None,
    }


@router.get("/technician-performance-deep-dive")
async def technician_performance_deep_dive(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    technician_name: Optional[str] = Query(None),
    _=Depends(require_admin_or_manager)
):
    db = get_db()

    staff_rows = await db.staff.find({}).to_list(None)
    tech_map = {}
    for staff in staff_rows:
        staff_id = staff.get("staff_id")
        staff_name = staff.get("full_name") or staff.get("name") or staff_id
        if not staff_id or not _technician_name_match(technician_name, staff_name, staff_id):
            continue
        tech_map[staff_id] = {
            "staff_id": staff_id,
            "staff_name": staff_name,
            "photo_url": staff.get("photo_url") or staff.get("staff_photo") or staff.get("profile_photo"),
            "attendance_days": 0,
            "working_minutes": 0,
            "installation_minutes": 0,
            "total_service_completed": 0,
            "total_installation_completed": 0,
            "total_service_attended": 0,
            "total_site_visits": 0,
            "new_projects_created": 0,
            "food_expense": 0.0,
            "petrol_expense": 0.0,
            "average_service_completion_days": 0,
            "_service_durations": [],
        }

    billing_rows = await db.billing.find({}).to_list(None)
    billing_dates = {bill.get("job_id"): bill.get("complete_date") for bill in billing_rows}
    jobs = await db.jobs.find({}).to_list(None)
    for job in jobs:
        staff_id = job.get("assigned_staff_id")
        row = tech_map.get(staff_id)
        if not row:
            continue
        completion_date = job.get("work_ended_at") or billing_dates.get(job.get("job_id"))
        event_date = completion_date if job.get("status") == "complete" else (job.get("scheduled_date") or job.get("service_request_date"))
        if not _date_in_range(event_date, date_from, date_to):
            continue
        work_type = (job.get("work_type") or "").strip().lower()
        is_installation = "install" in work_type
        if is_installation:
            row["installation_minutes"] += _minutes_between(job.get("work_started_at"), job.get("work_ended_at"))
            if job.get("status") == "complete":
                row["total_installation_completed"] += 1
        else:
            if job.get("work_started_at"):
                row["total_service_attended"] += 1
            if job.get("status") == "complete":
                row["total_service_completed"] += 1
                req_date = _parse_date(job.get("service_request_date"))
                comp_date = _parse_date(completion_date)
                if req_date and comp_date and comp_date >= req_date:
                    row["_service_durations"].append((comp_date - req_date).days)

    attendance_rows = await db.attendance.find(_date_range_filter(date_from, date_to, "date")).to_list(None)
    attendance_days = set()
    for attendance in attendance_rows:
        row = tech_map.get(attendance.get("staff_id"))
        key = (attendance.get("staff_id"), attendance.get("date"))
        if row and attendance.get("checkin_time") and key not in attendance_days:
            attendance_days.add(key)
            row["attendance_days"] += 1
            row["working_minutes"] += _minutes_between(attendance.get("checkin_time"), attendance.get("checkout_time"))

    update_query = {}
    if date_from or date_to:
        update_query["update_time"] = {}
        if date_from:
            update_query["update_time"]["$gte"] = date_from
        if date_to:
            update_query["update_time"]["$lte"] = f"{date_to}T23:59:59"
    updates = await db.daily_updates.find({**update_query, "work_event": "start_work"}).to_list(None)
    for update in updates:
        row = tech_map.get(update.get("assigned_staff_id"))
        if row:
            row["total_site_visits"] += 1

    allowance_rows = await db.attendance_allowances.find(_date_range_filter(date_from, date_to, "date")).to_list(None)
    for allowance in allowance_rows:
        row = tech_map.get(allowance.get("staff_id"))
        if not row:
            continue
        expense_type = (allowance.get("expense_type") or "").lower()
        if expense_type == "food":
            row["food_expense"] += float(allowance.get("amount", 0) or 0)
        elif expense_type == "petrol":
            row["petrol_expense"] += float(allowance.get("amount", 0) or 0)

    staff_users = await db.users.find({"staff_id": {"$ne": None}}).to_list(None)
    user_to_staff = {u.get("user_id"): u.get("staff_id") for u in staff_users}
    for job in jobs:
        creator_staff_id = user_to_staff.get(job.get("created_by_user_id"))
        if creator_staff_id in tech_map and _date_in_range(job.get("service_request_date"), date_from, date_to):
            tech_map[creator_staff_id]["new_projects_created"] += 1

    result = []
    for row in tech_map.values():
        durations = row.pop("_service_durations", [])
        row["service_completion_days"] = durations
        row["average_service_completion_days"] = round(sum(durations) / len(durations), 2) if durations else 0
        row["working_hours"] = round(row.pop("working_minutes") / 60, 2)
        row["installation_hours"] = round(row.pop("installation_minutes") / 60, 2)
        row["food_expense"] = round(row["food_expense"], 2)
        row["petrol_expense"] = round(row["petrol_expense"], 2)
        result.append(row)

    result.sort(key=lambda x: (x["total_service_completed"] + x["total_installation_completed"]), reverse=True)
    return result


@router.get("/service-quality-report")
async def service_quality_report(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    technician_name: Optional[str] = Query(None),
    _=Depends(require_admin_or_manager),
):
    db = get_db()
    staff_rows = await db.staff.find({}).to_list(None)
    rows = {}
    for staff in staff_rows:
        staff_id = staff.get("staff_id")
        staff_name = staff.get("name") or staff.get("full_name") or staff_id
        if staff_id and _technician_name_match(technician_name, staff_name, staff_id):
            rows[staff_id] = {
                "staff_id": staff_id, "staff_name": staff_name,
                "repair_minutes": [], "service_calls_completed": 0,
                "completed_job_ids": set(), "reported_job_ids": set(),
                "attendance_days": 0, "checked_out_days": 0,
                "issues_reported": 0, "self_learning_entries": 0,
                "pm_scheduled": 0, "pm_completed_on_time": 0,
                "customer_ratings": [],
            }

    jobs = await db.jobs.find({}).to_list(None)
    bills = await db.billing.find({}).to_list(None)
    completion_dates = {bill.get("job_id"): bill.get("complete_date") for bill in bills}
    relevant_jobs = []
    for job in jobs:
        completed_at = job.get("work_ended_at") or completion_dates.get(job.get("job_id"))
        row = rows.get(job.get("assigned_staff_id"))
        work_type = (job.get("work_type") or "").strip().lower()
        is_pm = "preventive" in work_type or work_type == "pm" or "maintenance" in work_type
        if row and is_pm and job.get("scheduled_date") and _date_in_range(job.get("scheduled_date"), date_from, date_to):
            row["pm_scheduled"] += 1
            completed_date = _parse_date(completed_at)
            scheduled_date = _parse_date(job.get("scheduled_date"))
            if job.get("status") == "complete" and completed_date and completed_date <= scheduled_date:
                row["pm_completed_on_time"] += 1
        event_date = completed_at if job.get("status") == "complete" else (job.get("scheduled_date") or job.get("service_request_date"))
        if not _date_in_range(event_date, date_from, date_to):
            continue
        row = rows.get(job.get("assigned_staff_id"))
        if not row:
            continue
        relevant_jobs.append(job)
        is_complete = job.get("status") == "complete"
        if is_complete:
            row["service_calls_completed"] += 1
            row["completed_job_ids"].add(job.get("job_id"))
            duration = _minutes_between(job.get("work_started_at"), job.get("work_ended_at"))
            if duration > 0 and "install" not in (job.get("work_type") or "").lower():
                row["repair_minutes"].append(duration)
            if job.get("customer_rating") is not None:
                row["customer_ratings"].append(float(job["customer_rating"]))

    update_query = _date_range_filter(date_from, f"{date_to}T23:59:59" if date_to else None, "update_time")
    updates = await db.daily_updates.find(update_query).to_list(None)
    for update in updates:
        row = rows.get(update.get("assigned_staff_id"))
        if not row:
            continue
        if update.get("visit_notes") or update.get("work_event") == "end_work":
            row["reported_job_ids"].add(update.get("job_id"))
        if update.get("issues_faced"):
            row["issues_reported"] += 1
        if update.get("learning_notes"):
            row["self_learning_entries"] += 1

    attendance = await db.attendance.find(_date_range_filter(date_from, date_to, "date")).to_list(None)
    attended_days = set()
    for entry in attendance:
        row = rows.get(entry.get("staff_id"))
        key = (entry.get("staff_id"), entry.get("date"))
        if row and entry.get("checkin_time") and key not in attended_days:
            attended_days.add(key)
            row["attendance_days"] += 1
            if entry.get("is_checked_out") or entry.get("checkout_time"):
                row["checked_out_days"] += 1

    customer_counts = {}
    for job in relevant_jobs:
        if (job.get("work_type") or "").lower() != "complaint":
            continue
        customer_id = job.get("customer_id")
        if customer_id:
            customer_counts[customer_id] = customer_counts.get(customer_id, 0) + 1
    repeat_count = sum(max(0, count - 1) for count in customer_counts.values())
    complaint_count = sum(1 for job in relevant_jobs if (job.get("work_type") or "").lower() == "complaint")
    repeat_pct = round(repeat_count / complaint_count * 100, 1) if complaint_count else 0

    result = []
    all_repair_minutes = []
    total_reports = 0
    for row in rows.values():
        completed_ids = row.pop("completed_job_ids")
        completed_count = len(completed_ids)
        reported_count = len(row.pop("reported_job_ids") & completed_ids)
        total_reports += reported_count
        repair_minutes = row.pop("repair_minutes")
        all_repair_minutes.extend(repair_minutes)
        customer_ratings = row.pop("customer_ratings")
        row["customer_rating_total"] = sum(customer_ratings)
        row["average_repair_hours"] = round(sum(repair_minutes) / len(repair_minutes) / 60, 2) if repair_minutes else 0
        row["service_report_completion_pct"] = round(min(reported_count, completed_count) / completed_count * 100, 1) if completed_count else 0
        row["attendance_discipline_pct"] = round(row["checked_out_days"] / row["attendance_days"] * 100, 1) if row["attendance_days"] else 0
        row["pm_on_time_pct"] = round(row["pm_completed_on_time"] / row["pm_scheduled"] * 100, 1) if row["pm_scheduled"] else 0
        row["customer_satisfaction_score"] = round(sum(customer_ratings) / len(customer_ratings), 2) if customer_ratings else None
        row["customer_rating_count"] = len(customer_ratings)
        row["communication_score"] = None
        result.append(row)

    total_completed = sum(row["service_calls_completed"] for row in result)
    total_attendance = sum(row["attendance_days"] for row in result)
    total_checkouts = sum(row["checked_out_days"] for row in result)
    total_pm = sum(row["pm_scheduled"] for row in result)
    total_pm_on_time = sum(row["pm_completed_on_time"] for row in result)
    rating_total = sum(row.pop("customer_rating_total") for row in result)
    rating_count = sum(row["customer_rating_count"] for row in result)
    return {
        "summary": {
            "average_repair_hours": round(sum(all_repair_minutes) / len(all_repair_minutes) / 60, 2) if all_repair_minutes else 0,
            "repeat_complaint_pct": repeat_pct,
            "customer_satisfaction_score": round(rating_total / rating_count, 2) if rating_count else None,
            "customer_rating_count": rating_count,
            "service_report_completion_pct": round(total_reports / total_completed * 100, 1) if total_completed else 0,
            "service_calls_completed": total_completed,
            "attendance_discipline_pct": round(total_checkouts / total_attendance * 100, 1) if total_attendance else 0,
            "issues_reported": sum(row["issues_reported"] for row in result),
            "self_learning_entries": sum(row["self_learning_entries"] for row in result),
            "communication_score": None,
            "pm_on_time_pct": round(total_pm_on_time / total_pm * 100, 1) if total_pm else 0,
        },
        "technicians": result,
    }
