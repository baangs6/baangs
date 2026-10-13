import asyncio
from datetime import date
from io import BytesIO

import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from app.mock_database import MockCollection
from app.routers import quotations as q


class Database:
    def __init__(self):
        self.data = {'quotations': [], 'customers': [{'customer_id': 'C1', 'customer_name':'Example Customer',
            'phone_number':'8330033280', 'customer_key':'ph_8330033280'}], 'counters': [], 'jobs': []}
        for name in self.data:
            setattr(self, name, MockCollection(self, name))

    def save(self):
        pass


def quote(**changes):
    return q.Quote(**(dict(customer_name='Example Customer', phone_number='8330033280',
        address='Thalassery', quote_date=date(2026, 10, 12), customer_id='C1',
        items=[dict(name='Camera', quantity=2, unit_price=1000, discount_percent=10, tax_percent=18)]) | changes))


def test_totals_tax_after_discount_and_validity():
    row = q.calculate(quote())
    assert row['subtotal'] == 2000
    assert row['discount_amount'] == 200
    assert row['tax_amount'] == 324
    assert row['total'] == 2124
    assert row['valid_until'] == '2026-10-22'


def test_rounding():
    row = q.calculate(quote(items=[dict(name='Cable', quantity=1, unit_price='100.50')], round_off=True))
    assert row['total'] == 101
    assert row['round_off_amount'] == .5


def test_customer_followup_shared_without_invalidating_pdf(monkeypatch):
    db = Database()
    monkeypatch.setattr(q, 'get_db', lambda: db)
    async def run():
        first = await q.create_quote(quote(), {'username': 'admin'})
        second = await q.create_quote(quote(), {'username': 'admin'})
        other = await q.create_quote(quote(customer_id=None, customer_name='Other'), {'username': 'admin'})
        result = await q.save_customer_followup(first['quote_id'],
            q.CustomerFollowup(customer_remark='Call about installation', followup_date=date(2026, 10, 15)), {'user_id': 'U1'})
        assert {r['quote_id'] for r in result} == {first['quote_id'], second['quote_id']}
        assert all(r['customer_remark'] == 'Call about installation' and r['revision'] == 1 for r in result)
        assert all(r['followup_date'] == '2026-10-15' and r['followup_owner'] == 'U1' for r in result)
        assert 'customer_remark' not in await q.find_quote(other['quote_id'])
    asyncio.run(run())


def test_followup_notification_once_per_customer(monkeypatch):
    from app.utils import job_reminders as reminders
    db = Database()
    sent = []
    async def notify(*args):
        sent.append(args)
    monkeypatch.setattr(reminders, 'notify_users', notify)
    db.data['quotations'].extend([dict(quote_id=f'Q{i}', customer_id='C1', customer_name='Example',
        phone_number='1234567890', followup_date='2020-01-01', followup_owner='U1',
        followup_done=False, followup_reminded=False) for i in range(2)])
    async def run():
        await reminders.send_quotation_followups(db)
        await reminders.send_quotation_followups(db)
        assert len(sent) == 1
        assert sent[0][1] == ['U1']
    asyncio.run(run())


def test_numbering_financial_year_and_sequence(monkeypatch):
    monkeypatch.setattr(q, 'get_db', lambda: db)
    db = Database()
    async def run():
        assert await q.next_estimation_number(date(2026, 10, 12)) == 'CE/2627/001'
        assert await q.next_estimation_number(date(2027, 3, 31)) == 'CE/2627/002'
        assert await q.next_estimation_number(date(2027, 4, 1)) == 'CE/2728/001'
    asyncio.run(run())


def test_customer_letters_share_base_and_preserve_previous_quotes(monkeypatch):
    db = Database()
    monkeypatch.setattr(q, 'get_db', lambda: db)
    async def run():
        first = await q.create_quote(quote(), {'username':'admin'})
        second = await q.create_quote(quote(), {'username':'admin'})
        other = await q.create_quote(quote(customer_id=None, customer_name='Other', phone_number='8888888888'), {'username':'admin'})
        assert first['estimation_no'] == 'CE/2627/001A'
        assert second['estimation_no'] == 'CE/2627/001B'
        assert other['estimation_no'] == 'CE/2627/002A'
        edited = await q.update_quote(first['quote_id'], quote(status='sent'), revision=1)
        assert edited['estimation_no'] == first['estimation_no']
        assert len(await q.list_quotes()) == 3
        assert q.letter_suffix(26) == 'Z'
        assert q.letter_suffix(27) == 'AA'
    asyncio.run(run())


