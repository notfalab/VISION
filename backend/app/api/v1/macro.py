"""Macro data endpoints — Treasury yields, Fed rate, CPI, COT reports for gold analysis."""

from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/macro", tags=["macro"])


@router.get("/gold/summary")
async def gold_macro_summary():
    """
    Comprehensive macro summary for gold analysis.
    Includes Treasury yields, Fed rate, CPI, inflation, yield curve.
    Each indicator includes its gold-specific signal (bullish/bearish/neutral).
    """
    from backend.app.data.macro_adapter import macro_adapter
    try:
        return await macro_adapter.get_gold_macro_summary()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Macro data fetch failed: {str(e)}")


@router.get("/treasury/{maturity}")
async def treasury_yield(maturity: str = "10year"):
    """Get Treasury yield history. Maturity: 3month, 2year, 5year, 7year, 10year, 30year."""
    from backend.app.data.macro_adapter import macro_adapter
    try:
        data = await macro_adapter.get_treasury_yield(maturity)
        return {"maturity": maturity, "data": data[:60]}
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/fed-rate")
async def fed_rate():
    """Get Federal Funds Rate history."""
    from backend.app.data.macro_adapter import macro_adapter
    try:
        data = await macro_adapter.get_federal_funds_rate()
        return {"data": data[:60]}
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/cpi")
async def cpi():
    """Get CPI (Consumer Price Index) history."""
    from backend.app.data.macro_adapter import macro_adapter
    try:
        data = await macro_adapter.get_cpi()
        return {"data": data[:24]}
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/correlations/gold")
async def gold_correlations():
    """
    Gold correlations with DXY and 10Y Treasury Yield.
    Includes sparkline data, current values, and gold macro signal.
    """
    from backend.app.data.correlation_adapter import correlation_adapter
    try:
        return await correlation_adapter.get_gold_correlations()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Correlation data fetch failed: {str(e)}")


@router.get("/cot/gold")
async def cot_gold():
    """
    Get CFTC Commitment of Traders report for gold futures.
    Shows institutional positioning: managed money, producers, swap dealers.
    """
    from backend.app.data.cot_adapter import cot_adapter
    try:
        return await cot_adapter.get_gold_cot()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"COT data fetch failed: {str(e)}")
