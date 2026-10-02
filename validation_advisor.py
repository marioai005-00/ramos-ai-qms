"""D6 validation support.

- Test plans: an external AI proposes, for each corrective action a person selected in D5, how to test it. The
  sample size beside each plan is calculated (validation_stats), not proposed by the AI.
- Report reading: a person registers what their test report looks like (a report template). An external AI
  reads an uploaded report against that template and returns each value with where it found it. Whether the
  test passed is proposed by a rule from the extracted numbers; a person records the result.
- Checks: rules over the saved Case that stop a test or a containment release from looking finished when it is not.
"""
import base64
import io
import json
import re
import zipfile
import xml.etree.ElementTree as ET
from datetime import date
from typing import Any

import validation_stats
from internal_quality import fail, now
from tool_advisor import _dict, _rows, _text

PLAN_ENGINE = "external-ai-validation-plan-v1"
READ_ENGINE = "external-ai-report-reader-v1"
METHODS = {"reproduction": "재현 조건 시험", "seeded-defect": "불량 시료 투입 검출 시험", "document-review": "문서·체계 확인", "monitoring": "양산 적용 후 모니터링"}
CAUSES = {"Occurrence": "발생원인", "Escape": "유출원인", "System": "시스템원인"}
DEFAULT_CONFIDENCE = 0.9
# Detection tests: the chance of missing a defective part that must be ruled out.
DETECTION_MISS_RATE = 0.05
TEMPLATE_KEYS = {"sampleSize": "시료 수", "failQty": "불량 수", "condition": "시험 조건", "lot": "시험 Lot", "testDate": "시험일", "verdict": "성적서 판정"}
BINARY_TYPES = {".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp"}
TEXT_TYPES = {".txt", ".csv", ".xlsx"}
MAX_REPORT_BYTES = 20 * 1024 * 1024

COMMON_RULES = """반드시 지킬 것:
1. 입력에 있는 기록만 근거로 씁니다. 수량·날짜·결과를 만들어 내지 않습니다.
2. 모든 설명은 한국어로, 항목당 한두 문장으로 짧게 씁니다. 설명 문장 안에 시스템 코드값(id나 선택지 영문 값)을 쓰지 않고 한글 이름을 씁니다. SMT·BGA·PFMEA 같은 업계 약어는 그대로 씁니다.
3. JSON 객체 하나만 출력합니다. 설명 문장이나 코드 블록 표시를 붙이지 않습니다.

회사 기본 사실: 라모스는 자체 제조라인이 없고 조립·테스트를 외주사가 합니다(TechL SMT 모듈 조립, WinPAC OSAT 패키지, CTST 테스트 하우스)."""

PLAN_SYSTEM_PROMPT = "당신은 반도체 메모리 제조사의 품질 엔지니어를 돕는 8D D6(대책 효과 검증) 시험 설계 조언자입니다.\n역할은 D5에서 선정된 대책마다 효과를 증명할 시험 방법을 제안하는 것입니다. 시료 수와 합격 수량은 시스템이 계산하므로 쓰지 않습니다.\n\n" + COMMON_RULES
READ_SYSTEM_PROMPT = "당신은 시험 성적서에서 값을 옮겨 적는 품질 사무 보조자입니다.\n역할은 지정된 항목의 값을 성적서에서 찾아 그대로 옮기고, 어디에서 찾았는지 적는 것입니다. 값을 계산하거나 추정하지 않습니다. 성적서에 없는 항목은 비워 둡니다.\n\n" + COMMON_RULES


def _json_reply(text: str) -> dict:
    cleaned = re.sub(r"^```[a-zA-Z]*|```$", "", text.strip(), flags=re.MULTILINE).strip()
    start, end = cleaned.find("{"), cleaned.rfind("}")
    if start < 0 or end <= start:
        raise ValueError("AI 응답에서 JSON을 찾을 수 없습니다.")
    data = json.loads(cleaned[start:end + 1])
    if not isinstance(data, dict):
        raise ValueError("AI 응답 형식이 올바르지 않습니다.")
    return data