def test_move_customer_preserves_history_and_is_idempotent(monkeypatch):
    from app.routers import customers
    db = Database()
    monkeypatch.setattr(q, 'get_db', lambda: db)
    monkeypatch.setattr(customers, 'get_db', lambda: db)
    async def run():
        user = {'username':'admin', 'role':'admin'}
        first = await q.create_quote(quote(customer_id=None, customer_name='New Buyer', phone_number='9999999999'), user)
        second = await q.create_quote(quote(customer_id=None, customer_name='New Buyer', phone_number='9999999999'), user)
        other = await q.create_quote(quote(customer_id=None, customer_name='Other Buyer', phone_number='8888888888'), user)
        assert len(db.data['customers']) == 1
        result = await q.move_to_customer(first['quote_id'], user)
        again = await q.move_to_customer(first['quote_id'], user)
        assert result['customer']['customer_id'] == again['customer']['customer_id']
        assert len(db.data['customers']) == 2
        assert db.data['jobs'] == []
        history = await q.customer_history(result['customer']['customer_id'])
        assert {r['quote_id'] for r in history} == {first['quote_id'], second['quote_id']}
        assert (await q.find_quote(other['quote_id']))['customer_id'] is None
    asyncio.run(run())


def test_customer_history_matches_manual_quotes_but_not_other_people(monkeypatch):
    db = Database()
    monkeypatch.setattr(q, 'get_db', lambda: db)
    async def run():
        user = {'username':'admin'}
        first = await q.create_quote(quote(), user)
        second = await q.create_quote(quote(customer_id=None, phone_number='83300 33280'), user)
        await q.create_quote(quote(customer_id=None, customer_name='Different Name'), user)
        history = await q.customer_history('C1')
        assert {r['quote_id'] for r in history} == {first['quote_id'], second['quote_id']}
    asyncio.run(run())


@pytest.mark.parametrize('changes', [
    {'items': []}, {'validity_days': 0}, {'status': 'converted'},
    {'items': [dict(name='Camera', quantity=-1, unit_price=2)]},
    {'items': [dict(name='Camera', quantity=1, unit_price='NaN')]},
    {'items': [dict(name='Camera', quantity=1, unit_price=2, discount_percent=101)]},
])
def test_validation(changes):
    with pytest.raises(ValidationError):
        quote(**changes)


def test_blank_names():
    with pytest.raises(HTTPException):
        q.calculate(quote(customer_name='  '))


def test_crud_and_stale_updates(monkeypatch):
    db = Database()
    monkeypatch.setattr(q, 'get_db', lambda: db)
    async def run():
        row = await q.create_quote(quote(), {'username': 'admin', 'full_name': 'Sahil'})
        assert row['prepared_by'] == 'Sahil'
        assert row['estimation_no'] == 'CE/2627/001A'
        assert '_id' not in row
        updated = await q.update_quote(row['quote_id'], quote(status='accepted'), revision=1)
        assert updated['revision'] == 2
        assert updated['estimation_no'] == row['estimation_no']
        assert updated['status'] == 'accepted'
        with pytest.raises(HTTPException) as error:
            await q.update_quote(row['quote_id'], quote(), revision=1)
        assert error.value.status_code == 409
        assert len(await q.list_quotes()) == 1
        with pytest.raises(HTTPException):
            await q.create_quote(quote(customer_id='missing'), {'username':'admin'})
    asyncio.run(run())


