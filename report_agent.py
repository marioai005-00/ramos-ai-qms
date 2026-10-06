"""8D report agent.

One request in plain language starts a run. The agent works out which Case is meant, plans which tools to use,
collects the saved record and the stored evidence files by itself, calculates and checks them, and writes the
8D report on the company slide format. Every step is logged so the screen can show the run while it happens.

What it never does: write values, verdicts or approvals into the Case. It only reads. Summary sentences come from
an external AI and are marked as a draft; a sentence holding a number that is not in the record is thrown away.
"""
from __future__ import annotations

import hashlib
import io
import json
import re
import threading
import time
import zipfile
from datetime import datetime
from email import policy
from email.parser import BytesParser
from typing import Any, Callable

import closure_advisor
import validation_stats
from closure_advisor import CAUSES, KST, STAGES, parse_time
from internal_quality import fail, now
from tool_advisor import _dict, _rows, _text
from validation_advisor import _xlsx_text

ENGINE = "report-agent-v1"
# key: (log tag, title, what it does, always needed)
TOOLS = {
    "load_record": ("스스로 수집", "Case 기록 조회", "중앙 저장소에서 D1~D8 기록과 결재 이력을 읽는다", True),
    "open_evidence": ("스스로 수집", "근거 원본 열기", "보관된 근거 파일을 열어 변조 여부를 확인하고 Excel·메일·문서의 글자를 읽어 기록과 대조한다", False),
    "similar_cases": ("스스로 수집", "유사 과거 Case 조회", "종결된 과거 Case 중 비슷한 건을 찾는다", False),
    "calculate": ("처리", "집계·계산", "불량률, 신뢰 상한, 봉쇄 수량, 처리 기간을 공식으로 계산한다", True),
    "rule_check": ("판단", "기록 점검", "빠진 연결, 날짜 순서, 근거 누락을 규칙으로 찾는다", True),
    "ai_review": ("판단", "AI 일관성 검토", "외부 AI가 단계 사이에 서로 맞지 않는 기록을 찾는다", False),
    "write_summary": ("결과 생성", "요약 초안 작성", "외부 AI가 기록만으로 요약 초안을 쓰고, 에이전트가 숫자를 기록과 대조한다", False),
    "build_report": ("결과 생성", "보고서 작성", "사내 발표 양식에 맞춰 8D 보고서 PPT를 만든다", True),
}
NOT_DONE = ["Case 기록을 고치지 않았습니다 (읽기만 함).", "측정값·수량·합격 판정을 만들지 않았습니다.", "결재·승인을 기록하지 않았습니다.", "고객·외주사에 보내지 않았습니다."]
RULES = """반드시 지킬 것:
1. 입력에 있는 내용만 근거로 씁니다. 없는 Case, 수량, 날짜를 만들어 내지 않습니다.
2. 모든 설명은 한국어로 씁니다.
3. JSON 객체 하나만 출력합니다. 설명 문장이나 코드 블록 표시를 붙이지 않습니다."""
PLAN_PROMPT = "당신은 품질 시스템의 8D 보고서 에이전트입니다.\n역할은 사용자의 요청 한 문장을 읽고, 어느 Case의 보고서인지 고르고, 쓸 도구를 정하는 것입니다.\n\n" + RULES
SUMMARY_PROMPT = "당신은 8D 보고서의 첫 장 요약을 쓰는 품질 담당자입니다.\n역할은 기록된 내용만으로 임원이 1분 안에 읽을 요약 초안을 쓰는 것입니다.\n\n" + RULES


class Stop(Exception):
    """The run cannot go on without the person (unknown Case, or a request this agent does not handle)."""


def _short(text: str, limit: int) -> str:
    return text if len(text) <= limit else text[:limit - 1].rstrip() + "…"


def _plain(text: str) -> str:
    return re.sub(r"[\s,]", "", text)


def numbers_in(text: str) -> set[str]:
    """Figures a reader would take as facts: two or more digits, or a decimal. Stage names like D8 are left out."""
    return {m.replace(",", "") for m in re.findall(r"(?<![A-Za-z\d])\d[\d,]*(?:\.\d+)?", text) if len(re.sub(r"\D", "", m)) >= 2}


def evidence_text(name: str, mime: str, content: bytes) -> tuple[str, str]:
    """Returns (kind, text). PDF and images are opened and hashed but their content is not read here."""
    suffix = name.lower().rsplit(".", 1)[-1] if "." in name else ""
    try:
        if suffix == "xlsx":
            return "Excel", _xlsx_text(content)
        if suffix == "docx":
            with zipfile.ZipFile(io.BytesIO(content)) as archive:
                return "문서", re.sub(r"<[^>]+>", " ", archive.read("word/document.xml").decode("utf-8", "replace"))
        if suffix == "eml" or mime == "message/rfc822":
            message = BytesParser(policy=policy.default).parsebytes(content)
            body = message.get_body(preferencelist=("plain", "html"))
            return "메일", f"{message.get('subject', '')}\n{body.get_content() if body else ''}"
        if suffix in {"txt", "csv", "log"} or mime.startswith("text/"):
            return "텍스트", content.decode("utf-8", "replace")
    except Exception:  # a damaged file is reported as unread, never as read
        return "읽지 못함", ""
    return {"pdf": "PDF"}.get(suffix, "이미지" if mime.startswith("image/") else "기타"), ""


