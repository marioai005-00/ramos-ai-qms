/* ========================================================================= */
/* SUPPLIER TICKET SUBMISSION CHECK                                          */
/* Lists what a supplier ticket contains and which fields were left empty.   */
/* It does not read file contents, gives no score and proposes no decision.  */
/* ========================================================================= */

function buildSupplierSubmissionCheck(ticket) {
  const missing = [];
  const product = ticket.targetProduct || {};
  [['customer', '적용 고객사'], ['partName', '대상 제품명'], ['partNumber', '품목코드'], ['lotNo', '생산 Lot']].forEach(([key, label]) => { if (!product[key]) missing.push(label); });
  const files = ticket.evidenceFiles || [];
  if (!files.length) missing.push('제출 원본 파일');
  if (ticket.ticketType === 'PCN') {
    if (!(ticket.details?.comparisonTable || []).length) missing.push('변경 전후 대조표');
    if (!ticket.details?.plannedSampleDate) missing.push('샘플 예정일');
    if (!ticket.details?.plannedMassDate) missing.push('양산 적용 예정일');
  } else {
    const incident = ticket.incident || {};
    [['processStep', '발생 공정'], ['lineAction', '라인 조치'], ['containmentAction', '초동 조치 내용'], ['quarantineLocation', '격리 위치']].forEach(([key, label]) => { if (!incident[key]) missing.push(label); });
    [['inputQty', '투입 수량'], ['defectQty', '불량 수량'], ['quarantineQty', '격리 수량']].forEach(([key, label]) => { if (!Number.isInteger(incident[key])) missing.push(label); });
  }
  return { files, missing, resubmissions: ticket.resubmissions || [] };
}

function runSupplierAiInspection(ticketId) {
  const ticket = typeof getSupplierTicketRaw === 'function' ? getSupplierTicketRaw(ticketId) : null;
  const container = document.getElementById('aiSupplierAuditContainer');
  if (!ticket || !container) return;
  const esc = qmsUiEscape;
  const check = buildSupplierSubmissionCheck(ticket);
  container.innerHTML = `
    <div class="stage-draft-block stage-draft-${check.missing.length ? 'missing' : 'fact'}">
      <h4>제출 자료 점검 ${check.missing.length ? `<span>미입력 ${check.missing.length}</span>` : ''}</h4>
      <p style="margin:0 0 6px; font-size:0.78rem; color:var(--text-secondary);">접수 양식의 입력 여부와 첨부 목록만 확인합니다. 첨부 파일의 내용은 읽지 않으므로 원본은 심의자가 직접 확인해야 합니다.</p>
      ${check.missing.length ? `<ul>${check.missing.map(item => `<li>미입력: ${esc(item)}</li>`).join('')}</ul>` : '<p style="margin:0; font-size:0.82rem;">접수 양식의 항목이 모두 입력되어 있습니다.</p>'}
    </div>
    <div class="stage-draft-block stage-draft-fact">
      <h4>제출 원본 <span>${check.files.length}</span></h4>
      ${check.files.length ? `<ul>${check.files.map(file => `<li>${esc(file.name)} · ${esc(file.size)} · ${file.phase === 'Resubmission' ? '보완 제출' : '최초 제출'} · SHA-256 ${esc(String(file.sha256 || '').slice(0, 12))}…</li>`).join('')}</ul>` : '<p style="margin:0; font-size:0.82rem;">첨부된 원본이 없습니다.</p>'}
      ${check.resubmissions.length ? `<p style="margin:6px 0 0; font-size:0.78rem;">보완 제출 ${check.resubmissions.length}회</p>` : ''}
    </div>`;
  container.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

if (typeof window !== 'undefined') {
  window.buildSupplierSubmissionCheck = buildSupplierSubmissionCheck;
  window.runSupplierAiInspection = runSupplierAiInspection;
}
