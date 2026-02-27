"""Bollinger Bands — volatility bands around a moving average."""

import pandas as pd

from backend.app.core.indicators.base import BaseIndicator, IndicatorResult, registry


class BollingerBandsIndicator(BaseIndicator):
    """
    Bollinger Bands = SMA ± (std_dev * multiplier).
    - Price near upper band: overbought / strong uptrend
    - Price near lower band: oversold / strong downtrend
    - Band squeeze: low volatility, breakout imminent
    - Band expansion: high volatility, trend in progress
    """

    def __init__(self, period: int = 20, std_dev: float = 2.0):
        self.period = period
        self.std_dev = std_dev

    @property
    def name(self) -> str:
        return "bollinger_bands"

    def calculate(self, df: pd.DataFrame) -> list[IndicatorResult]:
        self.validate_dataframe(df)

        sma = df["close"].rolling(window=self.period).mean()
        std = df["close"].rolling(window=self.period).std()
        upper = sma + (std * self.std_dev)
        lower = sma - (std * self.std_dev)

        # Bandwidth for squeeze detection
        bandwidth = ((upper - lower) / sma) * 100

        results = []
        for i in range(self.period, len(df)):
            close = float(df["close"].iloc[i])
            up = float(upper.iloc[i])
            lo = float(lower.iloc[i])
            mid = float(sma.iloc[i])
            bw = float(bandwidth.iloc[i])

            # %B: position of price within bands (0 = lower, 1 = upper)
            band_range = up - lo
            pct_b = (close - lo) / band_range if band_range > 0 else 0.5

            # Squeeze detection: compare current bandwidth to avg bandwidth
            recent_bw = bandwidth.iloc[max(0, i - self.period):i + 1]
            avg_bw = float(recent_bw.mean())
            is_squeeze = bw < avg_bw * 0.75

            # Classification
            if pct_b > 1.0:
                classification = "above_upper_band"
            elif pct_b > 0.8:
                classification = "near_upper_band"
            elif pct_b < 0.0:
                classification = "below_lower_band"
            elif pct_b < 0.2:
                classification = "near_lower_band"
            else:
                classification = "within_bands"

            if is_squeeze:
                classification = "squeeze"

            meta = {
                "classification": classification,
                "upper_band": up,
                "lower_band": lo,
                "middle_band": mid,
                "bandwidth": bw,
                "percent_b": float(pct_b),
                "is_squeeze": is_squeeze,
            }

            results.append(IndicatorResult(
                name=self.name,
                value=mid,
                secondary_value=bw,
                timestamp=df["timestamp"].iloc[i],
                metadata=meta,
            ))

        return results


registry.register(BollingerBandsIndicator())
