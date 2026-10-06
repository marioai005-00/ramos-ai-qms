"""Intake originals: central storage before a Case exists and carry-over into Case evidence."""
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


class IntakeFilesHttpTests(unittest.TestCase):
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
        self.registrar = self.login("special2947")
        self.reviewer = self.login("sjkim")

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

    def payload(self, content=b"intake original for tests", **changes):
        return {"intakeId": "INTAKE-TEST", "filename": "접수 메일 테스트.eml", "dataUrl": "data:message/rfc822;base64," + base64.b64encode(content).decode(), **changes}

    def upload(self, payload=None, headers=None):
        return self.request("POST", "/__api__/qms/intake-files", payload or self.payload(), headers if headers is not None else self.registrar)

    def seed(self, intake_entries, case=None, intake=None):
        """Stored directly: the fixture carries approvals the state API would refuse without server events."""
        state = {"intakeQueue": [{"intakeId": "INTAKE-TEST", "status": "Approved", "triage": {"approvedCaseId": "CASE-TEST"}, "evidenceList": intake_entries, **(intake or {})}],
                 "cases": [{"id": "CASE-TEST", "sourceIntakeId": "INTAKE-TEST", "evidenceList": [],
                            "signOffHistory": {"D1": {"status": "Approved", "drafter": {"name": "existing"}}}, **(case or {})}]}
        with self.store._connect() as db:
            db.execute("INSERT INTO state_store(id, revision, state_json, state_hash, updated_at, updated_by) VALUES(1, 1, ?, 'fixture', '2026-10-01T00:00:00Z', 1)", (json.dumps(state),))

    def carry(self, revision=1, headers=None, case="CASE-TEST"):
        return self.request("POST", f"/__api__/qms/cases/{case}/intake-originals", {"expectedRevision": revision}, headers or self.reviewer)

    def counts(self):
        with self.store._connect() as db:
            return tuple(db.execute(f"SELECT count(*) FROM {table}").fetchone()[0] for table in ["intake_files", "evidence_metadata", "evidence_files"])

    def test_original_is_stored_before_a_case_exists_and_opens_for_another_user(self):
        content = "접수 원본\n테스트 자료입니다.".encode()
        status, _, result = self.upload(self.payload(content))
        self.assertEqual(status, 201)
        stored = result["file"]
        self.assertEqual(stored["sha256"], hashlib.sha256(content).hexdigest())
        self.assertEqual((stored["intakeId"], stored["sizeBytes"], stored["uploadedBy"]), ("INTAKE-TEST", len(content), "special2947@ramostek.com"))
        self.assertIsNone(self.store.get_state())
        status, headers, actual = self.request("GET", f"/__api__/qms/intake-files/{stored['intakeFileId']}", headers=self.reviewer)
        self.assertEqual((status, actual), (200, content))
        self.assertEqual(headers["X-Evidence-SHA256"], stored["sha256"])
        self.assertIn("filename*=UTF-8", headers["Content-Disposition"])

    def test_auth_csrf_and_supplier_boundaries(self):
        self.assertEqual(self.upload(headers={})[0], 401)
        self.assertEqual(self.upload(headers={"Cookie": self.registrar["Cookie"]})[0], 403)
        supplier = self.login("thkwon")
        self.assertEqual(self.upload(headers=supplier)[0], 403)
        route = f"/__api__/qms/intake-files/{self.upload()[2]['file']['intakeFileId']}"
        self.assertEqual(self.request("GET", route)[0], 401)
        self.assertEqual(self.request("GET", route, headers=supplier)[0], 403)
        self.assertEqual(self.request("GET", "/__api__/qms/intake-files/INF-unknown", headers=self.reviewer)[0], 404)
        self.seed([])
        self.assertEqual(self.carry(headers=supplier)[0], 403)

    def test_invalid_uploads_store_nothing(self):
        for changes in [{"intakeId": "../escape"}, {"intakeId": ""}, {"intakeId": 7}, {"filename": "unsafe.html"}, {"filename": "a/b.txt"}, {"dataUrl": "data:text/plain;base64,?"}]:
            with self.subTest(changes=changes):
                self.assertEqual(self.upload(self.payload(**changes))[0], 400)
        self.assertEqual(self.upload(self.payload(b""))[0], 413)
        self.assertEqual(self.counts(), (0, 0, 0))

    def test_carry_over_copies_only_stored_originals_and_keeps_d1_approval(self):
        content = b"customer mail original"
        stored = self.upload(self.payload(content))[2]["file"]
        legacy = {"id": "INT-EVD-1", "file": "legacy.png", "storageKey": "intake__1", "linkedStages": ["D2", "D3"]}
        self.seed([{"intakeFileId": stored["intakeFileId"], "file": stored["file"]}, {"intakeFileId": "INF-not-stored", "file": "claimed.pdf"}, legacy],
                  case={"evidenceList": [legacy]})
        status, _, result = self.carry()
        self.assertEqual(status, 200)
        self.assertEqual([item["intakeFileId"] for item in result["carried"]], [stored["intakeFileId"]])
        self.assertEqual(result["missing"], [{"intakeFileId": "INF-not-stored", "file": "claimed.pdf"}])
        evidence = result["carried"][0]
        self.assertEqual(result["case"]["evidenceList"], [legacy, evidence])
        self.assertEqual((evidence["sha256"], evidence["sizeBytes"], evidence["file"]), (hashlib.sha256(content).hexdigest(), len(content), stored["file"]))
        self.assertEqual((evidence["linkedStages"], evidence["stageScoped"], evidence["type"]), (["D2", "D3"], True, "Customer original"))
        self.assertEqual((evidence["uploadedBy"], evidence["carriedOverBy"], evidence["sourceIntakeId"]), ("special2947@ramostek.com", "sjkim@ramostek.com", "INTAKE-TEST"))
        self.assertEqual(result["case"]["signOffHistory"]["D1"], {"status": "Approved", "drafter": {"name": "existing"}})
        self.assertNotIn("approvalAudit", result["case"])
        self.assertEqual((result["revision"], self.store.get_state()["revision"]), (2, 2))
        self.assertEqual(self.store.get_state()["state"]["cases"][0], result["case"])
        status, headers, actual = self.request("GET", f"/__api__/qms/cases/CASE-TEST/evidence/{evidence['id']}/file", headers=self.login("hskim"))
        self.assertEqual((status, actual, headers["X-Evidence-SHA256"]), (200, content, evidence["sha256"]))
        # A second request has nothing left to copy and leaves the state as it is.
        status, _, again = self.carry(revision=2)
        self.assertEqual((status, again["carried"], again["revision"]), (200, [], 2))
        self.assertEqual(self.counts(), (1, 1, 1))

    def test_carry_over_refuses_unlinked_records_and_stale_revisions(self):
        stored = self.upload()[2]["file"]
        other = self.upload(self.payload(intakeId="INTAKE-OTHER"))[2]["file"]
        entries = [{"intakeFileId": stored["intakeFileId"], "file": stored["file"]}, {"intakeFileId": other["intakeFileId"], "file": other["file"]}]
        self.seed(entries)
        self.assertEqual(self.carry(revision=0)[0], 409)
        self.assertEqual(self.carry(case="UNKNOWN")[0], 404)
        self.assertEqual(self.request("POST", "/__api__/qms/cases/CASE-TEST/intake-originals", {"expectedRevision": "1"}, self.reviewer)[0], 400)
        self.assertEqual(self.counts(), (2, 0, 0))
        # A file uploaded under another intake number is not carried even when this intake lists it.
        status, _, result = self.carry()
        self.assertEqual([item["intakeFileId"] for item in result["carried"]], [stored["intakeFileId"]])
        self.assertEqual([item["intakeFileId"] for item in result["missing"]], [other["intakeFileId"]])

    def test_carry_over_needs_the_intake_approved_for_this_case(self):
        stored = self.upload()[2]["file"]
        self.seed([{"intakeFileId": stored["intakeFileId"], "file": stored["file"]}], intake={"triage": {"approvedCaseId": "CASE-ELSE"}})
        status, _, result = self.carry()
        self.assertEqual((status, result["code"]), (409, "INTAKE_NOT_LINKED"))
        with self.store._connect() as db:
            db.execute("UPDATE state_store SET state_json=? WHERE id=1", (json.dumps({"intakeQueue": [], "cases": [{"id": "CASE-TEST", "evidenceList": []}]}),))
        status, _, result = self.carry()
        self.assertEqual((status, result["code"]), (404, "INTAKE_NOT_FOUND"))
        self.assertEqual(self.counts(), (1, 0, 0))

    def test_late_carry_over_reopens_d2_onward_only(self):
        stored = self.upload()[2]["file"]
        signed = {"status": "Approved", "drafter": {"name": "existing"}}
        self.seed([{"intakeFileId": stored["intakeFileId"], "file": stored["file"]}],
                  case={"signOffHistory": {"D1": dict(signed), "D2": dict(signed)}, "d2": {"approval": {"status": "Approved", "humanConfirmed": True}}})
        case = self.carry()[2]["case"]
        self.assertEqual(case["signOffHistory"]["D1"], signed)
        self.assertEqual(case["signOffHistory"]["D2"]["status"], "Draft")
        self.assertEqual(case["d2"]["approval"], {"status": "Draft", "humanConfirmed": False})
        self.assertEqual(case["approvalAudit"][-1]["fromStage"], "D2")


if __name__ == "__main__":
    unittest.main()
