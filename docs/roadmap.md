# VISION - Development Roadmap

## Phase Overview

```
Phase 0: Foundation (Days 1-2)
    └── Project setup, DB schema, base abstractions

Phase 1: MVP Data Pipeline (Days 3-5)
    └── Fetch real-time + historical data for forex/gold/crypto

Phase 2: Core Indicators (Days 6-9)
    └── Volume analysis, OBV, A/D, supply/demand zones

Phase 3: Institutional Intelligence (Days 10-13)
    └── COT parser, 13F parser, on-chain whale tracker

Phase 4: Frontend Dashboard (Days 14-18)
    └── Interactive charts, multi-asset dashboard, alerts UI

Phase 5: Alert System (Days 19-21)
    └── Real-time alerts, email/SMS, WebSocket push

Phase 6: ML Pipeline (Days 22-27)
    └── Feature engineering, model training, backtesting

Phase 7: Advanced Features (Days 28-33)
    └── Order book analysis, risk calculator, trade journal

Phase 8: Integration & Polish (Days 34-38)
    └── Bot API, MT5/CCXT integration, mobile views

Phase 9: DevOps & Deploy (Days 39-42)
    └── Docker, CI/CD, monitoring, production deploy
```

---

## Phase 0: Foundation (Days 1-2)

### Milestone: Project skeleton running with DB connected

| Task | Description | Priority |
|------|-------------|----------|
| 0.1 | Initialize Git repo, Poetry project, .gitignore | P0 |
| 0.2 | Project directory structure (modular) | P0 |
| 0.3 | Configure PostgreSQL + TimescaleDB extension | P0 |
| 0.4 | Configure Redis | P0 |
| 0.5 | SQLAlchemy models + Alembic migrations | P0 |
| 0.6 | FastAPI app skeleton with health endpoint | P0 |
| 0.7 | Docker Compose for dev (postgres, redis, app) | P0 |
| 0.8 | .env template + settings management (pydantic-settings) | P0 |
| 0.9 | Logging setup (structlog) | P1 |
| 0.10 | pytest configuration + first test | P1 |

### Deliverable
```bash
docker compose up  # starts postgres, redis, fastapi
curl localhost:8000/health  # returns {"status": "ok"}
```

---

## Phase 1: MVP Data Pipeline (Days 3-5)

### Milestone: Live price data streaming for at least 1 forex pair, gold, and 1 crypto pair

| Task | Description | Priority |
|------|-------------|----------|
| 1.1 | Abstract `DataSourceAdapter` interface | P0 |
| 1.2 | Alpha Vantage adapter (forex + historical) | P0 |
| 1.3 | Binance WebSocket adapter (crypto real-time) | P0 |
| 1.4 | OANDA REST adapter (forex real-time) - or fallback to free API | P0 |
| 1.5 | OHLCV data ingestion to PostgreSQL/TimescaleDB | P0 |
| 1.6 | Redis pub/sub for real-time price updates | P0 |
| 1.7 | CCXT unified adapter for multi-exchange support | P1 |
| 1.8 | Gold spot data (XAUUSD via forex API or metals API) | P0 |
| 1.9 | Celery task for scheduled historical data fetch | P1 |
| 1.10 | Data validation and normalization pipeline | P1 |
| 1.11 | Symbol registry (config-driven asset management) | P0 |

### Deliverable
```python
# WebSocket streaming BTCUSD, EURUSD, XAUUSD prices
# Historical OHLCV data stored in DB for backtesting
```

---

## Phase 2: Core Indicators (Days 6-9)

### Milestone: All key indicators calculating in real-time

| Task | Description | Priority |
|------|-------------|----------|
| 2.1 | Indicator engine base class + registry | P0 |
| 2.2 | Volume spike detector (configurable threshold) | P0 |
| 2.3 | Accumulation/Distribution classifier | P0 |
| 2.4 | OBV calculator (multi-timeframe) | P0 |
| 2.5 | A/D line calculator | P0 |
| 2.6 | Divergence detector (price vs OBV/AD) | P0 |
| 2.7 | Supply/Demand zone identifier (multi-TF) | P0 |
| 2.8 | ATR calculator (for risk management) | P1 |
| 2.9 | Relative strength calculator (vs benchmarks) | P1 |
| 2.10 | TA-Lib integration for standard indicators | P1 |
| 2.11 | Indicator persistence to DB | P0 |
| 2.12 | Unit tests for all indicators | P0 |

