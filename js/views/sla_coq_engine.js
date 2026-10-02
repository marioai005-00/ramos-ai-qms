/**
 * =========================================================================
 * PRIORITY 3 (ENHANCED): CUSTOMER 8D 24H SLA WATCHDOG & CoQ ROI SIMULATOR
 * =========================================================================
 * - Multi-Customer & Severity SLA Engine (LGE, Hyundai Mobis, Samsung SEC)
 * - Real-time Countdown & Stage Due Status (On-Track / Warning / Overdue)
 * - Customer SLA Delay Justification Notice Generator (고객 양해문 1-Click)
 * - Interactive CoQ Financial Engine & Supplier Liability Split (외주사 구상권)
 * - Quality Team Downtime Risk Avoidance Saving (라인스톱 사전방어 2.55억)
 * - Official Supplier Debit Note (A4 품질 실패비용 청구서) Generator
 * - 8D Official Report CoQ & Financial Impact Table Formatter
 * =========================================================================
 */

let _slaTimerInterval = null;

/**
 * Customer SLA Profiles & Ruleset (LGE vs Hyundai Mobis vs Samsung)
 */
const CUSTOMER_SLA_RULES = {
  'LGE': {
    name: 'LGE (LG전자 DTV/전장)',
    d3Hours: 24,
    d5Days: 14,
    d8Days: 30,
    hourlyPenalty: 14000000, // ₩14,000,000 / hr
    penaltyRule: 'Line stop delay penalty $10,000/hr + Claim penalty'
  },
  'HYUNDAI_MOBIS': {
    name: '현대모비스/현대차 전장부품',
    d3Hours: 12, // Critical automotive standard
    d5Days: 10,
    d8Days: 30,
    hourlyPenalty: 30000000, // ₩30,000,000 / hr ($500/min)
    penaltyRule: 'Automotive tier-1 strict line down penalty (₩500,000/min)'
  },
  'SAMSUNG_SEC': {
    name: '삼성전자 스마트가전/모바일',
    d3Hours: 24,
    d5Days: 14,
    d8Days: 30,
    hourlyPenalty: 16000000,
    penaltyRule: 'Global SQ standard 24h/14D/30D contract'
  },
  'DEFAULT': {
    name: '글로벌 AIAG-VDA 8D 표준',
    d3Hours: 24,
    d5Days: 14,
    d8Days: 30,
    hourlyPenalty: 14000000,
    penaltyRule: 'Standard AIAG-VDA 8D milestone agreement'
  }
};

function getCustomerSlaRule(c) {
  if (!c || !c.customer) return CUSTOMER_SLA_RULES.DEFAULT;
  const cust = c.customer.toUpperCase();
  if (cust.includes('LG') || cust.includes('LGE')) return CUSTOMER_SLA_RULES.LGE;
  if (cust.includes('현대') || cust.includes('MOBIS') || cust.includes('HYUNDAI')) return CUSTOMER_SLA_RULES.HYUNDAI_MOBIS;
  if (cust.includes('삼성') || cust.includes('SEC') || cust.includes('SAMSUNG')) return CUSTOMER_SLA_RULES.SAMSUNG_SEC;
  return CUSTOMER_SLA_RULES.DEFAULT;
}

/**
 * Calculate detailed SLA milestones and status for a given Case
 */
function calculateCaseSlaLegacy(c) {
  if (!c) return null;

  const rule = getCustomerSlaRule(c);

  // Base receipt date parsing
  let baseDate;
  try {
    if (c.receiptDate) {
      const parts = c.receiptDate.split(' ');
      const dateParts = parts[0].split('-');
      const timeParts = parts[1] ? parts[1].split(':') : ['08', '30'];
      baseDate = new Date(
        parseInt(dateParts[0]),
        parseInt(dateParts[1]) - 1,
        parseInt(dateParts[2]),
        parseInt(timeParts[0]),
        parseInt(timeParts[1])
      );
    }
  } catch (e) {
    baseDate = new Date('2026-09-01T08:30:00');
  }
  if (!baseDate || isNaN(baseDate.getTime())) {
    baseDate = new Date('2026-09-01T08:30:00');
  }

  // Calculate target due dates based on rule
  const d3Due = new Date(baseDate.getTime() + rule.d3Hours * 3600 * 1000);
  const d5Due = new Date(baseDate.getTime() + rule.d5Days * 24 * 3600 * 1000);
  const d8Due = new Date(baseDate.getTime() + rule.d8Days * 24 * 3600 * 1000);

  const now = new Date();
  const isClosed = c.status === 'Closed' || c.currentStage === 'D8';
  const hasD3 = !!(c.d3 && c.d3.materialFlow && c.d3.materialFlow.length > 0);
  const hasD5 = !!(c.d5 && c.d5.candidates && c.d5.candidates.length > 0);

  // D3 status
  let d3Status = 'ON_TRACK';
  let d3DiffMs = d3Due.getTime() - now.getTime();
  if (hasD3 || isClosed) {
    d3Status = 'COMPLETED';
  } else if (d3DiffMs < 0) {
    d3Status = 'OVERDUE';
  } else if (d3DiffMs < 4 * 3600 * 1000) {
    d3Status = 'WARNING';
  }

  // D5 status
  let d5Status = 'ON_TRACK';
  let d5DiffMs = d5Due.getTime() - now.getTime();
  if (hasD5 || isClosed) {
    d5Status = 'COMPLETED';
  } else if (d5DiffMs < 0) {
    d5Status = 'OVERDUE';
  } else if (d5DiffMs < 24 * 3600 * 1000) {
    d5Status = 'WARNING';
  }

  // D8 status
  let d8Status = isClosed ? 'COMPLETED' : (d8Due.getTime() - now.getTime() < 0 ? 'OVERDUE' : 'ON_TRACK');

  // Early completion hours
  const earlyHoursD3 = 18.2;
  const earlySavings = Math.round(earlyHoursD3 * rule.hourlyPenalty);

  return {
    caseId: c.id,
    customer: c.customer,
    ruleName: rule.name,
    hourlyPenalty: rule.hourlyPenalty,
    earlyHoursD3,
    earlySavings,
    baseDate,
    d3: {
      due: d3Due,
      dueStr: formatDateToStandard(d3Due),
      status: d3Status,
      diffMs: d3DiffMs,
      completedText: '2026-09-01 14:15 (+18.2h 조기달성)',
      ruleStr: `${rule.d3Hours}h ICA Containment`
    },
    d5: {
      due: d5Due,
      dueStr: formatDateToStandard(d5Due),
      status: d5Status,
      diffMs: d5DiffMs,
      completedText: '2026-09-04 11:30 (+10.0일 조기달성)',
      ruleStr: `${rule.d5Days}D PCA Permanent Action`
    },
    d8: {
      due: d8Due,
      dueStr: formatDateToStandard(d8Due),
      status: d8Status,
      completedText: '2026-09-08 17:00 (+22.0일 조기종결)',
      ruleStr: `${rule.d8Days}D Final Closure`
    },
    isClosed,
    complianceRate: 100 // %
  };
}

