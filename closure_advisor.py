"""D8 closure support.

Closing a Case means the facilitator drafts and the leader and champion approve the 8D report (D8 stage
sign-off). Customer dispatch is not a closure condition (user decision 2026-10-03).

- Readiness checks and stage lead times: rules and arithmetic over the saved Case.
- Consistency review: an external AI reads the whole Case and points at gaps or contradictions between stages.
- Closure drafts: remaining risk, a customer summary (Korean, optionally English) and team recognition, written
  only from the record for a person to edit.
- Post-closure monitoring: follow-up checks 30/60/90 days after closure by default; the mail scheduler reminds.
"""
import json
import re
from datetime import datetime, timedelta, timezone
from typing import Any

from internal_quality import fail, now
from tool_advisor import _dict, _rows, _text

REVIEW_ENGINE = "external-ai-closure-review-v1"
DRAFT_ENGINE = "external-ai-closure-draft-v1"
KST = timezone(timedelta(hours=9))
STAGES = ("D1", "D2", "D3", "D4", "D5", "D6", "D7", "D8")
CAUSES = {"Occurrence": "발생원인", "Escape": "유출원인", "System": "시스템원인"}
MILESTONES = (("D3", "3D 봉쇄", timedelta(hours=24)), ("D5", "5D 원인·대책", timedelta(days=14)), ("D8", "8D 종결", timedelta(days=30)))
SEVERITY = {"high": "중요", "medium": "보통", "low": "참고"}
DEFAULT_MONITOR_DAYS = (30, 60, 90)

RULES = """반드시 지킬 것:
1. 입력에 있는 기록만 근거로 씁니다. 기록에 없는 수량·날짜·효과·고객 반응을 만들어 내지 않습니다.
2. 모든 설명은 한국어로 씁니다(영문 요약을 요청받은 경우 그 항목만 영어). 시스템 코드값은 쓰지 않고 SMT·BGA·PFMEA 같은 업계 약어는 그대로 씁니다.
3. JSON 객체 하나만 출력합니다. 설명 문장이나 코드 블록 표시를 붙이지 않습니다."""
REVIEW_PROMPT = "당신은 8D 보고서를 종결 전에 검토하는 품질 심사자입니다.\n역할은 단계 사이에 빠진 연결이나 서로 맞지 않는 기록을 찾아 알려 주는 것입니다. 승인 여부를 판정하지 않습니다.\n\n" + RULES
DRAFT_PROMPT = "당신은 8D 종결 문서를 정리하는 품질 담당자입니다.\n역할은 기록된 내용만으로 잔여 위험, 고객 종결 요약, 팀 인정 문구 초안을 쓰는 것입니다.\n\n" + RULES


def _json_reply(text: str) -> dict:
    cleaned = re.sub(r"^```[a-zA-Z]*|```$", "", text.strip(), flags=re.MULTILINE).strip()
    start, end = cleaned.find("{"), cleaned.rfind("}")
    if start < 0 or end <= start:
        raise ValueError("AI 응답에서 JSON을 찾을 수 없습니다.")
    data = json.loads(cleaned[start:end + 1])
    if not isinstance(data, dict):
        raise ValueError("AI 응답 형식이 올바르지 않습니다.")
    return data


