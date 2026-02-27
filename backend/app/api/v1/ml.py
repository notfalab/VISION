"""ML endpoints — prediction, regime detection, model training."""

import random
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.api.deps import get_db
from backend.app.models.asset import Asset
from backend.app.models.ohlcv import OHLCVData, Timeframe

router = APIRouter(prefix="/ml", tags=["ml"])


async def _get_ohlcv_df(db: AsyncSession, symbol: str, timeframe: str, limit: int = 500):
    """Fetch OHLCV data and return as DataFrame."""
    import pandas as pd

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
        .order_by(OHLCVData.timestamp.desc())
        .limit(limit)
    )
    rows = await db.execute(query)
    ohlcv_list = rows.scalars().all()

    if len(ohlcv_list) < 50:
        raise HTTPException(status_code=400, detail=f"Not enough data. Need 50+ candles, got {len(ohlcv_list)}")

    return pd.DataFrame([{
        "timestamp": r.timestamp,
        "open": float(r.open),
        "high": float(r.high),
        "low": float(r.low),
        "close": float(r.close),
        "volume": float(r.volume),
    } for r in reversed(ohlcv_list)])


@router.get("/{symbol}/predict")
async def ml_predict(
    symbol: str,
    timeframe: str = Query("1d"),
    db: AsyncSession = Depends(get_db),
):
    """
    Predict next-candle direction using XGBoost model.
    Auto-trains if no model exists for this symbol/timeframe.
    """
    from backend.app.core.ml.predictor import predict

    df = await _get_ohlcv_df(db, symbol, timeframe, limit=2000)
    result = predict(df, symbol.upper(), timeframe)

    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])

    return {
        "symbol": symbol.upper(),
        "timeframe": timeframe,
        **result,
    }


@router.get("/{symbol}/regime")
async def detect_regime(
    symbol: str,
    timeframe: str = Query("1d"),
    db: AsyncSession = Depends(get_db),
):
    """
    Detect current market regime: trending_up, trending_down, ranging, volatile_breakout.
    """
    from backend.app.core.ml.regime import detect_regime as _detect

    df = await _get_ohlcv_df(db, symbol, timeframe, limit=500)
    result = _detect(df)

    return {
        "symbol": symbol.upper(),
        "timeframe": timeframe,
        **result,
    }


@router.post("/{symbol}/train")
async def train_model(
    symbol: str,
    timeframe: str = Query("1d"),
    db: AsyncSession = Depends(get_db),
):
    """Force retrain the XGBoost model for a symbol/timeframe."""
    from backend.app.core.ml.predictor import train_model as _train

    df = await _get_ohlcv_df(db, symbol, timeframe, limit=2000)
    result = _train(df, symbol.upper(), timeframe)

    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])

    return {
        "symbol": symbol.upper(),
        "timeframe": timeframe,
        **result,
    }


