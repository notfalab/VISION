"""MACD — Moving Average Convergence Divergence for trend following."""

import pandas as pd

from backend.app.core.indicators.base import BaseIndicator, IndicatorResult, registry


class MACDIndicator(BaseIndicator):
    """
    MACD = EMA(fast) - EMA(slow), with a signal line (EMA of MACD).
    - Histogram positive + growing: bullish momentum
    - Histogram negative + growing: bearish momentum
    - MACD crossing above signal: bullish crossover
    - MACD crossing below signal: bearish crossover
    """

    def __init__(self, fast: int = 12, slow: int = 26, signal: int = 9):
        self.fast = fast
        self.slow = slow
        self.signal_period = signal

    @property
    def name(self) -> str:
        return "macd"

    def calculate(self, df: pd.DataFrame) -> list[IndicatorResult]:
        self.validate_dataframe(df)

        ema_fast = df["close"].ewm(span=self.fast, adjust=False).mean()
        ema_slow = df["close"].ewm(span=self.slow, adjust=False).mean()
        macd_line = ema_fast - ema_slow
        signal_line = macd_line.ewm(span=self.signal_period, adjust=False).mean()
        histogram = macd_line - signal_line

        results = []
        start = self.slow + self.signal_period

        for i in range(start, len(df)):
            macd_val = float(macd_line.iloc[i])
            sig_val = float(signal_line.iloc[i])
            hist_val = float(histogram.iloc[i])
            prev_hist = float(histogram.iloc[i - 1])

            # Crossover detection
            prev_macd = float(macd_line.iloc[i - 1])
            prev_sig = float(signal_line.iloc[i - 1])

            crossover = None
            if prev_macd <= prev_sig and macd_val > sig_val:
                crossover = "bullish_crossover"
            elif prev_macd >= prev_sig and macd_val < sig_val:
                crossover = "bearish_crossover"

            # Momentum classification
            if hist_val > 0 and hist_val > prev_hist:
                classification = "bullish_momentum"
            elif hist_val > 0 and hist_val <= prev_hist:
                classification = "bullish_weakening"
            elif hist_val < 0 and hist_val < prev_hist:
                classification = "bearish_momentum"
            elif hist_val < 0 and hist_val >= prev_hist:
                classification = "bearish_weakening"
            else:
                classification = "neutral"

            meta = {
                "classification": classification,
                "signal_line": sig_val,
                "histogram": hist_val,
            }
            if crossover:
                meta["crossover"] = crossover

            results.append(IndicatorResult(
                name=self.name,
                value=macd_val,
                secondary_value=sig_val,
                timestamp=df["timestamp"].iloc[i],
                metadata=meta,
            ))

        return results


registry.register(MACDIndicator())
