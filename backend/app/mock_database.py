import json
import re
from copy import deepcopy
from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Any

import bcrypt

from .models.lookup import DEFAULT_LOOKUPS
from .utils.id_generator import (
    generate_inventory_item_id,
    generate_job_id,
    generate_transaction_id,
    make_customer_key,
)
from .utils.timezone import now_ist_str, today_ist_str


MOCK_DB_PATH = Path(__file__).resolve().parent.parent / "mock_db.json"


@dataclass
class MockWriteResult:
    modified_count: int = 0
    inserted_id: Any = None
    inserted_ids: list[Any] | None = None


@dataclass
class MockDeleteResult:
    deleted_count: int = 0


class MockCursor:
    def __init__(self, docs: list[dict]):
        self._docs = deepcopy(docs)

    def sort(self, field: str, direction: int):
        reverse = direction < 0
        self._docs.sort(key=lambda doc: _sort_key(_extract_first_value(doc, field)), reverse=reverse)
        return self

    def skip(self, count: int):
        self._docs = self._docs[count:]
        return self

    def limit(self, count: int):
        if count is not None and count >= 0:
            self._docs = self._docs[:count]
        return self

    async def to_list(self, length: int | None):
        if length is None:
            return deepcopy(self._docs)
        return deepcopy(self._docs[:length])


class MockCollection:
    def __init__(self, database: "MockDatabase", name: str):
        self.database = database
        self.name = name

    @property
    def docs(self) -> list[dict]:
        return self.database.data[self.name]

    async def create_index(self, *args, **kwargs):
        return None

    async def find_one(self, query: dict | None = None, projection: dict | None = None):
        for doc in self.docs:
            if _matches(doc, query or {}):
                return _apply_projection(doc, projection)
        return None

    def find(self, query: dict | None = None, projection: dict | None = None):
        docs = [
            _apply_projection(doc, projection)
            for doc in self.docs
            if _matches(doc, query or {})
        ]
        return MockCursor(docs)

    async def insert_one(self, doc: dict):
        normalized = _normalize(deepcopy(doc))
        if "_id" not in normalized:
            normalized["_id"] = f"{self.name}-{len(self.docs) + 1}"
        self.docs.append(normalized)
        self.database.save()
        return MockWriteResult(inserted_id=normalized["_id"])

    async def insert_many(self, docs: list[dict]):
        inserted_ids = []
        for doc in docs:
            normalized = _normalize(deepcopy(doc))
            if "_id" not in normalized:
                normalized["_id"] = f"{self.name}-{len(self.docs) + 1}"
            self.docs.append(normalized)
            inserted_ids.append(normalized["_id"])
        self.database.save()
        return MockWriteResult(inserted_ids=inserted_ids)

    async def update_one(self, query: dict, update: dict, upsert: bool = False):
        for index, doc in enumerate(self.docs):
            if _matches(doc, query):
                self.docs[index] = _apply_update(doc, update, query)
                self.database.save()
                return MockWriteResult(modified_count=1)

        if upsert:
            new_doc = _build_upsert_doc(query, update)
            self.docs.append(new_doc)
            self.database.save()
            return MockWriteResult(modified_count=1, inserted_id=new_doc.get("_id"))

        return MockWriteResult(modified_count=0)

    async def update_many(self, query: dict, update: dict):
        modified_count = 0
        for index, doc in enumerate(self.docs):
            if _matches(doc, query):
                self.docs[index] = _apply_update(doc, update, query)
                modified_count += 1

        if modified_count > 0:
            self.database.save()

        return MockWriteResult(modified_count=modified_count)

    async def find_one_and_update(self, query: dict, update: dict, upsert: bool = False, return_document: Any = None):
        for index, doc in enumerate(self.docs):
            if _matches(doc, query):
                self.docs[index] = _apply_update(doc, update, query)
                self.database.save()
                return deepcopy(self.docs[index])

        if upsert:
            new_doc = _build_upsert_doc(query, update)
            self.docs.append(new_doc)
            self.database.save()
            return deepcopy(new_doc)

        return None

    async def delete_one(self, query: dict):
        for index, doc in enumerate(self.docs):
            if _matches(doc, query):
                del self.docs[index]
                self.database.save()
                return MockDeleteResult(deleted_count=1)
        return MockDeleteResult(deleted_count=0)

    async def count_documents(self, query: dict | None = None):
        return sum(1 for doc in self.docs if _matches(doc, query or {}))

    def aggregate(self, pipeline: list[dict]):
        docs = deepcopy(self.docs)
        for stage in pipeline:
            if "$match" in stage:
                docs = [doc for doc in docs if _matches(doc, stage["$match"])]
            elif "$group" in stage:
                docs = _group_documents(docs, stage["$group"])
            elif "$sort" in stage:
                for field, direction in reversed(list(stage["$sort"].items())):
                    docs.sort(key=lambda doc: _sort_key(_extract_first_value(doc, field)), reverse=direction < 0)
            elif "$limit" in stage:
                docs = docs[:stage["$limit"]]
            elif "$count" in stage:
                docs = [{stage["$count"]: len(docs)}]
        return MockCursor(docs)


