"""
Discord Webhook Notifier — sends scalper signals and alerts to Discord channels.

Uses Discord webhook URLs (no bot needed). Create webhooks in:
  Discord Server → Channel Settings → Integrations → Webhooks → New Webhook

Supports separate webhooks for:
  - Gold channel (DISCORD_GOLD_WEBHOOK_URL) — XAUUSD signals
  - Crypto channel (DISCORD_CRYPTO_WEBHOOK_URL) — BTC/ETH/SOL signals
  - General channel (DISCORD_WEBHOOK_URL) — fallback for other assets
"""

import httpx
from datetime import datetime, timezone

from backend.app.config import get_settings
from backend.app.logging_config import get_logger

logger = get_logger("discord")


async def send_webhook(
    content: str = "",
    embeds: list[dict] | None = None,
    webhook_url: str | None = None,
    username: str = "VISION Signals",
) -> bool:
    """Send a message to a Discord webhook."""
    settings = get_settings()
    url = webhook_url or settings.discord_webhook_url

    if not url:
        logger.warning("discord_not_configured", hint="Set DISCORD_WEBHOOK_URL in .env")
        return False

    payload: dict = {"username": username}
    if content:
        payload["content"] = content
    if embeds:
        payload["embeds"] = embeds

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(url, json=payload)

            if resp.status_code in (200, 204):
                logger.info("discord_sent")
                return True
            elif resp.status_code == 429:
                logger.warning("discord_rate_limited", retry_after=resp.json().get("retry_after"))
                return False
            else:
                logger.warning("discord_http_error", status=resp.status_code, body=resp.text[:200])
                return False

    except Exception as e:
        logger.error("discord_send_failed", error=str(e))
        return False


FOREX_SYMBOLS = {"EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "NZDUSD", "USDCHF",
                 "EURGBP", "EURJPY", "GBPJPY"}


def get_webhook_for_symbol(symbol: str) -> str:
    """Return the appropriate Discord webhook URL based on the asset symbol."""
    settings = get_settings()
    symbol_upper = (symbol or "").upper()

    if symbol_upper == "XAUUSD" and settings.discord_gold_webhook_url:
        return settings.discord_gold_webhook_url
    elif symbol_upper in ("BTCUSD", "ETHUSD", "SOLUSD", "XRPUSD", "ETHBTC") and settings.discord_crypto_webhook_url:
        return settings.discord_crypto_webhook_url
    elif symbol_upper in FOREX_SYMBOLS and settings.discord_forex_webhook_url:
        return settings.discord_forex_webhook_url

    return settings.discord_webhook_url


def format_signal_embed(signal: dict) -> dict:
    """Format a scalper signal as a Discord embed."""
    direction = signal.get("direction", "long")
    is_long = direction == "long"
    symbol = signal.get("symbol", "XAUUSD")
    timeframe = signal.get("timeframe", "15m")
    entry = signal.get("entry_price", 0)
    sl = signal.get("stop_loss", 0)
    tp = signal.get("take_profit", 0)
    rr = signal.get("risk_reward_ratio", 0)
    confidence = signal.get("confidence", 0)
    score = signal.get("composite_score", 0)
    regime = signal.get("regime_at_signal", "—")
    mtf = signal.get("mtf_confluence", False)
    reasons = signal.get("signal_reasons", {})
    confluence = reasons.get("confluence_count", 0)
    ml_agrees = reasons.get("ml_agrees", False)

    conf_pct = int(confidence * 100)
    filled = conf_pct // 10
    conf_bar = "\u2588" * filled + "\u2591" * (10 - filled)

    color = 0x00E676 if is_long else 0xFF1744  # green / red
    dir_text = "BUY (LONG)" if is_long else "SELL (SHORT)"
    dir_emoji = "\U0001f7e2" if is_long else "\U0001f534"

    fields = [
        {"name": "Entry", "value": f"`{entry:,.2f}`", "inline": True},
        {"name": "Stop Loss", "value": f"`{sl:,.2f}`", "inline": True},
        {"name": "Take Profit", "value": f"`{tp:,.2f}`", "inline": True},
        {"name": "Risk:Reward", "value": f"`{rr:.2f}`", "inline": True},
        {"name": "Confidence", "value": f"{conf_pct}%\n`{conf_bar}`", "inline": True},
        {"name": "Score", "value": f"`{score}/100` | {confluence} confluences", "inline": True},
        {"name": "Regime", "value": f"`{regime.replace('_', ' ').title()}`", "inline": True},
        {"name": "ML", "value": "Agrees" if ml_agrees else "Disagrees", "inline": True},
    ]

    if mtf:
        agreeing = signal.get("agreeing_timeframes", [])
        fields.append({"name": "MTF Confluence", "value": ", ".join(agreeing), "inline": True})

    if reasons.get("loss_filter_applied"):
        fields.append({"name": "Warning", "value": "Loss filter active", "inline": False})

    return {
        "title": f"{dir_emoji} SIGNAL: {dir_text}",
        "description": f"**{symbol}** | {timeframe}",
        "color": color,
        "fields": fields,
        "footer": {"text": f"VISION Markets \u2022 {datetime.now(timezone.utc).strftime('%H:%M UTC')}"},
    }


