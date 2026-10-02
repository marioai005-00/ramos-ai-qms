# 2026-10-01 부적합·8D·외주사 업무 흐름 점검

## 판정

현재 소스는 일부 접수·초안·출력 기능이 동작하지만, 실제 다중 사용자 업무 시스템으로 정상 동작한다고 판정할 수 없다. 특히 후반 8D 자동화의 실측·승인 임의 입력과 외주사 PCN/조립 이슈의 공유·첨부·8D 연계가 운영을 막는다.

## 점검 범위와 방법

- 작업 폴더: `G:/내 드라이브/GPT_Place/Mario/14_AI_8D Report`
- 브랜치: `codex/production-foundation-no-email`; 기준 HEAD는 기존 `7b3b3ff` 및 기존 미커밋 변경.
- 기존 Python 자동 테스트: 35건 통과. 이 결과는 아래 브라우저 업무 흐름 결함이 없다는 의미가 아니다.
- `tests/audit_current_workflow.cjs`: 실제 소스를 제공하는 임시 서버, 임시 SQLite DB, 실제 서버 로그인, 서로 분리된 Edge 브라우저 컨텍스트로 재현.
- 운영 DB를 대상으로 합성 Case·접수·승인을 생성하지 않았다. 브라우저 재현은 전부 임시 DB와 합성 사실·첨부에서 수행했다.
- 외부 AI 공급자 호출을 비활성화했다. 실제 Gemini/Groq 추출 정확도·접속 성공은 이번 결과의 검증 범위가 아니다.
- 다수 실제 결재자가 순서대로 로그인하는 전 과정은 수행하지 않았다. 후반 자동화 함수는 직접 호출해 결과를 확인했으며, 운영 보고서 송부 증빙 버튼에서 같은 함수로 연결되는 코드는 별도로 확인했다.
- 결과: `output/workflow_audit_20261001/results.json`; 전체 재현 완료, 브라우저 비처리 런타임 오류 0건. 이는 기능 요구 충족을 뜻하지 않는다.

## 동작을 확인한 부분

| 항목 | 관찰 |
| --- | --- |
| 중앙 관리자 로그인 | `sjkim` 실제 서버 세션 로그인과 중앙 상태 로딩 성공 |
| 부적합 접수 | 합성 고객·제품·LOT·불량 2/검사 100 및 TXT 원본을 품질 검토 대기함에 등록 |
| 접수 내용 공유 | 별도 로그인/브라우저 컨텍스트에서 같은 접수 metadata 조회 |
| 품질 검토 → 정식 Case | 사용자 검토 체크와 근거 입력 후 정식 Case 및 D1 진입 성공 |
| D1~D3 안전 초안 | 입력한 고객·제품·LOT·수량을 사용하고 봉쇄 조치는 Open/증거 미확인 상태로 생성 |
| 보고서 초안 출력 | 3D 프리뷰에서 합성 고객·DRAFT 확인, Chromium PDF 렌더 성공; PDF payload는 폐기 |

## 운영을 막는 문제

### P0 — 후반 8D 자동화가 확인되지 않은 사실·승인을 생성

- `js/views/autonomous_8d_agent.js:272`의 `runSprint2`, `:316`의 `runSprint3`는 정해진 원인·시험·완료 문구를 주입하고 `signStageInternal`을 호출한다.
- `:751`의 `synthesizeD6`는 입력 Evidence의 실제 시험 여부와 무관하게 표본 3,000/15,050/30, 불량 0, PASS 및 완료일을 기록한다.
- `:902`의 `signStageInternal`은 실제 사용자 승인 API 없이 기안·Leader·Champion 이름과 `Approved`를 기록한다.
- 재현: `RAMOS_ENABLE_LEGACY_DEMO`가 true가 아닌 상태에서도 D4~D8가 Approved가 되었고 `hasCurrentStageApproval`이 모두 true를 반환했다. 해당 상태가 중앙 DB에도 저장됐다. 서버 감사 이벤트는 STATE_SAVED/로그인/SLA뿐이며 실제 APPROVAL 이벤트가 없었다.
- 운영 연결: `js/views/reports.js:465`에서 3D/5D 송부 증빙 기록 후 같은 Sprint 2/3 함수를 자동 호출한다. 현재 버튼 경로에도 영향을 준다.
- 관련 경계: `js/approval.js:24`는 snapshot/status/humanConfirmed만으로 승인 판정하며 서버 이벤트 존재를 확인하지 않는다. `qms_backend.py:405`는 저장된 전체 상태의 역할/revision을 검사하지만 각 승인 상태와 서버 승인 이벤트의 일치를 검사하지 않는다.
- 우선 조치: 임의 실측/완료/서명 생성 및 해당 자동 연결을 차단하고, 안전한 중앙 Draft와 실제 승인 이벤트를 유일한 판정 기준으로 연결한다.