def _int(value: Any) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value if value >= 0 else None
    match = re.fullmatch(r"\s*([0-9][0-9,]*)\s*(ea|EA|개|pcs|PCS)?\s*", str(value or ""))
    return int(match.group(1).replace(",", "")) if match else None


def _day(value: Any) -> date | None:
    match = re.search(r"(20\d{2})[-./](\d{1,2})[-./](\d{1,2})", str(value or ""))
    try:
        return date(int(match.group(1)), int(match.group(2)), int(match.group(3))) if match else None
    except ValueError:
        return None


def selected_actions(case: dict) -> list[dict]:
    return [row for row in _rows(_dict(case.get("d5")).get("candidates")) if row.get("selected") is True and _text(row.get("id")) and _text(row.get("title"))]


def original_rate(case: dict) -> tuple[int, int] | None:
    defects, inspected = _int(case.get("defectQty")), _int(case.get("inspectQty"))
    return (defects, inspected) if defects is not None and inspected and 0 < defects <= inspected else None


def sample_suggestion(method: str, case: dict, confidence: float = DEFAULT_CONFIDENCE) -> dict | None:
    """The calculated sample size shown beside a plan, with the assumption it rests on."""
    if method == "seeded-defect":
        n = validation_stats.required_sample_size(DETECTION_MISS_RATE, confidence, 0)
        return {"sampleSize": n, "basis": "detection", "statement": f"불량 시료 {n}개를 넣어 모두 검출되면, 검사가 불량을 놓칠 확률이 {DETECTION_MISS_RATE:.0%} 미만이라고 신뢰도 {confidence:.0%}로 말할 수 있습니다."}
    rate = original_rate(case)
    if method in {"reproduction", "monitoring"} and rate:
        plan = validation_stats.sample_size_plan(rate[0] / rate[1], confidence, 0)
        return {"sampleSize": plan["sampleSize"], "basis": "original-rate",
                "statement": f"원래 불량률 {rate[0]}/{rate[1]}({plan['targetPpm']:,} PPM) 기준: " + plan["statement"]}
    return None


# ---------------------------------------------------------------- test plans
def build_plan_prompt(case: dict) -> str:
    roots = _dict(_dict(case.get("d4")).get("rootCauses"))
    brief = {
        "제품": _text(case.get("product")), "불량 현상": _text(case.get("claimTitle"), 600), "Lot": _text(case.get("lotNumber")),
        "원래 불량 수량": f"{_text(case.get('defectQty'))} / {_text(case.get('inspectQty'))}",
        "확정 원인": [{"구분": CAUSES[k], "원인": _text(_dict(roots.get(k)).get("statement"), 500), "재현·검증 방법": _text(_dict(roots.get(k)).get("validationMethod"), 400)}
                  for k in CAUSES if _dict(roots.get(k)).get("status") == "Confirmed"],
        "선정 대책": [{"대책 ID": _text(a.get("id")), "구분": CAUSES.get(a.get("causeType"), "미확정"), "대책": _text(a.get("title"), 400),
                   "D5 사전 검증 방법": _text(a.get("verificationPlan"), 400)} for a in selected_actions(case)],
    }
    methods = ", ".join(f"{code}({label})" for code, label in METHODS.items())
    return f"""아래는 중앙에 저장된 8D Case의 기록입니다. '선정 대책'마다 효과를 증명할 D6 검증 시험을 제안하세요.

[Case 기록]
{json.dumps(brief, ensure_ascii=False, indent=1)}

[출력 형식 — 이 JSON 객체 하나만]
{{
 "plans": [
  {{"actionId": "선정 대책의 대책 ID", "method": "{methods} 중 하나", "testName": "시험명", "purpose": "이 시험으로 무엇을 증명하는지",
    "condition": "시험 조건", "acceptanceCriteria": "합격 기준 (수량 없이 판정 방법으로)", "controlGroup": "비교 대상이 필요하면 무엇과 비교하는지, 필요 없으면 빈 문자열",
    "notes": "시험할 때 주의할 점"}}
 ],
 "notes": ["시험 전에 사람이 확인할 사항"]
}}

[규칙]
- 발생원인 대책은 D4에서 원인을 재현한 조건(가장 나쁜 조건)에서 대책 적용 시료를 시험하는 방법(reproduction)을 우선합니다.
- 유출원인 대책은 불량 시료를 일부러 넣어 검사가 걸러내는지 확인하는 방법(seeded-defect)을 우선합니다.
- 시스템원인 대책은 개정 문서·절차가 실제로 적용됐는지 확인하는 방법(document-review)입니다.
- 합격 기준은 원래 불량 현상을 기준으로 씁니다.
- 대책마다 시험 하나를 제안합니다."""


