"""Data ingestion service — fetches OHLCV from adapters and stores in DB."""

from datetime import datetime, timezone

import pandas as pd
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.data.base import DataSourceAdapter
from backend.app.data.registry import data_registry
from backend.app.database import async_session
from backend.app.logging_config import get_logger
from backend.app.models.asset import Asset
from backend.app.models.ohlcv import OHLCVData, Timeframe

logger = get_logger("ingestion")


async def ingest_ohlcv(
    symbol: str,
    timeframe: str = "1d",
    limit: int = 500,
    since: datetime | None = None,
) -> int:
    """
    Fetch OHLCV data for a symbol and store in DB.
    Uses upsert to avoid duplicates.
    Returns number of rows inserted/updated.
    """
    adapter = data_registry.route_symbol(symbol)
    await adapter.connect()

    try:
        df = await adapter.fetch_ohlcv(symbol, timeframe, limit, since)
    finally:
        await adapter.disconnect()

    if df.empty:
        logger.warning("no_data_fetched", symbol=symbol, timeframe=timeframe)
        return 0

    # Resolve asset_id
    async with async_session() as session:
        result = await session.execute(
            select(Asset).where(Asset.symbol == symbol.upper())
        )
        asset = result.scalar_one_or_none()
        if not asset:
            logger.error("asset_not_found", symbol=symbol)
            return 0

        tf = Timeframe(timeframe)
        count = 0

        # Batch upsert using PostgreSQL ON CONFLICT
        for _, row in df.iterrows():
            stmt = pg_insert(OHLCVData).values(
                asset_id=asset.id,
                timeframe=tf,
                timestamp=row["timestamp"],
                open=float(row["open"]),
                high=float(row["high"]),
                low=float(row["low"]),
                close=float(row["close"]),
                volume=float(row["volume"]),
            ).on_conflict_do_update(
                index_elements=["asset_id", "timeframe", "timestamp"],
                set_={
                    "open": float(row["open"]),
                    "high": float(row["high"]),
                    "low": float(row["low"]),
                    "close": float(row["close"]),
                    "volume": float(row["volume"]),
                },
            )
            await session.execute(stmt)
            count += 1

        await session.commit()
        logger.info("ingested", symbol=symbol, timeframe=timeframe, rows=count)
        return count


async def ingest_multiple(
    symbols: list[str],
    timeframe: str = "1d",
    limit: int = 500,
) -> dict[str, int]:
    """Ingest OHLCV for multiple symbols. Returns {symbol: row_count}."""
    results = {}
    for symbol in symbols:
        try:
            count = await ingest_ohlcv(symbol, timeframe, limit)
            results[symbol] = count
        except Exception as e:
            logger.error("ingestion_failed", symbol=symbol, error=str(e))
            results[symbol] = 0
    return results
