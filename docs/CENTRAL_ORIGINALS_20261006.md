# 접수 원본·D4 분석 첨부의 QMS 서버 보관 — 2026-10-06

## 바뀐 것

| 첨부 경로 | 이전 | 지금 |
| --- | --- | --- |
| STEP 01 접수 원본 | 등록한 PC의 브라우저(IndexedDB) | QMS 서버 `intake_files` (접수번호 기준) → Case 생성 시 Case Evidence로 복사 |
| D4 품질도구 Evidence 양식의 "완성된 분석자료 직접 첨부" | 등록한 PC의 브라우저(IndexedDB) | QMS 서버 Case Evidence (`evidence_metadata` + `evidence_files`), D4 연결 |

두 경로 모두 원본 바이트와 SHA-256을 서버가 계산해 SQLite에 보관한다. 다른 사용자·다른 PC에서 열 수 있다.

## 접수 원본: Case가 없는 동안과 Case 생성 시

접수(STEP 01)에는 아직 Case가 없어 기존 Case Evidence API를 쓸 수 없다. 그래서 두 단계로 나눴다.

1. **접수 등록 시** — 브라우저가 파일마다 `POST /__api__/qms/intake-files`(접수번호, 파일)를 호출한다. 서버가 `intake_files`에 원본을 저장하고 파일 ID·크기·SHA-256·등록자·시각을 돌려준다. 모든 파일이 올라간 뒤에만 접수를 대기함에 등록한다(하나라도 실패하면 등록하지 않고 입력과 첨부를 화면에 유지). 접수의 `evidenceList` 항목은 `intakeFileId`로 서버 파일을 가리킨다.
2. **품질 검토** — 검토자는 대기함의 [원본 다운로드]로 `GET /__api__/qms/intake-files/{id}`에서 원본을 연다. 사내 계정만 가능하고 외주 계정은 403.
3. **승인 → Case 생성 시** — 브라우저는 Case를 저장한 뒤 `POST /__api__/qms/cases/{caseId}/intake-originals`를 호출한다. 서버가 한 트랜잭션에서
   - Case의 `sourceIntakeId`와 접수의 `triage.approvedCaseId`가 서로를 가리키는지 확인하고,
   - 접수 `evidenceList`의 `intakeFileId` 중 `intake_files`에 그 접수번호로 실제 저장된 파일만 `evidence_metadata`/`evidence_files`로 복사하고,
   - Case `evidenceList`에 항목을 추가한다(`stageScoped: true`, 연결 단계 D2·D3, 유형 고객 원본, `source: 접수 … 원본`, `uploadedBy`는 원래 올린 사람, `carriedOverBy`는 Case를 만든 검토자).
   - 감사 로그 `INTAKE_ORIGINALS_CARRIED`.

지킨 원칙:

- **Evidence를 만들어 내지 않는다.** 브라우저는 서버 보관 원본의 Evidence 항목을 Case에 직접 쓰지 않는다(`createCaseFromApprovedIntake`가 `intakeFileId` 항목을 제외). 이름·크기·해시는 서버 테이블에서 읽는다. 서버에 바이트가 없는 항목은 `missing`으로 돌려주고 Evidence로 등록하지 않는다. 다른 접수번호로 올라간 파일도 옮기지 않는다.
- **같은 파일을 두 번 옮기지 않는다.** 이미 옮긴 `intakeFileId`는 건너뛴다. 옮길 것이 없으면 상태와 revision을 바꾸지 않는다.
- **실패해도 다시 할 수 있다.** 복사가 실패하면 Case는 그대로 생성되고, D2 근거 자료 패널과 증거 저장소에 "접수 원본 n건이 아직 넘어오지 않았습니다 · [접수 원본 가져오기]"가 나온다. 그동안 D2의 접수자료 읽기는 접수 쪽 서버 원본을 직접 읽는다.
- 접수 쪽 원본(`intake_files`)은 복사 후에도 남는다. 대기함에서 계속 열 수 있다. 저장 공간은 파일당 두 벌이다.

## D4 분석 첨부

