"""Alert management endpoints."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.api.deps import get_db, require_user
from backend.app.models.alert import Alert, AlertHistory
from backend.app.models.user import User
from backend.app.schemas.alert import AlertCreate, AlertResponse, AlertUpdate

router = APIRouter(prefix="/alerts", tags=["alerts"])


@router.get("/", response_model=list[AlertResponse])
async def list_alerts(
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Alert).where(Alert.user_id == user.id).order_by(Alert.created_at.desc())
    )
    return result.scalars().all()


@router.post("/", response_model=AlertResponse, status_code=201)
async def create_alert(
    body: AlertCreate,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    alert = Alert(user_id=user.id, **body.model_dump())
    db.add(alert)
    await db.flush()
    await db.refresh(alert)
    return alert


@router.patch("/{alert_id}", response_model=AlertResponse)
async def update_alert(
    alert_id: int,
    body: AlertUpdate,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Alert).where(Alert.id == alert_id, Alert.user_id == user.id)
    )
    alert = result.scalar_one_or_none()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(alert, field, value)
    await db.flush()
    await db.refresh(alert)
    return alert


@router.delete("/{alert_id}", status_code=204)
async def delete_alert(
    alert_id: int,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Alert).where(Alert.id == alert_id, Alert.user_id == user.id)
    )
    alert = result.scalar_one_or_none()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    await db.delete(alert)


@router.get("/{alert_id}/history")
async def get_alert_history(
    alert_id: int,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(AlertHistory)
        .where(AlertHistory.alert_id == alert_id, AlertHistory.user_id == user.id)
        .order_by(AlertHistory.triggered_at.desc())
        .limit(100)
    )
    return result.scalars().all()
