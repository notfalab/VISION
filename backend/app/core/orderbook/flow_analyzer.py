"""Order Flow Analysis — detect institutional buy/sell pressure from order book data."""

from datetime import datetime, timezone

from backend.app.logging_config import get_logger

logger = get_logger("orderbook.flow")


def analyze_order_flow(orderbook: dict) -> dict:
    """
    Analyze order book for institutional flow signals.

    Args:
        orderbook: dict with 'bids' and 'asks' lists of {price, quantity}

    Returns:
        dict with delta, imbalance, absorption zones, signals
    """
    bids = orderbook.get("bids", [])
    asks = orderbook.get("asks", [])

    if not bids or not asks:
        return {"error": "Empty order book"}

    # === BID/ASK VOLUME TOTALS ===
    total_bid_vol = sum(b["quantity"] for b in bids)
    total_ask_vol = sum(a["quantity"] for a in asks)
    total_vol = total_bid_vol + total_ask_vol

    # === DELTA: Buy pressure - Sell pressure ===
    delta = total_bid_vol - total_ask_vol
    delta_pct = delta / max(total_vol, 1e-10) * 100

    # === IMBALANCE RATIO ===
    imbalance = total_bid_vol / max(total_ask_vol, 1e-10)

    # === WALL DETECTION: Find large orders (> 3x average) ===
    avg_bid_size = total_bid_vol / max(len(bids), 1)
    avg_ask_size = total_ask_vol / max(len(asks), 1)

    buy_walls = []
    for b in bids:
        if b["quantity"] > avg_bid_size * 3:
            buy_walls.append({
                "price": b["price"],
                "quantity": b["quantity"],
                "strength": round(b["quantity"] / avg_bid_size, 1),
            })

    sell_walls = []
    for a in asks:
        if a["quantity"] > avg_ask_size * 3:
            sell_walls.append({
                "price": a["price"],
                "quantity": a["quantity"],
                "strength": round(a["quantity"] / avg_ask_size, 1),
            })

    # === ABSORPTION DETECTION ===
    # Absorption = one side has large orders concentrated at specific levels
    # indicating institutional interest
    bid_concentration = max((b["quantity"] for b in bids), default=0) / max(avg_bid_size, 1e-10)
    ask_concentration = max((a["quantity"] for a in asks), default=0) / max(avg_ask_size, 1e-10)

    absorption_signals = []
    if bid_concentration > 5:
        absorption_signals.append({
            "type": "bid_absorption",
            "description": "Heavy buying at support — institutional accumulation",
            "strength": min(1.0, bid_concentration / 10),
        })
    if ask_concentration > 5:
        absorption_signals.append({
            "type": "ask_absorption",
            "description": "Heavy selling at resistance — institutional distribution",
            "strength": min(1.0, ask_concentration / 10),
        })

    # === SPREAD ANALYSIS ===
    best_bid = bids[0]["price"] if bids else 0
    best_ask = asks[0]["price"] if asks else 0
    spread = best_ask - best_bid
    spread_pct = spread / max(best_bid, 1e-10) * 100

    # === DEPTH IMBALANCE BY LEVEL ===
    # Compare bid/ask volume at each depth level (top 10)
    depth_imbalances = []
    for i in range(min(10, len(bids), len(asks))):
        bid_q = bids[i]["quantity"]
        ask_q = asks[i]["quantity"]
        level_delta = bid_q - ask_q
        depth_imbalances.append({
            "level": i + 1,
            "bid_price": bids[i]["price"],
            "ask_price": asks[i]["price"],
            "bid_qty": round(bid_q, 2),
            "ask_qty": round(ask_q, 2),
            "delta": round(level_delta, 2),
        })

    # === OVERALL SIGNAL ===
    if delta_pct > 15 and imbalance > 1.5:
        signal = "strong_buy_pressure"
        signal_strength = min(1.0, delta_pct / 30)
    elif delta_pct > 5:
        signal = "buy_pressure"
        signal_strength = min(0.8, delta_pct / 20)
    elif delta_pct < -15 and imbalance < 0.67:
        signal = "strong_sell_pressure"
        signal_strength = min(1.0, abs(delta_pct) / 30)
    elif delta_pct < -5:
        signal = "sell_pressure"
        signal_strength = min(0.8, abs(delta_pct) / 20)
    else:
        signal = "balanced"
        signal_strength = 0.3

    return {
        "delta": round(delta, 2),
        "delta_pct": round(delta_pct, 2),
        "imbalance_ratio": round(imbalance, 3),
        "total_bid_volume": round(total_bid_vol, 2),
        "total_ask_volume": round(total_ask_vol, 2),
        "spread": round(spread, 4),
        "spread_pct": round(spread_pct, 4),
        "signal": signal,
        "signal_strength": round(signal_strength, 3),
        "buy_walls": buy_walls[:5],
        "sell_walls": sell_walls[:5],
        "absorption": absorption_signals,
        "depth_imbalances": depth_imbalances,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
