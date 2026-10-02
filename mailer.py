"""Internal notification mail over SMTP.

Covers internal alerts only (SLA deadlines, a manual test message). Customer report dispatch stays a
manual step recorded in dispatch_outbox. While test mode is on, every message goes to one fixed address
regardless of who it was meant for.
"""
import hashlib
import json
import os
import smtplib
import ssl
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from email.utils import formatdate, make_msgid
from pathlib import Path

from internal_quality import fail, now

SEND_ROLES = {"system_admin", "quality_reviewer"}
DEFAULT_TEST_RECIPIENT = "sjkim@ramostek.com"
TRUE = {"1", "true", "yes", "on"}


def mail_config(project_root: Path) -> dict:
    """Mail settings from the process environment, then the project's .env file."""
    values: dict[str, str] = {}
    env_file = project_root / ".env"
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, value = line.split("=", 1)
                values[key.strip()] = value.strip()
    get = lambda key, default="": os.environ.get(key, values.get(key, default)).strip()
    security = get("QMS_SMTP_SECURITY", "STARTTLS").upper()
    port_text = get("QMS_SMTP_PORT", "465" if security == "SSL" else "587")
    return {
        "enabled": get("QMS_EXTERNAL_SEND_ENABLED", "false").lower() in TRUE and get("QMS_MAIL_PROVIDER", "UNDECIDED").upper() == "SMTP",
        "provider": get("QMS_MAIL_PROVIDER", "UNDECIDED").upper(),
        "host": get("QMS_SMTP_HOST"),
        "port": int(port_text) if port_text.isdigit() else 0,
        "security": security if security in {"STARTTLS", "SSL", "NONE"} else "STARTTLS",
        "user": get("QMS_SMTP_USER"),
        "password": get("QMS_SMTP_PASSWORD"),
        "sender": get("QMS_MAIL_FROM") or get("QMS_SMTP_USER"),
        # Test mode is on unless it is switched off explicitly.
        "testMode": get("QMS_MAIL_TEST_MODE", "true").lower() in TRUE,
        "testRecipient": get("QMS_MAIL_TEST_RECIPIENT", DEFAULT_TEST_RECIPIENT),
        "slaLevels": {level.strip().upper() for level in get("QMS_MAIL_SLA_LEVELS", "L1_ATTENTION,L2_CRITICAL,L3_OVERDUE").split(",") if level.strip()},
    }


def smtp_send(config: dict, recipients: list[str], subject: str, body: str) -> str:
    message = EmailMessage()
    message["From"] = config["sender"]
    message["To"] = ", ".join(recipients)
    message["Subject"] = subject
    message["Date"] = formatdate(localtime=True)
    message["Message-ID"] = make_msgid(domain="qms.local")
    message.set_content(body)
    if config["security"] == "SSL":
        client = smtplib.SMTP_SSL(config["host"], config["port"], timeout=20, context=ssl.create_default_context())
    else:
        client = smtplib.SMTP(config["host"], config["port"], timeout=20)
    with client:
        if config["security"] == "STARTTLS":
            client.starttls(context=ssl.create_default_context())
        if config["user"]:
            client.login(config["user"], config["password"])
        client.send_message(message)
    return message["Message-ID"]


