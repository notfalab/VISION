"""Sentiment adapter — Crypto Fear & Greed, Market Fear & Greed, AV News Sentiment.

Aggregates market sentiment from multiple free data sources
with in-memory caching to stay within rate limits.
"""

import time
from datetime import datetime, timezone

import httpx

from backend.app.config import get_settings
from backend.app.logging_config import get_logger

logger = get_logger("sentiment_adapter")

CRYPTO_FG_URL = "https://api.alternative.me/fng/"
CNN_FG_URL = "https://production.dataviz.cnn.io/index/fearandgreed/graphdata"
AV_BASE = "https://www.alphavantage.co/query"

# Map our symbols to Alpha Vantage tickers for news sentiment
SYMBOL_TO_AV_TICKERS: dict[str, str] = {
    "BTCUSD": "CRYPTO:BTC",
    "ETHUSD": "CRYPTO:ETH",
    "SOLUSD": "CRYPTO:SOL",
    "XRPUSD": "CRYPTO:XRP",
    "DOGEUSD": "CRYPTO:DOGE",
    "BNBUSD": "CRYPTO:BNB",
    "ADAUSD": "CRYPTO:ADA",
}

# For non-crypto symbols, use topics instead of tickers
SYMBOL_TO_AV_TOPICS: dict[str, str] = {
    "XAUUSD": "economy_macro,financial_markets",
    "XAGUSD": "economy_macro,financial_markets",
    "EURUSD": "economy_monetary,economy_fiscal",
    "GBPUSD": "economy_monetary,economy_fiscal",
    "USDJPY": "economy_monetary,economy_fiscal",
    "AUDUSD": "economy_monetary,economy_macro",
    "USDCAD": "economy_monetary,economy_macro",
    "NZDUSD": "economy_monetary,economy_macro",
    "USDCHF": "economy_monetary,economy_macro",
    "NAS100": "technology,financial_markets",
    "SPX500": "financial_markets,economy_macro",
}

CLASSIFICATIONS = [
    (0, 25, "Extreme Fear"),
    (25, 40, "Fear"),
    (40, 60, "Neutral"),
    (60, 75, "Greed"),
    (75, 101, "Extreme Greed"),
]


def _classify(score: float) -> str:
    """Map 0-100 score to sentiment label."""
    for lo, hi, label in CLASSIFICATIONS:
        if lo <= score < hi:
            return label
    return "Neutral"


