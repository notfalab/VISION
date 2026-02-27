"""Etherscan adapter — on-chain whale tracking for Ethereum and ERC-20 tokens."""

from datetime import datetime, timezone

import httpx

from backend.app.config import get_settings
from backend.app.logging_config import get_logger

logger = get_logger("etherscan")

BASE_URL = "https://api.etherscan.io/v2/api"

# Known whale/exchange addresses for monitoring
KNOWN_EXCHANGES = {
    "0x28c6c06298d514db089934071355e5743bf21d60": "Binance",
    "0x21a31ee1afc51d94c2efccaa2092ad1028285549": "Binance",
    "0xdfd5293d8e347dfe59e90efd55b2956a1343963d": "Binance",
    "0x56eddb7aa87536c09ccc2793473599fd21a8b17f": "Binance",
    "0x47ac0fb4f2d84898e4d9e7b4dab3c24507a6d503": "Binance",
    "0x1b3cb81e51011b549d78bf720b0d924ac763a7c2": "Coinbase",
    "0x71660c4005ba85c37ccec55d0c4493e66fe775d3": "Coinbase",
    "0x503828976d22510aad0201ac7ec88293211d23da": "Coinbase",
    "0x0a4c79ce84202b03e95b7a692e5d728d83c44c76": "Kraken",
    "0x267be1c1d684f78cb4f6a176c4911b741e4ffdc0": "Kraken",
}


class EtherscanAdapter:
    """Fetches on-chain data for whale transfer detection."""

    def __init__(self):
        settings = get_settings()
        self._api_key = settings.etherscan_api_key
        self._client: httpx.AsyncClient | None = None

    async def connect(self) -> None:
        self._client = httpx.AsyncClient(timeout=15.0)

    async def disconnect(self) -> None:
        if self._client:
            await self._client.aclose()
            self._client = None

    async def _request(self, params: dict) -> dict:
        if not self._client:
            await self.connect()
        params["apikey"] = self._api_key
        params["chainid"] = "1"  # Ethereum mainnet (required for V2 API)
        resp = await self._client.get(BASE_URL, params=params)
        resp.raise_for_status()
        data = resp.json()
        if data.get("status") == "0" and data.get("message") != "No transactions found":
            logger.warning("etherscan_error", result=data.get("result"))
        return data

    async def get_large_eth_transfers(
        self,
        min_value_eth: float = 100.0,
        limit: int = 50,
    ) -> list[dict]:
        """
        Fetch recent large ETH transfers from known whale/exchange addresses.
        Scans the latest blocks for transfers above threshold.
        """
        # Get latest block number
        block_data = await self._request({
            "module": "proxy",
            "action": "eth_blockNumber",
        })
        latest_block = int(block_data["result"], 16)
        # Look back ~1000 blocks (~3.5 hours)
        start_block = latest_block - 1000

        transfers = []
        for address, label in list(KNOWN_EXCHANGES.items())[:3]:  # Limit API calls
            data = await self._request({
                "module": "account",
                "action": "txlist",
                "address": address,
                "startblock": start_block,
                "endblock": latest_block,
                "page": "1",
                "offset": str(limit),
                "sort": "desc",
            })

            for tx in data.get("result", []):
                if not isinstance(tx, dict):
                    continue
                value_eth = int(tx.get("value", "0")) / 1e18
                if value_eth >= min_value_eth:
                    is_inflow = tx["to"].lower() == address.lower()
                    transfers.append({
                        "tx_hash": tx["hash"],
                        "block_number": int(tx["blockNumber"]),
                        "from": tx["from"],
                        "to": tx["to"],
                        "value_eth": value_eth,
                        "value_usd": None,  # Would need price feed to calc
                        "exchange": label,
                        "direction": "inflow" if is_inflow else "outflow",
                        "timestamp": datetime.fromtimestamp(
                            int(tx["timeStamp"]), tz=timezone.utc
                        ),
                    })

        # Sort by value descending
        transfers.sort(key=lambda x: x["value_eth"], reverse=True)
        return transfers[:limit]

    async def get_erc20_whale_transfers(
        self,
        contract_address: str,
        min_amount: float = 1_000_000,
        limit: int = 50,
    ) -> list[dict]:
        """
        Fetch large ERC-20 token transfers (e.g., USDT, USDC stablecoins).
        Useful for detecting large stablecoin flows to exchanges.
        """
        data = await self._request({
            "module": "account",
            "action": "tokentx",
            "contractaddress": contract_address,
            "page": "1",
            "offset": "100",
            "sort": "desc",
        })

        transfers = []
        for tx in data.get("result", []):
            if not isinstance(tx, dict):
                continue
            decimals = int(tx.get("tokenDecimal", 18))
            amount = int(tx.get("value", "0")) / (10 ** decimals)

            if amount >= min_amount:
                to_addr = tx["to"].lower()
                from_addr = tx["from"].lower()
                exchange_to = KNOWN_EXCHANGES.get(to_addr)
                exchange_from = KNOWN_EXCHANGES.get(from_addr)

                transfers.append({
                    "tx_hash": tx["hash"],
                    "token_name": tx.get("tokenName", ""),
                    "token_symbol": tx.get("tokenSymbol", ""),
                    "from": tx["from"],
                    "to": tx["to"],
                    "amount": amount,
                    "exchange_from": exchange_from,
                    "exchange_to": exchange_to,
                    "direction": "exchange_inflow" if exchange_to else (
                        "exchange_outflow" if exchange_from else "wallet_transfer"
                    ),
                    "timestamp": datetime.fromtimestamp(
                        int(tx["timeStamp"]), tz=timezone.utc
                    ),
                })

        return transfers[:limit]

    async def get_eth_balance(self, address: str) -> float:
        """Get ETH balance of an address in ETH."""
        data = await self._request({
            "module": "account",
            "action": "balance",
            "address": address,
            "tag": "latest",
        })
        return int(data.get("result", "0")) / 1e18
