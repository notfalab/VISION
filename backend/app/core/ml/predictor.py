"""ML Price Prediction Engine — Ensemble (XGBoost + LightGBM) with walk-forward validation."""

import numpy as np
import pandas as pd
from pathlib import Path
from datetime import datetime, timezone

from backend.app.logging_config import get_logger

logger = get_logger("ml.predictor")

MODEL_DIR = Path("data/models")
MODEL_DIR.mkdir(parents=True, exist_ok=True)

DIRECTION_MAP = {0: "bearish", 1: "neutral", 2: "bullish"}


# ── Feature Engineering ──────────────────────────────────────────────


def build_feature_matrix(df: pd.DataFrame, atr_multiplier: float = 0.5) -> pd.DataFrame:
    """
    Build ML feature matrix from OHLCV data.
    Each row = features at time t, target = direction at t+1.
    Target uses ATR-adaptive threshold instead of fixed percentage.
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

    # === Target: next candle direction using ATR-adaptive threshold ===
    # Threshold = atr_multiplier * ATR(14) — adapts to each asset's volatility
    # BTC ($90K, ATR ~$1000) gets ~$500 threshold vs XAUUSD ($2900, ATR ~$20) gets ~$10
    atr_threshold = atr14 * atr_multiplier
    next_move = df["close"].shift(-1) - df["close"]
    features["target"] = np.where(
        next_move > atr_threshold, 2,                  # up beyond threshold
        np.where(next_move < -atr_threshold, 0, 1)     # down beyond threshold
    )

    return features


# ── Feature Selection ─────────────────────────────────────────────


def select_features(X: pd.DataFrame, y: pd.Series, top_k: int = 20) -> list[str]:
    """Train a quick XGBoost and select top-K features by importance."""
    from xgboost import XGBClassifier

    quick_model = XGBClassifier(
        n_estimators=50, max_depth=4, learning_rate=0.1,
        verbosity=0, random_state=42,
    )
    quick_model.fit(X, y)
    importance = dict(zip(X.columns, quick_model.feature_importances_))
    sorted_features = sorted(importance.items(), key=lambda x: x[1], reverse=True)

    # Keep features with non-negligible importance (> 0.5%) and limit to top_k
    selected = [f for f, v in sorted_features[:top_k] if v > 0.005]
    if len(selected) < 5:
        selected = [f for f, _ in sorted_features[:5]]

    return selected


# ── Walk-Forward Validation ──────────────────────────────────────


def walk_forward_validate(
    X: pd.DataFrame,
    y: pd.Series,
    model_factory,
    n_splits: int = 5,
    test_size: int = 100,
    purge_gap: int = 5,
) -> list[dict]:
    """
    Walk-forward validation with expanding training window.
    Returns list of fold results with accuracy and per-class metrics.
    """
    from sklearn.metrics import accuracy_score, classification_report

    results = []
    total = len(X)

    first_test_start = total - (n_splits * test_size)
    if first_test_start < 200:
        # Not enough data — single split
        first_test_start = int(total * 0.6)
        n_splits = 1
        test_size = total - first_test_start - purge_gap

    for fold in range(n_splits):
        test_start = first_test_start + (fold * test_size)
        test_end = min(test_start + test_size, total)
        train_end = test_start - purge_gap

        X_train = X.iloc[:train_end]
        y_train = y.iloc[:train_end]
        X_test = X.iloc[test_start:test_end]
        y_test = y.iloc[test_start:test_end]

        if len(X_train) < 100 or len(X_test) < 10:
            continue

        model = model_factory()
        model.fit(X_train, y_train)
        y_pred = model.predict(X_test)

        acc = accuracy_score(y_test, y_pred)

        # Directional accuracy (excluding neutral predictions and actuals)
        dir_mask = (y_test != 1) & (y_pred != 1)
        dir_acc = float(accuracy_score(y_test[dir_mask], y_pred[dir_mask])) if dir_mask.sum() > 5 else 0.0

        report = classification_report(y_test, y_pred, output_dict=True, zero_division=0)

        results.append({
            "fold": fold,
            "accuracy": float(acc),
            "directional_accuracy": float(dir_acc),
            "train_size": len(X_train),
            "test_size": len(X_test),
            "report": report,
        })

    return results


# ── Model Factories ──────────────────────────────────────────────


def _create_xgb():
    from xgboost import XGBClassifier
    return XGBClassifier(
        n_estimators=300, max_depth=5, learning_rate=0.03,
        subsample=0.8, colsample_bytree=0.8, min_child_weight=5,
        reg_alpha=0.1, reg_lambda=1.0,
        eval_metric="mlogloss", random_state=42, verbosity=0,
    )


def _create_lgbm():
    from lightgbm import LGBMClassifier
    return LGBMClassifier(
        n_estimators=300, max_depth=5, learning_rate=0.03,
        subsample=0.8, colsample_bytree=0.8, min_child_weight=5,
        reg_alpha=0.1, reg_lambda=1.0,
        random_state=42, verbose=-1,
    )


def _ensemble_predict(models: list, weights: list[float], X: pd.DataFrame) -> tuple:
    """Soft-vote ensemble prediction. Returns (predicted_classes, probability_matrix)."""
    weighted_proba = None
    for model, weight in zip(models, weights):
        proba = model.predict_proba(X)
        if weighted_proba is None:
            weighted_proba = proba * weight
        else:
            weighted_proba += proba * weight

    weighted_proba /= sum(weights)
    predictions = np.argmax(weighted_proba, axis=1)
    classes = models[0].classes_
    predicted_classes = classes[predictions]

    return predicted_classes, weighted_proba


# ── Training ─────────────────────────────────────────────────────


def train_model(df: pd.DataFrame, symbol: str, timeframe: str) -> dict:
    """
    Train ensemble model (XGBoost + LightGBM) with walk-forward validation,
    ATR-adaptive targets, and feature selection.
    """
    try:
        from xgboost import XGBClassifier
        from sklearn.metrics import accuracy_score, classification_report
        import joblib
    except ImportError:
        return {"error": "ML dependencies not installed. Install with: pip install 'vision[ml]'"}

    # Check for LightGBM (optional)
    use_lgbm = True
    try:
        from lightgbm import LGBMClassifier
    except ImportError:
        use_lgbm = False
        logger.info("lightgbm_not_available", msg="Using XGBoost only")

    # 1. Build features with ATR-adaptive targets
    features = build_feature_matrix(df).dropna()

    if len(features) < 300:
        return {"error": f"Need at least 300 candles for training, got {len(features)}"}

    X = features.drop(columns=["target"])
    y = features["target"].astype(int)

    # 2. Feature selection: keep top 20 features
    selected = select_features(X, y, top_k=20)
    X = X[selected]
    logger.info("features_selected", count=len(selected), names=selected[:5])

    # 3. Walk-forward validation (XGBoost)
    wf_results = walk_forward_validate(X, y, _create_xgb, n_splits=5, test_size=100)

    if not wf_results:
        return {"error": "Walk-forward validation failed: insufficient data"}

    avg_accuracy = float(np.mean([r["accuracy"] for r in wf_results]))
    avg_dir_accuracy = float(np.mean([r["directional_accuracy"] for r in wf_results]))

    # 4. Train final models on all data (except last 5 candles as purge)
    split_idx = len(X) - 5
    X_train = X.iloc[:split_idx]
    y_train = y.iloc[:split_idx]

    xgb_model = _create_xgb()
    xgb_model.fit(X_train, y_train)

    models = [xgb_model]
    weights = [1.0]

    if use_lgbm:
        lgbm_model = _create_lgbm()
        lgbm_model.fit(X_train, y_train)
        models.append(lgbm_model)

        # Weight by walk-forward performance
        lgbm_wf = walk_forward_validate(X, y, _create_lgbm, n_splits=5, test_size=100)
        lgbm_avg = float(np.mean([r["accuracy"] for r in lgbm_wf])) if lgbm_wf else 0.33
        xgb_avg = avg_accuracy

        total = xgb_avg + lgbm_avg
        weights = [xgb_avg / total, lgbm_avg / total] if total > 0 else [0.5, 0.5]

    # 5. Feature importance (from XGBoost)
    importance = {k: float(v) for k, v in zip(selected, xgb_model.feature_importances_)}
    top_features = sorted(importance.items(), key=lambda x: x[1], reverse=True)[:10]

    # 6. Per-class metrics from last walk-forward fold
    per_class = {}
    if wf_results:
        last_report = wf_results[-1].get("report", {})
        for cls_key in ["0", "1", "2"]:
            if cls_key in last_report:
                label = DIRECTION_MAP.get(int(cls_key), cls_key)
                per_class[label] = {
                    "precision": round(last_report[cls_key].get("precision", 0), 3),
                    "recall": round(last_report[cls_key].get("recall", 0), 3),
                    "f1": round(last_report[cls_key].get("f1-score", 0), 3),
                    "support": int(last_report[cls_key].get("support", 0)),
                }

    # 7. Save ensemble
    model_path = MODEL_DIR / f"ensemble_{symbol}_{timeframe}.joblib"
    joblib.dump({
        "models": models,
        "weights": weights,
        "features": selected,
        "model_type": "ensemble_xgb_lgbm" if use_lgbm else "xgboost",
    }, model_path)

    # Backward-compatible single-model save
    compat_path = MODEL_DIR / f"xgb_{symbol}_{timeframe}.joblib"
    joblib.dump({"model": xgb_model, "features": selected}, compat_path)

    logger.info("model_trained",
                symbol=symbol, timeframe=timeframe,
                accuracy=round(avg_accuracy, 3),
                dir_accuracy=round(avg_dir_accuracy, 3),
                ensemble=use_lgbm, features=len(selected))

    return {
        "accuracy": round(avg_accuracy, 3),
        "directional_accuracy": round(avg_dir_accuracy, 3),
        "model_type": "ensemble_xgb_lgbm" if use_lgbm else "xgboost",
        "train_samples": len(X_train),
        "n_folds": len(wf_results),
        "fold_accuracies": [round(r["accuracy"], 3) for r in wf_results],
        "features_selected": len(selected),
        "top_features": [{"name": f, "importance": round(v, 4)} for f, v in top_features],
        "per_class_metrics": per_class,
        "model_path": str(model_path),
        "trained_at": datetime.now(timezone.utc).isoformat(),
    }


# ── Prediction ───────────────────────────────────────────────────


def predict(df: pd.DataFrame, symbol: str, timeframe: str) -> dict:
    """
    Predict next-candle direction using ensemble model.
    Auto-trains if model doesn't exist.
    """
    try:
        import joblib
    except ImportError:
        return {"error": "ML dependencies not installed"}

    # Try ensemble first, fall back to legacy xgb-only model
    ensemble_path = MODEL_DIR / f"ensemble_{symbol}_{timeframe}.joblib"
    legacy_path = MODEL_DIR / f"xgb_{symbol}_{timeframe}.joblib"
    model_path = ensemble_path if ensemble_path.exists() else legacy_path

    # Auto-train if no model exists
    if not model_path.exists():
        logger.info("auto_training", symbol=symbol, timeframe=timeframe)
        train_result = train_model(df, symbol, timeframe)
        if "error" in train_result:
            return train_result
        model_path = ensemble_path if ensemble_path.exists() else legacy_path

    # Load model
    try:
        data = joblib.load(model_path)
    except Exception as e:
        logger.error("model_load_failed", error=str(e))
        train_result = train_model(df, symbol, timeframe)
        if "error" in train_result:
            return train_result
        data = joblib.load(ensemble_path if ensemble_path.exists() else legacy_path)

    feature_names = data["features"]

    # Detect ensemble vs legacy format
    if "models" in data:
        models = data["models"]
        weights = data["weights"]
        model_type = data.get("model_type", "ensemble")
    else:
        models = [data["model"]]
        weights = [1.0]
        model_type = "xgboost_legacy"

    # Build features for latest candle
    features = build_feature_matrix(df).dropna()
    if len(features) == 0:
        return {"error": "Could not compute features"}

    latest = features.iloc[-1:][feature_names]

    # Ensemble prediction
    predicted_classes, proba_matrix = _ensemble_predict(models, weights, latest)
    prediction = predicted_classes[0]
    probabilities = proba_matrix[0]

    direction = DIRECTION_MAP.get(int(prediction), "neutral")
    confidence = float(max(probabilities))

    # Class probabilities
    classes = models[0].classes_
    class_probs = {}
    for cls, prob in zip(classes, probabilities):
        class_probs[DIRECTION_MAP.get(int(cls), str(cls))] = round(float(prob), 3)

    # Feature importance (from first model, typically XGBoost)
    importance = {k: float(v) for k, v in zip(feature_names, models[0].feature_importances_)}
    top_features = sorted(importance.items(), key=lambda x: x[1], reverse=True)[:7]

    # Model age
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
        "model_type": model_type,
        "top_features": [{"name": f, "importance": round(v, 4)} for f, v in top_features],
        "model_age_hours": round(model_age_hours, 1),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
