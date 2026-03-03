"""
TP/SL Cluster Analyzer — estimate take-profit and stop-loss order clusters
from order book depth data.

No exchange exposes pending TP/SL orders directly. We estimate using:
- Order book volume concentrations (large limit orders = likely institutional TP)
- Round number proximity (psychological levels where retail places TP/SL)
- Liquidity gaps (thin zones beyond support/resistance = common SL territory)
- Wall detection (orders >3x average = institutional placement)
"""

import math

from backend.app.logging_config import get_logger

logger = get_logger("orderbook.tpsl")


def analyze_tpsl_heatmap(
    bids: list[dict],
    asks: list[dict],
    current_price: float,
) -> dict:
    """
    Estimate TP/SL order clusters from order book data.

    Args:
        bids: [{price, quantity}, ...] sorted descending by price
        asks: [{price, quantity}, ...] sorted ascending by price
        current_price: latest mid price

    Returns:
        {
            tp_clusters: [{price_min, price_max, volume, strength, type, distance_pct}],
            sl_clusters: [{price_min, price_max, volume, strength, type, distance_pct}],
            round_levels: [{price, type}],
            current_price: float,
        }
    """
    if not bids or not asks or current_price <= 0:
        return {
            "tp_clusters": [],
            "sl_clusters": [],
            "round_levels": [],
            "current_price": current_price,
        }

    tp_clusters = _estimate_tp_clusters(bids, asks, current_price)
    sl_clusters = _estimate_sl_clusters(bids, asks, current_price)
    round_levels = _detect_round_levels(current_price, bids, asks)

    return {
        "tp_clusters": tp_clusters,
        "sl_clusters": sl_clusters,
        "round_levels": round_levels,
        "current_price": current_price,
    }


def _estimate_tp_clusters(
    bids: list[dict],
    asks: list[dict],
    current_price: float,
) -> list[dict]:
    """
    Estimate Take Profit clusters.

    TP orders manifest as:
    - SELL limit orders ABOVE current price (longs taking profit)
    - BUY limit orders BELOW current price (shorts taking profit)

    We identify clusters by high-volume concentrations at/near round numbers
    and resistance/support levels.
    """
    clusters = []

    # --- Long TP: sell limits above price (ask side) ---
    ask_clusters = _cluster_levels(
        [a for a in asks if a["price"] > current_price],
        threshold_pct=0.003,
    )
    avg_ask_vol = _avg_volume(asks)

    for c in ask_clusters:
        volume = c["volume"]
        strength = min(volume / max(avg_ask_vol * 3, 1e-10), 1.0)

        # Boost strength for round numbers
        round_bonus = _round_number_score(c["price_mid"], current_price)
        strength = min(strength + round_bonus * 0.3, 1.0)

        if strength > 0.15:  # Filter noise
            distance = (c["price_mid"] - current_price) / current_price * 100
            clusters.append({
                "price_min": c["price_min"],
                "price_max": c["price_max"],
                "volume": round(volume, 4),
                "strength": round(strength, 3),
                "type": "long_tp",
                "distance_pct": round(distance, 2),
            })

    # --- Short TP: buy limits below price (bid side) ---
    bid_clusters = _cluster_levels(
        [b for b in bids if b["price"] < current_price],
        threshold_pct=0.003,
    )
    avg_bid_vol = _avg_volume(bids)

    for c in bid_clusters:
        volume = c["volume"]
        strength = min(volume / max(avg_bid_vol * 3, 1e-10), 1.0)

        round_bonus = _round_number_score(c["price_mid"], current_price)
        strength = min(strength + round_bonus * 0.3, 1.0)

        if strength > 0.15:
            distance = (current_price - c["price_mid"]) / current_price * 100
            clusters.append({
                "price_min": c["price_min"],
                "price_max": c["price_max"],
                "volume": round(volume, 4),
                "strength": round(strength, 3),
                "type": "short_tp",
                "distance_pct": round(distance, 2),
            })

    return sorted(clusters, key=lambda c: c["strength"], reverse=True)[:20]


