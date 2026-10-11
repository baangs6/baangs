from datetime import date
from uuid import uuid4
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException
from ..auth.utils import require_admin, require_admin_or_manager, require_any
from ..database import get_db
from ..utils.amc import end_date, summary, site_key
from ..utils.job_access import is_assigned_to_job

router = APIRouter(tags=["AMC"])


class ContractCreate(BaseModel):
    start_date: date
    location: str = Field(..., min_length=1, max_length=300)
    nickname: str = Field("", max_length=80)
    amount: float = Field(0, ge=0)
    notes: str = Field("", max_length=2000)


class JobLink(BaseModel):
    amc_id: str | None = None
    replacement_products: bool = False


@router.get("/customers/{customer_id}/amc")
async def contracts(customer_id: str, _=Depends(require_admin_or_manager)):
    db = get_db()
    rows = await db.amc_contracts.find({"customer_id": customer_id}).sort("start_date", -1).to_list(None)
    return [summary(row) for row in rows]


@router.post("/customers/{customer_id}/amc")
async def create_contract(customer_id: str, data: ContractCreate, _=Depends(require_admin)):
    db = get_db()
    if not await db.customers.find_one({"customer_id": customer_id}):
        raise HTTPException(404, "Customer not found")
    if not data.location.strip():
        raise HTTPException(400, "Location is required")
    finish = end_date(data.start_date).isoformat()
    rows = await db.amc_contracts.find({"customer_id": customer_id}).to_list(None)
    if any(not row.get("cancelled") and site_key(row["location"]) == site_key(data.location)
           and row["start_date"] <= finish and row["end_date"] >= data.start_date.isoformat() for row in rows):
        raise HTTPException(409, "An AMC already covers this location during these dates")
    row = {**data.model_dump(mode="json"), "location": data.location.strip(), "customer_id": customer_id,
           "amc_id": f"AMC-{uuid4().hex[:12].upper()}", "end_date": finish, "visits": [], "revision": 0, "cancelled": False}
    await db.amc_contracts.insert_one(row)
    return summary(row)


@router.patch("/customers/{customer_id}/amc/{amc_id}/cancel")
async def cancel_contract(customer_id: str, amc_id: str, _=Depends(require_admin)):
    row = await get_db().amc_contracts.find_one_and_update({"customer_id": customer_id, "amc_id": amc_id},
        {"$set": {"cancelled": True}, "$inc": {"revision": 1}}, return_document=True)
    if not row:
        raise HTTPException(404, "AMC not found")
    return summary(row)


@router.get("/jobs/{job_id}/amc")
async def job_contracts(job_id: str, user=Depends(require_any)):
    db = get_db()
    job = await db.jobs.find_one({"job_id": job_id})
    if not job:
        raise HTTPException(404, "Job not found")
    if user["role"] == "sales" or (user["role"] == "technician" and not is_assigned_to_job(job, user.get("staff_id"))):
        raise HTTPException(403, "Access denied")
    rows = await db.amc_contracts.find({"customer_id": job.get("customer_id")}).to_list(None)
    rows = [summary(row) for row in rows if site_key(row["location"]) == site_key(job.get("location"))]
    return {"contracts": rows, "amc_id": job.get("amc_id"), "replacement_products": job.get("amc_replacement_products", False), "benefits": job.get("amc_benefits")}


@router.put("/jobs/{job_id}/amc")
async def link_contract(job_id: str, data: JobLink, _=Depends(require_admin)):
    db = get_db()
    job = await db.jobs.find_one({"job_id": job_id})
    if not job:
        raise HTTPException(404, "Job not found")
    if job.get("status") == "complete" or job.get("amc_benefits") is not None:
        raise HTTPException(409, "Completed visits cannot be relinked")
    if data.amc_id:
        contract = await db.amc_contracts.find_one({"amc_id": data.amc_id, "customer_id": job.get("customer_id")})
        if not contract or site_key(contract["location"]) != site_key(job.get("location")) or summary(contract)["status"] != "active":
            raise HTTPException(400, "Select an active AMC for this customer location")
        if "install" in str(job.get("work_type", "")).lower():
            raise HTTPException(400, "Installation jobs are not AMC service visits")
    await db.jobs.update_one({"job_id": job_id}, {"$set": {"amc_id": data.amc_id, "amc_replacement_products": data.replacement_products if data.amc_id else False}})
    return {"message": "AMC updated"}
