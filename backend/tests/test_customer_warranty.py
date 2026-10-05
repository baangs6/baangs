import asyncio
from datetime import date
from types import SimpleNamespace

import pytest
from pydantic import ValidationError
from app.models.daily_update import ManualInventoryVerify, DailyUpdateCreate, JobInventoryUsageCreate, ManualInventoryItemCreate
from app.mock_database import MockCollection
from app.routers import customers
from app.utils.warranty import warranty_details


def test_warranty_counts_from_completion_and_expires_on_anniversary():
    result = warranty_details('2025-10-05T12:00:00+05:30', 1, date(2026, 10, 4))
    assert result['days_completed'] == 364
    assert result['days_remaining'] == 1
    assert result['warranty_status'] == 'under_warranty'
    assert warranty_details('2025-10-05', 1, date(2026, 10, 5))['warranty_status'] == 'expired'


def test_leap_year_and_missing_warranty_dates():
    assert warranty_details('2024-02-29', 1, date(2025, 2, 27))['warranty_expiry'] == '2025-02-28'
    assert warranty_details(None, 2)['warranty_status'] == 'awaiting_installation'
    assert warranty_details('2026-01-01', None)['warranty_status'] == 'not_recorded'
    assert warranty_details('2026-01-01', 0)['warranty_status'] == 'no_warranty'
    assert warranty_details('2026-09-30T20:00:00Z', 1)['installation_date'] == '2026-10-01'


def test_warranty_period_validation():
    for years in (-1, 6):
        with pytest.raises(ValidationError):
            ManualInventoryVerify(warranty_years=years)


def test_job_update_keeps_individual_product_warranties():
    update = DailyUpdateCreate(job_id='J', status='complete',
                              inventory_used=[{'barcode': 'B', 'quantity_used': 1, 'warranty_years': 3}],
                              manual_inventory_items=[{'item_name': 'Camera', 'quantity_used': 2, 'warranty_years': 5}])
    assert update.inventory_used[0].warranty_years == 3
    assert update.manual_inventory_items[0].model_dump()['warranty_years'] == 5
    assert JobInventoryUsageCreate(barcode='B', quantity_used=1, warranty_years=0).warranty_years == 0
    for model, fields in [(JobInventoryUsageCreate, {'barcode': 'B'}), (ManualInventoryItemCreate, {'item_name': 'Camera'})]:
        with pytest.raises(ValidationError):
            model(**fields, quantity_used=1, warranty_years=6)


def test_customer_warranty_uses_completion_not_usage_date(monkeypatch):
    data = {
        'customers': [{'customer_id': 'C'}],
        'jobs': [{'job_id': 'J', 'customer_id': 'C', 'status': 'complete', 'work_ended_at': '2026-09-20'}],
        'billing': [],
        'daily_updates': [{'update_id': 'U', 'job_id': 'J', 'manual_inventory_items': [{'manual_item_id': 'M', 'item_name': 'Camera', 'verification_status': 'pending'}]}],
        'job_inventory_usage': [{'_id': 'I', 'job_id': 'J', 'item_name': 'DVR', 'warranty_years': 2, 'usage_datetime': '2026-08-01'}, {'_id': 'OTHER', 'job_id': 'OTHER', 'item_name': 'Other'}],
    }
    db = SimpleNamespace(data=data)
    for name in data:
        setattr(db, name, MockCollection(db, name))
    monkeypatch.setattr(customers, 'get_db', lambda: db)
    products = asyncio.run(customers.get_customer_warranty('C', None))
    assert len(products) == 2
    assert products[0]['installation_date'] == '2026-09-20'
    assert products[0]['warranty_expiry'] == '2028-09-20'
    assert products[1]['warranty_status'] == 'not_recorded'
