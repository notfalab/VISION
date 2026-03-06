"""Payment model for crypto subscription billing."""

import enum
from datetime import datetime

from sqlalchemy import (
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from backend.app.database import Base


class PaymentStatus(str, enum.Enum):
    PENDING = "pending"
    CONFIRMING = "confirming"
    CONFIRMED = "confirmed"
    FAILED = "failed"
    EXPIRED = "expired"


class PaymentNetwork(str, enum.Enum):
    ETHEREUM = "ethereum"
    POLYGON = "polygon"
    BSC = "bsc"
    SOLANA = "solana"


class Payment(Base):
    __tablename__ = "payments"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    # Amount
    amount_usd: Mapped[float] = mapped_column(Float, default=99.0)
    token: Mapped[str] = mapped_column(String(10), nullable=False)  # USDT / USDC

    # Chain details
    network: Mapped[PaymentNetwork] = mapped_column(Enum(PaymentNetwork), nullable=False)
    tx_hash: Mapped[str] = mapped_column(String(128), unique=True, nullable=False, index=True)
    sender_address: Mapped[str | None] = mapped_column(String(128), nullable=True)
    recipient_address: Mapped[str | None] = mapped_column(String(128), nullable=True)

    # Verification
    status: Mapped[PaymentStatus] = mapped_column(Enum(PaymentStatus), default=PaymentStatus.PENDING)
    confirmations: Mapped[int] = mapped_column(Integer, default=0)
    block_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    verified_amount: Mapped[float | None] = mapped_column(Float, nullable=True)
    verification_error: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Subscription period this payment covers
    period_start: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    period_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Raw transaction data for audit
    raw_tx_data: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    def __repr__(self) -> str:
        return f"<Payment {self.id} user={self.user_id} {self.status.value} {self.network.value}>"
