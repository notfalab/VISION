"""Relative Strength Index (RSI) — momentum oscillator for overbought/oversold."""

import pandas as pd

from backend.app.core.indicators.base import BaseIndicator, IndicatorResult, registry


class RSIIndicator(BaseIndicator):
    """
    RSI measures momentum on a 0-100 scale.
    - Above 70: overbought territory
    - Below 30: oversold territory
    - Divergences between RSI and price signal potential reversals.
    """

    def __init__(self, period: int = 14):
        self.period = period

    @property
    def name(self) -> str:
        return "rsi"

    def calculate(self, df: pd.DataFrame) -> list[IndicatorResult]:
        self.validate_dataframe(df)

        delta = df["close"].diff()
        gain = delta.where(delta > 0, 0.0)
        loss = (-delta).where(delta < 0, 0.0)

        # Wilder's smoothing (exponential moving average)
        avg_gain = gain.ewm(alpha=1 / self.period, min_periods=self.period, adjust=False).mean()
        avg_loss = loss.ewm(alpha=1 / self.period, min_periods=self.period, adjust=False).mean()

        rs = avg_gain / avg_loss.replace(0, 1e-10)
        rsi = 100 - (100 / (1 + rs))

        results = []
        for i in range(self.period, len(df)):
            val = float(rsi.iloc[i])

            # Classification
            if val >= 70:
                classification = "overbought"
            elif val >= 60:
                classification = "bullish_momentum"
            elif val <= 30:
                classification = "oversold"
            elif val <= 40:
                classification = "bearish_momentum"
            else:
                classification = "neutral"

            # Divergence detection over lookback
            lb = min(self.period, i)
            price_slope = float(df["close"].iloc[i] - df["close"].iloc[i - lb])
            rsi_slope = float(rsi.iloc[i] - rsi.iloc[i - lb])

            divergence = None
            if price_slope > 0 and rsi_slope < -5:
                divergence = "bearish_divergence"
            elif price_slope < 0 and rsi_slope > 5:
                divergence = "bullish_divergence"

            meta = {"classification": classification}
            if divergence:
                meta["divergence"] = divergence

            results.append(IndicatorResult(
                name=self.name,
                value=val,
                timestamp=df["timestamp"].iloc[i],
                metadata=meta,
            ))

        return results


registry.register(RSIIndicator())
