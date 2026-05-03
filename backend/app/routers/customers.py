from fastapi import APIRouter, HTTPException, Depends, Query
from typing import List, Optional
from ..models.customer import CustomerCreate, CustomerUpdate, CustomerResponse
from ..auth.utils import require_admin, require_admin_or_manager, require_any
from ..database import get_db
from ..utils.id_generator import generate_customer_id, make_customer_key
from ..utils.timezone import now_ist_str, today_ist_str

router = APIRouter(prefix="/customers", tags=["Customers"])


def _format_customer(c: dict) -> dict:
    return {
        "customer_id": c["customer_id"],
        "customer_name": c["customer_name"],
        "phone_number": c["phone_number"],
        "alternative_phone_number": c.get("alternative_phone_number"),
        "location": c.get("location"),
        "map_location": c.get("map_location"),
        "site_type": c.get("site_type"),
        "first_request_date": c.get("first_request_date"),
        "latest_request_date": c.get("latest_request_date"),
        "total_jobs": c.get("total_jobs", 0),
        "customer_key": c["customer_key"],
    }


@router.get("/", response_model=List[CustomerResponse])
async def list_customers(
    search: Optional[str] = Query(None),
    skip: int = 0,
    limit: int = 50,
    _=Depends(require_admin_or_manager)
):
    db = get_db()
    query = {}
    if search:
        query = {"$or": [
            {"customer_name": {"$regex": search, "$options": "i"}},
            {"phone_number": {"$regex": search, "$options": "i"}},
            {"location": {"$regex": search, "$options": "i"}},
        ]}
    customers = await db.customers.find(query).skip(skip).limit(limit).to_list(limit)
    return [_format_customer(c) for c in customers]


@router.post("/", response_model=CustomerResponse)
async def create_or_get_customer(data: CustomerCreate, _=Depends(require_admin)):
    db = get_db()
    customer_key = make_customer_key(data.phone_number, data.customer_name)

    existing = await db.customers.find_one({"customer_key": customer_key})
    if existing:
        return _format_customer(existing)

    customer_doc = {
        "customer_id": generate_customer_id(),
        "customer_name": data.customer_name,
        "phone_number": data.phone_number,
        "alternative_phone_number": data.alternative_phone_number,
        "location": data.location,
        "map_location": data.map_location,
        "site_type": data.site_type,
        "first_request_date": today_ist_str(),
        "latest_request_date": today_ist_str(),
        "total_jobs": 0,
        "customer_key": customer_key,
    }
    await db.customers.insert_one(customer_doc)
    return _format_customer(customer_doc)


@router.get("/{customer_id}", response_model=CustomerResponse)
async def get_customer(customer_id: str, _=Depends(require_admin_or_manager)):
    db = get_db()
    c = await db.customers.find_one({"customer_id": customer_id})
    if not c:
        raise HTTPException(status_code=404, detail="Customer not found")
    return _format_customer(c)


@router.get("/{customer_id}/jobs")
async def get_customer_jobs(customer_id: str, _=Depends(require_admin_or_manager)):
    db = get_db()
    jobs = await db.jobs.find({"customer_id": customer_id}).to_list(200)
    return [{"job_id": j["job_id"], "work_type": j["work_type"], "status": j["status"],
             "service_request_date": j["service_request_date"], "priority": j["priority"]}
            for j in jobs]


@router.put("/{customer_id}", response_model=CustomerResponse)
async def update_customer(customer_id: str, data: CustomerUpdate, _=Depends(require_admin)):
    db = get_db()
    update_data = {k: v for k, v in data.model_dump().items() if v is not None}
    if "phone_number" in update_data:
        # Recalculate customer_key
        customer = await db.customers.find_one({"customer_id": customer_id})
        if customer:
            update_data["customer_key"] = make_customer_key(
                update_data.get("phone_number", customer["phone_number"]),
                update_data.get("customer_name", customer["customer_name"])
            )
    result = await db.customers.find_one_and_update(
        {"customer_id": customer_id},
        {"$set": update_data},
        return_document=True
    )
    if not result:
        raise HTTPException(status_code=404, detail="Customer not found")
    return _format_customer(result)


@router.delete("/{customer_id}")
async def delete_customer(customer_id: str, _=Depends(require_admin)):
    db = get_db()
    existing = await db.customers.find_one({"customer_id": customer_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Customer not found")

    linked_jobs = await db.jobs.count_documents({"customer_id": customer_id})
    if linked_jobs > 0:
        raise HTTPException(status_code=400, detail="Cannot delete customer with existing jobs")

    result = await db.customers.delete_one({"customer_id": customer_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Customer not found")
    return {"message": "Customer deleted", "customer_id": customer_id}
