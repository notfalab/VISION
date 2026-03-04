"""
Market Narrator — generates comprehensive real-time analysis
with directional prediction and probability per timeframe.

Synthesizes ALL available data: price action, indicators, ML prediction,
regime, composite score, volatility, zones, divergence, order flow,
and multi-timeframe analysis.
"""

import time
import json
import httpx
from datetime import datetime, timezone

from backend.app.config import get_settings
from backend.app.logging_config import get_logger

logger = get_logger("market_narrator")

OPENAI_URL = "https://api.openai.com/v1/chat/completions"

# Cache: key → (timestamp, result)
_cache: dict[str, tuple[float, dict]] = {}
CACHE_TTL = 300  # 5 minutes

SYSTEM_PROMPT = """You are VISION Market Narrator, an elite trading analyst. You have access to comprehensive market data including technical indicators, ML predictions, market regime, composite scoring, volatility analysis, supply/demand zones, institutional vs retail positioning, order flow, and multi-timeframe analysis.

Your job is to synthesize ALL this data into a clear, actionable trading narrative that tells the trader:
1. WHAT is happening (current price action in context)
2. WHERE price is likely going (direction + probability)
3. WHAT TO DO (specific action: BUY, SELL, or WAIT)
4. KEY LEVELS to watch (entries, targets, stops)
5. MULTI-TIMEFRAME alignment (is the bigger picture confirming or conflicting?)

Output JSON with this EXACT structure:
{
  "narrative": "3-5 sentence comprehensive analysis. Be specific with exact prices. State the direction clearly. Mention key confluences from multiple data sources.",
  "prediction": {
    "direction": "LONG" or "SHORT" or "NEUTRAL",
    "probability": 0.0-1.0,
    "entry_zone": "price range",
    "target_1": "first take-profit price",
    "target_2": "extended target price",
    "stop_loss": "invalidation price",
    "risk_reward": "e.g. 1:2.5"
  },
  "timeframe_analysis": {
    "15m": {"bias": "bullish/bearish/neutral", "strength": 0.0-1.0},
    "1h": {"bias": "bullish/bearish/neutral", "strength": 0.0-1.0},
    "4h": {"bias": "bullish/bearish/neutral", "strength": 0.0-1.0},
    "1d": {"bias": "bullish/bearish/neutral", "strength": 0.0-1.0}
  },
  "key_drivers": [
    {"factor": "driver name", "impact": "high/medium/low", "direction": "bullish/bearish/neutral"}
  ],
  "outlook": "Bullish/Bearish/Neutral",
  "confidence": 0.0-1.0
}

CRITICAL RULES:
- You MUST ONLY use the exact prices provided in the data. NEVER invent prices.
- If ML says 72% bullish but RSI is overbought and regime is mean-reverting, weigh ALL factors.
- Higher probability = more data sources agree. Lower probability = conflicting signals.
- Always provide specific price levels for entry/target/stop based on the zones and levels provided.
- Be decisive — traders need clear direction, not vague analysis.
- Max 4-5 key drivers.
- Confidence reflects overall signal alignment across all data sources.
- If signals conflict strongly, recommend NEUTRAL/WAIT and explain why.
- Keep narrative under 150 words but pack it with specific, actionable insights."""


async def generate_narrative(symbol: str, market_data: dict, timeframe: str = "1d") -> dict | None:
    """Generate comprehensive AI narrative with prediction.

    Args:
        symbol: Trading pair (e.g. XAUUSD)
        market_data: Full context dict from _gather_full_context
        timeframe: Active chart timeframe

    Returns:
        Full narrative dict or None on failure
    """
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

    user_prompt = _build_prompt(symbol, market_data, timeframe)

    try:
        async with httpx.AsyncClient(timeout=45) as client:
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
                    "max_tokens": 1000,
                    "temperature": 0.4,
                    "response_format": {"type": "json_object"},
                },
            )

            if resp.status_code == 200:
                data = resp.json()
                content = data["choices"][0]["message"]["content"]
                result = json.loads(content)
                result["symbol"] = symbol.upper()
                result["timestamp"] = datetime.now(timezone.utc).isoformat()

                # Ensure required fields exist
                result.setdefault("prediction", None)
                result.setdefault("timeframe_analysis", {})
                result.setdefault("key_drivers", [])
                result.setdefault("outlook", "Neutral")
                result.setdefault("confidence", 0.5)

                _cache[cache_key] = (time.time(), result)
                logger.info("narrative_generated", symbol=symbol)
                return result
            else:
                logger.error("openai_error", status=resp.status_code, body=resp.text[:200])
                return None

    except Exception as e:
        logger.error("narrative_failed", error=str(e))
        return None


