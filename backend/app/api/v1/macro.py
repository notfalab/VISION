"""Macro data endpoints — Treasury yields, Fed rate, CPI, COT reports, ETF flows, central bank holdings for gold analysis."""

import json
import os
from pathlib import Path

import httpx
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


# ── ETF flow cache ──
_etf_cache: dict = {}
_etf_cache_ts: float = 0

@router.get("/gold/etf-flows")
async def gold_etf_flows():
    """
    Gold ETF (GLD) flow data — daily volume, price, and flow signal.
    Uses Yahoo Finance chart API. Cached for 4 hours.
    """
    import time
    global _etf_cache, _etf_cache_ts

    if _etf_cache and time.time() - _etf_cache_ts < 14400:
        return _etf_cache

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                "https://query1.finance.yahoo.com/v8/finance/chart/GLD",
                params={"interval": "1d", "range": "30d"},
                headers={"User-Agent": "VISION/1.0"},
            )
            if resp.status_code != 200:
                raise HTTPException(status_code=502, detail="Yahoo Finance unavailable")

            data = resp.json()
            result = data.get("chart", {}).get("result", [])
            if not result:
                raise HTTPException(status_code=502, detail="No GLD data")

            meta = result[0].get("meta", {})
            quotes = result[0].get("indicators", {}).get("quote", [{}])[0]
            timestamps = result[0].get("timestamp", [])

            volumes = quotes.get("volume", [])
            closes = quotes.get("close", [])

            if not closes or not volumes or len(closes) < 2:
                raise HTTPException(status_code=502, detail="Insufficient GLD data")

            # Current values
            current_price = closes[-1] or 0
            prev_price = closes[-2] or current_price
            price_change_pct = ((current_price - prev_price) / prev_price * 100) if prev_price else 0

            current_vol = volumes[-1] or 0
            avg_vol_5d = sum(v or 0 for v in volumes[-6:-1]) / max(len(volumes[-6:-1]), 1)
            vol_change_pct = ((current_vol - avg_vol_5d) / avg_vol_5d * 100) if avg_vol_5d else 0

            # Flow signal based on price + volume
            flow_signal = "inflow" if price_change_pct > 0 and vol_change_pct > 0 else "outflow"

            # Build daily flows
            daily_flows = []
            for i in range(max(0, len(timestamps) - 10), len(timestamps)):
                if i < len(closes) and i < len(volumes) and closes[i] and volumes[i]:
                    prev = closes[i - 1] if i > 0 and closes[i - 1] else closes[i]
                    daily_flows.append({
                        "date": str(timestamps[i]) if timestamps[i] else "",
                        "volume": volumes[i],
                        "change_pct": round(((closes[i] - prev) / prev * 100), 2) if prev else 0,
                    })

            response = {
                "symbol": "GLD",
                "name": "SPDR Gold Trust",
                "current_volume": current_vol,
                "avg_volume_5d": round(avg_vol_5d),
                "volume_change_pct": round(vol_change_pct, 1),
                "price": round(current_price, 2),
                "price_change_pct": round(price_change_pct, 2),
                "flow_signal": flow_signal,
                "daily_flows": daily_flows,
            }
            _etf_cache = response
            _etf_cache_ts = time.time()
            return response

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"ETF flow fetch failed: {str(e)}")


@router.get("/gold/central-banks")
async def central_bank_gold():
    """
    Central bank gold holdings (quarterly data from World Gold Council).
    Reads from a static JSON file, updated quarterly.
    """
    try:
        cache_path = Path(__file__).resolve().parents[3] / "data" / "cache" / "central_bank_gold.json"
        if not cache_path.exists():
            return {"banks": [], "updated": "N/A", "source": "N/A"}
        with open(cache_path, "r") as f:
            data = json.load(f)
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Central bank data failed: {str(e)}")