- 작성 창에서 파일을 고르면 그 창 안에만 둔다. **[Evidence 문서 저장]을 눌러야** `QMSApi.uploadCaseEvidence(caseId, file, 유형, ['D4'], 'D4 분석 양식 첨부 · 도구명')`으로 올라간다. [취소]하면 서버에 아무것도 남지 않는다.
- 유형은 Physical FA 도구만 `FA Analysis`, 나머지는 `User evidence`.
- 도구 행의 `artifact.attachments`에는 `serverFileId`·`sha256`이 들어간다. Report·미리보기는 서버에서 원본을 읽는다.
- 올리는 중 실패하면 분석 문서는 저장하지 않고 창을 유지한다. 이미 올라간 파일은 Case Evidence(D4)에 남고, 다시 저장하면 실패한 파일만 올린다.
- 첨부에서 빼면 그 분석 문서와의 연결만 없어진다. 서버 원본과 Evidence 목록 항목은 지우지 않는다(원본 삭제 경로 없음).
- 서버가 받는 원본 형식에 gif, bmp, ppt, pptx, doc, msg를 추가했다(D4 작성 창과 접수 화면이 이미 안내하던 형식). html·실행 파일 등은 계속 거부한다.

## 결재(스냅숏)에 미치는 영향

- 새 항목은 모두 `stageScoped`라서 연결 단계의 결재 내용에만 들어간다(js/approval.js `approvalContent`).
  - D4 첨부 → D4 내용만 바뀐다. D1~D3 결재와 3D 보고서 결재는 그대로다. D4 이후에 결재가 있었다면 기존 규칙대로 감사 이력에 보존하고 재검토 상태가 된다.
  - 접수 원본 복사 → D2·D3 내용에만 들어간다. D1(CFT) 결재는 그대로다. Case 생성 직후에는 결재가 없으므로 아무것도 무효화되지 않는다. 나중에 [접수 원본 가져오기]로 옮기면 D2부터 재검토가 되며, 화면이 먼저 확인을 받는다.
- 결재 기록 검사(`_verify_approval_claims`)는 건드리지 않았다.

## 이전 방식으로 등록된 파일

- 브라우저 IndexedDB(`ramos-qms-d4-files-v1`)는 **읽기만** 한다. 새로 쓰지 않고, 지우지 않고, 자동으로 서버에 올리지도 않는다.
- `storageKey`만 있는 항목은 "이전 방식 · 등록한 PC 브라우저에만 보관"으로 표시되고, 등록한 PC에서는 계속 열린다. 다른 PC에서는 원본이 없다는 안내가 나온다.
- 서버로 옮기려면 등록한 PC에서 원본을 내려받아 다시 첨부한다. 일괄 이전 기능은 만들지 않았다.
- 이전 방식의 접수 원본이 있는 접수를 승인하면 그 항목은 전과 같이 메타데이터만 Case로 가고(단계 한정 아님), 승인 안내에 건수가 표시된다.

## 제한

- 접수 등록이 원본 업로드 뒤 저장 단계에서 실패(다른 사용자의 선행 저장 등)하면 `intake_files`에 어느 접수에도 연결되지 않은 파일이 남을 수 있다. 화면에는 나타나지 않으며 지우는 기능은 없다.
- 접수 화면은 이제 서버가 받는 형식만 첨부할 수 있다(PDF·Word·Excel·PowerPoint·CSV·EML·MSG·TXT·이미지, 30 MB).
- 접수 원본 조회 권한은 Case Evidence와 같은 사내 역할 기준이다. 접수별 열람 제한은 없다.

## 파일

- 서버: `intake_files.py`(신규), `qms_backend.py`(`_original_from_payload`, 허용 형식), `portal_server.py`(경로 3개)
- 화면: `js/intake_documents.js`, `js/views/intake.js`, `js/views/d4_evidence.js`, `js/case_evidence.js`, `js/server_api.js`, `js/views/workspace.js`
- 테스트: `tests/test_intake_files_http.py`(신규 7건), `tests/test_evidence_http.py`(1건 추가), `tests/test_no_client_approval.py`(1건 추가)
