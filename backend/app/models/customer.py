from pydantic import BaseModel, Field
from typing import Optional


class CustomerCreate(BaseModel):
    customer_name: str = Field(..., min_length=2)
    nickname: Optional[str] = Field(None, max_length=80)
    phone_number: str
    alternative_phone_number: Optional[str] = None
    location: Optional[str] = None
    map_location: Optional[str] = None
    site_type: Optional[str] = None
    receive_notifications: Optional[bool] = True


class CustomerUpdate(BaseModel):
    customer_name: Optional[str] = None
    nickname: Optional[str] = Field(None, max_length=80)
    phone_number: Optional[str] = None
    alternative_phone_number: Optional[str] = None
    location: Optional[str] = None
    map_location: Optional[str] = None
    site_type: Optional[str] = None
    receive_notifications: Optional[bool] = None


class CustomerResponse(BaseModel):
    customer_id: str
    customer_name: str
    nickname: Optional[str] = None
    phone_number: str
    alternative_phone_number: Optional[str] = None
    location: Optional[str] = None
    map_location: Optional[str] = None
    site_type: Optional[str] = None
    first_request_date: Optional[str] = None
    latest_request_date: Optional[str] = None
    total_jobs: int = 0
    receive_notifications: bool = True
    customer_key: str
