"""Data ingestion service — fetches OHLCV from adapters and stores in DB."""

from datetime import datetime, timezone
from io import StringIO

import httpx
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

# ── Free data sources (no API key needed) ──

STOOQ_SYMBOLS = {
    "XAUUSD": "xauusd", "XAGUSD": "xagusd",
    "EURUSD": "eurusd", "GBPUSD": "gbpusd", "USDJPY": "usdjpy",
    "USDCHF": "usdchf", "AUDUSD": "audusd", "USDCAD": "usdcad",
    "NZDUSD": "nzdusd", "EURGBP": "eurgbp", "EURJPY": "eurjpy",
}

YAHOO_SYMBOLS = {
    "XAUUSD": "GC=F", "XAGUSD": "SI=F",
    "EURUSD": "EURUSD=X", "GBPUSD": "GBPUSD=X", "USDJPY": "JPY=X",
    "BTCUSD": "BTC-USD", "ETHUSD": "ETH-USD",
}


async def _fetch_stooq(symbol: str, limit: int) -> pd.DataFrame:
    """Fetch daily OHLCV from Stooq.com (free, no API key)."""
    ticker = STOOQ_SYMBOLS.get(symbol.upper())
    if not ticker:
        return pd.DataFrame()

    url = f"https://stooq.com/q/d/l/?s={ticker}&i=d"
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(url)
            if resp.status_code != 200:
                logger.warning("stooq_http_error", status=resp.status_code, symbol=symbol)
                return pd.DataFrame()

            df = pd.read_csv(StringIO(resp.text))
            if df.empty or "Date" not in df.columns:
                logger.warning("stooq_empty_response", symbol=symbol)
                return pd.DataFrame()

            df = df.rename(columns={
                "Date": "timestamp", "Open": "open", "High": "high",
                "Low": "low", "Close": "close", "Volume": "volume",
            })
            df["timestamp"] = pd.to_datetime(df["timestamp"]).dt.tz_localize("UTC")
            if "volume" not in df.columns:
                df["volume"] = 0.0
            df = df.sort_values("timestamp").tail(limit).reset_index(drop=True)
            logger.info("stooq_fetched", symbol=symbol, rows=len(df))
            return df
    except Exception as e:
        logger.warning("stooq_fetch_failed", symbol=symbol, error=str(e))
        return pd.DataFrame()


async def _fetch_yahoo(symbol: str, limit: int) -> pd.DataFrame:
    """Fetch daily OHLCV from Yahoo Finance chart API (free, no API key)."""
    ticker = YAHOO_SYMBOLS.get(symbol.upper())
    if not ticker:
        return pd.DataFrame()

    import urllib.parse
    encoded = urllib.parse.quote(ticker)
    url = f"https://query2.finance.yahoo.com/v8/finance/chart/{encoded}?interval=1d&range=2y&includePrePost=false"

    try:
        headers = {"User-Agent": "Mozilla/5.0 (compatible; VISION/1.0)"}
        async with httpx.AsyncClient(timeout=30.0, headers=headers) as client:
            resp = await client.get(url)
            if resp.status_code != 200:
                logger.warning("yahoo_http_error", status=resp.status_code, symbol=symbol)
                return pd.DataFrame()

            data = resp.json()
            result = data.get("chart", {}).get("result", [])
            if not result:
                return pd.DataFrame()

            r = result[0]
            timestamps = r.get("timestamp", [])
            quote = r.get("indicators", {}).get("quote", [{}])[0]

            if not timestamps or not quote:
                return pd.DataFrame()

            rows = []
            for i, ts in enumerate(timestamps):
                o = quote.get("open", [None] * len(timestamps))[i]
                h = quote.get("high", [None] * len(timestamps))[i]
                lo = quote.get("low", [None] * len(timestamps))[i]
                c = quote.get("close", [None] * len(timestamps))[i]
                v = quote.get("volume", [0] * len(timestamps))[i]
                if o is None or c is None:
                    continue
                rows.append({
                    "timestamp": pd.Timestamp(ts, unit="s", tz="UTC"),
                    "open": float(o), "high": float(h), "low": float(lo),
                    "close": float(c), "volume": float(v or 0),
                })

            if not rows:
                return pd.DataFrame()

            df = pd.DataFrame(rows).sort_values("timestamp").tail(limit).reset_index(drop=True)
            logger.info("yahoo_fetched", symbol=symbol, rows=len(df))
            return df
    except Exception as e:
        logger.warning("yahoo_fetch_failed", symbol=symbol, error=str(e))
        return pd.DataFrame()


