from fastapi import APIRouter, HTTPException, Depends
from typing import List
from ..models.daily_update import DailyUpdateCreate, DailyUpdateResponse, ManualInventoryVerify
from ..auth.utils import require_admin, get_current_user
from ..database import get_db
from ..utils.id_generator import generate_update_id, generate_usage_id, generate_transaction_id, generate_inventory_item_id
from ..utils.timezone import now_ist_str
from ..models.inventory import TransactionType
from ..utils.notifications import notify_roles
import uuid

router = APIRouter(prefix="/updates", tags=["Daily Updates"])


def _location_dict(location):
    return location.model_dump() if location else None


def _map_location_from_geo(location: dict | None) -> str | None:
    if not location:
        return None
    latitude = location.get("latitude")
    longitude = location.get("longitude")
    if not isinstance(latitude, (int, float)) or not isinstance(longitude, (int, float)):
        return None
    return f"{latitude:.6f},{longitude:.6f}"


def _normalize_manual_items(value):
    if isinstance(value, list):
        return [item for item in value if isinstance(item, dict)]
    if isinstance(value, dict):
        if "$" in value and isinstance(value["$"], dict):
            return [value["$"]]
        return []
    return []


def _ms_key(model_number: str, serial_number: str) -> str:
    return f"{(model_number or '').strip().lower()}|{(serial_number or '').strip().lower()}"


async def _generate_next_inventory_barcode(db) -> str:
    seq = 1
    while True:
        candidate = f"BTLC{seq:02d}"
        exists = await db.inventory.find_one({"barcode": candidate})
        if not exists:
            return candidate
        seq += 1


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
            inv_item = None
            inv_id = usage.get("inventory_item_id")
            if inv_id:
                inv_item = await db.inventory.find_one({"_id": inv_id})
            if not inv_item:
                inv_item = await db.inventory.find_one({"barcode": usage.get("barcode")})
            unit_amount = float((inv_item or {}).get("selling_price", 0) or 0)
        else:
            unit_amount = float(unit_amount or 0)

        total += qty * unit_amount

    return round(total, 2)


@router.get("/job/{job_id}", response_model=List[DailyUpdateResponse])
async def get_job_updates(job_id: str, current_user: dict = Depends(get_current_user)):
    db = get_db()
    updates = await db.daily_updates.find({"job_id": job_id}).sort("update_time", -1).to_list(200)
    return [_fmt(u) for u in updates]


