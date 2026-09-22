from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.responses import StreamingResponse
from io import BytesIO
from typing import List, Optional
from ..models.billing import BillingCreate, BillingResponse
from ..auth.utils import require_admin, require_admin_or_manager, require_any
from ..database import get_db
from ..utils.id_generator import generate_billing_id
from ..utils.timezone import today_ist_str

router = APIRouter(prefix="/billing", tags=["Billing"])


def _number_words(value: int) -> str:
    ones = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"]
    tens = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"]

    def under_thousand(number: int) -> str:
        parts = []
        if number >= 100:
            parts.append(f"{ones[number // 100]} hundred")
            number %= 100
        if number >= 20:
            parts.append(tens[number // 10])
            number %= 10
        if number:
            parts.append(ones[number])
        return " ".join(parts)

    number = max(0, int(round(value)))
    if number == 0:
        return "zero"
    parts = []
    for divisor, label in [(10000000, "crore"), (100000, "lakh"), (1000, "thousand")]:
        if number >= divisor:
            parts.append(f"{under_thousand(number // divisor)} {label}")
            number %= divisor
    if number:
        parts.append(under_thousand(number))
    return " ".join(parts)


def calc_profit(invoice: float, collected: float, expense: float, material: float):
    # Collected amount is the paid portion of the invoice, not extra income.
    total_income = float(invoice or 0)
    profit = total_income - float(expense or 0) - float(material or 0)
    pct = (profit / total_income * 100) if total_income > 0 else 0.0
    return round(profit, 2), round(pct, 2)


async def _compute_material_amount(db, job_id: str) -> float:
    usage_docs = await db.job_inventory_usage.find({"job_id": job_id}).to_list(2000)
    if not usage_docs:
        return 0.0

    total = 0.0
    for usage in usage_docs:
        qty = float(usage.get("quantity_used", 0) or 0)
        if qty <= 0:
            continue
        unit_amount = usage.get("unit_selling_price")
        if unit_amount is None:
            inv_item = await db.inventory.find_one({"barcode": usage.get("barcode")})
            unit_amount = float((inv_item or {}).get("selling_price", 0) or 0)
        else:
            unit_amount = float(unit_amount or 0)
        total += qty * unit_amount
    return round(total, 2)


def _fmt(b: dict) -> dict:
    profit, profit_percentage = calc_profit(
        b.get("invoice_amount", 0),
        b.get("collected_amount", 0),
        b.get("expense", 0),
        b.get("material_amount", 0),
    )
    return {
        "billing_id": b["billing_id"],
        "job_id": b["job_id"],
        "customer_name": b.get("customer_name"),
        "complete_date": b["complete_date"],
        "work_type": b.get("work_type"),
        "invoice_amount": b["invoice_amount"],
        "expense": b["expense"],
        "material_amount": b["material_amount"],
        "profit": profit,
        "profit_percentage": profit_percentage,
        "collected_amount": b.get("collected_amount"),
        "payment_mode": b.get("payment_mode"),
        "payment_id": b.get("payment_id"),
        "service_amount": b.get("service_amount", max(0, float(b.get("invoice_amount", 0) or 0) - float(b.get("material_amount", 0) or 0))),
    }


@router.get("/", response_model=List[BillingResponse])
async def list_billing(
    month: Optional[str] = Query(None, description="YYYY-MM"),
    date_from: Optional[str] = Query(None, description="YYYY-MM-DD"),
    date_to: Optional[str] = Query(None, description="YYYY-MM-DD"),
    _=Depends(require_admin_or_manager)
):
    db = get_db()
    query = {}
    if date_from or date_to:
        query["complete_date"] = {}
        if date_from:
            query["complete_date"]["$gte"] = date_from
        if date_to:
            query["complete_date"]["$lte"] = date_to
    elif month:
        query["complete_date"] = {"$regex": f"^{month}"}
    billing = await db.billing.find(query).sort("complete_date", -1).to_list(500)
    return [_fmt(b) for b in billing]


@router.post("/", response_model=BillingResponse)
async def create_billing(data: BillingCreate, _=Depends(require_admin)):
    db = get_db()
    job = await db.jobs.find_one({"job_id": data.job_id})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    existing = await db.billing.find_one({"job_id": data.job_id})
    if existing:
        raise HTTPException(status_code=400, detail="Billing already exists for this job")

    material_amount = float(data.material_amount or 0.0)
    if material_amount <= 0:
        material_amount = await _compute_material_amount(db, data.job_id)

    invoice_amount = float(data.invoice_amount or 0.0)
    if data.service_amount > 0 or invoice_amount <= 0:
        invoice_amount = round(material_amount + float(data.service_amount or 0.0), 2)

    profit, profit_pct = calc_profit(invoice_amount, data.collected_amount or 0.0, data.expense, material_amount)

    billing_doc = {
        "billing_id": generate_billing_id(),
        "job_id": data.job_id,
        "customer_name": job.get("customer_name"),
        "complete_date": today_ist_str(),
        "work_type": job.get("work_type"),
        "invoice_amount": invoice_amount,
        "service_amount": float(data.service_amount or 0.0),
        "expense": data.expense,
        "material_amount": material_amount,
        "profit": profit,
        "profit_percentage": profit_pct,
        "collected_amount": data.collected_amount,
        "payment_mode": data.payment_mode,
        "payment_id": data.payment_id,
    }
    await db.billing.insert_one(billing_doc)
    # Mark job as complete
    await db.jobs.update_one({"job_id": data.job_id}, {"$set": {"status": "complete"}})
    return _fmt(billing_doc)


@router.get("/job/{job_id}/invoice.pdf")
async def job_invoice_pdf(job_id: str, current_user: dict = Depends(require_any)):
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak

    db = get_db()
    job = await db.jobs.find_one({"job_id": job_id})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if current_user.get("role") == "technician" and job.get("assigned_staff_id") != current_user.get("staff_id"):
        raise HTTPException(status_code=403, detail="This job is not assigned to you")
    billing = await db.billing.find_one({"job_id": job_id})
    if not billing:
        raise HTTPException(status_code=404, detail="Create the billing record before generating the invoice")

    usage = await db.job_inventory_usage.find({"job_id": job_id}).to_list(500)
    line_items = []
    for item in usage:
        qty = float(item.get("quantity_used", 0) or 0)
        price = item.get("unit_selling_price")
        if price is None:
            inventory_item = await db.inventory.find_one({"barcode": item.get("barcode")})
            price = float((inventory_item or {}).get("selling_price", 0) or 0)
        line_items.append({
            "description": item.get("item_name") or item.get("barcode") or "Material",
            "qty": qty,
            "price": float(price or 0),
        })
    service_amount = float(billing.get("service_amount", 0) or 0)
    if service_amount <= 0:
        service_amount = max(0, float(billing.get("invoice_amount", 0) or 0) - sum(i["qty"] * i["price"] for i in line_items))
    if service_amount > 0 or not line_items:
        line_items.append({"description": f"{job.get('work_type') or 'Service'} service charge", "qty": 1, "price": service_amount})

    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, rightMargin=25 * mm, leftMargin=25 * mm, topMargin=18 * mm, bottomMargin=18 * mm)
    styles = getSampleStyleSheet()
    green = colors.HexColor("#244d1b")
    blue = colors.HexColor("#08a5df")
    orange = colors.HexColor("#f5a400")
    small = ParagraphStyle("Small", parent=styles["Normal"], fontSize=9, leading=13)
    right = ParagraphStyle("Right", parent=small, alignment=TA_RIGHT)
    center = ParagraphStyle("Center", parent=styles["Heading2"], alignment=TA_CENTER, textColor=green)
    story = []

    brand = Paragraph('<font color="#08a5df" size="34"><b>BAANGS</b></font><br/><font color="#244d1b"><b>CCTV Solutions &amp; Home Automation</b></font><br/>GSTIN: 32AATFB0134F1ZW<br/><u>www.baangs.in</u>', small)
    company = Paragraph('<b>BAANGS TECHNOMAC LLP</b><br/>1/278 &amp; 1/279, Vadakkumbad,<br/>Thalassery, Kannur, India 670105.<br/>support@baangs.in<br/>Phone: 8330033280, 8848133004', small)
    header = Table([[brand, company]], colWidths=[92 * mm, 68 * mm])
    header.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'TOP'), ('ALIGN', (1, 0), (1, 0), 'LEFT'), ('LINEBELOW', (0, 0), (-1, -1), 1, colors.black), ('BOTTOMPADDING', (0, 0), (-1, -1), 14)]))
    story.extend([header, Spacer(1, 6 * mm), Paragraph('<b>BILL</b>', center), Spacer(1, 5 * mm)])

    bill_no = billing.get("billing_id") or job_id
    raw_bill_date = billing.get("complete_date") or today_ist_str()
    date_parts = str(raw_bill_date).split("-")
    month_names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    bill_date = f"{date_parts[2][:2]}-{month_names[int(date_parts[1]) - 1]}-{date_parts[0]}" if len(date_parts) == 3 else raw_bill_date
    meta = Table([
        [Paragraph(f'<b>BILL NO : {bill_no}</b>', small), Paragraph(f'<b>Date : {bill_date}</b>', right)],
        [Paragraph(f'<b>Prepared For:</b><br/><font color="blue"><b>{job.get("customer_name", "")}</b></font><br/>{job.get("phone_number", "")}<br/>{job.get("location", "") or ""}', small), ''],
    ], colWidths=[100 * mm, 60 * mm])
    story.extend([meta, Spacer(1, 14 * mm)])

    rows = [['SL.#', 'ITEM / SERVICE', 'QTY', 'UNIT PRICE', 'AMOUNT']]
    for index, item in enumerate(line_items, 1):
        amount = item['qty'] * item['price']
        qty_text = str(int(item['qty'])) if item['qty'].is_integer() else f"{item['qty']:.2f}"
        rows.append([str(index), item['description'].upper(), qty_text, f"Rs {item['price']:,.2f}", f"Rs {amount:,.2f}"])
    total = float(billing.get("invoice_amount", 0) or 0)
    rows.append(['', '', '', 'TOTAL', f"Rs {total:,.2f}"])
    item_table = Table(rows, colWidths=[13 * mm, 83 * mm, 15 * mm, 25 * mm, 28 * mm], repeatRows=1)
    item_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), orange), ('TEXTCOLOR', (0, 0), (-1, 0), colors.black),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'), ('FONTNAME', (-2, 1), (-1, -1), 'Helvetica-Bold'),
        ('ALIGN', (0, 0), (0, -1), 'CENTER'), ('ALIGN', (2, 0), (-1, -1), 'RIGHT'),
        ('GRID', (0, 0), (-1, -2), 0.35, colors.HexColor('#cccccc')), ('LINEABOVE', (-2, -1), (-1, -1), 1, colors.black),
        ('TEXTCOLOR', (-2, 1), (-1, -1), green), ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('TOPPADDING', (0, 0), (-1, -1), 6), ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]))
    story.extend([
        item_table,
        Spacer(1, 3 * mm),
        Paragraph(f'<font color="#244d1b"><b>Rupees {_number_words(total)} only</b></font>', right),
        Spacer(1, 3 * mm),
        Paragraph(f'<b>Payment:</b> {(billing.get("payment_mode") or "-").replace("_", " ").title()} &nbsp;&nbsp; <b>Reference:</b> {billing.get("payment_id") or "-"}', right),
        PageBreak(),
    ])

    terms = '''<b>TERMS AND CONDITIONS:</b><br/><br/><font color="#244d1b"><b>Warranty:</b></font><br/>All cameras, Digital Video Recorders (DVRs), and Network Video Recorders (NVRs) are covered for the manufacturer warranty period from the date of original purchase.<br/>Warranty Voids<br/>External Forces: Damage from lightning strikes, power surges, floods.<br/>Vandalism: Physical damage, glass breakage, or tampering by unauthorized persons.<br/><br/>Thanking you and looking forward to receiving your valued reply/order at the earliest.<br/><br/><b>Sahil<br/>Managing Director</b><br/>Baangs Technomac LLP<br/>Thalassery, Kannur.<br/>Mobile: 8330033280'''
    bank = '''<b>Bank Name: INDIAN BANK, THALASSERY, KANNUR<br/>Bank Account No.: 6622965970<br/>Bank IFSC code: IDIB000T007<br/>Account Holder Name: Baangs Technomac LLP</b>'''
    story.extend([Paragraph('continued..', right), Spacer(1, 5 * mm), Paragraph(terms, small), Spacer(1, 18 * mm), Table([[Paragraph(bank, small)]], style=TableStyle([('BOX', (0, 0), (-1, -1), 1, colors.HexColor('#2040a0')), ('TEXTCOLOR', (0, 0), (-1, -1), colors.HexColor('#2040a0')), ('PADDING', (0, 0), (-1, -1), 6)]))])

    def add_page_number(canvas, document):
        canvas.saveState()
        canvas.setFont('Helvetica', 8)
        canvas.drawCentredString(A4[0] / 2, 10 * mm, 'www.baangs.in')
        canvas.drawRightString(A4[0] - 20 * mm, 10 * mm, f'Page {document.page}')
        canvas.restoreState()

    doc.build(story, onFirstPage=add_page_number, onLaterPages=add_page_number)
    buffer.seek(0)
    filename = f"{job_id}-invoice.pdf"
    return StreamingResponse(buffer, media_type="application/pdf", headers={"Content-Disposition": f'inline; filename="{filename}"'})


