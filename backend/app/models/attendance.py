from pydantic import BaseModel, Field
from typing import Optional


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
