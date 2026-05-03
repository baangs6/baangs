from fastapi import APIRouter, HTTPException, Depends
from ..models.user import LoginRequest, TokenResponse, SetupRequest, UserResponse, UserRole, UserStatus
from ..auth.utils import hash_password, verify_password, create_access_token, get_current_user
from ..database import get_db
from ..utils.id_generator import generate_user_id
from ..utils.timezone import now_ist_str

router = APIRouter(prefix="/auth", tags=["Authentication"])


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
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "user_id": user_doc["user_id"],
            "username": user_doc["username"],
            "role": user_doc["role"],
            "status": user_doc["status"],
            "full_name": user_doc["full_name"],
            "phone": user_doc["phone"],
            "staff_id": None,
            "created_at": user_doc["created_at"],
        }
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
    elif user["role"] in [UserRole.admin, UserRole.manager]:
        if data.platform == "mobile":
            # For now, allow admins on mobile too, but if user meant ONLY mobile for staff 
            # and ONLY web for admin, we could block admin on mobile.
            # User said "staff login will be only on mobile app".
            pass
        elif data.platform == "web":
            pass

    token = create_access_token({"sub": data.username})
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "user_id": user["user_id"],
            "username": user["username"],
            "role": user["role"],
            "status": user["status"],
            "full_name": user.get("full_name"),
            "phone": user.get("phone"),
            "staff_id": user.get("staff_id"),
            "created_at": user["created_at"],
        }
    }


@router.get("/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    return {
        "user_id": current_user["user_id"],
        "username": current_user["username"],
        "role": current_user["role"],
        "status": current_user["status"],
        "full_name": current_user.get("full_name"),
        "phone": current_user.get("phone"),
        "staff_id": current_user.get("staff_id"),
        "created_at": current_user["created_at"],
    }
