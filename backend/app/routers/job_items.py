import hashlib
import json
import math
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from pymongo.errors import OperationFailure

from ..auth.utils import require_admin_or_manager
from ..database import get_db, get_db_mode
from ..utils.amc import price_bill
from ..utils.id_generator import generate_usage_id, generate_transaction_id, generate_billing_id
from ..utils.timezone import now_ist_str, today_ist_str
from .billing import calc_profit
from .updates import _normalize_manual_items

router = APIRouter(prefix="/jobs", tags=["Job Items"])


class JobItem(BaseModel):
    usage_id: str | None = None
    barcode: str = Field(min_length=1, max_length=128)
    quantity_used: float = Field(gt=0, allow_inf_nan=False)
    unit_selling_price: float = Field(ge=0, allow_inf_nan=False)
    serial_number: str | None = Field(default=None, max_length=256)
    warranty_years: int | None = Field(default=None, ge=0, le=5)


class JobItemsEdit(BaseModel):
    version: str = Field(min_length=64, max_length=64)
    items: list[JobItem]


def items_version(items):
    ordered = sorted(items, key=lambda item: str(item["_id"]))
    return hashlib.sha256(json.dumps(ordered, sort_keys=True, default=str).encode()).hexdigest()


def plan_items(existing, requested, catalogue, job_id, user_id):
    originals = {str(item["_id"]): item for item in existing}
    seen_ids, serials = set(), set()
    rows = []
    for item in requested:
        original = originals.get(item.usage_id) if item.usage_id else None
        if item.usage_id and (not original or item.usage_id in seen_ids):
            raise HTTPException(400, "Invalid or duplicate used-item ID")
        seen_ids.add(item.usage_id)
        if original and original["barcode"] != item.barcode:
            raise HTTPException(400, "Remove the old product and add its replacement")
        stock = catalogue.get(item.barcode)
        if not stock:
            raise HTTPException(400, f"Inventory item not found: {item.barcode}")
        serial = (item.serial_number or "").strip() or None
        model = (original or stock).get("model_number")
        if serial:
            key = ((model or item.barcode).strip().casefold(), serial.casefold())
            if key in serials:
                raise HTTPException(400, "Duplicate serialized hardware")
            serials.add(key)
            changed = not original or (serial, item.quantity_used) != (original.get("serial_number"), original.get("quantity_used"))
            if changed and item.quantity_used != 1:
                raise HTTPException(400, "A serialized product must have quantity 1")
        row = dict(original) if original else {
            "_id": generate_usage_id(), "job_id": job_id, "job_update_id": None,
            "inventory_item_id": str(stock["_id"]), "barcode": item.barcode,
            "item_name": stock["item_name"], "model_number": model,
            "technician_id": None, "usage_datetime": now_ist_str(),
        }
        values = item.model_dump(exclude={"usage_id", "barcode"})
        values.update(serial_number=serial, unit_selling_price=round(item.unit_selling_price, 2))
        if any(row.get(key) != value for key, value in values.items()):
            row.update(values, edited_by_user_id=user_id, edited_at=now_ist_str())
        rows.append(row)
    if not math.isfinite(sum(row["quantity_used"] * row["unit_selling_price"] for row in rows)):
        raise HTTPException(400, "Material total is too large")
    deltas = defaultdict(float)
    for row in existing:
        deltas[row["barcode"]] -= float(row["quantity_used"])
    for row in rows:
        deltas[row["barcode"]] += row["quantity_used"]
    return rows, deltas


async def read_items(db, job_id, session=None):
    return await db.job_inventory_usage.find({"job_id": job_id}, session=session).to_list(None)


@router.get("/{job_id}/items")
async def get_items(job_id: str, _=Depends(require_admin_or_manager)):
    db = get_db()
    if not await db.jobs.find_one({"job_id": job_id}):
        raise HTTPException(404, "Job not found")
    items = await read_items(db, job_id)
    return {"version": items_version(items), "items": [{**row, "_id": str(row["_id"])} for row in items]}


