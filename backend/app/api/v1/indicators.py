"""Indicator endpoints — computed smart money indicators."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.api.deps import get_db
from backend.app.models.asset import Asset
from backend.app.models.indicator import IndicatorValue
from backend.app.models.ohlcv import OHLCVData
from backend.app.schemas.indicator import IndicatorResponse

router = APIRouter(prefix="/indicators", tags=["indicators"])


@router.get("/{symbol}", response_model=list[IndicatorResponse])
async def get_indicators(
    symbol: str,
    timeframe: str = Query("1h"),
    indicators: str | None = Query(None, description="Comma-separated: obv,ad_line,volume_spike"),
    limit: int = Query(200, ge=1, le=2000),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Asset).where(Asset.symbol == symbol.upper()))
    asset = result.scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=404, detail=f"Asset {symbol} not found")

    query = (
        select(IndicatorValue)
        .where(IndicatorValue.asset_id == asset.id, IndicatorValue.timeframe == timeframe)
    )
    if indicators:
        types = [t.strip() for t in indicators.split(",")]
        query = query.where(IndicatorValue.indicator_type.in_(types))

    query = query.order_by(IndicatorValue.timestamp.desc()).limit(limit)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/{symbol}/summary")
async def get_indicator_summary(
    symbol: str,
    timeframe: str = Query("1h"),
    db: AsyncSession = Depends(get_db),
):
    """Returns latest value for each indicator type — quick overview."""
    result = await db.execute(select(Asset).where(Asset.symbol == symbol.upper()))
    asset = result.scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=404, detail=f"Asset {symbol} not found")

    # Get the most recent value per indicator type
    from sqlalchemy import func, distinct
    types_q = await db.execute(
        select(distinct(IndicatorValue.indicator_type))
        .where(IndicatorValue.asset_id == asset.id, IndicatorValue.timeframe == timeframe)
    )
    indicator_types = types_q.scalars().all()

    summary = {}
    for ind_type in indicator_types:
        latest = await db.execute(
            select(IndicatorValue)
            .where(
                IndicatorValue.asset_id == asset.id,
                IndicatorValue.indicator_type == ind_type,
                IndicatorValue.timeframe == timeframe,
            )
            .order_by(IndicatorValue.timestamp.desc())
            .limit(1)
        )
        val = latest.scalar_one_or_none()
        if val:
            summary[ind_type] = {
                "value": val.value,
                "secondary_value": val.secondary_value,
                "timestamp": val.timestamp.isoformat(),
                "metadata": val.metadata_json,
            }

    return {"symbol": symbol.upper(), "timeframe": timeframe, "indicators": summary}


@router.get("/{symbol}/calculate")
async def calculate_indicators(
    symbol: str,
    timeframe: str = Query("1d"),
    limit: int = Query(200, ge=50, le=2000),
    db: AsyncSession = Depends(get_db),
):
    """Calculate all registered indicators on-the-fly from OHLCV data."""
    import pandas as pd
    from backend.app.core.indicators.base import registry as indicator_registry
    # Ensure indicator modules are imported for registration
    import backend.app.core.indicators.volume  # noqa
    import backend.app.core.indicators.obv  # noqa
    import backend.app.core.indicators.ad_line  # noqa
    import backend.app.core.indicators.rsi  # noqa
    import backend.app.core.indicators.macd  # noqa
    import backend.app.core.indicators.bollinger  # noqa
    import backend.app.core.indicators.moving_averages  # noqa
    import backend.app.core.indicators.atr  # noqa
    import backend.app.core.indicators.stochastic_rsi  # noqa
    import backend.app.core.indicators.smart_money  # noqa
    import backend.app.core.indicators.key_levels  # noqa
    import backend.app.core.indicators.session_analysis  # noqa
    import backend.app.core.indicators.candle_patterns  # noqa

    result = await db.execute(select(Asset).where(Asset.symbol == symbol.upper()))
    asset = result.scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=404, detail=f"Asset {symbol} not found")

    from backend.app.models.ohlcv import Timeframe as TF
    try:
        tf = TF(timeframe)
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

    if len(ohlcv_list) < 20:
        raise HTTPException(status_code=400, detail="Not enough data for indicator calculation")

    df = pd.DataFrame([{
        "timestamp": r.timestamp,
        "open": float(r.open),
        "high": float(r.high),
        "low": float(r.low),
        "close": float(r.close),
        "volume": float(r.volume),
    } for r in reversed(ohlcv_list)])

    raw = indicator_registry.calculate_all(df)

    # Aggregate per-indicator: summarize latest values + collect signals
    indicators_out = []
    for ind_name, result_list in raw.items():
        values = {}
        signals = []
        metadata = {}
        if result_list:
            latest = result_list[-1]
            values["value"] = latest.value
            if latest.secondary_value is not None:
                values["secondary_value"] = latest.secondary_value
            values["data_points"] = len(result_list)
            metadata = latest.metadata or {}

            # Extract signals from metadata
            if "classification" in metadata:
                signals.append(metadata["classification"])
            if "divergence" in metadata:
                div = metadata["divergence"]
                if div and div != "none":
                    signals.append(div)
            if "crossover" in metadata:
                signals.append(metadata["crossover"])

        indicators_out.append({
            "name": ind_name,
            "values": values,
            "signals": signals,
            "metadata": metadata,
        })

    return {
        "symbol": symbol.upper(),
        "timeframe": timeframe,
        "candle_count": len(df),
        "indicators": indicators_out,
    }


async def _fetch_ohlcv_df(db: AsyncSession, asset_id: int, timeframe: str, limit: int = 200):
    """Helper to fetch OHLCV data and return a DataFrame."""
    import pandas as pd
    from backend.app.models.ohlcv import Timeframe as TF

    try:
        tf = TF(timeframe)
    except ValueError:
        return None

    query = (
        select(OHLCVData)
        .where(OHLCVData.asset_id == asset_id, OHLCVData.timeframe == tf)
        .order_by(OHLCVData.timestamp.desc())
        .limit(limit)
    )
    rows = await db.execute(query)
    ohlcv_list = rows.scalars().all()

    if len(ohlcv_list) < 20:
        return None

    return pd.DataFrame([{
        "timestamp": r.timestamp,
        "open": float(r.open),
        "high": float(r.high),
        "low": float(r.low),
        "close": float(r.close),
        "volume": float(r.volume),
    } for r in reversed(ohlcv_list)])


@router.get("/{symbol}/mtf")
async def multi_timeframe_confluence(
    symbol: str,
    db: AsyncSession = Depends(get_db),
):
    """
    Multi-Timeframe Confluence — calculate key indicators across 1H, 4H, 1D
    and score how aligned they are. High confluence = high probability trade.
    """
    import pandas as pd
    from backend.app.core.indicators.base import registry as indicator_registry
    # Ensure imports
    import backend.app.core.indicators.rsi  # noqa
    import backend.app.core.indicators.macd  # noqa
    import backend.app.core.indicators.moving_averages  # noqa
    import backend.app.core.indicators.smart_money  # noqa

    result = await db.execute(select(Asset).where(Asset.symbol == symbol.upper()))
    asset = result.scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=404, detail=f"Asset {symbol} not found")

    timeframes = ["1h", "4h", "1d"]
    mtf_key_indicators = ["moving_averages", "macd", "rsi", "smart_money"]

    tf_results = {}
    for tf in timeframes:
        df = await _fetch_ohlcv_df(db, asset.id, tf)
        if df is None:
            tf_results[tf] = {"available": False, "indicators": {}}
            continue

        raw = indicator_registry.calculate_all(df)

        tf_indicators = {}
        for ind_name in mtf_key_indicators:
            if ind_name not in raw or not raw[ind_name]:
                continue
            latest = raw[ind_name][-1]
            meta = latest.metadata or {}
            cls = meta.get("classification", "neutral")

            # Classify as bullish/bearish/neutral
            signal = "neutral"
            if any(x in cls for x in ["bullish", "uptrend", "accumulation", "oversold"]):
                signal = "bullish"
            elif any(x in cls for x in ["bearish", "downtrend", "distribution", "overbought"]):
                signal = "bearish"

            tf_indicators[ind_name] = {
                "classification": cls,
                "signal": signal,
                "value": latest.value,
            }

        tf_results[tf] = {"available": True, "indicators": tf_indicators}

    # Score confluence
    confluence_scores = {}
    for ind_name in mtf_key_indicators:
        signals = []
        for tf in timeframes:
            if tf_results[tf]["available"] and ind_name in tf_results[tf]["indicators"]:
                signals.append(tf_results[tf]["indicators"][ind_name]["signal"])

        if len(signals) >= 2:
            bullish = signals.count("bullish")
            bearish = signals.count("bearish")
            total = len(signals)

            if bullish == total:
                confluence_scores[ind_name] = {"alignment": "strong_bullish", "score": 100}
            elif bearish == total:
                confluence_scores[ind_name] = {"alignment": "strong_bearish", "score": 100}
            elif bullish > bearish:
                confluence_scores[ind_name] = {"alignment": "bullish", "score": round(bullish / total * 100)}
            elif bearish > bullish:
                confluence_scores[ind_name] = {"alignment": "bearish", "score": round(bearish / total * 100)}
            else:
                confluence_scores[ind_name] = {"alignment": "mixed", "score": 50}

    # Overall confluence
    total_score = sum(c["score"] for c in confluence_scores.values())
    total_count = max(len(confluence_scores), 1)
    avg_confluence = total_score / total_count

    bullish_count = sum(1 for c in confluence_scores.values() if "bullish" in c["alignment"])
    bearish_count = sum(1 for c in confluence_scores.values() if "bearish" in c["alignment"])

    if bullish_count >= 3:
        overall = "strong_bullish"
    elif bearish_count >= 3:
        overall = "strong_bearish"
    elif bullish_count > bearish_count:
        overall = "bullish"
    elif bearish_count > bullish_count:
        overall = "bearish"
    else:
        overall = "mixed"

    return {
        "symbol": symbol.upper(),
        "timeframes": tf_results,
        "confluence": confluence_scores,
        "overall": {
            "direction": overall,
            "score": round(avg_confluence),
            "bullish_count": bullish_count,
            "bearish_count": bearish_count,
        },
    }


@router.get("/{symbol}/composite")
async def composite_score(
    symbol: str,
    timeframe: str = Query("1d"),
    db: AsyncSession = Depends(get_db),
):
    """
    Advanced Composite Score — combines ALL data sources:
    - Technical indicators (12 indicators, weighted)
    - Multi-timeframe confluence
    - Smart Money Concepts (Order Blocks, FVG, BOS)
    - Macro data (Treasury, Fed, CPI) — for gold
    - COT positioning — for gold
    - Session analysis — for gold
    - Key levels (S/R proximity, risk/reward)

    Returns a 0-100 score with confidence level and detailed breakdown.
    """
    import pandas as pd
    from backend.app.core.indicators.base import registry as indicator_registry
    # Ensure all imports
    import backend.app.core.indicators.volume  # noqa
    import backend.app.core.indicators.obv  # noqa
    import backend.app.core.indicators.ad_line  # noqa
    import backend.app.core.indicators.rsi  # noqa
    import backend.app.core.indicators.macd  # noqa
    import backend.app.core.indicators.bollinger  # noqa
    import backend.app.core.indicators.moving_averages  # noqa
    import backend.app.core.indicators.atr  # noqa
    import backend.app.core.indicators.stochastic_rsi  # noqa
    import backend.app.core.indicators.smart_money  # noqa
    import backend.app.core.indicators.key_levels  # noqa
    import backend.app.core.indicators.session_analysis  # noqa
    import backend.app.core.indicators.candle_patterns  # noqa

    result = await db.execute(select(Asset).where(Asset.symbol == symbol.upper()))
    asset = result.scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=404, detail=f"Asset {symbol} not found")

    # 1. Calculate all indicators on primary timeframe
    df = await _fetch_ohlcv_df(db, asset.id, timeframe)
    if df is None:
        raise HTTPException(status_code=400, detail="Not enough data")

    raw = indicator_registry.calculate_all(df)

    # Extract indicator signals with weights
    WEIGHTS = {
        "moving_averages": 2.0,
        "macd": 1.5,
        "rsi": 1.0,
        "stochastic_rsi": 0.75,
        "bollinger_bands": 1.0,
        "atr": 0.5,
        "volume_spike": 1.5,
        "obv": 1.0,
        "ad_line": 1.0,
        "smart_money": 2.5,     # High weight — institutional flow
        "key_levels": 1.5,      # Position in market structure
        "session_analysis": 1.0, # Session context
    }

    breakdown = []
    bullish_weight = 0
    bearish_weight = 0
    total_weight = 0

    for ind_name, results_list in raw.items():
        if not results_list:
            continue
        latest = results_list[-1]
        meta = latest.metadata or {}
        cls = meta.get("classification", "neutral")
        weight = WEIGHTS.get(ind_name, 1.0)

        signal = "neutral"
        if any(x in cls for x in ["bullish", "uptrend", "accumulation", "oversold",
                                    "at_support", "bullish_room", "bullish_continuation",
                                    "strong_bullish"]):
            signal = "bullish"
        elif any(x in cls for x in ["bearish", "downtrend", "distribution", "overbought",
                                      "at_resistance", "bearish_room", "bearish_continuation",
                                      "strong_bearish"]):
            signal = "bearish"

        # Check for divergences (strong signals)
        divergence = meta.get("divergence")
        if divergence:
            if "bullish" in divergence:
                signal = "bullish"
                weight *= 1.3  # Divergence boost
            elif "bearish" in divergence:
                signal = "bearish"
                weight *= 1.3

        # Check for crossovers
        crossover = meta.get("crossover")
        if crossover:
            if "bullish" in crossover or "golden" in crossover:
                signal = "bullish"
                weight *= 1.2
            elif "bearish" in crossover or "death" in crossover:
                signal = "bearish"
                weight *= 1.2

        total_weight += weight
        if signal == "bullish":
            bullish_weight += weight
        elif signal == "bearish":
            bearish_weight += weight

        breakdown.append({
            "name": ind_name,
            "signal": signal,
            "weight": round(weight, 2),
            "classification": cls,
        })

    # 2. Multi-timeframe confluence bonus
    mtf_bonus = 0
    mtf_direction = "mixed"
    try:
        mtf_timeframes = ["1h", "4h", "1d"]
        mtf_signals = {"bullish": 0, "bearish": 0}
        for tf in mtf_timeframes:
            if tf == timeframe:
                continue
            tf_df = await _fetch_ohlcv_df(db, asset.id, tf)
            if tf_df is None:
                continue
            # Check MA and MACD on other timeframes
            for ind_name in ["moving_averages", "macd"]:
                ind = indicator_registry.get(ind_name)
                tf_results = ind.calculate(tf_df)
                if tf_results:
                    latest = tf_results[-1]
                    cls = (latest.metadata or {}).get("classification", "")
                    if any(x in cls for x in ["bullish", "uptrend"]):
                        mtf_signals["bullish"] += 1
                    elif any(x in cls for x in ["bearish", "downtrend"]):
                        mtf_signals["bearish"] += 1

        if mtf_signals["bullish"] >= 3:
            mtf_bonus = 8
            mtf_direction = "strong_bullish"
        elif mtf_signals["bearish"] >= 3:
            mtf_bonus = -8
            mtf_direction = "strong_bearish"
        elif mtf_signals["bullish"] > mtf_signals["bearish"]:
            mtf_bonus = 4
            mtf_direction = "bullish"
        elif mtf_signals["bearish"] > mtf_signals["bullish"]:
            mtf_bonus = -4
            mtf_direction = "bearish"
    except Exception:
        pass

    # 3. Macro data (for gold/commodity)
    macro_bonus = 0
    macro_data = None
    is_gold = symbol.upper() in ("XAUUSD", "XAGUSD")

    if is_gold:
        try:
            from backend.app.data.macro_adapter import macro_adapter
            macro_summary = await macro_adapter.get_gold_macro_summary()
            macro_score = macro_summary.get("macro_score", {})
            macro_dir = macro_score.get("direction", "neutral")
            if macro_dir == "bullish":
                macro_bonus = 5
            elif macro_dir == "bearish":
                macro_bonus = -5
            macro_data = {
                "direction": macro_dir,
                "score": macro_score.get("score", 0),
                "bullish": macro_score.get("bullish_count", 0),
                "bearish": macro_score.get("bearish_count", 0),
            }
        except Exception:
            pass

    # 4. COT data (for gold)
    cot_bonus = 0
    cot_data = None
    if is_gold:
        try:
            from backend.app.data.cot_adapter import cot_adapter
            cot = await cot_adapter.get_gold_cot()
            if cot and "signals" in cot:
                cot_signals = cot["signals"]
                cot_bullish = sum(1 for s in cot_signals if "bullish" in s.lower())
                cot_bearish = sum(1 for s in cot_signals if "bearish" in s.lower())
                if cot_bullish > cot_bearish:
                    cot_bonus = 4
                elif cot_bearish > cot_bullish:
                    cot_bonus = -4
                cot_data = {
                    "bullish_signals": cot_bullish,
                    "bearish_signals": cot_bearish,
                    "signals": cot_signals[:3],
                }
        except Exception:
            pass

    # 5. Calculate final composite score
    neutral_weight = total_weight - bullish_weight - bearish_weight
    base_score = ((bullish_weight + neutral_weight * 0.5) / max(total_weight, 1)) * 100

    # Apply bonuses (clamped)
    final_score = base_score + mtf_bonus + macro_bonus + cot_bonus
    final_score = max(0, min(100, round(final_score)))

    # Direction
    if final_score >= 65:
        direction = "strong_buy"
    elif final_score >= 55:
        direction = "buy"
    elif final_score <= 35:
        direction = "strong_sell"
    elif final_score <= 45:
        direction = "sell"
    else:
        direction = "neutral"

    # Confidence based on signal alignment
    bull_count = sum(1 for b in breakdown if b["signal"] == "bullish")
    bear_count = sum(1 for b in breakdown if b["signal"] == "bearish")
    total_ind = len(breakdown)
    max_aligned = max(bull_count, bear_count)
    confidence = round(max_aligned / max(total_ind, 1) * 100)

    # Boost confidence if MTF agrees
    if (direction in ("strong_buy", "buy") and mtf_direction in ("bullish", "strong_bullish")) or \
       (direction in ("strong_sell", "sell") and mtf_direction in ("bearish", "strong_bearish")):
        confidence = min(confidence + 15, 100)

    return {
        "symbol": symbol.upper(),
        "timeframe": timeframe,
        "composite_score": final_score,
        "direction": direction,
        "confidence": confidence,
        "breakdown": {
            "technical": {
                "score": round(base_score),
                "bullish_count": bull_count,
                "bearish_count": bear_count,
                "neutral_count": total_ind - bull_count - bear_count,
                "indicators": breakdown,
            },
            "mtf_confluence": {
                "direction": mtf_direction,
                "bonus": mtf_bonus,
            },
            "macro": macro_data,
            "cot": cot_data,
        },
    }
