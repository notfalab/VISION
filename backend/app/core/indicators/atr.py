"""ATR — Average True Range for volatility measurement."""

import pandas as pd

from backend.app.core.indicators.base import BaseIndicator, IndicatorResult, registry


class ATRIndicator(BaseIndicator):
    """
    ATR measures market volatility by calculating the average range of price movement.
    - High ATR: volatile market, wider stops needed
    - Low ATR: calm market, potential breakout setup
    - Rising ATR: increasing volatility (often at trend starts)
    - Falling ATR: decreasing volatility (consolidation)
    """

    def __init__(self, period: int = 14):
        self.period = period

    @property
    def name(self) -> str:
        return "atr"

    def calculate(self, df: pd.DataFrame) -> list[IndicatorResult]:
        self.validate_dataframe(df)

        high = df["high"]
        low = df["low"]
        close = df["close"]

        # True Range
        prev_close = close.shift(1)
        tr1 = high - low
        tr2 = (high - prev_close).abs()
        tr3 = (low - prev_close).abs()
        true_range = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)

        # ATR = Wilder's smoothing of True Range
        atr = true_range.ewm(alpha=1 / self.period, min_periods=self.period, adjust=False).mean()

        # ATR as % of price for comparison across instruments
        atr_pct = (atr / close) * 100

        results = []
        for i in range(self.period, len(df)):
            atr_val = float(atr.iloc[i])
            atr_pct_val = float(atr_pct.iloc[i])
            price = float(close.iloc[i])

            # Volatility trend: compare current ATR to recent average
            recent_atr = atr.iloc[max(0, i - self.period):i + 1]
            avg_atr = float(recent_atr.mean())
            atr_ratio = atr_val / avg_atr if avg_atr > 0 else 1.0

            if atr_ratio > 1.5:
                classification = "high_volatility"
            elif atr_ratio > 1.15:
                classification = "rising_volatility"
            elif atr_ratio < 0.65:
                classification = "low_volatility"
            elif atr_ratio < 0.85:
                classification = "falling_volatility"
            else:
                classification = "normal_volatility"

            # Suggested stop loss distance (2x ATR is standard)
            stop_distance = atr_val * 2

            meta = {
                "classification": classification,
                "atr_percent": atr_pct_val,
                "atr_ratio": atr_ratio,
                "stop_loss_distance": stop_distance,
                "price": price,
            }

            results.append(IndicatorResult(
                name=self.name,
                value=atr_val,
                secondary_value=atr_pct_val,
                timestamp=df["timestamp"].iloc[i],
                metadata=meta,
            ))

        return results


registry.register(ATRIndicator())
