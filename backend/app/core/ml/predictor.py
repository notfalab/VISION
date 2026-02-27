"""ML Price Prediction Engine — XGBoost model for next-candle direction prediction."""

import numpy as np
import pandas as pd
from pathlib import Path
from datetime import datetime, timezone

from backend.app.logging_config import get_logger

logger = get_logger("ml.predictor")

MODEL_DIR = Path("data/models")
MODEL_DIR.mkdir(parents=True, exist_ok=True)


def build_feature_matrix(df: pd.DataFrame) -> pd.DataFrame:
    """
    Build ML feature matrix from OHLCV data.
    Each row = features at time t, target = direction at t+1.
    """
    features = pd.DataFrame(index=df.index)

    # === Price features ===
    features["returns_1"] = df["close"].pct_change(1)
    features["returns_5"] = df["close"].pct_change(5)
    features["returns_10"] = df["close"].pct_change(10)

    # Candle shape features
    body = (df["close"] - df["open"]).abs()
    rng = df["high"] - df["low"]
    features["body_ratio"] = body / rng.replace(0, 1e-10)
    features["upper_wick_ratio"] = (df["high"] - df[["close", "open"]].max(axis=1)) / rng.replace(0, 1e-10)
    features["lower_wick_ratio"] = (df[["close", "open"]].min(axis=1) - df["low"]) / rng.replace(0, 1e-10)
    features["is_bullish"] = (df["close"] > df["open"]).astype(float)

    # === Trend features ===
    ema9 = df["close"].ewm(span=9).mean()
    ema21 = df["close"].ewm(span=21).mean()
    sma50 = df["close"].rolling(50).mean()
    features["ema9_dist"] = (df["close"] - ema9) / df["close"] * 100
    features["ema21_dist"] = (df["close"] - ema21) / df["close"] * 100
    features["sma50_dist"] = (df["close"] - sma50) / df["close"] * 100
    features["ema_cross"] = (ema9 - ema21) / df["close"] * 100

    # === Momentum features ===
    delta = df["close"].diff()
    gain = delta.where(delta > 0, 0.0)
    loss = (-delta).where(delta < 0, 0.0)
    avg_gain = gain.ewm(alpha=1/14, min_periods=14, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1/14, min_periods=14, adjust=False).mean()
    rs = avg_gain / avg_loss.replace(0, 1e-10)
    features["rsi"] = 100 - (100 / (1 + rs))

    # MACD
    ema12 = df["close"].ewm(span=12).mean()
    ema26 = df["close"].ewm(span=26).mean()
    macd = ema12 - ema26
    signal = macd.ewm(span=9).mean()
    features["macd_hist"] = macd - signal
    features["macd_hist_change"] = features["macd_hist"].diff()

    # Stochastic
    low14 = df["low"].rolling(14).min()
    high14 = df["high"].rolling(14).max()
    features["stoch_k"] = (df["close"] - low14) / (high14 - low14).replace(0, 1e-10) * 100

    # === Volatility features ===
    high_low = df["high"] - df["low"]
    high_close = (df["high"] - df["close"].shift(1)).abs()
    low_close = (df["low"] - df["close"].shift(1)).abs()
    tr = pd.concat([high_low, high_close, low_close], axis=1).max(axis=1)
    atr14 = tr.rolling(14).mean()
    features["atr_pct"] = atr14 / df["close"] * 100

    sma20 = df["close"].rolling(20).mean()
    std20 = df["close"].rolling(20).std()
    features["bb_pctb"] = (df["close"] - (sma20 - 2 * std20)) / (4 * std20).replace(0, 1e-10) * 100
    features["bb_width"] = (std20 * 4) / sma20 * 100

    # === Volume features ===
    vol_sma = df["volume"].rolling(20).mean()
    features["volume_ratio"] = df["volume"] / vol_sma.replace(0, 1)
    features["volume_trend"] = vol_sma.pct_change(5)

    # OBV slope
    obv = (np.sign(df["close"].diff()) * df["volume"]).cumsum()
    features["obv_slope"] = obv.rolling(10).apply(
        lambda x: np.polyfit(range(len(x)), x, 1)[0] if len(x) == 10 else 0,
        raw=True
    ) / df["volume"].rolling(10).mean().replace(0, 1)

    # === Lag features (previous candle signals) ===
    for lag in [1, 2, 3]:
        features[f"returns_lag{lag}"] = features["returns_1"].shift(lag)
        features[f"rsi_lag{lag}"] = features["rsi"].shift(lag)
        features[f"volume_ratio_lag{lag}"] = features["volume_ratio"].shift(lag)

    # === Target: next candle direction ===
    features["target"] = np.where(
        df["close"].shift(-1) > df["close"] * 1.001, 1,     # up > 0.1%
        np.where(df["close"].shift(-1) < df["close"] * 0.999, -1, 0)  # down > 0.1%
    )

    return features


