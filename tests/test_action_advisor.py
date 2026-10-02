"""D5 corrective-action advice: only confirmed causes are used, weak and missing actions are flagged by the server. AI calls are mocked."""
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

import action_advisor
import portal_server
from qms_backend import QMSStore


def confirmed(statement, **extra):
    return {"statement": statement, "evidence": "EVD-1", "validationMethod": "재현 시험", "status": "Confirmed", **extra}


CASE = {"id": "CASE-A", "status": "In Progress", "customer": "검증고객", "product": "eMMC 64GB", "lotNumber": "LOT-9", "claimTitle": "부팅 불량",
        "d4": {"rootCauses": {"Occurrence": confirmed("리플로우 온도 상한 초과"), "Escape": confirmed("부팅 시험 미포함"),
                              "System": {"statement": "후보 원인 문장", "status": "Candidate"}},
               "selectedTools": [{"id": "reproduction", "finding": "확인된 재현 결과", "verified": True}, {"id": "fishbone", "finding": "미확인 결과", "verified": False}]},
        "d5": {"candidates": [{"title": "이미 있는 대책"}]}}
REPLY = {
    "actions": [
        {"causeType": "Occurrence", "title": "리플로우 프로파일 상한 관리", "mechanism": "온도 상한을 설비에서 막는다", "strength": "prevent", "changeSite": "TechL",
         "fourM": ["Machine", "Method", "Magic"], "pcnLikely": "yes", "pcnReason": "공정 조건 변경", "verificationPlan": "재현 조건에서 비교 시험"},
        {"causeType": "Occurrence", "title": "작업자 교육", "strength": "administrative"},
        {"causeType": "Occurrence", "title": "세 번째"}, {"causeType": "Occurrence", "title": "네 번째는 버림"},
        {"causeType": "Escape", "title": "부팅 시험 추가 교육", "strength": "administrative", "changeSite": "Mars"},
        {"causeType": "System", "title": "확정되지 않은 원인에 대한 대책"},
        {"causeType": "Occurrence", "title": ""},
    ],
    "notes": ["외주사 설비 사양 확인", ""],
}


class ParseActionAdviceTests(unittest.TestCase):
    def test_only_confirmed_causes_and_validated_values_are_kept(self):
        advice = action_advisor.parse_advice(json.dumps(REPLY, ensure_ascii=False), CASE)
        self.assertEqual([(a["causeType"], a["title"]) for a in advice["actions"]],
                         [("Occurrence", "리플로우 프로파일 상한 관리"), ("Occurrence", "작업자 교육"), ("Occurrence", "세 번째"), ("Escape", "부팅 시험 추가 교육")])
        first = advice["actions"][0]
        self.assertEqual((first["strengthLabel"], first["changeSiteLabel"], first["fourM"], first["pcnLikely"]), ("실수 방지", "TechL(SMT 모듈 조립)", ["Machine", "Method"], "yes"))
        escape = advice["actions"][3]
        self.assertEqual((escape["changeSite"], escape["pcnLikely"]), ("UNKNOWN", "unknown"))
        # A missing strength is treated as the weakest, never the strongest.
        self.assertEqual(advice["actions"][2]["strength"], "administrative")
        self.assertEqual(advice["causes"], {"Occurrence": "발생원인", "Escape": "유출원인"})
        self.assertEqual(advice["pcnActions"], ["A1"])
        self.assertEqual(advice["weakWarnings"], ["유출원인 대책 후보가 모두 교육·표준 수준입니다. 이것만으로는 재발할 수 있습니다."])
        self.assertEqual(advice["gaps"], [])
        self.assertEqual(advice["notes"], ["외주사 설비 사양 확인"])
        for action in advice["actions"]:
            self.assertFalse({"owner", "due", "evidence", "selected", "sampleSize"} & set(action))

    def test_a_confirmed_cause_without_actions_is_reported(self):
        reply = {"actions": [{"causeType": "Occurrence", "title": "설비 인터락", "strength": "eliminate"}]}
        advice = action_advisor.parse_advice(json.dumps(reply, ensure_ascii=False), CASE)
        self.assertEqual(advice["gaps"], ["유출원인에 대한 대책 후보가 없습니다."])
        for text in ("대책을 제안할 수 없습니다", json.dumps({"actions": [{"causeType": "System", "title": "x"}]})):
            with self.assertRaises(ValueError):
                action_advisor.parse_advice(text, CASE)

    def test_prompt_carries_only_confirmed_causes_and_checked_results(self):
        prompt = action_advisor.build_prompt(CASE, [{"caseId": "OLD-1", "claimTitle": "유사", "countermeasures": [{"title": "과거 선정 대책", "selected": True}, {"title": "과거 미선정", "selected": False}]}])
        for expected in ("리플로우 온도 상한 초과", "부팅 시험 미포함", "확인된 재현 결과", "이미 있는 대책", "과거 선정 대책", "Occurrence(발생원인)"):
            self.assertIn(expected, prompt)
        for unexpected in ("후보 원인 문장", "미확인 결과", "과거 미선정", "System(시스템원인)"):
            self.assertNotIn(unexpected, prompt)


