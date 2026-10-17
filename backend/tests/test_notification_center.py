"""Notification ownership and pagination checks against isolated memory only."""
import asyncio
from copy import deepcopy
from types import SimpleNamespace
import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from app.routers import notifications as routes
from app.auth.utils import get_current_user


def matches(row, query):
    return all(row.get(key) in value['$in'] if isinstance(value, dict) and '$in' in value else row.get(key) == value for key, value in query.items())


class Cursor:
    def __init__(self, rows): self.rows = deepcopy(rows)
    def sort(self, field, order): self.rows.sort(key=lambda row: row.get(field, ''), reverse=order == -1); return self
    def skip(self, value): self.rows = self.rows[value:]; return self
    def limit(self, value): self.rows = self.rows[:value]; return self
    async def to_list(self, limit): return self.rows if limit is None else self.rows[:limit]


class Collection:
    def __init__(self, rows=()): self.rows = deepcopy(list(rows))
    def find(self, query, projection=None): return Cursor([row for row in self.rows if matches(row, query)])
    async def count_documents(self, query): return len([row for row in self.rows if matches(row, query)])
    async def find_one_and_update(self, query, changes, **kwargs):
        for row in self.rows:
            if matches(row, query): row.update(changes['$set']); return deepcopy(row)
        return None
    async def update_many(self, query, changes):
        for row in self.rows:
            if matches(row, query): row.update(changes['$set'])
    async def delete_many(self, query):
        old = len(self.rows); self.rows = [row for row in self.rows if not matches(row, query)]
        return SimpleNamespace(deleted_count=old - len(self.rows))


def database(monkeypatch):
    rows = [{'notification_id': f'N{i}', 'user_id': 'B' if i == 4 else 'A', 'title': f'Alert {i}', 'is_read': False, 'created_at': f'2026-10-17T0{5-i}:00:00', 'meta': {'job_id': f'J{i}'} if i in [1, 2] else {}} for i in range(1, 5)]
    db = SimpleNamespace(notifications=Collection(rows), jobs=Collection([{'job_id': 'J1', 'assigned_staff_id': 'ST1'}, {'job_id': 'J2', 'assigned_staff_id': 'ST2'}]))
    monkeypatch.setattr(routes, 'get_db', lambda: db)
    return db


def test_pagination_filters_visibility_before_skipping(monkeypatch):
    async def run():
        database(monkeypatch)
        actor = {'user_id': 'A', 'role': 'technician', 'staff_id': 'ST1'}
        rows = await routes.list_notifications(1, 1, actor)
        assert [row['notification_id'] for row in rows] == ['N3']
        assert (await routes.unread_count(actor))['count'] == 2
        assert (await routes.list_notifications(1, 1, {'user_id': 'A', 'role': 'admin'}))[0]['notification_id'] == 'N2'
    asyncio.run(run())


def test_bulk_actions_and_unread_are_owner_scoped(monkeypatch):
    async def run():
        db = database(monkeypatch); actor = {'user_id': 'A', 'role': 'admin'}
        await routes.mark_all_read(actor)
        assert [row['is_read'] for row in db.notifications.rows] == [True, True, True, False]
        await routes.mark_unread('N3', actor)
        assert db.notifications.rows[2]['is_read'] is False
        with pytest.raises(HTTPException) as exc: await routes.mark_unread('N4', actor)
        assert exc.value.status_code == 404
        with pytest.raises(HTTPException): await routes.mark_read('N4', actor)
        result = await routes.clear_selected(routes.NotificationSelection(notification_ids=['N1', 'N4']), actor)
        assert result['deleted_count'] == 1
        assert {row['notification_id'] for row in db.notifications.rows} == {'N2', 'N3', 'N4'}
    asyncio.run(run())


def test_api_validation_and_owned_bulk_delete(monkeypatch):
    db = database(monkeypatch)
    app = FastAPI(); app.include_router(routes.router)
    app.dependency_overrides[get_current_user] = lambda: {'user_id': 'A', 'role': 'admin'}
    with TestClient(app) as client:
        assert client.get('/notifications/?skip=-1').status_code == 422
        assert client.post('/notifications/clear-selected', json={'notification_ids': []}).status_code == 422
        assert client.post('/notifications/clear-selected', json={'notification_ids': ['x'] * 201}).status_code == 422
        assert client.patch('/notifications/read-all').status_code == 200
        assert db.notifications.rows[-1]['is_read'] is False
        assert client.post('/notifications/clear-selected', json={'notification_ids': ['N4']}).json()['deleted_count'] == 0