def parse_plan(text: str, case: dict) -> dict:
    data = _json_reply(text)
    actions = {_text(a.get("id")): a for a in selected_actions(case)}
    plans, seen = [], set()
    for item in _rows(data.get("plans")):
        action_id = _text(item.get("actionId"))
        if action_id not in actions or action_id in seen or not _text(item.get("testName")):
            continue
        seen.add(action_id)
        method = item.get("method") if item.get("method") in METHODS else "document-review"
        action = actions[action_id]
        plans.append({"actionId": action_id, "actionTitle": _text(action.get("title"), 200), "causeLabel": CAUSES.get(action.get("causeType"), "미확정"),
                      "method": method, "methodLabel": METHODS[method], "testName": _text(item.get("testName"), 200), "purpose": _text(item.get("purpose"), 400),
                      "condition": _text(item.get("condition"), 500), "acceptanceCriteria": _text(item.get("acceptanceCriteria"), 400),
                      "controlGroup": _text(item.get("controlGroup"), 300), "notes": _text(item.get("notes"), 400),
                      "sampleSuggestion": sample_suggestion(method, case)})
    if not plans:
        raise ValueError("AI 응답에 선정 대책과 연결된 시험 계획이 없습니다.")
    missing = [_text(a.get("title"), 80) for key, a in actions.items() if key not in seen]
    notes = [_text(item, 300) for item in (data.get("notes") if isinstance(data.get("notes"), list) else [])]
    return {"plans": plans, "actionsWithoutPlan": missing, "notes": [item for item in notes if item][:6],
            "originalRate": dict(zip(("fail", "n"), original_rate(case))) if original_rate(case) else None}


# ---------------------------------------------------------------- report templates and reading
def clean_template(template: Any) -> dict:
    template = _dict(template)
    name = _text(template.get("name"), 80)
    if not name:
        fail(400, "성적서 양식 이름이 필요합니다.", "INVALID_REPORT_TEMPLATE")
    fields = []
    for item in _rows(template.get("fields"))[:20]:
        key, label = _text(item.get("key"), 40), _text(item.get("label"), 60)
        if not re.fullmatch(r"[A-Za-z][A-Za-z0-9_]{0,39}", key) or not label:
            continue
        fields.append({"key": key, "label": label, "hint": _text(item.get("hint"), 200)})
    for key in ("sampleSize", "failQty"):
        if not any(f["key"] == key for f in fields):
            fail(400, f"성적서 양식에 '{TEMPLATE_KEYS[key]}' 항목이 있어야 전·후 비교를 할 수 있습니다.", "INVALID_REPORT_TEMPLATE")
    return {"id": _text(template.get("id"), 80), "name": name, "issuer": _text(template.get("issuer"), 80), "description": _text(template.get("description"), 600), "fields": fields}


