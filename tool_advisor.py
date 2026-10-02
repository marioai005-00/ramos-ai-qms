"""D4 quality-tool advice: an external AI reads the centrally saved Case and proposes which analysis
tools to use, in what order and why.

The advice is a proposal for a person to review. It names tools and the questions they answer; it must
not state a root cause, a measurement or a verdict. Everything the model returns is validated against the
catalogue below, and anything outside it is dropped.
"""
import json
import re
from typing import Any

from internal_quality import fail, now

ENGINE = "external-ai-tool-advisor-v1"
MAX_EXTRA_TOOLS = 4
# (id, name, what it is for, what data it needs) — the ids match getD4ToolCatalog() in js/views/workspace.js.
CATALOG = [
    ("timeline", "발생 타임라인", "마지막 정상부터 고객 불량까지 사건과 변경점을 시간순으로 정렬", "생산·검사·입출고·고객 발생 일시"),
    ("process-flow", "Process Flow / SIPOC", "Wafer·외주 Assembly·Test·입고·출하·고객 사용 경로에서 발생·검출 지점 확인", "공정 흐름도, 외주사·검사 단계"),
    ("change-point", "Change Point Analysis", "정상과 불량 사이의 4M1E·설계·외주사 변경점 비교", "변경통보, Recipe·자재·설비 이력"),
    ("fishbone", "Fishbone 8M", "Man·Machine·Material·Method·Measurement·Environment·Design·Supplier 원인 후보 발굴", "CFT 브레인스토밍과 사실자료"),
    ("five-why", "3-Track 5 Why", "발생·유출·시스템 원인을 분리해 Why마다 Evidence 연결", "검증된 현상과 원인 후보"),
    ("fta", "Fault Tree Analysis", "복합·간헐 고장의 AND/OR 원인 경로를 논리적으로 분해", "고장 Mode와 기능 블록"),
    ("cause-effect", "Cause & Effect Matrix", "후보 원인의 연관성·재현성·Evidence 수준으로 우선순위 선정", "원인 후보 목록과 평가기준"),
    ("stratification", "층별 분석", "LOT·외주사·설비·Tester·Socket·일자·교대조별 불량 집중도 비교", "조건 열이 포함된 불량 데이터"),
    ("pareto", "Pareto 분석", "복수 불량 Mode·Bin·조건 중 주요 기여 항목 선별", "범주별 건수 또는 불량수량"),
    ("run-chart", "Trend / Run Chart", "시간에 따른 불량률·측정값·설비 Parameter 변화 확인", "시간순 연속 데이터"),
    ("spc", "SPC 관리도", "공정의 우연변동과 이상원인을 관리한계 기준으로 구분", "충분한 시계열 표본과 관리 기준"),
    ("distribution", "Histogram / Box Plot", "정상·불량 LOT 또는 설비 간 평균과 산포 비교", "수치형 측정 원본"),
    ("correlation", "산점도 / 상관분석", "공정조건과 불량률·측정값 사이의 연관 패턴 확인", "짝을 이룬 두 개 이상의 수치 변수"),
    ("statistics", "가설검정 / ANOVA / 회귀", "그룹 간 차이와 변수 영향이 통계적으로 유의한지 검증", "표본수와 분포조건을 만족하는 원시 데이터"),
    ("genealogy", "LOT Genealogy", "Wafer·Assembly·Test·당사 입고·고객 출하 LOT 연결관계 추적", "외주 Trace, CoA, Packing·입고 이력"),
    ("wafer-bin-map", "Wafer Map / Bin Map", "Edge·Center·Ring·Die 위치·특정 Bin 집중 패턴 탐색", "Wafer 좌표 또는 Test Bin 데이터"),
    ("cross-swap", "Cross / Swap Test", "제품·Board·Socket·Program·자재를 교환해 원인 위치 분리", "정상·불량 비교시료와 교환 시험"),
    ("reproduction", "재현시험", "의심 조건의 투입·제거를 반복해 동일 Failure Mode 재현", "시험조건, 반복수, 대조군"),
    ("physical-fa", "Physical FA Tree", "외관·X-ray·SAT·Decap·SEM/EDS·Cross Section 결과를 단계적으로 연결", "시료정보와 공인 분석 성적서"),
    ("shainin", "Shainin 기법", "Paired Comparison·Component Search·Multi-Vari로 핵심 변수 압축", "Best/Worst 시료와 비교 가능한 변수"),
    ("test-coverage", "검사 Coverage 분석", "해당 Failure Mode를 어느 검사에서 어떤 조건으로 검출했어야 하는지 확인", "검사 Flow, 항목, 조건, 검출능력"),
    ("test-limit", "Test Limit / Guard Band", "정상·불량 분포와 Spec/Test Limit 사이 False Pass 영역 확인", "측정 원본, Limit, 고객 사용조건"),
    ("msa", "MSA / Gage R&R", "장비·검사자·반복측정 변동과 불량 구분 능력 평가", "반복·재현 측정 데이터"),
    ("sampling-risk", "Sampling Risk / AQL", "샘플링 검사에서 Lot Accept 및 Escape 확률 평가", "검사수량, AQL, 허용불량 기준"),
    ("fmea-gap", "PFMEA / Control Plan Gap", "Failure Mode의 예방·검출 관리 누락과 실제 작업 불일치 확인", "PFMEA, Control Plan, 작업표준, Audit 결과"),
]
TOOL_IDS = [item[0] for item in CATALOG]
TOOL_NAMES = {item[0]: item[1] for item in CATALOG}
CORE_TOOL_IDS = ["timeline", "process-flow", "change-point", "fishbone", "five-why"]
# The same choices as the profile selectors on the D4 screen.
PROFILE = {
    "failureMode": {"unknown": "미확정", "electrical": "전기적 불량", "functional": "기능 불량", "physical": "외관·물리적 불량", "reliability": "신뢰성·열화 불량", "process": "공정 변동"},
    "pattern": {"unknown": "미확정", "single": "단발", "intermittent": "간헐", "lot-cluster": "특정 LOT 집중", "trend": "시간 추세", "multiple": "복수 Mode"},
    "dataScope": {"none": "거의 없음", "limited": "성적서·요약자료", "lot": "LOT별 데이터", "continuous": "연속 측정 원본", "map": "Wafer·Bin Map"},
    "productionModel": {"outsourced": "Assembly·Test 외주", "mixed": "내부+외주 혼합", "internal": "사내 생산"},
    "escapeConcern": {"unknown": "미확정", "yes": "있음", "no": "낮음"},
}
PROFILE_DEFAULT = {"failureMode": "unknown", "pattern": "unknown", "dataScope": "limited", "productionModel": "outsourced", "escapeConcern": "unknown"}

