"""
Institutional vs Retail Divergence — detects when smart money
and retail traders disagree.

Combines:
- MyFxBook retail positioning (% long/short)
- COT institutional data (for gold/commodities)
- Whale tracker data (for crypto)
- Order flow imbalance (real-time)

Strong divergence = powerful contrarian signal.
"""

from backend.app.logging_config import get_logger

logger = get_logger("divergence")


async def calculate_divergence(symbol: str) -> dict:
    """Calculate institutional vs retail divergence for a symbol.

    Returns:
        Dict with retail_long_pct, institutional_bias, divergence_score, signal
    """
    retail_data = await _get_retail_positioning(symbol)
    institutional_data = await _get_institutional_positioning(symbol)
    orderflow_data = await _get_orderflow_bias(symbol)

    retail_long_pct = retail_data.get("long_pct", 50.0)
    retail_short_pct = 100.0 - retail_long_pct
    retail_bias = "long" if retail_long_pct > 55 else ("short" if retail_long_pct < 45 else "neutral")

    # Institutional bias: combine COT + orderflow
    inst_score = 0.0  # -100 to +100 (negative=bearish, positive=bullish)
    inst_sources = 0

    if institutional_data.get("net_position") is not None:
        net = institutional_data["net_position"]
        net_change = institutional_data.get("net_change", 0)
        # Normalize COT: positive net = bullish
        if net > 0:
            inst_score += min(net / max(abs(institutional_data.get("open_interest", net)), 1) * 100, 100)
        else:
            inst_score += max(net / max(abs(institutional_data.get("open_interest", abs(net))), 1) * 100, -100)
        if net_change != 0:
            # Recent change matters more
            inst_score += 20 if net_change > 0 else -20
        inst_sources += 1

    if orderflow_data.get("delta") is not None:
        delta_pct = orderflow_data.get("delta_pct", 0)
        inst_score += delta_pct * 2  # Scale order flow contribution
        inst_sources += 1

    if inst_sources > 0:
        inst_score /= inst_sources
    inst_score = max(-100, min(100, inst_score))

    institutional_bias = "bullish" if inst_score > 15 else ("bearish" if inst_score < -15 else "neutral")

    # Divergence score: how much retail and institutional disagree
    # Retail bias as score: retail_long_pct maps to -100..+100
    retail_score = (retail_long_pct - 50) * 2  # 50% → 0, 70% → +40, 30% → -40

    # Divergence = institutional - retail (positive = inst more bullish than retail)
    divergence_score = inst_score - retail_score
    divergence_score = max(-100, min(100, divergence_score))

    # Signal: strong divergence when retail is heavily one-sided and institutional opposite
    signal = "neutral"
    signal_strength = abs(divergence_score) / 100

    if divergence_score > 30 and retail_long_pct < 40:
        signal = "bullish_divergence"  # Institutional bullish, retail bearish → contrarian buy
    elif divergence_score < -30 and retail_long_pct > 60:
        signal = "bearish_divergence"  # Institutional bearish, retail bullish → contrarian sell
    elif abs(divergence_score) > 50:
        signal = "strong_divergence"
    elif abs(divergence_score) < 10:
        signal = "aligned"

    return {
        "symbol": symbol.upper(),
        "retail_long_pct": round(retail_long_pct, 1),
        "retail_short_pct": round(retail_short_pct, 1),
        "retail_bias": retail_bias,
        "institutional_score": round(inst_score, 1),
        "institutional_bias": institutional_bias,
        "divergence_score": round(divergence_score, 1),
        "signal": signal,
        "signal_strength": round(signal_strength, 3),
        "has_cot": institutional_data.get("net_position") is not None,
        "has_orderflow": orderflow_data.get("delta") is not None,
        "details": {
            "retail": retail_data,
            "institutional": institutional_data,
            "orderflow": orderflow_data,
        },
    }


async def _get_retail_positioning(symbol: str) -> dict:
    """Get retail positioning from MyFxBook."""
    try:
        from backend.app.data.registry import data_registry
        adapter = data_registry.get_adapter("myfxbook")
        await adapter.connect()
        try:
            ob = await adapter.fetch_orderbook(symbol, 5)
            if ob and ob.bids and ob.asks:
                total_bid = sum(l.quantity for l in ob.bids)
                total_ask = sum(l.quantity for l in ob.asks)
                total = total_bid + total_ask
                if total > 0:
                    return {
                        "long_pct": round(total_bid / total * 100, 1),
                        "short_pct": round(total_ask / total * 100, 1),
                        "total_volume": round(total, 2),
                        "source": "myfxbook",
                    }
        finally:
            await adapter.disconnect()
    except Exception as e:
        logger.debug("retail_positioning_unavailable", symbol=symbol, error=str(e))

    return {"long_pct": 50.0, "short_pct": 50.0, "source": "unavailable"}


async def _get_institutional_positioning(symbol: str) -> dict:
    """Get institutional positioning from COT data."""
    try:
        if symbol.upper() in ("XAUUSD", "XAGUSD"):
            from backend.app.data.cot_adapter import cot_adapter
            cot = await cot_adapter.get_gold_cot()
            if cot and "latest" in cot:
                latest = cot["latest"]
                return {
                    "net_position": latest.get("mm_net", 0),
                    "net_change": latest.get("mm_net_change", 0),
                    "open_interest": latest.get("open_interest", 0),
                    "source": "cot",
                }
    except Exception as e:
        logger.debug("institutional_data_unavailable", symbol=symbol, error=str(e))

    return {"net_position": None, "source": "unavailable"}


async def _get_orderflow_bias(symbol: str) -> dict:
    """Get real-time order flow bias."""
    try:
        from backend.app.data.registry import data_registry
        from backend.app.core.orderbook.flow_analyzer import analyze_order_flow

        ob = await data_registry.fetch_real_orderbook(symbol, 50)
        if ob and ob.bids and ob.asks:
            orderbook = {
                "bids": [{"price": l.price, "quantity": l.quantity} for l in ob.bids],
                "asks": [{"price": l.price, "quantity": l.quantity} for l in ob.asks],
            }
            result = analyze_order_flow(orderbook)
            return {
                "delta": result.get("delta", 0),
                "delta_pct": result.get("delta_pct", 0),
                "imbalance_ratio": result.get("imbalance_ratio", 1),
                "source": "orderbook",
            }
    except Exception as e:
        logger.debug("orderflow_unavailable", symbol=symbol, error=str(e))

    return {"delta": None, "source": "unavailable"}
