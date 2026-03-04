"""
AI Market Narrator — generates real-time contextual narrative
explaining what's happening in the market and why.

Uses OpenAI GPT to synthesize price action, indicators, regime,
and positioning data into a coherent trading narrative.
"""

import time
import httpx
from datetime import datetime, timezone

from backend.app.config import get_settings
from backend.app.logging_config import get_logger

logger = get_logger("market_narrator")

OPENAI_URL = "https://api.openai.com/v1/chat/completions"

# Cache: symbol → (timestamp, result)
_cache: dict[str, tuple[float, dict]] = {}
CACHE_TTL = 300  # 5 minutes

SYSTEM_PROMPT = """You are VISION Market Narrator, an expert trading analyst providing real-time market context.

Given market data for a specific asset, generate a concise narrative that explains:
1. What is happening RIGHT NOW (current price action context)
2. WHY it's happening (drivers, correlations, catalysts)
3. Key levels to watch (support/resistance, volume nodes)
4. What to expect next (probable scenarios)

Output JSON with this exact structure:
{
  "narrative": "2-4 sentence market narrative in plain language",
  "key_drivers": [
    {"factor": "driver name", "impact": "high/medium/low", "direction": "bullish/bearish/neutral"}
  ],
  "outlook": "Bullish/Bearish/Neutral",
  "confidence": 0.75
}

Rules:
- Be specific with price levels
- No disclaimers or legal text
- Max 3-4 key drivers
- Confidence is 0.0-1.0 based on signal alignment
- Keep narrative under 100 words
- Use trading terminology appropriately"""


async def generate_narrative(symbol: str, market_data: dict) -> dict | None:
    """Generate AI narrative for a symbol using collected market data.

    Args:
        symbol: Trading pair (e.g. XAUUSD)
        market_data: Dict with prices, indicators, regime, positioning

    Returns:
        Narrative dict or None on failure
    """
    # Check cache
    cache_key = symbol.upper()
    if cache_key in _cache:
        ts, cached = _cache[cache_key]
        if time.time() - ts < CACHE_TTL:
            return cached

    settings = get_settings()
    api_key = settings.openai_api_key
    if not api_key:
        logger.warning("openai_not_configured")
        return None

    user_prompt = _build_prompt(symbol, market_data)

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                OPENAI_URL,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": "gpt-4o-mini",
                    "messages": [
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": user_prompt},
                    ],
                    "max_tokens": 500,
                    "temperature": 0.6,
                    "response_format": {"type": "json_object"},
                },
            )

            if resp.status_code == 200:
                import json
                data = resp.json()
                content = data["choices"][0]["message"]["content"]
                result = json.loads(content)
                result["symbol"] = symbol.upper()
                result["timestamp"] = datetime.now(timezone.utc).isoformat()

                _cache[cache_key] = (time.time(), result)
                logger.info("narrative_generated", symbol=symbol)
                return result
            else:
                logger.error("openai_error", status=resp.status_code)
                return None

    except Exception as e:
        logger.error("narrative_failed", error=str(e))
        return None


def _build_prompt(symbol: str, data: dict) -> str:
    """Build data-rich prompt from market data."""
    parts = [f"Symbol: {symbol}", f"Time: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}"]

    if "price" in data:
        p = data["price"]
        parts.append(f"\nCurrent Price: {p.get('price', 'N/A')}")
        parts.append(f"Open: {p.get('open', 'N/A')} | High: {p.get('high', 'N/A')} | Low: {p.get('low', 'N/A')}")

    if "indicators" in data and data["indicators"]:
        ind = data["indicators"]
        parts.append("\nIndicators:")
        if "rsi" in ind:
            parts.append(f"  RSI: {ind['rsi']}")
        if "macd" in ind:
            parts.append(f"  MACD: {ind['macd']}")
        if "trend" in ind:
            parts.append(f"  Trend: {ind['trend']}")

    if "regime" in data and data["regime"]:
        r = data["regime"]
        parts.append(f"\nMarket Regime: {r.get('regime', 'unknown')} (confidence: {r.get('confidence', 0):.0%})")

    if "composite" in data and data["composite"]:
        c = data["composite"]
        parts.append(f"\nComposite Score: {c.get('score', 'N/A')}/100 — Bias: {c.get('bias', 'N/A')}")

    if "zones" in data and data["zones"]:
        z = data["zones"]
        if isinstance(z, dict) and z.get("zones"):
            parts.append("\nKey Zones:")
            for zone_type, zone_list in z["zones"].items():
                if isinstance(zone_list, list):
                    for zn in zone_list[:2]:
                        if isinstance(zn, dict):
                            parts.append(f"  {zone_type}: {zn.get('low', 'N/A')}-{zn.get('high', 'N/A')}")

    parts.append("\nGenerate the market narrative based on this data.")
    return "\n".join(parts)