def test_shared_link_scope_and_revision(monkeypatch):
    db = Database()
    monkeypatch.setattr(q, 'get_db', lambda: db)
    async def run():
        row = await q.create_quote(quote(), {'username':'admin'})
        class Request:
            def url_for(self, name, quote_id):
                return f'https://api.example.com/quotations/{quote_id}/public.pdf'
        link = await q.share_link(row['quote_id'], Request())
        token = link['url'].split('?token=')[1]
        assert q.decode_token(token).get('sub') is None
        assert (await q.public_pdf(row['quote_id'], token)).media_type == 'application/pdf'
        await q.update_quote(row['quote_id'], quote(), revision=1)
        with pytest.raises(HTTPException) as error:
            await q.public_pdf(row['quote_id'], token)
        assert error.value.status_code == 403
        with pytest.raises(HTTPException):
            await q.public_pdf(row['quote_id'], q.create_access_token({'invoice_job_id':'J1'}))
    asyncio.run(run())


def test_pdf_wraps_long_items_and_terms():
    import pymupdf
    data = quote(items=[dict(name=f'Camera {i}', description='Detailed CCTV specification. '*10,
        quantity=1, unit_price=1456, tax_percent=18, warranty='2 years') for i in range(20)],
        terms='Terms & warranty <manufacturer>.\n' + 'Payment on completion. '*50)
    row = q.calculate(data) | {'quote_id':'QT-TEST', 'prepared_by':'Admin'}
    pdf = q.render_pdf(row)
    doc = pymupdf.open(stream=pdf, filetype='pdf')
    text = ''.join(page.get_text() for page in doc)
    assert len(doc) > 1
    assert 'Camera 19' in text
    assert 'Authorized signatory' in text
    assert 'Terms & warranty <manufacturer>' in text


def test_customer_pdf_hides_tax_but_includes_it_in_prices():
    import pymupdf
    row = q.calculate(quote()) | {'quote_id':'QT-INCLUSIVE', 'prepared_by':'Admin'}
    doc = pymupdf.open(stream=q.render_pdf(row), filetype='pdf')
    text = ''.join(page.get_text() for page in doc)
    assert 'Tax' not in text
    assert '18%' not in text
    assert '1,180' in text
    assert '2,124' in text
    assert 'Total discount' in text
    assert 'Rs 236' in text
    assert 'GSTIN' not in text
    assert 'paise' not in text
    assert row['tax_amount'] == 324


def test_customer_pdf_rounds_half_rupee_and_hides_gstin():
    import pymupdf
    row = q.calculate(quote(gstin='CUSTOMER-GSTIN', items=[dict(name='Camera', quantity=1, unit_price='2802.50')])) | {'quote_id':'QT-ROUND', 'prepared_by':'Admin'}
    doc = pymupdf.open(stream=q.render_pdf(row), filetype='pdf')
    text = ''.join(page.get_text() for page in doc)
    assert '2,803' in text
    assert '.50' not in text
    assert '.00' not in text
    assert 'GSTIN' not in text
    assert '32AATFB0134F1ZW' not in text


def test_api_permissions_and_pdf(monkeypatch):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from app.auth.utils import get_current_user
    db = Database()
    monkeypatch.setattr(q, 'get_db', lambda: db)
    app = FastAPI()
    app.include_router(q.router)
    user = {'username': 'admin', 'role': 'admin'}
    app.dependency_overrides[get_current_user] = lambda: user
    client = TestClient(app)
    body = quote().model_dump(mode='json')
    row = client.post('/quotations/', json=body)
    assert row.status_code == 200
    quote_id = row.json()['quote_id']
    assert client.get(f'/quotations/{quote_id}/quotation.pdf').content.startswith(b'%PDF')
    for role in ['technician', 'sales']:
        user['role'] = role
        assert client.get('/quotations/').status_code == 403
        assert client.post('/quotations/', json=body).status_code == 403
        assert client.post(f'/quotations/{quote_id}/share-link').status_code == 403
        assert client.get('/quotations/customer/C1/history').status_code == 403
        assert client.post(f'/quotations/{quote_id}/move-to-customer').status_code == 403
    user['role'] = 'manager'
    assert client.get('/quotations/').status_code == 200
    assert client.get('/quotations/customer/C1/history').status_code == 200
    assert client.post(f'/quotations/{quote_id}/move-to-customer').status_code == 403
