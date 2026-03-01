"""VISION — FastAPI application entry point."""

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.app.api.v1 import router as v1_router
from backend.app.api.websocket import router as ws_router
from backend.app.config import get_settings
from backend.app.logging_config import setup_logging, get_logger


SCAN_INTERVAL = 300  # 5 minutes
DAILY_SUMMARY_HOUR = 22  # 22:00 UTC

FOREX_PAIRS = ["EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "NZDUSD", "USDCHF"]


async def _forex_price_refresh(logger):
    """
    Lightweight loop: keep forex live prices in Redis cache.
    Polls Massive API every 30s for latest 1m candle per pair.
    This ensures the Header dropdown and chart update frequently.
    """
    await asyncio.sleep(45)  # Let startup complete
    logger.info("forex_price_refresh_starting")

    while True:
        try:
            from backend.app.data.registry import data_registry
            from backend.app.data.redis_pubsub import cache_latest_price
            from backend.app.data.base import Candle

            # Reuse one HTTP client for all pairs
            adapter = data_registry.route_symbol("EURUSD")
            await adapter.connect()
            try:
                for pair in FOREX_PAIRS:
                    try:
                        df = await adapter.fetch_ohlcv(pair, "1m", 1)
                        if not df.empty:
                            row = df.iloc[-1]
                            ts = row["timestamp"]
                            candle = Candle(
                                timestamp=ts.to_pydatetime() if hasattr(ts, "to_pydatetime") else ts,
                                open=float(row["open"]),
                                high=float(row["high"]),
                                low=float(row["low"]),
                                close=float(row["close"]),
                                volume=float(row["volume"]),
                            )
                            await cache_latest_price(pair, candle)
                    except Exception:
                        pass  # Don't spam logs every 60s
            finally:
                await adapter.disconnect()
        except asyncio.CancelledError:
            logger.info("forex_price_refresh_cancelled")
            return
        except Exception as e:
            logger.error("forex_price_refresh_error", error=str(e))

        await asyncio.sleep(30)


async def _background_scanner(logger):
    """
    In-process background scheduler.
    Scans XAUUSD + BTCUSD every 5 minutes, forex majors every ~10 minutes.
    Sends daily summary at 22:00 UTC.
    Replaces Celery beat + worker so no extra Railway services are needed.
    """
    from datetime import datetime, timezone

    last_summary_date = None
    scan_count = 0

    # Wait 30s after startup to let everything initialize
    await asyncio.sleep(30)
    logger.info("scanner_loop_starting")

    # ── Startup: seed forex data so charts + prices work immediately ──
    try:
        from backend.app.data.ingestion import ingest_ohlcv
        logger.info("seeding_forex_data")
        for pair in FOREX_PAIRS:
            for tf in ("1d", "1h"):
                try:
                    count = await ingest_ohlcv(pair, tf, 200)
                    if count > 0:
                        logger.info("forex_seeded", symbol=pair, timeframe=tf, rows=count)
                except Exception as e:
                    logger.warning("forex_seed_fail", symbol=pair, tf=tf, error=str(e))
        logger.info("forex_data_seeded")
    except Exception as e:
        logger.error("forex_seed_error", error=str(e))

    while True:
        try:
            # Import here to avoid circular imports
            from backend.app.tasks.scalper_scan import _async_scan

            # Always scan Gold + BTC every cycle (every ~5 min)
            for symbol in ("XAUUSD", "BTCUSD"):
                try:
                    result = await _async_scan(symbol)
                    signals = result.get("signals_generated", 0)
                    outcomes = result.get("outcomes_resolved", 0)
                    logger.info(
                        "auto_scan_done",
                        symbol=symbol,
                        signals=signals,
                        outcomes=outcomes,
                    )
                except Exception as e:
                    logger.error("auto_scan_error", symbol=symbol, error=str(e))

            # Scan forex every other cycle (~10 min) to avoid API overload
            if scan_count % 2 == 0:
                for symbol in FOREX_PAIRS:
                    try:
                        result = await _async_scan(symbol)
                        signals = result.get("signals_generated", 0)
                        outcomes = result.get("outcomes_resolved", 0)
                        logger.info(
                            "auto_scan_done",
                            symbol=symbol,
                            signals=signals,
                            outcomes=outcomes,
                        )
                    except Exception as e:
                        logger.error("auto_scan_error", symbol=symbol, error=str(e))

            scan_count += 1

            # Daily summary at 22:00 UTC — includes forex
            now = datetime.now(timezone.utc)
            today = now.date()
            if now.hour == DAILY_SUMMARY_HOUR and last_summary_date != today:
                try:
                    from backend.app.core.scalper.signal_store import get_signals
                    from backend.app.core.scalper.outcome_tracker import compute_analytics
                    from backend.app.notifications.telegram import notify_summary
                    from backend.app.notifications.discord import notify_summary as discord_notify_summary

                    all_symbols = ["XAUUSD", "BTCUSD"] + FOREX_PAIRS
                    for symbol in all_symbols:
                        signals = get_signals(symbol=symbol)
                        if signals:
                            analytics = compute_analytics(signals)
                            await notify_summary(analytics, symbol=symbol)
                            try:
                                await discord_notify_summary(analytics, symbol=symbol)
                            except Exception:
                                pass

                    last_summary_date = today
                    logger.info("daily_summary_sent")
                except Exception as e:
                    logger.error("daily_summary_error", error=str(e))

        except asyncio.CancelledError:
            logger.info("scanner_loop_cancelled")
            return
        except Exception as e:
            logger.error("scanner_loop_error", error=str(e))

        # Wait for next scan interval
        await asyncio.sleep(SCAN_INTERVAL)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    setup_logging()
    logger = get_logger("app")
    logger.info("vision_starting", env=settings.app_env)

    # 1. Auto-create database tables if they don't exist
    try:
        from backend.app.database import engine, Base
        from backend.app.models import (  # noqa: F401
            Asset, OHLCVData, IndicatorValue, COTReport,
            Alert, AlertHistory, User, Trade, OnchainEvent, ScalperSignal,
        )
        async with asyncio.timeout(30):
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
        logger.info("database_tables_ready")

        # 2. Auto-seed assets if the assets table is empty
        from backend.app.seed import seed_assets
        try:
            async with asyncio.timeout(30):
                await seed_assets()
        except Exception as e:
            logger.warning("seed_failed", error=str(e))
    except Exception as e:
        logger.error("database_init_failed", error=str(e))
        logger.warning("app_starting_without_database")

    # 3. Register data source adapters
    from backend.app.data.registry import data_registry
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

    # Route gold/silver to Massive (full historical + intraday data)
    data_registry.set_route("XAUUSD", "massive")
    data_registry.set_route("XAGUSD", "massive")

    # Route crypto to CryptoCompare as primary (works from US/Railway).
    # Binance REST returns HTTP 451 from US servers.
    # Fallback chain: binance -> massive -> oanda -> alpha_vantage -> goldapi
    for pair in ["BTCUSD", "ETHUSD", "SOLUSD"]:
        data_registry.set_route(pair, "cryptocompare")

    # Route forex pairs to Massive (paid plan, full intraday data)
    for pair in ["EURUSD", "GBPUSD", "USDJPY", "USDCHF", "AUDUSD", "USDCAD", "NZDUSD",
                 "EURGBP", "EURJPY", "GBPJPY"]:
        data_registry.set_route(pair, "massive")

    for pair in ["ETHBTC", "XRPUSD"]:
        data_registry.set_route(pair, "cryptocompare")

    logger.info("adapters_registered", adapters=data_registry.list_adapters())

    # 4. Start background tasks (replaces Celery beat + worker)
    bg_tasks: list[asyncio.Task] = []
    if settings.app_env != "development":
        bg_tasks.append(asyncio.create_task(_background_scanner(logger)))
        bg_tasks.append(asyncio.create_task(_forex_price_refresh(logger)))
        logger.info("background_tasks_started", count=len(bg_tasks))

    yield

    # Stop background tasks on shutdown
    for task in bg_tasks:
        if not task.done():
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
    logger.info("vision_shutting_down")


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title="VISION Trading Analytics",
        description="Smart money detection platform for gold",
        version="0.1.0",
        docs_url="/docs",
        redoc_url="/redoc",
        lifespan=lifespan,
    )

    # CORS — permissive for dev, tighten in production
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"] if settings.debug else [
            "http://localhost",
            "http://localhost:3000",
            "https://visionmarkets.app",
            "https://www.visionmarkets.app",
        ],
        allow_origin_regex=r"https://.*\.(vercel\.app|up\.railway\.app|visionmarkets\.app)",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Routes
    app.include_router(v1_router, prefix="/api")
    app.include_router(ws_router)

    @app.get("/health", tags=["system"])
    async def health():
        return {
            "status": "ok",
            "app": settings.app_name,
            "version": "0.1.0",
            "env": settings.app_env,
        }

    @app.get("/diag", tags=["system"])
    async def diagnostics():
        """Diagnostic endpoint to check data adapters and connectivity."""
        from backend.app.data.registry import data_registry
        from backend.app.config import get_settings
        s = get_settings()

        results = {"adapters": {}, "config": {}}
        results["config"]["goldapi_key_set"] = bool(s.goldapi_api_key)
        results["config"]["alpha_vantage_key_set"] = bool(s.alpha_vantage_api_key)
        results["config"]["binance_key_set"] = bool(s.binance_api_key)
        results["config"]["db_host"] = s.postgres_host
        results["config"]["redis_host"] = s.redis_host

        # Test each adapter
        for adapter_info in data_registry.list_adapters():
            name = adapter_info["name"]
            try:
                adapter = data_registry.get_adapter(name)
                await adapter.connect()
                try:
                    # Try fetching 1 candle
                    test_symbol = {"goldapi": "XAUUSD", "binance": "BTCUSD", "alpha_vantage": "EURUSD", "oanda": "XAUUSD", "massive": "XAUUSD"}
                    sym = test_symbol.get(name, "XAUUSD")
                    df = await adapter.fetch_ohlcv(sym, "1d", 1)
                    results["adapters"][name] = {
                        "status": "ok" if not df.empty else "empty",
                        "rows": len(df),
                        "symbol_tested": sym,
                    }
                finally:
                    await adapter.disconnect()
            except Exception as e:
                results["adapters"][name] = {"status": "error", "error": str(e)}

        return results

    return app


app = create_app()