SYSTEM_PROMPT = """당신은 반도체 메모리(eMMC·DRAM) 제조사의 품질 엔지니어를 돕는 8D D4(원인 분석) 도구 선정 조언자입니다.
역할은 '어떤 품질도구를 어떤 순서로 왜 써야 하는지'를 제안하는 것뿐입니다.

반드시 지킬 것:
1. 근본원인, 측정값, 시험 결과, 판정을 쓰지 않습니다. 원인은 사람이 시험과 증거로 입증합니다.
2. 입력에 있는 사실만 근거로 씁니다. 입력에 없는 고객·수량·날짜·설비·업체를 만들어 내지 않습니다.
3. 사실이 부족해 판단할 수 없으면 해당 항목을 unknown으로 두고 이유에 '자료 부족'이라고 적습니다.
4. 도구 id는 제공된 목록의 id만 씁니다.
5. 모든 설명은 한국어로, 항목당 한두 문장으로 짧게 씁니다. 설명 문장 안에는 영문 코드값(id, single, outsourced 등)을 쓰지 않고 한글 이름을 씁니다.
6. JSON 객체 하나만 출력합니다. 설명 문장이나 코드 블록 표시를 붙이지 않습니다.

회사 기본 사실(시스템에 등록된 내용):
- 라모스는 자체 제조라인이 없습니다. 조립·테스트는 외주사가 합니다: TechL(SMT 모듈 조립), WinPAC(OSAT 패키지), CTST(테스트 하우스).
- 따라서 생산 형태는 기록에 반대되는 사실이 없으면 외주(outsourced)입니다. 공정·검사 자료와 불량 시료 분석은 대부분 외주사나 사내 개발실(FA)에서 받아야 합니다."""


