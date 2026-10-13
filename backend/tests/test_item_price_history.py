import asyncio
from app.mock_database import MockCollection
from app.routers import inventory


def test_last_three_snapshots_only_matching_barcode(monkeypatch):
    class Database:
        def __init__(self):
            self.data = {'inventory': [{'barcode':'B1','selling_price':900,'purchase_price':500}],
                         'inventory_transactions': [], 'job_inventory_usage': []}
            for name in self.data:
                setattr(self, name, MockCollection(self, name))
        def save(self):
            pass
    db = Database()
    for i in range(1, 5):
        db.data['job_inventory_usage'].append({'barcode':'B1', 'usage_datetime':f'2026-10-0{i}', 'unit_selling_price':100*i, 'job_id':f'J{i}'})
        db.data['inventory_transactions'].append({'barcode':'B1','transaction_datetime':f'2026-10-0{i}', 'transaction_type':'stock_added','purchase_price':50*i})
    db.data['inventory_transactions'].append({'barcode':'B1','transaction_datetime':'2026-10-09','transaction_type':'stock_added'})
    db.data['job_inventory_usage'].append({'barcode':'B2','usage_datetime':'2026-10-10','unit_selling_price':9999})
    monkeypatch.setattr(inventory,'get_db',lambda:db)
    result = asyncio.run(inventory.price_history('B1'))
    assert [r['price'] for r in result['selling']] == [400,300,200]
    assert [r['price'] for r in result['purchase']] == [200,150,100]
    assert result['current_purchase_price'] == 500


def test_technicians_cannot_see_purchase_history(monkeypatch):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from app.auth.utils import get_current_user
    app = FastAPI()
    app.include_router(inventory.router)
    app.dependency_overrides[get_current_user] = lambda: {'role':'technician'}
    assert TestClient(app).get('/inventory/B1/price-history').status_code == 403