def _build_prompt(symbol: str, data: dict, timeframe: str) -> str:
    """Build comprehensive data prompt from all market data sources."""
    parts = [
        f"Symbol: {symbol}",
        f"Active Timeframe: {timeframe}",
        f"Time: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}",
    ]

    # ── Price ──
    if "price" in data:
        p = data["price"]
        parts.append(f"\n=== PRICE DATA ===")
        parts.append(f"*** CURRENT PRICE: {p.get('current', 'N/A')} *** (USE THIS EXACT NUMBER)")
        parts.append(f"Session: Open {p.get('open', 'N/A')} | High {p.get('high', 'N/A')} | Low {p.get('low', 'N/A')}")
        if p.get("recent_high"):
            parts.append(f"20-period Range: {p['recent_low']} — {p['recent_high']}")
    else:
        parts.append("\n*** NO PRICE DATA — do NOT guess any prices ***")
        parts.append("\nAnalyze with available data only.")
        return "\n".join(parts)

    # ── Technical Indicators ──
    if "indicators" in data:
        ind = data["indicators"]
        parts.append(f"\n=== TECHNICAL INDICATORS ({timeframe}) ===")
        if ind.get("rsi") is not None:
            rsi = ind["rsi"]
            zone = "OVERBOUGHT" if rsi > 70 else "OVERSOLD" if rsi < 30 else "neutral"
            parts.append(f"RSI(14): {rsi} [{zone}]")
        if ind.get("macd") is not None:
            hist = ind.get("macd_histogram", 0)
            parts.append(f"MACD: {ind['macd']} | Signal: {ind.get('macd_signal')} | Histogram: {hist} [{'bullish' if hist > 0 else 'bearish'}]")
        if ind.get("sma20"):
            parts.append(f"SMA20: {ind['sma20']} | SMA50: {ind.get('sma50', 'N/A')} | Trend: {ind.get('trend_sma', 'N/A')}")
        if ind.get("bb_upper"):
            parts.append(f"Bollinger Bands: Upper {ind['bb_upper']} | Lower {ind['bb_lower']}")

    # ── ML Prediction ──
    if "ml_prediction" in data:
        ml = data["ml_prediction"]
        parts.append(f"\n=== ML MODEL PREDICTION ===")
        parts.append(f"Direction: {ml.get('direction', 'N/A').upper()} (confidence: {ml.get('confidence', 0):.0%})")
        if ml.get("probabilities"):
            probs = ml["probabilities"]
            parts.append(f"Probabilities: {json.dumps(probs)}")

    # ── Market Regime ──
    if "regime" in data:
        r = data["regime"]
        parts.append(f"\n=== MARKET REGIME ===")
        parts.append(f"Regime: {r.get('regime', 'unknown')} (confidence: {r.get('confidence', 0):.0%})")
        if r.get("characteristics"):
            parts.append(f"Characteristics: {r['characteristics']}")

    # ── Composite Score ──
    if "composite" in data:
        c = data["composite"]
        parts.append(f"\n=== COMPOSITE ANALYSIS SCORE ===")
        parts.append(f"Score: {c.get('score', 'N/A')}/100 — Bias: {c.get('bias', 'N/A')}")
        if c.get("components"):
            comps = c["components"]
            for k, v in comps.items():
                if isinstance(v, dict):
                    parts.append(f"  {k}: score={v.get('score', 'N/A')} bias={v.get('bias', 'N/A')}")

    # ── Volatility ──
    if "volatility" in data:
        v = data["volatility"]
        parts.append(f"\n=== VOLATILITY ANALYSIS ===")
        parts.append(f"Current Vol: {v.get('current', 'N/A')} | Regime: {v.get('regime', 'N/A')} | Percentile: {v.get('percentile', 'N/A')}%")
        if v.get("implied_move"):
            parts.append(f"Implied Move (next session): ±{v['implied_move']}")

    # ── Key Zones ──
    if "zones" in data:
        z = data["zones"]
        parts.append(f"\n=== KEY PRICE ZONES ===")
        for zone_type, zone_list in z.items():
            if isinstance(zone_list, list):
                for zn in zone_list[:3]:
                    price = zn.get("price", zn.get("low", "N/A"))
                    strength = zn.get("strength", "")
                    parts.append(f"  {zone_type}: {price} (strength: {strength})")

    # ── Divergence ──
    if "divergence" in data:
        d = data["divergence"]
        parts.append(f"\n=== INSTITUTIONAL vs RETAIL DIVERGENCE ===")
        parts.append(f"Retail Long: {d.get('retail_long_pct', 'N/A')}% | Institutional Bias: {d.get('institutional_bias', 'N/A')}")
        parts.append(f"Divergence Score: {d.get('divergence_score', 'N/A')} | Signal: {d.get('signal', 'N/A')}")

    # ── Order Flow ──
    if "order_flow" in data:
        of = data["order_flow"]
        parts.append(f"\n=== ORDER FLOW ===")
        parts.append(f"Imbalance: {of.get('imbalance', 'N/A')} | Aggression: {of.get('aggression_ratio', 'N/A')} | Absorption: {of.get('absorption_signal', 'N/A')}")

    # ── Multi-Timeframe ──
    if "multi_timeframe" in data:
        mtf = data["multi_timeframe"]
        parts.append(f"\n=== MULTI-TIMEFRAME ANALYSIS ===")
        for tf, tfdata in mtf.items():
            parts.append(f"  {tf}: RSI={tfdata.get('rsi', 'N/A')} | Trend={tfdata.get('trend', 'N/A')}")

    # ── Final instruction ──
    parts.append(f"\n=== INSTRUCTIONS ===")
    parts.append("Synthesize ALL the above data. Give a CLEAR directional prediction (LONG/SHORT/NEUTRAL).")
    parts.append("Calculate probability by weighing how many data sources agree on direction.")
    parts.append("Provide specific entry, target, and stop-loss levels from the zones and price data.")
    parts.append("Analyze each timeframe and state the bias + strength.")
    parts.append("Use ONLY the prices provided above. NEVER use prices from your training data.")

    return "\n".join(parts)
