"""Binance adapter — crypto real-time + historical (public endpoints, no key needed)."""

import asyncio
import json
from datetime import datetime, timezone

import httpx
import pandas as pd

from backend.app.data.base import Candle, DataSourceAdapter, MarketType, OrderBook, OrderBookLevel
from backend.app.logging_config import get_logger

logger = get_logger("binance")

REST_URL = "https://api.binance.com/api/v3"
WS_URL = "wss://stream.binance.com:9443/ws"

# Map our timeframes to Binance intervals
BINANCE_INTERVALS = {
    "1m": "1m", "5m": "5m", "15m": "15m", "30m": "30m",
    "1h": "1h", "4h": "4h", "1d": "1d", "1w": "1w", "1M": "1M",
}

# Special symbol mappings (our symbol -> Binance symbol)
SYMBOL_MAP = {
    "XAUUSD": "PAXGUSDT",   # Gold via PAX Gold token (1:1 gold backing)
    "XAGUSD": "PAXGUSDT",   # Fallback — no silver token on Binance
}


# Map our symbols to Binance format (BTCUSD -> BTCUSDT)
def to_binance_symbol(symbol: str) -> str:
    symbol = symbol.upper()
    if symbol in SYMBOL_MAP:
        return SYMBOL_MAP[symbol]
    if symbol.endswith("USD") and not symbol.endswith("USDT"):
        return symbol + "T"
    return symbol


class BinanceAdapter(DataSourceAdapter):
    """Public Binance API — no key required for market data."""

    def __init__(self):
        self._client: httpx.AsyncClient | None = None

    @property
    def name(self) -> str:
        return "binance"

    @property
    def market_type(self) -> MarketType:
        return MarketType.CRYPTO

    async def connect(self) -> None:
        self._client = httpx.AsyncClient(timeout=15.0)
        logger.info("connected", adapter=self.name)

    async def disconnect(self) -> None:
        if self._client:
            await self._client.aclose()
            self._client = None

    async def get_supported_symbols(self) -> list[str]:
        """Fetch all active trading pairs from Binance."""
        if not self._client:
            await self.connect()
        resp = await self._client.get(f"{REST_URL}/exchangeInfo")
        resp.raise_for_status()
        data = resp.json()
        return [s["symbol"] for s in data["symbols"] if s["status"] == "TRADING"]

    async def fetch_ohlcv(
        self,
        symbol: str,
        timeframe: str = "1h",
        limit: int = 500,
        since: datetime | None = None,
    ) -> pd.DataFrame:
        if not self._client:
            await self.connect()

        binance_symbol = to_binance_symbol(symbol)
        interval = BINANCE_INTERVALS.get(timeframe, "1h")

        all_klines: list = []
        remaining = limit
        end_time: int | None = None

        # Paginate backwards: fetch up to 1000 per request
        while remaining > 0:
            batch_size = min(remaining, 1000)
            params: dict = {
                "symbol": binance_symbol,
                "interval": interval,
                "limit": batch_size,
            }
            if since and not end_time:
                params["startTime"] = int(since.timestamp() * 1000)
            if end_time:
                params["endTime"] = end_time

            resp = await self._client.get(f"{REST_URL}/klines", params=params)
            resp.raise_for_status()
            klines = resp.json()

            if not klines:
                break

            all_klines = klines + all_klines
            remaining -= len(klines)

            if len(klines) < batch_size:
                break  # No more data available

            # Next page: fetch candles before the earliest one in this batch
            end_time = int(klines[0][0]) - 1

        if not all_klines:
            return pd.DataFrame()

        rows = []
        for k in all_klines:
            rows.append({
                "timestamp": pd.Timestamp(k[0], unit="ms", tz="UTC"),
                "open": float(k[1]),
                "high": float(k[2]),
                "low": float(k[3]),
                "close": float(k[4]),
                "volume": float(k[5]),
            })

        # Deduplicate and sort by timestamp, trim to requested limit
        df = pd.DataFrame(rows).drop_duplicates(subset="timestamp").sort_values("timestamp").tail(limit).reset_index(drop=True)
        return df

    async def fetch_orderbook(self, symbol: str, depth: int = 20) -> OrderBook:
        """Fetch current order book snapshot."""
        if not self._client:
            await self.connect()

        binance_symbol = to_binance_symbol(symbol)
        params = {"symbol": binance_symbol, "limit": min(depth, 1000)}
        resp = await self._client.get(f"{REST_URL}/depth", params=params)
        resp.raise_for_status()
        data = resp.json()

        return OrderBook(
            symbol=symbol.upper(),
            timestamp=datetime.now(timezone.utc),
            bids=[OrderBookLevel(price=float(b[0]), quantity=float(b[1])) for b in data["bids"]],
            asks=[OrderBookLevel(price=float(a[0]), quantity=float(a[1])) for a in data["asks"]],
        )

    async def fetch_ticker(self, symbol: str) -> dict:
        """Fetch current price ticker."""
        if not self._client:
            await self.connect()

        binance_symbol = to_binance_symbol(symbol)
        resp = await self._client.get(
            f"{REST_URL}/ticker/24hr", params={"symbol": binance_symbol}
        )
        resp.raise_for_status()
        data = resp.json()
        return {
            "symbol": symbol.upper(),
            "price": float(data["lastPrice"]),
            "volume_24h": float(data["volume"]),
            "change_pct": float(data["priceChangePercent"]),
            "high_24h": float(data["highPrice"]),
            "low_24h": float(data["lowPrice"]),
        }

    async def stream_prices(self, symbol: str, callback) -> None:
        """WebSocket stream for real-time kline/candle updates."""
        import websockets

        binance_symbol = to_binance_symbol(symbol).lower()
        url = f"{WS_URL}/{binance_symbol}@kline_1m"

        logger.info("ws_connecting", symbol=symbol, url=url)

        async for ws in websockets.connect(url):
            try:
                async for message in ws:
                    data = json.loads(message)
                    k = data.get("k", {})
                    if not k:
                        continue

                    candle = Candle(
                        timestamp=datetime.fromtimestamp(k["t"] / 1000, tz=timezone.utc),
                        open=float(k["o"]),
                        high=float(k["h"]),
                        low=float(k["l"]),
                        close=float(k["c"]),
                        volume=float(k["v"]),
                    )
                    await callback(candle)
            except websockets.ConnectionClosed:
                logger.warning("ws_reconnecting", symbol=symbol)
                continue
