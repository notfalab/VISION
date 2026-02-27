"""On-Balance Volume (OBV) with divergence detection."""

import pandas as pd

from backend.app.core.indicators.base import BaseIndicator, IndicatorResult, registry


class OBVIndicator(BaseIndicator):
    """
    Calculates OBV and detects divergences between OBV trend and price trend.
    Divergences signal potential reversals — key smart money indicator.
    """

    def __init__(self, divergence_lookback: int = 14):
        self.divergence_lookback = divergence_lookback

    @property
    def name(self) -> str:
        return "obv"

    def calculate(self, df: pd.DataFrame) -> list[IndicatorResult]:
        self.validate_dataframe(df)

        obv = [0.0]
        for i in range(1, len(df)):
            if df["close"].iloc[i] > df["close"].iloc[i - 1]:
                obv.append(obv[-1] + df["volume"].iloc[i])
            elif df["close"].iloc[i] < df["close"].iloc[i - 1]:
                obv.append(obv[-1] - df["volume"].iloc[i])
            else:
                obv.append(obv[-1])

        results = []
        lb = self.divergence_lookback

        for i in range(lb, len(df)):
            obv_val = obv[i]
            divergence = self._detect_divergence(
                prices=df["close"].iloc[i - lb : i + 1].values,
                obv_values=obv[i - lb : i + 1],
            )

            results.append(IndicatorResult(
                name=self.name,
                value=obv_val,
                timestamp=df["timestamp"].iloc[i],
                metadata={"divergence": divergence} if divergence else {},
            ))

        return results

    def _detect_divergence(self, prices, obv_values) -> str | None:
        """
        Compare slopes of price and OBV over the lookback window.
        - Bearish divergence: price rising, OBV falling
        - Bullish divergence: price falling, OBV rising
        - Hidden bearish: price falling, OBV rising (continuation)
        - Hidden bullish: price rising, OBV falling (continuation)
        """
        price_slope = prices[-1] - prices[0]
        obv_slope = obv_values[-1] - obv_values[0]

        # Use higher/lower comparison for more robust detection
        price_higher_high = prices[-1] > max(prices[1:-1]) if len(prices) > 2 else price_slope > 0
        obv_lower_high = obv_values[-1] < max(obv_values[1:-1]) if len(obv_values) > 2 else obv_slope < 0

        price_lower_low = prices[-1] < min(prices[1:-1]) if len(prices) > 2 else price_slope < 0
        obv_higher_low = obv_values[-1] > min(obv_values[1:-1]) if len(obv_values) > 2 else obv_slope > 0

        if price_higher_high and obv_lower_high:
            return "bearish_divergence"
        if price_lower_low and obv_higher_low:
            return "bullish_divergence"

        return None


registry.register(OBVIndicator())
