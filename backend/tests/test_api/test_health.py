"""Test health and basic API endpoints."""

import pytest
from httpx import ASGITransport, AsyncClient

from backend.app.main import create_app


@pytest.fixture
def app():
    return create_app()


@pytest.mark.asyncio
async def test_health_endpoint(app):
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["app"] == "vision"
    assert data["version"] == "0.1.0"


@pytest.mark.asyncio
async def test_docs_available(app):
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.get("/docs")
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_openapi_schema_has_endpoints(app):
    """Verify all expected API routes are registered."""
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.get("/openapi.json")
    assert response.status_code == 200
    schema = response.json()
    paths = list(schema["paths"].keys())
    # Core endpoints exist
    assert "/health" in paths
    assert "/api/v1/assets/" in paths
    assert "/api/v1/prices/{symbol}" in paths
    assert "/api/v1/indicators/{symbol}" in paths
    assert "/api/v1/institutional/cot/{symbol}" in paths
    assert "/api/v1/alerts/" in paths
    assert "/api/v1/auth/login" in paths
    assert "/api/v1/auth/register" in paths
