# 공개 경진대회 제출 구성 검토

작성일: 2026-10-01 KST
상태: 공개 조건을 반영한 검토·제안. 배포/업무 코드 변경 미수행.
작업 폴더: G:/내 드라이브/GPT_Place/Mario/14_AI_8D Report

## 사용자 조건과 결론

사용자는 회사 서버가 없고 경진대회 제출을 비공개로 할 수 없다고 정정했다. 비공개 GitHub 저장소를 전제로 했던 이전 제안은 공개 저장소 기준으로 바꾼다.

공개 GitHub 소스·공개 접속 URL·공개 시연 데이터와 관리형 클라우드의 접수/첨부/결재 처리는 함께 구성할 수 있다. 프런트엔드뿐 아니라 DB 스키마, 접근 정책, 승인 API, 배포 설정, 검증 코드도 제출 저장소에서 공개한다. 인증키는 서비스의 Secret 설정에 두고 예제 설정에는 변수 이름/설정 방법을 제공한다.

특정 경진대회 규정은 아직 제공되지 않았다. 대회명/안내 링크와 소스·화면·데이터 공개 범위를 비동기 질문으로 요청했다. 외부 관리형 클라우드/AI 사용 허용, 심사 중 로그인·클라우드 호출 여부는 공식 규정 확인 전 미확정이다. 기술적으로 가능한 것과 대회 적합성 확인을 구분한다.

## 실제 확인한 현재 상태

- Git remote: https://github.com/marioai005-00/ramos-ai-qms-8d-anti.git
- GitHub 공개 REST API의 visibility=public, private=false, default_branch=main, has_pages=true를 확인했다. 인증 토큰을 사용하지 않은 읽기 전용 조회다.
- 공개 Pages https://marioai005-00.github.io/ramos-ai-qms-8d-anti/ 는 HTTP 200/text/html이다.
- 동일 사이트의 /__api__/auth/me 는 HTTP 404다. HTTP 수준 확인이며 로그인·시연 전체를 브라우저로 검증한 결과는 아니다.
- js/server_api.js는 동일 출처 /__api__/auth 및 /__api__/qms에 연결한다. js/app.js는 서버 로그인에 성공해야 업무 화면을 초기화한다.
- portal_server.py는 현재 Python 로컬 서버이며 127.0.0.1/localhost Host만 허용한다. qms_backend.py는 SQLite 저장소다.
- .gitignore는 .env, data SQLite, output, backups를 제외한다. 현재 Git 추적 목록에서 .env/SQLite 파일은 나오지 않았다. 이것은 전체 Git 이력의 비밀값 검사가 아니다.
- Git은 input의 재고/조직도 Excel 7개를 추적하고, 코드/문서에는 실제 사내·외주 담당자 및 연락처 참조가 있다. 공개 제출 자료 검토 대상이다. 이번 검토에서 Excel 본문을 읽거나 GitHub의 과거 유출 여부를 판정하지 않았다.
- 기존 공유·원본 첨부·임의 PASS/승인 문제는 수정되지 않았다. 호스팅 변경으로 자동 해결되지 않는다.

## 권장 공개 제출 구성

| 요소 | 공개 제출/동작 방식 |
| --- | --- |
| 소스 | GitHub Public. 화면, API 코드, SQL migration/RLS, 테스트, 배포 방법 공개 |
| 화면 | Cloudflare Pages에 공개 URL 배포. GitHub 공개 저장소와 연결 |
| 로그인·접수·이력 | Supabase Auth/Postgres. 부적합, 외주 ticket, 보완 버전, Case 연결, 결재 이벤트 중앙 저장 |
| 원본 첨부 | Supabase Storage. 접수/버전/Case와 실제 파일 ID·해시 연결 |
| 승인·AI API | Supabase Edge Functions 등 관리형 함수. 실제 호출자·역할·지정자·순서·버전 확인 |
| 재현 자료 | 합성 접수 JSON, 공개 허용된 시험/사진/Excel/PDF, schema/seed와 검증 절차를 공개 |
| 인증키 | 클라우드 Secret. 공개 예제 설정에는 이름/설정 절차만 작성 |

회사에 서버 장비를 설치하지 않아도 되지만 처리 자체는 관리형 클라우드 서버에서 실행된다. 공개 저장소가 자동으로 공용 DB가 되는 것은 아니다.

GitHub Pages를 화면 호스트로 계속 쓰는 것도 기술적으로 가능하지만 별도 API URL·인증·CORS 연결이 필요하다. 권장안은 앞선 제안의 Cloudflare Pages+Supabase 구성을 공개 소스 기준으로 적용한다. Supabase Edge Functions는 TypeScript/Deno이므로 Python/SQLite 코드를 그대로 업로드해 실행할 수 없다. 업무 API 계약과 검증 규칙을 이식해야 한다.

## 심사 체험과 공개 자료

