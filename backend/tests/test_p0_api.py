from datetime import date, timedelta


def _auth_header(token: str):
    return {"Authorization": f"Bearer {token}"}


def test_auth_admin_login_success(client):
    res = client.post(
        "/auth/login",
        json={"username": "sahil", "password": "password123", "platform": "web"},
    )
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["token_type"] == "bearer"
    assert data["user"]["role"] == "admin"


def test_auth_technician_login_blocked_on_web(client):
    res = client.post(
        "/auth/login",
        json={"username": "sarun", "password": "password123", "platform": "web"},
    )
    assert res.status_code == 403
    assert "mobile app" in res.json()["detail"].lower()


def test_protected_endpoint_requires_jwt(client):
    res = client.get("/users/")
    assert res.status_code in (401, 403)


def test_create_staff_p0(admin_token, client):
    payload = {
        "name": "QA P0 Staff",
        "phone_number": "+91 9111111111",
        "salary_type": "monthly",
        "monthly_salary": 30000,
        "allowance": 1000,
        "deduction": 500,
    }
    res = client.post("/staff/", json=payload, headers=_auth_header(admin_token))
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["name"] == payload["name"]
    assert data["phone_number"] == payload["phone_number"]


def test_leave_apply_and_admin_approve(admin_token, tech_token, client):
    start = date.today() + timedelta(days=1)
    end = start + timedelta(days=2)
    leave_payload = {
        "leave_type": "sick",
        "from_date": start.isoformat(),
        "to_date": end.isoformat(),
        "reason": "P0 test leave",
    }
    apply_res = client.post("/leaves/", json=leave_payload, headers=_auth_header(tech_token))
    assert apply_res.status_code == 200, apply_res.text
    leave_id = apply_res.json()["leave_id"]

    approve_res = client.patch(
        f"/leaves/{leave_id}/decision",
        json={"decision": "approved"},
        headers=_auth_header(admin_token),
    )
    assert approve_res.status_code == 200, approve_res.text
    assert approve_res.json()["status"] == "approved"


def test_payroll_rule_two_paid_leaves_then_unpaid(admin_token, tech_token, client):
    # Create one 4-day approved leave for technician Sarun in current month.
    today = date.today()
    start = today.replace(day=1)
    end = start + timedelta(days=3)
    leave_payload = {
        "leave_type": "casual",
        "from_date": start.isoformat(),
        "to_date": end.isoformat(),
        "reason": "Payroll rule verification",
    }
    apply_res = client.post("/leaves/", json=leave_payload, headers=_auth_header(tech_token))
    assert apply_res.status_code == 200, apply_res.text
    leave_id = apply_res.json()["leave_id"]

    approve_res = client.patch(
        f"/leaves/{leave_id}/decision",
        json={"decision": "approved"},
        headers=_auth_header(admin_token),
    )
    assert approve_res.status_code == 200, approve_res.text

    month_str = today.strftime("%Y-%m")
    payroll_res = client.get(
        "/staff/payroll/summary",
        params={"month": month_str},
        headers=_auth_header(admin_token),
    )
    assert payroll_res.status_code == 200, payroll_res.text
    items = payroll_res.json()["items"]
    sarun = next((it for it in items if it["staff_id"] == "STF-SARUN01"), None)
    assert sarun is not None
    assert sarun["approved_leave_days"] >= 4
    assert sarun["paid_leave_days"] == 2
    assert sarun["unpaid_leave_days"] >= 2


def test_admin_can_delete_user(admin_token, client):
    create_res = client.post(
        "/users/",
        json={
            "username": "qa_delete_user",
            "password": "password123",
            "role": "technician",
            "full_name": "QA Delete",
            "phone": "+91 9222222222",
        },
        headers=_auth_header(admin_token),
    )
    assert create_res.status_code == 200, create_res.text
    user_id = create_res.json()["user_id"]

    del_res = client.delete(f"/users/{user_id}", headers=_auth_header(admin_token))
    assert del_res.status_code == 200, del_res.text
    assert del_res.json()["user_id"] == user_id


