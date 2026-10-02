# 중앙 운영 기반 아키텍처

## 목적

기존 브라우저 `localStorage` 중심 프로토타입을 한 서버에서 여러 사용자가 공유할 수 있는 운영 기반으로 전환한다. 이메일 발송은 공급자 결정 전까지 명시적으로 비활성화한다.

## 구성

- `portal_server.py`: 동일 출처 HTTP API, 보안 쿠키, CSRF 검증, 정적 파일 제공
- `qms_backend.py`: SQLite 중앙 저장소, PBKDF2 비밀번호, 세션, 감사 로그, 결재 이벤트, Outbox, 유사 Case 검색, D1~D3 안전 초안
- `js/server_api.js`: 브라우저와 중앙 API 사이의 단일 어댑터
- `data/qms.sqlite3`: 로컬/공용 서버의 운영 DB. Git 비추적 대상

SQLite는 단일 사내 서버 또는 검증 환경에 적합하다. 동시 사용자와 데이터 규모가 커지면 `QMSStore` 인터페이스를 유지한 채 PostgreSQL 어댑터로 교체한다.

## 인증과 권한

- 비밀번호는 PBKDF2-SHA256 310,000회로 해시한다.
- 세션은 8시간 유효한 HttpOnly, SameSite=Strict 쿠키를 사용한다.
- 모든 변경 API는 CSRF 토큰과 동일 출처 검증을 요구한다.
- 화면 내 사용자 전환은 금지하며 로그아웃 후 실제 계정으로 다시 로그인한다.
- 역할은 `system_admin`, `quality_reviewer`, `case_facilitator`, `stage_drafter`, `stage_leader`, `stage_champion`, `customer_dispatcher`, `supplier_user`로 분리한다.
- 결재자는 Case에 지정된 이메일과 로그인 이메일이 일치해야 한다. 관리자 전결은 사유 10자 이상과 별도 감사 이벤트가 필요하다.

## 데이터와 감사

- 중앙 업무 상태는 revision 번호를 이용한 낙관적 잠금으로 저장한다.
- 다른 사용자가 먼저 저장하면 덮어쓰지 않고 `REVISION_CONFLICT`를 반환한다.
- 단계 기안 시 내용 스냅샷과 SHA-256 해시를 버전으로 보존한다.
- 인증, 저장, 결재, Outbox 준비 이벤트는 감사 로그에 남긴다.

## AI 안전 계약

- D1은 조직도와 Case 특성을 바탕으로 사람을 추천하되 `Human Review Required`로 남긴다.
- D2는 접수된 고객·제품·품번·LOT·현상·수량만 이용한다.
- D3의 ERP/MES/WMS 수량, 7-Area 흐름, 효과성은 확인 전 공란 또는 `Pending/Open`이다.
- AI는 단계 완료, 결재 완료, Evidence 확인, 고객 수락을 자동 생성하지 않는다.

## SLA 단일 규칙

- 고객사 규칙과 Triage `slaHours`가 모두 있으면 더 엄격한 값을 D3 기준으로 사용한다.
- 완료 판정은 데이터가 존재한다는 이유가 아니라 Gate의 실제 외부 송부 증빙 시각을 사용한다.
- D3/D5/D8의 조기·지연 시간과 종합 준수율은 같은 계산 결과를 모든 화면과 CoQ 계산에서 재사용한다.

## 단계별 SLA 에스컬레이션

중앙 서버가 D3·D5·D8 마감과 Gate의 실제 송부 증빙 시각을 비교한다.

- `L1_ATTENTION`: 전체 시간의 50% 이하가 남으면 Facilitator/송부 담당자에게 표시
- `L2_CRITICAL`: D3 4시간 또는 전체 시간의 10%, D5·D8 24시간 이하이면 품질검토자/Leader에게 표시
- `L3_OVERDUE`: 기한 초과 시 Champion/품질검토자/관리자에게 표시

이 이벤트는 중앙 DB와 감사 로그 및 역할별 화면 알림에만 기록된다. 외부 메시지나 이메일은 발송하지 않는다.
