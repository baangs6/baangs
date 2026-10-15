import asyncio
from copy import deepcopy
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.routers import job_items
from app.mock_database import _matches, _apply_update


STOCK = {"_id": "stock-1", "barcode": "CAM", "item_name": "Camera", "model_number": "M1",
         "current_quantity": 8, "selling_price": 100, "purchase_price": 70, "status": "active"}
USED = {"_id": "usage-1", "job_id": "JOB", "job_update_id": "UP", "inventory_item_id": "stock-1",
        "barcode": "CAM", "item_name": "Camera", "model_number": "M1", "quantity_used": 2,
        "unit_selling_price": 100, "serial_number": None, "warranty_years": 1}
BILL = {"_id": "bill-1", "job_id": "JOB", "billing_id": "BILL", "material_amount": 200,
        "service_amount": 50, "invoice_amount": 250, "collected_amount": 120, "expense": 10,
        "payment_mode": "upi", "payment_id": "reference"}


class Collection:
    def __init__(self, db, name):
        self.db, self.name = db, name

    def find(self, query, session=None):
        assert session is self.db.session
        rows = deepcopy([row for row in self.db.data[self.name] if _matches(row, query)])
        async def to_list(_):
            return rows
        return SimpleNamespace(to_list=to_list)

    async def find_one(self, query, session=None):
        rows = await self.find(query, session).to_list(None)
        return rows[0] if rows else None

    async def update_one(self, query, update, session=None):
        assert session is self.db.session
        for i, row in enumerate(self.db.data[self.name]):
            if _matches(row, query):
                self.db.data[self.name][i] = _apply_update(row, update, query)
                return

    async def find_one_and_update(self, query, update, return_document=True, session=None):
        old = await self.find_one(query, session)
        if old is None:
            return None
        await self.update_one(query, update, session)
        return await self.find_one({"_id": old["_id"]}, session)

    async def insert_one(self, row, session=None):
        assert session is self.db.session
        self.db.data[self.name].append(deepcopy(row))

    async def delete_one(self, query, session=None):
        assert session is self.db.session
        self.db.data[self.name] = [row for row in self.db.data[self.name] if not _matches(row, query)]

    async def replace_one(self, query, row, upsert=False, session=None):
        if self.name == "billing" and self.db.fail_billing:
            raise RuntimeError("simulated billing write failure")
        await self.delete_one(query, session)
        await self.insert_one(row, session)


class Session:
    def __init__(self, db):
        self.db = db

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        pass

    async def with_transaction(self, callback):
        snapshot = deepcopy(self.db.data)
        try:
            return await callback(self)
        except Exception:
            self.db.data = snapshot
            raise


class Database:
    def __init__(self):
        self.data = {"jobs": [{"_id": "job-1", "job_id": "JOB", "status": "complete"}],
            "inventory": [deepcopy(STOCK)], "job_inventory_usage": [deepcopy(USED)],
            "billing": [deepcopy(BILL)], "inventory_transactions": [],
            "daily_updates": [{"_id": "update-1", "update_id": "UP", "job_id": "JOB", "inventory_used": [deepcopy(USED)]}]}
        self.session = Session(self)
        self.client = self
        self.fail_billing = False

    async def start_session(self):
        return self.session

    def __getattr__(self, name):
        return Collection(self, name)


def payload(db, quantity=3, price=150, items=None):
    return job_items.JobItemsEdit(version=job_items.items_version(db.data["job_inventory_usage"]),
        items=items if items is not None else [{"usage_id": "usage-1", "barcode": "CAM",
            "quantity_used": quantity, "unit_selling_price": price, "warranty_years": 3}])


def save(monkeypatch, db, body):
    monkeypatch.setattr(job_items, "get_db", lambda: db)
    monkeypatch.setattr(job_items, "get_db_mode", lambda: "mongo")
    return asyncio.run(job_items.edit_items("JOB", body, {"user_id": "ADMIN"}))


def test_edit_updates_stock_prices_warranty_snapshots_and_preserves_payments(monkeypatch):
    db = Database()
    save(monkeypatch, db, payload(db))
    assert db.data["inventory"][0]["current_quantity"] == 7
    assert db.data["inventory"][0]["selling_price"] == 100
    assert db.data["inventory"][0]["purchase_price"] == 70
    assert db.data["billing"][0]["invoice_amount"] == 500
    assert db.data["billing"][0]["collected_amount"] == 120
    assert db.data["daily_updates"][0]["inventory_used"][0]["warranty_years"] == 3
    assert db.data["inventory_transactions"][0]["quantity_changed"] == -1


