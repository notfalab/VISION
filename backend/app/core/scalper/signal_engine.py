"""
Signal Engine — combines all indicators, ML prediction, regime detection,
order flow, and smart money analysis to generate scalper trade signals.

Designed for 5m, 15m, 30m timeframes on gold (XAUUSD), crypto, forex.

v3 improvements:
- Smart money integration: order flow, institutional heat score, TP/SL clusters
- Block signals contradicted by strong order flow (e.g. long vs strong sell pressure)
- Block signals contradicted by institutional positioning
- SL placement avoids stop-loss clusters (dodge stop hunts)
- TP targeting uses buy/sell walls from order book
- Order flow + institutional heat scored as high-weight indicators

v2 improvements (retained):
- Structure-based SL placement (swing highs/lows instead of flat ATR)
- Minimum R:R filter (reject weak setups)
- Volatility regime filter (skip choppy markets)
- Trend alignment filter (trade with higher-TF EMA)
- Tighter BTC-specific thresholds
"""

import numpy as np
import pandas as pd
from datetime import datetime, timezone, timedelta

from backend.app.logging_config import get_logger

logger = get_logger("scalper.signal_engine")

# Scalper-specific indicator weights (higher weight on fast signals)
SCALPER_WEIGHTS = {
    "moving_averages": 2.0,
    "macd": 2.0,          # Fast momentum is key for scalping
    "rsi": 1.5,
    "stochastic_rsi": 1.5,
    "bollinger_bands": 1.0,
    "atr": 0.5,
    "volume_spike": 2.0,   # Volume confirmation critical
    "obv": 1.0,
    "ad_line": 0.75,
    "smart_money": 2.5,    # Institutional flow
    "key_levels": 2.0,     # S/R proximity
    "session_analysis": 0.75,
    "candle_patterns": 1.5, # Pattern recognition
}

# Signal thresholds (per-timeframe) — tuned to reduce noise-driven stop-outs
# Previous: min_confidence=0.55, min_confluence=4 → 16% win rate
# Now: stricter filtering = fewer but higher-quality signals
THRESHOLDS = {
    "default": {"min_score": 65, "min_confidence": 0.65, "min_confluence": 6},
    "5m":      {"min_score": 68, "min_confidence": 0.68, "min_confluence": 7},
    "15m":     {"min_score": 65, "min_confidence": 0.65, "min_confluence": 6},
    "1h":      {"min_score": 62, "min_confidence": 0.60, "min_confluence": 5},
    "1d":      {"min_score": 55, "min_confidence": 0.50, "min_confluence": 4},
    "1w":      {"min_score": 55, "min_confidence": 0.45, "min_confluence": 3},
}

# Crypto needs stricter thresholds (higher volatility → more false signals)
CRYPTO_THRESHOLDS = {
    "default": {"min_score": 72, "min_confidence": 0.70, "min_confluence": 7},
    "5m":      {"min_score": 75, "min_confidence": 0.73, "min_confluence": 8},
    "15m":     {"min_score": 72, "min_confidence": 0.70, "min_confluence": 7},
    "1h":      {"min_score": 68, "min_confidence": 0.65, "min_confluence": 6},
    "1d":      {"min_score": 60, "min_confidence": 0.58, "min_confluence": 5},
}

# BTC is the noisiest — needs even stricter thresholds
BTC_THRESHOLDS = {
    "default": {"min_score": 75, "min_confidence": 0.73, "min_confluence": 8},
    "5m":      {"min_score": 78, "min_confidence": 0.76, "min_confluence": 9},
    "15m":     {"min_score": 75, "min_confidence": 0.73, "min_confluence": 8},
    "1h":      {"min_score": 70, "min_confidence": 0.68, "min_confluence": 7},
    "1d":      {"min_score": 62, "min_confidence": 0.60, "min_confluence": 5},
}

CRYPTO_SYMBOLS = {"BTCUSD", "ETHUSD", "SOLUSD", "XRPUSD", "ETHBTC"}
BTC_SYMBOLS = {"BTCUSD"}

# Forex thresholds — moderate volatility, stricter on short timeframes
FOREX_THRESHOLDS = {
    "default": {"min_score": 65, "min_confidence": 0.65, "min_confluence": 6},
    "5m":      {"min_score": 68, "min_confidence": 0.68, "min_confluence": 7},
    "15m":     {"min_score": 65, "min_confidence": 0.65, "min_confluence": 6},
    "1h":      {"min_score": 62, "min_confidence": 0.60, "min_confluence": 5},
    "1d":      {"min_score": 55, "min_confidence": 0.50, "min_confluence": 4},
}

FOREX_SYMBOLS = {"EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "NZDUSD", "USDCHF",
                 "EURGBP", "EURJPY", "GBPJPY"}