def _estimate_sl_clusters(
    bids: list[dict],
    asks: list[dict],
    current_price: float,
) -> list[dict]:
    """
    Estimate Stop Loss clusters.

    SL orders manifest as:
    - SELL stop orders BELOW current price (long stop losses)
    - BUY stop orders ABOVE current price (short stop losses)

    We identify clusters by:
    - Thin liquidity zones (gaps in order book = SL cascade territory)
    - Zones just beyond key support/resistance levels
    - Slightly beyond round numbers (common retail SL placement)
    """
    clusters = []

    # --- Long SL: below current price (thin bid zones = vulnerable to SL cascades) ---
    bid_levels = [b for b in bids if b["price"] < current_price]
    if bid_levels:
        gaps = _find_liquidity_gaps(bid_levels, current_price, side="bid")
        for gap in gaps:
            distance = (current_price - gap["price_mid"]) / current_price * 100
            clusters.append({
                "price_min": gap["price_min"],
                "price_max": gap["price_max"],
                "volume": round(gap.get("volume", 0), 4),
                "strength": round(gap["strength"], 3),
                "type": "long_sl",
                "distance_pct": round(distance, 2),
            })

    # --- Short SL: above current price (thin ask zones) ---
    ask_levels = [a for a in asks if a["price"] > current_price]
    if ask_levels:
        gaps = _find_liquidity_gaps(ask_levels, current_price, side="ask")
        for gap in gaps:
            distance = (gap["price_mid"] - current_price) / current_price * 100
            clusters.append({
                "price_min": gap["price_min"],
                "price_max": gap["price_max"],
                "volume": round(gap.get("volume", 0), 4),
                "strength": round(gap["strength"], 3),
                "type": "short_sl",
                "distance_pct": round(distance, 2),
            })

    return sorted(clusters, key=lambda c: c["strength"], reverse=True)[:20]


def _cluster_levels(
    levels: list[dict],
    threshold_pct: float = 0.003,
) -> list[dict]:
    """Group nearby price levels into clusters (same algorithm as AccZonePrimitive)."""
    if not levels:
        return []

    sorted_levels = sorted(levels, key=lambda l: l["price"])
    clusters: list[dict] = []
    current = {"prices": [sorted_levels[0]["price"]], "volumes": [sorted_levels[0]["quantity"]]}

    for i in range(1, len(sorted_levels)):
        price = sorted_levels[i]["price"]
        prev_price = current["prices"][-1]
        dist = abs(price - prev_price) / max(price, 1e-10)

        if dist < threshold_pct:
            current["prices"].append(price)
            current["volumes"].append(sorted_levels[i]["quantity"])
        else:
            clusters.append(current)
            current = {"prices": [price], "volumes": [sorted_levels[i]["quantity"]]}

    clusters.append(current)

    return [
        {
            "price_min": min(c["prices"]),
            "price_max": max(c["prices"]),
            "price_mid": sum(c["prices"]) / len(c["prices"]),
            "volume": sum(c["volumes"]),
        }
        for c in clusters
    ]


