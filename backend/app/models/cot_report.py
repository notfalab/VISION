"""COT (Commitment of Traders) report data from CFTC."""

from datetime import date, datetime

from sqlalchemy import Date, DateTime, Float, ForeignKey, Index, Integer, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.database import Base


class COTReport(Base):
    __tablename__ = "cot_reports"
    __table_args__ = (
        Index("ix_cot_asset_date", "asset_id", "report_date", unique=True),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    asset_id: Mapped[int] = mapped_column(ForeignKey("assets.id"), nullable=False)
    report_date: Mapped[date] = mapped_column(Date, nullable=False)
    cftc_contract_code: Mapped[str | None] = mapped_column(String(20))

    # Commercial positions (hedgers)
    commercial_long: Mapped[float] = mapped_column(Float, default=0)
    commercial_short: Mapped[float] = mapped_column(Float, default=0)
    commercial_net: Mapped[float] = mapped_column(Float, default=0)

    # Non-commercial positions (large speculators)
    noncommercial_long: Mapped[float] = mapped_column(Float, default=0)
    noncommercial_short: Mapped[float] = mapped_column(Float, default=0)
    noncommercial_net: Mapped[float] = mapped_column(Float, default=0)

    # Non-reportable (small speculators)
    nonreportable_long: Mapped[float | None] = mapped_column(Float)
    nonreportable_short: Mapped[float | None] = mapped_column(Float)

    # Open interest
    open_interest: Mapped[float | None] = mapped_column(Float)
    open_interest_change: Mapped[float | None] = mapped_column(Float)

    # Calculated fields
    net_change_weekly: Mapped[float | None] = mapped_column(Float)
    net_change_pct: Mapped[float | None] = mapped_column(Float)

    extra: Mapped[dict | None] = mapped_column(JSONB, default=dict)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    asset: Mapped["Asset"] = relationship(back_populates="cot_reports")  # noqa: F821

    def __repr__(self) -> str:
        return f"<COT asset={self.asset_id} date={self.report_date} net={self.noncommercial_net}>"
