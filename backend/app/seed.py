"""Seed database with initial assets from config YAML files."""

import asyncio
import sys
from pathlib import Path

import yaml
from sqlalchemy import select, func

# Ensure project root on path
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from backend.app.database import async_session
from backend.app.models.asset import Asset, MarketType
from backend.app.logging_config import get_logger

logger = get_logger("seed")

CONFIG_DIR = Path(__file__).resolve().parents[2] / "config" / "assets"


async def seed_assets():
    """Seed all assets from YAML config files. Skips if assets already exist."""
    async with async_session() as session:
        # Check if assets already exist — skip seeding if so
        result = await session.execute(select(func.count(Asset.id)))
        existing_count = result.scalar() or 0
        if existing_count > 0:
            logger.info("assets_already_seeded", count=existing_count)
            return

        count = 0

        # ── Commodities (Gold, Silver) ──
        comm_path = CONFIG_DIR / "commodities.yaml"
        if comm_path.exists():
            comm_cfg = yaml.safe_load(comm_path.read_text())
            for item in comm_cfg.get("metals", []):
                asset = Asset(
                    symbol=item["symbol"],
                    name=item["name"],
                    market_type=MarketType.COMMODITY,
                    base_currency=item.get("base_currency"),
                    quote_currency=item.get("quote_currency"),
                    tick_size=item.get("tick_size"),
                    config={
                        "cot_code": item.get("cot_code"),
                        "related_etf": item.get("related_etf"),
                    },
                )
                session.add(asset)
                count += 1

        # ── Forex pairs ──
        forex_path = CONFIG_DIR / "forex.yaml"
        if forex_path.exists():
            forex_cfg = yaml.safe_load(forex_path.read_text())
            for group in ["majors", "minors"]:
                for item in forex_cfg.get(group, []):
                    asset = Asset(
                        symbol=item["symbol"],
                        name=item["name"],
                        market_type=MarketType.FOREX,
                        base_currency=item.get("base_currency"),
                        quote_currency=item.get("quote_currency"),
                        tick_size=item.get("tick_size"),
                        config={
                            "cot_code": item.get("cot_code"),
                        },
                    )
                    session.add(asset)
                    count += 1

        # ── Crypto pairs ──
        crypto_path = CONFIG_DIR / "crypto.yaml"
        if crypto_path.exists():
            crypto_cfg = yaml.safe_load(crypto_path.read_text())
            for item in crypto_cfg.get("pairs", []):
                asset = Asset(
                    symbol=item["symbol"],
                    name=item["name"],
                    market_type=MarketType.CRYPTO,
                    exchange=item.get("exchange"),
                    base_currency=item.get("base_currency"),
                    quote_currency=item.get("quote_currency"),
                    config={
                        "on_chain": item.get("on_chain", False),
                        "chain": item.get("chain"),
                    },
                )
                session.add(asset)
                count += 1

        await session.commit()
        logger.info("assets_seeded", count=count)


if __name__ == "__main__":
    asyncio.run(seed_assets())
