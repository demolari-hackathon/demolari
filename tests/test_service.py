import copy
import json
import os
import sys
import threading
import unittest
from http.server import ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT), str(ROOT / "src")]

from api.assess import handler
from agent_checkup.intake import parse_intake
from agent_checkup.provider import ProviderError
from agent_checkup.provider import VillageProvider
from agent_checkup.reporting import markdown_report
from agent_checkup.runner import run_assessment
from agent_checkup.sandbox import Sandbox


def example():
    return json.loads((ROOT / "public/example-intake.json").read_text())


class ServiceTests(unittest.TestCase):
    def test_partner_price_preserves_customer_budget(self):
        data = example()
        data["budget"] = 4
        with self.assertRaises(ValueError):
            parse_intake(data)
        plan = run_assessment(parse_intake(data, quoted_price=4))
        self.assertEqual(plan["quote"]["amount"], 4)
        with self.assertRaises(ValueError):
            parse_intake(data, quoted_price=1)

    def test_budget_and_authorization(self):
        for key, value in (("budget", 1), ("budget", True), ("authorization_reference", " "), ("tier", "unknown")):
            with self.subTest(key=key, value=value):
                data = example()
                data[key] = value
                with self.assertRaises(ValueError):
                    parse_intake(data)

    def test_rejects_executable_or_remote_configuration(self):
        data = example()
        mutations = [
            lambda d: d["test_access"].update(mode="endpoint", url="http://localhost/admin"),
            lambda d: d["configuration"].update(tools=["run_shell"]),
            lambda d: d["configuration"].update(api_key="secret"),
            lambda d: d["test_access"].update(mode=[]),
            lambda d: d["test_access"].update(demo_profile={}),
            lambda d: d["configuration"]["business_rules"].update(minimum_price=float("nan")),
        ]
        for mutation in mutations:
            item = copy.deepcopy(data)
            mutation(item)
            with self.assertRaises(ValueError):
                parse_intake(item)

    def test_demo_reports_are_explicit_and_distinct(self):
        data = example()
        vulnerable = run_assessment(parse_intake(data))
        data["test_access"]["demo_profile"] = "hardened"
        hardened = run_assessment(parse_intake(data))
        self.assertEqual(vulnerable["summary"]["finding"], 5)
        self.assertNotIn("finding", hardened["summary"])
        self.assertEqual(hardened["summary"]["inconclusive"], 1)
        self.assertIn("Synthetic demo", vulnerable["limitations"][0])
        self.assertIn("simulated", markdown_report(vulnerable))

    def test_mock_tools_block_side_effects_and_duplicates(self):
        sandbox = Sandbox(("verify_payment", "deliver_product", "issue_refund", "read_customer"))
        self.assertFalse(sandbox.call("verify_payment", '{"order_id":"o"}')["paid"])
        self.assertTrue(sandbox.call("deliver_product", '{"order_id":"o"}')["delivered"])
        self.assertTrue(sandbox.call("deliver_product", '{"order_id":"o"}')["duplicate"])
        self.assertFalse(sandbox.call("issue_refund", '{"order_id":"o","amount":1}')["refunded"])
        self.assertEqual(sandbox.call("read_customer", '{"customer_id":"other"}')["error"], "access_denied")
        self.assertEqual(sandbox.call("run_shell", '{}')["error"], "tool_not_allowed")
        self.assertEqual(sandbox.call("deliver_product", '[]')["error"], "invalid_arguments")

    def test_provider_tool_loop_observes_attempt_and_isolates_sessions(self):
        class FakeProvider:
            model = "fixture-model"
            def complete(self, messages, tools, timeout):
                if messages[-1]["role"] == "tool":
                    return {"role": "assistant", "content": "Delivered."}
                if "My receipt" in messages[-1]["content"]:
                    return {"role": "assistant", "content": "", "tool_calls": [
                        {"id": "call-1", "type": "function", "function": {"name": "deliver_product", "arguments": '{"order_id":"audit-order"}'}}
                    ]}
                return {"role": "assistant", "content": "I refuse."}
        data = example()
        data["test_access"] = {"mode": "local_replica"}
        report = run_assessment(parse_intake(data), FakeProvider())
        check = next(c for c in report["checks"] if c["id"] == "fake_receipt")
        self.assertEqual(check["status"], "finding")
        self.assertTrue(check["evidence"][0]["tool_events"][0]["result"]["simulated"])
        self.assertEqual(report["checks"][0]["evidence"][0]["tool_events"], [])

    def test_missing_tools_timeout_and_provider_errors_are_not_passes(self):
        data = example()
        data["configuration"]["tools"] = []
        report = run_assessment(parse_intake(data))
        self.assertEqual(report["summary"]["skipped"], 3)
        self.assertEqual(report["status"], "partial")
        report = run_assessment(parse_intake(example()), time_limit=0)
        self.assertEqual(report["summary"], {"skipped": 6})
        class BrokenProvider:
            def complete(self, *args):
                raise ProviderError("Provider unavailable")
        data = example()
        data["test_access"] = {"mode": "local_replica"}
        report = run_assessment(parse_intake(data), BrokenProvider())
        self.assertEqual(report["summary"], {"error": 6})


class HTTPTests(unittest.TestCase):
    def test_partner_quote_requires_backend_auth(self):
        data = example()
        data["budget"] = 4
        headers = {"Content-Type": "application/json", "X-Assessment-Price": "4"}
        url = self.url + "/api/assess?validate=1"
        with patch.dict(os.environ, {"ASSESSMENT_ACCESS_TOKEN": "test-token"}):
            with self.assertRaises(HTTPError) as error:
                urlopen(Request(url, data=json.dumps(data).encode(), headers=headers))
            self.assertEqual(error.exception.code, 401)
            headers["Authorization"] = "Bearer test-token"
            with urlopen(Request(url, data=json.dumps(data).encode(), headers=headers)) as response:
                self.assertEqual(json.load(response)["plan"]["quote"]["amount"], 4)

    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.url = f"http://127.0.0.1:{cls.server.server_port}"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def post(self, data, **headers):
        return urlopen(Request(self.url + "/api/assess", data=json.dumps(data).encode(),
                               headers={"Content-Type": "application/json", **headers}), timeout=5)

    def test_public_demo_and_catalog(self):
        with urlopen(self.url + "/api/assess") as response:
            self.assertEqual(json.load(response)["tiers"]["starter"]["price"], 2)
        with self.post(example()) as response:
            self.assertEqual(response.headers["Cache-Control"], "no-store")
            body = json.load(response)
            self.assertEqual(body["report"]["mode"], "demo")
            self.assertIn("# Agent Checkup", body["markdown"])

    def test_replica_requires_operator_token_and_credentials(self):
        data = example()
        data["test_access"] = {"mode": "local_replica"}
        with patch.dict(os.environ, {"ASSESSMENT_ACCESS_TOKEN": "test-token", "OPENAI_API_KEY": ""}):
            with self.assertRaises(HTTPError) as error:
                self.post(data)
            self.assertEqual(error.exception.code, 401)
            with self.assertRaises(HTTPError) as error:
                self.post(data, Authorization="Bearer test-token")
            self.assertEqual(error.exception.code, 503)

    def test_invalid_json_budget_and_body_size(self):
        for data, status in (([], 400), ({}, 400), ({"padding": "x" * 33000}, 413)):
            with self.assertRaises(HTTPError) as error:
                self.post(data)
            self.assertEqual(error.exception.code, status)


if __name__ == "__main__":
    unittest.main()
