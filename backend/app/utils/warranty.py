from datetime import datetime, date
from .timezone import IST


def warranty_details(completed_at, years, today=None):
    today = today or datetime.now(IST).date()
    started = None
    if completed_at:
        try:
            value = datetime.fromisoformat(str(completed_at).replace("Z", "+00:00"))
            started = value.astimezone(IST).date() if value.tzinfo else value.date()
        except (TypeError, ValueError):
            pass
    result = {"installation_date": started.isoformat() if started else None,
              "days_completed": max(0, (today - started).days) if started else None,
              "warranty_years": years, "warranty_expiry": None, "days_remaining": None}
    if years is None:
        return {**result, "warranty_status": "not_recorded"}
    if years == 0:
        return {**result, "warranty_status": "no_warranty"}
    if not started:
        return {**result, "warranty_status": "awaiting_installation"}
    try:
        expiry = started.replace(year=started.year + years)
    except ValueError:
        expiry = date(started.year + years, 2, 28)
    return {**result, "warranty_expiry": expiry.isoformat(),
            "days_remaining": max(0, (expiry - today).days),
            "warranty_status": "under_warranty" if today < expiry else "expired"}
