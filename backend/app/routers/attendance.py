from fastapi import APIRouter, HTTPException, Depends, Query, UploadFile, File
from typing import List, Optional
from ..models.attendance import (
    CheckInCreate,
    CheckOutCreate,
    AttendanceResponse,
    DailyAllowanceCreate,
    DailyAllowancePayment,
    DailyAllowanceResponse,
)
from ..auth.utils import require_admin, require_admin_or_manager, require_any, get_current_user
from ..database import get_db
from ..utils.id_generator import generate_attendance_id, generate_allowance_id
from ..utils.timezone import now_ist_str, today_ist_str
from ..utils.cloudinary_helper import upload_image_bytes

router = APIRouter(prefix="/attendance", tags=["Attendance"])


def _calc_payment_status(amount: float, paid_amount: float) -> tuple[str, float, float]:
    amount = round(float(amount or 0), 2)
    paid_amount = round(float(paid_amount or 0), 2)
    balance = round(max(amount - paid_amount, 0), 2)
    extra = round(max(paid_amount - amount, 0), 2)
    if paid_amount <= 0:
        return "unpaid", balance, extra
    if paid_amount < amount:
        return "partial", balance, extra
    if paid_amount == amount:
        return "paid", balance, extra
    return "overpaid", balance, extra


def _fmt_allowance(a: dict) -> dict:
    status, balance, extra = _calc_payment_status(a.get("amount", 0), a.get("paid_amount", 0))
    return {
        "allowance_id": a["allowance_id"],
        "staff_id": a["staff_id"],
        "staff_name": a.get("staff_name"),
        "date": a["date"],
        "expense_type": a["expense_type"],
        "amount": float(a.get("amount", 0)),
        "bill_url": a.get("bill_url"),
        "remark": a.get("remark"),
        "paid_amount": float(a.get("paid_amount", 0)),
        "balance_amount": balance,
        "extra_paid_amount": extra,
        "payment_status": status,
        "payment_remark": a.get("payment_remark"),
        "payment_made_date": a.get("payment_made_date"),
        "paid_at": a.get("paid_at"),
        "paid_by": a.get("paid_by"),
        "created_at": a.get("created_at"),
    }


def _fmt(a: dict, staff_name: str = None) -> dict:
    return {
        "attendance_id": a["attendance_id"],
        "staff_id": a["staff_id"],
        "staff_name": staff_name or a.get("staff_name"),
        "date": a["date"],
        "checkin_time": a.get("checkin_time"),
        "checkout_time": a.get("checkout_time"),
        "checkin_latitude": a.get("checkin_latitude"),
        "checkin_longitude": a.get("checkin_longitude"),
        "checkout_latitude": a.get("checkout_latitude"),
        "checkout_longitude": a.get("checkout_longitude"),
        "checkin_photo_url": a.get("checkin_photo_url"),
        "checkout_photo_url": a.get("checkout_photo_url"),
        "remarks": a.get("remarks"),
        "checkout_remarks": a.get("checkout_remarks"),
        "is_checked_out": a.get("is_checked_out", False),
    }


@router.post("/checkin", response_model=AttendanceResponse)
async def check_in(data: CheckInCreate, current_user: dict = Depends(get_current_user)):
    db = get_db()
    today = today_ist_str()

    # Check if already checked in today
    existing = await db.attendance.find_one({"staff_id": data.staff_id, "date": today})
    if existing:
        raise HTTPException(status_code=400, detail="Already checked in today")

    staff = await db.staff.find_one({"staff_id": data.staff_id})
    staff_name = staff["name"] if staff else "Unknown"

    att_doc = {
        "attendance_id": generate_attendance_id(),
        "staff_id": data.staff_id,
        "staff_name": staff_name,
        "date": today,
        "checkin_time": now_ist_str(),
        "checkout_time": None,
        "checkin_latitude": data.latitude,
        "checkin_longitude": data.longitude,
        "checkout_latitude": None,
        "checkout_longitude": None,
        "checkin_photo_url": data.photo_url,
        "checkout_photo_url": None,
        "remarks": data.remarks,
        "checkout_remarks": None,
        "is_checked_out": False,
    }
    await db.attendance.insert_one(att_doc)
    return _fmt(att_doc, staff_name)


