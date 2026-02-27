"""Tests for data source registry."""

from datetime import datetime
from unittest.mock import AsyncMock

import pandas as pd

from backend.app.data.base import DataSourceAdapter, MarketType
from backend.app.data.registry import DataSourceRegistry


class MockForexAdapter(DataSourceAdapter):
    @property
    def name(self) -> str:
        return "mock_forex"

    @property
    def market_type(self) -> MarketType:
        return MarketType.FOREX

    async def connect(self):
        pass

    async def disconnect(self):
        pass

    async def get_supported_symbols(self):
        return ["EURUSD", "GBPUSD", "XAUUSD"]

    async def fetch_ohlcv(self, symbol, timeframe="1h", limit=500, since=None):
        return pd.DataFrame()


class MockCryptoAdapter(DataSourceAdapter):
    @property
    def name(self) -> str:
        return "mock_crypto"

    @property
    def market_type(self) -> MarketType:
        return MarketType.CRYPTO

    async def connect(self):
        pass

    async def disconnect(self):
        pass

    async def get_supported_symbols(self):
        return ["BTCUSD", "ETHUSD"]

    async def fetch_ohlcv(self, symbol, timeframe="1h", limit=500, since=None):
        return pd.DataFrame()


class TestDataSourceRegistry:
    def setup_method(self):
        self.registry = DataSourceRegistry()
        self.forex = MockForexAdapter()
        self.crypto = MockCryptoAdapter()

    def test_register_and_list(self):
        self.registry.register(self.forex)
        self.registry.register(self.crypto)
        adapters = self.registry.list_adapters()
        assert len(adapters) == 2
        names = [a["name"] for a in adapters]
        assert "mock_forex" in names
        assert "mock_crypto" in names

    def test_get_adapter(self):
        self.registry.register(self.forex)
        adapter = self.registry.get_adapter("mock_forex")
        assert adapter.name == "mock_forex"

    def test_get_missing_adapter(self):
        try:
            self.registry.get_adapter("nonexistent")
            assert False, "Should raise KeyError"
        except KeyError:
            pass

    def test_route_forex_symbol(self):
        self.registry.register(self.forex)
        self.registry.register(self.crypto)
        adapter = self.registry.route_symbol("EURUSD")
        assert adapter.market_type == MarketType.FOREX

    def test_route_crypto_symbol(self):
        self.registry.register(self.forex)
        self.registry.register(self.crypto)
        adapter = self.registry.route_symbol("BTCUSD")
        assert adapter.market_type == MarketType.CRYPTO

    def test_route_gold_symbol(self):
        self.registry.register(self.forex)
        self.registry.register(self.crypto)
        adapter = self.registry.route_symbol("XAUUSD")
        assert adapter.market_type in (MarketType.FOREX, MarketType.COMMODITY)

    def test_explicit_route_override(self):
        self.registry.register(self.forex)
        self.registry.register(self.crypto)
        self.registry.set_route("XAUUSD", "mock_crypto")  # Force to crypto
        adapter = self.registry.route_symbol("XAUUSD")
        assert adapter.name == "mock_crypto"

    def test_unknown_symbol_raises(self):
        self.registry.register(self.forex)
        try:
            self.registry.route_symbol("UNKNOWN123")
            assert False, "Should raise ValueError"
        except ValueError:
            pass
