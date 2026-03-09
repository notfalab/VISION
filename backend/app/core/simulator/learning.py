"""
Learning Engine — adapts signal thresholds and indicator weights
based on rolling win-rate analysis of simulated positions.

Goal: reach and maintain 90%+ consistent win rate by:
1. Raising thresholds when win rate drops below target
2. Boosting weights of indicators that appear in winning trades
3. Reducing weights of indicators that appear in losing trades
4. Skipping regimes with consistently poor performance
"""

from datetime import datetime, timezone

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.logging_config import get_logger
from backend.app.models.learning_state import (
    DEFAULT_MIN_CONFLUENCE,
    DEFAULT_MIN_CONFIDENCE,
    DEFAULT_MIN_SCORE,
    DEFAULT_WEIGHTS,
    LearningState,
)
from backend.app.models.simulated_position import PositionStatus, SimulatedPosition

logger = get_logger("simulator.learning")

# Clamp ranges
MIN_CONFIDENCE_FLOOR = 0.50
MIN_CONFIDENCE_CEIL = 0.95
MIN_SCORE_FLOOR = 50.0
MIN_SCORE_CEIL = 95.0
WEIGHT_FLOOR = 0.25
WEIGHT_CEIL = 4.0

# Minimum trades before adjustments kick in
MIN_TRADES_FOR_ADJUSTMENT = 20


async def get_or_create_active_state(db: AsyncSession) -> LearningState:
    """Load the active LearningState, or create v1 defaults if none exists."""
    result = await db.execute(
        select(LearningState)
        .where(LearningState.is_active.is_(True))
        .order_by(LearningState.version.desc())
        .limit(1)
    )
    state = result.scalar_one_or_none()

    if state is None:
        state = LearningState(
            version=1,
            min_confidence=DEFAULT_MIN_CONFIDENCE,
            min_composite_score=DEFAULT_MIN_SCORE,
            min_confluence=DEFAULT_MIN_CONFLUENCE,
            indicator_weights=dict(DEFAULT_WEIGHTS),
            feature_importance={},
            skip_regimes=[],
            is_active=True,
            adjustments_log=[],
        )
        db.add(state)
        await db.flush()
        logger.info("learning_state_created", version=1)

    return state


