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

        For daily timeframe: fetches historical day-by-day prices.
        For intraday: only returns today's candle (GoldAPI doesn't have intraday history).
        """
        if not self._client:
            await self.connect()

        symbol = symbol.upper()
        if symbol not in METAL_MAP:
            raise ValueError(f"Unsupported symbol for GoldAPI: {symbol}")

        metal, currency = METAL_MAP[symbol]

        # For intraday timeframes, only return today's price
        if timeframe != "1d":
            data = await self._fetch_current(metal, currency)
            if not data or "price" not in data:
                return pd.DataFrame()

            now = datetime.now(timezone.utc)
            return pd.DataFrame([{
                "timestamp": pd.Timestamp(now.replace(second=0, microsecond=0), tz="UTC"),
                "open": float(data.get("open_price", data["price"])),
                "high": float(data.get("high_price", data["price"])),
                "low": float(data.get("low_price", data["price"])),
                "close": float(data["price"]),
                "volume": 0.0,
            }])

        # Daily: fetch today + historical dates
        rows = []

        # 1. Fetch today's candle (has full OHLC)
        current = await self._fetch_current(metal, currency)
        if current and "price" in current:
            ts = datetime.fromtimestamp(current.get("open_time", current["timestamp"]), tz=timezone.utc)
            rows.append({
                "timestamp": pd.Timestamp(ts.date(), tz="UTC"),
                "open": float(current.get("open_price", current["price"])),
                "high": float(current.get("high_price", current["price"])),
                "low": float(current.get("low_price", current["price"])),
                "close": float(current["price"]),
                "volume": 0.0,
            })

        # 2. Fetch historical dates (going back from yesterday)
        # GoldAPI free tier = 300 req/month. Be conservative — fetch up to min(limit, 250) days
        fetch_days = min(limit - 1, 250)
        today = datetime.now(timezone.utc).date()

        # Fetch in batches with small delays to avoid rate limiting
        batch_size = 5
        for batch_start in range(0, fetch_days, batch_size):
            tasks = []
            for i in range(batch_start, min(batch_start + batch_size, fetch_days)):
                date = today - timedelta(days=i + 1)
                # Skip weekends (gold markets closed Sat/Sun)
                if date.weekday() >= 5:
                    continue
                date_str = date.strftime("%Y%m%d")
                tasks.append(self._fetch_historical(metal, currency, date_str))

            if not tasks:
                continue

            results = await asyncio.gather(*tasks, return_exceptions=True)

            for result in results:
                if isinstance(result, Exception) or result is None:
                    continue
                if "price" not in result:
                    continue

                # Historical endpoint returns: price, prev_close_price, date
                price = float(result["price"])
                prev_close = float(result.get("prev_close_price", price))

                # Build a candle: we only have close price, so approximate OHLC
                # open ≈ prev_close, close = price, high/low estimated from change
                change = abs(price - prev_close)
                ts_str = result.get("date", "")
                if ts_str:
                    ts = pd.Timestamp(ts_str).tz_localize("UTC") if pd.Timestamp(ts_str).tzinfo is None else pd.Timestamp(ts_str)
                else:
                    continue

                rows.append({
                    "timestamp": pd.Timestamp(ts.date(), tz="UTC"),
                    "open": prev_close,
                    "high": max(price, prev_close) + change * 0.3,
                    "low": min(price, prev_close) - change * 0.3,
                    "close": price,
                    "volume": 0.0,
                })

            # Small delay between batches to be polite
            if batch_start + batch_size < fetch_days:
                await asyncio.sleep(0.2)

            # Stop if we have enough data
            if len(rows) >= limit:
                break

        if not rows:
            logger.warning("no_data", symbol=symbol)
            return pd.DataFrame()

        df = (
            pd.DataFrame(rows)
            .drop_duplicates(subset="timestamp")
            .sort_values("timestamp")
            .tail(limit)
            .reset_index(drop=True)
        )
        logger.info("fetched", symbol=symbol, rows=len(df))
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

        if data and "price" in data:
            return {
                "symbol": symbol,
                "price": float(data["price"]),
                "bid": float(data.get("bid", data["price"])),
                "ask": float(data.get("ask", data["price"])),
                "spread": round(float(data.get("ask", 0)) - float(data.get("bid", 0)), 2),
                "open": float(data.get("open_price", data["price"])),
                "high": float(data.get("high_price", data["price"])),
                "low": float(data.get("low_price", data["price"])),
                "change": float(data.get("ch", 0)),
                "change_pct": float(data.get("chp", 0)),
                "timestamp": datetime.fromtimestamp(data["timestamp"], tz=timezone.utc).isoformat(),
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
                if data and "price" in data:
                    ts = datetime.fromtimestamp(data["timestamp"], tz=timezone.utc)
                    mid = float(data["price"])
                    candle = Candle(
                        timestamp=ts,
                        open=float(data.get("open_price", mid)),
                        high=float(data.get("high_price", mid)),
                        low=float(data.get("low_price", mid)),
                        close=mid,
                        volume=0,
                        spread=round(float(data.get("ask", 0)) - float(data.get("bid", 0)), 2),
                    )
                    await callback(candle)
            except Exception as e:
                logger.error("poll_error", symbol=symbol, error=str(e))

            await asyncio.sleep(30)
