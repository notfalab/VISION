"""Bitcoin on-chain adapter — whale tracking via public APIs (no key needed)."""

from datetime import datetime, timezone

import httpx

from backend.app.logging_config import get_logger

logger = get_logger("btc_onchain")

# Known BTC exchange addresses (top exchanges)
KNOWN_BTC_EXCHANGES = {
    "bc1qm34lsc65zpw79lxes69zkqmk6ee3ewf0j77s3": "Binance",
    "34xp4vRoCGJym3xR7yCVPFHoCNxv4Twseo": "Binance",
    "3LYJfcfHPXYJreMsASk2jkn69LWEYKzexb": "Binance-CW",
    "bc1qgdjqv0av3q56jvd82tkdjpy7gdp9ut8tlqmgrpmv24sq90ecnvqqjwvw97": "Bitfinex",
    "1KrYiz7CxXzUB9p5BKqZKNy5FMjVbSUbHo": "Bitfinex",
    "3FupZp77ySr7jwoLYEJ9mwzJpvoNBXsBnE": "Coinbase",
    "bc1q7cyrfmck2ffu2ud3rn5l5a8yv6f0chkp0zpemf": "Coinbase",
    "bc1qa5wkgaew2dkv56kc6hp23g77wp7q90yzluf3s9": "Kraken",
    "3AfP4RDcEPDmsASxTkXBqwJ1iJ8HgeRdCM": "Gemini",
}

# Blockchain.info REST API (free, no key required)
BLOCKCHAIN_API = "https://blockchain.info"


async def get_recent_btc_whale_txs(
    min_value_btc: float = 100.0,
    limit: int = 20,
) -> list[dict]:
    """
    Fetch recent large BTC transactions using Blockchain.info.
    Checks latest unconfirmed and recent blocks for large transfers.
    """
    transfers = []

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            # Get latest block
            resp = await client.get(f"{BLOCKCHAIN_API}/latestblock", params={"format": "json"})
            resp.raise_for_status()
            latest = resp.json()
            block_hash = latest.get("hash")

            if not block_hash:
                return []

            # Get block transactions
            resp = await client.get(
                f"{BLOCKCHAIN_API}/rawblock/{block_hash}",
                params={"format": "json"},
            )
            resp.raise_for_status()
            block = resp.json()

            for tx in block.get("tx", [])[:200]:  # Check first 200 txs
                total_output_btc = sum(
                    out.get("value", 0) for out in tx.get("out", [])
                ) / 1e8

                if total_output_btc < min_value_btc:
                    continue

                # Determine exchange involvement
                exchange = None
                direction = "wallet_transfer"

                for out in tx.get("out", []):
                    addr = out.get("addr", "")
                    if addr in KNOWN_BTC_EXCHANGES:
                        exchange = KNOWN_BTC_EXCHANGES[addr]
                        direction = "exchange_inflow"
                        break

                if not exchange:
                    for inp in tx.get("inputs", []):
                        prev_out = inp.get("prev_out", {})
                        addr = prev_out.get("addr", "")
                        if addr in KNOWN_BTC_EXCHANGES:
                            exchange = KNOWN_BTC_EXCHANGES[addr]
                            direction = "exchange_outflow"
                            break

                transfers.append({
                    "tx_hash": tx.get("hash", ""),
                    "block_height": block.get("height"),
                    "value_btc": round(total_output_btc, 4),
                    "value_usd": None,  # Would need BTC price to calc
                    "exchange": exchange,
                    "direction": direction,
                    "timestamp": datetime.fromtimestamp(
                        tx.get("time", 0), tz=timezone.utc
                    ),
                    "inputs_count": len(tx.get("inputs", [])),
                    "outputs_count": len(tx.get("out", [])),
                })

    except Exception as e:
        logger.warning("btc_whale_fetch_failed", error=str(e))

    # Sort by value descending
    transfers.sort(key=lambda x: x["value_btc"], reverse=True)
    return transfers[:limit]
