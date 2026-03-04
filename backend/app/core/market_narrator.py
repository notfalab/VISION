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

CRITICAL RULES:
- You MUST ONLY use the exact price numbers provided in the data below. NEVER invent, guess, or use prices from your training data.
- If "Current Price" says 87543.2, use exactly that number. Do NOT substitute a different price.
- Be specific with the ACTUAL price levels from the provided data
- No disclaimers or legal text
- Max 3-4 key drivers
- Confidence is 0.0-1.0 based on signal alignment
- Keep narrative under 100 words
- Use trading terminology appropriately"""


async def generate_narrative(symbol: str, market_data: dict, timeframe: str = "1d") -> dict | None:
    """Generate AI narrative for a symbol using collected market data.

    Args:
        symbol: Trading pair (e.g. XAUUSD)
        market_data: Dict with prices, indicators, regime, positioning
        timeframe: Chart timeframe for cache key

    Returns:
        Narrative dict or None on failure
    """
    # Check cache
    cache_key = f"{symbol.upper()}:{timeframe}"
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
        price_val = p.get("price", "N/A")
        parts.append(f"\n*** CURRENT PRICE: {price_val} *** (USE THIS EXACT NUMBER)")
        parts.append(f"Open: {p.get('open', 'N/A')} | High: {p.get('high', 'N/A')} | Low: {p.get('low', 'N/A')}")
        if p.get("recent_high"):
            parts.append(f"20-period High: {p['recent_high']} | 20-period Low: {p['recent_low']}")
    else:
        parts.append("\n*** NO PRICE DATA AVAILABLE — do NOT guess any prices ***")

    if "indicators" in data and data["indicators"]:
        ind = data["indicators"]
        parts.append("\nIndicators:")
        if "rsi" in ind:
            parts.append(f"  RSI(14): {ind['rsi']}")
        if "trend" in ind:
            parts.append(f"  Trend: {ind['trend']}")
        if "sma20" in ind:
            parts.append(f"  SMA20: {ind['sma20']} | SMA50: {ind.get('sma50', 'N/A')}")

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

    parts.append("\nGenerate the market narrative using ONLY the data above. Do NOT use any prices from your training data.")
    return "\n".join(parts)
