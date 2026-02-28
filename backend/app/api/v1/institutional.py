"""Institutional intelligence endpoints — COT reports, on-chain whales."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.api.deps import get_db
from backend.app.models.asset import Asset
from backend.app.models.cot_report import COTReport
from backend.app.models.onchain_event import OnchainEvent

router = APIRouter(prefix="/institutional", tags=["institutional"])


@router.get("/whale-transfers")
async def get_whale_transfers(
    min_value_eth: float = Query(100.0, description="Minimum ETH value"),
    limit: int = Query(20, ge=1, le=100),
):
    """Fetch real-time large ETH transfers from Etherscan."""
    from backend.app.data.etherscan_adapter import EtherscanAdapter
    adapter = EtherscanAdapter()
    try:
        await adapter.connect()
        transfers = await adapter.get_large_eth_transfers(min_value_eth, limit)
        return [
            {
                "tx_hash": t["tx_hash"],
                "exchange": t["exchange"],
                "direction": t["direction"],
                "value_eth": t["value_eth"],
                "value_usd": t.get("value_usd"),
                "timestamp": t["timestamp"].isoformat() if hasattr(t["timestamp"], "isoformat") else t["timestamp"],
            }
            for t in transfers
        ]
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Etherscan fetch failed: {str(e)}")
    finally:
        await adapter.disconnect()


@router.get("/btc-whales")
async def get_btc_whale_transfers(
    min_value_btc: float = Query(100.0, description="Minimum BTC value"),
    limit: int = Query(20, ge=1, le=100),
):
    """Fetch recent large BTC transactions from the Bitcoin blockchain."""
    from backend.app.data.btc_onchain_adapter import get_recent_btc_whale_txs
    try:
        transfers = await get_recent_btc_whale_txs(min_value_btc, limit)
        return {
            "chain": "bitcoin",
            "min_value_btc": min_value_btc,
            "count": len(transfers),
            "transfers": transfers,
        }
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Bitcoin on-chain fetch failed: {str(e)}")


@router.get("/cot/{symbol}")
async def get_cot_reports(
    symbol: str,
    limit: int = Query(52, ge=1, le=520, description="Weeks of data"),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Asset).where(Asset.symbol == symbol.upper()))
    asset = result.scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=404, detail=f"Asset {symbol} not found")

    query = (
        select(COTReport)
        .where(COTReport.asset_id == asset.id)
        .order_by(COTReport.report_date.desc())
        .limit(limit)
    )
    result = await db.execute(query)
    reports = result.scalars().all()

    return {
        "symbol": symbol.upper(),
        "count": len(reports),
        "reports": [
            {
                "date": r.report_date.isoformat(),
                "commercial_net": r.commercial_net,
                "noncommercial_net": r.noncommercial_net,
                "open_interest": r.open_interest,
                "net_change_weekly": r.net_change_weekly,
                "net_change_pct": r.net_change_pct,
            }
            for r in reports
        ],
    }


@router.get("/whales/{symbol}")
async def get_whale_events(
    symbol: str,
    limit: int = Query(50, ge=1, le=500),
    min_amount_usd: float | None = Query(None, description="Min USD value filter"),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Asset).where(Asset.symbol == symbol.upper()))
    asset = result.scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=404, detail=f"Asset {symbol} not found")

    query = (
        select(OnchainEvent)
        .where(OnchainEvent.asset_id == asset.id)
    )
    if min_amount_usd:
        query = query.where(OnchainEvent.amount_usd >= min_amount_usd)
    query = query.order_by(OnchainEvent.timestamp.desc()).limit(limit)

    result = await db.execute(query)
    events = result.scalars().all()

    return {
        "symbol": symbol.upper(),
        "count": len(events),
        "events": [
            {
                "type": e.event_type.value,
                "amount": e.amount,
                "amount_usd": e.amount_usd,
                "from": e.address_from,
                "to": e.address_to,
                "tx_hash": e.tx_hash,
                "chain": e.chain,
                "timestamp": e.timestamp.isoformat(),
            }
            for e in events
        ],
    }
