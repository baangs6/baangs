from fastapi import APIRouter, HTTPException, Depends
from typing import List
from ..models.lookup import LookupItemCreate, DEFAULT_LOOKUPS
from ..auth.utils import require_admin, require_any
from ..database import get_db

router = APIRouter(prefix="/lookups", tags=["Lookups"])

VALID_TYPES = ["service_types", "priority_levels", "status_options", "payment_modes"]


@router.get("/{list_type}")
async def get_lookup(list_type: str, _=Depends(require_any)):
    if list_type not in VALID_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid list type. Must be one of: {VALID_TYPES}")
    db = get_db()
    lookup = await db.lookups.find_one({"list_type": list_type})
    if not lookup:
        # Seed defaults if not found
        items = [{"value": i["value"], "label": i["label"], "is_active": True}
                 for i in DEFAULT_LOOKUPS.get(list_type, [])]
        await db.lookups.insert_one({"list_type": list_type, "items": items})
        return {"list_type": list_type, "items": items}
    return {"list_type": list_type, "items": [i for i in lookup["items"] if i.get("is_active", True)]}


@router.get("/{list_type}/all")
async def get_all_lookup(list_type: str, _=Depends(require_admin)):
    """Get all items including inactive ones."""
    db = get_db()
    lookup = await db.lookups.find_one({"list_type": list_type})
    if not lookup:
        return {"list_type": list_type, "items": []}
    return {"list_type": list_type, "items": lookup.get("items", [])}


@router.post("/{list_type}")
async def add_lookup_item(list_type: str, item: LookupItemCreate, _=Depends(require_admin)):
    if list_type not in VALID_TYPES:
        raise HTTPException(status_code=400, detail="Invalid list type")
    db = get_db()
    new_item = {"value": item.value, "label": item.label, "is_active": True}
    await db.lookups.update_one(
        {"list_type": list_type},
        {"$push": {"items": new_item}},
        upsert=True
    )
    return {"message": "Item added", "item": new_item}


@router.put("/{list_type}/{value}")
async def toggle_lookup_item(list_type: str, value: str, body: dict, _=Depends(require_admin)):
    db = get_db()
    is_active = body.get("is_active", True)
    await db.lookups.update_one(
        {"list_type": list_type, "items.value": value},
        {"$set": {"items.$.is_active": is_active}}
    )
    return {"message": "Updated"}


@router.get("/")
async def get_all_lookups(_=Depends(require_any)):
    db = get_db()
    result = {}
    for list_type in VALID_TYPES:
        lookup = await db.lookups.find_one({"list_type": list_type})
        if lookup:
            result[list_type] = [i for i in lookup["items"] if i.get("is_active", True)]
        else:
            result[list_type] = DEFAULT_LOOKUPS.get(list_type, [])
    return result
