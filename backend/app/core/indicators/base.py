"""Base indicator interface — all indicators implement this contract."""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime

import pandas as pd


@dataclass
class IndicatorResult:
    """Standard output from any indicator calculation."""
    name: str
    value: float
    secondary_value: float | None = None
    timestamp: datetime | None = None
    metadata: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "value": self.value,
            "secondary_value": self.secondary_value,
            "timestamp": self.timestamp.isoformat() if self.timestamp else None,
            "metadata": self.metadata,
        }


class BaseIndicator(ABC):
    """
    Abstract base for all indicators.

    Subclasses must implement:
      - name: identifier string
      - calculate(): batch computation on a DataFrame
      - calculate_streaming(): single-candle incremental update
    """

    @property
    @abstractmethod
    def name(self) -> str:
        """Unique indicator identifier (e.g., 'obv', 'volume_spike')."""
        ...

    @abstractmethod
    def calculate(self, df: pd.DataFrame) -> list[IndicatorResult]:
        """
        Batch calculate indicator on a DataFrame of OHLCV data.

        Args:
            df: DataFrame with columns [timestamp, open, high, low, close, volume]
                sorted by timestamp ascending.

        Returns:
            List of IndicatorResult for each row/signal.
        """
        ...

    def calculate_streaming(self, candle: dict, state: dict | None = None) -> IndicatorResult | None:
        """
        Incremental calculation for a single new candle.

        Args:
            candle: dict with keys {timestamp, open, high, low, close, volume}
            state: previous internal state (implementation-specific)

        Returns:
            IndicatorResult or None if not enough data yet.
        """
        return None

    def validate_dataframe(self, df: pd.DataFrame) -> None:
        """Ensure the DataFrame has required columns."""
        required = {"timestamp", "open", "high", "low", "close", "volume"}
        missing = required - set(df.columns)
        if missing:
            raise ValueError(f"DataFrame missing columns: {missing}")


class IndicatorRegistry:
    """Registry of all available indicators for easy lookup."""

    def __init__(self):
        self._indicators: dict[str, BaseIndicator] = {}

    def register(self, indicator: BaseIndicator) -> None:
        self._indicators[indicator.name] = indicator

    def get(self, name: str) -> BaseIndicator:
        if name not in self._indicators:
            raise KeyError(f"Indicator '{name}' not registered. Available: {list(self._indicators)}")
        return self._indicators[name]

    def list_all(self) -> list[str]:
        return list(self._indicators.keys())

    def calculate_all(self, df: pd.DataFrame) -> dict[str, list[IndicatorResult]]:
        """Run all registered indicators on a DataFrame."""
        results = {}
        for name, indicator in self._indicators.items():
            results[name] = indicator.calculate(df)
        return results


# Global registry — indicators register themselves on import
registry = IndicatorRegistry()
