from fastapi import APIRouter, HTTPException, Depends, Query
from typing import List, Dict, Any
import re
from ..models.inventory import (
    InventoryItemCreate,
    InventoryItemUpdate,
    InventoryItemInDB,
    InventoryItemTechResponse,
    InventoryTransaction,
    TransactionType,
    InventoryStatus,
    InventoryAdjustmentRequest
)
from ..auth.utils import require_admin, require_any, require_admin_or_manager, get_current_user
from ..database import get_db
from ..utils.id_generator import generate_inventory_item_id, generate_transaction_id
from ..utils.timezone import now_ist_str

router = APIRouter(prefix="/inventory", tags=["Inventory"])


@router.get("/", response_model=List[Any])
async def get_inventory(current_user: dict = Depends(get_current_user)):
    db = get_db()
    items = await db.inventory.find({"status": InventoryStatus.ACTIVE}).to_list(1000)
    
    result = []
    for item in items:
        try:
            # Format id for response
            item["_id"] = str(item.get("_id", item.get("barcode")))
            # Provide defaults for fields that may be missing in older documents
            item.setdefault("model_number", "")
            item.setdefault("unit_type", "Pcs")
            item.setdefault("category", "General")
            
            if current_user["role"] == "technician":
                result.append(InventoryItemTechResponse(**item).dict(by_alias=True))
            else:
                result.append(InventoryItemInDB(**item).dict(by_alias=True))
        except Exception as e:
            # Skip documents with missing/invalid fields (e.g. legacy data)
            print(f"[inventory] Skipping invalid document {item.get('barcode', '?')}: {e}")
            continue
            
    return result


@router.get("/summary")
async def get_summary(current_user: dict = Depends(require_admin)):
    db = get_db()
    
    pipeline = [
        {"$match": {"status": "active"}},
        {"$group": {
            "_id": None,
            "total_items": {"$sum": 1},
            "total_purchase_value": {"$sum": {"$multiply": ["$current_quantity", "$purchase_price"]}},
            "total_selling_value": {"$sum": {"$multiply": ["$current_quantity", "$selling_price"]}},
            "total_quantity": {"$sum": "$current_quantity"}
        }}
    ]
    summary_cursor = db.inventory.aggregate(pipeline)
    summary_list = await summary_cursor.to_list(1)
    
    totals = summary_list[0] if summary_list else {
        "total_items": 0, "total_purchase_value": 0, "total_selling_value": 0, "total_quantity": 0
    }
    
    # Low stock
    low_stock = await db.inventory.aggregate([
        {"$match": {
            "status": "active",
            "$expr": { "$lte": [ "$current_quantity", "$minimum_stock_level" ] }
        }},
        {"$count": "count"}
    ]).to_list(1)
    low_stock_count = low_stock[0]["count"] if low_stock else 0
    
    # Last update
    last_txn = await db.inventory_transactions.find().sort("transaction_datetime", -1).limit(1).to_list(1)
    last_update = last_txn[0]["transaction_datetime"] if last_txn else None

    return {
        "total_items": totals["total_items"],
        "total_quantity": totals["total_quantity"],
        "total_purchase_value": totals["total_purchase_value"],
        "total_selling_value": totals["total_selling_value"],
        "low_stock_count": low_stock_count,
        "last_update": last_update
    }


@router.get("/transactions")
async def get_transactions(limit: int = 100, current_user: dict = Depends(require_admin)):
    db = get_db()
    txns = await db.inventory_transactions.find().sort("transaction_datetime", -1).limit(limit).to_list(limit)
    res = []
    for t in txns:
        t["_id"] = str(t["_id"])
        res.append(t)
    return res


@router.get("/search")
async def search_item(
    model_number: str | None = Query(None),
    serial_number: str | None = Query(None),
    current_user: dict = Depends(get_current_user),
):
    db = get_db()

    model = (model_number or "").strip()
    serial = (serial_number or "").strip()
    if not model and not serial:
        raise HTTPException(status_code=400, detail="Enter model number or serial number")

    query: dict[str, Any] = {"status": InventoryStatus.ACTIVE}
    if model:
        query["model_number"] = {"$regex": f"^{re.escape(model)}$", "$options": "i"}
    if serial:
        serial_regex = f"(^|\\s*,\\s*){re.escape(serial)}(\\s*,\\s*|$)"
        query["$or"] = [
            {"serial_number": {"$regex": serial_regex, "$options": "i"}},
            {"serial_numbers": {"$regex": f"^{re.escape(serial)}$", "$options": "i"}},
        ]

    items = await db.inventory.find(query).limit(20).to_list(20)
    if not items:
        if serial and not model:
            raise HTTPException(status_code=404, detail="No inventory found for this serial number")
        raise HTTPException(status_code=404, detail="No inventory found for the entered details")

    def fmt(item: dict):
        item["_id"] = str(item.get("_id", item.get("barcode")))
        item.setdefault("model_number", "")
        item.setdefault("unit_type", "Pcs")
        item.setdefault("category", "General")
        if current_user["role"] == "technician":
            return InventoryItemTechResponse(**item).dict(by_alias=True)
        return InventoryItemInDB(**item).dict(by_alias=True)

    result = [fmt(item) for item in items]
    if len(result) == 1:
        return result[0]
    return {"matches": result}


