"""OHLCV price data model — time-series candle data for any asset."""

import enum
from datetime import datetime

from sqlalchemy import DateTime, Enum, Float, ForeignKey, Index, Integer, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.database import Base


class Timeframe(str, enum.Enum):
    M1 = "1m"
    M5 = "5m"
    M15 = "15m"
    M30 = "30m"
    H1 = "1h"
    H4 = "4h"
    D1 = "1d"
    W1 = "1w"
    MN1 = "1M"


class OHLCVData(Base):
    __tablename__ = "ohlcv_data"
    __table_args__ = (
        Index("ix_ohlcv_asset_tf_ts", "asset_id", "timeframe", "timestamp", unique=True),
        Index("ix_ohlcv_timestamp", "timestamp"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    asset_id: Mapped[int] = mapped_column(ForeignKey("assets.id"), nullable=False)
    timeframe: Mapped[Timeframe] = mapped_column(Enum(Timeframe), nullable=False)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    open: Mapped[float] = mapped_column(Float, nullable=False)
    high: Mapped[float] = mapped_column(Float, nullable=False)
    low: Mapped[float] = mapped_column(Float, nullable=False)
    close: Mapped[float] = mapped_column(Float, nullable=False)
    volume: Mapped[float] = mapped_column(Float, nullable=False, default=0)

    # Optional extended fields
    tick_volume: Mapped[float | None] = mapped_column(Float)
    spread: Mapped[float | None] = mapped_column(Float)
    open_interest: Mapped[float | None] = mapped_column(Float)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Relationship
    asset: Mapped["Asset"] = relationship(back_populates="ohlcv_data")  # noqa: F821

    __mapper_args__ = {"eager_defaults": True}

    def __repr__(self) -> str:
        return f"<OHLCV asset={self.asset_id} tf={self.timeframe.value} ts={self.timestamp}>"
