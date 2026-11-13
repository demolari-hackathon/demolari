"""Catalog, planning, and isolated assessment CLI."""

import argparse
import json
from dataclasses import asdict
from pathlib import Path

from .assessment import AssessmentRequest, create_plan
from .catalog import TIERS
from .intake import parse_intake
from .provider import OpenAIProvider, ProviderError
from .reporting import markdown_report
from .runner import run_assessment


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("catalog")
    plan = commands.add_parser("plan")
    plan.add_argument("--target", required=True)
    plan.add_argument("--tier", choices=TIERS, required=True)
    plan.add_argument("--budget", type=int, required=True)
    plan.add_argument("--authorization", required=True)
    assess = commands.add_parser("assess")
    assess.add_argument("intake", type=Path)
    assess.add_argument("--output", type=Path, default=Path("reports"))
    args = parser.parse_args()
    if args.command == "catalog":
        result = {name: asdict(tier) for name, tier in TIERS.items()}
    elif args.command == "plan":
        try:
            result = create_plan(AssessmentRequest(args.target, args.tier, args.budget, args.authorization))
        except ValueError as error:
            parser.error(str(error))
    else:
        try:
            if args.intake.stat().st_size > 32768:
                raise ValueError("Intake exceeds 32 KB")
            intake = parse_intake(json.loads(args.intake.read_text(encoding="utf-8")))
            provider = OpenAIProvider() if intake.mode == "local_replica" else None
            result = run_assessment(intake, provider)
            args.output.mkdir(parents=True, exist_ok=True)
            # Unique names prevent overwriting earlier private reports.
            from uuid import uuid4
            name = "assessment-" + uuid4().hex
            (args.output / (name + ".json")).write_text(json.dumps(result, indent=2), encoding="utf-8")
            (args.output / (name + ".md")).write_text(markdown_report(result), encoding="utf-8")
            result = {"status": result["status"], "summary": result["summary"], "output": str(args.output / name)}
        except (ValueError, OSError, ProviderError) as error:
            parser.error(str(error))
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
