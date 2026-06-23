from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from typing import List
from datetime import datetime
from datetime import date, timedelta
import calendar
from ..models.staff import StaffCreate, StaffUpdate, StaffResponse
from ..auth.utils import require_admin, require_admin_or_manager, require_any, hash_password
from ..database import get_db
from ..utils.id_generator import generate_staff_id, generate_user_id
from ..utils.timezone import now_ist_str
from ..utils.cloudinary_helper import upload_image_bytes

router = APIRouter(prefix="/staff", tags=["Staff"])


def _format_staff(s: dict) -> dict:
    return {
        "staff_id": s["staff_id"],
        "name": s["name"],
        "phone_number": s["phone_number"],
        "skill": s.get("skill"),
        "dob": s.get("dob"),
        "doj": s.get("doj"),
        "email_id": s.get("email_id"),
        "address": s.get("address"),
        "emergency_contact_name": s.get("emergency_contact_name"),
        "emergency_contact_phone": s.get("emergency_contact_phone"),
        "salary_type": s.get("salary_type", "monthly"),
        "monthly_salary": float(s.get("monthly_salary", 0.0) or 0.0),
        "daily_wage": float(s.get("daily_wage", 0.0) or 0.0),
        "overtime_rate_per_hour": float(s.get("overtime_rate_per_hour", 0.0) or 0.0),
        "allowance": float(s.get("allowance", 0.0) or 0.0),
        "deduction": float(s.get("deduction", 0.0) or 0.0),
        "bank_account_holder": s.get("bank_account_holder"),
        "bank_account_number": s.get("bank_account_number"),
        "bank_ifsc": s.get("bank_ifsc"),
        "pan_number": s.get("pan_number"),
        "aadhaar_number": s.get("aadhaar_number"),
        "photo_url": s.get("photo_url"),
        "is_active": s.get("is_active", True),
        "created_at": s["created_at"],
    }


@router.get("/", response_model=List[StaffResponse])
async def list_staff(_=Depends(require_any)):
    db = get_db()
    staff = await db.staff.find({}).to_list(500)
    return [_format_staff(s) for s in staff]


@router.post("/", response_model=StaffResponse)
async def create_staff(data: StaffCreate, _=Depends(require_admin)):
    db = get_db()

    if data.create_login:
        if not data.username or not data.password:
            raise HTTPException(status_code=400, detail="Username and password are required to create a login")
        existing_user = await db.users.find_one({"username": data.username})
        if existing_user:
            raise HTTPException(status_code=400, detail="Username already exists")

    staff_id = generate_staff_id()
    staff_doc = {
        "staff_id": staff_id,
        "name": data.name,
        "phone_number": data.phone_number,
        "skill": data.skill,
        "dob": data.dob,
        "doj": data.doj,
        "email_id": data.email_id,
        "address": data.address,
        "emergency_contact_name": data.emergency_contact_name,
        "emergency_contact_phone": data.emergency_contact_phone,
        "salary_type": data.salary_type or "monthly",
        "monthly_salary": float(data.monthly_salary or 0.0),
        "daily_wage": float(data.daily_wage or 0.0),
        "overtime_rate_per_hour": float(data.overtime_rate_per_hour or 0.0),
        "allowance": float(data.allowance or 0.0),
        "deduction": float(data.deduction or 0.0),
        "bank_account_holder": data.bank_account_holder,
        "bank_account_number": data.bank_account_number,
        "bank_ifsc": data.bank_ifsc,
        "pan_number": data.pan_number,
        "aadhaar_number": data.aadhaar_number,
        "photo_url": data.photo_url,
        "is_active": True,
        "created_at": now_ist_str(),
    }
    await db.staff.insert_one(staff_doc)

    if data.create_login:
        user_doc = {
            "user_id": generate_user_id(),
            "username": data.username,
            "password_hash": hash_password(data.password),
            "role": data.user_role or "technician",
            "status": "active",
            "full_name": data.name,
            "phone": data.phone_number,
            "staff_id": staff_id,
            "created_at": now_ist_str(),
        }
        await db.users.insert_one(user_doc)

    return _format_staff(staff_doc)


@router.get("/{staff_id}", response_model=StaffResponse)
async def get_staff(staff_id: str, _=Depends(require_any)):
    db = get_db()
    s = await db.staff.find_one({"staff_id": staff_id})
    if not s:
        raise HTTPException(status_code=404, detail="Staff not found")

    res = _format_staff(s)

    # Check if a user is linked
    user = await db.users.find_one({"staff_id": staff_id})
    if user:
        res["has_login"] = True
        res["username"] = user["username"]
        res["user_role"] = user["role"]

    return res


