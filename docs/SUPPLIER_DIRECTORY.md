# 공식 외주사 및 담당자 관리 기준

사용자가 2026-10-01 직접 재확정한 회사 외주사 목록이다.

| 외주사 | 구분 | 담당자 | 시스템 계정 | 이메일 |
| --- | --- | --- | --- | --- |
| TechL | SMT 모듈 조립 | 권태훈 부장 | thkwon | thkwon@techl.co.kr |
| WinPAC | OSAT 패키지 | 박영수 차장 | yspark | yspark@winpac.co.kr |
| SSPC | OSAT 패키지 | 기상욱 팀장 | sangwook.ki | sangwook.ki@sfasemicon.com |
| CTST | 테스트 하우스 | 오재수 그룹장 | ojs | ojs@ctst.co.kr |

## 적용 규칙

- 공식 마스터·로그인 계정·PCN/조립 이슈 접수에서 위 4개 업체와 담당자 정보를 기준으로 관리한다.
- TechL=SMT_MODULE, WinPAC/SSPC=OSAT_PKG, CTST=TEST_HOUSE를 사용한다.
- 외주 계정은 해당 시스템 계정으로 업체를 매핑한다. 사내 접수자는 공식 업체 선택으로 업체·구분·담당자·이메일을 가져온다.
- 업체 분류, 담당자 및 이메일은 접수 폼에서 임의로 변경하지 않는다. 마스터 변경은 사용자 지시를 받아 수행한다.
- 제공되지 않은 공장/라인 및 전화번호를 생성하지 않는다.
- 이메일은 연락처 데이터다. 실제 송신 공급자 결정과 연결은 별도이며 현재 발송 비활성 상태를 유지한다.

## 현재 반영 및 검증 — 2026-10-01

- `js/supplier_data.js`: 공식 업체별 계정 매핑과 구분 명칭, 계정 조회 helper.
- `js/views/supplier_portal.js`: 기타 협력사 선택 제거, 공식 계정/업체 기반 접수 metadata 고정. disabled 분류 select가 FormData에서 빠져도 올바른 분류를 저장한다.
- `js/views/sla_coq_engine.js`: 화면의 비공식 ASE 고정 문구 제거.
- `index.html`: 변경한 3개 JS 자산 캐시 버전 20261001_supplier_directory_v1.
- 기존 중앙 DB seed, 브라우저 preset, 로그인 빠른 선택의 4개 담당자/계정/이메일은 이미 이 표와 일치함을 확인했다. 비밀번호를 변경하지 않았다.
- Python 기존 회귀 테스트 35건 통과. Node 메모리 기반 검증에서 4개 계정의 PCN/Issue 구분·업체·담당자·이메일 매핑, 임의 폼 metadata 무시, 비등록 업체 차단 통과. 변경 JS 3개 문법 검사 통과.
- 이번 검증은 브라우저 렌더 전체를 다시 실행한 결과가 아니다. 앞선 접수 공유·원본 업로드·8D 자동 승인 문제는 이번 마스터 보정 범위에서 해결되지 않았다. 상세 미해결 항목은 `WORKFLOW_REVIEW_20261001.md` 참조.
- 소스: 브랜치 codex/production-foundation-no-email, HEAD 7b3b3ff 및 기존 미커밋 변경. 별도 패키지 추가 없음.

## 다른 PC에서 이어가기

이 프로젝트의 AGENTS.md/인수인계.md를 먼저 읽고, 중앙 서버는 run_portal.bat로 실행한다. PC별 비밀번호·인증키·DB 설정을 확인하되 문서와 Git에 기록하지 않는다.