class MockDatabase:
    def __init__(self):
        self.is_mock = True
        self.path = MOCK_DB_PATH
        self.data = self._load()
        self._collections = {
            name: MockCollection(self, name)
            for name in self.data.keys()
        }

    def _load(self):
        if self.path.exists():
            loaded = json.loads(self.path.read_text(encoding="utf-8"))
        else:
            loaded = _seed_data()
            self.path.write_text(json.dumps(loaded, indent=2), encoding="utf-8")

        for name in _collection_names():
            loaded.setdefault(name, [])

        return loaded

    def save(self):
        self.path.write_text(json.dumps(_normalize(self.data), indent=2), encoding="utf-8")

    def close(self):
        return None

    def __getattr__(self, item: str):
        if item in self._collections:
            return self._collections[item]
        raise AttributeError(item)


def create_mock_database():
    return MockDatabase()


def _collection_names():
    return [
        "users",
        "staff",
        "customers",
        "jobs",
        "daily_updates",
        "attendance",
        "attendance_allowances",
        "billing",
        "lookups",
        "inventory",
        "inventory_transactions",
        "job_inventory_usage",
        "notifications",
        "push_tokens",
        "leaves",
        "tasks",
        "counters",
    ]


def _seed_data():
    today = today_ist_str()
    job_id = generate_job_id(1)
    customer_id = "CUS-DEMO0001"
    staff_id_sarun = "STF-SARUN01"
    staff_id_chikku = "STF-CHIKKU1"
    user_id_sahil = "USR-SAHIL01"
    user_id_sarun = "USR-SARUN01"
    user_id_chikku = "USR-CHIKKU1"
    inventory_id = generate_inventory_item_id()
    customer_key = make_customer_key("9876543210", "Demo Customer")
    now = now_ist_str()

    def make_hash(password: str):
        return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

    lookups = []
    for list_type, items in DEFAULT_LOOKUPS.items():
        lookups.append({
            "list_type": list_type,
            "items": [{"value": item["value"], "label": item["label"], "is_active": True} for item in items],
        })

    inventory_doc = {
        "_id": inventory_id,
        "barcode": "CAM-DEMO-001",
        "item_name": "Demo CCTV Camera",
        "category": "Camera",
        "brand": "Baangs",
        "unit_type": "Pcs",
        "purchase_price": 1200.0,
        "selling_price": 1800.0,
        "opening_quantity": 8.0,
        "current_quantity": 8.0,
        "minimum_stock_level": 2.0,
        "item_photo": None,
        "remarks": "Demo stock item",
        "status": "active",
        "created_at": now,
        "updated_at": now,
    }

    transaction_doc = {
        "_id": generate_transaction_id(),
        "inventory_item_id": inventory_id,
        "barcode": inventory_doc["barcode"],
        "transaction_type": "opening_stock",
        "quantity_changed": 8.0,
        "balance_after_transaction": 8.0,
        "done_by_user_id": user_id_sahil,
        "transaction_datetime": now,
        "remarks": "Opening stock",
    }

    return _normalize({
        "users": [
            {
                "user_id": user_id_sahil,
                "username": "sahil",
                "password_hash": make_hash("password123"),
                "role": "admin",
                "status": "active",
                "full_name": "Sahil Satheesh",
                "phone": "+91 9000000001",
                "staff_id": None,
                "created_at": now,
            },
            {
                "user_id": user_id_sarun,
                "username": "sarun",
                "password_hash": make_hash("password123"),
                "role": "technician",
                "status": "active",
                "full_name": "Sarun",
                "phone": "+91 9000000002",
                "staff_id": staff_id_sarun,
                "created_at": now,
            },
            {
                "user_id": user_id_chikku,
                "username": "chikku",
                "password_hash": make_hash("password123"),
                "role": "technician",
                "status": "active",
                "full_name": "Chikku",
                "phone": "+91 9000000003",
                "staff_id": staff_id_chikku,
                "created_at": now,
            },
        ],
        "staff": [
            {
                "staff_id": staff_id_sarun,
                "name": "Sarun",
                "phone_number": "+91 9000000002",
                "skill": "CCTV Installation",
                "is_active": True,
                "created_at": now,
            },
            {
                "staff_id": staff_id_chikku,
                "name": "Chikku",
                "phone_number": "+91 9000000003",
                "skill": "Service & Repair",
                "is_active": True,
                "created_at": now,
            },
        ],
        "customers": [
            {
                "customer_id": customer_id,
                "customer_name": "Demo Customer",
                "phone_number": "9876543210",
                "location": "Kochi",
                "site_type": "Office",
                "first_request_date": today,
                "latest_request_date": today,
                "total_jobs": 1,
                "customer_key": customer_key,
            },
        ],
        "jobs": [
            {
                "job_id": job_id,
                "customer_id": customer_id,
                "customer_name": "Demo Customer",
                "phone_number": "9876543210",
                "location": "Kochi",
                "site_type": "Office",
                "work_type": "installation",
                "complaint": "Install 4-camera CCTV setup",
                "priority": "medium",
                "scheduled_date": today,
                "preferred_time": "10:00 AM",
                "assigned_staff_id": staff_id_sarun,
                "assigned_staff_name": "Sarun",
                "status": "pending",
                "service_request_date": today,
                "next_schedule_date": None,
                "photo_url": None,
                "customer_key": customer_key,
            },
        ],
        "daily_updates": [],
        "attendance": [],
        "attendance_allowances": [],
        "billing": [],
        "lookups": lookups,
        "inventory": [inventory_doc],
        "inventory_transactions": [transaction_doc],
        "job_inventory_usage": [],
        "notifications": [],
        "push_tokens": [],
        "leaves": [],
        "tasks": [],
        "counters": [
            {"_id": f"job_{today.replace('-', '')}", "seq": 1},
        ],
    })


