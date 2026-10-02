"""D7 prevention assistant: documents/PFMEA/notify, deployment candidates from records only, lessons and checks. AI calls are mocked."""
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
import prevention_advisor as pa
from qms_backend import QMSStore


def case(**changes):
    base = {"id": "CASE-A", "status": "In Progress", "product": "eMMC 64GB", "partNumber": "PN-64", "customer": "검증고객", "claimTitle": "부팅 불량",
            "team": [{"role": "8D Leader", "name": "김", "dept": "Flash 개발실"}, {"role": "실무", "name": "박", "dept": "품질혁신팀"}],
            "d4": {"rootCauses": {"Occurrence": {"statement": "리플로우 온도 초과", "status": "Confirmed"}, "System": {"statement": "PFMEA 누락", "status": "Confirmed"},
                                  "Escape": {"statement": "후보", "status": "Candidate"}}},
            "d5": {"candidates": [{"id": "A1", "causeType": "Occurrence", "title": "프로파일 상한 관리", "selected": True},
                                  {"id": "A2", "causeType": "System", "title": "변경 사전 승인", "selected": True},
                                  {"id": "A3", "causeType": "Occurrence", "title": "미선정", "selected": False}]},
            "d6": {"implementationDetails": {"productionSite": "TechL"}, "validationTests": [{"actionId": "A1", "testName": "재현", "result": "PASS"}]},
            "d7": {"systemUpdates": [], "horizontalDeployment": []}}
    base.update(changes)
    return base


SYSTEM_REPLY = {
    "documents": [{"actionId": "A1", "docType": "work-standard", "docName": "리플로우 작업표준", "changeContent": "피크 상한 관리 추가"},
                  {"actionId": "A2", "docType": "pfmea", "docName": "PFMEA", "changeContent": "고장모드 추가"},
                  {"actionId": "A3", "docType": "pfmea", "changeContent": "미선정 대책"}, {"actionId": "A1", "docType": "magic", "changeContent": "형식 밖"},
                  {"actionId": "A2", "docType": "pfmea", "changeContent": ""}],
    "pfmea": [{"causeType": "Occurrence", "process": "리플로우", "failureMode": "접합부 크랙", "effect": "부팅 불가", "cause": "온도 초과", "prevention": "상한 인터락", "detection": "부팅 검사", "severity": 9},
              {"causeType": "Escape", "failureMode": "확정 안 된 원인"}],
    "notify": [{"target": "TechL", "reason": "프로파일 변경"}, {"target": "Flash 개발실", "reason": "공유"}, {"target": "가상 부서", "reason": "없는 대상"}],
}


class SystemAdviceTests(unittest.TestCase):
    def test_reply_is_limited_to_selected_actions_confirmed_causes_and_known_targets(self):
        advice = pa.parse_system(json.dumps(SYSTEM_REPLY, ensure_ascii=False), case())
        self.assertEqual([(d["actionId"], d["docTypeLabel"]) for d in advice["documents"]], [("A1", "작업표준서"), ("A2", "PFMEA"), ("A1", "기타 문서")])
        self.assertEqual([r["failureMode"] for r in advice["pfmea"]], ["접합부 크랙"])
        self.assertNotIn("severity", advice["pfmea"][0])
        self.assertEqual([n["target"] for n in advice["notify"]], ["TechL", "Flash 개발실"])
        self.assertEqual(advice["actionsWithoutDocument"], [])
        prompt = pa.build_system_prompt(case())
        self.assertIn("프로파일 상한 관리", prompt)
        self.assertNotIn("미선정", prompt)
        self.assertIn("품질혁신팀", prompt)
        with self.assertRaises(ValueError):
            pa.parse_system(json.dumps({"documents": [{"actionId": "A3", "changeContent": "x"}]}), case())


class DeploymentTests(unittest.TestCase):
    def test_candidates_come_only_from_records(self):
        state = {"productCatalog": [{"id": "P1", "name": "eMMC 128GB", "package": "BGA153", "supplier": "TechL", "processes": "리플로우"}],
                 "cases": [case(), {"id": "OTHER", "product": "DRAM 모듈", "partNumber": "DR-1", "customer": "고객B"}]}
        records = [{"partNumber": "PN-X", "productName": "eMMC 32GB", "supplier": {"name": "WinPAC"}}]
        candidates = pa.deployment_candidates(state, case(), records)
        self.assertEqual([c["key"] for c in candidates], ["P:P1", "C:OTHER", "A:PN-X:WinPAC", "S:SUP-TECHL", "S:SUP-WINPAC", "S:SUP-CTST"])
        reply = {"assessments": [{"key": "P:P1", "actionId": "A1", "risk": "high", "reason": "같은 리플로우 공정", "action": "프로파일 상한 적용"},
                                 {"key": "C:OTHER", "risk": "low", "reason": "다른 공정"}, {"key": "X:invented", "risk": "high", "reason": "지어낸 제품"},
                                 {"key": "S:SUP-CTST", "risk": "maybe", "actionId": "A9"}]}
        advice = pa.parse_deploy(json.dumps(reply, ensure_ascii=False), case(), candidates)
        self.assertEqual([(a["key"], a["risk"]) for a in advice["assessments"]], [("P:P1", "high"), ("S:SUP-CTST", "unknown"), ("C:OTHER", "low")])
        self.assertEqual(advice["assessments"][1]["actionId"], "")
        self.assertIn("eMMC 32GB PN-X", advice["unassessed"])
        self.assertNotIn("invented", json.dumps(advice))


