"""Zone Retest Probability Engine.

Computes three probability scores for each active zone:
1. Retest probability — will price return to this zone?
2. Reversal probability — does price need to change direction to reach it?
3. Break vs Bounce — if retested, will price break through or bounce?
"""

from __future__ import annotations

from dataclasses import dataclass, replace


@dataclass
class ZoneSpec:
    """Unified representation of any zone type."""
    zone_type: str          # "supply", "demand", "support", "resistance", "order_block", "fvg"
    high: float
    low: float
    touches: int
    active: bool
    label: str


@dataclass
class MarketContext:
    """All indicator data needed for probability computation."""
    current_price: float
    atr_value: float
    atr_pct: float

    # Trend / Momentum
    trend_direction: str              # "bullish", "bearish", "neutral"
    trend_slope: float                # EMA slope normalized by ATR
    rsi: float
    rsi_divergence: str | None
    macd_classification: str
    macd_histogram: float

    # Regime
    regime: str                       # "trending_up", "trending_down", "ranging", "volatile_breakout"

    # Volume / Institutional
    volume_ratio: float               # current vol / SMA(20) vol
    heat_score: float                 # 0-100
    heat_signal: str

    # Structure
    last_bos: dict | None
    last_choch: dict | None

    # Confluence
    nearby_zone_count: int


@dataclass
class ZoneProbability:
    """Output for a single zone."""
    zone: ZoneSpec
    retest_probability: float
    reversal_probability: float
    break_probability: float
    bounce_probability: float
    retest_factors: dict
    break_factors: dict
    verdict: str
    confidence: float


# ── Scoring Functions ────────────────────────────────────────


def compute_retest_probability(zone: ZoneSpec, ctx: MarketContext) -> tuple[float, dict]:
    """Will price return to this zone? Returns (probability, factors)."""
    zone_mid = (zone.high + zone.low) / 2
    is_below = zone_mid < ctx.current_price
    atr_distance = abs(ctx.current_price - zone_mid) / max(ctx.atr_value, 1e-10)

    factors: dict = {}

    # Factor 1: Distance (weight 0.25)
    if atr_distance <= 0.5:
        f_distance = 95.0
    elif atr_distance <= 1.0:
        f_distance = 85 - (atr_distance - 0.5) * 20
    elif atr_distance <= 2.0:
        f_distance = 75 - (atr_distance - 1.0) * 30
    elif atr_distance <= 3.0:
        f_distance = 45 - (atr_distance - 2.0) * 25
    else:
        f_distance = max(5.0, 20 - (atr_distance - 3.0) * 5)
    factors["distance"] = {"score": round(f_distance, 1), "weight": 0.25,
                           "detail": f"{atr_distance:.1f} ATR away"}

    # Factor 2: Zone Strength (weight 0.20)
    if zone.touches >= 4:
        f_strength = 90.0
    elif zone.touches >= 3:
        f_strength = 80.0
    elif zone.touches >= 2:
        f_strength = 65.0
    else:
        f_strength = 45.0
    factors["strength"] = {"score": round(f_strength, 1), "weight": 0.20,
                           "detail": f"{zone.touches} touch{'es' if zone.touches != 1 else ''}"}

    # Factor 3: Volume Context (weight 0.15)
    if ctx.volume_ratio > 2.0:
        f_volume = 85.0
    elif ctx.volume_ratio > 1.3:
        f_volume = 70.0
    elif ctx.volume_ratio > 0.7:
        f_volume = 50.0
    else:
        f_volume = 30.0
    factors["volume"] = {"score": round(f_volume, 1), "weight": 0.15,
                         "detail": f"{ctx.volume_ratio:.1f}x avg"}

    # Factor 4: ATR Reachability (weight 0.15)
    if atr_distance <= 1.0:
        f_reachable = 90.0
    elif atr_distance <= 2.0:
        f_reachable = 70.0
    elif atr_distance <= 3.0:
        f_reachable = 40.0
    else:
        f_reachable = 15.0
    factors["reachability"] = {"score": round(f_reachable, 1), "weight": 0.15,
                               "detail": f"{'Within' if atr_distance <= 2 else 'Beyond'} 2 ATR"}

    # Factor 5: Institutional Bias (weight 0.15)
    zone_direction_match = (
        (is_below and ctx.heat_score < 40) or
        (not is_below and ctx.heat_score > 60)
    )
    if zone_direction_match:
        f_institutional = 80 + (abs(ctx.heat_score - 50) / 50) * 15
    else:
        f_institutional = 50 - (abs(ctx.heat_score - 50) / 50) * 20
    f_institutional = max(15.0, min(95.0, f_institutional))
    factors["institutional"] = {"score": round(f_institutional, 1), "weight": 0.15,
                                "detail": ctx.heat_signal.replace("_", " ")}

    # Factor 6: Trend Alignment (weight 0.10)
    trend_toward_zone = (
        (is_below and ctx.trend_direction == "bearish") or
        (not is_below and ctx.trend_direction == "bullish")
    )
    if trend_toward_zone:
        f_trend = 85.0
    elif ctx.trend_direction == "neutral" or ctx.regime == "ranging":
        f_trend = 60.0
    else:
        f_trend = 25.0
    factors["trend"] = {"score": round(f_trend, 1), "weight": 0.10,
                        "detail": f"Trend {'toward' if trend_toward_zone else 'away from'} zone"}

    probability = sum(f["score"] * f["weight"] for f in factors.values())
    probability = max(5.0, min(95.0, probability))

    return round(probability, 1), factors


