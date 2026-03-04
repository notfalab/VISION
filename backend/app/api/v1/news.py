"""News & Sentiment endpoints — aggregated market sentiment from multiple sources."""

import asyncio
from datetime import datetime, timezone

from fastapi import APIRouter

from backend.app.logging_config import get_logger

router = APIRouter(prefix="/news", tags=["news"])
logger = get_logger("news_router")

# Symbol → market type for weighting
CRYPTO_SYMBOLS = {"BTCUSD", "ETHUSD", "SOLUSD", "XRPUSD", "ETHBTC"}


@router.get("/sentiment/{symbol}")
async def get_news_sentiment(symbol: str):
    """
    Aggregated sentiment for a symbol.
    Combines crypto/market Fear & Greed + news sentiment into a single score.
    """
    from backend.app.data.sentiment_adapter import sentiment_adapter

    symbol = symbol.upper()
    is_crypto = symbol in CRYPTO_SYMBOLS

    # Fetch all sources in parallel
    results = await asyncio.gather(
        sentiment_adapter.fetch_crypto_fear_greed(),
        sentiment_adapter.fetch_market_fear_greed(),
        sentiment_adapter.fetch_news_sentiment(symbol),
        return_exceptions=True,
    )

    crypto_fg = results[0] if not isinstance(results[0], Exception) else None
    market_fg = results[1] if not isinstance(results[1], Exception) else None
    news = results[2] if not isinstance(results[2], Exception) else None

    # Compute aggregate score (0-100)
    scores: list[tuple[float, float]] = []  # (score, weight)

    if news and isinstance(news, dict) and "score" in news:
        news_score = news["score"]
        scores.append((news_score, 0.4))

    if is_crypto:
        # Crypto: crypto F&G 50%, news 50%
        if crypto_fg and isinstance(crypto_fg, dict) and "value" in crypto_fg:
            scores.append((crypto_fg["value"], 0.5))
        if market_fg and isinstance(market_fg, dict) and "value" in market_fg:
            scores.append((market_fg["value"], 0.1))
    else:
        # Forex/commodities: market F&G 50%, news 50%
        if market_fg and isinstance(market_fg, dict) and "value" in market_fg:
            scores.append((market_fg["value"], 0.5))
        if crypto_fg and isinstance(crypto_fg, dict) and "value" in crypto_fg:
            scores.append((crypto_fg["value"], 0.1))

    # Weighted average
    if scores:
        total_weight = sum(w for _, w in scores)
        aggregate = sum(s * w for s, w in scores) / total_weight
    else:
        aggregate = 50.0

    aggregate = round(max(0, min(100, aggregate)))

    # Classify
    if aggregate >= 75:
        label = "Extreme Greed"
    elif aggregate >= 60:
        label = "Greed"
    elif aggregate >= 40:
        label = "Neutral"
    elif aggregate >= 25:
        label = "Fear"
    else:
        label = "Extreme Fear"

    return {
        "symbol": symbol,
        "aggregate_score": aggregate,
        "aggregate_label": label,
        "crypto_fear_greed": crypto_fg if isinstance(crypto_fg, dict) else None,
        "market_fear_greed": market_fg if isinstance(market_fg, dict) else None,
        "news_sentiment": news if isinstance(news, dict) else None,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
