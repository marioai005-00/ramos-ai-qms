"""Company-to-supplier nonconformance notices with recipient-scoped replies."""
import hashlib
import json
import secrets
from datetime import datetime, timezone
from internal_quality import encoded, now, fail

SUPPLIERS = {
    "SUP-TECHL": {"id": "SUP-TECHL", "name": "TechL", "username": "thkwon", "contact": "권태훈 부장", "email": "thkwon@techl.co.kr", "category": "SMT_MODULE"},
    "SUP-WINPAC": {"id": "SUP-WINPAC", "name": "WinPAC", "username": "yspark", "contact": "박영수 차장", "email": "yspark@winpac.co.kr", "category": "OSAT_PKG"},
    "SUP-SSPC": {"id": "SUP-SSPC", "name": "SSPC", "username": "sangwook.ki", "contact": "기상욱 팀장", "email": "sangwook.ki@sfasemicon.com", "category": "OSAT_PKG"},
    "SUP-CTST": {"id": "SUP-CTST", "name": "CTST", "username": "ojs", "contact": "오재수 그룹장", "email": "ojs@ctst.co.kr", "category": "TEST_HOUSE"},
}


FIELD_LABELS = {"supplierId":"통보 대상 외주사", "action":"관리 작업", "comment":"통보 / 검토 의견", "requestedAction":"외주사 요청 사항", "severity":"위험도", "owner":"사내 담당자", "dueDate":"회신 기한", "linkedCaseId":"연결 Case", "responseSummary":"외주사 회신 내용", "responseContainment":"회신 초동 조치", "rootCause":"확인된 원인", "correctiveAction":"시정 조치", "preventiveAction":"재발 방지", "actionDueDate":"조치 예정일", "responseSource":"실제 회신 경로", "responseReceivedAt":"실제 회신 받은 일시", "validationResult":"종결 검증 결과"}

def text(payload, key, limit=8000, required=False):
    value = payload.get(key, "")
    if not isinstance(value, str) or len(value) > limit or required and not value.strip():
        fail(400, f"{FIELD_LABELS.get(key, key)}: 필수 입력 또는 입력 길이를 확인하세요.", "INVALID_SUPPLIER_NOTICE")
    return value.strip()


def valid_date(value, moment=False):
    try:
        if moment:
            if "T" not in value:
                raise ValueError()
            datetime.fromisoformat(value)
        else:
            if len(value) != 10:
                raise ValueError()
            datetime.strptime(value, "%Y-%m-%d")
    except (TypeError, ValueError):
        fail(400, "발생 일시 또는 회신 기한을 확인하세요.", "INVALID_SUPPLIER_NOTICE")


