# 공식 외주사 및 담당자 관리 기준

사용자가 확정한 회사 외주사 목록이다. 2026-10-02 사용자 지시로 SSPC를 제외했다.

| 외주사 | 구분 | 담당자 | 시스템 계정 | 이메일 |
| --- | --- | --- | --- | --- |
| TechL | SMT 모듈 조립 | 권태훈 부장 | thkwon | thkwon@techl.co.kr |
| WinPAC | OSAT 패키지 | 박영수 차장 | yspark | yspark@winpac.co.kr |
| CTST | 테스트 하우스 | 오재수 그룹장 | ojs | ojs@ctst.co.kr |

## 적용 규칙

- 외주사 마스터·로그인 계정·PCN/Issue 접수·부적합 통보·조립 불량 기록에서 위 3개 업체와 담당자 정보를 기준으로 관리한다.
- TechL=SMT_MODULE, WinPAC=OSAT_PKG, CTST=TEST_HOUSE를 사용한다.
- 외주 계정은 해당 시스템 계정으로 업체를 매핑한다. 사내 접수자는 공식 업체 선택으로 업체·구분·담당자·이메일을 가져온다.
- 업체 분류, 담당자 및 이메일은 접수 폼에서 임의로 변경하지 않는다. 마스터 변경은 사용자 지시를 받아 수행한다.
- 제공되지 않은 공장/라인 및 전화번호를 생성하지 않는다.
- 이메일은 연락처 데이터다. 실제 송신 공급자 결정과 연결은 별도이며 현재 발송 비활성 상태를 유지한다.

## 반영 위치

- 서버: `supplier_notices.py`의 `SUPPLIERS`, `qms_backend.py`의 계정 seed와 승인 외주 계정 목록.
- 화면: `js/supplier_data.js`의 `MASTER_SUPPLIERS`, `js/data.js`의 preset, `index.html`의 로그인 빠른 선택.
- 목록에서 빠진 외주 계정은 서버가 시작할 때 비활성으로 바뀐다.

## 생산 Site 목록과의 관계

내부 Issue·PCN, 부적합 통보, 고객 접수 양식의 생산 Site 선택 목록(`TechL Vina`, `Winpac`, `SSPC`, `Ramos 3Camp`)은 외주사 마스터와 별개다. 이 목록의 SSPC는 그대로 있다.
