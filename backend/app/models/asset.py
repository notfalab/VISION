"""Asset model — represents any tradeable instrument."""

import enum
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, Index, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.database import Base


class MarketType(str, enum.Enum):
    FOREX = "forex"
    CRYPTO = "crypto"
    COMMODITY = "commodity"
    INDEX = "index"
    EQUITY = "equity"


class Asset(Base):
    __tablename__ = "assets"
    __table_args__ = (
        Index("ix_assets_symbol", "symbol", unique=True),
        Index("ix_assets_market_type", "market_type"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    symbol: Mapped[str] = mapped_column(String(30), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    market_type: Mapped[MarketType] = mapped_column(Enum(MarketType), nullable=False)
    exchange: Mapped[str | None] = mapped_column(String(50))
    base_currency: Mapped[str | None] = mapped_column(String(10))
    quote_currency: Mapped[str | None] = mapped_column(String(10))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    tick_size: Mapped[str | None] = mapped_column(String(20))
    config: Mapped[dict | None] = mapped_column(JSONB, default=dict)
    description: Mapped[str | None] = mapped_column(Text)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    ohlcv_data: Mapped[list["OHLCVData"]] = relationship(back_populates="asset")  # noqa: F821
    indicators: Mapped[list["IndicatorValue"]] = relationship(back_populates="asset")  # noqa: F821
    cot_reports: Mapped[list["COTReport"]] = relationship(back_populates="asset")  # noqa: F821
    alerts: Mapped[list["Alert"]] = relationship(back_populates="asset")  # noqa: F821

    def __repr__(self) -> str:
        return f"<Asset {self.symbol} ({self.market_type.value})>"
