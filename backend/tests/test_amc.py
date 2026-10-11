import asyncio
from datetime import date
from io import BytesIO
import pytest
from fastapi import HTTPException
from app.mock_database import MockCollection
from app.routers import amc, billing
from app.utils import amc as policy


class Database:
    def __init__(self):
        self.data = {name: [] for name in ('amc_contracts', 'jobs', 'billing', 'customers', 'job_inventory_usage')}
        for name in self.data:
            setattr(self, name, MockCollection(self, name))

    def save(self):
        pass


def setup(monkeypatch):
    db = Database()
    monkeypatch.setattr(policy, 'today_ist_str', lambda: '2026-10-11')
    monkeypatch.setattr(amc, 'get_db', lambda: db)
    monkeypatch.setattr(billing, 'get_db', lambda: db)
    db.data['customers'] = [{'customer_id': 'C'}]
    db.data['amc_contracts'] = [dict(amc_id='AMC', customer_id='C', location='Shop', start_date='2026-01-01',
        end_date='2026-12-31', visits=[], revision=0, cancelled=False)]
    return db


def job(number):
    return dict(job_id=f'J{number}', customer_id='C', amc_id='AMC', location='Shop', work_type='service', amc_replacement_products=True)


def test_year_and_leap_year_boundaries():
    assert policy.end_date(date(2026, 10, 11)) == date(2027, 10, 10)
    assert policy.end_date(date(2024, 2, 29)) == date(2025, 2, 27)


def test_four_free_then_paid_with_discount_and_idempotent_completion(monkeypatch):
    db = setup(monkeypatch)
    async def run():
        results = []
        for n in range(6):
            row = job(n)
            await db.jobs.insert_one(row)
            results.append(await policy.complete_visit(db, row))
            await policy.complete_visit(db, row)  # stale request retries recover the existing ledger entry
        return results
    rows = asyncio.run(run())
    assert [r['amc_benefits']['free_service'] for r in rows] == [True] * 4 + [False] * 2
    assert all(r['amc_benefits']['product_discount_percent'] == 10 for r in rows)
    contract = policy.summary(db.data['amc_contracts'][0], '2026-10-11')
    assert (contract['free_visits_used'], contract['free_visits_remaining'], contract['extra_visits']) == (4, 0, 2)
    assert contract['status'] == 'active'


@pytest.mark.parametrize('cancelled,today', [(False, '2027-01-01'), (False, '2025-12-31'), (True, '2026-10-11')])
def test_inactive_contract_has_no_benefits_or_visit_consumption(monkeypatch, cancelled, today):
    db = setup(monkeypatch)
    db.data['amc_contracts'][0]['cancelled'] = cancelled
    monkeypatch.setattr(policy, 'today_ist_str', lambda: today)
    result = asyncio.run(policy.complete_visit(db, job(1)))
    assert not result['amc_benefits']['free_service']
    assert result['amc_benefits']['product_discount_percent'] == 0
    assert db.data['amc_contracts'][0]['visits'] == []


def test_discount_does_not_compound_and_fifth_visit_charged():
    bill = {'service_amount': 500, 'material_amount': 2000}
    free = {'free_service': True, 'product_discount_percent': 10}
    priced = policy.price_bill(bill, free)
    assert (priced['invoice_amount'], priced['amc_service_waiver'], priced['amc_product_discount']) == (1800, 500, 200)
    assert policy.price_bill(priced, free) == priced
    assert policy.price_bill(bill, {'free_service': False, 'product_discount_percent': 10})['invoice_amount'] == 2300


def test_no_replacement_discount_without_explicit_replacement_selection(monkeypatch):
    db = setup(monkeypatch)
    result = asyncio.run(policy.complete_visit(db, {**job(1), 'amc_replacement_products': False}))
    assert result['amc_benefits']['product_discount_percent'] == 0


def test_link_rejects_other_site_installation_and_completed_job(monkeypatch):
    db = setup(monkeypatch)
    async def run():
        for extra in ({'location': 'Home'}, {'work_type': 'installation'}, {'status': 'complete'}):
            db.data['jobs'] = [{**job(1), **extra}]
            with pytest.raises(HTTPException):
                await amc.link_contract('J1', amc.JobLink(amc_id='AMC'))
    asyncio.run(run())


def test_overlapping_contract_rejected_but_renewal_preserves_history(monkeypatch):
    db = setup(monkeypatch)
    async def run():
        with pytest.raises(HTTPException):
            await amc.create_contract('C', amc.ContractCreate(start_date='2026-10-11', location=' SHOP '))
        return await amc.create_contract('C', amc.ContractCreate(start_date='2027-01-01', location='Shop'))
    renewal = asyncio.run(run())
    assert renewal['end_date'] == '2027-12-31'
    assert len(db.data['amc_contracts']) == 2


def test_verified_product_reconciliation_keeps_discount(monkeypatch):
    db = setup(monkeypatch)
    db.data['job_inventory_usage'] = [dict(job_id='J1', quantity_used=2, unit_selling_price=1000)]
    original = policy.price_bill({'job_id': 'J1', 'material_amount': 0, 'service_amount': 500}, {'free_service': True, 'product_discount_percent': 10})
    result = asyncio.run(billing.reconcile_materials(db, original))
    assert result['invoice_amount'] == 1800
    assert result['amc_product_discount'] == 200
    assert result['service_gross_amount'] == 500


