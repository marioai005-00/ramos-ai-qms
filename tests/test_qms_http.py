"""HTTP integration tests for authenticated QMS routes and disabled e-mail send."""

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
from qms_backend import QMSStore


class QMSHttpTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        root = Path(self.temp.name)
        (root / "index.html").write_text("QMS test", encoding="utf-8")
        self.env = patch.dict(os.environ, {
            "QMS_DATABASE_PATH": str(root / "http-qms.sqlite3"),
            "QMS_DEMO_PASSWORD": "1",
        })
        self.env.start()
        self.original_store = portal_server.QMS_STORE
        portal_server.QMS_STORE = QMSStore(root)
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
        portal_server.QMS_STORE = self.original_store
        self.env.stop()
        self.temp.cleanup()

    def request(self, method, path, payload=None, headers=None):
        conn = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=3)
        body = None if payload is None else json.dumps(payload, ensure_ascii=False).encode("utf-8")
        request_headers = {"Origin": self.origin, **(headers or {})}
        if body is not None:
            request_headers["Content-Type"] = "application/json"
        conn.request(method, path, body=body, headers=request_headers)
        response = conn.getresponse()
        raw = response.read()
        result = json.loads(raw.decode("utf-8")) if raw else {}
        headers_out = response.getheaders()
        status = response.status
        conn.close()
        return status, headers_out, result

    def login(self):
        status, headers, payload = self.request("POST", "/__api__/auth/login", {"username": "sjkim", "password": "1"})
        self.assertEqual(status, 200)
        cookie = next(value for key, value in headers if key.lower() == "set-cookie").split(";", 1)[0]
        return cookie, payload["csrfToken"]

    def test_auth_csrf_shared_state_and_no_send_endpoint(self):
        self.assertEqual(self.request("GET", "/__api__/qms/state")[0], 401)
        cookie, csrf = self.login()
        auth = {"Cookie": cookie}
        self.assertEqual(self.request("GET", "/__api__/qms/state", headers=auth)[0], 200)
        self.assertEqual(self.request("POST", "/__api__/qms/state", {"state": {"cases": []}, "expectedRevision": 0}, auth)[0], 403)
        secure = {**auth, "X-QMS-CSRF": csrf}
        status, _, saved = self.request("POST", "/__api__/qms/state", {
            "state": {"cases": [], "intakeQueue": []}, "expectedRevision": 0, "reason": "http test",
        }, secure)
        self.assertEqual(status, 200)
        self.assertEqual(saved["revision"], 1)
        dispatch_status, _, prepared = self.request("POST", "/__api__/qms/dispatch/prepare", {
            "caseId": "CASE-HTTP", "gateKey": "gate3D", "subject": "3D",
            "evidenceNote": "수동 외부 송부 증빙", "reportSnapshot": {"v": 1},
        }, secure)
        self.assertEqual(dispatch_status, 201)
        self.assertEqual((prepared["status"], prepared["provider"], prepared["externalSend"]), ("PREPARED", "UNDECIDED", False))
        self.assertEqual(self.request("POST", "/__api__/qms/dispatch/send", {}, secure)[0], 404)


if __name__ == "__main__":
    unittest.main()
