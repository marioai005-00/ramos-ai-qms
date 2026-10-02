"""HTTP contract tests for Agent Operations endpoints."""

import functools
import http.client
import json
import os
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import patch
from http.server import ThreadingHTTPServer

import portal_server
from agent_runtime import AgentRuntime
from qms_backend import QMSStore


class AgentHttpTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        root = Path(self.temp.name)
        (root / "index.html").write_text("Agent QMS test", encoding="utf-8")
        self.env = patch.dict(os.environ, {
            "QMS_DATABASE_PATH": str(root / "agent-http.sqlite3"),
            "QMS_DEMO_PASSWORD": "1",
            "QMS_SCHEDULER_ENABLED": "false",
        })
        self.env.start()
        self.original_store = portal_server.QMS_STORE
        self.original_runtime = portal_server.AGENT_RUNTIME
        portal_server.QMS_STORE = QMSStore(root)
        portal_server.AGENT_RUNTIME = AgentRuntime(portal_server.QMS_STORE)
        self.server = ThreadingHTTPServer(
            ("127.0.0.1", 0),
            functools.partial(portal_server.PortalHandler, directory=str(root)),
        )
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.origin = f"http://127.0.0.1:{self.server.server_port}"

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        portal_server.AGENT_RUNTIME.stop_scheduler()
        portal_server.QMS_STORE = self.original_store
        portal_server.AGENT_RUNTIME = self.original_runtime
        self.env.stop()
        self.temp.cleanup()

    def request(self, method, path, payload=None, headers=None):
        conn = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=4)
        body = None if payload is None else json.dumps(payload, ensure_ascii=False).encode("utf-8")
        request_headers = {"Origin": self.origin, **(headers or {})}
        if body is not None:
            request_headers["Content-Type"] = "application/json"
        conn.request(method, path, body=body, headers=request_headers)
        response = conn.getresponse()
        raw = response.read()
        result = json.loads(raw.decode("utf-8")) if raw else {}
        response_headers = response.getheaders()
        status = response.status
        conn.close()
        return status, response_headers, result

    def login(self):
        status, headers, payload = self.request("POST", "/__api__/auth/login", {"username": "sjkim", "password": "1"})
        self.assertEqual(status, 200)
        cookie = next(value for key, value in headers if key.lower() == "set-cookie").split(";", 1)[0]
        return {"Cookie": cookie, "X-QMS-CSRF": payload["csrfToken"]}

    def test_agent_run_approval_sources_findings_and_disabled_adapters(self):
        secure = self.login()
        case = {
            "id": "CASE-HTTP-AGENT", "status": "In Progress", "customer": "LGE",
            "product": "eMMC", "partNumber": "PN", "lotNumber": "LOT",
            "claimTitle": "부팅 불량", "defectQty": 1, "inspectQty": 10, "gates": {},
        }
        status, _, saved = self.request("POST", "/__api__/qms/state", {
            "state": {"cases": [case], "intakeQueue": []}, "expectedRevision": 0, "reason": "agent http fixture",
        }, secure)
        self.assertEqual((status, saved["revision"]), (200, 1))

        status, _, created = self.request("POST", "/__api__/qms/agent-runs", {
            "caseId": case["id"], "requestText": "CASE-HTTP-AGENT D1~D3 초안을 작성해줘",
            "idempotencyKey": "http-agent-1",
        }, secure)
        self.assertEqual(status, 201)
        run = created["run"]
        self.assertEqual(run["status"], "AWAITING_APPROVAL")

        status, _, listed = self.request("GET", f"/__api__/qms/agent-runs?caseId={case['id']}", headers={"Cookie": secure["Cookie"]})
        self.assertEqual(status, 200)
        self.assertEqual(listed["items"][0]["id"], run["id"])

        status, _, approved = self.request("POST", f"/__api__/qms/agent-runs/{run['id']}/approve", {
            "comment": "Case Fact와 비교하여 승인합니다.", "applyToCase": True, "expectedRevision": 1,
        }, secure)
        self.assertEqual(status, 200)
        self.assertEqual(approved["run"]["status"], "COMPLETED")

        status, _, adapters = self.request("GET", "/__api__/qms/agent/adapters", headers={"Cookie": secure["Cookie"]})
        self.assertEqual(status, 200)
        self.assertFalse(adapters["email"]["externalSendEnabled"])
        self.assertFalse(adapters["internalSystems"]["writeEnabled"])

        status, _, source = self.request("POST", f"/__api__/qms/cases/{case['id']}/sources", {
            "originalName": "evidence.pdf", "mimeType": "application/pdf",
            "sha256": "a" * 64, "sourceType": "DOCUMENT", "byteSize": 100,
        }, secure)
        self.assertEqual(status, 201)
        self.assertFalse(source["source"]["storedBody"])

        status, _, sources = self.request("GET", f"/__api__/qms/cases/{case['id']}/sources", headers={"Cookie": secure["Cookie"]})
        self.assertEqual((status, len(sources["items"])), (200, 1))
        self.assertEqual(self.request("POST", "/__api__/qms/dispatch/send", {}, secure)[0], 404)


    def test_agent_runtime_feature_flag_disables_agent_api(self):
        secure = self.login()
        with patch.dict(os.environ, {"QMS_AGENT_RUNTIME_ENABLED": "false"}):
            status, _, payload = self.request(
                "GET", "/__api__/qms/agent/adapters", headers={"Cookie": secure["Cookie"]}
            )
        self.assertEqual((status, payload["code"]), (503, "AGENT_RUNTIME_DISABLED"))

if __name__ == "__main__":
    unittest.main()