async def _try_adapter(adapter_name: str, symbol: str, timeframe: str, limit: int, since: datetime | None) -> pd.DataFrame:
    """Try fetching from a specific adapter by name."""
    try:
        adapter = data_registry.get_adapter(adapter_name)
        await adapter.connect()
        try:
            df = await adapter.fetch_ohlcv(symbol, timeframe, limit, since)
            if not df.empty:
                logger.info("adapter_fetched", adapter=adapter_name, symbol=symbol, rows=len(df))
            return df
        finally:
            await adapter.disconnect()
    except Exception as e:
        logger.warning("adapter_fetch_failed", adapter=adapter_name, symbol=symbol, error=str(e))
        return pd.DataFrame()


def _merge_dataframes(dfs: list[pd.DataFrame], limit: int) -> pd.DataFrame:
    """Merge multiple OHLCV DataFrames, dedup by timestamp, keep latest."""
    non_empty = [df for df in dfs if not df.empty]
    if not non_empty:
        return pd.DataFrame()
    if len(non_empty) == 1:
        return non_empty[0]
    combined = pd.concat(non_empty).drop_duplicates(
        subset="timestamp", keep="last"
    ).sort_values("timestamp").tail(limit).reset_index(drop=True)
    return combined


async def _fetch_with_fallback(symbol: str, timeframe: str, limit: int, since: datetime | None) -> pd.DataFrame:
    """Try the primary adapter, then fallbacks (OANDA, Alpha Vantage) until we have enough data."""
    min_rows = min(limit, 50)

    # Primary adapter
    primary_name = None
    primary_df = pd.DataFrame()
    try:
        adapter = data_registry.route_symbol(symbol)
        primary_name = adapter.name
        await adapter.connect()
        try:
            primary_df = await adapter.fetch_ohlcv(symbol, timeframe, limit, since)
        finally:
            await adapter.disconnect()
    except Exception as e:
        logger.warning("primary_adapter_failed", symbol=symbol, error=str(e))

    if not primary_df.empty and len(primary_df) >= min_rows:
        return primary_df

    logger.info("primary_insufficient", symbol=symbol, primary=primary_name,
                rows=len(primary_df) if not primary_df.empty else 0, need=min_rows)

    # Fallback chain: try adapters that weren't the primary
    fallback_adapters = ["massive", "oanda", "alpha_vantage", "goldapi"]
    best_df = primary_df

    for fb_name in fallback_adapters:
        if fb_name == primary_name:
            continue
        try:
            data_registry.get_adapter(fb_name)  # Check it exists
        except Exception:
            continue

        fb_df = await _try_adapter(fb_name, symbol, timeframe, limit, since)
        if fb_df.empty:
            continue

        # Merge fallback data with what we have
        best_df = _merge_dataframes([best_df, fb_df], limit)
        logger.info("fallback_success", symbol=symbol, adapter=fb_name,
                    total_rows=len(best_df))

        if len(best_df) >= min_rows:
            return best_df

    # Last resort: free data sources (no API key needed, daily only)
    if timeframe in ("1d", "1w") or len(best_df) < min_rows:
        for free_fetch, name in [(_fetch_stooq, "stooq"), (_fetch_yahoo, "yahoo")]:
            try:
                free_df = await free_fetch(symbol, limit)
                if not free_df.empty:
                    best_df = _merge_dataframes([best_df, free_df], limit)
                    logger.info("free_source_success", symbol=symbol, source=name,
                                total_rows=len(best_df))
                    if len(best_df) >= min_rows:
                        return best_df
            except Exception as e:
                logger.warning("free_source_failed", source=name, symbol=symbol, error=str(e))

    return best_df


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

    If intraday data is requested but only daily is available
    (e.g. gold on free tier), also ingests the daily data so
    other features (charts, ML) can use it.
    """
    df = await _fetch_with_fallback(symbol, timeframe, limit, since)

    if df.empty:
        # If intraday was requested and failed, try daily as well
        if timeframe != "1d":
            logger.info("intraday_empty_trying_daily", symbol=symbol, timeframe=timeframe)
            df = await _fetch_with_fallback(symbol, "1d", limit, since)
            if not df.empty:
                # Store as daily since that's what the data actually is
                count = await _store_ohlcv(df, symbol, "1d")
                logger.info("stored_daily_instead", symbol=symbol, requested=timeframe, rows=count)
                return count
        logger.warning("no_data_fetched", symbol=symbol, timeframe=timeframe)
        return 0

    return await _store_ohlcv(df, symbol, timeframe)


async def _store_ohlcv(df: pd.DataFrame, symbol: str, timeframe: str) -> int:
    """Store OHLCV DataFrame to DB with upsert."""
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
