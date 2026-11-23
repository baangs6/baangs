from datetime import date, datetime, timedelta
from decimal import Decimal
from fastapi import APIRouter, Depends, Query
from ..auth.utils import require_admin
from ..database import get_db
from ..utils.timezone import IST, today_ist_str

router = APIRouter(prefix="/reports", tags=["Reports"])


def day(value):
    try:
        stamp = datetime.fromisoformat(str(value).replace('Z', '+00:00'))
        return (stamp.astimezone(IST) if stamp.tzinfo else stamp).date().isoformat()
    except (ValueError, TypeError):
        return ''


def build_report(jobs, bills, staff, updates, start, end):
    fields = ['jobs_completed', 'payments_received', 'bills_created', 'bills_sent', 'payment_pending', 'undated_collected', 'pending_unknown', 'completion_date_unknown', 'bill_date_unknown']
    rows = {}
    def row(staff_id):
        key = staff_id or 'unassigned'
        if key not in rows:
            rows[key] = {'staff_id': key, 'staff_name': names.get(key, key if staff_id else 'Unassigned'), **dict.fromkeys(fields, 0)}
        return rows[key]
    names = {s['staff_id']: s.get('name') or s.get('full_name') or s['staff_id'] for s in staff}
    for s in staff:
        row(s['staff_id'])
    by_job = {j['job_id']: j for j in jobs}
    completion = {}
    for update in updates:
        if update.get('status') == 'complete' and update.get('work_event') != 'visit_note':
            completed = day(update.get('update_time'))
            if completed: completion[update['job_id']] = max(completion.get(update['job_id'], ''), completed)
    for job in jobs:
        r = row(job.get('assigned_staff_id'))
        if job.get('status') == 'complete':
            completed = day(job.get('report_completed_at')) or day(job.get('work_ended_at')) or completion.get(job['job_id'], '')
            if not completed: r['completion_date_unknown'] += 1
            elif start <= completed <= end: r['jobs_completed'] += 1
    for bill in bills:
        r = row(by_job.get(bill['job_id'], {}).get('assigned_staff_id'))
        created = day(bill.get('report_created_at'))
        if not created: r['bill_date_unknown'] += 1
        elif start <= created <= end: r['bills_created'] += 1
        if start <= day(bill.get('report_sent_at')) <= end: r['bills_sent'] += 1
        history = bill.get('report_history', [])
        for entry in history:
            if start <= day(entry['at']) <= end:
                r['payments_received'] += Decimal(str(entry['payment_delta']))
        r['undated_collected'] += Decimal(str(bill.get('undated_collected', bill.get('collected_amount') or 0)))
        snapshots = [entry for entry in history if day(entry['at']) and day(entry['at']) <= end]
        if end >= today_ist_str():
            r['payment_pending'] += max(Decimal(0), Decimal(str(bill.get('invoice_amount') or 0)) - Decimal(str(bill.get('collected_amount') or 0)))
        elif snapshots:
            latest = max(enumerate(snapshots), key=lambda pair: (pair[1]['at'], pair[0]))[1]
            r['payment_pending'] += max(Decimal(0), Decimal(str(latest['invoice'])) - Decimal(str(latest['collected'])))
        elif not created or created <= end:
            r['pending_unknown'] += 1
    result = sorted(rows.values(), key=lambda r: r['staff_name'].lower())
    totals = {field: sum(r[field] for r in result) for field in fields}
    return {'date_from': start, 'date_to': end, 'technicians': result, 'totals': totals}


@router.get('/technicians')
async def technician_report(period: str = Query('daily', pattern='^(daily|weekly)$'), anchor: date = Query(None), user=Depends(require_admin)):
    selected = anchor or date.fromisoformat(today_ist_str())
    start = selected if period == 'daily' else selected - timedelta(days=selected.weekday())
    end = start if period == 'daily' else start + timedelta(days=6)
    db = get_db()
    # No per-technician queries; all totals are grouped by primary assignment only.
    jobs = await db.jobs.find({}).to_list(None)
    bills = await db.billing.find({}).to_list(None)
    staff = await db.staff.find({}).to_list(None)
    updates = await db.daily_updates.find({'status': 'complete'}).to_list(None)
    return build_report(jobs, bills, staff, updates, start.isoformat(), end.isoformat())
