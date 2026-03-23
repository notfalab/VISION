"""COT change alert checker — runs weekly after COT data refresh.

Checks if managed money net position changed by more than the
configured threshold. Triggers existing alert infrastructure.
"""

from backend.app.tasks.celery_app import celery_app
from backend.app.logging_config import get_logger

logger = get_logger("cot_alert")


@celery_app.task(name="check_cot_changes", ignore_result=True)
def check_cot_changes():
    """Check for significant COT positioning changes and trigger matching alerts."""
    import asyncio
    asyncio.run(_check_cot_async())


async def _check_cot_async():
    from sqlalchemy import select
    from backend.app.database import async_session_factory
    from backend.app.models.alert import Alert
    from backend.app.data.cot_adapter import cot_adapter

    try:
        async with async_session_factory() as db:
            # Find all enabled COT change alerts
            result = await db.execute(
                select(Alert).where(
                    Alert.is_enabled == True,
                    Alert.condition.op("->>")(  # type: ignore
                        "indicator"
                    ) == "cot_change",
                )
            )
            alerts = list(result.scalars().all())

            if not alerts:
                return

            # Fetch latest COT data
            try:
                cot = await cot_adapter.get_gold_cot()
            except Exception:
                logger.warning("cot_fetch_failed")
                return

            if not cot:
                return

            mm_net = cot.get("managed_money", {}).get("net", 0)
            mm_change = cot.get("managed_money", {}).get("weekly_change", 0)

            for alert in alerts:
                try:
                    cond = alert.condition or {}
                    threshold = abs(float(cond.get("threshold", 10000)))

                    if abs(mm_change) > threshold:
                        logger.info(
                            "cot_change_detected",
                            mm_net=mm_net,
                            mm_change=mm_change,
                            threshold=threshold,
                        )
                        from backend.app.models.alert import AlertHistory
                        from datetime import datetime, timezone

                        history = AlertHistory(
                            alert_id=alert.id,
                            triggered_at=datetime.now(timezone.utc),
                            price_at_trigger=float(mm_change),
                        )
                        db.add(history)
                        await db.commit()

                except Exception as e:
                    logger.warning("cot_alert_error", alert_id=alert.id, error=str(e))

    except Exception as e:
        logger.error("cot_task_failed", error=str(e))
