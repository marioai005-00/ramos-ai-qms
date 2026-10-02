# 우리 회사 → 외주사 부적합 통보 관리

2026-10-02 · G:/내 드라이브/GPT_Place/Mario/14_AI_8D Report

## 완료된 기능

‘외주 품질 관리 → 부적합 통보 관리’에서 회사가 외주사로 전달할 부적합을 등록한다. 외주사에서 회사로 제출하는 기존 PCN·Issue와 별도의 중앙 기록이다. 새로운 운영 예시는 생성하지 않았다.

- 공식 외주사 선택과 확정 담당자·이메일 표시. 서버도 공식 계정을 기준으로 업체를 고정한다.
- 제목, 확인된 현상, 사내 주관/담당자, 생산 Site, 제품·품번·Lot, 발생 일시, 확인된 검사·불량 수량, 초동 조치, 외주 요청 사항, 회신 기한, 선택적 기존 8D Case 참조.
- 원본 사진·PDF·Excel·CSV·Word·EML·TXT 등 첨부/다운로드. 한 번에 10개·합계 30 MB. 통보 근거/회신/검토 자료의 출처·실제 업로더·SHA-256 구분.
- 검색/업체·상태 필터/기한 초과 표시, 공개 전 수정, 실제 로그인 계정에 따른 이력.

## 사용 순서

1. 사내 계정에서 ‘신규 통보 등록’을 누르고 대상 외주사·현상·요청 사항·회신 기한과 필요한 근거를 입력한다. 미확인 수량·원인은 빈칸으로 보관한다.
2. 등록하면 ‘통보 대기’다. 품질 검토 권한자가 ‘외주사에 공개 · 회신 요청’을 선택하면 해당 업체의 로그인 수신함에 게시되며 ‘회신 대기’가 된다.
3. 외주 담당자는 자기 업체 통보만 보고 ‘외주사 회신 등록’으로 조치·분석 자료를 첨부한다. 사이트 밖에서 받은 이메일/회의·유선 회신은 사내 담당자가 ‘별도로 받은 외주사 회신 기록’에서 실제 수신 경로·일시를 입력한다. 이 경우 기록자는 사내 담당자로 구분된다.
4. 회신 접수 후 품질 담당자가 검토를 시작하고, 추가 자료가 필요하면 ‘추가 회신 요청’을 선택한다. 원본 회신과 추가 회신은 함께 보존된다.
5. ‘검증 확인 · 종결’에는 실제 검증 내용과 회신/검토 Evidence 원본이 필요하다. 종결을 기록한 실제 품질 담당자를 표시한다. 필요한 경우 품질 담당자가 재검토를 시작할 수 있다.

등록·공개·회신은 8D 자동 발행/승인/조치 완료를 대신하지 않는다. Case 연결은 기존 Case 참조다. 공개는 사이트 게시이며 이메일 자동 발송이 아니다. 이메일 공급자가 결정되지 않았으므로 외부 발송은 계속 OFF다.

## 저장 및 권한

supplier_notices.py의 supplier_notices 및 supplier_notice_files와 인증 API /__api__/qms/supplier-notices를 사용한다. 중앙 SQLite에 원본·기록·감사 이력을 원자적으로 저장하고 충돌 revision을 검사한다. 기존 cases/intakeQueue/internal_quality와 외주 브라우저 기록을 변경하지 않는다.

사내 작성은 기존 내부 작성 역할, 공개/검토/종결은 system_admin 또는 quality_reviewer를 사용한다. 외주 계정은 thkwon/yspark/sangwook.ki/ojs의 공식 업체 매핑으로 조회·회신만 허용한다. 공개 전 초안과 타 업체 통보·원본·회신은 서버에서 차단한다. 폼의 수신 이메일이나 가짜 작성자를 신뢰하지 않는다. 변경 요청은 CSRF를 확인하며, 화면은 HTML을 이스케이프하고 로그인 전환 시 캐시·지연 응답을 분리한다.

## 검증

- Python 전체 60검사 통과: 기존 52개와 새 HTTP 8개. 실제 작성자·업체 매핑, 4업체 조회/회신/파일 범위, 공개 전 조회 차단, 로그인/CSRF/역할, 외주 직접/사내 기록 구분, 검토/추가 회신/종결/재검토, 검증 누락 차단, 충돌 원자성, 날짜·수량·파일·Case 참조 입력 오류 확인.
- 실제 Edge 기능 19개와 64화면: 라이트/다크 × 1600/1280/768/390px × 빈 목록·신규 등록·통보 대기·회신 대기·외주 회신 폼·회신 상세·검토·종결. 대비/잘림/겹침/본문 가로 넘침 실패 0, 런타임 오류 0. PNG 직접 확인.
- 실 계정 쿠키로 원본 바이트 다운로드·외주 회신·사내 별도 회신·누락 검증 차단·종결·새로고침 지속·고객 상태 불변 확인. 테스트는 독립 DB/프로필이며 운영 시험 통보/메일/AI 실행 없음.
- Python/JS 문법과 git diff --check 통과.

결과: output/supplier_notices_server_tests.log, output/theme_layout_20261002/supplier_notices_verified.json 및 PNG, output/supplier_notices_ui_verified.log.

화면 검증 실행 예:

```powershell
$env:QMS_AUDIT_SUPPLIER_NOTICES_ONLY='1'
$env:QMS_AUDIT_LABEL='supplier_notices_verified'
$env:QMS_AUDIT_NOTICE_SHOT='1'
node tests/theme_layout_audit.cjs
```

서버 검사 시 먼저 독립 QMS_DATABASE_PATH를 설정한 뒤 python -m unittest discover -s tests -p 'test_*.py'를 실행한다. 운영 DB에 시험 통보를 만들지 않는다.

## 현재 적용·실행 범위

같은 프로젝트의 http://127.0.0.1:8765/ 서버를 갱신했다. 작성 내용을 저장하고 새로고침하면 메뉴가 나타난다. 사용자 탭은 강제로 새로고침하지 않았다. 신규 의존성 없음. PC별 run_portal.bat·로컬 DB·자격 증명 설정을 유지한다.

현재 서버는 이 PC의 로컬 주소다. 서로 다른 계정으로 같은 서버에 접근하는 동작을 확인했으며 다른 PC/외부 협력사의 접속 주소나 네트워크 배포를 새로 제공·검증한 것은 아니다. 기존 수신 PCN/Issue의 브라우저 저장을 이번 기능으로 자동 중앙 이전하지 않았다.

재실행 직전/직후 revision 430/stateHash 일치, Case·접수 각 1건 보존. 신규 운영 통보·원본 각 0건. 최종 JS/CSS/index 동일 제공 및 신규 API 미로그인 401 확인: output/supplier_notices_live_verified.json. PID 6296.

소스 HEAD 823f585 / codex/production-foundation-no-email 기준 기존 변경 포함 미커밋. 통보 JS 캐시 supplier_notices_v2, app/공통 CSS supplier_notices_v1. 사본 backups/supplier_notices_20261002_130227. 주요 변경 파일 supplier_notices.py / qms_backend.py / portal_server.py / js/views/supplier_notices.js / index.html / js/app.js / css/internal_quality.css. GitHub 업로드·공개 변경 없음. AGENTS.md와 두 인수인계 문서 갱신.