def test_attendance_checkin_checkout_persist_with_photo_urls(tech_token, client):
    checkin_payload = {
        "staff_id": "STF-SARUN01",
        "latitude": 9.9312,
        "longitude": 76.2673,
        "remarks": "Reached site and started work",
        "photo_url": "https://res.cloudinary.com/demo/image/upload/checkin-test.jpg",
    }
    checkin_res = client.post("/attendance/checkin", json=checkin_payload, headers=_auth_header(tech_token))
    assert checkin_res.status_code == 200, checkin_res.text
    checkin_data = checkin_res.json()
    assert checkin_data["staff_id"] == "STF-SARUN01"
    assert checkin_data["checkin_photo_url"] == checkin_payload["photo_url"]
    assert checkin_data["remarks"] == checkin_payload["remarks"]
    assert checkin_data["is_checked_out"] is False

    checkout_payload = {
        "attendance_id": checkin_data["attendance_id"],
        "latitude": 9.9350,
        "longitude": 76.2700,
        "remarks": "Work completed",
        "photo_url": "https://res.cloudinary.com/demo/image/upload/checkout-test.jpg",
    }
    checkout_res = client.post("/attendance/checkout", json=checkout_payload, headers=_auth_header(tech_token))
    assert checkout_res.status_code == 200, checkout_res.text
    checkout_data = checkout_res.json()
    assert checkout_data["attendance_id"] == checkin_data["attendance_id"]
    assert checkout_data["checkout_photo_url"] == checkout_payload["photo_url"]
    assert checkout_data["checkout_remarks"] == checkout_payload["remarks"]
    assert checkout_data["is_checked_out"] is True


def test_admin_attendance_list_shows_photos_and_technician_details(admin_token, tech_token, client):
    # Seed one complete attendance record from technician.
    checkin_res = client.post(
        "/attendance/checkin",
        json={
            "staff_id": "STF-SARUN01",
            "latitude": 9.93,
            "longitude": 76.26,
            "remarks": "Visibility test in",
            "photo_url": "https://res.cloudinary.com/demo/image/upload/att-in.jpg",
        },
        headers=_auth_header(tech_token),
    )
    assert checkin_res.status_code == 200, checkin_res.text
    att_id = checkin_res.json()["attendance_id"]

    checkout_res = client.post(
        "/attendance/checkout",
        json={
            "attendance_id": att_id,
            "latitude": 9.94,
            "longitude": 76.27,
            "remarks": "Visibility test out",
            "photo_url": "https://res.cloudinary.com/demo/image/upload/att-out.jpg",
        },
        headers=_auth_header(tech_token),
    )
    assert checkout_res.status_code == 200, checkout_res.text

    list_res = client.get("/attendance/", headers=_auth_header(admin_token))
    assert list_res.status_code == 200, list_res.text
    rows = list_res.json()
    rec = next((r for r in rows if r["attendance_id"] == att_id), None)
    assert rec is not None
    assert rec["staff_id"] == "STF-SARUN01"
    assert rec["staff_name"] in ("Sarun", "Unknown")
    assert rec["checkin_photo_url"] == "https://res.cloudinary.com/demo/image/upload/att-in.jpg"
    assert rec["checkout_photo_url"] == "https://res.cloudinary.com/demo/image/upload/att-out.jpg"


