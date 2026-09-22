from fastapi import APIRouter, HTTPException, Depends, Query, UploadFile, File
from typing import List, Optional
from ..models.job import JobAcceptRequest, JobCreate, JobRejectRequest, JobUpdate, JobResponse
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
        "customer_id": j.get("customer_id", ""),
        "customer_name": j.get("customer_name", ""),
        "phone_number": j.get("phone_number", ""),
        "location": j.get("location"),
        "map_location": j.get("map_location"),
        "site_type": j.get("site_type"),
        "work_type": j.get("work_type", "complaint"),
        "complaint": j.get("complaint"),
        "priority": j.get("priority", "medium"),
        "scheduled_date": j.get("scheduled_date"),
        "preferred_time": j.get("preferred_time"),
        "assigned_staff_id": j.get("assigned_staff_id"),
        "assigned_staff_name": staff_name or j.get("assigned_staff_name"),
        "additional_staff_ids": j.get("additional_staff_ids") or [],
        "additional_staff_names": j.get("additional_staff_names") or [],
        "status": j.get("status", "pending"),
        "work_started_at": j.get("work_started_at"),
        "work_started_by": j.get("work_started_by"),
        "work_start_location": j.get("work_start_location"),
        "work_ended_at": j.get("work_ended_at"),
        "work_ended_by": j.get("work_ended_by"),
        "work_end_location": j.get("work_end_location"),
        "service_request_date": j.get("service_request_date") or j.get("scheduled_date") or today_ist_str(),
        "created_by_user_id": j.get("created_by_user_id"),
        "created_by_name": j.get("created_by_name") or ("Customer" if j.get("is_public_submission") else "Admin"),
        "next_schedule_date": j.get("next_schedule_date"),
        "photo_url": j.get("photo_url"),
        "customer_key": j.get("customer_key") or make_customer_key(j.get("phone_number", ""), j.get("customer_name", "")),
        "is_public_submission": j.get("is_public_submission", False),
        "request_status": j.get("request_status"),
        "rejection_remark": j.get("rejection_remark"),
    }


async def get_sequence_for_today(db) -> int:
    today = today_ist_str().replace("-", "")
    today_prefix = f"JOB-{today}"
    counter = await db.counters.find_one_and_update(
        {"_id": f"job_{today}"},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=True
    )
    existing = await db.jobs.find_one({"job_id": {"$regex": f"^{today_prefix}"}}, sort=[("job_id", -1)])
    if existing and "job_id" in existing:
        try:
            last_seq = int(existing["job_id"].split("-")[-1])
            if counter["seq"] <= last_seq:
                new_seq = last_seq + 1
                await db.counters.update_one({"_id": f"job_{today}"}, {"$set": {"seq": new_seq}})
                return new_seq
        except Exception:
            pass
    return counter["seq"]


@router.get("/", response_model=List[JobResponse])
async def list_jobs(
    status: Optional[str] = Query(None),
    priority: Optional[str] = Query(None),
    work_type: Optional[str] = Query(None),
    assigned_staff_id: Optional[str] = Query(None),
    site_type: Optional[str] = Query(None),
    is_public_submission: Optional[bool] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    skip: int = 0,
    limit: int = 200,
    current_user: dict = Depends(get_current_user)
):
    db = get_db()
    if current_user["role"] == "sales":
        raise HTTPException(status_code=403, detail="Sales users can access Tasks only")

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
    if is_public_submission is True:
        query["$or"] = [{"is_public_submission": True}, {"work_type": "complaint"}]
    if assigned_staff_id == "__unassigned":
        query["assigned_staff_id"] = None
    elif assigned_staff_id:
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
        search_or = [
            {"customer_name": {"$regex": search, "$options": "i"}},
            {"phone_number": {"$regex": search, "$options": "i"}},
            {"job_id": {"$regex": search, "$options": "i"}},
            {"location": {"$regex": search, "$options": "i"}},
        ]
        if "$or" in query:
            query["$and"] = [{"$or": query.pop("$or")}, {"$or": search_or}]
        else:
            query["$or"] = search_or

    jobs = await db.jobs.find(query).sort([("_id", -1)]).skip(skip).limit(limit).to_list(limit)
    return [_format_job(j) for j in jobs]


