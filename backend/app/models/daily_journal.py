"""Daily journal — aggregated daily trading simulation stats."""

from datetime import date, datetime

from sqlalchemy import (
    Date,
    DateTime,
    Float,
    Index,
    Integer,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from backend.app.database import Base


class DailyJournal(Base):
    """
    One row per day summarizing the simulation's trading activity.
    Auto-generated at end of day (22:00 UTC) by the simulator engine.
    """

    __tablename__ = "daily_journal"
    __table_args__ = (
        Index("ix_daily_journal_date", "date", unique=True),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    date: Mapped[date] = mapped_column(Date, nullable=False, unique=True)

    # ---- Counts ----
    total_trades: Mapped[int] = mapped_column(Integer, default=0)
    wins: Mapped[int] = mapped_column(Integer, default=0)
    losses: Mapped[int] = mapped_column(Integer, default=0)
    expired: Mapped[int] = mapped_column(Integer, default=0)

    # ---- Performance ----
    win_rate: Mapped[float] = mapped_column(Float, default=0.0)
    total_pnl: Mapped[float] = mapped_column(Float, default=0.0)
    best_trade_pnl: Mapped[float] = mapped_column(Float, default=0.0)
    worst_trade_pnl: Mapped[float] = mapped_column(Float, default=0.0)
    avg_confidence: Mapped[float] = mapped_column(Float, default=0.0)
    avg_rr: Mapped[float] = mapped_column(Float, default=0.0)

    # ---- Context ----
    symbols_traded: Mapped[list | None] = mapped_column(JSONB, default=list)
    regime_breakdown: Mapped[dict | None] = mapped_column(JSONB, default=dict)
    learning_version: Mapped[int] = mapped_column(Integer, default=1)
    notes: Mapped[str | None] = mapped_column(Text)

    # ---- Timestamp ----
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    def __repr__(self) -> str:
        return (
            f"<DailyJournal {self.date} "
            f"trades={self.total_trades} wr={self.win_rate:.0%} "
            f"pnl={self.total_pnl:+.2f}>"
        )
