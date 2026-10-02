# 페이지 디자인 통일 마무리 — 2026-10-02

## 목적과 결과

Evidence 첨부 구현을 마친 뒤 종료한 이전 작업에서, 사용자 요청인 전체 페이지 통일을 추가로 마무리했다. 기존 14번 프로젝트의 수정과 업무 데이터를 유지한다.

화면별 제목에 CSS만 붙이는 방식에서 공통 표시 부품 js/ui_components.js로 전환했다. 종합 현황/진행 Case, 신규 고객 부적합 접수, 품질 검토 대기함, 8D Workspace, Agent Operations, 외주 품질·PCN, Evidence, 통합 조치, 공식 리포트, AI 미션 컨트롤에서 동일한 아이콘 상자·제목·설명·참조번호·주요 동작 구성을 사용한다. 일반 공통 헤더는 42px 아이콘, 22px 제목, 13px 설명, 8px 모서리, 16px 주요 간격이며 좁은 화면에서는 크기와 배치를 조절한다.

Agent와 외주 PCN 통계 카드의 제목·수치·설명·높이·테두리·상태색도 공통화했다. 품질 검토 상세 정보와 D1 CFT 추천의 내부 간격/정보 순서/글꼴을 정리했다. D1~D8 탭은 같은 높이와 상태 위치를 사용하며 넓은 화면에서는 한 줄, 중간 폭에서는 3열, 작은 폭에서는 2열로 표시한다.

자료·결재 팝업의 버튼·입력란·글꼴을 정리했다. 기존 공식 결재 영역의 테마 대비 수정도 유지한다. 긴 품번·Lot·파일명은 읽을 수 있도록 줄바꿈/표 내부 스크롤을 사용하며 MINOR 및 PCN 통보 같은 짧은 상태는 단어가 끊기지 않도록 했다. 대표 스크린샷에서 확인한 모바일 Agent 헤더의 큰 빈 공간도 제거했다. 제목의 한글 단어가 불필요하게 끊어지지 않도록 화면 전용 규칙을 적용했다.

## 구현과 보존

- 새 공통 부품: js/ui_components.js의 renderQmsPageHeader, renderQmsMetric, renderQmsEmpty. 표시 전용이며 제목/설명/참조번호/배지 문자열을 이스케이프한다. 동작 HTML은 기존 화면의 고정 버튼과 권한 조건을 유지한다.
- 주요 파일: css/ui_consistency.css, js/views/dashboard.js, intake.js, workspace.js, agent_operations.js, supplier_portal.js, evidence.js, actions.js, reports.js, autonomous_8d_agent.js, js/app.js, index.html.
- 공통 UI/CSS 및 표시 변경 JS 캐시: 20261002_uniform_v2. 기존 Evidence 원본 API/JS/CSS는 evidence_v1 유지.
- 업무 Case/접수/첨부/담당자/결재 데이터, 회사 품목·Lot, 공식 외주사/계정과 생산 Site 4개, eMMC 이하영 Pro 배정 규칙을 변경하지 않았다. 신규 화면 표시를 위한 업무 예시를 운영에 등록하지 않았다.
- 화면 스타일은 @media screen에 한정해 출력 문서 구조를 유지한다. 추가 패키지 없음.

## 검증과 증거

Windows 실제 Edge를 임시 SQLite와 별도 프로필에서 실행했다. 운영 접수/승인 및 외부 AI/메일 호출은 실행하지 않았다. 시험용 Agent 실행·자료·알림·긴 품번은 표시 검증을 위한 데이터이며 실제 실행 성과가 아니다.

