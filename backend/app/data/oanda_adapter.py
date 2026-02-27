"""OANDA adapter — real-time forex & gold prices via OANDA v20 REST API."""

import json
from datetime import datetime, timezone

import httpx
import pandas as pd

from backend.app.config import get_settings
from backend.app.data.base import Candle, DataSourceAdapter, MarketType, OrderBook, OrderBookLevel
from backend.app.logging_config import get_logger

logger = get_logger("oanda")

# Use practice by default; switch to api-fxtrade.oanda.com for live
PRACTICE_URL = "https://api-fxpractice.oanda.com"
LIVE_URL = "https://api-fxtrade.oanda.com"
STREAM_PRACTICE = "https://stream-fxpractice.oanda.com"
STREAM_LIVE = "https://stream-fxtrade.oanda.com"

# Map our timeframes to OANDA granularities
OANDA_GRANULARITY = {
    "1m": "M1",
    "5m": "M5",
    "15m": "M15",
    "30m": "M30",
    "1h": "H1",
    "4h": "H4",
    "1d": "D",
    "1w": "W",
    "1M": "M",
}

# Map our symbol format to OANDA instrument format
SYMBOL_TO_OANDA = {
    "XAUUSD": "XAU_USD",
    "XAGUSD": "XAG_USD",
    "EURUSD": "EUR_USD",
    "GBPUSD": "GBP_USD",
    "USDJPY": "USD_JPY",
    "AUDUSD": "AUD_USD",
    "USDCAD": "USD_CAD",
    "NZDUSD": "NZD_USD",
    "USDCHF": "USD_CHF",
    "EURGBP": "EUR_GBP",
    "EURJPY": "EUR_JPY",
    "GBPJPY": "GBP_JPY",
}

SUPPORTED_SYMBOLS = set(SYMBOL_TO_OANDA.keys())


def _to_oanda_instrument(symbol: str) -> str:
    """Convert our symbol format to OANDA instrument format."""
    symbol = symbol.upper()
    if symbol in SYMBOL_TO_OANDA:
        return SYMBOL_TO_OANDA[symbol]
    # Generic: split 6-char pair into XXX_YYY
    if len(symbol) == 6 and symbol.isalpha():
        return f"{symbol[:3]}_{symbol[3:]}"
    return symbol


