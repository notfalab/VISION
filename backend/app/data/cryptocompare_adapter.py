"""CryptoCompare adapter — crypto OHLCV data (minute, hour, day).

Works from US servers (no geo-blocking), solving the Binance HTTP 451
issue on Railway. Free tier: 50K calls/month without key, 100K with key.
"""

from datetime import datetime, timezone

import httpx
import pandas as pd

from backend.app.config import get_settings
from backend.app.data.base import DataSourceAdapter, MarketType
from backend.app.logging_config import get_logger

logger = get_logger("cryptocompare")

BASE_URL = "https://min-api.cryptocompare.com/data/v2"

# Map our symbols to CryptoCompare (fsym, tsym) pairs
SYMBOL_MAP: dict[str, tuple[str, str]] = {
    "BTCUSD": ("BTC", "USD"),
    "ETHUSD": ("ETH", "USD"),
    "SOLUSD": ("SOL", "USD"),
    "XRPUSD": ("XRP", "USD"),
    "ETHBTC": ("ETH", "BTC"),
}

SUPPORTED_SYMBOLS = set(SYMBOL_MAP.keys())

# Timeframe -> (endpoint, aggregation_factor)
# factor=1 means direct fetch, factor>1 means fetch finer data and aggregate
TIMEFRAME_CONFIG: dict[str, tuple[str, int]] = {
    "1m": ("histominute", 1),
    "5m": ("histominute", 5),
    "15m": ("histominute", 15),
    "30m": ("histominute", 30),
    "1h": ("histohour", 1),
    "4h": ("histohour", 4),
    "1d": ("histoday", 1),
    "1w": ("histoday", 7),
    "1M": ("histoday", 30),
}


