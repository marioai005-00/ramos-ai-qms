"""Supplier-submitted PCN and Issue tickets, shared centrally with original files."""
import hashlib
import json
import math
import secrets
from datetime import datetime, timezone

from internal_quality import REVIEW_ROLES, encoded, fail, now
from supplier_notices import SUPPLIERS

CODE = "INVALID_SUPPLIER_TICKET"
CHANGE_4M = ("Man", "Machine", "Material", "Method")
REVIEW_DECISIONS = {"Under_Review", "Revision_Requested", "Approved", "Rejected"}
COMMENT_REQUIRED = {"Revision_Requested", "Approved", "Rejected"}
RESUBMIT_FROM = {"Revision_Requested", "Under_Review"}
INCIDENT_TEXT = {"defectCategory": 80, "processStep": 80, "lineAction": 80, "quarantineLocation": 240,
                 "inTransitAction": 2000, "containmentAction": 8000, "faReportDeadline": 10, "emergencySupportRequest": 2000}
INCIDENT_QTY = ("inputQty", "defectQty", "quarantineQty")


def _text(source, key, limit, required=False, label=None):
    value = source.get(key, "") if isinstance(source, dict) else ""
    value = "" if value is None else value
    if not isinstance(value, str) or len(value) > limit or required and not value.strip():
        fail(400, f"{label or key}: 필수 입력 또는 입력 길이를 확인하세요.", CODE)
    return value.strip()


def _date(value, label):
    if value:
        try:
            datetime.strptime(value, "%Y-%m-%d")
        except ValueError:
            fail(400, f"{label}: 날짜 형식을 확인하세요.", CODE)
    return value


def _quantity(source, key):
    value = source.get(key)
    if value in ("", None):
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0 or value != int(value) or value > 10**12:
        fail(400, "투입·불량·격리 수량은 0 이상의 정수로 입력하세요.", CODE)
    return int(value)


def risk_level(ticket_type, change_4m, reason_type):
    if ticket_type == "Issue":
        return "MAJOR"
    if "Material" in change_4m or reason_type in {"Process_Abnormal", "Cost_Reduction_And_Reliability"} or len(change_4m) >= 2:
        return "MAJOR"
    return "MINOR"


