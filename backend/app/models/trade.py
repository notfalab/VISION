"""Trade journal — records trades for post-mortem analysis."""

import enum
from datetime import datetime

from sqlalchemy import DateTime, Enum, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from backend.app.database import Base


class TradeDirection(str, enum.Enum):
    LONG = "long"
    SHORT = "short"


class TradeStatus(str, enum.Enum):
    OPEN = "open"
    CLOSED = "closed"
    CANCELLED = "cancelled"


class Trade(Base):
    __tablename__ = "trades"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    asset_id: Mapped[int] = mapped_column(ForeignKey("assets.id"), nullable=False, index=True)

    direction: Mapped[TradeDirection] = mapped_column(Enum(TradeDirection), nullable=False)
    status: Mapped[TradeStatus] = mapped_column(
        Enum(TradeStatus), default=TradeStatus.OPEN
    )

    entry_price: Mapped[float] = mapped_column(Float, nullable=False)
    exit_price: Mapped[float | None] = mapped_column(Float)
    stop_loss: Mapped[float | None] = mapped_column(Float)
    take_profit: Mapped[float | None] = mapped_column(Float)
    position_size: Mapped[float] = mapped_column(Float, nullable=False)

    # Risk metrics at entry
    risk_reward_ratio: Mapped[float | None] = mapped_column(Float)
    risk_pct: Mapped[float | None] = mapped_column(Float)

    pnl: Mapped[float | None] = mapped_column(Float)
    pnl_pct: Mapped[float | None] = mapped_column(Float)
    fees: Mapped[float | None] = mapped_column(Float, default=0)

    # Journal
    strategy: Mapped[str | None] = mapped_column(String(100))
    setup_notes: Mapped[str | None] = mapped_column(Text)
    exit_notes: Mapped[str | None] = mapped_column(Text)
    tags: Mapped[list | None] = mapped_column(JSONB, default=list)

    # Snapshot of indicators at trade entry for post-mortem
    entry_indicators: Mapped[dict | None] = mapped_column(JSONB)

    opened_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    def __repr__(self) -> str:
        return f"<Trade {self.direction.value} asset={self.asset_id} pnl={self.pnl}>"
