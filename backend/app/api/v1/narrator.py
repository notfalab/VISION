"""Market Narrator endpoints."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.api.deps import get_db

router = APIRouter(prefix="/narrator", tags=["narrator"])


@router.get("/{symbol}")
async def get_narrative(
    symbol: str,
    timeframe: str = Query("1d"),
    db: AsyncSession = Depends(get_db),
):
    """Generate market narrative for a symbol."""
    from backend.app.core.market_narrator import generate_narrative
    from backend.app.models.asset import Asset
    from backend.app.models.ohlcv import OHLCVData, Timeframe
    from sqlalchemy import select
    import pandas as pd

    # Gather market data for context
    market_data: dict = {}
    asset = None
    df = None

    # 1. Fetch OHLCV data (needed for price + indicators)
    try:
        result = await db.execute(select(Asset).where(Asset.symbol == symbol.upper()))
        asset = result.scalar_one_or_none()
        if asset:
            tf = Timeframe(timeframe)
            rows = await db.execute(
                select(OHLCVData)
                .where(OHLCVData.asset_id == asset.id, OHLCVData.timeframe == tf)
                .order_by(OHLCVData.timestamp.desc())
                .limit(100)
            )
            ohlcv = list(rows.scalars().all())
            if len(ohlcv) > 5:
                df = pd.DataFrame([{
                    "timestamp": r.timestamp, "open": float(r.open),
                    "high": float(r.high), "low": float(r.low),
                    "close": float(r.close), "volume": float(r.volume),
                } for r in reversed(ohlcv)])
    except Exception:
        pass

    # 2. Price — always use latest OHLCV close as authoritative price
    if df is not None and len(df) > 0:
        last = df.iloc[-1]
        market_data["price"] = {
            "price": last["close"],
            "open": last["open"],
            "high": last["high"],
            "low": last["low"],
        }
        # Also add recent range context
        recent = df.tail(20)
        market_data["price"]["recent_high"] = float(recent["high"].max())
        market_data["price"]["recent_low"] = float(recent["low"].min())

    # Try Redis for more up-to-date price (override if available)
    try:
        from backend.app.data.redis_pubsub import get_latest_price
        redis_price = await get_latest_price(symbol)
        if redis_price and redis_price.get("price"):
            market_data["price"] = {
                **market_data.get("price", {}),
                "price": redis_price["price"],
                "open": redis_price.get("open", market_data.get("price", {}).get("open")),
                "high": redis_price.get("high", market_data.get("price", {}).get("high")),
                "low": redis_price.get("low", market_data.get("price", {}).get("low")),
            }
    except Exception:
        pass

    # 3. Indicators (from OHLCV df)
    if df is not None and len(df) > 20:
        try:
            close = df["close"]
            delta = close.diff()
            gain = delta.where(delta > 0, 0).rolling(14).mean()
            loss = (-delta.where(delta < 0, 0)).rolling(14).mean()
            rs = gain / loss.replace(0, float("nan"))
            rsi = 100 - (100 / (1 + rs))
            market_data["indicators"] = {"rsi": round(float(rsi.iloc[-1]), 1) if not rsi.empty else None}

            sma20 = float(close.rolling(20).mean().iloc[-1]) if len(close) >= 20 else None
            sma50 = float(close.rolling(50).mean().iloc[-1]) if len(close) >= 50 else None
            if sma20 and sma50:
                market_data["indicators"]["trend"] = "bullish" if sma20 > sma50 else "bearish"
                market_data["indicators"]["sma20"] = round(sma20, 2)
                market_data["indicators"]["sma50"] = round(sma50, 2)
        except Exception:
            pass

    # 4. Regime
    if df is not None and len(df) >= 50:
        try:
            from backend.app.core.ml.regime import detect_regime
            regime = detect_regime(df)
            market_data["regime"] = regime
        except Exception:
            pass

    # 5. Composite score
    if asset:
        try:
            from backend.app.api.v1.indicators import _compute_composite
            composite = await _compute_composite(db, symbol, timeframe)
            if composite:
                market_data["composite"] = composite
        except Exception:
            pass

    result = await generate_narrative(symbol, market_data, timeframe)
    if result is None:
        return {
            "symbol": symbol.upper(),
            "narrative": "Market narrative temporarily unavailable. Check API key configuration.",
            "key_drivers": [],
            "outlook": "Neutral",
            "confidence": 0,
            "timestamp": None,
        }
    return result
