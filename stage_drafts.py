"""Evidence-grounded D4~D8 review drafts built only from what the Case already records.

A draft never states a cause, a measurement, a completion or an approval. Where the Case has no
basis for a field the draft says so in ``missingInformation`` and leaves the field for the owner.
"""
import json
from typing import Any

from internal_quality import fail, now

ENGINE = "server-evidence-rules-v1"
STAGES = ("D4", "D5", "D6", "D7", "D8")
CAUSE_LABELS = {"Occurrence": "발생원인", "Escape": "유출원인", "System": "시스템원인"}
CAUSE_QUESTIONS = {
    "Occurrence": "왜 불량이 만들어졌는가 — 재현 또는 제거 시험으로 입증할 수 있는 조건은 무엇인가",
    "Escape": "왜 검사에서 발견하지 못했는가 — 어느 검사 단계가 어떤 조건으로 검출했어야 하는가",
    "System": "왜 관리체계가 예방하지 못했는가 — PFMEA·Control Plan·변경관리 중 어디가 비어 있었는가",
}
NEEDS = "[확인 필요]"


def _d(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _rows(value: Any) -> list[dict[str, Any]]:
    return [item for item in value if isinstance(item, dict)] if isinstance(value, list) else []


def _s(value: Any) -> str:
    return value.strip() if isinstance(value, str) else ("" if value is None or isinstance(value, bool) else str(value))


def _stage_approved(case: dict[str, Any], stage: str) -> bool:
    return _d(_d(case.get("signOffHistory")).get(stage)).get("status") == "Approved"


def _evidence(case: dict[str, Any], stage: str | None = None) -> list[dict[str, Any]]:
    items = _rows(case.get("evidenceList"))
    return [e for e in items if stage is None or stage in (e.get("linkedStages") or [])]


def _evidence_label(item: dict[str, Any]) -> str:
    return f"{_s(item.get('id'))} ({_s(item.get('file') or item.get('title'))})"


def _selected_actions(case: dict[str, Any]) -> list[dict[str, Any]]:
    return [row for row in _rows(_d(case.get("d5")).get("candidates")) if row.get("selected") is True and _s(row.get("id"))]


def _common_facts(case: dict[str, Any], tickets: list[dict[str, Any]]) -> list[str]:
    facts = []
    for label, key in (("고객사", "customer"), ("제품", "product"), ("품번", "partNumber"), ("LOT", "lotNumber"), ("접수 불량", "claimTitle")):
        if _s(case.get(key)):
            facts.append(f"{label}: {_s(case.get(key))}")
    defect, inspected = case.get("defectQty"), case.get("inspectQty")
    if isinstance(defect, (int, float)) and not isinstance(defect, bool) and isinstance(inspected, (int, float)) and not isinstance(inspected, bool) and inspected > 0:
        facts.append(f"접수 수량: 불량 {defect} / 검사 {inspected}")
    approved = [stage for stage in ("D1", "D2", "D3", "D4", "D5", "D6", "D7", "D8") if _stage_approved(case, stage)]
    facts.append("결재 완료 단계: " + (", ".join(approved) if approved else "없음"))
    evidence = _evidence(case)
    facts.append(f"등록 Evidence {len(evidence)}건" + (": " + ", ".join(_evidence_label(e) for e in evidence[:8]) if evidence else ""))
    for ticket in tickets:
        facts.append(f"연결된 외주 접수 {ticket['ticketId']} ({_d(ticket.get('supplier')).get('companyName', '')} · {ticket.get('ticketType')} · 상태 {ticket.get('status')}): {_d(ticket.get('details')).get('title', '')}")
    return facts


def _similar_actions(item: dict[str, Any]) -> list[dict[str, Any]]:
    return [row for row in _rows(item.get("countermeasures")) if row.get("selected") is True and _s(row.get("title"))]


def _references(similar: list[dict[str, Any]]) -> list[str]:
    lines = []
    for item in similar:
        parts = [f"유사 종결 Case {item.get('caseId')} (유사도 {item.get('score')})"]
        cause = _s(_d(_d(item.get("rootCauses")).get("Occurrence")).get("statement"))
        if cause:
            parts.append(f"발생원인: {cause}")
        actions = [_s(row.get("title")) for row in _similar_actions(item)]
        if actions:
            parts.append("선정 대책: " + " / ".join(actions[:3]))
        lines.append(" · ".join(parts))
    return lines


def _d4(case, tickets, similar, out):
    d2 = _d(case.get("d2"))
    lot, claim = _s(case.get("lotNumber")) or NEEDS, _s(case.get("claimTitle")) or NEEDS
    when = _s(d2.get("problemWhen")) or _s(case.get("incidentDate")) or NEEDS
    differences = [row for row in _rows(d2.get("isIsNot")) if _s(row.get("difference")) and row.get("verificationStatus") == "Verified"]
    unverified = [row for row in _rows(d2.get("isIsNot")) if row.get("verificationStatus") != "Verified"]
    hint = ", ".join(_evidence_label(e) for e in (_evidence(case, "D4") or _evidence(case, "D2"))[:6])
    change_lines = [f"D2 차이점 「{_s(row.get('difference'))}」({_s(row.get('factor'))})이 4M 변경과 연결되는지 확인" for row in differences]
    change_lines += [f"외주 PCN {t['ticketId']}({_d(t.get('details')).get('title', '')})의 적용 시점과 불량 LOT {lot}의 관계 확인" for t in tickets if t.get("ticketType") == "PCN"]
    hypotheses = {
        "timeline": f"마지막 정상 LOT부터 LOT {lot} 불량 확인 시점({when})까지 생산·검사·입출고 이력을 시간순으로 놓고 변경 시점이 있었는지 확인",
        "process-flow": f"「{claim}」이 만들어질 수 있는 공정과 이를 검출했어야 할 검사 단계를 공정 흐름에서 특정",
        "change-point": " / ".join(change_lines) if change_lines else "정상 LOT과 불량 LOT 사이의 4M1E·외주사 변경점을 비교 (D2에 검증된 차이점이 없어 비교 대상부터 확인 필요)",
        "fishbone": "8M 관점의 원인 후보를 발굴하고 D2 IS / IS NOT 경계로 설명되지 않는 후보를 기각",
        "five-why": "발생·유출·시스템 원인을 분리하고 Why 단계마다 원본 Evidence를 연결",
    }
    out["tools"] = [{"id": tool_id, "hypothesis": text, "evidenceHint": hint} for tool_id, text in hypotheses.items()]
    out["causeQuestions"] = [{"type": key, "label": CAUSE_LABELS[key], "question": question} for key, question in CAUSE_QUESTIONS.items()]
    for row in differences:
        out["inferences"].append(f"D2에서 검증된 차이점 「{_s(row.get('difference'))}」은 원인 후보 검토 대상입니다. 원인으로 확정된 것은 아닙니다.")
    for ticket in tickets:
        incident = _d(ticket.get("incident"))
        if ticket.get("ticketType") == "Issue" and _s(incident.get("processStep")):
            out["inferences"].append(f"외주 접수 {ticket['ticketId']}가 보고한 공정 「{_s(incident.get('processStep'))}」은 발생 위치 후보입니다. 외주사 보고 내용이며 사내 검증 전입니다.")
    if not _stage_approved(case, "D3"):
        out["missingInformation"].append("D3 봉쇄 범위와 효과성 승인이 완료되지 않았습니다.")
    if unverified:
        out["missingInformation"].append(f"D2 IS / IS NOT {len(unverified)}개 행이 사실 확인 전입니다. 확인 전 차이점은 가설 근거로 쓰지 않았습니다.")
    if not _evidence(case, "D4"):
        out["missingInformation"].append("D4에 연결된 Evidence 원본이 없습니다. FA 성적서·공정 로그·검사 기록을 첨부해야 가설을 검증할 수 있습니다.")
    out["missingInformation"].append("각 원인의 재현·제거 시험 결과와 판정은 초안에 포함하지 않습니다. 실제 시험 후 담당자가 입력합니다.")
    out["recommendations"] += ["필수 도구 5개에 제안된 분석 목적을 검토한 뒤 Evidence와 결과를 직접 작성하십시오.", "발생·유출·시스템 원인은 각각 별도 Evidence로 입증하십시오."]


def _d5(case, tickets, similar, out):
    roots = _d(_d(case.get("d4")).get("rootCauses"))
    existing = _rows(_d(case.get("d5")).get("candidates"))
    candidates = []
    for cause_type, label in CAUSE_LABELS.items():
        root = _d(roots.get(cause_type))
        statement = _s(root.get("statement"))
        if root.get("status") != "Confirmed" or not statement:
            out["missingInformation"].append(f"D4 {label}이 확정되지 않아 대책을 연결할 수 없습니다.")
            continue
        out["confirmedFacts"].append(f"D4 확정 {label}: {statement}")
        if not any(row.get("causeType") == cause_type for row in existing):
            validation = _s(root.get("validationMethod"))
            candidates.append({
                "causeType": cause_type, "title": f"[{label} 제거 대책 작성 필요]",
                "rationale": f"대상 원인: {statement}",
                "verificationPlan": f"D4 검증 방법을 대책 적용 전후 비교에 재사용할 수 있는지 검토: {validation}" if validation else "",
            })
    for ticket in tickets:
        if ticket.get("ticketType") == "PCN" and ticket.get("status") == "Approved":
            details = _d(ticket.get("details"))
            candidates.append({"causeType": "", "title": _s(details.get("title")),
                               "rationale": f"사내 심의에서 승인된 외주 PCN {ticket['ticketId']}의 변경 내용입니다. 어느 원인을 제거하는지 연결이 필요합니다. {_s(details.get('description'))}".strip()})
    for item in similar:
        for action in _similar_actions(item)[:3]:
            cause_type = action.get("causeType") if action.get("causeType") in CAUSE_LABELS else ""
            candidates.append({"causeType": cause_type, "title": f"(유사 Case {item.get('caseId')} 참고) {_s(action.get('title'))}",
                               "rationale": f"유사 종결 Case {item.get('caseId')}의 선정 대책입니다. 본 Case의 확정 원인에 적용 가능한지 검토가 필요합니다."})
    out["groups"]["candidates"] = candidates
    if _d(_d(case.get("d5")).get("pcnEcn")).get("pcnRequired") is None:
        out["missingInformation"].append("PCN 필요 여부가 평가되지 않았습니다. 대책에 4M 변경이 포함되면 고객 변경 승인 대상인지 확인하십시오.")
    out["missingInformation"].append("대책의 담당자·목표일·선정 근거 Evidence는 초안에 포함하지 않습니다.")
    out["recommendations"].append("발생·유출·시스템 원인마다 최소 하나의 대책을 선정하고 원인 구분을 연결하십시오.")


def _d6(case, tickets, similar, out):
    selected = _selected_actions(case)
    d6 = _d(case.get("d6"))
    tests = _rows(d6.get("validationTests"))
    if not selected:
        out["missingInformation"].append("D5에서 선정된 대책이 없어 검증 시험을 제안할 수 없습니다.")
    proposals = []
    for action in selected:
        out["confirmedFacts"].append(f"D5 선정 대책 {action['id']}: {_s(action.get('title'))}")
        if any(test.get("actionId") == action["id"] for test in tests):
            continue
        proposals.append({"actionId": action["id"], "testName": f"{_s(action.get('title'))} 효과 검증",
                          "condition": _s(action.get("verificationPlan")) or "[시험 조건 입력 필요]",
                          "acceptanceCriteria": "[합격 기준 입력 필요 — 고객 규격과 사내 기준 확인]", "owner": _s(action.get("owner"))})
    out["groups"]["validationTests"] = proposals
    if not _s(_d(d6.get("implementationDetails")).get("appliedLot")):
        out["missingInformation"].append("대책 적용 LOT과 적용 증거가 기록되지 않았습니다.")
    open_actions = [a for a in _rows(_d(case.get("d3")).get("actions")) if _s(a.get("id"))]
    if open_actions and _d(d6.get("containmentRelease")).get("decision") not in {"Released", "Retained"}:
        out["missingInformation"].append(f"D3 봉쇄조치 {len(open_actions)}건({', '.join(_s(a.get('id')) for a in open_actions[:6])})의 해제 또는 유지 결정이 필요합니다.")
    out["missingInformation"].append("표본 수·불량 수·판정·시험일은 초안에 포함하지 않습니다. 실제 시험 후 Evidence와 함께 입력합니다.")
    out["recommendations"].append("시험마다 합격 기준을 먼저 확정한 뒤 시험을 진행하십시오.")


def _d7(case, tickets, similar, out):
    selected = _selected_actions(case)
    d7 = _d(case.get("d7"))
    roots = _d(_d(case.get("d4")).get("rootCauses"))
    occurrence = _s(_d(roots.get("Occurrence")).get("statement"))
    system = _s(_d(roots.get("System")).get("statement"))
    if not selected:
        out["missingInformation"].append("D5에서 선정된 대책이 없어 표준 개정과 수평전개를 제안할 수 없습니다.")
    updates, deployments = [], []
    for action in selected:
        if not any(row.get("actionId") == action["id"] for row in _rows(d7.get("systemUpdates"))):
            updates.append({"actionId": action["id"], "docName": "[개정 대상 문서 확인 필요: PFMEA / Control Plan / 작업표준]",
                            "changeContent": f"대책 「{_s(action.get('title'))}」 반영", "owner": _s(action.get("owner"))})
        if not any(row.get("actionId") == action["id"] for row in _rows(d7.get("horizontalDeployment"))):
            deployments.append({"actionId": action["id"], "product": "[동일 공정·자재·설비를 쓰는 제품 확인 필요]",
                                "sameRisk": f"확정 발생원인 「{occurrence}」이 동일하게 적용되는지 평가 필요" if occurrence else "[동일 위험 평가 필요]"})
    out["groups"]["systemUpdates"], out["groups"]["horizontalDeployment"] = updates, deployments
    if system:
        out["confirmedFacts"].append(f"D4 확정 시스템원인: {system}")
        out["recommendations"].append("시스템원인이 가리키는 관리 문서가 개정 대상에 포함됐는지 확인하십시오.")
    if not _stage_approved(case, "D6"):
        out["missingInformation"].append("D6 효과 검증 승인이 완료되지 않았습니다. 검증되지 않은 대책을 표준에 반영하기 전에 확인하십시오.")
    suppliers = sorted({_d(t.get("supplier")).get("companyName", "") for t in tickets} - {""})
    if suppliers:
        out["recommendations"].append(f"연결된 외주사({', '.join(suppliers)})의 동일 공정에도 수평전개가 필요한지 검토하십시오.")
    out["missingInformation"].append("문서 번호·Revision·완료 상태·개정 Evidence는 초안에 포함하지 않습니다.")


def _d8(case, tickets, similar, out):
    out["groups"]["checklist"] = []
    for stage in ("D1", "D2", "D3", "D4", "D5", "D6", "D7"):
        if not _stage_approved(case, stage):
            out["missingInformation"].append(f"{stage} 결재가 완료되지 않았습니다.")
    for stage in ("D2", "D3", "D4", "D6"):
        linked = _evidence(case, stage)
        if linked:
            out["confirmedFacts"].append(f"{stage} 연결 Evidence: " + ", ".join(_evidence_label(e) for e in linked[:6]))
        else:
            out["missingInformation"].append(f"{stage}에 연결된 Evidence 원본이 없습니다.")
    tests = _rows(_d(case.get("d6")).get("validationTests"))
    not_passed = [t for t in tests if t.get("result") != "PASS"]
    if not tests:
        out["missingInformation"].append("D6 검증 시험이 등록되지 않았습니다.")
    elif not_passed:
        out["missingInformation"].append(f"D6 검증 시험 {len(not_passed)}건이 PASS가 아닙니다.")
    open_updates = [r for r in _rows(_d(case.get("d7")).get("systemUpdates")) if r.get("status") != "Completed"]
    if open_updates:
        out["missingInformation"].append(f"D7 표준 개정 {len(open_updates)}건이 완료되지 않았습니다.")
    release = _d(_d(case.get("d6")).get("containmentRelease")).get("decision")
    if release not in {"Released", "Retained"}:
        out["missingInformation"].append("D3 봉쇄의 해제 또는 유지 결정이 기록되지 않았습니다.")
    closure = _d(_d(case.get("d8")).get("closure"))
    # Customer dispatch and acceptance are not closure conditions (user decision 2026-10-03).
    for key, label in (("remainingRisk", "잔여 위험"), ("evidence", "종결 근거")):
        if not _s(closure.get(key)):
            out["missingInformation"].append(f"{label}이 기록되지 않았습니다.")
    open_tickets = [t["ticketId"] for t in tickets if t.get("status") not in {"Approved", "Rejected"}]
    if open_tickets:
        out["missingInformation"].append(f"연결된 외주 접수 {', '.join(open_tickets)}의 심의가 끝나지 않았습니다.")
    out["recommendations"].append("종결 점검의 근거 칸은 초안이 채우지 않습니다. 위 누락 항목을 해결한 뒤 담당자가 원본을 확인하고 입력하십시오.")


BUILDERS = {"D4": _d4, "D5": _d5, "D6": _d6, "D7": _d7, "D8": _d8}


def build_stage_draft(case: dict[str, Any], stage: str, tickets: list[dict[str, Any]], similar: list[dict[str, Any]]) -> dict[str, Any]:
    out: dict[str, Any] = {"confirmedFacts": _common_facts(case, tickets), "inferences": [], "missingInformation": [], "recommendations": [],
                           "references": _references(similar), "groups": {}}
    BUILDERS[stage](case, tickets, similar, out)
    return out


class StageDraftMixin:
    def build_stage_draft(self, identity, payload):
        """Draft for the centrally saved Case, so every statement traces back to stored data."""
        self._internal_permission(identity)
        case_id = payload.get("caseId") if isinstance(payload, dict) else None
        stage = payload.get("stage") if isinstance(payload, dict) else None
        if not isinstance(case_id, str) or not case_id or stage not in STAGES:
            fail(400, "Case와 D4~D8 단계를 지정하세요.", "INVALID_STAGE_DRAFT")
        with self._connect() as db:
            row = db.execute("SELECT revision, state_json FROM state_store WHERE id=1").fetchone()
            case = next((c for c in (json.loads(row["state_json"]).get("cases", []) if row else []) if isinstance(c, dict) and c.get("id") == case_id), None)
            if case is None:
                fail(404, "중앙에 저장된 Case를 찾을 수 없습니다. 저장 후 다시 요청하세요.", "CASE_NOT_FOUND")
            tickets = [json.loads(r[0]) for r in db.execute("SELECT record_json FROM supplier_tickets ORDER BY ticket_id")]
            tickets = [t for t in tickets if _d(t.get("sqeReview")).get("bound8DCaseId") == case_id]
            revision = row["revision"]
        # Only clearly related closed Cases are offered as references.
        similar = [item for item in self.similar_cases(identity, case_id, 5) if item.get("score", 0) >= 0.5][:3]
        draft = build_stage_draft(case, stage, tickets, similar)
        with self._lock, self._connect() as db:
            self._audit(db, identity.user["id"], identity.user["username"], "STAGE_DRAFT_GENERATED", "case_stage", f"{case_id}:{stage}",
                        details={"engine": ENGINE, "caseRevision": revision, "externalAI": False})
        return {"caseId": case_id, "stage": stage, "engine": ENGINE, "generatedAt": now(), "caseRevision": revision,
                "guardrails": {"autoApprove": False, "inventMeasurements": False, "externalAI": False}, "payload": draft}
