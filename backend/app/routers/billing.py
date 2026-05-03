from fastapi import APIRouter, HTTPException, Depends, Query
from typing import List, Optional
from ..models.billing import BillingCreate, BillingResponse
from ..auth.utils import require_admin, require_admin_or_manager
from ..database import get_db
from ..utils.id_generator import generate_billing_id
from ..utils.timezone import today_ist_str

router = APIRouter(prefix="/billing", tags=["Billing"])


def calc_profit(invoice: float, collected: float, expense: float, material: float):
    total_income = invoice + collected
    profit = total_income - expense - material
    pct = (profit / total_income * 100) if total_income > 0 else 0.0
    return round(profit, 2), round(pct, 2)


async def _compute_material_amount(db, job_id: str) -> float:
    usage_docs = await db.job_inventory_usage.find({"job_id": job_id}).to_list(2000)
    if not usage_docs:
        return 0.0

    total = 0.0
    for usage in usage_docs:
        qty = float(usage.get("quantity_used", 0) or 0)
        if qty <= 0:
            continue
        unit_amount = usage.get("unit_selling_price")
        if unit_amount is None:
            inv_item = await db.inventory.find_one({"barcode": usage.get("barcode")})
            unit_amount = float((inv_item or {}).get("selling_price", 0) or 0)
        else:
            unit_amount = float(unit_amount or 0)
        total += qty * unit_amount
    return round(total, 2)


def _fmt(b: dict) -> dict:
    return {
        "billing_id": b["billing_id"],
        "job_id": b["job_id"],
        "customer_name": b.get("customer_name"),
        "complete_date": b["complete_date"],
        "work_type": b.get("work_type"),
        "invoice_amount": b["invoice_amount"],
        "expense": b["expense"],
        "material_amount": b["material_amount"],
        "profit": b["profit"],
        "profit_percentage": b["profit_percentage"],
        "collected_amount": b.get("collected_amount"),
        "payment_mode": b.get("payment_mode"),
        "payment_id": b.get("payment_id"),
    }


@router.get("/", response_model=List[BillingResponse])
async def list_billing(
    month: Optional[str] = Query(None, description="YYYY-MM"),
    date_from: Optional[str] = Query(None, description="YYYY-MM-DD"),
    date_to: Optional[str] = Query(None, description="YYYY-MM-DD"),
    _=Depends(require_admin_or_manager)
):
    db = get_db()
    query = {}
    if date_from or date_to:
        query["complete_date"] = {}
        if date_from:
            query["complete_date"]["$gte"] = date_from
        if date_to:
            query["complete_date"]["$lte"] = date_to
    elif month:
        query["complete_date"] = {"$regex": f"^{month}"}
    billing = await db.billing.find(query).sort("complete_date", -1).to_list(500)
    return [_fmt(b) for b in billing]


@router.post("/", response_model=BillingResponse)
async def create_billing(data: BillingCreate, _=Depends(require_admin)):
    db = get_db()
    job = await db.jobs.find_one({"job_id": data.job_id})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    existing = await db.billing.find_one({"job_id": data.job_id})
    if existing:
        raise HTTPException(status_code=400, detail="Billing already exists for this job")

    material_amount = float(data.material_amount or 0.0)
    if material_amount <= 0:
        material_amount = await _compute_material_amount(db, data.job_id)

    profit, profit_pct = calc_profit(data.invoice_amount, data.collected_amount or 0.0, data.expense, material_amount)

    billing_doc = {
        "billing_id": generate_billing_id(),
        "job_id": data.job_id,
        "customer_name": job.get("customer_name"),
        "complete_date": today_ist_str(),
        "work_type": job.get("work_type"),
        "invoice_amount": data.invoice_amount,
        "expense": data.expense,
        "material_amount": material_amount,
        "profit": profit,
        "profit_percentage": profit_pct,
        "collected_amount": data.collected_amount,
        "payment_mode": data.payment_mode,
        "payment_id": data.payment_id,
    }
    await db.billing.insert_one(billing_doc)
    # Mark job as complete
    await db.jobs.update_one({"job_id": data.job_id}, {"$set": {"status": "complete"}})
    return _fmt(billing_doc)


@router.get("/{billing_id}", response_model=BillingResponse)
async def get_billing(billing_id: str, _=Depends(require_admin_or_manager)):
    db = get_db()
    b = await db.billing.find_one({"billing_id": billing_id})
    if not b:
        raise HTTPException(status_code=404, detail="Billing record not found")
    return _fmt(b)


@router.put("/{billing_id}", response_model=BillingResponse)
async def update_billing(billing_id: str, data: BillingCreate, _=Depends(require_admin)):
    db = get_db()
    profit, profit_pct = calc_profit(data.invoice_amount, data.collected_amount or 0.0, data.expense, data.material_amount)
    update_data = {
        "invoice_amount": data.invoice_amount,
        "expense": data.expense,
        "material_amount": data.material_amount,
        "profit": profit,
        "profit_percentage": profit_pct,
        "collected_amount": data.collected_amount,
        "payment_mode": data.payment_mode,
        "payment_id": data.payment_id,
    }
    result = await db.billing.find_one_and_update(
        {"billing_id": billing_id},
        {"$set": update_data},
        return_document=True
    )
    if not result:
        raise HTTPException(status_code=404, detail="Billing record not found")
    return _fmt(result)


@router.get("/summary/monthly")
async def monthly_summary(_=Depends(require_admin_or_manager)):
    db = get_db()
    pipeline = [
        {"$group": {
            "_id": {"$substr": ["$complete_date", 0, 7]},
            "total_jobs": {"$sum": 1},
            "total_revenue": {"$sum": "$invoice_amount"},
            "total_expense": {"$sum": "$expense"},
            "total_material": {"$sum": "$material_amount"},
            "total_profit": {"$sum": "$profit"},
            "total_collected": {"$sum": "$collected_amount"},
        }},
        {"$sort": {"_id": -1}},
        {"$limit": 12}
    ]
    result = await db.billing.aggregate(pipeline).to_list(12)
    return [{"month": r["_id"], **{k: v for k, v in r.items() if k != "_id"}} for r in result]
