"""Originals attached to a customer intake, kept centrally before a Case exists.

An intake has no Case at STEP 01, so its originals are stored here under the intake number.
When the reviewer approves the intake, carry_intake_originals copies the stored bytes into the
Case's evidence. Only files this table actually holds are carried; nothing is created otherwise.
"""
import hashlib
import json
import re
import secrets

from internal_quality import WRITE_ROLES, encoded, fail, now

READ_ROLES = WRITE_ROLES | {"read_only_auditor"}
INTAKE_ID = re.compile(r"[A-Za-z0-9][A-Za-z0-9_-]{0,79}")
CARRIED_STAGES = ["D2", "D3"]


class IntakeFilesMixin:
    def _init_intake_files(self, db):
        db.executescript("""
            CREATE TABLE IF NOT EXISTS intake_files (
                file_id TEXT PRIMARY KEY, intake_id TEXT NOT NULL, original_name TEXT NOT NULL,
                mime_type TEXT NOT NULL, byte_size INTEGER NOT NULL, sha256 TEXT NOT NULL, content BLOB NOT NULL,
                created_at TEXT NOT NULL, created_by INTEGER NOT NULL REFERENCES users(id), created_by_email TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_intake_files_intake ON intake_files(intake_id);
        """)

    def upload_intake_file(self, identity, payload):
        self._require_role(identity, WRITE_ROLES)
        intake_id = payload.get("intakeId") if isinstance(payload, dict) else None
        if not isinstance(intake_id, str) or not INTAKE_ID.fullmatch(intake_id):
            fail(400, "접수번호를 확인하세요.", "INVALID_EVIDENCE")
        name, content, mime = self._original_from_payload(payload)
        file_id = "INF-" + secrets.token_hex(16)
        digest = hashlib.sha256(content).hexdigest()
        created = now()
        with self._lock, self._connect() as db:
            db.execute("INSERT INTO intake_files(file_id,intake_id,original_name,mime_type,byte_size,sha256,content,created_at,created_by,created_by_email) VALUES(?,?,?,?,?,?,?,?,?,?)",
                       (file_id, intake_id, name, mime, len(content), digest, content, created, identity.user["id"], identity.user["email"]))
            self._audit(db, identity.user["id"], identity.user["username"], "INTAKE_FILE_UPLOADED", "intake", intake_id,
                        details={"intakeFileId": file_id, "sha256": digest, "bytes": len(content)})
        return {"intakeFileId": file_id, "intakeId": intake_id, "file": name, "mimeType": mime, "sizeBytes": len(content),
                "sha256": digest, "uploadedBy": identity.user["email"], "uploadedAt": created}

    def get_intake_file(self, identity, file_id):
        self._require_role(identity, READ_ROLES)
        with self._connect() as db:
            row = db.execute("SELECT * FROM intake_files WHERE file_id=?", (file_id,)).fetchone()
        if row is None:
            fail(404, "보관된 접수 원본을 찾을 수 없습니다.", "EVIDENCE_NOT_FOUND")
        return dict(row)

    def carry_intake_originals(self, identity, case_id, payload):
        """Copy the stored originals of the Case's source intake into the Case evidence (D2·D3)."""
        self._require_role(identity, WRITE_ROLES)
        expected = payload.get("expectedRevision") if isinstance(payload, dict) else None
        if isinstance(expected, bool) or not isinstance(expected, int):
            fail(400, "저장 revision을 확인하세요.", "INVALID_EVIDENCE")
        with self._lock, self._connect() as db:
            db.execute("BEGIN IMMEDIATE")
            previous = db.execute("SELECT * FROM state_store WHERE id=1").fetchone()
            state = json.loads(previous["state_json"]) if previous else {}
            case = next((item for item in state.get("cases") or [] if isinstance(item, dict) and item.get("id") == case_id), None)
            if case is None:
                fail(404, "대상 Case를 먼저 저장하세요.", "CASE_NOT_FOUND")
            if previous["revision"] != expected:
                fail(409, "다른 사용자가 먼저 저장했습니다. 새로고침 후 다시 시도하세요.", "REVISION_CONFLICT")
            intake_id = case.get("sourceIntakeId")
            intake = next((item for item in state.get("intakeQueue") or [] if isinstance(item, dict) and item.get("intakeId") == intake_id), None) if isinstance(intake_id, str) and intake_id else None
            if intake is None:
                fail(404, "이 Case에 연결된 접수 기록이 없습니다.", "INTAKE_NOT_FOUND")
            triage = intake.get("triage") if isinstance(intake.get("triage"), dict) else {}
            if triage.get("approvedCaseId") != case_id:
                fail(409, "이 접수는 다른 Case로 승인되었거나 아직 승인되지 않았습니다.", "INTAKE_NOT_LINKED")
            evidence_list = case.get("evidenceList") if isinstance(case.get("evidenceList"), list) else []
            done = {item.get("intakeFileId") for item in evidence_list if isinstance(item, dict)}
            carried, missing = [], []
            created = now()
            for entry in intake.get("evidenceList") or []:
                file_id = entry.get("intakeFileId") if isinstance(entry, dict) else None
                if not isinstance(file_id, str) or file_id in done:
                    continue
                row = db.execute("SELECT * FROM intake_files WHERE file_id=? AND intake_id=?", (file_id, intake_id)).fetchone()
                if row is None:
                    # No stored bytes for this entry: reported back, never turned into an evidence record.
                    missing.append({"intakeFileId": file_id, "file": str(entry.get("file") or "")[:240]})
                    continue
                done.add(file_id)
                evidence_id = "EVD-" + secrets.token_hex(16)
                db.execute("INSERT INTO evidence_metadata(evidence_id,case_id,original_name,mime_type,byte_size,sha256,linked_stages_json,created_at,created_by) VALUES(?,?,?,?,?,?,?,?,?)",
                           (evidence_id, case_id, row["original_name"], row["mime_type"], row["byte_size"], row["sha256"], encoded(CARRIED_STAGES), created, identity.user["id"]))
                db.execute("INSERT INTO evidence_files(evidence_id,content) VALUES(?,?)", (evidence_id, row["content"]))
                carried.append({"id": evidence_id, "serverFileId": evidence_id, "file": row["original_name"], "title": row["original_name"],
                                "type": "Customer original", "linkedStages": list(CARRIED_STAGES), "stageScoped": True,
                                "storageLocation": "QMS", "mimeType": row["mime_type"], "sizeBytes": row["byte_size"], "sha256": row["sha256"],
                                "uploadedBy": row["created_by_email"], "uploadedAt": row["created_at"],
                                "source": f"접수 {intake_id} 원본", "sourceIntakeId": intake_id, "intakeFileId": file_id,
                                "carriedOverBy": identity.user["email"], "carriedOverAt": created})
            if not carried:
                return {"carried": [], "missing": missing, "case": case, "revision": previous["revision"], "updatedAt": previous["updated_at"]}
            case["evidenceList"] = [*evidence_list, *carried]
            self._invalidate_evidence_approvals(case, CARRIED_STAGES, identity)
            text = encoded(state)
            if len(text.encode("utf-8")) > 24 * 1024 * 1024:
                fail(413, "Case 데이터 저장 한도를 초과했습니다.", "STATE_TOO_LARGE")
            revision = previous["revision"] + 1
            after_hash = hashlib.sha256(text.encode("utf-8")).hexdigest()
            db.execute("UPDATE state_store SET revision=?,state_json=?,state_hash=?,updated_at=?,updated_by=? WHERE id=1",
                       (revision, text, after_hash, created, identity.user["id"]))
            self._audit(db, identity.user["id"], identity.user["username"], "INTAKE_ORIGINALS_CARRIED", "case", case_id,
                        before_hash=previous["state_hash"], after_hash=after_hash,
                        details={"intakeId": intake_id, "revision": revision, "missing": [item["intakeFileId"] for item in missing],
                                 "files": [{"evidenceId": item["id"], "intakeFileId": item["intakeFileId"], "sha256": item["sha256"]} for item in carried]})
            return {"carried": carried, "missing": missing, "case": case, "revision": revision, "updatedAt": created}