@router.post("/", response_model=JobResponse)
async def create_job(data: JobCreate, current_user: dict = Depends(require_admin)):
    db = get_db()

    # Dedup customer
    customer_key = make_customer_key(data.phone_number, data.customer_name)
    customer = await db.customers.find_one({"customer_key": customer_key})

    if customer:
        customer_id = customer["customer_id"]
        location = data.location or customer.get("location")
        map_location = data.map_location or customer.get("map_location")
        site_type = data.site_type or customer.get("site_type")
        customer_updates = {"latest_request_date": today_ist_str()}
        if data.location is not None:
            customer_updates["location"] = data.location
        if data.map_location is not None:
            customer_updates["map_location"] = data.map_location
        if data.site_type is not None:
            customer_updates["site_type"] = data.site_type
        # Update customer stats
        await db.customers.update_one(
            {"customer_key": customer_key},
            {"$set": customer_updates, "$inc": {"total_jobs": 1}}
        )
    else:
        customer_id = generate_customer_id()
        location = data.location
        map_location = data.map_location
        site_type = data.site_type
        customer_doc = {
            "customer_id": customer_id,
            "customer_name": data.customer_name,
            "phone_number": data.phone_number,
            "location": location,
            "map_location": map_location,
            "site_type": site_type,
            "first_request_date": today_ist_str(),
            "latest_request_date": today_ist_str(),
            "total_jobs": 1,
            "customer_key": customer_key,
        }
        await db.customers.insert_one(customer_doc)

    # Get primary staff name
    staff_name = None
    if data.assigned_staff_id:
        staff = await db.staff.find_one({"staff_id": data.assigned_staff_id})
        if staff:
            staff_name = staff.get("full_name") or staff.get("name") or ""

    # Get additional staff names
    additional_staff_names = []
    additional_staff_ids = data.additional_staff_ids or []
    for sid in additional_staff_ids:
        s = await db.staff.find_one({"staff_id": sid})
        if s:
            additional_staff_names.append(s.get("full_name") or s.get("name") or "")

    # Generate Job ID
    seq = await get_sequence_for_today(db)
    job_id = generate_job_id(seq)

    job_doc = {
        "job_id": job_id,
        "customer_id": customer_id,
        "customer_name": data.customer_name,
        "phone_number": data.phone_number,
        "location": location,
        "map_location": map_location,
        "site_type": site_type,
        "work_type": data.work_type,
        "complaint": data.complaint,
        "priority": data.priority,
        "scheduled_date": data.scheduled_date,
        "preferred_time": data.preferred_time,
        "assigned_staff_id": data.assigned_staff_id,
        "assigned_staff_name": staff_name,
        "additional_staff_ids": additional_staff_ids,
        "additional_staff_names": additional_staff_names,
        "status": "pending",
        "service_request_date": today_ist_str(),
        "created_by_user_id": current_user.get("user_id"),
        "created_by_name": current_user.get("full_name") or current_user.get("username") or "Admin",
        "next_schedule_date": data.next_schedule_date,
        "photo_url": data.photo_url,
        "customer_key": customer_key,
    }
    await db.jobs.insert_one(job_doc)
    title = "New Job Created"
    msg = f"{job_id} - {data.customer_name} ({data.work_type})"
    await notify_roles(db, ["admin"], title, msg, {"job_id": job_id, "type": "job_created"})
    # Notify all assigned technicians
    all_staff_ids = [data.assigned_staff_id] if data.assigned_staff_id else []
    all_staff_ids += additional_staff_ids
    for sid in all_staff_ids:
        tech_user = await db.users.find_one({"staff_id": sid, "role": "technician", "status": "active"})
        if tech_user and tech_user.get("user_id"):
            await notify_users(db, [tech_user["user_id"]], title, msg, {"job_id": job_id, "type": "job_assigned"})
    return _format_job(job_doc, staff_name)