| 검증 | 결과 | 기록 |
| --- | --- | --- |
| 채워진 21개 페이지 구성 및 16개 팝업 × 다크/라이트 × 1600/1280/1024/768/390px | 370개 조합 통과, 헤더 비교 210개, 통계 구성 20개 그룹 일치, 대비/잘림/겹침/본문 넘침 및 작은 글자/런타임 오류 없음 | uniform_verified.json |
| 마지막 외주 표·헤더 단어 줄바꿈 보정 이후 해당 화면과 D1~D8 결재 팝업 | 120개 조합 재확인 통과 | uniform_final_details.json |
| 기존 전체 화면·로그인·팝업·4개 외주 계정/메뉴/테마 | 362개 통과. 메뉴 열기/닫기, 테마 유지, 경고 표시 확인. Gate 3D/5D/8D PDF 생성 확인 | uniform_regression.json |
| 빈 업무 화면 및 직접 등록 데이터 | 80개 통과. 마스터/이전 저장 복구 유지, 직접 작성한 임시 접수와 수동 PCN/Case 두 차례 새로고침 유지 | uniform_empty.json |
| Evidence 첨부 회귀 | 기능 21개·화면 12개 통과. 실제 원본 저장/다른 내부 계정 조회/다운로드 및 D2 검토 제한 확인 | uniform_evidence.json |

검사 간 화면 범위가 중복되므로 단순 합산 수치를 고유 화면 수로 사용하지 않는다. 자동 대비 측정은 HTML 텍스트 대상이며 SVG/그라데이션 내부의 자동 색 판정과 실제 업무 결재 E2E는 포함하지 않는다. Agent, 외주 PCN, 품질 검토, D1/D2 및 결재 팝업 대표 이미지도 눈으로 확인했다. 마지막 공통 한글 제목 규칙은 해당 120개 및 빈 화면/Evidence 회귀에서 재확인했다.

JavaScript 20개 파일 문법 및 git diff --check 통과. 수정 전 백업과 비교해 현재 작업의 변경은 표시 구성에 한정됨을 확인했다.

## 실행 상태와 자료

최종 적용 확인 중 기존 localhost 서버가 내려간 상태였으므로 같은 프로젝트/기존 DB로 숨김 백그라운드 서버를 다시 실행했다. 종료 원인은 확정하지 않았다. PID 28472, 주소 http://127.0.0.1:8765/ . __portal_status__의 프로젝트 경로와 최종 index/CSS/JS 14개 파일 바이트 일치를 확인했다. 재실행 전후 업무 revision 329, stateHash 및 Case 1건/접수 1건 동일. 관련 증거 uniform_live_verified.json 및 uniform_runtime_before.json.

현재 열린 사용자 탭은 작성 중인 내용을 잃지 않도록 강제로 새로고침하지 않았다. 작성 중이면 먼저 임시 저장한 뒤 새로고침하면 새 디자인을 불러온다.

검증 자료: output/theme_layout_20261002/의 위 JSON 및 uniform_verified/, uniform_final_details/, uniform_evidence/ 스크린샷. PDF는 uniform_regression 출력 안에 보관한다. 추가 검증 도구 tests/ui_design_audit.cjs는 tests/theme_layout_audit.cjs의 QMS_AUDIT_DESIGN_ONLY 분기에서 사용한다. QMS_DESIGN_VIEWS를 지정하면 영향 받은 화면만 선택해서 다시 점검한다.

재실행: PowerShell에서 원하는 단일 모드(QMS_AUDIT_DESIGN_ONLY, QMS_AUDIT_EMPTY_ONLY, QMS_AUDIT_EVIDENCE_ONLY 또는 전체 실행은 모드 없음)를 설정하고 QMS_AUDIT_LABEL을 지정한 뒤 node tests/theme_layout_audit.cjs 실행. 서로 다른 모드 변수를 동시에 설정하지 않는다. 필요한 Edge/Python/Node는 기존 PC 설치를 사용한다.

변경 전 사본: backups/ui_completion_20261002_104235/. 소스 HEAD 823f585 / codex/production-foundation-no-email, 이전 사용자 수정 포함 로컬 미커밋 상태. GitHub 업로드/공개 상태 변경은 이번 요청 범위에 없어 수행하지 않았다. WORK_HANDOFF.md와 인수인계.md에 최신 상태를 기록했다.
