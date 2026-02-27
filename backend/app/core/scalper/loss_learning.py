"""
Loss Learning Engine — analyzes losing trades to categorize WHY they lost,
identifies recurring patterns, and builds adaptive filters to avoid
repeating the same mistakes.

7 Loss Categories:
  1. false_breakout   — Price broke key level but reversed
  2. regime_mismatch  — Signal traded against market regime
  3. low_confluence   — Too few indicators agreed
  4. overextended     — RSI/Stoch was at extreme at entry
  5. weak_volume      — Volume below average at signal
  6. against_trend    — Trade against EMA direction
  7. news_event       — High-impact macro event window
"""

from collections import Counter, defaultdict
from datetime import datetime, timezone

from backend.app.logging_config import get_logger

logger = get_logger("scalper.loss_learning")

# Minimum losses before a pattern becomes "active"
MIN_PATTERN_FREQUENCY = 3
# How many recent signals to analyze
ANALYSIS_WINDOW = 50


def categorize_loss(signal: dict) -> dict:
    """
    Analyze a single losing signal and determine WHY it lost.

    Args:
        signal: Complete signal dict with indicator_snapshot, signal_reasons, etc.

    Returns:
        Loss analysis dict with category, detail, and contributing factors
    """
    snapshot = signal.get("indicator_snapshot", {})
    reasons = signal.get("signal_reasons", {})
    direction = signal.get("direction", "long")
    regime = signal.get("regime_at_signal", "unknown")
    entry = signal.get("entry_price", 0)
    sl = signal.get("stop_loss", 0)
    tp = signal.get("take_profit", 0)
    mfe = signal.get("max_favorable", 0) or 0
    mae = signal.get("max_adverse", 0) or 0

    categories = []
    details = []
    factors = {}

    # ── 1. Regime Mismatch ──
    regime_compatible = reasons.get("regime_compatible", True)
    if not regime_compatible:
        categories.append("regime_mismatch")
        details.append(
            f"Signal was {direction.upper()} but regime was {regime}. "
            f"Trading against the dominant trend."
        )
        factors["regime"] = regime
        factors["direction"] = direction

    # Even if marked compatible, check actual regime
    if direction == "long" and regime in ("trending_down", "volatile_breakout"):
        if "regime_mismatch" not in categories:
            categories.append("regime_mismatch")
            details.append(f"LONG signal in {regime} regime — adverse conditions.")
            factors["regime"] = regime
    elif direction == "short" and regime in ("trending_up",):
        if "regime_mismatch" not in categories:
            categories.append("regime_mismatch")
            details.append(f"SHORT signal in {regime} regime — adverse conditions.")
            factors["regime"] = regime

    # ── 2. Overextended ──
    rsi_data = snapshot.get("rsi", {})
    rsi_val = rsi_data.get("value", 50)
    stoch_data = snapshot.get("stochastic_rsi", {})
    stoch_val = stoch_data.get("value", 50)

    if direction == "long" and (rsi_val > 75 or stoch_val > 80):
        categories.append("overextended")
        details.append(
            f"Bought at already overbought levels: RSI={rsi_val:.1f}, Stoch={stoch_val:.1f}. "
            f"Price had limited upside."
        )
        factors["rsi"] = rsi_val
        factors["stochastic"] = stoch_val
    elif direction == "short" and (rsi_val < 25 or stoch_val < 20):
        categories.append("overextended")
        details.append(
            f"Sold at already oversold levels: RSI={rsi_val:.1f}, Stoch={stoch_val:.1f}. "
            f"Price had limited downside."
        )
        factors["rsi"] = rsi_val
        factors["stochastic"] = stoch_val

    # ── 3. Low Confluence ──
    confluence_count = reasons.get("confluence_count", 0)
    if confluence_count < 4:
        categories.append("low_confluence")
        details.append(
            f"Only {confluence_count} indicators agreed on direction. "
            f"Minimum 4 recommended for high-probability setups."
        )
        factors["confluence_count"] = confluence_count

    # ── 4. Weak Volume ──
    vol_data = snapshot.get("volume_spike", {})
    vol_class = vol_data.get("classification", "")
    vol_val = vol_data.get("value", 1.0)

    if vol_val < 0.8 or "low" in vol_class:
        categories.append("weak_volume")
        details.append(
            f"Volume was below average (ratio: {vol_val:.2f}). "
            f"Insufficient participation to sustain the move."
        )
        factors["volume_ratio"] = vol_val

    # ── 5. Against Trend ──
    ma_data = snapshot.get("moving_averages", {})
    ma_class = ma_data.get("classification", "")

    if direction == "long" and "downtrend" in ma_class:
        categories.append("against_trend")
        details.append(
            f"LONG signal against moving average downtrend. "
            f"EMA9/EMA21 were bearish at entry."
        )
        factors["ma_trend"] = ma_class
    elif direction == "short" and "uptrend" in ma_class:
        categories.append("against_trend")
        details.append(
            f"SHORT signal against moving average uptrend. "
            f"EMA9/EMA21 were bullish at entry."
        )
        factors["ma_trend"] = ma_class

    # ── 6. False Breakout ──
    key_levels_data = snapshot.get("key_levels", {})
    kl_class = key_levels_data.get("classification", "")
    smart_money_data = snapshot.get("smart_money", {})

    # MFE > 0 means price moved in our direction initially before reversing
    risk = abs(entry - sl) if sl else 1
    if mfe > 0 and mfe > risk * 0.3:
        categories.append("false_breakout")
        details.append(
            f"Price moved {mfe:.2f} in favor (MFE) before reversing to hit SL. "
            f"Possible false breakout or liquidity grab."
        )
        factors["mfe"] = mfe
        factors["mae"] = mae

    # ── 7. News Event (heuristic) ──
    # Check if there was unusually high volatility
    atr_data = snapshot.get("atr", {})
    atr_val = atr_data.get("value", 0)
    bb_data = snapshot.get("bollinger_bands", {})
    bb_class = bb_data.get("classification", "")

    if atr_val and mae > atr_val * 2:
        categories.append("news_event")
        details.append(
            f"MAE ({mae:.2f}) was {mae/atr_val:.1f}x ATR — unusual volatility suggesting news/event impact."
        )
        factors["atr"] = atr_val
        factors["volatility_multiple"] = round(mae / atr_val, 1) if atr_val else 0

    # If no specific category found, classify as general
    if not categories:
        categories.append("unknown")
        details.append("No clear loss pattern identified. May be normal market noise.")

    # Return primary category (most significant)
    primary = categories[0] if categories else "unknown"

    return {
        "category": primary,
        "all_categories": categories,
        "detail": " | ".join(details),
        "contributing_factors": factors,
        "mfe": mfe,
        "mae": mae,
        "analyzed_at": datetime.now(timezone.utc).isoformat(),
    }


