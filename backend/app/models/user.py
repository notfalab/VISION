"""User model with role-based access and subscription management."""

import enum
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Enum, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from backend.app.database import Base


class UserRole(str, enum.Enum):
    ADMIN = "admin"
    TRADER = "trader"
    VIEWER = "viewer"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), default=UserRole.TRADER)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    # Profile
    first_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    last_name: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Subscription
    trial_ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    subscription_ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # User preferences: default timeframes, favorite assets, alert channels, etc.
    preferences: Mapped[dict | None] = mapped_column(JSONB, default=dict)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    @property
    def subscription_status(self) -> str:
        """Return current subscription status: admin / active / trial / expired."""
        if self.role == UserRole.ADMIN:
            return "admin"
        now = datetime.now(timezone.utc)
        if self.subscription_ends_at and self.subscription_ends_at > now:
            return "active"
        # Trial disabled — all non-paying, non-admin users are expired
        return "expired"

    @property
    def has_access(self) -> bool:
        """Whether user can access the platform."""
        return self.subscription_status in ("admin", "active", "trial")

    @property
    def days_remaining(self) -> int:
        """Days remaining on subscription or trial."""
        now = datetime.now(timezone.utc)
        if self.subscription_ends_at and self.subscription_ends_at > now:
            return max(0, (self.subscription_ends_at - now).days)
        if self.trial_ends_at and self.trial_ends_at > now:
            return max(0, (self.trial_ends_at - now).days)
        return 0

    def __repr__(self) -> str:
        return f"<User {self.username} ({self.role.value})>"
