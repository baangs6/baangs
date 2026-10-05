import asyncio
from types import SimpleNamespace

from app.mock_database import MockCollection
from app.routers import dashboard, billing


def report_db():
    data = {name: [] for name in ['staff', 'jobs', 'billing', 'attendance', 'daily_updates', 'attendance_allowances', 'users', 'job_inventory_usage']}
    data['staff'] = [
        {'staff_id': 'A', 'name': 'Alpha', 'is_active': True},
        {'staff_id': 'B', 'name': 'Beta', 'is_active': False},
    ]
    for index, staff_id, minutes in [(1, 'A', 120), (2, 'B', 60), (3, 'B', 60)]:
        data['jobs'].append({
            'job_id': str(index), 'assigned_staff_id': staff_id, 'customer_id': 'C',
            'work_type': 'complaint', 'status': 'complete', 'scheduled_date': '2026-08-10',
            'service_request_date': '2026-09-01', 'work_started_at': '2026-09-05T10:00:00',
            'work_ended_at': f'2026-09-05T{10 + minutes // 60}:00:00+05:30',
        })
    data['jobs'].append({'job_id': '4', 'assigned_staff_id': 'A', 'work_type': 'installation', 'status': 'complete', 'scheduled_date': '2026-08-01', 'service_request_date': '2026-08-01'})
    data['billing'] = [{'billing_id': 'B1', 'job_id': '4', 'complete_date': '2026-09-03', 'invoice_amount': 100, 'expense': 10, 'material_amount': 20}]
    data['attendance'] = [{'staff_id': 'A', 'date': '2026-09-05', 'checkin_time': '2026-09-05T09:00:00', 'checkout_time': '2026-09-05T17:00:00+05:30'}] * 2
    data['daily_updates'] = [{'assigned_staff_id': 'A', 'job_id': 'unrelated', 'update_time': '2026-09-05T14:00:00', 'visit_notes': 'Notes'}]
    db = SimpleNamespace(data=data)
    for name in data:
        setattr(db, name, MockCollection(db, name))
    return db


def test_completed_totals_match_detail_without_invoices(monkeypatch):
    monkeypatch.setattr(dashboard, 'get_db', report_db)
    result = asyncio.run(dashboard.technician_performance_report('2026-09-01', '2026-09-30', None, None))
    assert result['total_service_completed'] == 3
    assert result['total_installation_completed'] == 1
    assert result['average_service_completion_days'] == 4
    rows = asyncio.run(dashboard.technician_performance_deep_dive('2026-09-01', '2026-09-30', 'A', None))
    assert len(rows) == 1
    assert rows[0]['attendance_days'] == 1
    assert rows[0]['working_hours'] == 8


def test_quality_averages_weight_jobs_and_ignore_unrelated_reports(monkeypatch):
    monkeypatch.setattr(dashboard, 'get_db', report_db)
    result = asyncio.run(dashboard.service_quality_report('2026-09-01', '2026-09-30', None, None))
    assert result['summary']['average_repair_hours'] == 1.33
    assert result['summary']['service_report_completion_pct'] == 0
    assert result['summary']['attendance_discipline_pct'] == 100
    assert result['summary']['repeat_complaint_pct'] == 66.7


def test_financial_report_filters_by_staff_id(monkeypatch):
    monkeypatch.setattr(billing, 'get_db', report_db)
    rows = asyncio.run(billing.list_billing(None, '2026-09-01', '2026-09-30', 'A', None))
    assert len(rows) == 1
    assert rows[0]['profit'] == 70
    assert asyncio.run(billing.list_billing(None, '2026-09-01', '2026-09-30', 'B', None)) == []


def test_late_pm_is_counted_against_scheduled_month(monkeypatch):
    db = report_db()
    db.data['jobs'].append({'job_id': 'PM', 'assigned_staff_id': 'A', 'work_type': 'maintenance', 'status': 'complete', 'scheduled_date': '2026-09-30', 'work_ended_at': '2026-10-01T11:00:00+05:30'})
    monkeypatch.setattr(dashboard, 'get_db', lambda: db)
    result = asyncio.run(dashboard.service_quality_report('2026-09-01', '2026-09-30', 'A', None))
    assert result['technicians'][0]['pm_scheduled'] == 1
    assert result['summary']['pm_on_time_pct'] == 0


def test_report_date_uses_indian_timezone():
    assert dashboard._date_in_range('2026-08-31T20:00:00Z', '2026-09-01', '2026-09-01')
    assert not dashboard._date_in_range('2026-08-31T20:00:00Z', '2026-08-31', '2026-08-31')
