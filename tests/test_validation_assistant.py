"""D6 validation assistant: formulas, AI test plans, report reading and the rule checks. AI calls are mocked."""
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

import portal_server
import validation_advisor as va
import validation_stats as vs
from qms_backend import QMSApiError, QMSStore

TEMPLATE = {"id": "TPL-1", "name": "신뢰성 시험 성적서", "issuer": "CTST", "description": "2쪽 결과표",
            "fields": [{"key": "sampleSize", "label": "시료 수", "hint": "결과표 투입 수량"}, {"key": "failQty", "label": "불량 수", "hint": ""},
                       {"key": "lot", "label": "시험 Lot", "hint": ""}, {"key": "testDate", "label": "시험일", "hint": ""}]}


def case(**changes):
    base = {"id": "CASE-A", "status": "In Progress", "product": "eMMC", "claimTitle": "부팅 불량", "defectQty": 3, "inspectQty": 1000,
            "d4": {"rootCauses": {"Occurrence": {"statement": "리플로우 온도 초과", "status": "Confirmed", "validationMethod": "재현 시험"},
                                  "Escape": {"statement": "후보 원인", "status": "Candidate"}}},
            "d5": {"candidates": [{"id": "A1", "causeType": "Occurrence", "title": "프로파일 상한 관리", "selected": True, "verificationPlan": "재현 비교"},
                                  {"id": "A2", "causeType": "Escape", "title": "부팅 검사 추가", "selected": True},
                                  {"id": "A3", "causeType": "Occurrence", "title": "미선정 대책", "selected": False}]},
            "d6": {"validationTests": [{"id": "T1", "actionId": "A1", "testName": "재현 시험", "condition": "피크 상한", "plannedSampleSize": 767, "allowedFailures": 0}],
                   "implementationDetails": {"startDate": "2026-10-10", "appliedLot": "LOT-NEW"}, "containmentRelease": {}, "beforeAfter": {}}}
    base.update(changes)
    return base


class StatisticsTests(unittest.TestCase):
    def test_sample_sizes(self):
        self.assertEqual(vs.required_sample_size(0.003, 0.9), 767)
        self.assertEqual(vs.required_sample_size(0.05, 0.9), 45)
        n = vs.required_sample_size(0.003, 0.9, 1)
        # The smallest n whose tail meets the confidence, and n-1 does not.
        self.assertLessEqual(vs.binom_cdf(1, n, 0.003), 0.1)
        self.assertGreater(vs.binom_cdf(1, n - 1, 0.003), 0.1)
        with self.assertRaises(ValueError):
            vs.required_sample_size(0, 0.9)

    def test_comparison_verdicts(self):
        self.assertEqual(vs.compare_rates(3, 1000, 0, 800)["verdict"], "improved")
        self.assertEqual(vs.compare_rates(3, 1000, 0, 200)["verdict"], "inconclusive")
        self.assertEqual(vs.compare_rates(3, 1000, 3, 1000)["verdict"], "not_improved")
        weak = vs.compare_rates(3, 1000, 0, 800)
        # The before data holds only three defects, which the two-sample note says.
        self.assertIn("우연일 가능성", weak["twoSample"])
        self.assertEqual(vs.compare_rates(3, 1000, 0, 800, target_rate=0.001)["verdict"], "inconclusive")
        with self.assertRaises(ValueError):
            vs.compare_rates(5, 4, 0, 10)
        with self.assertRaises(ValueError):
            vs.compare_rates(0, 1000, 0, 800)


