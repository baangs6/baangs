from fastapi import APIRouter, HTTPException, Depends, Query, UploadFile, File
from typing import List, Optional
from ..models.job import JobCreate, JobUpdate, JobResponse
from ..auth.utils import require_admin, require_admin_or_manager, require_any, get_current_user
from ..database import get_db
from ..utils.id_generator import generate_job_id, make_customer_key, generate_customer_id
from ..utils.timezone import now_ist_str, today_ist_str
from ..utils.cloudinary_helper import upload_image_bytes
from ..utils.notifications import notify_roles, notify_users

router = APIRouter(prefix="/jobs", tags=["Jobs"])


def _format_job(j: dict, staff_name: str = None) -> dict:
    return {
        "job_id": j["job_id"],
        "customer_id": j["customer_id"],
        "customer_name": j["customer_name"],
        "phone_number": j["phone_number"],
        "location": j.get("location"),
        "site_type": j.get("site_type"),
        "work_type": j["work_type"],
        "complaint": j.get("complaint"),
        "priority": j["priority"],
        "scheduled_date": j.get("scheduled_date"),
        "preferred_time": j.get("preferred_time"),
        "assigned_staff_id": j.get("assigned_staff_id"),
        "assigned_staff_name": staff_name or j.get("assigned_staff_name"),
        "status": j["status"],
        "work_started_at": j.get("work_started_at"),
        "work_started_by": j.get("work_started_by"),
        "work_start_location": j.get("work_start_location"),
        "work_ended_at": j.get("work_ended_at"),
        "work_ended_by": j.get("work_ended_by"),
        "work_end_location": j.get("work_end_location"),
        "service_request_date": j["service_request_date"],
        "next_schedule_date": j.get("next_schedule_date"),
        "photo_url": j.get("photo_url"),
        "customer_key": j["customer_key"],
    }


async def get_sequence_for_today(db) -> int:
    today = today_ist_str().replace("-", "")
    counter = await db.counters.find_one_and_update(
        {"_id": f"job_{today}"},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=True
    )
    return counter["seq"]


@router.get("/", response_model=List[JobResponse])
async def list_jobs(
    status: Optional[str] = Query(None),
    priority: Optional[str] = Query(None),
    work_type: Optional[str] = Query(None),
    assigned_staff_id: Optional[str] = Query(None),
    site_type: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    skip: int = 0,
    limit: int = 50,
    current_user: dict = Depends(get_current_user)
):
    db = get_db()
    
    # Auto-update unattended pending jobs
    today_str = today_ist_str()
    await db.jobs.update_many(
        {
            "status": "pending",
            "assigned_staff_id": {"$ne": None},
            "scheduled_date": {"$lt": today_str}
        },
        {
            "$set": {
                "scheduled_date": today_str,
                "priority": "urgent"
            }
        }
    )

    query = {}

    # Technicians only see their own jobs
    if current_user["role"] == "technician":
        staff_id = current_user.get("staff_id")
        if staff_id:
            query["assigned_staff_id"] = staff_id

    if status:
        query["status"] = status
    if priority:
        query["priority"] = priority
    if work_type:
        query["work_type"] = work_type
    if assigned_staff_id:
        query["assigned_staff_id"] = assigned_staff_id
    if site_type:
        query["site_type"] = site_type
    if date_from or date_to:
        date_filter = {}
        if date_from:
            date_filter["$gte"] = date_from
        if date_to:
            date_filter["$lte"] = date_to
        query["scheduled_date"] = date_filter
    if search:
        query["$or"] = [
            {"customer_name": {"$regex": search, "$options": "i"}},
            {"phone_number": {"$regex": search, "$options": "i"}},
            {"job_id": {"$regex": search, "$options": "i"}},
            {"location": {"$regex": search, "$options": "i"}},
        ]

    jobs = await db.jobs.find(query).sort("service_request_date", -1).skip(skip).limit(limit).to_list(limit)
    return [_format_job(j) for j in jobs]