@router.get("/{barcode}")
async def get_item(barcode: str, current_user: dict = Depends(get_current_user)):
    db = get_db()
    # Primary lookup by exact barcode, then fallback to model/serial/name.
    item = await db.inventory.find_one({"barcode": barcode, "status": InventoryStatus.ACTIVE})
    if not item:
        fallback_query = {
            "status": InventoryStatus.ACTIVE,
            "$or": [
                {"model_number": {"$regex": f"^{barcode}$", "$options": "i"}},
                {"serial_number": {"$regex": barcode, "$options": "i"}},
                {"item_name": {"$regex": f"^{barcode}$", "$options": "i"}},
            ],
        }
        item = await db.inventory.find_one(fallback_query)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
        
    item["_id"] = str(item.get("_id", item.get("barcode")))
    
    if current_user["role"] == "technician":
        return InventoryItemTechResponse(**item).dict(by_alias=True)
    return InventoryItemInDB(**item).dict(by_alias=True)


@router.post("/", response_model=InventoryItemInDB)
async def create_item(data: InventoryItemCreate, current_user: dict = Depends(require_admin)):
    db = get_db()
    
    # Find next available BTLC ID
    next_seq = 1
    barcode = ""
    while True:
        candidate_id = f"BTLC{next_seq:02d}"
        exists = await db.inventory.find_one({"barcode": candidate_id})
        if not exists:
            barcode = candidate_id
            break
        next_seq += 1
    
    item_id = generate_inventory_item_id()
    item_doc = data.dict()
    item_doc["_id"] = item_id
    item_doc["barcode"] = barcode 
    
    # Ensure tax_percentage defaults to 18 if 0
    if item_doc.get("tax_percentage") == 0:
        item_doc["tax_percentage"] = 18.0
        
    item_doc["current_quantity"] = data.opening_quantity
    item_doc["created_at"] = now_ist_str()
    item_doc["updated_at"] = now_ist_str()
    
    await db.inventory.insert_one(item_doc)
    
    # Create opening stock transaction
    txn = {
        "_id": generate_transaction_id(),
        "inventory_item_id": item_id,
        "barcode": barcode,
        "serial_number": item_doc.get("serial_number"),
        "transaction_type": TransactionType.OPENING_STOCK,
        "quantity_changed": data.opening_quantity,
        "balance_after_transaction": data.opening_quantity,
        "done_by_user_id": current_user["user_id"],
        "transaction_datetime": now_ist_str(),
        "remarks": "Opening stock"
    }
    await db.inventory_transactions.insert_one(txn)
    
    return item_doc


@router.post("/bulk", response_model=Dict[str, Any])
async def bulk_upload_items(items: List[InventoryItemCreate], current_user: dict = Depends(require_admin)):
    db = get_db()
    success_count = 0
    errors = []
    
    for idx, data in enumerate(items):
        existing = await db.inventory.find_one({"barcode": data.barcode})
        if existing:
            errors.append({"index": idx, "barcode": data.barcode, "error": "Barcode exists"})
            continue
            
        item_id = generate_inventory_item_id()
        item_doc = data.dict()
        item_doc["_id"] = item_id
        item_doc["current_quantity"] = data.opening_quantity
        item_doc["created_at"] = now_ist_str()
        item_doc["updated_at"] = now_ist_str()
        
        await db.inventory.insert_one(item_doc)
        
        txn = {
            "_id": generate_transaction_id(),
            "inventory_item_id": item_id,
            "barcode": data.barcode,
            "serial_number": item_doc.get("serial_number"),
            "transaction_type": TransactionType.OPENING_STOCK,
            "quantity_changed": data.opening_quantity,
            "balance_after_transaction": data.opening_quantity,
            "done_by_user_id": current_user["user_id"],
            "transaction_datetime": now_ist_str(),
            "remarks": "Bulk upload opening stock"
        }
        await db.inventory_transactions.insert_one(txn)
        success_count += 1
        
    return {"success": success_count, "errors": errors}


@router.put("/{barcode}", response_model=InventoryItemInDB)
async def update_item(barcode: str, data: InventoryItemUpdate, current_user: dict = Depends(require_admin)):
    db = get_db()
    item = await db.inventory.find_one({"barcode": barcode})
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    update_data = data.dict(exclude_unset=True)
    update_data["updated_at"] = now_ist_str()
    
    await db.inventory.update_one({"barcode": barcode}, {"$set": update_data})
    
    updated_item = await db.inventory.find_one({"barcode": barcode})
    updated_item["_id"] = str(updated_item["_id"])
    return updated_item


