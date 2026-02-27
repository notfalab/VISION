"""Key Levels — Support/Resistance, Pivot Points, Fibonacci Retracements."""

import pandas as pd
import numpy as np

from backend.app.core.indicators.base import BaseIndicator, IndicatorResult, registry


class KeyLevelsIndicator(BaseIndicator):
    """
    Automatic key level detection for precision entries:
    - Support/Resistance from swing highs/lows clustering
    - Classic Pivot Points (Floor method)
    - Fibonacci Retracements (23.6%, 38.2%, 50%, 61.8%, 78.6%)
    - Price proximity scoring to nearest levels
    """

    def __init__(self, swing_lookback: int = 5, cluster_threshold: float = 0.003):
        self.swing_lookback = swing_lookback
        self.cluster_threshold = cluster_threshold  # 0.3% clustering distance

    @property
    def name(self) -> str:
        return "key_levels"

    def calculate(self, df: pd.DataFrame) -> list[IndicatorResult]:
        self.validate_dataframe(df)
        if len(df) < 30:
            return []

        close = float(df["close"].iloc[-1])

        # 1. Pivot Points (using previous period)
        pivots = self._calculate_pivots(df)

        # 2. Support/Resistance from swing point clustering
        sr_levels = self._find_sr_levels(df)

        # 3. Fibonacci Retracements
        fibs = self._calculate_fibonacci(df)

        # 4. Score price position relative to levels
        all_supports = []
        all_resistances = []

        for level in sr_levels:
            if level["price"] < close:
                all_supports.append(level)
            else:
                all_resistances.append(level)

        for key, val in pivots.items():
            entry = {"price": val, "label": key, "type": "pivot"}
            if val < close:
                all_supports.append(entry)
            else:
                all_resistances.append(entry)

        for fib in fibs:
            entry = {"price": fib["price"], "label": fib["label"], "type": "fibonacci"}
            if fib["price"] < close:
                all_supports.append(entry)
            else:
                all_resistances.append(entry)

        # Sort by proximity to current price
        all_supports.sort(key=lambda x: abs(x["price"] - close))
        all_resistances.sort(key=lambda x: abs(x["price"] - close))

        # Nearest support and resistance
        nearest_support = all_supports[0] if all_supports else None
        nearest_resistance = all_resistances[0] if all_resistances else None

        # Risk/reward assessment
        support_dist = abs(close - nearest_support["price"]) / close * 100 if nearest_support else 999
        resist_dist = abs(nearest_resistance["price"] - close) / close * 100 if nearest_resistance else 999

        if support_dist < 0.3:
            classification = "at_support"
        elif resist_dist < 0.3:
            classification = "at_resistance"
        elif resist_dist > support_dist * 2:
            classification = "bullish_room"  # More room to go up
        elif support_dist > resist_dist * 2:
            classification = "bearish_room"  # More room to go down
        else:
            classification = "between_levels"

        # Risk/Reward ratio
        rr_ratio = resist_dist / max(support_dist, 0.01) if nearest_support and nearest_resistance else 1.0

        meta = {
            "classification": classification,
            "pivot_point": pivots.get("PP"),
            "r1": pivots.get("R1"),
            "r2": pivots.get("R2"),
            "r3": pivots.get("R3"),
            "s1": pivots.get("S1"),
            "s2": pivots.get("S2"),
            "s3": pivots.get("S3"),
            "nearest_support": nearest_support,
            "nearest_resistance": nearest_resistance,
            "support_distance_pct": round(support_dist, 3),
            "resistance_distance_pct": round(resist_dist, 3),
            "risk_reward_ratio": round(rr_ratio, 2),
            "fibonacci_levels": fibs[:7],
            "sr_levels": sr_levels[:10],
        }

        results = [IndicatorResult(
            name=self.name,
            value=rr_ratio,
            secondary_value=close,
            timestamp=df["timestamp"].iloc[-1],
            metadata=meta,
        )]
        return results

    def _calculate_pivots(self, df: pd.DataFrame) -> dict:
        """Calculate classic floor pivot points from previous period."""
        # Use last 20 candles for pivot calculation
        recent = df.tail(20)
        high = float(recent["high"].max())
        low = float(recent["low"].min())
        close = float(df["close"].iloc[-1])

        pp = (high + low + close) / 3

        return {
            "PP": round(pp, 2),
            "R1": round(2 * pp - low, 2),
            "R2": round(pp + (high - low), 2),
            "R3": round(high + 2 * (pp - low), 2),
            "S1": round(2 * pp - high, 2),
            "S2": round(pp - (high - low), 2),
            "S3": round(low - 2 * (high - pp), 2),
        }

    def _find_sr_levels(self, df: pd.DataFrame) -> list[dict]:
        """Find support/resistance from swing high/low clustering."""
        levels = []

        # Find swing points
        for i in range(self.swing_lookback, len(df) - self.swing_lookback):
            high = float(df["high"].iloc[i])
            low = float(df["low"].iloc[i])

            is_swing_high = all(
                high >= float(df["high"].iloc[j])
                for j in range(i - self.swing_lookback, i + self.swing_lookback + 1) if j != i
            )
            if is_swing_high:
                levels.append({"price": high, "type": "resistance", "strength": 1, "touches": 1})

            is_swing_low = all(
                low <= float(df["low"].iloc[j])
                for j in range(i - self.swing_lookback, i + self.swing_lookback + 1) if j != i
            )
            if is_swing_low:
                levels.append({"price": low, "type": "support", "strength": 1, "touches": 1})

        # Cluster nearby levels
        if not levels:
            return []

        levels.sort(key=lambda x: x["price"])
        clustered = []
        used = set()

        for i, lvl in enumerate(levels):
            if i in used:
                continue
            cluster_prices = [lvl["price"]]
            cluster_touches = 1
            used.add(i)

            for j in range(i + 1, len(levels)):
                if j in used:
                    continue
                dist = abs(levels[j]["price"] - lvl["price"]) / lvl["price"]
                if dist < self.cluster_threshold:
                    cluster_prices.append(levels[j]["price"])
                    cluster_touches += 1
                    used.add(j)

            avg_price = sum(cluster_prices) / len(cluster_prices)
            clustered.append({
                "price": round(avg_price, 2),
                "type": "sr",
                "strength": cluster_touches,
                "touches": cluster_touches,
                "label": f"SR ({cluster_touches}x)",
            })

        # Sort by strength (most touches = strongest)
        clustered.sort(key=lambda x: x["touches"], reverse=True)
        return clustered[:15]

    def _calculate_fibonacci(self, df: pd.DataFrame) -> list[dict]:
        """Calculate Fibonacci retracement levels from the major swing."""
        # Find the major swing in recent data
        recent = df.tail(100).reset_index(drop=True) if len(df) >= 100 else df.reset_index(drop=True)

        swing_high_idx = int(recent["high"].idxmax())
        swing_low_idx = int(recent["low"].idxmin())
        swing_high = float(recent["high"].iloc[swing_high_idx])
        swing_low = float(recent["low"].iloc[swing_low_idx])

        diff = swing_high - swing_low
        if diff == 0:
            return []

        # Determine if uptrend or downtrend swing
        # If swing low came before swing high = uptrend retracement
        is_upswing = swing_low_idx < swing_high_idx

        fib_ratios = [0.0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0]
        fib_labels = ["0%", "23.6%", "38.2%", "50%", "61.8%", "78.6%", "100%"]

        fibs = []
        for ratio, label in zip(fib_ratios, fib_labels):
            if is_upswing:
                price = swing_high - diff * ratio
            else:
                price = swing_low + diff * ratio

            fibs.append({
                "price": round(price, 2),
                "ratio": ratio,
                "label": f"Fib {label}",
            })

        return fibs


registry.register(KeyLevelsIndicator())
