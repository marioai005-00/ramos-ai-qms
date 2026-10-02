"""D7 recurrence prevention support.

- System advice: an external AI proposes which documents to revise for the actions selected in D5, a PFMEA row
  draft per confirmed cause, and who to inform. Document numbers, revisions and PFMEA ratings stay empty.
- Horizontal deployment: the candidates come only from recorded data (the product list people register, other
  Cases, outsourced-assembly defect records and the three suppliers). The AI judges each candidate's risk; it
  cannot add products.
- Lessons learned: a short summary written only from what the Case records.
- Checks: rules over the saved Case.
"""
import json
import re
from typing import Any

from internal_quality import fail, now
from supplier_notices import SUPPLIERS
from tool_advisor import _dict, _rows, _text

SYSTEM_ENGINE = "external-ai-prevention-system-v1"
DEPLOY_ENGINE = "external-ai-horizontal-deployment-v1"
LESSONS_ENGINE = "external-ai-lessons-learned-v1"
CAUSES = {"Occurrence": "발생원인", "Escape": "유출원인", "System": "시스템원인"}
DOC_TYPES = {"pfmea": "PFMEA", "control-plan": "Control Plan(관리계획서)", "work-standard": "작업표준서", "inspection-standard": "검사기준서",
             "change-control": "변경관리 절차", "supplier-standard": "외주사 관리 기준", "design-guide": "설계 가이드", "training": "교육 자료", "other": "기타 문서"}
RISK = {"high": "동일 위험 있음", "low": "동일 위험 낮음", "unknown": "판단 불가"}
MAX_CANDIDATES = 40

RULES = """반드시 지킬 것:
1. 입력에 있는 기록만 근거로 씁니다. 문서번호, Revision, 날짜, 담당자 이름, 점수, 수량을 만들어 내지 않습니다.
2. 모든 설명은 한국어로, 항목당 한두 문장으로 짧게 씁니다. 설명 문장 안에 시스템 코드값(id나 선택지 영문 값)을 쓰지 않고 한글 이름을 씁니다. SMT·BGA·PFMEA 같은 업계 약어는 그대로 씁니다.
3. JSON 객체 하나만 출력합니다. 설명 문장이나 코드 블록 표시를 붙이지 않습니다.

회사 기본 사실: 라모스는 자체 제조라인이 없고 조립·테스트를 외주사가 합니다(TechL SMT 모듈 조립, WinPAC OSAT 패키지, CTST 테스트 하우스)."""
SYSTEM_PROMPT = "당신은 반도체 메모리 제조사의 품질 엔지니어를 돕는 8D D7(재발방지) 조언자입니다.\n역할은 선정 대책을 표준과 관리 체계에 반영하도록 개정할 문서, PFMEA 행 초안, 전파 대상을 제안하는 것입니다.\n\n" + RULES
DEPLOY_PROMPT = "당신은 반도체 메모리 제조사의 품질 엔지니어를 돕는 8D D7 수평전개 조언자입니다.\n역할은 주어진 후보 목록 각각에 이번 Case와 같은 위험이 있는지 판단하는 것입니다. 목록에 없는 제품이나 공정을 추가하지 않습니다.\n\n" + RULES
LESSONS_PROMPT = "당신은 품질 문제 해결 사례를 짧게 정리하는 기록 담당자입니다.\n역할은 Case에 기록된 내용만으로 다음 사람이 참고할 교훈을 요약하는 것입니다. 기록에 없는 효과나 수치를 쓰지 않습니다.\n\n" + RULES


def _json_reply(text: str) -> dict:
    cleaned = re.sub(r"^```[a-zA-Z]*|```$", "", text.strip(), flags=re.MULTILINE).strip()
    start, end = cleaned.find("{"), cleaned.rfind("}")
    if start < 0 or end <= start:
        raise ValueError("AI 응답에서 JSON을 찾을 수 없습니다.")
    data = json.loads(cleaned[start:end + 1])
    if not isinstance(data, dict):
        raise ValueError("AI 응답 형식이 올바르지 않습니다.")
    return data


def selected_actions(case: dict) -> list[dict]:
    return [r for r in _rows(_dict(case.get("d5")).get("candidates")) if r.get("selected") is True and _text(r.get("id")) and _text(r.get("title"))]


