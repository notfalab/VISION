"""Price data endpoints — OHLCV queries, ingestion trigger, and live prices."""

import math
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
    rows = list(result.scalars().all())

    # Deduplicate daily/weekly/monthly candles by period (keep latest per day/week)
    if timeframe in ("1d", "1w", "1M"):
        seen: dict[str, object] = {}
        deduped = []
        for r in rows:
            ts = r.timestamp
            if timeframe == "1d":
                key = ts.strftime("%Y-%m-%d") if hasattr(ts, "strftime") else str(ts)[:10]
            elif timeframe == "1w":
                # Week key: ISO year-week
                key = ts.strftime("%Y-W%W") if hasattr(ts, "strftime") else str(ts)[:10]
            else:
                key = ts.strftime("%Y-%m") if hasattr(ts, "strftime") else str(ts)[:7]
            if key not in seen:
                seen[key] = True
                deduped.append(r)
        rows = deduped

    return rows


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


@router.post("/{symbol}/dedup")
async def deduplicate_candles(
    symbol: str,
    timeframe: str = Query("1d"),
    db: AsyncSession = Depends(get_db),
):
    """Remove duplicate candles for daily/weekly/monthly timeframes.

    Keeps only one candle per period (the one with the latest timestamp).
    """
    from sqlalchemy import text

    result = await db.execute(select(Asset).where(Asset.symbol == symbol.upper()))
    asset = result.scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=404, detail=f"Asset {symbol} not found")

    try:
        tf = Timeframe(timeframe)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid timeframe: {timeframe}")

    if timeframe == "1d":
        trunc = "day"
    elif timeframe == "1w":
        trunc = "week"
    elif timeframe == "1M":
        trunc = "month"
    else:
        return {"symbol": symbol.upper(), "timeframe": timeframe, "deleted": 0, "msg": "No dedup needed for intraday"}

    # Delete duplicates: keep the row with the max id per truncated period
    delete_sql = text(f"""
        DELETE FROM ohlcv_data
        WHERE id NOT IN (
            SELECT MAX(id)
            FROM ohlcv_data
            WHERE asset_id = :asset_id AND timeframe = :tf
            GROUP BY date_trunc('{trunc}', timestamp)
        )
        AND asset_id = :asset_id AND timeframe = :tf
    """)

    result = await db.execute(delete_sql, {"asset_id": asset.id, "tf": timeframe})
    deleted = result.rowcount
    await db.commit()

    return {"symbol": symbol.upper(), "timeframe": timeframe, "deleted": deleted}


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
    """Fetch REAL order book data. No synthetic/simulated data.

    Sources: Binance (crypto), OANDA (forex/gold).
    """
    try:
        bids, asks, _, ts = await _get_real_orderbook(symbol, depth)
        return {
            "symbol": symbol.upper(),
            "timestamp": ts,
            "bids": bids,
            "asks": asks,
        }
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


# ── Real Orderbook Helper ─────────────────────────────────────


async def _get_real_orderbook(symbol: str, depth: int) -> tuple[list, list, float, str]:
    """Fetch REAL orderbook data via registry. No synthetic fallbacks.

    Returns (bids, asks, current_price, timestamp_iso) or raises HTTPException.
    """
    from backend.app.data.registry import data_registry

    ob = await data_registry.fetch_real_orderbook(symbol, depth)
    if ob is None or not ob.bids or not ob.asks:
        raise HTTPException(
            status_code=404,
            detail=f"No real orderbook data available for {symbol}. "
                   f"Supported: Binance (crypto), OANDA (forex/gold)."
        )

    bids = [{"price": l.price, "quantity": l.quantity} for l in ob.bids]
    asks = [{"price": l.price, "quantity": l.quantity} for l in ob.asks]
    current_price = (bids[0]["price"] + asks[0]["price"]) / 2
    ts = ob.timestamp.isoformat() if hasattr(ob.timestamp, "isoformat") else str(ob.timestamp)

    return bids, asks, current_price, ts


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
    from backend.app.core.orderbook.tpsl_analyzer import analyze_tpsl_heatmap

    try:
        bids, asks, current_price, ts = await _get_real_orderbook(symbol, depth)

        result = analyze_tpsl_heatmap(bids, asks, current_price)
        result["symbol"] = symbol.upper()
        result["timestamp"] = ts
        return result
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

    raise HTTPException(
        status_code=404,
        detail=f"No real liquidation data available for {symbol}. "
               f"Configure COINGLASS_API_KEY or ensure Binance Futures is reachable."
    )


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
        ob = await data_registry.fetch_real_orderbook(symbol, min(depth, 1000))
        if ob is None or not ob.bids or not ob.asks:
            raise HTTPException(status_code=404, detail=f"No real orderbook data for {symbol}")

        raw_bids = [{"price": l.price, "quantity": l.quantity, "orders_count": l.orders_count} for l in ob.bids]
        raw_asks = [{"price": l.price, "quantity": l.quantity, "orders_count": l.orders_count} for l in ob.asks]
        ts = ob.timestamp.isoformat()

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


