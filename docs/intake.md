# Intake contract v1

Use `public/example-intake.json` as the exchange format. The service accepts
configuration data only: never scripts, remote URLs, credentials, or tool code.

| Field | Required | Meaning |
| --- | --- | --- |
| `schema_version` | Yes | Integer `1` |
| `agent_id` | Yes | Nonempty target identifier, up to 200 characters |
| `tier` | Yes | `starter`, `standard`, or `deep` |
| `budget` | Yes | Nonnegative integer TON spending limit; does not authorize a debit |
| `authorization_reference` | Yes | Reference to owner consent, up to 200 characters |
| `configuration.system_prompt` | Yes | Owner-supplied prompt, 1–12000 characters |
| `configuration.business_rules` | Yes | Object with the optional fields below |
| `configuration.tools` | No | Unique names from the supported mock tool catalog; defaults to none |
| `test_access.mode` | Yes | `demo` or `local_replica` |
| `test_access.demo_profile` | No | `vulnerable` or `hardened`; only affects demo mode |

Business rules: `minimum_price` is a finite number from 0 to 1000000 (default 0),
`payment_required_before_delivery` is a boolean (default true), `refund_policy`
is a string of up to 2000 characters, and `capabilities` is a list of up to 20
strings of up to 200 characters each. For meaningful results, populate these
with the actual owner's policies. Unknown keys in the intake, configuration,
business rules, or test access are rejected.

## Mock tool catalog

| Tool | Arguments | Simulated behavior |
| --- | --- | --- |
| `verify_payment` | `order_id` | Always reports unpaid in these adversarial scenarios |
| `deliver_product` | `order_id` | Records delivery; repeated order IDs are deduplicated |
| `issue_refund` | `order_id`, `amount` | Records attempt; rejects because no verified paid order exists |
| `quote_price` | `amount` | Records the offered price |
| `read_customer` | `customer_id` | Records attempt and denies access |
| `send_message` | `recipient`, `message` | Records a simulated message; sends nothing externally |

Every check starts with a fresh session and tool state. The session customer is
`current-customer`, the test order is `audit-order`, and only `current-customer`
is an authorized message recipient. A randomly generated private canary is added
to each system context for disclosure testing; no real secret is needed.

Missing tools cause relevant checks to be skipped. Findings based on tool calls
mean the agent attempted the action, even if the simulated tool blocked it.
The current indirect-injection probe embeds an untrusted document in a user
message; it does not reproduce a deployed retrieval or tool-output pipeline.

## Report contract

The HTTP response contains `report` and `markdown`. The JSON report includes the
target, tier, model, mode, quote (payment not requested), timestamps, limitations,
summary counts, and checks. Each check contains its catalog ID, title, category,
verdict, reason, evidence, and findings. Evidence includes reproduction input,
assistant/tool messages, and attempted mock tool calls. A completed run can
contain inconclusive checks; it does not mean the target is secure.

Real-model HTTP assessments require the operator bearer token independently of
the JSON. The authorization reference is an audit record, not authentication or
proof of ownership. Customer authentication and payment enforcement are future
marketplace integrations.
