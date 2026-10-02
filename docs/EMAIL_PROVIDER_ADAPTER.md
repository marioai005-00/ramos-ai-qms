# 알림 메일 (SMTP)

2026-10-02 사용자 결정으로 SMTP 발송을 구현했다. 범위는 **사내 알림 메일**이다.

## 범위

| 구분 | 상태 |
|---|---|
| SLA 기한 알림 메일 (Case, 검토 대기 접수) | 구현. 기본은 기한 초과(L3) 단계만 |
| 시험 메일 | 구현. 화면에서 1통 발송 |
| 고객 보고서 송부 | 시스템이 보내지 않는다. 기존대로 외부에서 송부한 뒤 증빙을 기록하며 `dispatch_outbox`는 `PREPARED`·`UNDECIDED`로 남는다 |
| 외주사 통보 메일 | 미구현. 사이트 수신함 공개만 한다 |

## 설정 (`.env`)

값을 바꾼 뒤 서버를 다시 시작해야 반영된다. `.env`는 Git에 넣지 않는다.

| 키 | 설명 |
|---|---|
| `QMS_MAIL_PROVIDER` | `SMTP`여야 발송한다 |
| `QMS_EXTERNAL_SEND_ENABLED` | `true`여야 발송한다 |
| `QMS_SMTP_HOST`, `QMS_SMTP_PORT` | SMTP 서버 주소와 포트 |
| `QMS_SMTP_SECURITY` | `STARTTLS`(보통 587), `SSL`(보통 465), `NONE` |
| `QMS_SMTP_USER`, `QMS_SMTP_PASSWORD` | 로그인 계정. 계정이 비어 있으면 로그인 없이 보낸다 |
| `QMS_MAIL_FROM` | 보내는 주소. 비우면 로그인 계정을 쓴다 |
| `QMS_MAIL_TEST_MODE` | 기본 `true`. 켜져 있으면 모든 메일이 시험 수신자 한 명에게만 간다 |
| `QMS_MAIL_TEST_RECIPIENT` | 시험 수신자. 기본 `sjkim@ramostek.com` |
| `QMS_MAIL_SLA_LEVELS` | 메일을 보낼 SLA 단계. 기본 `L3_OVERDUE`. `L1_ATTENTION`, `L2_CRITICAL`을 쉼표로 추가할 수 있다 |

## 동작

- **시험 모드**: 실제 수신 대상과 관계없이 시험 수신자에게만 보낸다. 제목 앞에 `[QMS 시험]`이 붙고 본문 첫 줄에 원래 대상이 적힌다. 원래 대상은 발송 기록에도 남는다.
- **SLA 메일**: SLA 알림 기록이 새로 생길 때 보낸다. 알림 하나당 한 번만 보낸다. 대상은 그 알림의 역할을 가진 활성 계정의 이메일이다.
- **실패 처리**: 발송에 실패해도 SLA 평가는 계속된다. 결과는 `mail_log`에 `SENT`, `FAILED`, `DISABLED`, `NOT_CONFIGURED`, `NO_RECIPIENT`로 남고 감사 로그에도 기록된다.
- 메일은 DB 작업이 끝난 뒤에 보낸다. 메일 서버가 느려도 저장이 막히지 않는다.

## 화면

Agent Operations 상단의 **알림 메일 설정·시험**. 시스템 관리자와 품질 검토자에게만 보인다.

- 현재 설정(서버 주소, 계정, 보내는 주소, 시험 모드 여부)을 보여 준다. 비밀번호는 설정 여부만 표시한다.
- **시험 메일 1통 보내기**로 발송을 확인한다.
- 최근 발송 기록 30건.

## 구현

- `mailer.py`: 설정 읽기, SMTP 발송, `mail_log` 테이블, `MailerMixin`.
- API: `GET /__api__/qms/mail/status`, `POST /__api__/qms/mail/test`.
- `qms_backend.py`의 `evaluate_sla_escalations`가 새 알림을 `_mail_sla_escalations`에 넘긴다.
- 추가 패키지 없음(표준 라이브러리 `smtplib`).

## 검증

`tests/test_mail.py` 7건. SMTP 접속은 모의 객체로 대체했다: 기본 꺼짐, 시험 모드 수신자 고정, 기한 초과 알림 1회 발송, 낮은 단계 미발송, 실제 모드 수신자, 발송 실패 기록, 권한.

실제 SMTP 서버로 보내 본 적은 없다. 서버 정보가 입력되면 화면의 시험 메일로 확인한다.

## 실제 발송으로 전환하기 전에 정할 것

1. 메일을 보낼 단계 — 기한 초과만, 또는 임박 단계도.
2. 수신 대상 — 지금은 역할 보유자 전원이다. Case 담당자로 좁힐지.
3. 반복 — 지금은 단계당 한 번이다. 초과 상태가 이어지면 다시 보낼지.
4. 비밀번호 보관 위치 — 지금은 `.env`다. 운영에서는 OS 자격 증명 저장소 사용을 검토한다.
