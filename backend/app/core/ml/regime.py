"""Market Regime Detection — classify market state using ML clustering."""

import numpy as np
import pandas as pd
from pathlib import Path

from backend.app.logging_config import get_logger

logger = get_logger("ml.regime")

MODEL_DIR = Path("data/models")
MODEL_DIR.mkdir(parents=True, exist_ok=True)

# Regime labels mapped from cluster characteristics
REGIMES = {
    "trending_up": {"color": "#00e676", "description": "Strong uptrend with momentum"},
    "trending_down": {"color": "#ff1744", "description": "Strong downtrend with selling pressure"},
    "ranging": {"color": "#ffab00", "description": "Sideways consolidation, low directional bias"},
    "volatile_breakout": {"color": "#d500f9", "description": "High volatility, potential breakout"},
}


def compute_features(df: pd.DataFrame) -> pd.DataFrame:
    """Extract regime classification features from OHLCV data."""
    features = pd.DataFrame(index=df.index)

    # ATR as % of price (normalized volatility)
    high_low = df["high"] - df["low"]
    high_close = (df["high"] - df["close"].shift(1)).abs()
    low_close = (df["low"] - df["close"].shift(1)).abs()
    tr = pd.concat([high_low, high_close, low_close], axis=1).max(axis=1)
    atr14 = tr.rolling(14).mean()
    features["atr_pct"] = atr14 / df["close"] * 100

    # Trend strength: EMA20 slope (normalized)
    ema20 = df["close"].ewm(span=20).mean()
    features["trend_slope"] = (ema20 - ema20.shift(5)) / atr14

    # RSI for momentum regime
    delta = df["close"].diff()
    gain = delta.where(delta > 0, 0.0)
    loss = (-delta).where(delta < 0, 0.0)
    avg_gain = gain.ewm(alpha=1/14, min_periods=14, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1/14, min_periods=14, adjust=False).mean()
    rs = avg_gain / avg_loss.replace(0, 1e-10)
    features["rsi"] = 100 - (100 / (1 + rs))

    # Bollinger Band width (volatility squeeze indicator)
    sma20 = df["close"].rolling(20).mean()
    std20 = df["close"].rolling(20).std()
    features["bb_width"] = (std20 * 2) / sma20 * 100

    # Volume ratio (current vs SMA)
    vol_sma = df["volume"].rolling(20).mean()
    features["volume_ratio"] = df["volume"] / vol_sma.replace(0, 1)

    # Price momentum (ROC 10)
    features["roc10"] = df["close"].pct_change(10) * 100

    # Directional movement
    features["adx_proxy"] = features["trend_slope"].abs().rolling(14).mean()

    return features.dropna()


def classify_regime(features_row: dict) -> dict:
    """Rule-based regime classification (more reliable than unsupervised clustering for small datasets)."""
    atr_pct = features_row.get("atr_pct", 0)
    trend_slope = features_row.get("trend_slope", 0)
    bb_width = features_row.get("bb_width", 0)
    volume_ratio = features_row.get("volume_ratio", 1)
    rsi = features_row.get("rsi", 50)
    adx_proxy = features_row.get("adx_proxy", 0)

    # High volatility + high volume = breakout
    if atr_pct > 1.5 and volume_ratio > 1.5 and bb_width > 4:
        regime = "volatile_breakout"
        confidence = min(0.95, 0.6 + (atr_pct - 1.5) * 0.1 + (volume_ratio - 1.5) * 0.1)
    # Strong trend up
    elif trend_slope > 0.5 and rsi > 55 and adx_proxy > 0.3:
        regime = "trending_up"
        confidence = min(0.95, 0.5 + trend_slope * 0.15 + (rsi - 55) * 0.005)
    # Strong trend down
    elif trend_slope < -0.5 and rsi < 45 and adx_proxy > 0.3:
        regime = "trending_down"
        confidence = min(0.95, 0.5 + abs(trend_slope) * 0.15 + (45 - rsi) * 0.005)
    # Everything else = ranging
    else:
        regime = "ranging"
        confidence = min(0.9, 0.4 + (1 - adx_proxy) * 0.3)

    return {
        "regime": regime,
        "confidence": round(confidence, 3),
        "description": REGIMES[regime]["description"],
        "color": REGIMES[regime]["color"],
    }


def detect_regime(df: pd.DataFrame) -> dict:
    """
    Detect current market regime from OHLCV data.

    Returns:
        dict with regime, confidence, features, description
    """
    if len(df) < 30:
        return {
            "regime": "unknown",
            "confidence": 0,
            "description": "Insufficient data",
            "features": {},
        }

    features = compute_features(df)

    if len(features) == 0:
        return {
            "regime": "unknown",
            "confidence": 0,
            "description": "Could not compute features",
            "features": {},
        }

    # Use latest row for current regime
    latest = features.iloc[-1].to_dict()
    result = classify_regime(latest)

    # Add feature values for transparency
    result["features"] = {
        "atr_pct": round(latest.get("atr_pct", 0), 3),
        "trend_slope": round(latest.get("trend_slope", 0), 3),
        "rsi": round(latest.get("rsi", 50), 1),
        "bb_width": round(latest.get("bb_width", 0), 3),
        "volume_ratio": round(latest.get("volume_ratio", 1), 2),
        "roc10": round(latest.get("roc10", 0), 2),
        "adx_proxy": round(latest.get("adx_proxy", 0), 3),
    }

    # Historical regimes for context (last 20 candles)
    recent_regimes = []
    for i in range(-min(20, len(features)), 0):
        row = features.iloc[i].to_dict()
        r = classify_regime(row)
        recent_regimes.append(r["regime"])

    # Regime stability score
    current = result["regime"]
    stability = sum(1 for r in recent_regimes if r == current) / max(len(recent_regimes), 1)
    result["stability"] = round(stability, 2)
    result["regime_history"] = recent_regimes[-10:]  # last 10

    logger.info("regime_detected", regime=result["regime"], confidence=result["confidence"])
    return result