def _find_liquidity_gaps(
    levels: list[dict],
    current_price: float,
    side: str = "bid",
) -> list[dict]:
    """
    Find thin liquidity zones where SL cascades are likely.

    A "gap" is a price zone where order book volume is significantly
    below average, indicating vulnerability to stop-loss cascades.
    """
    if len(levels) < 5:
        return []

    sorted_levels = sorted(levels, key=lambda l: l["price"],
                           reverse=(side == "bid"))

    avg_vol = sum(l["quantity"] for l in sorted_levels) / len(sorted_levels)
    gaps = []

    # Sliding window: find zones with volume < 30% of average
    window_size = max(3, len(sorted_levels) // 20)

    for i in range(len(sorted_levels) - window_size):
        window = sorted_levels[i:i + window_size]
        window_vol = sum(l["quantity"] for l in window)
        window_avg = window_vol / window_size

        # This zone has thin liquidity → likely SL cascade zone
        if window_avg < avg_vol * 0.3:
            prices = [l["price"] for l in window]
            gap_mid = sum(prices) / len(prices)

            # Strength based on how thin the zone is + round number proximity
            thinness = 1 - (window_avg / max(avg_vol, 1e-10))
            round_bonus = _round_number_score(gap_mid, current_price)
            strength = min(thinness * 0.7 + round_bonus * 0.3, 1.0)

            if strength > 0.2:
                gaps.append({
                    "price_min": min(prices),
                    "price_max": max(prices),
                    "price_mid": gap_mid,
                    "volume": round(window_vol, 4),
                    "strength": strength,
                })

    # Deduplicate overlapping gaps — keep the strongest
    if gaps:
        gaps = sorted(gaps, key=lambda g: g["strength"], reverse=True)
        filtered = [gaps[0]]
        for g in gaps[1:]:
            overlap = any(
                abs(g["price_mid"] - f["price_mid"]) / max(g["price_mid"], 1e-10) < 0.005
                for f in filtered
            )
            if not overlap:
                filtered.append(g)
        gaps = filtered[:15]

    return gaps


def _round_number_score(price: float, current_price: float) -> float:
    """
    Score how close a price is to a psychologically significant round number.

    Returns 0-1 where 1 = exactly on a major round number.
    """
    if price <= 0 or current_price <= 0:
        return 0

    # Determine appropriate round number step based on price magnitude
    if current_price > 10000:
        steps = [1000, 500, 100]
    elif current_price > 1000:
        steps = [100, 50, 10]
    elif current_price > 100:
        steps = [10, 5, 1]
    elif current_price > 10:
        steps = [1, 0.5, 0.1]
    elif current_price > 1:
        steps = [0.1, 0.05, 0.01]
    else:
        steps = [0.01, 0.005, 0.001]

    best_score = 0
    for i, step in enumerate(steps):
        nearest_round = round(price / step) * step
        distance = abs(price - nearest_round) / max(step, 1e-10)
        if distance < 0.1:  # Within 10% of step size
            score = (1 - distance) * (1 - i * 0.3)  # Major rounds score higher
            best_score = max(best_score, score)

    return min(best_score, 1.0)


def _detect_round_levels(
    current_price: float,
    bids: list[dict],
    asks: list[dict],
) -> list[dict]:
    """
    Detect psychologically significant round numbers near the current price.
    These are common TP/SL placement targets.
    """
    if current_price <= 0:
        return []

    # Determine step sizes based on price magnitude
    if current_price > 10000:
        steps = [5000, 1000, 500]
    elif current_price > 1000:
        steps = [500, 100, 50]
    elif current_price > 100:
        steps = [50, 10, 5]
    elif current_price > 10:
        steps = [5, 1, 0.5]
    elif current_price > 1:
        steps = [0.5, 0.1, 0.05]
    else:
        steps = [0.05, 0.01, 0.005]

    levels = []
    seen = set()

    # Find round levels within ±10% of current price
    for step in steps:
        lower = math.floor(current_price * 0.9 / step) * step
        upper = math.ceil(current_price * 1.1 / step) * step

        price = lower
        while price <= upper:
            if price > 0 and round(price, 6) not in seen:
                seen.add(round(price, 6))
                rel = "above" if price > current_price else "below"
                dist = abs(price - current_price) / current_price * 100
                if dist > 0.01:  # Skip if essentially at current price
                    levels.append({
                        "price": round(price, 6),
                        "type": rel,
                        "distance_pct": round(dist, 2),
                        "magnitude": "major" if step == steps[0] else (
                            "medium" if step == steps[1] else "minor"
                        ),
                    })
            price += step

    return sorted(levels, key=lambda l: l["distance_pct"])[:30]


def _avg_volume(levels: list[dict]) -> float:
    """Average volume across order book levels."""
    if not levels:
        return 0
    return sum(l["quantity"] for l in levels) / len(levels)


def estimate_order_count(quantity: float, avg_order_size: float) -> int:
    """
    Estimate number of individual orders at a price level.

    Heuristic: a round quantity (e.g., 1.0000) likely represents fewer large orders,
    while a fractional quantity (e.g., 1.2345) likely represents many small orders.
    """
    if avg_order_size <= 0:
        return 1

    base_estimate = max(1, round(quantity / avg_order_size))

    # Round quantities suggest fewer, larger orders
    decimal_str = f"{quantity:.8f}".rstrip("0")
    decimal_places = len(decimal_str.split(".")[-1]) if "." in decimal_str else 0

    if decimal_places <= 1:
        # Very round number → likely 1-3 large orders
        return max(1, min(base_estimate, 3))
    elif decimal_places <= 3:
        return max(1, base_estimate)
    else:
        # Very fractional → likely many small orders
        return max(1, int(base_estimate * 1.5))
