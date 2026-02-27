"""Tests for volume spike detection indicator."""

import pandas as pd

from backend.app.core.indicators.volume import VolumeSpikeDetector


class TestVolumeSpikeDetector:
    def setup_method(self):
        self.detector = VolumeSpikeDetector(lookback=20, spike_threshold=2.0)

    def test_name(self):
        assert self.detector.name == "volume_spike"

    def test_validates_dataframe(self, sample_ohlcv_df):
        # Should not raise
        results = self.detector.calculate(sample_ohlcv_df)
        assert isinstance(results, list)

    def test_validates_missing_columns(self):
        df = pd.DataFrame({"timestamp": [1], "open": [1]})
        try:
            self.detector.calculate(df)
            assert False, "Should have raised ValueError"
        except ValueError as e:
            assert "missing columns" in str(e).lower()

    def test_detects_spike(self, sample_ohlcv_with_spike):
        results = self.detector.calculate(sample_ohlcv_with_spike)
        # Should find at least one spike (we injected one at index 50)
        assert len(results) > 0
        # Check the artificial spike is detected
        spike_timestamps = [r.timestamp for r in results]
        assert sample_ohlcv_with_spike["timestamp"].iloc[50] in spike_timestamps

    def test_spike_classified_as_accumulation(self, sample_ohlcv_with_spike):
        results = self.detector.calculate(sample_ohlcv_with_spike)
        # Find the spike at index 50 (price went up = accumulation)
        spike_at_50 = [
            r for r in results
            if r.timestamp == sample_ohlcv_with_spike["timestamp"].iloc[50]
        ]
        assert len(spike_at_50) == 1
        assert spike_at_50[0].metadata["classification"] == "accumulation"

    def test_no_spikes_in_normal_data(self):
        """Constant volume should produce no spikes."""
        import numpy as np
        n = 50
        df = pd.DataFrame({
            "timestamp": pd.date_range("2024-01-01", periods=n, freq="1h", tz="UTC"),
            "open": np.ones(n) * 100,
            "high": np.ones(n) * 101,
            "low": np.ones(n) * 99,
            "close": np.ones(n) * 100.5,
            "volume": np.ones(n) * 1000,  # Constant volume
        })
        results = self.detector.calculate(df)
        assert len(results) == 0

    def test_spike_threshold_configurable(self, sample_ohlcv_with_spike):
        strict = VolumeSpikeDetector(lookback=20, spike_threshold=10.0)
        results = strict.calculate(sample_ohlcv_with_spike)
        # Very strict threshold should find fewer spikes
        lenient = VolumeSpikeDetector(lookback=20, spike_threshold=1.5)
        results_lenient = lenient.calculate(sample_ohlcv_with_spike)
        assert len(results) <= len(results_lenient)
