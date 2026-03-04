"""
Predictive Volatility — EWMA-based volatility forecast with regime classification.

Computes:
- Historical volatility (rolling std of log returns)
- EWMA forecast (exponentially weighted projection)
- Volatility regime (low/normal/high/extreme)
- Volatility term structure (short vs long-term)
- Implied move range for next session
"""

import numpy as np
import pandas as pd


def calculate_volatility_forecast(
    df: pd.DataFrame,
    forecast_periods: int = 10,
) -> dict:
    """Calculate volatility forecast from OHLCV DataFrame.

    Args:
        df: DataFrame with columns: timestamp, open, high, low, close, volume
        forecast_periods: Number of periods to forecast

    Returns:
        Dict with current_vol, forecast, regime, percentile, term_structure, history
    """
    if df is None or len(df) < 30:
        return {
            "current_vol": 0, "forecast": [], "regime": "unknown",
            "percentile": 0, "term_structure": "flat", "history": [],
            "implied_move": 0, "implied_move_pct": 0,
        }

    close = df["close"].astype(float).values

    # Log returns
    log_returns = np.diff(np.log(close))
    if len(log_returns) < 20:
        return {
            "current_vol": 0, "forecast": [], "regime": "unknown",
            "percentile": 0, "term_structure": "flat", "history": [],
            "implied_move": 0, "implied_move_pct": 0,
        }

    # Rolling volatilities (annualized using sqrt of periods)
    windows = {"5d": 5, "10d": 10, "20d": 20, "50d": min(50, len(log_returns) - 1)}
    rolling_vols = {}
    for label, w in windows.items():
        if len(log_returns) >= w:
            rv = pd.Series(log_returns).rolling(w).std().dropna().values
            if len(rv) > 0:
                rolling_vols[label] = float(rv[-1])

    current_vol = rolling_vols.get("20d", rolling_vols.get("10d", 0))

    # EWMA volatility (lambda=0.94, standard RiskMetrics)
    lam = 0.94
    ewma_var = log_returns[0] ** 2
    ewma_history = [ewma_var]
    for r in log_returns[1:]:
        ewma_var = lam * ewma_var + (1 - lam) * r ** 2
        ewma_history.append(ewma_var)

    ewma_vol = np.sqrt(ewma_var)
    current_vol = float(ewma_vol) if ewma_vol > 0 else current_vol

    # Forecast: EWMA mean-reversion toward long-term vol
    lt_vol = float(np.std(log_returns))  # unconditional vol
    reversion_speed = 0.05  # 5% per period toward LT mean
    forecast = []
    forecast_vol = ewma_var
    for i in range(1, forecast_periods + 1):
        forecast_vol = lam * forecast_vol + (1 - lam) * lt_vol ** 2
        forecast_vol = forecast_vol + reversion_speed * (lt_vol ** 2 - forecast_vol)
        forecast.append({
            "period": i,
            "vol": round(float(np.sqrt(forecast_vol)), 6),
        })

    # Volatility regime (percentile-based)
    vol_90d = log_returns[-min(90, len(log_returns)):]
    rolling_20d_vols = pd.Series(log_returns).rolling(20).std().dropna().values
    if len(rolling_20d_vols) > 5:
        percentile = float(np.mean(rolling_20d_vols <= current_vol) * 100)
    else:
        percentile = 50.0

    if percentile <= 20:
        regime = "low"
        regime_color = "#22c55e"
    elif percentile <= 60:
        regime = "normal"
        regime_color = "#eab308"
    elif percentile <= 85:
        regime = "high"
        regime_color = "#f97316"
    else:
        regime = "extreme"
        regime_color = "#ef4444"

    # Term structure: compare short-term vs long-term vol
    short_vol = rolling_vols.get("5d", current_vol)
    long_vol = rolling_vols.get("50d", rolling_vols.get("20d", current_vol))
    if long_vol > 0:
        ts_ratio = short_vol / long_vol
        if ts_ratio > 1.15:
            term_structure = "backwardation"  # short > long (rising vol)
        elif ts_ratio < 0.85:
            term_structure = "contango"  # short < long (declining vol)
        else:
            term_structure = "flat"
    else:
        term_structure = "flat"
        ts_ratio = 1.0

    # Implied move for next session
    last_close = float(close[-1])
    implied_move_pct = float(current_vol * 100)  # 1-period move in %
    implied_move = last_close * current_vol

    # History (last 50 points of EWMA vol)
    history = []
    ts_values = df["timestamp"].values if "timestamp" in df.columns else range(len(df))
    ewma_vols = [np.sqrt(v) for v in ewma_history]
    start = max(0, len(ewma_vols) - 50)
    for i in range(start, len(ewma_vols)):
        ts_idx = i + 1  # log_returns is offset by 1 from close
        if ts_idx < len(df):
            ts_val = ts_values[ts_idx]
            if hasattr(ts_val, "isoformat"):
                ts_str = ts_val.isoformat()
            elif hasattr(ts_val, "timestamp"):
                ts_str = str(ts_val)
            else:
                ts_str = str(ts_val)
        else:
            ts_str = str(i)
        history.append({
            "timestamp": ts_str,
            "vol": round(float(ewma_vols[i]), 6),
        })

    return {
        "current_vol": round(current_vol, 6),
        "current_vol_pct": round(current_vol * 100, 4),
        "forecast": forecast,
        "regime": regime,
        "regime_color": regime_color,
        "percentile": round(percentile, 1),
        "term_structure": term_structure,
        "term_structure_ratio": round(float(ts_ratio), 3),
        "rolling_vols": {k: round(v, 6) for k, v in rolling_vols.items()},
        "implied_move": round(implied_move, 2),
        "implied_move_pct": round(implied_move_pct, 4),
        "last_close": round(last_close, 6),
        "history": history,
    }
