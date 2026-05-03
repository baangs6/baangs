from fastapi import APIRouter, HTTPException, Depends, Query, UploadFile, File
from typing import List, Optional
from ..models.attendance import CheckInCreate, CheckOutCreate, AttendanceResponse
from ..auth.utils import require_admin, require_admin_or_manager, require_any, get_current_user
from ..database import get_db
from ..utils.id_generator import generate_attendance_id
from ..utils.timezone import now_ist_str, today_ist_str
from ..utils.cloudinary_helper import upload_image_bytes

router = APIRouter(prefix="/attendance", tags=["Attendance"])


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
