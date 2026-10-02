"""Regression tests for central QMS persistence, authority, drafts and outbox."""

import json
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
        _, token, _ = self.store.authenticate("master", "1")
        self.admin = self.store.resolve_session(token)

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

    def _signed_stage(self, case_id, stage, snapshot):
        """Sign-off history backed by real server approval events for all three roles."""
        sign = {"status": "Approved", "snapshot": snapshot}
        for role, decision in (("drafter", "SUBMITTED"), ("leader", "APPROVED"), ("champion", "APPROVED")):
            event = self.store.record_approval(self.admin, {
                "caseId": case_id, "scopeType": "stage", "scopeKey": stage, "roleKey": role,
                "decision": decision, "comment": f"{stage} {role} 실제 결재", "snapshot": snapshot,
            })
            sign[role] = {"name": "김성중", "email": "sjkim@ramostek.com", "serverEventId": event["eventId"]}
        return sign

    def _assert_approval_rejected(self, case, revision=0):
        with self.assertRaises(QMSApiError) as caught:
            self.store.save_state(self.identity, {"cases": [case], "intakeQueue": []}, revision, "forged approval")
        self.assertEqual(caught.exception.code, "APPROVAL_NOT_RECORDED")

    def test_browser_cannot_save_stage_approval_without_server_event(self):
        self._assert_approval_rejected({"id": "CASE-F", "status": "In Progress", "d4": {"approval": {"status": "Approved", "humanConfirmed": True}}})
        forged_signer = {"name": "황승안 팀장_상무", "email": "sahwang@ramostek.com", "signedAt": "2026-10-02T00:00:00Z"}
        self._assert_approval_rejected({"id": "CASE-F", "status": "In Progress", "signOffHistory": {"D6": {
            "status": "Approved", "drafter": forged_signer, "leader": forged_signer, "champion": forged_signer, "snapshot": ["x"],
        }}})
        self.assertIsNone(self.store.get_state())

    def test_browser_cannot_save_gate_approval_or_closure_without_server_event(self):
        approvers = [{"role": role, "name": "임의 이름", "status": "Approved"} for role in ("기안", "Leader", "Champion", "송부")]
        self._assert_approval_rejected({"id": "CASE-G", "status": "In Progress", "gates": {"gate5D": {"status": "Approved", "approvers": approvers, "snapshot": ["x"]}}})
        self._assert_approval_rejected({"id": "CASE-G", "status": "Closed"})

    def test_recorded_approval_is_accepted_and_bound_to_its_snapshot(self):
        snapshot = ["d1-content"]
        case = {"id": "CASE-R", "status": "In Progress", "signOffHistory": {"D1": self._signed_stage("CASE-R", "D1", snapshot)}}
        saved = self.store.save_state(self.identity, {"cases": [case], "intakeQueue": []}, 0, "real approval")
        self.assertEqual(saved["revision"], 1)
        # The same events cannot vouch for different content or for another stage.
        case["signOffHistory"]["D1"]["snapshot"] = ["changed-after-approval"]
        self._assert_approval_rejected(case, 1)
        case["signOffHistory"] = {"D2": self._signed_stage("CASE-R", "D1", snapshot)}
        self._assert_approval_rejected(case, 1)

    def test_approvals_stored_before_the_check_remain_saveable(self):
        legacy = {"id": "CASE-L", "status": "In Progress", "d2": {"approval": {"status": "Approved", "humanConfirmed": True}}}
        with self.store._connect() as db:
            db.execute(
                "INSERT INTO state_store(id, revision, state_json, state_hash, updated_at, updated_by) VALUES(1, 1, ?, 'legacy', '2026-09-01T00:00:00Z', ?)",
                (json.dumps({"cases": [legacy], "intakeQueue": []}), self.identity.user["id"]),
            )
        legacy["claimTitle"] = "제목 수정"
        self.assertEqual(self.store.save_state(self.identity, {"cases": [legacy], "intakeQueue": []}, 1, "edit")["revision"], 2)
        legacy["d3"] = {"approval": {"status": "Approved", "humanConfirmed": True}}
        self._assert_approval_rejected(legacy, 2)

    def test_similar_case_search_only_uses_closed_cases(self):
        cases = [
            {"id": "OPEN", "status": "In Progress", "customer": "LGE", "product": "eMMC", "partNumber": "PN1", "claimTitle": "부팅 불량"},
            {"id": "CLOSED", "status": "Closed", "signOffHistory": {"D8": self._signed_stage("CLOSED", "D8", ["d8"])}, "customer": "LGE", "product": "eMMC", "partNumber": "PN1", "claimTitle": "부팅 불량", "d4": {"rootCauses": {"Occurrence": {"statement": "원인"}}}, "d5": {"candidates": [{"title": "재발대책"}]}},
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


    def test_intake_waiting_for_review_is_watched_until_it_is_decided(self):
        from datetime import datetime, timedelta, timezone
        kst = timezone(timedelta(hours=9))
        stamp = lambda hours: (datetime.now(kst) - timedelta(hours=hours)).strftime("%Y-%m-%d %H:%M")
        late = {"intakeId": "INT-LATE", "status": "Quality Review Pending", "customer": "LG전자", "submittedAt": stamp(30)}
        fresh = {"intakeId": "INT-NEW", "status": "Quality Review Pending", "customer": "LG전자", "submittedAt": stamp(1)}
        half = {"intakeId": "INT-HALF", "status": "Quality Review In Progress", "customer": "LG전자", "submittedAt": stamp(14)}
        self.store.save_state(self.identity, {"cases": [], "intakeQueue": [late, fresh, half]}, 0, "intake sla")
        events = {item["caseId"]: item for item in self.store.evaluate_sla_escalations(self.identity)}
        self.assertEqual(set(events), {"INT-LATE", "INT-HALF"})
        self.assertEqual((events["INT-LATE"]["level"], events["INT-LATE"]["milestone"], events["INT-LATE"]["targetType"]), ("L3_OVERDUE", "D3", "intake"))
        self.assertIn("품질 검토 대기", events["INT-LATE"]["reason"])
        self.assertIn("quality_reviewer", events["INT-LATE"]["recipientRoles"])
        self.assertEqual(events["INT-HALF"]["level"], "L1_ATTENTION")
        self.assertFalse(events["INT-LATE"]["externalNotification"])
        # Evaluating again does not create a second record for the same level.
        self.assertEqual(len(self.store.evaluate_sla_escalations(self.identity)), 2)
        late["status"] = "Approved"
        half["status"] = "Rejected"
        self.store.save_state(self.identity, {"cases": [], "intakeQueue": [late, fresh, half]}, 1, "decided")
        self.assertEqual(self.store.evaluate_sla_escalations(self.identity), [])

    def test_admin_can_delete_intake_and_case_with_reason_and_the_record_is_kept(self):
        intake = {"intakeId": "INT-1", "status": "Quality Review Pending", "submittedAt": "2020-01-01 09:00", "customer": "LG전자"}
        linked = {"intakeId": "INT-2", "status": "Approved", "submittedAt": "2020-01-01 09:00"}
        case = {"id": "CASE-1", "status": "In Progress", "sourceIntakeId": "INT-2", "claimTitle": "부팅 불량"}
        self.store.save_state(self.identity, {"cases": [case], "intakeQueue": [intake, linked]}, 0, "seed")
        self.assertTrue(self.store.evaluate_sla_escalations(self.identity))
        delete = lambda **changes: self.store.delete_record(self.admin, {"type": "intake", "id": "INT-1", "reason": "검증용 테스트 접수 정리", "expectedRevision": 1, **changes})
        for changes, code in (({"reason": "짧음"}, "DELETE_REASON_REQUIRED"), ({"type": "user"}, "INVALID_DELETE"), ({"id": "NONE"}, "RECORD_NOT_FOUND"),
                              ({"expectedRevision": 0}, "REVISION_CONFLICT"), ({"id": "INT-2"}, "INTAKE_HAS_CASE")):
            with self.assertRaises(QMSApiError) as caught:
                delete(**changes)
            self.assertEqual(caught.exception.code, code)
        # A quality reviewer without administrator rights cannot delete.
        with self.assertRaises(QMSApiError) as caught:
            self.store.delete_record(self.identity, {"type": "intake", "id": "INT-1", "reason": "권한 없는 삭제 시도", "expectedRevision": 1})
        self.assertEqual(caught.exception.code, "ROLE_FORBIDDEN")
        result = delete()
        self.assertEqual(result["revision"], 2)
        state = self.store.get_state()["state"]
        self.assertEqual([item["intakeId"] for item in state["intakeQueue"]], ["INT-2"])
        self.assertFalse(any(item["caseId"] == "INT-1" for item in self.store.evaluate_sla_escalations(self.identity)))
        self.store.delete_record(self.admin, {"type": "case", "id": "CASE-1", "reason": "검증용 테스트 Case 정리", "expectedRevision": 2})
        self.store.delete_record(self.admin, {"type": "intake", "id": "INT-2", "reason": "Case 삭제 후 접수 정리", "expectedRevision": 3})
        self.assertEqual(self.store.get_state()["state"], {"cases": [], "intakeQueue": []})
        with self.store._connect() as db:
            kept = db.execute("SELECT record_type, record_id, record_json, reason, deleted_by_username FROM deleted_records ORDER BY id").fetchall()
        self.assertEqual([(r["record_type"], r["record_id"], r["deleted_by_username"]) for r in kept], [("intake", "INT-1", "master"), ("case", "CASE-1", "master"), ("intake", "INT-2", "master")])
        self.assertEqual(json.loads(kept[1]["record_json"])["claimTitle"], "부팅 불량")
        self.assertEqual(sum(row["action"] == "RECORD_DELETED" for row in self.store.audit_entries(self.identity)), 3)

    def test_only_approved_supplier_accounts_are_active(self):
        expected = {
            "thkwon": ("권태훈", "TechL", "thkwon@techl.co.kr"),
            "yspark": ("박영수", "WinPAC", "yspark@winpac.co.kr"),
            "ojs": ("오재수", "CTST", "ojs@ctst.co.kr"),
        }
        for username, (name, company, email) in expected.items():
            identity, _, _ = self.store.authenticate(username, "1")
            self.assertEqual(identity["name"], name)
            self.assertEqual(identity["dept"], company)
            self.assertEqual(identity["email"], email)
        with self.assertRaises(QMSApiError):
            self.store.authenticate("mwpark", "1")
        with self.assertRaises(QMSApiError):
            self.store.authenticate("sangwook.ki", "1")

    def test_administrator_is_a_separate_account(self):
        self.assertEqual(self.admin.user["roles"], ["system_admin"])
        self.assertTrue(self.admin.user["isMaster"])
        self.assertNotIn("system_admin", self.identity.user["roles"])
        self.assertFalse(self.identity.user["isMaster"])
        self.assertEqual(set(self.identity.user["roles"]), {"quality_reviewer", "case_facilitator", "customer_dispatcher"})


if __name__ == "__main__":
    unittest.main()
