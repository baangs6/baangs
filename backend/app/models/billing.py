from pydantic import BaseModel, Field
from typing import Optional
from enum import Enum


class PaymentMode(str, Enum):
    cash = "cash"
    upi = "upi"
    bank_transfer = "bank_transfer"
    cheque = "cheque"
    card = "card"
    other = "other"


class BillingCreate(BaseModel):
    job_id: str
    invoice_amount: float = Field(..., ge=0)
    expense: float = Field(0.0, ge=0)
    material_amount: float = Field(0.0, ge=0)
    collected_amount: Optional[float] = None
    payment_mode: Optional[PaymentMode] = None
    payment_id: Optional[str] = None


class BillingResponse(BaseModel):
    billing_id: str
    job_id: str
    customer_name: Optional[str] = None
    complete_date: str
    work_type: Optional[str] = None
    invoice_amount: float
    expense: float
    material_amount: float
    profit: float
    profit_percentage: float
    collected_amount: Optional[float] = None
    payment_mode: Optional[str] = None
    payment_id: Optional[str] = None
