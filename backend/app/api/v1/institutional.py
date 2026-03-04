"""Institutional intelligence endpoints — COT reports, on-chain whales."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.api.deps import get_db
from backend.app.models.asset import Asset
from backend.app.models.cot_report import COTReport
from backend.app.models.onchain_event import OnchainEvent

router = APIRouter(prefix="/institutional", tags=["institutional"])

# ── Symbol → chain + ERC-20 contract mapping ──────────────────────────
CRYPTO_CHAIN_MAP: dict[str, dict] = {
    "BTCUSD": {"chain": "bitcoin", "name": "Bitcoin"},
    "ETHUSD": {"chain": "ethereum", "name": "Ethereum"},
    "SOLUSD": {"chain": "solana", "name": "Solana"},
    "XRPUSD": {"chain": "xrp", "name": "XRP Ledger"},
    "BNBUSD": {"chain": "bsc", "name": "BNB Chain"},
    "ADAUSD": {"chain": "cardano", "name": "Cardano"},
    "TRXUSD": {"chain": "tron", "name": "Tron"},
    "DOGEUSD": {"chain": "dogecoin", "name": "Dogecoin"},
    "LTCUSD": {"chain": "litecoin", "name": "Litecoin"},
    "DOTUSD": {"chain": "polkadot", "name": "Polkadot"},
    "AVAXUSD": {"chain": "avalanche", "name": "Avalanche"},
    "ATOMUSD": {"chain": "cosmos", "name": "Cosmos"},
    "NEARUSD": {"chain": "near", "name": "NEAR"},
    "ICPUSD": {"chain": "icp", "name": "Internet Computer"},
    "XLMUSD": {"chain": "stellar", "name": "Stellar"},
    "TONUSD": {"chain": "ton", "name": "TON"},
    "SUIUSD": {"chain": "sui", "name": "Sui"},
    "SEIUSD": {"chain": "sei", "name": "Sei"},
    "APTUSD": {"chain": "aptos", "name": "Aptos"},
    "FTMUSD": {"chain": "fantom", "name": "Fantom"},
    "INJUSD": {"chain": "injective", "name": "Injective"},
    "HBARUSD": {"chain": "hedera", "name": "Hedera"},
    "BCHUSD": {"chain": "bitcoin-cash", "name": "Bitcoin Cash"},
    "FILUSD": {"chain": "filecoin", "name": "Filecoin"},
    "TAOUSD": {"chain": "bittensor", "name": "Bittensor"},
    # ERC-20 tokens — tracked on Ethereum via contract address
    "LINKUSD": {"chain": "ethereum", "name": "Chainlink", "erc20": "0x514910771AF9Ca656af840dff83E8264EcF986CA", "unit": "LINK"},
    "UNIUSD": {"chain": "ethereum", "name": "Uniswap", "erc20": "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984", "unit": "UNI"},
    "AAVEUSD": {"chain": "ethereum", "name": "Aave", "erc20": "0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9", "unit": "AAVE"},
    "SHIBUSD": {"chain": "ethereum", "name": "Shiba Inu", "erc20": "0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE", "unit": "SHIB"},
    "PEPEUSD": {"chain": "ethereum", "name": "Pepe", "erc20": "0x6982508145454Ce325dDbE47a25d4ec3d2311933", "unit": "PEPE"},
    "MATICUSD": {"chain": "ethereum", "name": "Polygon", "erc20": "0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfeBB0", "unit": "MATIC"},
    "ARBUSD": {"chain": "ethereum", "name": "Arbitrum", "erc20": "0xB50721BCf8d664c30412Cfbc6cf7a15145234ad1", "unit": "ARB"},
    "OPUSD": {"chain": "ethereum", "name": "Optimism", "erc20": "0x4200000000000000000000000000000000000042", "unit": "OP"},
    "RENDERUSD": {"chain": "ethereum", "name": "Render", "erc20": "0x6De037ef9aD2725EB40118Bb1702EBb27e4Aeb24", "unit": "RENDER"},
    "ENAUSD": {"chain": "ethereum", "name": "Ethena", "erc20": "0x57e114B691Db790C35207b2e685D4A43181e6061", "unit": "ENA"},
    "WLDUSD": {"chain": "ethereum", "name": "Worldcoin", "erc20": "0x163f8C2467924be0ae7B5347228CABF260318753", "unit": "WLD"},
    "BONKUSD": {"chain": "solana", "name": "Bonk"},
    "WIFUSD": {"chain": "solana", "name": "dogwifhat"},
    "ONDOUSD": {"chain": "ethereum", "name": "Ondo", "erc20": "0xfAbA6f8e4a5E8Ab82F62fe7C39859FA577269BE3", "unit": "ONDO"},
    "TIAUSD": {"chain": "celestia", "name": "Celestia"},
}


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


@router.get("/crypto-whales/{symbol}")
async def get_crypto_whales(
    symbol: str,
    limit: int = Query(20, ge=1, le=100),
):
    """Unified whale tracker — routes to the correct chain adapter based on symbol."""
    sym = symbol.upper()
    if not sym.endswith("USD"):
        sym = f"{sym}USD"

    chain_info = CRYPTO_CHAIN_MAP.get(sym)
    if not chain_info:
        return {
            "symbol": sym,
            "chain": "unknown",
            "chain_name": sym.replace("USD", ""),
            "supported": False,
            "transfers": [],
        }

    chain = chain_info["chain"]
    chain_name = chain_info["name"]

    # ── Bitcoin ──
    if chain == "bitcoin":
        from backend.app.data.btc_onchain_adapter import get_recent_btc_whale_txs
        try:
            raw = await get_recent_btc_whale_txs(10.0, limit)
            transfers = [
                {
                    "tx_hash": t["tx_hash"],
                    "value": t["value_btc"],
                    "unit": "BTC",
                    "exchange": t.get("exchange"),
                    "direction": t["direction"],
                    "timestamp": t["timestamp"].isoformat() if hasattr(t["timestamp"], "isoformat") else t["timestamp"],
                }
                for t in raw
            ]
            return {"symbol": sym, "chain": chain, "chain_name": chain_name, "supported": True, "transfers": transfers}
        except Exception:
            return {"symbol": sym, "chain": chain, "chain_name": chain_name, "supported": True, "transfers": []}

    # ── Ethereum native (ETH) ──
    if chain == "ethereum" and "erc20" not in chain_info:
        from backend.app.data.etherscan_adapter import EtherscanAdapter
        adapter = EtherscanAdapter()
        try:
            await adapter.connect()
            raw = await adapter.get_large_eth_transfers(50.0, limit)
            transfers = [
                {
                    "tx_hash": t["tx_hash"],
                    "value": t["value_eth"],
                    "unit": "ETH",
                    "exchange": t.get("exchange"),
                    "direction": t["direction"],
                    "timestamp": t["timestamp"].isoformat() if hasattr(t["timestamp"], "isoformat") else t["timestamp"],
                }
                for t in raw
            ]
            return {"symbol": sym, "chain": chain, "chain_name": chain_name, "supported": True, "transfers": transfers}
        except Exception:
            return {"symbol": sym, "chain": chain, "chain_name": chain_name, "supported": True, "transfers": []}
        finally:
            await adapter.disconnect()

    # ── ERC-20 tokens (tracked on Ethereum) ──
    if "erc20" in chain_info:
        from backend.app.data.etherscan_adapter import EtherscanAdapter
        adapter = EtherscanAdapter()
        try:
            await adapter.connect()
            raw = await adapter.get_erc20_whale_transfers(
                contract_address=chain_info["erc20"],
                min_amount=1.0,  # Low threshold; we'll show the top N
                limit=limit,
            )
            unit = chain_info.get("unit", sym.replace("USD", ""))
            transfers = [
                {
                    "tx_hash": t["tx_hash"],
                    "value": t["amount"],
                    "unit": unit,
                    "exchange": t.get("exchange_to") or t.get("exchange_from"),
                    "direction": t["direction"],
                    "timestamp": t["timestamp"].isoformat() if hasattr(t["timestamp"], "isoformat") else t["timestamp"],
                }
                for t in raw
            ]
            return {"symbol": sym, "chain": "ethereum", "chain_name": chain_name, "supported": True, "transfers": transfers}
        except Exception:
            return {"symbol": sym, "chain": "ethereum", "chain_name": chain_name, "supported": True, "transfers": []}
        finally:
            await adapter.disconnect()

    # ── Unsupported chains (SOL, XRP, ADA, etc.) — return chain info ──
    return {
        "symbol": sym,
        "chain": chain,
        "chain_name": chain_name,
        "supported": False,
        "transfers": [],
    }


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