@router.get("/{billing_id}", response_model=BillingResponse)
async def get_billing(billing_id: str, _=Depends(require_admin_or_manager)):
    db = get_db()
    b = await db.billing.find_one({"billing_id": billing_id})
    if not b:
        raise HTTPException(status_code=404, detail="Billing record not found")
    return _fmt(b)


@router.put("/{billing_id}", response_model=BillingResponse)
async def update_billing(billing_id: str, data: BillingCreate, _=Depends(require_admin)):
    db = get_db()
    profit, profit_pct = calc_profit(data.invoice_amount, data.collected_amount or 0.0, data.expense, data.material_amount)
    update_data = {
        "invoice_amount": data.invoice_amount,
        "expense": data.expense,
        "material_amount": data.material_amount,
        "profit": profit,
        "profit_percentage": profit_pct,
        "collected_amount": data.collected_amount,
        "payment_mode": data.payment_mode,
        "payment_id": data.payment_id,
    }
    result = await db.billing.find_one_and_update(
        {"billing_id": billing_id},
        {"$set": update_data},
        return_document=True
    )
    if not result:
        raise HTTPException(status_code=404, detail="Billing record not found")
    return _fmt(result)


@router.get("/summary/monthly")
async def monthly_summary(_=Depends(require_admin_or_manager)):
    db = get_db()
    pipeline = [
        {"$group": {
            "_id": {"$substr": ["$complete_date", 0, 7]},
            "total_jobs": {"$sum": 1},
            "total_revenue": {"$sum": "$invoice_amount"},
            "total_expense": {"$sum": "$expense"},
            "total_material": {"$sum": "$material_amount"},
            "total_profit": {"$sum": "$profit"},
            "total_collected": {"$sum": "$collected_amount"},
        }},
        {"$sort": {"_id": -1}},
        {"$limit": 12}
    ]
    result = await db.billing.aggregate(pipeline).to_list(12)
    return [{"month": r["_id"], **{k: v for k, v in r.items() if k != "_id"}} for r in result]
