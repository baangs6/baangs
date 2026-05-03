from datetime import datetime
import pytz

IST = pytz.timezone("Asia/Kolkata")


def now_ist() -> datetime:
    """Return current datetime in IST."""
    return datetime.now(IST)


def now_ist_str() -> str:
    """Return current IST datetime as ISO string."""
    return now_ist().isoformat()


def today_ist_str() -> str:
    """Return today's date in IST as YYYY-MM-DD."""
    return now_ist().strftime("%Y-%m-%d")


def format_ist(dt: datetime) -> str:
    """Format a datetime in IST."""
    if dt.tzinfo is None:
        dt = IST.localize(dt)
    return dt.astimezone(IST).isoformat()
