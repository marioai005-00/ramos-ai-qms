"""HTML layout for notification mail.

Mail clients (Outlook in particular) ignore most CSS, so the layout is nested tables with inline styles.
Every value is escaped, and only values recorded on the Case or intake are shown.
"""
from datetime import datetime, timedelta, timezone
from html import escape

KST = timezone(timedelta(hours=9))
FONT = "font-family:'Malgun Gothic','맑은 고딕','Apple SD Gothic Neo',Arial,sans-serif;"
# tone -> (band colour, soft background, text on soft background)
TONES = {
    "info": ("#1d4ed8", "#eff6ff", "#1e3a8a"),
    "attention": ("#b45309", "#fffbeb", "#78350f"),
    "critical": ("#c2410c", "#fff7ed", "#7c2d12"),
    "overdue": ("#b91c1c", "#fef2f2", "#7f1d1d"),
    "neutral": ("#334155", "#f8fafc", "#1e293b"),
}
SLA_STEPS = [("L1_ATTENTION", "주의", "attention"), ("L2_CRITICAL", "임박", "critical"), ("L3_OVERDUE", "초과", "overdue")]
SLA_RULE = [("3D", "봉쇄 조치", timedelta(hours=24), "24시간"), ("5D", "원인·대책", timedelta(days=14), "14일"), ("8D", "종결", timedelta(days=30), "30일")]
MILESTONE_NAMES = {"D3": "3D 봉쇄 조치", "D5": "5D 원인·대책", "D8": "8D 종결"}


