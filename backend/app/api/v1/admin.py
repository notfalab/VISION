"""Admin endpoints — user stats and management."""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select, or_
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.api.deps import get_db, require_admin
from backend.app.models.user import User, UserRole

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/stats")
async def get_stats(
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Dashboard stats: user counts, registrations, role breakdown."""
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_ago = now - timedelta(days=7)
    month_ago = now - timedelta(days=30)

    # Total users
    total = (await db.execute(select(func.count(User.id)))).scalar() or 0

    # New today / week / month
    new_today = (
        await db.execute(
            select(func.count(User.id)).where(User.created_at >= today_start)
        )
    ).scalar() or 0
    new_week = (
        await db.execute(
            select(func.count(User.id)).where(User.created_at >= week_ago)
        )
    ).scalar() or 0
    new_month = (
        await db.execute(
            select(func.count(User.id)).where(User.created_at >= month_ago)
        )
    ).scalar() or 0

    # By role
    role_rows = (
        await db.execute(select(User.role, func.count(User.id)).group_by(User.role))
    ).all()
    by_role = {r.value: c for r, c in role_rows}

    # Active (updated_at in last 7 days)
    active = (
        await db.execute(
            select(func.count(User.id)).where(User.updated_at >= week_ago)
        )
    ).scalar() or 0

    # Recent registrations (last 10)
    recent_rows = (
        await db.execute(
            select(User).order_by(User.created_at.desc()).limit(10)
        )
    ).scalars().all()
    recent = [
        {
            "id": u.id,
            "username": u.username,
            "email": u.email,
            "role": u.role.value,
            "created_at": u.created_at.isoformat() if u.created_at else None,
        }
        for u in recent_rows
    ]

    return {
        "total_users": total,
        "new_today": new_today,
        "new_this_week": new_week,
        "new_this_month": new_month,
        "by_role": by_role,
        "active_this_week": active,
        "recent_registrations": recent,
    }


@router.get("/users")
async def list_users(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    search: str = Query("", max_length=100),
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Paginated user list with search."""
    query = select(User)
    count_query = select(func.count(User.id))

    if search:
        pattern = f"%{search}%"
        filter_cond = or_(
            User.username.ilike(pattern),
            User.email.ilike(pattern),
        )
        query = query.where(filter_cond)
        count_query = count_query.where(filter_cond)

    total = (await db.execute(count_query)).scalar() or 0
    offset = (page - 1) * limit
    rows = (
        await db.execute(query.order_by(User.created_at.desc()).offset(offset).limit(limit))
    ).scalars().all()

    users = [
        {
            "id": u.id,
            "username": u.username,
            "email": u.email,
            "role": u.role.value,
            "is_active": u.is_active,
            "created_at": u.created_at.isoformat() if u.created_at else None,
        }
        for u in rows
    ]

    return {
        "users": users,
        "total": total,
        "page": page,
        "pages": max(1, (total + limit - 1) // limit),
    }
