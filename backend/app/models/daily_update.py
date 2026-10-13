from pydantic import BaseModel, Field
from typing import Optional, List


class GeoPoint(BaseModel):
    latitude: float
    longitude: float
    accuracy: Optional[float] = None

class JobInventoryUsageCreate(BaseModel):
    warranty_years: Optional[int] = Field(default=None, ge=0, le=5)
    barcode: str
    serial_number: Optional[str] = None
    quantity_used: float = Field(..., gt=0, allow_inf_nan=False)

class ManualInventoryItemCreate(BaseModel):
    warranty_years: Optional[int] = Field(default=None, ge=0, le=5)
    barcode: Optional[str] = None
    item_name: str
    model_number: Optional[str] = None
    serial_number: Optional[str] = None
    quantity_used: float = Field(..., gt=0, allow_inf_nan=False)
    category: Optional[str] = "Miscellaneous"
    brand: Optional[str] = None
    unit_type: Optional[str] = "Pcs"
    remarks: Optional[str] = None

class DailyUpdateCreate(BaseModel):
    job_id: str
    status: str
    work_event: Optional[str] = None
    location: Optional[GeoPoint] = None
    visit_notes: Optional[str] = None
    issues_faced: Optional[str] = None
    learning_notes: Optional[str] = None
    learning_category: Optional[str] = None
    expense: Optional[float] = Field(default=0.0, ge=0, allow_inf_nan=False)
    service_charge: Optional[float] = Field(default=0.0, ge=0, allow_inf_nan=False)
    service_bill: Optional[float] = Field(default=0.0, ge=0, allow_inf_nan=False)
    collected_amount: Optional[float] = Field(default=0.0, ge=0, allow_inf_nan=False)
    invoice: Optional[str] = None
    invoice_amount: Optional[float] = Field(default=0.0, ge=0, allow_inf_nan=False)
    work_type: Optional[str] = None
    inventory_used: Optional[List[JobInventoryUsageCreate]] = Field(default_factory=list)
    manual_inventory_items: Optional[List[ManualInventoryItemCreate]] = Field(default_factory=list)


class DailyUpdateResponse(BaseModel):
    update_id: str
    update_time: str
    job_id: str
    assigned_staff_id: str
    staff_name: str
    work_type: Optional[str] = None
    status: str
    work_event: Optional[str] = None
    location: Optional[dict] = None
    visit_notes: Optional[str] = None
    issues_faced: Optional[str] = None
    learning_notes: Optional[str] = None
    learning_category: Optional[str] = None
    doubt_status: str = "open"
    admin_reply: Optional[str] = None
    replied_at: Optional[str] = None
    expense: float = 0.0
    service_charge: float = 0.0
    service_bill: float = 0.0
    collected_amount: float = 0.0
    invoice: Optional[str] = None
    invoice_amount: float = 0.0
    inventory_used: Optional[List[dict]] = Field(default_factory=list)
    manual_inventory_items: Optional[List[dict]] = Field(default_factory=list)


class DoubtReview(BaseModel):
    admin_reply: Optional[str] = None
    doubt_status: str = "open"


class ManualInventoryVerify(BaseModel):
    warranty_years: Optional[int] = Field(default=None, ge=0, le=5)
    barcode: Optional[str] = None
    item_name: Optional[str] = None
    model_number: Optional[str] = None
    serial_number: Optional[str] = None
    purchase_price: Optional[float] = Field(default=None, ge=0, allow_inf_nan=False)
    selling_price: Optional[float] = Field(default=None, ge=0, allow_inf_nan=False)
    opening_quantity: Optional[float] = Field(default=None, ge=0, allow_inf_nan=False)
    quantity_used: Optional[float] = Field(default=None, gt=0, allow_inf_nan=False)
    category: Optional[str] = None
    brand: Optional[str] = None
    unit_type: Optional[str] = None
    remarks: Optional[str] = None
