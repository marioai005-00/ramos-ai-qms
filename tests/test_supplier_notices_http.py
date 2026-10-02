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


class SupplierNoticesHttpTests(unittest.TestCase):
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

    route = "/__api__/qms/supplier-notices"

    def notice_payload(self, **changes):
        return {"supplierId": "SUP-TECHL", "title": "부팅 인식 불량 통보 <script>", "description": "확인된 eMMC 현상", "department": "품질혁신팀", "owner": "김성중", "site": "TechL Vina", "occurredAt": "2026-10-02T09:30", "dueDate": "2026-10-05", "requestedAction": "초동 봉쇄 및 원본 분석 자료 회신", "severity": "Unknown", "product": "eMMC", "partNumber": "KEEP-PN", "lotNo": "KEEP-LOT", "inputQty": None, "defectQty": None, "files": [], **changes}

    def evidence_file(self, data=b"measured original"):
        return {"filename": "실측 자료.txt", "dataUrl": "data:text/plain;base64," + base64.b64encode(data).decode()}

    def create_notice(self, **changes):
        status, _, result = self.request("POST", self.route, self.notice_payload(**changes), self.secure)
        self.assertEqual(status, 201, result)
        return result["record"]

    def update_notice(self, record, action="note", headers=None, **changes):
        return self.request("POST", self.route+"/"+record["ticketId"], {"action": action, "comment": "실제 담당자 확인", "expectedRevision": record["revision"], **changes}, headers or self.secure)

    def changed(self, record, action, headers=None, **changes):
        status, _, result = self.update_notice(record, action, headers, **changes)
        self.assertEqual(status, 200, result)
        return result["record"]

    def test_registration_real_author_canonical_recipient_separate_state(self):
        record = self.create_notice(status="Closed", createdBy={"name":"가짜"}, supplier={"email":"wrong@example.invalid"}, linkedCaseId="CASE-TEST")
        self.assertEqual(record["status"], "Draft")
        self.assertEqual(record["createdBy"]["username"], "sjkim")
        self.assertEqual(record["supplier"]["email"], "thkwon@techl.co.kr")
        self.assertIsNone(record["inputQty"])
        self.assertEqual(record["partNumber"], "KEEP-PN")
        other = self.login("jhpark")
        status, _, result = self.request("GET", self.route, headers=other)
        self.assertEqual(status, 200); self.assertEqual(len(result["items"]), 1)
        self.assertEqual(self.store.get_state(), self.initial_state)
        with self.store._connect() as db:
            self.assertEqual(db.execute("SELECT count(*) FROM internal_quality_records").fetchone()[0], 0)
            self.assertEqual(db.execute("SELECT count(*) FROM audit_logs WHERE action='SUPPLIER_NOTICE_CREATED'").fetchone()[0], 1)

    def test_auth_csrf_writer_and_supplier_creation_blocked(self):
        self.assertEqual(self.request("GET", self.route)[0], 401)
        self.assertEqual(self.request("POST", self.route, self.notice_payload(), {"Cookie":self.secure["Cookie"]})[0], 403)
        for username in ["thkwon","yspark","sangwook.ki","ojs"]:
            identity=self.login(username)
            self.assertEqual(self.request("POST", self.route, self.notice_payload(), identity)[0], 403)
        record=self.create_notice()
        self.assertEqual(self.update_notice(record, "publish", self.login("jhpark"))[0], 403)

    def test_all_four_recipients_scope_drafts_and_originals(self):
        mapping={"SUP-TECHL":"thkwon","SUP-WINPAC":"yspark","SUP-SSPC":"sangwook.ki","SUP-CTST":"ojs"}
        records={}
        for sid,username in mapping.items():
            r=self.create_notice(supplierId=sid,files=[self.evidence_file()]);identity=self.login(username)
            self.assertEqual(self.request("GET", self.route+"/"+r["ticketId"],headers=identity)[0],404)
            self.assertEqual(self.request("GET", self.route,headers=identity)[2]["items"],[])
            records[sid]=self.changed(r,"publish")
        for sid,username in mapping.items():
            identity=self.login(username);r=records[sid]
            status,_,result=self.request("GET", self.route,headers=identity)
            self.assertEqual(status,200);self.assertEqual([x["ticketId"] for x in result["items"]],[r["ticketId"]])
            status,headers,data=self.request("GET", self.route+"/"+r["ticketId"]+"/files/"+r["files"][0]["id"],headers=identity)
            self.assertEqual(status,200);self.assertEqual(data,b"measured original");self.assertEqual(headers["X-Evidence-SHA256"],r["files"][0]["sha256"])
            different=next(v for k,v in records.items() if k!=sid)
            for suffix in ["","/files/"+different["files"][0]["id"]]:
                self.assertEqual(self.request("GET",self.route+"/"+different["ticketId"]+suffix,headers=identity)[0],404)
            self.assertEqual(self.update_notice(different,"reply",identity,responseSummary="他社不可")[0],404)

    def test_human_reply_review_evidence_close_and_reopen(self):
        r=self.changed(self.create_notice(),"publish");identity=self.login("thkwon")
        self.assertEqual(self.update_notice(r,"close",identity,validationResult="가짜 종결")[0],403)
        r=self.changed(r,"reply",identity,responseSummary="봉쇄 시행 자료 검토 요청",rootCause="")
        self.assertEqual(r["status"],"Responded");self.assertEqual(r["responses"][0]["recordedBy"]["username"],"thkwon")
        self.assertEqual(r["responses"][0]["rootCause"],"")
        self.assertEqual(self.update_notice(r,"review",self.login("jhpark"))[0],403)
        r=self.changed(r,"review")
        self.assertEqual(self.update_notice(r,"close")[0],400)
        self.assertEqual(self.update_notice(r,"close",validationResult="검토 결과 확인")[0],400)
        r=self.changed(r,"close",validationResult="실측 원본 대조 확인",files=[self.evidence_file()])
        self.assertEqual(r["closedBy"]["username"],"sjkim");self.assertEqual(r["status"],"Closed")
        self.assertEqual(self.update_notice(r,"note",validationResult="종결 후 덮어쓰기")[0],409)
        r=self.changed(r,"reopen")
        self.assertEqual(r["validationResult"],"");self.assertEqual(r["status"],"UnderReview")
        self.assertEqual(self.update_notice(r,"reply",identity,responseSummary="검토 도중 교체")[0],409)
        self.assertEqual(self.store.get_state(),self.initial_state)

    def test_revision_request_reply_preserves_response_history(self):
        r=self.changed(self.create_notice(),"publish");identity=self.login("thkwon")
        r=self.changed(r,"reply",identity,responseSummary="1차 회신")
        r=self.changed(r,"review");r=self.changed(r,"requestRevision",comment="측정 원본 추가 요청")
        r=self.changed(r,"reply",identity,responseSummary="2차 회신",files=[self.evidence_file()])
        self.assertEqual(len(r["responses"]),2);self.assertEqual(r["responses"][0]["responseSummary"],"1차 회신")
        self.assertEqual(r["files"][0]["phase"],"Response")
        self.assertEqual(r["status"],"Responded")

    def test_manual_response_is_not_impersonated(self):
        r=self.changed(self.create_notice(),"publish")
        self.assertEqual(self.update_notice(r,"reply",responseSummary="사내 회신 위장")[0],403)
        self.assertEqual(self.update_notice(r,"recordReply",responseSummary="메일 수신",responseSource="Email")[0],400)
        self.assertEqual(self.update_notice(r,"recordReply",responseSummary="메일 수신",responseSource="Portal",responseReceivedAt="2026-10-02T11:30")[0],400)
        r=self.changed(r,"recordReply",responseSummary="원본 메일 수신",responseSource="Email",responseReceivedAt="2026-10-02T11:30",files=[self.evidence_file()])
        reply=r["responses"][0];self.assertEqual(reply["source"],"Email");self.assertEqual(reply["recordedBy"]["username"],"sjkim")
        self.assertEqual(reply["receivedAt"],"2026-10-02T11:30")
        self.assertEqual(self.update_notice(r,"recordReply",self.login("thkwon"),responseSummary="사내 회신 위장")[0],403)

    def test_edit_only_before_publication_and_conflicts_atomic(self):
        r=self.create_notice();old=r
        r=self.changed(r,"edit",**self.notice_payload(supplierId="SUP-CTST",title="수정한 통보",comment="대상 업체 정정"))
        self.assertEqual(r["supplier"]["username"],"ojs")
        self.assertEqual(self.update_notice(old,files=[self.evidence_file()])[0],409)
        self.assertEqual(self.update_notice(r,expectedRevision=True)[0],409)
        with self.store._connect() as db:self.assertEqual(db.execute('SELECT count(*) FROM supplier_notice_files').fetchone()[0],0)
        r=self.changed(r,"publish")
        self.assertEqual(self.update_notice(r,"edit",**self.notice_payload(supplierId="SUP-TECHL"))[0],409)
        self.assertEqual(self.request('GET',self.route+'/'+r['ticketId'],headers=self.secure)[2]['record']['supplier']['id'],'SUP-CTST')

    def test_malformed_inputs_files_and_case_reference(self):
        for changed in [{"supplierId":"UNREGISTERED"},{"dueDate":"2026-02-30"},{"occurredAt":"wrong"},{"site":"RAMOS 오창"},{"inputQty":1,"defectQty":2},{"inputQty":-1},{"inputQty":True},{"inputQty":1.5},{"requestedAction":""},{"linkedCaseId":"MISSING"},{"files":[{"filename":"../bad.txt","dataUrl":"data:text/plain;base64,YQ=="}]},{"files":[{"filename":"bad.exe","dataUrl":"data:text/plain;base64,YQ=="}]},{"files":[{"filename":"bad.txt","dataUrl":"data:text/plain;base64,@@@@"}]}]:
            with self.subTest(changed=changed):self.assertIn(self.request('POST',self.route,self.notice_payload(**changed),self.secure)[0],[400,404])
        self.assertEqual(self.request('GET',self.route,headers=self.secure)[2]['items'],[])
        with self.store._connect() as db:self.assertEqual(db.execute('SELECT count(*) FROM supplier_notice_files').fetchone()[0],0)

