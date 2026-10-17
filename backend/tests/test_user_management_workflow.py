"""Isolated account management tests: no real database or credentials."""
import asyncio
from copy import deepcopy
from types import SimpleNamespace

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from fastapi.security import HTTPAuthorizationCredentials
from app.routers import users
from app.auth import utils
from app.models.user import UserUpdate, PasswordReset


class Cursor:
    def __init__(self, rows):
        self.rows = rows

    def sort(self, field, direction):
        self.rows.sort(key=lambda row: row.get(field, ''), reverse=direction == -1)
        return self

    async def to_list(self, limit):
        return deepcopy(self.rows[:limit])


class Collection:
    def __init__(self, rows=()):
        self.rows = list(deepcopy(rows))

    def find(self, query, projection=None):
        return Cursor([{k: v for k, v in row.items() if not projection or projection.get(k) != 0} for row in self.rows if all(row.get(k) == v for k, v in query.items())])

    async def find_one(self, query, projection=None):
        return next((deepcopy(row) for row in self.rows if all(row.get(k) == v for k, v in query.items())), None)

    async def insert_one(self, row):
        self.rows.append(deepcopy(row))

    async def find_one_and_update(self, query, change, **kwargs):
        for row in self.rows:
            if all(row.get(k) == v for k, v in query.items()):
                row.update(change.get('$set', {}))
                for field, amount in change.get('$inc', {}).items():
                    row[field] = row.get(field, 0) + amount
                return deepcopy(row)
        return None

    async def update_many(self, query, change):
        for row in self.rows:
            if all(row.get(k) == v for k, v in query.items()):
                row.update(change.get('$set', {}))


def database(monkeypatch):
    account = {'user_id': 'U1', 'username': 'account', 'role': 'technician', 'status': 'active', 'created_at': '2026-10-17', 'staff_id': 'S1', 'token_version': 0}
    admin = {**account, 'user_id': 'ADMIN', 'username': 'admin', 'role': 'admin'}
    db = SimpleNamespace(users=Collection([account, admin]), staff=Collection([{'staff_id': 'S1'}]), push_tokens=Collection([{'user_id': 'U1', 'status': 'active'}]), user_audit=Collection())
    monkeypatch.setattr(users, 'get_db', lambda: db)
    monkeypatch.setattr(utils, 'get_db', lambda: db)
    return db, admin


def test_staff_unlink_and_self_lockout_guards(monkeypatch):
    async def run():
        db, admin = database(monkeypatch)
        result = await users.update_user('U1', UserUpdate(staff_id=None, role='manager'), admin)
        assert result['staff_id'] is None and result['role'] == 'manager'
        assert db.users.rows[0]['token_version'] == 1
        assert db.push_tokens.rows[0]['status'] == 'inactive'
        for data in [UserUpdate(role='technician'), UserUpdate(status='inactive')]:
            with pytest.raises(HTTPException) as exc:
                await users.update_user('ADMIN', data, admin)
            assert exc.value.status_code == 400
        with pytest.raises(HTTPException):
            await users.deactivate_user('ADMIN', admin)
        with pytest.raises(HTTPException):
            await users.update_user('U1', UserUpdate(staff_id='missing'), admin)
        with pytest.raises(HTTPException):
            await users.update_user('U1', UserUpdate(role=None), admin)
        assert db.user_audit.rows[0]['fields'] == ['role', 'staff_id']
    asyncio.run(run())


def test_revocation_invalidates_existing_access_tokens(monkeypatch):
    async def run():
        db, admin = database(monkeypatch)
        token = utils.create_access_token({'sub': 'U1', 'token_use': 'access', 'token_version': 0})
        credentials = HTTPAuthorizationCredentials(scheme='Bearer', credentials=token)
        assert (await utils.get_current_user(credentials))['user_id'] == 'U1'
        await users.revoke_sessions('U1', admin)
        with pytest.raises(HTTPException) as exc:
            await utils.get_current_user(credentials)
        assert exc.value.status_code == 401
        assert db.push_tokens.rows[0]['status'] == 'inactive'
        assert db.user_audit.rows[0]['action'] == 'sessions_revoked'
        with pytest.raises(HTTPException):
            await users.revoke_sessions('missing', admin)
    asyncio.run(run())


def test_password_reset_and_audit_redaction(monkeypatch):
    async def run():
        db, admin = database(monkeypatch)
        password = 'Test-only-password-123'
        await users.reset_password('U1', PasswordReset(new_password=password), admin)
        assert utils.verify_password(password, db.users.rows[0]['password_hash'])
        assert db.users.rows[0]['token_version'] == 1
        logs = await users.user_audit_logs(100, admin)
        assert logs[0]['action'] == 'password_reset'
        assert password not in str(logs) and 'password_hash' not in str(logs)
    asyncio.run(run())


def test_new_actions_admin_only_and_password_payload_validation(monkeypatch):
    database(monkeypatch)
    app = FastAPI(); app.include_router(users.router)
    app.dependency_overrides[utils.get_current_user] = lambda: {'user_id': 'TECH', 'role': 'technician'}
    with TestClient(app) as client:
        assert client.get('/users/audit-logs').status_code == 403
        assert client.post('/users/U1/revoke-sessions').status_code == 403
        assert client.put('/users/U1/reset-password', json={'new_password': 'short'}).status_code == 403
    app.dependency_overrides[utils.get_current_user] = lambda: {'user_id': 'ADMIN', 'role': 'admin'}
    with TestClient(app) as client:
        for value in ['short', 123, 'x' * 73, '\u20ac' * 25]:
            assert client.put('/users/U1/reset-password', json={'new_password': value}).status_code == 422