def _detect_fractals(candles: list[dict], lookback: int) -> tuple[list[float], list[float]]:
    """Detect Williams Fractal swing highs/lows with given lookback."""
    half = lookback // 2
    swing_lows: list[float] = []
    swing_highs: list[float] = []
    for i in range(half, len(candles) - half):
        low_i = candles[i]["low"]
        high_i = candles[i]["high"]
        is_low = all(low_i <= candles[j]["low"] for j in range(i - half, i + half + 1) if j != i)
        is_high = all(high_i >= candles[j]["high"] for j in range(i - half, i + half + 1) if j != i)
        if is_low:
            swing_lows.append(low_i)
        if is_high:
            swing_highs.append(high_i)
    return swing_lows, swing_highs


def _compute_vwap_bands(candles: list[dict]) -> tuple[float, float, float, float, float]:
    """Compute session VWAP and ±1σ / ±2σ bands from candle data."""
    cum_pv = 0.0
    cum_vol = 0.0
    cum_pv2 = 0.0
    for c in candles:
        tp = (c["high"] + c["low"] + c["close"]) / 3
        v = c["volume"]
        cum_pv += tp * v
        cum_pv2 += tp * tp * v
        cum_vol += v
    if cum_vol <= 0:
        mid = candles[-1]["close"] if candles else 0
        return mid, mid, mid, mid, mid
    vwap = cum_pv / cum_vol
    var = max(0, cum_pv2 / cum_vol - vwap * vwap)
    sd = math.sqrt(var)
    return vwap, vwap - sd, vwap + sd, vwap - 2 * sd, vwap + 2 * sd


def _detect_prev_day_hl(candles: list[dict]) -> tuple[float | None, float | None]:
    """Detect previous trading day high/low from intraday candles."""
    if not candles:
        return None, None
    # Group by day, find previous day
    from collections import defaultdict
    days: dict[int, list[dict]] = defaultdict(list)
    for c in candles:
        day_key = c["time"] // 86400
        days[day_key].append(c)
    sorted_days = sorted(days.keys())
    if len(sorted_days) < 2:
        return None, None
    prev_day = days[sorted_days[-2]]
    prev_high = max(c["high"] for c in prev_day)
    prev_low = min(c["low"] for c in prev_day)
    return prev_high, prev_low


