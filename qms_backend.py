"""Central persistence, authentication, audit and workflow services for RAMOS AI-QMS.

This module intentionally uses only the Python standard library so the existing
one-click launcher keeps working.  SQLite is the local/shared-file deployment
backend.  The HTTP contract is isolated in ``portal_server.py`` so a future
PostgreSQL/FastAPI adapter can replace this store without changing the browser
application.

No external e-mail is sent here.  Dispatch requests are stored as PREPARED
outbox records until the company chooses an SMTP, Microsoft Graph or Gmail
provider.
"""

from __future__ import annotations

import hashlib
import base64
import binascii
import hmac
import json
import os
import re
import secrets
import sqlite3
from contextlib import contextmanager
import threading
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any


UTC = timezone.utc
PASSWORD_ITERATIONS = 310_000
SESSION_HOURS = 8


def utc_now() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def sha256_json(value: Any) -> str:
    return hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()


def password_hash(password: str, salt: bytes | None = None) -> str:
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PASSWORD_ITERATIONS)
    return f"pbkdf2_sha256${PASSWORD_ITERATIONS}${salt.hex()}${digest.hex()}"


def verify_password(password: str, encoded: str) -> bool:
    try:
        algorithm, rounds, salt_hex, digest_hex = encoded.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        digest = hashlib.pbkdf2_hmac(
            "sha256", password.encode("utf-8"), bytes.fromhex(salt_hex), int(rounds)
        )
        return hmac.compare_digest(digest.hex(), digest_hex)
    except (TypeError, ValueError):
        return False


def public_user(row: sqlite3.Row | dict[str, Any]) -> dict[str, Any]:
    roles = json.loads(row["roles_json"] or "[]")
    return {
        "id": row["id"],
        "username": row["username"],
        "name": row["name"],
        "position": row["position"],
        "dept": row["dept"],
        "email": row["email"],
        "roles": roles,
        "isMaster": "system_admin" in roles,
        "isSupplier": "supplier_user" in roles,
        "userType": "SUPPLIER" if "supplier_user" in roles else "INTERNAL",
        "mustChangePassword": bool(row["must_change_password"]),
    }


class QMSApiError(Exception):
    def __init__(self, status: int, message: str, *, code: str = "QMS_ERROR", details: Any = None):
        super().__init__(message)
        self.status = status
        self.message = message
        self.code = code
        self.details = details


@dataclass(frozen=True)
class SessionIdentity:
    user: dict[str, Any]
    csrf_token: str
    session_id: int


from internal_quality import InternalQualityMixin
from supplier_notices import SupplierNoticesMixin
from supplier_tickets import SupplierSummaryMixin, SupplierTicketsMixin
from assembly_defects import AssemblyDefectsMixin
from mailer import MailerMixin
from report_export import ReportExportMixin
from stage_drafts import StageDraftMixin


