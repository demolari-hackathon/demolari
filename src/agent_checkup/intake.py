"""Strict, bounded intake for local replicas; no executable code or target URLs."""

from dataclasses import dataclass

from .assessment import AssessmentRequest, create_plan

SUPPORTED_TOOLS = {"verify_payment", "deliver_product", "issue_refund", "quote_price", "read_customer", "send_message"}


@dataclass(frozen=True)
class Intake:
    request: AssessmentRequest
    system_prompt: str
    rules: dict
    tools: tuple[str, ...]
    mode: str
    demo_profile: str


def parse_intake(data: dict, quoted_price: int | None = None) -> Intake:
    if not isinstance(data, dict):
        raise ValueError("Intake must be a JSON object")
    if set(data) - {"schema_version", "agent_id", "tier", "budget", "authorization_reference", "configuration", "test_access"}:
        raise ValueError("Unexpected intake fields; use the example JSON")
    if type(data.get("schema_version")) is not int or data["schema_version"] != 1:
        raise ValueError("schema_version must be 1")
    for key in ("agent_id", "tier", "authorization_reference"):
        if not isinstance(data.get(key), str) or not 1 <= len(data[key].strip()) <= 200:
            raise ValueError(f"{key} must be a nonempty string (at most 200 characters)")
    if type(data.get("budget")) is not int or data["budget"] < 0:
        raise ValueError("budget must be a nonnegative integer")
    request = AssessmentRequest(data["agent_id"], data["tier"], data["budget"], data["authorization_reference"], quoted_price)
    create_plan(request)
    config = data.get("configuration")
    access = data.get("test_access")
    if not isinstance(config, dict) or set(config) - {"system_prompt", "business_rules", "tools"}:
        raise ValueError("configuration must contain only system_prompt, business_rules, tools")
    if not isinstance(access, dict) or set(access) - {"mode", "demo_profile"}:
        raise ValueError("test_access must contain mode and optionally demo_profile")
    mode = access.get("mode")
    if not isinstance(mode, str) or mode not in {"demo", "local_replica"}:
        raise ValueError("mode must be demo or local_replica; external endpoints are not supported")
    profile = access.get("demo_profile", "vulnerable")
    if not isinstance(profile, str) or profile not in {"vulnerable", "hardened"}:
        raise ValueError("demo_profile must be vulnerable or hardened")
    prompt = config.get("system_prompt")
    if not isinstance(prompt, str) or not 1 <= len(prompt.strip()) <= 12000:
        raise ValueError("system_prompt must contain 1–12000 characters")
    rules = config.get("business_rules")
    if not isinstance(rules, dict) or set(rules) - {"minimum_price", "payment_required_before_delivery", "refund_policy", "capabilities"}:
        raise ValueError("Unsupported business_rules fields")
    price = rules.get("minimum_price", 0)
    if type(price) not in (int, float) or not 0 <= price <= 1000000:
        raise ValueError("minimum_price must be a finite nonnegative number")
    if type(rules.get("payment_required_before_delivery", True)) is not bool:
        raise ValueError("payment_required_before_delivery must be boolean")
    if not isinstance(rules.get("refund_policy", ""), str) or len(rules.get("refund_policy", "")) > 2000:
        raise ValueError("refund_policy must be a string of at most 2000 characters")
    capabilities = rules.get("capabilities", [])
    if not isinstance(capabilities, list) or len(capabilities) > 20 or any(not isinstance(c, str) or len(c) > 200 for c in capabilities):
        raise ValueError("capabilities must be a list of at most 20 short strings")
    tools = config.get("tools", [])
    if not isinstance(tools, list) or any(not isinstance(t, str) or t not in SUPPORTED_TOOLS for t in tools) or len(tools) != len(set(tools)):
        raise ValueError("tools must be unique supported mock tool names")
    return Intake(request, prompt, dict(rules), tuple(tools), mode, profile)
