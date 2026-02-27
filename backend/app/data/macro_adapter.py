"""Macro data adapter — Treasury yields, Fed rate, CPI, DXY via Alpha Vantage economic endpoints.

Uses file-based caching so data persists across backend restarts and loads instantly.
"""

import asyncio
import json
import os
from datetime import datetime, timezone
from pathlib import Path

import httpx

from backend.app.config import get_settings
from backend.app.logging_config import get_logger

logger = get_logger("macro_adapter")

BASE_URL = "https://www.alphavantage.co/query"
CACHE_DIR = Path(__file__).resolve().parent.parent.parent.parent / "data" / "cache"
MACRO_CACHE_FILE = CACHE_DIR / "macro_gold_summary.json"


class MacroAdapter:
    """Fetches macroeconomic data from Alpha Vantage's economic indicator endpoints."""

    def __init__(self):
        settings = get_settings()
        self._api_key = settings.alpha_vantage_api_key
        self._client: httpx.AsyncClient | None = None
        self._cache: dict[str, dict] = {}
        self._cache_ttl: dict[str, datetime] = {}
        self._refreshing = False
        CACHE_DIR.mkdir(parents=True, exist_ok=True)

    async def connect(self):
        self._client = httpx.AsyncClient(timeout=30.0)

    async def disconnect(self):
        if self._client:
            await self._client.aclose()
            self._client = None

    def _is_cached(self, key: str, max_age_hours: int = 6) -> bool:
        if key in self._cache_ttl:
            age = (datetime.now(timezone.utc) - self._cache_ttl[key]).total_seconds() / 3600
            return age < max_age_hours
        return False

    def _load_file_cache(self) -> dict | None:
        """Load cached macro summary from disk."""
        try:
            if MACRO_CACHE_FILE.exists():
                data = json.loads(MACRO_CACHE_FILE.read_text())
                cached_at = datetime.fromisoformat(data.get("_cached_at", "2000-01-01"))
                age_hours = (datetime.now(timezone.utc) - cached_at).total_seconds() / 3600
                logger.info(f"File cache found, age: {age_hours:.1f}h")
                # Return data regardless of age — stale data is better than no data
                summary = {k: v for k, v in data.items() if not k.startswith("_")}
                return summary
        except Exception as e:
            logger.warning(f"Failed to load file cache: {e}")
        return None

    def _save_file_cache(self, summary: dict):
        """Save macro summary to disk."""
        try:
            data = {**summary, "_cached_at": datetime.now(timezone.utc).isoformat()}
            MACRO_CACHE_FILE.write_text(json.dumps(data, indent=2))
            logger.info("Macro summary saved to file cache")
        except Exception as e:
            logger.warning(f"Failed to save file cache: {e}")

    async def _request(self, params: dict) -> dict:
        if not self._client:
            await self.connect()
        params["apikey"] = self._api_key
        resp = await self._client.get(BASE_URL, params=params)
        resp.raise_for_status()
        data = resp.json()
        if "Error Message" in data:
            raise ValueError(f"Alpha Vantage error: {data['Error Message']}")
        return data

    async def get_treasury_yield(self, maturity: str = "10year", interval: str = "daily") -> list[dict]:
        """Fetch US Treasury yield. Maturity: 3month, 2year, 5year, 7year, 10year, 30year."""
        cache_key = f"treasury_{maturity}"
        if self._is_cached(cache_key):
            return self._cache[cache_key]

        data = await self._request({
            "function": "TREASURY_YIELD",
            "interval": interval,
            "maturity": maturity,
        })
        result = []
        for item in data.get("data", [])[:365]:
            if item["value"] != ".":
                result.append({
                    "date": item["date"],
                    "value": float(item["value"]),
                })
        self._cache[cache_key] = result
        self._cache_ttl[cache_key] = datetime.now(timezone.utc)
        return result

    async def get_federal_funds_rate(self, interval: str = "daily") -> list[dict]:
        """Fetch effective federal funds rate."""
        cache_key = "fed_rate"
        if self._is_cached(cache_key):
            return self._cache[cache_key]

        data = await self._request({
            "function": "FEDERAL_FUNDS_RATE",
            "interval": interval,
        })
        result = []
        for item in data.get("data", [])[:365]:
            if item["value"] != ".":
                result.append({
                    "date": item["date"],
                    "value": float(item["value"]),
                })
        self._cache[cache_key] = result
        self._cache_ttl[cache_key] = datetime.now(timezone.utc)
        return result

    async def get_cpi(self, interval: str = "monthly") -> list[dict]:
        """Fetch Consumer Price Index."""
        cache_key = "cpi"
        if self._is_cached(cache_key, max_age_hours=24):
            return self._cache[cache_key]

        data = await self._request({
            "function": "CPI",
            "interval": interval,
        })
        result = []
        for item in data.get("data", [])[:60]:
            if item["value"] != ".":
                result.append({
                    "date": item["date"],
                    "value": float(item["value"]),
                })
        self._cache[cache_key] = result
        self._cache_ttl[cache_key] = datetime.now(timezone.utc)
        return result

    async def get_inflation(self) -> list[dict]:
        """Fetch annual inflation rate."""
        cache_key = "inflation"
        if self._is_cached(cache_key, max_age_hours=24):
            return self._cache[cache_key]

        data = await self._request({
            "function": "INFLATION",
        })
        result = []
        for item in data.get("data", [])[:20]:
            if item["value"] != ".":
                result.append({
                    "date": item["date"],
                    "value": float(item["value"]),
                })
        self._cache[cache_key] = result
        self._cache_ttl[cache_key] = datetime.now(timezone.utc)
        return result

    async def get_real_gdp(self, interval: str = "quarterly") -> list[dict]:
        """Fetch Real GDP."""
        cache_key = "real_gdp"
        if self._is_cached(cache_key, max_age_hours=24):
            return self._cache[cache_key]

        data = await self._request({
            "function": "REAL_GDP",
            "interval": interval,
        })
        result = []
        for item in data.get("data", [])[:20]:
            if item["value"] != ".":
                result.append({
                    "date": item["date"],
                    "value": float(item["value"]),
                })
        self._cache[cache_key] = result
        self._cache_ttl[cache_key] = datetime.now(timezone.utc)
        return result

    async def _fetch_fresh_summary(self) -> dict:
        """Fetch all macro data from Alpha Vantage (slow, ~65s due to rate limits)."""
        # Fetch all data with delays to respect Alpha Vantage rate limit (5/min)
        yields_10y = await self.get_treasury_yield("10year")
        await asyncio.sleep(13)
        yields_2y = await self.get_treasury_yield("2year")
        await asyncio.sleep(13)
        fed_rate = await self.get_federal_funds_rate()
        await asyncio.sleep(13)
        cpi = await self.get_cpi()
        await asyncio.sleep(13)
        inflation = await self.get_inflation()

        summary = {}

        # 10Y Treasury Yield
        if yields_10y:
            current = yields_10y[0]["value"]
            prev = yields_10y[min(5, len(yields_10y) - 1)]["value"] if len(yields_10y) > 5 else current
            change = current - prev
            summary["treasury_10y"] = {
                "value": current,
                "change_1w": round(change, 3),
                "trend": "falling" if change < -0.05 else "rising" if change > 0.05 else "stable",
                "gold_signal": "bullish" if change < -0.05 else "bearish" if change > 0.05 else "neutral",
                "explanation": f"10Y Yield at {current}% ({'falling' if change < 0 else 'rising'} {abs(change):.2f}pp). "
                             + ("Falling yields = gold bullish (lower opportunity cost)." if change < -0.05
                                else "Rising yields = gold bearish (higher opportunity cost)." if change > 0.05
                                else "Yields stable — neutral for gold."),
            }

        # 2Y-10Y Spread (yield curve)
        if yields_10y and yields_2y:
            spread = yields_10y[0]["value"] - yields_2y[0]["value"]
            summary["yield_curve"] = {
                "value": round(spread, 3),
                "spread_2y_10y": round(spread, 3),
                "inverted": spread < 0,
                "gold_signal": "bullish" if spread < 0 else "neutral",
                "explanation": f"2Y-10Y spread: {spread:.3f}%. "
                             + ("Inverted yield curve = recession risk = gold bullish." if spread < 0
                                else "Normal curve — neutral for gold."),
            }

        # Federal Funds Rate
        if fed_rate:
            current = fed_rate[0]["value"]
            prev_month = fed_rate[min(22, len(fed_rate) - 1)]["value"] if len(fed_rate) > 22 else current
            change = current - prev_month
            summary["fed_rate"] = {
                "value": current,
                "change_1m": round(change, 3),
                "gold_signal": "bullish" if change < 0 else "bearish" if change > 0 else "neutral",
                "explanation": f"Fed Funds Rate at {current}%. "
                             + ("Rate cuts = gold bullish (lower yields ahead)." if change < 0
                                else "Rate hikes = gold bearish (higher yields ahead)." if change > 0
                                else "Rate unchanged."),
            }

        # CPI / Inflation
        if cpi and len(cpi) >= 2:
            current_cpi = cpi[0]["value"]
            prev_cpi = cpi[1]["value"]
            yoy_cpi_change = ((current_cpi - prev_cpi) / prev_cpi) * 100
            summary["cpi"] = {
                "value": current_cpi,
                "mom_change_pct": round(yoy_cpi_change, 2),
                "gold_signal": "bullish" if yoy_cpi_change > 0.3 else "neutral",
                "explanation": f"CPI at {current_cpi} (MoM: {yoy_cpi_change:+.2f}%). "
                             + ("Rising CPI = inflation hedge demand for gold." if yoy_cpi_change > 0.3
                                else "CPI contained — neutral for gold."),
            }

        if inflation:
            summary["inflation"] = {
                "value": inflation[0]["value"],
                "date": inflation[0]["date"],
                "gold_signal": "bullish" if inflation[0]["value"] > 3.0 else "neutral",
                "explanation": f"Annual inflation: {inflation[0]['value']}%. "
                             + ("Above 3% = strong gold tailwind." if inflation[0]["value"] > 3.0
                                else "Moderate inflation — neutral for gold."),
            }

        # Overall macro score for gold
        signals = [v.get("gold_signal") for v in summary.values() if "gold_signal" in v]
        bull = signals.count("bullish")
        bear = signals.count("bearish")
        total = len(signals)
        score = round(((bull + (total - bull - bear) * 0.5) / max(total, 1)) * 100)

        summary["macro_score"] = {
            "score": score,
            "bullish_count": bull,
            "bearish_count": bear,
            "neutral_count": total - bull - bear,
            "total": total,
            "direction": "bullish" if score >= 65 else "bearish" if score <= 35 else "neutral",
        }

        return summary

    async def get_gold_macro_summary(self) -> dict:
        """
        Get a comprehensive macro summary relevant to gold analysis.
        Returns cached data immediately if available, refreshes in background if stale.
        """
        # Check in-memory cache first (fastest)
        if self._is_cached("gold_summary"):
            return self._cache["gold_summary"]

        # Check file cache (survives restarts)
        file_data = self._load_file_cache()
        if file_data and len(file_data) > 1:
            # Store in memory cache
            self._cache["gold_summary"] = file_data
            self._cache_ttl["gold_summary"] = datetime.now(timezone.utc)

            # Check if file cache is stale (>6h) — refresh in background
            try:
                raw = json.loads(MACRO_CACHE_FILE.read_text())
                cached_at = datetime.fromisoformat(raw.get("_cached_at", "2000-01-01"))
                age_hours = (datetime.now(timezone.utc) - cached_at).total_seconds() / 3600
                if age_hours > 6 and not self._refreshing:
                    logger.info("File cache stale, scheduling background refresh")
                    asyncio.create_task(self._background_refresh())
            except Exception:
                pass

            return file_data

        # No cache at all — must fetch (slow, ~65s)
        logger.info("No cache available, fetching fresh macro data...")
        summary = await self._fetch_fresh_summary()
        self._cache["gold_summary"] = summary
        self._cache_ttl["gold_summary"] = datetime.now(timezone.utc)
        self._save_file_cache(summary)
        return summary

    async def _background_refresh(self):
        """Refresh macro data in the background without blocking the response."""
        if self._refreshing:
            return
        self._refreshing = True
        try:
            logger.info("Background refresh started")
            summary = await self._fetch_fresh_summary()
            self._cache["gold_summary"] = summary
            self._cache_ttl["gold_summary"] = datetime.now(timezone.utc)
            self._save_file_cache(summary)
            logger.info("Background refresh complete")
        except Exception as e:
            logger.error(f"Background refresh failed: {e}")
        finally:
            self._refreshing = False


# Singleton
macro_adapter = MacroAdapter()
