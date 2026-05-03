from pydantic import BaseModel
from typing import List, Optional


class LookupItem(BaseModel):
    value: str
    label: str
    is_active: bool = True


class LookupList(BaseModel):
    list_type: str  # service_types, priority_levels, status_options, payment_modes
    items: List[LookupItem]


class LookupItemCreate(BaseModel):
    value: str
    label: str


DEFAULT_LOOKUPS = {
    "service_types": [
        {"value": "installation", "label": "Installation"},
        {"value": "maintenance", "label": "Maintenance"},
        {"value": "repair", "label": "Repair"},
        {"value": "inspection", "label": "Inspection"},
        {"value": "upgrade", "label": "Upgrade"},
        {"value": "removal", "label": "Removal"},
    ],
    "priority_levels": [
        {"value": "low", "label": "Low"},
        {"value": "medium", "label": "Medium"},
        {"value": "high", "label": "High"},
        {"value": "urgent", "label": "Urgent"},
    ],
    "status_options": [
        {"value": "pending", "label": "Pending"},
        {"value": "in_progress", "label": "In Progress"},
        {"value": "complete", "label": "Complete"},
        {"value": "cancelled", "label": "Cancelled"},
    ],
    "payment_modes": [
        {"value": "cash", "label": "Cash"},
        {"value": "upi", "label": "UPI"},
        {"value": "bank_transfer", "label": "Bank Transfer"},
        {"value": "cheque", "label": "Cheque"},
        {"value": "card", "label": "Card"},
        {"value": "other", "label": "Other"},
    ],
}
