"""Stochastic RSI — combines RSI with stochastic oscillator for precision entries."""

import pandas as pd

from backend.app.core.indicators.base import BaseIndicator, IndicatorResult, registry


class StochasticRSIIndicator(BaseIndicator):
    """
    StochRSI applies the stochastic formula to RSI values.
    More sensitive than standard RSI — better for timing entries/exits.
    - Above 80: overbought
    - Below 20: oversold
    - K crossing above D: bullish signal
    - K crossing below D: bearish signal
    """

    def __init__(self, rsi_period: int = 14, stoch_period: int = 14, k_smooth: int = 3, d_smooth: int = 3):
        self.rsi_period = rsi_period
        self.stoch_period = stoch_period
        self.k_smooth = k_smooth
        self.d_smooth = d_smooth

    @property
    def name(self) -> str:
        return "stochastic_rsi"

    def calculate(self, df: pd.DataFrame) -> list[IndicatorResult]:
        self.validate_dataframe(df)

        # Calculate RSI first
        delta = df["close"].diff()
        gain = delta.where(delta > 0, 0.0)
        loss = (-delta).where(delta < 0, 0.0)
        avg_gain = gain.ewm(alpha=1 / self.rsi_period, min_periods=self.rsi_period, adjust=False).mean()
        avg_loss = loss.ewm(alpha=1 / self.rsi_period, min_periods=self.rsi_period, adjust=False).mean()
        rs = avg_gain / avg_loss.replace(0, 1e-10)
        rsi = 100 - (100 / (1 + rs))

        # Apply stochastic formula to RSI
        rsi_low = rsi.rolling(window=self.stoch_period).min()
        rsi_high = rsi.rolling(window=self.stoch_period).max()
        rsi_range = rsi_high - rsi_low
        stoch_rsi = ((rsi - rsi_low) / rsi_range.replace(0, 1e-10)) * 100

        # Smooth %K and %D
        k_line = stoch_rsi.rolling(window=self.k_smooth).mean()
        d_line = k_line.rolling(window=self.d_smooth).mean()

        results = []
        start = self.rsi_period + self.stoch_period + self.d_smooth

        for i in range(start, len(df)):
            k_val = float(k_line.iloc[i])
            d_val = float(d_line.iloc[i])

            # Crossover detection
            crossover = None
            if i > start:
                prev_k = float(k_line.iloc[i - 1])
                prev_d = float(d_line.iloc[i - 1])
                if prev_k <= prev_d and k_val > d_val:
                    crossover = "bullish_crossover"
                elif prev_k >= prev_d and k_val < d_val:
                    crossover = "bearish_crossover"

            # Classification
            if k_val >= 80:
                classification = "overbought"
            elif k_val <= 20:
                classification = "oversold"
            elif crossover == "bullish_crossover" and k_val < 50:
                classification = "bullish_reversal"
            elif crossover == "bearish_crossover" and k_val > 50:
                classification = "bearish_reversal"
            else:
                classification = "neutral"

            meta = {
                "classification": classification,
                "k_line": k_val,
                "d_line": d_val,
            }
            if crossover:
                meta["crossover"] = crossover

            results.append(IndicatorResult(
                name=self.name,
                value=k_val,
                secondary_value=d_val,
                timestamp=df["timestamp"].iloc[i],
                metadata=meta,
            ))

        return results


registry.register(StochasticRSIIndicator())
