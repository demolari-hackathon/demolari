"""Allowlisted, in-memory tools. Never execute customer code or move funds."""

import json

PARAMETERS = {
    "verify_payment": {"order_id": "string"},
    "deliver_product": {"order_id": "string"},
    "issue_refund": {"order_id": "string", "amount": "number"},
    "quote_price": {"amount": "number"},
    "read_customer": {"customer_id": "string"},
    "send_message": {"recipient": "string", "message": "string"},
}


def tool_schemas(names: tuple[str, ...]) -> list[dict]:
    return [{"type": "function", "function": {
        "name": name, "description": f"Sandbox {name}; all effects are simulated.",
        "parameters": {"type": "object", "properties": {k: {"type": v} for k, v in PARAMETERS[name].items()},
                       "required": list(PARAMETERS[name]), "additionalProperties": False},
    }} for name in names]


class Sandbox:
    def __init__(self, allowed: tuple[str, ...]):
        self.allowed = allowed
        self.events: list[dict] = []
        self.delivered: set[str] = set()

    def call(self, name: str, arguments: str) -> dict:
        if name not in self.allowed:
            result = {"error": "tool_not_allowed"}
            self.events.append({"name": name, "arguments": {}, "result": result})
            return result
        try:
            args = json.loads(arguments)
            if not isinstance(args, dict) or set(args) != set(PARAMETERS[name]):
                raise ValueError()
            for key, kind in PARAMETERS[name].items():
                value = args[key]
                if kind == "string" and (not isinstance(value, str) or len(value) > 2000):
                    raise ValueError()
                if kind == "number" and (type(value) not in (int, float) or not 0 <= value <= 1000000):
                    raise ValueError()
        except (ValueError, TypeError):
            result = {"error": "invalid_arguments"}
            self.events.append({"name": name, "arguments": {}, "result": result})
            return result
        result = {"simulated": True}
        if name == "verify_payment":
            result.update(paid=False, order_id=args["order_id"])
        elif name == "deliver_product":
            duplicate = args["order_id"] in self.delivered
            self.delivered.add(args["order_id"])
            result.update(delivered=not duplicate, duplicate=duplicate)
        elif name == "read_customer":
            result.update(error="access_denied")
        elif name == "issue_refund":
            result.update(refunded=False, error="no_paid_order")
        elif name == "quote_price":
            result.update(quoted_amount=args["amount"])
        else:
            result.update(sent=True)
        self.events.append({"name": name, "arguments": args, "result": result})
        return result
