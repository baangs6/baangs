from pydantic import BaseModel, Field, field_validator
from typing import Optional, List
from datetime import datetime
from enum import Enum

class InventoryStatus(str, Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    PENDING_VERIFICATION = "pending_verification"


def clean_serials(values):
    if values is None:
        return None
    clean = [value.strip() for value in values if value.strip()]
    if len(clean) != len(set(clean)):
        raise ValueError("Serial numbers must be unique")
    return clean

class TransactionType(str, Enum):
    OPENING_STOCK = "opening_stock"
    STOCK_ADDED = "stock_added"
    STOCK_USED = "stock_used"
    STOCK_ADJUSTED = "stock_adjusted"

class InventoryItemBase(BaseModel):
    barcode: Optional[str] = None # System generated if not provided
    item_name: str
    model_number: str # Required
    serial_number: Optional[str] = None # Comma-separated or single
    serial_numbers: Optional[List[str]] = None # Multiple serial numbers
    category: Optional[str] = None # Not required
    brand: Optional[str] = None
    unit_type: str  # e.g., Pcs, Mtr, Box
    purchase_price: float = Field(default=0, ge=0, allow_inf_nan=False)
    selling_price: float = Field(default=0, ge=0, allow_inf_nan=False)
    tax_percentage: float = Field(default=0, ge=0, le=100, allow_inf_nan=False)
    opening_quantity: float = Field(default=0, ge=0, allow_inf_nan=False)
    current_quantity: float = Field(default=0, allow_inf_nan=False)
    minimum_stock_level: float = Field(default=0, ge=0, allow_inf_nan=False)
    warranty: Optional[str] = None
    connectivity: Optional[str] = None
    ingress_protection: Optional[str] = None
    night_vision: Optional[str] = None
    storage_location: Optional[str] = None
    supplier: Optional[str] = None
    item_photo: Optional[str] = None
    remarks: Optional[str] = None
    status: InventoryStatus = InventoryStatus.ACTIVE

    _serials = field_validator("serial_numbers")(clean_serials)

class InventoryItemCreate(InventoryItemBase):
    pass

class InventoryItemUpdate(BaseModel):
    item_name: Optional[str] = None
    model_number: Optional[str] = None
    serial_number: Optional[str] = None
    serial_numbers: Optional[List[str]] = None
    category: Optional[str] = None
    brand: Optional[str] = None
    unit_type: Optional[str] = None
    purchase_price: Optional[float] = Field(default=None, ge=0, allow_inf_nan=False)
    selling_price: Optional[float] = Field(default=None, ge=0, allow_inf_nan=False)
    tax_percentage: Optional[float] = Field(default=None, ge=0, le=100, allow_inf_nan=False)
    minimum_stock_level: Optional[float] = Field(default=None, ge=0, allow_inf_nan=False)
    warranty: Optional[str] = None
    connectivity: Optional[str] = None
    ingress_protection: Optional[str] = None
    night_vision: Optional[str] = None
    storage_location: Optional[str] = None
    supplier: Optional[str] = None
    item_photo: Optional[str] = None
    remarks: Optional[str] = None
    status: Optional[InventoryStatus] = None

    _serials = field_validator("serial_numbers")(clean_serials)

class InventoryItemInDB(InventoryItemBase):
    id: str = Field(alias="_id")
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)

class InventoryTransaction(BaseModel):
    inventory_item_id: str
    barcode: str
    transaction_type: TransactionType
    quantity_changed: float
    balance_after_transaction: float
    linked_job_id: Optional[str] = None
    linked_technician_id: Optional[str] = None
    project_duration: Optional[str] = None
    project_name: Optional[str] = None
    customer_details: Optional[str] = None
    amount_paid: float = 0.0
    done_by_user_id: str
    transaction_datetime: datetime = Field(default_factory=datetime.now)
    remarks: Optional[str] = None

class JobInventoryUsage(BaseModel):
    job_id: str
    job_update_id: Optional[str] = None
    inventory_item_id: str
    barcode: str
    item_name: str
    quantity_used: float
    technician_id: str
    usage_datetime: datetime = Field(default_factory=datetime.now)

class InventoryAdjustmentRequest(BaseModel):
    quantity_changed: float = Field(allow_inf_nan=False)
    remarks: str = Field(default="", max_length=2000)
    transaction_type: Optional[str] = Field(default=None, pattern="^(STOCK_IN|STOCK_OUT|stock_added|stock_adjusted|stock_used|STOCK_USED)$")
    amount_paid: float = Field(default=0, ge=0, allow_inf_nan=False)
    linked_technician_id: Optional[str] = None
    staff_id: Optional[str] = None
    linked_job_id: Optional[str] = None
    project_duration: Optional[str] = None
    project_name: Optional[str] = None
    customer_details: Optional[str] = None
    serial_numbers: List[str] = Field(default_factory=list, max_length=1000)

class InventoryItemTechResponse(BaseModel):
    id: str = Field(alias="_id")
    barcode: str
    item_name: str
    model_number: Optional[str] = None
    serial_number: Optional[str] = None
    category: str
    brand: Optional[str] = None
    unit_type: str
    current_quantity: float
    item_photo: Optional[str] = None
    remarks: Optional[str] = None
    status: InventoryStatus


class InventoryItemSalesResponse(InventoryItemTechResponse):
    selling_price: float = 0.0
