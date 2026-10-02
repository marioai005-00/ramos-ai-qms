"""Governed Agent Unit runtime for the RAMOS 8D QMS.

The runtime is intentionally deterministic at its control boundary: AI may
produce drafts through existing provider routes, but only this module owns run
state, validation, policy checks, retries and human approval.  It never sends
external e-mail or writes to MES/ERP.
"""

from __future__ import annotations

import base64
import hashlib
import json
import os
import re
import sqlite3
import threading
from datetime import datetime, timedelta, timezone
from typing import Any

from qms_backend import QMSApiError, QMSStore, SessionIdentity, canonical_json, public_user, utc_now


UTC = timezone.utc
RUN_STATES = {
    "CREATED", "PARSING_REQUEST", "COLLECTING", "VALIDATING", "ANALYZING",
    "DRAFT_READY", "AWAITING_CONFIRMATION", "AWAITING_APPROVAL", "APPROVED",
    "EXECUTING", "COMPLETED", "RETRY_SCHEDULED", "NEEDS_HUMAN", "FAILED", "CANCELLED",
}
FINAL_STATES = {"COMPLETED", "FAILED", "CANCELLED"}
MUTATING_ROLES = {
    "system_admin", "quality_reviewer", "case_facilitator", "stage_drafter",
    "stage_leader", "stage_champion", "customer_dispatcher",
}
APPROVER_ROLES = {"system_admin", "quality_reviewer", "case_facilitator", "stage_leader", "stage_champion"}


def _json(value: Any) -> str:
    return canonical_json(value)


def _parse_json(value: str | None, fallback: Any) -> Any:
    try:
        return json.loads(value) if value else fallback
    except (TypeError, ValueError):
        return fallback


def _next_time(seconds: int) -> str:
    return (datetime.now(UTC) + timedelta(seconds=seconds)).isoformat(timespec="seconds")