def analyze_loss_patterns(signals: list[dict], window: int = ANALYSIS_WINDOW) -> dict:
    """
    Analyze recent signals to identify recurring loss patterns.

    Args:
        signals: List of all signal dicts (wins, losses, etc.)
        window: Number of recent signals to analyze

    Returns:
        Dict with identified patterns, statistics, and recommendations
    """
    # Filter to completed signals within window
    completed = [
        s for s in signals
        if s.get("status") in ("win", "loss")
    ]
    recent = completed[-window:] if len(completed) > window else completed

    if not recent:
        return {
            "patterns": [],
            "total_analyzed": 0,
            "win_rate": 0,
            "adjusted_win_rate": 0,
            "loss_breakdown": {},
            "recommendations": [],
        }

    wins = [s for s in recent if s["status"] == "win"]
    losses = [s for s in recent if s["status"] == "loss"]
    win_rate = len(wins) / len(recent) * 100 if recent else 0

    # Analyze each loss
    loss_analyses = []
    for loss_signal in losses:
        analysis = loss_signal.get("loss_analysis")
        if not analysis:
            analysis = categorize_loss(loss_signal)
        loss_analyses.append(analysis)

    # Count category frequencies
    category_counter = Counter()
    category_losses = defaultdict(list)
    for analysis in loss_analyses:
        cat = analysis.get("category", "unknown")
        category_counter[cat] += 1
        category_losses[cat].append(analysis)

    # Build loss breakdown
    loss_breakdown = {}
    for cat, count in category_counter.most_common():
        avg_factors = {}
        all_factors = [a.get("contributing_factors", {}) for a in category_losses[cat]]
        # Compute average of numeric factors
        for factors in all_factors:
            for k, v in factors.items():
                if isinstance(v, (int, float)):
                    if k not in avg_factors:
                        avg_factors[k] = []
                    avg_factors[k].append(v)
        avg_factors = {k: round(sum(v) / len(v), 2) for k, v in avg_factors.items()}

        loss_breakdown[cat] = {
            "count": count,
            "percentage": round(count / len(losses) * 100, 1) if losses else 0,
            "avg_factors": avg_factors,
        }

    # Identify "hot" patterns (> MIN_PATTERN_FREQUENCY in window)
    patterns = []
    for cat, count in category_counter.most_common():
        if count >= MIN_PATTERN_FREQUENCY:
            # Build conditions for this pattern
            conditions = {"category": cat}

            # Add specific conditions based on category
            analyses = category_losses[cat]
            if cat == "regime_mismatch":
                # Find most common regime/direction combo
                combos = Counter()
                for a in analyses:
                    factors = a.get("contributing_factors", {})
                    combo = (factors.get("regime", ""), factors.get("direction", ""))
                    combos[combo] += 1
                if combos:
                    most_common = combos.most_common(1)[0]
                    conditions["regime"] = most_common[0][0]
                    conditions["direction"] = most_common[0][1]

            elif cat == "overextended":
                avg_rsi = sum(
                    a.get("contributing_factors", {}).get("rsi", 50)
                    for a in analyses
                ) / len(analyses)
                conditions["avg_rsi_at_entry"] = round(avg_rsi, 1)

            # Calculate avg loss for this category
            related_losses = [
                s for s in losses
                if (s.get("loss_analysis") or {}).get("category") == cat
                or (s.get("loss_category") == cat)
            ]
            avg_loss_pnl = 0
            if related_losses:
                pnls = [s.get("outcome_pnl_pct", 0) or 0 for s in related_losses]
                avg_loss_pnl = round(sum(pnls) / len(pnls), 3) if pnls else 0

            pattern = {
                "id": f"{cat}_{len(patterns)}",
                "category": cat,
                "conditions": conditions,
                "frequency": count,
                "total_window": len(recent),
                "avg_loss_pct": avg_loss_pnl,
                "recommendation": _get_recommendation(cat, conditions),
                "is_active": True,
            }
            patterns.append(pattern)

    # Calculate adjusted win rate (what would win rate be if we skipped pattern losses?)
    pattern_loss_count = sum(p["frequency"] for p in patterns)
    adjusted_total = len(recent) - pattern_loss_count
    adjusted_win_rate = (
        len(wins) / adjusted_total * 100 if adjusted_total > 0 else win_rate
    )

    # Build recommendations
    recommendations = []
    for p in patterns:
        recommendations.append(p["recommendation"])

    return {
        "patterns": patterns,
        "total_analyzed": len(recent),
        "total_losses": len(losses),
        "total_wins": len(wins),
        "win_rate": round(win_rate, 1),
        "adjusted_win_rate": round(adjusted_win_rate, 1),
        "improvement": round(adjusted_win_rate - win_rate, 1),
        "loss_breakdown": loss_breakdown,
        "recommendations": recommendations,
        "active_filters": len(patterns),
    }


