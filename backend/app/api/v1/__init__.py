"""API v1 router aggregation."""

from fastapi import APIRouter

from backend.app.api.v1 import assets, prices, indicators, institutional, alerts, auth, macro, ml, scalper

router = APIRouter(prefix="/v1")
router.include_router(auth.router)
router.include_router(assets.router)
router.include_router(prices.router)
router.include_router(indicators.router)
router.include_router(institutional.router)
router.include_router(alerts.router)
router.include_router(macro.router)
router.include_router(ml.router)
router.include_router(scalper.router)
