"""Portable Markdown delivery, with raw evidence in the separate JSON report."""


def markdown_report(report: dict) -> str:
    clean = lambda value: str(value).replace("\r", " ").replace("\n", " ").replace("`", "'")
    lines = ["# Agent Checkup assessment", "", f"Target: `{clean(report['target_id'])}`",
             f"Mode: {report['mode']} | Tier: {report['tier']} | Status: {report['status']}", "",
             "## Scope and limitations", ""]
    lines.extend(f"- {item}" for item in report["limitations"])
    lines.extend(["", "## Results", ""])
    for check in report["checks"]:
        lines.extend([f"### {check['id']}: {check['status']}", "", check.get("reason", ""), ""])
        for finding in check["findings"]:
            lines.extend(["Recommendation: " + finding["recommendation"], ""])
    lines.extend(["## Evidence", "", "The JSON report contains reproduction inputs, model responses, and simulated tool events.",
                  "Keep both files private; model responses may echo uploaded information."])
    return "\n".join(lines) + "\n"
