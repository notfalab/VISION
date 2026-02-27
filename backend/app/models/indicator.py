"""Indicator values — computed indicator data persisted for queries and ML."""

import enum
from datetime import datetime

from sqlalchemy import DateTime, Enum, Float, ForeignKey, Index, Integer, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.database import Base


class IndicatorType(str, enum.Enum):
    OBV = "obv"
    AD_LINE = "ad_line"
    VOLUME_SPIKE = "volume_spike"
    ACCUMULATION = "accumulation"
    DISTRIBUTION = "distribution"
    DIVERGENCE = "divergence"
    SUPPLY_ZONE = "supply_zone"
    DEMAND_ZONE = "demand_zone"
    RELATIVE_STRENGTH = "relative_strength"
    ATR = "atr"
    RSI = "rsi"
    VWAP = "vwap"
    ORDERBOOK_IMBALANCE = "orderbook_imbalance"
    ML_REVERSAL_PROB = "ml_reversal_prob"


class IndicatorValue(Base):
    __tablename__ = "indicator_values"
    __table_args__ = (
        Index(
            "ix_indval_asset_type_tf_ts",
            "asset_id", "indicator_type", "timeframe", "timestamp",
            unique=True,
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    asset_id: Mapped[int] = mapped_column(ForeignKey("assets.id"), nullable=False)
    indicator_type: Mapped[IndicatorType] = mapped_column(
        Enum(IndicatorType), nullable=False
    )
    timeframe: Mapped[str] = mapped_column(String(5), nullable=False)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    value: Mapped[float] = mapped_column(Float, nullable=False)
    secondary_value: Mapped[float | None] = mapped_column(Float)
    metadata_json: Mapped[dict | None] = mapped_column(JSONB, default=dict)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    asset: Mapped["Asset"] = relationship(back_populates="indicators")  # noqa: F821

    def __repr__(self) -> str:
        return f"<Indicator {self.indicator_type.value} asset={self.asset_id} val={self.value}>"
