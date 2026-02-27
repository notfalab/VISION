"""Volume analysis — spike detection, accumulation/distribution classification."""

import pandas as pd

from backend.app.core.indicators.base import BaseIndicator, IndicatorResult, registry


class VolumeSpikeDetector(BaseIndicator):
    """
    Detects volume spikes relative to a rolling SMA.
    Classifies as accumulation (price up + high volume)
    or distribution (price flat/down + high volume).
    """

    def __init__(self, lookback: int = 20, spike_threshold: float = 2.0):
        self.lookback = lookback
        self.spike_threshold = spike_threshold

    @property
    def name(self) -> str:
        return "volume_spike"

    def calculate(self, df: pd.DataFrame) -> list[IndicatorResult]:
        self.validate_dataframe(df)
        results = []

        vol_sma = df["volume"].rolling(window=self.lookback).mean()
        vol_ratio = df["volume"] / vol_sma
        price_change = df["close"].pct_change()

        for i in range(self.lookback, len(df)):
            ratio = vol_ratio.iloc[i]
            if ratio >= self.spike_threshold:
                pchange = price_change.iloc[i]
                if pchange > 0.001:
                    classification = "accumulation"
                elif pchange < -0.001:
                    classification = "distribution"
                else:
                    classification = "neutral_high_volume"

                results.append(IndicatorResult(
                    name=self.name,
                    value=ratio,
                    secondary_value=pchange,
                    timestamp=df["timestamp"].iloc[i],
                    metadata={
                        "classification": classification,
                        "volume": float(df["volume"].iloc[i]),
                        "sma_volume": float(vol_sma.iloc[i]),
                        "threshold": self.spike_threshold,
                    },
                ))

        return results

    def calculate_streaming(self, candle: dict, state: dict | None = None) -> IndicatorResult | None:
        if state is None or len(state.get("volumes", [])) < self.lookback:
            return None

        volumes = state["volumes"]
        sma = sum(volumes[-self.lookback:]) / self.lookback
        ratio = candle["volume"] / sma if sma > 0 else 0

        if ratio >= self.spike_threshold:
            prev_close = state.get("prev_close", candle["close"])
            pchange = (candle["close"] - prev_close) / prev_close if prev_close else 0
            classification = "accumulation" if pchange > 0.001 else ("distribution" if pchange < -0.001 else "neutral_high_volume")
            return IndicatorResult(
                name=self.name,
                value=ratio,
                secondary_value=pchange,
                timestamp=candle.get("timestamp"),
                metadata={"classification": classification},
            )
        return None


# Auto-register
registry.register(VolumeSpikeDetector())
