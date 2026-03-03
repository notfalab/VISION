"""
CoinGlass + Binance Futures adapter — liquidation heatmap data for crypto.

Primary: CoinGlass API (free tier) for accurate liquidation map data.
Fallback: Binance Futures API for open interest + funding rate → DIY liquidation estimation.

This is NOT a DataSourceAdapter (no OHLCV). It's a standalone async client
called directly from API endpoints, similar to cot_adapter.py.
"""

import math
from datetime import datetime, timezone

import httpx

from backend.app.config import get_settings
from backend.app.data.base import LiquidationLevel, LiquidationMap
from backend.app.logging_config import get_logger

logger = get_logger("coinglass")

COINGLASS_BASE = "https://open-api.coinglass.com/public/v2"
BINANCE_FUTURES_BASE = "https://fapi.binance.com"

# Map our symbols to CoinGlass / Binance Futures format
SYMBOL_MAP = {
    "BTCUSD": ("BTC", "BTCUSDT"),
    "ETHUSD": ("ETH", "ETHUSDT"),
    "SOLUSD": ("SOL", "SOLUSDT"),
    "XRPUSD": ("XRP", "XRPUSDT"),
}

# Common leverage tiers for liquidation estimation
LEVERAGE_TIERS = [2, 3, 5, 10, 25, 50, 100]