class LessonsAndCheckTests(unittest.TestCase):
    def test_lessons_need_phenomenon_and_lesson(self):
        lessons = pa.parse_lessons(json.dumps({"phenomenon": "부팅 불량", "lesson": "피크 온도 관리", "keywords": ["리플로우", "", "BGA"]}, ensure_ascii=False))
        self.assertEqual(lessons["keywords"], ["리플로우", "BGA"])
        with self.assertRaises(ValueError):
            pa.parse_lessons(json.dumps({"phenomenon": "x"}))

    def test_checks(self):
        items = pa.d7_checks(case())
        texts = " ".join(i["text"] for i in items)
        self.assertIn("'프로파일 상한 관리'에 연결된 표준·문서 개정이 없습니다", texts)
        self.assertIn("수평전개 기록이 없습니다", texts)
        self.assertIn("TechL의 다른 제품", texts)
        self.assertIn("교훈", texts)
        done = case(d7={"systemUpdates": [{"actionId": "A1", "docName": "작업표준", "status": "Completed", "evidence": "개정본", "docNo": "WS-1", "rev": "B"},
                                          {"actionId": "A2", "docName": "PFMEA", "changeContent": "고장모드 추가", "status": "Open"}],
                        "horizontalDeployment": [{"product": "TechL 다른 라인", "status": "Not Applicable", "evidence": "다른 공정 확인"}],
                        "lessonsLearned": {"lesson": "피크 온도 관리"}})
        self.assertEqual([i["level"] for i in pa.d7_checks(done)], ["ok"])
        missing = case(d7={"systemUpdates": [{"actionId": "A1", "docName": "작업표준", "status": "Completed"}, {"actionId": "A2", "docName": "절차서", "status": "Open"}],
                           "horizontalDeployment": [{"product": "TechL 라인", "status": "Not Applicable"}]})
        texts = " ".join(i["text"] for i in pa.d7_checks(missing))
        for expected in ("개정 Evidence가 없습니다", "문서번호 또는 Revision", "PFMEA 또는 Control Plan", "해당 없음으로 했는데 근거가 없습니다"):
            self.assertIn(expected, texts)


class PreventionHttpTests(unittest.TestCase):
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
        state = {"intakeQueue": [], "cases": [case(), {"id": "CASE-NONE", "status": "In Progress"}], "productCatalog": [{"id": "P1", "name": "eMMC 128GB"}]}
        status, result = self.post("/__api__/qms/state", {"state": state, "expectedRevision": 0})
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

    def ai(self, reply):
        return patch.object(portal_server, "call_gemini", return_value={"success": True, "engine": "gemini", "model": "m", "text": json.dumps(reply, ensure_ascii=False)})

    def test_endpoints(self):
        with self.ai(SYSTEM_REPLY):
            status, result = self.post("/__api__/qms/ai/d7-system-advice", {"caseId": "CASE-A"})
        self.assertEqual((status, len(result["advice"]["documents"])), (200, 3))
        with self.ai({"assessments": [{"key": "P:P1", "risk": "high", "actionId": "A1", "reason": "같은 공정"}]}) as gemini:
            status, result = self.post("/__api__/qms/ai/d7-deployment-advice", {"caseId": "CASE-A"})
        self.assertEqual((status, result["advice"]["assessments"][0]["name"]), (200, "eMMC 128GB"))
        # The product list saved in the central state reaches the prompt.
        self.assertIn("eMMC 128GB", gemini.call_args.args[0])
        with self.ai({"phenomenon": "부팅 불량", "lesson": "피크 온도 관리"}):
            status, result = self.post("/__api__/qms/ai/d7-lessons", {"caseId": "CASE-A"})
        self.assertEqual((status, result["lessons"]["lesson"]), (200, "피크 온도 관리"))
        status, result = self.post("/__api__/qms/d7/checks", {"caseId": "CASE-A"})
        self.assertTrue(any(i["level"] == "block" for i in result["items"]))

    def test_no_selected_action_means_no_ai_call(self):
        with patch.object(portal_server, "call_gemini") as gemini:
            for path in ("/__api__/qms/ai/d7-system-advice", "/__api__/qms/ai/d7-deployment-advice", "/__api__/qms/ai/d7-lessons"):
                status, result = self.post(path, {"caseId": "CASE-NONE"})
                self.assertEqual(status, 409, path)
            self.assertEqual(self.post("/__api__/qms/ai/d7-system-advice", {"caseId": "CASE-A"}, headers=self.login("thkwon"))[0], 403)
        gemini.assert_not_called()


if __name__ == "__main__":
    unittest.main()
