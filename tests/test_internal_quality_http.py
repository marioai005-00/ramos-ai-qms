"""Isolated HTTP tests: internal records, shared originals, roles and human transitions."""
import base64
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


class InternalQualityHttpTests(unittest.TestCase):
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
        self.request("POST", "/__api__/qms/state", {"state": {"cases": [{"id": "CASE-TEST"}], "intakeQueue": []}, "expectedRevision": 0}, self.secure)
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

    def payload(self, kind="Issue", **changes):
        return {"kind": kind, "title": "실제 입력 테스트 <script>", "description": "확인한 현상", "department": "품질혁신팀", "owner": "김성중", "site": "Ramos 3Camp", "issueType": "Nonconformance", "occurredAt": "2026-10-02T09:30", "inputQty": 100, "defectQty": 0, "change4M": ["Method"], "beforeChange": "기존 검사", "afterChange": "추가 검사", "changeReason": "조건 관리", "validationPlan": "비교 시험 예정", "plannedDate": "2026-10-05", "files": [], **changes}

    def create(self, payload=None, headers=None):
        status, _, result = self.request("POST", "/__api__/qms/internal-quality", payload or self.payload(), headers or self.secure)
        self.assertEqual(status, 201, result)
        return result["record"]

    def update(self, record, headers=None, **changes):
        return self.request("POST", "/__api__/qms/internal-quality/" + record["ticketId"], {"action": "note", "expectedRevision": record["revision"], "comment": "담당자 확인", **changes}, headers or self.secure)

    def file(self, content=b"actual original"):
        return {"filename": "실측 원본.txt", "dataUrl": "data:text/plain;base64," + base64.b64encode(content).decode()}

    def test_separate_lists_shared_identity_and_no_customer_mutation(self):
        issue = self.create(self.payload(status="Closed", createdBy={"name": "forged"}, scope="Customer"))
        pcn = self.create(self.payload("PCN"))
        self.assertEqual((issue["status"], issue["createdBy"]["username"], issue["scope"]), ("Submitted", "sjkim", "Internal"))
        other = self.login("hskim")
        for kind, record in (("Issue", issue), ("PCN", pcn)):
            status, _, result = self.request("GET", "/__api__/qms/internal-quality?kind=" + kind, headers=other)
            self.assertEqual(status, 200); self.assertEqual([r["ticketId"] for r in result["items"]], [record["ticketId"]])
        self.assertEqual(self.store.get_state(), self.initial_state)
        with self.store._connect() as db:
            self.assertEqual(db.execute("SELECT count(*) FROM audit_logs WHERE action='INTERNAL_QUALITY_CREATED'").fetchone()[0], 2)

    def test_auth_csrf_all_supplier_accounts_and_approval_role(self):
        route = "/__api__/qms/internal-quality"
        self.assertEqual(self.request("GET", route)[0], 401)
        self.assertEqual(self.request("POST", route, self.payload(), {"Cookie": self.secure["Cookie"]})[0], 403)
        record = self.create()
        for username in ("thkwon", "yspark", "sangwook.ki", "ojs"):
            external = self.login(username)
            self.assertEqual(self.request("GET", route, headers=external)[0], 403)
            self.assertEqual(self.request("GET", route+'/'+record["ticketId"], headers=external)[0], 403)
            self.assertEqual(self.request("POST", route, self.payload(), external)[0], 403)
        engineer = self.login("hskim")
        self.assertEqual(self.update(record, engineer, action="status", status="UnderReview")[0], 403)
        self.assertEqual(self.update(record, engineer, owner="김현수")[0], 200)

    def test_issue_progress_requires_human_evidence_to_close(self):
        record = self.create()
        self.assertEqual(self.update(record, action="status", status="Closed")[0], 409)
        for status in ("UnderReview", "InProgress"):
            code, _, result = self.update(record, action="status", status=status); self.assertEqual(code, 200); record = result["record"]
        self.assertEqual(self.update(record, action="status", status="Closed")[0], 400)
        code, _, result = self.update(record, action="status", status="Closed", validationResult="재검사 완료: 테스트 자료", files=[self.file()])
        self.assertEqual(code, 200); self.assertEqual(result["record"]["history"][-1]["actor"]["username"], "sjkim")
        self.assertEqual(result["record"]["status"], "Closed")

    def test_pcn_no_auto_approval_then_confirmed_implementation(self):
        record = self.create(self.payload("PCN"))
        self.assertEqual(self.update(record, action="status", status="Approved")[0], 409)
        _, _, result = self.update(record, action="status", status="UnderReview"); record = result["record"]
        self.assertEqual(self.update(record, action="status", status="Approved")[0], 400)
        _, _, result = self.update(record, action="status", status="Approved", validationResult="입력된 시험 결과", files=[self.file()]); record = result["record"]
        self.assertEqual(record["status"], "Approved")
        self.assertEqual(self.update(record, validationResult="승인 후 결과 변경")[0], 409)
        self.assertEqual(self.update(record, action="status", status="Implemented")[0], 400)
        code, _, result = self.update(record, action="status", status="Implemented", implementedDate="2026-10-06")
        self.assertEqual(code, 200); self.assertEqual(result["record"]["implementedDate"], "2026-10-06")

    def test_original_round_trip_case_link_and_conflict_rollback(self):
        content = "실측 원본 테스트 내용".encode()
        record = self.create(self.payload(files=[self.file(content)]))
        route = "/__api__/qms/internal-quality/"+record["ticketId"]+"/files/"+record["files"][0]["id"]
        code, headers, actual = self.request("GET", route, headers=self.login("hskim"))
        self.assertEqual((code, actual), (200, content)); self.assertEqual(headers["X-Evidence-SHA256"], record["files"][0]["sha256"])
        self.assertEqual(self.request("GET", route, headers=self.login("thkwon"))[0], 403)
        self.assertEqual(self.update(record, linkedCaseId="UNKNOWN", files=[self.file()])[0], 404)
        code, _, result = self.update(record, linkedCaseId="CASE-TEST"); self.assertEqual(code, 200)
        self.assertEqual(result["record"]["linkedCaseId"], "CASE-TEST")
        self.assertEqual(self.update(record, files=[self.file()])[0], 409)
        with self.store._connect() as db:
            self.assertEqual(db.execute("SELECT count(*) FROM internal_quality_files").fetchone()[0], 1)
        self.assertEqual(self.store.get_state(), self.initial_state)

    def test_edit_and_rejection_preserve_review_boundary(self):
        record = self.create()
        code, _, result = self.update(record, **{**self.payload(title="入力を修正"), "action": "edit"})
        self.assertEqual(code, 200); record = result["record"]
        _, _, result = self.update(record, action="status", status="UnderReview"); record = result["record"]
        self.assertEqual(self.update(record, **{**self.payload(), "action": "edit"})[0], 409)
        _, _, result = self.update(record, action="status", status="Rejected"); record = result["record"]
        code, _, result = self.update(record, action="status", status="Submitted")
        self.assertEqual(code, 200); self.assertEqual(result["record"]["status"], "Submitted")

    def test_required_values_bad_files_types_quantities_and_pcn(self):
        for changes in ({"title":""}, {"description":False}, {"kind":[]}, {"inputQty":0,"defectQty":1}, {"inputQty":float('nan')}, {"site":"가상 공장"}, {"change4M":[{}]}, {"files":[{"filename":"bad.exe","dataUrl":"data:;base64,eA=="}]}, {"files":[{"filename":"empty.txt","dataUrl":"data:;base64,"}]}):
            self.assertIn(self.request("POST", "/__api__/qms/internal-quality", self.payload(**changes), self.secure)[0], (400,413))
        for changes in ({"beforeChange":""}, {"change4M":[]}, {"plannedDate":"2026-99-99"}):
            self.assertEqual(self.request("POST", "/__api__/qms/internal-quality", self.payload("PCN", **changes), self.secure)[0], 400)
        with self.store._connect() as db:
            self.assertEqual(db.execute("SELECT count(*) FROM internal_quality_records").fetchone()[0], 0)
