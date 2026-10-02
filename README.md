## 최신 GitHub 보관 정책 — 2026-10-01

현재 저장소는 비공개이며 GitHub Pages는 비활성 상태입니다. 소스·문서·조직도/재고 등 Git 관리 업무 자료를 이 저장소에 보존합니다. 경진대회 한시 공개 계획은 [비공개 업로드·시연 관리 문서](docs/GITHUB_PRIVATE_UPLOAD_20261001.md)를 따릅니다. 아래 과거 Pages URL은 현재 공개 접속 주소가 아닙니다. 실제 포털은 run_portal.bat로 실행합니다.

## 2026-09 중앙 운영 기반

현재 버전은 중앙 DB와 서버 인증을 사용하므로 **`run_portal.bat`로 실행해야 합니다.** `index.html` 직접 열기나 GitHub Pages는 중앙 로그인·결재·공용 데이터 저장을 제공하지 않습니다.

구현된 운영 기능:

- SQLite 중앙 DB와 revision 충돌 방지
- PBKDF2 비밀번호, 8시간 HttpOnly 세션, CSRF 및 동일 출처 검증
- 화면 내 계정 전환 차단 및 실제 로그인 계정 기반 결재 권한
- 단계 내용 버전/해시, 결재 이벤트, 관리자 전결 사유, 감사 로그
- 접수 Fact 기반 D1~D3 검토 초안과 자동 완료·자동 승인 금지
- 종결 Case 기반 유사도 검색과 원인·재발대책 참고
- 고객사 규칙, Triage SLA, 실제 Gate 증빙 시각을 이용한 단일 SLA 계산
- 이메일 미발송 Outbox (`PREPARED`, `UNDECIDED`, `externalSend=false`)
- 중앙 Agent Runtime과 자연어·스케줄·Evidence 이벤트 기동
- 수집·표준화·검증·집계·상호 대조·위험 판정 Unit 실행 이력
- D1~D8 사람 검토용 초안과 실제 권한자 승인 후 revision 안전 반영
- Agent Operations Run Ledger, Data Quality Finding, Source Lineage, 내부 알림

### 실행

```powershell
Copy-Item .env.example .env
.\run_portal.bat
```

검증 환경의 초기 계정 비밀번호는 `.env`의 `QMS_DEMO_PASSWORD`로 지정합니다. 운영 전에는 계정별 비밀번호 정책 또는 사내 SSO/AD 연동을 확정해야 합니다.

### 이메일 관련 중요 사항

이 버전은 이메일을 보내지 않습니다. 사용자가 외부에서 송부한 증빙을 기록하고 공급자 미정 Outbox 항목만 만듭니다. 회사 SMTP, Microsoft 365 Graph, Gmail/Workspace 중 방식을 결정한 뒤 [이메일 공급자 연결 명세](docs/EMAIL_PROVIDER_ADAPTER.md)에 따라 별도 어댑터를 연결합니다.

### 테스트

```powershell
python -m unittest discover -s tests -p "test_*.py" -v
python -m py_compile portal_server.py qms_backend.py agent_runtime.py
```

상세 구조는 [중앙 운영 기반 아키텍처](docs/PRODUCTION_FOUNDATION.md), [Agent Unit 통합 플랫폼](docs/AGENT_UNIT_PLATFORM.md), 최신 상태는 [인수인계](인수인계.md)를 참고합니다.

# 11_AI_Customer_Nonconformance_8D_System

**AI 기반 고객사 부적합 관리 및 8D 종합 문제 해결 지원 플랫폼 (AI-QMS 8D Commander)**

---

## 🎯 시스템 핵심 개요 & 철학 (Quality Problem Solving Philosophy)

본 시스템은 단순히 **AI가 8D Report 문구를 작성해 주는 생성기**가 아니라,  
> **부적합 접수 → 초동조치 → 원인분석 → 개선 → 효과검증 → 재발방지 → 고객 8D Report 발행까지 하나의 Case로 관리하는 품질 문제 해결 통제 및 지원 시스템**

입니다.

### 5대 데이터 요소 분리 관리 (Zero Confusion Rule)
1. **Fact (사실)**: 5W2H, IS/IS-NOT, 측정값(PPM, 불량수량, 전압/전류) 등 실제 계측/확인된 사실
2. **Hypothesis (가설)**: 아직 검증되지 않은 초동 원인 추정치 (D2와 분리된 Initial Working Hypothesis로 관리)
3. **Evidence (증거)**: 물리적/전기적 사실을 입증하는 X-Ray, SEM, CS, Decap, Log, IV Curve 등 고유 ID 발급 및 D단계 다중 연결
4. **Action (조치)**: D3 긴급봉쇄, D4 FA분석, D5 PCA, D6 검증, D7 수평전개 등 Action 단위 개별 추적
5. **Conclusion (결론)**: 물리/전기 증거 및 인과관계 충족 시에만 `Confirmed Root Cause`로 승격

---

## 🚀 킬러 피처 & 세부 아키텍처

