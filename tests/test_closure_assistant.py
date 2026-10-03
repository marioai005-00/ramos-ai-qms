"""D8 closure assistant: readiness rules, lead times, AI review and drafts, post-closure monitoring and its mail. AI and SMTP are mocked."""
from datetime import datetime, timedelta, timezone
import functools
import http.client
import json
import os
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import MagicMock, patch
from http.server import ThreadingHTTPServer

import closure_advisor as ca
import portal_server
from qms_backend import QMSStore

KST = timezone(timedelta(hours=9))
SMTP_ENV = {"QMS_MAIL_PROVIDER": "SMTP", "QMS_EXTERNAL_SEND_ENABLED": "true", "QMS_SMTP_HOST": "smtp.test.invalid", "QMS_SMTP_PORT": "25",
            "QMS_SMTP_SECURITY": "NONE", "QMS_MAIL_FROM": "qms@test.invalid"}


def signed(at):
    return {"status": "Approved", "champion": {"signedAt": at}}


def case(**changes):
    history = {s: signed("2026-10-01T00:00:00Z") for s in ("D1", "D2", "D4", "D6", "D7")}
    history["D3"] = signed("2026-09-30T23:00:00Z")   # 08:00 KST on 10-01: 23 hours after receipt
    history["D5"] = signed("2026-10-20T00:00:00Z")   # 20 days after receipt: 6 days late
    base = {"id": "CASE-A", "status": "In Progress", "customer": "검증고객", "product": "eMMC", "claimTitle": "부팅 불량", "receiptDate": "2026-09-30 09:00",
            "team": [{"role": "8D Leader", "name": "김", "dept": "Flash 개발실", "contact": "hskim@ramostek.com"}],
            "signOffHistory": history,
            "d4": {"rootCauses": {"Occurrence": {"statement": "온도 초과", "status": "Confirmed"}}},
            "d5": {"candidates": [{"id": "A1", "title": "상한 관리", "causeType": "Occurrence", "selected": True}], "pcnEcn": {"pcnRequired": False}},
            "d6": {"validationTests": [{"testName": "재현", "result": "PASS", "actionId": "A1"}], "containmentRelease": {"decision": "Released"},
                   "beforeAfter": {"statistics": {"verdict": "improved", "verdictLabel": "개선 확인"}}},
            "d7": {"systemUpdates": [{"docName": "작업표준", "status": "Completed"}], "horizontalDeployment": [{"product": "다른 라인", "status": "Not Applicable"}],
                   "lessonsLearned": {"lesson": "온도 관리"}},
            "d8": {"checklist": [{"item": f"항목{i}", "evidence": "", "checked": False} for i in range(5)], "closure": {}}}
    base.update(changes)
    return base


class ReadinessTests(unittest.TestCase):
    def test_ready_case_and_customer_dispatch_is_only_information(self):
        result = ca.readiness(case())
        self.assertTrue(result["ready"])
        dispatch = next(i for i in result["items"] if i["area"] == "고객 보고")
        self.assertEqual(dispatch["level"], "info")
        self.assertIn("종결 조건 아님", dispatch["text"])

    def test_blocks(self):
        c = case()
        del c["signOffHistory"]["D6"]
        c["d6"]["validationTests"][0]["result"] = "FAIL"
        c["d6"]["containmentRelease"] = {}
        c["d7"]["systemUpdates"][0]["status"] = "Open"
        blocks = [i["area"] for i in ca.readiness(c)["items"] if i["level"] == "block"]
        self.assertEqual(blocks, ["D1~D7 결재", "D6 검증", "봉쇄 결정", "D7 재발방지"])
        self.assertFalse(ca.readiness(c)["ready"])

    def test_lead_times_against_the_single_rule(self):
        rows = {r["stage"]: r for r in ca.lead_times(case())}
        self.assertEqual((rows["D3"]["status"], rows["D3"]["text"]), ("on_time", "23시간 소요"))
        self.assertEqual(rows["D5"]["status"], "late")
        self.assertEqual(rows["D5"]["text"], "20일 0시간 소요 · 기한 6일 0시간 초과")
        self.assertEqual(rows["D8"]["status"], "overdue" if datetime.now(KST) > datetime(2026, 10, 30, 9, tzinfo=KST) else "open")

    def test_checklist_fill_uses_the_record(self):
        fill = ca.checklist_fill(case())
        self.assertEqual(len(fill), 5)
        self.assertIn("확정 원인: 발생원인", fill[0])
        self.assertIn("검증 시험 1/1건 PASS", fill[1])
        self.assertIn("종결 조건 아님", fill[3])


