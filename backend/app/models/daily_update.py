from pydantic import BaseModel, Field
from typing import Optional, List


class GeoPoint(BaseModel):
    latitude: float
    longitude: float
    accuracy: Optional[float] = None

class JobInventoryUsageCreate(BaseModel):
    barcode: str
    serial_number: Optional[str] = None
    quantity_used: float

class ManualInventoryItemCreate(BaseModel):
    barcode: Optional[str] = None
    item_name: str
    model_number: Optional[str] = None
    serial_number: Optional[str] = None
    quantity_used: float
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
    expense: Optional[float] = 0.0
    service_bill: Optional[float] = 0.0
    collected_amount: Optional[float] = 0.0
    invoice: Optional[str] = None
    invoice_amount: Optional[float] = 0.0
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
    expense: float = 0.0
    service_bill: float = 0.0
    collected_amount: float = 0.0
    invoice: Optional[str] = None
    invoice_amount: float = 0.0
    inventory_used: Optional[List[dict]] = Field(default_factory=list)
    manual_inventory_items: Optional[List[dict]] = Field(default_factory=list)


class ManualInventoryVerify(BaseModel):
    barcode: Optional[str] = None
    item_name: Optional[str] = None
    model_number: Optional[str] = None
    serial_number: Optional[str] = None
    purchase_price: Optional[float] = None
    selling_price: Optional[float] = None
    opening_quantity: Optional[float] = None
    quantity_used: Optional[float] = None
    category: Optional[str] = None
    brand: Optional[str] = None
    unit_type: Optional[str] = None
    remarks: Optional[str] = None
