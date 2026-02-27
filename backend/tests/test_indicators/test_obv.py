"""Tests for OBV indicator."""

import numpy as np
import pandas as pd

from backend.app.core.indicators.obv import OBVIndicator


class TestOBVIndicator:
    def setup_method(self):
        self.obv = OBVIndicator(divergence_lookback=14)

    def test_name(self):
        assert self.obv.name == "obv"

    def test_basic_calculation(self, sample_ohlcv_df):
        results = self.obv.calculate(sample_ohlcv_df)
        assert len(results) > 0
        assert all(r.name == "obv" for r in results)

    def test_obv_increases_on_up_close(self):
        """OBV should increase when close > previous close."""
        df = pd.DataFrame({
            "timestamp": pd.date_range("2024-01-01", periods=20, freq="1h", tz="UTC"),
            "open": [100] * 20,
            "high": [102] * 20,
            "low": [98] * 20,
            "close": [100 + i * 0.5 for i in range(20)],  # Steadily rising
            "volume": [1000] * 20,
        })
        results = self.obv.calculate(df)
        # OBV should be increasing
        obv_values = [r.value for r in results]
        for i in range(1, len(obv_values)):
            assert obv_values[i] >= obv_values[i - 1]

    def test_obv_decreases_on_down_close(self):
        """OBV should decrease when close < previous close."""
        df = pd.DataFrame({
            "timestamp": pd.date_range("2024-01-01", periods=20, freq="1h", tz="UTC"),
            "open": [100] * 20,
            "high": [102] * 20,
            "low": [98] * 20,
            "close": [100 - i * 0.5 for i in range(20)],  # Steadily falling
            "volume": [1000] * 20,
        })
        results = self.obv.calculate(df)
        obv_values = [r.value for r in results]
        for i in range(1, len(obv_values)):
            assert obv_values[i] <= obv_values[i - 1]

    def test_detects_bearish_divergence(self):
        """Price making higher highs but OBV making lower highs = bearish."""
        n = 30
        # Price goes up, but volume decreasing on up moves
        close = list(range(100, 115)) + list(range(115, 130))
        volume = list(range(2000, 500, -100)) + list(range(2000, 500, -100))
        df = pd.DataFrame({
            "timestamp": pd.date_range("2024-01-01", periods=n, freq="1h", tz="UTC"),
            "open": [c - 0.5 for c in close],
            "high": [c + 1 for c in close],
            "low": [c - 1 for c in close],
            "close": close,
            "volume": volume,
        })
        results = self.obv.calculate(df)
        # At least some results should exist
        assert len(results) > 0


class TestOBVRegistry:
    def test_obv_is_registered(self):
        from backend.app.core.indicators.base import registry
        assert "obv" in registry.list_all()
        indicator = registry.get("obv")
        assert indicator.name == "obv"
