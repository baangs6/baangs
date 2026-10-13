from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP
from io import BytesIO
from typing import Literal
from uuid import uuid4
from hashlib import sha256
import re
from xml.sax.saxutils import escape

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, ConfigDict

from ..auth.utils import require_admin, require_admin_or_manager, create_access_token, decode_token
from ..database import get_db
from ..utils.timezone import today_ist_str, now_ist_str

router = APIRouter(prefix='/quotations', tags=['Quotations'])


class Item(BaseModel):
    inventory_barcode: str | None = Field(None, max_length=100)
    model_config = ConfigDict(allow_inf_nan=False)
    name: str = Field(..., min_length=1, max_length=200)
    description: str = Field('', max_length=1000)
    hsn: str = Field('', max_length=40)
    model: str = Field('', max_length=100)
    serial_number: str = Field('', max_length=100)
    warranty: str = Field('', max_length=100)
    unit: str = Field('Nos', max_length=20)
    quantity: Decimal = Field(..., gt=0, le=1000000, decimal_places=3)
    unit_price: Decimal = Field(..., ge=0, le=100000000, decimal_places=2)
    discount_percent: Decimal = Field(Decimal('0'), ge=0, le=100, decimal_places=2)
    tax_percent: Decimal = Field(Decimal('0'), ge=0, le=100, decimal_places=2)


class Quote(BaseModel):
    customer_id: str | None = None
    customer_name: str = Field(..., min_length=1, max_length=200)
    billing_name: str = Field('', max_length=200)
    phone_number: str = Field(..., min_length=5, max_length=30)
    address: str = Field('', max_length=2000)
    gstin: str = Field('', max_length=30)
    state_of_supply: str = Field('', max_length=100)
    quote_date: date
    validity_days: int = Field(10, ge=1, le=365)
    items: list[Item] = Field(..., min_length=1, max_length=100)
    terms: str = Field('', max_length=10000)
    notes: str = Field('', max_length=3000)
    status: Literal['draft', 'sent', 'accepted', 'rejected'] = 'draft'
    round_off: bool = False


def money(value):
    return value.quantize(Decimal('.01'), rounding=ROUND_HALF_UP)


def calculate(data):
    if not data.customer_name.strip() or any(not item.name.strip() for item in data.items):
        raise HTTPException(422, 'Customer and item names cannot be blank')
    rows = []
    for item in data.items:
        gross = money(item.quantity * item.unit_price)
        discount = money(gross * item.discount_percent / 100)
        taxable = gross - discount
        tax = money(taxable * item.tax_percent / 100)
        rows.append({**item.model_dump(mode='json'), 'gross_amount': float(gross),
                     'discount_amount': float(discount), 'tax_amount': float(tax), 'amount': float(taxable + tax)})
    subtotal = sum((Decimal(str(r['gross_amount'])) for r in rows), Decimal(0))
    discount = sum((Decimal(str(r['discount_amount'])) for r in rows), Decimal(0))
    tax = sum((Decimal(str(r['tax_amount'])) for r in rows), Decimal(0))
    total = subtotal - discount + tax
    rounded = total.quantize(Decimal('1'), rounding=ROUND_HALF_UP) if data.round_off else total
    return {**data.model_dump(mode='json'), 'items': rows, 'subtotal': float(subtotal),
            'discount_amount': float(discount), 'tax_amount': float(tax),
            'round_off_amount': float(rounded - total), 'total': float(rounded),
            'valid_until': (data.quote_date + timedelta(days=data.validity_days)).isoformat()}


def clean(row):
    return {k: v for k, v in row.items() if k != '_id'}


async def find_quote(quote_id):
    row = await get_db().quotations.find_one({'quote_id': quote_id})
    if not row:
        raise HTTPException(404, 'Quotation not found')
    return row


async def check_customer(data):
    if data.customer_id and not await get_db().customers.find_one({'customer_id': data.customer_id}):
        raise HTTPException(422, 'Selected customer no longer exists')


async def next_estimation_number(quote_date):
    year = quote_date.year if quote_date.month >= 4 else quote_date.year - 1
    financial_year = f'{year % 100:02d}{(year + 1) % 100:02d}'
    counter = await get_db().counters.find_one_and_update(
        {'_id': f'quotation_{financial_year}'}, {'$inc': {'seq': 1}}, upsert=True, return_document=True)
    return f'CE/{financial_year}/{counter["seq"]:03d}'


def letter_suffix(number):
    result = ''
    while number:
        number, digit = divmod(number - 1, 26)
        result = chr(65 + digit) + result
    return result


