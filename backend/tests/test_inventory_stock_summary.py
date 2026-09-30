import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

from app.routers import inventory


class Aggregate:
    def __init__(self, result):
        self.to_list = AsyncMock(return_value=result)


def test_stock_summary_uses_one_transaction_aggregate(monkeypatch):
    transactions = SimpleNamespace(aggregate=Mock(return_value=Aggregate([
        {"_id": "A", "total_change": -3}, {"_id": "B", "total_change": 2},
    ])))
    db = SimpleNamespace(
        inventory=SimpleNamespace(find=lambda _: Aggregate([
            {"barcode": "A", "model_number": "MODEL", "item_name": "Camera", "opening_quantity": 10, "current_quantity": 7, "minimum_stock_level": 2, "status": "active"},
            {"barcode": "B", "model_number": "MODEL", "item_name": "Camera", "opening_quantity": 5, "current_quantity": 7, "minimum_stock_level": 2, "status": "active"},
        ])),
        inventory_transactions=transactions,
    )
    monkeypatch.setattr(inventory, 'get_db', lambda: db)
    result = asyncio.run(inventory.get_stock_summary({"role": "admin"}))
    assert result == [{"model_number": "MODEL", "item_name": "Camera", "initial_quantity": 15, "total_transactions": -1, "current_stock": 14, "minimum_stock_level": 2, "low_stock": "NO"}]
    assert transactions.aggregate.call_count == 1