async def update_learning_state(db: AsyncSession) -> LearningState | None:
    """
    Analyze recent closed positions and create a new LearningState version
    with adjusted thresholds and weights.

    Returns the new LearningState, or None if not enough data.
    """
    # Query last 200 closed positions (wins + losses only)
    result = await db.execute(
        select(SimulatedPosition)
        .where(SimulatedPosition.status.in_([PositionStatus.WIN, PositionStatus.LOSS]))
        .order_by(SimulatedPosition.closed_at.desc())
        .limit(200)
    )
    closed = list(result.scalars().all())

    if len(closed) < MIN_TRADES_FOR_ADJUSTMENT:
        logger.info(
            "learning_skip_insufficient_data",
            closed_count=len(closed),
            min_required=MIN_TRADES_FOR_ADJUSTMENT,
        )
        return None

    # Get current active state
    current = await get_or_create_active_state(db)

    # Calculate rolling win rates
    wins_all = [p for p in closed if p.status == PositionStatus.WIN]
    losses_all = [p for p in closed if p.status == PositionStatus.LOSS]

    last_50 = closed[:50]
    wins_50 = sum(1 for p in last_50 if p.status == PositionStatus.WIN)
    wr_50 = wins_50 / len(last_50) if last_50 else 0.0

    wr_200 = len(wins_all) / len(closed) if closed else 0.0

    adjustments = []

    # ── Threshold Adjustment ──
    new_confidence = current.min_confidence
    new_score = current.min_composite_score
    new_confluence = current.min_confluence

    if wr_50 < 0.60:
        new_confidence += 0.05
        new_score += 5
        new_confluence += 1
        adjustments.append(f"wr50={wr_50:.0%} < 60% → confidence +0.05, score +5, confluence +1")
    elif wr_50 < 0.70:
        new_confidence += 0.03
        new_score += 3
        adjustments.append(f"wr50={wr_50:.0%} < 70% → confidence +0.03, score +3")
    elif wr_50 < 0.80:
        new_confidence += 0.01
        new_score += 1
        adjustments.append(f"wr50={wr_50:.0%} < 80% → confidence +0.01, score +1")
    elif wr_50 > 0.92:
        # Very high win rate — we can afford to take more trades
        new_confidence -= 0.01
        new_score -= 1
        adjustments.append(f"wr50={wr_50:.0%} > 92% → confidence -0.01, score -1 (expand)")

    new_confidence = max(MIN_CONFIDENCE_FLOOR, min(MIN_CONFIDENCE_CEIL, new_confidence))
    new_score = max(MIN_SCORE_FLOOR, min(MIN_SCORE_CEIL, new_score))
    new_confluence = max(4, min(10, new_confluence))

    # ── Indicator Weight Adjustment ──
    weights = dict(current.indicator_weights or DEFAULT_WEIGHTS)
    indicator_win_count: dict[str, int] = {}
    indicator_loss_count: dict[str, int] = {}

    for pos in closed[:100]:  # Last 100 trades for weight analysis
        reasons = pos.signal_reasons or {}
        indicators_used = [
            k for k, v in reasons.items()
            if isinstance(v, dict) and v.get("weight", 0) > 0
        ]
        if not indicators_used:
            # Fallback: use indicator_snapshot keys
            snapshot = pos.indicator_snapshot or {}
            indicators_used = list(snapshot.keys())

        if pos.status == PositionStatus.WIN:
            for ind in indicators_used:
                indicator_win_count[ind] = indicator_win_count.get(ind, 0) + 1
        else:
            for ind in indicators_used:
                indicator_loss_count[ind] = indicator_loss_count.get(ind, 0) + 1

    # Adjust weights based on win/loss ratio per indicator
    weight_changes = []
    for ind in set(list(indicator_win_count.keys()) + list(indicator_loss_count.keys())):
        if ind not in weights:
            continue
        w_count = indicator_win_count.get(ind, 0)
        l_count = indicator_loss_count.get(ind, 0)
        total = w_count + l_count
        if total < 5:
            continue  # Not enough data for this indicator

        ind_wr = w_count / total
        old_weight = weights[ind]

        if ind_wr > 0.80:
            weights[ind] += 0.10
            weight_changes.append(f"{ind}: +0.10 (wr={ind_wr:.0%})")
        elif ind_wr > 0.65:
            weights[ind] += 0.05
            weight_changes.append(f"{ind}: +0.05 (wr={ind_wr:.0%})")
        elif ind_wr < 0.40:
            weights[ind] -= 0.10
            weight_changes.append(f"{ind}: -0.10 (wr={ind_wr:.0%})")
        elif ind_wr < 0.50:
            weights[ind] -= 0.05
            weight_changes.append(f"{ind}: -0.05 (wr={ind_wr:.0%})")

        weights[ind] = max(WEIGHT_FLOOR, min(WEIGHT_CEIL, weights[ind]))

    if weight_changes:
        adjustments.append("weights: " + ", ".join(weight_changes))

    # ── Feature Importance ──
    feature_importance = {}
    for ind in weights:
        w_count = indicator_win_count.get(ind, 0)
        l_count = indicator_loss_count.get(ind, 0)
        total = w_count + l_count
        if total > 0:
            feature_importance[ind] = {
                "win_rate": round(w_count / total, 3),
                "total_appearances": total,
                "weight": weights[ind],
            }

    # ── Regime Filter ──
    regime_stats: dict[str, dict] = {}
    for pos in closed[:100]:
        regime = pos.regime or "unknown"
        if regime not in regime_stats:
            regime_stats[regime] = {"wins": 0, "losses": 0}
        if pos.status == PositionStatus.WIN:
            regime_stats[regime]["wins"] += 1
        else:
            regime_stats[regime]["losses"] += 1

    skip_regimes = list(current.skip_regimes or [])
    for regime, stats in regime_stats.items():
        total = stats["wins"] + stats["losses"]
        if total < 10:
            continue
        regime_wr = stats["wins"] / total
        if regime_wr < 0.45 and regime not in skip_regimes:
            skip_regimes.append(regime)
            adjustments.append(
                f"skip regime '{regime}' (wr={regime_wr:.0%}, n={total})"
            )
        elif regime_wr >= 0.65 and regime in skip_regimes:
            skip_regimes.remove(regime)
            adjustments.append(
                f"un-skip regime '{regime}' (wr={regime_wr:.0%}, improved)"
            )

    # ── No changes? Don't create a new version ──
    if not adjustments:
        logger.info("learning_no_adjustments_needed", wr_50=f"{wr_50:.0%}", wr_200=f"{wr_200:.0%}")
        return current

    # ── Deactivate current, create new version ──
    await db.execute(
        update(LearningState)
        .where(LearningState.is_active.is_(True))
        .values(is_active=False)
    )

    new_version = current.version + 1
    new_state = LearningState(
        version=new_version,
        min_confidence=round(new_confidence, 3),
        min_composite_score=round(new_score, 1),
        min_confluence=new_confluence,
        indicator_weights=weights,
        feature_importance=feature_importance,
        skip_regimes=skip_regimes,
        rolling_win_rate_50=round(wr_50, 4),
        rolling_win_rate_200=round(wr_200, 4),
        total_trades=len(closed),
        total_wins=len(wins_all),
        total_losses=len(losses_all),
        adjustments_log=adjustments,
        is_active=True,
    )
    db.add(new_state)
    await db.flush()

    logger.info(
        "learning_state_updated",
        version=new_version,
        wr_50=f"{wr_50:.0%}",
        wr_200=f"{wr_200:.0%}",
        adjustments=adjustments,
        min_confidence=new_state.min_confidence,
        min_score=new_state.min_composite_score,
    )

    return new_state


async def reset_learning_state(db: AsyncSession) -> LearningState:
    """Reset to default v1 state. Used by admin."""
    await db.execute(
        update(LearningState)
        .where(LearningState.is_active.is_(True))
        .values(is_active=False)
    )

    # Find max version for proper sequencing
    result = await db.execute(
        select(LearningState.version)
        .order_by(LearningState.version.desc())
        .limit(1)
    )
    max_version = result.scalar_one_or_none() or 0

    state = LearningState(
        version=max_version + 1,
        min_confidence=DEFAULT_MIN_CONFIDENCE,
        min_composite_score=DEFAULT_MIN_SCORE,
        min_confluence=DEFAULT_MIN_CONFLUENCE,
        indicator_weights=dict(DEFAULT_WEIGHTS),
        feature_importance={},
        skip_regimes=[],
        is_active=True,
        adjustments_log=["RESET to defaults"],
    )
    db.add(state)
    await db.flush()

    logger.info("learning_state_reset", new_version=state.version)
    return state
