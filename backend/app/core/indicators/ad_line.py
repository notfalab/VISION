"""Accumulation/Distribution Line with divergence detection."""

import pandas as pd

from backend.app.core.indicators.base import BaseIndicator, IndicatorResult, registry


class ADLineIndicator(BaseIndicator):
    """
    Accumulation/Distribution line = cumulative sum of Money Flow Volume.
    MFV = ((Close - Low) - (High - Close)) / (High - Low) * Volume
    Divergences between A/D and price indicate smart money activity.
    """

    def __init__(self, divergence_lookback: int = 14):
        self.divergence_lookback = divergence_lookback

    @property
    def name(self) -> str:
        return "ad_line"

    def calculate(self, df: pd.DataFrame) -> list[IndicatorResult]:
        self.validate_dataframe(df)

        # Money Flow Multiplier
        hl_range = df["high"] - df["low"]
        mfm = ((df["close"] - df["low"]) - (df["high"] - df["close"])) / hl_range.replace(0, 1e-10)

        # Money Flow Volume
        mfv = mfm * df["volume"]

        # Cumulative A/D
        ad = mfv.cumsum()

        results = []
        lb = self.divergence_lookback

        for i in range(lb, len(df)):
            ad_val = float(ad.iloc[i])

            # Divergence detection
            price_slope = float(df["close"].iloc[i] - df["close"].iloc[i - lb])
            ad_slope = float(ad.iloc[i] - ad.iloc[i - lb])

            divergence = None
            if price_slope > 0 and ad_slope < 0:
                divergence = "bearish_divergence"
            elif price_slope < 0 and ad_slope > 0:
                divergence = "bullish_divergence"

            results.append(IndicatorResult(
                name=self.name,
                value=ad_val,
                secondary_value=float(mfv.iloc[i]),
                timestamp=df["timestamp"].iloc[i],
                metadata={"divergence": divergence} if divergence else {},
            ))

        return results


registry.register(ADLineIndicator())
