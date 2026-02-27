"""Session Analysis — Trading session impact for gold (London, NY, Asia)."""

import pandas as pd
from datetime import datetime, timezone

from backend.app.core.indicators.base import BaseIndicator, IndicatorResult, registry


# Session times in UTC
SESSIONS = {
    "asia": {"start": 0, "end": 8},      # Tokyo: 00:00 - 08:00 UTC
    "london": {"start": 7, "end": 16},    # London: 07:00 - 16:00 UTC
    "new_york": {"start": 13, "end": 22}, # New York: 13:00 - 22:00 UTC
}

# London-NY overlap is the most volatile for gold (13:00-16:00 UTC)
OVERLAP_START = 13
OVERLAP_END = 16


class SessionAnalysisIndicator(BaseIndicator):
    """
    Trading session analysis — critical for gold trading.

    Gold moves most during:
    - London session open (07:00 UTC) — institutional traders enter
    - NY session open (13:00 UTC) — US data releases, highest volume
    - London-NY overlap (13:00-16:00 UTC) — peak liquidity & volatility

    Tracks:
    - Session-specific volatility and direction
    - Current session context
    - Average session range for position sizing
    """

    @property
    def name(self) -> str:
        return "session_analysis"

    def calculate(self, df: pd.DataFrame) -> list[IndicatorResult]:
        self.validate_dataframe(df)
        if len(df) < 20:
            return []

        # Classify each candle into sessions
        session_stats = {
            "asia": {"range_sum": 0, "count": 0, "bullish": 0, "bearish": 0, "volume": 0},
            "london": {"range_sum": 0, "count": 0, "bullish": 0, "bearish": 0, "volume": 0},
            "new_york": {"range_sum": 0, "count": 0, "bullish": 0, "bearish": 0, "volume": 0},
        }

        for _, row in df.iterrows():
            ts = row["timestamp"]
            if hasattr(ts, "hour"):
                hour = ts.hour
            else:
                continue

            candle_range = float(row["high"]) - float(row["low"])
            is_bullish = float(row["close"]) > float(row["open"])

            for session_name, times in SESSIONS.items():
                start = times["start"]
                end = times["end"]
                if start <= hour < end:
                    stats = session_stats[session_name]
                    stats["range_sum"] += candle_range
                    stats["count"] += 1
                    stats["volume"] += float(row["volume"])
                    if is_bullish:
                        stats["bullish"] += 1
                    else:
                        stats["bearish"] += 1

        # Calculate session metrics
        session_metrics = {}
        for session_name, stats in session_stats.items():
            count = max(stats["count"], 1)
            avg_range = stats["range_sum"] / count
            bull_pct = stats["bullish"] / count * 100
            bear_pct = stats["bearish"] / count * 100

            bias = "bullish" if bull_pct > 55 else "bearish" if bear_pct > 55 else "neutral"

            session_metrics[session_name] = {
                "avg_range": round(avg_range, 4),
                "candle_count": stats["count"],
                "bullish_pct": round(bull_pct, 1),
                "bearish_pct": round(bear_pct, 1),
                "avg_volume": round(stats["volume"] / count, 2),
                "bias": bias,
            }

        # Determine current session
        now = datetime.now(timezone.utc)
        current_hour = now.hour
        current_session = "off_hours"
        in_overlap = OVERLAP_START <= current_hour < OVERLAP_END

        for session_name, times in SESSIONS.items():
            if times["start"] <= current_hour < times["end"]:
                current_session = session_name
                break

        # Overall assessment
        # The most volatile session (highest avg range) matters most for entries
        most_volatile = max(session_metrics.items(), key=lambda x: x[1]["avg_range"])

        # Current session bias
        current_bias = "neutral"
        if current_session in session_metrics:
            current_bias = session_metrics[current_session]["bias"]

        # London and NY agreement = strong signal
        london_bias = session_metrics.get("london", {}).get("bias", "neutral")
        ny_bias = session_metrics.get("new_york", {}).get("bias", "neutral")
        session_confluence = london_bias == ny_bias and london_bias != "neutral"

        if session_confluence and london_bias == "bullish":
            classification = "strong_bullish_sessions"
        elif session_confluence and london_bias == "bearish":
            classification = "strong_bearish_sessions"
        elif current_bias != "neutral":
            classification = f"{current_bias}_session"
        else:
            classification = "neutral"

        meta = {
            "classification": classification,
            "current_session": current_session,
            "in_overlap": in_overlap,
            "session_confluence": session_confluence,
            "sessions": session_metrics,
            "most_volatile_session": most_volatile[0],
            "current_session_bias": current_bias,
        }

        confidence = 70 if session_confluence else 50
        if in_overlap:
            confidence += 15  # Higher confidence during overlap

        results = [IndicatorResult(
            name=self.name,
            value=confidence,
            timestamp=df["timestamp"].iloc[-1],
            metadata=meta,
        )]
        return results


registry.register(SessionAnalysisIndicator())
