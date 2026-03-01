"""Celery application for async background tasks."""

from celery import Celery
from celery.schedules import crontab

from backend.app.config import get_settings

settings = get_settings()

celery_app = Celery(
    "vision",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
    include=[
        "backend.app.tasks.scalper_scan",
        "backend.app.tasks.fetch_cot",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    beat_schedule={
        # ── Scalper: auto-scan every 5 minutes ──
        "scalper-auto-scan-xauusd": {
            "task": "backend.app.tasks.scalper_scan.auto_scan_xauusd",
            "schedule": 300.0,  # 5 minutes
        },
        "scalper-auto-scan-btcusd": {
            "task": "backend.app.tasks.scalper_scan.auto_scan_btcusd",
            "schedule": 300.0,  # 5 minutes
        },
        "scalper-auto-scan-forex": {
            "task": "backend.app.tasks.scalper_scan.auto_scan_forex",
            "schedule": 300.0,  # 5 minutes
        },
        # ── Scalper: daily performance summary at 22:00 UTC ──
        "scalper-daily-summary": {
            "task": "backend.app.tasks.scalper_scan.daily_summary",
            "schedule": crontab(hour=22, minute=0),
        },
        # ── ML: retrain models every Sunday at 03:00 UTC ──
        "ml-weekly-retrain": {
            "task": "backend.app.tasks.scalper_scan.weekly_ml_retrain",
            "schedule": crontab(hour=3, minute=0, day_of_week="sunday"),
        },
        # ── COT reports: every Saturday ──
        "fetch-cot-weekly": {
            "task": "backend.app.tasks.fetch_cot.fetch_latest_cot",
            "schedule": 604800.0,  # 7 days
        },
    },
)

celery_app.autodiscover_tasks(["backend.app.tasks"])
