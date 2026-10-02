"""Isolated HTTP tests: evidence-grounded stage drafts, xlsx report export and the supplier summary."""
import base64
import functools
import http.client
import io
import json
import os
from pathlib import Path
import tempfile
import threading
import unittest
import zipfile
from unittest.mock import patch
from http.server import ThreadingHTTPServer
from xml.dom import minidom
import portal_server
from qms_backend import QMSStore

FORBIDDEN_RESULT_FIELDS = {"sampleSize", "failQty", "result", "completedAt", "status", "evidence", "selected", "checked", "rev", "docNo", "due"}


class StageDraftReportSummaryTests(unittest.TestCase):
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
        self.supplier = self.login("thkwon")
        self.revision = 0

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

    def case(self, **changes):
        base = {"id": "CASE-A", "status": "In Progress", "customer": "검증고객", "product": "eMMC 64GB", "partNumber": "PN-64", "lotNumber": "LOT-9",
                "claimTitle": "부팅 불량", "defectQty": 2, "inspectQty": 100,
                "d2": {"problemWhen": "2026-09-30", "isIsNot": [
                    {"factor": "LOT", "is": "LOT-9", "isNot": "LOT-8", "difference": "외주 라인 교체 후 생산", "verificationStatus": "Verified"},
                    {"factor": "위치", "is": "A", "isNot": "B", "difference": "미확인 차이", "verificationStatus": "Required"}]},
                "d3": {"actions": [{"id": "ICA-01", "status": "Open"}]},
                "d4": {"rootCauses": {
                    "Occurrence": {"statement": "언더필 도포 압력 저하", "status": "Confirmed", "validationMethod": "압력 조건 재현 시험"},
                    "Escape": {"statement": "", "status": "Candidate"},
                    "System": {"statement": "설비 점검 주기 미설정", "status": "Confirmed"}}},
                "d5": {"candidates": [{"id": "PCA-1", "causeType": "Occurrence", "title": "도포 압력 인터락 설치", "owner": "홍길동", "verificationPlan": "인터락 동작 확인", "selected": True}]},
                "evidenceList": [{"id": "EVD-1", "file": "fa.pdf", "linkedStages": ["D4"]}]}
        return {**base, **changes}

    def save(self, *cases):
        status, _, result = self.request("POST", "/__api__/qms/state", {"state": {"cases": list(cases), "intakeQueue": []}, "expectedRevision": self.revision}, self.internal)
        self.assertEqual(status, 200, result)
        self.revision = result["revision"]

    def draft(self, stage, case_id="CASE-A", headers=None):
        status, _, result = self.request("POST", "/__api__/qms/ai/stage-draft", {"caseId": case_id, "stage": stage}, headers or self.internal)
        return status, result

    def test_d4_draft_uses_only_verified_differences_and_states_no_cause(self):
        self.save(self.case())
        status, result = self.draft("D4")
        self.assertEqual(status, 200, result)
        draft = result["draft"]
        self.assertEqual((draft["engine"], draft["guardrails"]["externalAI"], draft["guardrails"]["inventMeasurements"]), ("server-evidence-rules-v1", False, False))
        payload = draft["payload"]
        self.assertEqual([tool["id"] for tool in payload["tools"]], ["timeline", "process-flow", "change-point", "fishbone", "five-why"])
        change_point = next(tool for tool in payload["tools"] if tool["id"] == "change-point")
        self.assertIn("외주 라인 교체 후 생산", change_point["hypothesis"])
        self.assertNotIn("미확인 차이", json.dumps(payload, ensure_ascii=False))
        self.assertIn("EVD-1", change_point["evidenceHint"])
        self.assertEqual({item["type"] for item in payload["causeQuestions"]}, {"Occurrence", "Escape", "System"})
        self.assertNotIn("rootCauses", payload)
        self.assertTrue(any("사실 확인 전" in line for line in payload["missingInformation"]))

    def test_d5_draft_links_confirmed_causes_only(self):
        self.save(self.case())
        payload = self.draft("D5")[1]["draft"]["payload"]
        candidates = payload["groups"]["candidates"]
        self.assertEqual([c["causeType"] for c in candidates], ["System"])
        self.assertIn("설비 점검 주기 미설정", candidates[0]["rationale"])
        self.assertTrue(any("유출원인이 확정되지 않아" in line for line in payload["missingInformation"]))
        for row in candidates:
            self.assertFalse(FORBIDDEN_RESULT_FIELDS & set(row), row)

    def test_d6_and_d7_drafts_follow_selected_actions_without_results(self):
        self.save(self.case())
        d6 = self.draft("D6")[1]["draft"]["payload"]
        tests = d6["groups"]["validationTests"]
        self.assertEqual([(t["actionId"], t["condition"], t["owner"]) for t in tests], [("PCA-1", "인터락 동작 확인", "홍길동")])
        self.assertTrue(any("ICA-01" in line for line in d6["missingInformation"]))
        d7 = self.draft("D7")[1]["draft"]["payload"]
        self.assertEqual([r["actionId"] for r in d7["groups"]["systemUpdates"]], ["PCA-1"])
        self.assertIn("언더필 도포 압력 저하", d7["groups"]["horizontalDeployment"][0]["sameRisk"])
        for group in (tests, d7["groups"]["systemUpdates"], d7["groups"]["horizontalDeployment"]):
            for row in group:
                self.assertFalse(FORBIDDEN_RESULT_FIELDS & set(row), row)
        no_action = self.case(id="CASE-B", d5={"candidates": []})
        self.save(self.case(), no_action)
        empty = self.draft("D6", "CASE-B")[1]["draft"]["payload"]
        self.assertEqual(empty["groups"]["validationTests"], [])
        self.assertTrue(any("선정된 대책이 없어" in line for line in empty["missingInformation"]))

    def test_d8_draft_lists_gaps_and_never_fills_the_checklist(self):
        self.save(self.case())
        payload = self.draft("D8")[1]["draft"]["payload"]
        self.assertEqual(payload["groups"]["checklist"], [])
        missing = " ".join(payload["missingInformation"])
        for expected in ("D1 결재가 완료되지 않았습니다", "D6 검증 시험이 등록되지 않았습니다", "잔여 위험이 기록되지 않았습니다"):
            self.assertIn(expected, missing)

    def test_draft_access_and_input_errors(self):
        self.save(self.case())
        self.assertEqual(self.draft("D4", headers=self.supplier)[0], 403)
        self.assertEqual(self.draft("D3")[0], 400)
        self.assertEqual(self.draft("D4", "UNKNOWN")[0], 404)
        self.assertEqual(self.request("POST", "/__api__/qms/ai/stage-draft", {"caseId": "CASE-A", "stage": "D4"})[0], 401)
        self.assertEqual(self.store.get_state()["revision"], self.revision)

    def test_linked_supplier_ticket_appears_in_draft(self):
        self.save(self.case())
        ticket = self.request("POST", "/__api__/qms/supplier-tickets", {"ticketType": "PCN", "title": "솔더 변경", "description": "변경 설명", "change4M": ["Material"], "files": []}, self.supplier)[2]["record"]
        self.request("POST", f"/__api__/qms/supplier-tickets/{ticket['ticketId']}", {"action": "bind", "caseId": "CASE-A", "expectedRevision": ticket["revision"]}, self.internal)
        payload = self.draft("D4")[1]["draft"]["payload"]
        self.assertTrue(any(ticket["ticketId"] in line for line in payload["confirmedFacts"]))
        self.assertIn(ticket["ticketId"], next(t for t in payload["tools"] if t["id"] == "change-point")["hypothesis"])

    def sheet_text(self, content, index=1):
        with zipfile.ZipFile(io.BytesIO(content)) as z:
            self.assertIsNone(z.testzip())
            names = z.namelist()
            for name in names:
                if name.endswith(".xml") or name.endswith(".rels"):
                    minidom.parseString(z.read(name))
            return names, z.read(f"xl/worksheets/sheet{index}.xml").decode("utf-8")

    def test_report_export_is_a_valid_workbook_that_marks_unapproved_content_as_draft(self):
        self.save(self.case(claimTitle="부팅 불량 <b>&\"따옴표\""))
        status, headers, content = self.request("GET", "/__api__/qms/cases/CASE-A/report.xlsx?gate=gate8D", headers=self.internal)
        self.assertEqual(status, 200)
        self.assertIn("spreadsheetml", headers["Content-Type"])
        self.assertIn("CASE-A_Final_8D_Report.xlsx", headers["Content-Disposition"])
        names, text = self.sheet_text(content)
        self.assertEqual(sum(name.startswith("xl/worksheets/") for name in names), 3)
        for expected in ("DRAFT · 보고서 결재 전", "미결재 · 작성 중인 초안입니다", "도포 압력 인터락 설치", "언더필 도포 압력 저하", "등록된 검증 시험 없음", "부팅 불량 &lt;b&gt;&amp;"):
            self.assertIn(expected, text)
        self.assertNotIn("PASS", text)
        short = self.request("GET", "/__api__/qms/cases/CASE-A/report.xlsx?gate=gate3D", headers=self.internal)[2]
        self.assertNotIn("D5. 영구 시정조치 선정", self.sheet_text(short)[1])
        try:
            import openpyxl
        except ImportError:
            return
        book = openpyxl.load_workbook(io.BytesIO(content))
        self.assertEqual(book.sheetnames, ["8D Report", "Evidence", "결재 이력"])
        self.assertEqual(book["8D Report"]["A1"].value, "Final 8D Report — CASE-A")

    def test_report_export_access(self):
        self.save(self.case())
        route = "/__api__/qms/cases/CASE-A/report.xlsx"
        self.assertEqual(self.request("GET", route)[0], 401)
        self.assertEqual(self.request("GET", route, headers=self.supplier)[0], 403)
        self.assertEqual(self.request("GET", route + "?gate=gate9D", headers=self.internal)[0], 400)
        self.assertEqual(self.request("GET", "/__api__/qms/cases/NONE/report.xlsx", headers=self.internal)[0], 404)

    def test_supplier_summary_counts_come_from_stored_records(self):
        def ticket(payload, headers=None):
            status, _, result = self.request("POST", "/__api__/qms/supplier-tickets", payload, headers or self.supplier)
            self.assertEqual(status, 201, result)
            return result["record"]
        issue = {"ticketType": "Issue", "title": "도포 불량", "description": "발견", "change4M": [], "partNumber": "PN-64", "files": []}
        ticket({**issue, "incident": {"inputQty": 200, "defectQty": 3}})
        ticket({**issue, "incident": {"inputQty": 100, "defectQty": 1}})
        ticket({**issue, "incident": {"inputQty": None, "defectQty": None}})
        pcn = ticket({"ticketType": "PCN", "title": "변경", "description": "설명", "change4M": ["Method"], "files": []})
        self.request("POST", f"/__api__/qms/supplier-tickets/{pcn['ticketId']}", {"action": "review", "decision": "Revision_Requested", "comment": "보완", "expectedRevision": pcn["revision"]}, self.internal)
        status, _, summary = self.request("GET", "/__api__/qms/supplier-summary", headers=self.internal)
        self.assertEqual(status, 200, summary)
        self.assertEqual([s["name"] for s in summary["suppliers"]], ["TechL", "WinPAC", "CTST"])
        techl = summary["suppliers"][0]
        self.assertEqual(techl["tickets"], {"total": 4, "pcn": 1, "issue": 3, "awaitingReview": 3, "awaitingSupplier": 1, "approved": 0, "rejected": 0, "linkedTo8D": 0})
        self.assertEqual(techl["issueQuantities"], {"reportedTickets": 2, "defectQty": 4, "inputQty": 300, "defectRatePct": 1.3333})
        self.assertEqual(len(techl["repeatedParts"][0]["ticketIds"]), 3)
        self.assertIsNone(summary["suppliers"][1]["issueQuantities"]["defectRatePct"])
        self.assertIsNone(techl["notices"]["averageFirstReplyHours"])
        self.assertEqual(len(summary["attention"]), 3)
        self.assertEqual(self.request("GET", "/__api__/qms/supplier-summary", headers=self.supplier)[0], 403)
        self.assertEqual(self.request("GET", "/__api__/qms/supplier-summary")[0], 401)

    def test_evidence_source_note_is_stored(self):
        self.save(self.case())
        payload = {"filename": "외주 성적서.pdf", "dataUrl": "data:application/pdf;base64," + base64.b64encode(b"report").decode(), "type": "User evidence",
                   "linkedStages": ["D4"], "expectedRevision": self.revision, "sourceNote": "외주 접수 SQ-2026-001 첨부"}
        status, _, result = self.request("POST", "/__api__/qms/cases/CASE-A/evidence", payload, self.internal)
        self.assertEqual(status, 201, result)
        self.assertEqual(result["evidence"]["source"], "외주 접수 SQ-2026-001 첨부")
        self.assertEqual(self.request("POST", "/__api__/qms/cases/CASE-A/evidence", {**payload, "expectedRevision": result["revision"], "sourceNote": "x" * 241}, self.internal)[0], 400)


if __name__ == "__main__":
    unittest.main()
