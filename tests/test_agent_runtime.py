"""Regression tests for governed Agent Unit orchestration."""

import base64
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from agent_runtime import AgentRuntime
from qms_backend import QMSApiError, QMSStore


class AgentRuntimeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp.name) / "agent-qms.sqlite3"
        self.env = patch.dict(os.environ, {
            "QMS_DATABASE_PATH": str(self.db_path),
            "QMS_DEMO_PASSWORD": "1",
            "QMS_SCHEDULER_ENABLED": "false",
        })
        self.env.start()
        self.store = QMSStore(Path(self.temp.name))
        self.runtime = AgentRuntime(self.store)
        _, token, _ = self.store.authenticate("sjkim", "1")
        self.identity = self.store.resolve_session(token)
        self.case = {
            "id": "CASE-AGENT-1", "status": "In Progress", "customer": "LGE",
            "product": "eMMC 64GB", "partNumber": "PN-64", "lotNumber": "LOT-9",
            "claimTitle": "부팅 불량", "defectQty": 2, "inspectQty": 100,
            "receiptDate": "2026-09-16T08:00:00+09:00", "gates": {},
            "supplierEmail": "thkwon@techl.co.kr",
        }
        self.store.save_state(self.identity, {"cases": [self.case], "intakeQueue": []}, 0, "agent fixture")

    def tearDown(self):
        self.runtime.stop_scheduler()
        self.env.stop()
        self.temp.cleanup()

    def create_draft_run(self, key="draft-1"):
        return self.runtime.create_run(self.identity, {
            "caseId": self.case["id"],
            "requestText": "CASE-AGENT-1 D1~D3 초안을 작성해줘",
            "triggerType": "NATURAL_LANGUAGE",
            "idempotencyKey": key,
        })

    def test_schema_policies_and_adapters_are_safe(self):
        policies = self.runtime.list_policies(self.identity)
        self.assertTrue(any(item["ruleType"] == "AGENT_GUARDRAIL" for item in policies))
        status = self.runtime.adapter_status(self.identity)
        self.assertEqual(status["email"]["provider"], "UNDECIDED")
        self.assertFalse(status["email"]["externalSendEnabled"])
        self.assertFalse(status["email"]["inboundCollectionEnabled"])

    def test_schema_version_does_not_downgrade_after_core_store_restart(self):
        restarted = QMSStore(Path(self.temp.name))
        with restarted._connect() as db:
            version = db.execute("SELECT value FROM schema_meta WHERE key='schema_version'").fetchone()[0]
        self.assertEqual(version, "3")

    def test_ambiguous_request_waits_for_confirmation(self):
        run = self.runtime.create_run(self.identity, {
            "requestText": "D4 원인을 분석해줘", "idempotencyKey": "ambiguous-1",
        })
        self.assertEqual(run["status"], "AWAITING_CONFIRMATION")
        self.assertTrue(run["input"]["requiresConfirmation"])
        confirmed = self.runtime.confirm_run(self.identity, run["id"], {
            "caseId": self.case["id"], "intent": "ANALYZE_ROOT_CAUSE",
        })
        self.assertEqual(confirmed["status"], "AWAITING_APPROVAL")
        self.assertTrue(confirmed["result"]["unknowns"])

    def test_idempotency_returns_same_run(self):
        first = self.create_draft_run("same-key")
        second = self.create_draft_run("same-key")
        self.assertEqual(first["id"], second["id"])

    def test_draft_requires_human_approval_and_revision_safe_apply(self):
        run = self.create_draft_run()
        self.assertEqual(run["status"], "AWAITING_APPROVAL")
        self.assertTrue(run["result"]["requiresHumanApproval"])
        self.assertIn("EXTERNAL_EMAIL", run["result"]["prohibitedAutomaticActions"])
        approved = self.runtime.decide_run(self.identity, run["id"], "APPROVE", {
            "comment": "실제 Case Fact와 대조하여 승인합니다.",
            "applyToCase": True,
            "expectedRevision": 1,
        })
        self.assertEqual(approved["status"], "COMPLETED")
        state = self.store.get_state()
        saved_case = state["state"]["cases"][0]
        self.assertIn("d1", saved_case)
        self.assertIn("d2", saved_case)
        self.assertIn("d3", saved_case)
        self.assertEqual(saved_case["agentApplications"][0]["runId"], run["id"])

    def test_revision_conflict_blocks_agent_apply(self):
        run = self.create_draft_run("revision-conflict")
        current = self.store.get_state()
        self.store.save_state(self.identity, current["state"], current["revision"], "concurrent edit")
        with self.assertRaises(QMSApiError) as caught:
            self.runtime.decide_run(self.identity, run["id"], "APPROVE", {
                "comment": "변경 후 충돌 검증 승인 시도",
                "applyToCase": True,
                "expectedRevision": 1,
            })
        self.assertEqual(caught.exception.code, "REVISION_CONFLICT")

    def test_critical_finding_requires_admin_override_reason(self):
        state = self.store.get_state()
        broken = dict(self.case)
        broken.update({"id": "CASE-BROKEN", "customer": "", "defectQty": 10, "inspectQty": 2})
        state["state"]["cases"].append(broken)
        self.store.save_state(self.identity, state["state"], state["revision"], "broken case")
        run = self.runtime.create_run(self.identity, {
            "caseId": "CASE-BROKEN", "requestText": "CASE-BROKEN D1~D3 초안 작성",
            "idempotencyKey": "critical-1",
        })
        self.assertTrue(any(item["severity"] == "CRITICAL" for item in run["result"]["dataQualityFindings"]))
        with self.assertRaises(QMSApiError) as caught:
            self.runtime.decide_run(self.identity, run["id"], "APPROVE", {"comment": "일반 승인 시도입니다."})
        self.assertEqual(caught.exception.code, "CRITICAL_FINDING_OPEN")
        approved = self.runtime.decide_run(self.identity, run["id"], "APPROVE", {
            "comment": "관리자 전결 검증 승인",
            "overrideReason": "고객 라인 정지로 즉시 격리가 필요하여 위험을 인지하고 전결합니다.",
        })
        self.assertEqual(approved["status"], "APPROVED")

    def test_source_artifact_deduplicates_and_does_not_store_body(self):
        content = base64.b64encode(b"quality evidence").decode("ascii")
        first = self.runtime.register_source(self.identity, self.case["id"], {
            "originalName": "inspection.txt", "mimeType": "text/plain", "contentBase64": content,
            "sourceType": "DOCUMENT", "extractedData": {"lotNumber": "LOT-9"},
        })
        second = self.runtime.register_source(self.identity, self.case["id"], {
            "originalName": "inspection-copy.txt", "mimeType": "text/plain", "contentBase64": content,
            "sourceType": "DOCUMENT",
        })
        self.assertEqual(first["id"], second["id"])
        self.assertFalse(first["storedBody"])
        self.assertEqual(len(self.runtime.list_sources(self.identity, self.case["id"])), 1)

    def test_supplier_is_restricted_to_assigned_case(self):
        _, token, _ = self.store.authenticate("thkwon", "1")
        supplier = self.store.resolve_session(token)
        allowed = self.runtime.list_runs(supplier, case_id=self.case["id"])
        self.assertEqual(allowed, [])
        state = self.store.get_state()
        state["state"]["cases"].append({
            "id": "CASE-OTHER", "customer": "Other", "product": "X", "claimTitle": "Y",
            "supplierEmail": "another@example.com",
        })
        self.store.save_state(self.identity, state["state"], state["revision"], "supplier scope")
        with self.assertRaises(QMSApiError) as caught:
            self.runtime.list_runs(supplier, case_id="CASE-OTHER")
        self.assertEqual(caught.exception.code, "CASE_ACCESS_FORBIDDEN")

    def test_scheduler_is_idempotent_and_never_external(self):
        first = self.runtime.run_due_jobs(self.identity, force=True)
        second = self.runtime.run_due_jobs(self.identity, force=True)
        self.assertTrue(first)
        self.assertTrue(second)
        runs = self.runtime.list_runs(self.identity)
        scheduler_runs = [item for item in runs if item["triggerType"] == "SCHEDULE"]
        self.assertEqual(len(scheduler_runs), 1)
        self.assertTrue(all(item["externalNotification"] is False for item in scheduler_runs))

    def test_failure_retries_then_needs_human(self):
        run = self.runtime.create_run(self.identity, {
            "requestText": "D4 원인을 분석해줘", "idempotencyKey": "retry-1",
        })
        for _ in range(4):
            self.runtime._record_failure(self.identity, run["id"], "AI_UNAVAILABLE", "AI 연결 실패", "simulated", retryable=True)
        failed = self.runtime.get_run(self.identity, run["id"])
        self.assertEqual(failed["status"], "NEEDS_HUMAN")
        self.assertEqual(failed["retryCount"], 4)
        self.assertEqual(len(failed["exceptions"]), 4)

    def test_evidence_event_triggers_cross_check_run(self):
        source = self.runtime.register_source(self.identity, self.case["id"], {
            "originalName": "lot-check.json", "mimeType": "application/json",
            "sha256": "b" * 64, "sourceType": "INSPECTION_RESULT",
            "extractedData": {"lotNumber": "LOT-OTHER", "partNumber": "PN-64"},
        })
        self.assertIn("eventRunId", source)
        run = self.runtime.get_run(self.identity, source["eventRunId"])
        self.assertEqual(run["triggerType"], "EVENT")
        self.assertEqual(run["status"], "COMPLETED")
        self.assertTrue(any(item["code"] == "SOURCE_CASE_MISMATCH" for item in run["result"]["dataQualityFindings"]))
        self.assertTrue(any(step["unitType"] == "CROSS_CHECK" for step in run["steps"]))

    def test_late_stage_and_report_drafts_apply_only_after_approval(self):
        corrective = self.runtime.create_run(self.identity, {
            "caseId": self.case["id"], "requestText": "CASE-AGENT-1 D5 시정조치 초안을 작성해줘",
            "idempotencyKey": "corrective-1",
        })
        self.assertEqual(corrective["intent"], "CREATE_CORRECTIVE_ACTION_DRAFT")
        self.assertEqual(corrective["status"], "AWAITING_APPROVAL")
        self.assertEqual(corrective["result"]["draft"]["d6"]["humanConfirmed"], False)
        completed = self.runtime.decide_run(self.identity, corrective["id"], "APPROVE", {
            "comment": "원인과 조치 연결 구조를 검토하여 승인합니다.", "applyToCase": True, "expectedRevision": 1,
        })
        self.assertEqual(completed["status"], "COMPLETED")
        self.assertEqual(self.store.get_state()["state"]["cases"][0]["d5"]["agentDraft"]["status"], "Human Review Required")

        report = self.runtime.create_run(self.identity, {
            "caseId": self.case["id"], "requestText": "CASE-AGENT-1 D8 고객 보고서 초안을 생성해줘",
            "idempotencyKey": "report-1",
        })
        self.assertEqual(report["intent"], "CREATE_REPORT_DRAFT")
        self.assertFalse(report["result"]["draft"]["report"]["externalSend"])
        done = self.runtime.decide_run(self.identity, report["id"], "APPROVE", {
            "comment": "보고서 Fact와 누락 항목을 검토하여 승인합니다.", "applyToCase": True, "expectedRevision": 2,
        })
        self.assertEqual(done["status"], "COMPLETED")
        saved = self.store.get_state()["state"]["cases"][0]
        self.assertEqual(saved["agentReportDrafts"][0]["dispatchStatus"], "NOT_READY")
        self.assertFalse(saved["agentReportDrafts"][0]["externalSend"])

    def test_empty_workspace_skips_watchdog_and_new_case_resumes_it(self):
        self.store.save_state(self.identity, {"cases": [], "intakeQueue": []}, 1, "empty workspace")
        skipped = self.runtime.run_due_jobs(self.identity, force=True)
        self.assertEqual(skipped[0]["status"], "SKIPPED")
        self.assertEqual(skipped[0]["reason"], "NO_CASES")
        self.assertEqual(self.runtime.list_runs(self.identity), [])
        self.store.save_state(self.identity, {"cases": [self.case], "intakeQueue": []}, 2, "manual registration")
        resumed = self.runtime.run_due_jobs(self.identity, force=True)
        self.assertEqual(resumed[0]["status"], "COMPLETED")
        self.assertEqual(len(self.runtime.list_runs(self.identity)), 1)


if __name__ == "__main__":
    unittest.main()
