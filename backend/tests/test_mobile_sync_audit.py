import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.auth.utils import get_current_user
from app.mock_database import _matches
from app.routers import jobs, updates, notifications
from app.utils import notifications as push
from app.utils.job_access import is_assigned_to_job


class Cursor:
    def __init__(self, rows):
        self.rows = rows

    def sort(self, *args):
        return self

    def skip(self, value):
        self.rows = self.rows[value:]
        return self

    def limit(self, value):
        self.rows = self.rows[:value]
        return self

    async def to_list(self, value):
        return self.rows if value is None else self.rows[:value]


def audit_client(monkeypatch, user):
    rows = [{'job_id': 'PRIMARY', 'assigned_staff_id': 'A', 'additional_staff_ids': [], 'customer_name': 'Test'},
            {'job_id': 'SECONDARY', 'assigned_staff_id': 'B', 'additional_staff_ids': ['A'], 'customer_name': 'Test'},
            {'job_id': 'OTHER', 'assigned_staff_id': 'C', 'additional_staff_ids': [], 'customer_name': 'Test'}]
    collection = SimpleNamespace(
        update_many=AsyncMock(), update_one=AsyncMock(),
        find=lambda query: Cursor([row for row in rows if _matches(row, query)]),
        find_one=AsyncMock(side_effect=lambda query, *args: next((row for row in rows if _matches(row, query)), None)),
    )
    db = SimpleNamespace(jobs=collection,
        job_inventory_usage=SimpleNamespace(find=lambda query: Cursor([])),
        daily_updates=SimpleNamespace(find=lambda query: Cursor([]), insert_one=AsyncMock()),
        staff=SimpleNamespace(find_one=AsyncMock(return_value={'name': 'Tech A'})))
    for router in [jobs, updates, notifications]:
        monkeypatch.setattr(router, 'get_db', lambda: db)
    monkeypatch.setattr(updates, 'notify_roles', AsyncMock())
    app = FastAPI()
    app.include_router(jobs.router)
    app.include_router(updates.router)
    app.dependency_overrides[get_current_user] = lambda: user
    return TestClient(app), db


def test_technician_list_includes_additional_assignment_and_cannot_override_scope(monkeypatch):
    client, _ = audit_client(monkeypatch, {'role': 'technician', 'staff_id': 'A'})
    with client:
        response = client.get('/jobs/')
        assert response.status_code == 200
        assert {job['job_id'] for job in response.json()} == {'PRIMARY', 'SECONDARY'}
        assert client.get('/jobs/?assigned_staff_id=C').json() == []
        assert client.get('/jobs/?search=Other').json() == []


def test_technician_without_staff_sees_no_jobs(monkeypatch):
    client, _ = audit_client(monkeypatch, {'role': 'technician'})
    with client:
        assert client.get('/jobs/').json() == []
        assert client.get('/jobs/PRIMARY').status_code == 403


def test_additional_technician_can_open_start_work_and_read_updates(monkeypatch):
    client, db = audit_client(monkeypatch, {'role': 'technician', 'staff_id': 'A'})
    with client:
        assert client.get('/jobs/SECONDARY').status_code == 200
        result = client.post('/updates/', json={'job_id': 'SECONDARY', 'status': 'in_progress', 'work_event': 'start_work'})
        assert result.status_code == 200, result.text
        assert db.jobs.update_one.await_count == 1
        assert client.get('/updates/job/SECONDARY').status_code == 200
        assert client.get('/updates/job/OTHER').status_code == 403


def test_notification_visibility_includes_additional_technician(monkeypatch):
    _, db = audit_client(monkeypatch, {'role': 'technician', 'staff_id': 'A'})
    row = {'meta': {'job_id': 'SECONDARY'}}
    assert asyncio.run(notifications._is_visible_notification(db, row, {'role': 'technician', 'staff_id': 'A'}))
    assert not is_assigned_to_job({'assigned_staff_id': None}, None)


def test_push_errors_deactivate_token_and_high_priority_channel(monkeypatch):
    rows = [{'token': 'ExpoPushToken[test]', 'user_id': 'U', 'status': 'active'}]
    db = SimpleNamespace(push_tokens=SimpleNamespace(find=lambda query: Cursor(rows), update_one=AsyncMock()))
    sent = []

    class Client:
        def __init__(self, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            pass

        async def post(self, url, json):
            sent.extend(json)
            return httpx.Response(200, request=httpx.Request('POST', url), json={'data': [{'status': 'error', 'details': {'error': 'DeviceNotRegistered'}}]})

    monkeypatch.setattr(push.httpx, 'AsyncClient', Client)
    asyncio.run(push.send_push_to_users(db, ['U'], 'Job', 'Assigned', {'job_id': 'PRIMARY'}, {'U': 'N'}))
    assert sent[0]['priority'] == 'high'
    assert sent[0]['channelId'] == 'baangs-alerts-v2'
    assert sent[0]['data']['notification_id'] == 'N'
    assert db.push_tokens.update_one.await_args.args[1]['$set']['status'] == 'inactive'