@router.post("/", response_model=DailyUpdateResponse)
async def create_update(data: DailyUpdateCreate, current_user: dict = Depends(get_current_user)):
    db = get_db()
    job = await db.jobs.find_one({"job_id": data.job_id})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if current_user["role"] == "technician":
        if job.get("assigned_staff_id") != current_user.get("staff_id"):
            raise HTTPException(status_code=403, detail="Not assigned to this job")

    # Get staff info
    staff_id = current_user.get("staff_id") or job.get("assigned_staff_id", "")
    staff_name = ""
    if staff_id:
        staff = await db.staff.find_one({"staff_id": staff_id})
        if staff:
            staff_name = staff["name"]

    # Validate and process inventory usage
    inventory_records = []
    transaction_records = []
    inventory_updates = []
    processed_inventory = []

    update_id = generate_update_id()
    duplicate_key_set = set()

    # Existing used model+serial for this job (to prevent re-adding same hardware item)
    existing_usage = await db.job_inventory_usage.find({"job_id": data.job_id}).to_list(2000)
    for usage in existing_usage:
        model_existing = usage.get("model_number")
        serial_existing = usage.get("serial_number")
        if model_existing and serial_existing:
            duplicate_key_set.add(_ms_key(model_existing, serial_existing))

    if data.inventory_used:
        for item_usage in data.inventory_used:
            inv_item = await db.inventory.find_one({"barcode": item_usage.barcode, "status": "active"})
            if not inv_item:
                raise HTTPException(status_code=400, detail=f"Inventory item not found for barcode: {item_usage.barcode}")

            model_number = inv_item.get("model_number")
            serial_number = (item_usage.serial_number or inv_item.get("serial_number") or "").strip()
            if model_number and serial_number:
                key = _ms_key(model_number, serial_number)
                if key in duplicate_key_set:
                    raise HTTPException(status_code=400, detail=f"Duplicate hardware entry: model '{model_number}' and serial '{serial_number}' already added")
                duplicate_key_set.add(key)
            
            if inv_item["current_quantity"] < item_usage.quantity_used:
                raise HTTPException(status_code=400, detail=f"Insufficient stock for {inv_item['item_name']}. Available: {inv_item['current_quantity']}")
                
            new_quantity = inv_item["current_quantity"] - item_usage.quantity_used
            
            # Prepare db operations
            inventory_updates.append((inv_item["barcode"], new_quantity))
            
            item_doc_id = str(inv_item["_id"])
            
            # Usage log
            usage_doc = {
                "_id": generate_usage_id(),
                "job_id": data.job_id,
                "job_update_id": update_id,
                "inventory_item_id": item_doc_id,
                "barcode": item_usage.barcode,
                "item_name": inv_item["item_name"],
                "model_number": inv_item.get("model_number"),
                "serial_number": serial_number or None,
                "quantity_used": item_usage.quantity_used,
                "unit_selling_price": float(inv_item.get("selling_price", 0) or 0),
                "technician_id": staff_id,
                "usage_datetime": now_ist_str()
            }
            inventory_records.append(usage_doc)
            processed_inventory.append(usage_doc)
            
            # Transaction log
            txn_doc = {
                "_id": generate_transaction_id(),
                "inventory_item_id": item_doc_id,
                "barcode": item_usage.barcode,
                "serial_number": serial_number or None,
                "transaction_type": TransactionType.STOCK_USED,
                "quantity_changed": -item_usage.quantity_used,
                "balance_after_transaction": new_quantity,
                "linked_job_id": data.job_id,
                "customer_details": f"{job.get('customer_name', '')} | {job.get('phone_number', '')} | {job.get('location', '')}".strip(" |"),
                "linked_technician_id": staff_id,
                "done_by_user_id": current_user["user_id"],
                "transaction_datetime": now_ist_str(),
                "remarks": f"Used in job {data.job_id}"
            }
            transaction_records.append(txn_doc)

    manual_inventory_items = []
    if data.manual_inventory_items:
        for item_usage in data.manual_inventory_items:
            model_number = item_usage.model_number
            serial_number = item_usage.serial_number
            if model_number and serial_number:
                key = _ms_key(model_number, serial_number)
                if key in duplicate_key_set:
                    raise HTTPException(status_code=400, detail=f"Duplicate hardware entry: model '{model_number}' and serial '{serial_number}' already added")
                duplicate_key_set.add(key)

            manual_doc = item_usage.model_dump()
            manual_doc.update({
                "manual_item_id": generate_usage_id(),
                "verification_status": "pending",
                "technician_id": staff_id,
                "submitted_at": now_ist_str(),
            })
            manual_inventory_items.append(manual_doc)

    update_doc = {
        "update_id": update_id,
        "update_time": now_ist_str(),
        "job_id": data.job_id,
        "assigned_staff_id": staff_id,
        "staff_name": staff_name,
        "work_type": data.work_type or job.get("work_type"),
        "status": data.status,
        "work_event": data.work_event,
        "location": _location_dict(data.location),
        "visit_notes": data.visit_notes,
        "expense": data.expense or 0.0,
        "service_bill": data.service_bill or 0.0,
        "collected_amount": data.collected_amount or 0.0,
        "invoice": data.invoice,
        "invoice_amount": data.invoice_amount or data.service_bill or 0.0,
        "inventory_used": processed_inventory,
        "manual_inventory_items": manual_inventory_items,
    }
    await db.daily_updates.insert_one(update_doc)

    # Execute inventory updates
    for barcode, new_qty in inventory_updates:
        await db.inventory.update_one(
            {"barcode": barcode},
            {"$set": {"current_quantity": new_qty, "updated_at": now_ist_str()}}
        )
        
    if transaction_records:
        await db.inventory_transactions.insert_many(transaction_records)
        
    if inventory_records:
        await db.job_inventory_usage.insert_many(inventory_records)

    job_update = {"status": data.status}
    if data.work_event == "start_work":
        map_location = _map_location_from_geo(update_doc["location"])
        job_update.update({
            "work_started_at": update_doc["update_time"],
            "work_started_by": staff_name or staff_id,
            "work_start_location": update_doc["location"],
        })
        if map_location:
            job_update["map_location"] = map_location
    elif data.work_event == "end_work":
        job_update.update({
            "work_ended_at": update_doc["update_time"],
            "work_ended_by": staff_name or staff_id,
            "work_end_location": update_doc["location"],
        })

    await db.jobs.update_one({"job_id": data.job_id}, {"$set": job_update})
    if data.work_event == "start_work" and job_update.get("map_location") and job.get("customer_id"):
        await db.customers.update_one(
            {"customer_id": job["customer_id"]},
            {"$set": {"map_location": job_update["map_location"]}}
        )

    if current_user["role"] == "technician":
        await notify_roles(
            db,
            ["admin"],
            "Technician Job Update",
            f"{data.job_id} changed to {data.status} by {staff_name or current_user.get('username')}",
            {"job_id": data.job_id, "status": data.status, "type": "technician_update"},
        )

    should_update_billing = (
        bool(inventory_records)
        or bool(data.expense and data.expense > 0)
        or bool(data.collected_amount and data.collected_amount > 0)
        or bool(data.invoice_amount and data.invoice_amount > 0)
        or bool(data.service_bill and data.service_bill > 0)
    )
    if should_update_billing:
        from .billing import calc_profit
        from ..utils.id_generator import generate_billing_id
        from ..utils.timezone import today_ist_str
        material_amount = await _compute_material_amount(db, data.job_id)

        billing = await db.billing.find_one({"job_id": data.job_id})
        if not billing:
            invoice_amount = float(data.invoice_amount or data.service_bill or 0)
            collected = float(data.collected_amount or 0)
            expense = float(data.expense or 0)
            profit, profit_pct = calc_profit(invoice_amount, collected, expense, material_amount)
            billing_doc = {
                "billing_id": generate_billing_id(),
                "job_id": data.job_id,
                "customer_name": job.get("customer_name"),
                "complete_date": today_ist_str(),
                "work_type": job.get("work_type"),
                "invoice_amount": invoice_amount,
                "expense": expense,
                "material_amount": material_amount,
                "profit": profit,
                "profit_percentage": profit_pct,
                "collected_amount": collected,
                "payment_mode": "cash",
                "payment_id": "",
            }
            await db.billing.insert_one(billing_doc)
        else:
            new_invoice = (billing.get("invoice_amount") or 0.0) + float(data.invoice_amount or data.service_bill or 0)
            new_expense = (billing.get("expense") or 0.0) + float(data.expense or 0)
            new_collected = (billing.get("collected_amount") or 0.0) + float(data.collected_amount or 0)
            
            profit, profit_pct = calc_profit(
                new_invoice,
                new_collected,
                new_expense,
                material_amount
            )
            await db.billing.update_one(
                {"billing_id": billing["billing_id"]},
                {"$set": {
                    "invoice_amount": new_invoice,
                    "expense": new_expense,
                    "collected_amount": new_collected,
                    "material_amount": material_amount,
                    "profit": profit,
                    "profit_percentage": profit_pct
                }}
            )

    return _fmt(update_doc)


