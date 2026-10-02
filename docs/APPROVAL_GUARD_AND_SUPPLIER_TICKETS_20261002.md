# 16_QMS_8D 이전 · 가짜 승인 차단 · 외주 접수 중앙 저장 — 2026-10-02

작업 폴더: `G:/내 드라이브/AI_Place/Work/16_QMS_8D`
기준: `G:/내 드라이브/GPT_Place/Mario/14_AI_8D Report` (HEAD 823f585 + 미커밋 변경)의 소스만 반입. 14번 폴더는 읽기만 했고 수정하지 않았다.

## 1. 소스 반입

14번에서 소스·문서·테스트 169개 파일을 가져왔고 바이트 단위 일치를 확인했다. 가져오지 않은 것:

- `.git/`, `output/`, `backups/`, `light_audit_*/`, `__pycache__/`
- 루트의 `*.diff`, `*.patch` (코덱스 패치 전달용)
- `.env` (비밀값), `data/qms.sqlite3` (14번 운영 DB)

16번은 새 git 저장소(`main`)로 시작한다. 16번의 기존 `data/qms.sqlite3`는 계정만 있는 베이스라인 DB이며 그대로 두었다. 새 코드로 열면 테이블이 자동 추가되고 외주 4개 계정이 등록되는 것을 사본으로 확인했다. 14번의 Case·접수·감사 기록은 16번에 없다.

`tests/case_evidence_audit.cjs`가 쓰던 시험 이미지는 `tests/fixtures/emmc_nonconformance_email_test.png`로 옮겼다.

## 2. 가짜 승인·가짜 실측 제거

### 문제

14번의 2026-10-01 자체 점검이 P0로 기록한 결함이 고쳐지지 않고 남아 있었다.

- 3D/5D 송부 증빙을 기록하면 `runSprint2`/`runSprint3`가 자동 실행됐다.
- 고정된 원인·대책과 "표본 3,000개, 불량 0, PASS" 시험 결과가 Case에 기록됐다.
- 서버 승인 이벤트 없이 실제 임직원 3명의 이름으로 D4~D8이 `Approved` 처리됐다.
- 보완 요청을 넣으면 "베트남 5,000ea 봉쇄완료" 같은 지어낸 행이 D3·D7에 추가됐다.
- `promptSignoffApproval`은 `recordApproval` 호출이 `return` 뒤 잘못된 블록에 있어, 지정 결재자가 보고서를 승인하면 `ReferenceError`가 났다.

### 변경

- `js/views/autonomous_8d_agent.js`: `runSprint2`, `runSprint3`, `executeHumanSignOff`, `synthesizeD1`~`D8`, `signStageInternal`, `autoDemoMode`, `RAMOS_ENABLE_LEGACY_DEMO` 분기를 삭제했다. AI 초안은 서버가 만드는 D1~D3만 남는다.
- 보완 요청은 `case.revisionRequests`에 요청 내용·요청자·시각만 기록한다. 수량·시험 결과·조치 상태는 바꾸지 않는다. 시연용 프리셋 문구도 제거했다.
- 초기화(`resetToCleanSlate`)는 결재·종결 기록이 있으면 거부하고, 없으면 확인을 받는다. 종결된 Case에서 "시작"을 눌러도 초기화되지 않는다.
- `js/views/reports.js`: 송부 증빙 기록 후 Agent를 호출하지 않는다. `promptSignoffApproval`의 블록 오류를 고쳤다.
- `js/approval.js`: 서명 스냅샷이 있는 단계는 Champion 서명에 서버 이벤트 번호가 있어야 승인으로 본다.
- `qms_backend.py` `save_state`: 저장하려는 상태에 **새로 나타난** 승인 주장을 모두 검사한다.

### 서버 검사 규칙

| 주장 | 필요한 `approval_events` |
|---|---|
| 단계 서명(기안/Leader/Champion), `dN.approval.status == Approved` | 같은 Case·단계·역할, 서명에 적힌 `serverEventId`, 스냅샷 해시 일치 |
| 보고서 Gate 결재자 `Approved`, `internalApproved`, `dispatchedByQuality` | 같은 Case·Gate·역할, 결재자에 적힌 `serverEventId`, Gate 스냅샷 해시 일치 |
| `status == Closed` | D8 Champion 승인 또는 Final 8D 송부 기록 |

일치하지 않으면 409 `APPROVAL_NOT_RECORDED`로 저장 전체를 거부한다. 브라우저는 재시도하지 않고 사용자에게 알린다.

이미 저장돼 있던 승인은 다시 검사하지 않는다. 이 검사 이전의 기록이 있는 DB도 계속 저장할 수 있게 하기 위해서다. 따라서 과거에 가짜로 들어간 승인이 있다면 이 검사가 찾아내 주지는 않는다.

## 3. 외주 PCN·Issue 중앙 저장

### 문제

외주사가 제출하는 PCN·Issue가 브라우저 localStorage에만 저장돼, 외주사가 등록한 건이 사내 담당자 화면에 보이지 않았다. 첨부는 파일명만 기록됐다. 8D 연계는 존재하지 않는 Case 번호 `RAMOS-8D-20260901-01`에 고정 연결됐다.