@router.put("/{job_id}/items")
async def edit_items(job_id: str, data: JobItemsEdit, user=Depends(require_admin_or_manager)):
    db = get_db()
    if get_db_mode() != "mongo":
        raise HTTPException(503, "Item editing requires a transactional MongoDB deployment")

    async def save(session):
        job = await db.jobs.find_one({"job_id": job_id}, session=session)
        if not job:
            raise HTTPException(404, "Job not found")
        existing = await read_items(db, job_id, session)
        if items_version(existing) != data.version:
            raise HTTPException(409, "Items changed. Close the editor and reopen it before saving")
        barcodes = {row["barcode"] for row in existing} | {row.barcode for row in data.items}
        stock_rows = await db.inventory.find({"barcode": {"$in": list(barcodes)}}, session=session).to_list(None)
        catalogue = {row["barcode"]: row for row in stock_rows}
        rows, deltas = plan_items(existing, data.items, catalogue, job_id, user["user_id"])
        await db.jobs.update_one({"job_id": job_id}, {"$inc": {"items_revision": 1}}, session=session)
        for barcode in barcodes:
            before = [row for row in existing if row["barcode"] == barcode]
            after = [row for row in rows if row["barcode"] == barcode]
            if before == after:
                continue
            delta = deltas[barcode]
            query = {"barcode": barcode}
            if delta > 0:
                query.update(status="active", current_quantity={"$gte": delta})
            stock = await db.inventory.find_one_and_update(
                query, {"$inc": {"current_quantity": -delta}, "$set": {"updated_at": now_ist_str()}},
                return_document=True, session=session,
            )
            if not stock:
                raise HTTPException(409, f"Insufficient stock or unavailable product: {barcode}")
            await db.inventory_transactions.insert_one({
                "_id": generate_transaction_id(), "inventory_item_id": str(stock["_id"]),
                "barcode": barcode, "transaction_type": "stock_adjusted",
                "quantity_changed": -delta, "balance_after_transaction": stock["current_quantity"],
                "linked_job_id": job_id, "done_by_user_id": user["user_id"],
                "transaction_datetime": now_ist_str(), "remarks": f"Web item correction for {job_id}",
                "items_before": [{**row, "_id": str(row["_id"])} for row in before],
                "items_after": [{**row, "_id": str(row["_id"])} for row in after],
            }, session=session)
        new_ids = {str(row["_id"]) for row in rows}
        for old in existing:
            if str(old["_id"]) not in new_ids:
                await db.job_inventory_usage.delete_one({"_id": old["_id"]}, session=session)
        for row in rows:
            await db.job_inventory_usage.replace_one({"_id": row["_id"]}, row, upsert=True, session=session)

        updates = await db.daily_updates.find({"job_id": job_id}, session=session).to_list(None)
        old_inventory_ids = {row.get("inventory_item_id") for row in existing}
        for update in updates:
            snapshot = [row for row in rows if row.get("job_update_id") == update["update_id"]]
            manual = []
            for item in _normalize_manual_items(update.get("manual_inventory_items")):
                if item.get("verification_status") == "verified" and item.get("inventory_item_id") in old_inventory_ids:
                    match = next((row for row in snapshot if row.get("inventory_item_id") == item.get("inventory_item_id")), None)
                    if not match:
                        continue
                    item = {**item, **{key: match.get(key) for key in ("quantity_used", "serial_number", "warranty_years")},
                            "selling_price": match["unit_selling_price"]}
                manual.append(item)
            await db.daily_updates.update_one({"_id": update["_id"]}, {"$set": {
                "inventory_used": snapshot, "manual_inventory_items": manual,
            }}, session=session)

        bill = await db.billing.find_one({"job_id": job_id}, session=session)
        if bill or rows:
            bill = bill or {"billing_id": generate_billing_id(), "job_id": job_id,
                "customer_name": job.get("customer_name"), "work_type": job.get("work_type"),
                "complete_date": today_ist_str(), "expense": 0, "collected_amount": 0,
                "payment_mode": "cash", "payment_id": "", "service_amount": 0}
            service = bill.get("service_gross_amount", bill.get("service_amount"))
            if service is None:
                service = max(0, float(bill.get("invoice_amount", 0)) - float(bill.get("material_amount", 0)))
            material = round(sum(row["quantity_used"] * row["unit_selling_price"] for row in rows), 2)
            bill.update(material_amount=material, service_amount=service, invoice_amount=round(material + service, 2))
            benefits = job.get("amc_benefits") or bill.get("amc_benefits")
            if benefits:
                bill.update(material_gross_amount=material, service_gross_amount=service)
                bill = price_bill(bill, benefits)
            bill["profit"], bill["profit_percentage"] = calc_profit(
                bill["invoice_amount"], bill.get("collected_amount"), bill.get("expense"), material)
            await db.billing.replace_one({"job_id": job_id}, bill, upsert=True, session=session)
        return {"message": "Job items updated"}

    try:
        async with await db.client.start_session() as session:
            return await session.with_transaction(save)
    except OperationFailure as exc:
        if exc.code == 20:
            raise HTTPException(503, "Item editing requires a MongoDB replica set or sharded cluster") from exc
        raise
