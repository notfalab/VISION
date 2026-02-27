"""Pydantic schemas for indicator data."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class IndicatorResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    indicator_type: str
    timeframe: str
    timestamp: datetime
    value: float
    secondary_value: float | None = None
    metadata_json: dict | None = None


class IndicatorQuery(BaseModel):
    symbol: str
    indicators: list[str] | None = None  # None = all
    timeframe: str = "1h"
    limit: int = 200


class DivergenceSignal(BaseModel):
    indicator: str
    divergence_type: str  # bullish, bearish, hidden_bullish, hidden_bearish
    strength: float
    price_direction: str
    indicator_direction: str
    timestamp: datetime


class SupplyDemandZone(BaseModel):
    zone_type: str  # supply or demand
    price_high: float
    price_low: float
    timeframe: str
    strength: float
    touch_count: int
    last_tested: datetime | None = None