def _text(value: Any, limit: int = 300) -> str:
    if value is None or isinstance(value, (bool, dict, list)):
        return ""
    return re.sub(r"\s+", " ", str(value)).strip()[:limit]


def _dict(value: Any) -> dict:
    return value if isinstance(value, dict) else {}


def _rows(value: Any) -> list[dict]:
    return [item for item in value if isinstance(item, dict)] if isinstance(value, list) else []


def case_brief(case: dict) -> dict:
    """The recorded facts the adviser may read. Nothing is inferred here."""
    d2, d3 = _dict(case.get("d2")), _dict(case.get("d3"))
    scope = _dict(d3.get("lotScope"))
    brief = {
        "고객사": _text(case.get("customer")), "제품": _text(case.get("product")), "품번": _text(case.get("partNumber")), "Lot": _text(case.get("lotNumber")),
        "불량 현상": _text(case.get("claimTitle"), 600), "발생 위치": _text(case.get("incidentSite")), "생산 Site": _text(case.get("mfgSite")),
        "불량 수량": _text(case.get("defectQty")), "검사 수량": _text(case.get("inspectQty")),
        "고객 라인 정지": case.get("lineStop") is True, "안전 위험": case.get("safetyRisk") is True, "동일 불량 재발": case.get("recurrentDefect") is True,
        "D2 5W2H": {label: _text(d2.get(key), 400) for key, label in (("problemWhat", "What"), ("problemWhere", "Where"), ("problemWhen", "When"), ("problemWho", "Who"),
                                                                       ("problemWhich", "Which"), ("problemHow", "How"), ("problemHowMany", "How many"))},
        "D2 문제 정의문": _text(d2.get("problemStatement"), 800),
        # Only comparison rows a person marked as verified count as facts.
        "D2 IS/IS NOT (사실 확인된 행)": [{"구분": _text(r.get("factor")), "IS": _text(r.get("is")), "IS NOT": _text(r.get("isNot")), "차이": _text(r.get("difference"))}
                                       for r in _rows(d2.get("isIsNot")) if r.get("verificationStatus") == "Verified"][:12],
        "D3 영향 범위": {label: _text(scope.get(key)) for key, label in (("adjacentLots", "전후 Lot"), ("rawMaterialBatch", "동일 원자재 Batch"), ("equipment", "동일 설비·Recipe"))},
        "첨부된 근거 자료": [{"파일": _text(e.get("file") or e.get("title")), "유형": _text(e.get("type")), "단계": e.get("linkedStages") or []} for e in _rows(case.get("evidenceList"))][:30],
    }
    return {key: value for key, value in brief.items() if value not in ("", [], {}, None)}


