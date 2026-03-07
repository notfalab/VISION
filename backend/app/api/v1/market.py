"""Market-wide endpoints — overview, correlations, institutional summary."""

import asyncio
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.api.deps import get_db
from backend.app.models.asset import Asset, MarketType
from backend.app.models.ohlcv import OHLCVData, Timeframe

router = APIRouter(prefix="/market", tags=["market"])

# ── Symbol grouping for display ──────────────────────────────────────────

_CRYPTO_SYMBOLS = {
    "BTCUSD", "ETHUSD", "SOLUSD", "XRPUSD", "DOGEUSD", "BNBUSD", "ADAUSD",
    "PEPEUSD", "TRXUSD", "SUIUSD", "NEARUSD", "AVAXUSD", "LINKUSD", "LTCUSD",
    "AAVEUSD", "TAOUSD", "BCHUSD", "UNIUSD", "DOTUSD", "ICPUSD", "APTUSD",
    "SHIBUSD", "HBARUSD", "FILUSD", "XLMUSD", "ARBUSD", "SEIUSD", "TONUSD",
    "ONDOUSD", "BONKUSD", "ENAUSD", "WLDUSD", "TIAUSD", "RENDERUSD", "FTMUSD",
    "INJUSD", "OPUSD", "MATICUSD", "ATOMUSD", "WIFUSD", "ETHBTC",
}

_FOREX_MAJORS = {"EURUSD", "GBPUSD", "USDJPY", "USDCHF", "AUDUSD", "USDCAD", "NZDUSD"}

_FOREX_MINORS = {
    "EURGBP", "EURJPY", "GBPJPY", "EURCHF", "GBPAUD", "EURAUD", "GBPCAD",
    "AUDNZD", "AUDCAD", "AUDJPY", "NZDJPY", "CADJPY", "CADCHF", "NZDCAD",
    "EURNZD", "GBPCHF", "GBPNZD", "EURCAD", "AUDCHF", "NZDCHF", "CHFJPY",
}

def _get_group(symbol: str) -> str:
    if symbol in _CRYPTO_SYMBOLS:
        return "Crypto"
    if symbol in _FOREX_MAJORS:
        return "Forex Majors"
    if symbol in _FOREX_MINORS:
        return "Forex Minors"
    if symbol in ("XAUUSD", "XAGUSD"):
        return "Commodities"
    if symbol in ("NAS100", "SPX500"):
        return "Indices"
    return "Other"

_MAJOR_SYMBOLS = {
    "EURUSD", "GBPUSD", "USDJPY", "XAUUSD", "BTCUSD", "ETHUSD",
    "NAS100", "SPX500", "AUDUSD", "USDCAD",
}


