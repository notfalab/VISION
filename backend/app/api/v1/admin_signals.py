"""Admin Signal Simulator API — dashboard, positions, history, journal, learning."""

from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.api.deps import get_db, require_admin
from backend.app.models.daily_journal import DailyJournal
from backend.app.models.learning_state import LearningState
from backend.app.models.simulated_position import (
    PositionDirection,
    PositionStatus,
    SimulatedPosition,
)
from backend.app.models.user import User

router = APIRouter(prefix="/admin/signals", tags=["admin-signals"])


@router.get("/dashboard")
async def signals_dashboard(
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Top-level KPIs for the signal simulator."""
    # Active learning state
    state_result = await db.execute(
        select(LearningState)
        .where(LearningState.is_active.is_(True))
        .limit(1)
    )
    state = state_result.scalar_one_or_none()

    # Open positions count
    open_count = await db.scalar(
        select(func.count())
        .select_from(SimulatedPosition)
        .where(SimulatedPosition.status == PositionStatus.OPEN)
    )

    # Today's stats
    today = date.today()
    today_start = datetime.combine(today, datetime.min.time()).replace(tzinfo=timezone.utc)

    today_closed = await db.scalar(
        select(func.count())
        .select_from(SimulatedPosition)
        .where(
            SimulatedPosition.closed_at >= today_start,
            SimulatedPosition.status.in_([PositionStatus.WIN, PositionStatus.LOSS]),
        )
    )
    today_wins = await db.scalar(
        select(func.count())
        .select_from(SimulatedPosition)
        .where(
            SimulatedPosition.closed_at >= today_start,
            SimulatedPosition.status == PositionStatus.WIN,
        )
    )
    today_pnl = await db.scalar(
        select(func.coalesce(func.sum(SimulatedPosition.pnl), 0))
        .where(
            SimulatedPosition.closed_at >= today_start,
            SimulatedPosition.status.in_([PositionStatus.WIN, PositionStatus.LOSS]),
        )
    )

    # All-time stats
    total_closed = await db.scalar(
        select(func.count())
        .select_from(SimulatedPosition)
        .where(SimulatedPosition.status.in_([PositionStatus.WIN, PositionStatus.LOSS]))
    )
    total_wins_count = await db.scalar(
        select(func.count())
        .select_from(SimulatedPosition)
        .where(SimulatedPosition.status == PositionStatus.WIN)
    )
    total_pnl = await db.scalar(
        select(func.coalesce(func.sum(SimulatedPosition.pnl), 0))
        .where(SimulatedPosition.status.in_([PositionStatus.WIN, PositionStatus.LOSS]))
    )

    # Equity curve (cumulative PnL by closed_at, limited to last 500)
    eq_result = await db.execute(
        select(SimulatedPosition.closed_at, SimulatedPosition.pnl)
        .where(
            SimulatedPosition.status.in_([PositionStatus.WIN, PositionStatus.LOSS]),
            SimulatedPosition.pnl.is_not(None),
        )
        .order_by(SimulatedPosition.closed_at)
        .limit(500)
    )
    equity_rows = eq_result.all()
    cumulative = 0.0
    equity_curve = []
    for row in equity_rows:
        cumulative += float(row.pnl or 0)
        equity_curve.append({
            "date": row.closed_at.isoformat() if row.closed_at else "",
            "pnl": round(cumulative, 2),
        })

    all_time_wr = (
        round(total_wins_count / total_closed * 100, 1) if total_closed else 0
    )

    return {
        "learning": {
            "version": state.version if state else 0,
            "min_confidence": state.min_confidence if state else 0,
            "min_composite_score": state.min_composite_score if state else 0,
            "min_confluence": state.min_confluence if state else 0,
            "rolling_win_rate_50": state.rolling_win_rate_50 if state else 0,
            "rolling_win_rate_200": state.rolling_win_rate_200 if state else 0,
        },
        "open_positions": open_count or 0,
        "today": {
            "trades": today_closed or 0,
            "wins": today_wins or 0,
            "pnl": round(float(today_pnl or 0), 2),
            "win_rate": round(today_wins / today_closed * 100, 1) if today_closed else 0,
        },
        "all_time": {
            "total_trades": total_closed or 0,
            "wins": total_wins_count or 0,
            "losses": (total_closed or 0) - (total_wins_count or 0),
            "win_rate": all_time_wr,
            "total_pnl": round(float(total_pnl or 0), 2),
        },
        "equity_curve": equity_curve,
    }


@router.get("/positions")
async def signals_positions(
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
    status: str | None = Query(None),
    symbol: str | None = Query(None),
    limit: int = Query(50, le=200),
):
    """List simulated positions, optionally filtered."""
    query = select(SimulatedPosition).order_by(SimulatedPosition.opened_at.desc())

    if status:
        try:
            st = PositionStatus(status)
            query = query.where(SimulatedPosition.status == st)
        except ValueError:
            pass

    if symbol:
        query = query.where(SimulatedPosition.symbol == symbol.upper())

    query = query.limit(limit)
    result = await db.execute(query)
    positions = result.scalars().all()

    return [_serialize_position(p) for p in positions]


@router.get("/history")
async def signals_history(
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
    symbol: str | None = Query(None),
    outcome: str | None = Query(None),
    date_from: date | None = Query(None, alias="from"),
    date_to: date | None = Query(None, alias="to"),
    page: int = Query(1, ge=1),
    limit: int = Query(50, le=200),
):
    """Paginated closed position history."""
    query = (
        select(SimulatedPosition)
        .where(
            SimulatedPosition.status.in_([
                PositionStatus.WIN,
                PositionStatus.LOSS,
                PositionStatus.EXPIRED,
            ])
        )
        .order_by(SimulatedPosition.closed_at.desc())
    )

    if symbol:
        query = query.where(SimulatedPosition.symbol == symbol.upper())
    if outcome:
        try:
            query = query.where(SimulatedPosition.status == PositionStatus(outcome))
        except ValueError:
            pass
    if date_from:
        dt_from = datetime.combine(date_from, datetime.min.time()).replace(tzinfo=timezone.utc)
        query = query.where(SimulatedPosition.closed_at >= dt_from)
    if date_to:
        dt_to = datetime.combine(date_to, datetime.max.time()).replace(tzinfo=timezone.utc)
        query = query.where(SimulatedPosition.closed_at <= dt_to)

    offset = (page - 1) * limit
    query = query.offset(offset).limit(limit)

    result = await db.execute(query)
    positions = result.scalars().all()

    return {
        "page": page,
        "limit": limit,
        "results": [_serialize_position(p) for p in positions],
    }


@router.get("/journal")
async def signals_journal(
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
    date_from: date | None = Query(None, alias="from"),
    date_to: date | None = Query(None, alias="to"),
    limit: int = Query(30, le=100),
):
    """Daily journal entries."""
    query = select(DailyJournal).order_by(DailyJournal.date.desc())

    if date_from:
        query = query.where(DailyJournal.date >= date_from)
    if date_to:
        query = query.where(DailyJournal.date <= date_to)

    query = query.limit(limit)
    result = await db.execute(query)
    journals = result.scalars().all()

    return [
        {
            "id": j.id,
            "date": str(j.date),
            "total_trades": j.total_trades,
            "wins": j.wins,
            "losses": j.losses,
            "expired": j.expired,
            "win_rate": j.win_rate,
            "total_pnl": j.total_pnl,
            "best_trade_pnl": j.best_trade_pnl,
            "worst_trade_pnl": j.worst_trade_pnl,
            "avg_confidence": j.avg_confidence,
            "avg_rr": j.avg_rr,
            "symbols_traded": j.symbols_traded,
            "regime_breakdown": j.regime_breakdown,
            "learning_version": j.learning_version,
            "notes": j.notes,
        }
        for j in journals
    ]


@router.get("/learning")
async def signals_learning(
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """All learning state versions (shows evolution)."""
    result = await db.execute(
        select(LearningState).order_by(LearningState.version.desc()).limit(50)
    )
    states = result.scalars().all()

    return [
        {
            "id": s.id,
            "version": s.version,
            "min_confidence": s.min_confidence,
            "min_composite_score": s.min_composite_score,
            "min_confluence": s.min_confluence,
            "indicator_weights": s.indicator_weights,
            "feature_importance": s.feature_importance,
            "skip_regimes": s.skip_regimes,
            "rolling_win_rate_50": s.rolling_win_rate_50,
            "rolling_win_rate_200": s.rolling_win_rate_200,
            "total_trades": s.total_trades,
            "total_wins": s.total_wins,
            "total_losses": s.total_losses,
            "adjustments_log": s.adjustments_log,
            "is_active": s.is_active,
            "created_at": s.created_at.isoformat() if s.created_at else "",
        }
        for s in states
    ]


@router.post("/learning/reset")
async def signals_learning_reset(
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Reset learning state to defaults."""
    from backend.app.core.simulator.learning import reset_learning_state

    new_state = await reset_learning_state(db)
    await db.commit()

    return {
        "message": "Learning state reset to defaults",
        "version": new_state.version,
    }


def _serialize_position(p: SimulatedPosition) -> dict:
    return {
        "id": p.id,
        "symbol": p.symbol,
        "timeframe": p.timeframe,
        "direction": p.direction.value,
        "status": p.status.value,
        "entry_price": p.entry_price,
        "stop_loss": p.stop_loss,
        "take_profit": p.take_profit,
        "exit_price": p.exit_price,
        "risk_reward_ratio": p.risk_reward_ratio,
        "confidence": p.confidence,
        "composite_score": p.composite_score,
        "ml_confidence": p.ml_confidence,
        "regime": p.regime,
        "signal_reasons": p.signal_reasons,
        "indicator_snapshot": p.indicator_snapshot,
        "pnl": p.pnl,
        "pnl_pct": p.pnl_pct,
        "max_favorable": p.max_favorable,
        "max_adverse": p.max_adverse,
        "loss_category": p.loss_category,
        "loss_analysis": p.loss_analysis,
        "mtf_confluence": p.mtf_confluence,
        "learning_version": p.learning_version,
        "opened_at": p.opened_at.isoformat() if p.opened_at else None,
        "closed_at": p.closed_at.isoformat() if p.closed_at else None,
        "expires_at": p.expires_at.isoformat() if p.expires_at else None,
    }
