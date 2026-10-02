# Agent Unit 통합 플랫폼

## 개요

RAmos 8D QMS의 Agent 기능은 `agent_runtime.py`의 중앙 Runtime에서 실행된다. Agent는 초안·검증·추천을 생성하고, 공식 Case 변경은 로그인한 실제 권한자의 승인과 중앙 revision 검사를 통과한 뒤에만 수행된다.

- DB schema: v3
- Agent output contract: `AGENT-OUTPUT-1`
- 정책 버전: `QMS-POLICY-1`
- 외부 이메일: 비활성
- 외부 MES/ERP 쓰기: 비활성
- 비공개 Chain-of-Thought: 저장·표시하지 않음
- 사용자 제공 Fact, 추론, 미확인 정보, Evidence를 분리

## Agent Unit 적용 현황

| 구분 | Unit | 적용 |
|---|---|---|
| 호출 | 자연어 요청 해석 | Case·단계·의도 추출, 모호하면 확인 대기 |
| 호출 | 정기 스케줄 | 서버 Scheduler가 SLA와 예약 재시도 수행 |
| 호출 | 이벤트 감지 | 신규 Evidence Source 등록 시 품질 검증 Run 생성 |
| 수집 | 사내 시스템 조회 | `UNCONFIGURED` Adapter 계약, 읽기/쓰기 미연결 |
| 수집 | 문서·대장 | Source Artifact 메타데이터·SHA-256·추출값 등록 |
| 수집 | 메일·첨부 | Provider `UNDECIDED`, 수신함 접근 비활성 |
| 수집 | 비정형 판독 | 기존 문서 파서 결과를 Source 추출값으로 연결 가능 |
| 수집 | 외부 정보 | `UNCONFIGURED`, 승인된 Provider 결정 전 비활성 |
| 정제 | 데이터 검증 | 필수값·수량·날짜·종결 증빙 검사 |
| 정제 | 표준화 | 고객 Alias, 품번·LOT, 숫자 수량 정규화 |
| 정제 | 집계·산출 | 불량 수량·검사 수량·불량률·Source 수 계산 |
| 정제 | 상호 대조 | Source 추출 고객·품번·LOT과 중앙 Case 비교 |
| 판단 | 이상 감지 | Critical/High Finding 및 SLA 이상 검출 |
| 판단 | 원인 분석 | D4 가설·반증·추가 시험 초안, 자동 확정 금지 |
| 판단 | 위험도 | 안전·라인정지·재발·Finding을 점수화 |
| 판단 | 규정 대조 | 정책 버전, Critical 승인 차단, Gate 금지행위 검사 |
| 생성 | 보고서·문서 | D1~D8 사람 검토용 초안 생성 |
| 생성 | 표·차트 | 기존 SLA·CoQ·Evidence 차트와 집계 데이터 연결 |
| 생성 | 시스템 입력 | 승인 후 자체 중앙 QMS만 revision 안전 반영 |
| 생성 | 통보·발송 | 내부 알림만 생성, 외부 발송 없음 |
| 통제 | 사람 승인 | 승인·반려·관리자 전결·의견·실제 사용자 기록 |
| 통제 | 예외·실패 | 5초/30초/120초 재시도 예약 후 `NEEDS_HUMAN` |
| 통제 | 감사 로그 | Run·Step·Source·Finding·승인·실패·반영 기록 |

## Agent 팀

- Intake Orchestrator: 자연어 요청 해석과 확인 대기
- Triage Agent: 집계, 이상, 위험도, 정책 검사
- Evidence Agent: 수집, 표준화, 데이터 검증, 상호 대조
- Containment Agent: D1~D3 초안
- Root Cause Agent: D4 가설과 검증 항목
- Corrective Action Agent: D5~D7 조치·검증·수평전개 빈 초안
- Report & Gate Agent: 승인 데이터 기반 D8/고객 보고서 초안
- SLA Control Agent: D3/D5/D8 스케줄 에스컬레이션
- Audit & Governance Guard: 권한·revision·감사·금지행위 통제