### 변경

- `supplier_tickets.py` 추가: `supplier_tickets`, `supplier_ticket_files` 테이블. `internal_quality.py`·`supplier_notices.py`와 같은 방식(로그인·CSRF·역할 검사, 레코드 revision, 원본 바이트와 SHA-256, 감사 로그).
- API: `GET/POST /__api__/qms/supplier-tickets`, `GET/POST /__api__/qms/supplier-tickets/{id}`, `GET .../{id}/files/{fileId}`.
- `js/supplier_data.js`: localStorage 대신 서버 API를 쓴다. 화면은 서버 기록의 HTML 이스케이프 사본을 그린다.
- `js/views/supplier_portal.js`: 접수·심의·보완 제출·Case 연결이 서버 호출이 됐다. 첨부 칩은 보관된 원본을 내려받는다.

### 권한과 규칙

- 외주 계정은 자기 업체 건만 조회·등록·보완 제출한다. 업체·담당자·이메일은 로그인 계정의 공식 매핑에서 서버가 정한다.
- 사내 계정이 대신 등록할 때는 공식 4개 외주사 중 하나를 지정해야 한다.
- 심의(`Under_Review`, `Revision_Requested`, `Approved`, `Rejected`)는 `quality_reviewer`·`system_admin`만 한다. 심의자는 로그인 계정으로 기록되고 브라우저가 보낸 이름은 쓰지 않는다. 보완 요청·승인·반려에는 의견이 필요하다.
- 보완 제출은 보완 요청 또는 심의 중 상태에서 원본 파일이 있어야 한다. 심의자 의견은 그대로 두고 외주사 의견은 `resubmissions`에 따로 남는다.
- 8D 연결은 실제 존재하는 Case에만 된다. 연결 기록만 남기며 Case의 D2·D3 내용을 바꾸지 않고, Case를 새로 만들지도 않는다.
- 위험도(`riskLevel`)와 불량률은 서버가 계산한다. 입력하지 않은 수량은 0이 아니라 빈 값으로 보관한다.

### 기존 브라우저 기록

이전 버전으로 브라우저에 저장된 접수 기록은 지우지 않았고 서버로 자동 이전하지도 않는다. 목록에는 나오지 않으며, 화면 상단 안내의 "이전 기록 내려받기"로 JSON 사본을 받을 수 있다. 첨부 원본이 없고 심의 기록을 서버가 검증할 수 없어 자동 이전 대상에서 뺐다.

## 4. 검증

2026-10-02, 16번 폴더에서 임시 DB로 직접 실행한 결과다.

- `python -m unittest discover -s tests -p "test_*.py"`: 74건 통과. 반입 직후 60건 + 승인 검사 4건 + 정적 가드 2건 + 외주 접수 HTTP 8건.
- `python -m py_compile portal_server.py qms_backend.py agent_runtime.py internal_quality.py supplier_notices.py supplier_tickets.py`: 통과.
- `node --check`: 수정한 JS·cjs 파일 통과.
- 실제 브라우저(임시 DB, 포트 8791): 외주 계정 PCN 등록과 원본 첨부 → 다른 외주사 계정에서 0건 → 사내 계정 조회·보완 요청(심의자 계정 기록) → 원본 다운로드 바이트·SHA-256 일치 → 외주 계정 보완 제출. 제목에 넣은 HTML은 실행되지 않고 글자로 표시됐다. Case가 없을 때 8D 연결은 안내만 하고 상태를 바꾸지 않았다.

실행하지 않은 것:

- `tests/*.cjs` 브라우저 감사 스크립트 전체. 문법만 확인했다.
- 실제 결재자 여러 명이 순서대로 로그인하는 D1~D8 결재 전 과정.
- 외부 AI 호출. 16번에는 `.env`가 없다.

## 5. 남은 문제

- `tests/test_supplier_portal_e2e.cjs`는 예시 데이터(`SQ-2026-002` 등)와 화면 내 계정 전환을 전제로 한다. 14번에서 예시 데이터를 정리할 때 이미 맞지 않게 됐고 이번에 고치지 않았다.
- `tests/run_full_e2e.py`, `regression.cjs`, `check_css.cjs`의 기존 불일치(인수인계 2026-09-22 기록)는 그대로다.
- `js/views/supplier_bridge.js`와 `supplier_ai_audit.js`는 외주 기록을 읽어 D3~D5 화면과 AI 감사 화면에 보여 준다. 읽는 값이 이스케이프 사본이라 `&`, `<` 같은 문자가 들어간 문구는 그 화면에서 `&amp;`처럼 보일 수 있다.
- `supplier_ai_audit.js`의 AI 감사 결과가 실제 첨부 내용을 읽어 만든 것인지는 이번에 확인하지 않았다.
- 서버는 실행한 PC의 127.0.0.1에서만 열린다. 다른 PC의 외주사가 접속하는 구성은 범위 밖이다.
- 16번 폴더는 Google Drive 동기화 폴더다. 서버 실행 중 `data/qms.sqlite3`가 동기화되면 파일 충돌이 날 수 있다.