class SupplierTicketsMixin:
    def _init_supplier_tickets(self, db):
        db.executescript("""
            CREATE TABLE IF NOT EXISTS supplier_tickets (
                ticket_id TEXT PRIMARY KEY, supplier_id TEXT NOT NULL, ticket_type TEXT NOT NULL,
                revision INTEGER NOT NULL, record_json TEXT NOT NULL, updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS supplier_ticket_files (
                file_id TEXT PRIMARY KEY, ticket_id TEXT NOT NULL REFERENCES supplier_tickets(ticket_id),
                original_name TEXT NOT NULL, content BLOB NOT NULL, sha256 TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_supplier_ticket_owner ON supplier_tickets(supplier_id, updated_at);
        """)

    def _ticket_scope(self, identity):
        """Supplier accounts are confined to their own company; internal accounts need read access."""
        return self._notice_supplier_id(identity)

    def _ticket_fields(self, payload, supplier_id):
        if not isinstance(payload, dict):
            fail(400, "접수 정보를 확인하세요.", CODE)
        ticket_type = _text(payload, "ticketType", 10, True, "접수 구분")
        if ticket_type not in {"PCN", "Issue"}:
            fail(400, "PCN 또는 Issue 접수 구분을 선택하세요.", CODE)
        official = SUPPLIERS[supplier_id]
        change_4m = payload.get("change4M", [])
        if not isinstance(change_4m, list) or any(not isinstance(x, str) or x not in CHANGE_4M for x in change_4m):
            fail(400, "4M 변경 구분을 확인하세요.", CODE)
        change_4m = list(dict.fromkeys(change_4m))
        if ticket_type == "PCN" and not change_4m:
            fail(400, "PCN은 4M 변경 구분을 하나 이상 선택하세요.", CODE)
        reason_type = _text(payload, "reasonType", 80)
        rows = payload.get("comparisonTable", [])
        if not isinstance(rows, list) or len(rows) > 50:
            fail(400, "변경 전후 대조표는 최대 50행입니다.", CODE)
        comparison = [{key: _text(row, key, 2000, key == "item", "대조표 항목") for key in ("item", "current", "proposed", "riskAssessment")} for row in rows]
        fields = {
            "ticketType": ticket_type,
            "supplier": {"id": supplier_id, "category": official["category"], "companyName": official["name"],
                         "plant": _text(payload, "plant", 240), "submitter": official["contact"], "email": official["email"],
                         "phone": _text(payload, "phone", 60)},
            "targetProduct": {key: _text(payload, key, 240) for key in ("customer", "partName", "partNumber", "lotNo")},
            "classification": {"change4M": change_4m, "issueCategory": _text(payload, "issueCategory", 80),
                               "riskLevel": risk_level(ticket_type, change_4m, reason_type), "reasonType": reason_type},
            "details": {"title": _text(payload, "title", 240, True, "제목"), "description": _text(payload, "description", 8000, True, "상세 내용"),
                        "comparisonTable": comparison,
                        "plannedSampleDate": _date(_text(payload, "plannedSampleDate", 10), "샘플 예정일"),
                        "plannedMassDate": _date(_text(payload, "plannedMassDate", 10), "양산 적용 예정일")},
            "incident": None,
        }
        if ticket_type == "Issue":
            source = payload.get("incident")
            if not isinstance(source, dict):
                fail(400, "Issue 접수에는 발생 공정과 수량 정보가 필요합니다.", CODE)
            incident = {key: _text(source, key, limit) for key, limit in INCIDENT_TEXT.items()}
            _date(incident["faReportDeadline"], "FA 보고 기한")
            incident.update({key: _quantity(source, key) for key in INCIDENT_QTY})
            if incident["defectQty"] is not None and incident["inputQty"] is not None and incident["defectQty"] > incident["inputQty"]:
                fail(400, "불량 수량이 투입 수량을 초과할 수 없습니다.", CODE)
            # Unknown quantities stay empty; the rate is derived only from entered numbers.
            incident["defectRate"] = f"{incident['defectQty'] / incident['inputQty'] * 100:.2f}" if incident["inputQty"] and incident["defectQty"] is not None else ""
            fields["incident"] = incident
        return fields

    def _ticket_add_files(self, db, record, files, actor, phase, version=""):
        for name, content in files:
            file_id, digest = "STF-" + secrets.token_hex(16), hashlib.sha256(content).hexdigest()
            db.execute("INSERT INTO supplier_ticket_files VALUES(?,?,?,?,?)", (file_id, record["ticketId"], name, content, digest))
            record["evidenceFiles"].append({"id": file_id, "name": name, "byteSize": len(content), "size": f"{len(content) / 1024:.1f} KB",
                                            "type": name.rsplit(".", 1)[-1].lower(), "sha256": digest, "storedBody": True, "phase": phase,
                                            "version": version, "uploadedBy": actor, "uploadedAt": now()})

    def _ticket_row(self, db, identity, ticket_id):
        scope = self._ticket_scope(identity)
        row = db.execute("SELECT * FROM supplier_tickets WHERE ticket_id=?", (ticket_id,)).fetchone()
        if not row or scope and row["supplier_id"] != scope:
            fail(404, "외주 접수 건을 찾을 수 없습니다.", "TICKET_NOT_FOUND")
        return row, scope

    def list_supplier_tickets(self, identity):
        scope = self._ticket_scope(identity)
        with self._connect() as db:
            rows = db.execute("SELECT record_json FROM supplier_tickets" + (" WHERE supplier_id=?" if scope else "") + " ORDER BY updated_at DESC, ticket_id DESC", (scope,) if scope else ()).fetchall()
            return [json.loads(row[0]) for row in rows]

    def get_supplier_ticket(self, identity, ticket_id):
        with self._connect() as db:
            return json.loads(self._ticket_row(db, identity, ticket_id)[0]["record_json"])

    def create_supplier_ticket(self, identity, payload):
        scope = self._ticket_scope(identity)
        if scope:
            supplier_id = scope
        else:
            # Internal staff may register a ticket received outside the portal, for an official supplier only.
            self._internal_permission(identity)
            supplier_id = _text(payload, "supplierId", 40, True, "대상 외주사")
            if supplier_id not in SUPPLIERS:
                fail(400, "공식 외주사를 선택하세요.", CODE)
        fields, files = self._ticket_fields(payload, supplier_id), self._internal_files(payload)
        actor = {k: identity.user.get(k, "") for k in ("username", "name", "dept", "email")}
        with self._lock, self._connect() as db:
            db.execute("BEGIN IMMEDIATE")
            prefix = f"{'PCN' if fields['ticketType'] == 'PCN' else 'SQ'}-{datetime.now(timezone.utc).year}"
            count = db.execute("SELECT count(*) FROM supplier_tickets WHERE ticket_id LIKE ?", (prefix + "-%",)).fetchone()[0]
            record = {**fields, "ticketId": f"{prefix}-{count + 1:03d}", "status": "Submitted", "revision": 1,
                      "createdAt": now(), "updatedAt": now(), "createdBy": actor, "registeredBySupplier": bool(scope),
                      "evidenceFiles": [], "resubmissions": [],
                      "sqeReview": {"reviewer": "", "reviewedAt": None, "decision": "Pending", "comment": "", "bound8DCaseId": None},
                      "history": [{"action": "submit", "status": "Submitted", "comment": "", "actor": actor, "at": now()}]}
            db.execute("INSERT INTO supplier_tickets VALUES(?,?,?,?,?,?)", (record["ticketId"], supplier_id, record["ticketType"], 1, encoded(record), record["updatedAt"]))
            self._ticket_add_files(db, record, files, actor, "Submission")
            db.execute("UPDATE supplier_tickets SET record_json=? WHERE ticket_id=?", (encoded(record), record["ticketId"]))
            self._audit(db, identity.user["id"], identity.user["username"], "SUPPLIER_TICKET_CREATED", "supplier_ticket", record["ticketId"],
                        after_hash=hashlib.sha256(encoded(record).encode()).hexdigest(), details={"supplierId": supplier_id, "ticketType": record["ticketType"]})
        return record

    def update_supplier_ticket(self, identity, ticket_id, payload):
        if not isinstance(payload, dict):
            fail(400, "요청 내용을 확인하세요.", CODE)
        action = _text(payload, "action", 20, True, "작업")
        comment = _text(payload, "comment", 8000, label="의견")
        files = self._internal_files(payload)
        actor = {k: identity.user.get(k, "") for k in ("username", "name", "dept", "email")}
        with self._lock, self._connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row, scope = self._ticket_row(db, identity, ticket_id)
            record = json.loads(row["record_json"])
            revision = payload.get("expectedRevision")
            if isinstance(revision, bool) or not isinstance(revision, int) or revision != row["revision"]:
                fail(409, "다른 사용자가 먼저 수정했습니다. 최신 내용을 불러와 다시 진행하세요.", "REVISION_CONFLICT")
            if action == "resubmit":
                if not scope:
                    fail(403, "보완 자료 제출은 해당 외주사 계정에서 진행합니다.", "ROLE_FORBIDDEN")
                if record["status"] not in RESUBMIT_FROM:
                    fail(409, "현재 상태에서는 보완 자료를 제출할 수 없습니다.", "INVALID_TRANSITION")
                if not files:
                    fail(400, "제출할 보완 자료 원본을 첨부하세요.", "INVALID_EVIDENCE")
                title = _text(payload, "reportTitle", 240, label="보완 레포트 표제")
                self._ticket_add_files(db, record, files, actor, "Resubmission", f"보완 {len(record['resubmissions']) + 1}차")
                # The reviewer's own comment is kept as written; the supplier's note is stored beside it.
                record["resubmissions"].append({"title": title, "comment": comment, "fileCount": len(files), "submittedBy": actor, "submittedAt": now()})
                record["status"] = "Report_Submitted"
            elif action in {"review", "bind"}:
                if scope:
                    fail(403, "외주사 계정은 심의 결과를 변경할 수 없습니다.", "ROLE_FORBIDDEN")
                self._require_role(identity, REVIEW_ROLES)
                review = record["sqeReview"]
                if action == "review":
                    decision = _text(payload, "decision", 30, True, "심의 판정")
                    if decision not in REVIEW_DECISIONS:
                        fail(400, "심의 판정을 선택하세요.", CODE)
                    if decision in COMMENT_REQUIRED and not comment:
                        fail(400, "보완 요청·승인·반려에는 심의 의견이 필요합니다.", CODE)
                    record["status"] = decision
                    review.update(decision=decision, comment=comment)
                else:
                    case_id = _text(payload, "caseId", 240, True, "연결 Case")
                    state = db.execute("SELECT state_json FROM state_store WHERE id=1").fetchone()
                    if not any(c.get("id") == case_id for c in (json.loads(state[0]).get("cases", []) if state else [])):
                        fail(404, "연결할 8D Case가 없습니다. 먼저 Case를 등록하세요.", "CASE_NOT_FOUND")
                    record["status"] = "8D_Escalated"
                    review.update(decision="8D_Escalated", bound8DCaseId=case_id)
                    if comment:
                        review["comment"] = comment
                # The reviewer is always the logged-in account, never a name sent by the browser.
                review.update(reviewer=f"{actor['name']} ({actor['dept']})".strip(), reviewerAccount=actor, reviewedAt=now())
            else:
                fail(400, "작업 구분을 확인하세요.", CODE)
            record["revision"] += 1
            record["updatedAt"] = now()
            record["history"].append({"action": action, "status": record["status"], "comment": comment, "actor": actor, "at": now()})
            serialized = encoded(record)
            db.execute("UPDATE supplier_tickets SET revision=?, record_json=?, updated_at=? WHERE ticket_id=?", (record["revision"], serialized, record["updatedAt"], ticket_id))
            self._audit(db, identity.user["id"], identity.user["username"], "SUPPLIER_TICKET_UPDATED", "supplier_ticket", ticket_id,
                        before_hash=hashlib.sha256(row["record_json"].encode()).hexdigest(), after_hash=hashlib.sha256(serialized.encode()).hexdigest(),
                        details={"action": action, "status": record["status"], "revision": record["revision"]})
        return record

    def get_supplier_ticket_file(self, identity, ticket_id, file_id):
        with self._connect() as db:
            self._ticket_row(db, identity, ticket_id)
            row = db.execute("SELECT * FROM supplier_ticket_files WHERE ticket_id=? AND file_id=?", (ticket_id, file_id)).fetchone()
            if not row:
                fail(404, "첨부 원본을 찾을 수 없습니다.", "EVIDENCE_NOT_FOUND")
            return dict(row)
