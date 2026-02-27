"""
Redis-backed signal store — shared between API and Celery worker.

Signals are stored in Redis as JSON, keyed by symbol.
This replaces the in-memory _signal_store so that signals generated
by the Celery beat task are visible in the API endpoints.
"""

import json
from datetime import datetime, timezone

import redis

from backend.app.config import get_settings
from backend.app.logging_config import get_logger

logger = get_logger("scalper.store")

_SIGNALS_KEY = "vision:scalper:signals:{symbol}"
_COUNTER_KEY = "vision:scalper:id_counter"
_TTL = 60 * 60 * 24 * 30  # 30 days


def _get_redis():
    settings = get_settings()
    return redis.Redis(
        host=settings.redis_host,
        port=settings.redis_port,
        db=0,
        decode_responses=True,
    )


def save_signal(signal: dict) -> dict:
    """Save a signal to Redis. Assigns an auto-incrementing ID."""
    r = _get_redis()
    signal_id = r.incr(_COUNTER_KEY)
    signal["id"] = signal_id

    symbol = signal.get("symbol", "XAUUSD").upper()
    key = _SIGNALS_KEY.format(symbol=symbol)

    r.rpush(key, json.dumps(signal, default=str))
    r.expire(key, _TTL)

    logger.info("signal_saved", id=signal_id, symbol=symbol, direction=signal.get("direction"))
    return signal


def get_signals(
    symbol: str | None = None,
    status: str | None = None,
    timeframe: str | None = None,
) -> list[dict]:
    """Get signals from Redis, optionally filtered."""
    r = _get_redis()

    if symbol:
        symbols = [symbol.upper()]
    else:
        # Scan for all signal keys
        symbols = []
        for k in r.scan_iter("vision:scalper:signals:*"):
            sym = k.split(":")[-1]
            symbols.append(sym)

    results = []
    for sym in symbols:
        key = _SIGNALS_KEY.format(symbol=sym)
        raw_list = r.lrange(key, 0, -1)
        for raw in raw_list:
            try:
                sig = json.loads(raw)
                if status and sig.get("status") != status:
                    continue
                if timeframe and sig.get("timeframe") != timeframe:
                    continue
                results.append(sig)
            except (json.JSONDecodeError, TypeError):
                continue

    return results


def update_signal(signal_id: int, updates: dict) -> dict | None:
    """Update a signal in Redis by ID."""
    r = _get_redis()

    # Search all symbol keys for the signal
    for k in r.scan_iter("vision:scalper:signals:*"):
        raw_list = r.lrange(k, 0, -1)
        for idx, raw in enumerate(raw_list):
            try:
                sig = json.loads(raw)
                if sig.get("id") == signal_id:
                    sig.update(updates)
                    r.lset(k, idx, json.dumps(sig, default=str))
                    return sig
            except (json.JSONDecodeError, TypeError):
                continue

    return None


def get_signal_by_id(symbol: str, signal_id: int) -> dict | None:
    """Get a single signal by ID."""
    key = _SIGNALS_KEY.format(symbol=symbol.upper())
    r = _get_redis()
    raw_list = r.lrange(key, 0, -1)
    for raw in raw_list:
        try:
            sig = json.loads(raw)
            if sig.get("id") == signal_id:
                return sig
        except (json.JSONDecodeError, TypeError):
            continue
    return None


def clear_signals(symbol: str):
    """Clear all signals for a symbol (for testing)."""
    r = _get_redis()
    key = _SIGNALS_KEY.format(symbol=symbol.upper())
    r.delete(key)
