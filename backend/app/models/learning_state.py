"""Learning state — adaptive parameters for the signal simulator."""

from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    Index,
    Integer,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from backend.app.database import Base

# Default indicator weights (same as SCALPER_WEIGHTS in signal_engine.py)
DEFAULT_WEIGHTS = {
    "moving_averages": 2.0,
    "macd": 2.0,
    "rsi": 1.5,
    "stochastic_rsi": 1.5,
    "bollinger_bands": 1.0,
    "atr": 0.5,
    "volume_spike": 2.0,
    "obv": 1.0,
    "ad_line": 0.75,
    "smart_money": 2.5,
    "key_levels": 2.0,
    "session_analysis": 0.75,
    "candle_patterns": 1.5,
}

DEFAULT_MIN_CONFIDENCE = 0.65
DEFAULT_MIN_SCORE = 65
DEFAULT_MIN_CONFLUENCE = 6


class LearningState(Base):
    """
    Versioned learning parameters for the signal simulator.
    The engine creates a new version after each adjustment.
    Only one row has is_active=True at any time.
    """

    __tablename__ = "learning_state"
    __table_args__ = (
        Index("ix_learning_version", "version", unique=True),
        Index("ix_learning_active", "is_active"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, unique=True)

    # ---- Thresholds ----
    min_confidence: Mapped[float] = mapped_column(Float, default=DEFAULT_MIN_CONFIDENCE)
    min_composite_score: Mapped[float] = mapped_column(Float, default=DEFAULT_MIN_SCORE)
    min_confluence: Mapped[int] = mapped_column(Integer, default=DEFAULT_MIN_CONFLUENCE)

    # ---- Weights & Features ----
    indicator_weights: Mapped[dict] = mapped_column(JSONB, default=lambda: dict(DEFAULT_WEIGHTS))
    feature_importance: Mapped[dict | None] = mapped_column(JSONB, default=dict)
    skip_regimes: Mapped[list | None] = mapped_column(JSONB, default=list)

    # ---- Performance Snapshot ----
    rolling_win_rate_50: Mapped[float] = mapped_column(Float, default=0.0)
    rolling_win_rate_200: Mapped[float] = mapped_column(Float, default=0.0)
    total_trades: Mapped[int] = mapped_column(Integer, default=0)
    total_wins: Mapped[int] = mapped_column(Integer, default=0)
    total_losses: Mapped[int] = mapped_column(Integer, default=0)

    # ---- Audit ----
    adjustments_log: Mapped[list | None] = mapped_column(JSONB, default=list)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    # ---- Timestamp ----
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    def __repr__(self) -> str:
        return (
            f"<LearningState v{self.version} "
            f"conf>={self.min_confidence:.2f} score>={self.min_composite_score} "
            f"wr50={self.rolling_win_rate_50:.0%} active={self.is_active}>"
        )