### Deliverable
```python
# GET /api/indicators/EURUSD?timeframe=H4
# Returns: volume_spike, obv, ad_line, divergences, sd_zones
```

---

## Phase 3: Institutional Intelligence (Days 10-13)

### Milestone: Automated COT report parsing + on-chain whale tracking

| Task | Description | Priority |
|------|-------------|----------|
| 3.1 | CFTC COT report fetcher (weekly schedule) | P0 |
| 3.2 | COT data parser (commercial/non-commercial positions) | P0 |
| 3.3 | COT net position change calculator + alerts | P0 |
| 3.4 | SEC 13F filing fetcher for gold ETF (GLD) holdings | P1 |
| 3.5 | On-chain whale transfer monitor (Etherscan API) | P0 |
| 3.6 | Glassnode integration for BTC/ETH metrics | P1 |
| 3.7 | Institutional position change scoring | P0 |
| 3.8 | Historical COT data backfill | P1 |
| 3.9 | COT visualization data endpoints | P0 |
| 3.10 | Whale alert aggregation (combine sources) | P1 |

### Deliverable
```python
# GET /api/institutional/cot/EURUSD  -> net positions over time
# GET /api/institutional/whales/BTCUSD -> recent large transfers
# Alert: "COT: EUR commercial shorts increased 15% this week"
```

---

## Phase 4: Frontend Dashboard (Days 14-18)

### Milestone: Interactive web dashboard with charts and multi-asset view

| Task | Description | Priority |
|------|-------------|----------|
| 4.1 | Next.js project setup + Tailwind CSS | P0 |
| 4.2 | Authentication pages (login/register) | P0 |
| 4.3 | Main dashboard layout (sidebar + multi-panel) | P0 |
| 4.4 | Asset selector component (forex/gold/crypto tabs) | P0 |
| 4.5 | TradingView lightweight charts integration | P0 |
| 4.6 | Supply/demand zone overlay on charts | P0 |
| 4.7 | Volume analysis panel (spikes, OBV, A/D) | P0 |
| 4.8 | COT report visualization (bar charts) | P1 |
| 4.9 | Relative strength heatmap | P1 |
| 4.10 | WebSocket connection for real-time updates | P0 |
| 4.11 | Alert configuration UI | P1 |
| 4.12 | Responsive layout for tablet/mobile | P2 |

### Deliverable
```
Browser: localhost:3000
- Login -> Dashboard with EURUSD chart
- Toggle to BTCUSD, XAUUSD
- See volume spikes highlighted, S/D zones drawn
- Real-time price updates
```

---

## Phase 5: Alert System (Days 19-21)

### Milestone: Multi-channel alerts triggered by indicator conditions

| Task | Description | Priority |
|------|-------------|----------|
| 5.1 | Alert engine with condition evaluator | P0 |
| 5.2 | Alert rule CRUD API | P0 |
| 5.3 | WebSocket push notifications | P0 |
| 5.4 | Email notifications (SendGrid or SMTP) | P1 |
| 5.5 | SMS via Twilio | P2 |
| 5.6 | Alert history and acknowledgment | P1 |
| 5.7 | Cooldown/throttling per alert rule | P0 |
| 5.8 | Pre-built alert templates (COT change, volume spike, etc.) | P1 |

### Deliverable
```
- Configure: "Alert me when XAUUSD volume > 3x 20-period avg"
- Receive: push notification + email when triggered
```

---

## Phase 6: ML Pipeline (Days 22-27)

### Milestone: Trained model predicting reversals with backtesting results

| Task | Description | Priority |
|------|-------------|----------|
| 6.1 | Feature engineering pipeline (from indicators) | P0 |
| 6.2 | Training data preparation (labeled reversals) | P0 |
| 6.3 | Random Forest baseline model | P0 |
| 6.4 | XGBoost model | P1 |
| 6.5 | LSTM model for sequential patterns | P2 |
| 6.6 | Model evaluation metrics (precision, recall, F1) | P0 |
| 6.7 | Backtesting engine integration | P0 |
| 6.8 | Walk-forward validation | P1 |
| 6.9 | Model serving API endpoint | P0 |
| 6.10 | Prediction visualization on charts | P1 |
| 6.11 | Model retraining scheduler | P2 |

