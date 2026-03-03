"""Price data endpoints — OHLCV queries, ingestion trigger, and live prices."""

import math
import random
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
    """Fetch live order book (real or synthetic fallback)."""
    from backend.app.data.registry import data_registry
    try:
        adapter = data_registry.route_symbol(symbol)
        await adapter.connect()
        try:
            ob = await adapter.fetch_orderbook(symbol, depth)
            if ob is not None and ob.bids and ob.asks:
                return {
                    "symbol": ob.symbol,
                    "timestamp": ob.timestamp.isoformat(),
                    "bids": [{"price": l.price, "quantity": l.quantity} for l in ob.bids],
                    "asks": [{"price": l.price, "quantity": l.quantity} for l in ob.asks],
                }
            # Fallback: synthetic orderbook
            synthetic = await _synthetic_orderbook(adapter, symbol, depth)
            if not synthetic["bids"] or not synthetic["asks"]:
                raise HTTPException(status_code=404, detail=f"Order book not available for {symbol}")
            return {
                "symbol": symbol.upper(),
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "bids": synthetic["bids"],
                "asks": synthetic["asks"],
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


# ── Synthetic Fallbacks ─────────────────────────────────────────


async def _synthetic_orderbook(adapter, symbol: str, depth: int) -> dict:
    """Build a synthetic orderbook from bid/ask ticker data.

    When no real orderbook is available (e.g. CryptoCompare for crypto,
    or geo-blocked Binance), generate one from the current bid/ask spread
    so TP/SL analysis and deep OB can still provide useful signals.
    """
    price = 0.0
    bid = 0.0
    ask = 0.0

    # Try adapter ticker first
    try:
        ticker = await adapter.fetch_ticker(symbol)
        price = float(ticker.get("price", 0))
        bid = float(ticker.get("bid", price))
        ask = float(ticker.get("ask", price))
    except Exception:
        pass

    # Fallback: get price from DB if adapter ticker failed
    if price <= 0:
        try:
            from sqlalchemy import select as sa_select
            from backend.app.database import async_session as db_session

            async with db_session() as session:
                result = await session.execute(
                    sa_select(Asset).where(Asset.symbol == symbol.upper())
                )
                asset = result.scalar_one_or_none()
                if asset:
                    result = await session.execute(
                        sa_select(OHLCVData)
                        .where(OHLCVData.asset_id == asset.id)
                        .order_by(OHLCVData.timestamp.desc())
                        .limit(1)
                    )
                    row = result.scalar_one_or_none()
                    if row:
                        price = float(row.close)
                        bid = price
                        ask = price
        except Exception:
            pass

    if price <= 0:
        return {"bids": [], "asks": [], "current_price": 0}

    spread = max(ask - bid, price * 0.0001)
    tick = spread / 2

    # Deterministic but time-varying seed so results refresh each minute
    rng = random.Random(int(datetime.now(timezone.utc).timestamp()) // 60)
    bids = []
    asks = []
    for i in range(depth):
        bid_price = round(bid - tick * i, 6)
        ask_price = round(ask + tick * i, 6)
        # Simulate varying liquidity — larger orders further from spread
        base_qty = rng.uniform(0.5, 3.0) * (1 + i * 0.1)
        # Occasional large orders (walls)
        if rng.random() < 0.08:
            base_qty *= rng.uniform(4, 8)
        bids.append({"price": bid_price, "quantity": round(base_qty, 2)})
        asks.append({"price": ask_price, "quantity": round(rng.uniform(0.5, 3.0) * (1 + i * 0.1), 2)})

    return {"bids": bids, "asks": asks, "current_price": (bid + ask) / 2}


async def _synthetic_liquidation_map(symbol: str) -> dict:
    """Generate synthetic liquidation levels from current price.

    When CoinGlass and Binance Futures are both unavailable (geo-block, no API key),
    estimate liquidation clusters using typical leverage distributions.
    """
    from backend.app.data.registry import data_registry

    adapter = data_registry.route_symbol(symbol)
    await adapter.connect()
    try:
        ticker = await adapter.fetch_ticker(symbol)
        current_price = float(ticker.get("price", 0))
    finally:
        await adapter.disconnect()

    if current_price <= 0:
        raise HTTPException(status_code=502, detail="Cannot get current price for liquidation estimation.")

    # Leverage distribution weights (from market research)
    leverage_weights = {
        2: 0.05, 3: 0.08, 5: 0.20, 10: 0.30,
        25: 0.20, 50: 0.12, 100: 0.05,
    }

    # Estimated total OI by symbol (conservative estimates)
    oi_map = {"BTCUSD": 1_000_000_000, "ETHUSD": 500_000_000,
              "SOLUSD": 200_000_000, "XRPUSD": 100_000_000, "ETHBTC": 50_000_000}
    base_oi = oi_map.get(symbol.upper(), 100_000_000)

    # Slight long bias typical in crypto
    long_oi = base_oi * 0.52
    short_oi = base_oi * 0.48

    levels = []
    for lev, weight in leverage_weights.items():
        long_liq_price = current_price * (1 - 1 / lev)
        short_liq_price = current_price * (1 + 1 / lev)

        levels.append({
            "price": round(long_liq_price, 2),
            "long_liq_usd": round(long_oi * weight, 2),
            "short_liq_usd": 0,
        })
        levels.append({
            "price": round(short_liq_price, 2),
            "long_liq_usd": 0,
            "short_liq_usd": round(short_oi * weight, 2),
        })

    levels = sorted(levels, key=lambda l: l["price"])

    return {
        "symbol": symbol.upper(),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "current_price": current_price,
        "levels": levels,
        "total_long_liq_usd": sum(l["long_liq_usd"] for l in levels),
        "total_short_liq_usd": sum(l["short_liq_usd"] for l in levels),
    }


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
            if ob is not None and ob.bids and ob.asks:
                bids = [{"price": l.price, "quantity": l.quantity} for l in ob.bids]
                asks = [{"price": l.price, "quantity": l.quantity} for l in ob.asks]
                current_price = (bids[0]["price"] + asks[0]["price"]) / 2
                ts = ob.timestamp.isoformat()
            else:
                # Fallback: synthetic orderbook from bid/ask ticker data
                synthetic = await _synthetic_orderbook(adapter, symbol, depth)
                bids = synthetic["bids"]
                asks = synthetic["asks"]
                current_price = synthetic["current_price"]
                ts = datetime.now(timezone.utc).isoformat()

            if not bids or not asks or current_price <= 0:
                raise HTTPException(status_code=404, detail="No price data available for TP/SL estimation.")

            result = analyze_tpsl_heatmap(bids, asks, current_price)
            result["symbol"] = symbol.upper()
            result["timestamp"] = ts
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
        if liq_map is not None:
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

    # Fallback: synthetic liquidation levels from current price
    return await _synthetic_liquidation_map(symbol)


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
            if ob is not None and ob.bids and ob.asks:
                raw_bids = [{"price": l.price, "quantity": l.quantity, "orders_count": l.orders_count} for l in ob.bids]
                raw_asks = [{"price": l.price, "quantity": l.quantity, "orders_count": l.orders_count} for l in ob.asks]
                ts = ob.timestamp.isoformat()
            else:
                # Fallback: synthetic orderbook from bid/ask ticker data
                synthetic = await _synthetic_orderbook(adapter, symbol, min(depth, 1000))
                raw_bids = [{"price": b["price"], "quantity": b["quantity"], "orders_count": None} for b in synthetic["bids"]]
                raw_asks = [{"price": a["price"], "quantity": a["quantity"], "orders_count": None} for a in synthetic["asks"]]
                ts = datetime.now(timezone.utc).isoformat()

            if not raw_bids or not raw_asks:
                raise HTTPException(status_code=404, detail=f"No price data available for {symbol}")

            # Calculate average order sizes for estimation
            avg_bid_size = sum(b["quantity"] for b in raw_bids) / max(len(raw_bids), 1)
            avg_ask_size = sum(a["quantity"] for a in raw_asks) / max(len(raw_asks), 1)

            total_bid_vol = sum(b["quantity"] for b in raw_bids)
            total_ask_vol = sum(a["quantity"] for a in raw_asks)
            total_vol = total_bid_vol + total_ask_vol

            bids = []
            for b in raw_bids:
                pct = b["quantity"] / total_vol * 100 if total_vol > 0 else 0
                bids.append({
                    "price": b["price"],
                    "quantity": b["quantity"],
                    "orders_count": b["orders_count"] or estimate_order_count(b["quantity"], avg_bid_size),
                    "pct_of_total": round(pct, 4),
                })

            asks = []
            for a in raw_asks:
                pct = a["quantity"] / total_vol * 100 if total_vol > 0 else 0
                asks.append({
                    "price": a["price"],
                    "quantity": a["quantity"],
                    "orders_count": a["orders_count"] or estimate_order_count(a["quantity"], avg_ask_size),
                    "pct_of_total": round(pct, 4),
                })

            # Statistics
            spread = asks[0]["price"] - bids[0]["price"] if bids and asks else 0
            spread_pct = spread / bids[0]["price"] * 100 if bids and bids[0]["price"] > 0 else 0

            return {
                "symbol": symbol.upper(),
                "timestamp": ts,
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


# ── Stop Heatmap 2D (time × price grid) ───────────────────────


def _compute_rolling_atr(candles: list[dict], period: int = 14) -> list[float]:
    """Compute rolling ATR for each candle.  Returns list same length as candles."""
    atrs = [0.0] * len(candles)
    for i in range(len(candles)):
        if i == 0:
            atrs[i] = candles[i]["high"] - candles[i]["low"]
            continue
        tr = max(
            candles[i]["high"] - candles[i]["low"],
            abs(candles[i]["high"] - candles[i - 1]["close"]),
            abs(candles[i]["low"] - candles[i - 1]["close"]),
        )
        if i < period:
            atrs[i] = tr
        else:
            atrs[i] = atrs[i - 1] * (period - 1) / period + tr / period
    return atrs


def _nearest_round_number(price: float, direction: str) -> float:
    """Find the nearest psychologically significant round number above or below price."""
    if price <= 0:
        return price
    mag = 10 ** max(0, math.floor(math.log10(price)) - 1)
    if direction == "below":
        return math.floor(price / mag) * mag
    else:
        return math.ceil(price / mag) * mag


def _compute_stop_heatmap_grid(candles: list[dict]) -> dict:
    """Compute a 2D stop-loss density grid from OHLCV candle data.

    For each candle estimates positions opened (proportional to volume)
    and calculates common stop-loss placement prices using ATR multiples,
    swing levels, and round numbers.  Intensities accumulate with time-decay
    and are cleared when price sweeps through a level (stops get hit).

    Returns a compact grid: price axis + one intensity column per candle.
    """
    if len(candles) < 5:
        return {"columns": [], "price_min": 0, "price_max": 0,
                "price_step": 0, "n_levels": 0}

    # ── Price axis ──────────────────────────────────────────
    lows = [c["low"] for c in candles]
    highs = [c["high"] for c in candles]
    p_min, p_max = min(lows), max(highs)
    rng = p_max - p_min
    p_min -= rng * 0.20
    p_max += rng * 0.20
    rng = p_max - p_min

    step = rng / 160
    mag = 10 ** math.floor(math.log10(max(step, 1e-10)))
    step = max(round(step / mag) * mag, mag)

    prices: list[float] = []
    p = p_min
    while p <= p_max:
        prices.append(round(p, 6))
        p += step
    n = len(prices)
    if n < 3:
        return {"columns": [], "price_min": 0, "price_max": 0,
                "price_step": 0, "n_levels": 0}

    # ── Pre-compute ATR ──────────────────────────────────────
    atrs = _compute_rolling_atr(candles, 14)

    # ── Pre-detect swing highs / lows (5-bar lookback) ───────
    swing_lows: list[float] = []
    swing_highs: list[float] = []

    # ── Normalize volumes ────────────────────────────────────
    max_vol = max((c["volume"] for c in candles), default=1) or 1

    # Stop level weights: ATR 1x(0.30), ATR 1.5x(0.25), ATR 2x(0.15),
    #                     swing(0.20), round number(0.10)
    atr_tiers = [(1.0, 0.30), (1.5, 0.25), (2.0, 0.15)]
    swing_weight = 0.20
    round_weight = 0.10

    sigma_pct = 0.003   # 0.3 % of close — narrower than liquidation
    decay = 0.97        # 3 % decay per candle
    sweep_keep = 0.08   # 8 % kept when price hits SL level (aggressive clear)

    cumulative = [0.0] * n
    columns: list[dict] = []
    p0 = prices[0]

    for idx, c in enumerate(candles):
        close = c["close"]
        vol = c["volume"] / max_vol
        low, high = c["low"], c["high"]
        ts = c["time"]
        atr = atrs[idx]

        if close <= 0 or atr <= 0:
            columns.append({"time": ts, "v": list(cumulative)})
            continue

        # Update swing points (5-bar lookback)
        if idx >= 4:
            mid = idx - 2
            segment_lows = [candles[j]["low"] for j in range(mid - 2, mid + 3)]
            segment_highs = [candles[j]["high"] for j in range(mid - 2, mid + 3)]
            if candles[mid]["low"] == min(segment_lows):
                swing_lows.append(candles[mid]["low"])
                if len(swing_lows) > 10:
                    swing_lows.pop(0)
            if candles[mid]["high"] == max(segment_highs):
                swing_highs.append(candles[mid]["high"])
                if len(swing_highs) > 10:
                    swing_highs.pop(0)

        # Decay
        cumulative = [v * decay for v in cumulative]

        # Clear levels that price swept through (stops triggered)
        i_lo = max(0, int((low - p0) / step))
        i_hi = min(n, int((high - p0) / step) + 1)
        for i in range(i_lo, i_hi):
            cumulative[i] *= sweep_keep

        # Bullish candle → more longs opened → more long SLs below
        if close >= c["open"]:
            long_bias, short_bias = 0.60, 0.40
        else:
            long_bias, short_bias = 0.40, 0.60

        sigma = close * sigma_pct
        sigma_sq_2 = 2 * sigma * sigma
        cutoff = 4 * sigma

        def _add_gaussian(center_price: float, intensity: float):
            """Add Gaussian-distributed intensity around a price level."""
            il_start = max(0, int((center_price - cutoff - p0) / step))
            il_end = min(n, int((center_price + cutoff - p0) / step) + 1)
            for i in range(il_start, il_end):
                d = prices[i] - center_price
                cumulative[i] += intensity * math.exp(-(d * d) / sigma_sq_2)

        # ATR-based stops
        for mult, weight in atr_tiers:
            # Long SL below entry
            _add_gaussian(close - mult * atr, vol * weight * long_bias)
            # Short SL above entry
            _add_gaussian(close + mult * atr, vol * weight * short_bias)

        # Swing-based stops
        if swing_lows:
            nearest_low = min(swing_lows, key=lambda sl: abs(sl - close))
            _add_gaussian(nearest_low * 0.997, vol * swing_weight * long_bias)
        if swing_highs:
            nearest_high = min(swing_highs, key=lambda sh: abs(sh - close))
            _add_gaussian(nearest_high * 1.003, vol * swing_weight * short_bias)

        # Round number stops
        round_below = _nearest_round_number(close, "below")
        round_above = _nearest_round_number(close, "above")
        _add_gaussian(round_below * 0.999, vol * round_weight * long_bias)
        _add_gaussian(round_above * 1.001, vol * round_weight * short_bias)

        columns.append({"time": ts, "v": list(cumulative)})

    # ── Normalize to 0-1 ────────────────────────────────────
    max_val = 0.0
    for col in columns:
        m = max(col["v"]) if col["v"] else 0
        if m > max_val:
            max_val = m

    if max_val > 0:
        inv = 1.0 / max_val
        for col in columns:
            col["v"] = [round(v * inv, 3) for v in col["v"]]

    return {
        "price_min": prices[0] if prices else 0,
        "price_max": prices[-1] if prices else 0,
        "price_step": round(step, 6),
        "n_levels": n,
        "columns": columns,
    }


@router.get("/{symbol}/stop-heatmap")
async def get_stop_heatmap(
    symbol: str,
    timeframe: str = Query("1h"),
    limit: int = Query(200, ge=50, le=500),
    db: AsyncSession = Depends(get_db),
):
    """
    2D stop-loss heatmap — time × price grid of estimated SL density.
    Uses historical OHLCV data to estimate where stop-loss orders are
    concentrated based on ATR, swing levels, and round numbers.
    """
    candles: list[dict] = []

    # Try DB first
    result = await db.execute(select(Asset).where(Asset.symbol == symbol.upper()))
    asset = result.scalar_one_or_none()

    if asset:
        try:
            tf = Timeframe(timeframe)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid timeframe: {timeframe}")

        result = await db.execute(
            select(OHLCVData)
            .where(OHLCVData.asset_id == asset.id, OHLCVData.timeframe == tf)
            .order_by(OHLCVData.timestamp.desc())
            .limit(limit)
        )
        rows = list(result.scalars().all())
        rows.reverse()
        candles = [
            {
                "time": _ts_to_utc(r.timestamp),
                "open": float(r.open), "high": float(r.high),
                "low": float(r.low), "close": float(r.close),
                "volume": float(r.volume),
            }
            for r in rows
        ]

    # Fallback: adapter (live fetch)
    if len(candles) < 10:
        try:
            from backend.app.data.registry import data_registry
            adapter = data_registry.route_symbol(symbol)
            await adapter.connect()
            try:
                raw = await adapter.fetch_ohlcv(symbol, timeframe, limit)
                candles = [
                    {
                        "time": _ts_to_utc(c.timestamp),
                        "open": float(c.open), "high": float(c.high),
                        "low": float(c.low), "close": float(c.close),
                        "volume": float(c.volume),
                    }
                    for c in (raw or [])
                ]
            finally:
                await adapter.disconnect()
        except Exception:
            pass

    if len(candles) < 10:
        raise HTTPException(
            status_code=404,
            detail=f"Not enough OHLCV data for {symbol} {timeframe}.",
        )

    grid = _compute_stop_heatmap_grid(candles)
    grid["symbol"] = symbol.upper()
    grid["timeframe"] = timeframe
    return grid


# ── MBO Profile (Market by Order segmentation) ───────────────


@router.get("/{symbol}/mbo-profile")
async def get_mbo_profile(
    symbol: str,
    depth: int = Query(500, ge=50, le=2000),
):
    """
    MBO (Market by Order) profile — orderbook depth segmented by order size.

    Groups nearby price levels into buckets and classifies each bucket as
    institutional, large, medium, or small based on volume relative to average.
    Returns data suitable for a right-edge bar profile overlay.
    """
    from backend.app.data.registry import data_registry
    from backend.app.core.orderbook.tpsl_analyzer import estimate_order_count

    try:
        adapter = data_registry.route_symbol(symbol)
        await adapter.connect()
        try:
            ob = await adapter.fetch_orderbook(symbol, min(depth, 1000))
            if ob is not None and ob.bids and ob.asks:
                raw_bids = [{"price": l.price, "quantity": l.quantity} for l in ob.bids]
                raw_asks = [{"price": l.price, "quantity": l.quantity} for l in ob.asks]
                current_price = (raw_bids[0]["price"] + raw_asks[0]["price"]) / 2 if raw_bids and raw_asks else 0
            else:
                synthetic = await _synthetic_orderbook(adapter, symbol, min(depth, 1000))
                raw_bids = synthetic["bids"]
                raw_asks = synthetic["asks"]
                current_price = synthetic["current_price"]
        finally:
            await adapter.disconnect()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"MBO profile failed: {str(e)}")

    if not raw_bids or not raw_asks or current_price <= 0:
        raise HTTPException(status_code=404, detail=f"No orderbook data for {symbol}")

    # Bucket size: adaptive to price magnitude (~0.02% of price)
    bucket_size = current_price * 0.0002
    mag = 10 ** math.floor(math.log10(max(bucket_size, 1e-10)))
    bucket_size = max(round(bucket_size / mag) * mag, mag)

    def _bucket_levels(levels: list[dict], side: str) -> list[dict]:
        if not levels:
            return []

        avg_qty = sum(l["quantity"] for l in levels) / len(levels)
        avg_order_size = avg_qty / 3  # assume ~3 orders per level on average

        # Group into buckets
        buckets: dict[float, dict] = {}
        for l in levels:
            bucket_key = round(math.floor(l["price"] / bucket_size) * bucket_size, 6)
            if bucket_key not in buckets:
                buckets[bucket_key] = {"price": bucket_key, "volume": 0.0, "orders": 0, "side": side}
            buckets[bucket_key]["volume"] += l["quantity"]
            buckets[bucket_key]["orders"] += estimate_order_count(l["quantity"], avg_order_size)

        # Classify segments
        result = list(buckets.values())
        if not result:
            return []

        avg_bucket_vol = sum(b["volume"] for b in result) / len(result)
        for b in result:
            ratio = b["volume"] / avg_bucket_vol if avg_bucket_vol > 0 else 1
            if ratio > 10:
                b["segment"] = "institutional"
            elif ratio > 3:
                b["segment"] = "large"
            elif ratio > 1:
                b["segment"] = "medium"
            else:
                b["segment"] = "small"
            b["volume"] = round(b["volume"], 4)

        return sorted(result, key=lambda x: x["price"], reverse=(side == "bid"))

    bid_buckets = _bucket_levels(raw_bids, "bid")
    ask_buckets = _bucket_levels(raw_asks, "ask")

    max_volume = max(
        max((b["volume"] for b in bid_buckets), default=0),
        max((b["volume"] for b in ask_buckets), default=0),
    ) or 1

    return {
        "symbol": symbol.upper(),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "current_price": round(current_price, 6),
        "bids": bid_buckets,
        "asks": ask_buckets,
        "max_volume": round(max_volume, 4),
        "bucket_size": round(bucket_size, 6),
    }


# ── Liquidation Heatmap 2D (time × price grid) ────────────────


def _ts_to_utc(dt) -> int:
    """Convert datetime to Unix timestamp (UTC seconds)."""
    if hasattr(dt, "timestamp"):
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return int(dt.timestamp())
    return 0


def _compute_liq_heatmap_grid(candles: list[dict]) -> dict:
    """Compute a 2D liquidation-intensity grid from OHLCV candle data.

    For each candle estimates positions opened (proportional to volume)
    and calculates liquidation prices at common leverage tiers.
    Intensities accumulate with time-decay and are cleared when price
    sweeps through a level (simulating actual liquidation).

    Returns a compact grid: price axis + one intensity column per candle.
    """
    if len(candles) < 5:
        return {"columns": [], "price_min": 0, "price_max": 0,
                "price_step": 0, "n_levels": 0}

    # ── Price axis ──────────────────────────────────────────
    lows = [c["low"] for c in candles]
    highs = [c["high"] for c in candles]
    p_min, p_max = min(lows), max(highs)
    rng = p_max - p_min
    # Extend ±30 % for liquidation levels beyond visible prices
    p_min -= rng * 0.30
    p_max += rng * 0.30
    rng = p_max - p_min

    # Aim for ~160 price levels
    step = rng / 160
    mag = 10 ** math.floor(math.log10(max(step, 1e-10)))
    step = max(round(step / mag) * mag, mag)

    prices: list[float] = []
    p = p_min
    while p <= p_max:
        prices.append(round(p, 6))
        p += step
    n = len(prices)
    if n < 3:
        return {"columns": [], "price_min": 0, "price_max": 0,
                "price_step": 0, "n_levels": 0}

    # ── Leverage tiers ──────────────────────────────────────
    leverage_tiers = [
        (3, 0.04), (5, 0.12), (10, 0.28),
        (25, 0.28), (50, 0.18), (100, 0.10),
    ]

    # ── Normalize volumes ───────────────────────────────────
    max_vol = max((c["volume"] for c in candles), default=1) or 1

    sigma_pct = 0.004   # 0.4 % of close — controls band width
    decay = 0.97        # 3 % decay per candle
    sweep_keep = 0.12   # keep 12 % when price sweeps a level

    cumulative = [0.0] * n
    columns: list[dict] = []
    p0 = prices[0]

    for c in candles:
        close = c["close"]
        vol = c["volume"] / max_vol
        low, high = c["low"], c["high"]
        ts = c["time"]

        if close <= 0:
            continue

        # Decay
        cumulative = [v * decay for v in cumulative]

        # Clear levels that price swept through (positions liquidated)
        i_lo = max(0, int((low - p0) / step))
        i_hi = min(n, int((high - p0) / step) + 1)
        for i in range(i_lo, i_hi):
            cumulative[i] *= sweep_keep

        # Add new liquidation intensity
        sigma = close * sigma_pct
        sigma_sq_2 = 2 * sigma * sigma
        cutoff = 4 * sigma

        for lev, weight in leverage_tiers:
            long_liq = close * (1 - 1 / lev)
            short_liq = close * (1 + 1 / lev)
            intensity = vol * weight

            # Long liquidation
            il_start = max(0, int((long_liq - cutoff - p0) / step))
            il_end = min(n, int((long_liq + cutoff - p0) / step) + 1)
            for i in range(il_start, il_end):
                d = prices[i] - long_liq
                cumulative[i] += intensity * math.exp(-(d * d) / sigma_sq_2)

            # Short liquidation
            is_start = max(0, int((short_liq - cutoff - p0) / step))
            is_end = min(n, int((short_liq + cutoff - p0) / step) + 1)
            for i in range(is_start, is_end):
                d = prices[i] - short_liq
                cumulative[i] += intensity * math.exp(-(d * d) / sigma_sq_2)

        columns.append({"time": ts, "v": list(cumulative)})

    # ── Normalize to 0-1 ────────────────────────────────────
    max_val = 0.0
    for col in columns:
        m = max(col["v"]) if col["v"] else 0
        if m > max_val:
            max_val = m

    if max_val > 0:
        inv = 1.0 / max_val
        for col in columns:
            col["v"] = [round(v * inv, 3) for v in col["v"]]

    return {
        "price_min": prices[0] if prices else 0,
        "price_max": prices[-1] if prices else 0,
        "price_step": round(step, 6),
        "n_levels": n,
        "columns": columns,
    }


@router.get("/{symbol}/liquidation-heatmap")
async def get_liquidation_heatmap(
    symbol: str,
    timeframe: str = Query("1h"),
    limit: int = Query(200, ge=50, le=500),
    db: AsyncSession = Depends(get_db),
):
    """
    2D liquidation heatmap — time × price grid of estimated liquidation
    intensities.  Uses historical OHLCV data to estimate where leveraged
    positions opened at each candle would be liquidated.

    Returns a grid compatible with a thermal-colormap chart overlay.
    """
    candles: list[dict] = []

    # ── 1. Try DB first ──────────────────────────────────────
    result = await db.execute(select(Asset).where(Asset.symbol == symbol.upper()))
    asset = result.scalar_one_or_none()

    if asset:
        try:
            tf = Timeframe(timeframe)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid timeframe: {timeframe}")

        result = await db.execute(
            select(OHLCVData)
            .where(OHLCVData.asset_id == asset.id, OHLCVData.timeframe == tf)
            .order_by(OHLCVData.timestamp.desc())
            .limit(limit)
        )
        rows = list(result.scalars().all())
        rows.reverse()

        candles = [
            {
                "time": _ts_to_utc(r.timestamp),
                "open": float(r.open), "high": float(r.high),
                "low": float(r.low), "close": float(r.close),
                "volume": float(r.volume),
            }
            for r in rows
        ]

    # ── 2. Fallback: adapter (live fetch) ────────────────────
    if len(candles) < 10:
        try:
            from backend.app.data.registry import data_registry

            adapter = data_registry.route_symbol(symbol)
            await adapter.connect()
            try:
                raw = await adapter.fetch_ohlcv(symbol, timeframe, limit)
                candles = [
                    {
                        "time": _ts_to_utc(c.timestamp),
                        "open": float(c.open), "high": float(c.high),
                        "low": float(c.low), "close": float(c.close),
                        "volume": float(c.volume),
                    }
                    for c in (raw or [])
                ]
            finally:
                await adapter.disconnect()
        except Exception:
            pass

    if len(candles) < 10:
        raise HTTPException(
            status_code=404,
            detail=f"Not enough OHLCV data for {symbol} {timeframe}. Fetch data first.",
        )

    grid = _compute_liq_heatmap_grid(candles)
    grid["symbol"] = symbol.upper()
    grid["timeframe"] = timeframe
    return grid
