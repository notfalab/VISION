"""On-chain events — whale transfers, large transactions for crypto."""

import enum
from datetime import datetime

from sqlalchemy import DateTime, Enum, Float, ForeignKey, Index, Integer, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from backend.app.database import Base


class OnchainEventType(str, enum.Enum):
    WHALE_TRANSFER = "whale_transfer"
    EXCHANGE_INFLOW = "exchange_inflow"
    EXCHANGE_OUTFLOW = "exchange_outflow"
    LARGE_TX = "large_tx"
    CONTRACT_CALL = "contract_call"
    MINT = "mint"
    BURN = "burn"


class OnchainEvent(Base):
    __tablename__ = "onchain_events"
    __table_args__ = (
        Index("ix_onchain_asset_ts", "asset_id", "timestamp"),
        Index("ix_onchain_type_ts", "event_type", "timestamp"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    asset_id: Mapped[int] = mapped_column(ForeignKey("assets.id"), nullable=False)
    event_type: Mapped[OnchainEventType] = mapped_column(
        Enum(OnchainEventType), nullable=False
    )

    tx_hash: Mapped[str | None] = mapped_column(String(100), index=True)
    block_number: Mapped[int | None] = mapped_column(Integer)
    address_from: Mapped[str | None] = mapped_column(String(100))
    address_to: Mapped[str | None] = mapped_column(String(100))
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    amount_usd: Mapped[float | None] = mapped_column(Float)
    chain: Mapped[str | None] = mapped_column(String(20))

    extra: Mapped[dict | None] = mapped_column(JSONB, default=dict)

    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    def __repr__(self) -> str:
        return f"<Onchain {self.event_type.value} amount={self.amount} asset={self.asset_id}>"