def build_prompt(case: dict) -> str:
    tools = "\n".join(f"- {tool_id}: {name} — {purpose} (필요 자료: {needs})" for tool_id, name, purpose, needs in CATALOG)
    profile = "\n".join(f"- {key}: " + ", ".join(f"{value}({label})" for value, label in options.items()) for key, options in PROFILE.items())
    return f"""아래는 중앙에 저장된 8D Case의 기록입니다. 이 기록만 근거로 D4 품질도구 선정을 제안하세요.

[Case 기록]
{json.dumps(case_brief(case), ensure_ascii=False, indent=1)}

[선택할 수 있는 품질도구]
{tools}

[Case 특성 분류 — 각 항목에서 값 하나를 고르세요]
{profile}

[출력 형식 — 이 JSON 객체 하나만]
{{
 "profile": {{"failureMode": "", "pattern": "", "dataScope": "", "productionModel": "", "escapeConcern": ""}},
 "profileReasons": {{"failureMode": "기록의 어떤 사실 때문에 그렇게 분류했는지", "pattern": "", "dataScope": "", "productionModel": "", "escapeConcern": ""}},
 "tools": [
  {{"id": "도구 id", "why": "이 Case의 어떤 사실 때문에 필요한지", "question": "이 도구로 답하려는 질문", "dataNeeded": "필요한 자료", "dataOwner": "그 자료를 가진 부서나 업체 유형",
    "readiness": "ready 또는 need-data", "nextIf": "결과에 따라 다음에 쓸 도구와 조건"}}
 ],
 "excluded": [{{"id": "도구 id", "reason": "이 Case에서 지금 쓰지 않는 이유"}}],
 "openQuestions": ["도구 선정 전에 사람이 먼저 확인해야 할 사실"]
}}

[규칙]
- tools는 실제로 쓰는 순서대로 나열합니다.
- 필수 도구 5개({", ".join(CORE_TOOL_IDS)})는 반드시 포함합니다.
- 그 밖의 도구는 이 불량 현상을 밝히는 데 필요한 것을 최대 {MAX_EXTRA_TOOLS}개 추가합니다. 발생 원인을 가리는 도구와, 검사에서 왜 걸러지지 않았는지(유출)를 가리는 도구를 함께 고려합니다.
- 자료가 아직 없다는 이유로 필요한 도구를 빼지 않습니다. 자료가 없으면 readiness를 need-data로 두고 dataNeeded와 dataOwner에 누구에게 무엇을 받아야 하는지 적습니다.
- readiness는 '첨부된 근거 자료'로 바로 시작할 수 있으면 ready, 자료를 먼저 받아야 하면 need-data입니다.
- excluded에는 이 불량 현상의 성격에 맞지 않는 도구를 이유와 함께 최대 5개 적습니다. '자료가 없다'는 제외 이유가 아닙니다.
- 원인을 단정하는 문장을 쓰지 않습니다. '~인지 확인', '~여부를 가린다' 형태로 씁니다."""


CODE_NAMES = {**TOOL_NAMES, **{value: label for options in PROFILE.values() for value, label in options.items() if value not in ("unknown", "yes", "no")},
              **{key: key for key in PROFILE}}
CODE_PATTERN = re.compile(r"(?<![A-Za-z-])(" + "|".join(sorted((re.escape(code) for code in CODE_NAMES), key=len, reverse=True)) + r")(?![A-Za-z-])")
FIELD_NAMES = {"failureMode": "불량 유형", "pattern": "발생 패턴", "dataScope": "확보 데이터", "productionModel": "생산 형태", "escapeConcern": "검사 유출 의심"}


def _readable(value: Any, limit: int) -> str:
    """Model text with catalogue and profile codes replaced by the names a person sees on the screen."""
    return CODE_PATTERN.sub(lambda m: FIELD_NAMES.get(m.group(1)) or CODE_NAMES[m.group(1)], _text(value, limit))


