# Agent Checkup

Tiered security and reliability assessments sold through the shared agent
marketplace. Python 3.10+, no runtime dependencies. Includes a website, JSON
intake validation, isolated model replicas with mocked tools, and downloadable
evidence reports. Marketplace payments and registration are not integrated yet.

## Local setup

```powershell
py -m venv .venv
.venv\Scripts\python.exe -m pip install -e .
.venv\Scripts\agent-checkup.exe catalog
.venv\Scripts\agent-checkup.exe plan --target demo-agent --tier starter --budget 2 --authorization demo-owner-consent
.venv\Scripts\python.exe scripts/dev.py
```

Open `http://localhost:8000`. The synthetic demo works without any API keys.
For this checkout, a portable interpreter was downloaded to ignored `.tools/`:
`.tools/python/python.exe scripts/dev.py` also works without installation.
It does not replace or repair the existing virtual environment.

If an existing virtual environment points to a removed Python installation,
recreate it with an installed Python interpreter before installing the project.

## Initial catalog

| Tier | TON | Check scenarios |
| --- | ---: | ---: |
| Starter | 2 | 3 |
| Standard | 5 | 6 |
| Deep | 10 | 10 |

Prices are provisional integer credits configured in `src/agent_checkup/catalog.py`.
Higher tiers include all lower-tier checks. A budget below the selected price
is rejected; this is quote validation, not payment processing.

## Structure

- `src/agent_checkup/catalog.py`: tiers and check descriptions.
- `src/agent_checkup/assessment.py`: request validation and offline planning.
- `src/agent_checkup/intake.py`: bounded JSON intake contract.
- `src/agent_checkup/runner.py`: probes, isolated sessions, conservative evaluators.
- `src/agent_checkup/sandbox.py`: allowlisted in-memory mock tools.
- `src/agent_checkup/provider.py`: server-side OpenAI model adapter.
- `src/agent_checkup/reporting.py`: Markdown report generation.
- `src/agent_checkup/integrations.py`: marketplace and target adapter contracts.
- `src/agent_checkup/cli.py`: catalog, plan, and assessment commands.
- `public/`: responsive website and example JSON intake.
- `api/assess.py`: HTTP endpoint shared by local development and Vercel.
- `prompts/consultant.md`: initial sales-agent instructions.
- `templates/report.md`: evidence-based customer report structure.

## Run an assessment

Use the website's JSON editor or the CLI:

```powershell
.venv\Scripts\agent-checkup.exe assess public/example-intake.json --output reports
```

`demo` mode uses synthetic vulnerable/hardened fixtures; it does **not** assess
the uploaded prompt. `local_replica` runs the uploaded prompt through the model
provider with declared business rules and simulated tools. Set `test_access.mode`
to `local_replica` and configure these environment variables in your shell:

```powershell
$env:OPENAI_API_KEY = '<your API key>'
$env:ASSESSMENT_ACCESS_TOKEN = '<a long random operator token>'
$env:ASSESSMENT_MODEL = 'gpt-4.1-mini'
```

`.env.example` documents variables; `.env` files are not automatically loaded.
The CLI is a trusted local operator entry point; the HTTP endpoint additionally
requires `Authorization: Bearer <ASSESSMENT_ACCESS_TOKEN>` for replica mode.
Do not embed this token in the public frontend or give it to general customers.
The current web interface is an operator tool with a public synthetic demo.

`GET /api/assess` returns catalog and configuration availability.
`POST /api/assess` accepts the [example intake](public/example-intake.json) as
`application/json` and returns `{ "report": ..., "markdown": ... }`.
The intake is limited to 32 KB; prompt length to 12000 characters. Only the
documented mock tool names are supported. URL targets and executable tool code
are rejected. No real payment, refund, delivery, or external messaging occurs.

Each check uses a fresh conversation and fresh sandbox, with at most two model
requests and 400 output tokens per request. A run has a 45-second time budget;
unrun checks are skipped, not passed. The model is server-selected, not supplied
by customers. Actual model costs are separate from the quoted TON price.

Verdicts are `finding`, `no_failure_observed`, `inconclusive`, `skipped`, or
`error`. Capability claims currently require human review. Findings capture
attempted sandbox actions, not proof of a production exploit. Replica behavior
does not reproduce undisclosed middleware, memory, or infrastructure controls.
Owner consent is recorded as a reference, not independently verified: the
operator must verify scope before using real customer configurations.

The application does not persist web reports, prompts, or access tokens. Real
replica inputs are sent to OpenAI with `store: false`; provider retention policies
still apply. Downloads and CLI reports can contain echoed prompt information;
keep them private. CLI output files get unique names under ignored `reports/`.

## Verification

```powershell
.venv\Scripts\python.exe scripts/check.py
node --check public/app.js
```

The tests run without model credentials and cover intake rejection, budget
limits, sandbox effects, provider tool loops, timeout/error verdicts, and HTTP
authentication. Real-provider calls require a separately configured account.

## Vercel deployment

The repository root contains `vercel.json`. Import this Git repository into
Vercel with framework preset **Other**, root directory **.**, no build command,
and output directory **public**. The Python function is `api/assess.py` and
bundles the source package. Configure the three variables above for real-model
assessments; leave them unset for a demo-only deployment. No credentials belong
in Git. The function requests a 60-second maximum duration.

To deploy the current uncommitted working tree using the Vercel CLI:

```powershell
npx vercel login
npx vercel deploy
# After verifying the preview:
npx vercel deploy --prod
```

CLI deployment requires an authenticated Vercel account. Git-based deployment
requires committing/pushing the branch; Vercel usually treats non-production
branches such as `bossu` as preview deployments. Do not change the production
branch merely to publish a preview. `public/` is the only static output; customer
configuration and reports must never be added there.

## Next implementation steps

1. Connect marketplace registration and trusted payment verification.
2. Add customer authentication, verified scope records, and per-order usage limits
   before selling access to real-model execution on the public website.
3. Add durable private order/evidence storage and a queue for longer assessments.
4. Add product-specific probes, human review, and fix/retest comparisons.

Live websites and infrastructure scanning are outside the initial scope.
Keep real evidence and reports private; `reports/` and `.env` are ignored.