### Deliverable
```python
# GET /api/ml/predict/EURUSD?timeframe=H4
# Returns: {"reversal_probability": 0.73, "direction": "bearish", "confidence": "high"}
# Backtesting: Sharpe 1.4, Max DD -8%, Win rate 61%
```

---

## Phase 7: Advanced Features (Days 28-33)

### Milestone: Order book analysis, risk management, trade journal

| Task | Description | Priority |
|------|-------------|----------|
| 7.1 | Binance order book WebSocket integration | P0 |
| 7.2 | Liquidity wall detection algorithm | P0 |
| 7.3 | Spoofing pattern detection | P1 |
| 7.4 | Order absorption tracker | P1 |
| 7.5 | Order book visualization (depth chart) | P1 |
| 7.6 | Position sizing calculator (Kelly criterion + fixed %) | P0 |
| 7.7 | ATR-based stop-loss calculator | P0 |
| 7.8 | Trade journal CRUD | P0 |
| 7.9 | Post-mortem analysis (automatic stats) | P1 |
| 7.10 | Pattern detection with ML (cup & handle, etc.) | P1 |

### Deliverable
```
- Order book depth chart with walls highlighted
- Risk calculator: "For EURUSD with 2% risk, SL 50 pips -> 0.4 lots"
- Trade journal with P&L tracking and analytics
```

---

## Phase 8: Integration & Polish (Days 34-38)

### Milestone: External bot integration + API documentation

| Task | Description | Priority |
|------|-------------|----------|
| 8.1 | RESTful API for external bots (documented) | P0 |
| 8.2 | MT5 integration guide + connector | P1 |
| 8.3 | CCXT bot example (crypto) | P1 |
| 8.4 | Webhook system for custom integrations | P0 |
| 8.5 | Swagger/OpenAPI documentation | P0 |
| 8.6 | Asset config file system (add new assets easily) | P0 |
| 8.7 | Multi-user role management (admin/trader) | P1 |
| 8.8 | API rate limiting per user | P1 |
| 8.9 | React Native mobile shell (or PWA) | P2 |

---

## Phase 9: DevOps & Deploy (Days 39-42)

### Milestone: Production-ready deployment

| Task | Description | Priority |
|------|-------------|----------|
| 9.1 | Dockerfile for backend + frontend | P0 |
| 9.2 | Docker Compose production config | P0 |
| 9.3 | GitHub Actions CI pipeline (lint + test) | P0 |
| 9.4 | GitHub Actions CD pipeline (deploy) | P1 |
| 9.5 | Prometheus metrics endpoints | P1 |
| 9.6 | Grafana dashboards | P1 |
| 9.7 | Nginx config with SSL | P0 |
| 9.8 | Kubernetes manifests (future scaling) | P2 |
| 9.9 | Backup strategy for PostgreSQL | P1 |
| 9.10 | Security audit checklist | P0 |
| 9.11 | Legal disclaimers and compliance docs | P0 |

---

## API Keys Required

| Service | Purpose | Free Tier | Link |
|---------|---------|-----------|------|
| Alpha Vantage | Forex/stock historical data | 25 req/day | alphaavantage.co |
| Binance | Crypto real-time + historical | Yes (generous) | binance.com/en/my/settings/api-management |
| OANDA | Forex real-time (practice account) | Free practice | oanda.com |
| Twilio | SMS alerts | Trial credits | twilio.com |
| SendGrid | Email alerts | 100/day free | sendgrid.com |
| Glassnode | On-chain metrics | Limited free | glassnode.com |
| Etherscan | On-chain transfers | 5 req/sec free | etherscan.io/apis |

---

## Project Structure (Target)

