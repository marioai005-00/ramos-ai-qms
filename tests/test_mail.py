"""Notification mail: off by default, test mode redirects every message, SLA alerts mail once. SMTP is mocked."""
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
        self.assertIn("master@qms.local", message.get_content())
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
        self.assertEqual([(item["kind"], item["status"], item["actual"]) for item in log], [("SLA", "SENT", ["sjkim@ramostek.com"])])
        # The people the alert was meant for are recorded even though only the test address received it.
        self.assertIn("sahwang@ramostek.com", log[0]["intended"])

    def test_levels_below_the_configured_one_send_nothing(self):
        stamp = (datetime.now(timezone(timedelta(hours=9))) - timedelta(hours=14)).strftime("%Y-%m-%d %H:%M")
        self.store.save_state(self.reviewer, {"cases": [], "intakeQueue": [{"intakeId": "INT-HALF", "status": "Quality Review Pending", "submittedAt": stamp}]}, 0, "seed")
        with patch.dict(os.environ, SMTP_ENV):
            events = self.store.evaluate_sla_escalations(self.reviewer)
        self.assertEqual(events[0]["level"], "L1_ATTENTION")
        self.smtp.assert_not_called()

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


if __name__ == "__main__":
    unittest.main()
