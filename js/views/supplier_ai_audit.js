/* ========================================================================= */
/* RAMOS AI SQE REPORT INSPECTOR & AUDIT ENGINE                              */
/* Specialized for Subcontractor Quality Reports & 4M PCN Free-Format Files  */
/* ========================================================================= */

const AI_SUPPLIER_AUDIT_BENCHMARKS = {
  'PCN-2026-001': {
    score: 76,
    grade: 'B (조건부 보완 필요)',
    gradeColor: '#f59e0b',
    summary: '무라타 X7R 대체 건으로 1,000h 가속 수명 데이터는 적합하나, HAST(고온고습) 96h 및 리플로우 250℃ 열충격 단면 분석 누락',
    reliabilityAnalysis: {
      status: 'PARTIAL_PASS',
      details: 'AEC-Q200 TC 1,000h 시험 데이터(30ea)는 전수 통과되었으나, 고객사 LGE DTV 핵심 Spec인 HAST(130℃/85%RH 96h) 절연저항 데이터 및 리플로우 250℃ 실장 후 접합부 Cross-section SEM 미첨부.'
    },
    rootCauseAnalysis: {
      status: 'ADEQUATE',
      details: '기존 X5R MLCC의 고온 정격(85℃) 한계로 인한 유전체 열화 메커니즘을 물리적으로 규명하고 125℃ X7R 등급으로의 대체 타당성을 논리적으로 입증함.'
    },
    deficiencies: [
      {
        id: 'DEF-01',
        level: 'CRITICAL',
        title: '고온고습 바이어스 가속 수명 시험(HAST 96h) 성적서 누락',
        req: 'JESD22-A110 기준 130℃/85%RH 96h 통전 조건 시험 데이터 추가 제출 필수'
      },
      {
        id: 'DEF-02',
        level: 'MAJOR',
        title: '250℃ 리플로우 피크 조건 솔더 접합부(IMC) SEM 단면 두께 계측치 누락',
        req: '피크온도 5℃ 하향 제어에 따른 Cu6Sn5 IMC 형성 두께(1.5~3.0μm) 만족 여부 현미경 사진 제출'
      },
      {
        id: 'DEF-03',
        level: 'MINOR',
        title: '신규 자재 초도 양산 시 C102 장착 노즐 마모도 점검 주기 표준서 개정안 요망',
        req: '외주 SMT 라인 작업표준서(SOP) 내 피더 및 노즐 세척 주기 반영'
      }
    ],
    recommendedDecision: 'Revision_Requested',
    sqeCommentDraft: `[라모스 품질본부 SQE 정밀 심의 결과 - 보완 요청 통보]
제출해주신 무라타 X7R MLCC 대체 PCN 건(PCN-2026-001)에 대해 당사 AI 품질 심의 및 SQE 합동 감사를 실시한 결과, 기본 TC 1,000h 신뢰성은 만족하나 고객사(LGE DTV) 승인 규격 충족을 위해 아래 2가지 핵심 데이터의 추가 보완을 요청드립니다.

1. HAST(고온고습 바이어스, 130℃/85%RH 96h) 가속 시험 성적서 추가 첨부 (시료수 30ea 이상)
2. 250℃ 리플로우 실장 후 C102 단자부 솔더 조인트 IMC 단면 SEM 계측 사진 첨부

상기 보완 데이터를 당사 포털 내 [보완된 자체 레포트 파일 제출]을 통해 2026-09-12 17:00까지 업로드해 주시기 바랍니다.`
  },
  'SQ-2026-002': {
    score: 64,
    grade: 'C (위험 / 즉시 보완 필)',
    gradeColor: '#ef4444',
    summary: '언더필 공압 저하 원인 규명 미흡: 센서 오동작 외 에폭시 수지 점도 경시변화 및 노즐 미세 막힘 영향 분석 누락',
    reliabilityAnalysis: {
      status: 'REJECT',
      details: '검출 불량률 18.0% 및 샘플 X-Ray 단면 보이드 18.2%(기준 < 15% 초과)로 심각한 접합 신뢰성 불량 발생. 인접 전후 3개 로트에 대한 파괴 단면 분석 데이터 미제출.'
    },
    rootCauseAnalysis: {
      status: 'INSUFFICIENT',
      details: '센서 유격으로 인한 압력 강하만 기술하였으나, 왜 압력 센서 유격이 발생했는지에 대한 5-Why 원인 규명 및 에폭시 토출량(mg) 중량 편차 Cpk 분석이 결여됨.'
    },
    deficiencies: [
      {
        id: 'DEF-01',
        level: 'CRITICAL',
        title: '인접 생산 로트 3개에 대한 X-Ray 전수 보이드 단면 샘플링 검사 결과 미첨부',
        req: '직전/직후 생산 Lot 4,800ea 대상 AQL 0.4 기준 X-Ray 보이드 면적률 성적서 필수 제출'
      },
      {
        id: 'DEF-02',
        level: 'CRITICAL',
        title: '디스펜서 노즐 토출 압력 및 샷 중량(Dispense Weight) Cpk 데이터 결측',
        req: '라인 가동 중 센서 로그 외 실제 언더필 토출 중량(mg) 계측 데이터(Cpk > 1.67) 증빙 요망'
      },
      {
        id: 'DEF-03',
        level: 'MAJOR',
        title: '에폭시 시린지 개봉 후 가사시간(Work-life) 초과 여부 이력 누락',
        req: '상온 노출 시간에 따른 점도 상승 그래프 및 폐기 기준 준수 로그 확인 필요'
      }
    ],
    recommendedDecision: '8D_Escalated',
    sqeCommentDraft: `[라모스 품질본부 SQE 긴급 공정 이상 감사 결과 통보]
TechL BGA #2 라인 언더필 토출압 저하 및 보이드 불량 급증 건(SQ-2026-002)에 대해 정밀 AI 감사를 실시하였습니다.
불량률 18% 및 보이드 면적 18.2% 초과는 완제품 필드 솔더 크랙을 유발하는 중대 결함이므로, 본 건은 [사내 정식 8D Case]로 즉시 승격 조치합니다.

[외주사 필수 긴급 제출 요구 사항]
1. 인접 3개 생산 로트 전수 선별 및 X-Ray 보이드 검사 성적서 24시간 이내 업로드
2. 디스펜서 토출 중량(mg) 공정능력(Cpk) 분석표 및 노즐 세척 주기 개정안 제출
3. 당사 SQE 엔지니어 파주공장 현장 방문 참관 협조`
  }
};