def _compute_stop_heatmap_grid(candles: list[dict]) -> dict:
    """Compute a 2D stop-loss density grid from OHLCV candle data.

    Uses 8 stop-placement strategies:
    1. ATR multiples (1x, 1.5x, 2x) — volatility-based
    2. Multi-scale Williams fractals (5, 8, 13 bar) — structural
    3. Fibonacci retracements (38.2%, 50%, 61.8%) — institutional
    4. Round numbers — psychological
    5. VWAP ±1σ/±2σ bands — institutional reference
    6. Previous day high/low — major intraday levels

    Intensities accumulate with time-decay and clear on price sweeps.
    """
    if len(candles) < 5:
        return {"columns": [], "price_min": 0, "price_max": 0,
                "price_step": 0, "n_levels": 0}

    # ── Price axis (±20 %) ───────────────────────────────────
    lows = [c["low"] for c in candles]
    highs = [c["high"] for c in candles]
    p_min, p_max = min(lows), max(highs)
    rng = p_max - p_min
    p_min -= rng * 0.20
    p_max += rng * 0.20
    rng = p_max - p_min

    # 200 levels for higher resolution
    step = rng / 200
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

    # ── Multi-scale Williams Fractals (5, 8, 13 bar) ─────────
    # Weight by scale: larger fractals = stronger support/resistance
    fractal_scales = [(5, 0.5), (8, 0.7), (13, 1.0)]
    all_swing_lows: list[tuple[float, float]] = []   # (price, weight)
    all_swing_highs: list[tuple[float, float]] = []
    for lookback, frac_w in fractal_scales:
        sl, sh = _detect_fractals(candles, lookback)
        for p in sl[-20:]:
            all_swing_lows.append((p, frac_w))
        for p in sh[-20:]:
            all_swing_highs.append((p, frac_w))

    # ── Fibonacci retracement levels from major swings ───────
    fib_levels: list[float] = []
    _, sh_13 = _detect_fractals(candles, 13)
    sl_13, _ = _detect_fractals(candles, 13)
    if sh_13 and sl_13:
        # Use the most recent major swing high and low
        swing_h = max(sh_13[-5:]) if sh_13 else p_max
        swing_l = min(sl_13[-5:]) if sl_13 else p_min
        fib_range = swing_h - swing_l
        if fib_range > 0:
            for fib in [0.236, 0.382, 0.500, 0.618, 0.786]:
                fib_levels.append(swing_l + fib_range * fib)
                fib_levels.append(swing_h - fib_range * fib)

    # ── VWAP bands ───────────────────────────────────────────
    vwap, vwap_m1, vwap_p1, vwap_m2, vwap_p2 = _compute_vwap_bands(candles)
    vwap_levels = [vwap_m1, vwap_p1, vwap_m2, vwap_p2]

    # ── Previous day high/low ────────────────────────────────
    prev_high, prev_low = _detect_prev_day_hl(candles)

    # ── Normalize volumes ────────────────────────────────────
    max_vol = max((c["volume"] for c in candles), default=1) or 1

    # Rebalanced weights (sum = 1.0)
    atr_tiers = [(1.0, 0.22), (1.5, 0.18), (2.0, 0.10)]
    swing_weight = 0.18
    fib_weight = 0.12
    round_weight = 0.08
    vwap_weight = 0.06
    prev_hl_weight = 0.06

    decay = 0.975       # slower decay — stops persist
    sweep_keep = 0.03   # aggressive clear when stops are hit

    cumulative = [0.0] * n
    columns: list[dict] = []
    p0 = prices[0]

    for idx, c in enumerate(candles):
        close = c["close"]
        vol = c["volume"] / max_vol
        low, high = c["low"], c["high"]
        o = c["open"]
        ts = c["time"]
        atr = atrs[idx]

        if close <= 0 or atr <= 0:
            columns.append({"time": ts, "v": list(cumulative)})
            continue

        # Decay
        cumulative = [v * decay for v in cumulative]

        # Clear levels that price swept through (stops triggered)
        i_lo = max(0, int((low - p0) / step))
        i_hi = min(n, int((high - p0) / step) + 1)
        for i in range(i_lo, i_hi):
            cumulative[i] *= sweep_keep

        # Volume-delta directional bias (tanh for smooth clamping)
        body_ratio = (close - o) / max(high - low, atr * 0.01)
        long_bias = 0.5 + 0.3 * math.tanh(body_ratio * 2)
        short_bias = 1.0 - long_bias

        # Adaptive sigma from ATR
        sigma = atr * 0.35
        sigma_sq_2 = 2 * sigma * sigma
        cutoff = 4 * sigma

        # Volume scaling with body conviction
        vol_scaled = vol * (0.5 + 0.5 * min(abs(body_ratio), 1.0))

        def _add_gauss(center: float, intensity: float):
            il_s = max(0, int((center - cutoff - p0) / step))
            il_e = min(n, int((center + cutoff - p0) / step) + 1)
            for i in range(il_s, il_e):
                d = prices[i] - center
                cumulative[i] += intensity * math.exp(-(d * d) / sigma_sq_2)

        # 1. ATR-based stops
        for mult, weight in atr_tiers:
            _add_gauss(close - mult * atr, vol_scaled * weight * long_bias)
            _add_gauss(close + mult * atr, vol_scaled * weight * short_bias)

        # 2. Multi-scale swing-based stops
        if all_swing_lows:
            # Use closest swing lows, weighted by fractal scale
            for sw_price, sw_w in sorted(all_swing_lows, key=lambda x: abs(x[0] - close))[:3]:
                _add_gauss(sw_price * 0.997, vol_scaled * swing_weight * sw_w * long_bias * 0.4)
        if all_swing_highs:
            for sw_price, sw_w in sorted(all_swing_highs, key=lambda x: abs(x[0] - close))[:3]:
                _add_gauss(sw_price * 1.003, vol_scaled * swing_weight * sw_w * short_bias * 0.4)

        # 3. Fibonacci retracement stops
        for fib_price in fib_levels:
            if fib_price < close:
                _add_gauss(fib_price * 0.998, vol_scaled * fib_weight * long_bias * 0.25)
            else:
                _add_gauss(fib_price * 1.002, vol_scaled * fib_weight * short_bias * 0.25)

        # 4. Round number stops
        round_below = _nearest_round_number(close, "below")
        round_above = _nearest_round_number(close, "above")
        _add_gauss(round_below * 0.999, vol_scaled * round_weight * long_bias)
        _add_gauss(round_above * 1.001, vol_scaled * round_weight * short_bias)

        # 5. VWAP band stops
        for vl in vwap_levels:
            if vl < close:
                _add_gauss(vl, vol_scaled * vwap_weight * long_bias * 0.35)
            else:
                _add_gauss(vl, vol_scaled * vwap_weight * short_bias * 0.35)

        # 6. Previous day high/low stops
        if prev_high is not None:
            _add_gauss(prev_high * 1.002, vol_scaled * prev_hl_weight * short_bias)
        if prev_low is not None:
            _add_gauss(prev_low * 0.998, vol_scaled * prev_hl_weight * long_bias)

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
            col["v"] = [round(v * inv, 2) for v in col["v"]]

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
    limit: int = Query(500, ge=50, le=2000),
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
    grid["data_source"] = "enhanced"
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
        bids_raw, asks_raw, current_price, _ = await _get_real_orderbook(symbol, min(depth, 1000))
        raw_bids = bids_raw
        raw_asks = asks_raw
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"MBO profile failed: {str(e)}")

    # Bucket size: adaptive to price magnitude (~0.15% of price)
    # Larger buckets → fewer levels → clearly visible bars on the chart
    bucket_size = current_price * 0.0015
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