@router.put("/{staff_id}", response_model=StaffResponse)
async def update_staff(staff_id: str, data: StaffUpdate, _=Depends(require_admin)):
    db = get_db()
    update_data = {k: v for k, v in data.model_dump().items() if v is not None}

    create_login = update_data.pop("create_login", None)
    username = update_data.pop("username", None)
    password = update_data.pop("password", None)
    user_role = update_data.pop("user_role", None)
    new_staff_id = update_data.pop("staff_id", None)

    if new_staff_id and new_staff_id != staff_id:
        # Check no other staff already has this ID
        conflict = await db.staff.find_one({"staff_id": new_staff_id})
        if conflict:
            raise HTTPException(status_code=400, detail=f"Staff ID '{new_staff_id}' is already taken")
        update_data["staff_id"] = new_staff_id

    if update_data:
        result = await db.staff.find_one_and_update(
            {"staff_id": staff_id},
            {"$set": update_data},
            return_document=True
        )
        if not result:
            raise HTTPException(status_code=404, detail="Staff not found")
    else:
        result = await db.staff.find_one({"staff_id": staff_id})
        if not result:
            raise HTTPException(status_code=404, detail="Staff not found")

    # Use the new staff_id for all subsequent lookups
    effective_staff_id = new_staff_id if (new_staff_id and new_staff_id != staff_id) else staff_id

    existing_user = await db.users.find_one({"staff_id": staff_id})

    if create_login and not existing_user:
        if not username or not password:
            raise HTTPException(status_code=400, detail="Username and password required")
        if await db.users.find_one({"username": username}):
            raise HTTPException(status_code=400, detail="Username already exists")

        user_doc = {
            "user_id": generate_user_id(),
            "username": username,
            "password_hash": hash_password(password),
            "role": user_role or "technician",
            "status": "active",
            "full_name": result["name"],
            "phone": result["phone_number"],
            "staff_id": effective_staff_id,
            "created_at": now_ist_str(),
        }
        await db.users.insert_one(user_doc)
    elif existing_user:
        # Update existing user role, password, and staff_id reference
        user_updates = {}
        if user_role:
            user_updates["role"] = user_role
        if password:
            user_updates["password_hash"] = hash_password(password)
        if effective_staff_id != staff_id:
            user_updates["staff_id"] = effective_staff_id

        if user_updates:
            await db.users.update_one({"staff_id": staff_id}, {"$set": user_updates})

    res = _format_staff(result)
    updated_user = await db.users.find_one({"staff_id": effective_staff_id})
    if updated_user:
        res["has_login"] = True
        res["username"] = updated_user["username"]
        res["user_role"] = updated_user["role"]

    return res