class ActionAdviceHttpTests(unittest.TestCase):
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
        no_cause = {"id": "CASE-NOCAUSE", "status": "In Progress", "claimTitle": "부팅 불량", "d4": {"rootCauses": {"Occurrence": {"statement": "후보", "status": "Supported"}}}}
        status, _, result = self.request("POST", "/__api__/qms/state", {"state": {"intakeQueue": [], "cases": [CASE, no_cause]}, "expectedRevision": 0}, self.internal)
        self.assertEqual(status, 200, result)

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
        status = response.status; conn.close()
        return status, None, result

    def login(self, username):
        conn = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=8)
        conn.request("POST", "/__api__/auth/login", json.dumps({"username": username, "password": "1"}), {"Origin": self.origin, "Content-Type": "application/json"})
        response = conn.getresponse(); result = json.loads(response.read()); cookie = response.getheader("Set-Cookie"); conn.close()
        return {"Cookie": cookie.split(";", 1)[0], "X-QMS-CSRF": result["csrfToken"]}

    def advice(self, case_id="CASE-A", headers=None):
        return self.request("POST", "/__api__/qms/ai/d5-action-advice", {"caseId": case_id}, headers or self.internal)

    def test_advice_for_confirmed_causes_is_returned_and_audited(self):
        ok = {"success": True, "engine": "gemini", "model": "test-model", "text": json.dumps(REPLY, ensure_ascii=False)}
        with patch.object(portal_server, "call_gemini", return_value=ok) as gemini, patch.object(portal_server, "call_groq") as groq:
            status, _, result = self.advice()
        self.assertEqual(status, 200, result)
        advice = result["advice"]
        self.assertEqual((advice["provider"], len(advice["actions"]), advice["guardrails"]["autoSelect"]), ("gemini", 4, False))
        groq.assert_not_called()
        self.assertIn("리플로우 온도 상한 초과", gemini.call_args.args[0])
        self.assertIn("영구 시정조치", gemini.call_args.args[1])
        self.assertNotIn("actionAdvice", json.dumps(self.store.get_state()["state"]))

    def test_no_confirmed_cause_means_no_ai_call(self):
        with patch.object(portal_server, "call_gemini") as gemini, patch.object(portal_server, "call_groq") as groq:
            status, _, result = self.advice("CASE-NOCAUSE")
            self.assertEqual((status, result["code"]), (409, "ACTION_ADVICE_NO_ROOT_CAUSE"))
            self.assertEqual(self.advice(headers=self.login("thkwon"))[0], 403)
            self.assertEqual(self.request("POST", "/__api__/qms/ai/d5-action-advice", {"caseId": "CASE-A"})[0], 401)
        gemini.assert_not_called(); groq.assert_not_called()

    def test_unusable_replies_from_both_providers_are_an_error(self):
        bad = {"success": True, "engine": "gemini", "text": json.dumps({"actions": [{"causeType": "System", "title": "x"}]})}
        with patch.object(portal_server, "call_gemini", return_value=bad), patch.object(portal_server, "call_groq", return_value={"success": False, "error": "Groq HTTP 429"}):
            status, _, result = self.advice()
        self.assertEqual((status, result["code"]), (502, "AI_UNAVAILABLE"))


if __name__ == "__main__":
    unittest.main()
