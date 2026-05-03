from pydantic import BaseModel, Field
from typing import Optional


class StaffCreate(BaseModel):
    name: str = Field(..., min_length=2)
    phone_number: str
    skill: Optional[str] = None
    dob: Optional[str] = None
    doj: Optional[str] = None
    email_id: Optional[str] = None
    address: Optional[str] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    salary_type: Optional[str] = "monthly"  # monthly | daily
    monthly_salary: Optional[float] = 0.0
    daily_wage: Optional[float] = 0.0
    overtime_rate_per_hour: Optional[float] = 0.0
    allowance: Optional[float] = 0.0
    deduction: Optional[float] = 0.0
    bank_account_holder: Optional[str] = None
    bank_account_number: Optional[str] = None
    bank_ifsc: Optional[str] = None
    pan_number: Optional[str] = None
    aadhaar_number: Optional[str] = None
    photo_url: Optional[str] = None
    create_login: bool = False
    username: Optional[str] = None
    password: Optional[str] = None


class StaffUpdate(BaseModel):
    name: Optional[str] = None
    phone_number: Optional[str] = None
    skill: Optional[str] = None
    dob: Optional[str] = None
    doj: Optional[str] = None
    email_id: Optional[str] = None
    address: Optional[str] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    salary_type: Optional[str] = None
    monthly_salary: Optional[float] = None
    daily_wage: Optional[float] = None
    overtime_rate_per_hour: Optional[float] = None
    allowance: Optional[float] = None
    deduction: Optional[float] = None
    bank_account_holder: Optional[str] = None
    bank_account_number: Optional[str] = None
    bank_ifsc: Optional[str] = None
    pan_number: Optional[str] = None
    aadhaar_number: Optional[str] = None
    photo_url: Optional[str] = None
    is_active: Optional[bool] = None


class StaffResponse(BaseModel):
    staff_id: str
    name: str
    phone_number: str
    skill: Optional[str] = None
    dob: Optional[str] = None
    doj: Optional[str] = None
    email_id: Optional[str] = None
    address: Optional[str] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    salary_type: Optional[str] = "monthly"
    monthly_salary: float = 0.0
    daily_wage: float = 0.0
    overtime_rate_per_hour: float = 0.0
    allowance: float = 0.0
    deduction: float = 0.0
    bank_account_holder: Optional[str] = None
    bank_account_number: Optional[str] = None
    bank_ifsc: Optional[str] = None
    pan_number: Optional[str] = None
    aadhaar_number: Optional[str] = None
    photo_url: Optional[str] = None
    is_active: bool = True
    created_at: str