def _xlsx_text(content: bytes) -> str:
    with zipfile.ZipFile(io.BytesIO(content)) as archive:
        entries = archive.infolist()
        if len(entries) > 2000 or sum(e.file_size for e in entries) > 40 * 1024 * 1024:
            raise ValueError("Excel 파일이 너무 큽니다.")
        ns = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
        shared = []
        if "xl/sharedStrings.xml" in archive.namelist():
            for si in ET.fromstring(archive.read("xl/sharedStrings.xml")).iter(ns + "si"):
                shared.append("".join(t.text or "" for t in si.iter(ns + "t")))
        lines = []
        for name in sorted(n for n in archive.namelist() if re.fullmatch(r"xl/worksheets/sheet\d+\.xml", n)):
            xml = archive.read(name)
            if b"<!DOCTYPE" in xml.upper() or b"<!ENTITY" in xml.upper():
                raise ValueError("지원하지 않는 Excel 구조입니다.")
            lines.append(f"[{name.rsplit('/', 1)[-1]}]")
            for row in ET.fromstring(xml).iter(ns + "row"):
                cells = []
                for cell in row.iter(ns + "c"):
                    value = cell.find(ns + "v")
                    inline = cell.find(ns + "is")
                    text = (shared[int(value.text)] if cell.get("t") == "s" and value is not None and value.text and value.text.isdigit() and int(value.text) < len(shared)
                            else "".join(t.text or "" for t in inline.iter(ns + "t")) if inline is not None else (value.text if value is not None else ""))
                    if text:
                        cells.append(f"{cell.get('r')}={text}")
                if cells:
                    lines.append(" | ".join(cells))
        return "\n".join(lines)


def decode_report(file: Any) -> dict:
    """The uploaded report as text, or as an inline attachment for a model that reads documents."""
    file = _dict(file)
    name, data_url = _text(file.get("name"), 200), file.get("dataUrl")
    ext = ("." + name.rsplit(".", 1)[-1].lower()) if "." in name else ""
    if not name or not isinstance(data_url, str) or ";base64," not in data_url:
        fail(400, "성적서 파일이 필요합니다.", "INVALID_REPORT_FILE")
    if ext not in BINARY_TYPES and ext not in TEXT_TYPES:
        fail(415, "성적서는 PDF·이미지(PNG/JPG/WEBP)·Excel(xlsx)·CSV·TXT만 읽을 수 있습니다.", "UNSUPPORTED_REPORT_FILE")
    try:
        content = base64.b64decode(data_url.split(";base64,", 1)[1], validate=True)
    except ValueError:
        fail(400, "성적서 파일을 읽을 수 없습니다.", "INVALID_REPORT_FILE")
    if not content or len(content) > MAX_REPORT_BYTES:
        fail(413, "성적서 파일은 20 MB 이하여야 합니다.", "INVALID_REPORT_FILE")
    if ext in BINARY_TYPES:
        return {"name": name, "attachment": {"name": name, "dataUrl": f"data:{BINARY_TYPES[ext]};base64," + base64.b64encode(content).decode()}}
    try:
        text = _xlsx_text(content) if ext == ".xlsx" else next(content.decode(enc) for enc in ("utf-8-sig", "cp949") if _decodes(content, enc))
    except (StopIteration, zipfile.BadZipFile, ET.ParseError, ValueError):
        fail(400, "성적서 내용을 읽을 수 없습니다.", "INVALID_REPORT_FILE")
    return {"name": name, "text": text[:60000]}


def _decodes(content: bytes, encoding: str) -> bool:
    try:
        content.decode(encoding)
        return True
    except UnicodeError:
        return False


