"""8D report agent over HTTP: one request → Case chosen → record and evidence read → checks → report file. The external AI is mocked."""
import base64
import functools
import http.client
import io
import json
import os
from pathlib import Path
import tempfile
import threading
import time
import unittest
import zipfile
from unittest.mock import patch
from http.server import ThreadingHTTPServer

import portal_server
import report_agent
from qms_backend import QMSApiError, QMSStore

SIGNED = {"status": "Approved", "drafter": {"name": "김", "signedAt": "2026-10-01T00:10:00Z"}, "leader": {"name": "이", "signedAt": "2026-10-01T00:20:00Z"},
          "champion": {"name": "박", "signedAt": "2026-10-01T00:30:00Z"}}


def case(case_id="CASE-A", customer="검증고객", title="부팅 불량", lot="LOT-0001", **changes):
    base = {"id": case_id, "status": "Closed", "closedAt": "2026-10-01T00:30:00Z", "customer": customer, "product": "eMMC", "partNumber": "PN-1", "lotNumber": lot,
            "claimTitle": title, "defectQty": "3", "inspectQty": "1000", "receiptDate": "2026-09-30 09:00", "currentStage": "D8",
            "team": [{"role": "8D Leader", "name": "김", "dept": "Flash 개발실"}], "evidenceList": [],
            "signOffHistory": {f"D{i}": dict(SIGNED) for i in range(1, 9)},
            "d2": {"problemStatement": "1000개 중 3개 부팅 불량", "isIsNot": [{"factor": "Lot", "is": "LOT-0001", "isNot": "LOT-0002", "difference": "Lot 국한", "verificationStatus": "Verified"}]},
            "d3": {"actions": [{"action": "전량 Hold", "status": "Completed"}], "materialFlow": [{"area": "4. 완제품 창고", "totalQty": 500, "holdQty": 500, "screenQty": 0, "ngQty": 0}],
                   "inventoryReconciliation": {"erpFinishedQty": 900}, "lotScope": {"affectedLot": lot}},
            "d4": {"rootCauses": {"Occurrence": {"statement": "온도 초과", "status": "Confirmed"}}},
            "d5": {"candidates": [{"id": "A1", "title": "상한 관리", "causeType": "Occurrence", "selected": True}], "pcnEcn": {"pcnRequired": False}},
            "d6": {"validationTests": [{"testName": "재현", "result": "PASS", "actionId": "A1", "sampleSize": 800, "failQty": 0, "completedAt": "2026-10-09"}],
                   "containmentRelease": {"decision": "Released"},
                   "beforeAfter": {"statistics": {"before": {"fail": 3, "n": 1000}, "after": {"fail": 0, "n": 800, "upperBoundPpm": 2874}, "confidence": 0.9,
                                                  "target": {"rate": 0.003, "source": "input"}, "verdict": "improved", "verdictLabel": "개선 확인"}}},
            "d7": {"systemUpdates": [{"docName": "작업표준", "status": "Completed"}], "horizontalDeployment": [], "lessonsLearned": {"lesson": "온도 관리"}},
            "d8": {"closure": {"remainingRisk": "기존 재고 별도 관리"}}}
    base.update(changes)
    return base


def xlsx(text):
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("xl/worksheets/sheet1.xml", '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1">'
                         f'<c r="A1" t="inlineStr"><is><t>{text}</t></is></c></row></sheetData></worksheet>')
    return buffer.getvalue()