def _get_thresholds(timeframe: str, symbol: str = "") -> dict:
    if symbol.upper() in BTC_SYMBOLS:
        return BTC_THRESHOLDS.get(timeframe, BTC_THRESHOLDS["default"])
    if symbol.upper() in CRYPTO_SYMBOLS:
        return CRYPTO_THRESHOLDS.get(timeframe, CRYPTO_THRESHOLDS["default"])
    if symbol.upper() in FOREX_SYMBOLS:
        return FOREX_THRESHOLDS.get(timeframe, FOREX_THRESHOLDS["default"])
    return THRESHOLDS.get(timeframe, THRESHOLDS["default"])


# SL/TP ATR multipliers per timeframe — wider stops on fast TFs to survive noise
# Previous: flat 1.5x SL on 5m = stopped out by normal wicks
# Now: 5m gets 2.5x SL / 4.0x TP = room to breathe, good R:R
ATR_MULT_BY_TF = {
    "1m":  (2.0, 3.0),
    "5m":  (2.5, 4.0),    # Was 1.5/2.5 → constant noise stop-outs
    "15m": (2.0, 3.5),    # Was 1.5/2.5
    "30m": (1.8, 3.0),
    "1h":  (1.5, 2.5),    # Hourly is fine with original
    "4h":  (1.5, 2.5),
    "1d":  (1.5, 2.5),
}

CRYPTO_ATR_MULT_BY_TF = {
    "1m":  (2.5, 4.0),
    "5m":  (3.0, 5.0),    # Was 2.0/3.0 → crypto noise is extreme on 5m
    "15m": (2.5, 4.0),
    "30m": (2.0, 3.5),
    "1h":  (2.0, 3.0),
    "4h":  (1.8, 3.0),
    "1d":  (1.5, 2.5),
}

# BTC has extreme wicks — even wider SL needed to survive noise
BTC_ATR_MULT_BY_TF = {
    "1m":  (3.0, 4.5),
    "5m":  (3.5, 5.5),    # BTC 5m wicks are brutal
    "15m": (3.0, 5.0),
    "30m": (2.5, 4.0),
    "1h":  (2.5, 3.5),
    "4h":  (2.0, 3.0),
    "1d":  (1.8, 2.8),
}

# Minimum R:R ratio required per asset class
MIN_RR_RATIO = {
    "btc":     1.8,   # BTC needs high R:R to compensate for lower win rate
    "crypto":  1.5,   # Other crypto
    "forex":   1.3,   # Forex is more predictable
    "default": 1.5,
}


def _get_atr_multipliers(symbol: str, timeframe: str = "1h") -> tuple[float, float]:
    """Return (SL_mult, TP_mult) based on asset type and timeframe."""
    if symbol.upper() in BTC_SYMBOLS:
        return BTC_ATR_MULT_BY_TF.get(timeframe, (2.5, 3.5))
    if symbol.upper() in CRYPTO_SYMBOLS:
        return CRYPTO_ATR_MULT_BY_TF.get(timeframe, (2.0, 3.0))
    return ATR_MULT_BY_TF.get(timeframe, (1.5, 2.5))


def _get_min_rr(symbol: str) -> float:
    """Return minimum required R:R ratio for this asset."""
    if symbol.upper() in BTC_SYMBOLS:
        return MIN_RR_RATIO["btc"]
    if symbol.upper() in CRYPTO_SYMBOLS:
        return MIN_RR_RATIO["crypto"]
    if symbol.upper() in FOREX_SYMBOLS:
        return MIN_RR_RATIO["forex"]
    return MIN_RR_RATIO["default"]


def _find_swing_high(df: pd.DataFrame, lookback: int = 20) -> float:
    """Find the most recent swing high (local maximum) in the last N candles."""
    if len(df) < lookback:
        lookback = len(df)
    recent = df.tail(lookback)
    highs = recent["high"].values
    # Find the highest point that has lower highs on both sides (or is at edge)
    best = float(highs.max())
    for i in range(1, len(highs) - 1):
        if highs[i] > highs[i - 1] and highs[i] > highs[i + 1]:
            best = max(best, float(highs[i]))
    return best


def _find_swing_low(df: pd.DataFrame, lookback: int = 20) -> float:
    """Find the most recent swing low (local minimum) in the last N candles."""
    if len(df) < lookback:
        lookback = len(df)
    recent = df.tail(lookback)
    lows = recent["low"].values
    best = float(lows.min())
    for i in range(1, len(lows) - 1):
        if lows[i] < lows[i - 1] and lows[i] < lows[i + 1]:
            best = min(best, float(lows[i]))
    return best


