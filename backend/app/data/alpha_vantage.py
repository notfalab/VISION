"""Alpha Vantage adapter — forex, gold, crypto historical data."""

from datetime import datetime, timezone

import httpx
import pandas as pd

from backend.app.config import get_settings
from backend.app.data.base import DataSourceAdapter, MarketType
from backend.app.logging_config import get_logger

logger = get_logger("alpha_vantage")

BASE_URL = "https://www.alphavantage.co/query"

# Map our timeframes to Alpha Vantage intervals
AV_INTERVALS = {
    "1m": "1min",
    "5m": "5min",
    "15m": "15min",
    "30m": "30min",
    "1h": "60min",
}

# CFTC contract codes for COT mapping
FOREX_SYMBOLS = {
    "EURUSD": ("EUR", "USD"),
    "GBPUSD": ("GBP", "USD"),
    "USDJPY": ("USD", "JPY"),
    "USDCHF": ("USD", "CHF"),
    "AUDUSD": ("AUD", "USD"),
    "USDCAD": ("USD", "CAD"),
    "NZDUSD": ("NZD", "USD"),
    "EURGBP": ("EUR", "GBP"),
    "EURJPY": ("EUR", "JPY"),
    "GBPJPY": ("GBP", "JPY"),
    "XAUUSD": ("XAU", "USD"),  # Gold spot
    "XAGUSD": ("XAG", "USD"),  # Silver spot
}


class AlphaVantageAdapter(DataSourceAdapter):
    """Fetches forex, gold, and crypto data from Alpha Vantage."""

    def __init__(self):
        settings = get_settings()
        self._api_key = settings.alpha_vantage_api_key
        self._client: httpx.AsyncClient | None = None

    @property
    def name(self) -> str:
        return "alpha_vantage"

    @property
    def market_type(self) -> MarketType:
        return MarketType.FOREX

    async def connect(self) -> None:
        self._client = httpx.AsyncClient(timeout=30.0)
        logger.info("connected", adapter=self.name)

    async def disconnect(self) -> None:
        if self._client:
            await self._client.aclose()
            self._client = None

    async def get_supported_symbols(self) -> list[str]:
        return list(FOREX_SYMBOLS.keys())

    async def fetch_ohlcv(
        self,
        symbol: str,
        timeframe: str = "1d",
        limit: int = 500,
        since: datetime | None = None,
    ) -> pd.DataFrame:
        if not self._client:
            await self.connect()

        symbol = symbol.upper()

        # Determine which AV function to use
        if symbol in ("XAUUSD", "XAGUSD"):
            # Gold/Silver: use FX_DAILY with physical currency codes
            from_sym, to_sym = FOREX_SYMBOLS[symbol]
            if timeframe in AV_INTERVALS:
                df = await self._fetch_fx_intraday(from_sym, to_sym, AV_INTERVALS[timeframe])
            else:
                # Try FX_DAILY first, fall back to CURRENCY_EXCHANGE_RATE
                try:
                    df = await self._fetch_fx_daily(from_sym, to_sym)
                except Exception:
                    logger.debug("fx_daily_failed_for_metal", symbol=symbol)
                    df = pd.DataFrame()
        elif symbol in FOREX_SYMBOLS:
            from_sym, to_sym = FOREX_SYMBOLS[symbol]
            if timeframe in AV_INTERVALS:
                df = await self._fetch_fx_intraday(from_sym, to_sym, AV_INTERVALS[timeframe])
            else:
                df = await self._fetch_fx_daily(from_sym, to_sym)
        elif symbol.endswith("USD") and len(symbol) > 3:
            # Crypto like BTCUSD -> BTC, USD
            crypto_sym = symbol.replace("USD", "")
            df = await self._fetch_crypto_daily(crypto_sym)
        else:
            raise ValueError(f"Unsupported symbol for Alpha Vantage: {symbol}")

        if df.empty:
            return df

        # Apply limit and since filter
        if since:
            df = df[df["timestamp"] >= since]
        df = df.sort_values("timestamp", ascending=True).tail(limit).reset_index(drop=True)

        return df

    async def _fetch_fx_daily(self, from_sym: str, to_sym: str) -> pd.DataFrame:
        """Fetch daily forex candles."""
        params = {
            "function": "FX_DAILY",
            "from_symbol": from_sym,
            "to_symbol": to_sym,
            "outputsize": "full",
            "apikey": self._api_key,
        }
        data = await self._request(params)

        ts_key = "Time Series FX (Daily)"
        if ts_key not in data:
            logger.warning("no_data", response_keys=list(data.keys()), symbol=f"{from_sym}{to_sym}")
            return pd.DataFrame()

        return self._parse_time_series(data[ts_key])

    async def _fetch_fx_intraday(self, from_sym: str, to_sym: str, interval: str) -> pd.DataFrame:
        """Fetch intraday forex candles."""
        params = {
            "function": "FX_INTRADAY",
            "from_symbol": from_sym,
            "to_symbol": to_sym,
            "interval": interval,
            "outputsize": "full",
            "apikey": self._api_key,
        }
        data = await self._request(params)

        ts_key = f"Time Series FX (Intraday)"
        # AV uses varying key names for intraday
        for key in data:
            if "Time Series" in key:
                ts_key = key
                break

        if ts_key not in data:
            logger.warning("no_intraday_data", keys=list(data.keys()))
            return pd.DataFrame()

        return self._parse_time_series(data[ts_key])

    async def _fetch_crypto_daily(self, symbol: str) -> pd.DataFrame:
        """Fetch daily crypto candles."""
        params = {
            "function": "DIGITAL_CURRENCY_DAILY",
            "symbol": symbol,
            "market": "USD",
            "apikey": self._api_key,
        }
        data = await self._request(params)

        ts_key = "Time Series (Digital Currency Daily)"
        if ts_key not in data:
            logger.warning("no_crypto_data", keys=list(data.keys()))
            return pd.DataFrame()

        rows = []
        for date_str, values in data[ts_key].items():
            rows.append({
                "timestamp": pd.Timestamp(date_str, tz="UTC"),
                "open": float(values.get("1a. open (USD)", values.get("1. open", 0))),
                "high": float(values.get("2a. high (USD)", values.get("2. high", 0))),
                "low": float(values.get("3a. low (USD)", values.get("3. low", 0))),
                "close": float(values.get("4a. close (USD)", values.get("4. close", 0))),
                "volume": float(values.get("5. volume", 0)),
            })
        return pd.DataFrame(rows)

    async def _request(self, params: dict) -> dict:
        """Make API request with error handling."""
        resp = await self._client.get(BASE_URL, params=params)
        resp.raise_for_status()
        data = resp.json()

        if "Error Message" in data:
            raise ValueError(f"Alpha Vantage error: {data['Error Message']}")
        if "Information" in data:
            raise ValueError(f"Alpha Vantage info: {data['Information']}")
        if "Note" in data:
            logger.warning("rate_limited", note=data["Note"])
            raise ValueError(f"Alpha Vantage rate limited: {data['Note']}")

        return data

    def _parse_time_series(self, ts_data: dict) -> pd.DataFrame:
        """Parse standard AV time series format."""
        rows = []
        for date_str, values in ts_data.items():
            rows.append({
                "timestamp": pd.Timestamp(date_str, tz="UTC"),
                "open": float(values["1. open"]),
                "high": float(values["2. high"]),
                "low": float(values["3. low"]),
                "close": float(values["4. close"]),
                "volume": 0.0,  # Forex doesn't have real volume in AV
            })
        return pd.DataFrame(rows)
