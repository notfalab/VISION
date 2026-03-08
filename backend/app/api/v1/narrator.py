"""Market Narrator endpoints — comprehensive analysis with directional prediction."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.api.deps import get_db

router = APIRouter(prefix="/narrator", tags=["narrator"])


async def _fetch_ohlcv_df(db, symbol: str, timeframe: str, limit: int = 200):
    """Fetch OHLCV data as DataFrame."""
    from backend.app.models.asset import Asset
    from backend.app.models.ohlcv import OHLCVData, Timeframe
    from sqlalchemy import select
    import pandas as pd

    result = await db.execute(select(Asset).where(Asset.symbol == symbol.upper()))
    asset = result.scalar_one_or_none()
    if not asset:
        return None, None

    try:
        tf = Timeframe(timeframe)
    except ValueError:
        return asset, None
    rows = await db.execute(
        select(OHLCVData)
        .where(OHLCVData.asset_id == asset.id, OHLCVData.timeframe == tf)
        .order_by(OHLCVData.timestamp.desc())
        .limit(limit)
    )
    ohlcv = list(rows.scalars().all())
    if len(ohlcv) < 10:
        return asset, None

    df = __import__("pandas").DataFrame([{
        "timestamp": r.timestamp, "open": float(r.open),
        "high": float(r.high), "low": float(r.low),
        "close": float(r.close), "volume": float(r.volume),
    } for r in reversed(ohlcv)])
    return asset, df


async def _gather_full_context(db, symbol: str, timeframe: str) -> dict:
    """Gather ALL available analysis data for a comprehensive narrative."""
    import pandas as pd

    ctx: dict = {}

    # ── 1. OHLCV + Price ──
    asset, df = await _fetch_ohlcv_df(db, symbol, timeframe, limit=200)
    if df is not None and len(df) > 0:
        last = df.iloc[-1]
        recent = df.tail(20)
        ctx["price"] = {
            "current": float(last["close"]),
            "open": float(last["open"]),
            "high": float(last["high"]),
            "low": float(last["low"]),
            "recent_high": float(recent["high"].max()),
            "recent_low": float(recent["low"].min()),
        }

    # Override with Redis if available
    try:
        from backend.app.data.redis_pubsub import get_latest_price
        rp = await get_latest_price(symbol)
        if rp and rp.get("price"):
            if "price" not in ctx:
                ctx["price"] = {}
            ctx["price"]["current"] = float(rp["price"])
    except Exception:
        pass

    if "price" not in ctx:
        return ctx  # Can't analyze without price

    # ── 2. Technical Indicators (RSI, MACD, MAs, BB) ──
    if df is not None and len(df) > 20:
        try:
            close = df["close"]
            delta = close.diff()
            gain = delta.where(delta > 0, 0).rolling(14).mean()
            loss = (-delta.where(delta < 0, 0)).rolling(14).mean()
            rs = gain / loss.replace(0, float("nan"))
            rsi = 100 - (100 / (1 + rs))

            sma20 = close.rolling(20).mean()
            sma50 = close.rolling(50).mean()
            ema12 = close.ewm(span=12).mean()
            ema26 = close.ewm(span=26).mean()
            macd = ema12 - ema26
            signal = macd.ewm(span=9).mean()

            bb_mid = sma20
            bb_std = close.rolling(20).std()
            bb_upper = bb_mid + 2 * bb_std
            bb_lower = bb_mid - 2 * bb_std

            ctx["indicators"] = {
                "rsi": round(float(rsi.iloc[-1]), 1) if pd.notna(rsi.iloc[-1]) else None,
                "macd": round(float(macd.iloc[-1]), 4) if pd.notna(macd.iloc[-1]) else None,
                "macd_signal": round(float(signal.iloc[-1]), 4) if pd.notna(signal.iloc[-1]) else None,
                "macd_histogram": round(float((macd - signal).iloc[-1]), 4) if pd.notna((macd - signal).iloc[-1]) else None,
                "sma20": round(float(sma20.iloc[-1]), 2) if pd.notna(sma20.iloc[-1]) else None,
                "sma50": round(float(sma50.iloc[-1]), 2) if pd.notna(sma50.iloc[-1]) else None,
                "bb_upper": round(float(bb_upper.iloc[-1]), 2) if pd.notna(bb_upper.iloc[-1]) else None,
                "bb_lower": round(float(bb_lower.iloc[-1]), 2) if pd.notna(bb_lower.iloc[-1]) else None,
                "trend_sma": "bullish" if pd.notna(sma20.iloc[-1]) and pd.notna(sma50.iloc[-1]) and sma20.iloc[-1] > sma50.iloc[-1] else "bearish",
            }
        except Exception:
            pass

    # ── 3. ML Prediction ──
    if df is not None and len(df) >= 50:
        try:
            from backend.app.core.ml.predictor import predict
            ml = predict(df.copy(), symbol, timeframe)
            if "error" not in ml:
                ctx["ml_prediction"] = {
                    "direction": ml["direction"],
                    "confidence": ml["confidence"],
                    "probabilities": ml.get("probabilities", {}),
                }
        except Exception:
            pass

    # ── 4. Market Regime ──
    if df is not None and len(df) >= 50:
        try:
            from backend.app.core.ml.regime import detect_regime
            regime = detect_regime(df.copy())
            ctx["regime"] = regime
        except Exception:
            pass

    # ── 5. Composite Score ──
    if asset:
        try:
            from backend.app.api.v1.indicators import _compute_composite
            comp = await _compute_composite(db, symbol, timeframe)
            if comp:
                ctx["composite"] = {
                    "score": comp.get("score"),
                    "bias": comp.get("bias"),
                    "components": comp.get("components", {}),
                }
        except Exception:
            pass

    # ── 6. Volatility Forecast ──
    if df is not None and len(df) >= 30:
        try:
            from backend.app.core.ml.volatility import calculate_volatility_forecast
            vol = calculate_volatility_forecast(df.copy())
            if vol:
                ctx["volatility"] = {
                    "current": vol.get("current_vol"),
                    "regime": vol.get("regime"),
                    "percentile": vol.get("percentile"),
                    "implied_move": vol.get("implied_move"),
                }
        except Exception:
            pass

    # ── 7. Zones (S/R from key levels indicator) ──
    if df is not None and len(df) > 20:
        try:
            from backend.app.core.indicators.key_levels import KeyLevelsIndicator
            kl = KeyLevelsIndicator()
            kl_results = kl.calculate(df)
            if kl_results:
                meta = kl_results[0].metadata
                close_price = float(df["close"].iloc[-1])
                supports = []
                resistances = []
                for level in meta.get("sr_levels", []):
                    if isinstance(level, dict):
                        entry = {"price": level.get("price", 0), "strength": level.get("touches", 1)}
                        if level["price"] < close_price:
                            supports.append(entry)
                        else:
                            resistances.append(entry)
                ctx["zones"] = {
                    "support": sorted(supports, key=lambda x: x["price"], reverse=True)[:3],
                    "resistance": sorted(resistances, key=lambda x: x["price"])[:3],
                }
        except Exception:
            pass

    # ── 8. Divergence (Retail vs Institutional) ──
    try:
        from backend.app.core.institutional.divergence import calculate_divergence
        div = await calculate_divergence(symbol)
        if div and "error" not in div:
            ctx["divergence"] = {
                "retail_long_pct": div.get("retail_long_pct"),
                "institutional_bias": div.get("institutional_bias"),
                "divergence_score": div.get("divergence_score"),
                "signal": div.get("signal"),
            }
    except Exception:
        pass

    # ── 9. Order Flow ──
    try:
        from backend.app.data.registry import data_registry
        from backend.app.core.orderbook.flow_analyzer import analyze_order_flow
        ob = await data_registry.fetch_real_orderbook(symbol, 50)
        if ob and ob.bids and ob.asks:
            orderbook = {
                "bids": [{"price": l.price, "quantity": l.quantity} for l in ob.bids],
                "asks": [{"price": l.price, "quantity": l.quantity} for l in ob.asks],
            }
            of = analyze_order_flow(orderbook)
            if of:
                ctx["order_flow"] = {
                    "imbalance": of.get("imbalance"),
                    "aggression_ratio": of.get("aggression_ratio"),
                    "absorption_signal": of.get("absorption_signal"),
                }
    except Exception:
        pass

    # ── 10. Multi-Timeframe Analysis ──
    mtf_data = {}
    for tf in ["15m", "1h", "4h", "1d"]:
        if tf == timeframe:
            continue  # Already have this
        try:
            _, tf_df = await _fetch_ohlcv_df(db, symbol, tf, limit=100)
            if tf_df is not None and len(tf_df) >= 20:
                c = tf_df["close"]
                delta = c.diff()
                gain = delta.where(delta > 0, 0).rolling(14).mean()
                loss_s = (-delta.where(delta < 0, 0)).rolling(14).mean()
                rs = gain / loss_s.replace(0, float("nan"))
                rsi = 100 - (100 / (1 + rs))

                sma20 = c.rolling(20).mean()
                sma50 = c.rolling(50).mean() if len(c) >= 50 else pd.Series([None])

                tf_bias = "neutral"
                if pd.notna(sma20.iloc[-1]) and pd.notna(sma50.iloc[-1]) and sma50.iloc[-1] != 0:
                    tf_bias = "bullish" if sma20.iloc[-1] > sma50.iloc[-1] else "bearish"

                mtf_data[tf] = {
                    "rsi": round(float(rsi.iloc[-1]), 1) if pd.notna(rsi.iloc[-1]) else None,
                    "trend": tf_bias,
                }
        except Exception:
            pass

    if mtf_data:
        ctx["multi_timeframe"] = mtf_data

    return ctx


@router.get("/{symbol}")
async def get_narrative(
    symbol: str,
    timeframe: str = Query("1d"),
    db: AsyncSession = Depends(get_db),
):
    """Generate comprehensive market narrative with directional prediction."""
    from backend.app.core.market_narrator import generate_narrative

    market_data = await _gather_full_context(db, symbol, timeframe)

    result = await generate_narrative(symbol, market_data, timeframe)
    if result is None:
        return {
            "symbol": symbol.upper(),
            "narrative": "Market narrative temporarily unavailable. Check API key configuration.",
            "key_drivers": [],
            "outlook": "Neutral",
            "confidence": 0,
            "prediction": None,
            "timeframe_analysis": {},
            "timestamp": None,
        }
    return result