class SupplierNoticesMixin:
    def _init_supplier_notices(self, db):
        db.executescript("""
            CREATE TABLE IF NOT EXISTS supplier_notices (
                ticket_id TEXT PRIMARY KEY, supplier_id TEXT NOT NULL, revision INTEGER NOT NULL,
                record_json TEXT NOT NULL, updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS supplier_notice_files (
                file_id TEXT PRIMARY KEY, ticket_id TEXT NOT NULL REFERENCES supplier_notices(ticket_id),
                original_name TEXT NOT NULL, content BLOB NOT NULL, sha256 TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_supplier_notice_recipient ON supplier_notices(supplier_id, updated_at);
        """)

    def _notice_supplier_id(self, identity):
        if identity.user.get("isSupplier") or "supplier_user" in identity.user.get("roles", []):
            supplier_id = next((k for k, v in SUPPLIERS.items() if v["username"] == identity.user.get("username")), None)
            if not supplier_id:
                fail(403, "등록된 외주사 계정이 아닙니다.", "ROLE_FORBIDDEN")
            return supplier_id
        self._internal_permission(identity, read=True)
        return None

    def _notice_visible(self, identity, record):
        supplier_id = self._notice_supplier_id(identity)
        if supplier_id and (record["supplier"]["id"] != supplier_id or record["status"] == "Draft"):
            fail(404, "조회할 수 있는 부적합 통보가 없습니다.", "NOTICE_NOT_FOUND")

    def _notice_fields(self, payload):
        supplier_id = text(payload, "supplierId", 40, True)
        if supplier_id not in SUPPLIERS:
            fail(400, "공식 외주사를 선택하세요.", "INVALID_SUPPLIER_NOTICE")
        base = self._internal_fields({**payload, "issueType": "Nonconformance"}, "Issue")
        values = {k: base[k] for k in ("title", "description", "department", "owner", "site", "product", "partNumber", "lotNo", "process", "occurredAt", "dueDate", "inputQty", "defectQty", "containment")}
        if not values["owner"] or not values["dueDate"]:
            fail(400, "사내 담당자와 외주사 회신 기한을 입력하세요.", "INVALID_SUPPLIER_NOTICE")
        values["requestedAction"] = text(payload, "requestedAction", required=True)
        values["severity"] = text(payload, "severity", 20) or "Unknown"
        if values["severity"] not in {"Unknown", "Minor", "Major", "Critical"}:
            fail(400, "위험도 구분을 확인하세요.", "INVALID_SUPPLIER_NOTICE")
        values["supplier"] = dict(SUPPLIERS[supplier_id])
        return values

    def list_supplier_notices(self, identity):
        recipient = self._notice_supplier_id(identity)
        with self._connect() as db:
            rows = db.execute("SELECT record_json FROM supplier_notices" + (" WHERE supplier_id=?" if recipient else "") + " ORDER BY updated_at DESC, ticket_id DESC", (recipient,) if recipient else ()).fetchall()
            records = [json.loads(row[0]) for row in rows]
            return [r for r in records if not recipient or r["status"] != "Draft"]

    def get_supplier_notice(self, identity, ticket_id):
        self._notice_supplier_id(identity)
        with self._connect() as db:
            row = db.execute("SELECT record_json FROM supplier_notices WHERE ticket_id=?", (ticket_id,)).fetchone()
            if not row:
                fail(404, "부적합 통보를 찾을 수 없습니다.", "NOTICE_NOT_FOUND")
            record = json.loads(row[0])
            self._notice_visible(identity, record)
            return record

    def _notice_add_files(self, db, record, files, actor, phase):
        for name, content in files:
            file_id, digest = "SNF-" + secrets.token_hex(16), hashlib.sha256(content).hexdigest()
            db.execute("INSERT INTO supplier_notice_files VALUES(?,?,?,?,?)", (file_id, record["ticketId"], name, content, digest))
            record["files"].append({"id": file_id, "name": name, "size": len(content), "sha256": digest, "phase": phase, "uploadedBy": actor, "uploadedAt": now()})

    def _notice_link(self, db, record, payload):
        if "linkedCaseId" not in payload:
            return
        case_id = text(payload, "linkedCaseId", 240)
        state = db.execute("SELECT state_json FROM state_store WHERE id=1").fetchone()
        if case_id and not any(c.get("id") == case_id for c in (json.loads(state[0]).get("cases", []) if state else [])):
            fail(404, "연결할 8D Case가 없습니다.", "CASE_NOT_FOUND")
        record["linkedCaseId"] = case_id

    def create_supplier_notice(self, identity, payload):
        self._internal_permission(identity)
        fields, files = self._notice_fields(payload), self._internal_files(payload)
        actor = {k: identity.user.get(k, "") for k in ("username", "name", "dept", "email")}
        with self._lock, self._connect() as db:
            db.execute("BEGIN IMMEDIATE")
            prefix = "SCAR-" + str(datetime.now(timezone.utc).year)
            count = db.execute("SELECT count(*) FROM supplier_notices WHERE ticket_id LIKE ?", (prefix + "-%",)).fetchone()[0]
            record = {**fields, "ticketId": f"{prefix}-{count+1:04d}", "scope": "CompanyToSupplier", "status": "Draft", "revision": 1,
                      "createdAt": now(), "updatedAt": now(), "createdBy": actor, "files": [], "responses": [], "linkedCaseId": "", "validationResult": "",
                      "issuedAt": "", "closedAt": "", "history": [{"action": "Created", "status": "Draft", "comment": "사내 통보 내용 등록 · 외주사 공개 전", "actor": actor, "at": now()}]}
            self._notice_link(db, record, payload)
            db.execute("INSERT INTO supplier_notices VALUES(?,?,?,?,?)", (record["ticketId"], fields["supplier"]["id"], 1, encoded(record), record["updatedAt"]))
            self._notice_add_files(db, record, files, actor, "Notice")
            db.execute("UPDATE supplier_notices SET record_json=? WHERE ticket_id=?", (encoded(record), record["ticketId"]))
            self._audit(db, identity.user["id"], identity.user["username"], "SUPPLIER_NOTICE_CREATED", "supplier_notice", record["ticketId"], after_hash=hashlib.sha256(encoded(record).encode()).hexdigest(), details={"supplierId": fields["supplier"]["id"]})
        return record

    def update_supplier_notice(self, identity, ticket_id, payload):
        recipient = self._notice_supplier_id(identity)
        action = text(payload, "action", 30, True)
        if recipient and action != "reply":
            fail(403, "외주사 계정은 해당 업체의 회신만 등록할 수 있습니다.", "ROLE_FORBIDDEN")
        if not recipient:
            self._internal_permission(identity)
        comment = text(payload, "comment", required=True)
        files = self._internal_files(payload)
        actor = {k: identity.user.get(k, "") for k in ("username", "name", "dept", "email")}
        with self._lock, self._connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT * FROM supplier_notices WHERE ticket_id=?", (ticket_id,)).fetchone()
            if not row:
                fail(404, "부적합 통보를 찾을 수 없습니다.", "NOTICE_NOT_FOUND")
            record = json.loads(row["record_json"])
            self._notice_visible(identity, record)
            revision = payload.get("expectedRevision")
            if isinstance(revision, bool) or not isinstance(revision, int) or revision != row["revision"]:
                fail(409, "다른 사용자가 수정했습니다. 최신 내용을 불러와 다시 저장하세요.", "REVISION_CONFLICT")
            if record["status"] == "Closed" and action != "reopen":
                fail(409, "종결 기록은 품질 담당자가 재검토를 시작한 뒤 수정할 수 있습니다.", "INVALID_TRANSITION")
            if action in {"note", "publish", "review", "requestRevision", "close"}:
                for key, limit in (("owner", 160), ("dueDate", 10)):
                    if key in payload:
                        record[key] = text(payload, key, limit, True)
                valid_date(record["dueDate"])
                self._notice_link(db, record, payload)
            if action == "edit":
                if record["status"] != "Draft":
                    fail(409, "외주사 공개 전 통보만 기본 내용을 수정할 수 있습니다.", "INVALID_TRANSITION")
                record.update(self._notice_fields(payload))
                self._notice_link(db, record, payload)
            elif action == "note":
                for key, limit in (("owner", 160), ("dueDate", 10)):
                    if key in payload:
                        record[key] = text(payload, key, limit, True)
                valid_date(record["dueDate"])
                self._notice_link(db, record, payload)
            elif action in {"reply", "recordReply"}:
                if record["status"] not in {"Issued", "RevisionRequested", "Responded"}:
                    fail(409, "현재 상태에서는 회신을 등록할 수 없습니다.", "INVALID_TRANSITION")
                if action == "recordReply" and recipient or action == "reply" and not recipient:
                    fail(403, "사내 기록과 외주사 직접 회신을 구분하세요.", "ROLE_FORBIDDEN")
                response = {k: text(payload, k, required=k == "responseSummary") for k in ("responseSummary", "responseContainment", "rootCause", "correctiveAction", "preventiveAction")}
                response["actionDueDate"] = text(payload, "actionDueDate", 10)
                if response["actionDueDate"]:
                    valid_date(response["actionDueDate"])
                response["source"] = "Portal" if recipient else text(payload, "responseSource", 20, True)
                if response["source"] not in {"Portal", "Email", "Meeting", "Other"} or not recipient and response["source"] == "Portal":
                    fail(400, "실제 회신 경로를 선택하세요.", "INVALID_SUPPLIER_NOTICE")
                response["receivedAt"] = now() if recipient else text(payload, "responseReceivedAt", 40, True)
                valid_date(response["receivedAt"], moment=True)
                response.update({"recordedBy": actor, "recordedAt": now()})
                record["responses"].append(response)
                record["status"] = "Responded"
            elif action in {"publish", "review", "requestRevision", "close", "reopen"}:
                self._internal_permission(identity, review=True)
                expected = {"publish": {"Draft"}, "review": {"Responded"}, "requestRevision": {"UnderReview"}, "close": {"UnderReview"}, "reopen": {"Closed"}}
                if record["status"] not in expected[action]:
                    fail(409, "현재 단계에서는 선택한 작업을 수행할 수 없습니다.", "INVALID_TRANSITION")
                record["status"] = {"publish": "Issued", "review": "UnderReview", "requestRevision": "RevisionRequested", "close": "Closed", "reopen": "UnderReview"}[action]
                if action == "publish":
                    record["issuedAt"], record["issuedBy"] = now(), actor
                if action == "close":
                    record["validationResult"] = text(payload, "validationResult", required=True)
                if action == "reopen":
                    record["validationResult"] = ""
            else:
                fail(400, "관리 작업을 확인하세요.", "INVALID_SUPPLIER_NOTICE")
            phase = "Response" if action in {"reply", "recordReply"} else "Notice" if record["status"] == "Draft" or action == "publish" else "Review"
            self._notice_add_files(db, record, files, actor, phase)
            if action == "close":
                if not any(f["phase"] in {"Response", "Review"} for f in record["files"]):
                    fail(400, "종결 전 회신 또는 검증 Evidence 원본을 첨부하세요.", "VERIFICATION_REQUIRED")
                record["closedAt"], record["closedBy"] = now(), actor
            record["revision"] += 1
            record["updatedAt"] = now()
            record["history"].append({"action": action, "status": record["status"], "comment": comment, "actor": actor, "at": now()})
            serialized = encoded(record)
            db.execute("UPDATE supplier_notices SET supplier_id=?, revision=?,record_json=?,updated_at=? WHERE ticket_id=?", (record["supplier"]["id"], record["revision"], serialized, record["updatedAt"], ticket_id))
            self._audit(db, identity.user["id"], identity.user["username"], "SUPPLIER_NOTICE_UPDATED", "supplier_notice", ticket_id, before_hash=hashlib.sha256(row["record_json"].encode()).hexdigest(), after_hash=hashlib.sha256(serialized.encode()).hexdigest(), details={"action": action, "status": record["status"], "revision": record["revision"]})
        return record

    def get_supplier_notice_file(self, identity, ticket_id, file_id):
        self.get_supplier_notice(identity, ticket_id)
        with self._connect() as db:
            row = db.execute("SELECT * FROM supplier_notice_files WHERE ticket_id=? AND file_id=?", (ticket_id, file_id)).fetchone()
            if not row:
                fail(404, "첨부 원본을 찾을 수 없습니다.", "EVIDENCE_NOT_FOUND")
            return dict(row)
