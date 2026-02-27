"""Candlestick Pattern Recognition — detect classic reversal and continuation patterns."""

import pandas as pd
import numpy as np

from backend.app.core.indicators.base import BaseIndicator, IndicatorResult, registry


class CandlePatternIndicator(BaseIndicator):
    """
    Detects institutional reversal/continuation candlestick patterns:
    - Single candle: hammer, shooting_star, doji, marubozu
    - Two candle: bullish/bearish engulfing, piercing/dark_cloud, tweezer
    - Three candle: morning/evening star, three_white_soldiers, three_black_crows
    """

    @property
    def name(self) -> str:
        return "candle_patterns"

    def _body(self, row) -> float:
        return abs(row["close"] - row["open"])

    def _range(self, row) -> float:
        return row["high"] - row["low"]

    def _upper_wick(self, row) -> float:
        return row["high"] - max(row["close"], row["open"])

    def _lower_wick(self, row) -> float:
        return min(row["close"], row["open"]) - row["low"]

    def _is_bullish(self, row) -> bool:
        return row["close"] > row["open"]

    def _is_bearish(self, row) -> bool:
        return row["close"] < row["open"]

    def calculate(self, df: pd.DataFrame) -> list[IndicatorResult]:
        self.validate_dataframe(df)

        if len(df) < 5:
            return []

        results = []
        avg_body = df["close"].sub(df["open"]).abs().rolling(20).mean()

        for i in range(2, len(df)):
            curr = df.iloc[i]
            prev = df.iloc[i - 1]
            prev2 = df.iloc[i - 2]

            body = self._body(curr)
            rng = self._range(curr)
            upper_w = self._upper_wick(curr)
            lower_w = self._lower_wick(curr)
            avg_b = avg_body.iloc[i] if not pd.isna(avg_body.iloc[i]) else body

            patterns = []

            # Prevent division by zero
            if rng < 1e-10 or avg_b < 1e-10:
                pass
            else:
                # === SINGLE CANDLE PATTERNS ===

                # Doji: very small body relative to range
                if body / rng < 0.1:
                    patterns.append({
                        "pattern": "doji",
                        "type": "reversal",
                        "bias": "neutral",
                        "strength": 0.5,
                    })

                # Hammer: small body at top, long lower wick (at support)
                elif (lower_w > body * 2 and upper_w < body * 0.5
                      and body / rng < 0.35):
                    patterns.append({
                        "pattern": "hammer",
                        "type": "reversal",
                        "bias": "bullish",
                        "strength": 0.7,
                    })

                # Shooting Star: small body at bottom, long upper wick (at resistance)
                elif (upper_w > body * 2 and lower_w < body * 0.5
                      and body / rng < 0.35):
                    patterns.append({
                        "pattern": "shooting_star",
                        "type": "reversal",
                        "bias": "bearish",
                        "strength": 0.7,
                    })

                # Marubozu: strong body, almost no wicks (momentum candle)
                if body / rng > 0.85 and body > avg_b * 1.2:
                    bias = "bullish" if self._is_bullish(curr) else "bearish"
                    patterns.append({
                        "pattern": "marubozu",
                        "type": "continuation",
                        "bias": bias,
                        "strength": 0.6,
                    })

                # === TWO CANDLE PATTERNS ===

                prev_body = self._body(prev)
                if prev_body > 1e-10:
                    # Bullish Engulfing: bearish candle followed by larger bullish candle
                    if (self._is_bearish(prev) and self._is_bullish(curr)
                            and curr["open"] <= prev["close"]
                            and curr["close"] >= prev["open"]
                            and body > prev_body):
                        patterns.append({
                            "pattern": "bullish_engulfing",
                            "type": "reversal",
                            "bias": "bullish",
                            "strength": 0.85,
                        })

                    # Bearish Engulfing: bullish candle followed by larger bearish candle
                    if (self._is_bullish(prev) and self._is_bearish(curr)
                            and curr["open"] >= prev["close"]
                            and curr["close"] <= prev["open"]
                            and body > prev_body):
                        patterns.append({
                            "pattern": "bearish_engulfing",
                            "type": "reversal",
                            "bias": "bearish",
                            "strength": 0.85,
                        })

                    # Piercing Line: bearish then bullish closing above 50% of prev body
                    if (self._is_bearish(prev) and self._is_bullish(curr)
                            and curr["open"] < prev["low"]
                            and curr["close"] > (prev["open"] + prev["close"]) / 2
                            and curr["close"] < prev["open"]):
                        patterns.append({
                            "pattern": "piercing_line",
                            "type": "reversal",
                            "bias": "bullish",
                            "strength": 0.7,
                        })

                    # Dark Cloud Cover: bullish then bearish closing below 50% of prev body
                    if (self._is_bullish(prev) and self._is_bearish(curr)
                            and curr["open"] > prev["high"]
                            and curr["close"] < (prev["open"] + prev["close"]) / 2
                            and curr["close"] > prev["open"]):
                        patterns.append({
                            "pattern": "dark_cloud_cover",
                            "type": "reversal",
                            "bias": "bearish",
                            "strength": 0.7,
                        })

                # === THREE CANDLE PATTERNS ===

                prev2_body = self._body(prev2)

                # Morning Star: bearish, small body (doji/spinner), bullish
                if (self._is_bearish(prev2) and prev2_body > avg_b * 0.5
                        and self._body(prev) < avg_b * 0.5  # small middle candle
                        and self._is_bullish(curr) and body > avg_b * 0.5
                        and curr["close"] > (prev2["open"] + prev2["close"]) / 2):
                    patterns.append({
                        "pattern": "morning_star",
                        "type": "reversal",
                        "bias": "bullish",
                        "strength": 0.9,
                    })

                # Evening Star: bullish, small body, bearish
                if (self._is_bullish(prev2) and prev2_body > avg_b * 0.5
                        and self._body(prev) < avg_b * 0.5  # small middle candle
                        and self._is_bearish(curr) and body > avg_b * 0.5
                        and curr["close"] < (prev2["open"] + prev2["close"]) / 2):
                    patterns.append({
                        "pattern": "evening_star",
                        "type": "reversal",
                        "bias": "bearish",
                        "strength": 0.9,
                    })

                # Three White Soldiers: 3 consecutive bullish candles with higher closes
                if (self._is_bullish(prev2) and self._is_bullish(prev) and self._is_bullish(curr)
                        and prev["close"] > prev2["close"] and curr["close"] > prev["close"]
                        and prev2_body > avg_b * 0.5 and prev_body > avg_b * 0.5 and body > avg_b * 0.5):
                    patterns.append({
                        "pattern": "three_white_soldiers",
                        "type": "continuation",
                        "bias": "bullish",
                        "strength": 0.85,
                    })

                # Three Black Crows: 3 consecutive bearish candles with lower closes
                if (self._is_bearish(prev2) and self._is_bearish(prev) and self._is_bearish(curr)
                        and prev["close"] < prev2["close"] and curr["close"] < prev["close"]
                        and prev2_body > avg_b * 0.5 and prev_body > avg_b * 0.5 and body > avg_b * 0.5):
                    patterns.append({
                        "pattern": "three_black_crows",
                        "type": "continuation",
                        "bias": "bearish",
                        "strength": 0.85,
                    })

            # Build result — last result for this candle
            if patterns:
                # Pick strongest pattern
                strongest = max(patterns, key=lambda p: p["strength"])
                all_names = [p["pattern"] for p in patterns]

                # Determine overall signal
                bullish_count = sum(1 for p in patterns if p["bias"] == "bullish")
                bearish_count = sum(1 for p in patterns if p["bias"] == "bearish")

                if bullish_count > bearish_count:
                    signal = "bullish"
                elif bearish_count > bullish_count:
                    signal = "bearish"
                else:
                    signal = "neutral"

                results.append(IndicatorResult(
                    name=self.name,
                    value=strongest["strength"],
                    secondary_value=len(patterns),
                    timestamp=curr["timestamp"],
                    metadata={
                        "classification": signal,
                        "pattern": strongest["pattern"],
                        "pattern_type": strongest["type"],
                        "all_patterns": all_names,
                        "strength": strongest["strength"],
                    },
                ))
            else:
                results.append(IndicatorResult(
                    name=self.name,
                    value=0.0,
                    timestamp=curr["timestamp"],
                    metadata={
                        "classification": "neutral",
                        "pattern": "none",
                    },
                ))

        return results


registry.register(CandlePatternIndicator())
