"""On-chain payment verification for USDT/USDC across EVM chains and Solana."""

from __future__ import annotations

import logging
from dataclasses import dataclass

import httpx

from backend.app.config import get_settings

logger = logging.getLogger(__name__)

# ── Token contract addresses ──────────────────────────────────────────────
TOKEN_CONTRACTS: dict[str, dict[str, dict]] = {
    "ethereum": {
        "USDT": {"address": "0xdAC17F958D2ee523a2206206994597C13D831ec7", "decimals": 6},
        "USDC": {"address": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", "decimals": 6},
    },
    "polygon": {
        "USDT": {"address": "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", "decimals": 6},
        "USDC": {"address": "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", "decimals": 6},
    },
    "solana": {
        "USDT": {"mint": "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", "decimals": 6},
        "USDC": {"mint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", "decimals": 6},
    },
}

# ERC-20 Transfer event topic
TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"

# Explorer API base URLs (single Etherscan API key covers all EVM chains)
EXPLORER_URLS: dict[str, str] = {
    "ethereum": "https://api.etherscan.io/api",
    "polygon": "https://api.polygonscan.com/api",
}

# Minimum confirmations per chain
MIN_CONFIRMATIONS: dict[str, int] = {
    "ethereum": 12,
    "polygon": 30,
    "solana": 1,  # Solana is finalized after 1 confirmation
}


@dataclass
class VerificationResult:
    verified: bool
    confirmations: int = 0
    required_confirmations: int = 0
    actual_amount: float = 0.0
    sender: str = ""
    block_number: int = 0
    error: str = ""


class PaymentVerifier:
    """Verify on-chain stablecoin transfers to our wallets."""

    def __init__(self):
        self.settings = get_settings()

    def _get_wallet(self, network: str) -> str:
        wallets = {
            "ethereum": self.settings.wallet_address_ethereum,
            "polygon": self.settings.wallet_address_polygon,
            "solana": self.settings.wallet_address_solana,
        }
        return wallets.get(network, "")

    def _get_api_key(self, network: str) -> str:
        # Single Etherscan API key works for Ethereum, Polygon, and 60+ EVM chains
        return self.settings.etherscan_api_key

    async def verify_payment(
        self, tx_hash: str, network: str, token: str
    ) -> VerificationResult:
        """Main entry point — verify a payment transaction."""
        token = token.upper()
        network = network.lower()

        wallet = self._get_wallet(network)
        if not wallet:
            return VerificationResult(
                verified=False,
                error=f"No wallet configured for {network}",
                required_confirmations=MIN_CONFIRMATIONS.get(network, 12),
            )

        if network == "solana":
            return await self._verify_solana(tx_hash, token, wallet)
        elif network in EXPLORER_URLS:
            return await self._verify_evm(tx_hash, network, token, wallet)
        else:
            return VerificationResult(verified=False, error=f"Unsupported network: {network}")

    async def _verify_evm(
        self, tx_hash: str, network: str, token: str, wallet: str
    ) -> VerificationResult:
        """Verify ERC-20 transfer on EVM chains via block explorer APIs."""
        base_url = EXPLORER_URLS[network]
        api_key = self._get_api_key(network)
        required = MIN_CONFIRMATIONS[network]

        if not api_key:
            return VerificationResult(
                verified=False, error=f"No API key for {network}scan", required_confirmations=required
            )

        contract_info = TOKEN_CONTRACTS.get(network, {}).get(token)
        if not contract_info:
            return VerificationResult(
                verified=False, error=f"Unknown token {token} on {network}", required_confirmations=required
            )

        contract_addr = contract_info["address"].lower()
        decimals = contract_info["decimals"]

        async with httpx.AsyncClient(timeout=20) as client:
            # 1. Get transaction receipt
            resp = await client.get(base_url, params={
                "module": "proxy",
                "action": "eth_getTransactionReceipt",
                "txhash": tx_hash,
                "apikey": api_key,
            })
            data = resp.json()
            receipt = data.get("result")

            if not receipt or receipt == "null" or isinstance(receipt, str):
                return VerificationResult(
                    verified=False, error="Transaction not found or pending", required_confirmations=required
                )

            # Check tx status (0x1 = success)
            if receipt.get("status") != "0x1":
                return VerificationResult(
                    verified=False, error="Transaction failed on-chain", required_confirmations=required
                )

            tx_block = int(receipt.get("blockNumber", "0x0"), 16)

            # 2. Parse logs for Transfer event to our wallet
            amount = 0.0
            sender = ""
            found = False

            for log_entry in receipt.get("logs", []):
                topics = log_entry.get("topics", [])
                if len(topics) < 3:
                    continue
                if topics[0] != TRANSFER_TOPIC:
                    continue
                if log_entry.get("address", "").lower() != contract_addr:
                    continue

                # Decode: topics[1] = from, topics[2] = to, data = amount
                log_to = "0x" + topics[2][-40:]
                if log_to.lower() != wallet.lower():
                    continue

                sender = "0x" + topics[1][-40:]
                raw_amount = int(log_entry.get("data", "0x0"), 16)
                amount = raw_amount / (10 ** decimals)
                found = True
                break

            if not found:
                return VerificationResult(
                    verified=False,
                    error=f"No {token} transfer to our wallet found in tx",
                    required_confirmations=required,
                    block_number=tx_block,
                )

            # 3. Check confirmations
            block_resp = await client.get(base_url, params={
                "module": "proxy",
                "action": "eth_blockNumber",
                "apikey": api_key,
            })
            current_block = int(block_resp.json().get("result", "0x0"), 16)
            confirmations = max(0, current_block - tx_block)

            # 4. Validate amount ($1 tolerance)
            min_amount = self.settings.subscription_price_usd - 1.0
            verified = confirmations >= required and amount >= min_amount

            return VerificationResult(
                verified=verified,
                confirmations=confirmations,
                required_confirmations=required,
                actual_amount=amount,
                sender=sender,
                block_number=tx_block,
                error="" if verified else (
                    f"Insufficient amount: ${amount:.2f}" if amount < min_amount
                    else f"Waiting for confirmations: {confirmations}/{required}"
                ),
            )

    async def _verify_solana(
        self, tx_hash: str, token: str, wallet: str
    ) -> VerificationResult:
        """Verify SPL token transfer on Solana via JSON-RPC."""
        required = MIN_CONFIRMATIONS["solana"]
        mint_info = TOKEN_CONTRACTS["solana"].get(token)
        if not mint_info:
            return VerificationResult(
                verified=False, error=f"Unknown token {token} on Solana", required_confirmations=required
            )

        target_mint = mint_info["mint"]
        decimals = mint_info["decimals"]
        rpc_url = self.settings.solana_rpc_url

        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.post(rpc_url, json={
                "jsonrpc": "2.0",
                "id": 1,
                "method": "getTransaction",
                "params": [tx_hash, {"encoding": "jsonParsed", "maxSupportedTransactionVersion": 0}],
            })
            data = resp.json()
            result = data.get("result")

            if not result:
                return VerificationResult(
                    verified=False, error="Transaction not found", required_confirmations=required
                )

            meta = result.get("meta", {})
            if meta.get("err") is not None:
                return VerificationResult(
                    verified=False, error="Transaction failed on-chain", required_confirmations=required
                )

            slot = result.get("slot", 0)

            # Parse pre/post token balances to find delta
            pre_balances = {
                (b.get("owner", ""), b.get("mint", "")): float(b.get("uiTokenAmount", {}).get("uiAmount") or 0)
                for b in meta.get("preTokenBalances", [])
            }
            post_balances = {
                (b.get("owner", ""), b.get("mint", "")): float(b.get("uiTokenAmount", {}).get("uiAmount") or 0)
                for b in meta.get("postTokenBalances", [])
            }

            # Find transfer to our wallet with target mint
            wallet_lower = wallet.lower()
            amount = 0.0
            sender = ""

            for (owner, mint), post_amt in post_balances.items():
                if mint != target_mint:
                    continue
                if owner.lower() != wallet_lower:
                    continue

                pre_amt = pre_balances.get((owner, mint), 0.0)
                delta = post_amt - pre_amt
                if delta > 0:
                    amount = delta
                    # Find sender (account with negative delta for same mint)
                    for (s_owner, s_mint), s_post in post_balances.items():
                        if s_mint != target_mint or s_owner.lower() == wallet_lower:
                            continue
                        s_pre = pre_balances.get((s_owner, s_mint), 0.0)
                        if s_pre - s_post > 0:
                            sender = s_owner
                            break
                    break

            if amount == 0:
                return VerificationResult(
                    verified=False,
                    error=f"No {token} transfer to our wallet found in tx",
                    required_confirmations=required,
                    block_number=slot,
                )

            min_amount = self.settings.subscription_price_usd - 1.0
            verified = amount >= min_amount

            return VerificationResult(
                verified=verified,
                confirmations=1 if result.get("meta", {}).get("err") is None else 0,
                required_confirmations=required,
                actual_amount=amount,
                sender=sender,
                block_number=slot,
                error="" if verified else f"Insufficient amount: ${amount:.2f}",
            )