def referenced_files(case: dict) -> set[str]:
    """File names the record points at in its free-text evidence fields (names without spaces)."""
    found: set[str] = set()
    def walk(value: Any, key: str = "") -> None:
        if isinstance(value, dict):
            for k, v in value.items():
                if k not in {"reportHtml", "evidenceList", "snapshot"}:
                    walk(v, k)
        elif isinstance(value, list):
            for item in value:
                walk(item, key)
        elif isinstance(value, str) and "evidence" in key.lower():
            found.update(re.findall(r"[^\s;,/()]+\.(?:xlsx|pdf|docx|eml|png|jpg|txt|csv)", value))
    walk(case)
    return found


def find_case_by_rule(request: str, cases: list[dict], context_id: str) -> tuple[dict | None, list[dict], str]:
    """Exact Case number first, then 'this Case', then word overlap with customer, product, symptom and Lot."""
    for case in cases:
        if _text(case.get("id")) and _text(case.get("id")).upper() in request.upper():
            return case, [], "요청에 Case 번호가 있음"
    current = next((c for c in cases if c.get("id") == context_id), None)
    if current and re.search(r"이\s*(case|케이스|건)|현재|지금\s*(보는|열린)", request, re.I):
        return current, [], "화면에 열려 있는 Case"
    words = [w for w in re.findall(r"[0-9A-Za-z가-힣\-]{2,}", request) if w not in {"보고서", "리포트", "작성", "작성해줘", "만들어줘", "만들어", "해줘", "8D", "Case", "case"}]
    scored = []
    for case in cases:
        haystack = " ".join(_text(case.get(k), 400) for k in ("customer", "product", "claimTitle", "lotNumber", "partNumber")).lower()
        score = sum(1 for w in words if w.lower() in haystack)
        if score:
            scored.append((score, case))
    scored.sort(key=lambda item: -item[0])
    if scored and (len(scored) == 1 or scored[0][0] > scored[1][0]):
        return scored[0][1], [], "고객·제품·현상 단어가 일치"
    if not scored and len(cases) == 1 and not words:
        return cases[0], [], "등록된 Case가 하나뿐임"
    return None, [c for _, c in scored[:5]] or cases[:5], ""


def build_plan_prompt(request: str, cases: list[dict], context_id: str) -> str:
    listing = [{"id": c.get("id"), "고객": _text(c.get("customer")), "제품": _text(c.get("product")), "불량 현상": _text(c.get("claimTitle"), 120), "Lot": _text(c.get("lotNumber")),
                "상태": _text(c.get("status")), "접수": _text(c.get("receiptDate"))} for c in cases[:60]]
    return f"""[사용자 요청]
{request}

[지금 화면에 열려 있는 Case]
{context_id or "없음"}

[등록된 Case 목록]
{json.dumps(listing, ensure_ascii=False, indent=1)}

[쓸 수 있는 도구]
{json.dumps({key: f"{title} — {does}" + (" (항상 실행)" if always else "") for key, (_, title, does, always) in TOOLS.items()}, ensure_ascii=False, indent=1)}

[출력 형식 — 이 JSON 객체 하나만]
{{"intent": "8D 보고서 작성 요청이면 report, 아니면 other",
  "caseId": "목록에 있는 id 중 요청이 가리키는 것 하나. 고를 수 없으면 빈 문자열",
  "caseReason": "그 Case를 고른 이유 한 문장",
  "tools": ["이번 요청에 쓸 도구 key를 순서대로"],
  "planReason": "그 도구들을 고른 이유 한 문장",
  "focus": "요청이 '간단히', 'D6 중심으로'처럼 따로 강조한 것이 있을 때만 그 말. 없으면 빈 문자열"}}

[규칙]
- 후보가 둘 이상이고 요청만으로 가릴 수 없으면 caseId를 비웁니다. 짐작으로 고르지 않습니다.
- 줄여 달라는 말이 없으면 도구를 모두 씁니다.
- '간단히', '빠르게', '요약만'처럼 줄여 달라는 요청이면 (항상 실행) 도구에 꼭 필요한 것만 더합니다. 근거 원본 열기, 유사 과거 Case 조회, AI 일관성 검토는 뺄 수 있습니다."""


def parse_plan(text: str) -> dict:
    data = closure_advisor._json_reply(text)
    tools = [t for t in data.get("tools", []) if isinstance(t, str) and t in TOOLS] if isinstance(data.get("tools"), list) else []
    if data.get("intent") not in {"report", "other"}:
        raise ValueError("AI 응답에 요청 해석이 없습니다.")
    return {"intent": data["intent"], "caseId": _text(data.get("caseId")), "caseReason": _text(data.get("caseReason"), 200), "tools": tools,
            "planReason": _text(data.get("planReason"), 200), "focus": _text(data.get("focus"), 120)}


