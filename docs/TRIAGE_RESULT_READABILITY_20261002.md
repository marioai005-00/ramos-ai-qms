# 품질 승인 결과 가독성 개선 — 2026-10-02

사용자가 제시한 품질 승인 완료 화면에서 긴 저장 의견이 한 문단으로 붙고 **강조 기호**가 그대로 보이는 문제를 수정했다. 승인 결과를 빠르게 확인한 뒤 필요할 때 전체 의견을 읽도록 표시 순서를 정리했다.

## 표시 방식

- 결과 상태 및 실제 저장된 판정자·판정 일시.
- 위험도, 8D 발행 여부, 초동 조치 SLA, 원인분석 주관부서의 공통 요약 행.
- 기본 접힌 ‘품질 검토 의견’. 펼치면 원본의 문단, 줄바꿈, 번호 제목, 글머리/번호 목록, 굵은 글씨, 코드 텍스트, 인용문을 표시한다.
- 연결된 Case 번호와 ‘8D Case 열기’ 버튼.
- 좁은 화면에서 요약은 2열, 판정자와 버튼은 자연스럽게 줄바꿈. 라이트/다크 테마 변수 사용 및 기존 상태 배지 대비 보정.

전체 저장 의견을 새로 요약하거나 잘라 저장하지 않는다. reviewNote 원문과 판정 값, 수량·품번·Lot·승인 이력을 변경하지 않는다. HTML/스크립트는 실행하지 않고 텍스트로 표시한다. 기존 서버의 사람 결재 및 권한 검증을 유지한다.

## 변경 파일

- js/views/intake.js: 저장 의견의 안전한 표시 함수 및 renderTriageDecisionResult.
- css/triage_result.css: 화면 전용 요약/의견/버튼/테마/반응형 스타일.
- index.html: 새 스타일 연결 및 triage_result_v3 캐시.
- tests/triage_result_audit.cjs 및 tests/theme_layout_audit.cjs: 독립 화면 검증 분기.

## 검증

독립 서버 DB와 Edge 프로필에서 실제 브라우저로 검사했다. 운영 업무 저장과 AI 공급자 호출은 차단했다.

- 기능 11개: 실제 저장 값, 의견 기본 접힘/펼침/접힘, 제목·목록·강조 표시, 수량·긴 품번/Lot·원본 유지, 원문 결론, 정확한 Case ID 동작, HTML 이스케이프, 일반 번호 목록/줄바꿈, 빈 의견, 반복 렌더링 시 원본 보존.
- 승인 접힘/승인 펼침/보완 펼침/반려 접힘/빈 의견/긴 의견 6상태 × 두 모드 × 1600/1280/768/390px = 48화면. 대비·잘림·겹침·본문 가로 넘침 실패 0, 런타임 오류 0.
- PNG 직접 확인: 라이트 1280 접힘 및 펼침, 다크 1280 펼침, 라이트 390 펼침.
- 수정 JS 및 검사 도구 문법, git diff --check 통과.

실행 예:

```powershell
$env:QMS_AUDIT_TRIAGE_RESULT_ONLY='1'
$env:QMS_AUDIT_LABEL='triage_result_verified'
$env:QMS_AUDIT_TRIAGE_SHOT='1'
node tests/theme_layout_audit.cjs
```

결과: output/theme_layout_20261002/triage_result_verified.json 및 같은 이름 폴더의 PNG. 상세 실행 로그: output/triage_result_verified.log.

## 적용 및 현재 상태

http://127.0.0.1:8765/ 에서 최종 index.html, CSS, JS가 디스크 파일과 일치하며 정상 제공된다. 서버 재시작은 필요 없었다. 작성 내용을 저장하고 새로고침하면 새 표시가 적용된다. 사용자 탭을 강제로 새로고침하지 않았다.

output/triage_readability_live_verified.json 의 읽기 전용 비교에서 업무 revision 396/stateHash 동일, Case/접수 각 1건을 확인했다. 이후 사용자의 정상 입력으로 revision은 변할 수 있다. 첨부·품목·Lot·공식 외주사/담당자·eMMC 주관자·Site 및 기존 내부 관리 기능을 유지했다.

화면 표시용 일부 Markdown만 지원한다. 전체 Markdown 표·중첩 목록·링크 렌더러가 아니며 저장 의견의 사실 정확성을 검증하는 수정도 아니다. 출력 보고서/PDF 변경 없음. 신규 의존성 없음. PC별 run_portal.bat/로컬 DB/자격 증명 설정 유지. GitHub commit/push/공개 변경 및 메일 발송 없음.

소스 기준 HEAD 823f585, branch codex/production-foundation-no-email. 기존 작업을 포함한 로컬 미커밋 상태. 변경 전 파일 사본: backups/triage_readability_20261002_123056. WORK_HANDOFF.md와 인수인계.md를 같은 턴에 갱신했다.