class SentimentAdapter:
    """Aggregates market sentiment from multiple free sources."""

    def __init__(self):
        self._crypto_fg_cache: dict | None = None
        self._crypto_fg_time: float = 0
        self._market_fg_cache: dict | None = None
        self._market_fg_time: float = 0
        self._news_cache: dict[str, dict] = {}
        self._news_cache_times: dict[str, float] = {}
        self._client: httpx.AsyncClient | None = None

        self._CRYPTO_TTL = 1800   # 30 min
        self._MARKET_TTL = 1800   # 30 min
        self._NEWS_TTL = 3600     # 60 min (25 req/day limit)

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                timeout=20.0,
                headers={"User-Agent": "VISION-Trading/1.0"},
            )
        return self._client

    async def fetch_crypto_fear_greed(self) -> dict:
        """Fetch crypto Fear & Greed index from Alternative.me."""
        now = time.time()
        if self._crypto_fg_cache and (now - self._crypto_fg_time) < self._CRYPTO_TTL:
            return self._crypto_fg_cache

        try:
            client = await self._get_client()
            resp = await client.get(CRYPTO_FG_URL, params={"limit": 30, "format": "json"})
            resp.raise_for_status()
            data = resp.json()

            entries = data.get("data", [])
            if not entries:
                raise ValueError("No F&G data returned")

            current = int(entries[0].get("value", 50))
            classification = entries[0].get("value_classification", _classify(current))

            # History for sparkline (last 30 days)
            history = []
            for entry in entries[:30]:
                history.append({
                    "value": int(entry.get("value", 50)),
                    "date": datetime.fromtimestamp(
                        int(entry.get("timestamp", 0)),
                        tz=timezone.utc,
                    ).strftime("%Y-%m-%d"),
                    "classification": entry.get("value_classification", ""),
                })

            result = {
                "value": current,
                "classification": classification,
                "history": history,
            }
            self._crypto_fg_cache = result
            self._crypto_fg_time = now
            logger.info(f"Crypto F&G: {current} ({classification})")
            return result
        except Exception as e:
            logger.error(f"Crypto F&G fetch failed: {e}")
            if self._crypto_fg_cache:
                return self._crypto_fg_cache
            return {"value": 50, "classification": "Neutral", "history": []}

    async def fetch_market_fear_greed(self) -> dict:
        """Fetch traditional market Fear & Greed from CNN."""
        now = time.time()
        if self._market_fg_cache and (now - self._market_fg_time) < self._MARKET_TTL:
            return self._market_fg_cache

        try:
            client = await self._get_client()
            # CNN endpoint may block bots — use headers to mimic browser
            resp = await client.get(
                CNN_FG_URL,
                headers={
                    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
                    "Accept": "application/json",
                    "Referer": "https://edition.cnn.com/",
                },
            )
            resp.raise_for_status()
            data = resp.json()

            # CNN response structure: { fear_and_greed: { score, rating, ... } }
            fg = data.get("fear_and_greed", {})
            score = float(fg.get("score", 50))
            rating = fg.get("rating", _classify(score))

            result = {
                "value": round(score),
                "classification": rating.replace("_", " ").title() if rating else _classify(score),
            }
            self._market_fg_cache = result
            self._market_fg_time = now
            logger.info(f"Market F&G: {result['value']} ({result['classification']})")
            return result
        except Exception as e:
            logger.warning(f"Market F&G fetch failed (may be geo-blocked): {e}")
            if self._market_fg_cache:
                return self._market_fg_cache
            # Return neutral fallback — CNN often blocks server requests
            return {"value": 50, "classification": "Neutral"}

    async def fetch_news_sentiment(self, symbol: str) -> dict:
        """Fetch news sentiment for a symbol from Alpha Vantage."""
        now = time.time()
        cache_key = symbol.upper()
        if cache_key in self._news_cache:
            if (now - self._news_cache_times.get(cache_key, 0)) < self._NEWS_TTL:
                return self._news_cache[cache_key]

        # Map symbol to AV ticker or topics
        av_ticker = SYMBOL_TO_AV_TICKERS.get(symbol.upper())
        av_topics = SYMBOL_TO_AV_TOPICS.get(symbol.upper())

        try:
            settings = get_settings()
            api_key = settings.alpha_vantage_api_key
            if not api_key:
                return {"score": 50, "label": "Neutral", "articles": [], "article_count": 0}

            client = await self._get_client()
            params: dict = {
                "function": "NEWS_SENTIMENT",
                "limit": 20,
                "apikey": api_key,
            }
            if av_ticker:
                params["tickers"] = av_ticker
            elif av_topics:
                params["topics"] = av_topics
            else:
                params["topics"] = "financial_markets,economy_macro"

            resp = await client.get(AV_BASE, params=params)
            resp.raise_for_status()
            data = resp.json()

            if "Information" in data:
                logger.warning(f"AV rate limit: {data['Information'][:80]}")
                if cache_key in self._news_cache:
                    return self._news_cache[cache_key]
                return {"score": 50, "label": "Neutral", "articles": [], "article_count": 0}

            feed = data.get("feed", [])
            articles = []
            total_score = 0.0
            scored_count = 0

            for item in feed[:15]:
                title = item.get("title", "")
                source = item.get("source", "")
                url = item.get("url", "")
                published = item.get("time_published", "")
                overall = float(item.get("overall_sentiment_score", 0))

                # Find ticker-specific sentiment if available
                ticker_score = overall
                if av_ticker:
                    ticker_sentiments = item.get("ticker_sentiment", [])
                    for ts in ticker_sentiments:
                        if ts.get("ticker", "").upper() == av_ticker.upper():
                            ticker_score = float(ts.get("ticker_sentiment_score", overall))
                            break

                total_score += ticker_score
                scored_count += 1

                # Classify article sentiment
                if ticker_score >= 0.15:
                    art_label = "Bullish"
                elif ticker_score <= -0.15:
                    art_label = "Bearish"
                else:
                    art_label = "Neutral"

                articles.append({
                    "title": title,
                    "source": source,
                    "url": url,
                    "sentiment_score": round(ticker_score, 3),
                    "sentiment_label": art_label,
                    "published": self._format_av_time(published),
                })

            # Average score: AV returns -1 to 1 → normalize to 0-100
            avg_score = (total_score / max(scored_count, 1))
            normalized = round((avg_score + 1) * 50)  # -1..1 → 0..100
            normalized = max(0, min(100, normalized))

            if avg_score >= 0.15:
                label = "Bullish"
            elif avg_score <= -0.15:
                label = "Bearish"
            else:
                label = "Neutral"

            result = {
                "score": normalized,
                "label": label,
                "raw_score": round(avg_score, 3),
                "articles": articles,
                "article_count": len(articles),
            }
            self._news_cache[cache_key] = result
            self._news_cache_times[cache_key] = now
            logger.info(f"News sentiment {symbol}: {normalized}/100 ({label}), {len(articles)} articles")
            return result
        except Exception as e:
            logger.error(f"News sentiment fetch failed for {symbol}: {e}")
            if cache_key in self._news_cache:
                return self._news_cache[cache_key]
            return {"score": 50, "label": "Neutral", "articles": [], "article_count": 0}

    def _format_av_time(self, raw: str) -> str:
        """Convert AV time format '20260303T120000' to ISO string."""
        try:
            if len(raw) >= 15:
                dt = datetime.strptime(raw[:15], "%Y%m%dT%H%M%S")
                return dt.replace(tzinfo=timezone.utc).isoformat()
        except ValueError:
            pass
        return raw

    async def disconnect(self):
        if self._client:
            await self._client.aclose()
            self._client = None


# Singleton
sentiment_adapter = SentimentAdapter()
