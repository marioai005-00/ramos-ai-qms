/**
 * Customer 8D SLA rules, milestone calculation, header timer, timeline modal and dashboard strip.
 * Milestones are judged only from dispatch evidence recorded on the Case.
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
    labelText = 'D8 종결';
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
        <div class="sla-metric-sub">${sla.complianceRate === null ? '완료 기록 없음' : '완료된 마일스톤 기준'}</div>
      </div>
      <div class="sla-metric-card" style="border-left:3px solid #38bdf8;">
        <div class="sla-metric-lbl">초동 D3 봉쇄 SLA</div>
        <div class="sla-metric-val num-mono" style="color:#38bdf8;">${slaDeltaLabel(sla.d3)}</div>
        <div class="sla-metric-sub">${sla.d3.status}</div>
      </div>
      <div class="sla-metric-card" style="border-left:3px solid #a855f7;">
        <div class="sla-metric-lbl">영구대책 D5 SLA</div>
        <div class="sla-metric-val num-mono" style="color:#c084fc;">${slaDeltaLabel(sla.d5)}</div>
        <div class="sla-metric-sub">${sla.d5.status}</div>
      </div>
      <div class="sla-metric-card" style="border-left:3px solid #f59e0b;">
        <div class="sla-metric-lbl">최종 종결 D8 SLA</div>
        <div class="sla-metric-val num-mono" style="color:#fbbf24;">${slaDeltaLabel(sla.d8)}</div>
        <div class="sla-metric-sub">${sla.d8.status}</div>
      </div>
    </div>

    <!-- AIAG-VDA 8D SLA Milestone Stepper -->
    <div style="background:var(--bg-card-subtle); border:1px solid var(--border); border-radius:8px; padding:16px; margin-bottom:16px;">
      <div style="font-size:0.8rem; font-weight:800; color:var(--text-primary); margin-bottom:12px; display:flex; justify-content:space-between; align-items:center;">
        <span>8D 마일스톤 이행 현황 (${sla.ruleName})</span>
      </div>

      <div style="display:flex; flex-direction:column; gap:10px;">
        <div class="sla-timeline-row ${hasCurrentStageApproval(c, 'D2') ? 'is-completed' : ''}">
          <div class="sla-row-step">D1~D2</div>
          <div class="sla-row-content">
            <div class="sla-row-title">CFT 팀 배속 & 5W2H 문제 정의</div>
            <div class="sla-row-meta">D1 결재: ${hasCurrentStageApproval(c, 'D1') ? '완료' : '미완료'} | D2 결재: ${hasCurrentStageApproval(c, 'D2') ? '완료' : '미완료'}</div>
          </div>
          <div class="sla-row-badge ${hasCurrentStageApproval(c, 'D2') ? 'ok' : ''}">${hasCurrentStageApproval(c, 'D2') ? '결재 완료' : '진행 중'}</div>
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
      <div></div>
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
              <span>선택한 Case의 8D SLA 마일스톤</span>
              <span class="badge-pill badge-ok" style="font-size:0.68rem;">SLA ${sla?.complianceRate === null ? '평가 전' : sla.complianceRate + '% 준수'}</span>
            </div>
            <div style="font-size:0.72rem; color:var(--text-muted);">
              ${sla?.ruleName || ''} 규격 기준 · 송부 증빙이 기록된 시각으로 계산합니다
            </div>
          </div>
        </div>

        <div style="display:flex; gap:8px;">
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
          <div class="dash-sla-sub">${sla?.complianceRate === null ? '완료 기록 없음' : '완료된 마일스톤 기준'}</div>
        </div>
        <div class="dash-sla-box" style="border-left:3px solid #38bdf8;">
          <div class="dash-sla-lbl">D3 긴급 봉쇄(24h) 잔여</div>
          <div class="dash-sla-val num-mono" style="color:#38bdf8;">
            ${sla ? slaDeltaLabel(sla.d3) : '계산 불가'}
          </div>
          <div class="dash-sla-sub">${sla.d3.status}</div>
        </div>
        <div class="dash-sla-box" style="border-left:3px solid #a855f7;">
          <div class="dash-sla-lbl">D5 원인·영구대책(14D) 납기</div>
          <div class="dash-sla-val num-mono" style="color:#c084fc;">${sla ? slaDeltaLabel(sla.d5) : '계산 불가'}</div>
          <div class="dash-sla-sub">${sla.d5.status}</div>
        </div>
        <div class="dash-sla-box" style="border-left:3px solid #fbbf24;">
          <div class="dash-sla-lbl">D8 최종 종결(30D) 목표</div>
          <div class="dash-sla-val num-mono" style="color:#fbbf24;">${sla ? slaDeltaLabel(sla.d8) : '계산 불가'}</div>
          <div class="dash-sla-sub">${sla.d8.status}</div>
        </div>
      </div>
    </div>
  `;
}