def build_summary_prompt(case: dict, calc_lines: list[str], focus: str, rejected: list[str]) -> str:
    return f"""아래 8D Case 기록과 계산 결과만으로 보고서 첫 장의 요약 초안을 쓰세요.

[Case 기록]
{json.dumps(closure_advisor.case_record(case), ensure_ascii=False, indent=1)}

[에이전트가 공식으로 계산한 값]
{json.dumps(calc_lines, ensure_ascii=False)}

[요청이 강조한 것]
{focus or "없음"}
{"[주의] 앞선 초안의 다음 숫자는 기록에 없어 버렸습니다. 쓰지 마세요: " + ", ".join(rejected) if rejected else ""}

[출력 형식 — 이 JSON 객체 하나만]
{{"headline": "무슨 문제였고 어떻게 끝났는지(또는 지금 어디까지 왔는지) 한 문장",
  "points": ["현상: ...", "원인: ...", "대책: ...", "검증: ...", "재발방지: ..."]}}

[규칙]
- points는 기록이 있는 항목만, 항목마다 한 문장으로 씁니다. 기록이 없는 단계는 빼고 지어내지 않습니다.
- 숫자는 기록이나 계산 결과에 있는 것만 그대로 씁니다."""


def parse_summary(text: str) -> dict:
    data = closure_advisor._json_reply(text)
    points = [_text(p, 220) for p in data.get("points", []) if isinstance(p, str) and _text(p)][:5] if isinstance(data.get("points"), list) else []
    headline = _text(data.get("headline"), 200)
    if not headline or not points:
        raise ValueError("AI 응답에 요약이 없습니다.")
    return {"headline": headline, "points": points}