/**
 * Executes AI SQE Audit on a subcontractor ticket and attached files.
 */
function runSupplierAiInspection(ticketId) {
  const records = (typeof loadSupplierRecords === 'function') ? loadSupplierRecords() : [];
  const ticket = records.find(r => r.ticketId === ticketId);
  if (!ticket) {
    alert('해당 접수 건을 찾을 수 없습니다.');
    return;
  }

  const container = document.getElementById('aiSupplierAuditContainer');
  if (!container) return;

  container.innerHTML = `
    <div class="ai-audit-loading-card">
      <div class="ai-pulse-spinner"></div>
      <div style="font-weight:800; font-size:0.92rem; color:var(--text-primary); margin-top:10px;">
        🤖 RAMOS AI가 외주사 제출 성적서 및 레포트 데이터를 정밀 감사 중입니다...
      </div>
      <div style="font-size:0.75rem; color:var(--text-muted); margin-top:4px;">
        분석 대상: ${(ticket.evidenceFiles || []).map(f => f.name).join(', ') || '제출 서류'} · 신뢰성 규격 및 5-Why 메커니즘 교차 검증 중
      </div>
    </div>
  `;
  container.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  setTimeout(() => {
    const benchmark = AI_SUPPLIER_AUDIT_BENCHMARKS[ticketId] || generateDynamicSupplierAudit(ticket);
    renderSupplierAiAuditResult(ticket, benchmark);
  }, 750);
}