class CryptoCompareAdapter(DataSourceAdapter):
    """CryptoCompare REST API adapter for crypto OHLCV data."""

    def __init__(self):
        settings = get_settings()
        self._api_key = settings.cryptocompare_api_key
        self._client: httpx.AsyncClient | None = None

    @property
    def name(self) -> str:
        return "cryptocompare"

    @property
    def market_type(self) -> MarketType:
        return MarketType.CRYPTO

    async def connect(self) -> None:
        headers = {}
        if self._api_key:
            headers["authorization"] = f"Apikey {self._api_key}"
        self._client = httpx.AsyncClient(timeout=30.0, headers=headers)
        logger.info("connected", adapter=self.name)

    async def disconnect(self) -> None:
        if self._client:
            await self._client.aclose()
            self._client = None

    async def get_supported_symbols(self) -> list[str]:
        return sorted(SUPPORTED_SYMBOLS)

    async def fetch_ohlcv(
        self,
        symbol: str,
        timeframe: str = "1h",
        limit: int = 500,
        since: datetime | None = None,
    ) -> pd.DataFrame:
        if not self._client:
            await self.connect()

        symbol = symbol.upper()
        pair = SYMBOL_MAP.get(symbol)
        if not pair:
            logger.warning("unsupported_symbol", symbol=symbol)
            return pd.DataFrame()

        fsym, tsym = pair
        config = TIMEFRAME_CONFIG.get(timeframe)
        if not config:
            logger.warning("unsupported_timeframe", timeframe=timeframe)
            return pd.DataFrame()

        endpoint, factor = config

        # Fetch enough raw candles to produce `limit` aggregated candles
        raw_limit = limit * factor
        raw_candles = await self._fetch_raw(endpoint, fsym, tsym, raw_limit, since)

        if not raw_candles:
            return pd.DataFrame()

        df = pd.DataFrame(raw_candles)

        if factor > 1:
            df = self._aggregate_candles(df, factor)

        df = df.tail(limit).reset_index(drop=True)
        logger.info("fetched", symbol=symbol, timeframe=timeframe, rows=len(df))
        return df

    async def _fetch_raw(
        self,
        endpoint: str,
        fsym: str,
        tsym: str,
        limit: int,
        since: datetime | None = None,
    ) -> list[dict]:
        """Fetch raw candle data with pagination (max 2000 per request)."""
        all_rows: list[dict] = []
        remaining = limit
        to_ts: int | None = None

        if since:
            # CryptoCompare doesn't have a 'from' param — we use toTs and work backwards
            # So we'll set toTs to now and let it paginate back
            pass

        while remaining > 0:
            batch = min(remaining, 2000)
            params: dict = {
                "fsym": fsym,
                "tsym": tsym,
                "limit": batch,
            }
            if to_ts:
                params["toTs"] = to_ts

            url = f"{BASE_URL}/{endpoint}"

            try:
                resp = await self._client.get(url, params=params)
                if resp.status_code != 200:
                    logger.warning("http_error", status=resp.status_code, endpoint=endpoint)
                    break

                data = resp.json()
                if data.get("Response") != "Success":
                    logger.warning("api_error", message=data.get("Message", ""), symbol=f"{fsym}/{tsym}")
                    break

                candles = data.get("Data", {}).get("Data", [])
                if not candles:
                    break

                rows = []
                for c in candles:
                    ts = c.get("time", 0)
                    # Skip empty candles (CryptoCompare returns zeros for future timestamps)
                    if c.get("close", 0) == 0 and c.get("open", 0) == 0:
                        continue
                    rows.append({
                        "timestamp": pd.Timestamp(ts, unit="s", tz="UTC"),
                        "open": float(c.get("open", 0)),
                        "high": float(c.get("high", 0)),
                        "low": float(c.get("low", 0)),
                        "close": float(c.get("close", 0)),
                        "volume": float(c.get("volumefrom", 0)),
                    })

                if not rows:
                    break

                all_rows = rows + all_rows  # Prepend (older data first)
                remaining -= len(rows)

                if len(candles) < batch:
                    break  # No more data

                # Next page: before the earliest candle in this batch
                to_ts = candles[0]["time"] - 1

            except Exception as e:
                logger.error("fetch_failed", error=str(e), endpoint=endpoint, symbol=f"{fsym}/{tsym}")
                break

        # Deduplicate and sort
        if not all_rows:
            return []

        df = (
            pd.DataFrame(all_rows)
            .drop_duplicates(subset="timestamp")
            .sort_values("timestamp")
            .reset_index(drop=True)
        )
        return df.to_dict("records")

    @staticmethod
    def _aggregate_candles(df: pd.DataFrame, factor: int) -> pd.DataFrame:
        """Aggregate finer candles into larger timeframes.

        E.g., factor=5 aggregates 1m candles into 5m candles.
        """
        df = df.sort_values("timestamp").reset_index(drop=True)
        n_groups = len(df) // factor
        if n_groups == 0:
            return pd.DataFrame()

        # Trim incomplete group at the start
        trim = len(df) - (n_groups * factor)
        if trim > 0:
            df = df.iloc[trim:].reset_index(drop=True)

        rows = []
        for i in range(n_groups):
            chunk = df.iloc[i * factor : (i + 1) * factor]
            rows.append({
                "timestamp": chunk["timestamp"].iloc[0],
                "open": chunk["open"].iloc[0],
                "high": chunk["high"].max(),
                "low": chunk["low"].min(),
                "close": chunk["close"].iloc[-1],
                "volume": chunk["volume"].sum(),
            })
        return pd.DataFrame(rows)

    async def fetch_ticker(self, symbol: str) -> dict:
        """Fetch latest price."""
        if not self._client:
            await self.connect()

        symbol = symbol.upper()
        pair = SYMBOL_MAP.get(symbol)
        if not pair:
            return {"symbol": symbol, "price": 0, "error": "Unsupported symbol"}

        fsym, tsym = pair
        url = f"https://min-api.cryptocompare.com/data/price"
        params = {"fsym": fsym, "tsyms": tsym}

        try:
            resp = await self._client.get(url, params=params)
            if resp.status_code == 200:
                data = resp.json()
                price = float(data.get(tsym, 0))
                return {"symbol": symbol, "price": price}
        except Exception as e:
            logger.error("ticker_failed", symbol=symbol, error=str(e))

        return {"symbol": symbol, "price": 0, "error": "Failed to fetch ticker"}