def compute_reversal_probability(zone: ZoneSpec, ctx: MarketContext) -> float:
    """Does price need to change direction to reach the zone?"""
    zone_mid = (zone.high + zone.low) / 2
    is_below = zone_mid < ctx.current_price
    atr_dist = abs(ctx.current_price - zone_mid) / max(ctx.atr_value, 1e-10)

    heading_toward = (
        (is_below and ctx.trend_slope < -0.1) or
        (not is_below and ctx.trend_slope > 0.1)
    )

    if heading_toward:
        if atr_dist <= 1.0:
            return 90.0
        elif atr_dist <= 2.0:
            return 75.0
        else:
            return round(max(40.0, 75 - (atr_dist - 2) * 15), 1)

    # Price needs to reverse — score reversal signals
    score = 30.0

    # RSI divergence
    if ctx.rsi_divergence:
        if (is_below and ctx.rsi_divergence == "bearish_divergence") or \
           (not is_below and ctx.rsi_divergence == "bullish_divergence"):
            score += 20

    # RSI extremes
    if is_below and ctx.rsi > 70:
        score += 15
    elif not is_below and ctx.rsi < 30:
        score += 15

    # MACD fading
    macd_fading = (
        ("weakening" in ctx.macd_classification) or
        (is_below and "bearish" in ctx.macd_classification and ctx.macd_histogram > 0) or
        (not is_below and "bullish" in ctx.macd_classification and ctx.macd_histogram < 0)
    )
    if macd_fading:
        score += 10

    # Regime
    if ctx.regime == "ranging":
        score += 15
    elif ctx.regime == "volatile_breakout":
        score += 10

    # CHoCH toward zone
    if ctx.last_choch:
        choch_toward = (
            (is_below and ctx.last_choch.get("type") == "bearish") or
            (not is_below and ctx.last_choch.get("type") == "bullish")
        )
        if choch_toward:
            score += 15

    return round(max(5.0, min(90.0, score)), 1)


