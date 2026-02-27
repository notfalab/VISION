"""Pydantic schemas for Asset endpoints."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict

from backend.app.models.asset import MarketType


class AssetBase(BaseModel):
    symbol: str
    name: str
    market_type: MarketType
    exchange: str | None = None
    base_currency: str | None = None
    quote_currency: str | None = None
    tick_size: str | None = None
    config: dict | None = None
    description: str | None = None


class AssetCreate(AssetBase):
    pass


class AssetUpdate(BaseModel):
    name: str | None = None
    is_active: bool | None = None
    config: dict | None = None
    description: str | None = None


class AssetResponse(AssetBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    is_active: bool
    created_at: datetime
    updated_at: datetime
