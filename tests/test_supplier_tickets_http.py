"""Isolated HTTP tests: supplier PCN/Issue tickets are shared centrally, scoped per supplier and reviewed by real accounts."""
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


class SupplierTicketsHttpTests(unittest.TestCase):
    route = "/__api__/qms/supplier-tickets"

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
        self.internal = self.login("sjkim")
        self.techl = self.login("thkwon")
        self.winpac = self.login("yspark")
        self.request("POST", "/__api__/qms/state", {"state": {"cases": [{"id": "CASE-TEST"}], "intakeQueue": []}, "expectedRevision": 0}, self.internal)
        self.initial_state = self.store.get_state()

    def tearDown(self):
        self.server.shutdown(); self.server.server_close(); self.thread.join()
        portal_server.QMS_STORE = self.original
        self.env.stop(); self.temp.cleanup()

    def request(self, method, path, payload=None, headers=None):
        conn = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=8)
        body = None if payload is None else json.dumps(payload, ensure_ascii=False).encode()
        conn.request(method, path, body, {"Origin": self.origin, "Content-Type": "application/json", **(headers or {})})
        response = conn.getresponse(); raw = response.read()
        result = json.loads(raw) if response.getheader("Content-Type", "").startswith("application/json") and raw else raw
        status, info = response.status, dict(response.getheaders()); conn.close()
        return status, info, result

    def login(self, username):
        status, headers, result = self.request("POST", "/__api__/auth/login", {"username": username, "password": "1"})
        self.assertEqual(status, 200)
        return {"Cookie": headers["Set-Cookie"].split(";", 1)[0], "X-QMS-CSRF": result["csrfToken"]}

    def file(self, data=b"original report", name="시험 성적서.pdf"):
        return {"filename": name, "dataUrl": "data:application/pdf;base64," + base64.b64encode(data).decode()}

    def pcn(self, **changes):
        return {"ticketType": "PCN", "title": "솔더 페이스트 변경 요청", "description": "공급사 변경에 따른 4M 변경", "change4M": ["Method"],
                "reasonType": "Quality_Improvement", "partNumber": "KEEP-PN", "lotNo": "KEEP-LOT",
                "comparisonTable": [{"item": "점도", "current": "A", "proposed": "B", "riskAssessment": ""}], "files": [], **changes}

    def issue(self, **changes):
        return {"ticketType": "Issue", "title": "언더필 도포 불량", "description": "공정 중 발견", "change4M": [],
                "incident": {"processStep": "Molding_Underfill", "inputQty": 200, "defectQty": 3, "quarantineQty": None}, "files": [], **changes}

    def create(self, payload=None, headers=None):
        status, _, result = self.request("POST", self.route, payload or self.pcn(), headers or self.techl)
        self.assertEqual(status, 201, result)
        return result["record"]

    def update(self, record, action, headers=None, **changes):
        return self.request("POST", f"{self.route}/{record['ticketId']}", {"action": action, "expectedRevision": record["revision"], **changes}, headers or self.internal)

    def changed(self, record, action, headers=None, **changes):
        status, _, result = self.update(record, action, headers, **changes)
        self.assertEqual(status, 200, result)
        return result["record"]

    def listed(self, headers):
        status, _, result = self.request("GET", self.route, headers=headers)
        self.assertEqual(status, 200, result)
        return [item["ticketId"] for item in result["items"]]

    def test_supplier_ticket_is_visible_to_internal_staff_but_not_other_suppliers(self):
        content = b"genuine measured report"
        record = self.create(self.pcn(files=[self.file(content)]))
        self.assertEqual(record["supplier"]["companyName"], "TechL")
        self.assertEqual(record["supplier"]["email"], "thkwon@techl.co.kr")
        self.assertEqual((record["status"], record["sqeReview"]["decision"]), ("Submitted", "Pending"))
        self.assertTrue(record["ticketId"].startswith("PCN-"))
        self.assertEqual(self.listed(self.internal), [record["ticketId"]])
        self.assertEqual(self.listed(self.techl), [record["ticketId"]])
        self.assertEqual(self.listed(self.winpac), [])
        self.assertEqual(self.request("GET", f"{self.route}/{record['ticketId']}", headers=self.winpac)[0], 404)
        stored = record["evidenceFiles"][0]
        self.assertEqual(stored["sha256"], hashlib.sha256(content).hexdigest())
        file_route = f"{self.route}/{record['ticketId']}/files/{stored['id']}"
        status, headers, actual = self.request("GET", file_route, headers=self.internal)
        self.assertEqual((status, actual), (200, content))
        self.assertEqual(headers["X-Evidence-SHA256"], stored["sha256"])
        self.assertEqual(self.request("GET", file_route, headers=self.winpac)[0], 404)
        self.assertEqual(self.request("GET", file_route)[0], 401)

    def test_supplier_identity_and_review_fields_come_from_the_server(self):
        forged = self.pcn(supplierId="SUP-WINPAC", companyName="WinPAC", status="Approved",
                          sqeReview={"decision": "Approved", "reviewer": "임의 심의자"}, riskLevel="MINOR", change4M=["Material"])
        record = self.create(forged)
        self.assertEqual(record["supplier"]["id"], "SUP-TECHL")
        self.assertEqual(record["status"], "Submitted")
        self.assertEqual(record["sqeReview"]["reviewer"], "")
        self.assertEqual(record["classification"]["riskLevel"], "MAJOR")
        self.assertEqual(self.listed(self.winpac), [])

    def test_internal_registration_requires_an_official_supplier(self):
        self.assertEqual(self.request("POST", self.route, self.pcn(), self.internal)[0], 400)
        self.assertEqual(self.request("POST", self.route, self.pcn(supplierId="SUP-UNKNOWN"), self.internal)[0], 400)
        record = self.create(self.pcn(supplierId="SUP-CTST"), self.internal)
        self.assertEqual(record["supplier"]["companyName"], "CTST")
        self.assertFalse(record["registeredBySupplier"])

    def test_issue_quantities_are_validated_and_rate_is_derived(self):
        record = self.create(self.issue())
        self.assertTrue(record["ticketId"].startswith("SQ-"))
        self.assertEqual(record["incident"]["defectRate"], "1.50")
        self.assertIsNone(record["incident"]["quarantineQty"])
        unknown = self.create(self.issue(incident={"inputQty": None, "defectQty": None}))
        self.assertEqual(unknown["incident"]["defectRate"], "")
        for incident in ({"inputQty": 10, "defectQty": 11}, {"inputQty": -1}, {"inputQty": "many"}):
            with self.subTest(incident=incident):
                self.assertEqual(self.request("POST", self.route, self.issue(incident=incident), self.techl)[0], 400)
        self.assertEqual(self.request("POST", self.route, self.pcn(title=""), self.techl)[0], 400)
        self.assertEqual(self.request("POST", self.route, self.pcn(change4M=[]), self.techl)[0], 400)

    def test_review_is_internal_reviewer_only_and_records_the_real_account(self):
        record = self.create()
        self.assertEqual(self.update(record, "review", self.techl, decision="Approved", comment="자체 승인")[0], 403)
        self.assertEqual(self.update(record, "review", self.login("hskim"), decision="Under_Review")[0], 403)
        self.assertEqual(self.update(record, "review", decision="Approved")[0], 400)
        self.assertEqual(self.update(record, "review", decision="8D_Escalated", comment="직접 지정")[0], 400)
        reviewed = self.changed(record, "review", decision="Revision_Requested", comment="신뢰성 성적서 보완 요청", reviewer="임의 이름")
        self.assertEqual(reviewed["status"], "Revision_Requested")
        self.assertEqual(reviewed["sqeReview"]["reviewerAccount"]["username"], "sjkim")
        self.assertNotIn("임의 이름", reviewed["sqeReview"]["reviewer"])
        self.assertEqual(self.update(record, "review", decision="Approved", comment="이전 revision")[0], 409)

    def test_resubmission_keeps_reviewer_comment_and_stores_originals(self):
        record = self.create()
        self.assertEqual(self.update(record, "resubmit", self.techl, files=[self.file()])[0], 409)
        requested = self.changed(record, "review", decision="Revision_Requested", comment="성적서 보완 요청")
        self.assertEqual(self.update(requested, "resubmit", self.techl, comment="파일 없음")[0], 400)
        self.assertEqual(self.update(requested, "resubmit", self.winpac, files=[self.file()])[0], 404)
        self.assertEqual(self.update(requested, "resubmit", self.internal, files=[self.file()])[0], 403)
        content = b"revised reliability report"
        resubmitted = self.changed(requested, "resubmit", self.techl, comment="가속 시험 결과 추가", files=[self.file(content, "보완.pdf")])
        self.assertEqual(resubmitted["status"], "Report_Submitted")
        self.assertEqual(resubmitted["sqeReview"]["comment"], "성적서 보완 요청")
        self.assertEqual(resubmitted["resubmissions"][0]["comment"], "가속 시험 결과 추가")
        added = resubmitted["evidenceFiles"][-1]
        self.assertEqual((added["phase"], added["sha256"]), ("Resubmission", hashlib.sha256(content).hexdigest()))

    def test_case_binding_requires_an_existing_case_and_changes_no_case_data(self):
        record = self.create(self.issue())
        self.assertEqual(self.update(record, "bind", caseId="RAMOS-8D-20260901-01")[0], 404)
        self.assertEqual(self.update(record, "bind", self.techl, caseId="CASE-TEST")[0], 403)
        bound = self.changed(record, "bind", caseId="CASE-TEST")
        self.assertEqual((bound["status"], bound["sqeReview"]["bound8DCaseId"]), ("8D_Escalated", "CASE-TEST"))
        self.assertEqual(self.store.get_state(), self.initial_state)

    def test_auth_csrf_and_atomic_failure(self):
        self.assertEqual(self.request("GET", self.route)[0], 401)
        self.assertEqual(self.request("POST", self.route, self.pcn())[0], 401)
        self.assertEqual(self.request("POST", self.route, self.pcn(), {"Cookie": self.techl["Cookie"]})[0], 403)
        self.assertEqual(self.request("POST", self.route, self.pcn(files=[self.file(name="unsafe.html")]), self.techl)[0], 400)
        with self.store._connect() as db:
            counts = tuple(db.execute(f"SELECT count(*) FROM {table}").fetchone()[0] for table in ("supplier_tickets", "supplier_ticket_files"))
        self.assertEqual(counts, (0, 0))
        record = self.create()
        portal_server.QMS_STORE = QMSStore(Path(self.temp.name))
        self.assertEqual(self.listed(self.internal), [record["ticketId"]])


if __name__ == "__main__":
    unittest.main()
