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

    # Register data source adapters
    from backend.app.data.registry import data_registry
    from backend.app.data.binance_adapter import BinanceAdapter
    from backend.app.data.oanda_adapter import OandaAdapter

    data_registry.register(BinanceAdapter())
    data_registry.register(OandaAdapter())

    # Route gold to OANDA (real institutional gold prices)
    data_registry.set_route("XAUUSD", "oanda")
    data_registry.set_route("XAGUSD", "oanda")
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

    return app


app = create_app()