def _normalize(value: Any):
    if isinstance(value, Enum):
        return value.value
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, dict):
        return {key: _normalize(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_normalize(item) for item in value]
    return value


def _apply_projection(doc: dict | None, projection: dict | None):
    if doc is None:
        return None
    result = deepcopy(doc)
    if not projection:
        return result
    excluded = {key for key, value in projection.items() if value == 0}
    for key in excluded:
        result.pop(key, None)
    return result


def _extract_values(doc: Any, path: str):
    parts = path.split(".")
    values = [doc]
    for part in parts:
        next_values = []
        for value in values:
            if isinstance(value, list):
                for item in value:
                    if isinstance(item, dict) and part in item:
                        next_values.append(item[part])
            elif isinstance(value, dict) and part in value:
                next_values.append(value[part])
        values = next_values
    return values


def _extract_first_value(doc: dict, path: str):
    values = _extract_values(doc, path)
    if not values:
        return None
    return values[0]


def _sort_key(value: Any):
    if value is None:
        return (1, "")
    if isinstance(value, (int, float)):
        return (0, value)
    return (0, str(value))


def _matches(doc: dict, query: dict):
    if not query:
        return True

    for key, expected in query.items():
        if key == "$or":
            if not any(_matches(doc, subquery) for subquery in expected):
                return False
            continue

        if key == "$expr":
            if not _truthy(_eval_expr(expected, doc)):
                return False
            continue

        values = _extract_values(doc, key)
        if not _match_values(values, expected, doc):
            return False

    return True


def _match_values(values: list[Any], expected: Any, doc: dict):
    if isinstance(expected, dict) and any(str(key).startswith("$") for key in expected.keys()):
        return _match_operators(values, expected, doc)

    normalized_expected = _normalize(expected)
    return any(
        (_normalize(value) == normalized_expected)
        or (isinstance(value, list) and normalized_expected in [_normalize(item) for item in value])
        for value in values
    )


def _match_operators(values: list[Any], expected: dict, doc: dict):
    candidate_values = values or [None]

    for op, operand in expected.items():
        if op == "$options":
            continue
        if op == "$regex":
            flags = re.IGNORECASE if expected.get("$options") == "i" else 0
            pattern = re.compile(str(operand), flags)
            if not any(value is not None and pattern.search(str(value)) for value in candidate_values):
                return False
        elif op == "$gte":
            if not any(value is not None and value >= operand for value in candidate_values):
                return False
        elif op == "$lte":
            if not any(value is not None and value <= operand for value in candidate_values):
                return False
        elif op == "$gt":
            if not any(value is not None and value > operand for value in candidate_values):
                return False
        elif op == "$lt":
            if not any(value is not None and value < operand for value in candidate_values):
                return False
        elif op == "$ne":
            if any(_normalize(value) == _normalize(operand) for value in candidate_values):
                return False
        elif op == "$nin":
            normalized_operand = [_normalize(item) for item in operand]
            if any(_normalize(value) in normalized_operand for value in candidate_values):
                return False
        elif op == "$in":
            normalized_operand = [_normalize(item) for item in operand]
            if not any(_normalize(value) in normalized_operand for value in candidate_values):
                return False
        elif op == "$exists":
            exists = bool(values)
            if exists != bool(operand):
                return False
        elif op == "$expr":
            if not _truthy(_eval_expr(operand, doc)):
                return False
    return True


def _truthy(value: Any):
    return bool(value)


def _eval_expr(expr: Any, doc: dict):
    if isinstance(expr, str):
        if expr.startswith("$"):
            return _extract_first_value(doc, expr[1:])
        return expr
    if isinstance(expr, (int, float, bool)) or expr is None:
        return expr
    if isinstance(expr, list):
        return [_eval_expr(item, doc) for item in expr]
    if isinstance(expr, dict):
        if "$substr" in expr:
            source, start, length = expr["$substr"]
            value = str(_eval_expr(source, doc) or "")
            return value[start:start + length]
        if "$multiply" in expr:
            result = 1
            for item in expr["$multiply"]:
                result *= float(_eval_expr(item, doc) or 0)
            return result
        if "$cond" in expr:
            condition, truthy_value, falsy_value = expr["$cond"]
            return _eval_expr(truthy_value, doc) if _truthy(_eval_expr(condition, doc)) else _eval_expr(falsy_value, doc)
        if "$eq" in expr:
            left, right = expr["$eq"]
            return _normalize(_eval_expr(left, doc)) == _normalize(_eval_expr(right, doc))
        if "$lte" in expr:
            left, right = expr["$lte"]
            return (_eval_expr(left, doc) or 0) <= (_eval_expr(right, doc) or 0)
    return expr


def _group_documents(docs: list[dict], group_spec: dict):
    grouped: dict[Any, dict] = {}
    key_specs: dict[Any, Any] = {}

    for doc in docs:
        raw_key = _eval_expr(group_spec["_id"], doc)
        key = json.dumps(raw_key, sort_keys=True) if isinstance(raw_key, dict) else raw_key
        key_specs[key] = raw_key

        if key not in grouped:
            grouped[key] = {"_id": raw_key}

        target = grouped[key]
        for field, expression in group_spec.items():
            if field == "_id":
                continue

            if "$sum" in expression:
                target[field] = target.get(field, 0) + (_eval_expr(expression["$sum"], doc) or 0)
            elif "$first" in expression and field not in target:
                target[field] = _eval_expr(expression["$first"], doc)

    return list(grouped.values())


def _apply_update(doc: dict, update: dict, query: dict):
    updated = deepcopy(doc)

    for operator, payload in update.items():
        if operator == "$set":
            for path, value in payload.items():
                _set_path(updated, path, value, query)
        elif operator == "$inc":
            for path, value in payload.items():
                current = _extract_first_value(updated, path) or 0
                _set_path(updated, path, current + value, query)
        elif operator == "$push":
            for path, value in payload.items():
                current = _extract_first_value(updated, path)
                if current is None:
                    _set_path(updated, path, [_normalize(value)], query)
                else:
                    current.append(_normalize(value))

    return _normalize(updated)


def _set_path(doc: dict, path: str, value: Any, query: dict):
    if ".$." in path:
        array_field, nested_field = path.split(".$.", 1)
        matcher_key = None
        matcher_value = None
        for key, item in query.items():
            if key.startswith(f"{array_field}."):
                matcher_key = key.split(".", 1)[1]
                matcher_value = item
                break

        items = doc.setdefault(array_field, [])
        if matcher_key is not None:
            for item in items:
                if _normalize(item.get(matcher_key)) == _normalize(matcher_value):
                    item[nested_field] = _normalize(value)
                    return
        return

    parts = path.split(".")
    target = doc
    for part in parts[:-1]:
        if part not in target or not isinstance(target[part], dict):
            target[part] = {}
        target = target[part]
    target[parts[-1]] = _normalize(value)


def _build_upsert_doc(query: dict, update: dict):
    new_doc = {}
    for key, value in query.items():
        if isinstance(value, dict) or key.startswith("$"):
            continue
        _set_path(new_doc, key, value, query)
    return _apply_update(new_doc, update, query)
