import csv
import io
import json
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from ..auth.utils import require_admin
from ..database import get_db

router = APIRouter(prefix="/export", tags=["Export"])


@router.get("/jobs.csv")
async def export_jobs_csv(_=Depends(require_admin)):
    db = get_db()
    jobs = await db.jobs.find({}, {"_id": 0}).to_list(10000)

    output = io.StringIO()
    if jobs:
        writer = csv.DictWriter(output, fieldnames=jobs[0].keys())
        writer.writeheader()
        writer.writerows(jobs)

    output.seek(0)
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode()),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=jobs.csv"}
    )


@router.get("/customers.csv")
async def export_customers_csv(_=Depends(require_admin)):
    db = get_db()
    customers = await db.customers.find({}, {"_id": 0}).to_list(10000)

    output = io.StringIO()
    if customers:
        writer = csv.DictWriter(output, fieldnames=customers[0].keys())
        writer.writeheader()
        writer.writerows(customers)

    output.seek(0)
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode()),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=customers.csv"}
    )


@router.get("/billing.csv")
async def export_billing_csv(_=Depends(require_admin)):
    db = get_db()
    billing = await db.billing.find({}, {"_id": 0}).to_list(10000)

    output = io.StringIO()
    if billing:
        writer = csv.DictWriter(output, fieldnames=billing[0].keys())
        writer.writeheader()
        writer.writerows(billing)

    output.seek(0)
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode()),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=billing.csv"}
    )


@router.get("/attendance.csv")
async def export_attendance_csv(_=Depends(require_admin)):
    db = get_db()
    records = await db.attendance.find({}, {"_id": 0}).to_list(10000)

    output = io.StringIO()
    if records:
        writer = csv.DictWriter(output, fieldnames=records[0].keys())
        writer.writeheader()
        writer.writerows(records)

    output.seek(0)
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode()),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=attendance.csv"}
    )


@router.get("/all.json")
async def export_all_json(_=Depends(require_admin)):
    db = get_db()
    data = {
        "jobs": await db.jobs.find({}, {"_id": 0}).to_list(10000),
        "customers": await db.customers.find({}, {"_id": 0}).to_list(10000),
        "billing": await db.billing.find({}, {"_id": 0}).to_list(10000),
        "staff": await db.staff.find({}, {"_id": 0}).to_list(1000),
        "attendance": await db.attendance.find({}, {"_id": 0}).to_list(10000),
    }
    json_bytes = json.dumps(data, indent=2, default=str).encode()
    return StreamingResponse(
        io.BytesIO(json_bytes),
        media_type="application/json",
        headers={"Content-Disposition": "attachment; filename=baangs_export.json"}
    )