async def _synthetic_orderbook(adapter, symbol: str, depth: int) -> dict:
    """Build a synthetic orderbook from bid/ask ticker data.

    When no real orderbook is available (e.g. GoldAPI for gold),
    generate one from the current bid/ask spread so OrderFlow
    analysis can still provide useful signals.
    """
    ticker = await adapter.fetch_ticker(symbol)
    price = float(ticker.get("price", 0))
    bid = float(ticker.get("bid", price))
    ask = float(ticker.get("ask", price))

    if price <= 0:
        return {"bids": [], "asks": []}

    spread = max(ask - bid, price * 0.0001)
    tick = spread / 2

    # Generate synthetic levels around bid/ask
    rng = random.Random(int(datetime.now(timezone.utc).timestamp()) // 60)
    bids = []
    asks = []
    for i in range(depth):
        bid_price = round(bid - tick * i, 2)
        ask_price = round(ask + tick * i, 2)
        # Simulate varying liquidity — larger orders further from spread
        base_qty = rng.uniform(0.5, 3.0) * (1 + i * 0.1)
        # Occasional large orders (walls)
        if rng.random() < 0.08:
            base_qty *= rng.uniform(4, 8)
        bids.append({"price": bid_price, "quantity": round(base_qty, 2)})
        asks.append({"price": ask_price, "quantity": round(rng.uniform(0.5, 3.0) * (1 + i * 0.1), 2)})

    return {"bids": bids, "asks": asks}


@router.get("/{symbol}/orderflow")
async def order_flow(
    symbol: str,
    depth: int = Query(50, ge=10, le=500),
):
    """
    Analyze real-time order flow from the order book.
    Detects buy/sell pressure, walls, absorption signals.
    Falls back to synthetic orderbook from bid/ask when no real orderbook.
    """
    from backend.app.data.registry import data_registry
    from backend.app.core.orderbook.flow_analyzer import analyze_order_flow

    try:
        adapter = data_registry.route_symbol(symbol)
        await adapter.connect()
        try:
            ob = await adapter.fetch_orderbook(symbol, depth)
            if ob is not None:
                orderbook = {
                    "bids": [{"price": l.price, "quantity": l.quantity} for l in ob.bids],
                    "asks": [{"price": l.price, "quantity": l.quantity} for l in ob.asks],
                }
            else:
                orderbook = await _synthetic_orderbook(adapter, symbol, depth)
            result = analyze_order_flow(orderbook)
            return {
                "symbol": symbol.upper(),
                **result,
            }
        finally:
            await adapter.disconnect()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Order flow analysis failed: {str(e)}")


@router.get("/{symbol}/heat")
async def institutional_heat(
    symbol: str,
    timeframe: str = Query("1d"),
    depth: int = Query(50, ge=10, le=500),
    db: AsyncSession = Depends(get_db),
):
    """
    Institutional Heat Score (0-100) — combines COT positioning,
    order flow, and volume profile for institutional activity detection.
    """
    from backend.app.core.institutional.heat_score import compute_heat_score

    # 1. Get COT data (for gold)
    cot_data = None
    if symbol.upper() in ("XAUUSD", "XAGUSD"):
        try:
            from backend.app.data.cot_adapter import cot_adapter
            cot = await cot_adapter.get_gold_cot()
            if cot:
                cot_data = cot
        except Exception:
            pass

    # 2. Get order flow from order book
    orderflow = None
    try:
        from backend.app.data.registry import data_registry
        from backend.app.core.orderbook.flow_analyzer import analyze_order_flow

        adapter = data_registry.route_symbol(symbol)
        await adapter.connect()
        try:
            ob = await adapter.fetch_orderbook(symbol, depth)
            if ob is not None:
                orderbook = {
                    "bids": [{"price": l.price, "quantity": l.quantity} for l in ob.bids],
                    "asks": [{"price": l.price, "quantity": l.quantity} for l in ob.asks],
                }
            else:
                orderbook = await _synthetic_orderbook(adapter, symbol, depth)
            orderflow = analyze_order_flow(orderbook)
        finally:
            await adapter.disconnect()
    except Exception:
        pass

    # 3. Volume profile from OHLCV
    volume_profile = None
    try:
        df = await _get_ohlcv_df(db, symbol, timeframe, limit=200)
        if df is not None and len(df) > 0:
            # Simple volume profile: buy volume = volume on bullish candles
            bullish_mask = df["close"] > df["open"]
            total_buy = float(df.loc[bullish_mask, "volume"].sum())
            total_sell = float(df.loc[~bullish_mask, "volume"].sum())
            volume_profile = {
                "total_buy_volume": total_buy,
                "total_sell_volume": total_sell,
            }
    except Exception:
        pass

    result = compute_heat_score(
        cot_data=cot_data,
        orderflow=orderflow,
        volume_profile=volume_profile,
    )

    return {
        "symbol": symbol.upper(),
        "timeframe": timeframe,
        **result,
    }