class PlanAndReportTests(unittest.TestCase):
    def test_plans_follow_selected_actions_and_carry_calculated_sizes(self):
        reply = {"plans": [{"actionId": "A1", "method": "reproduction", "testName": "피크 상한 재현", "condition": "피크 상한", "acceptanceCriteria": "부팅 불가 0"},
                           {"actionId": "A2", "method": "seeded-defect", "testName": "불량 시료 투입"},
                           {"actionId": "A3", "method": "reproduction", "testName": "미선정"}, {"actionId": "A1", "testName": "중복"}, {"actionId": "ZZ", "testName": "없는 대책"}]}
        advice = va.parse_plan(json.dumps(reply, ensure_ascii=False), case())
        self.assertEqual([p["actionId"] for p in advice["plans"]], ["A1", "A2"])
        self.assertEqual(advice["plans"][0]["sampleSuggestion"]["sampleSize"], 767)
        self.assertEqual(advice["plans"][1]["sampleSuggestion"]["sampleSize"], 45)
        partial = va.parse_plan(json.dumps({"plans": [reply["plans"][1]]}), case())
        self.assertEqual(len(partial["actionsWithoutPlan"]), 1)
        prompt = va.build_plan_prompt(case())
        self.assertIn("프로파일 상한 관리", prompt)
        self.assertNotIn("미선정 대책", prompt)
        self.assertNotIn("후보 원인", prompt)

    def test_report_values_are_checked_by_rules(self):
        test = case()["d6"]["validationTests"][0]
        reply = {"values": {"sampleSize": {"value": "800 ea", "source": "2쪽 결과표"}, "failQty": {"value": "0", "source": "2쪽"},
                            "lot": {"value": "LOT-OLD", "source": "1쪽"}, "testDate": {"value": "2026.10.05", "source": "1쪽"}, "unknown": {"value": "x"}},
                 "sameTest": "yes"}
        reading = va.parse_report(json.dumps(reply, ensure_ascii=False), va.clean_template(TEMPLATE), test, case())
        self.assertEqual((reading["sampleSize"], reading["failQty"], reading["testDate"]), (800, 0, "2026-10-05"))
        self.assertEqual(reading["proposal"]["result"], "PASS")
        self.assertTrue(any("적용일" in m for m in reading["mismatches"]))
        self.assertTrue(any("LOT-OLD" in m for m in reading["mismatches"]))
        self.assertNotIn("unknown", reading["values"])
        short = va.parse_report(json.dumps({"values": {"sampleSize": "300", "failQty": "0"}}), va.clean_template(TEMPLATE), test, case())
        self.assertEqual(short["proposal"]["result"], "UNKNOWN")
        failed = va.parse_report(json.dumps({"values": {"sampleSize": "800", "failQty": "2"}}), va.clean_template(TEMPLATE), test, case())
        self.assertEqual(failed["proposal"]["result"], "FAIL")
        missing = va.parse_report(json.dumps({"values": {"sampleSize": "약 800개"}}), va.clean_template(TEMPLATE), test, case())
        self.assertEqual(missing["proposal"]["result"], "UNKNOWN")

    def test_template_needs_sample_and_fail_fields(self):
        with self.assertRaises(QMSApiError):
            va.clean_template({"name": "x", "fields": [{"key": "lot", "label": "Lot"}]})
        with self.assertRaises(QMSApiError):
            va.clean_template({"fields": TEMPLATE["fields"]})

    def test_reports_are_decoded_by_type(self):
        def data_url(content, mime="text/plain"):
            return f"data:{mime};base64," + base64.b64encode(content).decode()
        self.assertIn("시료,800", va.decode_report({"name": "r.csv", "dataUrl": data_url("항목,값\n시료,800".encode("cp949"))})["text"])
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w") as archive:
            archive.writestr("xl/sharedStrings.xml", '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>시료 수</t></si></sst>')
            archive.writestr("xl/worksheets/sheet1.xml", '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1"><v>800</v></c></row></sheetData></worksheet>')
        self.assertIn("A1=시료 수 | B1=800", va.decode_report({"name": "r.xlsx", "dataUrl": data_url(buffer.getvalue())})["text"])
        self.assertIn("attachment", va.decode_report({"name": "r.pdf", "dataUrl": data_url(b"%PDF-1.4")}))
        with self.assertRaises(QMSApiError):
            va.decode_report({"name": "r.pptx", "dataUrl": data_url(b"x")})


class CheckTests(unittest.TestCase):
    def levels(self, c, tickets=()):
        return [(item["level"], item["text"]) for item in va.d6_checks(c, list(tickets))]

    def test_missing_tests_failures_and_release(self):
        c = case()
        c["d6"]["validationTests"][0].update(result="PASS", sampleSize=300, completedAt="2026-10-05")
        c["d6"]["containmentRelease"] = {"decision": "Released"}
        items = self.levels(c)
        texts = " ".join(text for _, text in items)
        self.assertIn(("block", "선정 대책 '부팅 검사 추가'에 연결된 검증 시험이 없습니다."), items)
        self.assertIn("계획(767)보다 적은데 PASS", texts)
        self.assertIn("대책 적용일", texts)
        self.assertIn("block", [level for level, _ in items])
        self.assertNotIn("ok", [level for level, _ in items])

    def test_pcn_before_customer_approval_blocks(self):
        c = case(d5={**case()["d5"], "pcnEcn": {"pcnRequired": True, "customerApprovalStatus": "승인 대기"}})
        texts = [text for level, text in self.levels(c) if level == "block"]
        self.assertTrue(any("고객 PCN 승인" in text for text in texts))
        c["d5"]["pcnEcn"]["customerApprovalStatus"] = "고객 승인 완료"
        texts = [text for level, text in self.levels(c, [{"ticketType": "PCN", "status": "Approved"}]) if level == "block"]
        self.assertFalse(any("고객 PCN 승인" in text for text in texts))

    def test_clean_case_passes(self):
        c = case()
        c["d5"]["candidates"] = c["d5"]["candidates"][:1]
        c["d6"]["validationTests"][0].update(result="PASS", sampleSize=800, failQty=0, completedAt="2026-10-12")
        c["d6"]["containmentRelease"] = {"decision": "Released"}
        self.assertEqual([level for level, _ in self.levels(c)], ["ok"])