async def next_customer_estimation(data):
    db = get_db()
    year = data.quote_date.year if data.quote_date.month >= 4 else data.quote_date.year - 1
    financial_year = f'{year % 100:02d}{(year + 1) % 100:02d}'
    identity = quotation_customer_key(data.model_dump())
    digest = sha256(repr(identity).encode('utf-8')).hexdigest()
    key = f'quotation_series_{financial_year}_{digest}'
    series = await db.counters.find_one({'_id': key})
    if not series:
        rows = await db.quotations.find({}).sort('created_at', 1).to_list(None)
        previous = [r for r in rows if quotation_customer_key(r) == identity
                    and re.fullmatch(rf'CE/{financial_year}/\d+[A-Z]*', r.get('estimation_no', ''))]
        base = re.match(r'CE/\d+/\d+', previous[0]['estimation_no']).group() if previous else await next_estimation_number(data.quote_date)
        used = 0
        for row in previous:
            match = re.fullmatch(re.escape(base) + r'([A-Z]*)', row['estimation_no'])
            if not match:
                continue
            value = 0
            for letter in match.group(1):
                value = value * 26 + ord(letter) - 64
            used = max(used, value or 1)
        await db.counters.find_one_and_update({'_id':key},
            {'$setOnInsert': {'base':base, 'seq':used}}, upsert=True, return_document=True)
    series = await db.counters.find_one_and_update({'_id':key}, {'$inc':{'seq':1}}, return_document=True)
    return f'{series["base"]}{letter_suffix(series["seq"])}'


@router.get('/')
async def list_quotes(_=Depends(require_admin_or_manager)):
    return [clean(row) for row in await get_db().quotations.find({}).sort('created_at', -1).to_list(None)]


@router.post('/')
async def create_quote(data: Quote, user=Depends(require_admin_or_manager)):
    await check_customer(data)
    calculated = calculate(data)
    row = {**calculated, 'estimation_no': await next_customer_estimation(data), 'quote_id': f'QT-{today_ist_str().replace("-", "")}-{uuid4().hex[:10].upper()}',
           'prepared_by': user.get('full_name') or user.get('username') or 'Admin',
           'created_at': now_ist_str(), 'updated_at': now_ist_str(), 'revision': 1}
    await get_db().quotations.insert_one(row)
    return clean(row)


def quotation_customer_key(row):
    return (str(row.get('customer_name') or '').strip().casefold(),
            str(row.get('phone_number') or '').strip().replace(' ', '').replace('-', ''))


@router.get('/customer/{customer_id}/history')
async def customer_history(customer_id: str, _=Depends(require_admin_or_manager)):
    db = get_db()
    customer = await db.customers.find_one({'customer_id': customer_id})
    if not customer:
        raise HTTPException(404, 'Customer not found')
    rows = await db.quotations.find({}).sort('created_at', -1).to_list(None)
    return [clean(row) for row in rows if row.get('customer_id') == customer_id
            or (not row.get('customer_id') and quotation_customer_key(row) == quotation_customer_key(customer))]


@router.post('/{quote_id}/move-to-customer')
async def move_to_customer(quote_id: str, user=Depends(require_admin)):
    from .customers import create_or_get_customer, _format_customer
    from ..models.customer import CustomerCreate
    db = get_db()
    row = await find_quote(quote_id)
    customer = await db.customers.find_one({'customer_id': row.get('customer_id')}) if row.get('customer_id') else None
    if customer:
        customer = _format_customer(customer)
    else:
        if len(row['customer_name'].strip()) < 2:
            raise HTTPException(422, 'Enter a customer name of at least two characters before moving this quotation')
        customer = await create_or_get_customer(CustomerCreate(customer_name=row['customer_name'],
            phone_number=row['phone_number'], location=row.get('address')), user)
    rows = await db.quotations.find({}).to_list(None)
    ids = [r['quote_id'] for r in rows if not r.get('customer_id') and quotation_customer_key(r) == quotation_customer_key(row)]
    if ids:
        await db.quotations.update_many({'quote_id': {'$in': ids}}, {'$set': {'customer_id': customer['customer_id']}})
    return {'customer': customer, 'quote_id': quote_id, 'location': row.get('address') or customer.get('location')}


class CustomerFollowup(BaseModel):
    customer_remark: str = Field('', max_length=3000)
    followup_date: date | None = None
    followup_done: bool = False


@router.put('/{quote_id}/customer-followup')
async def save_customer_followup(quote_id: str, data: CustomerFollowup, user=Depends(require_admin_or_manager)):
    row = await find_quote(quote_id)
    rows = await get_db().quotations.find({}).to_list(None)
    ids = [r['quote_id'] for r in rows if
           (row.get('customer_id') and r.get('customer_id') == row['customer_id']) or
           (not r.get('customer_id') and quotation_customer_key(r) == quotation_customer_key(row))]
    values = {**data.model_dump(mode='json'), 'followup_owner': user.get('user_id'),
              'followup_reminded': False, 'customer_remark_updated_at': now_ist_str()}
    await get_db().quotations.update_many({'quote_id': {'$in': ids}}, {'$set': values})
    return [clean(r) for r in await get_db().quotations.find({'quote_id': {'$in': ids}}).to_list(None)]