```
vision/
├── docker-compose.yml
├── docker-compose.prod.yml
├── .env.template
├── .gitignore
├── pyproject.toml
├── alembic.ini
├── README.md
│
├── docs/
│   ├── architecture.md
│   ├── roadmap.md
│   └── api/
│
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                  # FastAPI app entry
│   │   ├── config.py                # Settings (pydantic-settings)
│   │   ├── database.py              # DB session + engine
│   │   │
│   │   ├── models/                  # SQLAlchemy models
│   │   │   ├── __init__.py
│   │   │   ├── asset.py
│   │   │   ├── ohlcv.py
│   │   │   ├── indicator.py
│   │   │   ├── cot_report.py
│   │   │   ├── alert.py
│   │   │   ├── trade.py
│   │   │   ├── user.py
│   │   │   └── onchain_event.py
│   │   │
│   │   ├── schemas/                 # Pydantic schemas
│   │   │   ├── __init__.py
│   │   │   ├── asset.py
│   │   │   ├── ohlcv.py
│   │   │   ├── indicator.py
│   │   │   └── alert.py
│   │   │
│   │   ├── api/                     # API routes
│   │   │   ├── __init__.py
│   │   │   ├── deps.py              # Dependencies (auth, db)
│   │   │   ├── v1/
│   │   │   │   ├── __init__.py
│   │   │   │   ├── assets.py
│   │   │   │   ├── prices.py
│   │   │   │   ├── indicators.py
│   │   │   │   ├── institutional.py
│   │   │   │   ├── alerts.py
│   │   │   │   ├── ml.py
│   │   │   │   ├── journal.py
│   │   │   │   └── auth.py
│   │   │   └── websocket.py
│   │   │
│   │   ├── core/                    # Business logic
│   │   │   ├── __init__.py
│   │   │   ├── indicators/
│   │   │   │   ├── __init__.py
│   │   │   │   ├── base.py          # Abstract indicator
│   │   │   │   ├── volume.py        # Volume spike, acc/dist
│   │   │   │   ├── obv.py           # On-Balance Volume
│   │   │   │   ├── ad_line.py       # Accumulation/Distribution
│   │   │   │   ├── divergence.py    # Divergence detector
│   │   │   │   ├── supply_demand.py # S/D zones
│   │   │   │   ├── relative_strength.py
│   │   │   │   └── atr.py
│   │   │   │
│   │   │   ├── institutional/
│   │   │   │   ├── __init__.py
│   │   │   │   ├── cot_parser.py
│   │   │   │   ├── sec_13f.py
│   │   │   │   └── onchain.py
│   │   │   │
│   │   │   ├── orderbook/
│   │   │   │   ├── __init__.py
│   │   │   │   ├── analyzer.py
│   │   │   │   └── patterns.py
│   │   │   │
│   │   │   ├── ml/
│   │   │   │   ├── __init__.py
│   │   │   │   ├── features.py
│   │   │   │   ├── models.py
│   │   │   │   └── backtester.py
│   │   │   │
│   │   │   └── risk/
│   │   │       ├── __init__.py
│   │   │       ├── position_sizing.py
│   │   │       └── stop_loss.py
│   │   │
│   │   ├── data/                    # Data source adapters
│   │   │   ├── __init__.py
│   │   │   ├── base.py              # Abstract adapter
│   │   │   ├── binance_adapter.py
│   │   │   ├── oanda_adapter.py
│   │   │   ├── alpha_vantage.py
│   │   │   ├── ccxt_adapter.py
│   │   │   └── registry.py          # Symbol registry
│   │   │
│   │   ├── alerts/
│   │   │   ├── __init__.py
│   │   │   ├── engine.py
│   │   │   ├── channels.py          # Email, SMS, push
│   │   │   └── rules.py
│   │   │
│   │   └── tasks/                   # Celery async tasks
│   │       ├── __init__.py
│   │       ├── celery_app.py
│   │       ├── fetch_cot.py
│   │       ├── fetch_prices.py
│   │       └── onchain_monitor.py
│   │
│   ├── alembic/                     # DB migrations
│   │   ├── env.py
│   │   └── versions/
│   │
│   └── tests/
│       ├── conftest.py
│       ├── test_indicators/
│       ├── test_data_adapters/
│       ├── test_api/
│       └── test_ml/
│
├── frontend/
│   ├── package.json
│   ├── next.config.js
│   ├── tailwind.config.js
│   ├── src/
│   │   ├── app/                     # Next.js app router
│   │   ├── components/
│   │   │   ├── charts/
│   │   │   ├── dashboard/
│   │   │   ├── alerts/
│   │   │   └── common/
│   │   ├── hooks/
│   │   ├── lib/
│   │   │   ├── api.ts               # API client
│   │   │   └── websocket.ts
│   │   ├── store/                   # Redux/Zustand
│   │   └── types/
│   └── public/
│
└── config/
    ├── assets/
    │   ├── forex.yaml               # Forex pairs config
    │   ├── crypto.yaml              # Crypto pairs config
    │   └── commodities.yaml         # Gold, silver, etc.
    ├── nginx/
    │   └── nginx.conf
    └── grafana/
        └── dashboards/
```
