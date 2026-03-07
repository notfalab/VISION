"""Market-wide endpoints — overview, correlations, institutional summary."""

import asyncio
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.api.deps import get_db
from backend.app.models.asset import Asset, MarketType
from backend.app.models.ohlcv import OHLCVData, Timeframe

router = APIRouter(prefix="/market", tags=["market"])

# ── Symbol grouping for display ──────────────────────────────────────────

_GROUPS = {
    "EURUSD": "Forex Majors", "GBPUSD": "Forex Majors", "USDJPY": "Forex Majors",
    "USDCHF": "Forex Majors", "AUDUSD": "Forex Majors", "USDCAD": "Forex Majors",
    "NZDUSD": "Forex Majors",
    "XAUUSD": "Commodities", "XAGUSD": "Commodities",
    "BTCUSD": "Crypto", "ETHUSD": "Crypto", "SOLUSD": "Crypto",
    "XRPUSD": "Crypto", "ETHBTC": "Crypto",
    "NAS100": "Indices", "SPX500": "Indices",
}

_MAJOR_SYMBOLS = {
    "EURUSD", "GBPUSD", "USDJPY", "XAUUSD", "BTCUSD", "ETHUSD",
    "NAS100", "SPX500", "AUDUSD", "USDCAD",
}


@router.get("/overview")
async def market_overview(db: AsyncSession = Depends(get_db)):
    """
    Global market overview — all active symbols with price, change, regime.
    Powers the Heat Map page.
    """
    from backend.app.data.redis_pubsub import get_latest_price

    # 1. Get all active assets
    result = await db.execute(
        select(Asset).where(Asset.is_active.is_(True)).order_by(Asset.symbol)
    )
    assets = result.scalars().all()

    # 2. Fan out Redis price reads
    async def get_tile(asset: Asset):
        try:
            cached = await get_latest_price(asset.symbol)
            if not cached:
                return None

            price = cached["price"]
            open_price = cached.get("open", price)
            change_pct = ((price - open_price) / open_price * 100) if open_price else 0

            return {
                "symbol": asset.symbol,
                "name": asset.name,
                "market_type": asset.market_type.value if hasattr(asset.market_type, "value") else str(asset.market_type),
                "group": _GROUPS.get(asset.symbol, "Forex Minors"),
                "price": round(price, 5),
                "change_pct": round(change_pct, 3),
                "volume": cached.get("volume", 0),
                "high": cached.get("high", price),
                "low": cached.get("low", price),
                "timestamp": cached.get("timestamp"),
                "is_major": asset.symbol in _MAJOR_SYMBOLS,
            }
        except Exception:
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
    if len(assets) < 2:
        raise HTTPException(status_code=400, detail="Not enough assets for correlation")

    # 2. Fetch daily closes for each asset (use max 90 days for break detection)
    fetch_period = max(period, 90)
    symbol_closes: dict[str, pd.Series] = {}

    for asset in assets:
        query = (
            select(OHLCVData.timestamp, OHLCVData.close)
            .where(OHLCVData.asset_id == asset.id, OHLCVData.timeframe == Timeframe.D1)
            .order_by(OHLCVData.timestamp.desc())
            .limit(fetch_period)
        )
        rows = await db.execute(query)
        data = rows.all()
        if len(data) >= 10:
            series = pd.Series(
                {row.timestamp: float(row.close) for row in reversed(data)}
            )
            symbol_closes[asset.symbol] = series

    if len(symbol_closes) < 2:
        return {
            "symbols": [], "matrix": [], "correlation_breaks": [],
            "period_days": period, "group": group,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "error": "Not enough price data for correlation",
        }

    # 3. Build DataFrame and compute correlations
    try:
        df = pd.DataFrame(symbol_closes)
        df = df.dropna(axis=1, thresh=max(1, int(len(df) * 0.5)))
        df = df.ffill().bfill()

        symbols = list(df.columns)
        returns = df.pct_change().dropna()

        if len(returns) < 5 or len(symbols) < 2:
            return {
                "symbols": [], "matrix": [], "correlation_breaks": [],
                "period_days": period, "group": group,
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "error": "Not enough data points for correlation",
            }

        # Current period correlation
        current_returns = returns.tail(period)
        corr_matrix = current_returns.corr()

        # Historical correlation (full 90 days) for break detection
        hist_corr = returns.corr()

        # Replace NaN in correlation matrix with 0
        corr_matrix = corr_matrix.fillna(0)
        hist_corr = hist_corr.fillna(0)

    except Exception as e:
        return {
            "symbols": [], "matrix": [], "correlation_breaks": [],
            "period_days": period, "group": group,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "error": f"Correlation computation failed: {str(e)}",
        }

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

    # Convert matrix to list of lists for JSON
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
    """
    from backend.app.core.institutional.heat_score import compute_heat_score
    from backend.app.core.institutional.divergence import calculate_divergence

    symbol_list = [s.strip().upper() for s in symbols.split(",") if s.strip()]

    async def get_symbol_summary(symbol: str):
        result_data = {
            "symbol": symbol,
            "heat_score": None,
            "heat_label": None,
            "divergence_score": None,
            "divergence_signal": None,
            "institutional_bias": None,
            "retail_bias": None,
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
            result_data["heat_label"] = heat.get("heat_label", "Unknown")
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
    for r in results:
        if isinstance(r, Exception):
            continue
        summaries.append(r)

    return {
        "symbols": summaries,
        "count": len(summaries),
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