@router.post("/checkout", response_model=AttendanceResponse)
async def check_out(data: CheckOutCreate, current_user: dict = Depends(get_current_user)):
    db = get_db()
    att = await db.attendance.find_one({"attendance_id": data.attendance_id})
    if not att:
        raise HTTPException(status_code=404, detail="Attendance record not found")
    if att.get("is_checked_out"):
        raise HTTPException(status_code=400, detail="Already checked out")

    update = {
        "checkout_time": now_ist_str(),
        "checkout_latitude": data.latitude,
        "checkout_longitude": data.longitude,
        "checkout_photo_url": data.photo_url,
        "checkout_remarks": data.remarks,
        "is_checked_out": True,
    }
    result = await db.attendance.find_one_and_update(
        {"attendance_id": data.attendance_id},
        {"$set": update},
        return_document=True
    )
    return _fmt(result)


@router.get("/today/{staff_id}")
async def get_today_attendance(staff_id: str, _=Depends(require_any)):
    db = get_db()
    today = today_ist_str()
    att = await db.attendance.find_one({"staff_id": staff_id, "date": today})
    if not att:
        return None
    return _fmt(att)


@router.get("/", response_model=List[AttendanceResponse])
async def list_attendance(
    staff_id: Optional[str] = Query(None),
    date: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    skip: int = 0,
    limit: int = 100,
    _=Depends(require_admin_or_manager)
):
    db = get_db()
    query = {}
    if staff_id:
        query["staff_id"] = staff_id
    if date:
        query["date"] = date
    elif date_from or date_to:
        date_filter = {}
        if date_from:
            date_filter["$gte"] = date_from
        if date_to:
            date_filter["$lte"] = date_to
        query["date"] = date_filter

    records = await db.attendance.find(query).sort("date", -1).skip(skip).limit(limit).to_list(limit)
    return [_fmt(r) for r in records]


@router.post("/allowances", response_model=DailyAllowanceResponse)
async def create_allowance(data: DailyAllowanceCreate, current_user: dict = Depends(get_current_user)):
    db = get_db()
    if current_user["role"] == "technician" and data.staff_id != current_user.get("staff_id"):
        raise HTTPException(status_code=403, detail="Technicians can only add their own expenses")

    if data.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be greater than zero")
    if data.expense_type.value == "other" and not (data.remark or "").strip():
        raise HTTPException(status_code=400, detail="Remark is required for Other Expense")

    staff = await db.staff.find_one({"staff_id": data.staff_id})
    staff_name = staff["name"] if staff else current_user.get("full_name") or current_user.get("username") or "Unknown"
    status, balance, extra = _calc_payment_status(data.amount, 0)
    doc = {
        "allowance_id": generate_allowance_id(),
        "staff_id": data.staff_id,
        "staff_name": staff_name,
        "date": data.date or today_ist_str(),
        "expense_type": data.expense_type.value,
        "amount": round(float(data.amount), 2),
        "bill_url": data.bill_url,
        "remark": data.remark,
        "paid_amount": 0.0,
        "balance_amount": balance,
        "extra_paid_amount": extra,
        "payment_status": status,
        "payment_remark": None,
        "payment_made_date": None,
        "paid_at": None,
        "paid_by": None,
        "created_at": now_ist_str(),
    }
    await db.attendance_allowances.insert_one(doc)
    return _fmt_allowance(doc)


@router.get("/allowances", response_model=List[DailyAllowanceResponse])
async def list_allowances(
    staff_id: Optional[str] = Query(None),
    date: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    expense_type: Optional[str] = Query(None),
    payment_status: Optional[str] = Query(None),
    skip: int = 0,
    limit: int = 200,
    current_user: dict = Depends(get_current_user),
):
    db = get_db()
    query = {}
    if current_user["role"] == "technician":
        query["staff_id"] = current_user.get("staff_id")
    elif staff_id:
        query["staff_id"] = staff_id
    if date:
        query["date"] = date
    elif date_from or date_to:
        date_filter = {}
        if date_from:
            date_filter["$gte"] = date_from
        if date_to:
            date_filter["$lte"] = date_to
        query["date"] = date_filter
    if payment_status:
        query["payment_status"] = payment_status
    if expense_type:
        query["expense_type"] = expense_type

    rows = await db.attendance_allowances.find(query).sort("date", -1).skip(skip).limit(limit).to_list(limit)
    return [_fmt_allowance(row) for row in rows]


