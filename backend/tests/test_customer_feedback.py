import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException

from app.routers import jobs, public


def feedback_db(status="complete", rating=None):
    job = {"job_id": "JOB-1", "status": status, "customer_name": "Customer",
           "assigned_staff_id": "TECH-1", "assigned_staff_name": "Technician",
           "customer_feedback_token": "valid-feedback-token-12345", "customer_rating": rating}
    collection = SimpleNamespace(find_one=AsyncMock(return_value=job), update_one=AsyncMock(return_value=SimpleNamespace(modified_count=1)))
    return SimpleNamespace(jobs=collection), job


def test_completed_job_feedback_is_saved_once(monkeypatch):
    db, _ = feedback_db()
    monkeypatch.setattr(public, 'get_db', lambda: db)
    form = asyncio.run(public.get_customer_feedback_form("JOB-1", "valid-feedback-token-12345"))
    assert form["technician_name"] == "Technician"
    result = asyncio.run(public.submit_customer_feedback("JOB-1", public.CustomerFeedbackCreate(
        token="valid-feedback-token-12345", rating=5, comment="Helpful service")))
    assert result["success"]
    query = db.jobs.update_one.await_args.args[0]
    assert query["customer_rating"] is None
    assert db.jobs.update_one.await_args.args[1]["$set"]["customer_rating"] == 5


def test_feedback_rejects_incomplete_and_duplicate_jobs(monkeypatch):
    db, _ = feedback_db(status="pending")
    monkeypatch.setattr(public, 'get_db', lambda: db)
    with pytest.raises(HTTPException) as error:
        asyncio.run(public.submit_customer_feedback("JOB-1", public.CustomerFeedbackCreate(
            token="valid-feedback-token-12345", rating=3)))
    assert error.value.status_code == 400

    db, _ = feedback_db(rating=4)
    monkeypatch.setattr(public, 'get_db', lambda: db)
    with pytest.raises(HTTPException) as error:
        asyncio.run(public.submit_customer_feedback("JOB-1", public.CustomerFeedbackCreate(
            token="valid-feedback-token-12345", rating=3)))
    assert error.value.status_code == 409


def test_only_assigned_technician_can_create_feedback_link(monkeypatch):
    db, _ = feedback_db()
    monkeypatch.setattr(jobs, 'get_db', lambda: db)
    with pytest.raises(HTTPException) as error:
        asyncio.run(jobs.create_feedback_link("JOB-1", {"role": "technician", "staff_id": "OTHER"}))
    assert error.value.status_code == 403
    result = asyncio.run(jobs.create_feedback_link("JOB-1", {"role": "technician", "staff_id": "TECH-1"}))
    assert result["token"] == "valid-feedback-token-12345"
