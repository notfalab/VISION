"""AI Market Narrator endpoints."""

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
    """Generate AI-powered market narrative for a symbol."""
    from backend.app.core.market_narrator import generate_narrative

    # Gather market data for context
    market_data = {}

    # 1. Latest price
    try:
        from backend.app.data.redis_pubsub import get_latest_price
        price = await get_latest_price(symbol)
        if price:
            market_data["price"] = price
    except Exception:
        pass

    # 2. Indicators
    try:
        from backend.app.models.asset import Asset
        from backend.app.models.ohlcv import OHLCVData, Timeframe
        from sqlalchemy import select
        import pandas as pd

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
            if len(ohlcv) > 20:
                df = pd.DataFrame([{
                    "timestamp": r.timestamp, "open": float(r.open),
                    "high": float(r.high), "low": float(r.low),
                    "close": float(r.close), "volume": float(r.volume),
                } for r in reversed(ohlcv)])

                # RSI
                close = df["close"]
                delta = close.diff()
                gain = delta.where(delta > 0, 0).rolling(14).mean()
                loss = (-delta.where(delta < 0, 0)).rolling(14).mean()
                rs = gain / loss.replace(0, float("nan"))
                rsi = 100 - (100 / (1 + rs))
                market_data["indicators"] = {"rsi": round(float(rsi.iloc[-1]), 1) if not rsi.empty else None}

                # Trend
                sma20 = float(close.rolling(20).mean().iloc[-1]) if len(close) >= 20 else None
                sma50 = float(close.rolling(50).mean().iloc[-1]) if len(close) >= 50 else None
                if sma20 and sma50:
                    market_data["indicators"]["trend"] = "bullish" if sma20 > sma50 else "bearish"
    except Exception:
        pass

    # 3. Regime
    try:
        from backend.app.core.ml.regime import detect_regime
        if "df" in dir() and df is not None and len(df) >= 50:
            regime = detect_regime(df)
            market_data["regime"] = regime
    except Exception:
        pass

    # 4. Composite score
    try:
        from backend.app.api.v1.indicators import _compute_composite
        if asset and db:
            composite = await _compute_composite(db, symbol, timeframe)
            if composite:
                market_data["composite"] = composite
    except Exception:
        pass

    result = await generate_narrative(symbol, market_data)
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