def _compute_liq_heatmap_grid(
    candles: list[dict],
    real_levels: list | None = None,
    funding_rate: float | None = None,
    oi_usd: float | None = None,
) -> dict:
    """Compute a 2D liquidation-intensity grid from OHLCV candle data.

    When *real_levels* (from CoinGlass / Binance Futures) are provided,
    they anchor 70 % of the intensity; the synthetic leverage-tier model
    fills the remaining 30 %.  Without real data the improved synthetic
    model (adaptive ATR sigma, volume-weighted sizing) is used at 100 %.

    Returns a compact grid: price axis + one intensity column per candle.
    """
    if len(candles) < 5:
        return {"columns": [], "price_min": 0, "price_max": 0,
                "price_step": 0, "n_levels": 0}

    # ── Pre-compute ATR for adaptive sigma ───────────────────
    atrs = _compute_rolling_atr(candles, 14)

    # ── Price axis (±30 %) ───────────────────────────────────
    lows = [c["low"] for c in candles]
    highs = [c["high"] for c in candles]
    p_min, p_max = min(lows), max(highs)
    rng = p_max - p_min
    p_min -= rng * 0.30
    p_max += rng * 0.30
    rng = p_max - p_min

    # 220 levels for higher resolution
    step = rng / 220
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

    # ── Leverage tiers (synthetic fallback layer) ────────────
    leverage_tiers = [
        (3, 0.04), (5, 0.12), (10, 0.28),
        (25, 0.28), (50, 0.18), (100, 0.10),
    ]

    # ── Prepare real-data lookup ─────────────────────────────
    has_real = real_levels is not None and len(real_levels) > 0
    real_weight = 0.70 if has_real else 0.0
    synth_weight = 1.0 - real_weight

    # Pre-index real levels into a fast price→(long_usd, short_usd) map
    real_max_usd = 1.0
    if has_real:
        real_max_usd = max(
            max(lv.long_liq_usd, lv.short_liq_usd)
            for lv in real_levels
        ) or 1.0

    # Long/short bias: prefer funding rate when available
    if funding_rate is not None:
        # funding > 0 → more longs (longs pay shorts)
        global_long_bias = 0.5 + min(max(funding_rate * 100, -0.3), 0.3)
    else:
        global_long_bias = None  # will use per-candle direction

    # ── Normalize volumes ───────────────────────────────────
    max_vol = max((c["volume"] for c in candles), default=1) or 1

    decay = 0.985       # slower decay — positions persist longer
    sweep_keep = 0.05   # aggressive clear on cascade liquidations

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

        # Decay
        cumulative = [v * decay for v in cumulative]

        # Clear levels that price swept through (liquidation cascade)
        i_lo = max(0, int((low - p0) / step))
        i_hi = min(n, int((high - p0) / step) + 1)
        for i in range(i_lo, i_hi):
            cumulative[i] *= sweep_keep

        # Adaptive sigma from ATR
        sigma = atr * 0.5
        sigma_sq_2 = 2 * sigma * sigma
        cutoff = 4 * sigma

        # Volume-weighted with body ratio consideration
        body_ratio = abs(close - c["open"]) / max(high - low, atr * 0.01)
        vol_scaled = vol * (0.5 + 0.5 * body_ratio)

        # Per-candle long/short bias
        if global_long_bias is not None:
            l_bias = global_long_bias
        else:
            l_bias = 0.55 if close >= c["open"] else 0.45
        s_bias = 1.0 - l_bias

        def _add_gauss(center: float, intensity: float):
            il_s = max(0, int((center - cutoff - p0) / step))
            il_e = min(n, int((center + cutoff - p0) / step) + 1)
            for i in range(il_s, il_e):
                d = prices[i] - center
                cumulative[i] += intensity * math.exp(-(d * d) / sigma_sq_2)

        # ── Layer 1: Real data anchors (70 %) ────────────────
        if has_real:
            for lv in real_levels:
                norm_long = (lv.long_liq_usd / real_max_usd) * real_weight * vol_scaled
                norm_short = (lv.short_liq_usd / real_max_usd) * real_weight * vol_scaled
                if norm_long > 0.001:
                    _add_gauss(lv.price, norm_long * l_bias)
                if norm_short > 0.001:
                    _add_gauss(lv.price, norm_short * s_bias)

        # ── Layer 2: Synthetic leverage tiers (30 % or 100 %) ─
        for lev, weight in leverage_tiers:
            long_liq = close * (1 - 1 / lev)
            short_liq = close * (1 + 1 / lev)
            intensity = vol_scaled * weight * synth_weight

            _add_gauss(long_liq, intensity * l_bias)
            _add_gauss(short_liq, intensity * s_bias)

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
            col["v"] = [round(v * inv, 2) for v in col["v"]]

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
    limit: int = Query(500, ge=50, le=2000),
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

    # ── 3. For crypto: fetch real liquidation data ────────────
    real_levels = None
    funding_rate = None
    oi_usd = None
    data_source = "synthetic"

    from backend.app.data.coinglass_adapter import CoinglassAdapter, SYMBOL_MAP as CG_SYMBOLS
    if symbol.upper() in CG_SYMBOLS:
        try:
            cg = CoinglassAdapter()
            await cg.connect()
            try:
                import asyncio
                liq_map, oi_data, fr_data = await asyncio.gather(
                    cg.fetch_liquidation_map(symbol),
                    cg.fetch_open_interest(symbol),
                    cg.fetch_funding_rate(symbol),
                )
                if liq_map and liq_map.levels:
                    real_levels = liq_map.levels
                    data_source = "real"
                if oi_data:
                    mark_price = candles[-1]["close"] if candles else 0
                    oi_usd = float(oi_data.get("openInterest", 0)) * mark_price
                if fr_data:
                    funding_rate = float(fr_data.get("lastFundingRate", 0))
                if real_levels is None and (oi_usd or funding_rate):
                    data_source = "hybrid"
            finally:
                await cg.disconnect()
        except Exception:
            pass  # Fall through to synthetic

    grid = _compute_liq_heatmap_grid(
        candles,
        real_levels=real_levels,
        funding_rate=funding_rate,
        oi_usd=oi_usd,
    )
    grid["symbol"] = symbol.upper()
    grid["timeframe"] = timeframe
    grid["data_source"] = data_source
    grid["oi_usd"] = round(oi_usd, 2) if oi_usd else None
    grid["funding_rate"] = round(funding_rate, 6) if funding_rate is not None else None
    return grid


