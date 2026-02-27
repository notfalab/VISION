"""Celery tasks for periodic signal scanning and data ingestion."""

from celery import Celery

from backend.app.config import get_settings

settings = get_settings()

celery_app = Celery(
    "vision",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    beat_schedule={
        "scan-scalper-signals-5m": {
            "task": "backend.app.tasks.scan_scalper_signals",
            "schedule": 300.0,  # every 5 minutes
            "args": ("XAUUSD", "5m"),
        },
        "scan-scalper-signals-15m": {
            "task": "backend.app.tasks.scan_scalper_signals",
            "schedule": 900.0,  # every 15 minutes
            "args": ("XAUUSD", "15m"),
        },
    },
)


async def _run_scan(symbol: str, timeframe: str) -> list[dict]:
    """Run the signal engine for a given symbol and timeframe."""
    import pandas as pd
    from sqlalchemy import select

    from backend.app.core.scalper.signal_engine import generate_signals
    from backend.app.data.ingestion import ingest_ohlcv
    from backend.app.database import async_session
    from backend.app.models.asset import Asset
    from backend.app.models.ohlcv import OHLCVData, Timeframe

    # 1. Ensure fresh data
    await ingest_ohlcv(symbol, timeframe, limit=500)

    # 2. Fetch from DB
    async with async_session() as session:
        result = await session.execute(select(Asset).where(Asset.symbol == symbol.upper()))
        asset = result.scalar_one_or_none()
        if not asset:
            return []

        tf = Timeframe(timeframe)
        query = (
            select(OHLCVData)
            .where(OHLCVData.asset_id == asset.id, OHLCVData.timeframe == tf)
            .order_by(OHLCVData.timestamp.desc())
            .limit(500)
        )
        rows = await session.execute(query)
        ohlcv_list = rows.scalars().all()

    if len(ohlcv_list) < 50:
        return []

    df = pd.DataFrame([{
        "timestamp": r.timestamp,
        "open": float(r.open),
        "high": float(r.high),
        "low": float(r.low),
        "close": float(r.close),
        "volume": float(r.volume),
    } for r in reversed(ohlcv_list)])

    # 3. Generate signals
    signals = generate_signals(df, symbol, timeframe)

    # 4. Notify via Telegram for each signal
    for sig in signals:
        try:
            from backend.app.notifications.telegram import notify_signal
            await notify_signal(sig)
        except Exception:
            pass

    return signals


@celery_app.task(name="backend.app.tasks.scan_scalper_signals")
def scan_scalper_signals(symbol: str, timeframe: str = "15m"):
    """Run scalper signal scan (sync wrapper for async engine)."""
    import asyncio

    try:
        result = asyncio.run(_run_scan(symbol, timeframe))
        return {"symbol": symbol, "timeframe": timeframe, "signals_count": len(result)}
    except Exception as e:
        return {"symbol": symbol, "timeframe": timeframe, "error": str(e)}


@celery_app.task(name="backend.app.tasks.ingest_prices")
def ingest_prices(symbol: str, timeframe: str = "1d", limit: int = 500):
    """Ingest OHLCV prices for a symbol."""
    import asyncio
    from backend.app.data.ingestion import ingest_ohlcv

    try:
        count = asyncio.run(ingest_ohlcv(symbol, timeframe, limit))
        return {"symbol": symbol, "rows": count}
    except Exception as e:
        return {"symbol": symbol, "error": str(e)}