def confirmed_causes(case: dict) -> dict[str, dict]:
    roots = _dict(_dict(case.get("d4")).get("rootCauses"))
    return {k: _dict(roots.get(k)) for k in CAUSES if _dict(roots.get(k)).get("status") == "Confirmed" and _text(_dict(roots.get(k)).get("statement"))}


def notify_targets(case: dict) -> list[str]:
    """Who the advice may name: departments on the Case team and the official suppliers."""
    depts = sorted({_text(m.get("dept")) for m in _rows(case.get("team")) if _text(m.get("dept"))})
    return depts + [s["name"] for s in SUPPLIERS.values()]


def case_brief(case: dict) -> dict:
    d6 = _dict(case.get("d6"))
    return {
        "제품": _text(case.get("product")), "품번": _text(case.get("partNumber")), "고객사": _text(case.get("customer")),
        "불량 현상": _text(case.get("claimTitle"), 600), "D2 문제 정의문": _text(_dict(case.get("d2")).get("problemStatement"), 800),
        "확정 원인": [{"구분": CAUSES[k], "원인": _text(r.get("statement"), 500)} for k, r in confirmed_causes(case).items()],
        "선정 대책": [{"대책 ID": _text(a.get("id")), "구분": CAUSES.get(a.get("causeType"), "미확정"), "대책": _text(a.get("title"), 400), "원인 제거 근거": _text(a.get("rationale"), 300)}
                   for a in selected_actions(case)],
        "D6 검증 시험": [{"대책 ID": _text(t.get("actionId")), "시험": _text(t.get("testName")), "판정": _text(t.get("result")), "시험 조건": _text(t.get("condition"), 300)}
                     for t in _rows(d6.get("validationTests"))][:12],
        "적용 장소": _text(_dict(d6.get("implementationDetails")).get("productionSite")),
    }


# ---------------------------------------------------------------- system documents, PFMEA, notification
def build_system_prompt(case: dict) -> str:
    docs = ", ".join(f"{code}({label})" for code, label in DOC_TYPES.items())
    return f"""아래는 중앙에 저장된 8D Case의 기록입니다. 선정 대책이 다시 무너지지 않도록 개정할 문서, PFMEA 행 초안, 전파 대상을 제안하세요.

[Case 기록]
{json.dumps({k: v for k, v in case_brief(case).items() if v not in ("", [], None)}, ensure_ascii=False, indent=1)}

[전파 대상으로 고를 수 있는 이름]
{", ".join(notify_targets(case))}

[출력 형식 — 이 JSON 객체 하나만]
{{
 "documents": [{{"actionId": "선정 대책 ID", "docType": "{docs} 중 하나", "docName": "문서 이름", "changeContent": "무엇을 어떻게 바꾸는지", "reason": "왜 이 문서를 바꿔야 하는지"}}],
 "pfmea": [{{"causeType": "Occurrence, Escape, System 중 하나", "process": "공정", "failureMode": "고장모드", "effect": "고객에게 미치는 영향", "cause": "원인",
            "prevention": "예방 관리", "detection": "검출 관리"}}],
 "notify": [{{"target": "위 이름 중 하나", "reason": "무엇을 알려야 하는지"}}],
 "notes": ["개정 전에 사람이 확인할 사항"]
}}

[규칙]
- 선정 대책마다 개정할 문서를 하나 이상 제안합니다. 시스템원인 대책에는 PFMEA 또는 Control Plan 개정을 포함합니다.
- PFMEA는 확정 원인마다 한 행씩 씁니다. 심각도·발생도·검출도 점수는 쓰지 않습니다.
- 전파 대상은 위 목록의 이름만 씁니다."""


