from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from enum import Enum

class InventoryStatus(str, Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    PENDING_VERIFICATION = "pending_verification"

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
    purchase_price: float = 0.0
    selling_price: float = 0.0
    tax_percentage: float = 0.0
    opening_quantity: float = 0.0
    current_quantity: float = 0.0
    minimum_stock_level: float = 0.0
    item_photo: Optional[str] = None
    remarks: Optional[str] = None
    status: InventoryStatus = InventoryStatus.ACTIVE

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
    purchase_price: Optional[float] = None
    selling_price: Optional[float] = None
    tax_percentage: Optional[float] = None
    minimum_stock_level: Optional[float] = None
    item_photo: Optional[str] = None
    remarks: Optional[str] = None
    status: Optional[InventoryStatus] = None

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
    quantity_changed: float
    remarks: str

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