@router.patch("/allowances/pay", response_model=List[DailyAllowanceResponse])
async def pay_allowances(data: DailyAllowancePayment, current_user: dict = Depends(require_admin_or_manager)):
    if not data.allowance_ids:
        raise HTTPException(status_code=400, detail="Select at least one expense")
    if data.paid_amount <= 0:
        raise HTTPException(status_code=400, detail="Paid amount must be greater than zero")

    db = get_db()
    rows = await db.attendance_allowances.find({"allowance_id": {"$in": data.allowance_ids}}).sort("date", 1).to_list(len(data.allowance_ids))
    if len(rows) != len(set(data.allowance_ids)):
        raise HTTPException(status_code=404, detail="One or more expenses were not found")

    remaining = round(float(data.paid_amount), 2)
    payable_rows = [
        row for row in rows
        if round(max(float(row.get("amount", 0)) - float(row.get("paid_amount", 0)), 0), 2) > 0
    ]
    if not payable_rows:
        raise HTTPException(status_code=400, detail="Selected expenses are already fully paid")

    updated = []
    for index, row in enumerate(payable_rows):
        current_paid = round(float(row.get("paid_amount", 0)), 2)
        balance = round(max(float(row.get("amount", 0)) - current_paid, 0), 2)
        add_amount = 0.0
        if balance > 0:
            add_amount = min(remaining, balance)
            remaining = round(remaining - add_amount, 2)
        if index == len(payable_rows) - 1 and remaining > 0:
            add_amount = round(add_amount + remaining, 2)
            remaining = 0.0

        new_paid = round(current_paid + add_amount, 2)
        status, new_balance, extra = _calc_payment_status(row.get("amount", 0), new_paid)
        result = await db.attendance_allowances.find_one_and_update(
            {"allowance_id": row["allowance_id"]},
            {"$set": {
                "paid_amount": new_paid,
                "balance_amount": new_balance,
                "extra_paid_amount": extra,
                "payment_status": status,
                "payment_remark": data.payment_remark,
                "payment_made_date": today_ist_str(),
                "paid_at": now_ist_str(),
                "paid_by": current_user.get("full_name") or current_user.get("username"),
            }},
            return_document=True,
        )
        updated.append(_fmt_allowance(result))

    return updated


@router.delete("/allowances/{allowance_id}")
async def delete_allowance(allowance_id: str, current_user: dict = Depends(require_admin_or_manager)):
    db = get_db()
    row = await db.attendance_allowances.find_one({"allowance_id": allowance_id})
    if not row:
        raise HTTPException(status_code=404, detail="Expense not found")

    result = await db.attendance_allowances.delete_one({"allowance_id": allowance_id})
    if result.deleted_count != 1:
        raise HTTPException(status_code=500, detail="Failed to delete expense")
    return {"message": "Expense deleted"}


@router.post("/allowances/{allowance_id}/bill")
async def upload_allowance_bill(
    allowance_id: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    db = get_db()
    row = await db.attendance_allowances.find_one({"allowance_id": allowance_id})
    if not row:
        raise HTTPException(status_code=404, detail="Expense not found")
    if current_user["role"] != "technician":
        raise HTTPException(status_code=403, detail="Only technicians can upload allowance bills")
    if row.get("staff_id") != current_user.get("staff_id"):
        raise HTTPException(status_code=403, detail="Access denied")

    image_bytes = await file.read()
    url = await upload_image_bytes(image_bytes, folder="baangs/allowances")
    await db.attendance_allowances.update_one(
        {"allowance_id": allowance_id},
        {"$set": {"bill_url": url}}
    )
    return {"bill_url": url}


@router.post("/checkin/photo")
async def upload_checkin_photo(
    attendance_id: str,
    file: UploadFile = File(...),
    _=Depends(require_any)
):
    db = get_db()
    image_bytes = await file.read()
    url = await upload_image_bytes(image_bytes, folder="baangs/attendance")
    await db.attendance.update_one(
        {"attendance_id": attendance_id},
        {"$set": {"checkin_photo_url": url}}
    )
    return {"photo_url": url}


@router.post("/checkout/photo")
async def upload_checkout_photo(
    attendance_id: str,
    file: UploadFile = File(...),
    _=Depends(require_any)
):
    db = get_db()
    image_bytes = await file.read()
    url = await upload_image_bytes(image_bytes, folder="baangs/attendance")
    await db.attendance.update_one(
        {"attendance_id": attendance_id},
        {"$set": {"checkout_photo_url": url}}
    )
    return {"photo_url": url}