def _is_choppy_market(df: pd.DataFrame, lookback: int = 20) -> bool:
    """
    Detect choppy / range-bound conditions where signals fail most often.
    Uses ATR expansion ratio + directional consistency check.
    """
    if len(df) < lookback + 10:
        return False

    recent = df.tail(lookback)
    older = df.iloc[-(lookback + 10):-lookback]

    # ATR expansion: if recent ATR >> older ATR, market is volatile/choppy
    def _atr(segment: pd.DataFrame) -> float:
        h = segment["high"].values
        l = segment["low"].values
        c = segment["close"].values
        tr = np.maximum(h - l, np.maximum(np.abs(h - np.roll(c, 1)), np.abs(l - np.roll(c, 1))))
        return float(np.mean(tr[1:]))

    recent_atr = _atr(recent)
    older_atr = _atr(older)
    if older_atr > 0 and recent_atr / older_atr > 2.0:
        return True  # ATR doubled → volatile/choppy

    # Directional consistency: count how many candles flip direction
    closes = recent["close"].values
    changes = np.diff(closes)
    if len(changes) == 0:
        return False
    direction_changes = np.sum(np.diff(np.sign(changes)) != 0)
    flip_ratio = direction_changes / len(changes)
    if flip_ratio > 0.65:  # >65% of candles reverse direction → choppy
        return True

    return False


def _ema(series: np.ndarray, period: int) -> float:
    """Calculate the latest EMA value for a numpy array of prices."""
    if len(series) < period:
        return float(np.mean(series))
    alpha = 2.0 / (period + 1)
    ema_val = float(series[0])
    for price in series[1:]:
        ema_val = alpha * float(price) + (1 - alpha) * ema_val
    return ema_val


def _check_trend_alignment(df: pd.DataFrame, direction: str) -> bool:
    """
    Check if the signal direction aligns with the higher-timeframe trend.
    Uses 50-EMA and 200-EMA on the current data as a proxy.
    Returns True if direction aligns with trend (or if insufficient data).
    """
    if len(df) < 50:
        return True  # Not enough data — allow signal

    closes = df["close"].values
    ema50 = _ema(closes, 50)

    # Use 200-EMA if enough data, otherwise just 50-EMA vs price
    if len(df) >= 200:
        ema200 = _ema(closes, 200)
        # Trend is up if 50-EMA > 200-EMA AND price > 50-EMA
        trend_up = ema50 > ema200 and closes[-1] > ema50
        trend_down = ema50 < ema200 and closes[-1] < ema50
    else:
        # Just use price vs 50-EMA
        trend_up = closes[-1] > ema50
        trend_down = closes[-1] < ema50

    if direction == "long" and trend_down:
        return False  # Counter-trend long
    if direction == "short" and trend_up:
        return False  # Counter-trend short

    return True


def _classify_signal(metadata: dict) -> str:
    """Classify an indicator result as bullish, bearish, or neutral."""
    cls = metadata.get("classification", "neutral")
    divergence = metadata.get("divergence", "")
    crossover = metadata.get("crossover", "")

    bullish_keywords = [
        "bullish", "uptrend", "accumulation", "oversold",
        "at_support", "bullish_room", "bullish_continuation",
        "strong_bullish", "golden_cross",
    ]
    bearish_keywords = [
        "bearish", "downtrend", "distribution", "overbought",
        "at_resistance", "bearish_room", "bearish_continuation",
        "strong_bearish", "death_cross",
    ]

    # Check divergence (strong signal)
    if "bullish" in divergence:
        return "bullish"
    if "bearish" in divergence:
        return "bearish"

    # Check crossover
    if crossover:
        if any(k in crossover for k in ["bullish", "golden"]):
            return "bullish"
        if any(k in crossover for k in ["bearish", "death"]):
            return "bearish"

    # Check classification
    if any(k in cls for k in bullish_keywords):
        return "bullish"
    if any(k in cls for k in bearish_keywords):
        return "bearish"

    return "neutral"


def _analyze_smart_money(orderbook: dict | None, current_price: float, symbol: str) -> dict:
    """
    Analyze order book with smart money tools: order flow, heat score, TP/SL clusters.
    Returns a dict with all smart money signals for the signal engine.
    """
    result = {
        "order_flow": None,
        "heat_score": None,
        "tpsl": None,
        "flow_signal": "neutral",
        "flow_delta_pct": 0.0,
        "institutional_score": 50,
        "institutional_signal": "neutral",
        "sl_danger_zones": [],   # Price levels where stop clusters exist
        "support_walls": [],     # Large bid walls (support)
        "resistance_walls": [],  # Large ask walls (resistance)
    }
    if not orderbook:
        return result

    bids = orderbook.get("bids", [])
    asks = orderbook.get("asks", [])
    if not bids or not asks:
        return result

    try:
        from backend.app.core.orderbook.flow_analyzer import analyze_order_flow
        flow = analyze_order_flow(orderbook)
        if "error" not in flow:
            result["order_flow"] = flow
            result["flow_signal"] = flow.get("signal", "neutral")
            result["flow_delta_pct"] = flow.get("delta_pct", 0.0)
            result["support_walls"] = flow.get("buy_walls", [])
            result["resistance_walls"] = flow.get("sell_walls", [])

            try:
                from backend.app.core.institutional.heat_score import compute_heat_score
                heat = compute_heat_score(orderflow=flow)
                result["heat_score"] = heat
                result["institutional_score"] = heat.get("score", 50)
                result["institutional_signal"] = heat.get("signal", "neutral")
            except Exception:
                pass
    except Exception:
        pass

    try:
        from backend.app.core.orderbook.tpsl_analyzer import analyze_tpsl_heatmap
        tpsl = analyze_tpsl_heatmap(bids, asks, current_price)
        result["tpsl"] = tpsl
        for cluster in tpsl.get("sl_clusters", []):
            if cluster.get("strength", 0) >= 0.5:
                result["sl_danger_zones"].append({
                    "price_min": cluster["price_min"],
                    "price_max": cluster["price_max"],
                    "strength": cluster["strength"],
                    "type": cluster.get("type", ""),
                })
    except Exception:
        pass

    return result


