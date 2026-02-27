"""Massive.com adapter — forex, gold, crypto historical + real-time data."""

from datetime import datetime, timezone, timedelta

import httpx
import pandas as pd

from backend.app.config import get_settings
from backend.app.data.base import DataSourceAdapter, MarketType
from backend.app.logging_config import get_logger

logger = get_logger("massive")

BASE_URL = "https://api.massive.com"

# Map our timeframes to Massive multiplier + timespan
MASSIVE_TIMEFRAMES = {
    "1m": (1, "minute"),
    "5m": (5, "minute"),
    "15m": (15, "minute"),
    "30m": (30, "minute"),
    "1h": (1, "hour"),
    "4h": (4, "hour"),
    "1d": (1, "day"),
    "1w": (1, "week"),
    "1M": (1, "month"),
}

# Map our symbols to Massive ticker format
SYMBOL_TO_MASSIVE = {
    # Forex pairs use C: prefix
    "XAUUSD": "C:XAUUSD",
    "XAGUSD": "C:XAGUSD",
    "EURUSD": "C:EURUSD",
    "GBPUSD": "C:GBPUSD",
    "USDJPY": "C:USDJPY",
    "USDCHF": "C:USDCHF",
    "AUDUSD": "C:AUDUSD",
    "USDCAD": "C:USDCAD",
    "NZDUSD": "C:NZDUSD",
    "EURGBP": "C:EURGBP",
    "EURJPY": "C:EURJPY",
    "GBPJPY": "C:GBPJPY",
    # Crypto uses X: prefix
    "BTCUSD": "X:BTCUSD",
    "ETHUSD": "X:ETHUSD",
    "SOLUSD": "X:SOLUSD",
}

SUPPORTED_SYMBOLS = set(SYMBOL_TO_MASSIVE.keys())


class MassiveAdapter(DataSourceAdapter):
    """Massive.com REST API adapter for forex, gold, and crypto."""

    def __init__(self):
        settings = get_settings()
        self._api_key = settings.massive_api_key
        self._client: httpx.AsyncClient | None = None

    @property
    def name(self) -> str:
        return "massive"

    @property
    def market_type(self) -> MarketType:
        return MarketType.FOREX

    async def connect(self) -> None:
        self._client = httpx.AsyncClient(timeout=30.0)
        if not self._api_key:
            logger.warning("no_api_key", adapter=self.name)
            return
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
        timeframe: str = "1d",
        limit: int = 500,
        since: datetime | None = None,
    ) -> pd.DataFrame:
        if not self._client:
            await self.connect()

        if not self._api_key:
            raise ValueError("Massive API key not configured")

        symbol = symbol.upper()
        ticker = SYMBOL_TO_MASSIVE.get(symbol)
        if not ticker:
            # Generic forex: add C: prefix
            if len(symbol) == 6 and symbol.isalpha():
                ticker = f"C:{symbol}"
            else:
                raise ValueError(f"Unsupported symbol for Massive: {symbol}")

        multiplier, timespan = MASSIVE_TIMEFRAMES.get(timeframe, (1, "day"))

        # Date range
        to_date = datetime.now(timezone.utc)
        if since:
            from_date = since
        else:
            # Calculate how far back we need based on timeframe and limit
            if timespan == "day":
                from_date = to_date - timedelta(days=int(limit * 1.5))
            elif timespan == "week":
                from_date = to_date - timedelta(weeks=int(limit * 1.5))
            elif timespan == "month":
                from_date = to_date - timedelta(days=int(limit * 45))
            elif timespan == "hour":
                from_date = to_date - timedelta(hours=int(limit * multiplier * 1.5))
            else:  # minute
                from_date = to_date - timedelta(minutes=int(limit * multiplier * 1.5))

        from_str = from_date.strftime("%Y-%m-%d")
        to_str = to_date.strftime("%Y-%m-%d")

        url = f"{BASE_URL}/v2/aggs/ticker/{ticker}/range/{multiplier}/{timespan}/{from_str}/{to_str}"
        params = {
            "adjusted": "true",
            "sort": "asc",
            "limit": min(limit, 50000),
            "apiKey": self._api_key,
        }

        try:
            resp = await self._client.get(url, params=params)
            if resp.status_code != 200:
                logger.warning(
                    "massive_http_error",
                    status=resp.status_code,
                    body=resp.text[:300],
                    symbol=symbol,
                )
                return pd.DataFrame()

            data = resp.json()
        except Exception as e:
            logger.error("massive_request_failed", symbol=symbol, error=str(e))
            return pd.DataFrame()

        if data.get("status") != "OK" or not data.get("results"):
            logger.warning(
                "massive_no_results",
                status=data.get("status"),
                symbol=symbol,
                count=data.get("resultsCount", 0),
            )
            return pd.DataFrame()

        rows = []
        for r in data["results"]:
            ts_ms = r.get("t", 0)
            rows.append({
                "timestamp": pd.Timestamp(ts_ms, unit="ms", tz="UTC"),
                "open": float(r.get("o", 0)),
                "high": float(r.get("h", 0)),
                "low": float(r.get("l", 0)),
                "close": float(r.get("c", 0)),
                "volume": float(r.get("v", 0)),
            })

        if not rows:
            return pd.DataFrame()

        df = (
            pd.DataFrame(rows)
            .drop_duplicates(subset="timestamp")
            .sort_values("timestamp")
            .tail(limit)
            .reset_index(drop=True)
        )
        logger.info("fetched", symbol=symbol, timeframe=timeframe, rows=len(df))
        return df

    async def fetch_ticker(self, symbol: str) -> dict:
        """Fetch latest price using most recent candle."""
        if not self._client:
            await self.connect()

        symbol = symbol.upper()
        ticker = SYMBOL_TO_MASSIVE.get(symbol, f"C:{symbol}")

        to_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        from_date = (datetime.now(timezone.utc) - timedelta(days=3)).strftime("%Y-%m-%d")
        url = f"{BASE_URL}/v2/aggs/ticker/{ticker}/range/1/day/{from_date}/{to_date}"
        params = {"adjusted": "true", "sort": "desc", "limit": 1, "apiKey": self._api_key}

        try:
            resp = await self._client.get(url, params=params)
            if resp.status_code == 200:
                data = resp.json()
                results = data.get("results", [])
                if results:
                    r = results[0]
                    return {
                        "symbol": symbol,
                        "price": float(r.get("c", 0)),
                        "open": float(r.get("o", 0)),
                        "high": float(r.get("h", 0)),
                        "low": float(r.get("l", 0)),
                        "volume": float(r.get("v", 0)),
                        "vwap": float(r.get("vw", 0)),
                        "timestamp": pd.Timestamp(r.get("t", 0), unit="ms", tz="UTC").isoformat(),
                    }
        except Exception as e:
            logger.error("ticker_failed", symbol=symbol, error=str(e))

        return {"symbol": symbol, "price": 0, "error": "Failed to fetch ticker"}
