"""Inventory checks use isolated collections, never application data."""
import asyncio
import io
from copy import deepcopy
from types import SimpleNamespace

import pytest
from fastapi import HTTPException, UploadFile, FastAPI
from fastapi.testclient import TestClient
from app.auth.utils import get_current_user
from pydantic import ValidationError
from app.models.inventory import InventoryItemCreate, InventoryItemUpdate, InventoryAdjustmentRequest
from app.routers import inventory


def matches(row, query):
    return all(row.get(key) in value['$in'] if isinstance(value, dict) and '$in' in value else row.get(key) == value for key, value in query.items())


class Cursor:
    def __init__(self, rows): self.rows = deepcopy(rows)
    def sort(self, key, order):
        self.rows.sort(key=lambda row: row.get(key, ''), reverse=order == -1); return self
    async def to_list(self, limit): return self.rows if limit is None else self.rows[:limit]


class Collection:
    def __init__(self, rows=()): self.rows = deepcopy(list(rows)); self.conflict = False
    async def find_one(self, query): return next((deepcopy(row) for row in self.rows if matches(row, query)), None)
    def find(self, query): return Cursor([row for row in self.rows if matches(row, query)])
    async def insert_one(self, row): self.rows.append(deepcopy(row))
    async def find_one_and_update(self, query, changes, **kwargs):
        if self.conflict: return None
        for row in self.rows:
            if matches(row, query):
                row.update(changes.get('$set', {}))
                for key, value in changes.get('$inc', {}).items(): row[key] = row.get(key, 0) + value
                return deepcopy(row)
        return None


def database(monkeypatch):
    db = SimpleNamespace(inventory=Collection(), inventory_transactions=Collection(), staff=Collection(), jobs=Collection())
    monkeypatch.setattr(inventory, 'get_db', lambda: db)
    return db


def test_zero_tax_metadata_and_quoted_csv_import(monkeypatch):
    async def run():
        db = database(monkeypatch)
        item = await inventory.create_item(InventoryItemCreate(item_name='Camera', model_number='C1', unit_type='Pcs', opening_quantity=2, tax_percentage=0, serial_numbers=['A', 'B'], warranty='2 years', supplier='Vendor'), {'user_id': 'ADMIN'})
        assert item['tax_percentage'] == 0 and item['warranty'] == '2 years'
        file = UploadFile(filename='items.csv', file=io.BytesIO(b'item_name,model_number,serial_numbers,opening_quantity,tax_percentage\r\n"Camera, Outdoor",C2,SN1|SN2,2,0\r\n'))
        result = await inventory.import_inventory_csv(file, {'user_id': 'ADMIN'})
        assert result['success'] == 1
        assert db.inventory.rows[1]['item_name'] == 'Camera, Outdoor'
        assert db.inventory.rows[1]['serial_numbers'] == ['SN1', 'SN2']
        assert db.inventory.rows[1]['barcode'] != item['barcode']
        assert len(db.inventory_transactions.rows) == 2
        bad = UploadFile(filename='bad.csv', file=io.BytesIO(b'item_name,model_number,opening_quantity\nBad,C3,-2\n'))
        with pytest.raises(HTTPException): await inventory.import_inventory_csv(bad, {'user_id': 'ADMIN'})
        assert len(db.inventory.rows) == 2
    asyncio.run(run())


def test_movements_validate_serials_sign_stock_and_concurrency(monkeypatch):
    async def run():
        db = database(monkeypatch)
        await db.inventory.insert_one({'_id': 'I1', 'barcode': 'B1', 'status': 'active', 'current_quantity': 2, 'serial_numbers': ['A', 'B'], 'purchase_price': 10, 'selling_price': 20})
        for payload in [dict(quantity_changed=0), dict(quantity_changed=-3), dict(quantity_changed=-1, serial_numbers=['X']), dict(quantity_changed=-1, serial_numbers=['A', 'B']), dict(quantity_changed=1, transaction_type='STOCK_OUT')]:
            with pytest.raises(HTTPException): await inventory.adjust_stock('B1', InventoryAdjustmentRequest(**payload), {'user_id': 'ADMIN'})
        assert db.inventory.rows[0]['current_quantity'] == 2 and not db.inventory_transactions.rows
        result = await inventory.adjust_stock('B1', InventoryAdjustmentRequest(quantity_changed=-2, transaction_type='STOCK_OUT', serial_numbers=['A', 'B']), {'user_id': 'ADMIN'})
        assert result['new_quantity'] == 0
        assert db.inventory_transactions.rows[0]['serial_numbers'] == ['A', 'B']
        assert db.inventory_transactions.rows[0]['serial_number'] == 'A, B'
        db.inventory.conflict = True
        with pytest.raises(HTTPException) as exc: await inventory.adjust_stock('B1', InventoryAdjustmentRequest(quantity_changed=1), {'user_id': 'ADMIN'})
        assert exc.value.status_code == 409 and len(db.inventory_transactions.rows) == 1
    asyncio.run(run())
    for payload in [dict(quantity_changed=float('nan')), dict(quantity_changed=1, amount_paid=-1)]:
        with pytest.raises(ValidationError): InventoryAdjustmentRequest(**payload)
    with pytest.raises(ValidationError): InventoryItemUpdate(serial_numbers=['A', ' A '])


def test_sale_reports_keep_historical_prices(monkeypatch):
    async def run():
        db = database(monkeypatch)
        await db.inventory.insert_one({'barcode': 'B1', 'item_name': 'Camera', 'purchase_price': 1000, 'selling_price': 2000})
        await db.inventory_transactions.insert_one({'_id': 'T1', 'barcode': 'B1', 'transaction_type': 'STOCK_OUT', 'quantity_changed': -2, 'purchase_price': 10, 'selling_price': 20, 'amount_paid': 40, 'transaction_datetime': '2026-10-17'})
        report = await inventory.get_sold_details({'role': 'admin'})
        assert report[0]['purchase_price'] == 10 and report[0]['sold_price'] == 20
        assert report[0]['sale_amount'] == 40
    asyncio.run(run())


def test_inventory_mutations_are_admin_only(monkeypatch):
    database(monkeypatch)
    app = FastAPI(); app.include_router(inventory.router)
    app.dependency_overrides[get_current_user] = lambda: {'user_id': 'SALES', 'role': 'sales'}
    with TestClient(app) as client:
        assert client.post('/inventory/import-csv', files={'file': ('items.csv', b'item_name,model_number\nCamera,C1\n', 'text/csv')}).status_code == 403
        assert client.post('/inventory/B1/adjust', json={'quantity_changed': 1}).status_code == 403
