"""Abstract data source adapter — all exchange/data adapters implement this."""

from abc import ABC, abstractmethod
from collections.abc import AsyncGenerator, Callable
from dataclasses import dataclass
from datetime import datetime
from enum import Enum

import pandas as pd


class MarketType(str, Enum):
    FOREX = "forex"
    CRYPTO = "crypto"
    COMMODITY = "commodity"
    INDEX = "index"
    EQUITY = "equity"


@dataclass
class Candle:
    timestamp: datetime
    open: float
    high: float
    low: float
    close: float
    volume: float
    tick_volume: float | None = None
    spread: float | None = None
    open_interest: float | None = None

    def to_dict(self) -> dict:
        return {
            "timestamp": self.timestamp,
            "open": self.open,
            "high": self.high,
            "low": self.low,
            "close": self.close,
            "volume": self.volume,
            "tick_volume": self.tick_volume,
            "spread": self.spread,
            "open_interest": self.open_interest,
        }


@dataclass
class OrderBookLevel:
    price: float
    quantity: float
    orders_count: int | None = None


@dataclass
class OrderBook:
    symbol: str
    timestamp: datetime
    bids: list[OrderBookLevel]
    asks: list[OrderBookLevel]

    @property
    def bid_volume(self) -> float:
        return sum(l.quantity for l in self.bids)

    @property
    def ask_volume(self) -> float:
        return sum(l.quantity for l in self.asks)

    @property
    def imbalance(self) -> float:
        total = self.bid_volume + self.ask_volume
        return (self.bid_volume - self.ask_volume) / total if total > 0 else 0


class DataSourceAdapter(ABC):
    """
    Unified interface for any data source (exchange, broker, data provider).

    Each adapter handles connection, authentication, data fetching,
    and streaming for one specific source.
    """

    @property
    @abstractmethod
    def name(self) -> str:
        """Adapter identifier (e.g., 'binance', 'oanda')."""
        ...

    @property
    @abstractmethod
    def market_type(self) -> MarketType:
        """Primary market this adapter serves."""
        ...

    @abstractmethod
    async def connect(self) -> None:
        """Initialize connection / authenticate."""
        ...

    @abstractmethod
    async def disconnect(self) -> None:
        """Clean up connection."""
        ...

    @abstractmethod
    async def get_supported_symbols(self) -> list[str]:
        """List of symbols this adapter can provide data for."""
        ...

    @abstractmethod
    async def fetch_ohlcv(
        self,
        symbol: str,
        timeframe: str = "1h",
        limit: int = 500,
        since: datetime | None = None,
    ) -> pd.DataFrame:
        """
        Fetch historical OHLCV candles.

        Returns:
            DataFrame with columns [timestamp, open, high, low, close, volume]
        """
        ...

    async def fetch_orderbook(self, symbol: str, depth: int = 20) -> OrderBook | None:
        """Fetch current order book. Override if supported."""
        return None

    async def stream_prices(
        self,
        symbol: str,
        callback: Callable[[Candle], None],
    ) -> None:
        """Start streaming real-time price updates. Override for WebSocket sources."""
        raise NotImplementedError(f"{self.name} does not support price streaming")

    async def stream_orderbook(
        self,
        symbol: str,
        callback: Callable[[OrderBook], None],
    ) -> None:
        """Start streaming order book updates. Override for WebSocket sources."""
        raise NotImplementedError(f"{self.name} does not support orderbook streaming")
