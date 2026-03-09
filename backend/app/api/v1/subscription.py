"""Subscription endpoints — status, wallet info, payment submission, billing."""

import re
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.api.deps import get_db, require_user
from backend.app.config import get_settings
from backend.app.models.payment import Payment, PaymentNetwork, PaymentStatus
from backend.app.models.user import User
from backend.app.services.payment_verifier import PaymentVerifier

router = APIRouter(prefix="/subscription", tags=["subscription"])


# ── Request / Response schemas ─────────────────────────────────────────

_EVM_TX_RE = re.compile(r"^0x[0-9a-fA-F]{64}$")
_SOLANA_TX_RE = re.compile(r"^[1-9A-HJ-NP-Za-km-z]{86,88}$")  # base58, 86-88 chars


class SubmitPaymentRequest(BaseModel):
    tx_hash: str
    network: str  # ethereum / polygon / bsc / solana
    token: str  # USDT / USDC

    @field_validator("tx_hash")
    @classmethod
    def validate_tx_hash(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("tx_hash is required")
        return v


# ── Endpoints ──────────────────────────────────────────────────────────

@router.get("/status")
async def subscription_status(user: User = Depends(require_user)):
    """Current subscription status for the authenticated user."""
    return {
        "subscription_status": user.subscription_status,
        "has_access": user.has_access,
        "days_remaining": user.days_remaining,
        "trial_ends_at": user.trial_ends_at.isoformat() if user.trial_ends_at else None,
        "subscription_ends_at": user.subscription_ends_at.isoformat() if user.subscription_ends_at else None,
    }


@router.get("/wallet-info")
async def wallet_info(user: User = Depends(require_user)):
    """Return wallet addresses per network + supported tokens + price."""
    settings = get_settings()
    networks = {}
    for net, attr in [
        ("ethereum", "wallet_address_ethereum"),
        ("polygon", "wallet_address_polygon"),
        ("bsc", "wallet_address_bsc"),
        ("solana", "wallet_address_solana"),
    ]:
        addr = getattr(settings, attr, "")
        if addr:
            networks[net] = addr

    return {
        "price_usd": settings.subscription_price_usd,
        "tokens": ["USDT", "USDC"],
        "networks": networks,
    }


@router.post("/submit-payment")
async def submit_payment(
    body: SubmitPaymentRequest,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Submit a tx hash for verification. Creates a Payment record and runs verification."""
    # Validate network
    try:
        network_enum = PaymentNetwork(body.network.lower())
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Unsupported network: {body.network}")

    token = body.token.upper()
    if token not in ("USDT", "USDC"):
        raise HTTPException(status_code=400, detail="Token must be USDT or USDC")

    # Validate tx hash format per network
    tx = body.tx_hash.strip()
    if network_enum == PaymentNetwork.SOLANA:
        if not _SOLANA_TX_RE.match(tx):
            raise HTTPException(
                status_code=400,
                detail="Invalid Solana transaction signature (expected base58, 86-88 chars)",
            )
    else:
        # EVM networks (ethereum, polygon, bsc)
        if not _EVM_TX_RE.match(tx):
            raise HTTPException(
                status_code=400,
                detail="Invalid EVM transaction hash (expected 0x + 64 hex chars)",
            )

    # Check duplicate tx_hash
    existing = await db.execute(select(Payment).where(Payment.tx_hash == body.tx_hash))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Transaction already submitted")

    settings = get_settings()

    # Create payment record
    payment = Payment(
        user_id=user.id,
        amount_usd=settings.subscription_price_usd,
        token=token,
        network=network_enum,
        tx_hash=body.tx_hash,
        status=PaymentStatus.PENDING,
    )
    db.add(payment)
    await db.flush()

    # Run immediate verification
    verifier = PaymentVerifier()
    result = await verifier.verify_payment(body.tx_hash, body.network, token)

    payment.confirmations = result.confirmations
    payment.block_number = result.block_number
    payment.sender_address = result.sender
    payment.verified_amount = result.actual_amount

    wallet_attr = f"wallet_address_{body.network.lower()}"
    payment.recipient_address = getattr(settings, wallet_attr, "")

    if result.verified:
        payment.status = PaymentStatus.CONFIRMED
        payment.verified_at = datetime.now(timezone.utc)

        # Extend subscription
        now = datetime.now(timezone.utc)
        current_end = user.subscription_ends_at or now
        period_start = max(current_end, now)
        period_end = period_start + timedelta(days=30)

        payment.period_start = period_start
        payment.period_end = period_end
        user.subscription_ends_at = period_end
    elif result.confirmations > 0:
        payment.status = PaymentStatus.CONFIRMING
    else:
        payment.verification_error = result.error

    return {
        "payment_id": payment.id,
        "status": payment.status.value,
        "confirmations": result.confirmations,
        "required_confirmations": result.required_confirmations,
        "actual_amount": result.actual_amount,
        "error": result.error or None,
    }


@router.get("/payment/{payment_id}")
async def get_payment(
    payment_id: int,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Get verification status for a specific payment."""
    result = await db.execute(
        select(Payment).where(Payment.id == payment_id, Payment.user_id == user.id)
    )
    payment = result.scalar_one_or_none()
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")

    return {
        "payment_id": payment.id,
        "status": payment.status.value,
        "tx_hash": payment.tx_hash,
        "network": payment.network.value,
        "token": payment.token,
        "amount_usd": payment.amount_usd,
        "verified_amount": payment.verified_amount,
        "confirmations": payment.confirmations,
        "sender_address": payment.sender_address,
        "period_start": payment.period_start.isoformat() if payment.period_start else None,
        "period_end": payment.period_end.isoformat() if payment.period_end else None,
        "error": payment.verification_error,
        "created_at": payment.created_at.isoformat() if payment.created_at else None,
        "verified_at": payment.verified_at.isoformat() if payment.verified_at else None,
    }


@router.get("/billing")
async def billing_history(
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Return all payments for the user sorted by date desc."""
    result = await db.execute(
        select(Payment)
        .where(Payment.user_id == user.id)
        .order_by(Payment.created_at.desc())
    )
    payments = result.scalars().all()

    return {
        "payments": [
            {
                "id": p.id,
                "status": p.status.value,
                "tx_hash": p.tx_hash,
                "network": p.network.value,
                "token": p.token,
                "amount_usd": p.amount_usd,
                "verified_amount": p.verified_amount,
                "period_start": p.period_start.isoformat() if p.period_start else None,
                "period_end": p.period_end.isoformat() if p.period_end else None,
                "created_at": p.created_at.isoformat() if p.created_at else None,
                "verified_at": p.verified_at.isoformat() if p.verified_at else None,
            }
            for p in payments
        ],
        "count": len(payments),
    }