- 기본 공개 체험은 합성 접수/원본만 사용한다. 모든 공개 fixture와 보고서에 DEMO/합성 표시 및 출처를 제공한다. 실제 운영 측정·완료·승인으로 오해하게 표현하지 않는다.
- 공개 read-only 예시와 새 시연 작업공간을 제공한다. 심사자가 새 작업공간에서 외주·품질·결재 역할을 체험하게 하되 모든 작업은 해당 DEMO workspace에만 적용한다.
- 다른 PC에서 동일 접수/원본을 확인하는 공유 체험은 공개 URL의 같은 DEMO workspace에 들어가 별도 역할 세션으로 검증한다.
- 시연 결재는 실제 누른 체험 세션/시연 역할/시각/버전으로 기록한다. 실제 직원 이름의 서명을 자동 생성하지 않는다. AI 초안 반영은 단계 승인과 별개다.
- 공개 접속 편의와 무제한 쓰기는 다르다. 호출자가 다른 workspace/다른 업체 자료를 덮어쓸 수 없도록 API/DB 권한, 서버 지정 결재자, revision/멱등성, 파일 크기·횟수·보존 한도를 적용한다.
- 공식 외주사 4곳 및 사용자가 확정한 마스터를 기존 운영 자료에서 임의 교체하지 않는다. 공개용 fixture/연락처 설정은 운영 마스터와 분리해 준비하고 공개 범위를 확인한다. 현재 파일을 자동 삭제/변조하지 않았다.
- 모델 연결이 없는 재현 모드는 저장된 예제 응답으로 명시하고 실제 실시간 AI로 표시하지 않는다. 실시간 AI는 서버 Secret/호출 한도/제공자 설정이 필요하고, 실제 연결 검증 전 작동한다고 주장하지 않는다.
- 외부 이메일은 계속 비활성. 사용자 결정 없이 초대/알림 이메일도 발송하지 않는다.

## GitHub만 쓰는 경우의 한계

1. 공개 코드·시연 파일·설명·완성 예시 보고서는 GitHub로 보관할 수 있다.
2. 공개 Issues와 첨부를 이용한 접수/검토는 가능하나 참가자 GitHub 계정이 필요하고 현재 포털 계정/권한/결재 체계와 다르다.
3. GitHub Contents API로 JSON/파일을 쓰는 것도 가능하나 쓰기 인증과 충돌 처리, 앱 권한 분리가 필요하다. 공용 쓰기 토큰을 브라우저에 넣는 방식은 채택하지 않는다.
4. 서버 없는 정적 시연의 브라우저 저장은 해당 브라우저의 데이터다. 다른 PC 공유 저장·중앙 결재가 가능하다고 표시하지 않는다.
5. 규정이 외부 클라우드를 금지한다면 공개 저장소+로컬 Python 실행+합성 DB seed로 기능 재현을 제공한다. 이때 온라인 중앙 공유는 실행 중인 로컬 서버의 접속 범위에 한정됨을 명시한다.

## 수정 순서와 통과 조건

1. 기존 WORKFLOW_FIX_PLAN_20261001.md 1단계의 임의 PASS/완료/서명 차단과 서버 승인 검증부터 완성한다.
2. 공개용 데이터/원본/설정 allowlist를 만들고 개인 연락처·재고/조직도 자료·과거 Git 이력의 공개 범위를 점검한다. 공유 원본과 기존 Git 이력을 자동 변경하지 않는다.
3. 기존 QMSApi 인터페이스를 유지할 수 있는 클라우드 adapter와 단건 ticket/Case/첨부 API를 구현한다. 파일 이름이나 클라이언트 Approved 값으로 실제 원본/결재를 판정하지 않는다.
4. DB migration/RLS, 승인 함수, seed/샘플 원본, DEMO 작업공간 관리와 배포/초기화 방법을 함께 공개한다. 일반 state 저장으로 승인 이벤트를 위조할 수 없어야 한다.
5. 별도 역할 세션의 접수→실제 첨부→다른 PC 조회→보완→PCN 심의→필요한 Case 생성/연계→D단계 실제 체험 결재→버전 보고서를 검증한다.
6. 첨부 해시 일치, 타 업체/workspace 차단, 중복/동시 수정/실패 재시도, 잘못된 결재자/변조 필드 차단, 변경 후 재검토, AI와 이메일 비활성/실행 상태 표시에 대한 회귀 테스트를 통과시킨다.
7. 대회 공식 규정 확인 후 배포 플랫폼/접속 방식/공개 범위를 확정한다. 이번 턴은 조회·제안 문서만 작성했고 push·visibility 변경·배포·키 생성·외부 AI 호출을 수행하지 않았다.

## 근거 문서

- GitHub Pages 정적 호스팅: https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages
- GitHub Contents 쓰기 인증/동시 작업 제약: https://docs.github.com/en/rest/repos/contents
- Cloudflare GitHub 연결 배포: https://developers.cloudflare.com/pages/configuration/git-integration/
- Cloudflare 함수/Secret: https://developers.cloudflare.com/pages/functions/bindings/
- Supabase 공개 가능 키와 서버 Secret 구분: https://supabase.com/docs/guides/getting-started/api-keys
- Supabase DB 권한: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase 원본 접근 제어: https://supabase.com/docs/guides/storage/security/access-control
- Supabase 서버 함수: https://supabase.com/docs/guides/functions
