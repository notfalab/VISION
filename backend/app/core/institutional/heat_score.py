"""Institutional Heat Score — combined institutional activity indicator."""

from datetime import datetime, timezone

from backend.app.logging_config import get_logger

logger = get_logger("institutional.heat")


def compute_heat_score(
    cot_data: dict | None = None,
    orderflow: dict | None = None,
    volume_profile: dict | None = None,
) -> dict:
    """
    Compute institutional heat score (0-100).

    Combines:
    - COT positioning trend (hedge fund net positions)
    - Order flow delta (buy/sell pressure imbalance)
    - Volume concentration (where institutional money is positioned)

    Returns:
        dict with score, signal, breakdown, description
    """
    components = {}
    total_weight = 0
    weighted_score = 0

    # === COT Component (weight: 35%) ===
    cot_score = 50  # neutral default
    cot_signal = "neutral"
    if cot_data and "managed_money" in cot_data:
        mm = cot_data["managed_money"]
        net = mm.get("net", 0)
        net_change = mm.get("change_net", 0)

        # Normalize net position to 0-100 scale
        # Positive net = long (bullish), negative = short (bearish)
        if net > 50000:
            cot_score = min(90, 60 + (net - 50000) / 5000)
            cot_signal = "strong_accumulation"
        elif net > 20000:
            cot_score = 55 + (net - 20000) / 6000 * 5
            cot_signal = "accumulation"
        elif net > 0:
            cot_score = 50 + net / 4000
            cot_signal = "mild_accumulation"
        elif net > -20000:
            cot_score = 50 + net / 4000
            cot_signal = "mild_distribution"
        else:
            cot_score = max(10, 50 + net / 4000)
            cot_signal = "distribution"

        # Adjust for weekly change momentum
        if net_change > 5000:
            cot_score = min(100, cot_score + 8)
        elif net_change > 2000:
            cot_score = min(100, cot_score + 4)
        elif net_change < -5000:
            cot_score = max(0, cot_score - 8)
        elif net_change < -2000:
            cot_score = max(0, cot_score - 4)

    components["cot"] = {
        "score": round(cot_score, 1),
        "weight": 35,
        "signal": cot_signal,
    }
    weighted_score += cot_score * 0.35
    total_weight += 0.35

    # === Order Flow Component (weight: 40%) ===
    flow_score = 50  # neutral default
    flow_signal = "neutral"
    if orderflow:
        delta_pct = orderflow.get("delta_pct", 0)
        imbalance = orderflow.get("imbalance_ratio", 1)
        signal = orderflow.get("signal", "balanced")

        if signal == "strong_buy_pressure":
            flow_score = min(95, 70 + delta_pct)
            flow_signal = "accumulation"
        elif signal == "buy_pressure":
            flow_score = min(80, 55 + delta_pct)
            flow_signal = "mild_accumulation"
        elif signal == "strong_sell_pressure":
            flow_score = max(5, 30 + delta_pct)
            flow_signal = "distribution"
        elif signal == "sell_pressure":
            flow_score = max(20, 45 + delta_pct)
            flow_signal = "mild_distribution"
        else:
            flow_score = 50

        # Wall bonus
        buy_walls = len(orderflow.get("buy_walls", []))
        sell_walls = len(orderflow.get("sell_walls", []))
        if buy_walls > sell_walls:
            flow_score = min(100, flow_score + buy_walls * 3)
        elif sell_walls > buy_walls:
            flow_score = max(0, flow_score - sell_walls * 3)

    components["orderflow"] = {
        "score": round(flow_score, 1),
        "weight": 40,
        "signal": flow_signal,
    }
    weighted_score += flow_score * 0.40
    total_weight += 0.40

    # === Volume Profile Component (weight: 25%) ===
    vol_score = 50
    vol_signal = "neutral"
    if volume_profile:
        # If volume is concentrated at higher prices = accumulation
        # If concentrated at lower prices = distribution
        total_buy = volume_profile.get("total_buy_volume", 0)
        total_sell = volume_profile.get("total_sell_volume", 0)
        total = total_buy + total_sell

        if total > 0:
            buy_ratio = total_buy / total
            vol_score = buy_ratio * 100
            if buy_ratio > 0.6:
                vol_signal = "accumulation"
            elif buy_ratio < 0.4:
                vol_signal = "distribution"

    components["volume_profile"] = {
        "score": round(vol_score, 1),
        "weight": 25,
        "signal": vol_signal,
    }
    weighted_score += vol_score * 0.25
    total_weight += 0.25

    # === Final Score ===
    final_score = weighted_score / max(total_weight, 1e-10)
    final_score = max(0, min(100, final_score))

    # Overall signal
    if final_score >= 70:
        overall_signal = "institutional_accumulation"
        description = "Strong institutional buying detected — smart money is accumulating"
    elif final_score >= 55:
        overall_signal = "mild_accumulation"
        description = "Moderate institutional buying — smart money positioning long"
    elif final_score <= 30:
        overall_signal = "institutional_distribution"
        description = "Strong institutional selling detected — smart money is distributing"
    elif final_score <= 45:
        overall_signal = "mild_distribution"
        description = "Moderate institutional selling — smart money positioning short"
    else:
        overall_signal = "neutral"
        description = "No clear institutional direction — waiting for positioning"

    return {
        "score": round(final_score, 1),
        "signal": overall_signal,
        "description": description,
        "components": components,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
