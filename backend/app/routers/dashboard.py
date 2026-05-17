from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
from datetime import datetime
from ..auth.utils import get_current_user, require_admin_or_manager
from ..database import get_db

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
        return datetime.strptime(date_str[:10], "%Y-%m-%d").date()
    except Exception:
        return None


def _technician_name_match(technician_name: Optional[str], staff_name: Optional[str], staff_id: Optional[str]) -> bool:
    if not technician_name:
        return True
    needle = technician_name.strip().lower()
    return needle == (staff_name or "").strip().lower() or needle == (staff_id or "").strip().lower()


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


@router.get("/jobs-by-priority")
async def jobs_by_priority(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    _=Depends(require_admin_or_manager)
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
    db = get_db()

    billing_query = _date_range_filter(date_from, date_to, "complete_date")
    billing_rows = await db.billing.find(billing_query).to_list(5000)
    if not billing_rows:
        return {
            "total_service_completed": 0,
            "total_installation_completed": 0,
            "average_service_completion_days": 0,
            "top_performer": None,
        }

    job_ids = [b.get("job_id") for b in billing_rows if b.get("job_id")]
    jobs = await db.jobs.find({"job_id": {"$in": job_ids}}).to_list(5000)
    jobs_by_id = {j.get("job_id"): j for j in jobs}

    total_service_completed = 0
    total_installation_completed = 0
    service_durations = []
    staff_completed_map = {}

    for bill in billing_rows:
        job = jobs_by_id.get(bill.get("job_id"))
        if not job:
            continue
        if not _technician_name_match(technician_name, job.get("assigned_staff_name"), job.get("assigned_staff_id")):
            continue

        work_type = (job.get("work_type") or "").strip().lower()
        is_installation = work_type == "installation"
        if is_installation:
            total_installation_completed += 1
        else:
            total_service_completed += 1

        staff_id = job.get("assigned_staff_id")
        staff_name = job.get("assigned_staff_name") or staff_id or "Unknown"
        if staff_id:
            if staff_id not in staff_completed_map:
                staff_completed_map[staff_id] = {"staff_id": staff_id, "staff_name": staff_name, "completed_jobs": 0}
            staff_completed_map[staff_id]["completed_jobs"] += 1

        if not is_installation:
            req_date = _parse_date(job.get("service_request_date"))
            comp_date = _parse_date(bill.get("complete_date"))
            if req_date and comp_date and comp_date >= req_date:
                service_durations.append((comp_date - req_date).days)

    avg_days = round(sum(service_durations) / len(service_durations), 2) if service_durations else 0
    top_performer = None
    if staff_completed_map:
        top_performer = max(staff_completed_map.values(), key=lambda x: x["completed_jobs"])

    return {
        "total_service_completed": total_service_completed,
        "total_installation_completed": total_installation_completed,
        "average_service_completion_days": avg_days,
        "top_performer": top_performer,
    }


@router.get("/technician-performance-deep-dive")
async def technician_performance_deep_dive(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    technician_name: Optional[str] = Query(None),
    _=Depends(require_admin_or_manager)
):
    db = get_db()

    billing_query = _date_range_filter(date_from, date_to, "complete_date")
    billing_rows = await db.billing.find(billing_query).to_list(5000)
    if not billing_rows:
        return []

    job_ids = [b.get("job_id") for b in billing_rows if b.get("job_id")]
    jobs = await db.jobs.find({"job_id": {"$in": job_ids}}).to_list(5000)
    jobs_by_id = {j.get("job_id"): j for j in jobs}

    tech_map = {}
    for bill in billing_rows:
        job = jobs_by_id.get(bill.get("job_id"))
        if not job:
            continue
        if not _technician_name_match(technician_name, job.get("assigned_staff_name"), job.get("assigned_staff_id")):
            continue

        staff_id = job.get("assigned_staff_id") or "UNASSIGNED"
        staff_name = job.get("assigned_staff_name") or staff_id
        row = tech_map.setdefault(staff_id, {
            "staff_id": staff_id,
            "staff_name": staff_name,
            "total_service_completed": 0,
            "total_installation_completed": 0,
            "average_service_completion_days": 0,
            "_service_durations": [],
        })

        work_type = (job.get("work_type") or "").strip().lower()
        is_installation = work_type == "installation"
        if is_installation:
            row["total_installation_completed"] += 1
        else:
            row["total_service_completed"] += 1
            req_date = _parse_date(job.get("service_request_date"))
            comp_date = _parse_date(bill.get("complete_date"))
            if req_date and comp_date and comp_date >= req_date:
                row["_service_durations"].append((comp_date - req_date).days)

    result = []
    for row in tech_map.values():
        durations = row.pop("_service_durations", [])
        row["average_service_completion_days"] = round(sum(durations) / len(durations), 2) if durations else 0
        result.append(row)

    result.sort(key=lambda x: (x["total_service_completed"] + x["total_installation_completed"]), reverse=True)
    return result