## 상태 흐름

일반 흐름:

`CREATED → VALIDATING → ANALYZING → AWAITING_APPROVAL → APPROVED → COMPLETED`

모호한 요청:

`CREATED → AWAITING_CONFIRMATION → CREATED`

실패:

`RETRY_SCHEDULED → CREATED` 또는 재시도 한도 초과 시 `NEEDS_HUMAN`

Agent가 Case에 직접 쓸 수 있는 상태는 `APPROVED`뿐이다. 실행 이후 Case revision이 달라졌으면 `REVISION_CONFLICT`로 차단한다.

## 중앙 테이블

- `agent_runs`: 요청·상태·Case revision·정책·계약·결과
- `agent_steps`: Unit별 입력 해시·출력·신뢰도·상태
- `source_artifacts`: 원본 메타데이터·SHA-256·추출값. 본문은 미보관
- `data_quality_findings`: 검증·상호 대조 이슈와 해결 이력
- `policy_rules`: 중앙 정책 및 버전
- `agent_exceptions`: 안전 오류·재시도·사람 확인 정보
- `scheduled_jobs`: 주기·Lease·다음 실행·결과
- `internal_notifications`: 역할별 화면 알림, 외부 발송 없음

## HTTP API

### Run

- `POST /__api__/qms/agent-runs`
- `GET /__api__/qms/agent-runs`
- `GET /__api__/qms/agent-runs/{id}`
- `POST /__api__/qms/agent-runs/{id}/confirm`
- `POST /__api__/qms/agent-runs/{id}/approve`
- `POST /__api__/qms/agent-runs/{id}/reject`
- `POST /__api__/qms/agent-runs/{id}/retry`
- `POST /__api__/qms/agent-runs/{id}/cancel`

### 데이터 품질과 Source

- `GET /__api__/qms/cases/{caseId}/quality-findings`
- `POST /__api__/qms/quality-findings/{id}/resolve`
- `GET /__api__/qms/cases/{caseId}/sources`
- `POST /__api__/qms/cases/{caseId}/sources`

### 통제

- `GET /__api__/qms/policy-rules`
- `GET /__api__/qms/agent/adapters`
- `GET /__api__/qms/agent/notifications`
- `POST /__api__/qms/scheduler/evaluate`

모든 변경 API는 로그인, 동일 출처, CSRF, 서버 역할 검사를 적용한다.

## 환경 설정

```env
QMS_AGENT_RUNTIME_ENABLED=true
QMS_SCHEDULER_ENABLED=true
QMS_SCHEDULER_INTERVAL_SECONDS=60
QMS_INTERNAL_SYSTEM_PROVIDER=UNCONFIGURED
QMS_EXTERNAL_SYSTEM_WRITE_ENABLED=false
QMS_MAIL_PROVIDER=UNDECIDED
QMS_EXTERNAL_SEND_ENABLED=false
```

## 운영 안전 경계

현재 구현은 다음 작업을 하지 않는다.

- SMTP, Gmail, Microsoft Graph 호출
- 이메일 수신함 접근 또는 첨부 자동 수집
- MES·ERP·그룹웨어 로그인
- MES·ERP 데이터 등록·수정
- 외부 규격 사이트 자동 조회
- Evidence 원본 본문의 중앙 DB 저장
- 근거 없는 수량·측정값·완료·고객 수락 생성
- 사람 승인 없는 공식 Case 변경

## 검증

```powershell
python -m unittest discover -s tests -p "test_*.py" -v
python -m py_compile portal_server.py qms_backend.py agent_runtime.py
node --check js/server_api.js
node --check js/app.js
node --check js/views/agent_operations.js
git diff --check
```

`Agent Operations` 화면에서 Run Ledger, Unit Timeline, Evidence Source, Data Quality Finding, Adapter 상태와 내부 알림을 확인한다.