class ValidationHttpTests(unittest.TestCase):
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
        status, result = self.post("/__api__/qms/state", {"state": {"intakeQueue": [], "cases": [case(), {"id": "CASE-NONE", "status": "In Progress"}]}, "expectedRevision": 0})
        self.assertEqual(status, 200, result)

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

    def test_statistics_endpoint(self):
        status, result = self.post("/__api__/qms/d6/statistics", {"kind": "sampleSize", "targetPpm": 3000, "confidence": 0.9, "allowedFailures": 0})
        self.assertEqual((status, result["result"]["sampleSize"]), (200, 767))
        status, result = self.post("/__api__/qms/d6/statistics", {"kind": "compare", "before": {"fail": 3, "n": 1000}, "after": {"fail": 0, "n": 800}, "confidence": 0.9})
        self.assertEqual(result["result"]["verdict"], "improved")
        self.assertEqual(self.post("/__api__/qms/d6/statistics", {"kind": "compare", "before": {"fail": 5, "n": 4}, "after": {"fail": 0, "n": 1}})[0], 400)
        self.assertEqual(self.post("/__api__/qms/d6/statistics", {"kind": "sampleSize", "targetPpm": 3000}, headers={})[0], 401)

    def test_plan_endpoint_and_no_action(self):
        reply = {"plans": [{"actionId": "A1", "method": "reproduction", "testName": "피크 상한 재현"}]}
        ok = {"success": True, "engine": "gemini", "model": "m", "text": json.dumps(reply, ensure_ascii=False)}
        with patch.object(portal_server, "call_gemini", return_value=ok):
            status, result = self.post("/__api__/qms/ai/d6-test-plan", {"caseId": "CASE-A"})
        self.assertEqual((status, result["plan"]["plans"][0]["sampleSuggestion"]["sampleSize"]), (200, 767))
        with patch.object(portal_server, "call_gemini") as gemini:
            status, result = self.post("/__api__/qms/ai/d6-test-plan", {"caseId": "CASE-NONE"})
        self.assertEqual((status, result["code"]), (409, "VALIDATION_PLAN_NO_ACTION"))
        gemini.assert_not_called()

    def test_reading_a_pdf_uses_gemini_with_the_file(self):
        reply = {"values": {"sampleSize": {"value": "800", "source": "2쪽"}, "failQty": {"value": "0", "source": "2쪽"}}, "sameTest": "yes"}
        ok = {"success": True, "engine": "gemini", "model": "m", "text": json.dumps(reply, ensure_ascii=False)}
        file = {"name": "report.pdf", "dataUrl": "data:application/pdf;base64," + base64.b64encode(b"%PDF-1.4 test").decode()}
        with patch.object(portal_server, "call_gemini", return_value=ok) as gemini, patch.object(portal_server, "call_groq") as groq:
            status, result = self.post("/__api__/qms/ai/d6-read-report", {"caseId": "CASE-A", "testId": "T1", "template": TEMPLATE, "file": file})
        self.assertEqual(status, 200, result)
        self.assertEqual((result["reading"]["sampleSize"], result["reading"]["proposal"]["result"]), (800, "PASS"))
        self.assertEqual(gemini.call_args.kwargs["attachments"][0]["name"], "report.pdf")
        groq.assert_not_called()
        status, result = self.post("/__api__/qms/ai/d6-read-report", {"caseId": "CASE-A", "testId": "NOPE", "template": TEMPLATE, "file": file})
        self.assertEqual(result["code"], "VALIDATION_TEST_NOT_FOUND")

    def test_checks_endpoint(self):
        status, result = self.post("/__api__/qms/d6/checks", {"caseId": "CASE-A"})
        self.assertEqual(status, 200)
        self.assertTrue(any(item["level"] == "block" for item in result["items"]))


if __name__ == "__main__":
    unittest.main()