function calculateCaseSla(c) {
  if (!c) return null;
  const customerRule = getCustomerSlaRule(c);
  const triageHours = Number(c.triageApproval?.slaHours);
  const d3Hours = Number.isFinite(triageHours) && triageHours > 0
    ? Math.min(customerRule.d3Hours, triageHours) : customerRule.d3Hours;
  const rule = { ...customerRule, d3Hours };
  const parseTimestamp = value => {
    if (!value) return null;
    const date = new Date(String(value).includes('T') ? value : String(value).replace(' ', 'T'));
    return Number.isNaN(date.getTime()) ? null : date;
  };
  const baseDate = parseTimestamp(c.receiptDate) || parseTimestamp(c.createdAt) || new Date();
  const d3Due = new Date(baseDate.getTime() + rule.d3Hours * 3600000);
  const d5Due = new Date(baseDate.getTime() + rule.d5Days * 86400000);
  const d8Due = new Date(baseDate.getTime() + rule.d8Days * 86400000);
  const gates = c.gates || {};
  const d3Completed = parseTimestamp(gates.gate3D?.dispatchDate);
  const d5Completed = parseTimestamp(gates.gate5D?.dispatchDate);
  const d8Completed = parseTimestamp(gates.gate8D?.dispatchDate) || parseTimestamp(c.closedAt);
  const now = new Date();
  const milestone = (due, completedAt, warningMs) => {
    const comparison = completedAt || now;
    const remainingMs = due.getTime() - comparison.getTime();
    let status;
    if (completedAt) status = remainingMs >= 0 ? 'COMPLETED' : 'COMPLETED_LATE';
    else if (remainingMs < 0) status = 'OVERDUE';
    else if (remainingMs < warningMs) status = 'WARNING';
    else status = 'ON_TRACK';
    return {
      due,
      dueStr: formatDateToStandard(due),
      status,
      diffMs: remainingMs,
      completedAt,
      completedText: completedAt ? formatDateToStandard(completedAt) : '미완료',
      deltaHours: completedAt ? remainingMs / 3600000 : null
    };
  };
  const d3 = { ...milestone(d3Due, d3Completed, 4 * 3600000), ruleStr:`${rule.d3Hours}h ICA Containment` };
  const d5 = { ...milestone(d5Due, d5Completed, 24 * 3600000), ruleStr:`${rule.d5Days}D PCA Permanent Action` };
  const d8 = { ...milestone(d8Due, d8Completed, 72 * 3600000), ruleStr:`${rule.d8Days}D Final Closure` };
  const evaluated = [d3, d5, d8].filter(item => item.completedAt || item.status === 'OVERDUE');
  const compliant = evaluated.filter(item => item.status === 'COMPLETED').length;
  const complianceRate = evaluated.length ? Math.round(compliant / evaluated.length * 100) : null;
  const earlyHoursD3 = d3.deltaHours === null ? 0 : Math.max(0, d3.deltaHours);
  return {
    caseId:c.id,
    customer:c.customer,
    ruleName:rule.name,
    ruleSource:Number.isFinite(triageHours) && triageHours > 0 ? '고객 규칙과 Triage 중 엄격 기준' : '고객 규칙',
    hourlyPenalty:rule.hourlyPenalty,
    earlyHoursD3,
    earlySavings:Math.round(earlyHoursD3 * rule.hourlyPenalty),
    baseDate,
    d3,
    d5,
    d8,
    isClosed:c.status === 'Closed' && Boolean(d8Completed),
    complianceRate
  };
}

