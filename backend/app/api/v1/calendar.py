"""Economic Calendar endpoints — upcoming macro events with impact levels."""

from datetime import datetime, timezone, timedelta

from fastapi import APIRouter

router = APIRouter(prefix="/calendar", tags=["calendar"])


@router.get("/events")
async def get_calendar_events(days: int = 7):
    """
    Return upcoming economic events from Forex Factory.
    Includes impact level, affected symbols, and countdown.
    """
    from backend.app.data.calendar_adapter import calendar_adapter

    try:
        events = await calendar_adapter.fetch_events()
    except Exception:
        events = []

    now = datetime.now(timezone.utc)
    cutoff = now + timedelta(days=days)

    filtered = []
    for event in events:
        try:
            event_dt = datetime.fromisoformat(event["datetime"])
            # Include events from today through cutoff
            if event_dt < (now - timedelta(hours=12)):
                continue
            if event_dt > cutoff:
                continue

            # Compute countdown
            delta = event_dt - now
            countdown_seconds = max(0, int(delta.total_seconds()))
            is_past = delta.total_seconds() < 0

            filtered.append({
                **event,
                "countdown_seconds": countdown_seconds,
                "is_past": is_past,
            })
        except (ValueError, KeyError):
            continue

    return {
        "events": filtered,
        "count": len(filtered),
        "fetched_at": now.isoformat(),
    }
