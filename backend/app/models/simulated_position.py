"""Simulated position — paper trading positions for signal learning engine."""

import enum
from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    Float,
    Index,
    Integer,
    String,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from backend.app.database import Base


class PositionDirection(str, enum.Enum):
    LONG = "long"
    SHORT = "short"


class PositionStatus(str, enum.Enum):
    OPEN = "open"
    WIN = "win"
    LOSS = "loss"
    EXPIRED = "expired"
    CANCELLED = "cancelled"


class SimulatedPosition(Base):
    """
    A paper-traded position opened by the signal simulator.
    Tracks full lifecycle: open → monitoring → closed (win/loss/expired).
    """

    __tablename__ = "simulated_positions"
    __table_args__ = (
        Index("ix_simpos_symbol", "symbol"),
        Index("ix_simpos_status", "status"),
        Index("ix_simpos_opened", "opened_at"),
        Index("ix_simpos_status_closed", "status", "closed_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    symbol: Mapped[str] = mapped_column(String(30), nullable=False)
    timeframe: Mapped[str] = mapped_column(String(10), nullable=False)

    direction: Mapped[PositionDirection] = mapped_column(
        Enum(PositionDirection), nullable=False
    )
    status: Mapped[PositionStatus] = mapped_column(
        Enum(PositionStatus), default=PositionStatus.OPEN
    )

    # ---- Entry / Exit Levels ----
    entry_price: Mapped[float] = mapped_column(Float, nullable=False)
    stop_loss: Mapped[float] = mapped_column(Float, nullable=False)
    take_profit: Mapped[float] = mapped_column(Float, nullable=False)
    exit_price: Mapped[float | None] = mapped_column(Float)
    risk_reward_ratio: Mapped[float] = mapped_column(Float, nullable=False)

    # ---- Signal Quality ----
    confidence: Mapped[float] = mapped_column(Float, nullable=False)
    composite_score: Mapped[float] = mapped_column(Float, nullable=False)
    ml_confidence: Mapped[float | None] = mapped_column(Float)
    regime: Mapped[str | None] = mapped_column(String(50))

    # ---- Analysis Snapshots ----
    signal_reasons: Mapped[dict | None] = mapped_column(JSONB, default=dict)
    indicator_snapshot: Mapped[dict | None] = mapped_column(JSONB, default=dict)

    # ---- Outcome ----
    pnl: Mapped[float | None] = mapped_column(Float)
    pnl_pct: Mapped[float | None] = mapped_column(Float)
    max_favorable: Mapped[float | None] = mapped_column(Float)
    max_adverse: Mapped[float | None] = mapped_column(Float)

    # ---- Loss Learning ----
    loss_category: Mapped[str | None] = mapped_column(String(50))
    loss_analysis: Mapped[dict | None] = mapped_column(JSONB)

    # ---- Context ----
    mtf_confluence: Mapped[bool] = mapped_column(Boolean, default=False)
    learning_version: Mapped[int] = mapped_column(Integer, default=1)

    # ---- Timestamps ----
    opened_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    def __repr__(self) -> str:
        return (
            f"<SimPos {self.direction.value} {self.symbol} "
            f"@{self.entry_price} conf={self.confidence:.0%} "
            f"status={self.status.value}>"
        )
