"""Price data endpoints — OHLCV queries, ingestion trigger, and live prices."""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.api.deps import get_db
from backend.app.models.asset import Asset
from backend.app.models.ohlcv import OHLCVData, Timeframe
from backend.app.schemas.ohlcv import OHLCVResponse

router = APIRouter(prefix="/prices", tags=["prices"])


@router.get("/{symbol}", response_model=list[OHLCVResponse])
async def get_ohlcv(
    symbol: str,
    timeframe: str = Query("1h", description="Candle timeframe: 1m,5m,15m,30m,1h,4h,1d,1w,1M"),
    limit: int = Query(500, ge=1, le=5000),
    start: datetime | None = None,
    end: datetime | None = None,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Asset).where(Asset.symbol == symbol.upper()))
    asset = result.scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=404, detail=f"Asset {symbol} not found")

    try:
        tf = Timeframe(timeframe)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid timeframe: {timeframe}")

    query = (
        select(OHLCVData)
        .where(OHLCVData.asset_id == asset.id, OHLCVData.timeframe == tf)
    )
    if start:
        query = query.where(OHLCVData.timestamp >= start)
    if end:
        query = query.where(OHLCVData.timestamp <= end)
    query = query.order_by(OHLCVData.timestamp.desc()).limit(limit)

    result = await db.execute(query)
    return result.scalars().all()


@router.post("/{symbol}/fetch")
async def fetch_prices(
    symbol: str,
    timeframe: str = Query("1d"),
    limit: int = Query(500, ge=1, le=5000),
):
    """Trigger data fetch from external source and store in DB."""
    from backend.app.data.ingestion import ingest_ohlcv
    try:
        count = await ingest_ohlcv(symbol, timeframe, limit)
        return {"symbol": symbol.upper(), "timeframe": timeframe, "rows_ingested": count}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Fetch failed: {str(e)}")


@router.post("/fetch/batch")
async def fetch_batch(
    symbols: str = Query(..., description="Comma-separated: EURUSD,BTCUSD,XAUUSD"),
    timeframe: str = Query("1d"),
    limit: int = Query(500),
):
    """Fetch OHLCV data for multiple symbols in batch."""
    from backend.app.data.ingestion import ingest_multiple
    symbol_list = [s.strip().upper() for s in symbols.split(",")]
    results = await ingest_multiple(symbol_list, timeframe, limit)
    return {"timeframe": timeframe, "results": results}


@router.get("/{symbol}/latest")
async def get_latest_price(symbol: str):
    """Get latest price — tries Redis cache first, then live fetch from adapter."""
    from backend.app.data.redis_pubsub import get_latest_price as get_cached, cache_latest_price
    price = await get_cached(symbol)
    if price:
        return price

    # Fallback: fetch live from adapter and cache it
    from backend.app.data.registry import data_registry
    try:
        adapter = data_registry.route_symbol(symbol)
        await adapter.connect()
        try:
            df = await adapter.fetch_ohlcv(symbol, "1h", 1)
            if not df.empty:
                from backend.app.data.base import Candle
                row = df.iloc[-1]
                ts = row["timestamp"]
                candle = Candle(
                    timestamp=ts.to_pydatetime() if hasattr(ts, "to_pydatetime") else ts,
                    open=float(row["open"]),
                    high=float(row["high"]),
                    low=float(row["low"]),
                    close=float(row["close"]),
                    volume=float(row["volume"]),
                )
                await cache_latest_price(symbol.upper(), candle)
                return {
                    "symbol": symbol.upper(),
                    "price": float(row["close"]),
                    "high": float(row["high"]),
                    "low": float(row["low"]),
                    "volume": float(row["volume"]),
                    "timestamp": ts.isoformat() if hasattr(ts, "isoformat") else str(ts),
                }
        finally:
            await adapter.disconnect()
    except Exception:
        pass

    raise HTTPException(status_code=404, detail="No price data available. Try fetching first.")


@router.get("/{symbol}/orderbook")
async def get_orderbook(
    symbol: str,
    depth: int = Query(20, ge=1, le=1000),
):
    """Fetch live order book from the exchange (crypto only)."""
    from backend.app.data.registry import data_registry
    try:
        adapter = data_registry.route_symbol(symbol)
        await adapter.connect()
        try:
            ob = await adapter.fetch_orderbook(symbol, depth)
            if ob is None:
                raise HTTPException(status_code=404, detail=f"Order book not available for {symbol}")
            return {
                "symbol": ob.symbol,
                "timestamp": ob.timestamp.isoformat(),
                "bids": [{"price": l.price, "quantity": l.quantity} for l in ob.bids],
                "asks": [{"price": l.price, "quantity": l.quantity} for l in ob.asks],
            }
        finally:
            await adapter.disconnect()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Order book fetch failed: {str(e)}")