# ── Volume Profile ─────────────────────────────────────────────


@router.get("/{symbol}/volume-profile")
async def get_volume_profile(
    symbol: str,
    timeframe: str = Query("1d"),
    limit: int = Query(200, ge=20, le=2000),
    buckets: int = Query(50, ge=10, le=200),
    db: AsyncSession = Depends(get_db),
):
    """
    Volume Profile — price-bucketed volume distribution with POC, VAH, VAL.
    Shows where most trading volume occurred across price levels.
    """
    import pandas as pd
    from backend.app.core.indicators.volume_profile import calculate_volume_profile

    result = await db.execute(select(Asset).where(Asset.symbol == symbol.upper()))
    asset = result.scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=404, detail=f"Asset {symbol} not found")

    try:
        tf = Timeframe(timeframe)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid timeframe: {timeframe}")

    rows = await db.execute(
        select(OHLCVData)
        .where(OHLCVData.asset_id == asset.id, OHLCVData.timeframe == tf)
        .order_by(OHLCVData.timestamp.desc())
        .limit(limit)
    )
    ohlcv = list(rows.scalars().all())

    if len(ohlcv) < 10:
        raise HTTPException(status_code=404, detail=f"Not enough data for {symbol} {timeframe}")

    df = pd.DataFrame([{
        "open": float(r.open), "high": float(r.high),
        "low": float(r.low), "close": float(r.close),
        "volume": float(r.volume),
    } for r in reversed(ohlcv)])

    profile = calculate_volume_profile(df, n_buckets=buckets)
    profile["symbol"] = symbol.upper()
    profile["timeframe"] = timeframe
    return profile


