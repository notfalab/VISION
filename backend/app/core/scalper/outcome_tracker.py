"""
Outcome Tracker — monitors open scalper signals against live price,
detects SL/TP hits, and triggers loss analysis.
"""

from datetime import datetime, timezone

from backend.app.logging_config import get_logger

logger = get_logger("scalper.outcome_tracker")


def check_signal_outcome(signal: dict, current_price: float, high: float, low: float) -> dict | None:
    """
    Check if a pending/active signal has been triggered, hit SL, hit TP, or expired.

    Args:
        signal: Signal dict with entry_price, stop_loss, take_profit, direction, status
        current_price: Current market price
        high: High of current candle (for checking TP hits)
        low: Low of current candle (for checking SL hits)

    Returns:
        Updated signal dict with new status, or None if no change
    """
    status = signal.get("status", "pending")
    direction = signal.get("direction", "long")
    entry_price = signal.get("entry_price", 0)
    stop_loss = signal.get("stop_loss", 0)
    take_profit = signal.get("take_profit", 0)
    now = datetime.now(timezone.utc)

    # Check expiry
    expires_at = signal.get("expires_at")
    if expires_at:
        if isinstance(expires_at, str):
            try:
                expires_at = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
            except (ValueError, TypeError):
                expires_at = None

        if expires_at and now > expires_at and status == "pending":
            return {
                **signal,
                "status": "expired",
                "closed_at": now.isoformat(),
            }

    # PENDING → check if entry price hit
    if status == "pending":
        triggered = False
        if direction == "long" and low <= entry_price:
            triggered = True
        elif direction == "short" and high >= entry_price:
            triggered = True

        # Also trigger if price is already at entry (market order style)
        if not triggered:
            if direction == "long" and current_price <= entry_price * 1.001:
                triggered = True
            elif direction == "short" and current_price >= entry_price * 0.999:
                triggered = True

        if triggered:
            return {
                **signal,
                "status": "active",
                "triggered_at": now.isoformat(),
            }

    # ACTIVE → check SL/TP hits
    if status == "active":
        # Track max favorable / adverse excursion
        mfe = signal.get("max_favorable", 0) or 0
        mae = signal.get("max_adverse", 0) or 0

        if direction == "long":
            favorable = high - entry_price
            adverse = entry_price - low
            mfe = max(mfe, favorable)
            mae = max(mae, adverse)

            # Check TP hit (high reached take_profit)
            if high >= take_profit:
                pnl = take_profit - entry_price
                pnl_pct = (pnl / entry_price) * 100
                return {
                    **signal,
                    "status": "win",
                    "exit_price": take_profit,
                    "outcome_pnl": round(pnl, 2),
                    "outcome_pnl_pct": round(pnl_pct, 4),
                    "max_favorable": round(mfe, 2),
                    "max_adverse": round(mae, 2),
                    "closed_at": now.isoformat(),
                }

            # Check SL hit (low reached stop_loss)
            if low <= stop_loss:
                pnl = stop_loss - entry_price  # Negative
                pnl_pct = (pnl / entry_price) * 100
                return {
                    **signal,
                    "status": "loss",
                    "exit_price": stop_loss,
                    "outcome_pnl": round(pnl, 2),
                    "outcome_pnl_pct": round(pnl_pct, 4),
                    "max_favorable": round(mfe, 2),
                    "max_adverse": round(mae, 2),
                    "closed_at": now.isoformat(),
                }

        else:  # SHORT
            favorable = entry_price - low
            adverse = high - entry_price
            mfe = max(mfe, favorable)
            mae = max(mae, adverse)

            # Check TP hit (low reached take_profit)
            if low <= take_profit:
                pnl = entry_price - take_profit
                pnl_pct = (pnl / entry_price) * 100
                return {
                    **signal,
                    "status": "win",
                    "exit_price": take_profit,
                    "outcome_pnl": round(pnl, 2),
                    "outcome_pnl_pct": round(pnl_pct, 4),
                    "max_favorable": round(mfe, 2),
                    "max_adverse": round(mae, 2),
                    "closed_at": now.isoformat(),
                }

            # Check SL hit (high reached stop_loss)
            if high >= stop_loss:
                pnl = entry_price - stop_loss  # Negative
                pnl_pct = (pnl / entry_price) * 100
                return {
                    **signal,
                    "status": "loss",
                    "exit_price": stop_loss,
                    "outcome_pnl": round(pnl, 2),
                    "outcome_pnl_pct": round(pnl_pct, 4),
                    "max_favorable": round(mfe, 2),
                    "max_adverse": round(mae, 2),
                    "closed_at": now.isoformat(),
                }

        # Update MFE/MAE even if no hit
        if mfe != (signal.get("max_favorable") or 0) or mae != (signal.get("max_adverse") or 0):
            return {
                **signal,
                "max_favorable": round(mfe, 2),
                "max_adverse": round(mae, 2),
            }

    return None


