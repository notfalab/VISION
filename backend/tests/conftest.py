"""Shared test fixtures."""

import asyncio
from datetime import datetime, timezone

import pandas as pd
import pytest

from backend.app.config import Settings, get_settings
from backend.app.main import create_app


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture
def app():
    return create_app()


@pytest.fixture
def settings():
    return get_settings()


@pytest.fixture
def sample_ohlcv_df() -> pd.DataFrame:
    """Generate sample OHLCV data for indicator testing."""
    import numpy as np

    np.random.seed(42)
    n = 100
    base_price = 1.1000  # EURUSD-like

    # Generate realistic price movements
    returns = np.random.normal(0, 0.002, n)
    prices = base_price * np.exp(np.cumsum(returns))

    timestamps = pd.date_range("2024-01-01", periods=n, freq="1h", tz="UTC")

    df = pd.DataFrame({
        "timestamp": timestamps,
        "open": prices,
        "high": prices * (1 + np.abs(np.random.normal(0, 0.001, n))),
        "low": prices * (1 - np.abs(np.random.normal(0, 0.001, n))),
        "close": prices * (1 + np.random.normal(0, 0.0005, n)),
        "volume": np.random.lognormal(10, 1, n),
    })

    return df


@pytest.fixture
def sample_ohlcv_with_spike(sample_ohlcv_df) -> pd.DataFrame:
    """OHLCV data with an artificial volume spike at index 50."""
    df = sample_ohlcv_df.copy()
    avg_vol = df["volume"].mean()
    df.loc[50, "volume"] = avg_vol * 5  # 5x spike
    df.loc[50, "close"] = df.loc[50, "open"] * 1.01  # Price up = accumulation
    return df
