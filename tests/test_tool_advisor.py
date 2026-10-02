"""D4 quality-tool advice: the AI reply is validated against the catalogue and only the saved Case is read. AI calls are mocked."""
import functools
import http.client
import json
import os
from pathlib import Path
import re
import tempfile
import threading
import unittest
from unittest.mock import patch
from http.server import ThreadingHTTPServer

import portal_server
import tool_advisor
from qms_backend import QMSStore

ROOT = Path(__file__).resolve().parents[1]
REPLY = {
    "profile": {"failureMode": "functional", "pattern": "lot-cluster", "dataScope": "limited", "productionModel": "outsourced", "escapeConcern": "yes"},
    "profileReasons": {"failureMode": "부팅 불량이 기록됨", "pattern": "단일 Lot에서 발생", "dataScope": "첨부 자료가 고객 메일뿐", "productionModel": "", "escapeConcern": "출하 검사를 통과함"},
    "tools": [
        {"id": "timeline", "why": "발생 일시 확인", "question": "언제부터 발생했는지 확인", "dataNeeded": "입출고 일시", "dataOwner": "물류", "readiness": "ready", "nextIf": "변경점이 보이면 change-point"},
        {"id": "genealogy", "why": "단일 Lot 집중", "question": "공통 자재 여부를 가린다", "dataNeeded": "외주 Trace", "dataOwner": "외주사", "readiness": "need-data", "nextIf": ""},
        {"id": "made-up-tool", "why": "없는 도구"},
        {"id": "timeline", "why": "중복"},
        {"id": "process-flow"}, {"id": "change-point"}, {"id": "fishbone"},
        {"id": "fta"}, {"id": "cross-swap"}, {"id": "reproduction"}, {"id": "physical-fa"}, {"id": "msa"},
    ],
    "excluded": [{"id": "spc", "reason": "연속 측정 원본이 없음"}, {"id": "genealogy", "reason": "선택된 도구"}, {"id": "nope", "reason": "없는 도구"}],
    "openQuestions": ["불량 시료를 회수했는지", ""],
}


class ParseAdviceTests(unittest.TestCase):
    def test_reply_is_reduced_to_the_catalogue(self):
        advice = tool_advisor.parse_advice("```json\n" + json.dumps(REPLY, ensure_ascii=False) + "\n```")
        ids = [tool["id"] for tool in advice["tools"]]
        self.assertEqual(ids, ["timeline", "genealogy", "process-flow", "change-point", "fishbone", "fta", "cross-swap", "reproduction", "five-why"])
        self.assertEqual([tool["order"] for tool in advice["tools"]], list(range(1, 10)))
        # At most four tools beyond the required five; physical-fa and msa were over the limit.
        self.assertEqual(sum(1 for tool in advice["tools"] if not tool["core"]), 4)
        # A required tool the model left out is listed without an AI explanation.
        five_why = advice["tools"][-1]
        self.assertEqual((five_why["source"], five_why["why"], five_why["core"]), ("rule", "", True))
        self.assertEqual(advice["profileLabels"]["pattern"], "특정 LOT 집중")
        self.assertEqual([item["id"] for item in advice["excluded"]], ["spc"])
        self.assertEqual(advice["openQuestions"], ["불량 시료를 회수했는지"])

    def test_codes_in_the_model_text_are_shown_as_names(self):
        reply = {"profile": {"pattern": "single"}, "profileReasons": {"pattern": "3건이라 single로 분류, escapeConcern 미확정"},
                 "tools": [{"id": "timeline", "nextIf": "결과에 따라 process-flow 또는 physical-fa로 연계"}]}
        advice = tool_advisor.parse_advice(json.dumps(reply, ensure_ascii=False))
        self.assertEqual(advice["profileReasons"]["pattern"], "3건이라 단발로 분류, 검사 유출 의심 미확정")
        self.assertEqual(advice["tools"][0]["nextIf"], "결과에 따라 Process Flow / SIPOC 또는 Physical FA Tree로 연계")

    def test_unknown_profile_values_fall_back_and_bad_replies_are_refused(self):
        advice = tool_advisor.parse_advice(json.dumps({"profile": {"failureMode": "mystery"}, "tools": [{"id": "timeline", "readiness": "maybe"}]}))
        self.assertEqual(advice["profile"], tool_advisor.PROFILE_DEFAULT)
        self.assertEqual(advice["tools"][0]["readiness"], "need-data")
        for text in ("죄송합니다. 추천할 수 없습니다.", json.dumps({"tools": [{"id": "nope"}]}), "{not json}"):
            with self.assertRaises(ValueError):
                tool_advisor.parse_advice(text)

    def test_catalogue_matches_the_screen(self):
        source = (ROOT / "js/views/workspace.js").read_text(encoding="utf-8")
        screen_ids = re.findall(r"\{id:'([a-z-]+)',category:", source)
        self.assertEqual(screen_ids, tool_advisor.TOOL_IDS)
        core = re.search(r"D4_CORE_TOOL_IDS\s*=\s*\[([^\]]+)\]", "".join(path.read_text(encoding="utf-8") for path in (ROOT / "js").rglob("*.js")))
        self.assertEqual(re.findall(r"'([a-z-]+)'", core.group(1)), tool_advisor.CORE_TOOL_IDS)
        for key, options in tool_advisor.PROFILE.items():
            name = "d4" + key[0].upper() + key[1:]
            block = source[source.index(f'name="{name}"'):]
            self.assertEqual(re.findall(r'<option value="([a-z-]+)"', block[:block.index("</select>")]), list(options))

    def test_prompt_carries_only_recorded_and_verified_facts(self):
        case = {"id": "CASE-A", "customer": "검증고객", "claimTitle": "부팅 불량", "lotNumber": "LOT-9", "d4": {"rootCauses": {"Occurrence": {"statement": "비밀 원인 문장"}}},
                "d2": {"problemStatement": "문제 정의", "isIsNot": [{"factor": "Lot", "is": "LOT-9", "isNot": "LOT-8", "difference": "확인된 차이", "verificationStatus": "Verified"},
                                                              {"factor": "설비", "is": "A", "isNot": "B", "difference": "미확인 차이", "verificationStatus": "Required"}]},
                "evidenceList": [{"file": "고객메일.eml", "type": "Customer original", "linkedStages": ["D2"]}]}
        prompt = tool_advisor.build_prompt(case)
        for expected in ("검증고객", "부팅 불량", "LOT-9", "확인된 차이", "고객메일.eml", "five-why"):
            self.assertIn(expected, prompt)
        self.assertNotIn("미확인 차이", prompt)
        self.assertNotIn("비밀 원인 문장", prompt)


