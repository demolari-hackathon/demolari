"""Adapter contracts to implement once the shared marketplace API is available."""

from typing import Protocol


class Marketplace(Protocol):
    def publish_service(self, listing: dict) -> str:
        """Register the assessment service and return its listing ID."""
        ...

    def verify_payment(self, order_id: str, amount: int) -> bool:
        """Check trusted marketplace payment state, never customer receipt text."""
        ...

    def deliver_report(self, order_id: str, report: str) -> None:
        ...


class TargetAgent(Protocol):
    def send(self, message: str, session_id: str) -> dict:
        """Send a scoped test in an authorized, isolated target session."""
        ...
