"""Scalper signal — generated trade signals with outcome tracking and loss learning."""

import enum
from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from backend.app.database import Base


class SignalDirection(str, enum.Enum):
    LONG = "long"
    SHORT = "short"


class SignalStatus(str, enum.Enum):
    PENDING = "pending"      # Generated, waiting for price to hit entry
    ACTIVE = "active"        # Entry triggered, monitoring SL/TP
    WIN = "win"              # Take profit hit
    LOSS = "loss"            # Stop loss hit
    EXPIRED = "expired"      # Never triggered within expiry window
    CANCELLED = "cancelled"  # Manually cancelled


class ScalperSignal(Base):
    """
    A single scalper signal with entry/SL/TP levels, confidence scoring,
    outcome tracking, and loss learning analysis.
    """

    __tablename__ = "scalper_signals"
    __table_args__ = (
        Index("ix_signal_symbol_tf", "symbol", "timeframe"),
        Index("ix_signal_status", "status"),
        Index("ix_signal_generated", "generated_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    symbol: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    timeframe: Mapped[str] = mapped_column(String(10), nullable=False)  # 5m, 15m, 30m

    direction: Mapped[SignalDirection] = mapped_column(
        Enum(SignalDirection), nullable=False
    )
    status: Mapped[SignalStatus] = mapped_column(
        Enum(SignalStatus), default=SignalStatus.PENDING
    )

    # ---- Entry / Exit Levels ----
    entry_price: Mapped[float] = mapped_column(Float, nullable=False)
    stop_loss: Mapped[float] = mapped_column(Float, nullable=False)
    take_profit: Mapped[float] = mapped_column(Float, nullable=False)
    risk_reward_ratio: Mapped[float] = mapped_column(Float, nullable=False)

    # ---- Signal Quality ----
    confidence: Mapped[float] = mapped_column(Float, nullable=False)  # 0-1
    composite_score: Mapped[float] = mapped_column(Float, nullable=False)  # 0-100
    ml_confidence: Mapped[float | None] = mapped_column(Float)  # ML model confidence
    regime_at_signal: Mapped[str | None] = mapped_column(String(50))

    # ---- Analysis Snapshots (JSONB) ----
    signal_reasons: Mapped[dict | None] = mapped_column(JSONB, default=dict)
    # Example: {"bullish_indicators": ["macd_cross", "rsi_oversold"], "confluence": 3}
    indicator_snapshot: Mapped[dict | None] = mapped_column(JSONB, default=dict)
    # Example: {"rsi": 32.5, "macd_hist": 0.12, "atr": 4.5, "regime": "trending_up"}

    # ---- Outcome Tracking ----
    outcome_pnl: Mapped[float | None] = mapped_column(Float)
    outcome_pnl_pct: Mapped[float | None] = mapped_column(Float)
    max_favorable: Mapped[float | None] = mapped_column(Float)  # MFE
    max_adverse: Mapped[float | None] = mapped_column(Float)  # MAE
    exit_price: Mapped[float | None] = mapped_column(Float)

    # ---- Loss Learning ----
    loss_category: Mapped[str | None] = mapped_column(String(50))
    # Categories: false_breakout, regime_mismatch, low_confluence,
    #            overextended, weak_volume, against_trend, news_event
    loss_analysis: Mapped[dict | None] = mapped_column(JSONB)
    # Example: {"category": "false_breakout", "detail": "...", "indicators_at_loss": {...}}
    loss_pattern_id: Mapped[str | None] = mapped_column(String(100))

    # ---- Multi-timeframe Confluence ----
    mtf_confluence: Mapped[bool] = mapped_column(Boolean, default=False)
    # True if multiple timeframes agree on direction
    agreeing_timeframes: Mapped[list | None] = mapped_column(JSONB, default=list)
    # Example: ["5m", "15m"]

    # ---- Timestamps ----
    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    triggered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    def __repr__(self) -> str:
        return (
            f"<ScalperSignal {self.direction.value} {self.symbol} "
            f"@{self.entry_price} conf={self.confidence:.0%} "
            f"status={self.status.value}>"
        )