def format_outcome_embed(signal: dict) -> dict:
    """Format a signal outcome as a Discord embed."""
    status = signal.get("status", "")
    direction = signal.get("direction", "long")
    symbol = signal.get("symbol", "XAUUSD")
    entry = signal.get("entry_price", 0)
    exit_price = signal.get("exit_price", 0)
    sl = signal.get("stop_loss", 0)
    tp = signal.get("take_profit", 0)
    pnl = signal.get("outcome_pnl", 0) or 0
    pnl_pct = signal.get("outcome_pnl_pct", 0) or 0
    timeframe = signal.get("timeframe", "15m")
    rr = signal.get("risk_reward_ratio", 0)

    if status == "win":
        color = 0x00E676
        title = "\U0001f3af TAKE PROFIT HIT"
    elif status == "loss":
        color = 0xFF1744
        title = "\U0001f6d1 STOP LOSS HIT"
    else:
        color = 0xFFAB00
        title = "\u23f0 EXPIRED"

    pnl_sign = "+" if pnl >= 0 else ""

    fields = [
        {"name": "Direction", "value": "BUY" if direction == "long" else "SELL", "inline": True},
        {"name": "R:R", "value": f"`{rr:.2f}`", "inline": True},
        {"name": "\u200b", "value": "\u200b", "inline": True},
        {"name": "Entry", "value": f"`{entry:,.2f}`", "inline": True},
        {"name": "Take Profit", "value": f"`{tp:,.2f}`", "inline": True},
        {"name": "Stop Loss", "value": f"`{sl:,.2f}`", "inline": True},
        {"name": "Exit Price", "value": f"`{exit_price:,.2f}`", "inline": True},
        {"name": "P&L", "value": f"`{pnl_sign}{pnl:,.2f}` ({pnl_sign}{pnl_pct:.3f}%)", "inline": True},
    ]

    if status == "loss":
        loss_cat = signal.get("loss_category", "")
        if loss_cat:
            fields.append({"name": "Reason", "value": loss_cat.replace("_", " ").title(), "inline": True})

    return {
        "title": title,
        "description": f"**{symbol}** | {timeframe}",
        "color": color,
        "fields": fields,
        "footer": {"text": f"VISION Markets \u2022 {datetime.now(timezone.utc).strftime('%H:%M UTC')}"},
    }


def format_summary_embed(analytics: dict, symbol: str = "") -> dict:
    """Format a daily performance summary as a Discord embed."""
    win_rate = analytics.get("win_rate", 0)
    total = analytics.get("completed", 0)
    wins = analytics.get("wins", 0)
    losses = analytics.get("losses", 0)
    total_pnl = analytics.get("total_pnl", 0)
    profit_factor = analytics.get("profit_factor", 0)
    best = analytics.get("best_trade", 0)
    worst = analytics.get("worst_trade", 0)

    pf_text = "\u221e" if profit_factor == float("inf") else f"{profit_factor:.2f}"
    color = 0x00E676 if total_pnl >= 0 else 0xFF1744
    title = f"\U0001f4ca DAILY SUMMARY — {symbol.upper()}" if symbol else "\U0001f4ca DAILY SUMMARY"

    return {
        "title": title,
        "color": color,
        "fields": [
            {"name": "Win Rate", "value": f"**{win_rate}%** ({wins}W / {losses}L)", "inline": True},
            {"name": "Total P&L", "value": f"`{'+'if total_pnl >= 0 else ''}{total_pnl:,.2f}`", "inline": True},
            {"name": "Profit Factor", "value": f"`{pf_text}`", "inline": True},
            {"name": "Best Trade", "value": f"`+{best:,.2f}`", "inline": True},
            {"name": "Worst Trade", "value": f"`{worst:,.2f}`", "inline": True},
            {"name": "Total Signals", "value": f"`{total}`", "inline": True},
        ],
        "footer": {"text": f"VISION Markets \u2022 {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}"},
    }


async def notify_signal(signal: dict) -> bool:
    """Send a new signal to the symbol-specific Discord channel."""
    symbol = signal.get("symbol", "")
    webhook_url = get_webhook_for_symbol(symbol)
    embed = format_signal_embed(signal)
    return await send_webhook(embeds=[embed], webhook_url=webhook_url)


async def notify_outcome(signal: dict) -> bool:
    """Send a signal outcome to the symbol-specific Discord channel AND performance channel."""
    settings = get_settings()
    symbol = signal.get("symbol", "")
    embed = format_outcome_embed(signal)

    # Send to symbol-specific channel (gold/crypto)
    symbol_url = get_webhook_for_symbol(symbol)
    result = await send_webhook(embeds=[embed], webhook_url=symbol_url)

    # Also send to performance channel if configured
    perf_url = settings.discord_performance_webhook_url
    if perf_url and perf_url != symbol_url:
        await send_webhook(embeds=[embed], webhook_url=perf_url)

    return result


async def notify_summary(analytics: dict, symbol: str = "") -> bool:
    """Send a daily summary to the performance Discord channel."""
    settings = get_settings()
    webhook_url = settings.discord_performance_webhook_url or get_webhook_for_symbol(symbol)
    embed = format_summary_embed(analytics, symbol=symbol)
    return await send_webhook(embeds=[embed], webhook_url=webhook_url)
