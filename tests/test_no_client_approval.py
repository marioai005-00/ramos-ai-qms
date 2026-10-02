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


if __name__ == "__main__":
    unittest.main()