class CoinglassAdapter:
    """Fetch liquidation data from CoinGlass with Binance Futures fallback."""

    def __init__(self):
        self._client: httpx.AsyncClient | None = None

    async def connect(self) -> None:
        self._client = httpx.AsyncClient(timeout=20.0)

    async def disconnect(self) -> None:
        if self._client:
            await self._client.aclose()
            self._client = None

    async def fetch_liquidation_map(self, symbol: str) -> LiquidationMap | None:
        """
        Get liquidation map data. Tries CoinGlass first, falls back to
        Binance Futures OI-based estimation.
        """
        if symbol.upper() not in SYMBOL_MAP:
            return None

        # Try CoinGlass first
        result = await self._fetch_coinglass_liquidation(symbol)
        if result:
            return result

        # Fallback: estimate from Binance Futures
        logger.info("coinglass_fallback_to_binance", symbol=symbol)
        return await self._estimate_from_binance(symbol)

    async def _fetch_coinglass_liquidation(self, symbol: str) -> LiquidationMap | None:
        """Fetch liquidation map from CoinGlass API."""
        settings = get_settings()
        if not settings.coinglass_api_key:
            logger.debug("coinglass_no_key")
            return None

        cg_symbol, _ = SYMBOL_MAP[symbol.upper()]
        if not self._client:
            await self.connect()

        try:
            resp = await self._client.get(
                f"{COINGLASS_BASE}/futures/liquidation_map",
                params={"symbol": cg_symbol, "interval": "1h"},
                headers={"coinglassSecret": settings.coinglass_api_key},
            )

            if resp.status_code != 200:
                logger.warning("coinglass_http_error", status=resp.status_code)
                return None

            data = resp.json()
            if data.get("code") != "0" or not data.get("data"):
                logger.warning("coinglass_api_error", msg=data.get("msg", ""))
                return None

            # Parse CoinGlass response into our LiquidationMap format
            raw = data["data"]
            levels = []
            current_price = float(raw.get("currentPrice", 0))

            # CoinGlass returns price levels with long/short liquidation volumes
            for item in raw.get("dataMap", {}).get("list", []):
                price = float(item.get("price", 0))
                long_vol = float(item.get("longVolUsd", 0))
                short_vol = float(item.get("shortVolUsd", 0))
                if price > 0 and (long_vol > 0 or short_vol > 0):
                    levels.append(LiquidationLevel(
                        price=price,
                        long_liq_usd=long_vol,
                        short_liq_usd=short_vol,
                    ))

            if levels:
                logger.info("coinglass_fetched", symbol=symbol, levels=len(levels))
                return LiquidationMap(
                    symbol=symbol.upper(),
                    timestamp=datetime.now(timezone.utc),
                    levels=sorted(levels, key=lambda l: l.price),
                    current_price=current_price,
                )

        except Exception as e:
            logger.warning("coinglass_fetch_failed", error=str(e))

        return None

    async def _estimate_from_binance(self, symbol: str) -> LiquidationMap | None:
        """
        Estimate liquidation levels from Binance Futures open interest
        and funding rate data.

        Algorithm:
        1. Get current price from mark price
        2. Get open interest (total notional)
        3. Get funding rate (indicates long/short bias)
        4. For each leverage tier (2x, 5x, 10x, 25x, 50x, 100x):
           - Calculate liquidation prices for longs: price * (1 - 1/leverage)
           - Calculate liquidation prices for shorts: price * (1 + 1/leverage)
        5. Distribute OI across leverage tiers (weighted by common usage)
        """
        _, binance_symbol = SYMBOL_MAP.get(symbol.upper(), (None, None))
        if not binance_symbol:
            return None

        if not self._client:
            await self.connect()

        try:
            # Fetch mark price, OI, and funding rate in parallel
            mark_resp, oi_resp, fr_resp = await _gather_binance(
                self._client, binance_symbol
            )

            current_price = float(mark_resp.get("markPrice", 0))
            total_oi_usd = float(oi_resp.get("openInterest", 0)) * current_price
            funding_rate = float(fr_resp.get("lastFundingRate", 0)) if fr_resp else 0

            if current_price <= 0 or total_oi_usd <= 0:
                return None

            # Funding rate > 0 = more longs than shorts (longs pay shorts)
            # Funding rate < 0 = more shorts than longs
            long_ratio = 0.5 + min(funding_rate * 100, 0.3)  # Clamp 0.2-0.8
            long_ratio = max(0.2, min(0.8, long_ratio))
            short_ratio = 1 - long_ratio

            long_oi = total_oi_usd * long_ratio
            short_oi = total_oi_usd * short_ratio

            # Leverage distribution weights (estimated from market research)
            # Most traders use lower leverage; fewer use extreme leverage
            leverage_weights = {
                2: 0.05, 3: 0.08, 5: 0.20, 10: 0.30,
                25: 0.20, 50: 0.12, 100: 0.05,
            }

            levels = []
            for lev, weight in leverage_weights.items():
                # Long liquidation: below current price
                long_liq_price = current_price * (1 - 1 / lev)
                # Short liquidation: above current price
                short_liq_price = current_price * (1 + 1 / lev)

                long_vol_at_level = long_oi * weight
                short_vol_at_level = short_oi * weight

                levels.append(LiquidationLevel(
                    price=round(long_liq_price, 2),
                    long_liq_usd=round(long_vol_at_level, 2),
                    short_liq_usd=0,
                ))
                levels.append(LiquidationLevel(
                    price=round(short_liq_price, 2),
                    long_liq_usd=0,
                    short_liq_usd=round(short_vol_at_level, 2),
                ))

            logger.info("binance_liq_estimated", symbol=symbol, levels=len(levels),
                        oi_usd=round(total_oi_usd), funding=round(funding_rate, 6))

            return LiquidationMap(
                symbol=symbol.upper(),
                timestamp=datetime.now(timezone.utc),
                levels=sorted(levels, key=lambda l: l.price),
                current_price=current_price,
            )

        except Exception as e:
            logger.warning("binance_liq_estimation_failed", error=str(e))
            return None

    async def fetch_open_interest(self, symbol: str) -> dict | None:
        """Fetch Binance Futures open interest."""
        _, binance_symbol = SYMBOL_MAP.get(symbol.upper(), (None, None))
        if not binance_symbol or not self._client:
            return None

        try:
            resp = await self._client.get(
                f"{BINANCE_FUTURES_BASE}/fapi/v1/openInterest",
                params={"symbol": binance_symbol},
            )
            if resp.status_code == 200:
                return resp.json()
        except Exception as e:
            logger.warning("binance_oi_failed", error=str(e))
        return None

    async def fetch_funding_rate(self, symbol: str) -> dict | None:
        """Fetch latest Binance Futures funding rate."""
        _, binance_symbol = SYMBOL_MAP.get(symbol.upper(), (None, None))
        if not binance_symbol or not self._client:
            return None

        try:
            resp = await self._client.get(
                f"{BINANCE_FUTURES_BASE}/fapi/v1/premiumIndex",
                params={"symbol": binance_symbol},
            )
            if resp.status_code == 200:
                return resp.json()
        except Exception as e:
            logger.warning("binance_fr_failed", error=str(e))
        return None


async def _gather_binance(client: httpx.AsyncClient, symbol: str) -> tuple[dict, dict, dict]:
    """Fetch mark price, open interest, and funding rate from Binance Futures."""
    import asyncio

    async def _get(path: str, params: dict) -> dict:
        try:
            resp = await client.get(f"{BINANCE_FUTURES_BASE}{path}", params=params)
            return resp.json() if resp.status_code == 200 else {}
        except Exception:
            return {}

    mark, oi, fr = await asyncio.gather(
        _get("/fapi/v1/premiumIndex", {"symbol": symbol}),
        _get("/fapi/v1/openInterest", {"symbol": symbol}),
        _get("/fapi/v1/fundingRate", {"symbol": symbol, "limit": 1}),
    )

    # Funding rate returns a list
    if isinstance(fr, list) and fr:
        fr = fr[0]
    elif isinstance(fr, list):
        fr = {}

    return mark, oi, fr
