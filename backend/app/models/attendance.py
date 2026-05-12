from pydantic import BaseModel, Field
from typing import Optional, List
from enum import Enum


class CheckInCreate(BaseModel):
    staff_id: str
    latitude: float
    longitude: float
    photo_url: Optional[str] = None
    remarks: Optional[str] = None


class CheckOutCreate(BaseModel):
    attendance_id: str
    latitude: float
    longitude: float
    photo_url: Optional[str] = None
    remarks: Optional[str] = None


class AttendanceResponse(BaseModel):
    attendance_id: str
    staff_id: str
    staff_name: Optional[str] = None
    date: str
    checkin_time: Optional[str] = None
    checkout_time: Optional[str] = None
    checkin_latitude: Optional[float] = None
    checkin_longitude: Optional[float] = None
    checkout_latitude: Optional[float] = None
    checkout_longitude: Optional[float] = None
    checkin_photo_url: Optional[str] = None
    checkout_photo_url: Optional[str] = None
    remarks: Optional[str] = None
    checkout_remarks: Optional[str] = None
    is_checked_out: bool = False


class AllowanceExpenseType(str, Enum):
    food = "food"
    petrol = "petrol"
    other = "other"


class DailyAllowanceCreate(BaseModel):
    staff_id: str
    date: Optional[str] = None
    expense_type: AllowanceExpenseType
    amount: float
    remark: Optional[str] = None
    bill_url: Optional[str] = None


class DailyAllowancePayment(BaseModel):
    allowance_ids: List[str]
    paid_amount: float
    payment_remark: Optional[str] = None


class DailyAllowanceResponse(BaseModel):
    allowance_id: str
    staff_id: str
    staff_name: Optional[str] = None
    date: str
    expense_type: str
    amount: float
    bill_url: Optional[str] = None
    remark: Optional[str] = None
    paid_amount: float = 0.0
    balance_amount: float = 0.0
    extra_paid_amount: float = 0.0
    payment_status: str = "unpaid"
    payment_remark: Optional[str] = None
    payment_made_date: Optional[str] = None
    paid_at: Optional[str] = None
    paid_by: Optional[str] = None
    created_at: Optional[str] = None
