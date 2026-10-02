"""Regression tests for central QMS persistence, authority, drafts and outbox."""

import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from qms_backend import QMSApiError, QMSStore


class QMSStoreTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp.name) / "test-qms.sqlite3"
        self.env = patch.dict(os.environ, {"QMS_DATABASE_PATH": str(self.db_path), "QMS_DEMO_PASSWORD": "1"})
        self.env.start()
        self.store = QMSStore(Path(self.temp.name))
        _, token, _ = self.store.authenticate("sjkim", "1")
        self.identity = self.store.resolve_session(token)

    def tearDown(self):
        self.env.stop()
        self.temp.cleanup()

    def test_shared_state_revision_conflict_and_audit(self):
        first = self.store.save_state(self.identity, {"cases": [], "intakeQueue": []}, 0, "initial")
        self.assertEqual(first["revision"], 1)
        with self.assertRaises(QMSApiError) as caught:
            self.store.save_state(self.identity, {"cases": [], "intakeQueue": []}, 0, "stale")
        self.assertEqual(caught.exception.code, "REVISION_CONFLICT")
        self.assertEqual(self.store.get_state()["revision"], 1)
        self.assertTrue(any(row["action"] == "STATE_SAVED" for row in self.store.audit_entries(self.identity)))

    def test_stage_version_and_real_approver_authority(self):
        version = self.store.create_stage_version(self.identity, "CASE-1", "D1", {"fact": "verified"})
        result = self.store.record_approval(self.identity, {
            "caseId": "CASE-1", "scopeType": "stage", "scopeKey": "D1",
            "roleKey": "drafter", "decision": "SUBMITTED", "comment": "사실 확인 후 기안",
            "expectedApproverEmail": "sjkim@ramostek.com", "stageVersionId": version["id"],
            "snapshot": {"fact": "verified"},
        })
        self.assertGreater(result["eventId"], 0)
        with self.assertRaises(QMSApiError) as caught:
            self.store.record_approval(self.identity, {
                "caseId": "CASE-1", "scopeType": "stage", "scopeKey": "D1",
                "roleKey": "leader", "decision": "APPROVED", "comment": "권한 없는 결재 시도",
                "expectedApproverEmail": "hskim@ramostek.com", "snapshot": {},
            })
        self.assertEqual(caught.exception.code, "APPROVER_MISMATCH")

    def test_outbox_is_prepared_and_never_sent(self):
        result = self.store.prepare_dispatch(self.identity, {
            "caseId": "CASE-1", "gateKey": "gate3D", "subject": "3D report",
            "evidenceNote": "외부 송부 증빙 메모", "reportSnapshot": {"version": 1},
            "recipients": ["customer@example.com"], "cc": [],
        })
        self.assertEqual(result["status"], "PREPARED")
        self.assertEqual(result["provider"], "UNDECIDED")
        self.assertFalse(result["externalSend"])
        rows = self.store.list_outbox(self.identity)
        self.assertIsNone(rows[0]["sent_at"])

    def test_dynamic_draft_uses_case_facts_without_fake_completion(self):
        case = {
            "id": "CASE-NOW", "customer": "LGE", "product": "eMMC 64GB",
            "partNumber": "PN-64", "lotNumber": "LOT-9", "claimTitle": "부팅 불량",
            "incidentSite": "평택 3라인", "defectQty": 2, "inspectQty": 100,
        }
        draft = self.store.build_d1_d3_draft(self.identity, case)
        self.assertIn("LOT-9", draft["d2"]["problemStatement"])
        self.assertFalse(draft["d2"]["humanConfirmed"])
        self.assertEqual(draft["d3"]["materialFlow"], [])
        self.assertTrue(all(action["status"] == "Open" for action in draft["d3"]["actions"]))
        self.assertFalse(draft["guardrails"]["autoApprove"])

    def test_similar_case_search_only_uses_closed_cases(self):
        cases = [
            {"id": "OPEN", "status": "In Progress", "customer": "LGE", "product": "eMMC", "partNumber": "PN1", "claimTitle": "부팅 불량"},
            {"id": "CLOSED", "status": "Closed", "customer": "LGE", "product": "eMMC", "partNumber": "PN1", "claimTitle": "부팅 불량", "d4": {"rootCauses": {"Occurrence": {"statement": "원인"}}}, "d5": {"candidates": [{"title": "재발대책"}]}},
            {"id": "OTHER-OPEN", "status": "In Progress", "customer": "LGE", "product": "eMMC", "partNumber": "PN1", "claimTitle": "부팅 불량"},
        ]
        self.store.save_state(self.identity, {"cases": cases, "intakeQueue": []}, 0, "similarity test")
        matches = self.store.similar_cases(self.identity, "OPEN", 5)
        self.assertEqual([item["caseId"] for item in matches], ["CLOSED"])
        self.assertGreater(matches[0]["score"], 0.5)

    def test_sla_escalation_is_central_role_targeted_and_has_no_external_notification(self):
        case = {
            "id": "CASE-LATE", "status": "In Progress", "customer": "LGE",
            "receiptDate": "2020-01-01 08:30", "triageApproval": {"slaHours": 12}, "gates": {},
        }
        self.store.save_state(self.identity, {"cases": [case], "intakeQueue": []}, 0, "sla test")
        events = self.store.evaluate_sla_escalations(self.identity)
        d3 = next(item for item in events if item["milestone"] == "D3")
        self.assertEqual(d3["level"], "L3_OVERDUE")
        self.assertEqual(len([item for item in events if item["milestone"] == "D3"]), 1)
        self.assertIn("stage_champion", d3["recipientRoles"])
        self.assertFalse(d3["externalNotification"])
        case["gates"] = {"gate3D": {"dispatchDate": "2020-01-01T10:00:00+09:00"}}
        self.store.save_state(self.identity, {"cases": [case], "intakeQueue": []}, 1, "d3 completed")
        remaining = self.store.evaluate_sla_escalations(self.identity)
        self.assertFalse(any(item["caseId"] == "CASE-LATE" and item["milestone"] == "D3" for item in remaining))


    def test_only_approved_supplier_accounts_are_active(self):
        expected = {
            "thkwon": ("권태훈", "TechL", "thkwon@techl.co.kr"),
            "yspark": ("박영수", "WinPAC", "yspark@winpac.co.kr"),
            "sangwook.ki": ("기상욱", "SSPC", "sangwook.ki@sfasemicon.com"),
            "ojs": ("오재수", "CTST", "ojs@ctst.co.kr"),
        }
        for username, (name, company, email) in expected.items():
            identity, _, _ = self.store.authenticate(username, "1")
            self.assertEqual(identity["name"], name)
            self.assertEqual(identity["dept"], company)
            self.assertEqual(identity["email"], email)
        with self.assertRaises(QMSApiError):
            self.store.authenticate("mwpark", "1")


if __name__ == "__main__":
    unittest.main()
