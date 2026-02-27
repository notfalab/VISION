"""Scalper Mode endpoints — signal generation, journal, analytics, loss learning."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, desc, func
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.api.deps import get_db
from backend.app.models.asset import Asset
from backend.app.models.ohlcv import OHLCVData, Timeframe

router = APIRouter(prefix="/scalper", tags=["scalper"])

# Valid scalper timeframes
SCALPER_TIMEFRAMES = {"5m": Timeframe.M5, "15m": Timeframe.M15, "30m": Timeframe.M30}


async def _fetch_ohlcv_df(db: AsyncSession, symbol: str, timeframe: str, limit: int = 500):
    """Fetch OHLCV data as DataFrame for signal engine."""
    import pandas as pd

    result = await db.execute(select(Asset).where(Asset.symbol == symbol.upper()))
    asset = result.scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=404, detail=f"Asset {symbol} not found")

    try:
        tf = Timeframe(timeframe)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid timeframe: {timeframe}")

    query = (
        select(OHLCVData)
        .where(OHLCVData.asset_id == asset.id, OHLCVData.timeframe == tf)
        .order_by(OHLCVData.timestamp.desc())
        .limit(limit)
    )
    rows = await db.execute(query)
    ohlcv_list = rows.scalars().all()

    if len(ohlcv_list) < 50:
        return None

    return pd.DataFrame([{
        "timestamp": r.timestamp,
        "open": float(r.open),
        "high": float(r.high),
        "low": float(r.low),
        "close": float(r.close),
        "volume": float(r.volume),
    } for r in reversed(ohlcv_list)])


# ── In-memory signal store (MVP — will migrate to DB later) ──
_signal_store: list[dict] = []


def _get_signals(symbol: str | None = None, status: str | None = None, timeframe: str | None = None) -> list[dict]:
    """Filter signals from store."""
    results = _signal_store
    if symbol:
        results = [s for s in results if s.get("symbol") == symbol.upper()]
    if status:
        results = [s for s in results if s.get("status") == status]
    if timeframe:
        results = [s for s in results if s.get("timeframe") == timeframe]
    return results


def _save_signal(signal: dict):
    """Save signal to store."""
    signal["id"] = len(_signal_store) + 1
    _signal_store.append(signal)
    return signal


def _update_signal(signal_id: int, updates: dict):
    """Update signal in store."""
    for s in _signal_store:
        if s.get("id") == signal_id:
            s.update(updates)
            return s
    return None


@router.get("/{symbol}/scan")
async def scan_signals(
    symbol: str,
    timeframe: str = Query("15m", description="5m, 15m, or 30m"),
    db: AsyncSession = Depends(get_db),
):
    """
    Run the signal engine NOW for a specific timeframe.
    Returns any generated signals without saving them.
    """
    from backend.app.core.scalper.signal_engine import generate_signals
    from backend.app.core.scalper.loss_learning import get_active_loss_filters

    if timeframe not in SCALPER_TIMEFRAMES:
        raise HTTPException(status_code=400, detail=f"Invalid scalper timeframe: {timeframe}. Use 5m, 15m, or 30m")

    # Fetch OHLCV data
    df = await _fetch_ohlcv_df(db, symbol, timeframe, limit=500)
    if df is None or len(df) < 50:
        # Try to fetch from data source
        try:
            from backend.app.data.ingestion import ingest_ohlcv
            count = await ingest_ohlcv(symbol, timeframe, limit=500)
            if count > 0:
                df = await _fetch_ohlcv_df(db, symbol, timeframe, limit=500)
        except Exception as e:
            raise HTTPException(
                status_code=400,
                detail=f"Not enough data for {symbol} {timeframe}. Need 50+ candles. Try POST /prices/{symbol}/fetch?timeframe={timeframe} first. Error: {str(e)}"
            )

    if df is None or len(df) < 50:
        raise HTTPException(
            status_code=400,
            detail=f"Not enough data for {symbol} {timeframe}. Need 50+ candles, got {len(df) if df is not None else 0}."
        )

    # Get active loss patterns
    existing_signals = _get_signals(symbol=symbol)
    loss_patterns = get_active_loss_filters(existing_signals)

    # Generate signals
    signals = generate_signals(df, symbol, timeframe, loss_patterns)

    return {
        "symbol": symbol.upper(),
        "timeframe": timeframe,
        "signals": signals,
        "total": len(signals),
        "loss_filters_active": len(loss_patterns),
        "candles_analyzed": len(df),
        "scanned_at": datetime.now(timezone.utc).isoformat(),
    }


@router.post("/{symbol}/scan")
async def scan_and_save(
    symbol: str,
    db: AsyncSession = Depends(get_db),
):
    """
    Force scan ALL 3 scalper timeframes (5m, 15m, 30m),
    save any generated signals, and check MTF confluence.
    """
    from backend.app.core.scalper.signal_engine import scan_multi_timeframe
    from backend.app.core.scalper.loss_learning import get_active_loss_filters

    # Fetch data for all timeframes
    dataframes = {}
    for tf in ["5m", "15m", "30m"]:
        df = await _fetch_ohlcv_df(db, symbol, tf, limit=500)
        if df is not None and len(df) >= 50:
            dataframes[tf] = df

    if not dataframes:
        raise HTTPException(
            status_code=400,
            detail=f"No data available for {symbol} on any scalper timeframe. "
                   f"Fetch data first: POST /prices/{symbol}/fetch?timeframe=5m"
        )

    # Get loss patterns
    existing = _get_signals(symbol=symbol)
    loss_patterns = get_active_loss_filters(existing)

    # Scan all timeframes
    signals = scan_multi_timeframe(dataframes, symbol, loss_patterns)

    # Save signals and notify via Telegram
    saved = []
    for sig in signals:
        saved_sig = _save_signal(sig)
        saved.append(saved_sig)

        # Send Telegram notification for each signal
        try:
            from backend.app.notifications.telegram import notify_signal
            await notify_signal(sig)
        except Exception:
            pass  # Don't fail scan if notification fails

    # Update active signals against current price
    _check_active_signals(symbol, dataframes)

    return {
        "symbol": symbol.upper(),
        "timeframes_scanned": list(dataframes.keys()),
        "signals_generated": len(saved),
        "signals": saved,
        "loss_filters_active": len(loss_patterns),
        "scanned_at": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/{symbol}/signals")
async def get_signals(
    symbol: str,
    status: str | None = Query(None, description="Filter: pending, active, win, loss, expired"),
    timeframe: str | None = Query(None, description="Filter: 5m, 15m, 30m"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    """Get signal history with optional filters."""
    signals = _get_signals(symbol=symbol, status=status, timeframe=timeframe)

    # Sort by generated_at descending
    signals.sort(key=lambda s: s.get("generated_at", ""), reverse=True)

    total = len(signals)
    page = signals[offset:offset + limit]

    return {
        "symbol": symbol.upper(),
        "signals": page,
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.get("/{symbol}/signals/{signal_id}")
async def get_signal_detail(symbol: str, signal_id: int):
    """Get a single signal with full analysis."""
    for s in _signal_store:
        if s.get("id") == signal_id and s.get("symbol") == symbol.upper():
            return s

    raise HTTPException(status_code=404, detail=f"Signal {signal_id} not found")


@router.get("/{symbol}/journal")
async def get_journal(
    symbol: str,
    limit: int = Query(50, ge=1, le=200),
):
    """
    Journal view — all completed signals with outcomes.
    Shows wins/losses/expired with P&L and analysis.
    """
    signals = _get_signals(symbol=symbol)
    completed = [
        s for s in signals
        if s.get("status") in ("win", "loss", "expired")
    ]

    # Sort by closed_at descending
    completed.sort(key=lambda s: s.get("closed_at", s.get("generated_at", "")), reverse=True)

    # Add loss analysis to losses that don't have it
    from backend.app.core.scalper.loss_learning import categorize_loss
    for s in completed:
        if s.get("status") == "loss" and not s.get("loss_analysis"):
            analysis = categorize_loss(s)
            s["loss_analysis"] = analysis
            s["loss_category"] = analysis["category"]

    return {
        "symbol": symbol.upper(),
        "entries": completed[:limit],
        "total": len(completed),
        "summary": {
            "wins": len([s for s in completed if s["status"] == "win"]),
            "losses": len([s for s in completed if s["status"] == "loss"]),
            "expired": len([s for s in completed if s["status"] == "expired"]),
        },
    }


@router.get("/{symbol}/analytics")
async def get_analytics(symbol: str):
    """
    Performance analytics — win rate, P&L, per-timeframe stats,
    equity curve data, profit factor.
    """
    from backend.app.core.scalper.outcome_tracker import compute_analytics

    signals = _get_signals(symbol=symbol)
    analytics = compute_analytics(signals)

    return {
        "symbol": symbol.upper(),
        **analytics,
    }


@router.get("/{symbol}/loss-patterns")
async def get_loss_patterns(symbol: str):
    """
    Loss learning analysis — identifies recurring loss patterns,
    categorizes WHY losses happen, and provides adaptive recommendations.
    """
    from backend.app.core.scalper.loss_learning import analyze_loss_patterns, categorize_loss

    signals = _get_signals(symbol=symbol)

    # Ensure all losses have analysis
    for s in signals:
        if s.get("status") == "loss" and not s.get("loss_analysis"):
            analysis = categorize_loss(s)
            s["loss_analysis"] = analysis
            s["loss_category"] = analysis["category"]

    result = analyze_loss_patterns(signals)

    return {
        "symbol": symbol.upper(),
        **result,
    }


@router.get("/telegram/setup")
async def telegram_setup():
    """
    Helper: get your Telegram chat_id.
    1. Send any message to your bot on Telegram
    2. Call this endpoint — it returns your chat_id
    3. Set TELEGRAM_CHAT_ID in .env
    """
    from backend.app.notifications.telegram import get_chat_id, send_message

    chat_id = await get_chat_id()
    if not chat_id:
        return {
            "status": "waiting",
            "message": "Send any message to your bot on Telegram first, then call this endpoint again.",
        }

    # Try sending a test message
    test_sent = await send_message(
        "✅ <b>VISION Bot conectado!</b>\n\nRecibirás señales de scalping aquí.",
    )

    return {
        "status": "ok",
        "chat_id": chat_id,
        "test_message_sent": test_sent,
        "instruction": f"Add TELEGRAM_CHAT_ID={chat_id} to your .env file",
    }


@router.post("/telegram/test")
async def telegram_test():
    """Send a test signal notification to verify Telegram is working."""
    from backend.app.notifications.telegram import send_message

    test_msg = """