def test_completion_via_billing_applies_benefits_and_pdf(monkeypatch):
    db = setup(monkeypatch)
    db.data['jobs'] = [job(1)]
    db.data['job_inventory_usage'] = [dict(_id='U', job_id='J1', item_name='Replacement camera', quantity_used=1, unit_selling_price=2000)]
    async def run():
        result = await billing.create_billing(billing.BillingCreate(job_id='J1', invoice_amount=2500, service_amount=500))
        response = await billing.job_invoice_pdf('J1', {'role': 'admin'})
        pdf = b''.join([chunk async for chunk in response.body_iterator])
        return result, pdf
    result, pdf = asyncio.run(run())
    assert result['invoice_amount'] == 1800
    assert db.data['billing'][0]['profit'] == result['profit']
    assert len(db.data['amc_contracts'][0]['visits']) == 1
    assert db.data['jobs'][0]['status'] == 'complete'
    assert pdf.startswith(b'%PDF')
    from pypdf import PdfReader
    text = PdfReader(BytesIO(pdf)).pages[0].extract_text()
    assert '1,800.00' in text and 'AMC REPLACEMENT DISCOUNT' in text


def test_mobile_status_completion_creates_zero_service_bill(monkeypatch):
    from app.routers import updates
    from app.models.daily_update import DailyUpdateCreate
    from unittest.mock import AsyncMock
    db = setup(monkeypatch)
    db.data['daily_updates'] = []
    db.daily_updates = MockCollection(db, 'daily_updates')
    db.data['jobs'] = [job(1)]
    monkeypatch.setattr(updates, 'get_db', lambda: db)
    monkeypatch.setattr(updates, 'notify_roles', AsyncMock())
    async def run():
        await updates.create_update(DailyUpdateCreate(job_id='J1', status='in_progress'), {'role': 'admin'})
        assert db.data['amc_contracts'][0]['visits'] == []
        await updates.create_update(DailyUpdateCreate(job_id='J1', status='complete', service_charge=500), {'role': 'admin'})
        assert db.data['billing'][0]['invoice_amount'] == 0
        assert db.data['billing'][0]['amc_service_waiver'] == 500
        await updates.create_update(DailyUpdateCreate(job_id='J1', status='complete'), {'role': 'admin'})
        assert len(db.data['amc_contracts'][0]['visits']) == 1
        assert db.data['billing'][0]['invoice_amount'] == 0
    asyncio.run(run())


def test_technician_cannot_read_unassigned_amc(monkeypatch):
    db = setup(monkeypatch)
    db.data['jobs'] = [{**job(1), 'assigned_staff_id': 'A'}]
    with pytest.raises(HTTPException) as error:
        asyncio.run(amc.job_contracts('J1', {'role': 'technician', 'staff_id': 'B'}))
    assert error.value.status_code == 403


def test_payment_update_keeps_frozen_discount_and_service_waiver(monkeypatch):
    db = setup(monkeypatch)
    bill = policy.price_bill(dict(job_id='J1', billing_id='B', complete_date='2026-10-11',
        service_amount=500, material_amount=2000, expense=0), {'free_service': True, 'product_discount_percent': 10})
    db.data['billing'] = [bill]
    result = asyncio.run(billing.update_billing('B', billing.BillingCreate(job_id='J1',
        invoice_amount=1800, material_amount=2000, collected_amount=1800)))
    assert result['invoice_amount'] == 1800
    assert result['amc_service_waiver'] == 500
    assert result['amc_product_discount'] == 200


def test_route_permissions_and_assigned_technician_visibility(monkeypatch):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from app.auth.utils import get_current_user
    db = setup(monkeypatch)
    db.data['jobs'] = [{**job(1), 'assigned_staff_id': 'A'}]
    app = FastAPI()
    app.include_router(amc.router)
    app.dependency_overrides[get_current_user] = lambda: {'role': 'technician', 'staff_id': 'A'}
    with TestClient(app) as client:
        assert client.get('/jobs/J1/amc').status_code == 200
        assert client.get('/customers/C/amc').status_code == 403
        assert client.put('/jobs/J1/amc', json={'amc_id': 'AMC'}).status_code == 403
        assert client.post('/customers/C/amc', json={'location': 'Home', 'start_date': '2026-10-11'}).status_code == 403


def test_revision_conflict_retries_without_duplicate_visit(monkeypatch):
    db = setup(monkeypatch)
    original = db.amc_contracts.find_one_and_update
    calls = 0
    async def conflict_once(*args, **kwargs):
        nonlocal calls
        calls += 1
        if calls == 1:
            db.data['amc_contracts'][0]['revision'] += 1
            return None
        return await original(*args, **kwargs)
    db.amc_contracts.find_one_and_update = conflict_once
    result = asyncio.run(policy.complete_visit(db, job(1)))
    assert result['amc_benefits']['free_service']
    assert calls == 2 and len(db.data['amc_contracts'][0]['visits']) == 1
