"""Real originals: authenticated HTTP storage, atomic linkage and shared retrieval."""
import base64
import functools
import hashlib
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


class EvidenceHttpTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        root = Path(self.temp.name)
        self.env = patch.dict(os.environ, {"QMS_DATABASE_PATH": str(root / "test.sqlite3"), "QMS_DEMO_PASSWORD": "1"})
        self.env.start()
        self.original = portal_server.QMS_STORE
        portal_server.QMS_STORE = self.store = QMSStore(root)
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(portal_server.PortalHandler, directory=str(root)))
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.origin = f"http://127.0.0.1:{self.server.server_port}"
        self.secure = self.login("sjkim")
        status, _, _ = self.request("POST", "/__api__/qms/state", {"state": {"cases": [{"id": "CASE-TEST", "evidenceList": [], "signOffHistory": {"D1": {"status": "Approved", "drafter": {"name": "existing"}}, "D2": {"status": "Approved", "drafter": {"name": "existing"}}}, "d2": {"approval": {"status": "Approved", "humanConfirmed": True}}, "gates": {"gate3D": {"status": "Approved", "approvers": []}}}], "intakeQueue": []}, "expectedRevision": 0}, self.secure)
        self.assertEqual(status, 200)

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        portal_server.QMS_STORE = self.original
        self.env.stop()
        self.temp.cleanup()

    def request(self, method, path, payload=None, headers=None):
        conn = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=8)
        body = None if payload is None else json.dumps(payload, ensure_ascii=False).encode("utf-8")
        conn.request(method, path, body, {"Origin": self.origin, "Content-Type": "application/json", **(headers or {})})
        response = conn.getresponse()
        raw = response.read()
        result = json.loads(raw) if response.getheader("Content-Type", "").startswith("application/json") and raw else raw
        info = dict(response.getheaders())
        status = response.status
        conn.close()
        return status, info, result

    def login(self, username):
        status, headers, result = self.request("POST", "/__api__/auth/login", {"username": username, "password": "1"})
        self.assertEqual(status, 200)
        return {"Cookie": headers["Set-Cookie"].split(";", 1)[0], "X-QMS-CSRF": result["csrfToken"]}

    def payload(self, content=b"genuine test original", **changes):
        return {"filename": "고객 메일 테스트.eml", "dataUrl": "data:message/rfc822;base64," + base64.b64encode(content).decode(), "type": "Customer original", "linkedStages": ["D2"], "expectedRevision": 1, **changes}

    def upload(self, payload=None, headers=None, case="CASE-TEST"):
        return self.request("POST", f"/__api__/qms/cases/{case}/evidence", payload or self.payload(), headers if headers is not None else self.secure)

    def counts(self):
        with self.store._connect() as db:
            return tuple(db.execute(f"SELECT count(*) FROM {table}").fetchone()[0] for table in ["evidence_metadata", "evidence_files"])

    def test_original_is_shared_byte_identical_and_d2_linked(self):
        content = "고객 통보 원본\n실측값은 테스트 자료입니다.".encode()
        status, _, result = self.upload(self.payload(content))
        self.assertEqual(status, 201)
        evidence = result["evidence"]
        self.assertEqual(evidence["sha256"], hashlib.sha256(content).hexdigest())
        self.assertEqual(evidence["linkedStages"], ["D2"])
        self.assertTrue(evidence["stageScoped"])
        self.assertEqual(result["case"]["evidenceList"], [evidence])
        route = f"/__api__/qms/cases/CASE-TEST/evidence/{evidence['id']}/file"
        other_user = self.login("hskim")
        status, headers, actual = self.request("GET", route, headers=other_user)
        self.assertEqual((status, actual), (200, content))
        self.assertEqual(headers["X-Evidence-SHA256"], evidence["sha256"])
        self.assertIn("filename*=UTF-8", headers["Content-Disposition"])
        self.assertEqual(result["case"]["signOffHistory"]["D1"]["status"], "Approved")
        self.assertEqual(result["case"]["d2"]["approval"], {"status": "Draft", "humanConfirmed": False})
        self.assertEqual(result["case"]["gates"]["gate3D"]["status"], "Pending")
        self.assertEqual(result["case"]["approvalAudit"][-1]["fromStage"], "D2")

    def test_auth_csrf_supplier_and_case_boundaries(self):
        self.assertEqual(self.upload(headers={})[0], 401)
        self.assertEqual(self.upload(headers={"Cookie": self.secure["Cookie"]})[0], 403)
        self.assertEqual(self.upload(headers=self.login("thkwon"))[0], 403)
        self.assertEqual(self.upload(case="UNKNOWN")[0], 404)
        status, _, result = self.upload()
        route = f"/__api__/qms/cases/CASE-TEST/evidence/{result['evidence']['id']}/file"
        self.assertEqual(self.request("GET", route)[0], 401)
        self.assertEqual(self.request("GET", route, headers=self.login("thkwon"))[0], 403)
        self.assertEqual(self.request("GET", route.replace("CASE-TEST", "OTHER"), headers=self.secure)[0], 404)

    def test_revision_conflict_has_no_orphans(self):
        self.assertEqual(self.upload(self.payload(expectedRevision=0))[0], 409)
        self.assertEqual(self.counts(), (0, 0))
        self.assertEqual(self.store.get_state()["revision"], 1)
        self.assertEqual(self.store.get_state()["state"]["cases"][0]["evidenceList"], [])

    def test_invalid_files_and_metadata_are_rejected_atomically(self):
        for changes in [{"filename": "../escape.txt"}, {"filename": "unsafe.html"}, {"linkedStages": ["D99"]}, {"linkedStages": [{}]}, {"type": {}}, {"dataUrl": "data:text/plain;base64,?"}]:
            with self.subTest(changes=changes):
                self.assertEqual(self.upload(self.payload(**changes))[0], 400)
        self.assertEqual(self.upload(self.payload(b""))[0], 413)
        self.assertEqual(self.counts(), (0, 0))

    def test_shared_original_survives_store_reopen(self):
        status, _, result = self.upload()
        portal_server.QMS_STORE = QMSStore(Path(self.temp.name))
        status, _, content = self.request("GET", f"/__api__/qms/cases/CASE-TEST/evidence/{result['evidence']['id']}/file", headers=self.secure)
        self.assertEqual((status, content), (200, b"genuine test original"))


if __name__ == "__main__":
    unittest.main()