def get_active_loss_filters(signals: list[dict]) -> list[dict]:
    """
    Extract active loss patterns that should be applied to new signal generation.
    These patterns have enough frequency to be statistically significant.

    Returns:
        List of pattern dicts with conditions for the signal engine
    """
    analysis = analyze_loss_patterns(signals)
    return [p for p in analysis.get("patterns", []) if p.get("is_active")]


def _get_recommendation(category: str, conditions: dict) -> str:
    """Generate human-readable recommendation for a loss pattern."""
    recs = {
        "false_breakout": (
            "Avoid entries at key support/resistance levels during low volume. "
            "Wait for confirmation candle after breakout before entering."
        ),
        "regime_mismatch": (
            f"Avoid {conditions.get('direction', '').upper()} signals during "
            f"{conditions.get('regime', 'adverse').replace('_', ' ')} regime. "
            f"Trade with the trend, not against it."
        ),
        "low_confluence": (
            "Require at least 4 indicators to agree before entering. "
            "Low confluence signals have poor win rates."
        ),
        "overextended": (
            "Avoid entering when RSI is already extreme (>75 for longs, <25 for shorts). "
            "Wait for a pullback before entering in the direction of the trend."
        ),
        "weak_volume": (
            "Skip signals when volume is below average. "
            "Strong moves require volume confirmation."
        ),
        "against_trend": (
            "Avoid counter-trend trades unless multiple reversal signals confirm. "
            "Trend-following has higher probability on scalper timeframes."
        ),
        "news_event": (
            "Reduce position size or avoid trading during high-volatility events. "
            "ATR expansion beyond 2x normal suggests event-driven volatility."
        ),
        "unknown": "Review trade manually — no specific pattern identified.",
    }
    return recs.get(category, recs["unknown"])
