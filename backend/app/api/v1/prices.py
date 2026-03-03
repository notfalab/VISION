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
                    "open": float(ticker.get("open", ticker["price"])),
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
                        "open": float(row.open),
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


# ── TP/SL Heatmap ───────────────────────────────────────────────

@router.get("/{symbol}/tpsl-heatmap")
async def get_tpsl_heatmap(
    symbol: str,
    depth: int = Query(500, ge=50, le=1000),
):
    """
    Estimated TP/SL order clusters from order book analysis.

    Works for all pairs with order book data:
    - Crypto: via Binance order book
    - Forex/Gold: via OANDA order book

    Returns estimated take-profit and stop-loss zones based on
    order book volume patterns, round number proximity, and
    liquidity gap analysis.
    """
    from backend.app.data.registry import data_registry
    from backend.app.core.orderbook.tpsl_analyzer import analyze_tpsl_heatmap

    try:
        adapter = data_registry.route_symbol(symbol)
        await adapter.connect()
        try:
            ob = await adapter.fetch_orderbook(symbol, depth)
            if ob is None:
                raise HTTPException(
                    status_code=404,
                    detail=f"Order book not available for {symbol}. TP/SL estimation requires order book data.",
                )

            bids = [{"price": l.price, "quantity": l.quantity} for l in ob.bids]
            asks = [{"price": l.price, "quantity": l.quantity} for l in ob.asks]

            # Get current mid price
            if bids and asks:
                current_price = (bids[0]["price"] + asks[0]["price"]) / 2
            elif bids:
                current_price = bids[0]["price"]
            elif asks:
                current_price = asks[0]["price"]
            else:
                raise HTTPException(status_code=404, detail="Empty order book")

            result = analyze_tpsl_heatmap(bids, asks, current_price)
            result["symbol"] = symbol.upper()
            result["timestamp"] = ob.timestamp.isoformat()
            return result

        finally:
            await adapter.disconnect()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"TP/SL heatmap failed: {str(e)}")


# ── Liquidation Map ─────────────────────────────────────────────

CRYPTO_SYMBOLS = {"BTCUSD", "ETHUSD", "SOLUSD", "XRPUSD", "ETHBTC"}


@router.get("/{symbol}/liquidation-map")
async def get_liquidation_map(symbol: str):
    """
    Liquidation level heatmap — crypto only.

    Primary: CoinGlass API for accurate liquidation map data.
    Fallback: DIY estimation from Binance Futures open interest + funding rate.

    Returns price levels with estimated long/short liquidation volumes.
    Non-crypto symbols return HTTP 400.
    """
    if symbol.upper() not in CRYPTO_SYMBOLS:
        raise HTTPException(
            status_code=400,
            detail=f"Liquidation data only available for crypto. {symbol} is not a supported crypto pair.",
        )

    from backend.app.data.coinglass_adapter import CoinglassAdapter

    adapter = CoinglassAdapter()
    await adapter.connect()
    try:
        liq_map = await adapter.fetch_liquidation_map(symbol)
        if liq_map is None:
            raise HTTPException(
                status_code=502,
                detail="Failed to fetch liquidation data from both CoinGlass and Binance Futures.",
            )

        return {
            "symbol": liq_map.symbol,
            "timestamp": liq_map.timestamp.isoformat(),
            "current_price": liq_map.current_price,
            "levels": [
                {
                    "price": l.price,
                    "long_liq_usd": l.long_liq_usd,
                    "short_liq_usd": l.short_liq_usd,
                }
                for l in liq_map.levels
            ],
            "total_long_liq_usd": sum(l.long_liq_usd for l in liq_map.levels),
            "total_short_liq_usd": sum(l.short_liq_usd for l in liq_map.levels),
        }
    finally:
        await adapter.disconnect()


# ── Deep Order Book (MBO Level 4) ───────────────────────────────

@router.get("/{symbol}/orderbook-deep")
async def get_deep_orderbook(
    symbol: str,
    depth: int = Query(1000, ge=100, le=5000),
):
    """
    Deep order book with MBO Level 4 estimated data.

    Returns full-depth order book with:
    - Estimated order count per price level
    - Volume concentration metrics
    - Bid/ask statistics

    Binance REST /depth returns aggregated levels; order count is estimated
    from quantity distribution analysis.
    """
    from backend.app.data.registry import data_registry
    from backend.app.core.orderbook.tpsl_analyzer import estimate_order_count

    try:
        adapter = data_registry.route_symbol(symbol)
        await adapter.connect()
        try:
            ob = await adapter.fetch_orderbook(symbol, min(depth, 1000))
            if ob is None:
                raise HTTPException(
                    status_code=404,
                    detail=f"Order book not available for {symbol}",
                )

            # Calculate average order sizes for estimation
            avg_bid_size = (
                sum(l.quantity for l in ob.bids) / max(len(ob.bids), 1)
            )
            avg_ask_size = (
                sum(l.quantity for l in ob.asks) / max(len(ob.asks), 1)
            )

            total_bid_vol = sum(l.quantity for l in ob.bids)
            total_ask_vol = sum(l.quantity for l in ob.asks)
            total_vol = total_bid_vol + total_ask_vol

            bids = []
            for l in ob.bids:
                pct = l.quantity / total_vol * 100 if total_vol > 0 else 0
                bids.append({
                    "price": l.price,
                    "quantity": l.quantity,
                    "orders_count": l.orders_count or estimate_order_count(l.quantity, avg_bid_size),
                    "pct_of_total": round(pct, 4),
                })

            asks = []
            for l in ob.asks:
                pct = l.quantity / total_vol * 100 if total_vol > 0 else 0
                asks.append({
                    "price": l.price,
                    "quantity": l.quantity,
                    "orders_count": l.orders_count or estimate_order_count(l.quantity, avg_ask_size),
                    "pct_of_total": round(pct, 4),
                })

            # Statistics
            spread = asks[0]["price"] - bids[0]["price"] if bids and asks else 0
            spread_pct = spread / bids[0]["price"] * 100 if bids and bids[0]["price"] > 0 else 0

            return {
                "symbol": symbol.upper(),
                "timestamp": ob.timestamp.isoformat(),
                "bids": bids,
                "asks": asks,
                "stats": {
                    "total_bid_volume": round(total_bid_vol, 4),
                    "total_ask_volume": round(total_ask_vol, 4),
                    "bid_ask_ratio": round(total_bid_vol / max(total_ask_vol, 1e-10), 3),
                    "bid_levels": len(bids),
                    "ask_levels": len(asks),
                    "spread": round(spread, 6),
                    "spread_pct": round(spread_pct, 4),
                    "total_estimated_orders": (
                        sum(b["orders_count"] for b in bids)
                        + sum(a["orders_count"] for a in asks)
                    ),
                },
            }
        finally:
            await adapter.disconnect()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Deep order book failed: {str(e)}")