### P0 — 사람 보완요청도 입력과 무관한 실행 완료를 기록

- `js/views/autonomous_8d_agent.js:160`의 `submitHumanRevision`은 gate3D 보완요청 내용과 무관하게 베트남 재고 5,000개·봉쇄완료를 추가한다.
- 재현: '포장 라벨만 확인, 베트남 재고 없음' 합성 요청에도 `AUDIT-LOT-VN`, quantity=5000, status=봉쇄완료가 저장됐다.
- gate8D 경로에도 고정 수평전개 Completed와 Evidence 문자열이 남아 있다. 이 경로는 소스 확인이며 별도 브라우저 재현은 하지 않았다.

### P1 — 외주사 PCN·조립 이슈가 사내 PC로 공유되지 않음

- `js/supplier_data.js:202`/`:218`은 RAMOS_SUPPLIER_RECORDS_V2라는 localStorage를 읽고 쓴다.
- `js/server_api.js:99`의 중앙 businessState에는 cases/intakeQueue만 있고 외주 ticket이 없다.
- 재현: `thkwon`이 PCN-2026-004 및 SQ-2026-005를 제출한 컨텍스트에서는 보이지만 별도 `sjkim` 컨텍스트에는 PCN이 나타나지 않았다. 서버 상태에도 supplier collection이 없었다.
- 화면의 'SQE 실시간 등록' 안내가 실제 공유 결과와 맞지 않는다.
- 우선 조치: 외주 ticket/심의/보완/이력의 중앙 API·DB 저장, 업체별 권한, 사내 조회/갱신을 연결한다.

### P1 — 외주사 실제 첨부와 보완 보고서 접수가 구현되지 않음

- `js/views/supplier_portal.js:693`/`:845`는 handleSupplierFileUpload를 호출하지만 JS 소스 전체에 정의가 없고 실제 브라우저에서도 typeof가 undefined였다.
- `:932`~`:941`의 제출 함수는 사용자가 첨부하지 않은 고정 PDF/Excel/X-Ray/CSV 이름을 evidenceFiles에 넣는다.
- 재현: 파일을 하나도 선택하지 않고 PCN/Issue 제출을 호출했는데 고정 첨부 2건이 저장됐다.
- `:1517` 이후 보완 제출도 고정 Rev2 파일 2건을 추가한다. 실제 파일 저장을 하지 않는 것은 소스로 확인했으며 별도 재현은 하지 않았다.
- 우선 조치: 선택한 실제 원본의 중앙 업로드/해시/다운로드를 구현하고 고정 첨부·완료 메시지를 제거한다.

### P1 — 외주 이슈의 8D 승격은 고정 Case ID와 연결되지 않은 변수 사용

- `js/views/supplier_portal.js:1216`은 대상 Case를 생성/선택하지 않고 RAMOS-8D-20260901-01로 ticket을 연결한다.
- D2/D3는 window.CURRENT_CASE에 쓰려 하지만 해당 전역은 정의되어 있지 않다. saveCurrentCaseToStorage 정의도 없다.
- 재현: 승격 함수 실행 후 새 Case 수 증가=0, CURRENT_CASE 미정의. 기존 데모 Case ID에 ticket만 묶이고 D2로 이동 시 D1 선행 승인 안내가 발생했다.
- 우선 조치: 중앙에서 ticket 사실·Evidence를 바탕으로 Case 생성 또는 사용자가 선택한 Case와 원자적으로 연결한다.

