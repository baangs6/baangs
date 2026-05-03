from pydantic import BaseModel, Field
from typing import Optional, List
from enum import Enum


class JobStatus(str, Enum):
    pending = "pending"
    in_progress = "in_progress"
    complete = "complete"
    cancelled = "cancelled"


class JobPriority(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"
    urgent = "urgent"


class JobCreate(BaseModel):
    # Customer fields (auto-dedup by phone number)
    customer_name: str
    phone_number: str
    location: Optional[str] = None
    map_location: Optional[str] = None
    site_type: Optional[str] = None

    # Job fields
    work_type: str
    complaint: Optional[str] = None
    priority: JobPriority = JobPriority.medium
    scheduled_date: Optional[str] = None
    preferred_time: Optional[str] = None
    assigned_staff_id: Optional[str] = None
    next_schedule_date: Optional[str] = None
    photo_url: Optional[str] = None


class JobUpdate(BaseModel):
    work_type: Optional[str] = None
    complaint: Optional[str] = None
    priority: Optional[JobPriority] = None
    scheduled_date: Optional[str] = None
    preferred_time: Optional[str] = None
    assigned_staff_id: Optional[str] = None
    status: Optional[JobStatus] = None
    next_schedule_date: Optional[str] = None
    photo_url: Optional[str] = None


class JobResponse(BaseModel):
    job_id: str
    customer_id: str
    customer_name: str
    phone_number: str
    location: Optional[str] = None
    map_location: Optional[str] = None
    site_type: Optional[str] = None
    work_type: str
    complaint: Optional[str] = None
    priority: str
    scheduled_date: Optional[str] = None
    preferred_time: Optional[str] = None
    assigned_staff_id: Optional[str] = None
    assigned_staff_name: Optional[str] = None
    status: str
    work_started_at: Optional[str] = None
    work_started_by: Optional[str] = None
    work_start_location: Optional[dict] = None
    work_ended_at: Optional[str] = None
    work_ended_by: Optional[str] = None
    work_end_location: Optional[dict] = None
    service_request_date: str
    next_schedule_date: Optional[str] = None
    photo_url: Optional[str] = None
    customer_key: str
    inventory_used: Optional[List[dict]] = Field(default_factory=list)
