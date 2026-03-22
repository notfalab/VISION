"""Application configuration using pydantic-settings."""

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        populate_by_name=True,
    )

    # Application
    app_name: str = "vision"
    app_env: str = "development"
    debug: bool = True
    secret_key: str = "change-me-to-a-random-string-in-production"
    log_level: str = "INFO"

    # Database — Railway injects DATABASE_URL; fallback to individual vars
    database_url_env: str = Field(default="", validation_alias="DATABASE_URL")
    postgres_host: str = "localhost"
    postgres_port: int = 5432
    postgres_user: str = "vision"
    postgres_password: str = "vision_dev_password"
    postgres_db: str = "vision_db"

    @property
    def database_url(self) -> str:
        if self.database_url_env:
            url = self.database_url_env
            # Railway provides postgresql:// but SQLAlchemy async needs asyncpg
            if url.startswith("postgresql://"):
                url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
            return url
        return (
            f"postgresql+asyncpg://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    @property
    def database_url_sync(self) -> str:
        """Sync URL for Alembic migrations."""
        if self.database_url_env:
            url = self.database_url_env
            # Ensure plain postgresql:// for sync driver
            if "+asyncpg" in url:
                url = url.replace("postgresql+asyncpg://", "postgresql://", 1)
            return url
        return (
            f"postgresql://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    # Redis — Railway injects REDIS_URL; fallback to individual vars
    redis_url_env: str = Field(default="", validation_alias="REDIS_URL")
    redis_host: str = "localhost"
    redis_port: int = 6379

    @property
    def redis_url(self) -> str:
        return self.redis_url_env or f"redis://{self.redis_host}:{self.redis_port}/0"

    @property
    def celery_broker_url(self) -> str:
        return self.redis_url_env or f"redis://{self.redis_host}:{self.redis_port}/1"

    @property
    def celery_result_backend(self) -> str:
        return self.redis_url_env or f"redis://{self.redis_host}:{self.redis_port}/2"

    # JWT
    jwt_secret_key: str = "change-me-jwt-secret"
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 30

    # API Keys - Data Sources
    alpha_vantage_api_key: str = ""
    binance_api_key: str = ""
    binance_secret_key: str = ""
    oanda_api_key: str = ""
    oanda_account_id: str = ""
    goldapi_api_key: str = ""
    massive_api_key: str = ""
    cryptocompare_api_key: str = ""
    coinglass_api_key: str = ""  # Liquidation heatmaps (free tier available)
    myfxbook_email: str = ""  # MyFxBook community outlook (free forex positioning data)
    myfxbook_password: str = ""

    # Alerts
    sendgrid_api_key: str = ""
    alert_email_from: str = "alerts@vision-trading.local"
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_phone_from: str = ""

    # Telegram Bot
    telegram_bot_token: str = ""
    telegram_chat_id: str = ""  # Your personal chat ID (admin notifications)
    telegram_channel_id: str = ""  # Channel ID for public signal broadcasts (fallback)
    telegram_gold_channel_id: str = ""  # Channel for Gold (XAUUSD) signals
    telegram_crypto_channel_id: str = ""  # Channel for Crypto (BTCUSD) signals
    telegram_forex_channel_id: str = ""  # Channel for Forex major pairs

    # Discord Webhooks
    discord_webhook_url: str = ""  # General/fallback channel
    discord_gold_webhook_url: str = ""  # Gold (XAUUSD) signals channel
    discord_crypto_webhook_url: str = ""  # Crypto (BTC/ETH/SOL) signals channel
    discord_forex_webhook_url: str = ""  # Forex major pairs signals channel
    discord_performance_webhook_url: str = ""  # Daily/weekly performance summaries

    # On-chain / Block explorers (single Etherscan key covers Ethereum + Polygon + 60+ EVM chains)
    etherscan_api_key: str = ""
    glassnode_api_key: str = ""
    solana_rpc_url: str = "https://api.mainnet-beta.solana.com"

    # Payment wallet addresses — MUST be set via env vars, no defaults for security
    wallet_address_ethereum: str = ""
    wallet_address_polygon: str = ""
    wallet_address_solana: str = ""

    # Subscription
    subscription_price_usd: float = 4999.0
    trial_days: int = 3

    # AI / LLM
    openai_api_key: str = ""


@lru_cache
def get_settings() -> Settings:
    s = Settings()
    # Block default secrets in production
    if s.app_env == "production":
        if s.jwt_secret_key in ("change-me-jwt-secret", ""):
            raise RuntimeError("FATAL: JWT_SECRET_KEY must be set in production. Do not use default.")
        if s.secret_key in ("change-me-to-a-random-string-in-production", ""):
            raise RuntimeError("FATAL: SECRET_KEY must be set in production. Do not use default.")

        # Validate critical API keys are present
        missing: list[str] = []
        if not s.oanda_api_key:
            missing.append("OANDA_API_KEY")
        if not s.binance_api_key:
            missing.append("BINANCE_API_KEY")
        if not s.wallet_address_ethereum and not s.wallet_address_polygon and not s.wallet_address_solana:
            missing.append("WALLET_ADDRESS_* (at least one payment wallet)")
        if missing:
            import logging
            logging.getLogger("vision.config").warning(
                "Missing recommended API keys in production: %s", ", ".join(missing)
            )
    return s
