import uuid
from datetime import datetime
import pytz

IST = pytz.timezone("Asia/Kolkata")


def generate_job_id(sequence: int) -> str:
    """Generate Job ID in format JOB-YYYYMMDD-### (IST date)."""
    date_str = datetime.now(IST).strftime("%Y%m%d")
    return f"JOB-{date_str}-{sequence:03d}"


def generate_staff_id() -> str:
    return f"STF-{uuid.uuid4().hex[:8].upper()}"


def generate_customer_id() -> str:
    return f"CUS-{uuid.uuid4().hex[:8].upper()}"


def generate_user_id() -> str:
    return f"USR-{uuid.uuid4().hex[:8].upper()}"


def generate_attendance_id() -> str:
    return f"ATT-{uuid.uuid4().hex[:8].upper()}"


def generate_allowance_id() -> str:
    return f"ALW-{uuid.uuid4().hex[:8].upper()}"


def generate_billing_id() -> str:
    return f"BIL-{uuid.uuid4().hex[:8].upper()}"


def generate_update_id() -> str:
    return f"UPD-{uuid.uuid4().hex[:8].upper()}"


def make_customer_key(phone: str, name: str) -> str:
    """Create a deduplication key from phone number (primary) or name."""
    if phone:
        return f"ph_{phone.strip().replace(' ', '').replace('-', '')}"
    return f"nm_{name.strip().lower().replace(' ', '_')}"


def generate_inventory_item_id() -> str:
    return f"INV-{uuid.uuid4().hex[:8].upper()}"


def generate_transaction_id() -> str:
    return f"TXN-{uuid.uuid4().hex[:8].upper()}"


def generate_usage_id() -> str:
    return f"USG-{uuid.uuid4().hex[:8].upper()}"


def generate_task_id() -> str:
    return f"TSK-{uuid.uuid4().hex[:8].upper()}"


def generate_subtask_id() -> str:
    return f"SUB-{uuid.uuid4().hex[:8].upper()}"


def generate_task_comment_id() -> str:
    return f"TCM-{uuid.uuid4().hex[:8].upper()}"
