import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from app.main import app


@pytest.mark.parametrize('origin,allowed', [
    ('https://baangs.site', True),
    ('https://www.baangs.site', True),
    ('https://baangs-web.onrender.com', True),
    ('http://localhost:5175', True),
    ('http://127.0.0.1:5173', True),
    ('http://127.0.0.1:5174', True),
    ('http://127.0.0.1:5175', True),
    ('https://untrusted.example', False),
])
def test_login_preflight(origin, allowed):
    # Reuse production middleware without starting database/reminder services.
    isolated = FastAPI(middleware=app.user_middleware)
    with TestClient(isolated) as client:
        response = client.options('/auth/login', headers={
            'Origin': origin,
            'Access-Control-Request-Method': 'POST',
            'Access-Control-Request-Headers': 'content-type,authorization',
        })
    assert response.status_code == (200 if allowed else 400)
    assert response.headers.get('access-control-allow-origin') == (origin if allowed else None)
