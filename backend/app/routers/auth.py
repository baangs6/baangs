from fastapi import APIRouter, HTTPException, Depends
from ..models.user import LoginRequest, TokenResponse, SetupRequest, UserResponse, UserRole, UserStatus
from ..auth.utils import hash_password, verify_password, create_access_token, get_current_user
from ..database import get_db
from ..utils.id_generator import generate_attendance_id, generate_user_id
from ..utils.timezone import now_ist_str, today_ist_str

router = APIRouter(prefix="/auth", tags=["Authentication"])

AUTO_ATTENDANCE_ROLES = {"admin", "manager", "sales"}


def _attendance_staff_id(user: dict) -> str:
    return user.get("staff_id") or user["user_id"]


def _attendance_staff_name(user: dict) -> str:
    return user.get("full_name") or user.get("username") or "Unknown"


async def _user_response(db, user: dict) -> dict:
    photo_url = None
    if user.get("staff_id"):
        staff = await db.staff.find_one({"staff_id": user.get("staff_id")})
        photo_url = staff.get("photo_url") if staff else None
    return {
        "user_id": user["user_id"],
        "username": user["username"],
        "role": user["role"],
        "status": user["status"],
        "full_name": user.get("full_name"),
        "phone": user.get("phone"),
        "staff_id": user.get("staff_id"),
        "profile_photo_url": photo_url,
        "created_at": user["created_at"],
    }


async def _auto_check_in(db, user: dict):
    if user.get("role") not in AUTO_ATTENDANCE_ROLES:
        return
    today = today_ist_str()
    staff_id = _attendance_staff_id(user)
    existing = await db.attendance.find_one({"staff_id": staff_id, "date": today})
    if existing:
        return
    await db.attendance.insert_one({
        "attendance_id": generate_attendance_id(),
        "staff_id": staff_id,
        "staff_name": _attendance_staff_name(user),
        "date": today,
        "checkin_time": now_ist_str(),
        "checkout_time": None,
        "checkin_latitude": None,
        "checkin_longitude": None,
        "checkout_latitude": None,
        "checkout_longitude": None,
        "checkin_photo_url": None,
        "checkout_photo_url": None,
        "remarks": "Auto login attendance",
        "checkout_remarks": None,
        "is_checked_out": False,
        "user_id": user.get("user_id"),
        "source": "web_login",
    })


async def _auto_check_out(db, user: dict):
    if user.get("role") not in AUTO_ATTENDANCE_ROLES:
        return
    today = today_ist_str()
    staff_id = _attendance_staff_id(user)
    await db.attendance.find_one_and_update(
        {"staff_id": staff_id, "date": today, "is_checked_out": False},
        {"$set": {
            "checkout_time": now_ist_str(),
            "checkout_latitude": None,
            "checkout_longitude": None,
            "checkout_photo_url": None,
            "checkout_remarks": "Auto logout attendance",
            "is_checked_out": True,
        }},
        return_document=True,
    )


@router.get("/setup-status")
async def setup_status():
    """Check if the app has been set up (first admin exists)."""
    db = get_db()
    admin_count = await db.users.count_documents({"role": "admin"})
    return {"is_setup": admin_count > 0}


@router.post("/setup")
async def first_time_setup(data: SetupRequest):
    """Create the first admin account. Only works if no admin exists yet."""
    db = get_db()
    admin_count = await db.users.count_documents({"role": "admin"})
    if admin_count > 0:
        raise HTTPException(status_code=400, detail="App is already set up")

    existing = await db.users.find_one({"username": data.username})
    if existing:
        raise HTTPException(status_code=400, detail="Username already taken")

    user_doc = {
        "user_id": generate_user_id(),
        "username": data.username,
        "password_hash": hash_password(data.password),
        "role": "admin",
        "status": "active",
        "full_name": data.full_name,
        "phone": data.phone,
        "staff_id": None,
        "created_at": now_ist_str(),
    }
    await db.users.insert_one(user_doc)

    # Seed default lookup lists
    from ..models.lookup import DEFAULT_LOOKUPS
    for list_type, items in DEFAULT_LOOKUPS.items():
        await db.lookups.update_one(
            {"list_type": list_type},
            {"$set": {"list_type": list_type, "items": [{"value": i["value"], "label": i["label"], "is_active": True} for i in items]}},
            upsert=True
        )

    token = create_access_token({"sub": data.username})
    await _auto_check_in(db, user_doc)
    user_payload = await _user_response(db, user_doc)
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": user_payload,
    }


@router.post("/login", response_model=TokenResponse)
async def login(data: LoginRequest):
    db = get_db()
    user = await db.users.find_one({"username": data.username})
    if not user or not verify_password(data.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    if user.get("status") != "active":
        raise HTTPException(status_code=403, detail="Account is inactive")

    # Enforce platform restrictions
    if user["role"] == UserRole.technician:
        if data.platform != "mobile":
            raise HTTPException(
                status_code=403, 
                detail="Staff accounts can only log in via the mobile app"
            )
    elif user["role"] in [UserRole.admin, UserRole.manager, UserRole.sales]:
        if data.platform == "mobile":
            # For now, allow admins on mobile too, but if user meant ONLY mobile for staff 
            # and ONLY web for admin, we could block admin on mobile.
            # User said "staff login will be only on mobile app".
            pass
        elif data.platform == "web":
            pass

    await _auto_check_in(db, user)
    token = create_access_token({"sub": data.username})
    user_payload = await _user_response(db, user)
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": user_payload,
    }


@router.get("/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    db = get_db()
    return await _user_response(db, current_user)


@router.post("/logout")
async def logout(current_user: dict = Depends(get_current_user)):
    db = get_db()
    await _auto_check_out(db, current_user)
    return {"message": "Logged out"}
