# 화면 스타일 통일 및 결재 팝업 가독성 — 2026-10-02

후속 마무리 구현과 최신 실행/캐시/검증 결과는 [UI_COMPLETION_20261002.md](UI_COMPLETION_20261002.md)를 기준으로 한다. 아래 내용은 초기 통일 작업 이력이다.

## 적용 내용

사용자가 제시한 Agent Operations, 외주 품질/PCN, 품질 검토 대기함, D1 Workspace를 포함한 주요 업무 화면의 시각 기준을 맞췄다. 추가로 제시한 라이트 모드 D1 공식 중간 검토 리포트의 결재 담당자 영역도 수정했다.

- 공통 페이지 제목: qms-page-header. 중립 배경, 8px 테두리 모서리, 22px 제목(좁은 화면 20px), 13px 설명, 같은 아이콘/제목/동작 배치 기준.
- 모든 주요 페이지: 동일한 업무 영역 폭(최대 1600px), 16px 주요 간격. 기존 접수 960px/품질 검토 1120px 제한을 제거해 정렬을 맞췄다.
- 카드/필터/표/입력란/버튼: 공통 모서리·간격·글꼴·강조색 적용. 큰 배너의 그라데이션과 과도한 그림자를 줄이고, 수치와 Case/Lot 식별자는 기존 숫자 글꼴을 유지했다.
- Agent 패널: 다른 화면과 같은 카드·헤더 모양, 통계 카드 구성, 두 패널 높이, 보조 버튼 스타일. 기능 버튼과 권한 조건은 그대로다.
- 단계 화면: 공통 제목과 고객/제품/Case 참조를 추가하고 단계 탭·AI 보조 패널을 정리했다.
- 결재 팝업: signoff-box-wrap의 고정 어두운 배경을 테마 배경으로 전환하고 담당자·부서·상태를 명시적으로 테마 글자색과 연결했다. 화면이 좁으면 결재 셀을 세로로 배치한다.
- 팝업의 보고서 표는 해당 영역 안에서 스크롤하며, 담당자 정보·문서번호·품번·Lot은 줄바꿈한다. 보고서 원래 용지 구조는 인쇄에서 유지한다.

## 소스와 유지 기준

추가: css/ui_consistency.css. 기존 ui_readability.css 뒤에 로드한다.

수정: index.html, js/app.js, js/views/dashboard.js, intake.js, agent_operations.js, supplier_portal.js, workspace.js, evidence.js, actions.js, reports.js, autonomous_8d_agent.js, js/ui_readability.js, css/ui_readability.css, tests/theme_layout_audit.cjs.

새 페이지는 qms-page-header를 사용하고 기존 제목/설명/업무 버튼을 포함한다. 화면의 배경과 텍스트는 테마 변수를 사용한다. 보고서 용지와 업무 페이지의 색상/레이아웃을 구분하고 인쇄 규칙에 업무 제목을 추가 출력하지 않는다.

수정은 표시 구조와 스타일에 한정했다. 운영 Case/접수/첨부/담당자/조직도/품목/Lot/승인 이력 및 서버 저장 규칙을 바꾸지 않았다. 생산 Site 4개와 eMMC 이하영 Pro 고정 규칙도 유지한다.

## 검증

실제 Windows Edge를 임시 데이터베이스/브라우저 프로필에서 실행했다. 운영 DB에 테스트 접수나 승인을 저장하지 않았고 외부 AI/이메일 호출을 실행하지 않았다.

1. 주요 화면/기존 팝업/로그인/공식 외주사 4개 계정: 두 테마, 390~1600px 5개 폭으로 362개 화면 확인.
   - 첫 검증에서 새 활성 탭 배경 위의 다크 모드 대기 배지 대비 35건을 발견하여 수정했다.
   - 해당 D2~D8 × 5개 폭의 35개 화면을 재확인했다. 나머지 327개 통과 측정과 합쳐 최종 362개 검사 대상 대비/잘림/겹침/본문 가로 넘침 실패 0, 런타임 예외 0.
   - 메뉴 열기/닫기, 테마 저장, 경고 표시 및 3D/5D/8D 보고서 PDF 렌더링 확인.
