# 이메일 공급자 연결 준비 명세

## 현재 상태

외부 이메일 발송은 구현·활성화하지 않았다. 시스템은 승인된 보고서의 해시와 수동 송부 증빙을 `dispatch_outbox`에 다음 값으로만 기록한다.

- `status`: `PREPARED`
- `provider`: `UNDECIDED`
- `sent_at`: `NULL`
- `provider_message_id`: `NULL`
- API 응답 `externalSend`: `false`

현재 코드에는 SMTP, Gmail, Microsoft Graph 또는 다른 메일 공급자를 호출하는 경로가 없다.

## 향후 어댑터 계약

공급자가 결정되면 별도 모듈에 아래 계약을 구현한다.

```text
send(outbox_id, idempotency_key) -> {
  provider,
  provider_message_id,
  accepted_at,
  recipient_results[]
}
```

필수 운영 규칙:

1. `PREPARED → SENDING → SENT` 또는 `FAILED` 상태 전이를 DB 트랜잭션으로 처리한다.
2. Case/Gate/보고서 해시 기반 idempotency key로 중복 발송을 방지한다.
3. 재시도 횟수, 오류 코드, 공급자 메시지 ID를 감사 로그에 저장한다.
4. 수신자·참조자는 승인된 고객 연락처 마스터에서만 가져오고 발송 직전 사람이 확인한다.
5. 첨부 보고서의 SHA-256이 결재 스냅샷 해시와 일치해야 한다.
6. 비밀값은 OS 자격 증명 저장소 또는 서버 Secret Manager에 보관하고 `.env`나 Git에 저장하지 않는다.
7. 실제 발송 기능은 별도의 운영 플래그와 관리자 승인 없이는 활성화하지 않는다.

## 공급자별 후속 선택지

- 회사 메일 서버: 사내 SMTP 릴레이 정책, IP 허용목록, TLS, 반송함을 확인한다.
- Microsoft 365: Graph API 애플리케이션 권한, 공유 사서함, 감사/보존 정책을 확인한다.
- Gmail/Google Workspace: OAuth 서비스 계정/도메인 위임, 발송 한도, 보존 정책을 확인한다.

공급자 선택 후에도 화면과 결재 로직은 바꾸지 않고 Outbox consumer만 추가하도록 경계를 분리했다.
