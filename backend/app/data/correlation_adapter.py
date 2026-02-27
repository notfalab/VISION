"""DXY & Gold Correlation Adapter — computes rolling correlations between gold and macro instruments."""

import httpx
import numpy as np
from datetime import datetime, timezone

from backend.app.config import get_settings
from backend.app.logging_config import get_logger

logger = get_logger("data.correlation")

AV_BASE = "https://www.alphavantage.co/query"
CACHE_TTL = 3600  # 1 hour cache


class CorrelationAdapter:
    """Fetch DXY proxy, 10Y yield, and compute gold correlations."""

    def __init__(self):
        self._cache: dict[str, dict] = {}
        self._cache_ts: dict[str, float] = {}

    def _cache_valid(self, key: str) -> bool:
        ts = self._cache_ts.get(key, 0)
        return (datetime.now(timezone.utc).timestamp() - ts) < CACHE_TTL

    async def _fetch_av_fx_daily(self, from_currency: str, to_currency: str) -> list[dict]:
        """Fetch daily FX data from Alpha Vantage."""
        key = f"fx_{from_currency}_{to_currency}"
        if self._cache_valid(key):
            return self._cache[key]

        settings = get_settings()
        api_key = settings.alpha_vantage_api_key
        if not api_key:
            raise ValueError("ALPHA_VANTAGE_API_KEY not configured")

        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.get(AV_BASE, params={
                "function": "FX_DAILY",
                "from_symbol": from_currency,
                "to_symbol": to_currency,
                "outputsize": "compact",
                "apikey": api_key,
            })
            resp.raise_for_status()
            data = resp.json()

        ts_key = "Time Series FX (Daily)"
        if ts_key not in data:
            logger.warning("av_fx_no_data", pair=f"{from_currency}/{to_currency}", keys=list(data.keys()))
            return []

        result = []
        for date_str, values in sorted(data[ts_key].items()):
            result.append({
                "date": date_str,
                "close": float(values["4. close"]),
            })

        self._cache[key] = result
        self._cache_ts[key] = datetime.now(timezone.utc).timestamp()
        return result

    async def _fetch_treasury_series(self, maturity: str = "10year") -> list[dict]:
        """Fetch Treasury yield data from Alpha Vantage."""
        key = f"treasury_{maturity}"
        if self._cache_valid(key):
            return self._cache[key]

        settings = get_settings()
        api_key = settings.alpha_vantage_api_key
        if not api_key:
            raise ValueError("ALPHA_VANTAGE_API_KEY not configured")

        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.get(AV_BASE, params={
                "function": "TREASURY_YIELD",
                "interval": "daily",
                "maturity": maturity,
                "apikey": api_key,
            })
            resp.raise_for_status()
            data = resp.json()

        if "data" not in data:
            return []

        result = []
        for item in data["data"]:
            if item.get("value") and item["value"] != ".":
                result.append({
                    "date": item["date"],
                    "value": float(item["value"]),
                })

        self._cache[key] = result
        self._cache_ts[key] = datetime.now(timezone.utc).timestamp()
        return result

    async def get_gold_correlations(self, gold_prices: list[dict] | None = None) -> dict:
        """
        Compute rolling correlations between gold and:
        - DXY (via EUR/USD inverse proxy)
        - 10-Year Treasury Yield

        Returns correlation coefficients + sparkline data.
        """
        # Fetch DXY proxy: EUR/USD (DXY is ~57% EUR/USD, inverse relationship)
        try:
            eurusd = await self._fetch_av_fx_daily("EUR", "USD")
        except Exception as e:
            logger.warning("eurusd_fetch_failed", error=str(e))
            eurusd = []

        # Fetch 10Y yield
        try:
            yields_10y = await self._fetch_treasury_series("10year")
        except Exception as e:
            logger.warning("treasury_fetch_failed", error=str(e))
            yields_10y = []

        # Build DXY proxy (inverse of EUR/USD, scaled)
        # DXY ≈ 1/EURUSD * 100 (simplified)
        dxy_data = []
        for item in eurusd[-60:]:
            dxy_data.append({
                "date": item["date"],
                "value": round(1 / max(item["close"], 0.01) * 100, 2),
            })

        # Recent 10Y yield
        yields_recent = yields_10y[-60:]

        # Compute correlations if we have gold data
        correlations = {}

        # Gold vs DXY correlation (last 30 data points)
        if dxy_data and gold_prices and len(gold_prices) >= 10:
            dxy_by_date = {d["date"]: d["value"] for d in dxy_data}
            gold_by_date = {g.get("date", ""): g.get("close", 0) for g in gold_prices if "date" in g}

            common_dates = sorted(set(dxy_by_date.keys()) & set(gold_by_date.keys()))
            if len(common_dates) >= 10:
                gold_vals = np.array([gold_by_date[d] for d in common_dates[-30:]])
                dxy_vals = np.array([dxy_by_date[d] for d in common_dates[-30:]])
                if len(gold_vals) > 2:
                    corr = float(np.corrcoef(gold_vals, dxy_vals)[0, 1])
                    correlations["gold_dxy"] = round(corr, 3)

        # Gold vs 10Y correlation
        if yields_recent and gold_prices and len(gold_prices) >= 10:
            yield_by_date = {y["date"]: y["value"] for y in yields_recent}
            gold_by_date = {g.get("date", ""): g.get("close", 0) for g in gold_prices if "date" in g}

            common_dates = sorted(set(yield_by_date.keys()) & set(gold_by_date.keys()))
            if len(common_dates) >= 10:
                gold_vals = np.array([gold_by_date[d] for d in common_dates[-30:]])
                yield_vals = np.array([yield_by_date[d] for d in common_dates[-30:]])
                if len(gold_vals) > 2:
                    corr = float(np.corrcoef(gold_vals, yield_vals)[0, 1])
                    correlations["gold_10y"] = round(corr, 3)

        # DXY current value and trend
        dxy_current = dxy_data[-1]["value"] if dxy_data else None
        dxy_prev = dxy_data[-2]["value"] if len(dxy_data) >= 2 else None
        dxy_trend = "neutral"
        if dxy_current and dxy_prev:
            if dxy_current > dxy_prev * 1.001:
                dxy_trend = "rising"
            elif dxy_current < dxy_prev * 0.999:
                dxy_trend = "falling"

        # 10Y current and trend
        yield_current = yields_recent[-1]["value"] if yields_recent else None
        yield_prev = yields_recent[-2]["value"] if len(yields_recent) >= 2 else None
        yield_trend = "neutral"
        if yield_current and yield_prev:
            if yield_current > yield_prev:
                yield_trend = "rising"
            elif yield_current < yield_prev:
                yield_trend = "falling"

        # Gold signal from macro correlations
        gold_macro_signal = "neutral"
        signals = []
        if dxy_trend == "falling":
            signals.append("bullish")  # Weak dollar = gold bullish
        elif dxy_trend == "rising":
            signals.append("bearish")  # Strong dollar = gold bearish

        if yield_trend == "falling":
            signals.append("bullish")  # Falling yields = gold bullish
        elif yield_trend == "rising":
            signals.append("bearish")  # Rising yields = gold bearish

        if signals.count("bullish") > signals.count("bearish"):
            gold_macro_signal = "bullish"
        elif signals.count("bearish") > signals.count("bullish"):
            gold_macro_signal = "bearish"

        return {
            "correlations": correlations,
            "dxy": {
                "current": dxy_current,
                "trend": dxy_trend,
                "sparkline": [d["value"] for d in dxy_data[-20:]],
                "gold_signal": "bullish" if dxy_trend == "falling" else "bearish" if dxy_trend == "rising" else "neutral",
            },
            "treasury_10y": {
                "current": yield_current,
                "trend": yield_trend,
                "sparkline": [y["value"] for y in yields_recent[-20:]],
                "gold_signal": "bullish" if yield_trend == "falling" else "bearish" if yield_trend == "rising" else "neutral",
            },
            "gold_macro_signal": gold_macro_signal,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }


correlation_adapter = CorrelationAdapter()
