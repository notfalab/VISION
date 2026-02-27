"""Seed database with initial assets from config YAML files."""

import asyncio
import sys
from pathlib import Path

import yaml
from sqlalchemy import select

# Ensure project root on path
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from backend.app.database import async_session
from backend.app.models.asset import Asset, MarketType


CONFIG_DIR = Path(__file__).resolve().parents[2] / "config" / "assets"


async def seed_assets():
    async with async_session() as session:
        count = 0

        # Commodities (Gold)
        comm_cfg = yaml.safe_load((CONFIG_DIR / "commodities.yaml").read_text())
        for item in comm_cfg.get("metals", []):
            existing = await session.execute(
                select(Asset).where(Asset.symbol == item["symbol"])
            )
            if existing.scalar_one_or_none():
                continue
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

        await session.commit()
        print(f"Seeded {count} assets")


if __name__ == "__main__":
    asyncio.run(seed_assets())