@router.post("/", response_model=JobResponse)
async def create_job(data: JobCreate, current_user: dict = Depends(require_admin)):
    db = get_db()

    # Dedup customer
    customer_key = make_customer_key(data.phone_number, data.customer_name)
    customer = await db.customers.find_one({"customer_key": customer_key})

    if customer:
        customer_id = customer["customer_id"]
        # Update customer stats
        await db.customers.update_one(
            {"customer_key": customer_key},
            {"$set": {"latest_request_date": today_ist_str()}, "$inc": {"total_jobs": 1}}
        )
    else:
        customer_id = generate_customer_id()
        customer_doc = {
            "customer_id": customer_id,
            "customer_name": data.customer_name,
            "phone_number": data.phone_number,
            "location": data.location,
            "site_type": data.site_type,
            "first_request_date": today_ist_str(),
            "latest_request_date": today_ist_str(),
            "total_jobs": 1,
            "customer_key": customer_key,
        }
        await db.customers.insert_one(customer_doc)

    # Get staff name
    staff_name = None
    if data.assigned_staff_id:
        staff = await db.staff.find_one({"staff_id": data.assigned_staff_id})
        if staff:
            staff_name = staff["name"]

    # Generate Job ID
    seq = await get_sequence_for_today(db)
    job_id = generate_job_id(seq)

    job_doc = {
        "job_id": job_id,
        "customer_id": customer_id,
        "customer_name": data.customer_name,
        "phone_number": data.phone_number,
        "location": data.location,
        "site_type": data.site_type,
        "work_type": data.work_type,
        "complaint": data.complaint,
        "priority": data.priority,
        "scheduled_date": data.scheduled_date,
        "preferred_time": data.preferred_time,
        "assigned_staff_id": data.assigned_staff_id,
        "assigned_staff_name": staff_name,
        "status": "pending",
        "service_request_date": today_ist_str(),
        "next_schedule_date": data.next_schedule_date,
        "photo_url": data.photo_url,
        "customer_key": customer_key,
    }
    await db.jobs.insert_one(job_doc)
    title = "New Job Created"
    msg = f"{job_id} - {data.customer_name} ({data.work_type})"
    await notify_roles(db, ["admin"], title, msg, {"job_id": job_id, "type": "job_created"})
    if data.assigned_staff_id:
        tech_user = await db.users.find_one({"staff_id": data.assigned_staff_id, "role": "technician", "status": "active"})
        if tech_user and tech_user.get("user_id"):
            await notify_users(db, [tech_user["user_id"]], title, msg, {"job_id": job_id, "type": "job_assigned"})
    return _format_job(job_doc, staff_name)


@router.get("/{job_id}", response_model=JobResponse)
async def get_job(job_id: str, current_user: dict = Depends(get_current_user)):
    db = get_db()
    job = await db.jobs.find_one({"job_id": job_id})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if current_user["role"] == "technician" and job.get("assigned_staff_id") != current_user.get("staff_id"):
        raise HTTPException(status_code=403, detail="Access denied")
        
    usage_cursor = db.job_inventory_usage.find({"job_id": job_id})
    usage = await usage_cursor.to_list(100)
    for u in usage:
        u["_id"] = str(u["_id"])
        
    formatted = _format_job(job)
    formatted["inventory_used"] = usage
    return formatted


@router.put("/{job_id}", response_model=JobResponse)
async def update_job(job_id: str, data: JobUpdate, current_user: dict = Depends(get_current_user)):
    db = get_db()
    job = await db.jobs.find_one({"job_id": job_id})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if current_user["role"] == "technician":
        # Technicians can only update status on their own jobs
        if job.get("assigned_staff_id") != current_user.get("staff_id"):
            raise HTTPException(status_code=403, detail="Access denied")
        allowed = {"status"}
        update_data = {k: v for k, v in data.model_dump().items() if v is not None and k in allowed}
    else:
        update_data = {k: v for k, v in data.model_dump().items() if v is not None}
        if "assigned_staff_id" in update_data:
            staff = await db.staff.find_one({"staff_id": update_data["assigned_staff_id"]})
            if staff:
                update_data["assigned_staff_name"] = staff["name"]

    result = await db.jobs.find_one_and_update(
        {"job_id": job_id},
        {"$set": update_data},
        return_document=True
    )
    if current_user["role"] == "technician" and update_data:
        await notify_roles(
            db,
            ["admin"],
            "Job Updated by Technician",
            f"{job_id} updated by {current_user.get('full_name') or current_user.get('username')}",
            {"job_id": job_id, "type": "job_updated_by_technician"},
        )
    return _format_job(result)


@router.post("/{job_id}/photo")
async def upload_job_photo(job_id: str, file: UploadFile = File(...), _=Depends(require_any)):
    db = get_db()
    job = await db.jobs.find_one({"job_id": job_id})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    image_bytes = await file.read()
    url = await upload_image_bytes(image_bytes, folder="baangs/jobs")
    await db.jobs.update_one({"job_id": job_id}, {"$set": {"photo_url": url}})
    return {"photo_url": url}
