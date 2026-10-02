"""D5 corrective-action advice: an external AI reads the root causes a person confirmed in D4 and proposes
permanent corrective actions for each of them.

The advice is a proposal. It never selects an action, names an owner or a date, or claims an action works.
The completeness checks (a confirmed cause with no action, a cause with only weak actions) are computed here
from the validated reply, not taken from the model.
"""
import json
import re
from typing import Any

from internal_quality import fail, now
from tool_advisor import _dict, _rows, _text

ENGINE = "external-ai-action-advisor-v1"
CAUSES = {"Occurrence": "발생원인", "Escape": "유출원인", "System": "시스템원인"}
# How strongly an action stops the cause from coming back, strongest first.
STRENGTH = {"eliminate": "원인 제거", "prevent": "실수 방지", "detect": "검출 강화", "administrative": "교육·표준"}
WEAK = {"administrative"}
SITES = {"TechL": "TechL(SMT 모듈 조립)", "WinPAC": "WinPAC(OSAT 패키지)", "CTST": "CTST(테스트 하우스)", "RAMOS": "라모스 사내", "NONE": "변경 없음", "UNKNOWN": "미확정"}
FOUR_M = ["Man", "Machine", "Material", "Method", "Measurement", "Environment", "Design"]
PCN = {"yes": "필요 가능성 높음", "no": "필요 가능성 낮음", "unknown": "판단 불가"}
MAX_PER_CAUSE = 3

SYSTEM_PROMPT = """당신은 반도체 메모리(eMMC·DRAM) 제조사의 품질 엔지니어를 돕는 8D D5(영구 시정조치) 대책 조언자입니다.
역할은 사람이 D4에서 확정한 원인마다 영구 대책 후보를 제안하는 것뿐입니다.

반드시 지킬 것:
1. 입력의 '확정 원인'에 대해서만 대책을 제안합니다. 새 원인을 만들거나 원인을 바꾸지 않습니다.
2. 대책이 효과가 있다고 단정하지 않습니다. 효과는 사람이 D6에서 시험으로 확인합니다.
3. 담당자, 날짜, 비용 금액, 시료 수, 측정값을 만들어 내지 않습니다.
4. 대책마다 강도를 정직하게 분류합니다. 작업자 교육·주의 문구·표준서 개정만으로 된 대책은 administrative입니다.
5. 모든 설명은 한국어로, 항목당 한두 문장으로 짧게 씁니다. 설명 문장 안에 시스템 코드값(id나 선택지 영문 값)을 쓰지 않고 한글 이름을 씁니다. SMT·BGA·PFMEA 같은 업계 약어는 그대로 씁니다.
6. JSON 객체 하나만 출력합니다. 설명 문장이나 코드 블록 표시를 붙이지 않습니다.

회사 기본 사실(시스템에 등록된 내용):
- 라모스는 자체 제조라인이 없습니다. 조립·테스트는 외주사가 합니다: TechL(SMT 모듈 조립), WinPAC(OSAT 패키지), CTST(테스트 하우스).
- 따라서 공정·자재·테스트 조건을 바꾸는 대책은 대부분 외주사의 변경이며, 외주사 변경 통보와 고객 PCN(변경 승인) 검토가 따라옵니다."""


def _readable(value: Any, limit: int) -> str:
    text = _text(value, limit)
    for code, label in {**CAUSES, **STRENGTH}.items():
        text = re.sub(rf"(?<![A-Za-z]){code}(?![A-Za-z])", label, text)
    return text


def confirmed_causes(case: dict) -> dict[str, dict]:
    roots = _dict(_dict(case.get("d4")).get("rootCauses"))
    return {kind: _dict(roots.get(kind)) for kind in CAUSES
            if _dict(roots.get(kind)).get("status") == "Confirmed" and _text(_dict(roots.get(kind)).get("statement"))}


