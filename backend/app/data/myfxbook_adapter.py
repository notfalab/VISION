"""MyFxBook adapter — real forex positioning data from verified trader accounts.

MyFxBook Community Outlook provides:
- % of traders long/short per pair
- Long/short volume
- Number of long/short positions
- Average entry prices for longs and shorts

This is REAL aggregated data from thousands of verified trading accounts.
We convert it into OrderBook format for consistency with other adapters.
"""

import time
from datetime import datetime, timezone

import httpx
import pandas as pd

from backend.app.config import get_settings
from backend.app.data.base import DataSourceAdapter, MarketType, OrderBook, OrderBookLevel
from backend.app.logging_config import get_logger

logger = get_logger("myfxbook")

API_BASE = "https://www.myfxbook.com/api"

# Map our symbols to MyFxBook format
SYMBOL_MAP = {
    "EURUSD": "EURUSD",
    "GBPUSD": "GBPUSD",
    "USDJPY": "USDJPY",
    "AUDUSD": "AUDUSD",
    "USDCAD": "USDCAD",
    "NZDUSD": "NZDUSD",
    "USDCHF": "USDCHF",
    "EURGBP": "EURGBP",
    "EURJPY": "EURJPY",
    "GBPJPY": "GBPJPY",
    "XAUUSD": "XAUUSD",
    "XAGUSD": "XAGUSD",
}

SUPPORTED_SYMBOLS = set(SYMBOL_MAP.keys())

# Typical pip sizes for generating price levels
PIP_SIZE = {
    "EURUSD": 0.0001, "GBPUSD": 0.0001, "AUDUSD": 0.0001,
    "NZDUSD": 0.0001, "USDCAD": 0.0001, "USDCHF": 0.0001,
    "EURGBP": 0.0001, "USDJPY": 0.01, "EURJPY": 0.01, "GBPJPY": 0.01,
    "XAUUSD": 0.10, "XAGUSD": 0.01,
}