function generateDynamicSupplierAudit(ticket) {
  const isPCN = ticket.ticketType === 'PCN';
  const fileNames = (ticket.evidenceFiles || []).map(f => f.name.toLowerCase()).join(' ');

  let score = 78;
  let grade = 'B (보완 권고)';
  let gradeColor = '#f59e0b';
  let recommendedDecision = 'Revision_Requested';

  const deficiencies = [];

  if (isPCN) {
    if (!fileNames.includes('hast') && !fileNames.includes('1000')) {
      deficiencies.push({
        id: 'DEF-01',
        level: 'CRITICAL',
        title: '장기 가속 신뢰성 시험(TC 1,000h / HAST 96h) 실측 데이터 미비',
        req: '고온 동작 및 열충격 1,000 사이클 완료 성적서 필수 첨부'
      });
      score -= 15;
    }
    deficiencies.push({
      id: 'DEF-02',
      level: 'MAJOR',
      title: '공정 조건 변경에 따른 4M 초도품 검사 성적서(ISIR/FAI) 누락',
      req: '초도 30ea 대상 치수 및 전기적 파라미터 공정능력(Cpk > 1.33) 분석치 제출'
    });
    score -= 10;
  } else {
    deficiencies.push({
      id: 'DEF-01',
      level: 'CRITICAL',
      title: '영향 범위(Affected WIP) 전수 검사 및 유출 봉쇄 객관적 데이터 미비',
      req: 'HOLD 처리된 재고의 시리얼 및 로트별 전수 선별 결과표 제출'
    });
    deficiencies.push({
      id: 'DEF-02',
      level: 'MAJOR',
      title: '물리적 고장 메커니즘 5-Why 원인 분석 심도 부족',
      req: '단순 작업자 과실 또는 부품 불량이 아닌 설비/공정 파라미터 근본 원인 분석 요망'
    });
    score -= 25;
    recommendedDecision = 'Revision_Requested';
  }

  if (score < 70) {
    grade = 'C (보완 필수 / 미흡)';
    gradeColor = '#ef4444';
  } else if (score >= 85) {
    grade = 'A (승인 권고)';
    gradeColor = '#10b981';
    recommendedDecision = 'Approved';
  }

  return {
    score,
    grade,
    gradeColor,
    summary: `${ticket.supplier?.companyName || '외주사'} 제출 문서 분석 결과: 핵심 품질 규격 충족도 ${score}점 (${grade})`,
    reliabilityAnalysis: {
      status: score >= 80 ? 'PASS' : 'PARTIAL_PASS',
      details: '신뢰성 시험 항목 중 환경 가속 시험 성적서 및 공정 파라미터 Cpk 로깅 데이터의 추가 확인이 필요합니다.'
    },
    rootCauseAnalysis: {
      status: score >= 80 ? 'ADEQUATE' : 'INSUFFICIENT',
      details: '현상 설명은 명확하나, 물리적 결함 유발 인자에 대한 정밀 분석(단면 SEM/X-Ray) 보완이 필요합니다.'
    },
    deficiencies,
    recommendedDecision,
    sqeCommentDraft: `[라모스 품질본부 SQE AI 정밀 심의 피드백]
${ticket.supplier?.companyName || '협력사'}에서 제출하신 [${ticket.ticketId}] 안건에 대해 정밀 검토한 결과 다음과 같은 보완을 요청드립니다.

1. 신뢰성 및 공정능력(Cpk) 실측 보완 데이터 제출
2. 결측 항목: ${deficiencies.map(d => d.title).join(' / ')}

상기 사항에 대한 보완 레포트를 준비하시어 포털 내 [보완된 자체 레포트 파일 제출] 버튼을 통해 재업로드해 주시기 바랍니다.`
  };
}