def case_brief(case: dict, similar: list[dict]) -> dict:
    """Recorded facts the adviser may read: the problem, the confirmed causes and their evidence."""
    d2, d4, d5 = _dict(case.get("d2")), _dict(case.get("d4")), _dict(case.get("d5"))
    brief = {
        "고객사": _text(case.get("customer")), "제품": _text(case.get("product")), "품번": _text(case.get("partNumber")), "Lot": _text(case.get("lotNumber")),
        "불량 현상": _text(case.get("claimTitle"), 600), "D2 문제 정의문": _text(d2.get("problemStatement"), 800),
        "확정 원인": [{"구분": CAUSES[kind], "원인 문장": _text(root.get("statement"), 600), "입증 Evidence": _text(root.get("evidence"), 400),
                    "검증 방법": _text(root.get("validationMethod"), 400)} for kind, root in confirmed_causes(case).items()],
        # Analysis results a person marked as checked.
        "D4 분석 결과": [{"도구": _text(t.get("id")), "결과": _text(t.get("finding"), 400)} for t in _rows(d4.get("selectedTools")) if t.get("verified") is True and _text(t.get("finding"))][:10],
        "이미 등록된 D5 대책": [_text(r.get("title")) for r in _rows(d5.get("candidates")) if _text(r.get("title"))][:20],
        "유사 종결 Case의 선정 대책": [{"Case": _text(item.get("caseId")), "현상": _text(item.get("claimTitle")),
                                  "대책": [_text(r.get("title")) for r in _rows(item.get("countermeasures")) if r.get("selected") is True][:3],
                                  "교훈": _text(_dict(item.get("lessonsLearned")).get("lesson"), 300)}
                                 for item in similar][:3],
    }
    return {key: value for key, value in brief.items() if value not in ("", [], {}, None)}


def build_prompt(case: dict, similar: list[dict]) -> str:
    kinds = ", ".join(f"{kind}({label})" for kind, label in CAUSES.items() if kind in confirmed_causes(case))
    strength = ", ".join(f"{code}({label})" for code, label in STRENGTH.items())
    sites = ", ".join(SITES)
    return f"""아래는 중앙에 저장된 8D Case의 기록입니다. '확정 원인'마다 영구 시정조치 후보를 제안하세요.

[Case 기록]
{json.dumps(case_brief(case, similar), ensure_ascii=False, indent=1)}

[출력 형식 — 이 JSON 객체 하나만]
{{
 "actions": [
  {{"causeType": "{kinds} 중 하나", "title": "대책 내용", "mechanism": "이 대책이 확정 원인을 어떻게 없애거나 막는지",
    "strength": "{strength} 중 하나", "strengthReason": "그 강도로 분류한 이유",
    "changeSite": "{sites} 중 하나 (대책을 실제로 적용하는 곳)", "fourM": ["바뀌는 4M 항목: {", ".join(FOUR_M)}"],
    "pcnLikely": "yes, no, unknown 중 하나", "pcnReason": "고객 변경 승인이 필요할지 판단한 이유",
    "risks": "부작용이나 다른 특성에 줄 영향", "verificationPlan": "효과를 확인할 시험 방법 (시료 수와 판정 기준은 쓰지 않음)",
    "feasibility": "적용할 때 확인해야 할 제약"}}
 ],
 "notes": ["대책 선정 전에 사람이 확인해야 할 사항"]
}}

[규칙]
- 확정 원인 하나마다 대책 후보를 2개 이상, 최대 {MAX_PER_CAUSE}개 제안합니다. 가능하면 강도가 다른 후보를 섞습니다.
- 발생원인 대책은 불량이 만들어지는 조건을 없애는 쪽, 유출원인 대책은 검사에서 걸러지게 하는 쪽, 시스템원인 대책은 PFMEA·Control Plan·변경관리 같은 관리 체계를 고치는 쪽입니다.
- '이미 등록된 D5 대책'과 같은 내용은 다시 제안하지 않습니다.
- 유사 종결 Case의 대책을 참고했다면 mechanism에 그 Case 번호를 적습니다."""