@router.get('/{quote_id}')
async def get_quote(quote_id: str, _=Depends(require_admin_or_manager)):
    return clean(await find_quote(quote_id))


@router.put('/{quote_id}')
async def update_quote(quote_id: str, data: Quote, revision: int = Query(..., ge=1), _=Depends(require_admin_or_manager)):
    existing = await find_quote(quote_id)
    await check_customer(data)
    calculated = calculate(data)
    if not existing.get('estimation_no'):
        calculated['estimation_no'] = await next_customer_estimation(data)
    result = await get_db().quotations.find_one_and_update(
        {'quote_id': quote_id, 'revision': revision},
        {'$set': {**calculated, 'updated_at': now_ist_str()}, '$inc': {'revision': 1}}, return_document=True)
    if not result:
        raise HTTPException(409, 'Quotation changed. Reopen it before saving.')
    return clean(result)


@router.post('/{quote_id}/share-link')
async def share_link(quote_id: str, request: Request, _=Depends(require_admin_or_manager)):
    row = await find_quote(quote_id)
    token = create_access_token({'quotation_id': quote_id, 'revision': row['revision']}, expires_delta=timedelta(days=7))
    url = str(request.url_for('public_quotation_pdf', quote_id=quote_id))
    return {'url': f'{url}?token={token}', 'expires_in_days': 7}


@router.get('/{quote_id}/public.pdf', name='public_quotation_pdf')
async def public_pdf(quote_id: str, token: str):
    payload = decode_token(token)
    row = await find_quote(quote_id)
    if payload.get('quotation_id') != quote_id or payload.get('revision') != row['revision']:
        raise HTTPException(403, 'Quotation link is invalid or has been replaced')
    return pdf_response(row)


@router.get('/{quote_id}/quotation.pdf')
async def download_pdf(quote_id: str, _=Depends(require_admin_or_manager)):
    return pdf_response(await find_quote(quote_id))