# ── Liquidity Forecast ─────────────────────────────────────────


@router.get("/{symbol}/liquidity-forecast")
async def get_liquidity_forecast(
    symbol: str,
    timeframe: str = Query("1h"),
    limit: int = Query(200, ge=50, le=500),
    db: AsyncSession = Depends(get_db),
):
    """
    Predictive Liquidity Heatmap — predicts where future liquidity clusters
    will form based on swing analysis, ATR stops, round numbers, and orderbook.
    """
    import pandas as pd
    from backend.app.core.ml.liquidity_predictor import calculate_liquidity_forecast

    result = await db.execute(select(Asset).where(Asset.symbol == symbol.upper()))
    asset = result.scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=404, detail=f"Asset {symbol} not found")

    try:
        tf = Timeframe(timeframe)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid timeframe: {timeframe}")

    rows = await db.execute(
        select(OHLCVData)
        .where(OHLCVData.asset_id == asset.id, OHLCVData.timeframe == tf)
        .order_by(OHLCVData.timestamp.desc())
        .limit(limit)
    )
    ohlcv = list(rows.scalars().all())

    if len(ohlcv) < 20:
        raise HTTPException(status_code=404, detail=f"Not enough data for {symbol} {timeframe}")

    df = pd.DataFrame([{
        "timestamp": r.timestamp,
        "open": float(r.open), "high": float(r.high),
        "low": float(r.low), "close": float(r.close),
        "volume": float(r.volume),
    } for r in reversed(ohlcv)])

    # Get orderbook data if available
    ob_data = None
    try:
        from backend.app.data.registry import data_registry
        ob = await data_registry.fetch_real_orderbook(symbol, 100)
        if ob and ob.bids and ob.asks:
            ob_data = {
                "bids": [{"price": l.price, "quantity": l.quantity} for l in ob.bids],
                "asks": [{"price": l.price, "quantity": l.quantity} for l in ob.asks],
            }
    except Exception:
        pass

    forecast = calculate_liquidity_forecast(df, orderbook_data=ob_data)
    forecast["symbol"] = symbol.upper()
    forecast["timeframe"] = timeframe
    return forecast
