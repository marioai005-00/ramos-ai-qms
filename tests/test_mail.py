"""Notification mail: off by default, test mode redirects every message, SLA alerts and the D1 team share. SMTP is mocked."""
from datetime import datetime, timedelta, timezone
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch, MagicMock

from qms_backend import QMSApiError, QMSStore

SMTP_ENV = {"QMS_MAIL_PROVIDER": "SMTP", "QMS_EXTERNAL_SEND_ENABLED": "true", "QMS_SMTP_HOST": "smtp.test.invalid", "QMS_SMTP_PORT": "587",
            "QMS_SMTP_SECURITY": "STARTTLS", "QMS_SMTP_USER": "qms@test.invalid", "QMS_SMTP_PASSWORD": "secret-value", "QMS_MAIL_FROM": "qms@test.invalid"}


class MailTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.base_env = {"QMS_DATABASE_PATH": str(Path(self.temp.name) / "mail.sqlite3"), "QMS_DEMO_PASSWORD": "1"}
        self.env = patch.dict(os.environ, self.base_env)
        self.env.start()
        # Mail settings left in the developer's shell must not leak into the tests.
        for key in list(os.environ):
            if key.startswith(("QMS_SMTP", "QMS_MAIL", "QMS_EXTERNAL_SEND")):
                os.environ.pop(key)
        self.store = QMSStore(Path(self.temp.name))
        self.reviewer = self.login("sjkim")
        self.smtp = MagicMock()
        self.smtp.return_value.__enter__.return_value = self.smtp.return_value
        self.patcher = patch("mailer.smtplib.SMTP", self.smtp)
        self.patcher.start()

    def tearDown(self):
        self.patcher.stop()
        self.env.stop()
        self.temp.cleanup()

    def login(self, username):
        _, token, _ = self.store.authenticate(username, "1")
        return self.store.resolve_session(token)

    def sent(self):
        return [call.args[0] for call in self.smtp.return_value.send_message.call_args_list]

    def overdue_intake(self):
        stamp = (datetime.now(timezone(timedelta(hours=9))) - timedelta(hours=30)).strftime("%Y-%m-%d %H:%M")
        self.store.save_state(self.reviewer, {"cases": [], "intakeQueue": [{"intakeId": "INT-LATE", "status": "Quality Review Pending", "submittedAt": stamp}]}, 0, "seed")

    def test_sending_is_off_by_default(self):
        status = self.store.mail_status(self.reviewer)
        self.assertEqual((status["enabled"], status["ready"], status["testMode"], status["testRecipient"]), (False, False, True, "sjkim@ramostek.com"))
        with self.assertRaises(QMSApiError) as caught:
            self.store.send_test_mail(self.reviewer)
        self.assertEqual(caught.exception.code, "MAIL_DISABLED")
        self.overdue_intake()
        self.store.evaluate_sla_escalations(self.reviewer)
        self.smtp.assert_not_called()
        self.assertEqual({item["status"] for item in self.store.mail_status(self.reviewer)["log"]}, {"DISABLED"})

    def test_test_mode_sends_only_to_the_test_recipient(self):
        with patch.dict(os.environ, SMTP_ENV):
            status = self.store.mail_status(self.reviewer)
            self.assertTrue(status["ready"] and status["passwordSet"])
            self.assertNotIn("secret-value", repr(status))
            result = self.store.send_test_mail(self.login("master"))
        self.assertEqual((result["status"], result["recipients"], result["testMode"]), ("SENT", ["sjkim@ramostek.com"], True))
        message = self.sent()[0]
        self.assertEqual((message["To"], message["From"]), ("sjkim@ramostek.com", "qms@test.invalid"))
        self.assertTrue(message["Subject"].startswith("[QMS 시험]"))
        plain, html = message.get_body(("plain",)).get_content(), message.get_body(("html",)).get_content()
        self.assertIn("master@qms.local", plain)
        # The HTML part carries the same test-mode notice.
        self.assertIn("master@qms.local", html)
        self.assertIn("<table", html)
        self.smtp.return_value.starttls.assert_called_once()
        self.smtp.return_value.login.assert_called_once_with("qms@test.invalid", "secret-value")

    def test_overdue_alert_is_mailed_once_and_redirected_in_test_mode(self):
        self.overdue_intake()
        with patch.dict(os.environ, SMTP_ENV):
            self.store.evaluate_sla_escalations(self.reviewer)
            self.store.evaluate_sla_escalations(self.reviewer)
            log = self.store.mail_status(self.reviewer)["log"]
        self.assertEqual(len(self.sent()), 1)
        message = self.sent()[0]
        self.assertEqual(message["To"], "sjkim@ramostek.com")
        self.assertIn("INT-LATE", message["Subject"])
        self.assertIn("기한 초과", message["Subject"])
        html = message.get_body(("html",)).get_content()
        for expected in ("SLA 기한 초과", "INT-LATE", "3D 봉쇄 조치", "하루에 한 번"):
            self.assertIn(expected, html)
        self.assertEqual([(item["kind"], item["status"], item["actual"]) for item in log], [("SLA", "SENT", ["sjkim@ramostek.com"])])
        # The people the alert was meant for are recorded even though only the test address received it.
        self.assertIn("sahwang@ramostek.com", log[0]["intended"])

    def half_elapsed_intake(self):
        stamp = (datetime.now(timezone(timedelta(hours=9))) - timedelta(hours=14)).strftime("%Y-%m-%d %H:%M")
        self.store.save_state(self.reviewer, {"cases": [], "intakeQueue": [{"intakeId": "INT-HALF", "status": "Quality Review Pending", "submittedAt": stamp}]}, 0, "seed")

    def test_attention_level_is_mailed_once_by_default(self):
        self.half_elapsed_intake()
        with patch.dict(os.environ, SMTP_ENV):
            events = self.store.evaluate_sla_escalations(self.reviewer)
            self.store.evaluate_sla_escalations(self.reviewer)
        self.assertEqual(events[0]["level"], "L1_ATTENTION")
        self.assertEqual(len(self.sent()), 1)
        self.assertIn("기한 주의", self.sent()[0]["Subject"])

    def test_levels_outside_the_configured_ones_send_nothing(self):
        self.half_elapsed_intake()
        with patch.dict(os.environ, {**SMTP_ENV, "QMS_MAIL_SLA_LEVELS": "L3_OVERDUE"}):
            events = self.store.evaluate_sla_escalations(self.reviewer)
        self.assertEqual(events[0]["level"], "L1_ATTENTION")
        self.smtp.assert_not_called()

    def test_overdue_alert_repeats_once_a_day(self):
        self.overdue_intake()
        with patch.dict(os.environ, SMTP_ENV):
            self.store.evaluate_sla_escalations(self.reviewer)
            self.store.evaluate_sla_escalations(self.reviewer)
            self.assertEqual(len(self.sent()), 1)
            # Yesterday's mail has yesterday's key, so the still-overdue alert is mailed again today.
            with self.store._connect() as db:
                db.execute("UPDATE mail_log SET ref = substr(ref, 1, instr(ref, ':')) || '2000-01-01' WHERE kind='SLA'")
            self.store.evaluate_sla_escalations(self.reviewer)
            self.store.evaluate_sla_escalations(self.reviewer)
        self.assertEqual(len(self.sent()), 2)

    def test_unchanged_outcome_is_not_logged_every_minute(self):
        self.overdue_intake()
        for _ in range(3):
            self.store.evaluate_sla_escalations(self.reviewer)
        self.assertEqual([item["status"] for item in self.store.mail_status(self.reviewer)["log"]], ["DISABLED"])
        self.smtp.return_value.send_message.side_effect = OSError("connection refused")
        with patch.dict(os.environ, SMTP_ENV):
            for _ in range(3):
                self.store.evaluate_sla_escalations(self.reviewer)
        # One failed attempt is recorded; the retry waits an hour.
        self.assertEqual([item["status"] for item in self.store.mail_status(self.reviewer)["log"]], ["FAILED", "DISABLED"])
        self.assertEqual(self.smtp.return_value.send_message.call_count, 1)

    def case_state(self, confirmed, team):
        return {"intakeQueue": [], "cases": [{
            "id": "RAMOS-8D-T-001", "customer": "LG전자", "product": "eMMC", "partNumber": "MMACGD8J0F-HZRAF1-LPAGA00", "lotNumber": "0QH321500A04-LPAGA00",
            "claimTitle": "부팅 불가", "incidentSite": "고객 SMT 라인", "defectQty": 3, "inspectQty": 1000, "receiptDate": "2026-10-02 09:00", "status": "Open",
            "team": [{"role": role, "name": name, "dept": "품질", "contact": contact, "status": "Active"} for role, name, contact in team],
            "cftRecommendation": {"humanConfirmed": confirmed},
        }]}

    def test_confirmed_d1_team_receives_the_nonconformance_once(self):
        team = [("8D Leader", "황선아", "sahwang@ramostek.com"), ("Process Engineer", "박지훈", "jhpark@ramostek.com")]
        with patch.dict(os.environ, SMTP_ENV):
            revision = self.store.save_state(self.reviewer, self.case_state(False, team), 0, "case")["revision"]
            self.smtp.assert_not_called()  # a team that nobody confirmed is not mailed
            revision = self.store.save_state(self.reviewer, self.case_state(True, team), revision, "confirm")["revision"]
            revision = self.store.save_state(self.reviewer, self.case_state(True, team), revision, "unrelated edit")["revision"]
            self.assertEqual(len(self.sent()), 1)
            message = self.sent()[0]
            self.assertEqual(message["To"], "sjkim@ramostek.com")
            self.assertIn("[부적합 공유] RAMOS-8D-T-001 LG전자", message["Subject"])
            plain, html = message.get_body(("plain",)).get_content(), message.get_body(("html",)).get_content()
            for expected in ("0QH321500A04-LPAGA00", "부팅 불가", "3 / 1000", "황선아", "jhpark@ramostek.com", "24시간"):
                self.assertIn(expected, plain)
                self.assertIn(expected, html)
            # Deadlines are counted from the recorded receipt time (2026-10-02 09:00).
            for expected in ("10-03 09:00", "10-16 09:00", "11-01 09:00"):
                self.assertIn(expected, html)
            # A changed team is told again.
            self.store.save_state(self.reviewer, self.case_state(True, team + [("Customer Quality", "김영업", "sales@ramostek.com")]), revision, "team change")
            log = self.store.mail_status(self.reviewer)["log"]
        self.assertEqual(len(self.sent()), 2)
        self.assertEqual({item["kind"] for item in log}, {"CASE_SHARE"})
        self.assertEqual(log[0]["intended"], ["jhpark@ramostek.com", "sahwang@ramostek.com", "sales@ramostek.com"])

    def test_real_mode_sends_the_share_to_the_team(self):
        team = [("8D Leader", "황선아", "sahwang@ramostek.com"), ("Process Engineer", "박지훈", "jhpark@ramostek.com")]
        with patch.dict(os.environ, {**SMTP_ENV, "QMS_MAIL_TEST_MODE": "false"}):
            self.store.save_state(self.reviewer, self.case_state(True, team), 0, "case")
        self.assertEqual(self.sent()[0]["To"], "jhpark@ramostek.com, sahwang@ramostek.com")

    def test_real_mode_uses_intended_recipients(self):
        self.overdue_intake()
        with patch.dict(os.environ, {**SMTP_ENV, "QMS_MAIL_TEST_MODE": "false"}):
            self.store.evaluate_sla_escalations(self.reviewer)
        recipients = set(self.sent()[0]["To"].split(", "))
        self.assertIn("sahwang@ramostek.com", recipients)
        self.assertIn("master@qms.local", recipients)
        self.assertFalse(self.sent()[0]["Subject"].startswith("[QMS 시험]"))

    def test_delivery_failure_is_recorded_and_does_not_break_evaluation(self):
        self.overdue_intake()
        self.smtp.return_value.send_message.side_effect = OSError("connection refused")
        with patch.dict(os.environ, SMTP_ENV):
            events = self.store.evaluate_sla_escalations(self.reviewer)
            with self.assertRaises(QMSApiError) as caught:
                self.store.send_test_mail(self.reviewer)
            log = self.store.mail_status(self.reviewer)["log"]
        self.assertEqual(len(events), 1)
        self.assertEqual(caught.exception.code, "MAIL_FAILED")
        self.assertEqual({item["status"] for item in log}, {"FAILED"})
        self.assertIn("connection refused", log[0]["error"])

    def test_only_admin_and_reviewer_can_use_mail(self):
        for username in ("jhpark", "thkwon"):
            identity = self.login(username)
            for call in (self.store.mail_status, self.store.send_test_mail):
                with self.assertRaises(QMSApiError) as caught:
                    call(identity)
                self.assertEqual(caught.exception.code, "ROLE_FORBIDDEN")

    def test_html_escapes_recorded_text(self):
        state = self.case_state(True, [("8D Leader", "황선아", "sahwang@ramostek.com")])
        state["cases"][0]["claimTitle"] = '<script>alert(1)</script> & "부팅 불가"'
        with patch.dict(os.environ, SMTP_ENV):
            self.store.save_state(self.reviewer, state, 0, "case")
        html = self.sent()[0].get_body(("html",)).get_content()
        self.assertNotIn("<script>", html)
        self.assertIn("&lt;script&gt;", html)


if __name__ == "__main__":
    unittest.main()
