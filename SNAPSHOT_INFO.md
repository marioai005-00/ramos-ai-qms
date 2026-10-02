# 2026-09-16 운영 기반 구현 완료 기준점

## 목적

이 폴더는 이메일 실제 발송을 제외한 중앙 DB·서버 인증·실결재·동적 D1~D3·유사 Case 검색·통합 SLA 구현이 완료된 시점의 복구용 기준점이다.

- 생성 시각: 2026-09-16 13:25:25 KST
- 원본 폴더: `G:\내 드라이브\AI_Place\Work\11_AI_Customer_Nonconformance_8D_System_Antigravity_1`
- 작업 브랜치: `codex/production-foundation-no-email`
- 자동 테스트: 17건 통과
- 이메일 상태: 실제 발송 미구현, Outbox `PREPARED`, 공급자 `UNDECIDED`

## 포함 범위

- 전체 애플리케이션 소스와 UI
- 중앙 QMS 백엔드 및 포털 서버
- 테스트와 운영 문서
- `data/qms.sqlite3` 기준 DB
- 기존 프로젝트 내부 백업 자료

## 제외 범위

- `.env` 비밀 설정
- `.git` 메타데이터
- `node_modules`, Python 캐시, 테스트 캐시
- 임시 `.diff`, `.patch` 파일

## 복원 방법

1. 현재 개발 폴더를 삭제하거나 덮어쓰지 말고 별도 이름으로 보존한다.
2. 이 기준점 폴더를 새 작업 폴더로 복사한다.
3. `.env.example`을 참고하여 해당 PC의 `.env`를 다시 구성한다.
4. `python -m unittest discover -s tests -p "test_*.py" -v`로 17개 테스트를 확인한다.
5. `run_portal.bat`로 실행한다.

이 기준점 폴더에서는 직접 개발하지 않는다. 이후 변경은 원본 작업 폴더에서 수행한다.
