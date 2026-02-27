"""Pydantic schemas for alerts."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class AlertCreate(BaseModel):
    asset_id: int
    name: str
    condition: dict
    channels: list[str] = ["websocket"]
    cooldown_minutes: int = 60
    max_triggers_per_day: int = 10
    is_repeating: bool = True


class AlertUpdate(BaseModel):
    name: str | None = None
    condition: dict | None = None
    channels: list[str] | None = None
    status: str | None = None
    cooldown_minutes: int | None = None


class AlertResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    asset_id: int
    name: str
    status: str
    condition: dict
    channels: list
    cooldown_minutes: int
    trigger_count: int
    last_triggered_at: datetime | None
    created_at: datetime


class AlertHistoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    alert_id: int
    channel: str
    message: str
    triggered_at: datetime
    acknowledged_at: datetime | None