@router.delete("/{staff_id}")
async def delete_staff(staff_id: str, _=Depends(require_admin)):
    db = get_db()
    staff = await db.staff.find_one({"staff_id": staff_id})
    if not staff:
        raise HTTPException(status_code=404, detail="Staff not found")

    linked_users = await db.users.find({"staff_id": staff_id}).to_list(100)
    linked_user_ids = [user.get("user_id") for user in linked_users if user.get("user_id")]

    result = await db.staff.delete_one({"staff_id": staff_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Staff not found")

    if linked_user_ids:
        await db.users.delete_many({"user_id": {"$in": linked_user_ids}})
        await db.push_tokens.delete_many({"user_id": {"$in": linked_user_ids}})
        await db.notifications.delete_many({"user_id": {"$in": linked_user_ids}})

    return {"message": "Staff deleted", "staff_id": staff_id, "deleted_user_count": len(linked_user_ids)}


@router.post("/{staff_id}/photo")
async def upload_staff_photo(
    staff_id: str,
    file: UploadFile = File(...),
    _=Depends(require_admin)
):
    db = get_db()
    staff = await db.staff.find_one({"staff_id": staff_id})
    if not staff:
        raise HTTPException(status_code=404, detail="Staff not found")

    image_bytes = await file.read()
    url = await upload_image_bytes(image_bytes, folder="baangs/staff")
    await db.staff.update_one({"staff_id": staff_id}, {"$set": {"photo_url": url}})
    return {"photo_url": url}


@router.get("/payroll/summary")
async def payroll_summary(month: str, _=Depends(require_admin_or_manager)):
    """
    month format: YYYY-MM
    """
    db = get_db()
    try:
        year, mon = month.split("-")
        year = int(year)
        mon = int(mon)
        days_in_month = calendar.monthrange(year, mon)[1]
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid month format. Use YYYY-MM")

    month_prefix = f"{year:04d}-{mon:02d}"
    attendance_rows = await db.attendance.find({"date": {"$regex": f"^{month_prefix}"}}).to_list(10000)
    leave_rows = await db.leaves.find({"status": "approved"}).to_list(10000)
    active_staff = await db.staff.find({"is_active": True}).to_list(2000)
    month_start = date(year, mon, 1)
    month_end = date(year, mon, days_in_month)

    att_by_staff = {}
    for row in attendance_rows:
        sid = row.get("staff_id")
        if not sid:
            continue
        if sid not in att_by_staff:
            att_by_staff[sid] = []
        att_by_staff[sid].append(row)

    approved_leave_days_by_staff = {}
    for leave in leave_rows:
        sid = leave.get("staff_id")
        from_date = leave.get("from_date")
        to_date = leave.get("to_date")
        if not sid or not from_date or not to_date:
            continue
        try:
            leave_start = date.fromisoformat(from_date)
            leave_end = date.fromisoformat(to_date)
        except Exception:
            continue
        if leave_end < leave_start:
            leave_start, leave_end = leave_end, leave_start
        overlap_start = max(leave_start, month_start)
        overlap_end = min(leave_end, month_end)
        if overlap_end < overlap_start:
            continue
        if sid not in approved_leave_days_by_staff:
            approved_leave_days_by_staff[sid] = set()
        day = overlap_start
        while day <= overlap_end:
            approved_leave_days_by_staff[sid].add(day.isoformat())
            day += timedelta(days=1)

    items = []
    for s in active_staff:
        sid = s["staff_id"]
        att = att_by_staff.get(sid, [])
        present_days = len(att)
        approved_leave_days = len(approved_leave_days_by_staff.get(sid, set()))
        paid_leave_days = min(2, approved_leave_days)
        unpaid_leave_days = max(0, approved_leave_days - paid_leave_days)
        payable_days = min(days_in_month, present_days + paid_leave_days)

        # Overtime is computed as hours above 8 per checked-out day.
        overtime_hours = 0.0
        for a in att:
            ci = a.get("checkin_time")
            co = a.get("checkout_time")
            if not ci or not co:
                continue
            try:
                start = datetime.fromisoformat(ci)
                end = datetime.fromisoformat(co)
                worked_hours = (end - start).total_seconds() / 3600.0
                overtime_hours += max(0.0, worked_hours - 8.0)
            except Exception:
                continue

        salary_type = (s.get("salary_type") or "monthly").lower()
        monthly_salary = float(s.get("monthly_salary", 0) or 0)
        daily_wage = float(s.get("daily_wage", 0) or 0)
        allowance = float(s.get("allowance", 0) or 0)
        deduction = float(s.get("deduction", 0) or 0)
        overtime_rate = float(s.get("overtime_rate_per_hour", 0) or 0)

        if salary_type == "daily":
            base_pay = daily_wage * payable_days
        else:
            base_pay = (monthly_salary / days_in_month) * payable_days if days_in_month > 0 else 0

        overtime_pay = overtime_hours * overtime_rate
        gross_pay = round(base_pay + overtime_pay + allowance, 2)
        net_pay = round(gross_pay - deduction, 2)

        items.append({
            "staff_id": sid,
            "name": s.get("name"),
            "salary_type": salary_type,
            "present_days": present_days,
            "approved_leave_days": approved_leave_days,
            "paid_leave_days": paid_leave_days,
            "unpaid_leave_days": unpaid_leave_days,
            "payable_days": payable_days,
            "month_days": days_in_month,
            "base_pay": round(base_pay, 2),
            "overtime_hours": round(overtime_hours, 2),
            "overtime_pay": round(overtime_pay, 2),
            "allowance": round(allowance, 2),
            "deduction": round(deduction, 2),
            "gross_pay": gross_pay,
            "net_pay": net_pay,
        })

    totals = {
        "total_staff": len(items),
        "total_gross_pay": round(sum(i["gross_pay"] for i in items), 2),
        "total_net_pay": round(sum(i["net_pay"] for i in items), 2),
    }

    return {"month": month, "totals": totals, "items": items}
