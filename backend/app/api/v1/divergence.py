"""Institutional vs Retail Divergence endpoint."""

from fastapi import APIRouter

router = APIRouter(prefix="/divergence", tags=["divergence"])


@router.get("/{symbol}")
async def get_divergence(symbol: str):
    """
    Institutional vs Retail Divergence — shows when smart money
    and retail traders disagree. Strong divergence = contrarian signal.
    """
    from backend.app.core.institutional.divergence import calculate_divergence

    result = await calculate_divergence(symbol)
    return result
