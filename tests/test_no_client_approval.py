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


    def test_example_data_stays_out_of_the_front_end(self):
        # Fixed demo figures, example Case and ticket numbers, drawn "measurement" images and canned verdicts.
        forbidden = re.compile(
            r"SemiconductorEvidence|renderSvgFigure|검증 100% PASS|IATF 16949 공인 실측|ECN-260901-01|무라타|Murata|X7R|X5R|4,800|60,000ea|"
            r"SQ-2026-002|PCN-2026-001|RAMOS-8D-20260901-01|isExampleCase|INTAKE_PRESETS|BENCHMARK|calcCaseCoQ|DebitNote|"
            r"LGE 평가 등급|위반 0건|0 Defect PASS|SAMPLE · TRAINING DATA|교육용 프리셋")
        for path, text in self.sources().items():
            if "vendor" in path.parts:
                continue
            with self.subTest(path=path.name):
                self.assertIsNone(forbidden.search(text))

    def test_removed_demo_modules_are_not_loaded(self):
        index = (PROJECT_ROOT / "index.html").read_text(encoding="utf-8")
        for name in ("doc_viewer.js", "semiconductor_evidence_svg.js"):
            self.assertNotIn(name, index)
            self.assertFalse(list((PROJECT_ROOT / "js").rglob(name)))

    def test_supplier_bridge_imports_only_tickets_bound_to_the_case(self):
        bridge = (PROJECT_ROOT / "js" / "views" / "supplier_bridge.js").read_text(encoding="utf-8")
        self.assertIn("ticket.sqeReview?.bound8DCaseId === caseId", bridge)
        self.assertNotIn("status: 'Completed'", bridge)
        self.assertNotIn("selected: true", bridge)

if __name__ == "__main__":
    unittest.main()
