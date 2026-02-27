"""Moving Averages — trend identification with SMA/EMA crossovers."""

import pandas as pd

from backend.app.core.indicators.base import BaseIndicator, IndicatorResult, registry


class MovingAveragesIndicator(BaseIndicator):
    """
    Multi-period moving averages for trend identification.
    - SMA 20, 50, 200 for trend structure
    - EMA 9, 21 for short-term signals
    - Golden Cross (50 > 200) / Death Cross (50 < 200)
    - Price position relative to MAs for trend strength
    """

    @property
    def name(self) -> str:
        return "moving_averages"

    def calculate(self, df: pd.DataFrame) -> list[IndicatorResult]:
        self.validate_dataframe(df)

        sma20 = df["close"].rolling(window=20).mean()
        sma50 = df["close"].rolling(window=50).mean()
        ema9 = df["close"].ewm(span=9, adjust=False).mean()
        ema21 = df["close"].ewm(span=21, adjust=False).mean()

        # SMA200 only if we have enough data
        has_sma200 = len(df) >= 200
        sma200 = df["close"].rolling(window=200).mean() if has_sma200 else None

        results = []
        start = 50  # Need at least 50 for SMA50

        for i in range(start, len(df)):
            close = float(df["close"].iloc[i])
            s20 = float(sma20.iloc[i])
            s50 = float(sma50.iloc[i])
            e9 = float(ema9.iloc[i])
            e21 = float(ema21.iloc[i])
            s200 = float(sma200.iloc[i]) if has_sma200 and i >= 200 else None

            # Trend classification based on MA alignment
            above_20 = close > s20
            above_50 = close > s50
            above_200 = close > s200 if s200 else None
            sma20_above_50 = s20 > s50

            # Count bullish conditions
            bullish_count = sum(filter(None, [above_20, above_50, above_200, sma20_above_50]))
            total = sum(1 for x in [above_20, above_50, above_200, sma20_above_50] if x is not None)

            if bullish_count >= total * 0.75:
                classification = "strong_uptrend"
            elif bullish_count >= total * 0.5:
                classification = "uptrend"
            elif bullish_count <= total * 0.25:
                classification = "strong_downtrend"
            elif bullish_count <= total * 0.5:
                classification = "downtrend"
            else:
                classification = "neutral"

            # EMA crossover detection
            if i > start:
                prev_e9 = float(ema9.iloc[i - 1])
                prev_e21 = float(ema21.iloc[i - 1])
                if prev_e9 <= prev_e21 and e9 > e21:
                    classification = "bullish_ema_crossover"
                elif prev_e9 >= prev_e21 and e9 < e21:
                    classification = "bearish_ema_crossover"

            # Golden/Death cross detection
            crossover = None
            if i > start:
                prev_s50 = float(sma50.iloc[i - 1])
                if s200 is not None and i >= 201:
                    prev_s200 = float(sma200.iloc[i - 1])
                    if prev_s50 <= prev_s200 and s50 > s200:
                        crossover = "golden_cross"
                    elif prev_s50 >= prev_s200 and s50 < s200:
                        crossover = "death_cross"

            meta = {
                "classification": classification,
                "sma20": s20,
                "sma50": s50,
                "ema9": e9,
                "ema21": e21,
                "above_sma20": above_20,
                "above_sma50": above_50,
            }
            if s200 is not None:
                meta["sma200"] = s200
                meta["above_sma200"] = above_200
            if crossover:
                meta["crossover"] = crossover

            results.append(IndicatorResult(
                name=self.name,
                value=s20,
                secondary_value=s50,
                timestamp=df["timestamp"].iloc[i],
                metadata=meta,
            ))

        return results


registry.register(MovingAveragesIndicator())