def test_remove_last_item_returns_stock_and_clears_material(monkeypatch):
    db = Database()
    save(monkeypatch, db, payload(db, items=[]))
    assert db.data["inventory"][0]["current_quantity"] == 10
    assert not db.data["job_inventory_usage"]
    assert not db.data["daily_updates"][0]["inventory_used"]
    assert db.data["billing"][0]["material_amount"] == 0
    assert db.data["billing"][0]["invoice_amount"] == 50


@pytest.mark.parametrize("failure", ["stock", "billing", "stale"])
def test_failed_save_keeps_all_records_unchanged(monkeypatch, failure):
    db = Database()
    body = payload(db, quantity=99 if failure == "stock" else 3)
    if failure == "billing":
        db.fail_billing = True
    if failure == "stale":
        body.version = "0" * 64
    original = deepcopy(db.data)
    with pytest.raises((HTTPException, RuntimeError)):
        save(monkeypatch, db, body)
    assert db.data == original


def test_amc_discount_and_waiver_are_preserved(monkeypatch):
    db = Database()
    db.data["jobs"][0]["amc_benefits"] = {"free_service": True, "product_discount_percent": 10}
    db.data["billing"][0].update(service_gross_amount=50, service_amount=0)
    save(monkeypatch, db, payload(db))
    assert db.data["billing"][0]["invoice_amount"] == 405
    assert db.data["billing"][0]["amc_service_waiver"] == 50


def test_add_catalogue_item_and_decrease_quantity(monkeypatch):
    db = Database()
    save(monkeypatch, db, payload(db, quantity=1))
    assert db.data["inventory"][0]["current_quantity"] == 9
    body = payload(db, items=[{"barcode": "CAM", "quantity_used": 2, "unit_selling_price": 200}])
    save(monkeypatch, db, body)
    assert db.data["inventory"][0]["current_quantity"] == 8
    assert db.data["job_inventory_usage"][0]["_id"] != "usage-1"


@pytest.mark.parametrize("field,value", [("quantity_used", 0), ("quantity_used", -1),
    ("unit_selling_price", -1), ("unit_selling_price", float("nan")), ("warranty_years", 6)])
def test_invalid_input(field, value):
    with pytest.raises(ValidationError):
        job_items.JobItem(**({"barcode": "CAM", "quantity_used": 1, "unit_selling_price": 1} | {field: value}))


def test_duplicate_serial_is_rejected():
    item = job_items.JobItem(barcode="CAM", quantity_used=1, unit_selling_price=10, serial_number="SN1")
    with pytest.raises(HTTPException):
        job_items.plan_items([], [item, item], {"CAM": STOCK}, "JOB", "ADMIN")


def test_verified_manual_snapshot_tracks_corrections_and_removal(monkeypatch):
    db = Database()
    db.data["daily_updates"][0]["manual_inventory_items"] = [{"inventory_item_id": "stock-1", "verification_status": "verified"}]
    save(monkeypatch, db, payload(db))
    manual = db.data["daily_updates"][0]["manual_inventory_items"][0]
    assert manual["warranty_years"] == 3
    assert manual["selling_price"] == 150
    save(monkeypatch, db, payload(db, items=[]))
    assert db.data["daily_updates"][0]["manual_inventory_items"] == []


def test_item_list_is_not_truncated(monkeypatch):
    from unittest.mock import AsyncMock
    rows = [{**USED, "_id": str(i)} for i in range(150)]
    result = AsyncMock(return_value=rows)
    db = SimpleNamespace(jobs=SimpleNamespace(find_one=AsyncMock(return_value={"job_id": "JOB"})),
        job_inventory_usage=SimpleNamespace(find=lambda *args, **kwargs: SimpleNamespace(to_list=result)))
    monkeypatch.setattr(job_items, "get_db", lambda: db)
    response = asyncio.run(job_items.get_items("JOB", {}))
    assert len(response["items"]) == 150
    result.assert_awaited_once_with(None)


@pytest.mark.parametrize("role", ["technician", "sales"])
def test_api_denies_item_editing_for_other_roles(role):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from app.auth.utils import get_current_user
    app = FastAPI()
    app.include_router(job_items.router)
    app.dependency_overrides[get_current_user] = lambda: {"role": role, "user_id": "OTHER"}
    client = TestClient(app)
    assert client.get('/jobs/JOB/items').status_code == 403
    assert client.put('/jobs/JOB/items', json={"version": "a" * 64, "items": []}).status_code == 403