class MyFxBookAdapter(DataSourceAdapter):
    """MyFxBook Community Outlook — real retail forex positioning data.

    Provides orderbook-like data derived from real trader positions.
    Data is aggregated from thousands of verified trading accounts.
    """

    def __init__(self):
        settings = get_settings()
        self._email = settings.myfxbook_email
        self._password = settings.myfxbook_password
        self._client: httpx.AsyncClient | None = None
        self._session_id: str | None = None
        self._session_time: float = 0
        # Cache outlook data (update every 15 min, API limit: 100 req/day)
        self._outlook_cache: dict | None = None
        self._cache_time: float = 0
        self._CACHE_TTL = 900  # 15 minutes

    @property
    def name(self) -> str:
        return "myfxbook"

    @property
    def market_type(self) -> MarketType:
        return MarketType.FOREX

    async def connect(self) -> None:
        self._client = httpx.AsyncClient(timeout=30.0)
        if not self._email or not self._password:
            logger.warning("myfxbook_no_credentials",
                           hint="Set MYFXBOOK_EMAIL and MYFXBOOK_PASSWORD in .env")
            return

        # Reuse session if still valid (sessions last ~1 month)
        if self._session_id and (time.time() - self._session_time < 86400 * 7):
            logger.info("myfxbook_session_reused")
            return

        try:
            resp = await self._client.get(
                f"{API_BASE}/login.json",
                params={"email": self._email, "password": self._password},
            )
            data = resp.json()
            if not data.get("error", True):
                self._session_id = data["session"]
                self._session_time = time.time()
                logger.info("myfxbook_connected", session=self._session_id[:8] + "...")
            else:
                logger.error("myfxbook_login_failed", msg=data.get("message", ""))
        except Exception as e:
            logger.error("myfxbook_connect_error", error=str(e))

    async def disconnect(self) -> None:
        if self._client:
            if self._session_id:
                try:
                    await self._client.get(
                        f"{API_BASE}/logout.json",
                        params={"session": self._session_id},
                    )
                except Exception:
                    pass
            await self._client.aclose()
            self._client = None

    async def get_supported_symbols(self) -> list[str]:
        return sorted(SUPPORTED_SYMBOLS)

    async def _fetch_outlook(self) -> dict | None:
        """Fetch community outlook data with caching."""
        now = time.time()
        if self._outlook_cache and (now - self._cache_time < self._CACHE_TTL):
            return self._outlook_cache

        if not self._session_id:
            await self.connect()
        if not self._session_id:
            return None

        try:
            resp = await self._client.get(
                f"{API_BASE}/get-community-outlook.json",
                params={"session": self._session_id},
            )
            data = resp.json()
            if data.get("error"):
                # Session might be expired — re-login
                logger.warning("myfxbook_outlook_error", msg=data.get("message", ""))
                self._session_id = None
                await self.connect()
                if not self._session_id:
                    return None
                resp = await self._client.get(
                    f"{API_BASE}/get-community-outlook.json",
                    params={"session": self._session_id},
                )
                data = resp.json()
                if data.get("error"):
                    return None

            # Index by symbol name for quick lookup
            symbols = data.get("symbols", [])
            indexed = {}
            for s in symbols:
                name = s.get("name", "").upper().replace("/", "")
                if name:
                    indexed[name] = s

            self._outlook_cache = indexed
            self._cache_time = now
            logger.info("myfxbook_outlook_cached", symbols=len(indexed))
            return indexed
        except Exception as e:
            logger.error("myfxbook_outlook_fetch_error", error=str(e))
            return None

    async def fetch_ohlcv(
        self, symbol: str, timeframe: str = "1h", limit: int = 500,
        since: datetime | None = None,
    ) -> pd.DataFrame:
        """MyFxBook doesn't provide OHLCV — return empty."""
        return pd.DataFrame()

    async def fetch_orderbook(self, symbol: str, depth: int = 20) -> OrderBook | None:
        """Convert MyFxBook community outlook into OrderBook format.

        Uses real positioning data:
        - avgLongPrice / avgShortPrice = center of bid/ask clusters
        - longVolume / shortVolume = total volume on each side
        - longPositions / shortPositions = number of orders

        We generate price levels around the average entry prices,
        distributing the real volume with a realistic bell curve.
        """
        symbol = symbol.upper()
        mfx_symbol = SYMBOL_MAP.get(symbol)
        if not mfx_symbol:
            return None

        outlook = await self._fetch_outlook()
        if not outlook:
            return None

        data = outlook.get(mfx_symbol)
        if not data:
            return None

        long_pct = float(data.get("longPercentage", 0))
        short_pct = float(data.get("shortPercentage", 0))
        long_vol = float(data.get("longVolume", 0))
        short_vol = float(data.get("shortVolume", 0))
        long_positions = int(data.get("longPositions", 0))
        short_positions = int(data.get("shortPositions", 0))
        avg_long = float(data.get("avgLongPrice", 0))
        avg_short = float(data.get("avgShortPrice", 0))

        if avg_long <= 0 or avg_short <= 0:
            return None

        # Determine pip size for this pair
        pip = PIP_SIZE.get(symbol, 0.0001)
        # Spread levels: ~50 pips wide on each side of the average price
        spread_pips = min(depth, 50)

        # Scale factor: convert lots to meaningful "quantity" units
        # MyFxBook volumes are in standard lots, multiply for visible depth
        SCALE = 100.0

        # Generate bid levels (buy orders below market, around avg_long)
        bids = []
        for i in range(depth):
            offset = i * pip * 2  # 2 pips between each level
            price = round(avg_long - offset, 5)
            # Bell curve: more volume near avg price, less at extremes
            distance_factor = max(0.05, 1.0 - (i / depth) ** 0.5)
            qty = round((long_vol / depth) * distance_factor * SCALE, 2)
            if qty > 0:
                bids.append(OrderBookLevel(
                    price=price,
                    quantity=qty,
                    orders_count=max(1, int(long_positions * distance_factor / depth)),
                ))

        # Generate ask levels (sell orders above market, around avg_short)
        asks = []
        for i in range(depth):
            offset = i * pip * 2
            price = round(avg_short + offset, 5)
            distance_factor = max(0.05, 1.0 - (i / depth) ** 0.5)
            qty = round((short_vol / depth) * distance_factor * SCALE, 2)
            if qty > 0:
                asks.append(OrderBookLevel(
                    price=price,
                    quantity=qty,
                    orders_count=max(1, int(short_positions * distance_factor / depth)),
                ))

        if not bids or not asks:
            return None

        return OrderBook(
            symbol=symbol,
            timestamp=datetime.now(timezone.utc),
            bids=bids,
            asks=asks,
        )

    async def fetch_ticker(self, symbol: str) -> dict:
        """Get basic price info from outlook data."""
        outlook = await self._fetch_outlook()
        if not outlook:
            return {"symbol": symbol.upper(), "price": 0}

        data = outlook.get(symbol.upper(), {})
        avg_long = float(data.get("avgLongPrice", 0))
        avg_short = float(data.get("avgShortPrice", 0))
        mid = (avg_long + avg_short) / 2 if avg_long > 0 and avg_short > 0 else 0

        return {
            "symbol": symbol.upper(),
            "price": mid,
            "long_pct": float(data.get("longPercentage", 0)),
            "short_pct": float(data.get("shortPercentage", 0)),
            "long_volume": float(data.get("longVolume", 0)),
            "short_volume": float(data.get("shortVolume", 0)),
        }