2. 페이지 헤더/단계/결재 팝업 추가 검증: 167개 통과.
   - 사용자 예시 4개 페이지 × 두 테마 × 5개 폭의 40개 헤더에서 폭/테두리 모서리/배경/제목 크기·굵기·글꼴 일치 확인.
   - D1~D8 결재 팝업 × 두 테마 × 5개 폭의 80개, Submitted/LeaderApproved/Approved 모의 표시 상태 12개 포함.
   - 위 다크 D2~D8 대비 재확인 35개를 포함하며 기존 362개와 중복이다.
   - 검사 대상 대비/잘림/겹침/본문 넘침 실패 및 런타임 예외 0.
3. 마지막 접수 제목 배치 보정 후 빈 업무 화면: 두 테마 × 1280/390px에서 80개 통과.
   - 예시 데이터 재생성 없음, 공식 마스터 보존, 새로운 임시작성 및 직접 등록한 임시 Case/PCN이 두 차례 재로드 후 유지됨을 확인했다.
4. JS 문법, git diff --check 및 실행 중 서버가 최종 파일을 제공하는 것 확인.

검증 도구의 헤더 폭 측정에서 본문 padding/스크롤바를 제외하도록 바로잡았고, viewport 폭과 실제 헤더 폭을 구분했다. 추가 검증의 167개 브라우저 측정은 모두 완료/통과했으나 마지막 헤더 집계의 viewport 메타데이터 덮어쓰기 때문에 종료가 실패했다. 순서가 고정된 테마/viewport 그룹으로 그 메타데이터를 복구하여 40개 헤더의 공통 스타일 일치를 확인했다. 원래 측정값은 변경하지 않았다. 수정된 도구로 다음 실행 시 집계가 정상 동작한다.

자동 대비 검증은 HTML 텍스트를 대상으로 하며 SVG/그라데이션 내부 색 판정과 실제 업무 승인 E2E는 포함하지 않는다. 대표 화면 및 결재 팝업 스크린샷도 육안 확인했다.

## 검증 자료와 재실행

output/theme_layout_20261002/ 안의:
- consistency_first.json: 첫 362개 검증 및 최초 대기 배지 대비 문제.
- consistency_final.json: 167개 추가 검증과 40개 헤더 일치.
- consistency_coverage_verified.json: 최초 검사와 해당 대비 보정 재검사 결과를 명시적으로 합친 최종 362개 결과.
- consistency_empty_verified.json: 마지막 빈 화면 80개 및 저장 유지.
- consistency_final/ 및 consistency_empty_verified/: 관련 스크린샷.

전체 검사: node tests/theme_layout_audit.cjs.
페이지 통일/결재 팝업 검사: PowerShell에서 QMS_AUDIT_CONSISTENCY_ONLY=1과 QMS_AUDIT_LABEL을 설정해 같은 도구 실행.
빈 화면 검사: QMS_AUDIT_EMPTY_ONLY=1 및 별도 QMS_AUDIT_LABEL로 실행.
서로 다른 검사 모드 환경 변수는 동시에 설정하지 않는다.

## 백업과 실행

변경 전 사본: backups/ui_consistency_20261002_100608/ . 이전 미커밋 작업 내용을 포함하여 보존했다.

서버: http://127.0.0.1:8765/ . 서버 재시작 없이 새로고침하면 적용된다.
캐시: ui_consistency.css 20261002_consistency_v3, 표시 변경 JS 20261002_consistency_v2, ui_readability.css/js 20261002_theme_v5.

HEAD 823f585 / codex/production-foundation-no-email 기준 로컬 미커밋 상태. 패키지 설치, GitHub 업로드·공개 변경, 메일 발송 없음.