def parse_time(value) -> datetime | None:
    try:
        parsed = datetime.fromisoformat(str(value).strip().replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None
    return parsed.replace(tzinfo=KST) if parsed.tzinfo is None else parsed.astimezone(KST)


def show_time(value) -> str:
    parsed = parse_time(value)
    return f"{parsed:%Y-%m-%d %H:%M}" if parsed else (str(value) if value not in (None, "") else "미입력")


def span_text(delta: timedelta) -> str:
    minutes = int(abs(delta).total_seconds() // 60)
    days, hours, mins = minutes // 1440, minutes % 1440 // 60, minutes % 60
    if days:
        return f"{days}일 {hours}시간"
    return f"{hours}시간 {mins}분" if hours else f"{mins}분"


def facts_table(rows: list[tuple[str, str]]) -> str:
    cells = "".join(
        f'<tr><td width="112" valign="top" style="{FONT}padding:9px 12px;font-size:13px;color:#64748b;border-bottom:1px solid #e2e8f0;white-space:nowrap;">{escape(label)}</td>'
        f'<td valign="top" style="{FONT}padding:9px 12px;font-size:14px;color:#0f172a;font-weight:bold;border-bottom:1px solid #e2e8f0;">{escape(str(value))}</td></tr>'
        for label, value in rows)
    return f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid #e2e8f0;">{cells}</table>'


def section_title(text: str) -> str:
    return f'<p style="{FONT}margin:26px 0 10px 0;font-size:13px;font-weight:bold;color:#475569;">{escape(text)}</p>'


def tiles(items: list[dict]) -> str:
    """A row of equal boxes: small label, large value, small note."""
    width = 100 // max(len(items), 1)
    cells = ""
    for index, item in enumerate(items):
        band, soft, ink = TONES[item.get("tone", "neutral")]
        active = item.get("active", True)
        background, border, colour = (soft, band, ink) if active else ("#f8fafc", "#e2e8f0", "#94a3b8")
        cells += (f'<td width="{width}%" valign="top" style="padding:0 {0 if index == len(items) - 1 else 8}px 0 0;">'
                  f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>'
                  f'<td bgcolor="{background}" style="{FONT}background:{background};border:1px solid {border};border-top:4px solid {border};padding:12px 10px;text-align:center;">'
                  f'<div style="font-size:12px;color:{colour};">{escape(item["label"])}</div>'
                  f'<div style="font-size:17px;font-weight:bold;color:{colour};padding:5px 0 3px 0;">{escape(item["value"])}</div>'
                  f'<div style="font-size:12px;color:{colour};">{escape(item.get("note", ""))}</div>'
                  f'</td></tr></table></td>')
    return f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>{cells}</tr></table>'


def people_table(team: list[dict]) -> str:
    head = "".join(f'<td bgcolor="#f1f5f9" style="{FONT}background:#f1f5f9;padding:8px 12px;font-size:12px;color:#475569;font-weight:bold;">{label}</td>' for label in ("역할", "이름", "부서"))
    rows = "".join(
        "<tr>" + "".join(f'<td style="{FONT}padding:9px 12px;font-size:13px;color:#0f172a;border-bottom:1px solid #e2e8f0;">{escape(str(member.get(key) or "미입력"))}</td>' for key in ("role", "name", "dept")) + "</tr>"
        for member in team)
    return f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>{head}</tr>{rows}</table>'


def page(*, tone: str, badge: str, title: str, lead: str, blocks: list[str], note: str = "", test_notice: str = "") -> str:
    band, soft, ink = TONES[tone]
    notice = (f'<tr><td bgcolor="#fef9c3" style="{FONT}background:#fef9c3;padding:10px 28px;font-size:12px;color:#713f12;border-bottom:1px solid #fde047;">{escape(test_notice)}</td></tr>'
              if test_notice else "")
    note_block = (f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:22px;"><tr>'
                  f'<td bgcolor="{soft}" style="{FONT}background:{soft};border-left:4px solid {band};padding:12px 14px;font-size:13px;color:{ink};">{escape(note)}</td></tr></table>'
                  if note else "")
    return f"""<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f1f5f9" style="background:#f1f5f9;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0" style="width:640px;max-width:100%;background:#ffffff;border:1px solid #e2e8f0;">
{notice}
<tr><td bgcolor="{band}" style="{FONT}background:{band};padding:22px 28px;">
<div style="font-size:12px;color:#ffffff;letter-spacing:1px;">RAMOS AI-QMS 8D</div>
<div style="font-size:13px;font-weight:bold;color:#ffffff;padding-top:14px;">{escape(badge)}</div>
<div style="font-size:22px;font-weight:bold;color:#ffffff;line-height:1.35;padding-top:4px;">{escape(title)}</div>
</td></tr>
<tr><td style="{FONT}padding:24px 28px 28px 28px;">
<p style="{FONT}margin:0 0 18px 0;font-size:14px;line-height:1.6;color:#334155;">{escape(lead)}</p>
{"".join(blocks)}
{note_block}
</td></tr>
<tr><td bgcolor="#f8fafc" style="{FONT}background:#f8fafc;border-top:1px solid #e2e8f0;padding:14px 28px;font-size:12px;color:#64748b;">
QMS 포털에서 해당 건을 확인해 주세요. 이 메일은 시스템이 자동으로 보냈습니다.
</td></tr>
</table>
</td></tr></table>
</body></html>"""


def record_facts(record: dict) -> list[tuple[str, str]]:
    """Facts recorded on a Case or an intake. A missing value is shown as missing, never filled in."""
    field = lambda key: str(record.get(key)) if record.get(key) not in (None, "") else "미입력"
    return [("고객사", field("customer")), ("제품", field("product")), ("품번", field("partNumber")), ("Lot No.", field("lotNumber")),
            ("불량 현상", field("claimTitle")), ("발생 위치", field("incidentSite")), ("불량 / 검사 수량", f"{field('defectQty')} / {field('inspectQty')}"),
            ("접수 시각", show_time(record.get("receiptDate") or record.get("submittedAt")))]


def case_share_html(case: dict, test_notice: str = "") -> str:
    received = parse_time(case.get("receiptDate"))
    deadlines = []
    for (code, name, span, rule), tone in zip(SLA_RULE, ("overdue", "attention", "info")):
        # Same rule as the SLA watch: a shorter 3D time set at triage replaces the 24 hours.
        try:
            triage_hours = float((case.get("triageApproval") or {}).get("slaHours"))
        except (TypeError, ValueError):
            triage_hours = 0
        if code == "3D" and 0 < triage_hours < 24:
            span, rule = timedelta(hours=triage_hours), f"{triage_hours:g}시간"
        deadlines.append({"label": f"{code} {name}", "value": f"{received + span:%m-%d %H:%M}" if received else rule, "note": f"접수 후 {rule}", "tone": tone})
    team = [member for member in case.get("team") or [] if isinstance(member, dict)]
    return page(
        tone="info", badge="부적합 공유 · D1 대응 팀 지정", title=f"{case.get('id')}",
        lead="아래 고객 부적합의 대응 팀으로 지정되었습니다. 접수 내용과 기한을 확인해 주세요.",
        blocks=[facts_table(record_facts(case)), section_title("보고 기한"), tiles(deadlines), section_title(f"대응 팀 {len(team)}명"), people_table(team)],
        test_notice=test_notice)


def sla_html(item: dict, record: dict | None, now: datetime, test_notice: str = "") -> str:
    level = item["level"]
    name, tone = next(((label, tone) for key, label, tone in SLA_STEPS if key == level), (level, "neutral"))
    due = parse_time(item.get("dueAt"))
    target = "접수" if item.get("targetType") == "intake" else "8D Case"
    milestone = MILESTONE_NAMES.get(item.get("milestone"), str(item.get("milestone")))
    if due:
        gap = due - now
        clock = {"label": "기한 초과" if gap.total_seconds() < 0 else "남은 시간", "value": span_text(gap), "note": f"기한 {due:%Y-%m-%d %H:%M}", "tone": tone}
    else:
        clock = {"label": "기한", "value": show_time(item.get("dueAt")), "note": "", "tone": tone}
    steps = [{"label": f"{index}단계", "value": label, "note": "현재 단계" if key == level else "", "tone": step_tone, "active": key == level} for index, (key, label, step_tone) in enumerate(SLA_STEPS, 1)]
    blocks = [tiles([{"label": "대상", "value": milestone, "note": target, "tone": tone}, clock]), section_title("진행 단계"), tiles(steps)]
    if record:
        blocks += [section_title("접수 내용"), facts_table(record_facts(record))]
    return page(
        tone=tone, badge=f"SLA 기한 {name}", title=f"{item['caseId']} · {milestone}",
        lead=str(item.get("reason") or ""), blocks=blocks,
        note="기한 초과 상태가 해소될 때까지 하루에 한 번 다시 발송됩니다." if level == "L3_OVERDUE" else "",
        test_notice=test_notice)


def test_html(lines: list[tuple[str, str]], test_notice: str = "") -> str:
    return page(tone="neutral", badge="메일 발송 시험", title="메일이 정상적으로 도착했습니다",
                lead="RAMOS AI-QMS 8D 알림 메일의 발송 경로를 확인하기 위한 시험 메일입니다.", blocks=[facts_table(lines)], test_notice=test_notice)
