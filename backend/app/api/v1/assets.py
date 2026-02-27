"""Asset CRUD endpoints."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.api.deps import get_db
from backend.app.models.asset import Asset
from backend.app.schemas.asset import AssetCreate, AssetResponse, AssetUpdate

router = APIRouter(prefix="/assets", tags=["assets"])


@router.get("/", response_model=list[AssetResponse])
async def list_assets(
    market_type: str | None = None,
    active_only: bool = True,
    db: AsyncSession = Depends(get_db),
):
    query = select(Asset)
    if active_only:
        query = query.where(Asset.is_active.is_(True))
    if market_type:
        query = query.where(Asset.market_type == market_type)
    query = query.order_by(Asset.symbol)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/{symbol}", response_model=AssetResponse)
async def get_asset(symbol: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Asset).where(Asset.symbol == symbol.upper()))
    asset = result.scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=404, detail=f"Asset {symbol} not found")
    return asset


@router.post("/", response_model=AssetResponse, status_code=201)
async def create_asset(body: AssetCreate, db: AsyncSession = Depends(get_db)):
    asset = Asset(**body.model_dump())
    asset.symbol = asset.symbol.upper()
    db.add(asset)
    await db.flush()
    await db.refresh(asset)
    return asset


@router.patch("/{symbol}", response_model=AssetResponse)
async def update_asset(symbol: str, body: AssetUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Asset).where(Asset.symbol == symbol.upper()))
    asset = result.scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=404, detail=f"Asset {symbol} not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(asset, field, value)
    await db.flush()
    await db.refresh(asset)
    return asset
