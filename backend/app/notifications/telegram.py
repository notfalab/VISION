"""
Telegram Bot Notifier — sends scalper signals and alerts to Telegram.

Uses the Telegram Bot API directly via httpx (no extra deps needed).

Supports multiple targets:
  - Personal chat (TELEGRAM_CHAT_ID) — admin/test messages
  - Gold channel (TELEGRAM_GOLD_CHANNEL_ID) — XAUUSD signal broadcasts
  - Crypto channel (TELEGRAM_CRYPTO_CHANNEL_ID) — BTCUSD signal broadcasts
  - General channel (TELEGRAM_CHANNEL_ID) — fallback for other assets

Setup:
  1. Create bot with @BotFather → get token
  2. Create channels (Gold, Crypto), add bot as admin with "Post Messages" permission
  3. Send a message in each channel, then call GET /api/v1/scalper/telegram/channel-id
  4. Set TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, TELEGRAM_GOLD_CHANNEL_ID,
     TELEGRAM_CRYPTO_CHANNEL_ID in .env
"""

import httpx
from datetime import datetime, timezone

from backend.app.config import get_settings
from backend.app.logging_config import get_logger

logger = get_logger("telegram")

TG_API = "https://api.telegram.org/bot{token}/{method}"


async def send_message(
    text: str,
    chat_id: str | None = None,
    parse_mode: str = "HTML",
    disable_preview: bool = True,
) -> bool:
    """
    Send a message to a specific chat.
    Falls back to TELEGRAM_CHAT_ID if no chat_id is provided.
    """
    settings = get_settings()
    token = settings.telegram_bot_token
    target = chat_id or settings.telegram_chat_id

    if not token or not target:
        logger.warning("telegram_not_configured", hint="Set TELEGRAM_BOT_TOKEN and target chat ID in .env")
        return False

    url = TG_API.format(token=token, method="sendMessage")

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(url, json={
                "chat_id": target,
                "text": text,
                "parse_mode": parse_mode,
                "disable_web_page_preview": disable_preview,
            })

            if resp.status_code == 200:
                data = resp.json()
                if data.get("ok"):
                    logger.info("telegram_sent", chat_id=target)
                    return True
                else:
                    logger.warning("telegram_api_error", error=data.get("description"))
                    return False
            else:
                logger.warning("telegram_http_error", status=resp.status_code, body=resp.text[:200])
                return False

    except Exception as e:
        logger.error("telegram_send_failed", error=str(e))
        return False


def get_channel_for_symbol(symbol: str) -> str:
    """Return the appropriate Telegram channel ID based on the asset symbol."""
    settings = get_settings()
    symbol_upper = (symbol or "").upper()

    if symbol_upper == "XAUUSD" and settings.telegram_gold_channel_id:
        return settings.telegram_gold_channel_id
    elif symbol_upper in ("BTCUSD", "ETHUSD", "SOLUSD", "XRPUSD", "ETHBTC") and settings.telegram_crypto_channel_id:
        return settings.telegram_crypto_channel_id

    # Fallback to general channel
    return settings.telegram_channel_id


async def send_to_channel(text: str, parse_mode: str = "HTML", disable_preview: bool = True, symbol: str = "") -> bool:
    """Send a message to the appropriate Telegram channel based on symbol."""
    channel_id = get_channel_for_symbol(symbol)

    if not channel_id:
        logger.warning("telegram_channel_not_configured", symbol=symbol, hint="Set TELEGRAM_*_CHANNEL_ID in .env")
        return False

    return await send_message(text, chat_id=channel_id, parse_mode=parse_mode, disable_preview=disable_preview)


