from pydantic import BaseModel, Field, EmailStr
from typing import Optional
from enum import Enum


class UserRole(str, Enum):
    admin = "admin"
    technician = "technician"
    manager = "manager"


class PlatformType(str, Enum):
    web = "web"
    mobile = "mobile"
    any = "any"


class UserStatus(str, Enum):
    active = "active"
    inactive = "inactive"


class UserCreate(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=6)
    role: UserRole
    full_name: Optional[str] = None
    phone: Optional[str] = None
    staff_id: Optional[str] = None  # Link to staff record


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None
    role: Optional[UserRole] = None
    status: Optional[UserStatus] = None
    staff_id: Optional[str] = None


class UserResponse(BaseModel):
    user_id: str
    username: str
    role: UserRole
    status: UserStatus
    full_name: Optional[str] = None
    phone: Optional[str] = None
    staff_id: Optional[str] = None
    created_at: str


class LoginRequest(BaseModel):
    username: str
    password: str
    platform: PlatformType = PlatformType.any


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class SetupRequest(BaseModel):
    username: str = Field(..., min_length=3)
    password: str = Field(..., min_length=6)
    full_name: str
    phone: Optional[str] = None
