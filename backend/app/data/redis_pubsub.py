"""Redis pub/sub for real-time price broadcasting."""

import json
from datetime import datetime, timezone

import redis.asyncio as aioredis

from backend.app.config import get_settings
from backend.app.data.base import Candle
from backend.app.logging_config import get_logger

logger = get_logger("redis_pubsub")

_redis: aioredis.Redis | None = None


async def get_redis() -> aioredis.Redis:
    global _redis
    if _redis is None:
        settings = get_settings()
        _redis = aioredis.from_url(settings.redis_url, decode_responses=True)
    return _redis


async def publish_price(symbol: str, candle: Candle) -> None:
    """Publish a price update to the Redis channel for a symbol."""
    r = await get_redis()
    channel = f"prices:{symbol.upper()}"
    payload = json.dumps({
        "symbol": symbol.upper(),
        "timestamp": candle.timestamp.isoformat(),
        "open": candle.open,
        "high": candle.high,
        "low": candle.low,
        "close": candle.close,
        "volume": candle.volume,
    })
    await r.publish(channel, payload)


async def publish_alert(user_id: int, alert_data: dict) -> None:
    """Publish an alert notification."""
    r = await get_redis()
    channel = f"alerts:{user_id}"
    await r.publish(channel, json.dumps(alert_data))


async def subscribe_prices(symbols: list[str]):
    """
    Subscribe to price updates for given symbols.
    Yields (symbol, data) tuples as they arrive.
    """
    r = await get_redis()
    pubsub = r.pubsub()
    channels = [f"prices:{s.upper()}" for s in symbols]
    await pubsub.subscribe(*channels)

    async for message in pubsub.listen():
        if message["type"] == "message":
            data = json.loads(message["data"])
            yield data["symbol"], data


async def cache_latest_price(symbol: str, candle: Candle) -> None:
    """Cache the most recent price for instant lookups."""
    r = await get_redis()
    key = f"latest:{symbol.upper()}"
    await r.hset(key, mapping={
        "price": str(candle.close),
        "high": str(candle.high),
        "low": str(candle.low),
        "volume": str(candle.volume),
        "timestamp": candle.timestamp.isoformat(),
    })
    await r.expire(key, 300)  # 5 min TTL


async def get_latest_price(symbol: str) -> dict | None:
    """Get cached latest price for a symbol."""
    r = await get_redis()
    key = f"latest:{symbol.upper()}"
    data = await r.hgetall(key)
    if not data:
        return None
    return {
        "symbol": symbol.upper(),
        "price": float(data["price"]),
        "high": float(data["high"]),
        "low": float(data["low"]),
        "volume": float(data["volume"]),
        "timestamp": data["timestamp"],
    }
