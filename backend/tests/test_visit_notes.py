"""Visit notes use isolated collections and cannot mutate job finances or status."""
import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock
import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from app.routers import updates


def test_completed_job_note_is_append_only(monkeypatch):
    job = {"job_id": "JOB-1", "status": "complete", "assigned_staff_id": "ST-1", "additional_staff_ids": ["ST-2"]}
    db = SimpleNamespace(
        jobs=SimpleNamespace(find_one=AsyncMock(return_value=job)),
        staff=SimpleNamespace(find_one=AsyncMock(return_value={"name": "Technician Two"})),
        daily_updates=SimpleNamespace(insert_one=AsyncMock()),
    )
    monkeypatch.setattr(updates, 'get_db', lambda: db)
    user = {"user_id": "U-2", "staff_id": "ST-2", "role": "technician"}
    result = asyncio.run(updates.add_visit_note('JOB-1', updates.VisitNoteCreate(visit_notes=' Additional inspection '), user))
    assert result['visit_notes'] == 'Additional inspection'
    assert result['staff_name'] == 'Technician Two'
    assert result['status'] == 'complete'
    assert job['status'] == 'complete'
    assert db.daily_updates.insert_one.await_count == 1
    user['staff_id'] = 'OTHER'
    with pytest.raises(HTTPException) as denied:
        asyncio.run(updates.add_visit_note('JOB-1', updates.VisitNoteCreate(visit_notes='Unauthorized'), user))
    assert denied.value.status_code == 403
    assert db.daily_updates.insert_one.await_count == 1


def test_visit_note_validation():
    with pytest.raises(ValidationError):
        updates.VisitNoteCreate(visit_notes='x' * 5001)
    with pytest.raises(HTTPException) as empty:
        asyncio.run(updates.add_visit_note('JOB-1', updates.VisitNoteCreate(visit_notes='   '), {'role': 'technician'}))
    assert empty.value.status_code == 400
