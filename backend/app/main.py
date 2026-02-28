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


async def _background_scanner(logger):
    """
    In-process background scheduler.
    Scans XAUUSD + BTCUSD every 5 minutes and sends Telegram signals.
    Sends daily summary at 22:00 UTC.
    Replaces Celery beat + worker so no extra Railway services are needed.
    """
    from datetime import datetime, timezone

    last_summary_date = None

    # Wait 30s after startup to let everything initialize
    await asyncio.sleep(30)
    logger.info("scanner_loop_starting")

    while True:
        try:
            # Import here to avoid circular imports
            from backend.app.tasks.scalper_scan import _async_scan

            # Scan each symbol
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

            # Daily summary at 22:00 UTC
            now = datetime.now(timezone.utc)
            today = now.date()
            if now.hour == DAILY_SUMMARY_HOUR and last_summary_date != today:
                try:
                    from backend.app.core.scalper.signal_store import get_signals
                    from backend.app.core.scalper.outcome_tracker import compute_analytics
                    from backend.app.notifications.telegram import notify_summary

                    for symbol in ("XAUUSD", "BTCUSD"):
                        signals = get_signals(symbol=symbol)
                        if signals:
                            analytics = compute_analytics(signals)
                            await notify_summary(analytics, symbol=symbol)

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

    data_registry.register(BinanceAdapter())
    data_registry.register(GoldAPIAdapter())
    data_registry.register(AlphaVantageAdapter())
    data_registry.register(OandaAdapter())
    data_registry.register(MassiveAdapter())

    # Route gold/silver to Massive.com (full historical + intraday data)
    data_registry.set_route("XAUUSD", "massive")
    data_registry.set_route("XAGUSD", "massive")

    # Route forex pairs to Alpha Vantage (fallback handles rate limits)
    for pair in ["EURUSD", "GBPUSD", "USDJPY", "USDCHF", "AUDUSD", "USDCAD", "NZDUSD",
                 "EURGBP", "EURJPY", "GBPJPY"]:
        data_registry.set_route(pair, "alpha_vantage")

    # Route crypto to Binance
    for pair in ["BTCUSD", "ETHUSD", "ETHBTC", "SOLUSD", "XRPUSD"]:
        data_registry.set_route(pair, "binance")

    logger.info("adapters_registered", adapters=data_registry.list_adapters())

    # 4. Start background scanner (replaces Celery beat + worker)
    scanner_task = None
    if settings.app_env != "development":
        scanner_task = asyncio.create_task(_background_scanner(logger))
        logger.info("background_scanner_started")

    yield

    # Stop scanner on shutdown
    if scanner_task and not scanner_task.done():
        scanner_task.cancel()
        try:
            await scanner_task
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