class ReportAgent:
    """ask_ai(prompt, system_prompt, parse) -> (provider, parsed) is the server's validated external-AI call."""

    def __init__(self, store, ask_ai: Callable[[str, str, Callable[[str], Any]], tuple[dict, Any]]):
        self.store, self.ask_ai = store, ask_ai
        with store._connect() as db:
            db.execute("""CREATE TABLE IF NOT EXISTS report_agent_runs (
                id INTEGER PRIMARY KEY AUTOINCREMENT, request_text TEXT NOT NULL, context_case_id TEXT NOT NULL DEFAULT '', case_id TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL, steps_json TEXT NOT NULL DEFAULT '[]', result_json TEXT NOT NULL DEFAULT '{}', file_name TEXT, file_content BLOB,
                requested_by INTEGER NOT NULL, requested_by_name TEXT NOT NULL, created_at TEXT NOT NULL, finished_at TEXT)""")
            # A run that was still going when the server stopped can never finish.
            db.execute("UPDATE report_agent_runs SET status='FAILED', finished_at=? WHERE status='RUNNING'", (now(),))

    # ---- public API
    def start(self, identity, payload: Any, *, background: bool = True) -> dict:
        self.store._internal_permission(identity, read=True)
        payload = payload if isinstance(payload, dict) else {}
        request = _text(payload.get("requestText"), 400)
        if len(request) < 2:
            fail(400, "에이전트에게 맡길 일을 한 문장으로 적어 주세요.", "INVALID_AGENT_REQUEST")
        context_id = _text(payload.get("caseId"), 80)
        with self.store._lock, self.store._connect() as db:
            run_id = db.execute("INSERT INTO report_agent_runs(request_text,context_case_id,status,requested_by,requested_by_name,created_at) VALUES(?,?,?,?,?,?)",
                                (request, context_id, "RUNNING", identity.user["id"], _text(identity.user.get("name")) or identity.user["username"], now())).lastrowid
            self.store._audit(db, identity.user["id"], identity.user["username"], "REPORT_AGENT_STARTED", "report_agent_run", str(run_id), details={"request": request, "contextCaseId": context_id})
        if background:
            threading.Thread(target=self._run, args=(run_id, identity, request, context_id), daemon=True, name=f"report-agent-{run_id}").start()
        else:
            self._run(run_id, identity, request, context_id)
        return self.get(identity, run_id)

    def get(self, identity, run_id: int) -> dict:
        self.store._internal_permission(identity, read=True)
        with self.store._connect() as db:
            row = db.execute("SELECT id,request_text,case_id,status,steps_json,result_json,file_name,requested_by_name,created_at,finished_at FROM report_agent_runs WHERE id=?", (run_id,)).fetchone()
        if row is None:
            fail(404, "에이전트 실행 기록을 찾을 수 없습니다.", "AGENT_RUN_NOT_FOUND")
        return self._serialize(row, steps=True)

    def list(self, identity, limit: int = 15) -> list[dict]:
        self.store._internal_permission(identity, read=True)
        with self.store._connect() as db:
            rows = db.execute("SELECT id,request_text,case_id,status,result_json,file_name,requested_by_name,created_at,finished_at FROM report_agent_runs ORDER BY id DESC LIMIT ?",
                              (min(max(int(limit), 1), 50),)).fetchall()
        return [self._serialize(row, steps=False) for row in rows]

    def file(self, identity, run_id: int) -> dict:
        self.store._internal_permission(identity, read=True)
        with self.store._connect() as db:
            row = db.execute("SELECT file_name, file_content FROM report_agent_runs WHERE id=? AND file_content IS NOT NULL", (run_id,)).fetchone()
        if row is None:
            fail(404, "이 실행에는 만들어진 보고서가 없습니다.", "AGENT_FILE_NOT_FOUND")
        return {"filename": row["file_name"], "content": row["file_content"]}

    @staticmethod
    def _serialize(row, *, steps: bool) -> dict:
        run = {"id": row["id"], "requestText": row["request_text"], "caseId": row["case_id"], "status": row["status"], "result": json.loads(row["result_json"]),
               "fileName": row["file_name"] or "", "requestedBy": row["requested_by_name"], "createdAt": row["created_at"], "finishedAt": row["finished_at"] or ""}
        if steps:
            run["steps"] = json.loads(row["steps_json"])
        return run

    # ---- the run
    def _save(self, run_id: int, steps: list[dict], **columns: Any) -> None:
        sets = "steps_json=?" + "".join(f",{name}=?" for name in columns)
        with self.store._lock, self.store._connect() as db:
            db.execute(f"UPDATE report_agent_runs SET {sets} WHERE id=?", (json.dumps(steps, ensure_ascii=False), *columns.values(), run_id))

    def _run(self, run_id: int, identity, request: str, context_id: str) -> None:
        started, steps, ai_calls = time.monotonic(), [], []

        def step(tag: str, title: str, work: Callable[[list[str]], Any]) -> Any:
            entry = {"n": len(steps) + 1, "tag": tag, "title": title, "status": "running", "lines": [], "ms": 0, "at": round(time.monotonic() - started, 1)}
            steps.append(entry)
            self._save(run_id, steps)
            begun = time.monotonic()
            try:
                value = work(entry["lines"])
                entry["status"] = "warn" if any(line.startswith("⚠") for line in entry["lines"]) else "done"
                return value
            except Stop:
                entry["status"] = "ask"
                raise
            except Exception:
                entry["status"] = "failed"
                raise
            finally:
                entry["ms"] = int((time.monotonic() - begun) * 1000)
                self._save(run_id, steps)

        def ai(prompt: str, system: str, parse: Callable[[str], Any]) -> Any:
            provider, value = self.ask_ai(prompt, system, parse)
            ai_calls.append({"provider": provider.get("engine"), "model": provider.get("model")})
            return value

        def finish(status: str, case_id: str, result: dict, **columns: Any) -> None:
            result = {**result, "elapsedMs": int((time.monotonic() - started) * 1000), "aiCalls": ai_calls, "notDone": NOT_DONE}
            self._save(run_id, steps, status=status, case_id=case_id, result_json=json.dumps(result, ensure_ascii=False), finished_at=now(), **columns)
            with self.store._lock, self.store._connect() as db:
                self.store._audit(db, identity.user["id"], identity.user["username"], "REPORT_AGENT_FINISHED", "report_agent_run", str(run_id),
                                  details={"status": status, "caseId": case_id, "externalAI": bool(ai_calls), "aiCalls": ai_calls, "file": columns.get("file_name", "")})

        case_id = ""
        try:
            cases = [c for c in (self.store.get_state() or {"state": {}})["state"].get("cases", []) if isinstance(c, dict) and c.get("id")]
            case, plan = step("의도 분석", "요청 접수 — 무슨 일이고 어느 Case인지 파악", lambda lines: self._understand(request, cases, context_id, ai, lines))
            case_id = case["id"]
            tools = step("계획 수립", "필요한 자료와 도구 정하기", lambda lines: self._plan(plan, lines))
            ctx: dict[str, Any] = {"case": case, "focus": plan.get("focus", ""), "checks": [], "evidence": {"perStage": self._per_stage(case), "lines": []}, "calc": {}, "summary": None}
            work = {"load_record": self._load_record, "open_evidence": self._open_evidence, "similar_cases": lambda c, lines: self._similar(identity, c, lines), "calculate": self._calculate,
                    "rule_check": self._rule_check, "ai_review": lambda c, lines: self._ai_review(c, ai, lines), "write_summary": lambda c, lines: self._write_summary(c, ai, lines)}
            for key in tools[:-1]:
                tag, title, _, _ = TOOLS[key]
                step(tag, title, lambda lines, key=key: work[key](ctx, lines))
            meta = {"requestedBy": _text(identity.user.get("name")) or identity.user["username"], "testData": "검증용" in json.dumps(case, ensure_ascii=False)}
            if meta["testData"]:
                ctx["checks"].append({"level": "info", "source": "규칙", "stage": "", "text": "기록에 '[검증용]' 표시가 있습니다. 실제 고객 건이 아닌 검증용 자료로 만든 보고서입니다."})
            content, slides, name = step("결과 생성", "사내 발표 양식에 맞춰 8D 보고서 작성", lambda lines: self._build(ctx, meta, lines))
            finish("COMPLETED", case_id, {"slides": slides, "sizeBytes": len(content), "checks": ctx["checks"], "summary": ctx["summary"], "tools": tools,
                                          "case": {"id": case_id, "customer": _text(case.get("customer")), "product": _text(case.get("product")), "claimTitle": _text(case.get("claimTitle"), 200)}},
                   file_name=name, file_content=content)
        except Stop as stop:
            finish("NEEDS_INPUT", case_id, {"message": str(stop), "candidates": getattr(stop, "candidates", [])})
        except Exception as error:
            message = getattr(error, "message", None) or str(error)
            if steps and steps[-1]["status"] == "failed":
                steps[-1]["lines"].append(f"✖ {message}")
            finish("FAILED", case_id, {"message": message})

    # ---- steps
    def _understand(self, request: str, cases: list[dict], context_id: str, ai, lines: list[str]) -> tuple[dict, dict]:
        lines.append(f"요청: “{request}”")
        if not cases:
            raise Stop("등록된 Case가 없습니다. 고객 부적합을 접수해 Case가 만들어진 뒤 요청해 주세요.")
        asks_report = bool(re.search(r"보고서|리포트|report", request, re.I))
        plan: dict = {"intent": "report" if asks_report else "other", "caseId": "", "tools": [], "focus": "", "byAi": False}
        try:
            plan = {**ai(build_plan_prompt(request, cases, context_id), PLAN_PROMPT, parse_plan), "byAi": True}
        except Exception as error:  # the agent still works by rule when no external AI answers
            lines.append(f"⚠ 외부 AI 해석을 받지 못해 규칙으로 해석합니다. ({_text(getattr(error, 'message', None) or str(error), 120)})")
        if plan["intent"] != "report" and not asks_report:
            raise Stop("이 에이전트는 8D 보고서 작성을 맡습니다. 예: “(고객·제품·현상) 건 8D 보고서 작성해줘”")
        lines.append("할 일: 8D 보고서 작성" + (f" · 강조: {plan['focus']}" if plan.get("focus") else ""))
        by_rule, candidates, why = find_case_by_rule(request, cases, context_id)
        chosen = by_rule if by_rule and why == "요청에 Case 번호가 있음" else next((c for c in cases if c.get("id") == plan.get("caseId")), None) or by_rule
        if chosen is None:
            stop = Stop("어느 Case인지 요청만으로 정할 수 없습니다. 아래에서 고르거나 고객·제품·현상을 더 적어 주세요.")
            stop.candidates = [{"id": c.get("id"), "customer": _text(c.get("customer")), "product": _text(c.get("product")), "claimTitle": _text(c.get("claimTitle"), 120), "status": _text(c.get("status"))} for c in candidates]
            raise stop
        reason = plan.get("caseReason") if plan.get("byAi") and chosen.get("id") == plan.get("caseId") else why
        lines.append(f"대상: {chosen['id']} · {_text(chosen.get('customer'))} · {_text(chosen.get('claimTitle'), 80)}")
        lines.append(f"고른 이유: {reason} · Case {len(cases)}건 중에서 선택" + (" (AI)" if plan.get("byAi") and chosen.get("id") == plan.get("caseId") else " (규칙)"))
        return chosen, plan

    @staticmethod
    def _plan(plan: dict, lines: list[str]) -> list[str]:
        asked = plan.get("tools") or [key for key in TOOLS]
        tools = [key for key, (_, _, _, always) in TOOLS.items() if always or key in asked]
        added = [TOOLS[key][1] for key in tools if key not in asked]
        lines.append(("AI가 고른 도구" if plan.get("byAi") and plan.get("tools") else "기본 계획") + f" {len(tools)}개: " + " → ".join(TOOLS[key][1] for key in tools))
        if plan.get("planReason"):
            lines.append(f"이유: {plan['planReason']}")
        if added:
            lines.append("에이전트가 더한 필수 도구: " + ", ".join(added))
        skipped = [TOOLS[key][1] for key in TOOLS if key not in tools]
        if skipped:
            lines.append("이번에 쓰지 않는 도구: " + ", ".join(skipped))
        return tools

    @staticmethod
    def _per_stage(case: dict) -> dict[str, list[str]]:
        return {stage: [_text(e.get("file") or e.get("title")) for e in _rows(case.get("evidenceList")) if stage in (e.get("linkedStages") or [])] for stage in STAGES}

    @staticmethod
    def _load_record(ctx: dict, lines: list[str]) -> None:
        case = ctx["case"]
        approved = [s for s in STAGES if closure_advisor._approved(case, s)]
        d3, d4, d5, d6 = (_dict(case.get(k)) for k in ("d3", "d4", "d5", "d6"))
        lines.append(f"D1~D8 기록 조회 · 상태 {_text(case.get('status')) or '-'} · 결재 완료 {len(approved)}/8 단계")
        lines.append(f"팀 {len(_rows(case.get('team')))}명 · 봉쇄조치 {len(_rows(d3.get('actions')))}건 · 확정 원인 "
                     f"{sum(1 for r in _dict(d4.get('rootCauses')).values() if _dict(r).get('status') == 'Confirmed')}건 · 선정 대책 "
                     f"{sum(1 for r in _rows(d5.get('candidates')) if r.get('selected') is True)}건 · 검증 시험 {len(_rows(d6.get('validationTests')))}건")
        lines.append(f"결재 서명 {sum(1 for s in STAGES for role in ('drafter', 'leader', 'champion') if _dict(_dict(_dict(case.get('signOffHistory')).get(s)).get(role)).get('signedAt'))}건 · 연결된 근거 {len(_rows(case.get('evidenceList')))}건")

    def _open_evidence(self, ctx: dict, lines: list[str]) -> None:
        case = ctx["case"]
        listed = _rows(case.get("evidenceList"))
        with self.store._connect() as db:
            stored = {row["evidence_id"]: row for row in db.execute(
                "SELECT m.evidence_id, m.original_name, m.mime_type, m.sha256, f.content FROM evidence_metadata m JOIN evidence_files f USING(evidence_id) WHERE m.case_id=?", (case["id"],))}
        kinds: dict[str, int] = {}
        texts, missing, tampered = [], [], []
        for item in listed:
            row = stored.get(item.get("serverFileId") or item.get("id"))
            name = _text(item.get("file") or item.get("title"))
            if row is None:
                missing.append(name)
                continue
            if hashlib.sha256(row["content"]).hexdigest() != row["sha256"] or (item.get("sha256") and item["sha256"] != row["sha256"]):
                tampered.append(name)
            kind, text = evidence_text(row["original_name"], row["mime_type"], row["content"])
            kinds[kind] = kinds.get(kind, 0) + 1
            if text:
                texts.append((row["original_name"], _plain(text)))
        opened = len(listed) - len(missing)
        read = sum(n for kind, n in kinds.items() if kind in {"Excel", "문서", "메일", "텍스트"})
        lines.append(f"근거 {len(listed)}건 중 원본 {opened}건 열람 · 저장 당시 해시와 일치 {opened - len(tampered)}건")
        lines.append("내용까지 읽음 " + (", ".join(f"{k} {n}" for k, n in kinds.items() if k in {"Excel", "문서", "메일", "텍스트"}) or "0건")
                     + " · 열람만 " + (", ".join(f"{k} {n}" for k, n in kinds.items() if k not in {"Excel", "문서", "메일", "텍스트"}) or "0건"))
        summary = [f"원본 {opened}건을 열어 저장 당시 해시와 대조: 일치 {opened - len(tampered)}건, 불일치 {len(tampered)}건", f"내용을 읽은 파일 {read}건 (Excel·메일·문서·텍스트) · PDF·이미지는 열람과 해시 확인까지"]
        for label, value in (("Lot", _text(case.get("lotNumber"))), ("품번", _text(case.get("partNumber")))):
            if value and texts:
                hits = sum(1 for _, text in texts if _plain(value) in text)
                lines.append(f"기록의 {label} {value} → 읽은 파일 {read}건 중 {hits}건에서 확인")
                summary.append(f"{label} {value}: 읽은 파일 {hits}건에서 확인")
                if not hits:
                    ctx["checks"].append({"level": "warn", "source": "규칙", "stage": "D2", "text": f"기록의 {label}({value})가 내용을 읽은 근거 파일 어디에도 없습니다. 근거 파일과 기록을 대조해 주세요."})
        names = {_text(e.get("file") or e.get("title")) for e in listed}
        dangling = sorted(f for f in referenced_files(case) if f not in names)
        if missing:
            lines.append(f"⚠ 중앙 보관소에 원본이 없는 근거 {len(missing)}건: {', '.join(missing[:3])}{' 외' if len(missing) > 3 else ''}")
            ctx["checks"].append({"level": "warn", "source": "규칙", "stage": "", "text": f"중앙 보관소에 원본이 없는 근거 {len(missing)}건 ({', '.join(missing[:4])}{' 외' if len(missing) > 4 else ''}). 원본을 다시 올려야 보고서 근거로 쓸 수 있습니다."})
            summary.append(f"중앙 보관소에 원본이 없는 근거 {len(missing)}건")
        if tampered:
            lines.append(f"⚠ 저장 당시와 내용이 다른 파일 {len(tampered)}건: {', '.join(tampered[:3])}")
            ctx["checks"].append({"level": "block", "source": "규칙", "stage": "", "text": f"저장 당시 해시와 다른 근거 파일 {len(tampered)}건 ({', '.join(tampered[:4])}). 파일이 바뀌었는지 확인해 주세요."})
        if dangling:
            lines.append(f"⚠ 기록이 가리키지만 근거 목록에 없는 파일 {len(dangling)}건: {', '.join(dangling[:3])}")
            ctx["checks"].append({"level": "warn", "source": "규칙", "stage": "", "text": f"기록이 근거로 적은 파일 중 근거 목록에 없는 것 {len(dangling)}건 ({', '.join(dangling[:4])}{' 외' if len(dangling) > 4 else ''})."})
        else:
            lines.append(f"기록이 근거로 적은 파일 {len(referenced_files(case))}개 모두 근거 목록에 있음")
        ctx["evidence"]["lines"] = summary

    def _similar(self, identity, ctx: dict, lines: list[str]) -> None:
        matches = [m for m in self.store.similar_cases(identity, ctx["case"]["id"], 3) if m.get("score", 0) > 0]
        ctx["similar"] = matches
        lines.append(f"종결된 과거 Case 중 유사 건 {len(matches)}건" + ("" if matches else " — 비교할 과거 Case가 아직 없습니다"))
        for match in matches:
            lines.append(f"{match['caseId']} · {_text(match.get('customer'))} · {_text(match.get('claimTitle'), 60)} (유사도 {match['score']:.2f})")

    @staticmethod
    def _calculate(ctx: dict, lines: list[str]) -> None:
        case, calc = ctx["case"], ctx["calc"]
        to_int = lambda value: int(str(value).replace(",", "")) if re.fullmatch(r"\d[\d,]*", str(value).strip()) else None
        defect, inspected = to_int(case.get("defectQty")), to_int(case.get("inspectQty"))
        if defect is not None and inspected:
            calc["defectLine"] = f"{defect:,} / {inspected:,} ea · {validation_stats.ppm(defect / inspected):,} PPM"
            lines.append(f"불량률: {defect:,} ÷ {inspected:,} = {validation_stats.ppm(defect / inspected):,} PPM")
        flow = _rows(_dict(case.get("d3")).get("materialFlow"))
        total = lambda key: sum(v for v in (r.get(key) for r in flow) if isinstance(v, (int, float)) and not isinstance(v, bool))
        calc["containment"] = [("봉쇄(Hold) 수량 · 위치별 표 합계", f"{total('holdQty'):,} ea"), ("선별 수량", f"{total('screenQty'):,} ea"), ("선별 중 NG", f"{total('ngQty'):,} ea"),
                               ("영향 Lot", _text(_dict(_dict(case.get("d3")).get("lotScope")).get("affectedLot"), 24) or "기록 없음")] if flow else []
        if flow:
            lines.append(f"봉쇄 수량 합계: {len(flow)}개 영역 {total('holdQty'):,} ea · 선별 {total('screenQty'):,} ea 중 NG {total('ngQty'):,} ea")
        recorded = _dict(_dict(_dict(case.get("d6")).get("beforeAfter")).get("statistics"))
        before, after = _dict(recorded.get("before")), _dict(recorded.get("after"))
        try:
            target = _dict(recorded.get("target"))
            stats = validation_stats.compare_rates(before["fail"], before["n"], after["fail"], after["n"], recorded.get("confidence", 0.9), target.get("rate") if target.get("source") == "input" else None)
            calc["beforeAfter"] = stats
            calc["beforeAfterMatches"] = stats["verdict"] == recorded.get("verdict") and stats["after"]["upperBoundPpm"] == after.get("upperBoundPpm")
            lines.append(f"개선 전·후 재계산: {before['fail']}/{before['n']:,} → {after['fail']}/{after['n']:,} · 상한 {stats['after']['upperBoundPpm']:,} PPM (신뢰도 {stats['confidence']:.0%}) · {stats['verdictLabel']}")
            lines.append("기록된 판정과 재계산 결과 일치" if calc["beforeAfterMatches"] else "⚠ 기록된 판정·상한이 재계산 결과와 다릅니다")
            if not calc["beforeAfterMatches"]:
                ctx["checks"].append({"level": "block", "source": "규칙", "stage": "D6", "text": "D6에 기록된 전·후 비교 판정(또는 신뢰 상한)이 공식으로 다시 계산한 값과 다릅니다."})
        except (KeyError, TypeError, ValueError):
            lines.append("개선 전·후 비교: 계산할 기록 없음")
        calc["leadTimes"] = closure_advisor.lead_times(case)
        calc["approvedStages"] = sum(1 for s in STAGES if closure_advisor._approved(case, s))
        lines.append("처리 기간: " + " · ".join(f"{row['label']} {row['text']}" for row in calc["leadTimes"]))
        tests = _rows(_dict(case.get("d6")).get("validationTests"))
        calc["lines"] = [line for line in lines if not line.startswith("⚠")] + [f"검증 시험 {sum(1 for t in tests if t.get('result') == 'PASS')}/{len(tests)}건 PASS"]

    @staticmethod
    def _rule_check(ctx: dict, lines: list[str]) -> None:
        case, checks = ctx["case"], ctx["checks"]
        before = len(checks)
        for item in closure_advisor.readiness(case)["items"]:
            if item["level"] in {"block", "warn"}:
                checks.append({"level": item["level"], "source": "규칙", "stage": "", "text": f"{item['area']}: {item['text']}"})
        gates = _dict(case.get("gates"))
        if not any(_text(_dict(gates.get(key)).get("dispatchDate")) for key in ("gate3D", "gate5D", "gate8D")):
            checks.append({"level": "info", "source": "규칙", "stage": "", "text": "고객 보고서(3D·5D·8D) 송부 기록이 없습니다. 송부는 종결 조건이 아니지만, 보냈다면 기록해 주세요."})
        d4, d5, d6 = (_dict(case.get(k)) for k in ("d4", "d5", "d6"))
        selected = [c for c in _rows(d5.get("candidates")) if c.get("selected") is True]
        for key, label in CAUSES.items():
            if _dict(_dict(d4.get("rootCauses")).get(key)).get("status") == "Confirmed" and not any(c.get("causeType") == key for c in selected):
                checks.append({"level": "block", "source": "규칙", "stage": "D5", "text": f"확정된 {label}에 연결된 선정 대책이 없습니다."})
        tested = {_text(t.get("actionId")) for t in _rows(d6.get("validationTests"))}
        untested = [_text(c.get("title"), 40) for c in selected if _text(c.get("id")) not in tested]
        if untested and _rows(d6.get("validationTests")):
            checks.append({"level": "warn", "source": "규칙", "stage": "D6", "text": f"검증 시험이 연결되지 않은 선정 대책 {len(untested)}건: {', '.join(untested[:3])}"})
        for stage, files in ctx["evidence"]["perStage"].items():
            if not files and closure_advisor._approved(case, stage):
                checks.append({"level": "warn", "source": "규칙", "stage": stage, "text": f"{stage}는 결재됐지만 연결된 근거 파일이 없습니다."})
        d3 = _dict(case.get("d3"))
        ledger = _dict(d3.get("inventoryReconciliation"))
        for word, key, label in (("완제품 창고", "erpFinishedQty", "ERP 완제품 재고"), ("재공품", "mesWipQty", "MES 공정 재고")):
            row = next((r for r in _rows(d3.get("materialFlow")) if word in _text(r.get("area"))), None)
            if row and isinstance(ledger.get(key), (int, float)) and isinstance(row.get("totalQty"), (int, float)) and row["totalQty"] != ledger[key]:
                checks.append({"level": "warn", "source": "규칙", "stage": "D3", "text": f"D3 위치별 표의 '{_text(row.get('area'))}' 수량({row['totalQty']:,})이 가져온 {label}({ledger[key]:,})와 다릅니다. 봉쇄 수량 합계를 확인해 주세요."})
        signed = closure_advisor._approved_at(case, "D6")
        late = [f"{_text(t.get('testName'), 20)}({_text(t.get('completedAt'))})" for t in _rows(d6.get("validationTests"))
                if signed and parse_time(t.get("completedAt")) and parse_time(t.get("completedAt")).date() > signed.date()]
        if late:
            checks.append({"level": "warn", "source": "규칙", "stage": "D6", "text": f"시험 완료일이 D6 결재일({signed:%Y-%m-%d})보다 늦게 적힌 시험 {len(late)}건: {', '.join(late[:3])}. 날짜를 확인해 주세요."})
        applied = parse_time(_dict(d6.get("implementationDetails")).get("startDate"))
        if signed and applied and applied.date() > signed.date():
            checks.append({"level": "warn", "source": "규칙", "stage": "D6", "text": f"대책 적용일({applied:%Y-%m-%d})이 D6 결재일({signed:%Y-%m-%d})보다 늦게 적혀 있습니다."})
        found = checks[before:]
        lines.append(f"규칙 점검 {len(found)}건 발견 · 확인 필요 {sum(1 for c in found if c['level'] == 'block')} · 주의 {sum(1 for c in found if c['level'] == 'warn')} · 참고 {sum(1 for c in found if c['level'] == 'info')}")
        for check in [c for c in found if c["level"] != "info"][:4]:
            lines.append(f"⚠ {_short(check['text'], 130)}")

    @staticmethod
    def _ai_review(ctx: dict, ai, lines: list[str]) -> None:
        try:
            review = ai(closure_advisor.build_review_prompt(ctx["case"]), closure_advisor.REVIEW_PROMPT, closure_advisor.parse_review)
        except Exception as error:
            lines.append(f"⚠ 외부 AI 검토를 받지 못했습니다. 규칙 점검 결과만 싣습니다. ({_text(getattr(error, 'message', None) or str(error), 120)})")
            return
        level = {"high": "block", "medium": "warn", "low": "info"}
        for finding in review["findings"]:
            ctx["checks"].append({"level": level[finding["severity"]], "source": "AI", "stage": finding["stage"],
                                  "text": finding["issue"] + (f" → {finding['suggestion']}" if finding["suggestion"] else "")})
        lines.append(f"AI가 찾은 불일치 {len(review['findings'])}건" + (f" · {review['summary']}" if review["summary"] else ""))
        for finding in review["findings"][:3]:
            lines.append(f"⚠ [{finding['stage']}] {_short(finding['issue'], 130)}")

    @staticmethod
    def _write_summary(ctx: dict, ai, lines: list[str]) -> None:
        case, calc_lines = ctx["case"], ctx["calc"].get("lines", [])
        facts = _plain(json.dumps({k: v for k, v in case.items() if k != "signOffHistory"}, ensure_ascii=False) + " ".join(calc_lines))
        rejected: list[str] = []
        for attempt in (1, 2):
            try:
                draft = ai(build_summary_prompt(case, calc_lines, ctx["focus"], rejected), SUMMARY_PROMPT, parse_summary)
            except Exception as error:
                lines.append(f"⚠ 외부 AI 요약을 받지 못했습니다. 요약 없이 기록만 싣습니다. ({_text(getattr(error, 'message', None) or str(error), 120)})")
                return
            sentences = [draft["headline"], *draft["points"]]
            unknown = sorted({n for s in sentences for n in numbers_in(s) if n not in facts})
            checked = sum(len(numbers_in(s)) for s in sentences)
            if not unknown:
                ctx["summary"] = draft
                lines.append(f"요약 초안 {len(draft['points'])}문장 작성 · 자체 검증: 숫자 {checked}개 모두 기록에 있음")
                return
            rejected = unknown
            lines.append(f"자체 검증: 기록에 없는 숫자 {len(unknown)}개 발견 ({', '.join(unknown[:4])})" + (" → 다시 작성 요청" if attempt == 1 else ""))
        kept = [p for p in draft["points"] if all(n in facts for n in numbers_in(p))]
        if kept and all(n in facts for n in numbers_in(draft["headline"])):
            ctx["summary"] = {"headline": draft["headline"], "points": kept}
            lines.append(f"⚠ 기록에 없는 숫자가 든 문장 {len(draft['points']) - len(kept)}개를 버리고 {len(kept)}문장만 실었습니다")
        else:
            lines.append("⚠ 요약 초안을 버렸습니다. 요약 없이 기록만 싣습니다")

    @staticmethod
    def _build(ctx: dict, meta: dict, lines: list[str]) -> tuple[bytes, int, str]:
        try:
            import report_slides
        except ImportError as error:
            raise RuntimeError("보고서 PPT를 만들려면 서버에 python-pptx가 설치되어 있어야 합니다. (pip install python-pptx)") from error
        content, slides = report_slides.build(ctx["case"], ctx["calc"], ctx["checks"], ctx["summary"], ctx["evidence"], meta)
        name = f"8D_Report_{ctx['case']['id']}_{datetime.now(KST):%Y%m%d_%H%M}.pptx"
        open_checks = sum(1 for c in ctx["checks"] if c["level"] in {"block", "warn"})
        lines.append(f"{name} · {slides}장 · {len(content) / 1024:,.0f} KB")
        lines.append(f"사람이 확인할 것 {open_checks}건을 마지막 장에 실음" if open_checks else "확인할 항목 없음 — 마지막 장에 점검 결과를 실음")
        return content, slides, name