class ReviewDraftMonitoringTests(unittest.TestCase):
    def test_review_findings_are_validated(self):
        reply = {"findings": [{"stage": "d6", "relatedStage": "D4", "severity": "high", "issue": "검증 조건이 재현 조건과 다름"},
                              {"stage": "D9", "issue": "없는 단계"}, {"stage": "D2", "severity": "odd", "issue": "수량 불일치"}, {"stage": "D3", "issue": ""}],
                 "summary": "대체로 연결됨"}
        review = ca.parse_review(json.dumps(reply, ensure_ascii=False))
        self.assertEqual([(f["stage"], f["severity"]) for f in review["findings"]], [("D6", "high"), ("D2", "medium")])
        self.assertEqual(ca.parse_review(json.dumps({"findings": [], "summary": "문제 없음"}, ensure_ascii=False))["findings"], [])
        with self.assertRaises(ValueError):
            ca.parse_review(json.dumps({"findings": []}))

    def test_draft_and_english_option(self):
        reply = {"remainingRisk": "없음", "customerSummaryKo": "요약", "customerSummaryEn": "Summary", "teamAppreciation": "감사"}
        self.assertEqual(ca.parse_draft(json.dumps(reply, ensure_ascii=False), False)["customerSummaryEn"], "")
        self.assertEqual(ca.parse_draft(json.dumps(reply, ensure_ascii=False), True)["customerSummaryEn"], "Summary")
        with self.assertRaises(ValueError):
            ca.parse_draft(json.dumps({"remainingRisk": "x"}), False)
        self.assertIn("영어 번역", ca.build_draft_prompt(case(), True))

    def test_monitoring_plan_counts_from_closure(self):
        plan = ca.monitoring_plan(case(closedAt="2026-10-25T01:00:00Z"), [90, 30, 30, 60, 0, "x"])
        self.assertEqual((plan["baseDate"], plan["baseIsClosure"]), ("2026-10-25", True))
        self.assertEqual([(i["days"], i["dueDate"]) for i in plan["items"]], [(30, "2026-11-24"), (60, "2026-12-24"), (90, "2027-01-23")])
        self.assertFalse(ca.monitoring_plan(case(), [30])["baseIsClosure"])


class ClosureHttpAndMailTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        root = Path(self.temp.name)
        self.env = patch.dict(os.environ, {"QMS_DATABASE_PATH": str(root / "test.sqlite3"), "QMS_DEMO_PASSWORD": "1"})
        self.env.start()
        for key in list(os.environ):
            if key.startswith(("QMS_SMTP", "QMS_MAIL", "QMS_EXTERNAL_SEND")):
                os.environ.pop(key)
        self.original = portal_server.QMS_STORE
        portal_server.QMS_STORE = self.store = QMSStore(root)
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(portal_server.PortalHandler, directory=str(root)))
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.origin = f"http://127.0.0.1:{self.server.server_port}"
        self.internal = self.login("sjkim")
        yesterday = (datetime.now(KST) - timedelta(days=1)).strftime("%Y-%m-%d")
        tomorrow = (datetime.now(KST) + timedelta(days=1)).strftime("%Y-%m-%d")
        closed = case(status="Closed", postClosureMonitoring={"items": [{"id": "M30", "days": 30, "dueDate": yesterday, "status": "Open"},
                                                                         {"id": "M60", "days": 60, "dueDate": tomorrow, "status": "Open"}]})
        closed["signOffHistory"]["D8"] = signed("2026-10-02T00:00:00Z")
        # Approval claims need matching events, so this fixture is written straight to the store.
        with self.store._connect() as db:
            db.execute("INSERT OR REPLACE INTO state_store(id, revision, state_json, state_hash, updated_at, updated_by) VALUES(1, 1, ?, 'test', ?, NULL)",
                       (json.dumps({"cases": [closed], "intakeQueue": []}, ensure_ascii=False), datetime.now(timezone.utc).isoformat()))

    def tearDown(self):
        self.server.shutdown(); self.server.server_close(); self.thread.join()
        portal_server.QMS_STORE = self.original
        self.env.stop(); self.temp.cleanup()

    def post(self, path, payload, headers=None):
        conn = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=8)
        conn.request("POST", path, json.dumps(payload, ensure_ascii=False).encode(), {"Origin": self.origin, "Content-Type": "application/json", **(self.internal if headers is None else headers)})
        response = conn.getresponse(); raw = response.read(); conn.close()
        return response.status, json.loads(raw) if raw else None

    def login(self, username):
        conn = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=8)
        conn.request("POST", "/__api__/auth/login", json.dumps({"username": username, "password": "1"}), {"Origin": self.origin, "Content-Type": "application/json"})
        response = conn.getresponse(); result = json.loads(response.read()); cookie = response.getheader("Set-Cookie"); conn.close()
        return {"Cookie": cookie.split(";", 1)[0], "X-QMS-CSRF": result["csrfToken"]}

    def test_endpoints(self):
        status, result = self.post("/__api__/qms/d8/readiness", {"caseId": "CASE-A"})
        self.assertEqual((status, result["ready"], len(result["checklistFill"])), (200, True, 5))
        status, result = self.post("/__api__/qms/d8/monitoring-plan", {"caseId": "CASE-A", "days": [30, 90]})
        self.assertEqual([i["days"] for i in result["plan"]["items"]], [30, 90])
        self.assertEqual(self.post("/__api__/qms/d8/monitoring-plan", {"caseId": "CASE-A", "days": [0]})[0], 400)
        reply = {"success": True, "engine": "gemini", "model": "m", "text": json.dumps({"findings": [], "summary": "연결됨"}, ensure_ascii=False)}
        with patch.object(portal_server, "call_gemini", return_value=reply):
            status, result = self.post("/__api__/qms/ai/d8-review", {"caseId": "CASE-A"})
        self.assertEqual((status, result["review"]["summary"]), (200, "연결됨"))
        reply["text"] = json.dumps({"remainingRisk": "낮음", "customerSummaryKo": "요약", "customerSummaryEn": "Summary"}, ensure_ascii=False)
        with patch.object(portal_server, "call_gemini", return_value=reply):
            status, result = self.post("/__api__/qms/ai/d8-draft", {"caseId": "CASE-A", "english": True})
        self.assertEqual(result["draft"]["customerSummaryEn"], "Summary")
        self.assertEqual(self.post("/__api__/qms/d8/readiness", {"caseId": "CASE-A"}, headers=self.login("thkwon"))[0], 403)

    def test_due_monitoring_check_is_mailed_once_to_the_test_recipient(self):
        smtp = MagicMock()
        smtp.return_value.__enter__.return_value = smtp.return_value
        with patch.dict(os.environ, SMTP_ENV), patch("mailer.smtplib.SMTP", smtp):
            self.store.evaluate_sla_escalations(self.store.resolve_session(self.internal["Cookie"].split("=", 1)[1]))
            self.store.evaluate_sla_escalations(self.store.resolve_session(self.internal["Cookie"].split("=", 1)[1]))
        sent = [call.args[0] for call in smtp.return_value.send_message.call_args_list if "재발 확인" in call.args[0]["Subject"]]
        self.assertEqual(len(sent), 1)
        self.assertEqual(sent[0]["To"], "sjkim@ramostek.com")
        self.assertIn("종결 후 30일", sent[0]["Subject"])
        self.assertIn("hskim@ramostek.com", sent[0].get_body(("plain",)).get_content())


if __name__ == "__main__":
    unittest.main()