class AgentRuntime:
    """Persistent, auditable orchestration service layered on ``QMSStore``."""

    def __init__(self, store: QMSStore):
        self.store = store
        self._lock = threading.RLock()
        self._stop_event = threading.Event()
        self._scheduler_thread: threading.Thread | None = None
        self._initialize()

    def _initialize(self) -> None:
        with self._lock, self.store._connect() as db:
            db.executescript(
                """
                CREATE TABLE IF NOT EXISTS agent_runs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    case_id TEXT,
                    requested_by INTEGER REFERENCES users(id),
                    requested_by_username TEXT NOT NULL,
                    trigger_type TEXT NOT NULL,
                    request_text TEXT NOT NULL,
                    intent TEXT NOT NULL,
                    status TEXT NOT NULL,
                    risk_level TEXT NOT NULL DEFAULT 'UNASSESSED',
                    input_json TEXT NOT NULL DEFAULT '{}',
                    result_json TEXT NOT NULL DEFAULT '{}',
                    idempotency_key TEXT NOT NULL UNIQUE,
                    case_revision INTEGER,
                    policy_version TEXT NOT NULL DEFAULT 'QMS-POLICY-1',
                    model_contract_version TEXT NOT NULL DEFAULT 'AGENT-OUTPUT-1',
                    retry_count INTEGER NOT NULL DEFAULT 0,
                    next_retry_at TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    completed_at TEXT
                );
                CREATE INDEX IF NOT EXISTS idx_agent_runs_case ON agent_runs(case_id, id DESC);
                CREATE INDEX IF NOT EXISTS idx_agent_runs_status ON agent_runs(status, id DESC);

                CREATE TABLE IF NOT EXISTS agent_steps (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    run_id INTEGER NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
                    unit_type TEXT NOT NULL,
                    agent_name TEXT NOT NULL,
                    status TEXT NOT NULL,
                    input_hash TEXT,
                    output_json TEXT NOT NULL DEFAULT '{}',
                    confidence REAL,
                    retry_count INTEGER NOT NULL DEFAULT 0,
                    error_code TEXT,
                    started_at TEXT NOT NULL,
                    completed_at TEXT
                );
                CREATE INDEX IF NOT EXISTS idx_agent_steps_run ON agent_steps(run_id, id);

                CREATE TABLE IF NOT EXISTS source_artifacts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    case_id TEXT NOT NULL,
                    run_id INTEGER REFERENCES agent_runs(id),
                    source_type TEXT NOT NULL,
                    original_name TEXT NOT NULL,
                    mime_type TEXT NOT NULL,
                    byte_size INTEGER NOT NULL DEFAULT 0,
                    sha256 TEXT NOT NULL,
                    logical_uri TEXT,
                    extracted_json TEXT NOT NULL DEFAULT '{}',
                    extraction_status TEXT NOT NULL DEFAULT 'REGISTERED',
                    page_or_sheet TEXT,
                    created_at TEXT NOT NULL,
                    created_by INTEGER NOT NULL REFERENCES users(id),
                    UNIQUE(case_id, sha256)
                );
                CREATE INDEX IF NOT EXISTS idx_source_artifacts_case ON source_artifacts(case_id, id DESC);

                CREATE TABLE IF NOT EXISTS data_quality_findings (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    case_id TEXT NOT NULL,
                    run_id INTEGER REFERENCES agent_runs(id),
                    finding_code TEXT NOT NULL,
                    severity TEXT NOT NULL,
                    field_name TEXT,
                    raw_value_json TEXT,
                    comparison_value_json TEXT,
                    description TEXT NOT NULL,
                    evidence_json TEXT NOT NULL DEFAULT '[]',
                    status TEXT NOT NULL DEFAULT 'OPEN',
                    resolution_comment TEXT,
                    resolved_by INTEGER REFERENCES users(id),
                    created_at TEXT NOT NULL,
                    resolved_at TEXT,
                    UNIQUE(run_id, finding_code, field_name)
                );
                CREATE INDEX IF NOT EXISTS idx_quality_case ON data_quality_findings(case_id, status, severity);

                CREATE TABLE IF NOT EXISTS policy_rules (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    rule_type TEXT NOT NULL,
                    scope_type TEXT NOT NULL,
                    scope_value TEXT NOT NULL,
                    version TEXT NOT NULL,
                    effective_from TEXT NOT NULL,
                    rule_json TEXT NOT NULL,
                    active INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT NOT NULL,
                    UNIQUE(rule_type, scope_type, scope_value, version)
                );

                CREATE TABLE IF NOT EXISTS agent_exceptions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    run_id INTEGER NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
                    step_id INTEGER REFERENCES agent_steps(id),
                    error_code TEXT NOT NULL,
                    safe_message TEXT NOT NULL,
                    internal_summary TEXT NOT NULL,
                    retryable INTEGER NOT NULL DEFAULT 0,
                    retry_count INTEGER NOT NULL DEFAULT 0,
                    next_retry_at TEXT,
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS scheduled_jobs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    job_type TEXT NOT NULL UNIQUE,
                    interval_seconds INTEGER NOT NULL,
                    last_run_at TEXT,
                    next_run_at TEXT NOT NULL,
                    locked_by TEXT,
                    locked_until TEXT,
                    active INTEGER NOT NULL DEFAULT 1,
                    last_status TEXT,
                    last_result_json TEXT NOT NULL DEFAULT '{}',
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS internal_notifications (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    case_id TEXT,
                    run_id INTEGER REFERENCES agent_runs(id),
                    notification_type TEXT NOT NULL,
                    severity TEXT NOT NULL,
                    title TEXT NOT NULL,
                    message TEXT NOT NULL,
                    recipient_roles_json TEXT NOT NULL DEFAULT '[]',
                    status TEXT NOT NULL DEFAULT 'OPEN',
                    created_at TEXT NOT NULL,
                    resolved_at TEXT
                );
                CREATE INDEX IF NOT EXISTS idx_agent_notifications ON internal_notifications(status, id DESC);
                """
            )
            now = utc_now()
            policies = [
                ("REQUIRED_FIELDS", "GLOBAL", "*", "QMS-POLICY-1", {"fields": ["customer", "product", "claimTitle"]}),
                ("RISK_SCORING", "GLOBAL", "*", "QMS-POLICY-1", {"critical": 70, "high": 45, "medium": 20}),
                ("AGENT_GUARDRAIL", "GLOBAL", "*", "QMS-POLICY-1", {
                    "humanApprovalRequired": True,
                    "externalEmailEnabled": False,
                    "externalMessengerEnabled": False,
                    "externalSystemWriteEnabled": False,
                }),
            ]
            for rule_type, scope_type, scope_value, version, body in policies:
                db.execute(
                    """INSERT OR IGNORE INTO policy_rules
                       (rule_type, scope_type, scope_value, version, effective_from, rule_json, active, created_at)
                       VALUES (?, ?, ?, ?, ?, ?, 1, ?)""",
                    (rule_type, scope_type, scope_value, version, now, _json(body), now),
                )
            interval = max(30, int(os.environ.get("QMS_SCHEDULER_INTERVAL_SECONDS", "60") or 60))
            db.execute(
                """INSERT OR IGNORE INTO scheduled_jobs
                   (job_type, interval_seconds, next_run_at, active, last_result_json, updated_at)
                   VALUES ('SLA_WATCHDOG', ?, ?, 1, '{}', ?)""",
                (interval, now, now),
            )
            db.execute("""INSERT INTO schema_meta(key, value) VALUES('schema_version', '3')
                          ON CONFLICT(key) DO UPDATE SET value = CASE
                            WHEN CAST(schema_meta.value AS INTEGER) < 3 THEN '3'
                            ELSE schema_meta.value
                          END""")

    @staticmethod
    def _roles(identity: SessionIdentity) -> set[str]:
        return set(identity.user.get("roles") or [])

    def _require_roles(self, identity: SessionIdentity, allowed: set[str]) -> None:
        if not self._roles(identity).intersection(allowed):
            raise QMSApiError(403, "현재 사용자 역할로 Agent 작업을 수행할 수 없습니다.", code="ROLE_FORBIDDEN")

    def _state_and_case(self, identity: SessionIdentity, case_id: str | None, *, required: bool = False) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
        record = self.store.get_state()
        if not record:
            if required:
                raise QMSApiError(404, "중앙 Case 데이터가 없습니다.", code="CASE_NOT_FOUND")
            return None, None
        case = next((item for item in record["state"].get("cases", []) if str(item.get("id")) == str(case_id)), None)
        if required and case is None:
            raise QMSApiError(404, "대상 Case를 찾을 수 없습니다.", code="CASE_NOT_FOUND")
        if case is not None and "supplier_user" in self._roles(identity):
            allowed_emails = {
                str(case.get("supplierEmail", "")).lower(),
                str(case.get("assignedSupplierEmail", "")).lower(),
            }
            if identity.user["email"].lower() not in allowed_emails:
                raise QMSApiError(403, "해당 Case에 접근할 권한이 없습니다.", code="CASE_ACCESS_FORBIDDEN")
        return record, case

    def parse_request(self, request_text: str, supplied_case_id: str | None = None) -> dict[str, Any]:
        text = (request_text or "").strip()
        if not text:
            raise QMSApiError(400, "Agent 요청 문장이 필요합니다.", code="INVALID_AGENT_REQUEST")
        upper = text.upper()
        case_match = re.search(r"\bCASE[-_A-Z0-9]+\b", upper)
        case_id = supplied_case_id or (case_match.group(0) if case_match else None)
        stage_match = re.search(r"\bD([1-8])\b", upper)
        stage = f"D{stage_match.group(1)}" if stage_match else None
        if any(word in text for word in ("초안", "작성", "생성")) and (stage in {"D1", "D2", "D3"} or "D1~D3" in upper or "D1-D3" in upper):
            intent = "CREATE_D1_D3_DRAFT"
        elif any(word in text for word in ("초안", "작성", "생성")) and stage in {"D5", "D6", "D7"}:
            intent = "CREATE_CORRECTIVE_ACTION_DRAFT"
        elif any(word in text for word in ("보고서", "리포트", "REPORT")) or (stage == "D8" and any(word in text for word in ("초안", "작성", "생성"))):
            intent = "CREATE_REPORT_DRAFT"
        elif any(word in text for word in ("지연", "기한", "SLA", "에스컬레이션")):
            intent = "EVALUATE_SLA"
        elif any(word in text for word in ("대조", "검증", "품질", "누락")):
            intent = "VALIDATE_CASE"
        elif any(word in text for word in ("유사", "과거", "재발")):
            intent = "SEARCH_SIMILAR_CASES"
        elif any(word in text for word in ("원인", "D4", "분석")):
            intent = "ANALYZE_ROOT_CAUSE"
        else:
            intent = "REVIEW_CASE"
        case_required = intent not in {"EVALUATE_SLA"}
        ambiguities = []
        if case_required and not case_id:
            ambiguities.append("대상 Case 번호가 필요합니다.")
        return {
            "intent": intent,
            "caseId": case_id,
            "stage": stage,
            "customer": None,
            "period": {"from": None, "to": None},
            "scope": [],
            "requestedOutput": "draft" if "DRAFT" in intent else "analysis",
            "constraints": ["NO_EXTERNAL_EMAIL", "NO_AUTOMATIC_GATE_COMPLETION", "HUMAN_APPROVAL_REQUIRED"],
            "ambiguities": ambiguities,
            "requiresConfirmation": bool(ambiguities),
        }

    def _insert_step(self, db: sqlite3.Connection, run_id: int, unit_type: str, agent_name: str, status: str, input_value: Any, output: Any, confidence: float | None = None, error_code: str | None = None) -> int:
        now = utc_now()
        cursor = db.execute(
            """INSERT INTO agent_steps
               (run_id, unit_type, agent_name, status, input_hash, output_json,
                confidence, error_code, started_at, completed_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (run_id, unit_type, agent_name, status, hashlib.sha256(_json(input_value).encode("utf-8")).hexdigest(),
             _json(output), confidence, error_code, now, now if status in {"COMPLETED", "FAILED"} else None),
        )
        return cursor.lastrowid

    def _finding(self, code: str, severity: str, field: str | None, description: str, raw: Any = None, comparison: Any = None, evidence: list[Any] | None = None) -> dict[str, Any]:
        return {
            "code": code, "severity": severity, "field": field, "description": description,
            "rawValue": raw, "comparisonValue": comparison, "evidence": evidence or [],
        }

    def validate_case(self, case: dict[str, Any]) -> list[dict[str, Any]]:
        findings: list[dict[str, Any]] = []
        for field, label in (("customer", "고객"), ("product", "제품"), ("claimTitle", "불량 현상")):
            if not str(case.get(field, "")).strip():
                findings.append(self._finding("MISSING_REQUIRED_DATA", "CRITICAL", field, f"{label} 정보가 누락되었습니다."))
        defect = case.get("defectQty")
        inspected = case.get("inspectQty")
        if isinstance(defect, (int, float)) and defect < 0:
            findings.append(self._finding("NEGATIVE_QUANTITY", "CRITICAL", "defectQty", "불량 수량은 음수일 수 없습니다.", defect))
        if isinstance(inspected, (int, float)) and inspected < 0:
            findings.append(self._finding("NEGATIVE_QUANTITY", "CRITICAL", "inspectQty", "검사 수량은 음수일 수 없습니다.", inspected))
        if isinstance(defect, (int, float)) and isinstance(inspected, (int, float)) and defect > inspected:
            findings.append(self._finding("DEFECT_EXCEEDS_INSPECTION", "CRITICAL", "defectQty", "불량 수량이 검사 수량보다 큽니다.", defect, inspected))
        receipt = case.get("receiptDate")
        occurrence = case.get("occurrenceDate") or case.get("incidentDate")
        if receipt and occurrence:
            try:
                receipt_dt = datetime.fromisoformat(str(receipt).replace("Z", "+00:00"))
                occurrence_dt = datetime.fromisoformat(str(occurrence).replace("Z", "+00:00"))
                if occurrence_dt > receipt_dt:
                    findings.append(self._finding("DATE_SEQUENCE_ERROR", "HIGH", "occurrenceDate", "발생일이 접수일보다 늦습니다.", occurrence, receipt))
            except ValueError:
                findings.append(self._finding("INVALID_DATE", "HIGH", "receiptDate", "날짜 형식을 해석할 수 없습니다.", {"receiptDate": receipt, "occurrenceDate": occurrence}))
        if case.get("status") == "Closed" and not (case.get("closedAt") or case.get("gates", {}).get("gate8D", {}).get("dispatchDate")):
            findings.append(self._finding("CLOSURE_EVIDENCE_MISSING", "CRITICAL", "closedAt", "종결 Case에 D8 완료 또는 종결 시각 증빙이 없습니다."))
        return findings

    @staticmethod
    def normalize_case(case: dict[str, Any]) -> tuple[dict[str, Any], list[dict[str, Any]]]:
        normalized = dict(case)
        changes: list[dict[str, Any]] = []
        customer_aliases = {"lge": "LGE", "lg electronics": "LGE", "samsung": "SAMSUNG", "sk hynix": "SK HYNIX", "hynix": "SK HYNIX"}
        for field in ("customer", "product", "partNumber", "lotNumber", "claimTitle"):
            raw = case.get(field)
            if not isinstance(raw, str):
                continue
            clean = " ".join(raw.strip().split())
            if field == "customer":
                clean = customer_aliases.get(clean.lower(), clean)
            elif field in {"partNumber", "lotNumber"}:
                clean = clean.upper().replace(" ", "")
            normalized[field] = clean
            if clean != raw:
                changes.append({"field": field, "rawValue": raw, "normalizedValue": clean, "rule": f"{field.upper()}_NORMALIZATION_V1"})
        for field in ("defectQty", "inspectQty"):
            raw = case.get(field)
            if isinstance(raw, str) and raw.strip().isdigit():
                normalized[field] = int(raw.strip())
                changes.append({"field": field, "rawValue": raw, "normalizedValue": normalized[field], "rule": "INTEGER_QUANTITY_V1"})
        return normalized, changes

    def _source_context(self, case_id: str, case: dict[str, Any]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
        with self.store._connect() as db:
            rows = db.execute("SELECT * FROM source_artifacts WHERE case_id=? ORDER BY id", (case_id,)).fetchall()
        references, findings = [], []
        for row in rows:
            extracted = _parse_json(row["extracted_json"], {})
            references.append({"sourceId": row["id"], "name": row["original_name"], "sha256": row["sha256"], "pageOrSheet": row["page_or_sheet"]})
            for field in ("customer", "partNumber", "lotNumber"):
                source_value = extracted.get(field)
                case_value = case.get(field)
                if source_value in (None, "") or case_value in (None, ""):
                    continue
                normalized_source, _ = self.normalize_case({field: source_value})
                if str(normalized_source.get(field)) != str(case_value):
                    findings.append(self._finding(
                        "SOURCE_CASE_MISMATCH", "HIGH", field,
                        f"Evidence Source의 {field} 값이 중앙 Case와 일치하지 않습니다.",
                        source_value, case_value, [{"sourceId": row["id"], "sha256": row["sha256"]}],
                    ))
        return references, findings

    @staticmethod
    def _risk(case: dict[str, Any], findings: list[dict[str, Any]]) -> tuple[str, int]:
        score = 0
        score += 35 if case.get("safetyRisk") else 0
        score += 25 if case.get("lineStop") else 0
        score += 20 if case.get("recurrentDefect") else 0
        score += 25 * sum(1 for item in findings if item["severity"] == "CRITICAL")
        score += 10 * sum(1 for item in findings if item["severity"] == "HIGH")
        if score >= 70:
            return "CRITICAL", min(score, 100)
        if score >= 45:
            return "HIGH", score
        if score >= 20:
            return "MEDIUM", score
        return "LOW", score

    def _store_findings(self, db: sqlite3.Connection, run_id: int, case_id: str, findings: list[dict[str, Any]]) -> None:
        for item in findings:
            db.execute(
                """INSERT OR IGNORE INTO data_quality_findings
                   (case_id, run_id, finding_code, severity, field_name, raw_value_json,
                    comparison_value_json, description, evidence_json, status, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', ?)""",
                (case_id, run_id, item["code"], item["severity"], item.get("field"), _json(item.get("rawValue")),
                 _json(item.get("comparisonValue")), item["description"], _json(item.get("evidence", [])), utc_now()),
            )

    def create_run(self, identity: SessionIdentity, payload: dict[str, Any]) -> dict[str, Any]:
        self._require_roles(identity, MUTATING_ROLES)
        trigger = str(payload.get("triggerType", "NATURAL_LANGUAGE")).upper()
        if trigger not in {"NATURAL_LANGUAGE", "EVENT", "SCHEDULE", "MANUAL"}:
            raise QMSApiError(400, "지원하지 않는 Agent Trigger입니다.", code="INVALID_TRIGGER")
        request_text = str(payload.get("requestText", "")).strip()
        parsed = self.parse_request(request_text, str(payload.get("caseId") or "").strip() or None)
        idempotency_key = str(payload.get("idempotencyKey", "")).strip()
        if not idempotency_key:
            idempotency_key = hashlib.sha256(f"{identity.user['id']}:{trigger}:{request_text}:{parsed.get('caseId')}".encode("utf-8")).hexdigest()
        if len(idempotency_key) > 160:
            raise QMSApiError(400, "멱등키가 너무 깁니다.", code="INVALID_IDEMPOTENCY_KEY")
        record, case = self._state_and_case(identity, parsed.get("caseId"), required=not parsed["requiresConfirmation"] and parsed["intent"] != "EVALUATE_SLA")
        now = utc_now()
        with self._lock, self.store._connect() as db:
            existing = db.execute("SELECT id FROM agent_runs WHERE idempotency_key = ?", (idempotency_key,)).fetchone()
            if existing:
                return self.get_run(identity, existing["id"])
            status = "AWAITING_CONFIRMATION" if parsed["requiresConfirmation"] else "CREATED"
            cursor = db.execute(
                """INSERT INTO agent_runs
                   (case_id, requested_by, requested_by_username, trigger_type, request_text,
                    intent, status, input_json, result_json, idempotency_key, case_revision,
                    created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, '{}', ?, ?, ?, ?)""",
                (parsed.get("caseId"), identity.user["id"], identity.user["username"], trigger, request_text,
                 parsed["intent"], status, _json(parsed), idempotency_key,
                 record["revision"] if record else None, now, now),
            )
            run_id = cursor.lastrowid
            self._insert_step(db, run_id, "NATURAL_LANGUAGE_INTERPRETATION", "Intake Orchestrator", "COMPLETED", {"requestText": request_text}, parsed, 1.0 if not parsed["ambiguities"] else 0.5)
            self.store._audit(db, identity.user["id"], identity.user["username"], "AGENT_RUN_CREATED", "agent_run", str(run_id), details={"triggerType": trigger, "intent": parsed["intent"], "caseId": parsed.get("caseId")})
        if parsed["requiresConfirmation"]:
            return self.get_run(identity, run_id)
        return self._execute(identity, run_id, case)

    def _execute(self, identity: SessionIdentity, run_id: int, case: dict[str, Any] | None = None) -> dict[str, Any]:
        with self._lock, self.store._connect() as db:
            run = db.execute("SELECT * FROM agent_runs WHERE id = ?", (run_id,)).fetchone()
            if not run:
                raise QMSApiError(404, "Agent Run을 찾을 수 없습니다.", code="AGENT_RUN_NOT_FOUND")
            if run["status"] in FINAL_STATES:
                return self._serialize_run(db, run)
            db.execute("UPDATE agent_runs SET status='VALIDATING', updated_at=? WHERE id=?", (utc_now(), run_id))
        intent = run["intent"]
        if case is None and run["case_id"]:
            _, case = self._state_and_case(identity, run["case_id"], required=True)
        case = case or {}
        try:
            normalized_case, normalization_changes = self.normalize_case(case)
            evidence_references, cross_findings = self._source_context(str(run["case_id"]), normalized_case) if run["case_id"] else ([], [])
            findings = (self.validate_case(normalized_case) if run["case_id"] else []) + cross_findings
            inspected = normalized_case.get("inspectQty")
            defect = normalized_case.get("defectQty")
            aggregation = {
                "defectQty": defect if isinstance(defect, (int, float)) else None,
                "inspectQty": inspected if isinstance(inspected, (int, float)) else None,
                "defectRatePct": round((defect / inspected) * 100, 6) if isinstance(defect, (int, float)) and isinstance(inspected, (int, float)) and inspected > 0 else None,
                "sourceCount": len(evidence_references),
            }
            risk_level, risk_score = self._risk(normalized_case, findings)
            result: dict[str, Any] = {
                "facts": [], "inferences": [], "unknowns": [],
                "dataQualityFindings": findings, "policyViolations": [], "recommendations": [],
                "evidenceReferences": evidence_references, "confidence": 1.0 if not findings else 0.75,
                "reasoningSummary": "등록된 Case와 Evidence 메타데이터를 규칙 기반으로 검증했습니다.",
                "requiresHumanApproval": intent not in {"EVALUATE_SLA", "SEARCH_SIMILAR_CASES", "VALIDATE_CASE", "REVIEW_CASE"},
                "prohibitedAutomaticActions": ["AUTO_APPROVE", "AUTO_COMPLETE_GATE", "EXTERNAL_EMAIL", "EXTERNAL_SYSTEM_WRITE"],
                "risk": {"level": risk_level, "score": risk_score},
                "standardization": normalization_changes,
                "aggregation": aggregation,
            }
            if normalized_case:
                for key in ("id", "customer", "product", "partNumber", "lotNumber", "claimTitle", "defectQty", "inspectQty"):
                    if normalized_case.get(key) not in (None, ""):
                        result["facts"].append({"field": key, "value": normalized_case.get(key), "source": "central_case"})
            if intent == "CREATE_D1_D3_DRAFT":
                result["draft"] = self.store.build_d1_d3_draft(identity, normalized_case)
                result["recommendations"].append("D1~D3 초안을 검토하고 실제 담당자가 승인하십시오.")
            elif intent == "CREATE_CORRECTIVE_ACTION_DRAFT":
                result["draft"] = {
                    "d5": {"status": "Human Review Required", "candidates": [], "sourceRootCauses": normalized_case.get("d4", {}).get("rootCauses", {})},
                    "d6": {"status": "Human Review Required", "validationTests": [], "humanConfirmed": False},
                    "d7": {"status": "Human Review Required", "systemUpdates": [], "horizontalDeployment": [], "humanConfirmed": False},
                }
                result["unknowns"].append("시정조치 담당자·완료일·검증 측정값은 사람이 입력해야 합니다.")
                result["recommendations"].append("D4의 승인된 원인과 각 D5 조치를 1:1로 연결하십시오.")
            elif intent == "CREATE_REPORT_DRAFT":
                result["draft"] = {"report": {
                    "caseId": normalized_case.get("id"),
                    "customer": normalized_case.get("customer"),
                    "product": normalized_case.get("product"),
                    "problem": normalized_case.get("claimTitle"),
                    "caseRevision": run["case_revision"],
                    "sectionAvailability": {f"D{number}": bool(normalized_case.get(f"d{number}")) for number in range(1, 9)},
                    "metrics": aggregation,
                    "status": "Human Review Required",
                    "dispatchStatus": "NOT_READY",
                    "externalSend": False,
                }}
                result["recommendations"].append("누락된 8D 단계와 열린 품질 항목을 해결한 뒤 공식 보고서 결재를 진행하십시오.")
            elif intent == "SEARCH_SIMILAR_CASES":
                result["similarCases"] = self.store.similar_cases(identity, str(run["case_id"]), 5)
            elif intent == "EVALUATE_SLA":
                result["escalations"] = self.store.evaluate_sla_escalations(identity)
                result["requiresHumanApproval"] = False
            elif intent == "ANALYZE_ROOT_CAUSE":
                result["unknowns"].append("근본원인은 실제 Evidence와 검증 시험 없이 확정할 수 없습니다.")
                result["recommendations"].extend([
                    "발생원인과 유출원인을 분리해 Evidence를 연결하십시오.",
                    "5-Why 후보별 반증 시험을 등록하십시오.",
                ])
                result["draft"] = {"d4": {
                    "status": "Hypothesis Only",
                    "occurrenceCauses": [], "escapeCauses": [], "counterEvidence": [],
                    "recommendedChecks": ["발생원인 후보별 반증 시험", "유출원인 검출 Gate 확인"],
                    "humanConfirmed": False,
                }}
            else:
                result["recommendations"].append("열린 데이터 품질 항목을 해결한 뒤 다음 Gate로 진행하십시오.")
            critical = [item for item in findings if item["severity"] == "CRITICAL"]
            if critical:
                result["policyViolations"].append({"code": "CRITICAL_DATA_QUALITY_OPEN", "message": "Critical 데이터 품질 항목이 열려 있습니다."})
            status = "AWAITING_APPROVAL" if result["requiresHumanApproval"] else "COMPLETED"
            with self._lock, self.store._connect() as db:
                self._store_findings(db, run_id, str(run["case_id"] or "GLOBAL"), findings)
                self._insert_step(db, run_id, "DOCUMENT_COLLECTION", "Evidence Agent", "COMPLETED", {"caseId": run["case_id"]}, {"sources": evidence_references}, 1.0)
                self._insert_step(db, run_id, "STANDARDIZATION", "Evidence Agent", "COMPLETED", case, {"normalized": normalized_case, "changes": normalization_changes}, 1.0)
                self._insert_step(db, run_id, "DATA_VALIDATION", "Evidence Agent", "COMPLETED", normalized_case, {"findings": findings}, result["confidence"])
                self._insert_step(db, run_id, "AGGREGATION", "Triage Agent", "COMPLETED", normalized_case, aggregation, 1.0)
                self._insert_step(db, run_id, "CROSS_CHECK", "Evidence Agent", "COMPLETED", evidence_references, {"findings": cross_findings}, result["confidence"])
                self._insert_step(db, run_id, "RISK_AND_POLICY", "Triage Agent", "COMPLETED", findings, {"risk": result["risk"], "violations": result["policyViolations"]}, result["confidence"])
                self._insert_step(db, run_id, "GENERATION", self._agent_for_intent(intent), "COMPLETED", {"intent": intent}, result, result["confidence"])
                db.execute(
                    """UPDATE agent_runs SET status=?, risk_level=?, result_json=?, updated_at=?, completed_at=? WHERE id=?""",
                    (status, risk_level, _json(result), utc_now(), utc_now() if status == "COMPLETED" else None, run_id),
                )
                if status == "AWAITING_APPROVAL":
                    self._notify(db, run["case_id"], run_id, "AGENT_APPROVAL_REQUIRED", "HIGH" if risk_level in {"HIGH", "CRITICAL"} else "INFO", "Agent 초안 승인 대기", f"{run['case_id']} {intent} 결과가 실제 담당자 승인을 기다립니다.", ["quality_reviewer", "case_facilitator"])
                self.store._audit(db, identity.user["id"], identity.user["username"], "AGENT_RUN_PROCESSED", "agent_run", str(run_id), after_hash=hashlib.sha256(_json(result).encode("utf-8")).hexdigest(), details={"status": status, "riskLevel": risk_level, "externalNotification": False})
            return self.get_run(identity, run_id)
        except QMSApiError:
            raise
        except Exception as error:
            self._record_failure(identity, run_id, "INTERNAL_ERROR", "Agent 실행 중 오류가 발생했습니다.", type(error).__name__, retryable=True)
            return self.get_run(identity, run_id)

    @staticmethod
    def _agent_for_intent(intent: str) -> str:
        return {
            "CREATE_D1_D3_DRAFT": "Containment Agent",
            "CREATE_CORRECTIVE_ACTION_DRAFT": "Corrective Action Agent",
            "CREATE_REPORT_DRAFT": "Report & Gate Agent",
            "ANALYZE_ROOT_CAUSE": "Root Cause Agent",
            "SEARCH_SIMILAR_CASES": "Root Cause Agent",
            "EVALUATE_SLA": "SLA Control Agent",
            "VALIDATE_CASE": "Evidence Agent",
            "REVIEW_CASE": "Audit & Governance Guard",
        }.get(intent, "Audit & Governance Guard")

    def _record_failure(self, identity: SessionIdentity, run_id: int, code: str, safe_message: str, internal_summary: str, *, retryable: bool) -> None:
        with self._lock, self.store._connect() as db:
            run = db.execute("SELECT retry_count, case_id FROM agent_runs WHERE id=?", (run_id,)).fetchone()
            if not run:
                return
            retry_count = int(run["retry_count"]) + 1
            delay = (5, 30, 120)[min(retry_count - 1, 2)]
            if retryable and retry_count <= 3:
                status, next_retry = "RETRY_SCHEDULED", _next_time(delay)
            else:
                status, next_retry = "NEEDS_HUMAN", None
            db.execute("UPDATE agent_runs SET status=?, retry_count=?, next_retry_at=?, updated_at=? WHERE id=?", (status, retry_count, next_retry, utc_now(), run_id))
            db.execute(
                """INSERT INTO agent_exceptions
                   (run_id, error_code, safe_message, internal_summary, retryable, retry_count, next_retry_at, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (run_id, code, safe_message, internal_summary[:500], int(retryable), retry_count, next_retry, utc_now()),
            )
            self._notify(db, run["case_id"], run_id, "AGENT_FAILURE", "HIGH", "Agent 실행 확인 필요", safe_message, ["case_facilitator", "system_admin"])
            self.store._audit(db, identity.user["id"], identity.user["username"], "AGENT_RUN_FAILED", "agent_run", str(run_id), details={"errorCode": code, "retryable": retryable, "retryCount": retry_count})

    def _notify(self, db: sqlite3.Connection, case_id: str | None, run_id: int | None, kind: str, severity: str, title: str, message: str, roles: list[str]) -> None:
        db.execute(
            """INSERT INTO internal_notifications
               (case_id, run_id, notification_type, severity, title, message, recipient_roles_json, status, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, 'OPEN', ?)""",
            (case_id, run_id, kind, severity, title, message, _json(roles), utc_now()),
        )

    def _serialize_run(self, db: sqlite3.Connection, row: sqlite3.Row) -> dict[str, Any]:
        steps = db.execute("SELECT * FROM agent_steps WHERE run_id=? ORDER BY id", (row["id"],)).fetchall()
        exceptions = db.execute("SELECT * FROM agent_exceptions WHERE run_id=? ORDER BY id", (row["id"],)).fetchall()
        return {
            "id": row["id"], "caseId": row["case_id"], "requestedBy": row["requested_by_username"],
            "triggerType": row["trigger_type"], "requestText": row["request_text"], "intent": row["intent"],
            "status": row["status"], "riskLevel": row["risk_level"], "input": _parse_json(row["input_json"], {}),
            "result": _parse_json(row["result_json"], {}), "idempotencyKey": row["idempotency_key"],
            "caseRevision": row["case_revision"], "policyVersion": row["policy_version"],
            "modelContractVersion": row["model_contract_version"], "retryCount": row["retry_count"],
            "nextRetryAt": row["next_retry_at"], "createdAt": row["created_at"], "updatedAt": row["updated_at"],
            "completedAt": row["completed_at"],
            "steps": [{
                "id": step["id"], "unitType": step["unit_type"], "agentName": step["agent_name"],
                "status": step["status"], "output": _parse_json(step["output_json"], {}),
                "confidence": step["confidence"], "retryCount": step["retry_count"], "errorCode": step["error_code"],
                "startedAt": step["started_at"], "completedAt": step["completed_at"],
            } for step in steps],
            "exceptions": [{
                "id": item["id"], "errorCode": item["error_code"], "message": item["safe_message"],
                "retryable": bool(item["retryable"]), "retryCount": item["retry_count"],
                "nextRetryAt": item["next_retry_at"], "createdAt": item["created_at"],
            } for item in exceptions],
            "externalNotification": False,
        }

    def get_run(self, identity: SessionIdentity, run_id: int) -> dict[str, Any]:
        with self.store._connect() as db:
            row = db.execute("SELECT * FROM agent_runs WHERE id=?", (int(run_id),)).fetchone()
            if not row:
                raise QMSApiError(404, "Agent Run을 찾을 수 없습니다.", code="AGENT_RUN_NOT_FOUND")
            if row["case_id"]:
                self._state_and_case(identity, row["case_id"], required=True)
            return self._serialize_run(db, row)

    def list_runs(self, identity: SessionIdentity, *, case_id: str = "", status: str = "", limit: int = 100) -> list[dict[str, Any]]:
        self._require_roles(identity, MUTATING_ROLES | {"read_only_auditor", "supplier_user"})
        clauses, args = [], []
        if case_id:
            self._state_and_case(identity, case_id, required=True)
            clauses.append("case_id=?")
            args.append(case_id)
        if status:
            if status not in RUN_STATES:
                raise QMSApiError(400, "지원하지 않는 Agent 상태입니다.", code="INVALID_AGENT_STATUS")
            clauses.append("status=?")
            args.append(status)
        if "supplier_user" in self._roles(identity) and not case_id:
            raise QMSApiError(403, "공급사는 Case를 지정해야 합니다.", code="CASE_SCOPE_REQUIRED")
        where = " WHERE " + " AND ".join(clauses) if clauses else ""
        with self.store._connect() as db:
            rows = db.execute(f"SELECT * FROM agent_runs{where} ORDER BY id DESC LIMIT ?", (*args, min(max(int(limit), 1), 500))).fetchall()
            return [self._serialize_run(db, row) for row in rows]

    def confirm_run(self, identity: SessionIdentity, run_id: int, payload: dict[str, Any]) -> dict[str, Any]:
        self._require_roles(identity, MUTATING_ROLES)
        with self._lock, self.store._connect() as db:
            row = db.execute("SELECT * FROM agent_runs WHERE id=?", (run_id,)).fetchone()
            if not row:
                raise QMSApiError(404, "Agent Run을 찾을 수 없습니다.", code="AGENT_RUN_NOT_FOUND")
            if row["status"] != "AWAITING_CONFIRMATION":
                raise QMSApiError(409, "확인 대기 상태의 Agent Run만 보완할 수 있습니다.", code="INVALID_STATE_TRANSITION")
            case_id = str(payload.get("caseId", "")).strip()
            intent = str(payload.get("intent", row["intent"])).strip().upper()
            record, case = self._state_and_case(identity, case_id, required=intent != "EVALUATE_SLA")
            parsed = _parse_json(row["input_json"], {})
            parsed.update({"caseId": case_id or None, "intent": intent, "ambiguities": [], "requiresConfirmation": False})
            db.execute("UPDATE agent_runs SET case_id=?, intent=?, input_json=?, status='CREATED', case_revision=?, updated_at=? WHERE id=?", (case_id or None, intent, _json(parsed), record["revision"] if record else None, utc_now(), run_id))
            self.store._audit(db, identity.user["id"], identity.user["username"], "AGENT_RUN_CONFIRMED", "agent_run", str(run_id), details={"caseId": case_id, "intent": intent})
        return self._execute(identity, run_id, case)

    def decide_run(self, identity: SessionIdentity, run_id: int, decision: str, payload: dict[str, Any]) -> dict[str, Any]:
        self._require_roles(identity, APPROVER_ROLES)
        decision = decision.upper()
        if decision not in {"APPROVE", "REJECT"}:
            raise QMSApiError(400, "지원하지 않는 결정입니다.", code="INVALID_DECISION")
        comment = str(payload.get("comment", "")).strip()
        if len(comment) < 5:
            raise QMSApiError(400, "승인 또는 반려 의견을 5자 이상 입력해야 합니다.", code="COMMENT_REQUIRED")
        with self._lock, self.store._connect() as db:
            row = db.execute("SELECT * FROM agent_runs WHERE id=?", (run_id,)).fetchone()
            if not row:
                raise QMSApiError(404, "Agent Run을 찾을 수 없습니다.", code="AGENT_RUN_NOT_FOUND")
            if row["status"] != "AWAITING_APPROVAL":
                raise QMSApiError(409, "승인 대기 상태의 Agent Run만 처리할 수 있습니다.", code="INVALID_STATE_TRANSITION")
            critical = db.execute("SELECT COUNT(*) FROM data_quality_findings WHERE run_id=? AND severity='CRITICAL' AND status='OPEN'", (run_id,)).fetchone()[0]
            override_reason = str(payload.get("overrideReason", "")).strip()
            if decision == "APPROVE" and critical:
                if "system_admin" not in self._roles(identity) or len(override_reason) < 10:
                    raise QMSApiError(409, "Critical 품질 항목을 먼저 해결하거나 관리자 전결 사유를 10자 이상 입력해야 합니다.", code="CRITICAL_FINDING_OPEN", details={"count": critical})
            new_status = "APPROVED" if decision == "APPROVE" else "NEEDS_HUMAN"
            db.execute("UPDATE agent_runs SET status=?, updated_at=? WHERE id=?", (new_status, utc_now(), run_id))
            self.store._audit(db, identity.user["id"], identity.user["username"], f"AGENT_RUN_{decision}D", "agent_run", str(run_id), details={"comment": comment, "criticalOverride": bool(critical), "overrideReason": override_reason})
        if decision == "APPROVE" and payload.get("applyToCase"):
            return self._apply_to_case(identity, run_id, int(payload.get("expectedRevision", -1)))
        return self.get_run(identity, run_id)

    def _apply_to_case(self, identity: SessionIdentity, run_id: int, expected_revision: int) -> dict[str, Any]:
        run = self.get_run(identity, run_id)
        if run["status"] != "APPROVED":
            raise QMSApiError(409, "승인된 Agent Run만 Case에 반영할 수 있습니다.", code="INVALID_STATE_TRANSITION")
        supported = {"CREATE_D1_D3_DRAFT", "ANALYZE_ROOT_CAUSE", "CREATE_CORRECTIVE_ACTION_DRAFT", "CREATE_REPORT_DRAFT"}
        if run["intent"] not in supported:
            raise QMSApiError(400, "공식 Case에 반영할 수 없는 Agent 결과입니다.", code="UNSUPPORTED_AGENT_APPLY")
        record, case = self._state_and_case(identity, run["caseId"], required=True)
        if expected_revision != record["revision"] or run["caseRevision"] != record["revision"]:
            raise QMSApiError(409, "Agent 실행 후 Case가 변경되었습니다. 새 revision으로 다시 실행하십시오.", code="REVISION_CONFLICT", details={"runRevision": run["caseRevision"], "current": record["revision"]})
        draft = run["result"].get("draft") or {}
        cases = record["state"].get("cases", [])
        target = next(item for item in cases if str(item.get("id")) == str(run["caseId"]))
        if run["intent"] == "CREATE_D1_D3_DRAFT":
            for key in ("d1", "d2", "d3"):
                if key in draft:
                    target[key] = draft[key]
        elif run["intent"] == "ANALYZE_ROOT_CAUSE":
            target.setdefault("d4", {})["agentAnalysis"] = draft.get("d4", {})
        elif run["intent"] == "CREATE_CORRECTIVE_ACTION_DRAFT":
            for key in ("d5", "d6", "d7"):
                if key in draft:
                    target.setdefault(key, {})["agentDraft"] = draft[key]
        elif run["intent"] == "CREATE_REPORT_DRAFT":
            target.setdefault("agentReportDrafts", []).append(draft.get("report", {}))
        target.setdefault("agentApplications", []).append({"runId": run_id, "approvedBy": identity.user["email"], "appliedAt": utc_now(), "sourceRevision": expected_revision})
        saved = self.store.save_state(identity, record["state"], expected_revision, f"Approved Agent Run {run_id} applied")
        with self._lock, self.store._connect() as db:
            db.execute("UPDATE agent_runs SET status='COMPLETED', completed_at=?, updated_at=? WHERE id=?", (utc_now(), utc_now(), run_id))
            db.execute("UPDATE internal_notifications SET status='RESOLVED', resolved_at=? WHERE run_id=? AND status='OPEN'", (utc_now(), run_id))
            self.store._audit(db, identity.user["id"], identity.user["username"], "AGENT_RESULT_APPLIED", "agent_run", str(run_id), details={"caseId": run["caseId"], "newRevision": saved["revision"]})
        return self.get_run(identity, run_id)

    def retry_run(self, identity: SessionIdentity, run_id: int) -> dict[str, Any]:
        self._require_roles(identity, MUTATING_ROLES)
        with self._lock, self.store._connect() as db:
            row = db.execute("SELECT * FROM agent_runs WHERE id=?", (run_id,)).fetchone()
            if not row:
                raise QMSApiError(404, "Agent Run을 찾을 수 없습니다.", code="AGENT_RUN_NOT_FOUND")
            if row["status"] not in {"RETRY_SCHEDULED", "NEEDS_HUMAN", "FAILED"}:
                raise QMSApiError(409, "실패 또는 재시도 대기 상태만 다시 실행할 수 있습니다.", code="INVALID_STATE_TRANSITION")
            db.execute("UPDATE agent_runs SET status='CREATED', next_retry_at=NULL, updated_at=? WHERE id=?", (utc_now(), run_id))
        _, case = self._state_and_case(identity, row["case_id"], required=bool(row["case_id"]))
        return self._execute(identity, run_id, case)

    def cancel_run(self, identity: SessionIdentity, run_id: int, comment: str) -> dict[str, Any]:
        self._require_roles(identity, MUTATING_ROLES)
        if len((comment or "").strip()) < 5:
            raise QMSApiError(400, "취소 사유를 5자 이상 입력해야 합니다.", code="COMMENT_REQUIRED")
        with self._lock, self.store._connect() as db:
            row = db.execute("SELECT status FROM agent_runs WHERE id=?", (run_id,)).fetchone()
            if not row:
                raise QMSApiError(404, "Agent Run을 찾을 수 없습니다.", code="AGENT_RUN_NOT_FOUND")
            if row["status"] in FINAL_STATES:
                raise QMSApiError(409, "이미 종료된 Agent Run입니다.", code="INVALID_STATE_TRANSITION")
            db.execute("UPDATE agent_runs SET status='CANCELLED', completed_at=?, updated_at=? WHERE id=?", (utc_now(), utc_now(), run_id))
            self.store._audit(db, identity.user["id"], identity.user["username"], "AGENT_RUN_CANCELLED", "agent_run", str(run_id), details={"comment": comment.strip()})
        return self.get_run(identity, run_id)

    def register_source(self, identity: SessionIdentity, case_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        self._require_roles(identity, MUTATING_ROLES)
        self._state_and_case(identity, case_id, required=True)
        name = str(payload.get("originalName", "")).strip()
        mime = str(payload.get("mimeType", "application/octet-stream")).strip()
        source_type = str(payload.get("sourceType", "DOCUMENT")).upper()
        extracted = payload.get("extractedData") if isinstance(payload.get("extractedData"), dict) else {}
        encoded = str(payload.get("contentBase64", ""))
        if not name:
            raise QMSApiError(400, "원본 파일명이 필요합니다.", code="INVALID_SOURCE")
        raw = b""
        if encoded:
            try:
                raw = base64.b64decode(encoded, validate=True)
            except ValueError as error:
                raise QMSApiError(400, "Base64 원본을 해석할 수 없습니다.", code="INVALID_SOURCE") from error
            if len(raw) > 2 * 1024 * 1024:
                raise QMSApiError(413, "Agent Source 등록은 2MB까지 지원합니다.", code="SOURCE_TOO_LARGE")
        digest = hashlib.sha256(raw).hexdigest() if raw else str(payload.get("sha256", "")).lower()
        if not re.fullmatch(r"[0-9a-f]{64}", digest):
            raise QMSApiError(400, "유효한 SHA-256 또는 원본 Base64가 필요합니다.", code="INVALID_SOURCE_HASH")
        with self._lock, self.store._connect() as db:
            cursor = db.execute(
                """INSERT OR IGNORE INTO source_artifacts
                   (case_id, run_id, source_type, original_name, mime_type, byte_size, sha256,
                    logical_uri, extracted_json, extraction_status, page_or_sheet, created_at, created_by)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (case_id, payload.get("runId"), source_type, name, mime, len(raw) or int(payload.get("byteSize", 0)), digest,
                 str(payload.get("logicalUri", "")) or None, _json(extracted), "EXTRACTED" if extracted else "REGISTERED",
                 str(payload.get("pageOrSheet", "")) or None, utc_now(), identity.user["id"]),
            )
            row = db.execute("SELECT * FROM source_artifacts WHERE case_id=? AND sha256=?", (case_id, digest)).fetchone()
            self.store._audit(db, identity.user["id"], identity.user["username"], "SOURCE_ARTIFACT_REGISTERED", "case", case_id, after_hash=digest, details={"artifactId": row["id"], "sourceType": source_type, "storedBody": False, "duplicate": cursor.rowcount == 0})
            result = self._source_row(row)
            created = cursor.rowcount > 0
        if created:
            event_run = self.create_run(identity, {
                "caseId": case_id, "requestText": f"{case_id} 신규 Evidence Source 데이터 품질 검증",
                "triggerType": "EVENT", "idempotencyKey": f"event:source:{result['id']}",
            })
            result["eventRunId"] = event_run["id"]
        return result

    @staticmethod
    def _source_row(row: sqlite3.Row) -> dict[str, Any]:
        return {"id": row["id"], "caseId": row["case_id"], "runId": row["run_id"], "sourceType": row["source_type"], "originalName": row["original_name"], "mimeType": row["mime_type"], "byteSize": row["byte_size"], "sha256": row["sha256"], "logicalUri": row["logical_uri"], "extractedData": _parse_json(row["extracted_json"], {}), "extractionStatus": row["extraction_status"], "pageOrSheet": row["page_or_sheet"], "createdAt": row["created_at"], "storedBody": False}

    def list_sources(self, identity: SessionIdentity, case_id: str) -> list[dict[str, Any]]:
        self._state_and_case(identity, case_id, required=True)
        with self.store._connect() as db:
            return [self._source_row(row) for row in db.execute("SELECT * FROM source_artifacts WHERE case_id=? ORDER BY id DESC", (case_id,)).fetchall()]

    def list_findings(self, identity: SessionIdentity, case_id: str) -> list[dict[str, Any]]:
        self._state_and_case(identity, case_id, required=True)
        with self.store._connect() as db:
            rows = db.execute("SELECT * FROM data_quality_findings WHERE case_id=? ORDER BY CASE severity WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MEDIUM' THEN 3 ELSE 4 END, id DESC", (case_id,)).fetchall()
            return [{"id": row["id"], "caseId": row["case_id"], "runId": row["run_id"], "code": row["finding_code"], "severity": row["severity"], "field": row["field_name"], "rawValue": _parse_json(row["raw_value_json"], None), "comparisonValue": _parse_json(row["comparison_value_json"], None), "description": row["description"], "evidence": _parse_json(row["evidence_json"], []), "status": row["status"], "resolutionComment": row["resolution_comment"], "createdAt": row["created_at"], "resolvedAt": row["resolved_at"]} for row in rows]

    def resolve_finding(self, identity: SessionIdentity, finding_id: int, payload: dict[str, Any]) -> dict[str, Any]:
        self._require_roles(identity, APPROVER_ROLES)
        status = str(payload.get("status", "RESOLVED")).upper()
        comment = str(payload.get("comment", "")).strip()
        if status not in {"ACKNOWLEDGED", "RESOLVED", "ACCEPTED_RISK"} or len(comment) < 5:
            raise QMSApiError(400, "해결 상태와 5자 이상의 의견이 필요합니다.", code="INVALID_FINDING_RESOLUTION")
        if status == "ACCEPTED_RISK" and "system_admin" not in self._roles(identity) and "quality_reviewer" not in self._roles(identity):
            raise QMSApiError(403, "위험 수용 권한이 없습니다.", code="ROLE_FORBIDDEN")
        with self._lock, self.store._connect() as db:
            row = db.execute("SELECT * FROM data_quality_findings WHERE id=?", (finding_id,)).fetchone()
            if not row:
                raise QMSApiError(404, "데이터 품질 항목을 찾을 수 없습니다.", code="FINDING_NOT_FOUND")
            db.execute("UPDATE data_quality_findings SET status=?, resolution_comment=?, resolved_by=?, resolved_at=? WHERE id=?", (status, comment, identity.user["id"], utc_now(), finding_id))
            self.store._audit(db, identity.user["id"], identity.user["username"], "DATA_QUALITY_FINDING_RESOLVED", "data_quality_finding", str(finding_id), details={"status": status, "comment": comment})
            return {"id": finding_id, "status": status, "resolvedAt": utc_now()}

    def list_policies(self, identity: SessionIdentity) -> list[dict[str, Any]]:
        self._require_roles(identity, MUTATING_ROLES | {"read_only_auditor"})
        with self.store._connect() as db:
            rows = db.execute("SELECT * FROM policy_rules WHERE active=1 ORDER BY rule_type, scope_type, scope_value").fetchall()
            return [{"id": row["id"], "ruleType": row["rule_type"], "scopeType": row["scope_type"], "scopeValue": row["scope_value"], "version": row["version"], "effectiveFrom": row["effective_from"], "rule": _parse_json(row["rule_json"], {}), "active": bool(row["active"])} for row in rows]

    def list_notifications(self, identity: SessionIdentity, limit: int = 100) -> list[dict[str, Any]]:
        roles = self._roles(identity)
        with self.store._connect() as db:
            rows = db.execute("SELECT * FROM internal_notifications WHERE status='OPEN' ORDER BY id DESC LIMIT ?", (min(max(limit, 1), 500),)).fetchall()
            items = []
            for row in rows:
                recipient_roles = set(_parse_json(row["recipient_roles_json"], []))
                if recipient_roles and not roles.intersection(recipient_roles):
                    continue
                items.append({"id": row["id"], "caseId": row["case_id"], "runId": row["run_id"], "type": row["notification_type"], "severity": row["severity"], "title": row["title"], "message": row["message"], "recipientRoles": sorted(recipient_roles), "status": row["status"], "createdAt": row["created_at"], "externalNotification": False})
            return items

    def adapter_status(self, identity: SessionIdentity) -> dict[str, Any]:
        self._require_roles(identity, MUTATING_ROLES | {"read_only_auditor"})
        return {
            "internalSystems": {"provider": "UNCONFIGURED", "configured": False, "available": False, "writeEnabled": False},
            "email": {"provider": "UNDECIDED", "configured": False, "externalSendEnabled": False, "inboundCollectionEnabled": False},
            "externalInformation": {"provider": "UNCONFIGURED", "configured": False, "available": False},
        }

    def _system_identity(self) -> SessionIdentity:
        with self.store._connect() as db:
            rows = db.execute("SELECT * FROM users WHERE active=1 ORDER BY id").fetchall()
            for row in rows:
                user = public_user(row)
                if "system_admin" in user["roles"]:
                    return SessionIdentity(user=user, csrf_token="", session_id=0)
        raise RuntimeError("No active system administrator is available for scheduler jobs")

    def run_due_jobs(self, identity: SessionIdentity | None = None, *, force: bool = False) -> list[dict[str, Any]]:
        actor = identity or self._system_identity()
        if identity:
            self._require_roles(identity, {"system_admin", "case_facilitator", "quality_reviewer"})
        owner = f"pid-{os.getpid()}-thread-{threading.get_ident()}"
        now = utc_now()
        jobs: list[sqlite3.Row] = []
        with self._lock, self.store._connect() as db:
            db.execute("BEGIN IMMEDIATE")
            candidates = db.execute("SELECT * FROM scheduled_jobs WHERE active=1 ORDER BY id").fetchall()
            for row in candidates:
                lock_expired = not row["locked_until"] or row["locked_until"] <= now
                due = force or row["next_run_at"] <= now
                if due and lock_expired:
                    updated = db.execute("UPDATE scheduled_jobs SET locked_by=?, locked_until=?, updated_at=? WHERE id=? AND (locked_until IS NULL OR locked_until<=?)", (owner, _next_time(90), now, row["id"], now))
                    if updated.rowcount:
                        jobs.append(row)
        results = []
        retry_ids: list[int] = []
        with self._lock, self.store._connect() as db:
            db.execute("BEGIN IMMEDIATE")
            retry_rows = db.execute(
                "SELECT id FROM agent_runs WHERE status='RETRY_SCHEDULED' AND next_retry_at IS NOT NULL AND next_retry_at<=? ORDER BY id",
                (now,),
            ).fetchall()
            for retry_row in retry_rows:
                updated = db.execute("UPDATE agent_runs SET status='CREATED', updated_at=? WHERE id=? AND status='RETRY_SCHEDULED'", (now, retry_row["id"]))
                if updated.rowcount:
                    retry_ids.append(retry_row["id"])
        for retry_id in retry_ids:
            retried = self._execute(actor, retry_id)
            results.append({"jobType": "AGENT_RETRY", "status": retried["status"], "runId": retry_id})
        for job in jobs:
            try:
                if job["job_type"] == "SLA_WATCHDOG":
                    record = self.store.get_state()
                    if not record or not (record["state"].get("cases") or record["state"].get("intakeQueue")):
                        result = {"jobType": job["job_type"], "status": "SKIPPED", "reason": "NO_CASES"}
                    else:
                        bucket = datetime.now(UTC).strftime("%Y%m%d%H%M")
                        run = self.create_run(actor, {"requestText": "전체 Case SLA 지연 및 에스컬레이션 점검", "triggerType": "SCHEDULE", "idempotencyKey": f"schedule:SLA_WATCHDOG:{bucket}"})
                        result = {"jobType": job["job_type"], "status": "COMPLETED", "runId": run["id"]}
                else:
                    result = {"jobType": job["job_type"], "status": "SKIPPED"}
                status = result["status"]
            except Exception as error:
                result = {"jobType": job["job_type"], "status": "FAILED", "errorCode": type(error).__name__}
                status = "FAILED"
            with self._lock, self.store._connect() as db:
                next_run = _next_time(int(job["interval_seconds"]))
                db.execute("UPDATE scheduled_jobs SET last_run_at=?, next_run_at=?, locked_by=NULL, locked_until=NULL, last_status=?, last_result_json=?, updated_at=? WHERE id=?", (utc_now(), next_run, status, _json(result), utc_now(), job["id"]))
            results.append(result)
        return results

    def start_scheduler(self) -> None:
        if os.environ.get("QMS_SCHEDULER_ENABLED", "true").lower() not in {"1", "true", "yes", "on"}:
            return
        if self._scheduler_thread and self._scheduler_thread.is_alive():
            return
        interval = max(30, int(os.environ.get("QMS_SCHEDULER_INTERVAL_SECONDS", "60") or 60))
        self._stop_event.clear()

        def worker() -> None:
            while not self._stop_event.is_set():
                try:
                    self.run_due_jobs()
                except Exception:
                    pass
                self._stop_event.wait(interval)

        self._scheduler_thread = threading.Thread(target=worker, name="qms-agent-scheduler", daemon=True)
        self._scheduler_thread.start()

    def stop_scheduler(self) -> None:
        self._stop_event.set()
