"""
AI Market Brief — generates daily market analysis using OpenAI GPT.

Collects recent market data (price changes, key levels, active signals,
performance stats) and uses an LLM to produce a concise, actionable
morning brief. Sent to Discord + Telegram automatically.
"""

import httpx
from datetime import datetime, timezone, timedelta

from backend.app.config import get_settings
from backend.app.logging_config import get_logger

logger = get_logger("ai_brief")

OPENAI_URL = "https://api.openai.com/v1/chat/completions"

SYSTEM_PROMPT = """You are VISION AI, a professional trading analyst for a platform that covers Gold (XAUUSD), Bitcoin (BTCUSD), and 7 major Forex pairs (EURUSD, GBPUSD, USDJPY, AUDUSD, USDCAD, NZDUSD, USDCHF).

Generate a concise daily market brief in the following structure:

1. **Market Overview** (2-3 sentences on what happened yesterday)
2. **Key Levels to Watch** (support/resistance for the top 3 most active assets)
3. **Currency Strength** (which currencies are strong/weak right now)
4. **Today's Outlook** (what to expect, any correlations or setups forming)
5. **Risk Events** (any known economic events that could impact markets)

Rules:
- Be concise but insightful (max 300 words total)
- Use plain language, no jargon walls
- Include specific price levels when available
- Mention correlations (DXY vs gold, risk-on/off flows)
- End with a 1-sentence trading bias for the day
- Format with emojis for readability
- Do NOT include disclaimers or legal text"""


async def generate_market_brief(market_data: dict) -> str | None:
    """
    Generate an AI market brief using OpenAI GPT.

    Args:
        market_data: Dict with keys like prices, changes, levels, signals, performance

    Returns:
        Generated brief text or None on failure
    """
    settings = get_settings()
    api_key = settings.openai_api_key

    if not api_key:
        logger.warning("openai_not_configured", hint="Set OPENAI_API_KEY in .env")
        return None

    # Build the user prompt with real market data
    user_prompt = _build_data_prompt(market_data)

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
                    "max_tokens": 800,
                    "temperature": 0.7,
                },
            )

            if resp.status_code == 200:
                data = resp.json()
                brief = data["choices"][0]["message"]["content"]
                logger.info("ai_brief_generated", length=len(brief))
                return brief
            else:
                logger.error("openai_api_error", status=resp.status_code, body=resp.text[:300])
                return None

    except Exception as e:
        logger.error("ai_brief_failed", error=str(e))
        return None


def _build_data_prompt(data: dict) -> str:
    """Build a data-rich prompt from collected market data."""
    now = datetime.now(timezone.utc)
    date_str = now.strftime("%A, %B %d, %Y")

    parts = [f"Date: {date_str}\n"]

    # Price changes
    if "prices" in data:
        parts.append("## Recent Price Changes:")
        for symbol, info in data["prices"].items():
            price = info.get("price", 0)
            change = info.get("change_pct", 0)
            high = info.get("high", 0)
            low = info.get("low", 0)
            direction = "up" if change >= 0 else "down"
            parts.append(
                f"  {symbol}: {price:.5g} ({'+' if change >= 0 else ''}{change:.2f}% {direction}) "
                f"| H: {high:.5g} L: {low:.5g}"
            )

    # Key levels
    if "levels" in data:
        parts.append("\n## Key Levels:")
        for symbol, levels in data["levels"].items():
            sup = levels.get("support", "N/A")
            res = levels.get("resistance", "N/A")
            parts.append(f"  {symbol}: Support={sup}, Resistance={res}")

    # Active signals
    if "signals" in data:
        parts.append("\n## Active Signals:")
        for sig in data["signals"][:5]:
            parts.append(
                f"  {sig.get('symbol')} {sig.get('direction').upper()} @ {sig.get('entry_price', 0):.5g} "
                f"| SL: {sig.get('stop_loss', 0):.5g} TP: {sig.get('take_profit', 0):.5g} "
                f"| Score: {sig.get('composite_score', 0)}/100"
            )

    # Performance
    if "performance" in data:
        perf = data["performance"]
        parts.append(f"\n## Yesterday's Performance:")
        parts.append(f"  Win Rate: {perf.get('win_rate', 0)}% | Total P&L: {perf.get('total_pnl', 0):.2f}")
        parts.append(f"  Wins: {perf.get('wins', 0)} | Losses: {perf.get('losses', 0)}")

    parts.append("\nGenerate the daily market brief based on this data.")

    return "\n".join(parts)


def format_brief_discord(brief: str) -> dict:
    """Format the AI brief as a Discord embed."""
    now = datetime.now(timezone.utc)
    return {
        "embeds": [{
            "title": f"🧠 AI Market Brief — {now.strftime('%b %d, %Y')}",
            "description": brief,
            "color": 0x8B5CF6,  # Purple
            "footer": {
                "text": f"VISION AI • Generated {now.strftime('%H:%M UTC')}",
            },
        }]
    }


def format_brief_telegram(brief: str) -> str:
    """Format the AI brief as a Telegram HTML message."""
    now = datetime.now(timezone.utc)
    return (
        f"🧠 <b>AI Market Brief — {now.strftime('%b %d, %Y')}</b>\n\n"
        f"{brief}\n\n"
        f"<i>VISION AI • {now.strftime('%H:%M UTC')}</i>"
    )
