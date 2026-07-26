import pytest
from fastapi.testclient import TestClient
from app.main import app


@pytest.fixture()
def client():
    with TestClient(app) as test_client:
        yield test_client


def test_public_customer_lookup_not_found(client):
    res = client.post("/public/lookup-customer", json={"phone_number": "9990000000"})
    assert res.status_code == 200
    data = res.json()
    assert data["found"] is False


def test_public_register_complaint_creates_job_and_customer(client):
    payload = {
        "phone_number": "9887766554",
        "customer_name": "Public Test User",
        "location": "Kochi Marine Drive",
        "site_type": "Office",
        "work_type": "complaint",
        "complaint": "CCTV camera 3 display dark",
        "priority": "high",
    }
    res = client.post("/public/complaints", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    assert "JOB-" in data["job_id"]
    assert data["customer_name"] == "Public Test User"
    assert data["status"] == "pending"

    # Track using returned job_id
    job_id = data["job_id"]
    track_res = client.get(f"/public/track/{job_id}")
    assert track_res.status_code == 200
    track_data = track_res.json()
    assert track_data["job_id"] == job_id
    assert track_data["customer_name"] == "Public Test User"
    assert track_data["status"] == "pending"


def test_public_customer_lookup_after_registration(client):
    res = client.post("/public/lookup-customer", json={"phone_number": "9887766554"})
    assert res.status_code == 200
    data = res.json()
    assert data["found"] is True
    assert "Public" in data["customer_name"]
    assert data["location"] == "Kochi Marine Drive"
