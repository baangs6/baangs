import asyncio
from io import BytesIO
from types import SimpleNamespace
from unittest.mock import AsyncMock

from app.routers import billing


def make_db(items):
    record = dict(billing_id='BILL', job_id='TEST', invoice_amount=500,
                  service_amount=500, material_amount=0, expense=0,
                  complete_date='2026-09-29', collected_amount=0)
    return SimpleNamespace(
        billing=SimpleNamespace(find_one=AsyncMock(return_value=record)),
        jobs=SimpleNamespace(find_one=AsyncMock(return_value={'job_id': 'TEST', 'work_type': 'maintenance'})),
        job_inventory_usage=SimpleNamespace(find=lambda query: SimpleNamespace(to_list=AsyncMock(return_value=items))),
    ), record


def test_verified_materials_added_to_existing_service_bill():
    db, record = make_db([{'quantity_used': 4, 'unit_selling_price': 150}])
    result = asyncio.run(billing.reconcile_materials(db, record))
    assert result['invoice_amount'] == 1100
    assert result['material_amount'] == 600
    assert result['service_amount'] == 500
    assert billing._fmt(result)['profit'] == 500
    assert record['invoice_amount'] == 500  # Read reconciliation does not mutate storage.


def test_no_usage_preserves_manual_bill():
    db, record = make_db([])
    record['material_amount'] = 200
    assert asyncio.run(billing.reconcile_materials(db, record)) == record


def test_service_pdf_generates_with_integer_quantity(monkeypatch):
    db, _ = make_db([{'item_name': 'Video balun', 'quantity_used': 4, 'unit_selling_price': 150}])
    monkeypatch.setattr(billing, 'get_db', lambda: db)

    async def generate():
        response = await billing.job_invoice_pdf('TEST', {'role': 'admin'})
        return b''.join([chunk async for chunk in response.body_iterator])

    data = asyncio.run(generate())
    assert data.startswith(b'%PDF')
