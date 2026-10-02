"""8D report export to .xlsx using only the standard library.

The workbook reproduces what the Case records. Stages without a recorded approval are labelled
as drafts, and empty fields stay empty rather than being filled with placeholder results.
"""
import io
import json
import re
import zipfile
from typing import Any
from xml.sax.saxutils import escape

from internal_quality import fail, now

CFT_STATUS_LABELS = {"AI Suggested - Human Review Required": "AI 추천", "Active": "배정"}
GATES = {"gate3D": ("Initial 3D Report", 3), "gate5D": ("Interim 5D Report", 5), "gate8D": ("Final 8D Report", 8)}
# Style ids defined in _STYLES: plain, title, section, table header, label, note.
PLAIN, TITLE, SECTION, HEADER, LABEL, NOTE = 0, 1, 2, 3, 4, 5
_ILLEGAL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f]")
_STYLES = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="4"><font><sz val="10"/><name val="Malgun Gothic"/></font><font><b/><sz val="16"/><name val="Malgun Gothic"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Malgun Gothic"/></font><font><b/><sz val="10"/><name val="Malgun Gothic"/></font></fonts>
<fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1E3A5F"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFDCE6F1"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF2F2F2"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FF999999"/></left><right style="thin"><color rgb="FF999999"/></right><top style="thin"><color rgb="FF999999"/></top><bottom style="thin"><color rgb="FF999999"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="6">
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="0" fontId="3" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="3" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>"""


def _column(index: int) -> str:
    name = ""
    while index >= 0:
        name = chr(65 + index % 26) + name
        index = index // 26 - 1
    return name


class Sheet:
    def __init__(self, name: str, widths: list[int]):
        self.name, self.widths, self.rows, self.merges = name, widths, [], []

    def row(self, values: list[Any], style: int = PLAIN, merge: bool = False) -> None:
        self.rows.append([(value, style) for value in values])
        if merge and len(self.widths) > 1:
            self.merges.append(f"A{len(self.rows)}:{_column(len(self.widths) - 1)}{len(self.rows)}")

    def blank(self) -> None:
        self.rows.append([])

    def pairs(self, items: list[tuple[str, Any]]) -> None:
        """Label/value rows; the value spans the remaining columns."""
        for label, value in items:
            self.rows.append([(label, LABEL), (value, PLAIN)] + [("", PLAIN)] * (len(self.widths) - 2))
            if len(self.widths) > 2:
                self.merges.append(f"B{len(self.rows)}:{_column(len(self.widths) - 1)}{len(self.rows)}")

    def table(self, headers: list[str], rows: list[list[Any]], empty: str) -> None:
        self.row(headers, HEADER)
        if not rows:
            self.row([empty] + [""] * (len(self.widths) - 1), PLAIN, merge=True)
        for values in rows:
            self.row(values + [""] * (len(headers) - len(values)))

    def xml(self) -> str:
        cols = "".join(f'<col min="{i + 1}" max="{i + 1}" width="{w}" customWidth="1"/>' for i, w in enumerate(self.widths))
        body = []
        for r, cells in enumerate(self.rows, 1):
            out = []
            for c, (value, style) in enumerate(cells):
                ref = f"{_column(c)}{r}"
                if isinstance(value, bool) or value is None or value == "":
                    text = "" if value is None or value == "" else ("예" if value else "아니오")
                    out.append(f'<c r="{ref}" s="{style}" t="inlineStr"><is><t xml:space="preserve">{text}</t></is></c>')
                elif isinstance(value, (int, float)):
                    out.append(f'<c r="{ref}" s="{style}"><v>{value}</v></c>')
                else:
                    text = escape(_ILLEGAL.sub("", str(value))[:32000])
                    out.append(f'<c r="{ref}" s="{style}" t="inlineStr"><is><t xml:space="preserve">{text}</t></is></c>')
            body.append(f'<row r="{r}">{"".join(out)}</row>')
        merges = f'<mergeCells count="{len(self.merges)}">{"".join(f"<mergeCell ref=\"{m}\"/>" for m in self.merges)}</mergeCells>' if self.merges else ""
        return ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
                f"<cols>{cols}</cols><sheetData>{''.join(body)}</sheetData>{merges}"
                '<pageSetup orientation="landscape" paperSize="9" fitToHeight="0"/></worksheet>')


def workbook_bytes(sheets: list[Sheet]) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
                   + "".join(f'<Override PartName="/xl/worksheets/sheet{i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' for i in range(1, len(sheets) + 1)) + "</Types>")
        z.writestr("_rels/.rels", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>')
        z.writestr("xl/workbook.xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'
                   + "".join(f'<sheet name="{escape(s.name)}" sheetId="{i}" r:id="rId{i}"/>' for i, s in enumerate(sheets, 1)) + "</sheets></workbook>")
        z.writestr("xl/_rels/workbook.xml.rels", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                   + "".join(f'<Relationship Id="rId{i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet{i}.xml"/>' for i in range(1, len(sheets) + 1))
                   + f'<Relationship Id="rId{len(sheets) + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>')
        z.writestr("xl/styles.xml", _STYLES)
        for i, sheet in enumerate(sheets, 1):
            z.writestr(f"xl/worksheets/sheet{i}.xml", sheet.xml())
    return buffer.getvalue()


def _d(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _rows(value: Any) -> list[dict[str, Any]]:
    return [item for item in value if isinstance(item, dict)] if isinstance(value, list) else []


def _v(source: Any, key: str) -> Any:
    value = _d(source).get(key)
    return "" if value is None else value


def _approval_line(case: dict[str, Any], stage: str) -> str:
    sign = _d(_d(case.get("signOffHistory")).get(stage))
    champion = _d(sign.get("champion"))
    if sign.get("status") == "Approved" and champion.get("serverEventId"):
        return f"결재 완료 · Champion {champion.get('name', '')} · {champion.get('signedAt', '')} · 중앙 결재 기록 #{champion.get('serverEventId')}"
    if sign.get("status") in {"Submitted", "LeaderApproved"}:
        return f"결재 진행 중 ({sign.get('status')}) · 최종 승인 전 내용입니다"
    return "미결재 · 작성 중인 초안입니다"


def build_report_workbook(case: dict[str, Any], gate_key: str, exported_by: str) -> bytes:
    title, last = GATES[gate_key]
    gate = _d(_d(case.get("gates")).get(gate_key))
    dispatched = gate.get("status") == "Approved" and gate.get("dispatchedByQuality")
    status = "공식 송부 기록 완료" if dispatched else "내부 결재 완료 · 송부 전" if gate.get("internalApproved") else "DRAFT · 보고서 결재 전"
    s = Sheet("8D Report", [20, 26, 26, 22, 18, 18, 30])
    s.row([f"{title} — {case.get('id', '')}"], TITLE, merge=True)
    s.row([f"상태: {status}  |  출력: {now()} · {exported_by}  |  이 문서는 QMS에 기록된 내용을 그대로 옮긴 것입니다."], NOTE, merge=True)
    s.blank()
    s.pairs([("고객사", _v(case, "customer")), ("고객 담당", f"{_v(case, 'customerContact')} {_v(case, 'customerEmail')}".strip()),
             ("제품", _v(case, "product")), ("품번 (고객 / 사내)", f"{_v(case, 'partNumber')} / {_v(case, 'internalPartNumber')}".strip(" /")),
             ("LOT", _v(case, "lotNumber")), ("불량 현상", _v(case, "claimTitle")), ("발생 위치 / 일자", f"{_v(case, 'incidentSite')} / {_v(case, 'incidentDate')}".strip(" /")),
             ("불량 / 검사 수량", f"{_v(case, 'defectQty')} / {_v(case, 'inspectQty')}".strip(" /")), ("Case 상태", _v(case, "status"))])

    def section(stage: str, name: str) -> None:
        s.blank()
        s.row([f"{stage}. {name}"], SECTION, merge=True)
        s.row([_approval_line(case, stage)], NOTE, merge=True)

    section("D1", "CFT 구성")
    s.table(["역할", "성명", "부서", "연락처", "상태"], [[_v(m, "role"), _v(m, "name"), _v(m, "dept"), _v(m, "contact") or _v(m, "email"), CFT_STATUS_LABELS.get(_v(m, "status"), _v(m, "status"))] for m in _rows(case.get("team"))], "등록된 팀원 없음")

    d2 = _d(case.get("d2"))
    section("D2", "문제 정의")
    s.pairs([("What", _v(d2, "problemWhat")), ("Where", _v(d2, "problemWhere")), ("When", _v(d2, "problemWhen")), ("Who", _v(d2, "problemWho")),
             ("Which", _v(d2, "problemWhich")), ("How", _v(d2, "problemHow")), ("How many", _v(d2, "problemHowMany")), ("문제 기술", _v(d2, "problemStatement"))])
    s.table(["구분", "IS", "IS NOT", "차이", "사실 확인"], [[_v(r, "factor"), _v(r, "is"), _v(r, "isNot"), _v(r, "difference"), _v(r, "verificationStatus")] for r in _rows(d2.get("isIsNot"))], "등록된 비교 행 없음")

    d3 = _d(case.get("d3"))
    section("D3", "임시 봉쇄조치")
    scope = _d(d3.get("lotScope"))
    s.pairs([("영향 LOT", _v(scope, "affectedLot")), ("인접 LOT", _v(scope, "adjacentLots")), ("원자재 Batch", _v(scope, "rawMaterialBatch")), ("설비", _v(scope, "equipment")), ("범위 근거", _v(scope, "rationale"))])
    s.table(["구역", "LOT", "총 수량", "Hold", "선별", "NG", "상태 / Evidence"], [[_v(r, "area"), _v(r, "lot"), _v(r, "totalQty"), _v(r, "holdQty"), _v(r, "screenQty"), _v(r, "ngQty"), f"{_v(r, 'status')} / {_v(r, 'evidence')}".strip(" /")] for r in _rows(d3.get("materialFlow"))], "등록된 재고 흐름 없음")
    s.table(["조치 ID", "대상", "조치 내용", "담당자", "기한", "상태", "결과"], [[_v(r, "id"), _v(r, "target"), _v(r, "action"), _v(r, "owner"), _v(r, "due"), _v(r, "status"), _v(r, "result")] for r in _rows(d3.get("actions"))], "등록된 봉쇄조치 없음")
    s.pairs([("봉쇄 효과성", _v(d3, "effectivenessStatement"))])
    if last >= 5:
        d4 = _d(case.get("d4"))
        section("D4", "근본원인 분석")
        s.table(["분석 도구", "가설", "Evidence", "결과", "담당자", "상태", "사실 확인"], [[_v(r, "id"), _v(r, "hypothesis"), _v(r, "evidence"), _v(r, "finding"), _v(r, "owner"), _v(r, "status"), bool(r.get("verified"))] for r in _rows(d4.get("selectedTools"))], "적용된 분석 도구 없음")
        roots = _d(d4.get("rootCauses"))
        s.table(["원인 구분", "원인", "입증 Evidence", "반대 Evidence", "검증 방법·결과", "판정"], [[key, _v(roots.get(key), "statement"), _v(roots.get(key), "evidence"), _v(roots.get(key), "contraryEvidence"), _v(roots.get(key), "validationMethod"), _v(roots.get(key), "status")] for key in ("Occurrence", "Escape", "System")], "")
        d5 = _d(case.get("d5"))
        section("D5", "영구 시정조치 선정")
        s.table(["대책 ID", "원인 구분", "대책 내용 / 근거", "담당자", "목표일", "선정", "Evidence"], [[_v(r, "id"), _v(r, "causeType"), f"{_v(r, 'title')}\n{_v(r, 'rationale')}".strip(), _v(r, "owner"), _v(r, "due"), bool(r.get("selected")), _v(r, "evidence")] for r in _rows(d5.get("candidates"))], "등록된 대책 후보 없음")
        pcn = _d(d5.get("pcnEcn"))
        required = pcn.get("pcnRequired")
        s.pairs([("ECN 번호", _v(pcn, "ecnNumber")), ("PCN 필요 여부", "필요" if required is True else "불필요" if required is False else "미확인"), ("고객 승인 상태", _v(pcn, "customerApprovalStatus")), ("변경 승인 근거", _v(pcn, "evidence"))])
    if last >= 8:
        d6 = _d(case.get("d6"))
        section("D6", "대책 적용 및 효과 검증")
        impl, compare, release = _d(d6.get("implementationDetails")), _d(d6.get("beforeAfter")), _d(d6.get("containmentRelease"))
        s.pairs([("적용 LOT", _v(impl, "appliedLot")), ("적용일 / 장소", f"{_v(impl, 'startDate')} / {_v(impl, 'productionSite')}".strip(" /")), ("적용 증거", _v(impl, "evidence")),
                 ("개선 전", _v(compare, "beforeMetric")), ("개선 후", _v(compare, "afterMetric")), ("비교 근거", _v(compare, "evidence")),
                 ("봉쇄 해제 결정", _v(release, "decision")), ("해제 / 유지 근거", f"{_v(release, 'rationale')} {_v(release, 'evidence')}".strip())])
        s.table(["시험 ID / 대책", "시험명 / 조건", "합격 기준", "표본 수", "불량 수", "판정", "담당 / 시험일 / Evidence"], [[f"{_v(r, 'id')} / {_v(r, 'actionId')}", f"{_v(r, 'testName')}\n{_v(r, 'condition')}".strip(), _v(r, "acceptanceCriteria"), _v(r, "sampleSize"), _v(r, "failQty"), _v(r, "result") or "Pending", f"{_v(r, 'owner')} / {_v(r, 'completedAt')} / {_v(r, 'evidence')}".strip(" /")] for r in _rows(d6.get("validationTests"))], "등록된 검증 시험 없음")
        d7 = _d(case.get("d7"))
        section("D7", "재발방지 및 수평전개")
        s.table(["개정 ID / 대책", "문서명 / 번호", "Rev", "변경 내용", "담당자 / 목표일", "상태", "Evidence"], [[f"{_v(r, 'id')} / {_v(r, 'actionId')}", f"{_v(r, 'docName')} {_v(r, 'docNo')}".strip(), _v(r, "rev"), _v(r, "changeContent"), f"{_v(r, 'owner')} / {_v(r, 'due')}".strip(" /"), _v(r, "status"), _v(r, "evidence")] for r in _rows(d7.get("systemUpdates"))], "등록된 표준 개정 없음")
        s.table(["전개 ID / 대책", "제품 / 공정", "동일 위험 평가", "전개 조치", "담당자", "상태", "Evidence"], [[f"{_v(r, 'id')} / {_v(r, 'actionId')}", _v(r, "product"), _v(r, "sameRisk"), _v(r, "action"), _v(r, "owner"), _v(r, "status"), _v(r, "evidence")] for r in _rows(d7.get("horizontalDeployment"))], "등록된 수평전개 없음")
        d8 = _d(case.get("d8"))
        section("D8", "종결 및 팀 인정")
        s.table(["구분", "점검 항목", "종결 근거", "확인"], [[_v(r, "cat"), _v(r, "item"), _v(r, "evidence"), bool(r.get("checked"))] for r in _rows(d8.get("checklist"))], "등록된 점검 항목 없음")
        closure = _d(d8.get("closure"))
        s.pairs([("잔여 위험", _v(closure, "remainingRisk")), ("고객 수락 / 종결 요건", _v(closure, "customerAcceptance")), ("종결 증거", _v(closure, "evidence")), ("팀 기여 및 인정", _v(d8, "teamAppreciation"))])

    stages = [f"D{i}" for i in range(1, last + 1)]
    e = Sheet("Evidence", [26, 34, 18, 16, 14, 66, 28, 22])
    e.row([f"Evidence 목록 — {case.get('id', '')} · {title} 범위"], TITLE, merge=True)
    e.table(["Evidence ID", "파일 / 제목", "유형", "연결 단계", "크기(bytes)", "SHA-256", "등록자", "등록 일시"],
            [[_v(r, "id"), _v(r, "file") or _v(r, "title"), _v(r, "type"), ", ".join(r.get("linkedStages") or []), _v(r, "sizeBytes"), _v(r, "sha256"), _v(r, "uploadedBy"), _v(r, "uploadedAt")]
             for r in _rows(case.get("evidenceList")) if not r.get("linkedStages") or set(r.get("linkedStages")) & set(stages)], "등록된 Evidence 없음")

    a = Sheet("결재 이력", [14, 18, 24, 30, 26, 16, 40])
    a.row([f"결재 이력 — {case.get('id', '')}"], TITLE, merge=True)
    rows = []
    history = _d(case.get("signOffHistory"))
    for stage in stages:
        sign = _d(history.get(stage))
        for role in ("drafter", "leader", "champion"):
            signer = _d(sign.get(role))
            if signer:
                rows.append([stage, role, _v(signer, "name"), _v(signer, "email"), _v(signer, "signedAt"), _v(signer, "serverEventId"), _v(signer, "comment")])
    a.table(["단계", "역할", "결재자", "계정", "결재 일시", "중앙 기록 번호", "의견"], rows, "기록된 단계 결재 없음")
    a.blank()
    a.table(["보고서", "역할", "결재자", "계정", "결재 일시", "중앙 기록 번호", "의견"],
            [[title, _v(p, "role"), _v(p, "name"), _v(p, "email"), _v(p, "date"), _v(p, "serverEventId"), _v(p, "comment")] for p in _rows(gate.get("approvers")) if p.get("status") == "Approved"], "기록된 보고서 결재 없음")
    return workbook_bytes([s, e, a])


class ReportExportMixin:
    def export_case_report(self, identity, case_id: str, gate_key: str) -> dict[str, Any]:
        self._internal_permission(identity, read=True)
        if gate_key not in GATES:
            fail(400, "보고서 종류(gate3D, gate5D, gate8D)를 지정하세요.", "INVALID_REPORT")
        with self._connect() as db:
            row = db.execute("SELECT revision, state_json FROM state_store WHERE id=1").fetchone()
        case = next((c for c in (json.loads(row["state_json"]).get("cases", []) if row else []) if isinstance(c, dict) and c.get("id") == case_id), None)
        if case is None:
            fail(404, "중앙에 저장된 Case를 찾을 수 없습니다.", "CASE_NOT_FOUND")
        content = build_report_workbook(case, gate_key, f"{identity.user.get('name', '')} ({identity.user.get('username', '')})")
        with self._lock, self._connect() as db:
            self._audit(db, identity.user["id"], identity.user["username"], "REPORT_EXPORTED", "case_report", f"{case_id}:{gate_key}",
                        details={"format": "xlsx", "caseRevision": row["revision"], "bytes": len(content), "externalSend": False})
        safe_id = re.sub(r"[^A-Za-z0-9._-]", "_", case_id)
        return {"filename": f"{safe_id}_{GATES[gate_key][0].replace(' ', '_')}.xlsx", "content": content}