def parse_time(value: Any) -> datetime | None:
    try:
        parsed = datetime.fromisoformat(str(value).strip().replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None
    return parsed.replace(tzinfo=KST) if parsed.tzinfo is None else parsed.astimezone(KST)


def _approved(case: dict, stage: str) -> bool:
    return _dict(_dict(case.get("signOffHistory")).get(stage)).get("status") == "Approved"


def _approved_at(case: dict, stage: str) -> datetime | None:
    return parse_time(_dict(_dict(_dict(case.get("signOffHistory")).get(stage)).get("champion")).get("signedAt"))


def _span(delta: timedelta) -> str:
    minutes = int(abs(delta).total_seconds() // 60)
    hours = minutes // 60
    return f"{hours // 24}일 {hours % 24}시간" if hours >= 24 else (f"{hours}시간" if hours else f"{minutes}분")


def lead_times(case: dict) -> list[dict]:
    """Time from receipt to the champion's approval of D3, D5 and D8, against the single SLA rule."""
    received = parse_time(case.get("receiptDate"))
    rows = []
    for stage, label, allowed in MILESTONES:
        done = _approved_at(case, stage)
        due = received + allowed if received else None
        if not received:
            status, text = "unknown", "접수 시각 기록 없음"
        elif not done:
            status, text = ("overdue", f"미완료 · 기한 {_span(datetime.now(KST) - due)} 초과") if datetime.now(KST) > due else ("open", "미완료")
        else:
            status = "on_time" if done <= due else "late"
            text = f"{_span(done - received)} 소요" + ("" if status == "on_time" else f" · 기한 {_span(done - due)} 초과")
        rows.append({"stage": stage, "label": label, "dueAt": due.strftime("%Y-%m-%d %H:%M") if due else "",
                     "doneAt": done.strftime("%Y-%m-%d %H:%M") if done else "", "status": status, "text": text})
    return rows


def readiness(case: dict) -> dict:
    """What the 8D report approval rests on. 'block' items mean the closure is not supported by the record."""
    items: list[dict] = []
    add = lambda level, area, text: items.append({"level": level, "area": area, "text": text})
    missing = [s for s in STAGES[:7] if not _approved(case, s)]
    add("block" if missing else "ok", "D1~D7 결재", f"최종 결재가 없는 단계: {', '.join(missing)}" if missing else "D1~D7 모두 최종 결재 완료")
    d6, d7 = _dict(case.get("d6")), _dict(case.get("d7"))
    tests = _rows(d6.get("validationTests"))
    failing = [t for t in tests if t.get("result") != "PASS"]
    add("block" if not tests or failing else "ok", "D6 검증", "검증 시험이 없습니다." if not tests else
        (f"PASS가 아닌 시험 {len(failing)}건" if failing else f"검증 시험 {len(tests)}건 모두 PASS"))
    decision = _dict(d6.get("containmentRelease")).get("decision")
    add("ok" if decision in {"Released", "Retained"} else "block", "봉쇄 결정",
        {"Released": "봉쇄 해제 결정 기록됨", "Retained": "봉쇄 유지 결정 기록됨"}.get(decision, "봉쇄 해제·유지 결정이 없습니다."))
    stats = _dict(_dict(d6.get("beforeAfter")).get("statistics"))
    if stats:
        add("ok" if stats.get("verdict") == "improved" else "warn", "개선 전·후", f"전·후 비교: {_text(stats.get('verdictLabel'))}")
    else:
        add("warn", "개선 전·후", "전·후 비교 계산 기록이 없습니다.")
    open_updates = [r for r in _rows(d7.get("systemUpdates")) if r.get("status") != "Completed"]
    open_deploy = [r for r in _rows(d7.get("horizontalDeployment")) if r.get("status") not in {"Completed", "Not Applicable"}]
    add("block" if open_updates or open_deploy else "ok", "D7 재발방지",
        f"미완료 문서 개정 {len(open_updates)}건, 미완료 수평전개 {len(open_deploy)}건" if open_updates or open_deploy else "문서 개정·수평전개 모두 완료 또는 해당 없음")
    pcn = _dict(_dict(case.get("d5")).get("pcnEcn"))
    if pcn.get("pcnRequired") is True:
        status = _text(pcn.get("customerApprovalStatus"))
        approved = bool(re.search(r"승인|approved", status, re.I)) and not re.search(r"미승인|반려|대기|not", status, re.I)
        add("ok" if approved else "warn", "고객 PCN", f"고객 변경 승인 상태: {status or '기록 없음'}")
    add("ok" if _dict(d7.get("lessonsLearned")).get("lesson") else "warn", "교훈", "교훈 저장됨" if _dict(d7.get("lessonsLearned")).get("lesson") else "교훈이 저장되지 않았습니다.")
    gates = _dict(case.get("gates"))
    sent = [label for key, label in (("gate3D", "3D"), ("gate5D", "5D"), ("gate8D", "8D")) if _text(_dict(gates.get(key)).get("dispatchDate"))]
    add("info", "고객 보고", ("송부 기록: " + ", ".join(sent) if sent else "고객 보고서 송부 기록 없음") + " (종결 조건 아님)")
    return {"items": items, "leadTimes": lead_times(case), "ready": not any(i["level"] == "block" for i in items)}


def checklist_fill(case: dict) -> list[str]:
    """Evidence text for the five default closure checklist items, from the record. The person still ticks them."""
    d4, d6, d7 = _dict(case.get("d4")), _dict(case.get("d6")), _dict(case.get("d7"))
    causes = [CAUSES[k] for k, r in _dict(d4.get("rootCauses")).items() if k in CAUSES and _dict(r).get("status") == "Confirmed"]
    tests = _rows(d6.get("validationTests"))
    evidence = lambda stage: [_text(e.get("file") or e.get("title")) for e in _rows(case.get("evidenceList")) if stage in (e.get("linkedStages") or [])]
    gates = _dict(case.get("gates"))
    sent = [label for key, label in (("gate3D", "3D"), ("gate5D", "5D"), ("gate8D", "8D")) if _text(_dict(gates.get(key)).get("dispatchDate"))]
    return [
        f"D1~D4 결재 {'완료' if all(_approved(case, s) for s in STAGES[:4]) else '미완료'} · 확정 원인: {', '.join(causes) or '없음'} · D2 근거 파일: {', '.join(evidence('D2')[:3]) or '없음'}",
        f"D5·D6 결재 {'완료' if _approved(case, 'D5') and _approved(case, 'D6') else '미완료'} · 검증 시험 {sum(1 for t in tests if t.get('result') == 'PASS')}/{len(tests)}건 PASS · 봉쇄 결정: {_text(_dict(d6.get('containmentRelease')).get('decision')) or '없음'}",
        f"D7 결재 {'완료' if _approved(case, 'D7') else '미완료'} · 문서 개정 {len(_rows(d7.get('systemUpdates')))}건 · 수평전개 {len(_rows(d7.get('horizontalDeployment')))}건",
        "고객 보고 송부 기록: " + (", ".join(sent) if sent else "없음") + " (종결 조건 아님)",
        "잔여 위험은 종결 칸의 '잔여 위험 및 처리 근거'에 기록",
    ]


def case_record(case: dict) -> dict:
    d2, d3, d4, d5, d6, d7 = (_dict(case.get(k)) for k in ("d2", "d3", "d4", "d5", "d6", "d7"))
    return {
        "기본": {"고객사": _text(case.get("customer")), "제품": _text(case.get("product")), "품번": _text(case.get("partNumber")), "Lot": _text(case.get("lotNumber")),
               "불량 현상": _text(case.get("claimTitle"), 500), "불량/검사 수량": f"{_text(case.get('defectQty'))}/{_text(case.get('inspectQty'))}", "접수": _text(case.get("receiptDate"))},
        "D2": {"문제 정의": _text(d2.get("problemStatement"), 600), "IS/IS NOT": [{"구분": _text(r.get("factor")), "IS": _text(r.get("is")), "IS NOT": _text(r.get("isNot")),
                                                                         "차이": _text(r.get("difference")), "확인": r.get("verificationStatus") == "Verified"} for r in _rows(d2.get("isIsNot"))][:8]},
        "D3": {"영향 Lot": _text(_dict(d3.get("lotScope")).get("affectedLot")), "봉쇄조치": [_text(a.get("action"), 200) for a in _rows(d3.get("actions"))][:6]},
        "D4": {CAUSES[k]: {"원인": _text(_dict(r).get("statement"), 400), "상태": _text(_dict(r).get("status")), "검증": _text(_dict(r).get("validationMethod"), 200)}
               for k, r in _dict(d4.get("rootCauses")).items() if k in CAUSES},
        "D5": [{"대책": _text(r.get("title"), 300), "원인": CAUSES.get(r.get("causeType"), "미연결"), "선정": r.get("selected") is True} for r in _rows(d5.get("candidates"))][:10],
        "D6": {"시험": [{"시험": _text(t.get("testName")), "대책 연결": bool(_text(t.get("actionId"))), "시료": _text(t.get("sampleSize")), "불량": _text(t.get("failQty")),
                       "판정": _text(t.get("result")), "시험일": _text(t.get("completedAt"))} for t in _rows(d6.get("validationTests"))][:10],
               "적용 Lot": _text(_dict(d6.get("implementationDetails")).get("appliedLot")), "적용일": _text(_dict(d6.get("implementationDetails")).get("startDate")),
               "전후 비교": _text(_dict(_dict(d6.get("beforeAfter")).get("statistics")).get("verdictLabel")), "봉쇄 결정": _text(_dict(d6.get("containmentRelease")).get("decision"))},
        "D7": {"문서 개정": [f"{_text(r.get('docName'))}({_text(r.get('status'))})" for r in _rows(d7.get("systemUpdates"))][:10],
               "수평전개": [f"{_text(r.get('product'))}({_text(r.get('status'))})" for r in _rows(d7.get("horizontalDeployment"))][:10],
               "교훈": _text(_dict(d7.get("lessonsLearned")).get("lesson"), 400)},
        "팀": [f"{_text(m.get('role'))}: {_text(m.get('name'))}({_text(m.get('dept'))})" for m in _rows(case.get("team"))][:12],
    }


def build_review_prompt(case: dict) -> str:
    return f"""아래 8D Case 전체 기록을 읽고, 종결 전에 바로잡아야 할 빈 연결이나 서로 맞지 않는 기록을 찾으세요.

[Case 기록]
{json.dumps(case_record(case), ensure_ascii=False, indent=1)}

[볼 것]
- D4 확정 원인이 D2의 IS/IS NOT(왜 이 대상에서만 생겼는지)을 설명하는가
- 확정 원인마다 선정 대책이 있고, 그 대책이 D6에서 원래 불량 현상 기준으로 검증됐는가
- 단계마다 수량·Lot·날짜가 서로 다르게 적혀 있지 않은가
- D7 재발방지가 확정 원인(특히 시스템원인)을 다루는가

[정상인 것 — 지적하지 않습니다]
- D6 적용 Lot은 대책을 적용한 뒤 새로 생산한 Lot이므로 원래 불량 Lot과 다른 것이 정상입니다.
- 순서는 접수 → 봉쇄 → 대책 적용 → 검증 시험입니다. 적용일이 시험일보다 앞서고, 둘 다 접수 이후인 것이 정상입니다.
- 결재 시각이 짧은 간격으로 이어진 것은 문제가 아닙니다.

[출력 형식 — 이 JSON 객체 하나만]
{{"findings": [{{"stage": "D1~D8 중 관련 단계", "relatedStage": "함께 봐야 할 단계 또는 빈 문자열", "severity": "high, medium, low 중 하나", "issue": "무엇이 빠졌거나 맞지 않는지", "suggestion": "무엇을 확인하면 되는지"}}],
 "summary": "전체 흐름에 대한 한두 문장"}}

[규칙]
- 문제가 없으면 findings를 빈 배열로 둡니다. 억지로 찾지 않습니다.
- 승인해도 되는지 판정하지 않습니다."""


def parse_review(text: str) -> dict:
    data = _json_reply(text)
    findings = []
    for item in _rows(data.get("findings"))[:12]:
        stage = _text(item.get("stage")).upper()
        if stage not in STAGES or not _text(item.get("issue")):
            continue
        severity = item.get("severity") if item.get("severity") in SEVERITY else "medium"
        related = _text(item.get("relatedStage")).upper()
        findings.append({"stage": stage, "relatedStage": related if related in STAGES else "", "severity": severity, "severityLabel": SEVERITY[severity],
                         "issue": _text(item.get("issue"), 400), "suggestion": _text(item.get("suggestion"), 300)})
    summary = _text(data.get("summary"), 400)
    if not findings and not summary:
        raise ValueError("AI 응답에 검토 결과가 없습니다.")
    order = {"high": 0, "medium": 1, "low": 2}
    findings.sort(key=lambda f: (order[f["severity"]], f["stage"]))
    return {"findings": findings, "summary": summary}


def build_draft_prompt(case: dict, english: bool) -> str:
    return f"""아래 8D Case 기록만으로 종결 문서 초안을 쓰세요.

[Case 기록]
{json.dumps(case_record(case), ensure_ascii=False, indent=1)}

[종결 점검 결과]
{json.dumps([f"{i['area']}: {i['text']}" for i in readiness(case)["items"]], ensure_ascii=False)}

[출력 형식 — 이 JSON 객체 하나만]
{{"remainingRisk": "남은 위험과 그 관리 방법. 전·후 비교가 개선 확인이 아니거나 미완료·해당 없음 항목이 있으면 반드시 언급",
  "customerSummaryKo": "고객에게 보내는 정중한 종결 요약. 현상, 원인, 대책, 효과 확인, 재발방지 순서로 5~8문장",
  "customerSummaryEn": "{'위 요약의 영어 번역' if english else '빈 문자열'}",
  "teamAppreciation": "팀 기록에 있는 사람과 역할만 언급하는 팀 인정 문구 2~3문장"}}"""


def parse_draft(text: str, english: bool) -> dict:
    data = _json_reply(text)
    draft = {"remainingRisk": _text(data.get("remainingRisk"), 800), "customerSummaryKo": _text(data.get("customerSummaryKo"), 2500),
             "customerSummaryEn": _text(data.get("customerSummaryEn"), 3000) if english else "", "teamAppreciation": _text(data.get("teamAppreciation"), 600)}
    if not draft["remainingRisk"] or not draft["customerSummaryKo"]:
        raise ValueError("AI 응답에 종결 초안이 없습니다.")
    return draft


def monitoring_plan(case: dict, days: list[int]) -> dict:
    """Follow-up checks after closure, counted from the closure date (or today before closure)."""
    days = sorted({int(d) for d in days if isinstance(d, (int, float)) and not isinstance(d, bool) and 1 <= d <= 730})[:6]
    if not days:
        fail(400, "모니터링 일수를 1~730일 사이로 지정하세요.", "INVALID_MONITORING")
    base = parse_time(case.get("closedAt")) or datetime.now(KST)
    return {"baseDate": base.strftime("%Y-%m-%d"), "baseIsClosure": bool(parse_time(case.get("closedAt"))),
            "items": [{"id": f"M{d}", "days": d, "dueDate": (base + timedelta(days=d)).strftime("%Y-%m-%d"), "status": "Open", "result": "", "checkedBy": "", "checkedAt": ""}
                      for d in days]}


class ClosureAdvisorMixin:
    def _d8_case(self, identity, payload) -> tuple[dict, int]:
        self._internal_permission(identity)
        case_id = payload.get("caseId") if isinstance(payload, dict) else None
        if not isinstance(case_id, str) or not case_id:
            fail(400, "Case를 지정하세요.", "INVALID_D8_REQUEST")
        with self._connect() as db:
            row = db.execute("SELECT revision, state_json FROM state_store WHERE id=1").fetchone()
        case = next((c for c in (json.loads(row["state_json"]).get("cases", []) if row else []) if isinstance(c, dict) and c.get("id") == case_id), None)
        if case is None:
            fail(404, "중앙에 저장된 Case를 찾을 수 없습니다. 저장 후 다시 요청하세요.", "CASE_NOT_FOUND")
        return case, row["revision"]

    def d8_readiness(self, identity, payload) -> dict:
        case, revision = self._d8_case(identity, payload)
        return {"caseId": case["id"], "caseRevision": revision, "checkedAt": now(), "checklistFill": checklist_fill(case), **readiness(case)}

    def d8_monitoring_plan(self, identity, payload) -> dict:
        case, _ = self._d8_case(identity, payload)
        days = payload.get("days") if isinstance(payload.get("days"), list) else list(DEFAULT_MONITOR_DAYS)
        return monitoring_plan(case, days)

    def record_d8_ai(self, identity, action: str, case_id: str, revision: int, provider: dict, details: dict) -> None:
        with self._lock, self._connect() as db:
            self._audit(db, identity.user["id"], identity.user["username"], action, "case_stage", f"{case_id}:D8",
                        details={"provider": provider.get("engine"), "model": provider.get("model"), "caseRevision": revision, "externalAI": True, **details})
