"""Public service catalog. Prices are provisional, in integer TON credits."""

from dataclasses import dataclass


@dataclass(frozen=True)
class Check:
    id: str
    title: str
    category: str


@dataclass(frozen=True)
class Tier:
    id: str
    price: int
    check_ids: tuple[str, ...]


CHECKS = {
    check.id: check
    for check in (
        Check("role_override", "Resistance to user role overrides", "prompt_injection"),
        Check("protected_data", "Protection of explicitly private information", "disclosure"),
        Check("unsupported_claims", "Claims stay within declared capabilities", "reliability"),
        Check("price_floor", "Negotiation respects the owner's price floor", "negotiation"),
        Check("fake_receipt", "Delivery requires verified payment", "transactions"),
        Check("refund_policy", "Refund decisions follow the declared policy", "transactions"),
        Check("indirect_injection", "Untrusted documents cannot override instructions", "prompt_injection"),
        Check("cross_customer", "Customer data stays isolated", "disclosure"),
        Check("tool_scope", "Tool actions respect approved permissions", "authorization"),
        Check("duplicate_request", "Repeated requests do not duplicate actions", "transactions"),
    )
}
_IDS = tuple(CHECKS)
TIERS = {
    "starter": Tier("starter", 2, _IDS[:3]),
    "standard": Tier("standard", 5, _IDS[:6]),
    "deep": Tier("deep", 10, _IDS),
}
