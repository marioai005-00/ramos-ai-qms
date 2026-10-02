"""Outsourced assembly defects recorded per product, with supplier, lot, quantities and follow-up."""
import hashlib
import json
import secrets
from datetime import datetime, timezone

from internal_quality import REVIEW_ROLES, encoded, fail, now
from supplier_notices import SUPPLIERS
from supplier_tickets import _quantity, _text

CODE = "INVALID_ASSEMBLY_DEFECT"
NEXT_STATUS = {"Open": {"InAction"}, "InAction": {"Closed", "Open"}, "Closed": {"InAction"}}


class AssemblyDefectsMixin:
    def _init_assembly_defects(self, db):
        db.executescript("""
            CREATE TABLE IF NOT EXISTS assembly_defect_records (
                record_id TEXT PRIMARY KEY, part_number TEXT NOT NULL, supplier_id TEXT NOT NULL,
                revision INTEGER NOT NULL, record_json TEXT NOT NULL, updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS assembly_defect_files (
                file_id TEXT PRIMARY KEY, record_id TEXT NOT NULL REFERENCES assembly_defect_records(record_id),
                original_name TEXT NOT NULL, content BLOB NOT NULL, sha256 TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_assembly_defect_part ON assembly_defect_records(part_number, updated_at);
        """)

    def _assembly_fields(self, db, payload):
        if not isinstance(payload, dict):
            fail(400, "등록 정보를 확인하세요.", CODE)
        supplier_id = _text(payload, "supplierId", 40, True, "외주사")
        if supplier_id not in SUPPLIERS:
            fail(400, "공식 외주사를 선택하세요.", CODE)
        occurred = _text(payload, "occurredDate", 10, True, "발생일")
        try:
            datetime.strptime(occurred, "%Y-%m-%d")
        except ValueError:
            fail(400, "발생일 형식을 확인하세요.", CODE)
        input_qty, defect_qty = _quantity(payload, "inputQty"), _quantity(payload, "defectQty")
        if defect_qty is None:
            fail(400, "불량 수량을 입력하세요.", CODE)
        if input_qty is not None and defect_qty > input_qty:
            fail(400, "불량 수량이 투입 수량을 초과할 수 없습니다.", CODE)
        fields = {
            "supplier": {"id": supplier_id, "name": SUPPLIERS[supplier_id]["name"]},
            "partNumber": _text(payload, "partNumber", 240, True, "품목코드"),
            "productName": _text(payload, "productName", 240),
            "lotNo": _text(payload, "lotNo", 240),
            "occurredDate": occurred,
            "process": _text(payload, "process", 240),
            "defectType": _text(payload, "defectType", 240, True, "불량 유형"),
            "inputQty": input_qty, "defectQty": defect_qty,
            "description": _text(payload, "description", 8000),
            "containment": _text(payload, "containment", 8000),
            "owner": _text(payload, "owner", 160),
            "linkedTicketId": _text(payload, "linkedTicketId", 60),
            "linkedCaseId": _text(payload, "linkedCaseId", 240),
        }
        # Links are references to records that really exist; nothing is created or changed there.
        if fields["linkedTicketId"]:
            row = db.execute("SELECT supplier_id FROM supplier_tickets WHERE ticket_id=?", (fields["linkedTicketId"],)).fetchone()
            if not row:
                fail(404, "연결할 외주 접수가 없습니다.", "TICKET_NOT_FOUND")
            if row["supplier_id"] != supplier_id:
                fail(400, "연결할 외주 접수의 외주사가 다릅니다.", CODE)
        if fields["linkedCaseId"]:
            state = db.execute("SELECT state_json FROM state_store WHERE id=1").fetchone()
            if not any(c.get("id") == fields["linkedCaseId"] for c in (json.loads(state[0]).get("cases", []) if state else [])):
                fail(404, "연결할 8D Case가 없습니다.", "CASE_NOT_FOUND")
        return fields

    def _assembly_add_files(self, db, record, files, actor):
        for name, content in files:
            file_id, digest = "ADF-" + secrets.token_hex(16), hashlib.sha256(content).hexdigest()
            db.execute("INSERT INTO assembly_defect_files VALUES(?,?,?,?,?)", (file_id, record["recordId"], name, content, digest))
            record["files"].append({"id": file_id, "name": name, "size": len(content), "sha256": digest, "uploadedBy": actor, "uploadedAt": now()})

    @staticmethod
    def _assembly_summary(records):
        """Per-product totals. Rates use only records where both quantities were entered."""
        products = {}
        for record in records:
            item = products.setdefault(record["partNumber"], {"partNumber": record["partNumber"], "productName": "", "records": 0, "open": 0,
                                                              "defectQty": 0, "measuredDefectQty": 0, "measuredInputQty": 0, "measuredRecords": 0,
                                                              "suppliers": {}, "defectTypes": {}, "lastOccurredDate": ""})
            item["productName"] = item["productName"] or record.get("productName", "")
            item["records"] += 1
            item["open"] += record["status"] != "Closed"
            item["defectQty"] += record["defectQty"]
            if record["inputQty"]:
                item["measuredDefectQty"] += record["defectQty"]
                item["measuredInputQty"] += record["inputQty"]
                item["measuredRecords"] += 1
            supplier = item["suppliers"].setdefault(record["supplier"]["name"], {"records": 0, "defectQty": 0})
            supplier["records"] += 1
            supplier["defectQty"] += record["defectQty"]
            defect = item["defectTypes"].setdefault(record["defectType"], {"records": 0, "defectQty": 0})
            defect["records"] += 1
            defect["defectQty"] += record["defectQty"]
            item["lastOccurredDate"] = max(item["lastOccurredDate"], record["occurredDate"])
        result = []
        for item in products.values():
            item["defectRatePct"] = round(item["measuredDefectQty"] / item["measuredInputQty"] * 100, 4) if item["measuredInputQty"] else None
            item["suppliers"] = [{"name": name, **value} for name, value in sorted(item["suppliers"].items(), key=lambda kv: -kv[1]["defectQty"])]
            item["defectTypes"] = [{"type": name, **value} for name, value in sorted(item["defectTypes"].items(), key=lambda kv: -kv[1]["defectQty"])]
            result.append(item)
        return sorted(result, key=lambda item: (-item["defectQty"], item["partNumber"]))

    def list_assembly_defects(self, identity):
        self._internal_permission(identity, read=True)
        with self._connect() as db:
            records = [json.loads(r[0]) for r in db.execute("SELECT record_json FROM assembly_defect_records ORDER BY updated_at DESC, record_id DESC")]
        return {"items": records, "products": self._assembly_summary(records), "generatedAt": now()}

    def create_assembly_defect(self, identity, payload):
        self._internal_permission(identity)
        files = self._internal_files(payload)
        actor = {k: identity.user.get(k, "") for k in ("username", "name", "dept", "email")}
        with self._lock, self._connect() as db:
            db.execute("BEGIN IMMEDIATE")
            fields = self._assembly_fields(db, payload)
            prefix = "ASD-" + str(datetime.now(timezone.utc).year)
            count = db.execute("SELECT count(*) FROM assembly_defect_records WHERE record_id LIKE ?", (prefix + "-%",)).fetchone()[0]
            record = {**fields, "recordId": f"{prefix}-{count + 1:04d}", "status": "Open", "revision": 1, "actionResult": "",
                      "createdAt": now(), "updatedAt": now(), "createdBy": actor, "files": [],
                      "history": [{"action": "create", "status": "Open", "comment": "", "actor": actor, "at": now()}]}
            db.execute("INSERT INTO assembly_defect_records VALUES(?,?,?,?,?,?)", (record["recordId"], record["partNumber"], record["supplier"]["id"], 1, encoded(record), record["updatedAt"]))
            self._assembly_add_files(db, record, files, actor)
            db.execute("UPDATE assembly_defect_records SET record_json=? WHERE record_id=?", (encoded(record), record["recordId"]))
            self._audit(db, identity.user["id"], identity.user["username"], "ASSEMBLY_DEFECT_CREATED", "assembly_defect", record["recordId"],
                        after_hash=hashlib.sha256(encoded(record).encode()).hexdigest(), details={"partNumber": record["partNumber"], "supplierId": record["supplier"]["id"]})
        return record

    def update_assembly_defect(self, identity, record_id, payload):
        self._internal_permission(identity)
        if not isinstance(payload, dict):
            fail(400, "요청 내용을 확인하세요.", CODE)
        action = _text(payload, "action", 20, True, "작업")
        comment = _text(payload, "comment", 8000, True, "조치 / 변경 내용")
        files = self._internal_files(payload)
        actor = {k: identity.user.get(k, "") for k in ("username", "name", "dept", "email")}
        with self._lock, self._connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT * FROM assembly_defect_records WHERE record_id=?", (record_id,)).fetchone()
            if not row:
                fail(404, "조립 불량 기록을 찾을 수 없습니다.", "ASSEMBLY_DEFECT_NOT_FOUND")
            record = json.loads(row["record_json"])
            revision = payload.get("expectedRevision")
            if isinstance(revision, bool) or not isinstance(revision, int) or revision != row["revision"]:
                fail(409, "다른 사용자가 먼저 수정했습니다. 최신 내용을 불러와 다시 진행하세요.", "REVISION_CONFLICT")
            if action == "edit":
                if record["status"] == "Closed":
                    fail(409, "종결된 기록은 재검토를 시작한 뒤 수정할 수 있습니다.", "INVALID_TRANSITION")
                record.update(self._assembly_fields(db, payload))
            elif action == "status":
                target = _text(payload, "status", 20, True, "상태")
                if target not in NEXT_STATUS.get(record["status"], set()):
                    fail(409, "현재 상태에서는 선택한 상태로 바꿀 수 없습니다.", "INVALID_TRANSITION")
                if target == "Closed" or record["status"] == "Closed":
                    # Closing and reopening are quality reviewer decisions.
                    self._require_role(identity, REVIEW_ROLES)
                if target == "Closed":
                    record["actionResult"] = _text(payload, "actionResult", 8000, True, "조치 결과")
                    record["closedAt"], record["closedBy"] = now(), actor
                record["status"] = target
            elif action != "note":
                fail(400, "작업 구분을 확인하세요.", CODE)
            self._assembly_add_files(db, record, files, actor)
            record["revision"] += 1
            record["updatedAt"] = now()
            record["history"].append({"action": action, "status": record["status"], "comment": comment, "actor": actor, "at": now()})
            serialized = encoded(record)
            db.execute("UPDATE assembly_defect_records SET part_number=?, supplier_id=?, revision=?, record_json=?, updated_at=? WHERE record_id=?",
                       (record["partNumber"], record["supplier"]["id"], record["revision"], serialized, record["updatedAt"], record_id))
            self._audit(db, identity.user["id"], identity.user["username"], "ASSEMBLY_DEFECT_UPDATED", "assembly_defect", record_id,
                        before_hash=hashlib.sha256(row["record_json"].encode()).hexdigest(), after_hash=hashlib.sha256(serialized.encode()).hexdigest(),
                        details={"action": action, "status": record["status"], "revision": record["revision"]})
        return record

    def get_assembly_defect_file(self, identity, record_id, file_id):
        self._internal_permission(identity, read=True)
        with self._connect() as db:
            row = db.execute("SELECT * FROM assembly_defect_files WHERE record_id=? AND file_id=?", (record_id, file_id)).fetchone()
            if not row:
                fail(404, "첨부 원본을 찾을 수 없습니다.", "EVIDENCE_NOT_FOUND")
            return dict(row)