1. **STEP 01. 부적합 접수 & Severity 판정 엔진**:
   - 고객사 Claim 인입 시 Line Stop, Safety Risk, 재발 여부를 기반으로 **8D 필요 여부 / 긴급 대응 Level / 24h SLA Due Date** 자동 판정
2. **D1 ~ D8 전 주기 워크스페이스 & 3단 레이아웃 (3-Pane Workspace)**:
   - **좌측/중앙**: 5W2H Fact, 7대 Material Flow 봉쇄 테이블, 5-Why 발생/유출 인터랙티브 트리, PCA 대책 비교 선정 매트릭스, Before/After 실증 통계, 시스템 문서 개정(DFMEA/PFMEA/CP) 및 수평전개
   - **우측**: **AI Quality Assistant Side-Panel** (필수 필드 누락 검출, 수량/Lot 모순 검증, 미연결 증거 경고, 대책 후보 추천)
   - **하단**: Evidence Bar, Action Tracker, Multi-level 결재 라인
3. **AI 가드레일 (Never-Do Rules) 강제**:
   - 시험하지 않은 임의 PASS 날조 금지, 근거 없는 0% 표현 금지, *"확인된 Affected Lot 및 관리대상 재고에 대한 출하 차단·격리·선별 조치 완료"* 표준 문구 자동 적용
4. **3단계 맞춤형 공식 리포트 체계 (A4 / PDF / 인쇄 완결형)**:
   - **Initial 3D Report**: 24h 초동 회신용 (워터마크: `INITIAL REPORT – ROOT CAUSE UNDER INVESTIGATION` 및 Open Action 포함)
   - **Interim 5D Report**: Root Cause 확정 및 PCA 선정 공유용
   - **Final 8D Report**: Before/After 실증 검증, 수평전개, 5단계 결재 서명 포함 공식 고객 제출용

---

## 🌐 타인/외부 사용자 접속 및 실행 방법 (Access & Verification Guide)

### 방법 1. GitHub Pages UI 참고
아래 주소는 과거 정적 UI 참고용입니다. 중앙 로그인, 공용 DB, 실제 결재, 감사 로그는 동작하지 않으므로 업무용으로 사용하지 않습니다.
* **웹 데모 접속 URL**: [https://marioai005-00.github.io/ramos-ai-qms-8d-anti/](https://marioai005-00.github.io/ramos-ai-qms-8d-anti/)

### 방법 2. Git Clone 및 로컬 실행 (Full Python + AI Server)
```bash
# 1. 저장소 클론
git clone https://github.com/marioai005-00/ramos-ai-qms-8d-anti.git
cd ramos-ai-qms-8d-anti

# 2. 로컬 포털 원클릭 실행 (Windows)
run_portal.bat

# index.html 직접 열기는 지원하지 않습니다. 반드시 서버로 실행하세요.
```

---

## 🔑 데모 로그인 계정 안내 (Demo Accounts)

검증용 초기 비밀번호는 `.env`의 `QMS_DEMO_PASSWORD`입니다. 값을 지정하지 않은 개발 환경만 `1`을 사용하며 운영 전 반드시 교체해야 합니다.

| 사내 계정 ID | 성명 / 직급 | 역할 및 권한 (RACI) | 결재/전결 권한 |
| :--- | :--- | :--- | :--- |
| **`sjkim`** | 김성중 Senior Pro | 시스템 관리자·품질 검토·Facilitator | 지정자 불일치 시 사유를 남긴 관리자 전결 |
| **`jhpark`** | 박재환 팀장_S.Pro | Drafter / FA Lead | 지정 단계 기안 |
| **`eunsan.lee`** | 이은산 센터장_상무 | Drafter / Containment | 지정 보고서 1차 결재 |
| **`hskim`** | 김현수 실장_상무 | Stage Leader | 지정 Leader 결재 |
| **`sahwang`** | 황승안 팀장_상무 | Stage Champion | 지정 Champion 결재 |
| **`gh8229`** | 박정훈 부문장_전무 | Leader / Champion | 지정 Gate 결재 |
| **`thkwon`** | 권태훈 부장 (TechL) | 외주 협력사 사용자 | 협력사 포털 |
| **`yspark`** | 박영수 차장 (WinPAC) | 외주 협력사 사용자 | 협력사 포털 |
| **`sangwook.ki`** | 기상욱 팀장 (SSPC) | 외주 협력사 사용자 | 협력사 포털 |
| **`ojs`** | 오재수 그룹장 (CTST) | 외주 협력사 사용자 | 협력사 포털 |

---

## 🔄 프로젝트 작업 인수인계

* 이 프로젝트의 변경 이력과 다음 작업은 같은 폴더의 **`WORK_HANDOFF.md`**를 기준으로 합니다.
* 마스터 `Work` 폴더에는 공용 인수인계 파일을 만들지 않으며, 다른 프로젝트의 기록과 섞지 않습니다.
* 의미 있는 수정·추가·삭제가 발생할 때마다 코드 변경과 같은 작업 턴에서 `WORK_HANDOFF.md`도 함께 갱신합니다.

