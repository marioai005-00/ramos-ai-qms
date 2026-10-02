## 업로드 완료 확인 — 2026-10-01 22:15 KST

- snapshot commit: a860af2038fb29c679c1e8e69674c21d6441c978.
- 원격 main과 codex/production-foundation-no-email이 모두 snapshot commit과 일치했다. Git tree 9585be496bcd9d300c88ac8c0f0d7a5abbf843f8도 일치했다.
- 원격 269개 파일, input 10개를 확인했다. 조직도·재고 Excel 7개의 원격 원본 SHA-256이 로컬 원본과 모두 일치했다.
- 업로드 직후 작업 트리 clean. 상세 결과는 로컬 output/private_github_upload_20261001/snapshot_remote_verification.json에 보관했다.
- 이 완료 확인 기록은 후속 문서 커밋으로 함께 업로드한다. 최종 문서 커밋의 SHA는 git log -1과 원격 브랜치에서 확인한다.
- 저장소 기본 Private/Pages 비활성 정책을 유지한다. 시연 공개 일정은 아직 미확정이며 자동 예약을 생성하지 않았다.

# GitHub 비공개 업로드와 한시 시연 계획

작성일: 2026-10-01 KST
저장소: https://github.com/marioai005-00/ramos-ai-qms-8d-anti
작업 폴더: G:/내 드라이브/GPT_Place/Mario/14_AI_8D Report

## 사용자 최신 지시

2026-10-01 사용자는 현재 소스·조직도/임직원·외주사/고객사 담당자·재고 자료를 비공개로 업로드하고, 추후 경진대회 시연 시 1~2시간 공개 후 비공개로 되돌리는 운영 방향을 지정했다. 이전 PUBLIC_COMPETITION_DEPLOYMENT_20261001.md의 상시 공개 제출 전제보다 이번 지시를 우선한다.

비공개 전환과 업로드는 이번 턴에 수행한다. 시연 날짜·한국시간 시작 시각·1시간/2시간 유지 시간은 아직 제공되지 않았다. 비동기 질문으로 요청했으며 현재는 공개/비공개 자동 예약이 설정되지 않았다.

## 비공개 설정 확인

- Git의 저장된 인증으로 소유자 marioai005-00의 admin/push 권한을 확인했다. 인증값은 로그·문서·Git에 저장하지 않았다.
- 원래 Public이던 기존 저장소를 private=true/visibility=private로 전환하고 인증 API로 확인했다.
- 기존 GitHub Pages 설정을 docs/GITHUB_PAGES_RESTORE_CONFIG_20261001.json에 보존한 뒤 Pages 사이트를 비활성화했다. 사전 설정: legacy, main, /, HTTPS, custom domain 없음.
- 인증된 Pages 설정 조회는 404다. 비로그인 저장소 API와 기존 Pages URL도 HTTP 404를 확인했다.
- 전환 전 GitHub API의 공개 fork 수는 0이었다. 기존 다운로드/복사·캐시가 없었다는 뜻은 아니다.

## 업로드 범위와 보존

- 기존 Git 이력, 현재 작업 브랜치 codex/production-foundation-no-email, 최신 미커밋 소스/문서/테스트/검증 화면 및 Git 관리 업무 자료를 보존한다.
- input 10개 파일(재고/조직도 Excel 7개 및 조직도 JSON 3개)을 포함한다. 공식 외주사 4개 업체 및 확정 담당자 정보를 임의 교체하지 않는다.
- .gitignore가 제외하는 인증키/비밀번호/.env/로컬 SQLite·세션/백업/PC별 캐시·환경은 Git 업로드하지 않는다. 로컬 원본은 보존한다.
- 초기 점검 업로드 후보: 268개 파일, 45,385,085 bytes. 이 문서·정책·인수인계 추가 후 최종 수량은 Git tree 기준으로 확인한다.
- 파일별 원본 크기/SHA-256 목록은 로컬 output/private_github_upload_20261001/candidate_manifest.json에 기록했다. 이는 비공개 업로드 검증용 로컬 결과로 Git 제외다.
- origin/main은 기존 HEAD의 선조임을 확인했다(원격만의 커밋 0, 로컬 앞선 커밋 14). 이력을 덮어쓰지 않는 fast-forward 업로드로 main과 작업 브랜치에 보존한다.

## 검증 범위

- Python 기존 전체 테스트 35건 통과(26.630초).
- 비벤더 JavaScript 27개 node --check 통과.
- 업로드 후보와 Git 이력 blob 473개의 알려진 private key/GitHub token/AWS access key/AI provider key 패턴 검사에서 발견 사항 없음. 비밀값은 출력하지 않았다. 일반 문자열에 포함된 모든 비밀번호를 보증하는 감사는 아니다.
- 업로드 제한 초과 대형 파일·업로드 대상의 .env/SQLite·누락 경로 없음.
- 기존 공유/원본/임의 PASS·승인 문제는 미해결이다. 테스트 성공과 비공개 업로드를 업무 전 과정 정상 판정으로 해석하지 않는다.
- 업로드 완료 후 remote main/작업 브랜치 commit SHA와 tree, input 원본 blob 일치를 확인한다.

## 한시 공개 시연

사용자에게서 시작 일시와 유지 시간을 받으면 실행 환경의 관리자 권한과 공식 규정을 다시 확인하고 시연 공개 및 종료 후 비공개 전환/Pages 비활성화 일정을 준비한다. 현재는 미래 시연을 임의로 시작하거나 예약하지 않았다.

공개할 경우 저장소 코드뿐 아니라 과거 이력·업무 원본도 읽을 수 있다. 다시 비공개로 해도 공개 중 생성된 복사본/공개 fork를 회수하지 못한다. 이 효과를 사용자에게 설명했다. 실제 운영 자료는 비공개 보관하고 공개 시연본을 별도로 준비하는 것이 권고안이며, 사용자 지시 없이 원본을 삭제/변조하거나 대체 저장소를 생성하지 않았다.

공개 시연만으로 Python 백엔드가 GitHub Pages에서 실행되는 것은 아니다. 실제 접수·다른 PC 공유·원본 다운로드·단계 결재는 기존 수정 계획과 서버/관리형 클라우드 구현이 필요하다.

## 복원/점검 방법

- 비공개 여부: 관리자 인증 GitHub REST GET /repos/marioai005-00/ramos-ai-qms-8d-anti의 private/visibility 확인.
- Pages 복원 기준은 GITHUB_PAGES_RESTORE_CONFIG_20261001.json. 사용자 승인 일정 전에는 생성/활성화하지 않는다.
- 원격 업로드 확인: git ls-remote origin refs/heads/main refs/heads/codex/production-foundation-no-email; git rev-parse HEAD; git status --short.
- 실행: run_portal.bat. 검증: python -m unittest discover -s tests -p "test_*.py" -v.

근거: https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/setting-repository-visibility