def generate_signals(
    df: pd.DataFrame,
    symbol: str,
    timeframe: str,
    loss_patterns: list[dict] | None = None,
    orderbook: dict | None = None,
) -> list[dict]:
    """
    Generate scalper signals from OHLCV data + smart money analysis.

    Args:
        df: OHLCV DataFrame with columns [timestamp, open, high, low, close, volume]
        symbol: Trading symbol (e.g., "XAUUSD")
        timeframe: Candle timeframe (e.g., "5m", "15m", "30m")
        loss_patterns: Active loss patterns to filter against
        orderbook: Optional order book dict with 'bids'/'asks' for smart money analysis

    Returns:
        List of signal dicts ready to be stored as ScalperSignal records
    """
    if df is None or len(df) < 50:
        logger.warning("insufficient_data", symbol=symbol, timeframe=timeframe, rows=len(df) if df is not None else 0)
        return []

    # ── 1. Calculate ALL indicators ──
    from backend.app.core.indicators.base import registry as indicator_registry
    # Ensure all indicator modules are imported
    import backend.app.core.indicators.volume        # noqa
    import backend.app.core.indicators.obv            # noqa
    import backend.app.core.indicators.ad_line        # noqa
    import backend.app.core.indicators.rsi            # noqa
    import backend.app.core.indicators.macd           # noqa
    import backend.app.core.indicators.bollinger      # noqa
    import backend.app.core.indicators.moving_averages  # noqa
    import backend.app.core.indicators.atr            # noqa
    import backend.app.core.indicators.stochastic_rsi # noqa
    import backend.app.core.indicators.smart_money    # noqa
    import backend.app.core.indicators.key_levels     # noqa
    import backend.app.core.indicators.session_analysis  # noqa
    import backend.app.core.indicators.candle_patterns  # noqa

    raw = indicator_registry.calculate_all(df)

    # ── 2. Score each indicator ──
    bullish_weight = 0.0
    bearish_weight = 0.0
    total_weight = 0.0
    bullish_reasons = []
    bearish_reasons = []
    indicator_snapshot = {}

    for ind_name, results_list in raw.items():
        if not results_list:
            continue
        latest = results_list[-1]
        meta = latest.metadata or {}
        weight = SCALPER_WEIGHTS.get(ind_name, 1.0)

        signal = _classify_signal(meta)

        # Check for divergence boost
        divergence = meta.get("divergence", "")
        if divergence and "none" not in divergence:
            weight *= 1.3

        if signal == "bullish":
            bullish_weight += weight
            bullish_reasons.append(ind_name)
        elif signal == "bearish":
            bearish_weight += weight
            bearish_reasons.append(ind_name)

        total_weight += weight

        # Build indicator snapshot
        indicator_snapshot[ind_name] = {
            "value": latest.value,
            "secondary": latest.secondary_value,
            "classification": meta.get("classification", "neutral"),
            "signal": signal,
        }

    if total_weight == 0:
        return []

    # ── 2b. Smart Money Analysis (order flow, institutional heat, TP/SL clusters) ──
    current_price = float(df["close"].iloc[-1])
    sm = _analyze_smart_money(orderbook, current_price, symbol)

    # Incorporate order flow into scoring
    flow_weight = 3.0  # High weight — order flow is direct institutional signal
    flow_delta = sm["flow_delta_pct"]
    flow_sig = sm["flow_signal"]

    if flow_sig in ("strong_buy_pressure", "buy_pressure"):
        bullish_weight += flow_weight
        bullish_reasons.append("order_flow")
        total_weight += flow_weight
    elif flow_sig in ("strong_sell_pressure", "sell_pressure"):
        bearish_weight += flow_weight
        bearish_reasons.append("order_flow")
        total_weight += flow_weight
    elif sm["order_flow"] is not None:
        total_weight += flow_weight  # Neutral still counts toward total

    # Incorporate institutional heat score
    inst_score = sm["institutional_score"]
    inst_signal = sm["institutional_signal"]
    inst_weight = 2.5

    if "accumulation" in inst_signal:
        bullish_weight += inst_weight
        bullish_reasons.append("institutional_heat")
        total_weight += inst_weight
    elif "distribution" in inst_signal:
        bearish_weight += inst_weight
        bearish_reasons.append("institutional_heat")
        total_weight += inst_weight
    elif sm["heat_score"] is not None:
        total_weight += inst_weight

    # Log smart money data for snapshot
    if sm["order_flow"] is not None:
        indicator_snapshot["order_flow"] = {
            "delta_pct": round(flow_delta, 2),
            "signal": flow_sig,
            "classification": flow_sig,
        }
    if sm["heat_score"] is not None:
        indicator_snapshot["institutional_heat"] = {
            "score": inst_score,
            "signal": inst_signal,
            "classification": inst_signal,
        }

    thresholds = _get_thresholds(timeframe, symbol)
    min_composite_score = thresholds["min_score"]
    min_confidence = thresholds["min_confidence"]
    min_confluence = thresholds["min_confluence"]

    # ── 3. ML Prediction ──
    ml_direction = "neutral"
    ml_confidence = 0.0
    try:
        from backend.app.core.ml.predictor import predict
        ml_result = predict(df, symbol, timeframe)
        if "error" not in ml_result:
            ml_direction = ml_result.get("direction", "neutral")
            ml_confidence = ml_result.get("confidence", 0)
            indicator_snapshot["ml_prediction"] = {
                "direction": ml_direction,
                "confidence": ml_confidence,
            }
    except Exception as e:
        logger.debug("ml_predict_failed", error=str(e))

    # ── 4. Regime Detection ──
    regime = "unknown"
    regime_confidence = 0.0
    try:
        from backend.app.core.ml.regime import detect_regime
        regime_result = detect_regime(df)
        regime = regime_result.get("regime", "unknown")
        regime_confidence = regime_result.get("confidence", 0)
        indicator_snapshot["regime"] = {
            "type": regime,
            "confidence": regime_confidence,
        }
    except Exception as e:
        logger.debug("regime_detect_failed", error=str(e))

    # ── 5. Compute Composite Score ──
    bullish_pct = bullish_weight / total_weight if total_weight > 0 else 0
    bearish_pct = bearish_weight / total_weight if total_weight > 0 else 0
    net_score = bullish_pct - bearish_pct  # -1 to +1

    # Convert to 0-100 scale (50 = neutral)
    composite_score = round(50 + (net_score * 50), 1)

    # ── 6. Determine Direction ──
    if composite_score >= min_composite_score:
        direction = "long"
        confluence_count = len(bullish_reasons)
        reasons = bullish_reasons
    elif composite_score <= (100 - min_composite_score):
        direction = "short"
        confluence_count = len(bearish_reasons)
        reasons = bearish_reasons
    else:
        # Score too neutral — no signal
        logger.info(
            "signal_score_neutral",
            symbol=symbol, timeframe=timeframe,
            composite_score=composite_score,
            threshold=min_composite_score,
            bullish=bullish_reasons, bearish=bearish_reasons,
        )
        return []

    # ── 7. Validate ML agreement ──
    # ML should agree with technical direction
    ml_agrees = False
    if direction == "long" and ml_direction == "bullish":
        ml_agrees = True
    elif direction == "short" and ml_direction == "bearish":
        ml_agrees = True
    elif ml_direction == "neutral":
        ml_agrees = True  # Neutral doesn't contradict

    # ── 8. Validate regime compatibility ──
    regime_compatible = True
    if direction == "long" and regime == "trending_down":
        regime_compatible = False
    elif direction == "short" and regime == "trending_up":
        regime_compatible = False

    # ── 8b. Validate order flow alignment ──
    # Block signals where order flow strongly contradicts our direction
    flow_contradicts = False
    if sm["order_flow"] is not None:
        if direction == "long" and flow_sig in ("strong_sell_pressure",):
            flow_contradicts = True
            logger.info(
                "signal_blocked_flow_contradiction",
                symbol=symbol, timeframe=timeframe, direction=direction,
                flow_signal=flow_sig, delta_pct=flow_delta,
            )
            return []
        if direction == "short" and flow_sig in ("strong_buy_pressure",):
            flow_contradicts = True
            logger.info(
                "signal_blocked_flow_contradiction",
                symbol=symbol, timeframe=timeframe, direction=direction,
                flow_signal=flow_sig, delta_pct=flow_delta,
            )
            return []

    # ── 8c. Block if institutional positioning contradicts direction ──
    if sm["heat_score"] is not None:
        if direction == "long" and inst_signal in ("institutional_distribution", "mild_distribution"):
            if inst_score < 35:
                logger.info(
                    "signal_blocked_institutional_contra",
                    symbol=symbol, direction=direction, inst_signal=inst_signal, inst_score=inst_score,
                )
                return []
        if direction == "short" and inst_signal in ("institutional_accumulation", "mild_accumulation"):
            if inst_score > 65:
                logger.info(
                    "signal_blocked_institutional_contra",
                    symbol=symbol, direction=direction, inst_signal=inst_signal, inst_score=inst_score,
                )
                return []

    # ── 9. Calculate confidence ──
    # Base confidence from indicator strength
    if direction == "long":
        base_confidence = bullish_pct
    else:
        base_confidence = bearish_pct

    # Boost/penalize confidence
    confidence = base_confidence

    if ml_agrees and ml_confidence > 0.5:
        confidence = confidence * 0.7 + ml_confidence * 0.3  # Blend with ML

    if not regime_compatible:
        confidence *= 0.4  # Trading against trend is extremely risky

    if confluence_count < min_confluence:
        confidence *= 0.7  # Low confluence = weak setup

    # Smart money confidence adjustments
    if sm["order_flow"] is not None:
        # Flow alignment boost
        if direction == "long" and flow_sig in ("strong_buy_pressure", "buy_pressure"):
            confidence *= 1.12  # Order flow confirms direction
        elif direction == "short" and flow_sig in ("strong_sell_pressure", "sell_pressure"):
            confidence *= 1.12
        # Mild contradiction penalty (not enough to block, but penalize)
        elif direction == "long" and "sell" in flow_sig:
            confidence *= 0.80
        elif direction == "short" and "buy" in flow_sig:
            confidence *= 0.80

    if sm["heat_score"] is not None:
        # Institutional alignment boost
        if direction == "long" and "accumulation" in inst_signal:
            confidence *= 1.10
        elif direction == "short" and "distribution" in inst_signal:
            confidence *= 1.10

    confidence = round(min(max(confidence, 0), 1.0), 3)

    # ── 10. Block overextended entries (RSI extremes) ──
    rsi_val = indicator_snapshot.get("rsi", {}).get("value", 50)
    if direction == "long" and rsi_val > 72:
        logger.info("signal_blocked_overbought", symbol=symbol, rsi=rsi_val, direction=direction)
        return []  # Don't enter longs at overbought — historically lose 80%+
    if direction == "short" and rsi_val < 28:
        logger.info("signal_blocked_oversold", symbol=symbol, rsi=rsi_val, direction=direction)
        return []  # Don't enter shorts at oversold — historically lose 80%+

    # ── 10b. Volatility / choppy market filter ──
    if _is_choppy_market(df):
        logger.info(
            "signal_blocked_choppy",
            symbol=symbol, timeframe=timeframe, direction=direction,
            composite_score=composite_score,
        )
        return []  # Choppy markets eat stop losses alive — skip entirely

    # ── 10c. Trend alignment filter ──
    # Only allow signals that align with the higher-TF trend (50/200 EMA)
    if not _check_trend_alignment(df, direction):
        # Counter-trend trades CAN work, but need much higher confidence
        counter_trend_min_conf = min_confidence + 0.10  # +10% confidence required
        if confidence < counter_trend_min_conf:
            logger.info(
                "signal_blocked_counter_trend",
                symbol=symbol, timeframe=timeframe, direction=direction,
                confidence=confidence, threshold=counter_trend_min_conf,
            )
            return []
        else:
            # Allow but penalize
            confidence *= 0.85
            logger.info("signal_counter_trend_penalty", symbol=symbol, direction=direction)

    # ── 11. Apply loss pattern filters (stronger penalties) ──
    loss_filter_applied = False
    if loss_patterns:
        for pattern in loss_patterns:
            conditions = pattern.get("conditions", {})
            # Known loss pattern for this regime+direction → heavy penalty
            if conditions.get("regime") == regime and conditions.get("direction") == direction:
                confidence *= 0.5  # Was 0.7 (30% penalty) → now 50% penalty
                loss_filter_applied = True
                logger.info(
                    "loss_filter_applied",
                    pattern_id=pattern.get("id"),
                    category=pattern.get("category"),
                    new_confidence=confidence,
                )
            # Overextended patterns with RSI near extremes → block entirely
            if conditions.get("category") == "overextended":
                if (direction == "long" and rsi_val > 65) or (direction == "short" and rsi_val < 35):
                    logger.info("signal_blocked_overextended_pattern", symbol=symbol, rsi=rsi_val)
                    return []  # Skip trade entirely if known overextended loss pattern

    # ── 12. Check minimum thresholds ──
    if confidence < min_confidence:
        logger.info(
            "signal_below_confidence",
            symbol=symbol, timeframe=timeframe,
            confidence=confidence, threshold=min_confidence,
            composite_score=composite_score, direction=direction,
            confluence=confluence_count,
        )
        return []

    # ── 13. Calculate SL/TP — structure-based with ATR fallback ──
    atr_data = indicator_snapshot.get("atr", {})
    atr_value = atr_data.get("value", 0)

    if atr_value <= 0:
        # Fallback: calculate ATR manually
        if len(df) >= 14:
            highs = df["high"].tail(14).values
            lows = df["low"].tail(14).values
            closes = df["close"].tail(14).values
            tr = np.maximum(
                highs - lows,
                np.maximum(
                    np.abs(highs - np.roll(closes, 1)),
                    np.abs(lows - np.roll(closes, 1)),
                ),
            )
            atr_value = float(np.mean(tr[1:]))  # Skip first (NaN from roll)

    if atr_value <= 0:
        atr_value = abs(df["close"].iloc[-1] * 0.002)  # 0.2% fallback

    current_price = float(df["close"].iloc[-1])
    sl_mult, tp_mult = _get_atr_multipliers(symbol, timeframe)

    # Structure-based SL: use swing high/low as the SL anchor,
    # then add ATR buffer. This places SL beyond market structure
    # instead of an arbitrary ATR distance.
    atr_sl = sl_mult * atr_value
    atr_tp = tp_mult * atr_value

    if direction == "long":
        entry_price = current_price
        # SL below recent swing low (with small ATR buffer)
        swing_low = _find_swing_low(df, lookback=20)
        structure_sl = swing_low - (0.5 * atr_value)  # Buffer below swing
        atr_based_sl = entry_price - atr_sl
        # Use the WIDER of the two (more protective)
        stop_loss = round(min(structure_sl, atr_based_sl), 2)
        # But cap SL distance to max 2x the ATR-based SL (avoid absurd distances)
        max_sl_dist = atr_sl * 2.0
        if entry_price - stop_loss > max_sl_dist:
            stop_loss = round(entry_price - max_sl_dist, 2)
        take_profit = round(entry_price + atr_tp, 2)
    else:
        entry_price = current_price
        # SL above recent swing high (with small ATR buffer)
        swing_high = _find_swing_high(df, lookback=20)
        structure_sl = swing_high + (0.5 * atr_value)  # Buffer above swing
        atr_based_sl = entry_price + atr_sl
        # Use the WIDER of the two (more protective)
        stop_loss = round(max(structure_sl, atr_based_sl), 2)
        # Cap SL distance
        max_sl_dist = atr_sl * 2.0
        if stop_loss - entry_price > max_sl_dist:
            stop_loss = round(entry_price + max_sl_dist, 2)
        take_profit = round(entry_price - atr_tp, 2)

    # ── 13a. Smart money SL/TP adjustment ──
    # Move SL beyond stop-loss clusters to avoid stop hunts
    if sm["sl_danger_zones"]:
        for zone in sm["sl_danger_zones"]:
            zone_min = zone["price_min"]
            zone_max = zone["price_max"]
            zone_buffer = (zone_max - zone_min) * 0.3  # 30% buffer past the zone

            if direction == "long" and zone_min <= stop_loss <= zone_max:
                # Our SL is inside a stop cluster — move it below the cluster
                new_sl = zone_min - zone_buffer
                if entry_price - new_sl <= max_sl_dist:
                    stop_loss = round(new_sl, 2)
                    logger.info("sl_adjusted_below_stop_cluster", symbol=symbol, old_sl=stop_loss, new_sl=new_sl)

            elif direction == "short" and zone_min <= stop_loss <= zone_max:
                # Our SL is inside a stop cluster — move it above the cluster
                new_sl = zone_max + zone_buffer
                if new_sl - entry_price <= max_sl_dist:
                    stop_loss = round(new_sl, 2)
                    logger.info("sl_adjusted_above_stop_cluster", symbol=symbol, old_sl=stop_loss, new_sl=new_sl)

    # Use buy/sell walls for better TP targeting
    if sm["support_walls"] and direction == "short":
        # For shorts, strong buy walls are potential bounce points — use as TP
        nearest_wall = min(
            (w for w in sm["support_walls"] if w["price"] < entry_price),
            key=lambda w: entry_price - w["price"],
            default=None,
        )
        if nearest_wall and nearest_wall["strength"] >= 3.0:
            wall_tp = nearest_wall["price"] + (0.3 * atr_value)  # TP just above the wall
            if abs(entry_price - wall_tp) > abs(entry_price - take_profit) * 0.5:
                take_profit = round(wall_tp, 2)

    if sm["resistance_walls"] and direction == "long":
        # For longs, strong sell walls are potential resistance — use as TP
        nearest_wall = min(
            (w for w in sm["resistance_walls"] if w["price"] > entry_price),
            key=lambda w: w["price"] - entry_price,
            default=None,
        )
        if nearest_wall and nearest_wall["strength"] >= 3.0:
            wall_tp = nearest_wall["price"] - (0.3 * atr_value)  # TP just below the wall
            if abs(wall_tp - entry_price) > abs(take_profit - entry_price) * 0.5:
                take_profit = round(wall_tp, 2)

    risk = abs(entry_price - stop_loss)
    reward = abs(take_profit - entry_price)
    risk_reward = round(reward / risk, 2) if risk > 0 else 0

    # ── 13b. Minimum R:R filter — reject weak risk/reward setups ──
    min_rr = _get_min_rr(symbol)
    if risk_reward < min_rr:
        logger.info(
            "signal_blocked_low_rr",
            symbol=symbol, timeframe=timeframe, direction=direction,
            risk_reward=risk_reward, min_rr=min_rr,
            entry=entry_price, sl=stop_loss, tp=take_profit,
        )
        return []

    # ── 14. Build signal ──
    # Expiry: give trades ~12 candles to develop (was only 6 → constant expiry)
    expiry_map = {"1m": 15, "5m": 60, "15m": 180, "30m": 360, "1h": 600, "4h": 1440, "1d": 2880}
    expiry_minutes = expiry_map.get(timeframe, 120)

    signal = {
        "symbol": symbol.upper(),
        "timeframe": timeframe,
        "direction": direction,
        "status": "pending",
        "entry_price": round(entry_price, 2),
        "stop_loss": round(stop_loss, 2),
        "take_profit": round(take_profit, 2),
        "risk_reward_ratio": risk_reward,
        "confidence": confidence,
        "composite_score": composite_score,
        "ml_confidence": ml_confidence if ml_confidence > 0 else None,
        "regime_at_signal": regime,
        "signal_reasons": {
            "direction": direction,
            "bullish_indicators": bullish_reasons,
            "bearish_indicators": bearish_reasons,
            "confluence_count": confluence_count,
            "ml_agrees": ml_agrees,
            "regime_compatible": regime_compatible,
            "loss_filter_applied": loss_filter_applied,
            "atr_value": round(atr_value, 4),
            "sl_type": "structure+atr+smart_money",
            "min_rr_required": min_rr,
            "order_flow": flow_sig if sm["order_flow"] else "unavailable",
            "flow_delta_pct": round(flow_delta, 2) if sm["order_flow"] else None,
            "institutional_score": inst_score if sm["heat_score"] else None,
            "institutional_signal": inst_signal if sm["heat_score"] else "unavailable",
            "sl_danger_zones_count": len(sm["sl_danger_zones"]),
        },
        "indicator_snapshot": indicator_snapshot,
        "mtf_confluence": False,
        "agreeing_timeframes": [timeframe],
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=expiry_minutes)).isoformat(),
    }

    logger.info(
        "signal_generated",
        symbol=symbol,
        timeframe=timeframe,
        direction=direction,
        entry=entry_price,
        sl=stop_loss,
        tp=take_profit,
        confidence=f"{confidence:.1%}",
        score=composite_score,
        reasons=len(reasons),
    )

    return [signal]


