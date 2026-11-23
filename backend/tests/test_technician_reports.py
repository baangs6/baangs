from app.routers.technician_reports import build_report, day
from app.utils import billing_history as history
from decimal import Decimal


def test_payment_history_tracks_deltas_without_redating_old_money(monkeypatch):
    monkeypatch.setattr(history, 'now_ist_str', lambda: '2026-11-23T10:00:00')
    old = {'invoice_amount': 1000, 'collected_amount': 200}
    values = history.billing_history(old, {**old, 'collected_amount': 350})
    assert values['undated_collected'] == 200
    assert values['report_created_at'] is None
    assert values['report_history'][0]['payment_delta'] == 150
    current = {**old, 'collected_amount': 350, **values}
    assert len(history.billing_history(current, current)['report_history']) == 1
    correction = history.billing_history(current, {**current, 'collected_amount': 300})
    assert correction['report_history'][-1]['payment_delta'] == -50


def test_primary_technician_only_and_historical_pending():
    jobs = [{'job_id': 'J', 'status': 'complete', 'assigned_staff_id': 'A', 'additional_staff_ids': ['B'], 'report_completed_at': '2026-11-23T12:00:00'}]
    bills = [{'job_id': 'J', 'invoice_amount': 1000, 'collected_amount': 700,
              'report_created_at': '2026-11-20T10:00:00', 'report_sent_at': '2026-11-23T10:00:00', 'undated_collected': 0,
              'report_history': [{'at': '2026-11-20T10:00:00', 'invoice': 1000, 'collected': 0, 'payment_delta': 0},
                                 {'at': '2026-11-23T10:00:00', 'invoice': 1000, 'collected': 300, 'payment_delta': 300},
                                 {'at': '2026-11-24T10:00:00', 'invoice': 1000, 'collected': 700, 'payment_delta': 400}]}]
    from unittest.mock import patch
    with patch('app.routers.technician_reports.today_ist_str', return_value='2026-11-25'):
        result = build_report(jobs, bills, [{'staff_id': 'A'}, {'staff_id': 'B'}], [], '2026-11-23', '2026-11-23')
    assert result['totals']['payments_received'] == Decimal(300)
    assert result['totals']['payment_pending'] == Decimal(700)
    assert result['totals']['bills_sent'] == 1
    assert result['totals']['jobs_completed'] == 1
    assert result['technicians'][1]['payments_received'] == 0
    assert day('2026-11-22T20:00:00Z') == '2026-11-23'


def test_legacy_records_are_not_assigned_fake_dates():
    from unittest.mock import patch
    with patch('app.routers.technician_reports.today_ist_str', return_value='2026-11-25'):
        report = build_report([{'job_id': 'J', 'status': 'complete'}], [{'job_id': 'J', 'invoice_amount': 100, 'collected_amount': 20}], [], [], '2026-11-23', '2026-11-23')
    assert report['totals']['payments_received'] == 0
    assert report['totals']['pending_unknown'] == 1
    assert report['totals']['completion_date_unknown'] == 1
    assert report['totals']['undated_collected'] == 20


def test_report_endpoint_is_admin_only_and_uses_monday_week(monkeypatch):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from app.routers import technician_reports as routes
    from app.auth.utils import get_current_user
    from types import SimpleNamespace
    class Collection:
        def find(self, query): return self
        async def to_list(self, limit): return []
    monkeypatch.setattr(routes, 'get_db', lambda: SimpleNamespace(jobs=Collection(), billing=Collection(), staff=Collection(), daily_updates=Collection()))
    app = FastAPI()
    app.include_router(routes.router)
    app.dependency_overrides[get_current_user] = lambda: {'role': 'technician', 'user_id': 'U'}
    with TestClient(app) as client:
        assert client.get('/reports/technicians').status_code == 403
        app.dependency_overrides[get_current_user] = lambda: {'role': 'admin', 'user_id': 'U'}
        response = client.get('/reports/technicians?period=weekly&anchor=2026-11-25')
        assert response.status_code == 200
        assert response.json()['date_from'] == '2026-11-23'
        assert response.json()['date_to'] == '2026-11-29'
        assert client.get('/reports/technicians?anchor=bad').status_code == 422
        assert client.get('/reports/technicians?period=monthly').status_code == 422


def test_mark_sent_requires_admin_and_is_confirmed_not_a_share_link(monkeypatch):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from app.routers import billing
    from app.auth.utils import get_current_user
    from types import SimpleNamespace
    from unittest.mock import AsyncMock
    collection = SimpleNamespace(update_one=AsyncMock(return_value=SimpleNamespace(matched_count=1)))
    monkeypatch.setattr(billing, 'get_db', lambda: SimpleNamespace(billing=collection))
    app = FastAPI()
    app.include_router(billing.router)
    app.dependency_overrides[get_current_user] = lambda: {'role': 'technician', 'user_id': 'U'}
    with TestClient(app) as client:
        assert client.post('/billing/B1/mark-sent').status_code == 403
        app.dependency_overrides[get_current_user] = lambda: {'role': 'admin', 'user_id': 'U'}
        assert client.post('/billing/B1/mark-sent').status_code == 200
    query, operation = collection.update_one.call_args.args
    assert query == {'billing_id': 'B1', 'report_sent_at': None}
    assert operation['$set']['report_sent_by'] == 'U'
