from .timezone import now_ist_str


def billing_history(previous, current):
    """Capture dated balances without inventing dates for legacy payments."""
    now = now_ist_str()
    history = list((previous or {}).get("report_history", []))
    collected = float(current.get("collected_amount") or 0)
    invoice = float(current.get("invoice_amount") or 0)
    old_collected = float((previous or {}).get("collected_amount") or 0)
    if not history or collected != old_collected or invoice != float(previous.get("invoice_amount") or 0):
        history.append({"at": now, "invoice": invoice, "collected": collected,
                        "payment_delta": round(collected - old_collected, 2)})
    return {"report_history": history,
            "report_created_at": (previous or {}).get("report_created_at") if previous else now,
            "undated_collected": (previous or {}).get("undated_collected", old_collected)}
