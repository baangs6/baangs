from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app


MOCK_DB_PATH = Path(__file__).resolve().parents[1] / "mock_db.json"


@pytest.fixture()
def client():
    # Reset persisted mock DB to keep tests deterministic.
    if MOCK_DB_PATH.exists():
        MOCK_DB_PATH.unlink()
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture()
def admin_token(client):
    res = client.post(
        "/auth/login",
        json={"username": "sahil", "password": "password123", "platform": "web"},
    )
    assert res.status_code == 200, res.text
    return res.json()["access_token"]


@pytest.fixture()
def tech_token(client):
    res = client.post(
        "/auth/login",
        json={"username": "sarun", "password": "password123", "platform": "mobile"},
    )
    assert res.status_code == 200, res.text
    return res.json()["access_token"]

