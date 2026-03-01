"""
Celery task: Auto-scan XAUUSD for scalper signals every 5 minutes.

Fetches fresh OHLCV data, runs the signal engine on 5m/15m/30m (+ 1d fallback),
and sends Telegram notifications for any new signals.
"""

import asyncio
from datetime import datetime, timezone

from backend.app.tasks.celery_app import celery_app
from backend.app.logging_config import get_logger

logger = get_logger("tasks.scalper_scan")


def _run_async(coro):
    """Run an async coroutine from sync Celery context."""
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as pool:
                return pool.submit(asyncio.run, coro).result()
        return loop.run_until_complete(coro)
    except RuntimeError:
        return asyncio.run(coro)


def _ensure_adapters():
    """Register data adapters if not already registered (worker doesn't run main.py lifespan)."""
    from backend.app.data.registry import data_registry
    if data_registry.list_adapters():
        return  # Already registered

    from backend.app.data.binance_adapter import BinanceAdapter
    from backend.app.data.goldapi_adapter import GoldAPIAdapter
    from backend.app.data.alpha_vantage import AlphaVantageAdapter
    from backend.app.data.oanda_adapter import OandaAdapter
    from backend.app.data.massive_adapter import MassiveAdapter
    from backend.app.data.cryptocompare_adapter import CryptoCompareAdapter

    data_registry.register(BinanceAdapter())
    data_registry.register(GoldAPIAdapter())
    data_registry.register(AlphaVantageAdapter())
    data_registry.register(OandaAdapter())
    data_registry.register(MassiveAdapter())
    data_registry.register(CryptoCompareAdapter())

    data_registry.set_route("XAUUSD", "massive")
    data_registry.set_route("XAGUSD", "massive")
    for pair in ["BTCUSD", "ETHUSD", "SOLUSD"]:
        data_registry.set_route(pair, "binance")
    for pair in ["EURUSD", "GBPUSD", "USDJPY", "USDCHF", "AUDUSD", "USDCAD", "NZDUSD",
                 "EURGBP", "EURJPY", "GBPJPY"]:
        data_registry.set_route(pair, "alpha_vantage")
    for pair in ["ETHBTC", "XRPUSD"]:
        data_registry.set_route(pair, "binance")

    logger.info("adapters_registered_in_worker")


