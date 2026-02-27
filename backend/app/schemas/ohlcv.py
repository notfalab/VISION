"""Pydantic schemas for OHLCV data."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class OHLCVBase(BaseModel):
    timestamp: datetime
    open: float
    high: float
    low: float
    close: float
    volume: float
    tick_volume: float | None = None
    spread: float | None = None
    open_interest: float | None = None


class OHLCVResponse(OHLCVBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    asset_id: int
    timeframe: str


class OHLCVQuery(BaseModel):
    symbol: str
    timeframe: str = "1h"
    limit: int = 500
    start: datetime | None = None
    end: datetime | None = None