class OandaAdapter(DataSourceAdapter):
    """OANDA v20 REST API adapter for forex and gold."""

    def __init__(self):
        settings = get_settings()
        self._api_key = settings.oanda_api_key
        self._account_id = settings.oanda_account_id
        self._client: httpx.AsyncClient | None = None
        self._live_mode = False  # Start with practice, auto-detect

    @property
    def name(self) -> str:
        return "oanda"

    @property
    def market_type(self) -> MarketType:
        return MarketType.FOREX

    @property
    def _base_url(self) -> str:
        return LIVE_URL if self._live_mode else PRACTICE_URL

    @property
    def _stream_url(self) -> str:
        return STREAM_LIVE if self._live_mode else STREAM_PRACTICE

    def _headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
            "Accept-Datetime-Format": "RFC3339",
        }

    async def connect(self) -> None:
        """Initialize connection and auto-detect account ID."""
        self._client = httpx.AsyncClient(timeout=30.0, headers=self._headers())
        logger.info("connecting", adapter=self.name)

        if not self._api_key:
            logger.warning("no_api_key", adapter=self.name)
            return

        # Auto-detect: try practice first, then live
        for mode, url in [(False, PRACTICE_URL), (True, LIVE_URL)]:
            try:
                resp = await self._client.get(f"{url}/v3/accounts")
                if resp.status_code == 200:
                    data = resp.json()
                    accounts = data.get("accounts", [])
                    if accounts:
                        self._live_mode = mode
                        if not self._account_id:
                            self._account_id = accounts[0]["id"]
                            logger.info(
                                "account_auto_detected",
                                account_id=self._account_id,
                                mode="live" if mode else "practice",
                            )
                        else:
                            logger.info(
                                "connected",
                                account_id=self._account_id,
                                mode="live" if mode else "practice",
                            )
                        # Update client headers with correct base URL
                        await self._client.aclose()
                        self._client = httpx.AsyncClient(
                            timeout=30.0, headers=self._headers()
                        )
                        return
            except Exception as e:
                logger.debug("connect_attempt_failed", mode="live" if mode else "practice", error=str(e))
                continue

        logger.warning(
            "oanda_auth_failed",
            hint="API key may be invalid or expired. Generate a new key at https://www.oanda.com/demo-account/tpa/personal_token",
        )

    async def disconnect(self) -> None:
        if self._client:
            await self._client.aclose()
            self._client = None

    async def get_supported_symbols(self) -> list[str]:
        """Return supported forex/commodity symbols."""
        if not self._client:
            await self.connect()

        # Try to fetch from API, fallback to hardcoded
        if self._account_id:
            try:
                resp = await self._client.get(
                    f"{self._base_url}/v3/accounts/{self._account_id}/instruments",
                    params={"type": "CURRENCY"},
                )
                if resp.status_code == 200:
                    data = resp.json()
                    instruments = data.get("instruments", [])
                    return [
                        inst["name"].replace("_", "")
                        for inst in instruments
                    ]
            except Exception:
                pass

        return sorted(SUPPORTED_SYMBOLS)

    async def fetch_ohlcv(
        self,
        symbol: str,
        timeframe: str = "1h",
        limit: int = 500,
        since: datetime | None = None,
    ) -> pd.DataFrame:
        """
        Fetch historical OHLCV candles from OANDA.

        Returns DataFrame with columns: [timestamp, open, high, low, close, volume]
        """
        if not self._client:
            await self.connect()

        instrument = _to_oanda_instrument(symbol)
        granularity = OANDA_GRANULARITY.get(timeframe, "H1")

        all_rows: list[dict] = []
        remaining = limit

        # OANDA allows max 5000 candles per request
        while remaining > 0:
            batch_size = min(remaining, 5000)
            params: dict = {
                "granularity": granularity,
                "count": batch_size,
                "price": "MBA",  # mid, bid, ask
            }

            if since and not all_rows:
                params["from"] = since.strftime("%Y-%m-%dT%H:%M:%SZ")
                params.pop("count", None)
                params["count"] = batch_size

            if all_rows:
                # Paginate: fetch candles before the earliest one
                earliest = all_rows[0]["timestamp"]
                params["to"] = earliest.strftime("%Y-%m-%dT%H:%M:%SZ")

            url = f"{self._base_url}/v3/instruments/{instrument}/candles"

            try:
                resp = await self._client.get(url, params=params)
                if resp.status_code != 200:
                    error_body = resp.text
                    logger.warning(
                        "oanda_fetch_error",
                        status=resp.status_code,
                        body=error_body[:200],
                        symbol=symbol,
                    )
                    break

                data = resp.json()
            except Exception as e:
                logger.error("oanda_fetch_exception", symbol=symbol, error=str(e))
                break

            candles = data.get("candles", [])
            if not candles:
                break

            batch_rows = []
            for c in candles:
                if not c.get("complete", True):
                    continue
                mid = c.get("mid")
                if not mid:
                    continue

                # Parse RFC3339 timestamp
                ts_str = c["time"]
                ts = pd.Timestamp(ts_str)
                if ts.tzinfo is None:
                    ts = ts.tz_localize("UTC")

                row = {
                    "timestamp": ts,
                    "open": float(mid["o"]),
                    "high": float(mid["h"]),
                    "low": float(mid["l"]),
                    "close": float(mid["c"]),
                    "volume": float(c.get("volume", 0)),
                }

                # Capture spread if bid/ask available
                bid = c.get("bid")
                ask = c.get("ask")
                if bid and ask:
                    row["spread"] = round(float(ask["c"]) - float(bid["c"]), 5)

                batch_rows.append(row)

            if not batch_rows:
                break

            all_rows = batch_rows + all_rows
            remaining -= len(batch_rows)

            if len(candles) < batch_size:
                break  # No more data available

        if not all_rows:
            logger.warning("no_candles_returned", symbol=symbol, timeframe=timeframe)
            return pd.DataFrame()

        df = (
            pd.DataFrame(all_rows)
            .drop_duplicates(subset="timestamp")
            .sort_values("timestamp")
            .tail(limit)
            .reset_index(drop=True)
        )
        return df

    async def fetch_ticker(self, symbol: str) -> dict:
        """Fetch latest price for a symbol."""
        if not self._client:
            await self.connect()

        instrument = _to_oanda_instrument(symbol)

        # Get latest candle
        url = f"{self._base_url}/v3/instruments/{instrument}/candles"
        params = {
            "granularity": "S5",
            "count": 1,
            "price": "MBA",
        }

        try:
            resp = await self._client.get(url, params=params)
            if resp.status_code == 200:
                data = resp.json()
                candles = data.get("candles", [])
                if candles:
                    c = candles[-1]
                    mid = c.get("mid", {})
                    bid = c.get("bid", {})
                    ask = c.get("ask", {})
                    return {
                        "symbol": symbol.upper(),
                        "price": float(mid.get("c", 0)),
                        "bid": float(bid.get("c", 0)),
                        "ask": float(ask.get("c", 0)),
                        "spread": round(float(ask.get("c", 0)) - float(bid.get("c", 0)), 5),
                        "volume": float(c.get("volume", 0)),
                        "timestamp": c.get("time", ""),
                    }
        except Exception as e:
            logger.error("ticker_failed", symbol=symbol, error=str(e))

        return {"symbol": symbol.upper(), "price": 0, "error": "Failed to fetch ticker"}

    async def fetch_orderbook(self, symbol: str, depth: int = 20) -> OrderBook | None:
        """Fetch OANDA order book (shows % of traders at each price level)."""
        if not self._client or not self._account_id:
            await self.connect()

        instrument = _to_oanda_instrument(symbol)
        url = f"{self._base_url}/v3/instruments/{instrument}/orderBook"

        try:
            resp = await self._client.get(url)
            if resp.status_code != 200:
                return None

            data = resp.json()
            ob_data = data.get("orderBook", {})
            buckets = ob_data.get("buckets", [])
            price = float(ob_data.get("price", 0))

            # Split buckets into bids (below price) and asks (above price)
            bids = []
            asks = []
            for b in buckets:
                bp = float(b["price"])
                long_pct = float(b.get("longCountPercent", 0))
                short_pct = float(b.get("shortCountPercent", 0))

                if bp <= price:
                    bids.append(OrderBookLevel(
                        price=bp,
                        quantity=long_pct,  # % of traders with long orders at this level
                    ))
                else:
                    asks.append(OrderBookLevel(
                        price=bp,
                        quantity=short_pct,
                    ))

            # Sort: bids descending, asks ascending
            bids.sort(key=lambda x: x.price, reverse=True)
            asks.sort(key=lambda x: x.price)

            return OrderBook(
                symbol=symbol.upper(),
                timestamp=datetime.now(timezone.utc),
                bids=bids[:depth],
                asks=asks[:depth],
            )
        except Exception as e:
            logger.warning("orderbook_failed", symbol=symbol, error=str(e))
            return None

    async def stream_prices(self, symbol: str, callback) -> None:
        """
        Stream real-time prices via OANDA HTTP streaming API.

        OANDA uses HTTP chunked transfer encoding (not WebSocket).
        Each line is a JSON object: either a PRICE or HEARTBEAT event.
        """
        if not self._account_id:
            await self.connect()
            if not self._account_id:
                raise RuntimeError("OANDA account ID not available for streaming")

        instrument = _to_oanda_instrument(symbol)
        url = (
            f"{self._stream_url}/v3/accounts/{self._account_id}"
            f"/pricing/stream?instruments={instrument}"
        )

        logger.info("stream_connecting", symbol=symbol, url=url)

        while True:
            try:
                async with httpx.AsyncClient(
                    timeout=httpx.Timeout(connect=10.0, read=60.0, write=10.0, pool=10.0),
                    headers=self._headers(),
                ) as client:
                    async with client.stream("GET", url) as response:
                        if response.status_code != 200:
                            logger.error(
                                "stream_error",
                                status=response.status_code,
                            )
                            break

                        async for line in response.aiter_lines():
                            if not line.strip():
                                continue

                            try:
                                data = json.loads(line)
                            except json.JSONDecodeError:
                                continue

                            msg_type = data.get("type")

                            if msg_type == "HEARTBEAT":
                                continue

                            if msg_type == "PRICE":
                                bids = data.get("bids", [])
                                asks = data.get("asks", [])

                                if not bids or not asks:
                                    continue

                                bid = float(bids[0]["price"])
                                ask = float(asks[0]["price"])
                                mid = (bid + ask) / 2

                                ts_str = data.get("time", "")
                                ts = datetime.fromisoformat(
                                    ts_str.replace("Z", "+00:00")
                                ) if ts_str else datetime.now(timezone.utc)

                                candle = Candle(
                                    timestamp=ts,
                                    open=mid,
                                    high=mid,
                                    low=mid,
                                    close=mid,
                                    volume=0,
                                    spread=round(ask - bid, 5),
                                )
                                await callback(candle)

            except httpx.ReadTimeout:
                logger.warning("stream_timeout", symbol=symbol)
                continue
            except Exception as e:
                logger.error("stream_error", symbol=symbol, error=str(e))
                import asyncio
                await asyncio.sleep(5)
                continue
