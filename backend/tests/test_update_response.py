from fastapi import FastAPI
from fastapi.testclient import TestClient
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.auth.utils import get_current_user
from app.routers import updates


@pytest.mark.parametrize('event,status', [('start_work', 'in_progress'), ('end_work', 'complete'), (None, 'pending')])
def test_work_updates_without_doubts_return_valid_response(monkeypatch, event, status):
    db = SimpleNamespace(
        jobs=SimpleNamespace(find_one=AsyncMock(return_value={'job_id': 'TEST', 'assigned_staff_id': 'TECH'}), update_one=AsyncMock()),
        staff=SimpleNamespace(find_one=AsyncMock(return_value={'name': 'Test Technician'})),
        job_inventory_usage=SimpleNamespace(find=lambda query: SimpleNamespace(to_list=AsyncMock(return_value=[]))),
        daily_updates=SimpleNamespace(insert_one=AsyncMock()),
    )
    monkeypatch.setattr(updates, 'get_db', lambda: db)
    monkeypatch.setattr(updates, 'notify_roles', AsyncMock())
    app = FastAPI()
    app.include_router(updates.router)
    app.dependency_overrides[get_current_user] = lambda: {'role': 'technician', 'staff_id': 'TECH'}
    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.post('/updates/', json={'job_id': 'TEST', 'status': status, 'work_event': event})
    assert response.status_code == 200, response.text
    assert response.json()['status'] == status
    assert isinstance(response.json()['doubt_status'], str)


@pytest.mark.parametrize('issues,status,expected', [(None, None, 'resolved'), ('Question', None, 'open'), ('Question', 'answered', 'answered')])
def test_existing_updates_with_null_doubt_status(issues, status, expected):
    from app.models.daily_update import DailyUpdateResponse
    record = {'job_id': 'TEST', 'issues_faced': issues, 'doubt_status': status}
    assert DailyUpdateResponse(**updates._fmt(record)).doubt_status == expected
