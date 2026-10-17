"""In-memory route checks: never load or change an application database."""
import asyncio
from copy import deepcopy
from types import SimpleNamespace

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from pydantic import ValidationError
from app.models.daily_update import LearningEntry, DoubtReview
from app.routers import updates
from app.auth.utils import require_admin_or_manager


class Collection:
    def __init__(self, rows=()):
        self.rows = list(deepcopy(rows))

    async def find_one(self, query):
        return next((deepcopy(row) for row in self.rows if all(row.get(k) == v for k, v in query.items())), None)

    async def insert_one(self, row):
        self.rows.append(deepcopy(row))

    async def find_one_and_update(self, query, change, **kwargs):
        for row in self.rows:
            if all(row.get(k) == v for k, v in query.items()):
                row.update(change['$set'])
                return deepcopy(row)
        return None


def database(monkeypatch):
    db = SimpleNamespace(jobs=Collection([{'job_id': 'J1', 'assigned_staff_id': 'S1', 'status': 'in_progress'}]), staff=Collection([{'staff_id': 'S1', 'name': 'Amal'}, {'staff_id': 'S2'}]), daily_updates=Collection())
    monkeypatch.setattr(updates, 'get_db', lambda: db)
    return db


def test_learning_entry_and_review_persist_without_job_changes(monkeypatch):
    async def run():
        db = database(monkeypatch)
        original = deepcopy(db.jobs.rows)
        entry = await updates.create_learning_entry(LearningEntry(job_id='J1', staff_id='S1', kind='doubt', note=' IR glare '), {'username': 'admin'})
        assert entry['issues_faced'] == 'IR glare'
        entry = await updates.review_doubt(entry['update_id'], DoubtReview(admin_reply='Tilt down', doubt_status='answered', team_sop=True, site_visit_required=True), {'username': 'admin'})
        assert entry['team_sop'] and entry['site_visit_required']
        assert entry['admin_reply'] == 'Tilt down' and entry['replied_by'] == 'admin'
        entry = await updates.review_doubt(entry['update_id'], DoubtReview(admin_reply='Tilt down', doubt_status='resolved'), {'username': 'admin'})
        assert entry['team_sop'] and entry['site_visit_required']
        assert entry['doubt_status'] == 'resolved'
        assert db.jobs.rows == original
        assert len(db.daily_updates.rows) == 1
    asyncio.run(run())


def test_entry_validation_and_sop_requires_content(monkeypatch):
    async def run():
        db = database(monkeypatch)
        for staff_id, note in [('S2', 'note'), ('S1', '   ')]:
            with pytest.raises(HTTPException) as exc:
                await updates.create_learning_entry(LearningEntry(job_id='J1', staff_id=staff_id, kind='doubt', note=note), {})
            assert exc.value.status_code == 400
        assert db.daily_updates.rows == []
        entry = await updates.create_learning_entry(LearningEntry(job_id='J1', staff_id='S1', kind='doubt', note='glare'), {})
        with pytest.raises(HTTPException) as exc:
            await updates.review_doubt(entry['update_id'], DoubtReview(team_sop=True), {})
        assert exc.value.status_code == 400
        with pytest.raises(HTTPException):
            await updates.review_doubt(entry['update_id'], DoubtReview(doubt_status='invalid'), {})
        with pytest.raises(HTTPException):
            await updates.review_doubt('missing', DoubtReview(), {})
    asyncio.run(run())
    with pytest.raises(ValidationError):
        LearningEntry(job_id='J1', staff_id='S1', kind='unsupported', note='x')


def test_learning_and_sop_actions_require_manager_access(monkeypatch):
    database(monkeypatch)
    app = FastAPI()
    app.include_router(updates.router)
    def deny():
        raise HTTPException(status_code=403, detail='Insufficient permissions')
    app.dependency_overrides[require_admin_or_manager] = deny
    with TestClient(app) as client:
        assert client.post('/updates/learning-log', json={'job_id': 'J1', 'staff_id': 'S1', 'kind': 'doubt', 'note': 'test'}).status_code == 403
        assert client.patch('/updates/U1/doubt-review', json={'team_sop': True}).status_code == 403