@router.patch("/{update_id}/manual-inventory/{manual_item_id}/verify")
async def verify_manual_inventory(
    update_id: str,
    manual_item_id: str,
    data: ManualInventoryVerify,
    current_user: dict = Depends(require_admin),
):
    db = get_db()
    update = await db.daily_updates.find_one({"update_id": update_id})
    if not update:
        raise HTTPException(status_code=404, detail="Update not found")

    manual_items = _normalize_manual_items(update.get("manual_inventory_items", []))
    existing = next((item for item in manual_items if item.get("manual_item_id") == manual_item_id), None)
    if not existing:
        raise HTTPException(status_code=404, detail="Manual inventory item not found")

    # Combine data
    merged_data = {
        **existing,
        **{key: value for key, value in data.model_dump().items() if value is not None},
    }
    
    qty_used = float(merged_data.get("quantity_used", 0))
    barcode = merged_data.get("barcode", "").strip()
    item_name = merged_data.get("item_name", "").strip()
    purchase_price = float(merged_data.get("purchase_price") or 0.0)
    selling_price = float(merged_data.get("selling_price") or 0.0)
    opening_quantity = float(merged_data.get("opening_quantity") or 0.0)
    
    if not barcode and not item_name:
         raise HTTPException(status_code=400, detail="Barcode or item name must be provided")

    model_number = (merged_data.get("model_number") or "").strip()
    serial_number = (merged_data.get("serial_number") or "").strip()
    now_str = now_ist_str()
    # Always create a new inventory item from verified manual entry.
    # This prevents overwriting existing item IDs when admin verifies technician entries.
    barcode = await _generate_next_inventory_barcode(db)
    item_doc_id = generate_inventory_item_id()
    new_quantity = opening_quantity - qty_used
    new_item = {
        "_id": item_doc_id,
        "barcode": barcode,
        "item_name": item_name,
        "model_number": model_number or "MANUAL",
        "serial_number": serial_number or None,
        "serial_numbers": [serial_number] if serial_number else [],
        "category": merged_data.get("category") or "Miscellaneous",
        "brand": merged_data.get("brand"),
        "unit_type": merged_data.get("unit_type") or "Pcs",
        "purchase_price": purchase_price,
        "selling_price": selling_price,
        "opening_quantity": opening_quantity,
        "current_quantity": new_quantity,
        "minimum_stock_level": 0.0,
        "item_photo": None,
        "remarks": merged_data.get("remarks"),
        "status": "active",
        "created_at": now_str,
        "updated_at": now_str
    }
    await db.inventory.insert_one(new_item)

    # Record Usage & Transaction
    job_id = update["job_id"]
    technician_id = update.get("assigned_staff_id")
    
    usage_doc = {
        "_id": generate_usage_id(),
        "job_id": job_id,
        "job_update_id": update_id,
        "inventory_item_id": item_doc_id,
        "barcode": barcode,
        "item_name": item_name,
        "model_number": model_number or None,
        "serial_number": serial_number or None,
        "quantity_used": qty_used,
        "unit_selling_price": selling_price,
        "technician_id": technician_id,
        "usage_datetime": now_str
    }
    
    txn_doc = {
        "_id": generate_transaction_id(),
        "inventory_item_id": item_doc_id,
        "barcode": barcode,
        "serial_number": serial_number or None,
        "transaction_type": TransactionType.STOCK_USED,
        "quantity_changed": -qty_used,
        "balance_after_transaction": new_quantity,
        "linked_job_id": job_id,
        "linked_technician_id": technician_id,
        "done_by_user_id": current_user["user_id"],
        "transaction_datetime": now_str,
        "remarks": f"Verified manual usage in job {job_id}"
    }

    await db.job_inventory_usage.insert_one(usage_doc)
    await db.inventory_transactions.insert_one(txn_doc)

    verified_item = {
        **merged_data,
        "model_number": model_number or None,
        "serial_number": serial_number or None,
        "verification_status": "verified",
        "verified_by_user_id": current_user["user_id"],
        "verified_at": now_str,
        "inventory_item_id": item_doc_id,
        "barcode": barcode,
    }

    updated_manual_items = []
    replaced = False
    for item in manual_items:
        if isinstance(item, dict) and item.get("manual_item_id") == manual_item_id:
            updated_manual_items.append(verified_item)
            replaced = True
        else:
            updated_manual_items.append(item)
    if not replaced:
        updated_manual_items.append(verified_item)

    await db.daily_updates.update_one(
        {"update_id": update_id},
        {"$set": {"manual_inventory_items": updated_manual_items}},
    )

    return {"message": "Manual inventory verified and recorded", "item": verified_item}


def _fmt(u: dict) -> dict:
    return {
        "update_id": u["update_id"],
        "update_time": u["update_time"],
        "job_id": u["job_id"],
        "assigned_staff_id": u["assigned_staff_id"],
        "staff_name": u["staff_name"],
        "work_type": u.get("work_type"),
        "status": u["status"],
        "work_event": u.get("work_event"),
        "location": u.get("location"),
        "visit_notes": u.get("visit_notes"),
        "expense": u.get("expense", 0.0),
        "service_bill": u.get("service_bill", 0.0),
        "collected_amount": u.get("collected_amount", 0.0),
        "invoice": u.get("invoice"),
        "invoice_amount": u.get("invoice_amount", u.get("service_bill", 0.0)),
        "inventory_used": u.get("inventory_used", []),
        "manual_inventory_items": _normalize_manual_items(u.get("manual_inventory_items", [])),
    }