def build_read_prompt(template: dict, test: dict, report: dict) -> str:
    fields = "\n".join(f"- {f['key']}: {f['label']}" + (f" (찾는 위치: {f['hint']})" if f["hint"] else "") for f in template["fields"])
    plan = {"시험명": _text(test.get("testName")), "계획 시험 조건": _text(test.get("condition"), 400), "합격 기준": _text(test.get("acceptanceCriteria"), 300)}
    body = f"\n[성적서 내용 — {report['name']}]\n{report['text']}\n" if report.get("text") else f"\n[성적서 — 첨부 파일 {report['name']}]\n"
    return f"""아래 성적서에서 지정 항목의 값을 찾아 옮겨 적으세요.

[성적서 양식: {template['name']}{' · ' + template['issuer'] if template['issuer'] else ''}]
{template['description']}

[찾을 항목]
{fields}

[이 시험의 계획 — 성적서가 같은 시험인지 확인하는 데만 씁니다]
{json.dumps(plan, ensure_ascii=False)}
{body}
[출력 형식 — 이 JSON 객체 하나만]
{{
 "values": {{"항목 key": {{"value": "성적서에 적힌 값 그대로", "source": "찾은 위치(페이지·표 이름·셀 등)"}}}},
 "sameTest": "yes, no, unknown 중 하나 — 성적서가 위 계획과 같은 시험인지",
 "sameTestReason": "그렇게 판단한 이유",
 "notes": ["옮겨 적으며 확인이 필요했던 점"]
}}

[규칙]
- 성적서에 없는 항목은 values에 넣지 않습니다.
- 숫자는 성적서에 적힌 그대로 옮기고 단위를 바꾸거나 합산하지 않습니다.
- 여러 값이 있어 하나를 고를 수 없으면 값을 비우고 notes에 이유를 적습니다."""


def parse_report(text: str, template: dict, test: dict, case: dict) -> dict:
    data = _json_reply(text)
    given = _dict(data.get("values"))
    values = {}
    for field in template["fields"]:
        item = given.get(field["key"])
        item = item if isinstance(item, dict) else {"value": item, "source": ""}
        value = _text(item.get("value"), 300)
        if value:
            values[field["key"]] = {"label": field["label"], "value": value, "source": _text(item.get("source"), 200)}
    sample, fails = _int(values.get("sampleSize", {}).get("value")), _int(values.get("failQty", {}).get("value"))
    tested_on = _day(values.get("testDate", {}).get("value"))
    details = _dict(_dict(case.get("d6")).get("implementationDetails"))
    applied_on, applied_lot = _day(details.get("startDate")), _text(details.get("appliedLot"))
    mismatches = []
    if values.get("sampleSize") and sample is None:
        mismatches.append(f"시료 수 '{values['sampleSize']['value']}'를 숫자로 읽을 수 없습니다.")
    if values.get("failQty") and fails is None:
        mismatches.append(f"불량 수 '{values['failQty']['value']}'를 숫자로 읽을 수 없습니다.")
    if sample is not None and fails is not None and fails > sample:
        mismatches.append("불량 수가 시료 수보다 많습니다.")
    planned = _int(test.get("plannedSampleSize"))
    if planned and sample is not None and sample < planned:
        mismatches.append(f"시료 수({sample:,})가 계획 시료 수({planned:,})보다 적습니다.")
    if tested_on and applied_on and tested_on < applied_on:
        mismatches.append(f"시험일({tested_on})이 대책 적용일({applied_on})보다 앞섭니다. 대책 적용 전 시료일 수 있습니다.")
    tested_lot = _text(values.get("lot", {}).get("value"))
    if tested_lot and applied_lot and tested_lot not in applied_lot and applied_lot not in tested_lot:
        mismatches.append(f"시험 Lot({tested_lot})이 D6 적용 Lot({applied_lot})과 다릅니다.")
    same = data.get("sameTest") if data.get("sameTest") in {"yes", "no", "unknown"} else "unknown"
    if same == "no":
        mismatches.append("AI가 이 성적서를 계획과 다른 시험으로 판단했습니다: " + _text(data.get("sameTestReason"), 200))
    allowed = _int(test.get("allowedFailures")) or 0
    if sample is None or fails is None:
        proposal = ("UNKNOWN", "시료 수 또는 불량 수를 성적서에서 찾지 못해 판정을 제안할 수 없습니다.")
    elif fails > allowed:
        proposal = ("FAIL", f"불량 {fails}개로 허용 불량 수({allowed}개)를 넘었습니다.")
    elif planned and sample < planned:
        proposal = ("UNKNOWN", "불량은 허용 범위지만 시료 수가 계획보다 적어 판정을 제안하지 않습니다.")
    else:
        proposal = ("PASS", f"시료 {sample:,}개 중 불량 {fails}개로 허용 불량 수({allowed}개) 이내입니다." + ("" if planned else " 계획 시료 수가 없어 시료 수는 확인하지 않았습니다."))
    notes = [_text(item, 300) for item in (data.get("notes") if isinstance(data.get("notes"), list) else [])]
    return {"values": values, "sampleSize": sample, "failQty": fails, "testDate": tested_on.isoformat() if tested_on else "",
            "sameTest": same, "sameTestReason": _text(data.get("sameTestReason"), 300), "mismatches": mismatches,
            "proposal": {"result": proposal[0], "reason": proposal[1], "byRule": True}, "notes": [n for n in notes if n][:6]}