@router.get("/{job_id}/customer-history")
async def get_customer_history(job_id: str, current_user: dict = Depends(get_current_user)):
    db = get_db()
    if current_user["role"] == "sales":
        raise HTTPException(status_code=403, detail="Sales users can access Tasks only")

    current_job = await db.jobs.find_one({"job_id": job_id})
    if not current_job:
        raise HTTPException(status_code=404, detail="Job not found")
    if current_user["role"] == "technician" and current_job.get("assigned_staff_id") != current_user.get("staff_id"):
        raise HTTPException(status_code=403, detail="Access denied")

    customer_id = current_job.get("customer_id")
    if not customer_id:
        return {"customer_id": None, "customer_name": current_job.get("customer_name"), "history": []}

    customer_jobs = await db.jobs.find({"customer_id": customer_id}).sort("service_request_date", -1).to_list(500)
    history = []
    for customer_job in customer_jobs:
        related_job_id = customer_job["job_id"]
        updates = await db.daily_updates.find({"job_id": related_job_id}).sort("update_time", -1).to_list(200)
        products = await db.job_inventory_usage.find({"job_id": related_job_id}).sort("usage_datetime", -1).to_list(200)
        billing = await db.billing.find_one({"job_id": related_job_id})

        staff_names = []
        for name in [customer_job.get("assigned_staff_name"), *(customer_job.get("additional_staff_names") or [])]:
            if name and name not in staff_names:
                staff_names.append(name)
        for update in updates:
            name = update.get("staff_name")
            if name and name not in staff_names:
                staff_names.append(name)

        history.append({
            "job_id": related_job_id,
            "date": customer_job.get("service_request_date") or customer_job.get("scheduled_date"),
            "work_type": customer_job.get("work_type"),
            "complaint": customer_job.get("complaint"),
            "status": customer_job.get("status", "pending"),
            "staff_attended": staff_names,
            "service_updates": [
                {
                    "update_time": update.get("update_time"),
                    "staff_name": update.get("staff_name"),
                    "visit_notes": update.get("visit_notes"),
                    "issues_faced": update.get("issues_faced"),
                    "status": update.get("status"),
                }
                for update in updates
                if update.get("visit_notes") or update.get("issues_faced")
            ],
            "products_used": [
                {
                    "item_name": product.get("item_name") or product.get("barcode"),
                    "model_number": product.get("model_number"),
                    "serial_number": product.get("serial_number"),
                    "quantity_used": product.get("quantity_used", 0),
                }
                for product in products
            ],
            "invoice": ({
                "billing_id": billing.get("billing_id"),
                "invoice_amount": billing.get("invoice_amount", 0),
                "collected_amount": billing.get("collected_amount", 0),
                "payment_mode": billing.get("payment_mode"),
                "payment_id": billing.get("payment_id"),
                "complete_date": billing.get("complete_date"),
            } if billing else None),
        })

    return {
        "customer_id": customer_id,
        "customer_name": current_job.get("customer_name"),
        "phone_number": current_job.get("phone_number"),
        "history": history,
    }


@router.get("/{job_id}", response_model=JobResponse)
async def get_job(job_id: str, current_user: dict = Depends(get_current_user)):
    db = get_db()
    if current_user["role"] == "sales":
        raise HTTPException(status_code=403, detail="Sales users can access Tasks only")
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
    if current_user["role"] == "sales":
        raise HTTPException(status_code=403, detail="Sales users can access Tasks only")
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
        if "additional_staff_ids" in update_data:
            names = []
            for sid in update_data["additional_staff_ids"]:
                s = await db.staff.find_one({"staff_id": sid})
                if s:
                    names.append(s["name"])
            update_data["additional_staff_names"] = names

    result = await db.jobs.find_one_and_update(
        {"job_id": job_id},
        {"$set": update_data},
        return_document=True
    )
    if current_user["role"] == "technician" and update_data:
        if update_data.get("status") == "completed":
            await notify_roles(
                db,
                ["admin", "manager"],
                "✅ Job Completed",
                f"{job_id} completed by {current_user.get('full_name') or current_user.get('username')} — {job.get('customer_name', '')}",
                {"job_id": job_id, "type": "job_completed"},
            )
        else:
            await notify_roles(
                db,
                ["admin"],
                "Job Updated by Technician",
                f"{job_id} updated by {current_user.get('full_name') or current_user.get('username')}",
                {"job_id": job_id, "type": "job_updated_by_technician"},
            )
    return _format_job(result)


