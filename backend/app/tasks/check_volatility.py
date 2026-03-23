"""Volatility spike alert checker — runs every 5 minutes via Celery Beat.

Checks if current ATR exceeds the configured threshold × average ATR.
Triggers existing alert infrastructure when a spike is detected.
"""

from backend.app.tasks.celery_app import celery_app
from backend.app.logging_config import get_logger

logger = get_logger("volatility_alert")


@celery_app.task(name="check_volatility_spikes", ignore_result=True)
def check_volatility_spikes():
    """Check for ATR-based volatility spikes and trigger matching alerts."""
    import asyncio
    asyncio.run(_check_volatility_async())


async def _check_volatility_async():
    from sqlalchemy import select
    from backend.app.database import async_session_factory
    from backend.app.models.alert import Alert
    from backend.app.data.registry import data_registry

    try:
        async with async_session_factory() as db:
            # Find all enabled volatility alerts
            result = await db.execute(
                select(Alert).where(
                    Alert.is_enabled == True,
                    Alert.condition.op("->>")(  # type: ignore
                        "indicator"
                    ) == "atr_spike",
                )
            )
            alerts = list(result.scalars().all())

            if not alerts:
                return

            for alert in alerts:
                try:
                    cond = alert.condition or {}
                    symbol = alert.symbol
                    threshold = float(cond.get("threshold", 1.5))
                    tf = cond.get("timeframe", "1h")
                    lookback = int(cond.get("lookback", 20))

                    # Fetch candles
                    adapter = data_registry.route_symbol(symbol)
                    await adapter.connect()
                    try:
                        candles = await adapter.fetch_ohlcv(symbol, tf, lookback + 5)
                    finally:
                        await adapter.disconnect()

                    if not candles or len(candles) < lookback:
                        continue

                    # Compute ATR
                    atrs = []
                    for i, c in enumerate(candles):
                        if i == 0:
                            atrs.append(c.high - c.low)
                            continue
                        tr = max(
                            c.high - c.low,
                            abs(c.high - candles[i - 1].close),
                            abs(c.low - candles[i - 1].close),
                        )
                        atrs.append(tr)

                    avg_atr = sum(atrs[-lookback:]) / lookback
                    current_atr = atrs[-1]

                    if avg_atr > 0 and current_atr > threshold * avg_atr:
                        logger.info(
                            "volatility_spike_detected",
                            symbol=symbol,
                            current_atr=round(current_atr, 4),
                            avg_atr=round(avg_atr, 4),
                            ratio=round(current_atr / avg_atr, 2),
                        )
                        # Trigger via existing alert history mechanism
                        from backend.app.models.alert import AlertHistory
                        from datetime import datetime, timezone

                        history = AlertHistory(
                            alert_id=alert.id,
                            triggered_at=datetime.now(timezone.utc),
                            price_at_trigger=current_atr,
                        )
                        db.add(history)
                        await db.commit()

                except Exception as e:
                    logger.warning("volatility_check_error", alert_id=alert.id, error=str(e))

    except Exception as e:
        logger.error("volatility_task_failed", error=str(e))
