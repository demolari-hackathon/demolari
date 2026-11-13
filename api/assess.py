"""Vercel Python function and local HTTP handler."""

import hmac
import json
import os
import sys
from dataclasses import asdict
from http.server import SimpleHTTPRequestHandler
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from agent_checkup.catalog import TIERS
from agent_checkup.intake import parse_intake
from agent_checkup.provider import OpenAIProvider, ProviderError
from agent_checkup.reporting import markdown_report
from agent_checkup.runner import run_assessment


class handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT / "public"), **kwargs)

    def log_message(self, format, *args):
        # No intake, token, or report logging.
        pass

    def _json(self, status, data):
        payload = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        if self.path.split("?")[0] == "/api/assess":
            self._json(200, {"tiers": {k: asdict(v) for k, v in TIERS.items()},
                             "replica_configured": bool(os.environ.get("OPENAI_API_KEY") and os.environ.get("ASSESSMENT_ACCESS_TOKEN"))})
        elif os.environ.get("VERCEL"):
            self._json(404, {"error": "Not found"})
        else:
            super().do_GET()

    def do_POST(self):
        if self.path.split("?")[0] != "/api/assess":
            return self._json(404, {"error": "Not found"})
        if self.headers.get("Content-Type", "").split(";")[0] != "application/json":
            return self._json(415, {"error": "Use application/json"})
        try:
            size = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            return self._json(400, {"error": "Invalid Content-Length"})
        if not 0 < size <= 32768:
            return self._json(413, {"error": "Intake must be between 1 byte and 32 KB"})
        try:
            intake = parse_intake(json.loads(self.rfile.read(size)))
        except (ValueError, UnicodeError, RecursionError) as error:
            return self._json(400, {"error": str(error) if not isinstance(error, RecursionError) else "JSON nesting is too deep"})
        provider = None
        if intake.mode == "local_replica":
            expected = os.environ.get("ASSESSMENT_ACCESS_TOKEN", "")
            supplied = self.headers.get("Authorization", "")
            if not expected or not hmac.compare_digest(supplied.encode(), ("Bearer " + expected).encode()):
                return self._json(401, {"error": "An operator access token is required for real-model assessments"})
            try:
                provider = OpenAIProvider()
            except ProviderError as error:
                return self._json(503, {"error": str(error)})
        report = run_assessment(intake, provider)
        self._json(200, {"report": report, "markdown": markdown_report(report)})
