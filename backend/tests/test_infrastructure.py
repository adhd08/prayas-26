from unittest.mock import AsyncMock

import httpx
import pytest
from fastapi.testclient import TestClient

from app.config import Settings, get_settings
from app.main import app


@pytest.fixture
def client():
    app.dependency_overrides[get_settings] = lambda: Settings(
        _env_file=None,
        supabase_url="https://example.supabase.co",
        supabase_publishable_key="test-publishable-key",
    )
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()


def test_health_without_cloud_credentials(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_job_submission_requires_authentication(client):
    assert client.post("/v1/jobs", json={}).status_code == 401


def test_invalid_token_cannot_reach_job_handler(client, monkeypatch):
    monkeypatch.setattr(app.state.http, "get", AsyncMock(return_value=httpx.Response(401)))
    response = client.post("/v1/jobs", json={}, headers={"Authorization": "Bearer invalid"})
    assert response.status_code == 401


def test_verified_user_gets_explicit_unimplemented_response(client, monkeypatch):
    verify = AsyncMock(return_value=httpx.Response(200, json={"id": "test-user"}))
    monkeypatch.setattr(app.state.http, "get", verify)
    response = client.post("/v1/jobs", json={}, headers={"Authorization": "Bearer test-token"})
    verify.assert_awaited_once_with(
        "https://example.supabase.co/auth/v1/user",
        headers={"apikey": "test-publishable-key", "Authorization": "Bearer test-token"},
    )
    assert response.status_code == 501
    assert "not implemented" in response.json()["detail"]


def test_cors_allows_local_frontend_and_rejects_unknown_origin(client):
    headers = {"Origin": "http://localhost:3000", "Access-Control-Request-Method": "POST"}
    response = client.options("/v1/jobs", headers=headers)
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:3000"
    response = client.options("/v1/jobs", headers={**headers, "Origin": "https://untrusted.test"})
    assert "access-control-allow-origin" not in response.headers


def test_gis_and_solver_dependencies_import():
    import geopandas
    import networkx
    import osmnx
    import shapely
    import sklearn
    from ortools.sat.python import cp_model

    assert all((geopandas, networkx, osmnx, shapely, sklearn, cp_model))
