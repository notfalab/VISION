"""Smart Money Concepts — Order Blocks, Fair Value Gaps, Break of Structure, CHoCH."""

import pandas as pd
import numpy as np

from backend.app.core.indicators.base import BaseIndicator, IndicatorResult, registry


def _find_swing_points(df: pd.DataFrame, lookback: int = 5) -> tuple[list, list]:
    """Find swing highs and swing lows using a rolling window."""
    swing_highs = []  # (index, price)
    swing_lows = []   # (index, price)

    for i in range(lookback, len(df) - lookback):
        high = float(df["high"].iloc[i])
        low = float(df["low"].iloc[i])

        # Swing high: highest high in window
        is_swing_high = all(
            high >= float(df["high"].iloc[j])
            for j in range(i - lookback, i + lookback + 1) if j != i
        )
        if is_swing_high:
            swing_highs.append((i, high))

        # Swing low: lowest low in window
        is_swing_low = all(
            low <= float(df["low"].iloc[j])
            for j in range(i - lookback, i + lookback + 1) if j != i
        )
        if is_swing_low:
            swing_lows.append((i, low))

    return swing_highs, swing_lows


class SmartMoneyIndicator(BaseIndicator):
    """
    Smart Money Concepts (SMC) for institutional flow detection:
    - Order Blocks (OB): Last opposing candle before impulsive move
    - Fair Value Gaps (FVG): Imbalance zones where price moved too fast
    - Break of Structure (BOS): Trend continuation signal
    - Change of Character (CHoCH): First sign of trend reversal
    """

    def __init__(self, swing_lookback: int = 5, impulse_threshold: float = 0.003):
        self.swing_lookback = swing_lookback
        self.impulse_threshold = impulse_threshold  # 0.3% minimum impulsive move

    @property
    def name(self) -> str:
        return "smart_money"

    def calculate(self, df: pd.DataFrame) -> list[IndicatorResult]:
        self.validate_dataframe(df)
        if len(df) < 30:
            return []

        swing_highs, swing_lows = _find_swing_points(df, self.swing_lookback)

        # Detect market structure: BOS and CHoCH
        structure = self._detect_structure(swing_highs, swing_lows)

        # Detect Order Blocks
        order_blocks = self._detect_order_blocks(df)

        # Detect Fair Value Gaps
        fvgs = self._detect_fvg(df)

        # Generate final assessment
        latest_idx = len(df) - 1
        close = float(df["close"].iloc[-1])

        # Count active signals
        bullish_ob = sum(1 for ob in order_blocks if ob["type"] == "bullish" and ob["active"])
        bearish_ob = sum(1 for ob in order_blocks if ob["type"] == "bearish" and ob["active"])
        bullish_fvg = sum(1 for f in fvgs if f["type"] == "bullish" and f["active"])
        bearish_fvg = sum(1 for f in fvgs if f["type"] == "bearish" and f["active"])

        # Price near any active zone?
        near_bullish_zone = False
        near_bearish_zone = False
        active_zones = []

        for ob in order_blocks:
            if not ob["active"]:
                continue
            dist_pct = abs(close - ob["price"]) / close * 100
            if dist_pct < 0.5:  # Within 0.5% of order block
                if ob["type"] == "bullish":
                    near_bullish_zone = True
                    active_zones.append(f"Bullish OB @ {ob['price']:.2f}")
                else:
                    near_bearish_zone = True
                    active_zones.append(f"Bearish OB @ {ob['price']:.2f}")

        for f in fvgs:
            if not f["active"]:
                continue
            if f["type"] == "bullish" and f["low"] <= close <= f["high"]:
                near_bullish_zone = True
                active_zones.append(f"Bullish FVG {f['low']:.2f}-{f['high']:.2f}")
            elif f["type"] == "bearish" and f["low"] <= close <= f["high"]:
                near_bearish_zone = True
                active_zones.append(f"Bearish FVG {f['low']:.2f}-{f['high']:.2f}")

        # Structure bias
        trend = structure.get("trend", "neutral")
        last_bos = structure.get("last_bos")
        last_choch = structure.get("last_choch")

        # Classification
        if last_choch and last_choch["type"] == "bullish" and near_bullish_zone:
            classification = "strong_bullish_reversal"
        elif last_choch and last_choch["type"] == "bearish" and near_bearish_zone:
            classification = "strong_bearish_reversal"
        elif last_bos and last_bos["type"] == "bullish" and near_bullish_zone:
            classification = "bullish_continuation"
        elif last_bos and last_bos["type"] == "bearish" and near_bearish_zone:
            classification = "bearish_continuation"
        elif trend == "bullish":
            classification = "bullish_structure"
        elif trend == "bearish":
            classification = "bearish_structure"
        else:
            classification = "neutral"

        # Confidence: more confirming signals = higher confidence
        bullish_signals = bullish_ob + bullish_fvg + (1 if trend == "bullish" else 0)
        bearish_signals = bearish_ob + bearish_fvg + (1 if trend == "bearish" else 0)
        total_signals = bullish_signals + bearish_signals
        confidence = max(bullish_signals, bearish_signals) / max(total_signals, 1) * 100

        meta = {
            "classification": classification,
            "trend": trend,
            "bullish_ob_count": bullish_ob,
            "bearish_ob_count": bearish_ob,
            "bullish_fvg_count": bullish_fvg,
            "bearish_fvg_count": bearish_fvg,
            "near_bullish_zone": near_bullish_zone,
            "near_bearish_zone": near_bearish_zone,
            "active_zones": active_zones[:5],  # Limit to 5 zones
            "confidence": round(confidence, 1),
        }
        if last_bos:
            meta["last_bos"] = last_bos
        if last_choch:
            meta["last_choch"] = last_choch

        results = [IndicatorResult(
            name=self.name,
            value=confidence,
            secondary_value=bullish_signals - bearish_signals,
            timestamp=df["timestamp"].iloc[-1],
            metadata=meta,
        )]
        return results

    def _detect_structure(self, swing_highs: list, swing_lows: list) -> dict:
        """Detect Break of Structure and Change of Character."""
        if len(swing_highs) < 2 or len(swing_lows) < 2:
            return {"trend": "neutral"}

        result = {"trend": "neutral"}

        # Determine current trend from recent swings
        # Higher highs + higher lows = bullish
        # Lower highs + lower lows = bearish
        recent_highs = swing_highs[-4:]
        recent_lows = swing_lows[-4:]

        hh_count = sum(1 for i in range(1, len(recent_highs)) if recent_highs[i][1] > recent_highs[i-1][1])
        ll_count = sum(1 for i in range(1, len(recent_lows)) if recent_lows[i][1] < recent_lows[i-1][1])
        hl_count = sum(1 for i in range(1, len(recent_lows)) if recent_lows[i][1] > recent_lows[i-1][1])
        lh_count = sum(1 for i in range(1, len(recent_highs)) if recent_highs[i][1] < recent_highs[i-1][1])

        if hh_count >= 2 and hl_count >= 1:
            result["trend"] = "bullish"
        elif ll_count >= 2 and lh_count >= 1:
            result["trend"] = "bearish"

        # BOS: Break of the most recent swing in the direction of trend
        if len(swing_highs) >= 2:
            prev_high = swing_highs[-2][1]
            curr_high = swing_highs[-1][1]
            if curr_high > prev_high and result["trend"] == "bullish":
                result["last_bos"] = {"type": "bullish", "level": prev_high}
            elif curr_high < prev_high and result["trend"] == "bearish":
                result["last_bos"] = {"type": "bearish", "level": prev_high}

        if len(swing_lows) >= 2:
            prev_low = swing_lows[-2][1]
            curr_low = swing_lows[-1][1]
            if curr_low < prev_low and result["trend"] == "bearish":
                if "last_bos" not in result:
                    result["last_bos"] = {"type": "bearish", "level": prev_low}
            elif curr_low > prev_low and result["trend"] == "bullish":
                if "last_bos" not in result:
                    result["last_bos"] = {"type": "bullish", "level": prev_low}

        # CHoCH: First break against the prevailing trend
        if result["trend"] == "bullish" and len(swing_lows) >= 2:
            prev_low = swing_lows[-2][1]
            curr_low = swing_lows[-1][1]
            if curr_low < prev_low:
                result["last_choch"] = {"type": "bearish", "level": prev_low}
        elif result["trend"] == "bearish" and len(swing_highs) >= 2:
            prev_high = swing_highs[-2][1]
            curr_high = swing_highs[-1][1]
            if curr_high > prev_high:
                result["last_choch"] = {"type": "bullish", "level": prev_high}

        return result

    def _detect_order_blocks(self, df: pd.DataFrame) -> list[dict]:
        """Detect Order Blocks: last opposing candle before impulsive move."""
        order_blocks = []
        close = float(df["close"].iloc[-1])

        for i in range(2, len(df) - 1):
            c0 = df.iloc[i - 1]  # Potential OB candle
            c1 = df.iloc[i]      # Impulsive candle

            body_0 = float(c0["close"]) - float(c0["open"])
            body_1 = float(c1["close"]) - float(c1["open"])
            range_1 = float(c1["high"]) - float(c1["low"])

            if range_1 == 0:
                continue

            impulse_pct = abs(body_1) / float(c1["open"])

            # Bullish OB: bearish candle followed by strong bullish candle
            if body_0 < 0 and body_1 > 0 and impulse_pct > self.impulse_threshold:
                ob_price = (float(c0["open"]) + float(c0["close"])) / 2
                # Active if price hasn't gone below it
                active = close > float(c0["low"])
                order_blocks.append({
                    "type": "bullish",
                    "price": ob_price,
                    "high": float(c0["open"]),
                    "low": float(c0["close"]),
                    "index": i - 1,
                    "active": active,
                })

            # Bearish OB: bullish candle followed by strong bearish candle
            elif body_0 > 0 and body_1 < 0 and impulse_pct > self.impulse_threshold:
                ob_price = (float(c0["open"]) + float(c0["close"])) / 2
                active = close < float(c0["high"])
                order_blocks.append({
                    "type": "bearish",
                    "price": ob_price,
                    "high": float(c0["close"]),
                    "low": float(c0["open"]),
                    "index": i - 1,
                    "active": active,
                })

        # Keep only recent active OBs (last 10)
        active_obs = [ob for ob in order_blocks if ob["active"]]
        return active_obs[-10:]

    def _detect_fvg(self, df: pd.DataFrame) -> list[dict]:
        """Detect Fair Value Gaps: 3-candle imbalance patterns."""
        fvgs = []
        close = float(df["close"].iloc[-1])

        for i in range(2, len(df)):
            c0 = df.iloc[i - 2]  # First candle
            c2 = df.iloc[i]      # Third candle

            # Bullish FVG: gap between candle 1 high and candle 3 low
            if float(c2["low"]) > float(c0["high"]):
                gap_size = float(c2["low"]) - float(c0["high"])
                gap_pct = gap_size / float(c0["high"])
                if gap_pct > 0.001:  # Minimum 0.1% gap
                    active = close >= float(c0["high"])  # Not filled yet
                    fvgs.append({
                        "type": "bullish",
                        "high": float(c2["low"]),
                        "low": float(c0["high"]),
                        "gap_pct": gap_pct * 100,
                        "index": i - 1,
                        "active": active,
                    })

            # Bearish FVG: gap between candle 3 high and candle 1 low
            if float(c2["high"]) < float(c0["low"]):
                gap_size = float(c0["low"]) - float(c2["high"])
                gap_pct = gap_size / float(c0["low"])
                if gap_pct > 0.001:
                    active = close <= float(c0["low"])
                    fvgs.append({
                        "type": "bearish",
                        "high": float(c0["low"]),
                        "low": float(c2["high"]),
                        "gap_pct": gap_pct * 100,
                        "index": i - 1,
                        "active": active,
                    })

        active_fvgs = [f for f in fvgs if f["active"]]
        return active_fvgs[-10:]


registry.register(SmartMoneyIndicator())