### P1 — 부적합 원본 첨부는 접수 내용과 함께 공유되지 않음

- `js/intake_documents.js:50`의 prepareIntakeEvidence는 metadata/hash/storageKey를 중앙 상태에 포함시키지만 원본은 `js/views/d4_evidence.js:71`의 브라우저 IndexedDB에 저장한다.
- 재현: 별도 브라우저에서 접수 metadata는 보이고 같은 storageKey의 원본 조회는 false였다.
- 우선 조치: 원본을 중앙 파일 저장소에 보관하고 Case/접수 권한을 검사하는 다운로드 API로 제공한다.

### P2 — 외주사 AI 심의는 문서 본문 판독이 아닌 데모/파일명 규칙

- `js/views/supplier_ai_audit.js:97`은 750ms 타이머 뒤 benchmark 또는 generateDynamicSupplierAudit를 렌더한다.
- `:127` 이후는 파일명에 hast/1000이 있는지 등을 보고 점수·누락을 만든다. 실제 원본 본문·측정값을 분석하지 않는다.
- 이번 항목은 코드 점검으로 확인했다. 실모델 품질을 검증한 결과로 해석하면 안 된다.

## 추가 운영 경계

- `portal_server.py:34`, `:424`, `:937`: 기본 서버는 127.0.0.1에 바인딩하고 로컬 Host를 제한한다. 현 launcher 구성만으로 다른 사내 PC/외주사 PC에 접속 URL을 제공하는 배포는 완료되지 않았다. 외부 네트워크 접속 시험은 하지 않았다.
- 신규 임시 DB에서 전략소싱 담당 `lhyduddlgk`의 기본 검증 비밀번호 로그인은 401이었다. 초기 seed 계정에 해당 담당이 없는 것으로 확인된다. 운영 DB의 개별 계정/비밀번호 상태는 확인하지 않았다.
- 이메일 실제 송신 비활성화는 사용자 결정에 따른 유지 사항이며 이번 평가의 결함으로 계산하지 않는다.
- 기존 외주사 E2E는 benchmark 화면 중심이고, 서로 다른 PC/계정의 제출→수신→심의→원본 열람을 증명하지 않는다. 기존 35개 Python 테스트도 이번에 드러난 후반 UI 자동 승인과 외주 localStorage 공유 경로를 검사하지 않는다.

## 다음 작업 및 완료 기준

1. 후반 Sprint/보완요청의 실측·완료·서명 임의 입력 차단, 실제 서버 승인 이벤트 검증 강화.
2. 외주 ticket와 모든 접수 원본을 중앙 DB/파일 저장소로 통합하고 실제 파일만 첨부하도록 구현.
3. 외주 ticket→사내 Case 생성/선택→D2/D3 전계를 실제 Case ID로 연결.
4. 접수/심의 담당 계정과 업체별 접근권한을 준비하고 배포 Host/접속 경로를 결정.
5. 서로 다른 로그인/브라우저에서 '외주 제출 → 사내 조회 → 원본 열람 → 보완 요청 → 외주 재제출 → 실제 권한자 승인 → 올바른 8D Case → 보고서'를 검증.

실행: `node tests/audit_current_workflow.cjs`.
의존성: Node 24의 WebSocket/fetch, Python 표준 라이브러리, Windows Edge 기본 설치 경로. 경로가 다른 PC에서는 browser 실행 경로를 조정한다. 테스트 DB·프로필은 OS 임시 폴더에 생성되고 해당 실행의 브라우저/서버만 종료한다. 기존 서버를 중지하지 않는다.

이번 턴은 평가·재현·문서화만 수행했다. 업무 기능 수정, Git 커밋/Push, 이메일 송신, 외부 AI 자료 전송은 수행하지 않았다.