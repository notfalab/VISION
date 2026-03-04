"""Economic Calendar adapter — Forex Factory XML feed parser with in-memory cache.

Fetches weekly economic events from the free Forex Factory XML feed,
parses them into structured data, and caches for 30 minutes.
"""

import time
import xml.etree.ElementTree as ET
from datetime import datetime, timezone, timedelta

import httpx

from backend.app.logging_config import get_logger

logger = get_logger("calendar_adapter")

FF_URL = "https://nfs.faireconomy.media/ff_calendar_thisweek.xml"

# Which symbols are affected by each currency
CURRENCY_AFFECTS: dict[str, list[str]] = {
    "USD": ["EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "NZDUSD", "USDCHF",
            "XAUUSD", "BTCUSD", "ETHUSD", "SOLUSD", "XRPUSD",
            "EURJPY", "GBPJPY", "AUDJPY", "NZDJPY", "CADJPY", "CHFJPY"],
    "EUR": ["EURUSD", "EURGBP", "EURJPY", "EURCHF", "EURAUD", "EURCAD", "EURNZD"],
    "GBP": ["GBPUSD", "EURGBP", "GBPJPY", "GBPAUD", "GBPCAD", "GBPCHF", "GBPNZD"],
    "JPY": ["USDJPY", "EURJPY", "GBPJPY", "AUDJPY", "NZDJPY", "CADJPY", "CHFJPY"],
    "AUD": ["AUDUSD", "AUDNZD", "AUDCAD", "AUDJPY", "GBPAUD", "EURAUD", "AUDCHF"],
    "CAD": ["USDCAD", "AUDCAD", "GBPCAD", "EURCAD", "NZDCAD", "CADCHF", "CADJPY"],
    "NZD": ["NZDUSD", "AUDNZD", "NZDJPY", "NZDCAD", "EURNZD", "GBPNZD", "NZDCHF"],
    "CHF": ["USDCHF", "EURCHF", "GBPCHF", "AUDCHF", "NZDCHF", "CADCHF", "CHFJPY"],
    "CNY": ["BTCUSD", "XAUUSD"],
}

# High-impact event keywords for classification
HIGH_IMPACT_KEYWORDS = [
    "Non-Farm", "NFP", "CPI", "FOMC", "Interest Rate", "GDP",
    "Employment Change", "Unemployment Rate", "Retail Sales",
    "PMI", "BOE", "ECB", "BOJ", "RBA", "RBNZ", "BOC", "SNB",
    "Inflation Rate", "Trade Balance", "Central Bank",
]


class CalendarAdapter:
    """Fetches & caches economic calendar from Forex Factory XML feed."""

    def __init__(self):
        self._cache: list[dict] | None = None
        self._cache_time: float = 0
        self._CACHE_TTL = 1800  # 30 min
        self._client: httpx.AsyncClient | None = None

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                timeout=20.0,
                headers={"User-Agent": "VISION-Trading/1.0"},
            )
        return self._client

    async def fetch_events(self) -> list[dict]:
        """Return parsed economic events, using cache if fresh."""
        now = time.time()
        if self._cache is not None and (now - self._cache_time) < self._CACHE_TTL:
            return self._cache

        try:
            client = await self._get_client()
            resp = await client.get(FF_URL)
            resp.raise_for_status()
            events = self._parse_ff_xml(resp.text)
            self._cache = events
            self._cache_time = now
            logger.info(f"Calendar: fetched {len(events)} events from Forex Factory")
            return events
        except Exception as e:
            logger.error(f"Calendar fetch failed: {e}")
            # Return stale cache if available
            if self._cache is not None:
                return self._cache
            return []

    def _parse_ff_xml(self, xml_text: str) -> list[dict]:
        """Parse Forex Factory XML into structured event dicts."""
        events: list[dict] = []
        try:
            root = ET.fromstring(xml_text)
        except ET.ParseError as e:
            logger.error(f"XML parse error: {e}")
            return []

        for event_el in root.findall(".//event"):
            try:
                title = (event_el.findtext("title") or "").strip()
                country = (event_el.findtext("country") or "").strip().upper()
                date_str = (event_el.findtext("date") or "").strip()
                time_str = (event_el.findtext("time") or "").strip()
                impact = (event_el.findtext("impact") or "Low").strip()
                forecast = (event_el.findtext("forecast") or "").strip()
                previous = (event_el.findtext("previous") or "").strip()

                if not title or not date_str:
                    continue

                # Parse date: "MM-DD-YYYY" format from FF
                dt = self._parse_datetime(date_str, time_str)
                if dt is None:
                    continue

                # Normalize impact
                impact_lower = impact.lower()
                if impact_lower in ("high", "holiday"):
                    impact_norm = "high"
                elif impact_lower == "medium":
                    impact_norm = "medium"
                else:
                    impact_norm = "low"

                # Check for high-impact keywords
                if impact_norm != "high":
                    for kw in HIGH_IMPACT_KEYWORDS:
                        if kw.lower() in title.lower():
                            impact_norm = "high" if impact_norm == "medium" else impact_norm
                            break

                # Build ID from title + date
                event_id = f"{title.replace(' ', '_').lower()[:30]}_{dt.strftime('%Y%m%d')}"

                # Determine affected symbols
                affects = CURRENCY_AFFECTS.get(country, [])

                events.append({
                    "id": event_id,
                    "title": title,
                    "country": country,
                    "datetime": dt.isoformat(),
                    "impact": impact_norm,
                    "forecast": forecast or None,
                    "previous": previous or None,
                    "affects": affects,
                })
            except Exception as e:
                logger.debug(f"Skipping event: {e}")
                continue

        # Sort by datetime ascending
        events.sort(key=lambda e: e["datetime"])
        return events

    def _parse_datetime(self, date_str: str, time_str: str) -> datetime | None:
        """Parse FF date + time into UTC datetime."""
        try:
            # FF dates: "03-07-2026", times: "8:30am" or "Tentative" or "All Day"
            parts = date_str.split("-")
            if len(parts) != 3:
                return None

            month, day, year = int(parts[0]), int(parts[1]), int(parts[2])

            # Parse time
            hour, minute = 0, 0
            if time_str and time_str not in ("", "Tentative", "All Day"):
                time_str = time_str.strip().upper()
                # Handle formats like "8:30AM", "12:00PM"
                is_pm = "PM" in time_str
                time_str = time_str.replace("AM", "").replace("PM", "").strip()
                t_parts = time_str.split(":")
                if len(t_parts) == 2:
                    hour = int(t_parts[0])
                    minute = int(t_parts[1])
                    if is_pm and hour != 12:
                        hour += 12
                    elif not is_pm and hour == 12:
                        hour = 0

            # FF times are US Eastern — convert to UTC (+5 EST / +4 EDT)
            # Approximate: use +5 (EST) as default
            dt = datetime(year, month, day, hour, minute, tzinfo=timezone.utc)
            # Add 5 hours to convert from EST to UTC
            dt = dt + timedelta(hours=5)
            return dt
        except (ValueError, IndexError):
            return None

    async def disconnect(self):
        if self._client:
            await self._client.aclose()
            self._client = None


# Singleton
calendar_adapter = CalendarAdapter()
