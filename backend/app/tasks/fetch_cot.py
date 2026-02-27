"""
Celery task: Fetch CFTC Commitment of Traders data weekly.

Fetches gold COT positioning data from CFTC and caches it.
Runs once per week (Saturday) via Celery Beat.
"""

import asyncio

from backend.app.tasks.celery_app import celery_app
from backend.app.logging_config import get_logger

logger = get_logger("tasks.fetch_cot")


def _run_async(coro):
    """Run an async coroutine from sync Celery context."""
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as pool:
                return pool.submit(asyncio.run, coro).result()
        return loop.run_until_complete(coro)
    except RuntimeError:
        return asyncio.run(coro)


@celery_app.task(name="backend.app.tasks.fetch_cot.fetch_latest_cot")
def fetch_latest_cot():
    """Fetch latest COT data from CFTC for gold futures."""

    async def _fetch():
        from backend.app.data.cot_adapter import cot_adapter

        await cot_adapter.connect()
        try:
            data = await cot_adapter.get_gold_cot()
            logger.info(
                "cot_fetched",
                report_date=data.get("report_date", ""),
                signal=data.get("gold_signal", ""),
                oi=data.get("open_interest", 0),
            )
            return {
                "status": "ok",
                "report_date": data.get("report_date"),
                "gold_signal": data.get("gold_signal"),
            }
        finally:
            await cot_adapter.disconnect()

    return _run_async(_fetch())
