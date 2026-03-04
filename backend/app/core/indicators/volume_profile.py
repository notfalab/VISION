"""
Volume Profile calculator — price-bucketed volume distribution.

Computes:
- Volume at each price level (bucketed)
- POC (Point of Control) — highest volume level
- VAH/VAL (Value Area High/Low) — 70% of volume
- Buy vs sell volume classification per level
"""

import pandas as pd
import numpy as np


def calculate_volume_profile(
    df: pd.DataFrame,
    n_buckets: int = 50,
    value_area_pct: float = 0.70,
) -> dict:
    """Calculate volume profile from OHLCV DataFrame.

    Args:
        df: DataFrame with columns: open, high, low, close, volume
        n_buckets: Number of price buckets
        value_area_pct: Percentage of volume for value area (default 70%)

    Returns:
        Dict with levels, poc, vah, val, total_volume
    """
    if df is None or len(df) < 5:
        return {"levels": [], "poc": 0, "vah": 0, "val": 0, "total_volume": 0}

    price_min = float(df["low"].min())
    price_max = float(df["high"].max())

    if price_max <= price_min:
        return {"levels": [], "poc": 0, "vah": 0, "val": 0, "total_volume": 0}

    bucket_size = (price_max - price_min) / n_buckets
    if bucket_size <= 0:
        return {"levels": [], "poc": 0, "vah": 0, "val": 0, "total_volume": 0}

    # Initialize buckets
    buckets = np.zeros(n_buckets)
    buy_vol = np.zeros(n_buckets)
    sell_vol = np.zeros(n_buckets)

    # Distribute volume across price buckets each candle touches
    for _, row in df.iterrows():
        low = float(row["low"])
        high = float(row["high"])
        close = float(row["close"])
        opn = float(row["open"])
        vol = float(row["volume"])

        if vol <= 0 or high <= low:
            continue

        # Find bucket range this candle spans
        i_low = max(0, int((low - price_min) / bucket_size))
        i_high = min(n_buckets - 1, int((high - price_min) / bucket_size))

        n_touched = i_high - i_low + 1
        vol_per_bucket = vol / n_touched

        is_bullish = close >= opn

        for i in range(i_low, i_high + 1):
            buckets[i] += vol_per_bucket
            if is_bullish:
                buy_vol[i] += vol_per_bucket
            else:
                sell_vol[i] += vol_per_bucket

    # Find POC (bucket with max volume)
    poc_idx = int(np.argmax(buckets))
    poc_price = price_min + (poc_idx + 0.5) * bucket_size
    total_volume = float(buckets.sum())

    # Calculate Value Area (70% of total volume centered on POC)
    target_vol = total_volume * value_area_pct
    area_vol = float(buckets[poc_idx])
    low_idx = poc_idx
    high_idx = poc_idx

    while area_vol < target_vol and (low_idx > 0 or high_idx < n_buckets - 1):
        # Expand toward whichever side has more volume
        expand_low = float(buckets[low_idx - 1]) if low_idx > 0 else 0
        expand_high = float(buckets[high_idx + 1]) if high_idx < n_buckets - 1 else 0

        if expand_low >= expand_high and low_idx > 0:
            low_idx -= 1
            area_vol += expand_low
        elif high_idx < n_buckets - 1:
            high_idx += 1
            area_vol += expand_high
        else:
            low_idx -= 1
            area_vol += expand_low

    val_price = price_min + (low_idx + 0.5) * bucket_size
    vah_price = price_min + (high_idx + 0.5) * bucket_size

    # Build levels array
    max_vol = float(buckets.max()) if buckets.max() > 0 else 1
    levels = []
    for i in range(n_buckets):
        v = float(buckets[i])
        if v <= 0:
            continue
        price = round(price_min + (i + 0.5) * bucket_size, 6)
        levels.append({
            "price": price,
            "volume": round(v, 2),
            "normalized": round(v / max_vol, 4),
            "buy_volume": round(float(buy_vol[i]), 2),
            "sell_volume": round(float(sell_vol[i]), 2),
            "is_poc": i == poc_idx,
            "in_value_area": low_idx <= i <= high_idx,
        })

    return {
        "levels": levels,
        "poc": round(poc_price, 6),
        "vah": round(vah_price, 6),
        "val": round(val_price, 6),
        "total_volume": round(total_volume, 2),
        "bucket_size": round(bucket_size, 6),
        "n_buckets": n_buckets,
        "value_area_pct": value_area_pct,
    }