def parse_advice(text: str, case: dict) -> dict:
    """Validate the model's reply. Raises ValueError when it cannot be used."""
    cleaned = re.sub(r"^```[a-zA-Z]*|```$", "", text.strip(), flags=re.MULTILINE).strip()
    start, end = cleaned.find("{"), cleaned.rfind("}")
    if start < 0 or end <= start:
        raise ValueError("AI 응답에서 JSON을 찾을 수 없습니다.")
    data = json.loads(cleaned[start:end + 1])
    if not isinstance(data, dict):
        raise ValueError("AI 응답 형식이 올바르지 않습니다.")
    confirmed = confirmed_causes(case)
    actions, per_cause = [], {kind: 0 for kind in confirmed}
    for item in _rows(data.get("actions")):
        kind, title = item.get("causeType"), _readable(item.get("title"), 300)
        # Only actions for a cause a person confirmed are kept.
        if kind not in confirmed or not title or per_cause[kind] >= MAX_PER_CAUSE:
            continue
        per_cause[kind] += 1
        strength = item.get("strength") if item.get("strength") in STRENGTH else "administrative"
        site = item.get("changeSite") if item.get("changeSite") in SITES else "UNKNOWN"
        four_m = [m for m in FOUR_M if m in (item.get("fourM") if isinstance(item.get("fourM"), list) else [])]
        pcn = item.get("pcnLikely") if item.get("pcnLikely") in PCN else "unknown"
        actions.append({"key": f"A{len(actions) + 1}", "causeType": kind, "causeLabel": CAUSES[kind], "causeStatement": _text(confirmed[kind].get("statement"), 300),
                        "title": title, "mechanism": _readable(item.get("mechanism"), 400), "strength": strength, "strengthLabel": STRENGTH[strength],
                        "strengthReason": _readable(item.get("strengthReason"), 300), "changeSite": site, "changeSiteLabel": SITES[site], "fourM": four_m,
                        "pcnLikely": pcn, "pcnLabel": PCN[pcn], "pcnReason": _readable(item.get("pcnReason"), 300), "risks": _readable(item.get("risks"), 400),
                        "verificationPlan": _readable(item.get("verificationPlan"), 400), "feasibility": _readable(item.get("feasibility"), 300)})
    if not actions:
        raise ValueError("AI 응답에 확정 원인과 연결된 대책이 없습니다.")
    # Checks computed from the validated actions, so they do not depend on what the model says about itself.
    gaps = [f"{CAUSES[kind]}에 대한 대책 후보가 없습니다." for kind, count in per_cause.items() if count == 0]
    weak = [f"{CAUSES[kind]} 대책 후보가 모두 교육·표준 수준입니다. 이것만으로는 재발할 수 있습니다."
            for kind, count in per_cause.items() if count and all(a["strength"] in WEAK for a in actions if a["causeType"] == kind)]
    pcn_actions = [a["key"] for a in actions if a["pcnLikely"] == "yes"]
    notes = [_readable(item, 300) for item in (data.get("notes") if isinstance(data.get("notes"), list) else [])]
    return {"actions": actions, "gaps": gaps, "weakWarnings": weak, "pcnActions": pcn_actions,
            "notes": [item for item in notes if item][:6], "causes": {kind: CAUSES[kind] for kind in confirmed}}


class ActionAdvisorMixin:
    def d5_action_advice_context(self, identity, payload) -> tuple[dict, int, list[dict]]:
        self._internal_permission(identity)
        case_id = payload.get("caseId") if isinstance(payload, dict) else None
        if not isinstance(case_id, str) or not case_id:
            fail(400, "Case를 지정하세요.", "INVALID_ACTION_ADVICE")
        with self._connect() as db:
            row = db.execute("SELECT revision, state_json FROM state_store WHERE id=1").fetchone()
        case = next((c for c in (json.loads(row["state_json"]).get("cases", []) if row else []) if isinstance(c, dict) and c.get("id") == case_id), None)
        if case is None:
            fail(404, "중앙에 저장된 Case를 찾을 수 없습니다. 저장 후 다시 요청하세요.", "CASE_NOT_FOUND")
        if not confirmed_causes(case):
            fail(409, "D4에서 확정된 원인이 없습니다. 원인을 확정한 뒤 대책을 추천받으세요.", "ACTION_ADVICE_NO_ROOT_CAUSE")
        similar = [item for item in self.similar_cases(identity, case_id, 5) if item.get("score", 0) >= 0.5][:3]
        return case, row["revision"], similar

    def record_d5_action_advice(self, identity, case_id: str, revision: int, provider: dict, advice: dict) -> dict:
        with self._lock, self._connect() as db:
            self._audit(db, identity.user["id"], identity.user["username"], "D5_ACTION_ADVICE_GENERATED", "case_stage", f"{case_id}:D5",
                        details={"engine": ENGINE, "provider": provider.get("engine"), "model": provider.get("model"), "caseRevision": revision,
                                 "externalAI": True, "actions": len(advice["actions"])})
        return {"caseId": case_id, "engine": ENGINE, "provider": provider.get("engine"), "model": provider.get("model"), "generatedAt": now(), "caseRevision": revision,
                "guardrails": {"autoSelect": False, "inventsOwnerOrDate": False, "externalAI": True}, **advice}
