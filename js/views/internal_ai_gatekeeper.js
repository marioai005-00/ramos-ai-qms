/* ========================================================================= */
/* PRE-SUBMISSION CHECK: what the Case records before a report goes out      */
/* Rule-based and read-only. It reports open items; it gives no score and    */
/* never changes the Case.                                                   */
/* ========================================================================= */

let gatekeeperActiveTab = 'gate3D';
const GATEKEEPER_TITLES = { gate3D: 'Initial 3D (D1~D3)', gate5D: 'Interim 5D (D1~D5)', gate8D: 'Final 8D (D1~D8)' };

/** Open items for one report gate, taken from the same review rules the approval flow uses. */
function runCustomerPreSubmissionAudit(c, gateKey) {
  const last = REPORT_GATE_STAGES[gateKey];
  const gate = ensureCaseGates(c)[gateKey] || {};
  const stages = QUALITY_STAGES.slice(0, last).map(stage => {
    const approved = hasCurrentStageApproval(c, stage);
    // A stage that still needs earlier approvals reports that instead of its own content gaps.
    const contentGap = approved ? '' : stageReviewError(c, stage);
    const evidence = (c.evidenceList || []).filter(item => (item.linkedStages || []).includes(stage)).length;
    return { stage, approved, contentGap, evidence };
  });
  const approvers = (gate.approvers || []).map(a => ({ role: a.role, name: a.name, approved: a.status === 'Approved' }));
  const open = [];
  stages.filter(s => !s.approved).forEach(s => open.push(`${s.stage} 결재 미완료${s.contentGap ? ' — ' + s.contentGap : ''}`));
  approvers.filter(a => !a.approved).forEach(a => open.push(`보고서 결재 대기: ${a.role} ${a.name || ''}`.trim()));
  if (gate.snapshot && JSON.stringify(gate.snapshot) !== JSON.stringify(approvalSnapshot(c, QUALITY_STAGES[last - 1]))) open.push('보고서 결재 이후 내용이 변경되었습니다. 재결재가 필요합니다.');
  return { gateKey, stages, approvers, open, dispatched: Boolean(gate.dispatchedByQuality) };
}

function openCustomerAiGatekeeperModal(caseId, targetGate) {
  const c = (caseId && appData.cases.find(item => item.id === caseId)) || getActiveCase();
  if (!c) { alert('먼저 Case를 선택해 주세요.'); return; }
  if (GATEKEEPER_TITLES[targetGate]) gatekeeperActiveTab = targetGate;
  const modal = document.getElementById('globalModal');
  const container = document.getElementById('modalContainer');
  if (!modal || !container) return;
  container.innerHTML = renderCustomerAiGatekeeperContent(c, runCustomerPreSubmissionAudit(c, gatekeeperActiveTab));
  modal.style.display = 'flex';
  if (window.lucide) lucide.createIcons();
}

function renderCustomerAiGatekeeperContent(c, audit) {
  const esc = qmsUiEscape;
  const chip = (ok, yes, no) => `<span class="qms-status-chip qms-tone-${ok ? 'success' : 'warn'}">${ok ? yes : no}</span>`;
  return `
    <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border); padding-bottom:10px; margin-bottom:12px; gap:12px;">
      <div><h3 style="margin:0; font-size:1.05rem; font-weight:800;">고객 송부 전 점검 · ${esc(c.id)}</h3>
        <p style="margin:2px 0 0; font-size:0.78rem; color:var(--text-secondary);">Case에 기록된 결재·Evidence 상태만 보여 줍니다. 내용의 타당성은 판정하지 않습니다.</p></div>
      <button type="button" class="btn btn-secondary btn-sm" onclick="closeModal()">닫기</button>
    </div>
    <div style="display:flex; gap:6px; margin-bottom:12px; flex-wrap:wrap;">
      ${Object.entries(GATEKEEPER_TITLES).map(([key, title]) => `<button type="button" class="btn btn-sm ${key === audit.gateKey ? 'btn-primary' : 'btn-secondary'}" onclick="setGatekeeperTab('${key}')">${title}</button>`).join('')}
    </div>
    <div class="stage-draft-block stage-draft-${audit.open.length ? 'missing' : 'fact'}">
      <h4>${audit.open.length ? `송부 전 해결할 항목 <span>${audit.open.length}</span>` : '열린 항목 없음'}</h4>
      ${audit.open.length ? `<ul>${audit.open.map(item => `<li>${esc(item)}</li>`).join('')}</ul>` : `<p style="margin:0; font-size:0.82rem;">${audit.dispatched ? '송부 증빙이 기록된 보고서입니다.' : '단계 결재와 보고서 결재가 모두 기록되어 있습니다. 실제 송부 후 증빙을 기록해 주세요.'}</p>`}
    </div>
    <div class="quality-table-wrap" style="margin-top:12px;"><table class="custom-table">
      <thead><tr><th>단계</th><th>결재</th><th>연결 Evidence</th><th>확인 필요</th></tr></thead>
      <tbody>${audit.stages.map(s => `<tr><td><b>${s.stage}</b></td><td>${chip(s.approved, '완료', '미완료')}</td><td class="num-mono">${s.evidence}건</td><td>${esc(s.contentGap || '—')}</td></tr>`).join('')}</tbody>
    </table></div>
    <div class="quality-table-wrap" style="margin-top:12px;"><table class="custom-table">
      <thead><tr><th>보고서 결재 역할</th><th>결재자</th><th>상태</th></tr></thead>
      <tbody>${audit.approvers.length ? audit.approvers.map(a => `<tr><td>${esc(a.role)}</td><td>${esc(a.name)}</td><td>${chip(a.approved, '승인', '대기')}</td></tr>`).join('') : '<tr><td colspan="3">결재선이 구성되지 않았습니다.</td></tr>'}</tbody>
    </table></div>`;
}

function setGatekeeperTab(tab) {
  if (!GATEKEEPER_TITLES[tab]) return;
  gatekeeperActiveTab = tab;
  openCustomerAiGatekeeperModal(null, tab);
}

if (typeof window !== 'undefined') {
  window.runCustomerPreSubmissionAudit = runCustomerPreSubmissionAudit;
  window.openCustomerAiGatekeeperModal = openCustomerAiGatekeeperModal;
  window.renderCustomerAiGatekeeperContent = renderCustomerAiGatekeeperContent;
  window.setGatekeeperTab = setGatekeeperTab;
}