def parse_system(text: str, case: dict) -> dict:
    data = _json_reply(text)
    actions = {_text(a.get("id")): a for a in selected_actions(case)}
    allowed_targets = set(notify_targets(case))
    documents = []
    for item in _rows(data.get("documents"))[:20]:
        action_id = _text(item.get("actionId"))
        if action_id not in actions or not _text(item.get("changeContent")):
            continue
        doc_type = item.get("docType") if item.get("docType") in DOC_TYPES else "other"
        documents.append({"key": f"DOC{len(documents) + 1}", "actionId": action_id, "actionTitle": _text(actions[action_id].get("title"), 200),
                          "docType": doc_type, "docTypeLabel": DOC_TYPES[doc_type], "docName": _text(item.get("docName"), 120) or DOC_TYPES[doc_type],
                          "changeContent": _text(item.get("changeContent"), 600), "reason": _text(item.get("reason"), 300)})
    confirmed = confirmed_causes(case)
    pfmea = [{"key": f"FM{i + 1}", "causeType": item.get("causeType"), "causeLabel": CAUSES[item.get("causeType")],
              **{k: _text(item.get(k), 300) for k in ("process", "failureMode", "effect", "cause", "prevention", "detection")}}
             for i, item in enumerate(r for r in _rows(data.get("pfmea")) if r.get("causeType") in confirmed and _text(r.get("failureMode")))][:6]
    notify = [{"target": _text(item.get("target"), 80), "reason": _text(item.get("reason"), 300)}
              for item in _rows(data.get("notify")) if _text(item.get("target"), 80) in allowed_targets][:12]
    if not documents and not pfmea:
        raise ValueError("AI 응답에 선정 대책과 연결된 개정 제안이 없습니다.")
    notes = [_text(n, 300) for n in (data.get("notes") if isinstance(data.get("notes"), list) else [])]
    covered = {d["actionId"] for d in documents}
    return {"documents": documents, "pfmea": pfmea, "notify": notify, "notes": [n for n in notes if n][:6],
            "actionsWithoutDocument": [_text(a.get("title"), 80) for k, a in actions.items() if k not in covered]}


# ---------------------------------------------------------------- horizontal deployment
def deployment_candidates(state: dict, case: dict, assembly_records: list[dict]) -> list[dict]:
    """Candidates built only from recorded data."""
    candidates, seen = [], set()

    def add(key, kind, name, facts):
        if key not in seen and name and len(candidates) < MAX_CANDIDATES:
            seen.add(key)
            candidates.append({"key": key, "kind": kind, "name": name, "facts": {k: v for k, v in facts.items() if v}})

    for item in _rows(state.get("productCatalog")):
        add(f"P:{_text(item.get('id'))}", "등록 제품", _text(item.get("name"), 120),
            {"제품군": _text(item.get("family")), "패키지": _text(item.get("package")), "외주사": _text(item.get("supplier")), "생산 Site": _text(item.get("site")),
             "공정": _text(item.get("processes"), 300), "고객사": _text(item.get("customers"), 200)})
    for other in _rows(state.get("cases")):
        if other.get("id") == case.get("id") or not _text(other.get("product")):
            continue
        add(f"C:{_text(other.get('id'))}", "다른 Case 제품", f"{_text(other.get('product'))} {_text(other.get('partNumber'))}".strip(),
            {"고객사": _text(other.get("customer")), "생산 Site": _text(other.get("mfgSite")), "불량 현상": _text(other.get("claimTitle"), 120)})
    for record in assembly_records:
        add(f"A:{_text(record.get('partNumber'))}:{_text(_dict(record.get('supplier')).get('name'))}", "외주 조립 불량 기록 제품",
            f"{_text(record.get('productName'))} {_text(record.get('partNumber'))}".strip(), {"외주사": _text(_dict(record.get("supplier")).get("name"))})
    for supplier in SUPPLIERS.values():
        add(f"S:{supplier['id']}", "외주사 공정", f"{supplier['name']}의 다른 제품·라인", {"구분": supplier["category"]})
    return candidates


def build_deploy_prompt(case: dict, candidates: list[dict]) -> str:
    listed = "\n".join(f"- {c['key']}: [{c['kind']}] {c['name']} {json.dumps(c['facts'], ensure_ascii=False)}" for c in candidates)
    brief = {k: v for k, v in case_brief(case).items() if k in ("제품", "품번", "불량 현상", "확정 원인", "선정 대책", "적용 장소") and v not in ("", [], None)}
    return f"""이번 Case와 같은 위험이 다른 곳에도 있는지 아래 후보마다 판단하세요.

[이번 Case]
{json.dumps(brief, ensure_ascii=False, indent=1)}

[후보 — 이 목록에서만 판단]
{listed}

[출력 형식 — 이 JSON 객체 하나만]
{{
 "assessments": [{{"key": "후보 key", "actionId": "관련 선정 대책 ID", "risk": "high, low, unknown 중 하나", "reason": "같은 공정·외주사·패키지·원인 조건을 공유하는지",
                  "action": "동일 위험이 있으면 전개할 조치, 낮으면 빈 문자열", "needToCheck": "판단에 더 필요한 사실"}}]
}}

[규칙]
- 후보의 기록에 판단할 사실이 없으면 risk를 unknown으로 두고 needToCheck에 무엇을 확인해야 하는지 씁니다.
- 원인이 생긴 공정이나 조건을 공유하면 high입니다."""


