"""
Signal Engine — combines all indicators, ML prediction, regime detection,
and order flow to generate scalper trade signals with SL/TP levels.

Designed for 5m, 15m, 30m timeframes on gold (XAUUSD).
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
    "default": {"min_score": 70, "min_confidence": 0.68, "min_confluence": 6},
    "5m":      {"min_score": 72, "min_confidence": 0.70, "min_confluence": 7},
    "1h":      {"min_score": 65, "min_confidence": 0.62, "min_confluence": 6},
    "1d":      {"min_score": 58, "min_confidence": 0.55, "min_confluence": 5},
}

CRYPTO_SYMBOLS = {"BTCUSD", "ETHUSD", "SOLUSD", "XRPUSD", "ETHBTC"}

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


def _get_atr_multipliers(symbol: str, timeframe: str = "1h") -> tuple[float, float]:
    """Return (SL_mult, TP_mult) based on asset type and timeframe."""
    if symbol.upper() in CRYPTO_SYMBOLS:
        return CRYPTO_ATR_MULT_BY_TF.get(timeframe, (2.0, 3.0))
    return ATR_MULT_BY_TF.get(timeframe, (1.5, 2.5))


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


def generate_signals(
    df: pd.DataFrame,
    symbol: str,
    timeframe: str,
    loss_patterns: list[dict] | None = None,
) -> list[dict]:
    """
    Generate scalper signals from OHLCV data.

    Args:
        df: OHLCV DataFrame with columns [timestamp, open, high, low, close, volume]
        symbol: Trading symbol (e.g., "XAUUSD")
        timeframe: Candle timeframe (e.g., "5m", "15m", "30m")
        loss_patterns: Active loss patterns to filter against

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

    # ── 9. Calculate confidence ──
    # Base confidence from composite score
    if direction == "long":
        base_confidence = min((composite_score - 50) / 50, 1.0)
    else:
        base_confidence = min((50 - composite_score) / 50, 1.0) if composite_score < 50 else min((composite_score - 50) / 50, 1.0)
        base_confidence = min((100 - composite_score - 50) / 50, 1.0) if composite_score <= 40 else base_confidence

    # Recalculate for short: use bearish strength
    if direction == "short":
        base_confidence = bearish_pct

    if direction == "long":
        base_confidence = bullish_pct

    # Boost/penalize confidence
    confidence = base_confidence

    if ml_agrees and ml_confidence > 0.5:
        confidence = confidence * 0.7 + ml_confidence * 0.3  # Blend with ML

    if not regime_compatible:
        confidence *= 0.4  # Was 0.6 — trading against trend is extremely risky

    if confluence_count < min_confluence:
        confidence *= 0.7  # Was 0.8 — low confluence = weak setup

    confidence = round(min(max(confidence, 0), 1.0), 3)

    # ── 10. Block overextended entries (RSI extremes) ──
    rsi_val = indicator_snapshot.get("rsi", {}).get("value", 50)
    if direction == "long" and rsi_val > 72:
        logger.info("signal_blocked_overbought", symbol=symbol, rsi=rsi_val, direction=direction)
        return []  # Don't enter longs at overbought — historically lose 80%+
    if direction == "short" and rsi_val < 28:
        logger.info("signal_blocked_oversold", symbol=symbol, rsi=rsi_val, direction=direction)
        return []  # Don't enter shorts at oversold — historically lose 80%+

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

    # ── 13. Calculate SL/TP from ATR ──
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

    if direction == "long":
        entry_price = current_price
        stop_loss = round(entry_price - (sl_mult * atr_value), 2)
        take_profit = round(entry_price + (tp_mult * atr_value), 2)
    else:
        entry_price = current_price
        stop_loss = round(entry_price + (sl_mult * atr_value), 2)
        take_profit = round(entry_price - (tp_mult * atr_value), 2)

    risk = abs(entry_price - stop_loss)
    reward = abs(take_profit - entry_price)
    risk_reward = round(reward / risk, 2) if risk > 0 else 0

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
) -> list[dict]:
    """
    Scan multiple timeframes (5m, 15m, 30m) and flag confluence.

    Args:
        dataframes: {"5m": df_5m, "15m": df_15m, "30m": df_30m}
        symbol: Trading symbol
        loss_patterns: Active loss patterns

    Returns:
        List of signals with MTF confluence flags
    """
    all_signals = []
    directions_by_tf = {}

    for tf, df in dataframes.items():
        if df is None or len(df) < 50:
            continue
        signals = generate_signals(df, symbol, tf, loss_patterns)
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
