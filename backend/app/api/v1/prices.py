"""Price data endpoints — OHLCV queries, ingestion trigger, and live prices."""

from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import delete, select
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

    actual_tf = timeframe

    try:
        count = await ingest_ohlcv(symbol, actual_tf, limit)
        return {"symbol": symbol.upper(), "timeframe": actual_tf, "rows_ingested": count}
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
    """Get latest price — tries Redis cache, then live adapter, then DB fallback.

    Staleness guard: DB data older than 2 hours is skipped in favor of
    a live adapter call so the frontend always shows a recent price.
    """
    from backend.app.data.redis_pubsub import get_latest_price as get_cached, cache_latest_price
    from backend.app.logging_config import get_logger

    log = get_logger("latest_price")

    # ── 1. Redis cache (fastest, TTL ≤ 5 min) ──
    price = await get_cached(symbol)
    if price:
        return price

    # ── 2. Live fetch from adapter (real-time, uses OANDA for gold) ──
    from backend.app.data.registry import data_registry
    try:
        adapter = data_registry.route_symbol(symbol)
        await adapter.connect()
        try:
            # fetch_ticker uses S5 candles on OANDA → near real-time
            ticker = await adapter.fetch_ticker(symbol)
            if ticker and ticker.get("price", 0) > 0:
                from backend.app.data.base import Candle
                ts_raw = ticker.get("timestamp", "")
                if ts_raw:
                    import pandas as _pd
                    ts = _pd.Timestamp(ts_raw)
                    if ts.tzinfo is None:
                        ts = ts.tz_localize("UTC")
                    ts = ts.to_pydatetime()
                else:
                    ts = datetime.now(timezone.utc)
                candle = Candle(
                    timestamp=ts,
                    open=float(ticker.get("open", ticker["price"])),
                    high=float(ticker.get("high", ticker["price"])),
                    low=float(ticker.get("low", ticker["price"])),
                    close=float(ticker["price"]),
                    volume=float(ticker.get("volume", 0)),
                )
                await cache_latest_price(symbol.upper(), candle)
                return {
                    "symbol": symbol.upper(),
                    "price": float(ticker["price"]),
                    "high": float(ticker.get("high", ticker["price"])),
                    "low": float(ticker.get("low", ticker["price"])),
                    "volume": float(ticker.get("volume", 0)),
                    "timestamp": ts.isoformat() if hasattr(ts, "isoformat") else str(ts),
                }
        finally:
            await adapter.disconnect()
    except Exception as e:
        log.warning("live_fetch_failed", symbol=symbol, error=str(e))

    # ── 3. DB fallback — get most recent data point across any timeframe ──
    # Use 48h window to handle weekends (forex closes Fri 5pm → Sun 5pm ET).
    # Daily candles are timestamped at midnight so a 2h cutoff rejects them
    # by early morning; 48h covers full weekend gap.
    try:
        from sqlalchemy import select as sa_select
        from backend.app.database import async_session as db_session

        staleness_cutoff = datetime.now(timezone.utc) - timedelta(hours=48)

        async with db_session() as session:
            result = await session.execute(
                sa_select(Asset).where(Asset.symbol == symbol.upper())
            )
            asset = result.scalar_one_or_none()
            if asset:
                result = await session.execute(
                    sa_select(OHLCVData)
                    .where(
                        OHLCVData.asset_id == asset.id,
                        OHLCVData.timestamp >= staleness_cutoff,
                    )
                    .order_by(OHLCVData.timestamp.desc())
                    .limit(1)
                )
                row = result.scalar_one_or_none()
                if row:
                    from backend.app.data.base import Candle
                    candle = Candle(
                        timestamp=row.timestamp,
                        open=float(row.open),
                        high=float(row.high),
                        low=float(row.low),
                        close=float(row.close),
                        volume=float(row.volume),
                    )
                    await cache_latest_price(symbol.upper(), candle)
                    return {
                        "symbol": symbol.upper(),
                        "price": float(row.close),
                        "high": float(row.high),
                        "low": float(row.low),
                        "volume": float(row.volume),
                        "timestamp": row.timestamp.isoformat() if hasattr(row.timestamp, "isoformat") else str(row.timestamp),
                    }
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


@router.delete("/{symbol}/cleanup")
async def cleanup_stale_data(
    symbol: str,
    timeframe: str = Query(..., description="Timeframe to clean: 5m,15m,30m,1h,4h"),
    db: AsyncSession = Depends(get_db),
):
    """Delete stale/corrupt OHLCV data for a specific symbol and timeframe."""
    result = await db.execute(select(Asset).where(Asset.symbol == symbol.upper()))
    asset = result.scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=404, detail=f"Asset {symbol} not found")

    try:
        tf = Timeframe(timeframe)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid timeframe: {timeframe}")

    stmt = delete(OHLCVData).where(
        OHLCVData.asset_id == asset.id,
        OHLCVData.timeframe == tf,
    )
    result = await db.execute(stmt)
    await db.commit()
    return {"symbol": symbol.upper(), "timeframe": timeframe, "rows_deleted": result.rowcount}