# ---------------------------------------------------------------- checks
def d6_checks(case: dict, tickets: list[dict]) -> list[dict]:
    """Rules over the saved Case. 'block' means a containment release or a PASS would not be supported."""
    d5, d6 = _dict(case.get("d5")), _dict(case.get("d6"))
    tests, details = _rows(d6.get("validationTests")), _dict(d6.get("implementationDetails"))
    release, pcn = _dict(d6.get("containmentRelease")), _dict(d5.get("pcnEcn"))
    items: list[dict] = []
    add = lambda level, text: items.append({"level": level, "text": text})
    actions = selected_actions(case)
    if not actions:
        add("block", "D5에서 선정된 대책이 없습니다.")
    for action in actions:
        linked = [t for t in tests if _text(t.get("actionId")) == _text(action.get("id"))]
        title = _text(action.get("title"), 60)
        if not linked:
            add("block", f"선정 대책 '{title}'에 연결된 검증 시험이 없습니다.")
        elif not any(t.get("result") == "PASS" for t in linked):
            add("warn", f"선정 대책 '{title}'의 시험이 아직 PASS가 아닙니다.")
    applied_on = _day(details.get("startDate"))
    for test in tests:
        name = _text(test.get("testName")) or _text(test.get("id"))
        sample, planned, fails = _int(test.get("sampleSize")), _int(test.get("plannedSampleSize")), _int(test.get("failQty"))
        if test.get("result") == "FAIL":
            add("block", f"시험 '{name}'이 FAIL입니다. 보완 후 재검증이 필요합니다.")
        if test.get("result") == "PASS" and planned and sample is not None and sample < planned:
            add("warn", f"시험 '{name}'의 시료 수({sample:,})가 계획({planned:,})보다 적은데 PASS로 기록됐습니다.")
        if test.get("result") == "PASS" and fails and fails > (_int(test.get("allowedFailures")) or 0):
            add("warn", f"시험 '{name}'은 불량 {fails}개인데 PASS로 기록됐습니다. 합격 기준을 확인하세요.")
        tested_on = _day(test.get("completedAt"))
        if tested_on and applied_on and tested_on < applied_on:
            add("warn", f"시험 '{name}'의 시험일({tested_on})이 대책 적용일({applied_on})보다 앞섭니다.")
    if pcn.get("pcnRequired") is True:
        approved = re.search(r"승인|approved", _text(pcn.get("customerApprovalStatus")), re.IGNORECASE) and not re.search(r"미승인|반려|대기|not", _text(pcn.get("customerApprovalStatus")), re.IGNORECASE)
        if not approved and (applied_on or _text(details.get("appliedLot"))):
            add("block", "고객 PCN 승인이 필요한데 승인 상태가 확인되지 않은 채 대책 적용이 기록됐습니다.")
        if not any(t.get("ticketType") == "PCN" and t.get("status") == "Approved" for t in tickets):
            add("warn", "이 Case에 연결된 승인된 외주 PCN 접수가 없습니다. 외주사 공정 변경이면 외주 PCN을 확인하세요.")
    if release.get("decision") == "Released":
        if not tests or any(t.get("result") != "PASS" for t in tests):
            add("block", "모든 검증 시험이 PASS가 아닌데 봉쇄 해제가 선택됐습니다.")
        if not _text(details.get("appliedLot")):
            add("block", "적용 Lot이 기록되지 않았는데 봉쇄 해제가 선택됐습니다.")
    stats = _dict(_dict(d6.get("beforeAfter")).get("statistics"))
    if stats.get("verdict") in {"inconclusive", "not_improved"}:
        add("warn", f"전·후 비교 결과가 '{_text(stats.get('verdictLabel'))}'입니다.")
    if not any(item["level"] == "block" for item in items):
        add("ok", "봉쇄 해제를 막는 항목이 없습니다." if release.get("decision") == "Released" else "차단 항목이 없습니다.")
    return items