def scan_multi_timeframe(
    dataframes: dict[str, pd.DataFrame],
    symbol: str,
    loss_patterns: list[dict] | None = None,
    orderbook: dict | None = None,
) -> list[dict]:
    """
    Scan multiple timeframes (5m, 15m, 30m) and flag confluence.

    Args:
        dataframes: {"5m": df_5m, "15m": df_15m, "30m": df_30m}
        symbol: Trading symbol
        loss_patterns: Active loss patterns
        orderbook: Optional order book dict for smart money analysis

    Returns:
        List of signals with MTF confluence flags
    """
    all_signals = []
    directions_by_tf = {}

    for tf, df in dataframes.items():
        if df is None or len(df) < 50:
            continue
        signals = generate_signals(df, symbol, tf, loss_patterns, orderbook=orderbook)
        for sig in signals:
            directions_by_tf[tf] = sig["direction"]
            all_signals.append(sig)

    # Check for multi-timeframe confluence
    if len(directions_by_tf) > 1:
        # Find direction with most agreement
        long_tfs = [tf for tf, d in directions_by_tf.items() if d == "long"]
        short_tfs = [tf for tf, d in directions_by_tf.items() if d == "short"]

        if len(long_tfs) >= 2:
            for sig in all_signals:
                if sig["direction"] == "long":
                    sig["mtf_confluence"] = True
                    sig["agreeing_timeframes"] = long_tfs
                    sig["confidence"] = min(sig["confidence"] * 1.15, 1.0)  # Confluence boost
                    sig["confidence"] = round(sig["confidence"], 3)

        if len(short_tfs) >= 2:
            for sig in all_signals:
                if sig["direction"] == "short":
                    sig["mtf_confluence"] = True
                    sig["agreeing_timeframes"] = short_tfs
                    sig["confidence"] = min(sig["confidence"] * 1.15, 1.0)
                    sig["confidence"] = round(sig["confidence"], 3)

    return all_signals