class MailerMixin:
    def _init_mail(self, db):
        db.executescript("""
            CREATE TABLE IF NOT EXISTS mail_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                kind TEXT NOT NULL,
                ref TEXT NOT NULL,
                subject TEXT NOT NULL,
                intended_json TEXT NOT NULL,
                actual_json TEXT NOT NULL,
                status TEXT NOT NULL,
                test_mode INTEGER NOT NULL,
                error TEXT,
                message_id TEXT,
                created_at TEXT NOT NULL,
                created_by TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_mail_log_ref ON mail_log(kind, ref, status);
        """)

    def _mail_project_root(self) -> Path:
        return Path(getattr(self, "project_root", Path(__file__).resolve().parent))

    def mail_status(self, identity) -> dict:
        """Configuration state for the screen. The password is never returned."""
        self._require_role(identity, SEND_ROLES)
        config = mail_config(self._mail_project_root())
        missing = [label for key, label in (("host", "QMS_SMTP_HOST"), ("port", "QMS_SMTP_PORT"), ("sender", "QMS_MAIL_FROM")) if not config[key]]
        if config["user"] and not config["password"]:
            missing.append("QMS_SMTP_PASSWORD")
        with self._connect() as db:
            rows = db.execute("SELECT id, kind, ref, subject, intended_json, actual_json, status, test_mode, error, created_at, created_by FROM mail_log ORDER BY id DESC LIMIT 30").fetchall()
        return {
            "enabled": config["enabled"], "provider": config["provider"], "host": config["host"], "port": config["port"], "security": config["security"],
            "user": config["user"], "sender": config["sender"], "passwordSet": bool(config["password"]),
            "testMode": config["testMode"], "testRecipient": config["testRecipient"], "slaLevels": sorted(config["slaLevels"]),
            "missing": missing, "ready": config["enabled"] and not missing,
            "log": [{"id": r["id"], "kind": r["kind"], "ref": r["ref"], "subject": r["subject"], "intended": json.loads(r["intended_json"]),
                     "actual": json.loads(r["actual_json"]), "status": r["status"], "testMode": bool(r["test_mode"]), "error": r["error"],
                     "createdAt": r["created_at"], "createdBy": r["created_by"]} for r in rows],
        }

    def send_mail(self, actor: str, kind: str, ref: str, subject: str, body: str, intended: list[str], *, once: bool = False) -> dict:
        """Send one notification and record the outcome. Never raises for delivery problems."""
        config = mail_config(self._mail_project_root())
        intended = sorted({address.strip() for address in intended if isinstance(address, str) and "@" in address})
        actual = [config["testRecipient"]] if config["testMode"] else intended
        if config["testMode"]:
            subject = f"[QMS 시험] {subject}"
            body = f"시험 모드로 발송된 메일입니다. 실제 발송 대상: {', '.join(intended) or '(없음)'}\n\n{body}"
        status, error, message_id = "SENT", None, None
        if not config["enabled"]:
            status, error = "DISABLED", "메일 발송이 꺼져 있습니다 (QMS_MAIL_PROVIDER=SMTP, QMS_EXTERNAL_SEND_ENABLED=true 필요)."
        elif not (config["host"] and config["port"] and config["sender"]):
            status, error = "NOT_CONFIGURED", "SMTP 서버 주소·포트·보내는 주소 설정이 필요합니다."
        elif not actual:
            status, error = "NO_RECIPIENT", "받는 사람이 없습니다."
        if once:
            with self._lock, self._connect() as db:
                last = db.execute("SELECT status, created_at FROM mail_log WHERE kind=? AND ref=? ORDER BY id DESC LIMIT 1", (kind, ref)).fetchone()
                sent = db.execute("SELECT 1 FROM mail_log WHERE kind=? AND ref=? AND status='SENT'", (kind, ref)).fetchone()
            if sent:
                return {"status": "DUPLICATE", "recipients": actual}
            # The scheduler asks again every minute: an unchanged outcome is not logged twice, and a failed
            # delivery is retried at most once an hour.
            if last and status != "SENT" and last["status"] == status:
                return {"status": status, "error": error, "recipients": actual, "testMode": config["testMode"]}
            if last and last["status"] == "FAILED" and datetime.fromisoformat(last["created_at"]) > datetime.now(timezone.utc) - timedelta(hours=1):
                return {"status": "RETRY_LATER", "recipients": actual}
        if status == "SENT":
            try:
                message_id = smtp_send(config, actual, subject, body)
            except Exception as failure:  # delivery problems are recorded, not raised
                status, error = "FAILED", f"{type(failure).__name__}: {failure}"[:500]
        with self._lock, self._connect() as db:
            db.execute("INSERT INTO mail_log(kind, ref, subject, intended_json, actual_json, status, test_mode, error, message_id, created_at, created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                       (kind, ref, subject, json.dumps(intended, ensure_ascii=False), json.dumps(actual, ensure_ascii=False), status, int(config["testMode"]), error, message_id, now(), actor))
            self._audit(db, None, actor, "MAIL_" + status, "mail", f"{kind}:{ref}", details={"recipients": actual, "testMode": config["testMode"], "intendedCount": len(intended)})
        return {"status": status, "error": error, "recipients": actual, "testMode": config["testMode"]}

    def send_test_mail(self, identity) -> dict:
        self._require_role(identity, SEND_ROLES)
        user = identity.user
        result = self.send_mail(user["username"], "TEST", now(), "메일 발송 시험",
                                f"RAMOS AI-QMS 8D 메일 발송 시험입니다.\n요청자: {user.get('name', '')} ({user['username']})\n시각: {now()}",
                                [user.get("email", "")])
        if result["status"] != "SENT":
            fail(502 if result["status"] == "FAILED" else 409, result["error"] or "메일을 보내지 못했습니다.", "MAIL_" + result["status"])
        return result

    def _mail_sla_escalations(self, escalations: list[dict], created_ids: list[int], team_emails: dict[str, list[str]]) -> None:
        """Mail SLA alerts at the configured levels: once when an alert appears, and daily while it stays overdue."""
        config = mail_config(self._mail_project_root())
        today = datetime.now(timezone(timedelta(hours=9))).strftime("%Y-%m-%d")
        role_holders = None
        for item in escalations:
            overdue = item["level"] == "L3_OVERDUE"
            if item["level"] not in config["slaLevels"] or not (overdue or item["id"] in created_ids):
                continue
            # The Case team (chosen from the organization chart in D1) is the audience. Before a team
            # exists, the alert goes to the accounts holding the alert's roles.
            intended = team_emails.get(item["caseId"]) or []
            if not intended:
                if role_holders is None:
                    with self._connect() as db:
                        role_holders = [(r["email"], set(json.loads(r["roles_json"] or "[]"))) for r in db.execute("SELECT email, roles_json FROM users WHERE active=1")]
                intended = [email for email, roles in role_holders if roles & set(item["recipientRoles"])]
            label = {"L1_ATTENTION": "기한 주의", "L2_CRITICAL": "기한 임박", "L3_OVERDUE": "기한 초과"}.get(item["level"], item["level"])
            target = "접수" if item["targetType"] == "intake" else "8D Case"
            body = (f"{target} {item['caseId']}의 {item['milestone']} SLA 알림입니다.\n\n"
                    f"- 단계: {label}\n- 내용: {item['reason']}\n- 기한: {item['dueAt']}\n\n"
                    + ("기한 초과 상태가 해소될 때까지 하루에 한 번 다시 발송됩니다.\n" if overdue else "")
                    + "QMS 포털에서 해당 건을 확인해 주세요. 이 메일은 시스템이 자동으로 보냈습니다.")
            # An overdue alert is keyed by day so it repeats daily; the other levels are sent once.
            ref = f"{item['id']}:{today}" if overdue else str(item["id"])
            self.send_mail("scheduler", "SLA", ref, f"[SLA {label}] {item['caseId']} {item['milestone']}", body, intended, once=True)

    @staticmethod
    def _team_emails(case: dict) -> list[str]:
        team = case.get("team") if isinstance(case.get("team"), list) else []
        return sorted({str(m.get("contact") or m.get("email") or "").strip() for m in team if isinstance(m, dict)} - {""})

    def _mail_team_assignments(self, actor: str, state: dict, previous_state: dict) -> None:
        """When a person confirms the D1 team, share the nonconformance with the people on it."""
        before = {c.get("id"): c for c in previous_state.get("cases") or [] if isinstance(c, dict)}
        for case in state.get("cases") or []:
            if not isinstance(case, dict) or (case.get("cftRecommendation") or {}).get("humanConfirmed") is not True:
                continue
            emails = self._team_emails(case)
            old = before.get(case.get("id")) or {}
            if not emails or ((old.get("cftRecommendation") or {}).get("humanConfirmed") is True and self._team_emails(old) == emails):
                continue
            team = "\n".join(f"  · {m.get('role', '')}: {m.get('name', '')} ({m.get('dept', '')})" for m in case.get("team") if isinstance(m, dict))
            field = lambda key: str(case.get(key) if case.get(key) not in (None, "") else "미입력")
            body = (f"8D Case {case.get('id')}의 대응 팀(D1)으로 지정되어 접수된 부적합을 공유드립니다.\n\n"
                    f"- 고객사: {field('customer')}\n- 제품: {field('product')}\n- 품번: {field('partNumber')}\n- Lot No.: {field('lotNumber')}\n"
                    f"- 불량 현상: {field('claimTitle')}\n- 발생 위치: {field('incidentSite')}\n- 불량 / 검사 수량: {field('defectQty')} / {field('inspectQty')}\n"
                    f"- 접수 시각: {field('receiptDate')}\n\n"
                    f"기한: 3D(봉쇄) 접수 후 24시간, 5D(원인·대책) 14일, 8D(종결) 30일\n\n대응 팀\n{team}\n\n"
                    "QMS 포털에서 Case를 확인해 주세요. 이 메일은 시스템이 자동으로 보냈습니다.")
            ref = f"{case.get('id')}:{hashlib.sha256(','.join(emails).encode('utf-8')).hexdigest()[:16]}"
            self.send_mail(actor, "CASE_SHARE", ref, f"[부적합 공유] {case.get('id')} {field('customer')} {field('claimTitle')}", body, emails, once=True)
