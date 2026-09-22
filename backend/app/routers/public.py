from fastapi import APIRouter, HTTPException, Query, UploadFile, File
from typing import Optional
from pydantic import BaseModel, Field
from ..database import get_db
from ..utils.id_generator import generate_job_id, make_customer_key, generate_customer_id
from ..routers.jobs import get_sequence_for_today
from ..utils.timezone import now_ist_str, today_ist_str
from ..utils.notifications import notify_roles
from ..utils.cloudinary_helper import upload_image_bytes

router = APIRouter(prefix="/public", tags=["Public Portal"])


class PublicComplaintCreate(BaseModel):
    phone_number: str = Field(..., description="Customer 10-digit phone number")
    customer_name: str = Field(..., description="Customer full name")
    location: Optional[str] = None
    map_location: Optional[str] = None
    site_type: Optional[str] = "Residence"
    work_type: Optional[str] = "complaint"
    complaint: str = Field(..., description="Detailed description of problem or service request")
    priority: Optional[str] = "medium"
    photo_url: Optional[str] = None


class CustomerLookupRequest(BaseModel):
    phone_number: str


@router.post("/lookup-customer")
async def lookup_customer(data: CustomerLookupRequest):
    phone = (data.phone_number or "").strip()
    if not phone:
        raise HTTPException(status_code=400, detail="Phone number is required")

    db = get_db()
    customer = await db.customers.find_one({"phone_number": phone})
    if not customer:
        # Search by key
        key = make_customer_key(phone, "")
        customer = await db.customers.find_one({"customer_key": {"$regex": f"^{key[:10]}"}})

    if not customer:
        return {"found": False}

    # Mask name for privacy
    raw_name = customer.get("customer_name") or ""
    parts = raw_name.split()
    masked_name = parts[0] if parts else raw_name
    if len(parts) > 1:
        masked_name += " " + parts[1][0] + "."

    return {
        "found": True,
        "customer_id": customer.get("customer_id"),
        "customer_name": raw_name,
        "masked_name": masked_name,
        "location": customer.get("location"),
        "map_location": customer.get("map_location"),
        "site_type": customer.get("site_type"),
    }


@router.post("/complaints")
async def register_public_complaint(data: PublicComplaintCreate):
    phone = (data.phone_number or "").strip()
    name = (data.customer_name or "").strip()
    complaint_text = (data.complaint or "").strip()

    if not phone or len(phone) < 7:
        raise HTTPException(status_code=400, detail="Valid phone number is required")
    if not name:
        raise HTTPException(status_code=400, detail="Customer name is required")
    if not complaint_text:
        raise HTTPException(status_code=400, detail="Complaint details are required")

    db = get_db()
    customer_key = make_customer_key(phone, name)
    customer = await db.customers.find_one({"phone_number": phone})

    if customer:
        customer_id = customer["customer_id"]
        customer_updates = {"latest_request_date": today_ist_str()}
        if data.location:
            customer_updates["location"] = data.location
        if data.map_location:
            customer_updates["map_location"] = data.map_location
        if data.site_type:
            customer_updates["site_type"] = data.site_type
        await db.customers.update_one(
            {"_id": customer["_id"]},
            {"$set": customer_updates, "$inc": {"total_jobs": 1}}
        )
    else:
        customer_id = generate_customer_id()
        customer_doc = {
            "customer_id": customer_id,
            "customer_name": name,
            "phone_number": phone,
            "location": data.location,
            "map_location": data.map_location,
            "site_type": data.site_type or "Residence",
            "first_request_date": today_ist_str(),
            "latest_request_date": today_ist_str(),
            "total_jobs": 1,
            "customer_key": customer_key,
        }
        await db.customers.insert_one(customer_doc)

    # Generate sequential Job ID for today
    seq = await get_sequence_for_today(db)
    job_id = generate_job_id(seq)

    job_doc = {
        "job_id": job_id,
        "customer_id": customer_id,
        "customer_name": name,
        "phone_number": phone,
        "location": data.location,
        "map_location": data.map_location,
        "site_type": data.site_type or "Residence",
        "work_type": data.work_type or "complaint",
        "complaint": complaint_text,
        "priority": data.priority or "medium",
        "assigned_staff_id": None,
        "assigned_staff_name": None,
        "additional_staff_ids": [],
        "additional_staff_names": [],
        "scheduled_date": today_ist_str(),
        "service_request_date": today_ist_str(),
        "created_by_user_id": None,
        "created_by_name": "Customer",
        "customer_key": customer_key,
        "status": "pending",
        "stage": "pending",
        "created_at": now_ist_str(),
        "updated_at": now_ist_str(),
        "is_public_submission": True,
        "photo_url": data.photo_url,
    }

    await db.jobs.insert_one(job_doc)

    # Notify admins of new public service complaint
    await notify_roles(
        db,
        ["admin", "manager"],
        title=f"New Public Complaint #{job_id}",
        message=f"Customer {name} ({phone}) submitted a complaint: {complaint_text[:60]}",
        meta={"job_id": job_id, "type": "public_complaint"}
    )

    return {
        "success": True,
        "job_id": job_id,
        "customer_id": customer_id,
        "customer_name": name,
        "phone_number": phone,
        "status": "pending",
        "message": "Your complaint has been successfully registered. Our team will contact you shortly.",
        "created_at": job_doc["created_at"],
    }


@router.post("/complaints/photo")
async def upload_complaint_photo(file: UploadFile = File(...)):
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image files are allowed")
    contents = await file.read()
    url = upload_image_bytes(contents, folder="public_complaints")
    return {"photo_url": url}


@router.get("/track/{job_id}")
async def track_public_job(job_id: str):
    job_id_clean = (job_id or "").strip().upper()
    db = get_db()
    job = await db.jobs.find_one({"job_id": job_id_clean})

    if not job:
        # Search by phone if user entered phone number instead of job_id
        latest = await db.jobs.find({"phone_number": job_id_clean}).sort("created_at", -1).to_list(1)
        if latest:
            job = latest[0]

    if not job:
        raise HTTPException(status_code=404, detail=f"No ticket found matching '{job_id}'")

    # Get staff name if assigned
    staff_name = job.get("assigned_staff_name")
    if not staff_name and job.get("assigned_staff_id"):
        s = await db.staff.find_one({"staff_id": job.get("assigned_staff_id")})
        if s:
            staff_name = s.get("full_name") or s.get("name")

    return {
        "job_id": job["job_id"],
        "customer_name": job.get("customer_name"),
        "work_type": job.get("work_type"),
        "complaint": job.get("complaint"),
        "priority": job.get("priority"),
        "status": job.get("status", "pending"),
        "assigned_staff_name": staff_name or "Awaiting Technician Assignment",
        "location": job.get("location"),
        "created_at": job.get("created_at"),
        "updated_at": job.get("updated_at"),
        "completed_at": job.get("completed_at"),
    }