def test_job_flow_admin_create_assign_technician_update_and_invoice_saved(admin_token, tech_token, client):
    # 1) Admin creates customer (idempotent behavior allowed)
    customer_res = client.post(
        "/customers/",
        json={
            "customer_name": "QA P0 Customer",
            "phone_number": "9888877777",
            "location": "Kochi",
            "site_type": "Office",
        },
        headers=_auth_header(admin_token),
    )
    assert customer_res.status_code == 200, customer_res.text

    # 2) Admin creates job assigned to technician
    job_res = client.post(
        "/jobs/",
        json={
            "customer_name": "QA P0 Customer",
            "phone_number": "9888877777",
            "location": "Kochi",
            "site_type": "Office",
            "work_type": "installation",
            "complaint": "Install test camera set",
            "priority": "medium",
            "assigned_staff_id": "STF-SARUN01",
        },
        headers=_auth_header(admin_token),
    )
    assert job_res.status_code == 200, job_res.text
    job_id = job_res.json()["job_id"]
    assert job_res.json()["assigned_staff_id"] == "STF-SARUN01"

    # 3) Technician updates job status
    tech_job_update_res = client.put(
        f"/jobs/{job_id}",
        json={"status": "in_progress"},
        headers=_auth_header(tech_token),
    )
    assert tech_job_update_res.status_code == 200, tech_job_update_res.text
    assert tech_job_update_res.json()["status"] == "in_progress"

    # 4) Technician submits daily update with invoice amount + final status
    update_res = client.post(
        "/updates/",
        json={
            "job_id": job_id,
            "status": "complete",
            "visit_notes": "Completed installation and handover",
            "invoice_amount": 5000,
            "collected_amount": 2000,
            "expense": 300,
        },
        headers=_auth_header(tech_token),
    )
    assert update_res.status_code == 200, update_res.text
    assert update_res.json()["status"] == "complete"
    assert float(update_res.json()["invoice_amount"]) == 5000

    # 5) Admin reads job and verifies final status
    job_get_res = client.get(f"/jobs/{job_id}", headers=_auth_header(admin_token))
    assert job_get_res.status_code == 200, job_get_res.text
    assert job_get_res.json()["status"] == "complete"

    # 6) Invoice amount persisted in billing
    billing_list_res = client.get("/billing/", headers=_auth_header(admin_token))
    assert billing_list_res.status_code == 200, billing_list_res.text
    billing_row = next((b for b in billing_list_res.json() if b["job_id"] == job_id), None)
    assert billing_row is not None
    assert float(billing_row["invoice_amount"]) >= 5000


def test_technician_cannot_access_admin_attendance_list(tech_token, client):
    res = client.get("/attendance/", headers=_auth_header(tech_token))
    assert res.status_code == 403
    assert "insufficient permissions" in res.json()["detail"].lower()


def test_technician_cannot_create_staff(tech_token, client):
    res = client.post(
        "/staff/",
        json={
            "name": "Unauthorized Staff",
            "phone_number": "+91 9333333333",
        },
        headers=_auth_header(tech_token),
    )
    assert res.status_code == 403
    assert "insufficient permissions" in res.json()["detail"].lower()


def test_unauthenticated_cannot_access_jobs_staff_payroll(client):
    jobs_res = client.get("/jobs/")
    staff_res = client.get("/staff/")
    payroll_res = client.get("/staff/payroll/summary", params={"month": date.today().strftime("%Y-%m")})

    assert jobs_res.status_code in (401, 403)
    assert staff_res.status_code in (401, 403)
    assert payroll_res.status_code in (401, 403)


def test_invalid_ids_return_proper_errors(admin_token, tech_token, client):
    # Invalid job id for admin read
    job_res = client.get("/jobs/JOB-DOES-NOT-EXIST", headers=_auth_header(admin_token))
    assert job_res.status_code == 404
    assert "not found" in job_res.json()["detail"].lower()

    # Invalid attendance id for technician checkout
    checkout_res = client.post(
        "/attendance/checkout",
        json={
            "attendance_id": "ATT-INVALID-9999",
            "latitude": 9.9,
            "longitude": 76.2,
            "remarks": "Invalid id test",
        },
        headers=_auth_header(tech_token),
    )
    assert checkout_res.status_code == 404
    assert "not found" in checkout_res.json()["detail"].lower()

    # Invalid leave id for admin decision
    leave_res = client.patch(
        "/leaves/LEV-INVALID999/decision",
        json={"decision": "approved"},
        headers=_auth_header(admin_token),
    )
    assert leave_res.status_code == 404
    assert "not found" in leave_res.json()["detail"].lower()

    # Invalid user id delete
    user_res = client.delete("/users/USR-INVALID999", headers=_auth_header(admin_token))
    assert user_res.status_code == 404
    assert "not found" in user_res.json()["detail"].lower()