class ValidationAdvisorMixin:
    def _d6_case(self, identity, payload) -> tuple[dict, int]:
        self._internal_permission(identity)
        case_id = payload.get("caseId") if isinstance(payload, dict) else None
        if not isinstance(case_id, str) or not case_id:
            fail(400, "Case를 지정하세요.", "INVALID_D6_REQUEST")
        with self._connect() as db:
            row = db.execute("SELECT revision, state_json FROM state_store WHERE id=1").fetchone()
        case = next((c for c in (json.loads(row["state_json"]).get("cases", []) if row else []) if isinstance(c, dict) and c.get("id") == case_id), None)
        if case is None:
            fail(404, "중앙에 저장된 Case를 찾을 수 없습니다. 저장 후 다시 요청하세요.", "CASE_NOT_FOUND")
        return case, row["revision"]

    def d6_plan_context(self, identity, payload) -> tuple[dict, int]:
        case, revision = self._d6_case(identity, payload)
        if not selected_actions(case):
            fail(409, "D5에서 선정된 대책이 없습니다. 대책을 선정한 뒤 시험 계획을 추천받으세요.", "VALIDATION_PLAN_NO_ACTION")
        return case, revision

    def d6_read_context(self, identity, payload) -> tuple[dict, int, dict, dict]:
        case, revision = self._d6_case(identity, payload)
        tests = _rows(_dict(case.get("d6")).get("validationTests"))
        test_id = payload.get("testId")
        test = next((t for t in tests if _text(t.get("id")) == test_id), None) if isinstance(test_id, str) else None
        if test is None:
            fail(404, "저장된 검증 시험을 찾을 수 없습니다. 시험 행을 저장한 뒤 다시 시도하세요.", "VALIDATION_TEST_NOT_FOUND")
        return case, revision, test, clean_template(payload.get("template"))

    def d6_checks(self, identity, payload) -> dict:
        case, revision = self._d6_case(identity, payload)
        with self._connect() as db:
            tickets = [json.loads(r[0]) for r in db.execute("SELECT record_json FROM supplier_tickets")]
        tickets = [t for t in tickets if _dict(t.get("sqeReview")).get("bound8DCaseId") == case["id"]]
        return {"caseId": case["id"], "caseRevision": revision, "checkedAt": now(), "items": d6_checks(case, tickets)}

    def record_d6_ai(self, identity, action: str, case_id: str, revision: int, provider: dict, details: dict) -> None:
        with self._lock, self._connect() as db:
            self._audit(db, identity.user["id"], identity.user["username"], action, "case_stage", f"{case_id}:D6",
                        details={"provider": provider.get("engine"), "model": provider.get("model"), "caseRevision": revision, "externalAI": True, **details})