async def get_chat_id() -> str | None:
    """
    Helper: get chat_id from recent messages sent to the bot.
    User must send a message to the bot first, then call this.
    """
    settings = get_settings()
    token = settings.telegram_bot_token
    if not token:
        return None

    url = TG_API.format(token=token, method="getUpdates")

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(url)
            data = resp.json()
            if data.get("ok") and data.get("result"):
                # Return the chat_id from the most recent message
                for update in reversed(data["result"]):
                    msg = update.get("message", {})
                    chat = msg.get("chat", {})
                    if chat.get("id"):
                        return str(chat["id"])
    except Exception as e:
        logger.error("get_chat_id_failed", error=str(e))

    return None


async def get_channel_id() -> dict | None:
    """
    Helper: get the channel chat_id from recent updates.
    The bot must be an admin in the channel, and at least one message
    must have been posted in the channel after adding the bot.
    """
    settings = get_settings()
    token = settings.telegram_bot_token
    if not token:
        return None

    url = TG_API.format(token=token, method="getUpdates")

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(url)
            data = resp.json()
            if data.get("ok") and data.get("result"):
                channels = []
                for update in data["result"]:
                    # Channel posts appear as "channel_post" or "my_chat_member"
                    channel_post = update.get("channel_post", {})
                    chat = channel_post.get("chat", {})

                    if not chat:
                        # Check for bot added to channel event
                        member = update.get("my_chat_member", {})
                        chat = member.get("chat", {})

                    if chat.get("type") == "channel":
                        channels.append({
                            "id": str(chat["id"]),
                            "title": chat.get("title", ""),
                            "username": chat.get("username", ""),
                        })

                # Deduplicate by id
                seen = set()
                unique = []
                for ch in channels:
                    if ch["id"] not in seen:
                        seen.add(ch["id"])
                        unique.append(ch)

                return unique if unique else None
    except Exception as e:
        logger.error("get_channel_id_failed", error=str(e))

    return None


def format_signal_message(signal: dict) -> str:
    """
    Format a scalper signal as a beautiful Telegram message with HTML.
    """
    direction = signal.get("direction", "long")
    is_long = direction == "long"
    emoji = "🟢" if is_long else "🔴"
    dir_text = "BUY (LONG)" if is_long else "SELL (SHORT)"
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

    # Confidence bar
    conf_pct = int(confidence * 100)
    filled = conf_pct // 10
    conf_bar = "█" * filled + "░" * (10 - filled)

    # MTF badge
    mtf_text = ""
    if mtf:
        agreeing = signal.get("agreeing_timeframes", [])
        mtf_text = f"\n🔗 <b>MTF Confluence:</b> {', '.join(agreeing)}"

    # Loss filter note
    filter_text = ""
    if reasons.get("loss_filter_applied"):
        filter_text = "\n⚠️ <i>Loss filter active — confidence adjusted</i>"

    msg = f"""
{emoji} <b>SIGNAL: {dir_text}</b>

📊 <b>{symbol}</b> | {timeframe}
🏷️ Regime: <code>{regime.replace('_', ' ').title()}</code>

💰 <b>Entry:</b>  <code>{entry:,.2f}</code>
🛑 <b>SL:</b>     <code>{sl:,.2f}</code>
🎯 <b>TP:</b>     <code>{tp:,.2f}</code>
⚖️ <b>R:R:</b>    <code>{rr:.2f}</code>

📈 <b>Confidence:</b> {conf_pct}%
{conf_bar}

🧠 Score: {score}/100 | {confluence} confluences
{'✅ ML agrees' if ml_agrees else '⚠️ ML disagrees'}{mtf_text}{filter_text}

⏰ {datetime.now(timezone.utc).strftime('%H:%M UTC')}
"""
    return msg.strip()


