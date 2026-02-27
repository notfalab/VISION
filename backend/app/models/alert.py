"""Alert rules and history — configurable threshold-based alert system."""

import enum
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.database import Base


class AlertChannel(str, enum.Enum):
    WEBSOCKET = "websocket"
    EMAIL = "email"
    SMS = "sms"
    PUSH = "push"
    WEBHOOK = "webhook"


class AlertStatus(str, enum.Enum):
    ACTIVE = "active"
    PAUSED = "paused"
    TRIGGERED = "triggered"
    EXPIRED = "expired"


class Alert(Base):
    __tablename__ = "alerts"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    asset_id: Mapped[int] = mapped_column(ForeignKey("assets.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    status: Mapped[AlertStatus] = mapped_column(
        Enum(AlertStatus), default=AlertStatus.ACTIVE
    )

    # Condition: {"indicator": "volume_spike", "operator": ">", "threshold": 2.5, "timeframe": "1h"}
    condition: Mapped[dict] = mapped_column(JSONB, nullable=False)
    channels: Mapped[list] = mapped_column(JSONB, default=["websocket"])

    # Throttling
    cooldown_minutes: Mapped[int] = mapped_column(Integer, default=60)
    max_triggers_per_day: Mapped[int] = mapped_column(Integer, default=10)
    is_repeating: Mapped[bool] = mapped_column(Boolean, default=True)

    last_triggered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    trigger_count: Mapped[int] = mapped_column(Integer, default=0)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    asset: Mapped["Asset"] = relationship(back_populates="alerts")  # noqa: F821

    def __repr__(self) -> str:
        return f"<Alert '{self.name}' asset={self.asset_id} status={self.status.value}>"


class AlertHistory(Base):
    __tablename__ = "alert_history"

    id: Mapped[int] = mapped_column(primary_key=True)
    alert_id: Mapped[int] = mapped_column(ForeignKey("alerts.id"), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    asset_id: Mapped[int] = mapped_column(ForeignKey("assets.id"), nullable=False)

    channel: Mapped[AlertChannel] = mapped_column(Enum(AlertChannel), nullable=False)
    message: Mapped[str] = mapped_column(String(1000), nullable=False)
    snapshot: Mapped[dict | None] = mapped_column(JSONB)

    triggered_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