@router.delete("/{barcode}")
async def deactivate_item(barcode: str, current_user: dict = Depends(require_admin)):
    db = get_db()
    item = await db.inventory.find_one({"barcode": barcode})
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    await db.inventory.update_one(
        {"barcode": barcode}, 
        {"$set": {"status": InventoryStatus.INACTIVE, "updated_at": now_ist_str()}}
    )
    return {"message": "Item deactivated successfully"}


@router.post("/{barcode}/adjust", response_model=Dict[str, Any])
async def adjust_stock(barcode: str, data: Dict[str, Any], current_user: dict = Depends(require_admin)):
    db = get_db()
    item = await db.inventory.find_one({"barcode": barcode})
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
        
    quantity_changed = float(data.get("quantity_changed", 0))
    new_quantity = item["current_quantity"] + quantity_changed
    if new_quantity < 0:
        raise HTTPException(status_code=400, detail="Adjustment would result in negative stock")
        
    await db.inventory.update_one(
        {"barcode": barcode},
        {"$set": {"current_quantity": new_quantity, "updated_at": now_ist_str()}}
    )
    
    # Log transaction
    txn_type = data.get("transaction_type") or (TransactionType.STOCK_ADDED if quantity_changed >= 0 else TransactionType.STOCK_ADJUSTED)
    txn = {
        "_id": generate_transaction_id(),
        "inventory_item_id": str(item["_id"]),
        "barcode": barcode,
        "serial_number": item.get("serial_number"),
        "transaction_type": txn_type,
        "quantity_changed": quantity_changed,
        "balance_after_transaction": new_quantity,
        "done_by_user_id": current_user["user_id"],
        "transaction_datetime": now_ist_str(),
        "remarks": data.get("remarks"),
        "project_duration": data.get("project_duration"),
        "project_name": data.get("project_name"),
        "customer_details": data.get("customer_details"),
        "amount_paid": float(data.get("amount_paid", 0)),
        "linked_technician_id": data.get("linked_technician_id"),
        "linked_job_id": data.get("linked_job_id")
    }
    await db.inventory_transactions.insert_one(txn)
    
    return {"message": "Stock adjusted successfully", "new_quantity": new_quantity}


@router.get("/reports/stock-summary")
async def get_stock_summary(current_user: dict = Depends(require_admin_or_manager)):
    db = get_db()
    items = await db.inventory.find({"status": "active"}).to_list(1000)
    
    # Group by model_number as the unique identifier
    model_map = {}
    for item in items:
        model_num = item.get("model_number") or item.get("barcode", "UNKNOWN")
        
        # Sum all non-opening transactions for this barcode
        txns_pipeline = [
            {"$match": {
                "barcode": item["barcode"],
                "transaction_type": {"$ne": TransactionType.OPENING_STOCK}
            }},
            {"$group": {"_id": None, "total_change": {"$sum": "$quantity_changed"}}}
        ]
        txn_sum_cursor = db.inventory_transactions.aggregate(txns_pipeline)
        txn_sum_list = await txn_sum_cursor.to_list(1)
        total_txns = txn_sum_list[0]["total_change"] if txn_sum_list else 0
        
        if model_num not in model_map:
            model_map[model_num] = {
                "model_number": model_num,
                "item_name": item["item_name"],
                "initial_quantity": 0,
                "total_transactions": 0,
                "current_stock": 0,
                "minimum_stock_level": item.get("minimum_stock_level", 0),
            }
        
        model_map[model_num]["initial_quantity"] += item.get("opening_quantity", 0)
        model_map[model_num]["total_transactions"] += total_txns
        model_map[model_num]["current_stock"] += item.get("current_quantity", 0)
    
    report = []
    for data in model_map.values():
        data["low_stock"] = "YES" if data["current_stock"] <= data["minimum_stock_level"] else "NO"
        report.append(data)
    
    return report


@router.get("/reports/sold-details")
async def get_sold_details(current_user: dict = Depends(require_admin_or_manager)):
    db = get_db()
    # "Sold" usually means STOCK_OUT or STOCK_USED where quantity_changed < 0
    # In the images, it shows project/customer details.
    txns = await db.inventory_transactions.find({
        "transaction_type": {"$in": ["STOCK_OUT", "STOCK_USED", "stock_used"]}
    }).sort("transaction_datetime", -1).to_list(1000)
    
    res = []
    for t in txns:
        t["_id"] = str(t["_id"])
        # Add item details for profit calculation
        item = await db.inventory.find_one({"barcode": t["barcode"]})
        if item:
            t["item_name"] = item["item_name"]
            t["purchase_price"] = item["purchase_price"]
            t["selling_price"] = item["selling_price"]
        if not t.get("customer_details") and t.get("linked_job_id"):
            job = await db.jobs.find_one({"job_id": t.get("linked_job_id")})
            if job:
                t["customer_details"] = f"{job.get('customer_name', '')} | {job.get('phone_number', '')} | {job.get('location', '')}".strip(" |")
        res.append(t)
    return res