def format_outcome_message(signal: dict) -> str:
    """Format a signal outcome (win/loss) as a Telegram message."""
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
        emoji = "✅"
        header = "TAKE PROFIT HIT"
    elif status == "loss":
        emoji = "❌"
        header = "STOP LOSS HIT"
        loss_cat = signal.get("loss_category", "")
        loss_detail = (signal.get("loss_analysis") or {}).get("detail", "")
    else:
        emoji = "⏰"
        header = "EXPIRED"

    pnl_sign = "+" if pnl >= 0 else ""

    msg = f"""
{emoji} <b>{header}</b>

📊 <b>{symbol}</b> | {timeframe} | {'BUY' if direction == 'long' else 'SELL'}

💰 <b>Entry:</b>  <code>{entry:,.2f}</code>
🎯 <b>TP:</b>     <code>{tp:,.2f}</code>
🛑 <b>SL:</b>     <code>{sl:,.2f}</code>
🏁 <b>Exit:</b>   <code>{exit_price:,.2f}</code>

{'📈' if pnl >= 0 else '📉'} <b>P&L:</b> <code>{pnl_sign}{pnl:,.2f}</code> ({pnl_sign}{pnl_pct:.3f}%)
⚖️ <b>R:R:</b> <code>{rr:.2f}</code>
"""

    if status == "loss" and loss_cat:
        cat_emojis = {
            "false_breakout": "🔄",
            "regime_mismatch": "🔀",
            "low_confluence": "📉",
            "overextended": "⚡",
            "weak_volume": "📊",
            "against_trend": "↕️",
            "news_event": "📰",
        }
        cat_emoji = cat_emojis.get(loss_cat, "❓")
        msg += f"\n{cat_emoji} <b>Reason:</b> {loss_cat.replace('_', ' ').title()}"
        if loss_detail:
            msg += f"\n<i>{loss_detail[:150]}</i>"

    msg += f"\n⏰ {datetime.now(timezone.utc).strftime('%H:%M UTC')}"

    return msg.strip()


def format_daily_summary(analytics: dict) -> str:
    """Format a daily performance summary."""
    win_rate = analytics.get("win_rate", 0)
    total = analytics.get("completed", 0)
    wins = analytics.get("wins", 0)
    losses = analytics.get("losses", 0)
    total_pnl = analytics.get("total_pnl", 0)
    profit_factor = analytics.get("profit_factor", 0)
    best = analytics.get("best_trade", 0)
    worst = analytics.get("worst_trade", 0)

    pf_text = "∞" if profit_factor == float("inf") else f"{profit_factor:.2f}"

    msg = f"""
📊 <b>DAILY SUMMARY — VISION</b>

🎯 Win Rate: <b>{win_rate}%</b> ({wins}W / {losses}L)
💰 Total P&L: <code>{'+'if total_pnl >= 0 else ''}{total_pnl:,.2f}</code>
📈 Profit Factor: <code>{pf_text}</code>
🏆 Best: <code>+{best:,.2f}</code>
💀 Worst: <code>{worst:,.2f}</code>
📋 Signals: {total}

⏰ {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}
"""
    return msg.strip()


async def notify_signal(signal: dict) -> bool:
    """Send a new signal notification to the symbol-specific channel + personal chat."""
    symbol = signal.get("symbol", "")
    msg = format_signal_message(signal)
    # Send to symbol-specific channel (Gold → gold channel, BTC → crypto channel)
    channel_ok = await send_to_channel(msg, symbol=symbol)
    # Also send to personal chat (admin)
    personal_ok = await send_message(msg)
    return channel_ok or personal_ok


async def notify_outcome(signal: dict) -> bool:
    """Send a signal outcome notification to the symbol-specific channel + personal chat."""
    symbol = signal.get("symbol", "")
    msg = format_outcome_message(signal)
    channel_ok = await send_to_channel(msg, symbol=symbol)
    personal_ok = await send_message(msg)
    return channel_ok or personal_ok


async def notify_summary(analytics: dict, symbol: str = "") -> bool:
    """Send a daily summary to the symbol-specific channel + personal chat."""
    msg = format_daily_summary(analytics)
    channel_ok = await send_to_channel(msg, symbol=symbol)
    personal_ok = await send_message(msg)
    return channel_ok or personal_ok