def parse_deploy(text: str, case: dict, candidates: list[dict]) -> dict:
    data = _json_reply(text)
    by_key = {c["key"]: c for c in candidates}
    actions = {_text(a.get("id")): a for a in selected_actions(case)}
    assessments, seen = [], set()
    for item in _rows(data.get("assessments")):
        key = _text(item.get("key"), 200)
        if key not in by_key or key in seen:
            continue
        seen.add(key)
        risk = item.get("risk") if item.get("risk") in RISK else "unknown"
        action_id = _text(item.get("actionId"))
        assessments.append({"key": key, "kind": by_key[key]["kind"], "name": by_key[key]["name"], "risk": risk, "riskLabel": RISK[risk],
                            "actionId": action_id if action_id in actions else "", "actionTitle": _text(actions.get(action_id, {}).get("title"), 120),
                            "reason": _text(item.get("reason"), 400), "action": _text(item.get("action"), 400), "needToCheck": _text(item.get("needToCheck"), 300)})
    if not assessments:
        raise ValueError("AI 응답에 후보 목록과 연결된 판단이 없습니다.")
    order = {"high": 0, "unknown": 1, "low": 2}
    assessments.sort(key=lambda a: order[a["risk"]])
    return {"assessments": assessments, "unassessed": [c["name"] for c in candidates if c["key"] not in seen]}


# ---------------------------------------------------------------- lessons learned
def build_lessons_prompt(case: dict) -> str:
    return f"""아래 Case 기록만으로 다음 사람이 참고할 교훈을 정리하세요.

[Case 기록]
{json.dumps({k: v for k, v in case_brief(case).items() if v not in ("", [], None)}, ensure_ascii=False, indent=1)}

[출력 형식 — 이 JSON 객체 하나만]
{{"phenomenon": "현상 한 문장", "cause": "확정 원인 요약", "action": "선정 대책 요약", "effect": "D6 검증 결과로 확인된 것만, 없으면 '검증 기록 없음'",
  "lesson": "다음에 같은 일을 막으려면 무엇을 봐야 하는지", "keywords": ["검색용 핵심어 3~8개"]}}"""


def parse_lessons(text: str) -> dict:
    data = _json_reply(text)
    lessons = {k: _text(data.get(k), 500) for k in ("phenomenon", "cause", "action", "effect", "lesson")}
    if not lessons["phenomenon"] or not lessons["lesson"]:
        raise ValueError("AI 응답에 교훈 요약이 없습니다.")
    keywords = [_text(k, 30) for k in (data.get("keywords") if isinstance(data.get("keywords"), list) else [])]
    return {**lessons, "keywords": [k for k in keywords if k][:8]}