class ToolAdviceHttpTests(unittest.TestCase):
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
        status, _, result = self.request("POST", "/__api__/qms/state", {"state": {"intakeQueue": [], "cases": [
            {"id": "CASE-A", "status": "In Progress", "customer": "검증고객", "product": "eMMC 64GB", "lotNumber": "LOT-9", "claimTitle": "부팅 불량"},
            {"id": "CASE-EMPTY", "status": "In Progress"}]}, "expectedRevision": 0, "reason": "seed"}, self.internal)
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
        status, info = response.status, dict(response.getheaders()); conn.close()
        return status, info, result

    def login(self, username):
        status, headers, result = self.request("POST", "/__api__/auth/login", {"username": username, "password": "1"})
        self.assertEqual(status, 200)
        return {"Cookie": headers["Set-Cookie"].split(";", 1)[0], "X-QMS-CSRF": result["csrfToken"]}

    def advice(self, case_id="CASE-A", headers=None):
        return self.request("POST", "/__api__/qms/ai/d4-tool-advice", {"caseId": case_id}, headers or self.internal)

    def test_advice_comes_from_the_saved_case_and_is_audited(self):
        ok = {"success": True, "engine": "gemini", "model": "test-model", "text": json.dumps(REPLY, ensure_ascii=False)}
        with patch.object(portal_server, "call_gemini", return_value=ok) as gemini, patch.object(portal_server, "call_groq") as groq:
            status, _, result = self.advice()
        self.assertEqual(status, 200, result)
        advice = result["advice"]
        self.assertEqual((advice["caseId"], advice["provider"], advice["model"], advice["caseRevision"]), ("CASE-A", "gemini", "test-model", 1))
        self.assertEqual(advice["guardrails"], {"autoApply": False, "statesRootCause": False, "externalAI": True})
        self.assertEqual(advice["tools"][0]["id"], "timeline")
        groq.assert_not_called()
        prompt = gemini.call_args.args[0]
        self.assertIn("부팅 불량", prompt)
        self.assertIn("근본원인", gemini.call_args.args[1])
        audit = [row for row in self.store.audit_entries(self.store.resolve_session(self.internal["Cookie"].split("=", 1)[1])) if row["action"] == "D4_TOOL_ADVICE_GENERATED"]
        self.assertEqual(len(audit), 1)
        # The advice is not written into the Case by the server.
        self.assertNotIn("toolAdvice", json.dumps(self.store.get_state()["state"]))

    def test_second_provider_is_used_when_the_first_fails_or_replies_with_nonsense(self):
        ok = {"success": True, "engine": "groq", "model": "m", "text": json.dumps(REPLY, ensure_ascii=False)}
        for first in ({"success": False, "error": "Gemini HTTP 503"}, {"success": True, "engine": "gemini", "text": "추천할 수 없습니다"}):
            with patch.object(portal_server, "call_gemini", return_value=first), patch.object(portal_server, "call_groq", return_value=ok):
                status, _, result = self.advice()
            self.assertEqual((status, result["advice"]["provider"]), (200, "groq"))

    def test_no_usable_reply_is_an_error_not_an_invented_recommendation(self):
        failed = {"success": False, "error": "GEMINI_API_KEY is not configured in .env"}
        with patch.object(portal_server, "call_gemini", return_value=failed), patch.object(portal_server, "call_groq", return_value={"success": False, "error": "Groq HTTP 429"}):
            status, _, result = self.advice()
        self.assertEqual((status, result["code"]), (502, "AI_UNAVAILABLE"))
        self.assertIn("Groq HTTP 429", result["error"])

    def test_requires_a_saved_case_with_facts_and_an_internal_account(self):
        with patch.object(portal_server, "call_gemini") as gemini, patch.object(portal_server, "call_groq") as groq:
            self.assertEqual(self.advice("CASE-MISSING")[2]["code"], "CASE_NOT_FOUND")
            self.assertEqual(self.advice("CASE-EMPTY")[2]["code"], "TOOL_ADVICE_NO_FACTS")
            self.assertEqual(self.request("POST", "/__api__/qms/ai/d4-tool-advice", {"caseId": "CASE-A"})[0], 401)
            self.assertEqual(self.advice(headers=self.login("thkwon"))[0], 403)
        gemini.assert_not_called(); groq.assert_not_called()


if __name__ == "__main__":
    unittest.main()