@router.get("/overview")
async def market_overview(db: AsyncSession = Depends(get_db)):
    """
    Global market overview — all active symbols with price, change, regime.
    Powers the Heat Map page.
    Chain: Redis → DB → Live adapter (same as /prices/{symbol}/latest).
    """
    from backend.app.data.redis_pubsub import get_latest_price, cache_latest_price

    # 1. Get all active assets
    result = await db.execute(
        select(Asset).where(Asset.is_active.is_(True)).order_by(Asset.symbol)
    )
    assets = result.scalars().all()

    # 2. Fan out price reads: Redis → DB → live adapter
    async def get_tile(asset: Asset):
        def _make_tile(price, open_price, high, low, volume, timestamp):
            change_pct = ((price - open_price) / open_price * 100) if open_price else 0
            return {
                "symbol": asset.symbol,
                "name": asset.name,
                "market_type": asset.market_type.value if hasattr(asset.market_type, "value") else str(asset.market_type),
                "group": _get_group(asset.symbol),
                "price": round(float(price), 5),
                "change_pct": round(float(change_pct), 3),
                "volume": float(volume),
                "high": float(high),
                "low": float(low),
                "timestamp": timestamp,
                "is_major": asset.symbol in _MAJOR_SYMBOLS,
            }

        # ── Try Redis ──
        try:
            cached = await get_latest_price(asset.symbol)
            if cached and cached.get("price"):
                p = cached["price"]
                return _make_tile(p, cached.get("open", p), cached.get("high", p),
                                  cached.get("low", p), cached.get("volume", 0),
                                  cached.get("timestamp"))
        except Exception:
            pass

        # ── DB fallback ──
        try:
            cutoff = datetime.now(timezone.utc) - timedelta(days=7)
            rows = await db.execute(
                select(OHLCVData)
                .where(OHLCVData.asset_id == asset.id, OHLCVData.timestamp >= cutoff)
                .order_by(OHLCVData.timestamp.desc())
                .limit(2)
            )
            candles = rows.scalars().all()
            if candles:
                latest = candles[0]
                price = float(latest.close)
                open_price = float(candles[1].close) if len(candles) > 1 else float(latest.open)
                ts = latest.timestamp.isoformat() if hasattr(latest.timestamp, "isoformat") else str(latest.timestamp)
                return _make_tile(price, open_price, float(latest.high),
                                  float(latest.low), float(latest.volume), ts)
        except Exception:
            pass

        # ── Live adapter fallback (same chain as /prices/{symbol}/latest) ──
        try:
            from backend.app.data.registry import data_registry
            adapter = data_registry.route_symbol(asset.symbol)
            await adapter.connect()
            try:
                ticker = await adapter.fetch_ticker(asset.symbol)
                if ticker and ticker.get("price", 0) > 0:
                    p = float(ticker["price"])
                    op = float(ticker.get("open", p))
                    hi = float(ticker.get("high", p))
                    lo = float(ticker.get("low", p))
                    vol = float(ticker.get("volume", 0))
                    ts_raw = ticker.get("timestamp", "")
                    if ts_raw:
                        import pandas as _pd
                        ts_dt = _pd.Timestamp(ts_raw)
                        if ts_dt.tzinfo is None:
                            ts_dt = ts_dt.tz_localize("UTC")
                        ts = ts_dt.to_pydatetime()
                    else:
                        ts = datetime.now(timezone.utc)
                    # Cache for next request
                    from backend.app.data.base import Candle
                    await cache_latest_price(asset.symbol, Candle(
                        timestamp=ts, open=op, high=hi, low=lo, close=p, volume=vol,
                    ))
                    ts_str = ts.isoformat() if hasattr(ts, "isoformat") else str(ts)
                    return _make_tile(p, op, hi, lo, vol, ts_str)
            finally:
                await adapter.disconnect()
        except Exception:
            pass

        return None

    tiles = await asyncio.gather(*[get_tile(a) for a in assets])
    tiles = [t for t in tiles if t is not None]

    return {
        "tiles": tiles,
        "count": len(tiles),
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/correlations")
async def market_correlations(
    period: int = Query(30, ge=10, le=90, description="Days of data"),
    group: str = Query("forex", description="forex | crypto | all"),
    db: AsyncSession = Depends(get_db),
):
    """
    NxN Pearson correlation matrix across symbols.
    Detects correlation breaks vs historical norms.
    Falls back to H1 data if D1 is insufficient.
    """
    import numpy as np
    import pandas as pd

    # 1. Determine symbols for this group
    group_filters = {
        "forex": [MarketType.FOREX, MarketType.COMMODITY],
        "crypto": [MarketType.CRYPTO],
        "all": [MarketType.FOREX, MarketType.CRYPTO, MarketType.COMMODITY, MarketType.INDEX],
    }
    market_types = group_filters.get(group, group_filters["forex"])

    result = await db.execute(
        select(Asset)
        .where(Asset.is_active.is_(True), Asset.market_type.in_(market_types))
        .order_by(Asset.symbol)
    )
    assets = result.scalars().all()

    empty_response = {
        "symbols": [], "matrix": [], "correlation_breaks": [],
        "period_days": period, "group": group,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }

    if len(assets) < 2:
        return {**empty_response, "error": "Not enough assets for correlation"}

    # 2. Fetch daily closes — try D1, then H4, H1, M30 resampled to daily
    fetch_period = max(period, 90)
    symbol_closes: dict[str, pd.Series] = {}

    # Timeframes to try, in preference order, with candles-per-day multiplier
    _TF_CHAIN = [
        (Timeframe.D1, 1),
        (Timeframe.H4, 6),
        (Timeframe.H1, 24),
        (Timeframe.M30, 48),
        (Timeframe.M15, 96),
    ]

    for asset in assets:
        found = False
        for tf, cpd in _TF_CHAIN:
            query = (
                select(OHLCVData.timestamp, OHLCVData.close)
                .where(OHLCVData.asset_id == asset.id, OHLCVData.timeframe == tf)
                .order_by(OHLCVData.timestamp.desc())
                .limit(fetch_period * cpd)
            )
            rows = await db.execute(query)
            data = rows.all()

            if tf == Timeframe.D1 and len(data) >= 10:
                series = pd.Series(
                    {row.timestamp: float(row.close) for row in reversed(data)}
                )
                symbol_closes[asset.symbol] = series
                found = True
                break

            if tf != Timeframe.D1 and len(data) >= cpd:
                s = pd.Series(
                    {row.timestamp: float(row.close) for row in reversed(data)}
                )
                s.index = pd.to_datetime(s.index)
                daily = s.resample("1D").last().dropna()
                if len(daily) >= 10:
                    symbol_closes[asset.symbol] = daily
                    found = True
                    break

        if found:
            continue

    if len(symbol_closes) < 2:
        return {**empty_response, "error": "Not enough price data for correlation"}

    # 3. Build DataFrame and compute correlations
    try:
        df = pd.DataFrame(symbol_closes)
        df = df.dropna(axis=1, thresh=max(1, int(len(df) * 0.5)))
        df = df.ffill().bfill()

        symbols = list(df.columns)
        returns = df.pct_change().dropna()

        if len(returns) < 5 or len(symbols) < 2:
            return {**empty_response, "error": "Not enough data points for correlation"}

        current_returns = returns.tail(period)
        corr_matrix = current_returns.corr().fillna(0)
        hist_corr = returns.corr().fillna(0)

    except Exception as e:
        return {**empty_response, "error": f"Correlation computation failed: {str(e)}"}

    # 4. Detect correlation breaks
    breaks = []
    for i, s1 in enumerate(symbols):
        for j, s2 in enumerate(symbols):
            if j <= i:
                continue
            try:
                current_val = float(corr_matrix.loc[s1, s2])
                hist_val = float(hist_corr.loc[s1, s2])
                if np.isnan(current_val) or np.isnan(hist_val):
                    continue
                diff = abs(current_val - hist_val)
                if diff >= 0.3:
                    breaks.append({
                        "pair": [s1, s2],
                        "historical": round(hist_val, 3),
                        "current": round(current_val, 3),
                        "break_magnitude": round(diff, 3),
                        "significance": "high" if diff >= 0.5 else "medium",
                    })
            except (KeyError, ValueError):
                continue

    matrix = []
    for s in symbols:
        row = []
        for s2 in symbols:
            try:
                val = float(corr_matrix.loc[s, s2])
                row.append(round(val, 3) if not np.isnan(val) else 0)
            except (KeyError, ValueError):
                row.append(0)
        matrix.append(row)

    return {
        "symbols": symbols,
        "matrix": matrix,
        "correlation_breaks": sorted(breaks, key=lambda x: x["break_magnitude"], reverse=True),
        "period_days": period,
        "group": group,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/institutional-summary")
async def institutional_summary(
    symbols: str = Query(
        "XAUUSD,BTCUSD,ETHUSD,EURUSD,GBPUSD,USDJPY,AUDUSD,SOLUSD",
        description="Comma-separated symbols",
    ),
    db: AsyncSession = Depends(get_db),
):
    """
    Batch institutional flow summary — heat scores + divergence for multiple symbols.
    Powers the Institutional Flow Dashboard.
    Always returns data for every requested symbol, using sensible defaults.
    """
    from backend.app.core.institutional.heat_score import compute_heat_score
    from backend.app.core.institutional.divergence import calculate_divergence

    symbol_list = [s.strip().upper() for s in symbols.split(",") if s.strip()]

    async def get_symbol_summary(symbol: str):
        result_data = {
            "symbol": symbol,
            "heat_score": 0,
            "heat_label": "No Data",
            "divergence_score": 0,
            "divergence_signal": "neutral",
            "institutional_bias": "neutral",
            "retail_bias": "neutral",
        }

        # Heat score
        try:
            cot_data = None
            if symbol in ("XAUUSD", "XAGUSD"):
                try:
                    from backend.app.data.cot_adapter import cot_adapter
                    cot_data = await cot_adapter.get_gold_cot()
                except Exception:
                    pass

            orderflow = None
            try:
                from backend.app.data.registry import data_registry
                from backend.app.core.orderbook.flow_analyzer import analyze_order_flow
                ob = await data_registry.fetch_real_orderbook(symbol, 50)
                if ob is not None and ob.bids and ob.asks:
                    orderbook = {
                        "bids": [{"price": l.price, "quantity": l.quantity} for l in ob.bids],
                        "asks": [{"price": l.price, "quantity": l.quantity} for l in ob.asks],
                    }
                    orderflow = analyze_order_flow(orderbook)
            except Exception:
                pass

            heat = compute_heat_score(
                cot_data=cot_data,
                orderflow=orderflow,
                volume_profile=None,
            )
            result_data["heat_score"] = heat.get("heat_score", 0)
            result_data["heat_label"] = heat.get("heat_label", "No Data")
        except Exception:
            pass

        # Divergence
        try:
            div = await calculate_divergence(symbol)
            result_data["divergence_score"] = div.get("divergence_score", 0)
            result_data["divergence_signal"] = div.get("signal", "neutral")
            result_data["institutional_bias"] = div.get("institutional_bias", "neutral")
            result_data["retail_bias"] = div.get("retail_bias", "neutral")
        except Exception:
            pass

        return result_data

    results = await asyncio.gather(
        *[get_symbol_summary(s) for s in symbol_list],
        return_exceptions=True,
    )

    summaries = []
    for i, r in enumerate(results):
        if isinstance(r, Exception):
            summaries.append({
                "symbol": symbol_list[i],
                "heat_score": 0, "heat_label": "Error",
                "divergence_score": 0, "divergence_signal": "neutral",
                "institutional_bias": "neutral", "retail_bias": "neutral",
            })
        else:
            summaries.append(r)

    return {
        "symbols": summaries,
        "count": len(summaries),
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