class ReportAgentTests(unittest.TestCase):
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
        self.replies = {}
        self.ai = patch.object(portal_server, "ask_ai_for_advice", side_effect=self.fake_ai)
        self.ai.start()
        self.save([case()])

    def tearDown(self):
        self.ai.stop()
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        portal_server.QMS_STORE = self.original
        self.env.stop()
        self.temp.cleanup()

    def save(self, cases):
        with self.store._connect() as db:
            db.execute("INSERT OR REPLACE INTO state_store(id, revision, state_json, state_hash, updated_at, updated_by) VALUES(1, 1, ?, 'fixture', '2026-10-01T00:00:00Z', 1)",
                       (json.dumps({"cases": cases, "intakeQueue": []}, ensure_ascii=False),))

    def fake_ai(self, prompt, system, parse):
        """Plan, review and summary replies; a test can replace one, or set it to None to act as an AI outage."""
        kind = "plan" if "쓸 수 있는 도구" in prompt else "summary" if "요약 초안" in prompt else "review"
        default = {"plan": {"intent": "report", "caseId": "CASE-A", "caseReason": "고객과 현상이 일치", "tools": list(report_agent.TOOLS), "planReason": "전체 보고서", "focus": ""},
                   "review": {"findings": [{"stage": "D6", "relatedStage": "", "severity": "medium", "issue": "시험일 확인 필요", "suggestion": "날짜 대조"}], "summary": "흐름은 이어집니다."},
                   "summary": {"headline": "부팅 불량 건을 종결했습니다.", "points": ["현상: 1000개 중 3개 부팅 불량", "검증: 800개 중 불량 0"]}}[kind]
        reply = self.replies.get(kind, default)
        if isinstance(reply, list):
            reply = reply.pop(0)
        if reply is None:
            raise QMSApiError(502, "외부 AI 없음", code="AI_UNAVAILABLE")
        return {"engine": "mock", "model": "mock"}, parse(json.dumps(reply, ensure_ascii=False))

    def request(self, method, path, payload=None, headers=None):
        conn = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=8)
        body = None if payload is None else json.dumps(payload, ensure_ascii=False).encode("utf-8")
        conn.request(method, path, body, {"Origin": self.origin, "Content-Type": "application/json", **(headers or {})})
        response = conn.getresponse()
        raw = response.read()
        result = json.loads(raw) if response.getheader("Content-Type", "").startswith("application/json") and raw else raw
        info, status = dict(response.getheaders()), response.status
        conn.close()
        return status, info, result

    def login(self, username):
        status, headers, result = self.request("POST", "/__api__/auth/login", {"username": username, "password": "1"})
        self.assertEqual(status, 200)
        return {"Cookie": headers["Set-Cookie"].split(";", 1)[0], "X-QMS-CSRF": result["csrfToken"]}

    def run_agent(self, text, case_id=""):
        status, _, result = self.request("POST", "/__api__/qms/report-agent/runs", {"requestText": text, "caseId": case_id}, self.secure)
        self.assertEqual(status, 201, result)
        run = result["run"]
        for _ in range(100):
            if run["status"] != "RUNNING":
                return run
            time.sleep(0.05)
            run = self.request("GET", f"/__api__/qms/report-agent/runs/{run['id']}", headers=self.secure)[2]["run"]
        self.fail("the agent run did not finish")

    def test_one_request_produces_the_report_and_changes_nothing(self):
        before = self.store.get_state()
        run = self.run_agent("검증고객 부팅 불량 건 8D 보고서 작성해줘")
        self.assertEqual((run["status"], run["caseId"]), ("COMPLETED", "CASE-A"))
        self.assertEqual([s["tag"] for s in run["steps"]], ["의도 분석", "계획 수립", "스스로 수집", "스스로 수집", "스스로 수집", "처리", "판단", "판단", "결과 생성", "결과 생성"])
        self.assertTrue(all(s["status"] in {"done", "warn"} for s in run["steps"]))
        self.assertEqual(len(run["result"]["aiCalls"]), 3)
        status, headers, content = self.request("GET", f"/__api__/qms/report-agent/runs/{run['id']}/file", headers=self.secure)
        self.assertEqual(status, 200)
        self.assertIn("presentationml", headers["Content-Type"])
        with zipfile.ZipFile(io.BytesIO(content)) as deck:
            slides = [n for n in deck.namelist() if n.startswith("ppt/slides/slide")]
            text = "".join(deck.read(n).decode("utf-8") for n in slides)
        self.assertEqual(len(slides), run["result"]["slides"])
        for expected in ("검증고객", "LOT-0001", "온도 초과", "3,000 PPM", "2,874 PPM", "개선 확인", "부팅 불량 건을 종결했습니다."):
            self.assertIn(expected, text)
        after = self.store.get_state()
        self.assertEqual((after["revision"], after["stateHash"]), (before["revision"], before["stateHash"]))
        with self.store._connect() as db:
            actions = [r[0] for r in db.execute("SELECT action FROM audit_logs WHERE target_type='report_agent_run' ORDER BY id")]
        self.assertEqual(actions, ["REPORT_AGENT_STARTED", "REPORT_AGENT_FINISHED"])

    def test_checks_come_from_the_record(self):
        texts = [c["text"] for c in self.run_agent("CASE-A 8D 보고서 작성해줘")["result"]["checks"]]
        self.assertTrue(any("완제품 창고" in t and "500" in t and "900" in t for t in texts))        # location table against the imported ERP stock
        self.assertTrue(any("시험 완료일" in t and "2026-10-09" in t for t in texts))                # test dated after the D6 approval
        self.assertTrue(any(t.startswith("시험일 확인 필요") for t in texts))                         # the AI finding is carried, marked as AI
        self.assertTrue(any("D1는 결재됐지만 연결된 근거 파일이 없습니다" in t for t in texts))

    def test_evidence_is_opened_hashed_and_read(self):
        payload = {"filename": "D2_Lot_현황.xlsx", "dataUrl": "data:application/octet-stream;base64," + base64.b64encode(xlsx("Lot LOT-0001 3/1000")).decode(),
                   "type": "User evidence", "linkedStages": ["D2"], "expectedRevision": 1}
        self.assertEqual(self.request("POST", "/__api__/qms/cases/CASE-A/evidence", payload, self.secure)[0], 201)
        with self.store._connect() as db:   # an upload reopens approvals; this test is about reading the file
            state = json.loads(db.execute("SELECT state_json FROM state_store WHERE id=1").fetchone()[0])
            state["cases"][0]["evidenceList"].append({"id": "OLD-1", "file": "브라우저에만_있던_파일.pdf", "linkedStages": ["D2"]})
            db.execute("UPDATE state_store SET state_json=? WHERE id=1", (json.dumps(state, ensure_ascii=False),))
        run = self.run_agent("CASE-A 8D 보고서 작성해줘")
        lines = next(s for s in run["steps"] if s["title"] == "근거 원본 열기")["lines"]
        self.assertIn("근거 2건 중 원본 1건 열람 · 저장 당시 해시와 일치 1건", lines)
        self.assertIn("기록의 Lot LOT-0001 → 읽은 파일 1건 중 1건에서 확인", lines)
        self.assertTrue(any("중앙 보관소에 원본이 없는 근거 1건" in c["text"] for c in run["result"]["checks"]))
        with self.store._connect() as db:
            db.execute("UPDATE evidence_files SET content=?", (b"changed after upload",))
        run = self.run_agent("CASE-A 8D 보고서 작성해줘")
        self.assertTrue(any(c["level"] == "block" and "저장 당시 해시와 다른 근거 파일 1건" in c["text"] for c in run["result"]["checks"]))

    def test_summary_numbers_must_be_in_the_record(self):
        made_up = {"headline": "부팅 불량 건을 종결했습니다.", "points": ["현상: 1000개 중 3개 부팅 불량", "추가로 77777개가 의심됩니다"]}
        self.replies["summary"] = [made_up, made_up]
        run = self.run_agent("CASE-A 8D 보고서 작성해줘")
        self.assertEqual(run["result"]["summary"]["points"], ["현상: 1000개 중 3개 부팅 불량"])
        lines = next(s for s in run["steps"] if s["title"] == "요약 초안 작성")["lines"]
        self.assertTrue(any("기록에 없는 숫자 1개 발견 (77777)" in line for line in lines))
        self.assertEqual(report_agent.numbers_in("D8 종결, 5W2H, 3,000 PPM, 90%, 2026-10-04"), {"3000", "90", "2026", "10", "04"})

    def test_works_by_rule_when_the_ai_does_not_answer(self):
        self.replies.update(plan=None, review=None, summary=None)
        run = self.run_agent("검증고객 부팅 불량 건 8D 보고서 작성해줘")
        self.assertEqual((run["status"], run["caseId"], run["result"]["summary"], run["result"]["aiCalls"]), ("COMPLETED", "CASE-A", None, []))
        self.assertIn("(규칙)", run["steps"][0]["lines"][-1])
        self.assertEqual(self.request("GET", f"/__api__/qms/report-agent/runs/{run['id']}/file", headers=self.secure)[0], 200)

    def test_asks_back_instead_of_guessing(self):
        self.save([case(), case("CASE-B", title="부팅 불량 재발", lot="LOT-0009")])
        self.replies["plan"] = {"intent": "report", "caseId": "", "caseReason": "", "tools": [], "planReason": "", "focus": ""}
        run = self.run_agent("검증고객 부팅 불량 건 8D 보고서 작성해줘")
        self.assertEqual((run["status"], run["fileName"]), ("NEEDS_INPUT", ""))
        self.assertEqual({c["id"] for c in run["result"]["candidates"]}, {"CASE-A", "CASE-B"})
        self.assertEqual(self.run_agent("CASE-B 8D 보고서 작성해줘")["caseId"], "CASE-B")   # a Case number in the request always wins
        self.replies["plan"] = {"intent": "other", "caseId": "", "caseReason": "", "tools": [], "planReason": "", "focus": ""}
        run = self.run_agent("이번 달 생산 실적 알려줘")
        self.assertEqual(run["status"], "NEEDS_INPUT")
        self.assertIn("8D 보고서 작성을 맡습니다", run["result"]["message"])

    def test_plan_keeps_required_tools_and_skips_the_rest(self):
        self.replies["plan"] = {"intent": "report", "caseId": "CASE-A", "caseReason": "번호 일치", "tools": ["load_record", "build_report"], "planReason": "간단히 요청", "focus": "간단히"}
        run = self.run_agent("CASE-A 8D 보고서 간단히 작성해줘")
        self.assertEqual(run["result"]["tools"], ["load_record", "calculate", "rule_check", "build_report"])
        self.assertEqual(len(run["result"]["aiCalls"]), 1)
        self.assertIn("에이전트가 더한 필수 도구: 집계·계산, 기록 점검", run["steps"][1]["lines"])

    def test_access(self):
        self.assertEqual(self.request("POST", "/__api__/qms/report-agent/runs", {"requestText": "CASE-A 8D 보고서"})[0], 401)
        self.assertEqual(self.request("POST", "/__api__/qms/report-agent/runs", {"requestText": "CASE-A 8D 보고서"}, {"Cookie": self.secure["Cookie"]})[0], 403)
        self.assertEqual(self.request("POST", "/__api__/qms/report-agent/runs", {"requestText": ""}, self.secure)[0], 400)
        self.assertEqual(self.request("GET", "/__api__/qms/report-agent/runs/999", headers=self.secure)[0], 404)
        self.assertEqual(self.request("GET", "/__api__/qms/report-agent/runs/999/file", headers=self.secure)[0], 404)
        run = self.run_agent("CASE-A 8D 보고서 작성해줘")
        self.assertEqual(self.request("GET", "/__api__/qms/report-agent/runs", headers=self.secure)[2]["items"][0]["id"], run["id"])


if __name__ == "__main__":
    unittest.main()
