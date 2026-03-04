"""
Predictive Liquidity Heatmap — predicts where future liquidity
clusters will form based on historical patterns.

Analyzes:
- Swing high/low stop placement (historical patterns)
- Round number clustering (psychological levels)
- ATR-based stop estimation
- Order book imbalance projection
"""

import math
import numpy as np
import pandas as pd


def calculate_liquidity_forecast(
    df: pd.DataFrame,
    orderbook_data: dict | None = None,
    n_levels: int = 50,
) -> dict:
    """Predict liquidity cluster locations.

    Args:
        df: OHLCV DataFrame
        orderbook_data: Optional real orderbook {bids: [...], asks: [...]}
        n_levels: Number of price levels to evaluate

    Returns:
        Dict with levels, magnets, price_min, price_max
    """
    if df is None or len(df) < 20:
        return {"levels": [], "magnets": [], "price_min": 0, "price_max": 0}

    close = df["close"].astype(float).values
    high = df["high"].astype(float).values
    low = df["low"].astype(float).values
    volume = df["volume"].astype(float).values

    current_price = float(close[-1])
    price_min = float(low.min())
    price_max = float(high.max())
    rng = price_max - price_min
    price_min -= rng * 0.15
    price_max += rng * 0.15

    step = (price_max - price_min) / n_levels
    if step <= 0:
        return {"levels": [], "magnets": [], "price_min": 0, "price_max": 0}

    prices = [price_min + (i + 0.5) * step for i in range(n_levels)]
    liquidity = np.zeros(n_levels)
    confidence = np.zeros(n_levels)
    liq_type = ["neutral"] * n_levels  # buy/sell/neutral

    # ── 1. Swing highs/lows (stop placement zones) ──
    swing_highs = []
    swing_lows = []
    lookback = 3
    for i in range(lookback, len(df) - lookback):
        if all(high[i] >= high[j] for j in range(i - lookback, i + lookback + 1) if j != i):
            swing_highs.append(float(high[i]))
        if all(low[i] <= low[j] for j in range(i - lookback, i + lookback + 1) if j != i):
            swing_lows.append(float(low[i]))

    # Stops cluster just beyond swing points
    sigma = rng * 0.005  # Gaussian spread
    for sh in swing_highs:
        stop_price = sh * 1.002  # Stops above swing high
        _add_gaussian(liquidity, confidence, prices, stop_price, 1.5, 0.8, sigma)
        _mark_type(liq_type, prices, stop_price, sigma, "sell")

    for sl in swing_lows:
        stop_price = sl * 0.998  # Stops below swing low
        _add_gaussian(liquidity, confidence, prices, stop_price, 1.5, 0.8, sigma)
        _mark_type(liq_type, prices, stop_price, sigma, "buy")

    # ── 2. ATR-based stop estimation ──
    atr = _compute_atr(df, 14)
    if atr > 0:
        for mult, weight in [(1.0, 1.0), (1.5, 0.7), (2.0, 0.4)]:
            # Long stops below
            _add_gaussian(liquidity, confidence, prices, current_price - mult * atr, weight, 0.6, sigma)
            _mark_type(liq_type, prices, current_price - mult * atr, sigma, "buy")
            # Short stops above
            _add_gaussian(liquidity, confidence, prices, current_price + mult * atr, weight, 0.6, sigma)
            _mark_type(liq_type, prices, current_price + mult * atr, sigma, "sell")

    # ── 3. Round number clustering ──
    mag = 10 ** max(0, math.floor(math.log10(max(current_price, 1))) - 1)
    round_start = math.floor(price_min / mag) * mag
    p = round_start
    while p <= price_max:
        dist = abs(p - current_price) / current_price
        weight = max(0, 1.0 - dist * 10)  # Closer rounds are stronger
        _add_gaussian(liquidity, confidence, prices, p, weight * 0.8, 0.5, sigma * 0.5)
        p += mag

    # ── 4. Order book imbalance (if available) ──
    if orderbook_data:
        bids = orderbook_data.get("bids", [])
        asks = orderbook_data.get("asks", [])
        max_qty = max(
            max((b.get("quantity", 0) for b in bids), default=1),
            max((a.get("quantity", 0) for a in asks), default=1),
        ) or 1

        for bid in bids:
            p = bid.get("price", 0)
            q = bid.get("quantity", 0)
            _add_gaussian(liquidity, confidence, prices, p, q / max_qty * 0.5, 0.9, sigma * 0.3)
            _mark_type(liq_type, prices, p, sigma * 0.3, "buy")

        for ask in asks:
            p = ask.get("price", 0)
            q = ask.get("quantity", 0)
            _add_gaussian(liquidity, confidence, prices, p, q / max_qty * 0.5, 0.9, sigma * 0.3)
            _mark_type(liq_type, prices, p, sigma * 0.3, "sell")

    # Normalize
    max_liq = float(liquidity.max()) if liquidity.max() > 0 else 1
    liquidity = liquidity / max_liq

    # Build levels
    levels = []
    for i in range(n_levels):
        if liquidity[i] < 0.05:
            continue
        levels.append({
            "price": round(prices[i], 6),
            "predicted_liquidity": round(float(liquidity[i]), 4),
            "confidence": round(float(min(confidence[i], 1.0)), 4),
            "type": liq_type[i],
        })

    # Find magnets (top liquidity clusters)
    sorted_levels = sorted(levels, key=lambda x: x["predicted_liquidity"], reverse=True)
    magnets = []
    for lv in sorted_levels[:5]:
        if lv["predicted_liquidity"] > 0.3:
            magnets.append({
                "price": lv["price"],
                "strength": lv["predicted_liquidity"],
                "type": lv["type"],
            })

    return {
        "levels": levels,
        "magnets": magnets,
        "price_min": round(price_min, 6),
        "price_max": round(price_max, 6),
        "current_price": round(current_price, 6),
        "n_levels": len(levels),
    }


def _add_gaussian(
    arr: np.ndarray, conf: np.ndarray,
    prices: list, center: float,
    intensity: float, conf_val: float, sigma: float,
):
    """Add Gaussian intensity at center price."""
    if sigma <= 0:
        return
    for i, p in enumerate(prices):
        d = abs(p - center)
        if d > 4 * sigma:
            continue
        g = intensity * math.exp(-(d * d) / (2 * sigma * sigma))
        arr[i] += g
        conf[i] = max(conf[i], conf_val * g / max(intensity, 1e-10))


def _mark_type(types: list, prices: list, center: float, sigma: float, t: str):
    """Mark nearby levels with buy/sell type."""
    for i, p in enumerate(prices):
        if abs(p - center) < 2 * sigma:
            types[i] = t


def _compute_atr(df: pd.DataFrame, period: int = 14) -> float:
    """Compute ATR for the last period candles."""
    if len(df) < period + 1:
        return 0

    high = df["high"].astype(float).values
    low = df["low"].astype(float).values
    close = df["close"].astype(float).values

    trs = []
    for i in range(1, len(df)):
        tr = max(high[i] - low[i], abs(high[i] - close[i - 1]), abs(low[i] - close[i - 1]))
        trs.append(tr)

    if len(trs) < period:
        return float(np.mean(trs)) if trs else 0

    return float(np.mean(trs[-period:]))