def compute_analytics(signals: list[dict]) -> dict:
    """
    Compute performance analytics from completed signals.

    Returns:
        Dict with win_rate, avg_pnl, per-timeframe stats, equity curve
    """
    completed = [s for s in signals if s.get("status") in ("win", "loss")]
    if not completed:
        return {
            "total_signals": len(signals),
            "completed": 0,
            "pending": len([s for s in signals if s.get("status") == "pending"]),
            "active": len([s for s in signals if s.get("status") == "active"]),
            "win_rate": 0,
            "avg_pnl": 0,
            "avg_pnl_pct": 0,
            "total_pnl": 0,
            "best_trade": 0,
            "worst_trade": 0,
            "avg_rr": 0,
            "by_timeframe": {},
            "by_direction": {},
            "equity_curve": [],
        }

    wins = [s for s in completed if s["status"] == "win"]
    losses = [s for s in completed if s["status"] == "loss"]

    pnls = [s.get("outcome_pnl", 0) or 0 for s in completed]
    pnl_pcts = [s.get("outcome_pnl_pct", 0) or 0 for s in completed]

    # Per-timeframe breakdown — discover all timeframes present in signals
    by_tf = {}
    all_timeframes = sorted(set(s.get("timeframe", "") for s in completed if s.get("timeframe")))
    for tf in all_timeframes:
        tf_signals = [s for s in completed if s.get("timeframe") == tf]
        tf_wins = [s for s in tf_signals if s["status"] == "win"]
        if tf_signals:
            by_tf[tf] = {
                "total": len(tf_signals),
                "wins": len(tf_wins),
                "losses": len(tf_signals) - len(tf_wins),
                "win_rate": round(len(tf_wins) / len(tf_signals) * 100, 1),
                "avg_pnl": round(sum(s.get("outcome_pnl", 0) or 0 for s in tf_signals) / len(tf_signals), 2),
            }

    # Per-direction breakdown
    by_dir = {}
    for d in ["long", "short"]:
        d_signals = [s for s in completed if s.get("direction") == d]
        d_wins = [s for s in d_signals if s["status"] == "win"]
        if d_signals:
            by_dir[d] = {
                "total": len(d_signals),
                "wins": len(d_wins),
                "win_rate": round(len(d_wins) / len(d_signals) * 100, 1),
                "avg_pnl": round(sum(s.get("outcome_pnl", 0) or 0 for s in d_signals) / len(d_signals), 2),
            }

    # Equity curve (cumulative PnL)
    equity_curve = []
    cumulative = 0
    for s in sorted(completed, key=lambda x: x.get("closed_at", "")):
        cumulative += s.get("outcome_pnl", 0) or 0
        equity_curve.append({
            "date": s.get("closed_at", ""),
            "pnl": round(cumulative, 2),
        })

    return {
        "total_signals": len(signals),
        "completed": len(completed),
        "wins": len(wins),
        "losses": len(losses),
        "pending": len([s for s in signals if s.get("status") == "pending"]),
        "active": len([s for s in signals if s.get("status") == "active"]),
        "expired": len([s for s in signals if s.get("status") == "expired"]),
        "win_rate": round(len(wins) / len(completed) * 100, 1) if completed else 0,
        "avg_pnl": round(sum(pnls) / len(pnls), 2) if pnls else 0,
        "avg_pnl_pct": round(sum(pnl_pcts) / len(pnl_pcts), 4) if pnl_pcts else 0,
        "total_pnl": round(sum(pnls), 2),
        "best_trade": round(max(pnls), 2) if pnls else 0,
        "worst_trade": round(min(pnls), 2) if pnls else 0,
        "avg_rr": round(
            sum(s.get("risk_reward_ratio", 0) for s in completed) / len(completed), 2
        ) if completed else 0,
        "profit_factor": round(
            sum(p for p in pnls if p > 0) / abs(sum(p for p in pnls if p < 0)), 2
        ) if any(p < 0 for p in pnls) else float("inf"),
        "by_timeframe": by_tf,
        "by_direction": by_dir,
        "equity_curve": equity_curve,
    }