def train_model(df: pd.DataFrame, symbol: str, timeframe: str) -> dict:
    """Train XGBoost model on historical data. Returns metrics."""
    try:
        from xgboost import XGBClassifier
        from sklearn.model_selection import TimeSeriesSplit
        from sklearn.metrics import accuracy_score, classification_report
        import joblib
    except ImportError:
        return {"error": "ML dependencies not installed. Install with: pip install xgboost scikit-learn joblib"}

    features = build_feature_matrix(df).dropna()

    if len(features) < 200:
        return {"error": f"Need at least 200 candles for training, got {len(features)}"}

    # Remove target from features
    X = features.drop(columns=["target"])
    y = features["target"]

    # Time-series split: train on first 80%, test on last 20%
    split_idx = int(len(X) * 0.8)
    X_train, X_test = X.iloc[:split_idx], X.iloc[split_idx:]
    y_train, y_test = y.iloc[:split_idx], y.iloc[split_idx:]

    # Train XGBoost
    model = XGBClassifier(
        n_estimators=200,
        max_depth=5,
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        min_child_weight=3,
        use_label_encoder=False,
        eval_metric="mlogloss",
        random_state=42,
        verbosity=0,
    )

    model.fit(X_train, y_train, eval_set=[(X_test, y_test)], verbose=False)

    # Evaluate
    y_pred = model.predict(X_test)
    accuracy = accuracy_score(y_test, y_pred)

    # Feature importance
    importance = dict(zip(X.columns, model.feature_importances_))
    top_features = sorted(importance.items(), key=lambda x: x[1], reverse=True)[:10]

    # Save model
    model_path = MODEL_DIR / f"xgb_{symbol}_{timeframe}.joblib"
    joblib.dump({"model": model, "features": list(X.columns)}, model_path)

    logger.info("model_trained",
                symbol=symbol, timeframe=timeframe,
                accuracy=round(accuracy, 3), samples=len(X_train))

    return {
        "accuracy": round(accuracy, 3),
        "train_samples": len(X_train),
        "test_samples": len(X_test),
        "top_features": [{"name": f, "importance": round(v, 4)} for f, v in top_features],
        "model_path": str(model_path),
        "trained_at": datetime.now(timezone.utc).isoformat(),
    }


def predict(df: pd.DataFrame, symbol: str, timeframe: str) -> dict:
    """
    Predict next-candle direction using trained model.
    Auto-trains if model doesn't exist.
    """
    try:
        import joblib
    except ImportError:
        return {"error": "ML dependencies not installed"}

    model_path = MODEL_DIR / f"xgb_{symbol}_{timeframe}.joblib"

    # Auto-train if model doesn't exist
    if not model_path.exists():
        logger.info("auto_training", symbol=symbol, timeframe=timeframe)
        train_result = train_model(df, symbol, timeframe)
        if "error" in train_result:
            return train_result

    # Load model
    try:
        data = joblib.load(model_path)
        model = data["model"]
        feature_names = data["features"]
    except Exception as e:
        logger.error("model_load_failed", error=str(e))
        # Retrain
        train_result = train_model(df, symbol, timeframe)
        if "error" in train_result:
            return train_result
        data = joblib.load(model_path)
        model = data["model"]
        feature_names = data["features"]

    # Build features for latest candle
    features = build_feature_matrix(df).dropna()

    if len(features) == 0:
        return {"error": "Could not compute features"}

    latest = features.iloc[-1:][feature_names]

    # Predict
    prediction = model.predict(latest)[0]
    probabilities = model.predict_proba(latest)[0]
    classes = model.classes_

    # Map prediction to direction
    direction_map = {-1: "bearish", 0: "neutral", 1: "bullish"}
    direction = direction_map.get(int(prediction), "neutral")

    # Confidence = max probability
    confidence = float(max(probabilities))

    # Class probabilities
    class_probs = {}
    for cls, prob in zip(classes, probabilities):
        class_probs[direction_map.get(int(cls), str(cls))] = round(float(prob), 3)

    # Feature importance from model
    importance = dict(zip(feature_names, model.feature_importances_))
    top_features = sorted(importance.items(), key=lambda x: x[1], reverse=True)[:7]

    # Model info
    model_age_hours = 0
    try:
        import os
        mtime = os.path.getmtime(model_path)
        model_age_hours = (datetime.now(timezone.utc).timestamp() - mtime) / 3600
    except Exception:
        pass

    return {
        "direction": direction,
        "confidence": round(confidence, 3),
        "probabilities": class_probs,
        "top_features": [{"name": f, "importance": round(v, 4)} for f, v in top_features],
        "model_age_hours": round(model_age_hours, 1),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