async def _async_scan(symbol: str = "XAUUSD"):
    """Async implementation of the scan task."""
    _ensure_adapters()

    from backend.app.data.ingestion import ingest_ohlcv
    from backend.app.core.scalper.signal_engine import scan_multi_timeframe
    from backend.app.core.scalper.loss_learning import get_active_loss_filters
    from backend.app.core.scalper.signal_store import save_signal, get_signals, update_signal
    from backend.app.notifications.telegram import notify_signal
    from backend.app.notifications.discord import notify_signal as discord_notify_signal

    logger.info("scalper_scan_start", symbol=symbol)

    # Crypto uses 15m/1h/1d (via Binance or CryptoCompare fallback)
    CRYPTO_SYMBOLS = {"BTCUSD", "ETHUSD", "SOLUSD", "ETHBTC", "XRPUSD"}
    is_crypto = symbol.upper() in CRYPTO_SYMBOLS
    timeframes = ["15m", "1h", "1d"] if is_crypto else ["5m", "15m", "30m", "1d"]

    # 1. Ingest fresh data for scan timeframes
    ingested = {}
    for tf in timeframes:
        try:
            count = await ingest_ohlcv(symbol, tf, limit=500)
            ingested[tf] = count
            if count > 0:
                logger.info("data_ingested", symbol=symbol, timeframe=tf, rows=count)
        except Exception as e:
            logger.warning("ingest_failed", symbol=symbol, timeframe=tf, error=str(e))
            ingested[tf] = 0

    # 2. Load data from DB for signal generation
    import pandas as pd
    from sqlalchemy import select
    from backend.app.database import async_session
    from backend.app.models.asset import Asset
    from backend.app.models.ohlcv import OHLCVData, Timeframe

    TF_MAP = {
        "5m": Timeframe.M5,
        "15m": Timeframe.M15,
        "30m": Timeframe.M30,
        "1h": Timeframe.H1,
        "4h": Timeframe.H4,
        "1d": Timeframe.D1,
    }

    dataframes = {}
    async with async_session() as session:
        result = await session.execute(select(Asset).where(Asset.symbol == symbol.upper()))
        asset = result.scalar_one_or_none()
        if not asset:
            logger.error("asset_not_found", symbol=symbol)
            return {"error": f"Asset {symbol} not found"}

        for tf_str, tf_enum in TF_MAP.items():
            query = (
                select(OHLCVData)
                .where(OHLCVData.asset_id == asset.id, OHLCVData.timeframe == tf_enum)
                .order_by(OHLCVData.timestamp.desc())
                .limit(500)
            )
            rows = await session.execute(query)
            ohlcv_list = rows.scalars().all()

            if len(ohlcv_list) >= 50:
                df = pd.DataFrame([{
                    "timestamp": r.timestamp,
                    "open": float(r.open),
                    "high": float(r.high),
                    "low": float(r.low),
                    "close": float(r.close),
                    "volume": float(r.volume),
                } for r in reversed(ohlcv_list)])
                dataframes[tf_str] = df

    if not dataframes:
        logger.warning("no_data_for_scan", symbol=symbol, ingested=ingested)
        return {"signals": 0, "reason": "No data available"}

    # 3. Get active loss patterns from Redis store
    existing = get_signals(symbol=symbol)
    loss_patterns = get_active_loss_filters(existing)

    # 4. Run multi-timeframe scan
    signals = scan_multi_timeframe(dataframes, symbol, loss_patterns)

    # 5. Save signals to Redis and notify via Telegram + Discord
    saved = 0
    for sig in signals:
        save_signal(sig)
        saved += 1

        # Send Telegram notification
        try:
            await notify_signal(sig)
        except Exception as e:
            logger.warning("telegram_notify_failed", error=str(e))

        # Send Discord notification
        try:
            await discord_notify_signal(sig)
        except Exception as e:
            logger.warning("discord_notify_failed", error=str(e))

    # 6. Check active signals for SL/TP hits
    from backend.app.core.scalper.outcome_tracker import check_signal_outcome
    from backend.app.core.scalper.loss_learning import categorize_loss
    from backend.app.notifications.telegram import notify_outcome
    from backend.app.notifications.discord import notify_outcome as discord_notify_outcome

    active_signals = get_signals(symbol=symbol, status="active") + get_signals(symbol=symbol, status="pending")
    outcomes = 0

    for sig in active_signals:
        tf = sig.get("timeframe", "1d")
        df = dataframes.get(tf)
        if df is None or len(df) == 0:
            continue

        current_price = float(df["close"].iloc[-1])
        high = float(df["high"].iloc[-1])
        low = float(df["low"].iloc[-1])

        update = check_signal_outcome(sig, current_price, high, low)
        if update:
            old_status = sig.get("status")
            sig.update(update)

            if update.get("status") == "loss":
                analysis = categorize_loss(sig)
                sig["loss_analysis"] = analysis
                sig["loss_category"] = analysis["category"]

            # Persist update to Redis
            if sig.get("id"):
                update_signal(sig["id"], sig)

            new_status = update.get("status")
            if new_status in ("win", "loss") and old_status != new_status:
                outcomes += 1
                try:
                    await notify_outcome(sig)
                except Exception:
                    pass
                try:
                    await discord_notify_outcome(sig)
                except Exception:
                    pass

    logger.info(
        "scalper_scan_complete",
        symbol=symbol,
        signals_generated=saved,
        outcomes_resolved=outcomes,
        timeframes=list(dataframes.keys()),
        data_ingested=ingested,
    )

    return {
        "symbol": symbol,
        "signals_generated": saved,
        "outcomes_resolved": outcomes,
        "data_ingested": ingested,
        "timeframes_available": list(dataframes.keys()),
        "scanned_at": datetime.now(timezone.utc).isoformat(),
    }


@celery_app.task(name="backend.app.tasks.scalper_scan.auto_scan_xauusd")
def auto_scan_xauusd():
    """
    Celery Beat task: auto-scan XAUUSD every 5 minutes.
    Fetches data, generates signals, checks outcomes, sends Telegram alerts.
    """
    return _run_async(_async_scan("XAUUSD"))


@celery_app.task(name="backend.app.tasks.scalper_scan.auto_scan_btcusd")
def auto_scan_btcusd():
    """
    Celery Beat task: auto-scan BTCUSD every 5 minutes.
    Fetches data, generates signals, checks outcomes, sends Telegram alerts.
    """
    return _run_async(_async_scan("BTCUSD"))


@celery_app.task(name="backend.app.tasks.scalper_scan.daily_summary")
def daily_summary():
    """
    Celery Beat task: send daily performance summary to Telegram.
    Runs once at market close (22:00 UTC).
    """
    async def _send_summary():
        from backend.app.core.scalper.signal_store import get_signals
        from backend.app.core.scalper.outcome_tracker import compute_analytics
        from backend.app.notifications.telegram import notify_summary
        from backend.app.notifications.discord import notify_summary as discord_notify_summary

        total_sent = 0
        for symbol in ("XAUUSD", "BTCUSD"):
            signals = get_signals(symbol=symbol)
            if not signals:
                continue
            analytics = compute_analytics(signals)
            await notify_summary(analytics, symbol=symbol)
            try:
                await discord_notify_summary(analytics, symbol=symbol)
            except Exception:
                pass
            total_sent += len(signals)

        if total_sent == 0:
            return {"status": "no_signals"}
        return {"status": "sent", "signals_analyzed": total_sent}

    return _run_async(_send_summary())