@router.patch("/{job_id}/accept", response_model=JobResponse)
async def accept_customer_request(job_id: str, data: JobAcceptRequest, _=Depends(require_admin_or_manager)):
    db = get_db()
    job = await db.jobs.find_one({"job_id": job_id})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if not job.get("is_public_submission"):
        raise HTTPException(status_code=400, detail="Only customer requests can be accepted")

    staff = await db.staff.find_one({"staff_id": data.assigned_staff_id, "is_active": True})
    if not staff:
        raise HTTPException(status_code=400, detail="Assigned technician not found")

    additional_staff_names = []
    additional_staff_ids = data.additional_staff_ids or []
    for sid in additional_staff_ids:
        s = await db.staff.find_one({"staff_id": sid, "is_active": True})
        if s:
            additional_staff_names.append(s.get("full_name") or s.get("name") or "")

    update_data = {
        "assigned_staff_id": data.assigned_staff_id,
        "assigned_staff_name": staff.get("full_name") or staff.get("name") or "",
        "additional_staff_ids": additional_staff_ids,
        "additional_staff_names": additional_staff_names,
        "scheduled_date": data.scheduled_date or job.get("scheduled_date") or today_ist_str(),
        "preferred_time": data.preferred_time,
        "request_status": "accepted",
        "accepted_at": now_ist_str(),
        "rejection_remark": None,
        "status": "pending",
    }

    result = await db.jobs.find_one_and_update(
        {"job_id": job_id},
        {"$set": update_data},
        return_document=True
    )

    title = "Customer Request Accepted"
    msg = f"{job_id} - {job.get('customer_name', '')} assigned to {update_data['assigned_staff_name']}"
    await notify_roles(db, ["admin", "manager"], title, msg, {"job_id": job_id, "type": "customer_request_accepted"})
    all_staff_ids = [data.assigned_staff_id] + additional_staff_ids
    for sid in all_staff_ids:
        tech_user = await db.users.find_one({"staff_id": sid, "role": "technician", "status": "active"})
        if tech_user and tech_user.get("user_id"):
            await notify_users(db, [tech_user["user_id"]], "New Job Assigned", msg, {"job_id": job_id, "type": "job_assigned"})

    return _format_job(result)


@router.patch("/{job_id}/reject", response_model=JobResponse)
async def reject_customer_request(job_id: str, data: JobRejectRequest, _=Depends(require_admin_or_manager)):
    remark = (data.remark or "").strip()
    if not remark:
        raise HTTPException(status_code=400, detail="Reject remark is required")

    db = get_db()
    job = await db.jobs.find_one({"job_id": job_id})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if not job.get("is_public_submission"):
        raise HTTPException(status_code=400, detail="Only customer requests can be rejected")

    result = await db.jobs.find_one_and_update(
        {"job_id": job_id},
        {"$set": {
            "request_status": "rejected",
            "rejection_remark": remark,
            "rejected_at": now_ist_str(),
            "status": "cancelled",
        }},
        return_document=True
    )
    await notify_roles(
        db,
        ["admin", "manager"],
        "Customer Request Rejected",
        f"{job_id} rejected: {remark}",
        {"job_id": job_id, "type": "customer_request_rejected"},
    )
    return _format_job(result)


@router.delete("/{job_id}")
async def delete_job(job_id: str, _=Depends(require_admin_or_manager)):
    db = get_db()
    job = await db.jobs.find_one({"job_id": job_id})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    await db.jobs.delete_one({"job_id": job_id})
    await db.daily_updates.delete_many({"job_id": job_id})
    await db.job_inventory_usage.delete_many({"job_id": job_id})
    await db.notifications.delete_many({"job_id": job_id})
    return {"message": "Job deleted", "job_id": job_id}


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
