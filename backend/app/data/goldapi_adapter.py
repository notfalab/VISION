"""GoldAPI.io adapter — real-time gold & silver prices."""

import asyncio
from datetime import datetime, timezone, timedelta

import httpx
import pandas as pd

from backend.app.config import get_settings
from backend.app.data.base import Candle, DataSourceAdapter, MarketType
from backend.app.logging_config import get_logger

logger = get_logger("goldapi")

BASE_URL = "https://www.goldapi.io/api"

# Metal codes supported by GoldAPI
METAL_MAP = {
    "XAUUSD": ("XAU", "USD"),
    "XAGUSD": ("XAG", "USD"),
}

SUPPORTED_SYMBOLS = set(METAL_MAP.keys())


def _safe_float(val, fallback: float = 0.0) -> float:
    """Convert to float safely, returning fallback if None."""
    if val is None:
        return fallback
    return float(val)


class GoldAPIAdapter(DataSourceAdapter):
    """GoldAPI.io adapter for gold and silver spot prices."""

    def __init__(self):
        settings = get_settings()
        self._api_key = settings.goldapi_api_key
        self._client: httpx.AsyncClient | None = None

    @property
    def name(self) -> str:
        return "goldapi"

    @property
    def market_type(self) -> MarketType:
        return MarketType.COMMODITY

    def _headers(self) -> dict:
        return {
            "x-access-token": self._api_key,
            "Content-Type": "application/json",
        }

    async def connect(self) -> None:
        self._client = httpx.AsyncClient(timeout=30.0, headers=self._headers())
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

    async def _fetch_current(self, metal: str, currency: str) -> dict | None:
        """Fetch current price with OHLC for today."""
        try:
            resp = await self._client.get(f"{BASE_URL}/{metal}/{currency}")
            if resp.status_code == 200:
                return resp.json()
            logger.warning("goldapi_error", status=resp.status_code, body=resp.text[:200])
        except Exception as e:
            logger.error("goldapi_request_failed", error=str(e))
        return None

    async def _fetch_historical(self, metal: str, currency: str, date: str) -> dict | None:
        """Fetch historical price for a specific date (YYYYMMDD)."""
        try:
            resp = await self._client.get(f"{BASE_URL}/{metal}/{currency}/{date}")
            if resp.status_code == 200:
                return resp.json()
            if resp.status_code == 404:
                return None  # No data for this date (weekend/holiday)
            logger.debug("goldapi_historical_error", status=resp.status_code, date=date)
        except Exception as e:
            logger.debug("goldapi_historical_failed", date=date, error=str(e))
        return None

    async def fetch_ohlcv(
        self,
        symbol: str,
        timeframe: str = "1d",
        limit: int = 500,
        since: datetime | None = None,
    ) -> pd.DataFrame:
        """
        Fetch OHLCV data from GoldAPI.

        GoldAPI is used only for current/today's price (1 API call).
        Historical data should come from Alpha Vantage via the ingestion fallback.
        This preserves GoldAPI quota (free tier = 100 req/month).
        """
        if not self._client:
            await self.connect()

        symbol = symbol.upper()
        if symbol not in METAL_MAP:
            raise ValueError(f"Unsupported symbol for GoldAPI: {symbol}")

        metal, currency = METAL_MAP[symbol]

        data = await self._fetch_current(metal, currency)
        if not data or "price" not in data:
            return pd.DataFrame()

        # Build today's candle from current price data
        price = _safe_float(data.get("price"), 0)
        if price <= 0:
            return pd.DataFrame()

        if timeframe == "1d":
            ts_val = data.get("open_time") or data.get("timestamp") or 0
            ts = datetime.fromtimestamp(int(ts_val), tz=timezone.utc)
            timestamp = pd.Timestamp(ts.date(), tz="UTC")
        else:
            now = datetime.now(timezone.utc)
            timestamp = pd.Timestamp(now.replace(second=0, microsecond=0), tz="UTC")

        df = pd.DataFrame([{
            "timestamp": timestamp,
            "open": _safe_float(data.get("open_price"), price),
            "high": _safe_float(data.get("high_price"), price),
            "low": _safe_float(data.get("low_price"), price),
            "close": price,
            "volume": 0.0,
        }])
        logger.info("fetched", symbol=symbol, rows=1, timeframe=timeframe)
        return df

    async def fetch_ticker(self, symbol: str) -> dict:
        """Fetch latest price."""
        if not self._client:
            await self.connect()

        symbol = symbol.upper()
        if symbol not in METAL_MAP:
            return {"symbol": symbol, "price": 0, "error": "Unsupported symbol"}

        metal, currency = METAL_MAP[symbol]
        data = await self._fetch_current(metal, currency)

        if data and data.get("price") is not None:
            price = _safe_float(data["price"])
            return {
                "symbol": symbol,
                "price": price,
                "bid": _safe_float(data.get("bid"), price),
                "ask": _safe_float(data.get("ask"), price),
                "spread": round(_safe_float(data.get("ask"), price) - _safe_float(data.get("bid"), price), 2),
                "open": _safe_float(data.get("open_price"), price),
                "high": _safe_float(data.get("high_price"), price),
                "low": _safe_float(data.get("low_price"), price),
                "change": _safe_float(data.get("ch")),
                "change_pct": _safe_float(data.get("chp")),
                "timestamp": datetime.fromtimestamp(int(data.get("timestamp", 0)), tz=timezone.utc).isoformat(),
            }

        return {"symbol": symbol, "price": 0, "error": "Failed to fetch"}

    async def stream_prices(self, symbol: str, callback) -> None:
        """GoldAPI doesn't support streaming — poll every 30 seconds."""
        if not self._client:
            await self.connect()

        symbol = symbol.upper()
        if symbol not in METAL_MAP:
            return

        metal, currency = METAL_MAP[symbol]
        logger.info("polling_started", symbol=symbol, interval="30s")

        while True:
            try:
                data = await self._fetch_current(metal, currency)
                if data and data.get("price") is not None:
                    ts = datetime.fromtimestamp(int(data.get("timestamp", 0)), tz=timezone.utc)
                    mid = _safe_float(data["price"])
                    candle = Candle(
                        timestamp=ts,
                        open=_safe_float(data.get("open_price"), mid),
                        high=_safe_float(data.get("high_price"), mid),
                        low=_safe_float(data.get("low_price"), mid),
                        close=mid,
                        volume=0,
                        spread=round(_safe_float(data.get("ask"), mid) - _safe_float(data.get("bid"), mid), 2),
                    )
                    await callback(candle)
            except Exception as e:
                logger.error("poll_error", symbol=symbol, error=str(e))

            await asyncio.sleep(30)
