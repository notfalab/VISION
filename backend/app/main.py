"""VISION — FastAPI application entry point."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.app.api.v1 import router as v1_router
from backend.app.api.websocket import router as ws_router
from backend.app.config import get_settings
from backend.app.logging_config import setup_logging, get_logger


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging()
    logger = get_logger("app")
    logger.info("vision_starting", env=get_settings().app_env)

    # 1. Auto-create database tables if they don't exist
    from backend.app.database import engine, Base
    from backend.app.models import (  # noqa: F401
        Asset, OHLCVData, IndicatorValue, COTReport,
        Alert, AlertHistory, User, Trade, OnchainEvent, ScalperSignal,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("database_tables_ready")

    # 2. Auto-seed assets if the assets table is empty
    from backend.app.seed import seed_assets
    try:
        await seed_assets()
    except Exception as e:
        logger.warning("seed_failed", error=str(e))

    # 3. Register data source adapters
    from backend.app.data.registry import data_registry
    from backend.app.data.binance_adapter import BinanceAdapter
    from backend.app.data.goldapi_adapter import GoldAPIAdapter
    from backend.app.data.alpha_vantage import AlphaVantageAdapter

    data_registry.register(BinanceAdapter())
    data_registry.register(GoldAPIAdapter())
    data_registry.register(AlphaVantageAdapter())

    # Route gold/silver to GoldAPI.io (real spot prices)
    data_registry.set_route("XAUUSD", "goldapi")
    data_registry.set_route("XAGUSD", "goldapi")

    # Route forex pairs to Alpha Vantage (fallback handles rate limits)
    for pair in ["EURUSD", "GBPUSD", "USDJPY", "USDCHF", "AUDUSD", "USDCAD", "NZDUSD",
                 "EURGBP", "EURJPY", "GBPJPY"]:
        data_registry.set_route(pair, "alpha_vantage")

    # Route crypto to Binance
    for pair in ["BTCUSD", "ETHUSD", "ETHBTC", "SOLUSD", "XRPUSD"]:
        data_registry.set_route(pair, "binance")

    logger.info("adapters_registered", adapters=data_registry.list_adapters())

    yield
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
            "http://104.236.12.0",
            "https://104.236.12.0",
            "http://localhost",
        ],
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
                    test_symbol = {"goldapi": "XAUUSD", "binance": "BTCUSD", "alpha_vantage": "EURUSD"}
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