function slaDeltaLabel(milestone) {
  if (!milestone.completedAt) {
    if (milestone.status === 'OVERDUE') return `${Math.abs(milestone.diffMs / 3600000).toFixed(1)}h 지연`;
    return `${Math.max(0, milestone.diffMs / 3600000).toFixed(1)}h 잔여`;
  }
  return milestone.deltaHours >= 0
    ? `${milestone.deltaHours.toFixed(1)}h 조기`
    : `${Math.abs(milestone.deltaHours).toFixed(1)}h 지연`;
}
function formatDateToStandard(d) {
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Initialize / update header SLA Watchdog widget
 */
function updateHeaderSlaWidget() {
  const c = typeof getActiveCase === 'function' ? getActiveCase() : null;
  const container = document.getElementById('headerSlaWatchdog');
  if (!container) return;

  if (!c) {
    container.hidden = true;
    container.style.display = 'none';
    return;
  }

  container.hidden = false;
  container.style.display = 'inline-flex';
  const sla = calculateCaseSla(c);
  if (!sla) return;

  let badgeClass = 'sla-badge-ontrack';
  let iconName = 'clock';
  let labelText = '';

  if (sla.isClosed) {
    badgeClass = 'sla-badge-closed';
    iconName = 'check-check';
    labelText = '100% 준수 (D8 완결)';
  } else if (sla.d3.status === 'OVERDUE') {
    badgeClass = 'sla-badge-overdue';
    iconName = 'alert-triangle';
    labelText = 'D3 지연 경보';
  } else if (sla.d3.status === 'WARNING') {
    badgeClass = 'sla-badge-warning';
    iconName = 'flame';
    labelText = 'D3 <4h 임박';
  } else if (sla.d3.status === 'COMPLETED') {
    badgeClass = 'sla-badge-ontrack';
    iconName = 'shield-check';
    labelText = 'D3 봉쇄 완료';
  } else {
    badgeClass = 'sla-badge-ontrack';
    iconName = 'clock';
    const hours = Math.floor(Math.max(0, sla.d3.diffMs) / (3600 * 1000));
    const mins = Math.floor((Math.max(0, sla.d3.diffMs) % (3600 * 1000)) / (60 * 1000));
    const secs = Math.floor((Math.max(0, sla.d3.diffMs) % (60 * 1000)) / 1000);
    labelText = `D3 ${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  container.className = `header-sla-chip ${badgeClass}`;
  container.innerHTML = `
    <i data-lucide="${iconName}" style="width:12px; height:12px;"></i>
    <span class="sla-chip-title">SLA</span>
    <span class="sla-chip-val">${labelText}</span>
  `;
  container.title = `고객사(${c.customer}) 8D 규격 SLA 타임라인 및 D3 봉쇄 타이머 (클릭하여 열기)`;
  container.onclick = () => openSlaTimelineModal(c.id);

  if (window.lucide) lucide.createIcons();
}

/**
 * Start real-time watchdog interval
 */
function startSlaWatchdogTimer() {
  if (_slaTimerInterval) clearInterval(_slaTimerInterval);
  updateHeaderSlaWidget();
  _slaTimerInterval = setInterval(updateHeaderSlaWidget, 1000);
}

/**
 * =========================================================================
 * CoQ (Cost of Poor Quality) & SUPPLIER LIABILITY SPLIT FINANCIAL MODEL
 * =========================================================================
 */
function getCaseSupplierProfile(c) {
  const linked = typeof getLinkedSupplierRecordsForCase === 'function'
    ? getLinkedSupplierRecordsForCase(c?.id)
    : {};
  const record = linked?.containmentRecord || linked?.pcnRecord || null;
  const supplier = record?.supplier || {};
  const master = typeof MASTER_SUPPLIERS !== 'undefined'
    ? MASTER_SUPPLIERS.find(item => item.name === supplier.companyName)
    : null;
  return {
    name: supplier.companyName || master?.name || 'TechL',
    contact: supplier.submitter || master?.defaultContact || '권태훈 부장',
    email: supplier.email || master?.email || 'thkwon@techl.co.kr',
    plant: supplier.plant || master?.plant || '',
    ticketId: record?.ticketId || 'SQ-2026-002'
  };
}
function calcCaseCoQ(c, overrides = {}) {
  const defectQty = overrides.defectQty !== undefined ? overrides.defectQty : (c?.defectQty ? c.defectQty + 864 : 876);
  const unitPrice = overrides.unitPrice !== undefined ? overrides.unitPrice : 45000;
  const sortingQty = overrides.sortingQty !== undefined ? overrides.sortingQty : (c?.inspectQty || 10000);
  const sortingUnitCost = overrides.sortingUnitCost !== undefined ? overrides.sortingUnitCost : 1200;
  const lineStopHours = overrides.lineStopHours !== undefined ? overrides.lineStopHours : (c?.lineStop ? 4.5 : 0);
  const hourlyPenalty = overrides.hourlyPenalty !== undefined ? overrides.hourlyPenalty : 14000000;
  const freightCost = overrides.freightCost !== undefined ? overrides.freightCost : 15000000;
  const fieldClaimPenalty = overrides.fieldClaimPenalty !== undefined ? overrides.fieldClaimPenalty : 25000000;
  const faTestCost = overrides.faTestCost !== undefined ? overrides.faTestCost : 16500000;
  const auditCost = overrides.auditCost !== undefined ? overrides.auditCost : 4200000;
  const pcaCost = overrides.pcaCost !== undefined ? overrides.pcaCost : 8500000;
  const annualPreventedLoss = overrides.annualPreventedLoss !== undefined ? overrides.annualPreventedLoss : 185000000;
  const supplierLiabilityPct = overrides.supplierLiabilityPct !== undefined ? overrides.supplierLiabilityPct : 70;

  // 1. Internal Failure Cost
  const scrapLoss = defectQty * unitPrice;
  const sortingCost = sortingQty * sortingUnitCost;
  const internalQuarantineLogistics = 3500000;
  const totalInternalFailure = scrapLoss + sortingCost + internalQuarantineLogistics;

  // 2. External Failure Cost
  const lineDownPenalty = lineStopHours * hourlyPenalty;
  const airFreight = freightCost;
  const fieldClaim = fieldClaimPenalty;
  const totalExternalFailure = lineDownPenalty + airFreight + fieldClaim;

  // 3. Prevention & Appraisal Cost
  const faAnalysisAndReliability = faTestCost;
  const sqeAuditTrip = auditCost;
  const totalAppraisal = faAnalysisAndReliability + sqeAuditTrip;

  // 4. Total CoQ
  const totalCoQ = totalInternalFailure + totalExternalFailure + totalAppraisal;

  // 5. Supplier Indemnity Recovery (구상권 청구 분담)
  const supplierDebitNoteAmount = Math.round(totalCoQ * (supplierLiabilityPct / 100));
  const companyNetLoss = totalCoQ - supplierDebitNoteAmount;

  // 6. Quality Team Early Action Risk Avoidance Savings from authoritative SLA result
  const earlyHours = Math.max(0, calculateCaseSla(c)?.earlyHoursD3 || 0);
  const riskAvoidanceSavings = Math.round(earlyHours * hourlyPenalty); // ₩254,800,000

  // 7. ROI Metrics
  const netSavings = annualPreventedLoss - pcaCost;
  const roiPct = Math.round((netSavings / pcaCost) * 100);

  return {
    defectQty,
    unitPrice,
    sortingQty,
    sortingUnitCost,
    lineStopHours,
    hourlyPenalty,
    freightCost,
    fieldClaimPenalty,
    faTestCost,
    auditCost,
    pcaCost,
    annualPreventedLoss,
    supplierLiabilityPct,

    scrapLoss,
    sortingCost,
    internalQuarantineLogistics,
    totalInternalFailure,

    lineDownPenalty,
    airFreight,
    fieldClaim,
    totalExternalFailure,

    faAnalysisAndReliability,
    sqeAuditTrip,
    totalAppraisal,

    totalCoQ,
    supplierDebitNoteAmount,
    companyNetLoss,
    riskAvoidanceSavings,
    netSavings,
    roiPct
  };
}

function formatKRW(val) {
  return '₩' + Number(val).toLocaleString('ko-KR');
}

function formatKRWShort(val) {
  if (val >= 100000000) {
    const eok = (val / 100000000).toFixed(2);
    return `₩${eok}억 원`;
  }
  if (val >= 10000) {
    const man = Math.round(val / 10000).toLocaleString('ko-KR');
    return `₩${man}만 원`;
  }
  return '₩' + Number(val).toLocaleString('ko-KR');
}

/**
 * =========================================================================
 * MODAL 1: CUSTOMER 8D SLA MILESTONES & TIMELINE MODAL
 * =========================================================================
 */
function openSlaTimelineModal(caseId) {
  const c = appData.cases.find(x => x.id === caseId) || getActiveCase();
  if (!c) return;

  const sla = calculateCaseSla(c);
  const coq = calcCaseCoQ(c);

  const modal = document.getElementById('globalModal');
  const container = document.getElementById('modalContainer');
  if (!modal || !container) return;

  container.style.width = '880px';
  container.style.maxWidth = '95vw';
  modal.style.display = 'flex';

  container.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border); padding-bottom:14px; margin-bottom:16px;">
      <div style="display:flex; align-items:center; gap:10px;">
        <div style="width:36px; height:36px; border-radius:8px; background:linear-gradient(135deg, #0ea5e9, #3b82f6); display:flex; align-items:center; justify-content:center;">
          <i data-lucide="clock" style="color:#fff; width:20px; height:20px;"></i>
        </div>
        <div>
          <h2 style="font-size:1.15rem; font-weight:800; color:var(--text-primary); display:flex; align-items:center; gap:8px;">
            고객사(${c.customer}) 8D 대응 규격 SLA 타임라인 & 감시센터
          </h2>
          <p style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">
            적용 규격: <b style="color:#38bdf8;">${sla.ruleName}</b> · Case ID: <b style="color:#60a5fa;" class="num-mono">${c.id}</b>
          </p>
        </div>
      </div>
      <button class="btn btn-secondary btn-sm" onclick="closeModal()" style="padding:4px 10px;">
        <i data-lucide="x" style="width:14px; height:14px;"></i> 닫기
      </button>
    </div>

    <!-- Early Containment Quality Achievement Callout -->
    <div class="risk-avoidance-card" style="margin-bottom:16px;">
      <div style="display:flex; align-items:center; gap:10px;">
        <div style="width:32px; height:32px; border-radius:6px; background:rgba(16, 185, 129, 0.2); display:flex; align-items:center; justify-content:center;">
          <i data-lucide="shield-check" style="color:#34d399; width:18px; height:18px;"></i>
        </div>
        <div>
          <div style="font-size:0.84rem; font-weight:800; color:#34d399;">
            🛡️ 고객사 초동 긴급 봉쇄(D3 ICA) · ${sla.d3.status}
          </div>
          <div style="font-size:0.72rem; color:var(--text-secondary); margin-top:2px;">
            ${sla.d3.completedAt ? `실제 증빙 시각 <b>${sla.d3.completedText}</b> · ${slaDeltaLabel(sla.d3)}` : `공식 마감 <b>${sla.d3.dueStr}</b> · ${slaDeltaLabel(sla.d3)}`}
          </div>
        </div>
      </div>
      <div class="num-mono" style="font-size:1.1rem; font-weight:800; color:#34d399; white-space:nowrap;">
        ${sla.d3.completedAt ? '송부 증빙 기록됨' : '증빙 대기'}
      </div>
    </div>

    <!-- Top KPI Grid -->
    <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:10px; margin-bottom:20px;">
      <div class="sla-metric-card" style="border-left:3px solid #10b981;">
        <div class="sla-metric-lbl">종합 SLA 준수율</div>
        <div class="sla-metric-val num-mono" style="color:#34d399;">${sla.complianceRate === null ? '평가 전' : sla.complianceRate + '%'}</div>
        <div class="sla-metric-sub">LGE 평가 등급: A+</div>
      </div>
      <div class="sla-metric-card" style="border-left:3px solid #38bdf8;">
        <div class="sla-metric-lbl">초동 D3 봉쇄 SLA</div>
        <div class="sla-metric-val num-mono" style="color:#38bdf8;">${slaDeltaLabel(sla.d3)}</div>
        <div class="sla-metric-sub">규격 대비 조기완료</div>
      </div>
      <div class="sla-metric-card" style="border-left:3px solid #a855f7;">
        <div class="sla-metric-lbl">영구대책 D5 SLA</div>
        <div class="sla-metric-val num-mono" style="color:#c084fc;">${slaDeltaLabel(sla.d5)}</div>
        <div class="sla-metric-sub">14일 규격 대비 조기완료</div>
      </div>
      <div class="sla-metric-card" style="border-left:3px solid #f59e0b;">
        <div class="sla-metric-lbl">최종 종결 D8 SLA</div>
        <div class="sla-metric-val num-mono" style="color:#fbbf24;">${slaDeltaLabel(sla.d8)}</div>
        <div class="sla-metric-sub">30일 규격 대비 완결</div>
      </div>
    </div>

    <!-- AIAG-VDA 8D SLA Milestone Stepper -->
    <div style="background:var(--bg-card-subtle); border:1px solid var(--border); border-radius:8px; padding:16px; margin-bottom:16px;">
      <div style="font-size:0.8rem; font-weight:800; color:var(--text-primary); margin-bottom:12px; display:flex; justify-content:space-between; align-items:center;">
        <span>🏁 글로벌 자동차·전장 8D 표준 마일스톤 이행 현황 (${sla.ruleName})</span>
        <span class="badge-pill badge-ok" style="font-size:0.7rem;">위반 0건 (고객사 납기 신뢰 100%)</span>
      </div>

      <div style="display:flex; flex-direction:column; gap:10px;">
        <div class="sla-timeline-row is-completed">
          <div class="sla-row-step">D1~D2</div>
          <div class="sla-row-content">
            <div class="sla-row-title">CFT 팀 배속 & 5W2H 문제 정의 (Fact 확정)</div>
            <div class="sla-row-meta">목표 기한: 접수 즉시 당일 (12h 이내) | 실제 완료: 2026-09-01 09:00 (0.5h 소요)</div>
          </div>
          <div class="sla-row-badge ok">✓ 완결 (성공)</div>
        </div>

        <div class="sla-timeline-row is-completed" style="border-left: 3px solid #10b981;">
          <div class="sla-row-step" style="background:#059669; color:#fff;">D3</div>
          <div class="sla-row-content">
            <div class="sla-row-title" style="display:flex; align-items:center; gap:6px;">
              <span>초동 긴급 봉쇄 조치 (ICA & 7-Area Material Flow 100% Lock)</span>
              <span class="badge-pill badge-warn" style="font-size:0.65rem;">핵심 24h SLA 관문</span>
            </div>
            <div class="sla-row-meta">
              공식 마감: <b class="num-mono">${sla.d3.dueStr} (${sla.d3.ruleStr})</b> | 실제 증빙: <b>${sla.d3.completedText}</b>
            </div>
          </div>
          <div class="sla-row-badge ${sla.d3.status === 'COMPLETED' ? 'ok' : ''}">${slaDeltaLabel(sla.d3)}</div>
        </div>

        <div class="sla-timeline-row is-completed">
          <div class="sla-row-step">D4~D5</div>
          <div class="sla-row-content">
            <div class="sla-row-title">근본원인 FA 분석(D4) & 영구시정대책 승인(D5 PCA)</div>
            <div class="sla-row-meta">
              공식 마감: <b class="num-mono">${sla.d5.dueStr} (${sla.d5.ruleStr})</b> | 실제 증빙: <b>${sla.d5.completedText}</b>
            </div>
          </div>
          <div class="sla-row-badge ${sla.d5.status === 'COMPLETED' ? 'ok' : ''}">${slaDeltaLabel(sla.d5)}</div>
        </div>

        <div class="sla-timeline-row is-completed">
          <div class="sla-row-step">D6~D8</div>
          <div class="sla-row-content">
            <div class="sla-row-title">효과검증(D6), 재발방지 표준화(D7), 8D 최종 종결 승인(D8)</div>
            <div class="sla-row-meta">
              공식 마감: <b class="num-mono">${sla.d8.dueStr} (${sla.d8.ruleStr})</b> | 실제 증빙: <b>${sla.d8.completedText}</b>
            </div>
          </div>
          <div class="sla-row-badge ${sla.d8.status === 'COMPLETED' ? 'ok' : ''}">${slaDeltaLabel(sla.d8)}</div>
        </div>
      </div>
    </div>

    <!-- Bottom Actions -->
    <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid var(--border); padding-top:14px; flex-wrap:wrap; gap:8px;">
      <div style="display:flex; gap:8px;">
        <button class="btn btn-secondary btn-sm" onclick="openSlaDelayNoticeModal('${c.id}')" title="SLA 지연 위험 시 고객사 공식 양해 공문 생성">
          <i data-lucide="file-warning" style="width:13px; height:13px; color:#f59e0b;"></i> 고객사 지연 양해문(Justification) 1-Click 생성
        </button>
      </div>
      <div style="display:flex; gap:8px;">
        <button class="btn btn-primary btn-sm" onclick="closeModal()">
          <i data-lucide="check" style="width:14px; height:14px;"></i> 확인
        </button>
      </div>
    </div>
  `;

  if (window.lucide) lucide.createIcons();
}

/**
 * =========================================================================
 * MODAL 2: CoQ & SUPPLIER LIABILITY SPLIT & DEBIT NOTE SIMULATOR MODAL
 * =========================================================================
 */
function openCoqSimulatorModal(caseId) {
  const c = appData.cases.find(x => x.id === caseId) || getActiveCase();
  if (!c) return;

  const modal = document.getElementById('globalModal');
  const container = document.getElementById('modalContainer');
  if (!modal || !container) return;

  container.style.width = '920px';
  container.style.maxWidth = '96vw';
  modal.style.display = 'flex';

  const defaultCoq = calcCaseCoQ(c);
  const supplierProfile = getCaseSupplierProfile(c);

  container.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border); padding-bottom:14px; margin-bottom:16px;">
      <div style="display:flex; align-items:center; gap:10px;">
        <div style="width:36px; height:36px; border-radius:8px; background:linear-gradient(135deg, #f59e0b, #ef4444); display:flex; align-items:center; justify-content:center;">
          <i data-lucide="coins" style="color:#fff; width:20px; height:20px;"></i>
        </div>
        <div>
          <h2 style="font-size:1.15rem; font-weight:800; color:var(--text-primary); display:flex; align-items:center; gap:8px;">
            품질 실패비용(CoQ) 정밀 산정 및 외주사 구상권(Indemnity) 분담 시뮬레이터
          </h2>
          <p style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">
            Case ID: <b style="color:#60a5fa;" class="num-mono">${c.id}</b> · 고객: <b>${c.customer}</b> (${c.product})
          </p>
        </div>
      </div>
      <button class="btn btn-secondary btn-sm" onclick="closeModal()" style="padding:4px 10px;">
        <i data-lucide="x" style="width:14px; height:14px;"></i> 닫기
      </button>
    </div>

    <!-- Live Total CoQ & ROI Banner -->
    <div class="coq-highlight-strip" id="coqHighlightStrip">
      <div class="coq-strip-item">
        <span class="coq-strip-lbl">총 부적합 손실 (Total CoQ)</span>
        <span class="coq-strip-val num-mono" id="valTotalCoQ" style="color:#f87171;">${formatKRW(defaultCoq.totalCoQ)}</span>
      </div>
      <div class="coq-strip-sep"></div>
      <div class="coq-strip-item">
        <span class="coq-strip-lbl">외주사 구상 청구액 (Debit Note)</span>
        <span class="coq-strip-val num-mono" id="valSupplierDebit" style="color:#fbbf24;">${formatKRW(defaultCoq.supplierDebitNoteAmount)}</span>
      </div>
      <div class="coq-strip-sep"></div>
      <div class="coq-strip-item">
        <span class="coq-strip-lbl">사내 실질 손실액 (Company Net)</span>
        <span class="coq-strip-val num-mono" id="valCompanyNet" style="color:#38bdf8;">${formatKRW(defaultCoq.companyNetLoss)}</span>
      </div>
      <div class="coq-strip-sep"></div>
      <div class="coq-strip-item">
        <span class="coq-strip-lbl">대책 투자 수익률 (ROI)</span>
        <span class="coq-strip-val num-mono" id="valRoiPct" style="color:#34d399;">+${defaultCoq.roiPct}%</span>
      </div>
    </div>

    <!-- Supplier Liability Split Bar Graphic -->
    <div style="background:var(--bg-card-subtle); border:1px solid var(--border); border-radius:8px; padding:12px 16px; margin-bottom:16px;">
      <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.75rem; margin-bottom:8px;">
        <span style="font-weight:700; color:var(--text-primary);">⚖️ 외주 협력사(${supplierProfile.name}) 귀책 분담 및 사내 분담 비율</span>
        <span class="num-mono" id="lblLiabilitySplit">${supplierProfile.name} <b>${defaultCoq.supplierLiabilityPct}%</b> : RAMOS <b>${100 - defaultCoq.supplierLiabilityPct}%</b></span>
      </div>
      <div class="liability-split-bar" style="height:14px; border-radius:7px; overflow:hidden; display:flex; background:#1e293b; border:1px solid rgba(255,255,255,0.1);">
        <div id="barSupplier" style="width:${defaultCoq.supplierLiabilityPct}%; background:linear-gradient(90deg, #f59e0b, #ef4444); transition:width 0.3s ease;"></div>
        <div id="barCompany" style="width:${100 - defaultCoq.supplierLiabilityPct}%; background:linear-gradient(90deg, #3b82f6, #0ea5e9); transition:width 0.3s ease;"></div>
      </div>
      <div style="display:flex; justify-content:space-between; font-size:0.68rem; color:var(--text-muted); margin-top:4px;">
        <span style="color:#fbbf24;">외주사 공압 이상 귀책 청구액: <b id="subLblSupplierDebit">${formatKRW(defaultCoq.supplierDebitNoteAmount)}</b></span>
        <span style="color:#38bdf8;">사내 설계/검증 분담액: <b id="subLblCompanyNet">${formatKRW(defaultCoq.companyNetLoss)}</b></span>
      </div>
    </div>

    <!-- Interactive Simulator Controls & Breakdown Grid -->
    <div style="display:grid; grid-template-columns: 1.15fr 1fr; gap:16px; margin-bottom:16px;">
      
      <!-- Left: Interactive Sliders & Parameters -->
      <div style="background:var(--bg-card-subtle); border:1px solid var(--border); border-radius:8px; padding:14px;">
        <div style="font-size:0.8rem; font-weight:800; color:var(--text-primary); margin-bottom:12px; display:flex; justify-content:space-between;">
          <span>🎛️ 실시간 파라미터 & 귀책 조작</span>
          <button class="btn btn-secondary btn-sm" onclick="resetCoqInputs()" style="padding:2px 8px; font-size:0.7rem;">기본값 리셋</button>
        </div>

        <div style="display:flex; flex-direction:column; gap:12px;">
          <!-- Slider 1: Supplier Liability Pct -->
          <div style="background:rgba(245, 158, 11, 0.08); border:1px solid rgba(245, 158, 11, 0.25); border-radius:6px; padding:8px 10px;">
            <div style="display:flex; justify-content:space-between; font-size:0.75rem; margin-bottom:3px;">
              <span style="color:#fbbf24; font-weight:800;">외주 협력사 귀책 분담률 (${supplierProfile.name})</span>
              <b class="num-mono" id="lblSliderSupplierPct" style="color:#fbbf24;">${defaultCoq.supplierLiabilityPct}%</b>
            </div>
            <input type="range" id="sliderSupplierPct" min="0" max="100" step="5" value="${defaultCoq.supplierLiabilityPct}" class="coq-slider" style="accent-color:#f59e0b;" oninput="onCoqSliderChange()">
          </div>

          <!-- Slider 2: Defect Qty -->
          <div>
            <div style="display:flex; justify-content:space-between; font-size:0.75rem; margin-bottom:3px;">
              <span style="color:var(--text-secondary); font-weight:600;">불량 수량 (Defect Qty)</span>
              <b class="num-mono" id="lblDefectQty" style="color:#60a5fa;">${defaultCoq.defectQty.toLocaleString()} ea</b>
            </div>
            <input type="range" id="sliderDefectQty" min="10" max="3000" step="10" value="${defaultCoq.defectQty}" class="coq-slider" oninput="onCoqSliderChange()">
          </div>

          <!-- Slider 3: Unit Price -->
          <div>
            <div style="display:flex; justify-content:space-between; font-size:0.75rem; margin-bottom:3px;">
              <span style="color:var(--text-secondary); font-weight:600;">부품 단가 (Unit Price)</span>
              <b class="num-mono" id="lblUnitPrice" style="color:#60a5fa;">₩${defaultCoq.unitPrice.toLocaleString()}</b>
            </div>
            <input type="range" id="sliderUnitPrice" min="10000" max="100000" step="2000" value="${defaultCoq.unitPrice}" class="coq-slider" oninput="onCoqSliderChange()">
          </div>

          <!-- Slider 4: Line Stop Hours -->
          <div>
            <div style="display:flex; justify-content:space-between; font-size:0.75rem; margin-bottom:3px;">
              <span style="color:var(--text-secondary); font-weight:600;">고객사 라인정지 시간 (Line Stop)</span>
              <b class="num-mono" id="lblLineStopHours" style="color:#f87171;">${defaultCoq.lineStopHours} 시간</b>
            </div>
            <input type="range" id="sliderLineStopHours" min="0" max="16" step="0.5" value="${defaultCoq.lineStopHours}" class="coq-slider" oninput="onCoqSliderChange()">
          </div>

          <!-- Slider 5: PCA Cost -->
          <div>
            <div style="display:flex; justify-content:space-between; font-size:0.75rem; margin-bottom:3px;">
              <span style="color:var(--text-secondary); font-weight:600;">영구대책 투자비용 (PCA CapEx)</span>
              <b class="num-mono" id="lblPcaCost" style="color:#38bdf8;">₩${defaultCoq.pcaCost.toLocaleString()}</b>
            </div>
            <input type="range" id="sliderPcaCost" min="1000000" max="25000000" step="500000" value="${defaultCoq.pcaCost}" class="coq-slider" oninput="onCoqSliderChange()">
          </div>
        </div>
      </div>

      <!-- Right: Detailed CoQ Breakdown Cards -->
      <div style="display:flex; flex-direction:column; gap:8px;">
        <div class="coq-cat-card" style="border-left:3px solid #f97316;">
          <div class="coq-cat-header">
            <span style="font-weight:700; color:#f97316;">1. 내부 실패비용 (Internal Failure)</span>
            <b class="num-mono" id="valCatInternal">${formatKRW(defaultCoq.totalInternalFailure)}</b>
          </div>
          <div class="coq-cat-sub">
            • 완제품/반제품 스크랩 폐기손실: <span id="valSubScrap" class="num-mono">${formatKRW(defaultCoq.scrapLoss)}</span><br>
            • 전수선별 인건비 (10,000ea): <span class="num-mono">₩12,000,000</span><br>
            • 사내/창고 긴급 격리 물류비: <span class="num-mono">₩3,500,000</span>
          </div>
        </div>

        <div class="coq-cat-card" style="border-left:3px solid #ef4444;">
          <div class="coq-cat-header">
            <span style="font-weight:700; color:#ef4444;">2. 외부 실패비용 (External Failure)</span>
            <b class="num-mono" id="valCatExternal">${formatKRW(defaultCoq.totalExternalFailure)}</b>
          </div>
          <div class="coq-cat-sub">
            • LGE 라인스톱 배상금 (4.5h @ ₩1,400만/h): <span id="valSubLineStop" class="num-mono">${formatKRW(defaultCoq.lineDownPenalty)}</span><br>
            • 긴급 항공 특송(Air Expedited) 비용: <span class="num-mono">₩15,000,000</span><br>
            • 필드 클레임 손실 보상금: <span class="num-mono">₩25,000,000</span>
          </div>
        </div>

        <div class="coq-cat-card" style="border-left:3px solid #38bdf8;">
          <div class="coq-cat-header">
            <span style="font-weight:700; color:#38bdf8;">3. 예방·평가비용 (Appraisal & Audit)</span>
            <b class="num-mono">${formatKRW(defaultCoq.totalAppraisal)}</b>
          </div>
          <div class="coq-cat-sub">
            • FA 정밀분석(Decap/SEM/X-Ray/신뢰성): <span class="num-mono">₩16,500,000</span><br>
            • 외주 협력사 긴급 품질감사 출장비: <span class="num-mono">₩4,200,000</span>
          </div>
        </div>
      </div>

    </div>

    <!-- Bottom Action Buttons -->
    <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid var(--border); padding-top:14px; flex-wrap:wrap; gap:8px;">
      <div style="display:flex; gap:8px;">
        <button class="btn btn-secondary btn-sm" onclick="openSupplierDebitNoteModal('${c.id}')" title="외주사에 발송할 공식 구상권 청구서 공문 출력">
          <i data-lucide="file-spreadsheet" style="width:14px; height:14px; color:#f59e0b;"></i> 📄 외주사 공식 구상권 청구서 (Debit Note) 출력
        </button>
      </div>
      <div style="display:flex; gap:8px;">
        <button class="btn btn-secondary btn-sm" onclick="applyCoqTo8DReport('${c.id}')">
          <i data-lucide="copy-check" style="width:14px; height:14px; color:#38bdf8;"></i> 8D 보고서 D5/D8에 CoQ 데이터 반영
        </button>
        <button class="btn btn-primary btn-sm" onclick="closeModal()">
          <i data-lucide="check" style="width:14px; height:14px;"></i> 닫기
        </button>
      </div>
    </div>
  `;

  if (window.lucide) lucide.createIcons();
}

/**
 * Handle live slider input changes in CoQ Modal
 */
function onCoqSliderChange() {
  const defectQty = parseInt(document.getElementById('sliderDefectQty').value, 10);
  const unitPrice = parseInt(document.getElementById('sliderUnitPrice').value, 10);
  const lineStopHours = parseFloat(document.getElementById('sliderLineStopHours').value);
  const pcaCost = parseInt(document.getElementById('sliderPcaCost').value, 10);
  const supplierLiabilityPct = parseInt(document.getElementById('sliderSupplierPct').value, 10);

  // Update slider label text
  document.getElementById('lblDefectQty').innerText = `${defectQty.toLocaleString()} ea`;
  document.getElementById('lblUnitPrice').innerText = `₩${unitPrice.toLocaleString()}`;
  document.getElementById('lblLineStopHours').innerText = `${lineStopHours} 시간`;
  document.getElementById('lblPcaCost').innerText = `₩${pcaCost.toLocaleString()}`;
  document.getElementById('lblSliderSupplierPct').innerText = `${supplierLiabilityPct}%`;

  const c = typeof getActiveCase === 'function' ? getActiveCase() : null;
  const res = calcCaseCoQ(c, { defectQty, unitPrice, lineStopHours, pcaCost, supplierLiabilityPct });

  // Update highlight banner
  document.getElementById('valTotalCoQ').innerText = formatKRW(res.totalCoQ);
  document.getElementById('valSupplierDebit').innerText = formatKRW(res.supplierDebitNoteAmount);
  document.getElementById('valCompanyNet').innerText = formatKRW(res.companyNetLoss);
  document.getElementById('valRoiPct').innerText = `+${res.roiPct}%`;

  // Update liability split bar
  const supplierName = getCaseSupplierProfile(c).name;
  document.getElementById('lblLiabilitySplit').innerHTML = `${supplierName} <b>${res.supplierLiabilityPct}%</b> : RAMOS <b>${100 - res.supplierLiabilityPct}%</b>`;
  document.getElementById('barSupplier').style.width = `${res.supplierLiabilityPct}%`;
  document.getElementById('barCompany').style.width = `${100 - res.supplierLiabilityPct}%`;
  document.getElementById('subLblSupplierDebit').innerText = formatKRW(res.supplierDebitNoteAmount);
  document.getElementById('subLblCompanyNet').innerText = formatKRW(res.companyNetLoss);

  // Update category cards
  document.getElementById('valCatInternal').innerText = formatKRW(res.totalInternalFailure);
  document.getElementById('valSubScrap').innerText = formatKRW(res.scrapLoss);
  document.getElementById('valCatExternal').innerText = formatKRW(res.totalExternalFailure);
  document.getElementById('valSubLineStop').innerText = formatKRW(res.lineDownPenalty);
}

function resetCoqInputs() {
  const c = typeof getActiveCase === 'function' ? getActiveCase() : null;
  openCoqSimulatorModal(c?.id);
}

/**
 * 1-Click apply CoQ calculations into 8D Case data
 */
function applyCoqTo8DReport(caseId) {
  const c = appData.cases.find(x => x.id === caseId) || getActiveCase();
  if (!c) return;

  const defectQty = parseInt(document.getElementById('sliderDefectQty')?.value || 876, 10);
  const unitPrice = parseInt(document.getElementById('sliderUnitPrice')?.value || 45000, 10);
  const lineStopHours = parseFloat(document.getElementById('sliderLineStopHours')?.value || 4.5);
  const pcaCost = parseInt(document.getElementById('sliderPcaCost')?.value || 8500000, 10);
  const supplierLiabilityPct = parseInt(document.getElementById('sliderSupplierPct')?.value || 70, 10);

  const coq = calcCaseCoQ(c, { defectQty, unitPrice, lineStopHours, pcaCost, supplierLiabilityPct });

  c.coqData = {
    calculatedAt: new Date().toISOString(),
    totalCoQ: coq.totalCoQ,
    supplierDebitNoteAmount: coq.supplierDebitNoteAmount,
    companyNetLoss: coq.companyNetLoss,
    supplierLiabilityPct: coq.supplierLiabilityPct,
    riskAvoidanceSavings: coq.riskAvoidanceSavings,
    totalInternalFailure: coq.totalInternalFailure,
    totalExternalFailure: coq.totalExternalFailure,
    totalAppraisal: coq.totalAppraisal,
    pcaCost: coq.pcaCost,
    netSavings: coq.netSavings,
    roiPct: coq.roiPct,
    lineStopHours: coq.lineStopHours,
    defectQty: coq.defectQty
  };

  saveAppData();

  if (typeof showBridgeToast === 'function') {
    showBridgeToast(`💰 외주사 구상액(${formatKRWShort(coq.supplierDebitNoteAmount)}) 및 CoQ/ROI 데이터가 8D 보고서에 영구 반영되었습니다!`, 'success');
  } else {
    alert(`💰 CoQ 정량 데이터가 Case ${c.id}에 저장되었습니다.`);
  }

  closeModal();
  renderCurrentView();
}

/**
 * =========================================================================
 * MODAL 3: OFFICIAL SUPPLIER DEBIT NOTE (외주사 공식 구상권 청구서)
 * =========================================================================
 */
function openSupplierDebitNoteModal(caseId) {
  const c = appData.cases.find(x => x.id === caseId) || getActiveCase();
  if (!c) return;

  const coq = calcCaseCoQ(c);
  const supplierProfile = getCaseSupplierProfile(c);

  const modal = document.getElementById('globalModal');
  const container = document.getElementById('modalContainer');
  if (!modal || !container) return;

  container.style.width = '840px';
  container.style.maxWidth = '95vw';
  modal.style.display = 'flex';

  container.innerHTML = `
    <div class="debit-note-wrapper" style="background:#ffffff; color:#0f172a; padding:24px; border-radius:8px; font-family:'Pretendard', sans-serif;">
      
      <!-- Top Header -->
      <div style="display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid #0f172a; padding-bottom:12px; margin-bottom:16px;">
        <div>
          <div style="font-size:1.35rem; font-weight:900; letter-spacing:-0.02em; color:#0f172a;">
            품질 부적합 손실비용 구상 청구서 (DEBIT NOTE)
          </div>
          <div style="font-size:0.75rem; color:#64748b; margin-top:2px;">
            문서번호: <b>RAMOS-DEBIT-2026-0901</b> | 발행일자: <b>2026-09-09</b>
          </div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:1.1rem; font-weight:800; color:#2563eb;">(주)라모스테크놀러지</div>
          <div style="font-size:0.72rem; color:#64748b;">품질혁신본부 / SQE 팀</div>
        </div>
      </div>

      <!-- Recipient & Subject Box -->
      <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:12px; margin-bottom:16px; font-size:0.8rem; line-height:1.6;">
        <div style="display:grid; grid-template-columns: 100px 1fr; gap:4px;">
          <span style="color:#64748b; font-weight:700;">수 신:</span>
          <b style="color:#0f172a;">${supplierProfile.name}${supplierProfile.plant ? ` ${supplierProfile.plant}` : ''} 품질 담당자 귀하</b>
          <span style="color:#64748b; font-weight:700;">참 조:</span>
          <span>${supplierProfile.contact} &lt;${supplierProfile.email}&gt;</span>
          <span style="color:#64748b; font-weight:700;">발 신:</span>
          <span>(주)라모스테크놀러지 품질혁신팀 김성중 S.Pro / 황승안 상무</span>
          <span style="color:#64748b; font-weight:700;">제 목:</span>
          <b style="color:#dc2626;">[구상 청구] DTV eMMC 16GB BGA 패키징 공정 이상(SQ-2026-002)에 따른 품질 실패비용 분담 청구의 건</b>
        </div>
      </div>

      <p style="font-size:0.78rem; color:#334155; line-height:1.5; margin-bottom:14px;">
        귀사의 무궁한 발전을 기원합니다.<br>
        2026년 08월 31일 고객사(LG전자 DTV 평택공장) 실장 라인에서 발생한 Boot Fail 불량(SCAR 번호: <b>SQ-2026-002</b>)과 관련하여, 정밀 FA 분석 결과 귀사 BGA 언더필 디스펜서 공압 이상(0.31MPa 급강하)에 따른 보이드 결함이 주원인(귀책 70%)으로 최종 판정되었습니다. 이에 따라 발생한 품질 실패비용을 계약에 의거하여 아래와 같이 정식 구상 청구하오니 기한 내 정산 조치를 요청드립니다.
      </p>

      <!-- Cost Table -->
      <table style="width:100%; border-collapse:collapse; font-size:0.76rem; margin-bottom:16px; border:1px solid #cbd5e1;">
        <thead>
          <tr style="background:#f1f5f9; border-bottom:1px solid #cbd5e1; text-align:center;">
            <th style="padding:6px; border-right:1px solid #cbd5e1;">비목 구분</th>
            <th style="padding:6px; border-right:1px solid #cbd5e1;">세부 산출 내역</th>
            <th style="padding:6px; border-right:1px solid #cbd5e1;">총 발생 손실액</th>
            <th style="padding:6px; border-right:1px solid #cbd5e1;">귀사 분담률</th>
            <th style="padding:6px;">구상 청구 금액</th>
          </tr>
        </thead>
        <tbody>
          <tr style="border-bottom:1px solid #e2e8f0;">
            <td style="padding:6px; font-weight:700; border-right:1px solid #cbd5e1; text-align:center;">내부 실패손실</td>
            <td style="padding:6px; border-right:1px solid #cbd5e1;">모듈 스크랩 폐기 876ea + 전수선별 10,000ea</td>
            <td style="padding:6px; text-align:right; border-right:1px solid #cbd5e1;" class="num-mono">${formatKRW(coq.totalInternalFailure)}</td>
            <td style="padding:6px; text-align:center; border-right:1px solid #cbd5e1;">${coq.supplierLiabilityPct}%</td>
            <td style="padding:6px; text-align:right; font-weight:700; color:#dc2626;" class="num-mono">${formatKRW(Math.round(coq.totalInternalFailure * coq.supplierLiabilityPct / 100))}</td>
          </tr>
          <tr style="border-bottom:1px solid #e2e8f0;">
            <td style="padding:6px; font-weight:700; border-right:1px solid #cbd5e1; text-align:center;">외부 클레임손실</td>
            <td style="padding:6px; border-right:1px solid #cbd5e1;">고객 라인스톱 배상(4.5h) + 긴급항공운임 + 보상금</td>
            <td style="padding:6px; text-align:right; border-right:1px solid #cbd5e1;" class="num-mono">${formatKRW(coq.totalExternalFailure)}</td>
            <td style="padding:6px; text-align:center; border-right:1px solid #cbd5e1;">${coq.supplierLiabilityPct}%</td>
            <td style="padding:6px; text-align:right; font-weight:700; color:#dc2626;" class="num-mono">${formatKRW(Math.round(coq.totalExternalFailure * coq.supplierLiabilityPct / 100))}</td>
          </tr>
          <tr style="border-bottom:1px solid #cbd5e1;">
            <td style="padding:6px; font-weight:700; border-right:1px solid #cbd5e1; text-align:center;">FA 분석비용</td>
            <td style="padding:6px; border-right:1px solid #cbd5e1;">X-Ray/SEM 정밀분석 + 신뢰성 TC 1000h 시험비</td>
            <td style="padding:6px; text-align:right; border-right:1px solid #cbd5e1;" class="num-mono">${formatKRW(coq.totalAppraisal)}</td>
            <td style="padding:6px; text-align:center; border-right:1px solid #cbd5e1;">${coq.supplierLiabilityPct}%</td>
            <td style="padding:6px; text-align:right; font-weight:700; color:#dc2626;" class="num-mono">${formatKRW(Math.round(coq.totalAppraisal * coq.supplierLiabilityPct / 100))}</td>
          </tr>
          <tr style="background:#fef2f2; font-weight:800; font-size:0.82rem;">
            <td colspan="2" style="padding:8px; text-align:center; border-right:1px solid #cbd5e1;">합 계 (Total Indemnity Claim)</td>
            <td style="padding:8px; text-align:right; border-right:1px solid #cbd5e1;" class="num-mono">${formatKRW(coq.totalCoQ)}</td>
            <td style="padding:8px; text-align:center; border-right:1px solid #cbd5e1;">${coq.supplierLiabilityPct}%</td>
            <td style="padding:8px; text-align:right; color:#dc2626;" class="num-mono">${formatKRW(coq.supplierDebitNoteAmount)}</td>
          </tr>
        </tbody>
      </table>

      <!-- Sign & Seal Section -->
      <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-top:20px; border-top:1px solid #e2e8f0; padding-top:12px; font-size:0.75rem;">
        <div>
          입금 계좌: 신한은행 110-384-XXXXXX (예금주: (주)라모스테크놀러지)<br>
          납부 기한: <b>2026년 09월 30일 限 (당월 세금계산서 상계 처리 가능)</b>
        </div>
        <div style="text-align:right;">
          <b>(주)라모스테크놀러지 대표이사 조장호</b> (직인생략)
        </div>
      </div>

    </div>

    <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid var(--border); padding-top:14px; margin-top:14px;">
      <span style="font-size:0.75rem; color:var(--text-muted);">
        A4 표준 공문 규격 · ERP/회계 정산 연동용
      </span>
      <div style="display:flex; gap:8px;">
        <button class="btn btn-secondary btn-sm" onclick="window.print()">
          <i data-lucide="printer" style="width:13px; height:13px;"></i> 공문 인쇄
        </button>
        <button class="btn btn-primary btn-sm" onclick="closeModal()">
          <i data-lucide="check" style="width:13px; height:13px;"></i> 확인
        </button>
      </div>
    </div>
  `;

  if (window.lucide) lucide.createIcons();
}

/**
 * =========================================================================
 * MODAL 4: CUSTOMER SLA DELAY JUSTIFICATION NOTICE (고객사 지연 양해 공문)
 * =========================================================================
 */
function openSlaDelayNoticeModal(caseId) {
  const c = appData.cases.find(x => x.id === caseId) || getActiveCase();
  if (!c) return;

  const modal = document.getElementById('globalModal');
  const container = document.getElementById('modalContainer');
  if (!modal || !container) return;

  container.style.width = '780px';
  container.style.maxWidth = '95vw';
  modal.style.display = 'flex';

  const noticeTextKO = `[고객사 8D 일정 현황 및 잠정 원인분석 중간보고]

수신: ${c.customer} (${c.customerContact || '품질보증팀'})
발신: (주)라모스테크놀러지 품질혁신팀 (${c.id})
대상 제품: ${c.product} (Lot: ${c.lotNumber})

1. 귀사의 무궁한 발전을 기원합니다.
2. 2026-08-31 접수된 불량 건에 대해 당사는 D3 긴급 유출방지 조치로써 즉시 라인 스톱 및 외주 공장 완제품 4,800ea 전량을 RED HOLD 격리 완료하였습니다.
3. 근본 원인 규명(D4)을 위해 고온 가속 수명시험(TC 1000h) 및 BGA X-Ray 비파괴 단면 분석을 심층 진행 중이며, 물리적 재현성을 완벽히 검증하기 위해 최종 보고서 제출 일정을 2026-09-14 18:00로 확약드리오니 양해를 부탁드립니다.
4. 추가 유출 위험은 100% 차단되었으며, 잠정 대책으로 무라타 X7R 125℃ 내열 소자 교체 및 리플로우 피크온도 최적화(PCN-2026-001)를 적용 완료하였습니다.

담당자: 품질혁신팀 김성중 S.Pro (sjkim@ramostek.com)`;

  container.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border); padding-bottom:14px; margin-bottom:16px;">
      <div style="display:flex; align-items:center; gap:10px;">
        <div style="width:36px; height:36px; border-radius:8px; background:linear-gradient(135deg, #f59e0b, #ef4444); display:flex; align-items:center; justify-content:center;">
          <i data-lucide="file-warning" style="color:#fff; width:20px; height:20px;"></i>
        </div>
        <div>
          <h2 style="font-size:1.1rem; font-weight:800; color:var(--text-primary);">
            고객사(${c.customer}) SLA 지연 공식 양해 공문 (Delay Justification)
          </h2>
          <p style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">
            고객사 클레임 패널티 면책을 위한 공식 중간보고 공문 1-Click 자동 작성기
          </p>
        </div>
      </div>
      <button class="btn btn-secondary btn-sm" onclick="closeModal()" style="padding:4px 10px;">
        <i data-lucide="x" style="width:14px; height:14px;"></i> 닫기
      </button>
    </div>

    <div style="background:var(--bg-card-subtle); border:1px solid var(--border); border-radius:8px; padding:14px; margin-bottom:14px;">
      <div style="font-size:0.75rem; font-weight:700; color:#38bdf8; margin-bottom:8px; display:flex; justify-content:space-between;">
        <span>📝 자동 생성된 공문 본문 (국문/영문 표준)</span>
        <button class="btn btn-secondary btn-sm" onclick="copyDelayNoticeText()" style="padding:2px 8px; font-size:0.7rem;">
          <i data-lucide="copy" style="width:12px; height:12px;"></i> 클립보드 복사
        </button>
      </div>
      <textarea id="txtDelayNotice" class="form-control" rows="12" style="width:100%; font-size:0.78rem; line-height:1.6; font-family:'Pretendard', sans-serif; resize:vertical;">${noticeTextKO}</textarea>
    </div>

    <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid var(--border); padding-top:14px;">
      <span style="font-size:0.72rem; color:#10b981; display:flex; align-items:center; gap:4px;">
        <i data-lucide="shield-check" style="width:13px; height:13px;"></i>
        고객사 이메일 발송 시 SLA 위반 페널티 유예 및 파트너십 신뢰 유지
      </span>
      <div style="display:flex; gap:8px;">
        <button class="btn btn-primary btn-sm" onclick="copyDelayNoticeText(); closeModal();">
          <i data-lucide="check" style="width:14px; height:14px;"></i> 복사 후 닫기
        </button>
      </div>
    </div>
  `;

  if (window.lucide) lucide.createIcons();
}

function copyDelayNoticeText() {
  const el = document.getElementById('txtDelayNotice');
  if (el) {
    el.select();
    navigator.clipboard.writeText(el.value);
    if (typeof showBridgeToast === 'function') {
      showBridgeToast('📋 고객사 공식 양해문이 클립보드에 복사되었습니다!', 'success');
    } else {
      alert('공문이 복사되었습니다.');
    }
  }
}

/**
 * =========================================================================
 * 8D OFFICIAL REPORT CoQ & FINANCIAL TABLE FORMATTER
 * =========================================================================
 */
function renderReportCoQFinancialTable(c) {
  return '';
}

/**
 * =========================================================================
 * DASHBOARD SLA 4-MILESTONE SUMMARY STRIP WIDGET
 * =========================================================================
 */
function renderDashboardSlaCoqStrip() {
  const c = typeof getActiveCase === 'function' ? getActiveCase() : null;
  const sla = calculateCaseSla(c);
  if (!c || !sla) return '';

  return `
    <div class="dashboard-sla-coq-strip" style="margin-bottom: 20px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:8px;">
        <div style="display:flex; align-items:center; gap:8px;">
          <div style="width:28px; height:28px; border-radius:6px; background:linear-gradient(135deg, #0ea5e9, #6366f1); display:flex; align-items:center; justify-content:center;">
            <i data-lucide="gauge" style="color:#fff; width:16px; height:16px;"></i>
          </div>
          <div>
            <div style="font-size:0.88rem; font-weight:800; color:var(--text-primary); display:flex; align-items:center; gap:6px;">
              <span>전사 고객 8D SLA 마일스톤 카운트다운 실시간 관제탑</span>
              <span class="badge-pill badge-ok" style="font-size:0.68rem;">SLA ${sla?.complianceRate === null ? '평가 전' : sla.complianceRate + '% 준수'}</span>
            </div>
            <div style="font-size:0.72rem; color:var(--text-muted);">
              ${sla?.ruleName || 'LGE DTV'} 규격 실시간 추적 · D3 초동봉쇄(24h) / D5 원인대책(14D) / D8 종결(30D) 일정 보증
            </div>
          </div>
        </div>

        <div style="display:flex; gap:8px;">
          <button class="btn btn-secondary btn-sm" onclick="openSlaDelayNoticeModal('${c ? c.id : ''}')" title="SLA 지연 위험 시 고객사 공식 양해 공문 생성">
            <i data-lucide="file-warning" style="width:13px; height:13px; color:#f59e0b;"></i>
            <span>D3 지연 소명 공문</span>
          </button>
          <button class="btn btn-primary btn-sm" onclick="openSlaTimelineModal('${c ? c.id : ''}')" title="SLA 마일스톤 타임라인 상세 보기">
            <i data-lucide="clock" style="width:13px; height:13px; color:#fff;"></i>
            <span>SLA 타임라인 상세</span>
          </button>
        </div>
      </div>

      <!-- 4 Quality Milestone Cards Grid -->
      <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:10px;">
        <div class="dash-sla-box" style="border-left:3px solid #10b981;">
          <div class="dash-sla-lbl">고객사 8D SLA 종합 준수율</div>
          <div class="dash-sla-val num-mono" style="color:#34d399;">${sla?.complianceRate === null ? '평가 전' : sla.complianceRate.toFixed(1) + '%'}</div>
          <div class="dash-sla-sub">위반 0건 · 고객 신뢰 확보</div>
        </div>
        <div class="dash-sla-box" style="border-left:3px solid #38bdf8;">
          <div class="dash-sla-lbl">D3 긴급 봉쇄(24h) 잔여</div>
          <div class="dash-sla-val num-mono" style="color:#38bdf8;">
            ${sla ? slaDeltaLabel(sla.d3) : '계산 불가'}
          </div>
          <div class="dash-sla-sub">7-Area Material Lock 100%</div>
        </div>
        <div class="dash-sla-box" style="border-left:3px solid #a855f7;">
          <div class="dash-sla-lbl">D5 원인·영구대책(14D) 납기</div>
          <div class="dash-sla-val num-mono" style="color:#c084fc;">${sla ? slaDeltaLabel(sla.d5) : '계산 불가'}</div>
          <div class="dash-sla-sub">5-Why & PCA 승인 완료</div>
        </div>
        <div class="dash-sla-box" style="border-left:3px solid #fbbf24;">
          <div class="dash-sla-lbl">D8 최종 종결(30D) 목표</div>
          <div class="dash-sla-val num-mono" style="color:#fbbf24;">${sla ? slaDeltaLabel(sla.d8) : '계산 불가'}</div>
          <div class="dash-sla-sub">유효성 검증 및 8D 승인 완결</div>
        </div>
      </div>
    </div>
  `;
}
