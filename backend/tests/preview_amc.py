"""Render an isolated AMC invoice for visual QA without touching the database."""
import asyncio
from pathlib import Path
from pytest import MonkeyPatch
from test_amc import setup, job
from app.routers import billing


async def generate():
    with MonkeyPatch.context() as patch:
        db = setup(patch)
        db.data['jobs'] = [{**job(1), 'customer_name': 'AMC Preview Customer', 'phone_number': '9000000000'}]
        db.data['job_inventory_usage'] = [dict(_id='U', job_id='J1', item_name='Replacement camera', quantity_used=1, unit_selling_price=2000)]
        await billing.create_billing(billing.BillingCreate(job_id='J1', invoice_amount=2500, service_amount=500))
        response = await billing.job_invoice_pdf('J1', {'role': 'admin'})
        return b''.join([chunk async for chunk in response.body_iterator])


if __name__ == '__main__':
    import pymupdf
    output = Path(__file__).resolve().parents[2] / 'tmp' / 'pdfs'
    output.mkdir(parents=True, exist_ok=True)
    data = asyncio.run(generate())
    (output / 'amc-invoice.pdf').write_bytes(data)
    document = pymupdf.open(stream=data, filetype='pdf')
    document[0].get_pixmap(matrix=pymupdf.Matrix(1.3, 1.3)).save(str(output / 'amc-invoice.png'))
    print(output / 'amc-invoice.png')