def compute_break_probability(zone: ZoneSpec, ctx: MarketContext) -> tuple[float, dict]:
    """If retested, probability of breaking through vs bouncing."""
    zone_mid = (zone.high + zone.low) / 2
    is_below = zone_mid < ctx.current_price
    factors: dict = {}

    # Factor 1: Touch Count Degradation (weight 0.25)
    if zone.touches <= 1:
        f_touches = 30.0
    elif zone.touches == 2:
        f_touches = 40.0
    elif zone.touches == 3:
        f_touches = 55.0
    elif zone.touches == 4:
        f_touches = 65.0
    else:
        f_touches = min(80.0, 65 + (zone.touches - 4) * 5)
    factors["touch_degradation"] = {"score": round(f_touches, 1), "weight": 0.25,
                                     "detail": f"Touch #{zone.touches + 1}"}

    # Factor 2: Volume Pressure (weight 0.20)
    if ctx.volume_ratio > 2.0:
        f_vol = 80.0
    elif ctx.volume_ratio > 1.5:
        f_vol = 65.0
    elif ctx.volume_ratio > 1.0:
        f_vol = 50.0
    else:
        f_vol = 30.0
    factors["volume_pressure"] = {"score": round(f_vol, 1), "weight": 0.20,
                                   "detail": f"{ctx.volume_ratio:.1f}x vol"}

    # Factor 3: Trend Strength (weight 0.20)
    abs_slope = abs(ctx.trend_slope)
    trend_toward_zone = (
        (is_below and ctx.trend_direction == "bearish") or
        (not is_below and ctx.trend_direction == "bullish")
    )
    if trend_toward_zone and abs_slope > 0.8:
        f_trend = 80.0
    elif trend_toward_zone and abs_slope > 0.4:
        f_trend = 65.0
    elif not trend_toward_zone:
        f_trend = 25.0
    else:
        f_trend = 45.0
    factors["trend_strength"] = {"score": round(f_trend, 1), "weight": 0.20,
                                  "detail": f"{'Strong' if abs_slope > 0.8 else 'Moderate' if abs_slope > 0.4 else 'Weak'} trend"}

    # Factor 4: Institutional Pressure (weight 0.20)
    inst_breaking = (
        (is_below and ctx.heat_score < 35) or
        (not is_below and ctx.heat_score > 65)
    )
    if inst_breaking:
        f_inst = 75 + (abs(ctx.heat_score - 50) / 50) * 15
    else:
        f_inst = 35.0
    f_inst = max(15.0, min(90.0, f_inst))
    factors["institutional"] = {"score": round(f_inst, 1), "weight": 0.20,
                                 "detail": ctx.heat_signal.replace("_", " ")}

    # Factor 5: Confluence (weight 0.15)
    if ctx.nearby_zone_count >= 3:
        f_confluence = 20.0
    elif ctx.nearby_zone_count >= 2:
        f_confluence = 35.0
    elif ctx.nearby_zone_count >= 1:
        f_confluence = 50.0
    else:
        f_confluence = 65.0
    factors["confluence"] = {"score": round(f_confluence, 1), "weight": 0.15,
                              "detail": f"{ctx.nearby_zone_count} nearby zone{'s' if ctx.nearby_zone_count != 1 else ''}"}

    break_prob = sum(f["score"] * f["weight"] for f in factors.values())
    break_prob = max(10.0, min(90.0, break_prob))

    return round(break_prob, 1), factors


# ── Orchestrator ─────────────────────────────────────────────


def compute_zone_retest_probabilities(
    zones: list[ZoneSpec],
    ctx: MarketContext,
) -> list[ZoneProbability]:
    """Compute all three probability types for each active zone."""
    results: list[ZoneProbability] = []

    for zone in zones:
        if not zone.active:
            continue

        # Compute per-zone confluence count
        z_mid = (zone.high + zone.low) / 2
        nearby = sum(
            1 for oz in zones
            if oz is not zone and abs((oz.high + oz.low) / 2 - z_mid) / max(z_mid, 1e-10) < 0.01
        )
        zone_ctx = replace(ctx, nearby_zone_count=nearby)

        retest_prob, retest_factors = compute_retest_probability(zone, zone_ctx)
        reversal_prob = compute_reversal_probability(zone, zone_ctx)
        break_prob, break_factors = compute_break_probability(zone, zone_ctx)
        bounce_prob = round(100 - break_prob, 1)

        # Confidence from factor agreement (low spread = high confidence)
        retest_scores = [f["score"] for f in retest_factors.values()]
        if len(retest_scores) > 1:
            mean = sum(retest_scores) / len(retest_scores)
            variance = sum((s - mean) ** 2 for s in retest_scores) / len(retest_scores)
            std_dev = variance ** 0.5
        else:
            std_dev = 0.0
        confidence = max(30.0, min(95.0, 100 - std_dev))

        # Verdict
        if retest_prob < 30:
            verdict = "unlikely_retest"
        elif break_prob > 60:
            verdict = "likely_retest_break"
        elif bounce_prob > 60:
            verdict = "likely_retest_bounce"
        else:
            verdict = "uncertain_outcome"

        results.append(ZoneProbability(
            zone=zone,
            retest_probability=retest_prob,
            reversal_probability=reversal_prob,
            break_probability=break_prob,
            bounce_probability=bounce_prob,
            retest_factors=retest_factors,
            break_factors=break_factors,
            verdict=verdict,
            confidence=round(confidence, 1),
        ))

    results.sort(key=lambda z: z.retest_probability, reverse=True)
    return results