class QMSStore(InternalQualityMixin, SupplierNoticesMixin, SupplierTicketsMixin, SupplierSummaryMixin, AssemblyDefectsMixin, StageDraftMixin, ReportExportMixin, MailerMixin):
    """Thread-safe SQLite store used by the local portal server."""

    def __init__(self, project_root: Path):
        self.project_root = project_root
        configured = os.environ.get("QMS_DATABASE_PATH", "").strip()
        self.database_path = Path(configured) if configured else project_root / "data" / "qms.sqlite3"
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self._initialize()

    @contextmanager
    def _connect(self):
        connection = sqlite3.connect(self.database_path, timeout=30, check_same_thread=False)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA journal_mode = WAL")
        connection.execute("PRAGMA busy_timeout = 30000")
        try:
            yield connection
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def _initialize(self) -> None:
        with self._lock, self._connect() as db:
            db.executescript(
                """
                CREATE TABLE IF NOT EXISTS schema_meta (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
                    name TEXT NOT NULL,
                    position TEXT NOT NULL DEFAULT '',
                    dept TEXT NOT NULL DEFAULT '',
                    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
                    password_hash TEXT NOT NULL,
                    roles_json TEXT NOT NULL DEFAULT '[]',
                    active INTEGER NOT NULL DEFAULT 1,
                    must_change_password INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS sessions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL REFERENCES users(id),
                    token_hash TEXT NOT NULL UNIQUE,
                    csrf_token TEXT NOT NULL,
                    expires_at TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    last_seen_at TEXT NOT NULL,
                    revoked_at TEXT
                );

                CREATE TABLE IF NOT EXISTS state_store (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    revision INTEGER NOT NULL,
                    state_json TEXT NOT NULL,
                    state_hash TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    updated_by INTEGER REFERENCES users(id)
                );

                CREATE TABLE IF NOT EXISTS audit_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    occurred_at TEXT NOT NULL,
                    user_id INTEGER REFERENCES users(id),
                    username TEXT,
                    action TEXT NOT NULL,
                    target_type TEXT NOT NULL,
                    target_id TEXT,
                    request_id TEXT,
                    before_hash TEXT,
                    after_hash TEXT,
                    details_json TEXT NOT NULL DEFAULT '{}'
                );

                CREATE TABLE IF NOT EXISTS stage_versions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    case_id TEXT NOT NULL,
                    stage_key TEXT NOT NULL,
                    version_no INTEGER NOT NULL,
                    snapshot_json TEXT NOT NULL,
                    snapshot_hash TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    created_by INTEGER NOT NULL REFERENCES users(id),
                    UNIQUE(case_id, stage_key, version_no)
                );

                CREATE TABLE IF NOT EXISTS approval_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    case_id TEXT NOT NULL,
                    scope_type TEXT NOT NULL,
                    scope_key TEXT NOT NULL,
                    role_key TEXT NOT NULL,
                    decision TEXT NOT NULL,
                    comment TEXT NOT NULL,
                    stage_version_id INTEGER REFERENCES stage_versions(id),
                    snapshot_hash TEXT,
                    actor_user_id INTEGER NOT NULL REFERENCES users(id),
                    actor_email TEXT NOT NULL,
                    expected_approver_email TEXT,
                    master_override INTEGER NOT NULL DEFAULT 0,
                    occurred_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS dispatch_outbox (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    case_id TEXT NOT NULL,
                    gate_key TEXT NOT NULL,
                    report_hash TEXT NOT NULL,
                    recipient_json TEXT NOT NULL DEFAULT '[]',
                    cc_json TEXT NOT NULL DEFAULT '[]',
                    subject TEXT NOT NULL,
                    evidence_note TEXT NOT NULL,
                    provider TEXT NOT NULL DEFAULT 'UNDECIDED',
                    status TEXT NOT NULL DEFAULT 'PREPARED',
                    created_at TEXT NOT NULL,
                    created_by INTEGER NOT NULL REFERENCES users(id),
                    sent_at TEXT,
                    provider_message_id TEXT
                );

                CREATE TABLE IF NOT EXISTS evidence_metadata (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    evidence_id TEXT NOT NULL UNIQUE,
                    case_id TEXT NOT NULL,
                    original_name TEXT NOT NULL,
                    mime_type TEXT NOT NULL,
                    byte_size INTEGER NOT NULL DEFAULT 0,
                    sha256 TEXT NOT NULL,
                    linked_stages_json TEXT NOT NULL DEFAULT '[]',
                    verified INTEGER NOT NULL DEFAULT 0,

                    verified_by INTEGER REFERENCES users(id),
                    verified_at TEXT,
                    created_at TEXT NOT NULL,
                    created_by INTEGER NOT NULL REFERENCES users(id)
                );

                CREATE TABLE IF NOT EXISTS evidence_files (
                    evidence_id TEXT PRIMARY KEY REFERENCES evidence_metadata(evidence_id),
                    content BLOB NOT NULL
                );

                CREATE TABLE IF NOT EXISTS sla_escalations (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    case_id TEXT NOT NULL,
                    milestone TEXT NOT NULL,
                    level TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'OPEN',
                    reason TEXT NOT NULL,
                    due_at TEXT NOT NULL,
                    remaining_hours REAL NOT NULL,
                    recipient_roles_json TEXT NOT NULL DEFAULT '[]',
                    created_at TEXT NOT NULL,
                    resolved_at TEXT,
                    UNIQUE(case_id, milestone, level, due_at)
                );
                CREATE INDEX IF NOT EXISTS idx_sla_escalation_open ON sla_escalations(status, case_id, milestone);

                CREATE TABLE IF NOT EXISTS similarity_feedback (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    source_case_id TEXT NOT NULL,
                    target_case_id TEXT NOT NULL,
                    score REAL NOT NULL,
                    accepted INTEGER,
                    feedback TEXT,
                    created_at TEXT NOT NULL,
                    created_by INTEGER REFERENCES users(id)
                );

                CREATE INDEX IF NOT EXISTS idx_audit_target ON audit_logs(target_type, target_id);
                CREATE TABLE IF NOT EXISTS deleted_records (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    record_type TEXT NOT NULL,
                    record_id TEXT NOT NULL,
                    record_json TEXT NOT NULL,
                    reason TEXT NOT NULL,
                    deleted_by INTEGER NOT NULL REFERENCES users(id),
                    deleted_by_username TEXT NOT NULL,
                    deleted_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_approval_case ON approval_events(case_id, scope_key);
                CREATE INDEX IF NOT EXISTS idx_stage_version_case ON stage_versions(case_id, stage_key);
                CREATE INDEX IF NOT EXISTS idx_dispatch_case ON dispatch_outbox(case_id, gate_key);
                """
            )
            db.execute(
                """INSERT INTO schema_meta(key, value) VALUES('schema_version', '2')
                   ON CONFLICT(key) DO UPDATE SET value = CASE
                     WHEN CAST(schema_meta.value AS INTEGER) < 2 THEN '2'
                     ELSE schema_meta.value
                   END"""
            )
            self._init_internal_quality(db)
            self._init_supplier_notices(db)
            self._init_supplier_tickets(db)
            self._init_assembly_defects(db)
            self._init_mail(db)
            self._seed_users(db)

    def _seed_users(self, db: sqlite3.Connection) -> None:
        demo_password = os.environ.get("QMS_DEMO_PASSWORD", "1")
        now = utc_now()
        seeds = [
            # The administrator is a separate account; staff accounts carry only their working roles (user decision 2026-10-02).
            ("master", "시스템 관리자", "Master", "QMS 관리", "master@qms.local", ["system_admin"]),
            ("sjkim", "김성중", "Senior Pro", "품질혁신팀", "sjkim@ramostek.com", ["quality_reviewer", "case_facilitator", "customer_dispatcher"]),
            ("hskim", "김현수", "실장_상무", "Flash 개발실", "hskim@ramostek.com", ["stage_leader"]),
            ("jhpark", "박재환", "팀장_S.Pro", "Flash 개발2팀", "jhpark@ramostek.com", ["stage_drafter"]),
            ("eunsan.lee", "이은산", "센터장_상무", "제조기획센터", "eunsan.lee@ramostek.com", ["stage_drafter"]),
            ("sahwang", "황승안", "팀장_상무", "품질혁신팀", "sahwang@ramostek.com", ["stage_champion"]),
            ("hsjeong", "정현석", "팀장_S.Pro", "Flash 개발1팀", "hsjeong@ramostek.com", ["stage_drafter"]),
            ("fog1007", "이성우", "팀장_P.Pro", "Flash 개발3팀", "fog1007@ramostek.com", ["stage_drafter"]),
            ("satiou", "신덕용", "팀장_P.Pro", "DRAM 개발2팀", "satiou@ramostek.com", ["stage_leader"]),
            ("gh8229", "박정훈", "부문장_전무", "알앤디부문", "gh8229@ramostek.com", ["stage_leader", "stage_champion"]),
            ("jh.choue66", "조장호", "대표이사", "대표이사", "jh.choue66@ramostek.com", ["stage_champion"]),
            ("thkwon", "권태훈", "부장", "TechL", "thkwon@techl.co.kr", ["supplier_user"]),
            ("yspark", "박영수", "차장", "WinPAC", "yspark@winpac.co.kr", ["supplier_user"]),
            ("ojs", "오재수", "그룹장", "CTST", "ojs@ctst.co.kr", ["supplier_user"]),
        ]
        approved_supplier_usernames = ("thkwon", "yspark", "ojs")
        placeholders = ", ".join("?" for _ in approved_supplier_usernames)
        db.execute(
            f"""UPDATE users
                SET active = 0, updated_at = ?
                WHERE roles_json = ? AND username NOT IN ({placeholders})""",
            (now, canonical_json(["supplier_user"]), *approved_supplier_usernames),
        )

        for username, name, position, dept, email, roles in seeds:
            exists = db.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()
            if exists:
                db.execute(
                    """UPDATE users SET name = ?, position = ?, dept = ?, email = ?, roles_json = ?, active = 1, updated_at = ? WHERE id = ?""",
                    (name, position, dept, email, canonical_json(roles), now, exists["id"]),
                )
                continue
            db.execute(
                """INSERT INTO users
                   (username, name, position, dept, email, password_hash, roles_json,
                    active, must_change_password, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?)""",
                (username, name, position, dept, email, password_hash(demo_password), canonical_json(roles), now, now),
            )

    def authenticate(self, username: str, password: str) -> tuple[dict[str, Any], str, str]:
        clean_username = (username or "").strip().lower()
        if not clean_username or not password:
            raise QMSApiError(401, "아이디와 비밀번호를 확인해 주세요.", code="INVALID_CREDENTIALS")
        with self._lock, self._connect() as db:
            row = db.execute(
                "SELECT * FROM users WHERE username = ? AND active = 1", (clean_username,)
            ).fetchone()
            if not row or not verify_password(password, row["password_hash"]):
                self._audit(db, None, clean_username, "AUTH_LOGIN_FAILED", "session", None, details={})
                raise QMSApiError(401, "아이디 또는 비밀번호가 올바르지 않습니다.", code="INVALID_CREDENTIALS")
            raw_token = secrets.token_urlsafe(48)
            token_digest = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
            csrf_token = secrets.token_urlsafe(32)
            now_dt = datetime.now(UTC)
            expires_at = (now_dt + timedelta(hours=SESSION_HOURS)).isoformat(timespec="seconds")
            cursor = db.execute(
                """INSERT INTO sessions
                   (user_id, token_hash, csrf_token, expires_at, created_at, last_seen_at)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (row["id"], token_digest, csrf_token, expires_at, utc_now(), utc_now()),
            )
            self._audit(db, row["id"], row["username"], "AUTH_LOGIN", "session", str(cursor.lastrowid), details={})
            return public_user(row), raw_token, csrf_token

    def resolve_session(self, raw_token: str | None) -> SessionIdentity | None:
        if not raw_token:
            return None
        token_digest = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
        now = utc_now()
        with self._lock, self._connect() as db:
            row = db.execute(
                """SELECT s.id AS session_id, s.csrf_token, s.expires_at, u.*
                   FROM sessions s JOIN users u ON u.id = s.user_id
                   WHERE s.token_hash = ? AND s.revoked_at IS NULL AND u.active = 1""",
                (token_digest,),
            ).fetchone()
            if not row or row["expires_at"] <= now:
                return None
            db.execute("UPDATE sessions SET last_seen_at = ? WHERE id = ?", (now, row["session_id"]))
            return SessionIdentity(public_user(row), row["csrf_token"], row["session_id"])

    def logout(self, identity: SessionIdentity) -> None:
        with self._lock, self._connect() as db:
            db.execute("UPDATE sessions SET revoked_at = ? WHERE id = ?", (utc_now(), identity.session_id))
            self._audit(db, identity.user["id"], identity.user["username"], "AUTH_LOGOUT", "session", str(identity.session_id), details={})

    def change_password(self, identity: SessionIdentity, current_password: str, new_password: str) -> None:
        if len(new_password) < 10 or not re.search(r"[A-Za-z]", new_password) or not re.search(r"\d", new_password):
            raise QMSApiError(400, "새 비밀번호는 영문과 숫자를 포함해 10자 이상이어야 합니다.", code="WEAK_PASSWORD")
        with self._lock, self._connect() as db:
            row = db.execute("SELECT * FROM users WHERE id = ?", (identity.user["id"],)).fetchone()
            if not row or not verify_password(current_password, row["password_hash"]):
                raise QMSApiError(401, "현재 비밀번호가 일치하지 않습니다.", code="INVALID_CREDENTIALS")
            db.execute(
                "UPDATE users SET password_hash = ?, must_change_password = 0, updated_at = ? WHERE id = ?",
                (password_hash(new_password), utc_now(), identity.user["id"]),
            )
            self._audit(db, identity.user["id"], identity.user["username"], "PASSWORD_CHANGED", "user", str(identity.user["id"]), details={})

    def get_state(self) -> dict[str, Any] | None:
        with self._connect() as db:
            row = db.execute("SELECT * FROM state_store WHERE id = 1").fetchone()
            if not row:
                return None
            return {
                "revision": row["revision"],
                "updatedAt": row["updated_at"],
                "stateHash": row["state_hash"],
                "state": json.loads(row["state_json"]),
            }

    def save_state(self, identity: SessionIdentity, state: dict[str, Any], expected_revision: int, reason: str) -> dict[str, Any]:
        self._require_role(identity, {"system_admin", "quality_reviewer", "case_facilitator", "stage_drafter", "stage_leader", "stage_champion", "customer_dispatcher"})
        if not isinstance(state, dict) or not isinstance(state.get("cases", []), list):
            raise QMSApiError(400, "중앙 저장 데이터 형식이 올바르지 않습니다.", code="INVALID_STATE")
        encoded = canonical_json(state)
        if len(encoded.encode("utf-8")) > 24 * 1024 * 1024:
            raise QMSApiError(413, "중앙 저장 데이터가 24MB 제한을 초과했습니다.", code="STATE_TOO_LARGE")
        after_hash = hashlib.sha256(encoded.encode("utf-8")).hexdigest()
        with self._lock, self._connect() as db:
            db.execute("BEGIN IMMEDIATE")
            previous = db.execute("SELECT * FROM state_store WHERE id = 1").fetchone()
            current_revision = previous["revision"] if previous else 0
            if int(expected_revision) != current_revision:
                raise QMSApiError(
                    409,
                    "다른 사용자가 더 최신 데이터를 저장했습니다. 중앙 데이터를 다시 불러온 뒤 변경사항을 재적용하세요.",
                    code="REVISION_CONFLICT",
                    details={"expected": expected_revision, "current": current_revision},
                )
            previous_state = json.loads(previous["state_json"]) if previous else {}
            self._verify_approval_claims(db, state, previous_state)
            new_revision = current_revision + 1
            now = utc_now()
            db.execute(
                """INSERT INTO state_store(id, revision, state_json, state_hash, updated_at, updated_by)
                   VALUES(1, ?, ?, ?, ?, ?)
                   ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,
                     state_json=excluded.state_json, state_hash=excluded.state_hash,
                     updated_at=excluded.updated_at, updated_by=excluded.updated_by""",
                (new_revision, encoded, after_hash, now, identity.user["id"]),
            )
            self._audit(
                db,
                identity.user["id"],
                identity.user["username"],
                "STATE_SAVED",
                "application_state",
                "1",
                before_hash=previous["state_hash"] if previous else None,
                after_hash=after_hash,
                details={"reason": reason[:500], "revision": new_revision},
            )
            result = {"revision": new_revision, "updatedAt": now, "stateHash": after_hash}
        # Sent after the save has committed, outside the database lock.
        self._mail_team_assignments(identity.user["username"], state, previous_state)
        return result

    _STAGE_KEYS = tuple(f"D{i}" for i in range(1, 9))
    _GATE_ROLES = ("drafter", "leader", "champion", "quality_dispatcher")
    _SIGN_STATUS_ROLES = {"Submitted": ("drafter",), "LeaderApproved": ("drafter", "leader"), "Approved": ("drafter", "leader", "champion")}

    @classmethod
    def _approval_claims(cls, state: dict[str, Any]) -> dict[tuple, dict[str, Any]]:
        """Every approval a saved state asserts, keyed so an unchanged claim compares equal across saves."""
        claims: dict[tuple, dict[str, Any]] = {}

        def as_dict(value: Any) -> dict[str, Any]:
            return value if isinstance(value, dict) else {}

        def add(case_id: str, scope_type: str, scope_key: str, role: str, signer: Any, snapshot: Any, label: str) -> None:
            event_id = as_dict(signer).get("serverEventId")
            snapshot_hash = sha256_json(snapshot) if snapshot is not None else None
            claims[(case_id, scope_type, scope_key, role, event_id, snapshot_hash)] = {
                "caseId": case_id, "scopeType": scope_type, "scopeKey": scope_key, "role": role,
                "eventId": event_id, "snapshotHash": snapshot_hash, "label": label,
            }

        for case in state.get("cases") or []:
            if not isinstance(case, dict):
                continue
            case_id = str(case.get("id", ""))
            history = as_dict(case.get("signOffHistory"))
            for stage in cls._STAGE_KEYS:
                sign = as_dict(history.get(stage))
                roles = set(cls._SIGN_STATUS_ROLES.get(sign.get("status"), ()))
                roles.update(role for role in ("drafter", "leader", "champion") if sign.get(role))
                if as_dict(as_dict(case.get(stage.lower())).get("approval")).get("status") == "Approved":
                    roles.add("champion")
                for role in roles:
                    add(case_id, "stage", stage, role, sign.get(role), sign.get("snapshot"), f"{stage} {role}")
            gates = as_dict(case.get("gates"))
            for gate_key in ("gate3D", "gate5D", "gate8D"):
                gate = as_dict(gates.get(gate_key))
                approvers = gate.get("approvers") if isinstance(gate.get("approvers"), list) else []
                indexes = {i for i, approver in enumerate(approvers[:4]) if as_dict(approver).get("status") == "Approved"}
                if gate.get("internalApproved"):
                    indexes.update({0, 1, 2})
                if gate.get("status") == "Approved" or gate.get("dispatchedByQuality"):
                    indexes.add(3)
                for i in indexes:
                    signer = approvers[i] if i < len(approvers) else None
                    add(case_id, "report_gate", gate_key, cls._GATE_ROLES[i], signer, gate.get("snapshot"), f"{gate_key} {cls._GATE_ROLES[i]}")
            if case.get("status") == "Closed":
                # Closure follows the D8 champion approval or the Final 8D dispatch record.
                closing = as_dict(history.get("D8")).get("champion")
                closing_gate = as_dict(gates.get("gate8D"))
                approvers = closing_gate.get("approvers") if isinstance(closing_gate.get("approvers"), list) else []
                if as_dict(closing).get("serverEventId"):
                    add(case_id, "stage", "D8", "champion", closing, as_dict(history.get("D8")).get("snapshot"), "Case 종결")
                else:
                    add(case_id, "report_gate", "gate8D", "quality_dispatcher", approvers[3] if len(approvers) > 3 else None, closing_gate.get("snapshot"), "Case 종결")
        return claims

    def _verify_approval_claims(self, db: sqlite3.Connection, state: dict[str, Any], previous_state: dict[str, Any]) -> None:
        """Reject approvals the browser asserts without a matching server approval event.

        Claims already stored are left as they are, so records that predate this check keep loading and saving.
        """
        known = self._approval_claims(previous_state)
        for key, claim in self._approval_claims(state).items():
            if key in known:
                continue
            event = None
            if isinstance(claim["eventId"], int) and not isinstance(claim["eventId"], bool):
                event = db.execute("SELECT * FROM approval_events WHERE id = ?", (claim["eventId"],)).fetchone()
            valid = (
                event is not None
                and event["case_id"] == claim["caseId"]
                and event["scope_type"] == claim["scopeType"]
                and event["scope_key"] == claim["scopeKey"]
                and event["role_key"] == claim["role"]
                and event["decision"] in {"APPROVED", "SUBMITTED"}
                and event["snapshot_hash"] is not None
                and event["snapshot_hash"] == claim["snapshotHash"]
            )
            if not valid:
                raise QMSApiError(
                    409,
                    f"{claim['caseId']} {claim['label']} 결재가 중앙 결재 기록과 일치하지 않아 저장하지 않았습니다. 실제 결재자 계정으로 결재해 주세요.",
                    code="APPROVAL_NOT_RECORDED",
                    details={"caseId": claim["caseId"], "scopeType": claim["scopeType"], "scopeKey": claim["scopeKey"], "role": claim["role"]},
                )

    def delete_record(self, identity: SessionIdentity, payload: dict[str, Any]) -> dict[str, Any]:
        """Remove an intake or a Case from the working state. The full record is kept in deleted_records."""
        self._require_role(identity, {"system_admin"})
        record_type = payload.get("type") if isinstance(payload, dict) else None
        record_id = payload.get("id") if isinstance(payload, dict) else None
        reason = payload.get("reason") if isinstance(payload, dict) else None
        expected = payload.get("expectedRevision") if isinstance(payload, dict) else None
        if record_type not in {"intake", "case"} or not isinstance(record_id, str) or not record_id:
            raise QMSApiError(400, "삭제 대상을 확인하세요.", code="INVALID_DELETE")
        if not isinstance(reason, str) or len(reason.strip()) < 5 or len(reason) > 500:
            raise QMSApiError(400, "삭제 사유를 5자 이상 입력하세요.", code="DELETE_REASON_REQUIRED")
        list_key, id_key = ("intakeQueue", "intakeId") if record_type == "intake" else ("cases", "id")
        with self._lock, self._connect() as db:
            db.execute("BEGIN IMMEDIATE")
            previous = db.execute("SELECT * FROM state_store WHERE id=1").fetchone()
            if not previous:
                raise QMSApiError(404, "삭제할 기록이 없습니다.", code="RECORD_NOT_FOUND")
            if isinstance(expected, bool) or not isinstance(expected, int) or expected != previous["revision"]:
                raise QMSApiError(409, "다른 사용자가 먼저 저장했습니다. 새로고침 후 다시 시도하세요.", code="REVISION_CONFLICT")
            state = json.loads(previous["state_json"])
            items = state.get(list_key) or []
            target = next((item for item in items if isinstance(item, dict) and item.get(id_key) == record_id), None)
            if target is None:
                raise QMSApiError(404, "삭제할 기록이 없습니다.", code="RECORD_NOT_FOUND")
            if record_type == "intake" and any(isinstance(c, dict) and c.get("sourceIntakeId") == record_id for c in state.get("cases") or []):
                raise QMSApiError(409, "이 접수로 만든 8D Case가 있습니다. Case를 먼저 삭제하세요.", code="INTAKE_HAS_CASE")
            state[list_key] = [item for item in items if item is not target]
            encoded = canonical_json(state)
            after_hash = hashlib.sha256(encoded.encode("utf-8")).hexdigest()
            revision = previous["revision"] + 1
            now = utc_now()
            db.execute("INSERT INTO deleted_records(record_type, record_id, record_json, reason, deleted_by, deleted_by_username, deleted_at) VALUES(?,?,?,?,?,?,?)",
                       (record_type, record_id, canonical_json(target), reason.strip(), identity.user["id"], identity.user["username"], now))
            db.execute("UPDATE state_store SET revision=?, state_json=?, state_hash=?, updated_at=?, updated_by=? WHERE id=1",
                       (revision, encoded, after_hash, now, identity.user["id"]))
            # Deadlines of a removed record no longer need attention; approval events and stored files stay as they are.
            db.execute("UPDATE sla_escalations SET status='RESOLVED', resolved_at=? WHERE case_id=? AND status='OPEN'", (now, record_id))
            self._audit(db, identity.user["id"], identity.user["username"], "RECORD_DELETED", record_type, record_id,
                        before_hash=previous["state_hash"], after_hash=after_hash, details={"reason": reason.strip()[:500], "revision": revision})
            return {"revision": revision, "updatedAt": now, "stateHash": after_hash, "type": record_type, "id": record_id}

    def upload_case_evidence(self, identity: SessionIdentity, case_id: str, payload: dict) -> dict:
        self._require_role(identity, {"system_admin", "quality_reviewer", "case_facilitator", "stage_drafter", "stage_leader", "stage_champion", "customer_dispatcher"})
        name = payload.get("filename")
        data_url = payload.get("dataUrl")
        stages = payload.get("linkedStages")
        evidence_type = payload.get("type")
        allowed_ext = {"png", "jpg", "jpeg", "webp", "pdf", "xlsx", "xls", "csv", "docx", "eml", "txt"}
        if (not isinstance(name, str) or not name.strip() or len(name) > 240
                or any(char in name for char in '/\\\r\n\x00') or name.rsplit(".", 1)[-1].lower() not in allowed_ext
                or not isinstance(data_url, str) or not data_url.startswith("data:") or ";base64," not in data_url
                or not isinstance(evidence_type, str) or evidence_type not in {"Customer original", "Measurement", "FA Analysis", "User evidence"}
                or not isinstance(stages, list) or not stages or len(stages) > 8
                or any(not isinstance(stage, str) or stage not in {f"D{i}" for i in range(1, 9)} for stage in stages)):
            raise QMSApiError(400, "지원하는 원본 파일과 증거 유형·연결 단계를 선택하세요.", code="INVALID_EVIDENCE")
        try:
            content = base64.b64decode(data_url.split(";base64,", 1)[1], validate=True)
            expected_revision = int(payload.get("expectedRevision", -1))
        except (ValueError, binascii.Error) as error:
            raise QMSApiError(400, "파일 내용을 해석하지 못했습니다.", code="INVALID_EVIDENCE") from error
        if not content or len(content) > 30 * 1024 * 1024:
            raise QMSApiError(413, "빈 파일은 등록할 수 없으며 파일당 최대 30 MB입니다.", code="EVIDENCE_SIZE")
        mime_types = {"png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg", "webp": "image/webp", "pdf": "application/pdf", "txt": "text/plain", "csv": "text/csv", "eml": "message/rfc822"}
        mime = mime_types.get(name.rsplit(".", 1)[-1].lower(), "application/octet-stream")
        evidence_id = "EVD-" + secrets.token_hex(16)
        digest = hashlib.sha256(content).hexdigest()
        now = utc_now()
        stages = list(dict.fromkeys(stages))
        evidence = {"id": evidence_id, "serverFileId": evidence_id, "file": name, "title": name,
                    "type": evidence_type, "linkedStages": stages, "stageScoped": True,
                    "storageLocation": "QMS", "mimeType": mime, "sizeBytes": len(content),
                    "sha256": digest, "uploadedBy": identity.user["email"], "uploadedAt": now}
        source_note = payload.get("sourceNote")
        if source_note is not None:
            if not isinstance(source_note, str) or len(source_note) > 240:
                raise QMSApiError(400, "자료 출처 메모를 확인하세요.", code="INVALID_EVIDENCE")
            if source_note.strip():
                evidence["source"] = source_note.strip()
        with self._lock, self._connect() as db:
            db.execute("BEGIN IMMEDIATE")
            previous = db.execute("SELECT * FROM state_store WHERE id=1").fetchone()
            state = json.loads(previous["state_json"]) if previous else {"cases": []}
            case = next((item for item in state.get("cases", []) if item.get("id") == case_id), None)
            if case is None:
                raise QMSApiError(404, "대상 Case를 먼저 저장하세요.", code="CASE_NOT_FOUND")
            if previous["revision"] != expected_revision:
                raise QMSApiError(409, "다른 사용자가 먼저 저장했습니다. 새로고침 후 첨부하세요.", code="REVISION_CONFLICT")
            case["evidenceList"] = [*(case.get("evidenceList") or []), evidence]
            self._invalidate_evidence_approvals(case, stages, identity)
            encoded = canonical_json(state)
            if len(encoded.encode("utf-8")) > 24 * 1024 * 1024:
                raise QMSApiError(413, "Case 데이터 저장 한도를 초과했습니다.", code="STATE_TOO_LARGE")
            revision = previous["revision"] + 1
            after_hash = hashlib.sha256(encoded.encode("utf-8")).hexdigest()
            db.execute("INSERT INTO evidence_metadata(evidence_id,case_id,original_name,mime_type,byte_size,sha256,linked_stages_json,created_at,created_by) VALUES(?,?,?,?,?,?,?,?,?)",
                       (evidence_id, case_id, name, mime, len(content), digest, canonical_json(stages), now, identity.user["id"]))
            db.execute("INSERT INTO evidence_files(evidence_id,content) VALUES(?,?)", (evidence_id, content))
            db.execute("UPDATE state_store SET revision=?,state_json=?,state_hash=?,updated_at=?,updated_by=? WHERE id=1",
                       (revision, encoded, after_hash, now, identity.user["id"]))
            self._audit(db, identity.user["id"], identity.user["username"], "EVIDENCE_UPLOADED", "case", case_id,
                        before_hash=previous["state_hash"], after_hash=after_hash,
                        details={"evidenceId": evidence_id, "sha256": digest, "bytes": len(content), "stages": stages, "revision": revision})
            return {"evidence": evidence, "case": case, "revision": revision, "updatedAt": now}

    @staticmethod
    def _invalidate_evidence_approvals(case: dict, stages: list, identity: SessionIdentity) -> None:
        first = min(stages, key=lambda stage: int(stage[1:]))
        affected = [f"D{i}" for i in range(int(first[1:]), 9)]
        if not any((case.get("signOffHistory") or {}).get(stage, {}).get("drafter")
                   or case.get(stage.lower(), {}).get("approval", {}).get("status") == "Approved" for stage in affected):
            return
        case.setdefault("approvalAudit", []).append({"at": utc_now(), "by": identity.user["email"],
            "reason": "Evidence 첨부 — 연결 단계부터 재검토 필요", "fromStage": first,
            "signOffHistory": json.loads(canonical_json(case.get("signOffHistory", {}))),
            "gates": json.loads(canonical_json(case.get("gates", {}))),
            "stageApprovals": {stage: case.get(stage.lower(), {}).get("approval", {}) for stage in affected}})
        case["approvalReviewFrom"] = min(first, case.get("approvalReviewFrom") or first, key=lambda stage: int(stage[1:]))
        for stage in affected:
            if stage in case.get("signOffHistory", {}):
                case["signOffHistory"][stage] = {"status": "Draft", "drafter": None, "leader": None, "champion": None}
            if stage.lower() in case:
                case[stage.lower()]["approval"] = {"status": "Draft", "humanConfirmed": False}
        if first == "D1":
            case.setdefault("cftRecommendation", {})["humanConfirmed"] = False
            case.setdefault("cftRaci", {})["acknowledged"] = False
        for key, gate in case.get("gates", {}).items():
            if key in {"gate3D", "gate5D", "gate8D"} and int(key[4]) >= int(first[1:]):
                gate.update(status="Pending", internalApproved=False, dispatchedByQuality=False, dispatchDate="", approvalDate="")
                gate.pop("snapshot", None)
                gate.pop("dispatchEvidence", None)
                gate["approvers"] = [{**actor, "status": "Pending", "date": "", "comment": ""} for actor in gate.get("approvers", [])]
        case["currentStage"] = case["approvalReviewFrom"]
        if case.get("status") == "Closed":
            case["status"] = "In Progress"

    def get_case_evidence_file(self, identity: SessionIdentity, case_id: str, evidence_id: str) -> dict:
        self._require_role(identity, {"system_admin", "quality_reviewer", "case_facilitator", "stage_drafter", "stage_leader", "stage_champion", "customer_dispatcher", "read_only_auditor"})
        with self._connect() as db:
            row = db.execute("SELECT m.*, f.content FROM evidence_metadata m JOIN evidence_files f USING(evidence_id) WHERE m.case_id=? AND m.evidence_id=?", (case_id, evidence_id)).fetchone()
            if row is None:
                raise QMSApiError(404, "보관된 원본을 찾을 수 없습니다.", code="EVIDENCE_NOT_FOUND")
            return dict(row)

    def create_stage_version(self, identity: SessionIdentity, case_id: str, stage_key: str, snapshot: Any) -> dict[str, Any]:
        self._require_role(identity, {"system_admin", "case_facilitator", "stage_drafter", "quality_reviewer"})
        stage_key = stage_key.upper()
        if stage_key not in {f"D{i}" for i in range(1, 9)}:
            raise QMSApiError(400, "지원하지 않는 8D 단계입니다.", code="INVALID_STAGE")
        with self._lock, self._connect() as db:
            version = db.execute(
                "SELECT COALESCE(MAX(version_no), 0) + 1 FROM stage_versions WHERE case_id = ? AND stage_key = ?",
                (case_id, stage_key),
            ).fetchone()[0]
            snapshot_text = canonical_json(snapshot)
            digest = hashlib.sha256(snapshot_text.encode("utf-8")).hexdigest()
            cursor = db.execute(
                """INSERT INTO stage_versions
                   (case_id, stage_key, version_no, snapshot_json, snapshot_hash, created_at, created_by)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (case_id, stage_key, version, snapshot_text, digest, utc_now(), identity.user["id"]),
            )
            self._audit(db, identity.user["id"], identity.user["username"], "STAGE_VERSION_CREATED", "case_stage", f"{case_id}:{stage_key}", after_hash=digest, details={"version": version})
            return {"id": cursor.lastrowid, "version": version, "snapshotHash": digest}

    def record_approval(self, identity: SessionIdentity, payload: dict[str, Any]) -> dict[str, Any]:
        case_id = str(payload.get("caseId", "")).strip()
        scope_type = str(payload.get("scopeType", "stage")).strip()
        scope_key = str(payload.get("scopeKey", "")).strip()
        role_key = str(payload.get("roleKey", "")).strip()
        decision = str(payload.get("decision", "APPROVED")).upper()
        comment = str(payload.get("comment", "")).strip()
        expected_email = str(payload.get("expectedApproverEmail", "")).strip().lower()
        override = bool(payload.get("masterOverride"))
        snapshot = payload.get("snapshot")
        stage_version_id = payload.get("stageVersionId")
        if not all((case_id, scope_key, role_key, comment)):
            raise QMSApiError(400, "결재 대상, 역할과 의견이 필요합니다.", code="INVALID_APPROVAL")
        if decision not in {"APPROVED", "REJECTED", "REVISION_REQUESTED", "SUBMITTED"}:
            raise QMSApiError(400, "지원하지 않는 결재 결정입니다.", code="INVALID_DECISION")
        roles = set(identity.user.get("roles", []))
        if expected_email and identity.user["email"].lower() != expected_email:
            if not override or "system_admin" not in roles:
                raise QMSApiError(403, "현재 인증 사용자는 지정된 결재자가 아닙니다.", code="APPROVER_MISMATCH")
            if len(comment) < 10:
                raise QMSApiError(400, "전결 사유를 10자 이상 입력해야 합니다.", code="OVERRIDE_REASON_REQUIRED")
        allowed_roles = {
            "drafter": {"stage_drafter", "case_facilitator", "quality_reviewer", "system_admin"},
            "leader": {"stage_leader", "system_admin"},
            "champion": {"stage_champion", "system_admin"},
            "quality_dispatcher": {"customer_dispatcher", "system_admin"},
        }
        required = allowed_roles.get(role_key, {"system_admin"})
        if not roles.intersection(required):
            raise QMSApiError(403, "현재 사용자 역할로 이 결재를 처리할 수 없습니다.", code="ROLE_FORBIDDEN")
        snapshot_hash = sha256_json(snapshot) if snapshot is not None else None
        with self._lock, self._connect() as db:
            cursor = db.execute(
                """INSERT INTO approval_events
                   (case_id, scope_type, scope_key, role_key, decision, comment,
                    stage_version_id, snapshot_hash, actor_user_id, actor_email,
                    expected_approver_email, master_override, occurred_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (case_id, scope_type, scope_key, role_key, decision, comment, stage_version_id, snapshot_hash,
                 identity.user["id"], identity.user["email"], expected_email or None,
                 int(override), utc_now()),
            )
            self._audit(db, identity.user["id"], identity.user["username"], "APPROVAL_RECORDED", scope_type, f"{case_id}:{scope_key}", after_hash=snapshot_hash, details={"role": role_key, "decision": decision, "override": override})
            return {"eventId": cursor.lastrowid, "occurredAt": utc_now(), "snapshotHash": snapshot_hash}

    def prepare_dispatch(self, identity: SessionIdentity, payload: dict[str, Any]) -> dict[str, Any]:
        self._require_role(identity, {"customer_dispatcher", "system_admin"})
        case_id = str(payload.get("caseId", "")).strip()
        gate_key = str(payload.get("gateKey", "")).strip()
        subject = str(payload.get("subject", "")).strip()
        note = str(payload.get("evidenceNote", "")).strip()
        report = payload.get("reportSnapshot")
        recipients = payload.get("recipients") or []
        cc = payload.get("cc") or []
        if not case_id or gate_key not in {"gate3D", "gate5D", "gate8D"} or not subject or not note:
            raise QMSApiError(400, "송부 준비에 Case, Gate, 제목과 증빙 메모가 필요합니다.", code="INVALID_DISPATCH")
        report_hash = sha256_json(report)
        with self._lock, self._connect() as db:
            cursor = db.execute(
                """INSERT INTO dispatch_outbox
                   (case_id, gate_key, report_hash, recipient_json, cc_json, subject,
                    evidence_note, provider, status, created_at, created_by)
                   VALUES (?, ?, ?, ?, ?, ?, ?, 'UNDECIDED', 'PREPARED', ?, ?)""",
                (case_id, gate_key, report_hash, canonical_json(recipients), canonical_json(cc),
                 subject, note, utc_now(), identity.user["id"]),
            )
            self._audit(db, identity.user["id"], identity.user["username"], "DISPATCH_PREPARED", "report_gate", f"{case_id}:{gate_key}", after_hash=report_hash, details={"outboxId": cursor.lastrowid, "mailProvider": "UNDECIDED", "externalSend": False})
            return {"outboxId": cursor.lastrowid, "status": "PREPARED", "provider": "UNDECIDED", "reportHash": report_hash, "externalSend": False}

    def list_outbox(self, identity: SessionIdentity, limit: int = 100) -> list[dict[str, Any]]:
        self._require_role(identity, {"customer_dispatcher", "quality_reviewer", "system_admin", "read_only_auditor"})
        with self._connect() as db:
            rows = db.execute(
                """SELECT d.*, u.username, u.name AS created_by_name
                   FROM dispatch_outbox d JOIN users u ON u.id = d.created_by
                   ORDER BY d.id DESC LIMIT ?""", (min(max(limit, 1), 500),)
            ).fetchall()
            return [dict(row) for row in rows]

    def audit_entries(self, identity: SessionIdentity, limit: int = 200) -> list[dict[str, Any]]:
        self._require_role(identity, {"system_admin", "quality_reviewer", "read_only_auditor"})
        with self._connect() as db:
            rows = db.execute("SELECT * FROM audit_logs ORDER BY id DESC LIMIT ?", (min(max(limit, 1), 1000),)).fetchall()
            return [dict(row) for row in rows]

    def similar_cases(self, identity: SessionIdentity, case_id: str, limit: int = 5) -> list[dict[str, Any]]:
        state_record = self.get_state()
        if not state_record:
            return []
        cases = state_record["state"].get("cases", [])
        target = next((case for case in cases if str(case.get("id")) == case_id), None)
        if not target:
            raise QMSApiError(404, "대상 Case를 찾을 수 없습니다.", code="CASE_NOT_FOUND")
        ranked = []
        for candidate in cases:
            if candidate is target or candidate.get("status") != "Closed":
                continue
            score, reasons = self._similarity_score(target, candidate)
            ranked.append({
                "caseId": candidate.get("id"),
                "customer": candidate.get("customer"),
                "product": candidate.get("product"),
                "claimTitle": candidate.get("claimTitle"),
                "closedAt": candidate.get("closedAt"),
                "score": round(score, 4),
                "reasons": reasons,
                "rootCauses": candidate.get("d4", {}).get("rootCauses", {}),
                "countermeasures": candidate.get("d5", {}).get("candidates", []),
                "validation": candidate.get("d6", {}).get("validationTests", []),
                "sourceCaseId": candidate.get("id"),
            })
        ranked.sort(key=lambda item: item["score"], reverse=True)
        return ranked[: min(max(limit, 1), 20)]
    def evaluate_sla_escalations(self, identity: SessionIdentity) -> list[dict[str, Any]]:
        self._require_role(identity, {"system_admin", "quality_reviewer", "case_facilitator", "stage_drafter", "stage_leader", "stage_champion", "customer_dispatcher"})
        record = self.get_state()
        if not record:
            return []
        kst = timezone(timedelta(hours=9))
        now = datetime.now(kst)

        def parse_time(value: Any) -> datetime | None:
            if not value:
                return None
            try:
                parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
                return parsed.replace(tzinfo=kst) if parsed.tzinfo is None else parsed.astimezone(kst)
            except ValueError:
                return None

        def rule_for(case: dict[str, Any]) -> tuple[float, float, float]:
            # One rule for every customer (user decision 2026-10-02): 3D 24 hours, 5D 14 days, 8D 30 days.
            base = (24.0, 14.0, 30.0)
            triage = case.get("triageApproval", {}).get("slaHours")
            try:
                triage_hours = float(triage)
                if triage_hours > 0:
                    base = (min(base[0], triage_hours), base[1], base[2])
            except (TypeError, ValueError):
                pass
            return base

        recipient_roles = {
            "L1_ATTENTION": ["case_facilitator", "customer_dispatcher"],
            "L2_CRITICAL": ["quality_reviewer", "stage_leader", "case_facilitator"],
            "L3_OVERDUE": ["stage_champion", "quality_reviewer", "system_admin"],
        }
        # An intake still waiting for quality review is not a Case yet, but its 3D clock already runs
        # from the moment it was submitted, so it is watched too.
        intake_recipient_roles = {
            "L1_ATTENTION": ["quality_reviewer"],
            "L2_CRITICAL": ["quality_reviewer", "case_facilitator"],
            "L3_OVERDUE": ["quality_reviewer", "stage_champion", "system_admin"],
        }
        waiting_statuses = {"Quality Review Pending", "Quality Review In Progress", "Revision Requested"}
        intakes = [item for item in record["state"].get("intakeQueue", []) if isinstance(item, dict) and item.get("intakeId")]
        intake_ids = {str(item["intakeId"]) for item in intakes}
        created_ids: list[int] = []
        with self._lock, self._connect() as db:
            def watch(target_id: str, milestones: list, roles: dict[str, list[str]], prefix: str) -> None:
                for milestone, due, completed, window_hours in milestones:
                    if completed:
                        db.execute(
                            "UPDATE sla_escalations SET status='RESOLVED', resolved_at=? WHERE case_id=? AND milestone=? AND status='OPEN'",
                            (utc_now(), target_id, milestone),
                        )
                        continue
                    remaining = (due - now).total_seconds() / 3600
                    critical_hours = max(4.0 if milestone == "D3" else 24.0, window_hours * 0.1)
                    if remaining < 0:
                        level = "L3_OVERDUE"
                    elif remaining <= critical_hours:
                        level = "L2_CRITICAL"
                    elif remaining <= window_hours * 0.5:
                        level = "L1_ATTENTION"
                    else:
                        continue
                    reason = f"{prefix}{milestone} SLA {'기한 초과' if remaining < 0 else '기한 임박'} ({remaining:.1f}h)"
                    db.execute(
                        """UPDATE sla_escalations
                           SET status='SUPERSEDED', resolved_at=?
                           WHERE case_id=? AND milestone=? AND status='OPEN' AND level<>?""",
                        (utc_now(), target_id, milestone, level),
                    )
                    cursor = db.execute(
                        """INSERT OR IGNORE INTO sla_escalations
                           (case_id, milestone, level, status, reason, due_at, remaining_hours,
                            recipient_roles_json, created_at)
                           VALUES (?, ?, ?, 'OPEN', ?, ?, ?, ?, ?)""",
                        (target_id, milestone, level, reason, due.isoformat(timespec="seconds"),
                         remaining, canonical_json(roles[level]), utc_now()),
                    )
                    if cursor.rowcount:
                        created_ids.append(cursor.lastrowid)
                        self._audit(db, identity.user["id"], identity.user["username"], "SLA_ESCALATED", "case_milestone", f"{target_id}:{milestone}", details={"level": level, "remainingHours": round(remaining, 2), "externalNotification": False})

            for case in record["state"].get("cases", []):
                if case.get("status") == "Closed":
                    continue
                base = parse_time(case.get("receiptDate") or case.get("createdAt"))
                if not base:
                    continue
                d3_hours, d5_days, d8_days = rule_for(case)
                gates = case.get("gates", {})
                watch(str(case.get("id")), [
                    ("D3", base + timedelta(hours=d3_hours), parse_time(gates.get("gate3D", {}).get("dispatchDate")), d3_hours),
                    ("D5", base + timedelta(days=d5_days), parse_time(gates.get("gate5D", {}).get("dispatchDate")), d5_days * 24),
                    ("D8", base + timedelta(days=d8_days), parse_time(gates.get("gate8D", {}).get("dispatchDate") or case.get("closedAt")), d8_days * 24),
                ], recipient_roles, "")
            for item in intakes:
                intake_id = str(item["intakeId"])
                base = parse_time(item.get("submittedAt"))
                if item.get("status") not in waiting_statuses or not base:
                    # Approved intakes continue under their Case; rejected ones no longer have a deadline.
                    db.execute("UPDATE sla_escalations SET status='RESOLVED', resolved_at=? WHERE case_id=? AND status='OPEN'", (utc_now(), intake_id))
                    continue
                watch(intake_id, [("D3", base + timedelta(hours=24.0), None, 24.0)], intake_recipient_roles, "품질 검토 대기 · ")
            rows = db.execute(
                "SELECT * FROM sla_escalations WHERE status='OPEN' ORDER BY CASE level WHEN 'L3_OVERDUE' THEN 1 WHEN 'L2_CRITICAL' THEN 2 ELSE 3 END, due_at ASC"
            ).fetchall()
            result = [{
                "id": row["id"], "caseId": row["case_id"], "milestone": row["milestone"],
                "level": row["level"], "status": row["status"], "reason": row["reason"],
                "dueAt": row["due_at"], "remainingHours": row["remaining_hours"],
                "recipientRoles": json.loads(row["recipient_roles_json"]), "createdAt": row["created_at"],
                "targetType": "intake" if row["case_id"] in intake_ids else "case",
                "externalNotification": False,
            } for row in rows]
        # Mail goes out after the database work, so a slow mail server never holds the lock.
        team_emails = {str(c.get("id")): self._team_emails(c) for c in record["state"].get("cases", []) if isinstance(c, dict)}
        self._mail_sla_escalations(result, created_ids, team_emails)
        return result


    @staticmethod
    def _similarity_score(target: dict[str, Any], candidate: dict[str, Any]) -> tuple[float, list[str]]:
        score = 0.0
        reasons: list[str] = []
        fields = [
            ("partNumber", 0.25, "동일 품번"),
            ("product", 0.20, "동일 제품"),
            ("customer", 0.12, "동일 고객"),
            ("mfgSite", 0.10, "동일 제조처"),
            ("incidentSite", 0.08, "동일 발생 위치"),
            ("severityLevel", 0.05, "동일 Severity"),
        ]
        for key, weight, label in fields:
            left = str(target.get(key, "")).strip().lower()
            right = str(candidate.get(key, "")).strip().lower()
            if left and right and left == right:
                score += weight
                reasons.append(label)
        target_text = " ".join(str(target.get(key, "")) for key in ("claimTitle", "product", "partNumber", "incidentSite"))
        candidate_text = " ".join(str(candidate.get(key, "")) for key in ("claimTitle", "product", "partNumber", "incidentSite"))
        left_tokens = set(re.findall(r"[0-9A-Za-z가-힣]{2,}", target_text.lower()))
        right_tokens = set(re.findall(r"[0-9A-Za-z가-힣]{2,}", candidate_text.lower()))
        if left_tokens and right_tokens:
            jaccard = len(left_tokens & right_tokens) / len(left_tokens | right_tokens)
            score += 0.20 * jaccard
            if jaccard >= 0.2:
                reasons.append(f"불량 설명 키워드 유사 {round(jaccard * 100)}%")
        return min(score, 1.0), reasons

    def build_d1_d3_draft(self, identity: SessionIdentity, case: dict[str, Any]) -> dict[str, Any]:
        """Safe deterministic fallback driven only by the supplied intake facts."""
        if not isinstance(case, dict) or not case.get("id"):
            raise QMSApiError(400, "Case 정보가 필요합니다.", code="INVALID_CASE")
        product = str(case.get("product") or "[제품 확인 필요]")
        lot = str(case.get("lotNumber") or "[LOT 확인 필요]")
        customer = str(case.get("customer") or "[고객사 확인 필요]")
        claim = str(case.get("claimTitle") or "[불량 현상 확인 필요]")
        incident = str(case.get("incidentSite") or "[발생 위치 확인 필요]")
        defect_qty = case.get("defectQty")
        inspect_qty = case.get("inspectQty")
        fact_qty = f"{defect_qty} / {inspect_qty}ea" if isinstance(defect_qty, (int, float)) and isinstance(inspect_qty, (int, float)) and inspect_qty else "[수량 확인 필요]"
        source_refs = [item.get("id") for item in case.get("evidenceList", []) if isinstance(item, dict) and item.get("id")]
        return {
            "generatedAt": utc_now(),
            "engine": "server-safe-rules-v1",
            "caseId": case["id"],
            "guardrails": {"autoComplete": False, "autoApprove": False, "inventMeasurements": False},
            "d1": {
                "status": "AI Suggested - Human Review Required",
                "leadDepartment": case.get("leadDepartment") or case.get("triageApproval", {}).get("leadDepartment") or "품질혁신팀",
                "recommendationBasis": [product, case.get("severityLevel"), "조직도 역할 규칙"],
            },
            "d2": {
                "problemWhat": claim,
                "problemWhere": incident,
                "problemWhen": case.get("incidentDate") or case.get("receiptDate") or "[발생 시점 확인 필요]",
                "problemWho": f"{customer} 접수 담당자 및 내부 품질 검토자",
                "problemWhich": f"{product}, P/N {case.get('partNumber') or '[품번 확인 필요]'}, LOT {lot}",
                "problemHow": "[발생 조건 및 재현 방법 확인 필요]",
                "problemHowMany": fact_qty,
                "problemStatement": f"{customer}의 {incident}에서 {product} LOT {lot}에 대해 '{claim}' 부적합이 접수되었습니다. 현재 확인된 수량은 {fact_qty}이며, 발생 조건과 원인은 추가 Evidence 확인이 필요합니다.",
                "isIsNot": [
                    {"factor": "제품/LOT", "is": f"{product} / {lot}", "isNot": "[비발생 제품·LOT 확인 필요]", "difference": "[차이 확인 필요]", "verificationStatus": "Pending"},
                    {"factor": "발생 위치", "is": incident, "isNot": "[비발생 위치 확인 필요]", "difference": "[차이 확인 필요]", "verificationStatus": "Pending"},
                    {"factor": "불량 현상", "is": claim, "isNot": "[정상 또는 비발생 현상 확인 필요]", "difference": "[차이 확인 필요]", "verificationStatus": "Pending"},
                ],
                "sourceReferences": source_refs,
                "humanConfirmed": False,
            },
            "d3": {
                "lotScope": {
                    "affectedLot": lot,
                    "adjacentLots": "[전후 LOT 확인 필요]",
                    "rawMaterialBatch": "[원자재 Batch 확인 필요]",
                    "equipment": "[관련 설비·Recipe 확인 필요]",
                    "rationale": "접수된 LOT와 동일 공정·자재·설비 조건의 영향 범위를 ERP/MES/WMS 원본으로 확인해야 합니다.",
                },
                "materialFlow": [],
                "actions": [
                    {"id": "ICA-PROP-01", "target": "사내 창고·출하대기 재고", "action": f"{product} LOT {lot}의 ERP/WMS 재고와 출하 상태를 확인하고 필요 시 Hold 승인 요청", "owner": "[물류/봉쇄 담당자 지정 필요]", "due": "[기한 지정 필요]", "status": "Open", "result": ""},
                    {"id": "ICA-PROP-02", "target": "제조·외주 공정 재공", "action": "MES 및 외주 생산기록에서 동일 LOT·설비·자재 조건 재공 범위를 확인", "owner": "[공정/외주 담당자 지정 필요]", "due": "[기한 지정 필요]", "status": "Open", "result": ""},
                    {"id": "ICA-PROP-03", "target": "고객사 보유·라인 투입 재고", "action": f"{customer}와 영향 범위 및 임시 선별 기준을 협의하고 확인 결과를 Evidence로 등록", "owner": "[고객 대응 담당자 지정 필요]", "due": "[기한 지정 필요]", "status": "Open", "result": ""},
                ],
                "effectiveness": {"noAdditionalClaim": "pending", "lineStable": "pending", "stockReconciled": "pending", "verificationEvidence": ""},
                "sourceReferences": source_refs,
                "humanConfirmed": False,
            },
            "confirmedFacts": [f"고객사: {customer}", f"제품/LOT: {product} / {lot}", f"접수 불량: {claim}", f"접수 수량: {fact_qty}"],
            "missingInformation": ["비발생 비교군", "전후 LOT", "ERP/MES/WMS 실제 수량", "발생 조건", "봉쇄 실행 Evidence"],
        }

    def _require_role(self, identity: SessionIdentity, allowed: set[str]) -> None:
        roles = set(identity.user.get("roles", []))
        if not roles.intersection(allowed):
            raise QMSApiError(403, "현재 사용자에게 이 작업 권한이 없습니다.", code="ROLE_FORBIDDEN")

    @staticmethod
    def _audit(
        db: sqlite3.Connection,
        user_id: int | None,
        username: str | None,
        action: str,
        target_type: str,
        target_id: str | None,
        *,
        before_hash: str | None = None,
        after_hash: str | None = None,
        details: dict[str, Any],
    ) -> None:
        db.execute(
            """INSERT INTO audit_logs
               (occurred_at, user_id, username, action, target_type, target_id,
                before_hash, after_hash, details_json)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (utc_now(), user_id, username, action, target_type, target_id,
             before_hash, after_hash, canonical_json(details)),
        )