🧪 <b>TEST — VISION Scalper</b>
━━━━━━━━━━━━━━━━━━━━

🟢 BUY XAUUSD @ 2,650.30
🛑 SL: 2,645.80
🎯 TP: 2,658.00
📈 Confidence: 73%

✅ Telegram notifications working!
"""
    sent = await send_message(test_msg.strip())

    return {
        "status": "sent" if sent else "failed",
        "message": "Check your Telegram!" if sent else "Failed to send. Verify TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID",
    }


def _check_active_signals(symbol: str, dataframes: dict):
    """Check active/pending signals against current prices."""
    from backend.app.core.scalper.outcome_tracker import check_signal_outcome
    from backend.app.core.scalper.loss_learning import categorize_loss

    active_signals = _get_signals(symbol=symbol, status="active") + _get_signals(symbol=symbol, status="pending")

    for sig in active_signals:
        tf = sig.get("timeframe", "15m")
        df = dataframes.get(tf)
        if df is None or len(df) == 0:
            continue

        current_price = float(df["close"].iloc[-1])
        high = float(df["high"].iloc[-1])
        low = float(df["low"].iloc[-1])

        update = check_signal_outcome(sig, current_price, high, low)
        if update:
            old_status = sig.get("status")
            sig.update(update)

            # If it's a loss, run loss analysis
            if update.get("status") == "loss":
                analysis = categorize_loss(sig)
                sig["loss_analysis"] = analysis
                sig["loss_category"] = analysis["category"]

            # Notify outcome via Telegram (win or loss)
            new_status = update.get("status")
            if new_status in ("win", "loss") and old_status != new_status:
                try:
                    import asyncio
                    from backend.app.notifications.telegram import notify_outcome
                    asyncio.create_task(notify_outcome(sig))
                except Exception:
                    pass
