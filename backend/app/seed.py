"""Seed database with initial assets from config YAML files."""

import asyncio
import sys
from pathlib import Path

import yaml
from sqlalchemy import select, func
from sqlalchemy.dialects.postgresql import insert as pg_insert

# Ensure project root on path
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import bcrypt

from backend.app.database import async_session
from backend.app.models.asset import Asset, MarketType
from backend.app.models.user import User, UserRole
from backend.app.logging_config import get_logger

logger = get_logger("seed")

CONFIG_DIR = Path(__file__).resolve().parents[2] / "config" / "assets"


def _asset_values(item: dict, market_type: MarketType, exchange: str | None = None) -> dict:
    """Build a values dict for upsert."""
    vals = {
        "symbol": item["symbol"],
        "name": item["name"],
        "market_type": market_type,
        "base_currency": item.get("base_currency"),
        "quote_currency": item.get("quote_currency"),
        "is_active": True,
    }
    if exchange:
        vals["exchange"] = exchange
    if item.get("tick_size"):
        vals["tick_size"] = item["tick_size"]

    # Build config JSON
    config = {}
    for key in ("cot_code", "related_etf", "on_chain", "chain"):
        if key in item:
            config[key] = item[key]
    if config:
        vals["config"] = config

    return vals


async def seed_assets():
    """Seed all assets from YAML config files using upsert (safe for concurrent workers)."""
    async with async_session() as session:
        # Quick check — skip if already fully seeded
        result = await session.execute(select(func.count(Asset.id)))
        existing_count = result.scalar() or 0
        if existing_count >= 37:
            logger.info("assets_already_seeded", count=existing_count)
            return

        count = 0
        all_values = []

        # ── Commodities (Gold, Silver) ──
        comm_path = CONFIG_DIR / "commodities.yaml"
        if comm_path.exists():
            comm_cfg = yaml.safe_load(comm_path.read_text())
            for item in comm_cfg.get("metals", []):
                all_values.append(_asset_values(item, MarketType.COMMODITY))

        # ── Forex pairs ──
        forex_path = CONFIG_DIR / "forex.yaml"
        if forex_path.exists():
            forex_cfg = yaml.safe_load(forex_path.read_text())
            for group in ["majors", "minors"]:
                for item in forex_cfg.get(group, []):
                    all_values.append(_asset_values(item, MarketType.FOREX))

        # ── Crypto pairs ──
        crypto_path = CONFIG_DIR / "crypto.yaml"
        if crypto_path.exists():
            crypto_cfg = yaml.safe_load(crypto_path.read_text())
            for item in crypto_cfg.get("pairs", []):
                all_values.append(_asset_values(item, MarketType.CRYPTO, exchange=item.get("exchange")))

        # ── Stock indices ──
        idx_path = CONFIG_DIR / "indices.yaml"
        if idx_path.exists():
            idx_cfg = yaml.safe_load(idx_path.read_text())
            for item in idx_cfg.get("indices", []):
                all_values.append(_asset_values(item, MarketType.INDEX))

        # Upsert each asset (ON CONFLICT DO NOTHING — safe for race conditions)
        for vals in all_values:
            stmt = pg_insert(Asset).values(**vals).on_conflict_do_nothing(index_elements=["symbol"])
            await session.execute(stmt)
            count += 1

        await session.commit()
        logger.info("assets_seeded", count=count)


async def seed_admin():
    """Create default admin user if none exists."""
    async with async_session() as session:
        result = await session.execute(
            select(User).where(User.role == UserRole.ADMIN)
        )
        if result.scalar_one_or_none():
            logger.info("admin_already_exists")
            return

        hashed = bcrypt.hashpw(b"Vision2025!", bcrypt.gensalt()).decode()
        admin = User(
            email="admin@vision.io",
            username="admin",
            hashed_password=hashed,
            role=UserRole.ADMIN,
            is_active=True,
        )
        session.add(admin)
        await session.commit()
        logger.info("admin_created", username="admin")


if __name__ == "__main__":
    asyncio.run(seed_assets())
    asyncio.run(seed_admin())