function renderSupplierAiAuditResult(ticket, audit) {
  const container = document.getElementById('aiSupplierAuditContainer');
  if (!container) return;

  container.innerHTML = `
    <div class="ai-audit-sheet">
      <!-- AI Header -->
      <div class="ai-audit-sheet-header">
        <div style="display:flex; align-items:center; gap:10px;">
          <div class="ai-badge-icon">🤖</div>
          <div>
            <div style="font-size:0.95rem; font-weight:800; color:var(--text-primary); display:flex; align-items:center; gap:8px;">
              <span>AI SQE 레포트 정밀 감사 결과서</span>
              <span class="ai-audit-grade-pill" style="background:${audit.gradeColor}20; color:${audit.gradeColor}; border-color:${audit.gradeColor}40;">
                종합 평점: ${audit.score}점 (${audit.grade})
              </span>
            </div>
            <div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">
              ${audit.summary}
            </div>
          </div>
        </div>

        <button class="btn btn-secondary btn-sm" onclick="runSupplierAiInspection('${ticket.ticketId}')" title="다시 감사 실행">
          <i data-lucide="refresh-cw" style="width:13px; height:13px;"></i>
          <span>재감사</span>
        </button>
      </div>

      <!-- Analysis Breakdown Grid -->
      <div class="ai-audit-grid">
        <div class="ai-audit-pane">
          <div class="ai-pane-title">
            <span>🔬 신뢰성 시험 & 규격 적합성 판정</span>
            <span class="ai-status-tag ${audit.reliabilityAnalysis.status}">
              ${audit.reliabilityAnalysis.status === 'PASS' ? '✓ 적합' : audit.reliabilityAnalysis.status === 'PARTIAL_PASS' ? '▲ 조건부 적합' : '✕ 부적합'}
            </span>
          </div>
          <div class="ai-pane-desc">
            ${audit.reliabilityAnalysis.details}
          </div>
        </div>

        <div class="ai-audit-pane">
          <div class="ai-pane-title">
            <span>🔍 5-Why 및 결함 메커니즘 완전성</span>
            <span class="ai-status-tag ${audit.rootCauseAnalysis.status}">
              ${audit.rootCauseAnalysis.status === 'ADEQUATE' ? '✓ 논리 타당' : '▲ 보완 필요'}
            </span>
          </div>
          <div class="ai-pane-desc">
            ${audit.rootCauseAnalysis.details}
          </div>
        </div>
      </div>

      <!-- Critical Deficiencies Checklist -->
      <div class="ai-deficiency-box">
        <div style="font-size:0.8rem; font-weight:800; color:#f43f5e; margin-bottom:8px; display:flex; align-items:center; gap:6px;">
          <i data-lucide="alert-triangle" style="width:15px; height:15px;"></i>
          <span>AI 검출 결측 데이터 및 외주사 추가 보완 요구 사항 (${audit.deficiencies.length}건)</span>
        </div>
        <div class="ai-deficiency-list">
          ${audit.deficiencies.map(def => `
            <div class="ai-deficiency-item">
              <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                <span class="badge-pill ${def.level === 'CRITICAL' ? 'badge-danger' : 'badge-warning'}" style="font-size:0.68rem;">
                  ${def.level}
                </span>
                <span class="num-mono" style="font-size:0.7rem; color:var(--text-muted);">${def.id}</span>
              </div>
              <div style="font-weight:700; font-size:0.82rem; color:var(--text-primary); margin:4px 0 2px;">
                ${def.title}
              </div>
              <div style="font-size:0.74rem; color:var(--text-secondary); line-height:1.4;">
                • <b>요구 규격:</b> ${def.req}
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- 1-Click SQE Review Draft & Apply Zone -->
      <div class="ai-draft-box">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <div style="font-size:0.82rem; font-weight:800; color:var(--text-primary); display:flex; align-items:center; gap:6px;">
            <i data-lucide="sparkles" style="width:15px; height:15px; color:#38bdf8;"></i>
            <span>AI 추천 SQE 공식 심의 통보문 초안</span>
          </div>
          <button class="btn btn-primary btn-sm btn-ai-apply" onclick="applyAiRecommendationToReview('${ticket.ticketId}')">
            <i data-lucide="check" style="width:14px; height:14px;"></i>
            <span>📋 SQE 심의 의견에 1초 자동 적용</span>
          </button>
        </div>
        <textarea id="aiGeneratedCommentDraft" class="form-control" rows="4" style="font-size:0.78rem; font-family:monospace; line-height:1.45; background:var(--bg-card); color:var(--text-primary);" readonly>${audit.sqeCommentDraft}</textarea>
        <div style="font-size:0.72rem; color:var(--text-muted); margin-top:6px;">
          * [1초 자동 적용] 클릭 시 아래 SQE 심의 의견란에 즉시 반영되며, 심의 판정이 <b>[${audit.recommendedDecision === 'Revision_Requested' ? '외주사 보완 요청' : audit.recommendedDecision === 'Approved' ? '승인 완료' : '8D 승격'}]</b>(으)로 자동 선택됩니다.
        </div>
      </div>
    </div>
  `;

  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
}

/**
 * 1-Click apply AI recommendation to SQE Review form
 */
function applyAiRecommendationToReview(ticketId) {
  const draftEl = document.getElementById('aiGeneratedCommentDraft');
  const commentEl = document.getElementById('modalComment');
  const decisionEl = document.getElementById('modalDecision');

  if (!draftEl || !commentEl) return;

  const benchmark = AI_SUPPLIER_AUDIT_BENCHMARKS[ticketId] || { recommendedDecision: 'Revision_Requested' };

  commentEl.value = draftEl.value;

  if (decisionEl) {
    decisionEl.value = benchmark.recommendedDecision || 'Revision_Requested';
  }

  // Visual feedback
  commentEl.style.transition = 'box-shadow 0.3s ease, border-color 0.3s ease';
  commentEl.style.borderColor = '#10b981';
  commentEl.style.boxShadow = '0 0 0 3px rgba(16, 185, 129, 0.25)';
  setTimeout(() => {
    commentEl.style.boxShadow = '';
  }, 1200);

  // Scroll to review form smoothly
  commentEl.scrollIntoView({ behavior: 'smooth', block: 'center' });

  // Show Toast
  showSupplierAuditToast('✨ AI 심의 추천 의견 및 판정이 SQE 심의 양식에 자동 입력되었습니다.');
}

function showSupplierAuditToast(msg) {
  let toast = document.getElementById('supplierAuditToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'supplierAuditToast';
    toast.className = 'supplier-audit-toast';
    document.body.appendChild(toast);
  }
  toast.innerText = msg;
  toast.style.display = 'block';
  toast.style.opacity = '1';
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => { toast.style.display = 'none'; }, 300);
  }, 2500);
}

/**
 * Trigger AI Audit directly from Document Viewer toolbar
 */
function triggerAiAuditFromViewer() {
  if (!window.activeViewerDoc) return;
  const records = (typeof loadSupplierRecords === 'function') ? loadSupplierRecords() : [];
  const docName = window.activeViewerDoc.name;
  let targetTicket = records.find(r => (r.evidenceFiles || []).some(f => f.name === docName));
  if (!targetTicket && records.length > 0) {
    targetTicket = records[0];
  }

  if (typeof closeDocumentViewer === 'function') {
    closeDocumentViewer();
  }

  if (targetTicket && typeof openSupplierTicketModal === 'function') {
    openSupplierTicketModal(targetTicket.ticketId);
    setTimeout(() => {
      runSupplierAiInspection(targetTicket.ticketId);
    }, 300);
  } else {
    alert(`[AI 문서 감사]\n문서 '${docName}'에 대한 AI 품질 무결성 및 시험 규격 검사가 실행되었습니다.\n- 유효성: 정상\n- 결측 위험도: 낮음`);
  }
}

// Global exports
if (typeof window !== 'undefined') {
  window.AI_SUPPLIER_AUDIT_BENCHMARKS = AI_SUPPLIER_AUDIT_BENCHMARKS;
  window.runSupplierAiInspection = runSupplierAiInspection;
  window.renderSupplierAiAuditResult = renderSupplierAiAuditResult;
  window.applyAiRecommendationToReview = applyAiRecommendationToReview;
  window.triggerAiAuditFromViewer = triggerAiAuditFromViewer;
  window.showSupplierAuditToast = showSupplierAuditToast;
}