def parse_advice(text: str) -> dict:
    """Validate the model's reply against the catalogue. Raises ValueError when it cannot be used."""
    cleaned = re.sub(r"^```[a-zA-Z]*|```$", "", text.strip(), flags=re.MULTILINE).strip()
    start, end = cleaned.find("{"), cleaned.rfind("}")
    if start < 0 or end <= start:
        raise ValueError("AI 응답에서 JSON을 찾을 수 없습니다.")
    data = json.loads(cleaned[start:end + 1])
    if not isinstance(data, dict):
        raise ValueError("AI 응답 형식이 올바르지 않습니다.")
    given_profile, reasons = _dict(data.get("profile")), _dict(data.get("profileReasons"))
    profile = {key: given_profile.get(key) if given_profile.get(key) in options else PROFILE_DEFAULT[key] for key, options in PROFILE.items()}
    tools, seen = [], set()
    for item in _rows(data.get("tools")):
        tool_id = item.get("id")
        if tool_id not in TOOL_NAMES or tool_id in seen:
            continue
        if tool_id not in CORE_TOOL_IDS and sum(1 for t in tools if t["id"] not in CORE_TOOL_IDS) >= MAX_EXTRA_TOOLS:
            continue
        seen.add(tool_id)
        tools.append({"id": tool_id, "name": TOOL_NAMES[tool_id], "core": tool_id in CORE_TOOL_IDS, "source": "ai",
                      "why": _readable(item.get("why"), 400), "question": _readable(item.get("question"), 400), "dataNeeded": _readable(item.get("dataNeeded"), 300),
                      "dataOwner": _readable(item.get("dataOwner"), 200), "readiness": "ready" if item.get("readiness") == "ready" else "need-data",
                      "nextIf": _readable(item.get("nextIf"), 400)})
    if not tools:
        raise ValueError("AI 응답에 사용할 수 있는 도구 제안이 없습니다.")
    # A required tool the model left out is still listed, marked as not explained by the AI.
    for tool_id in CORE_TOOL_IDS:
        if tool_id not in seen:
            tools.append({"id": tool_id, "name": TOOL_NAMES[tool_id], "core": True, "source": "rule", "why": "", "question": "", "dataNeeded": "",
                          "dataOwner": "", "readiness": "need-data", "nextIf": ""})
    for order, tool in enumerate(tools, 1):
        tool["order"] = order
    chosen = {tool["id"] for tool in tools}
    excluded = [{"id": item["id"], "name": TOOL_NAMES[item["id"]], "reason": _readable(item.get("reason"), 300)}
                for item in _rows(data.get("excluded")) if item.get("id") in TOOL_NAMES and item.get("id") not in chosen][:5]
    questions = [_readable(item, 300) for item in (data.get("openQuestions") if isinstance(data.get("openQuestions"), list) else [])]
    return {"profile": profile, "profileLabels": {key: PROFILE[key][value] for key, value in profile.items()},
            "profileReasons": {key: _readable(reasons.get(key), 300) for key in PROFILE}, "tools": tools, "excluded": excluded,
            "openQuestions": [item for item in questions if item][:6]}


class ToolAdvisorMixin:
    def d4_tool_advice_case(self, identity, payload) -> tuple[dict, int]:
        """The centrally saved Case the advice is built from, so the adviser never reads unsaved browser data."""
        self._internal_permission(identity)
        case_id = payload.get("caseId") if isinstance(payload, dict) else None
        if not isinstance(case_id, str) or not case_id:
            fail(400, "Case를 지정하세요.", "INVALID_TOOL_ADVICE")
        with self._connect() as db:
            row = db.execute("SELECT revision, state_json FROM state_store WHERE id=1").fetchone()
        case = next((c for c in (json.loads(row["state_json"]).get("cases", []) if row else []) if isinstance(c, dict) and c.get("id") == case_id), None)
        if case is None:
            fail(404, "중앙에 저장된 Case를 찾을 수 없습니다. 저장 후 다시 요청하세요.", "CASE_NOT_FOUND")
        if not _text(case.get("claimTitle")) and not _text(_dict(case.get("d2")).get("problemStatement")):
            fail(409, "불량 현상이나 D2 문제 정의가 기록되어야 도구를 추천할 수 있습니다.", "TOOL_ADVICE_NO_FACTS")
        return case, row["revision"]

    def record_d4_tool_advice(self, identity, case_id: str, revision: int, provider: dict, advice: dict) -> dict:
        with self._lock, self._connect() as db:
            self._audit(db, identity.user["id"], identity.user["username"], "D4_TOOL_ADVICE_GENERATED", "case_stage", f"{case_id}:D4",
                        details={"engine": ENGINE, "provider": provider.get("engine"), "model": provider.get("model"), "caseRevision": revision,
                                 "externalAI": True, "tools": [tool["id"] for tool in advice["tools"]]})
        return {"caseId": case_id, "engine": ENGINE, "provider": provider.get("engine"), "model": provider.get("model"), "generatedAt": now(), "caseRevision": revision,
                "guardrails": {"autoApply": False, "statesRootCause": False, "externalAI": True}, **advice}
