"""Internal Issue/nonconformance and PCN records, separate from customer 8D state."""
import base64
import binascii
import hashlib
import json
import math
import re
import secrets
from datetime import datetime, timezone

WRITE_ROLES = {"system_admin", "quality_reviewer", "case_facilitator", "stage_drafter", "stage_leader", "stage_champion", "customer_dispatcher"}
REVIEW_ROLES = {"system_admin", "quality_reviewer"}
SITES = {"TechL Vina", "Winpac", "SSPC", "Ramos 3Camp"}
FIELDS = {"title": 240, "description": 8000, "department": 120, "owner": 160, "site": 80, "product": 240, "partNumber": 240, "lotNo": 240, "process": 240, "occurredAt": 30, "dueDate": 10, "issueType": 30, "containment": 8000, "beforeChange": 8000, "afterChange": 8000, "changeReason": 8000, "validationPlan": 8000, "plannedDate": 10, "customerNotice": 30}


def encoded(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def fail(status, message, code="INVALID_INTERNAL_RECORD"):
    from qms_backend import QMSApiError
    raise QMSApiError(status, message, code=code)


class InternalQualityMixin:
    def _init_internal_quality(self, db):
        db.executescript("""
            CREATE TABLE IF NOT EXISTS internal_quality_records (
                ticket_id TEXT PRIMARY KEY, kind TEXT NOT NULL, revision INTEGER NOT NULL,
                record_json TEXT NOT NULL, updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS internal_quality_files (
                file_id TEXT PRIMARY KEY, ticket_id TEXT NOT NULL REFERENCES internal_quality_records(ticket_id),
                original_name TEXT NOT NULL, content BLOB NOT NULL, sha256 TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_internal_quality_kind ON internal_quality_records(kind, updated_at);
        """)

    def _internal_permission(self, identity, review=False, read=False):
        if identity.user.get("isSupplier") or "supplier_user" in identity.user.get("roles", []):
            fail(403, "외주사 계정은 내부 Issue·PCN 기록에 접근할 수 없습니다.", "ROLE_FORBIDDEN")
        self._require_role(identity, REVIEW_ROLES if review else WRITE_ROLES | ({"read_only_auditor"} if read else set()))

    def _internal_fields(self, payload, kind):
        if not isinstance(payload, dict):
            fail(400, "접수 정보를 확인하세요.")
        values = {}
        for key, limit in FIELDS.items():
            value = payload.get(key, "")
            if not isinstance(value, str) or len(value) > limit:
                fail(400, f"{key}: 입력 형식 또는 길이를 확인하세요.")
            values[key] = value.strip()
        for key in ("title", "description", "department"):
            if not values[key]:
                fail(400, "제목, 발생/변경 내용, 주관 부서를 입력하세요.")
        if values["site"] and values["site"] not in SITES:
            fail(400, "생산 Site는 등록된 목록에서 선택하세요.")
        for key in ("dueDate", "plannedDate"):
            if values[key]:
                try:
                    datetime.strptime(values[key], "%Y-%m-%d")
                except ValueError:
                    fail(400, "날짜 형식을 확인하세요.")
        for key in ("inputQty", "defectQty"):
            value = payload.get(key)
            if value in ("", None):
                values[key] = None
            elif isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0 or value != int(value) or value > 10**12:
                fail(400, "검사·불량 수량은 0 이상의 정수로 입력하세요.")
            else:
                values[key] = int(value)
        if values["defectQty"] is not None and values["inputQty"] is not None and values["defectQty"] > values["inputQty"]:
            fail(400, "불량 수량이 검사 수량을 초과할 수 없습니다.")
        signals = payload.get("change4M", [])
        if not isinstance(signals, list) or any(not isinstance(x, str) or x not in {"Man", "Machine", "Material", "Method"} for x in signals):
            fail(400, "4M 변경 구분을 확인하세요.")
        values["change4M"] = list(dict.fromkeys(signals))
        if kind == "Issue":
            if values["issueType"] not in {"Issue", "Nonconformance"} or not values["occurredAt"]:
                fail(400, "내부 Issue/부적합 구분과 발생 일시를 입력하세요.")
            try:
                datetime.fromisoformat(values["occurredAt"])
            except ValueError:
                fail(400, "발생 일시를 확인하세요.")
        elif not all(values[k] for k in ("beforeChange", "afterChange", "changeReason", "validationPlan", "plannedDate")) or not values["change4M"]:
            fail(400, "4M 구분, 변경 전후, 사유, 검증 계획, 적용 예정일을 입력하세요.")
        if values["customerNotice"] not in {"", "Unknown", "Required", "NotRequired"}:
            fail(400, "고객 통보 검토 구분을 확인하세요.")
        return values

    def _internal_files(self, payload):
        files = payload.get("files", [])
        if not isinstance(files, list) or len(files) > 10:
            fail(400, "첨부는 한 번에 최대 10개입니다.")
        decoded, total = [], 0
        for item in files:
            name = item.get("filename") if isinstance(item, dict) else None
            url = item.get("dataUrl") if isinstance(item, dict) else None
            if (not isinstance(name, str) or not name.strip() or len(name) > 240 or any(c in name for c in '/\\\r\n\x00')
                    or name.rsplit(".", 1)[-1].lower() not in {"png", "jpg", "jpeg", "webp", "pdf", "xlsx", "xls", "csv", "docx", "eml", "txt"}
                    or not isinstance(url, str) or not url.startswith("data:") or ";base64," not in url):
                fail(400, "지원하는 원본 파일을 선택하세요.", "INVALID_EVIDENCE")
            try:
                content = base64.b64decode(url.split(";base64,", 1)[1], validate=True)
            except (ValueError, binascii.Error):
                fail(400, "첨부 파일 내용을 해석할 수 없습니다.", "INVALID_EVIDENCE")
            total += len(content)
            if not content or total > 30 * 1024 * 1024:
                fail(413, "빈 파일은 첨부할 수 없으며 한 번에 합계 30 MB까지 가능합니다.", "EVIDENCE_SIZE")
            decoded.append((name.strip(), content))
        return decoded

    def list_internal_quality(self, identity, kind):
        self._internal_permission(identity, read=True)
        if not isinstance(kind, str) or kind not in {"Issue", "PCN"}:
            fail(400, "내부 Issue 또는 PCN을 선택하세요.")
        with self._connect() as db:
            return [json.loads(r["record_json"]) for r in db.execute("SELECT record_json FROM internal_quality_records WHERE kind=? ORDER BY updated_at DESC, ticket_id DESC", (kind,))]

    def get_internal_quality(self, identity, ticket_id):
        self._internal_permission(identity, read=True)
        with self._connect() as db:
            row = db.execute("SELECT record_json FROM internal_quality_records WHERE ticket_id=?", (ticket_id,)).fetchone()
            if not row:
                fail(404, "내부 접수 기록을 찾을 수 없습니다.", "INTERNAL_NOT_FOUND")
            return json.loads(row["record_json"])

    def _internal_add_files(self, db, record, files, actor):
        for name, content in files:
            file_id = "IQF-" + secrets.token_hex(16)
            digest = hashlib.sha256(content).hexdigest()
            db.execute("INSERT INTO internal_quality_files VALUES(?,?,?,?,?)", (file_id, record["ticketId"], name, content, digest))
            record["files"].append({"id": file_id, "name": name, "size": len(content), "sha256": digest, "uploadedBy": actor, "uploadedAt": now()})

    def create_internal_quality(self, identity, payload):
        self._internal_permission(identity)
        kind = payload.get("kind")
        if not isinstance(kind, str) or kind not in {"Issue", "PCN"}:
            fail(400, "내부 접수 구분을 선택하세요.")
        fields, files = self._internal_fields(payload, kind), self._internal_files(payload)
        actor = {k: identity.user.get(k, "") for k in ("username", "name", "dept", "email")}
        with self._lock, self._connect() as db:
            db.execute("BEGIN IMMEDIATE")
            prefix = "INT-PCN" if kind == "PCN" else "INT-ISSUE"
            year = datetime.now().year
            count = db.execute("SELECT COUNT(*) FROM internal_quality_records WHERE ticket_id LIKE ?", (f"{prefix}-{year}-%",)).fetchone()[0]
            ticket_id = f"{prefix}-{year}-{count+1:04d}"
            record = {**fields, "ticketId": ticket_id, "kind": kind, "scope": "Internal", "status": "Submitted", "revision": 1,
                      "createdAt": now(), "updatedAt": now(), "createdBy": actor, "files": [], "linkedCaseId": "", "validationResult": "", "implementedDate": "",
                      "history": [{"action": "Created", "status": "Submitted", "comment": "내부 접수 등록", "actor": actor, "at": now()}]}
            db.execute("INSERT INTO internal_quality_records VALUES(?,?,?,?,?)", (ticket_id, kind, 1, encoded(record), record["updatedAt"]))
            self._internal_add_files(db, record, files, actor)
            db.execute("UPDATE internal_quality_records SET record_json=? WHERE ticket_id=?", (encoded(record), ticket_id))
            self._audit(db, identity.user["id"], identity.user["username"], "INTERNAL_QUALITY_CREATED", "internal_quality", ticket_id, after_hash=hashlib.sha256(encoded(record).encode()).hexdigest(), details={"kind": kind, "revision": 1})
        return record

    def update_internal_quality(self, identity, ticket_id, payload):
        self._internal_permission(identity)
        files = self._internal_files(payload)
        comment = payload.get("comment", "")
        if not isinstance(comment, str) or not comment.strip() or len(comment) > 8000:
            fail(400, "조치 또는 검토 내용을 입력하세요.")
        action = payload.get("action", "note")
        if not isinstance(action, str) or action not in {"note", "status", "edit"}:
            fail(400, "관리 작업을 확인하세요.")
        actor = {k: identity.user.get(k, "") for k in ("username", "name", "dept", "email")}
        with self._lock, self._connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT * FROM internal_quality_records WHERE ticket_id=?", (ticket_id,)).fetchone()
            if not row:
                fail(404, "내부 접수 기록을 찾을 수 없습니다.", "INTERNAL_NOT_FOUND")
            if payload.get("expectedRevision") != row["revision"]:
                fail(409, "다른 사용자가 먼저 수정했습니다. 최신 내용을 불러온 뒤 다시 저장하세요.", "REVISION_CONFLICT")
            record = json.loads(row["record_json"])
            if action == "edit":
                if record["status"] not in {"Submitted", "Rejected"}:
                    fail(409, "접수 또는 반려 상태에서만 기본 정보를 수정할 수 있습니다.", "INVALID_TRANSITION")
                record.update(self._internal_fields(payload, record["kind"]))
            if "linkedCaseId" in payload:
                case_id = payload["linkedCaseId"]
                if not isinstance(case_id, str):
                    fail(400, "연결 Case를 확인하세요.")
                state_row = db.execute("SELECT state_json FROM state_store WHERE id=1").fetchone()
                cases = json.loads(state_row[0]).get("cases", []) if state_row else []
                if case_id and not any(c.get("id") == case_id for c in cases):
                    fail(404, "연결할 8D Case가 존재하지 않습니다.", "CASE_NOT_FOUND")
                record["linkedCaseId"] = case_id
            for key, limit in (("owner", 160), ("dueDate", 10), ("validationResult", 8000), ("implementedDate", 10)):
                if key in payload:
                    value = payload[key]
                    if not isinstance(value, str) or len(value) > limit:
                        fail(400, "담당자, 날짜 또는 검증 결과를 확인하세요.")
                    if key.endswith("Date") and value:
                        try:
                            datetime.strptime(value, "%Y-%m-%d")
                        except ValueError:
                            fail(400, "날짜 형식을 확인하세요.")
                    if key == "validationResult" and record["status"] in {"Approved", "Implemented", "Closed"} and value.strip() != record[key]:
                        fail(409, "확정된 검증 결과는 변경할 수 없습니다. 추가 의견으로 기록하세요.", "INVALID_TRANSITION")
                    if key == "implementedDate" and value.strip() != record[key] and value.strip() and not (record["kind"] == "PCN" and record["status"] == "Approved" and action == "status" and payload.get("status") == "Implemented"):
                        fail(409, "실제 적용일은 승인된 PCN의 적용 완료 처리에서 입력하세요.", "INVALID_TRANSITION")
                    record[key] = value.strip()
            self._internal_add_files(db, record, files, actor)
            if action == "status":
                self._internal_permission(identity, review=True)
                transitions = ({"Submitted": {"UnderReview", "Rejected"}, "UnderReview": {"InProgress", "Rejected"}, "InProgress": {"Closed", "UnderReview"}, "Rejected": {"Submitted"}, "Closed": {"UnderReview"}}
                               if record["kind"] == "Issue" else {"Submitted": {"UnderReview", "Rejected"}, "UnderReview": {"Approved", "Rejected"}, "Approved": {"Implemented"}, "Rejected": {"Submitted"}, "Implemented": set()})
                target = payload.get("status")
                if not isinstance(target, str) or target not in transitions.get(record["status"], set()):
                    fail(409, "현재 단계에서 허용되지 않는 상태 변경입니다.", "INVALID_TRANSITION")
                if target in {"Approved", "Implemented", "Closed"} and (not record["files"] or not record["validationResult"].strip()):
                    fail(400, "승인·종결·적용 전 검증 결과와 원본 Evidence를 등록하세요.", "VERIFICATION_REQUIRED")
                if target == "Approved" and not record["owner"]:
                    fail(400, "PCN 적용 담당자를 지정하세요.", "OWNER_REQUIRED")
                if target == "Implemented" and not record["implementedDate"]:
                    fail(400, "실제 적용일을 입력하세요.", "IMPLEMENTATION_REQUIRED")
                record["status"] = target
            record["revision"] += 1
            record["updatedAt"] = now()
            record["history"].append({"action": action, "status": record["status"], "comment": comment.strip(), "actor": actor, "at": now()})
            serialized = encoded(record)
            db.execute("UPDATE internal_quality_records SET revision=?,record_json=?,updated_at=? WHERE ticket_id=?", (record["revision"], serialized, record["updatedAt"], ticket_id))
            self._audit(db, identity.user["id"], identity.user["username"], "INTERNAL_QUALITY_UPDATED", "internal_quality", ticket_id, before_hash=hashlib.sha256(row["record_json"].encode()).hexdigest(), after_hash=hashlib.sha256(serialized.encode()).hexdigest(), details={"action": action, "status": record["status"], "revision": record["revision"]})
        return record

    def get_internal_quality_file(self, identity, ticket_id, file_id):
        self._internal_permission(identity, read=True)
        with self._connect() as db:
            row = db.execute("SELECT * FROM internal_quality_files WHERE ticket_id=? AND file_id=?", (ticket_id, file_id)).fetchone()
            if not row:
                fail(404, "첨부 원본을 찾을 수 없습니다.", "EVIDENCE_NOT_FOUND")
            return dict(row)
