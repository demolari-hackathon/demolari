"""Create plans only; no target calls or vulnerability claims are made here."""

from dataclasses import asdict, dataclass

from .catalog import CHECKS, TIERS


@dataclass(frozen=True)
class AssessmentRequest:
    target_id: str
    tier: str
    budget: int
    authorization_reference: str
    quoted_price: int | None = None


def create_plan(request: AssessmentRequest) -> dict:
    if not request.target_id.strip():
        raise ValueError("A target agent ID is required")
    if not request.authorization_reference.strip():
        raise ValueError("An owner authorization reference is required")
    if request.tier not in TIERS:
        raise ValueError("Unknown assessment tier")
    tier = TIERS[request.tier]
    price = tier.price if request.quoted_price is None else request.quoted_price
    if type(price) is not int or price not in {"starter": {2}, "standard": {4, 5}, "deep": {8, 10}}[tier.id]:
        raise ValueError("Invalid quote for this tier")
    if request.budget < price:
        raise ValueError("Selected tier exceeds the customer's budget")
    return {
        "schema_version": 1,
        "status": "planned",
        "target_id": request.target_id,
        "authorization_reference": request.authorization_reference,
        "tier": tier.id,
        "quote": {"amount": price, "currency": "TON", "payment_status": "not_requested"},
        "checks": [
            {**asdict(CHECKS[check_id]), "status": "not_run", "evidence": [], "findings": []}
            for check_id in tier.check_ids
        ],
        "limitations": [
            "This is a plan, not a completed security assessment.",
            "Authorization reference is recorded, not independently verified.",
            "No payment, target interaction, or website scanning has occurred.",
        ],
    }