def render_pdf(row):
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether, Image
    from pathlib import Path
    from ..routers.billing import _number_words

    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, leftMargin=12*mm, rightMargin=12*mm, topMargin=20*mm, bottomMargin=18*mm)
    styles = getSampleStyleSheet()
    small = ParagraphStyle('QuoteSmall', parent=styles['Normal'], fontSize=9, leading=13)
    tiny = ParagraphStyle('QuoteTiny', parent=small, fontSize=8, leading=11)
    green = colors.HexColor('#244d1b')
    title = ParagraphStyle('QuoteTitle', parent=styles['Heading1'], textColor=green, alignment=1, fontSize=18)
    def p(text, style=small):
        return Paragraph(escape(str(text or '')).replace('\n', '<br/>'), style)
    def display_date(value):
        return date.fromisoformat(value).strftime('%d-%b-%Y')
    def whole(value):
        return Decimal(str(value)).quantize(Decimal('1'), rounding=ROUND_HALF_UP)
    assets = Path(__file__).resolve().parents[1] / 'assets' / 'quotation'
    brand = [Image(str(assets / 'logo.png'), width=65*mm, height=13*mm),
             Paragraph('<b>CCTV Solutions &amp; Home Automation</b>', small), p('www.baangs.site')]
    company = p('BAANGS TECHNOMAC LLP\n1/278 & 1/279, Vadakkumbad,\nThalassery, Kannur, India 670105.\nsupport@baangs.in\nPhone: 8330033280, 8848133004')
    header = Table([[brand, company]], colWidths=[108*mm,78*mm])
    header.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'TOP'),('LINEBELOW',(0,0),(-1,-1),1,colors.HexColor('#555555')),('BOTTOMPADDING',(0,0),(-1,-1),12)]))
    story = [header, Spacer(1,4*mm), Paragraph('Estimation', title), Spacer(1,4*mm)]
    info = Table([[p(f"ESTIMATION NO : {row.get('estimation_no') or row['quote_id']}\n\nPrepared For:\n{row.get('billing_name') or row['customer_name']}\n{row['address']}\n{row['phone_number']}"),
                   p(f"Date: {display_date(row['quote_date'])}\nValidity: {row['validity_days']} DAYS\nValid until: {display_date(row['valid_until'])}\nPrepared By: {row['prepared_by']}")]], colWidths=[116*mm,70*mm])
    info.setStyle(TableStyle([('VALIGN', (0,0), (-1,-1), 'TOP')]))
    story += [info, Spacer(1, 12*mm)]
    cells = [[p(t, tiny) for t in ['Sl.', 'Item / specification', 'Qty', 'Unit price', 'Amount']]]
    displayed_subtotal = Decimal('0')
    inclusive_discount = Decimal('0')
    for index, item in enumerate(row['items'], 1):
        specs = [item['name'], item.get('description')]
        specs += [f'{label}: {item[key]}' for key, label in [('hsn','HSN'), ('model','Model'), ('serial_number','Serial'), ('warranty','Warranty')] if item.get(key)]
        # Customer prices include tax before discount; the total discount is deducted once below.
        inclusive_gross = money(Decimal(str(item['gross_amount'])) * (1 + Decimal(str(item['tax_percent'])) / 100))
        inclusive_discount += inclusive_gross - Decimal(str(item['amount']))
        displayed_subtotal += whole(inclusive_gross)
        inclusive_unit_price = inclusive_gross / Decimal(str(item['quantity']))
        cells.append([p(index, tiny), p('\n'.join(filter(None, specs)), tiny), p(f"{item['quantity']} {item['unit']}", tiny),
                      p(f"{whole(inclusive_unit_price):,}", tiny), p(f"{whole(inclusive_gross):,}", tiny)])
    actual_rows = len(cells) - 1
    if actual_rows <= 8:
        cells.extend([['', '', '', '', ''] for _ in range(12 - actual_rows)])
    table = Table(cells, colWidths=[15*mm, 92*mm, 16*mm, 31*mm, 32*mm], repeatRows=1,
                  rowHeights=[None] * (actual_rows + 1) + [5.5*mm] * (len(cells) - actual_rows - 1))
    table.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#f5a400')),
        ('GRID',(0,0),(-1,-1),.4,colors.HexColor('#d8dce0')), ('VALIGN',(0,0),(-1,-1),'TOP'),
        ('TOPPADDING',(0,0),(-1,-1),7), ('BOTTOMPADDING',(0,0),(-1,-1),7)]))
    story += [table, Spacer(1, 4*mm)]
    displayed_discount = whole(inclusive_discount)
    displayed_total = whole(row['total'])
    adjustment = displayed_total - (displayed_subtotal - displayed_discount)
    summary_rows = [('Subtotal', displayed_subtotal), ('Total discount', displayed_discount)]
    if adjustment:
        summary_rows.append(('Rounding adjustment', adjustment))
    summary_rows.append(('Total', displayed_total))
    totals = Table([[p(label), p(f'Rs {value:,}')] for label,value in summary_rows], colWidths=[148*mm,38*mm])
    totals.setStyle(TableStyle([('ALIGN',(0,0),(-1,-1),'RIGHT'),('LINEBELOW',(0,-1),(-1,-1),1,green)]))
    story += [KeepTogether([totals, Spacer(1, 3*mm), p(f"Rupees {_number_words(int(displayed_total))} only"), Spacer(1, 3*mm), p('continued...')]), PageBreak()]
    for heading,key in [('Terms and conditions','terms'), ('Notes','notes')]:
        if row.get(key):
            story += [Paragraph(heading, styles['Heading3']), p(row[key]), Spacer(1, 3*mm)]
    story += [Spacer(1,6*mm), p('Thanking you and looking forward to receiving your valued reply/order at the earliest.'), Spacer(1,6*mm)]
    signatory = p('Sahil\nManaging Director\nBaangs Technomac LLP\nThalassery, Kannur.\nMobile: 8330033280\nAuthorized signatory')
    signing = Table([[signatory, Image(str(assets / 'signature.png'), width=27*mm, height=28*mm), Image(str(assets / 'stamp.png'), width=28*mm, height=41*mm)]], colWidths=[60*mm,30*mm,34*mm], hAlign='LEFT')
    signing.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'TOP')]))
    bank = Table([[p('Bank Name: INDIAN BANK, THALASSERY, KANNUR\nBank Account No.: 6622965970\nBank IFSC code: IDIB000T007\nAccount Holder Name: Baangs Technomac LLP')]], colWidths=[125*mm], hAlign='LEFT')
    bank.setStyle(TableStyle([('BOX',(0,0),(-1,-1),1,colors.HexColor('#253f91')),('TOPPADDING',(0,0),(-1,-1),8),('BOTTOMPADDING',(0,0),(-1,-1),8)]))
    story += [KeepTogether([signing, Spacer(1,10*mm), bank])]
    def footer(canvas, document):
        canvas.setFont('Helvetica', 8)
        canvas.drawCentredString(A4[0]/2, 10*mm, 'www.baangs.site')
        canvas.drawRightString(A4[0]-12*mm, 10*mm, f'Page {document.page}')
    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    return buffer.getvalue()


def pdf_response(row):
    return StreamingResponse(BytesIO(render_pdf(row)), media_type='application/pdf',
        headers={'Content-Disposition': f'attachment; filename="{row["quote_id"]}.pdf"', 'Cache-Control': 'no-store'})
