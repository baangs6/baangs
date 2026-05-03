from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
from ..auth.utils import get_current_user, require_admin_or_manager
from ..database import get_db
from ..utils.timezone import now_ist_str
import uuid

router = APIRouter(prefix="/leaves", tags=["Leaves"])


def _fmt(row: dict) -> dict:
    return {
        "leave_id": row["leave_id"],
        "staff_id": row.get("staff_id"),
        "staff_name": row.get("staff_name"),
        "user_id": row.get("user_id"),
        "leave_type": row.get("leave_type"),
        "from_date": row.get("from_date"),
        "to_date": row.get("to_date"),
        "reason": row.get("reason"),
        "status": row.get("status", "pending"),
        "decision_note": row.get("decision_note"),
        "decision_by_user_id": row.get("decision_by_user_id"),
        "decision_at": row.get("decision_at"),
        "created_at": row.get("created_at"),
    }


@router.post("/")
async def apply_leave(payload: dict, current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "technician":
        raise HTTPException(status_code=403, detail="Only technicians can apply for leave")

    leave_type = (payload.get("leave_type") or "").strip().lower()
    from_date = payload.get("from_date")
    to_date = payload.get("to_date")
    reason = payload.get("reason")
    allowed_types = {"casual", "sick", "earned", "unpaid"}
    if not leave_type or leave_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail="leave_type is required and must be one of: casual, sick, earned, unpaid",
        )
    if not from_date or not to_date or not reason:
        raise HTTPException(status_code=400, detail="leave_type, from_date, to_date and reason are required")

    db = get_db()
    leave_doc = {
        "leave_id": f"LEV-{uuid.uuid4().hex[:8].upper()}",
        "staff_id": current_user.get("staff_id"),
        "staff_name": current_user.get("full_name") or current_user.get("username"),
        "user_id": current_user.get("user_id"),
        "leave_type": leave_type,
        "from_date": from_date,
        "to_date": to_date,
        "reason": reason,
        "status": "pending",
        "decision_note": None,
        "decision_by_user_id": None,
        "decision_at": None,
        "created_at": now_ist_str(),
    }
    await db.leaves.insert_one(leave_doc)
    return _fmt(leave_doc)


@router.get("/")
async def list_leaves(
    status: Optional[str] = Query(None),
    mine: bool = Query(False),
    current_user: dict = Depends(get_current_user),
):
    db = get_db()
    query = {}
    if status:
        query["status"] = status
    if mine or current_user.get("role") == "technician":
        query["user_id"] = current_user.get("user_id")
    rows = await db.leaves.find(query).sort("created_at", -1).to_list(1000)
    return [_fmt(r) for r in rows]


@router.patch("/{leave_id}/decision")
async def decide_leave(leave_id: str, payload: dict, current_user: dict = Depends(require_admin_or_manager)):
    decision = (payload.get("decision") or "").lower()
    if decision not in {"approved", "rejected"}:
        raise HTTPException(status_code=400, detail="decision must be approved or rejected")
    note = payload.get("note")
    db = get_db()
    row = await db.leaves.find_one_and_update(
        {"leave_id": leave_id},
        {"$set": {
            "status": decision,
            "decision_note": note,
            "decision_by_user_id": current_user.get("user_id"),
            "decision_at": now_ist_str(),
        }},
        return_document=True,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Leave request not found")
    return _fmt(row)