# ---------------------------------------------------------------- checks
def d7_checks(case: dict) -> list[dict]:
    d7 = _dict(case.get("d7"))
    updates, deployments = _rows(d7.get("systemUpdates")), _rows(d7.get("horizontalDeployment"))
    items: list[dict] = []
    add = lambda level, text: items.append({"level": level, "text": text})
    actions = selected_actions(case)
    if not actions:
        add("block", "D5에서 선정된 대책이 없습니다.")
    for action in actions:
        title = _text(action.get("title"), 60)
        if not any(_text(u.get("actionId")) == _text(action.get("id")) for u in updates):
            add("block", f"선정 대책 '{title}'에 연결된 표준·문서 개정이 없습니다.")
    if "System" in confirmed_causes(case):
        system_ids = {_text(a.get("id")) for a in actions if a.get("causeType") == "System"}
        system_docs = [u for u in updates if _text(u.get("actionId")) in system_ids]
        if system_ids and not any(re.search(r"PFMEA|Control Plan|관리계획", _text(u.get("docName")) + _text(u.get("changeContent")), re.I) for u in system_docs):
            add("warn", "시스템원인 대책에 PFMEA 또는 Control Plan 개정이 없습니다.")
    for update in updates:
        name = _text(update.get("docName")) or _text(update.get("id"))
        if update.get("status") == "Completed" and not _text(update.get("evidence")):
            add("block", f"문서 '{name}'이 완료인데 개정 Evidence가 없습니다.")
        if update.get("status") == "Completed" and not (_text(update.get("docNo")) and _text(update.get("rev"))):
            add("warn", f"문서 '{name}'이 완료인데 문서번호 또는 Revision이 비어 있습니다.")
    if not deployments:
        add("block", "수평전개 기록이 없습니다. 같은 위험이 없다면 그 판단과 근거를 기록하세요.")
    for row in deployments:
        product = _text(row.get("product")) or _text(row.get("id"))
        if row.get("status") == "Not Applicable" and not _text(row.get("evidence")):
            add("block", f"수평전개 '{product}'를 해당 없음으로 했는데 근거가 없습니다.")
        if row.get("status") == "Completed" and not _text(row.get("evidence")):
            add("block", f"수평전개 '{product}'가 완료인데 실행 근거가 없습니다.")
    site = _text(_dict(_dict(case.get("d6")).get("implementationDetails")).get("productionSite"))
    for supplier in SUPPLIERS.values():
        if supplier["name"].lower() in site.lower() and not any(supplier["name"].lower() in (_text(r.get("product")) + _text(r.get("action"))).lower() for r in deployments):
            add("warn", f"대책을 적용한 {supplier['name']}의 다른 제품·라인에 대한 수평전개 기록이 없습니다.")
    if not _dict(d7.get("lessonsLearned")).get("lesson"):
        add("warn", "교훈(Lessons Learned)이 기록되지 않았습니다.")
    if not any(i["level"] == "block" for i in items):
        add("ok", "차단 항목이 없습니다.")
    return items


class PreventionAdvisorMixin:
    def _d7_case(self, identity, payload) -> tuple[dict, int, dict]:
        self._internal_permission(identity)
        case_id = payload.get("caseId") if isinstance(payload, dict) else None
        if not isinstance(case_id, str) or not case_id:
            fail(400, "Case를 지정하세요.", "INVALID_D7_REQUEST")
        with self._connect() as db:
            row = db.execute("SELECT revision, state_json FROM state_store WHERE id=1").fetchone()
        state = json.loads(row["state_json"]) if row else {}
        case = next((c for c in _rows(state.get("cases")) if c.get("id") == case_id), None)
        if case is None:
            fail(404, "중앙에 저장된 Case를 찾을 수 없습니다. 저장 후 다시 요청하세요.", "CASE_NOT_FOUND")
        return case, row["revision"], state

    def d7_system_context(self, identity, payload):
        case, revision, _ = self._d7_case(identity, payload)
        if not selected_actions(case):
            fail(409, "D5에서 선정된 대책이 없습니다. 대책을 선정한 뒤 추천받으세요.", "PREVENTION_NO_ACTION")
        return case, revision

    def d7_deploy_context(self, identity, payload):
        case, revision, state = self._d7_case(identity, payload)
        if not selected_actions(case):
            fail(409, "D5에서 선정된 대책이 없습니다. 대책을 선정한 뒤 추천받으세요.", "PREVENTION_NO_ACTION")
        with self._connect() as db:
            records = [json.loads(r[0]) for r in db.execute("SELECT record_json FROM assembly_defect_records ORDER BY updated_at DESC LIMIT 200")]
        return case, revision, deployment_candidates(state, case, records)

    def d7_lessons_context(self, identity, payload):
        case, revision, _ = self._d7_case(identity, payload)
        if not confirmed_causes(case) or not selected_actions(case):
            fail(409, "확정 원인과 선정 대책이 있어야 교훈을 정리할 수 있습니다.", "LESSONS_NOT_READY")
        return case, revision

    def d7_checks(self, identity, payload) -> dict:
        case, revision, _ = self._d7_case(identity, payload)
        return {"caseId": case["id"], "caseRevision": revision, "checkedAt": now(), "items": d7_checks(case)}

    def record_d7_ai(self, identity, action: str, case_id: str, revision: int, provider: dict, details: dict) -> None:
        with self._lock, self._connect() as db:
            self._audit(db, identity.user["id"], identity.user["username"], action, "case_stage", f"{case_id}:D7",
                        details={"provider": provider.get("engine"), "model": provider.get("model"), "caseRevision": revision, "externalAI": True, **details})
