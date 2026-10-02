# RAMOS AI-QMS 8D

고객 부적합 접수부터 8D(D1~D8) 문제 해결, 외주 품질 관리, 보고서 결재까지 하나의 Case로 관리하는 사내 포털이다.
파이썬 표준 라이브러리 서버와 순수 JS 화면, SQLite로 동작한다.

## 실행

```powershell
Copy-Item .env.example .env
.\run_portal.bat
```

- 서버가 8765~8775 중 빈 포트에서 열리고 브라우저가 뜬다. `index.html`을 직접 열면 로그인과 저장이 동작하지 않는다.
- 초기 계정 비밀번호는 `.env`의 `QMS_DEMO_PASSWORD`다. 운영 전에 반드시 바꾼다.
- 외부 AI(Gemini·Groq) 키는 선택이다. 없어도 규칙 기반 초안은 동작한다.

## 기능

| 영역 | 내용 |
|---|---|
| 고객 부적합 접수·품질 검토 | 접수, 위험도 판정, 담당자 배정, 정식 Case 전환 |
| 8D Workspace (D1~D8) | 단계별 작성, 단계 결재(기안·Leader·Champion), 원본 Evidence 첨부 |
| 근거 기반 초안 | D1~D3, D4~D8 초안을 Case에 기록된 사실로만 생성. 원인·측정값·판정·승인은 만들지 않음 |
| 8D 리포트 | 3D·5D·8D 보고서 결재, 송부 증빙 기록, Excel 내려받기, 송부 전 점검 |
| SLA | 고객사 규칙별 마일스톤 계산과 타임라인 |
| 외주 품질 관리 | 외주사 PCN·Issue 접수와 심의, 우리 회사 → 외주사 부적합 통보와 회신, 제품별 조립 불량 관리, 외주사 품질 현황, 8D Case 연결·가져오기 |
| 사내 품질 관리 | 내부 Issue·부적합, 내부 PCN |
| Agent Operations | 규칙 기반 Agent 실행 이력, 데이터 품질 점검, 내부 알림 |

지켜지는 규칙:

- 승인·종결은 로그인한 실제 권한자의 서버 결재 기록이 있어야 저장된다.
- 화면·보고서·초안에 예시 값이나 지어낸 측정·판정을 넣지 않는다.
- 시스템이 보내는 메일은 사내 알림(D1 팀 확정 시 부적합 공유, SLA 주의·임박·초과)뿐이다(SMTP 설정 시). 평가 기간에는 시험 수신자 한 명에게만 간다. 고객 보고서 송부는 기록만 남긴다.
- 외주 계정은 자기 업체 기록만 본다.

## 구성

| 파일 | 역할 |
|---|---|
| `portal_server.py` | HTTP 서버, 인증·CSRF, API 경로, 외부 AI 중계 |
| `qms_backend.py` | SQLite 저장소, 계정·세션, Case 상태 저장, 결재 기록과 승인 검사, SLA, 유사 Case |
| `agent_runtime.py` | Agent 실행·스케줄러·데이터 품질 점검 |
| `internal_quality.py` | 내부 Issue·PCN |
| `supplier_notices.py` | 우리 회사 → 외주사 통보 |
| `supplier_tickets.py` | 외주사 PCN·Issue 접수, 외주사 현황 집계 |
| `assembly_defects.py` | 제품별 외주 조립 불량 |
| `mailer.py` | 사내 알림 메일(SMTP) |
| `stage_drafts.py` | D4~D8 근거 기반 초안 |
| `report_export.py` | 8D 보고서 Excel 생성 |
| `index.html`, `js/`, `css/` | 화면 |
| `data/` | SQLite DB (Git 제외) |
| `input/` | 회사 조직도·재고 원본 자료 (실행에는 쓰이지 않음) |
| `docs/` | 기능별 설명 |
| `tests/` | Python 테스트 |

## 테스트

테스트는 임시 DB로 돌린다. 경로를 지정하지 않으면 모듈을 불러올 때 실제 DB를 건드린다.

```powershell
$env:QMS_DATABASE_PATH = "$env:TEMP\qms-test.sqlite3"
python -m unittest discover -s tests -p "test_*.py"
```

## 계정

| 계정 | 역할 |
|---|---|
| `master` | 시스템 관리자 (Master): 삭제, 결재 전결 |
| `sjkim` | 품질 검토·접수 승인·보고서 송부 |
| `jhpark`, `eunsan.lee` | 단계 기안 |
| `hskim`, `gh8229` | Leader |
| `sahwang` | Champion |
| `thkwon`(TechL), `yspark`(WinPAC), `ojs`(CTST) | 외주 협력사 |

전체 계정과 역할은 `qms_backend.py`의 `_seed_users`가 기준이다.

## 문서

- 작업 규칙: `AGENTS.md`
- 최신 작업 기록: `인수인계.md`
- 기능 설명: `docs/`
