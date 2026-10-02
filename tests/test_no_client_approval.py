"""Browser code must not be able to create approvals, signers or measured results on its own."""

from pathlib import Path
import re
import unittest

PROJECT_ROOT = Path(__file__).resolve().parents[1]


class NoClientSideApprovalTests(unittest.TestCase):
    def sources(self):
        return {path: path.read_text(encoding="utf-8") for path in sorted((PROJECT_ROOT / "js").rglob("*.js"))}

    def test_removed_auto_approval_entry_points_stay_removed(self):
        forbidden = re.compile(r"signStageInternal|executeHumanSignOff|runSprint[23]|synthesizeD[1-8]|RAMOS_ENABLE_LEGACY_DEMO|autoDemoMode")
        for path, text in self.sources().items():
            with self.subTest(path=path.name):
                self.assertIsNone(forbidden.search(text))

    def test_dispatch_evidence_does_not_start_agent_generation(self):
        reports = (PROJECT_ROOT / "js" / "views" / "reports.js").read_text(encoding="utf-8")
        self.assertNotIn("ramosAgent", reports)


    def test_demo_evidence_and_fixed_supplier_figures_stay_removed(self):
        # Synthetic FA / reliability charts and the fixed demo figures of the old supplier bridge and audit table.
        forbidden = re.compile(r"SemiconductorEvidence|검증 100% PASS|IATF 16949 공인 실측|ECN-260901-01|무라타|4,800|SQ-2026-002|PCN-2026-001|RAMOS-8D-20260901-01")
        for name in ("late_stages.js", "views/workspace.js", "views/supplier_bridge.js", "views/supplier_portal.js", "views/supplier_ai_audit.js", "supplier_data.js"):
            with self.subTest(path=name):
                self.assertIsNone(forbidden.search((PROJECT_ROOT / "js" / name).read_text(encoding="utf-8")))

    def test_supplier_bridge_imports_only_tickets_bound_to_the_case(self):
        bridge = (PROJECT_ROOT / "js" / "views" / "supplier_bridge.js").read_text(encoding="utf-8")
        self.assertIn("ticket.sqeReview?.bound8DCaseId === caseId", bridge)
        self.assertNotIn("status: 'Completed'", bridge)
        self.assertNotIn("selected: true", bridge)

if __name__ == "__main__":
    unittest.main()
