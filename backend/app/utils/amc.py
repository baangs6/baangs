from datetime import date, timedelta
from fastapi import HTTPException
from .timezone import today_ist_str


def site_key(value):
    return " ".join((value or "").split()).casefold()


def end_date(start):
    try:
        anniversary = start.replace(year=start.year + 1)
    except ValueError:
        anniversary = start.replace(year=start.year + 1, day=28)
    return anniversary - timedelta(days=1)


def summary(contract, today=None):
    today = today or today_ist_str()
    visits = contract.get("visits", [])
    used = sum(v["free_service"] for v in visits)
    status = "cancelled" if contract.get("cancelled") else "upcoming" if today < contract["start_date"] else "expired" if today > contract["end_date"] else "active"
    return {k: v for k, v in contract.items() if k != "_id"} | {
        "status": status, "free_visits_used": used, "free_visits_remaining": max(0, 4 - used),
        "extra_visits": len(visits) - used,
        "days_remaining": max(0, (date.fromisoformat(contract["end_date"]) - date.fromisoformat(today)).days),
    }


async def complete_visit(db, job):
    """CAS ledger makes concurrent completions and retries consume at most four free visits."""
    if not job.get("amc_id") or job.get("amc_benefits") is not None:
        return job
    for _ in range(10):
        contract = await db.amc_contracts.find_one({"amc_id": job["amc_id"]})
        if not contract:
            raise HTTPException(409, "Linked AMC no longer exists")
        visit = next((v for v in contract.get("visits", []) if v["job_id"] == job["job_id"]), None)
        if visit is None:
            if contract["customer_id"] != job.get("customer_id") or site_key(contract["location"]) != site_key(job.get("location")):
                raise HTTPException(409, "Job location does not match the linked AMC")
            if summary(contract)["status"] != "active":
                benefits = {"amc_id": contract["amc_id"], "free_service": False, "product_discount_percent": 0}
                await db.jobs.update_one({"job_id": job["job_id"]}, {"$set": {"amc_benefits": benefits}})
                return {**job, "amc_benefits": benefits}
            visit = {"job_id": job["job_id"], "completed_on": today_ist_str(),
                     "free_service": summary(contract)["free_visits_remaining"] > 0,
                     "product_discount_percent": 10 if job.get("amc_replacement_products") else 0}
            revision = contract.get("revision", 0)
            updated = await db.amc_contracts.find_one_and_update(
                {"amc_id": contract["amc_id"], "revision": revision},
                {"$set": {"visits": contract.get("visits", []) + [visit], "revision": revision + 1}}, return_document=True)
            if not updated:
                continue
        benefits = {"amc_id": contract["amc_id"], **visit}
        await db.jobs.update_one({"job_id": job["job_id"]}, {"$set": {"amc_benefits": benefits}})
        return {**job, "amc_benefits": benefits}
    raise HTTPException(409, "AMC changed during completion. Please retry")


def price_bill(bill, benefits):
    gross_service = float(bill.get("service_gross_amount", bill.get("service_amount", 0)) or 0)
    gross_material = float(bill.get("material_gross_amount", bill.get("material_amount", 0)) or 0)
    discount = round(gross_material * benefits.get("product_discount_percent", 0) / 100, 2)
    waiver = gross_service if benefits.get("free_service") else 0
    invoice = round(gross_material - discount + gross_service - waiver, 2)
    profit = round(invoice - gross_material - float(bill.get("expense", 0) or 0), 2)
    return {**bill, "amc_benefits": benefits, "service_gross_amount": gross_service,
            "material_gross_amount": gross_material, "amc_service_waiver": waiver,
            "amc_product_discount": discount, "service_amount": round(gross_service - waiver, 2),
            "material_amount": gross_material, "invoice_amount": invoice,
            "profit": profit, "profit_percentage": round(profit / invoice * 100, 2) if invoice else 0}


async def sync_bill(db, job):
    if not job.get("amc_benefits"):
        return
    bill = await db.billing.find_one({"job_id": job["job_id"]})
    if bill:
        priced = price_bill(bill, job["amc_benefits"])
        from ..routers.billing import calc_profit
        priced["profit"], priced["profit_percentage"] = calc_profit(priced["invoice_amount"], priced.get("collected_amount"), priced.get("expense"), priced["material_amount"])
        await db.billing.update_one({"job_id": job["job_id"]}, {"$set": {k: v for k, v in priced.items() if k != "_id"}})
