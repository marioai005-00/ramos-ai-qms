/* ========================================================================= */
/* SUPPLIER TICKET → 8D CASE IMPORT (D3 · D4 · D5)                           */
/* Shows only tickets a reviewer linked to this Case and copies what the     */
/* supplier actually reported. Imported values stay unverified until the     */
/* owner confirms them; nothing is marked completed or approved here.        */
/* ========================================================================= */

let supplierBridgeLoading = false;

function showBridgeToast(message, type = 'success') {
  let toastContainer = document.getElementById('bridgeToastContainer');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'bridgeToastContainer';
    toastContainer.className = 'bridge-toast-container';
    document.body.appendChild(toastContainer);
  }
  const toast = document.createElement('div');
  toast.className = `bridge-toast bridge-toast-${type}`;
  const icon = document.createElement('div');
  icon.className = 'bridge-toast-icon';
  icon.innerHTML = `<i data-lucide="${type === 'success' ? 'check-circle-2' : type === 'warning' ? 'alert-triangle' : 'info'}"></i>`;
  const text = document.createElement('div');
  text.className = 'bridge-toast-msg';
  text.textContent = message;
  const close = document.createElement('button');
  close.className = 'bridge-toast-close';
  close.textContent = '×';
  close.onclick = () => toast.remove();
  toast.append(icon, text, close);
  toastContainer.appendChild(toast);
  if (window.lucide) lucide.createIcons({ root: toast });
  setTimeout(() => toast.remove(), 4800);
}

/** Tickets a reviewer bound to this Case. Never falls back to unrelated tickets. */
function getLinkedSupplierTickets(caseId, type) {
  if (typeof supplierTicketStore === 'undefined' || CURRENT_USER?.isSupplier) return [];
  if (!supplierTicketStore.loaded && !supplierBridgeLoading) {
    supplierBridgeLoading = true;
    refreshSupplierRecords().finally(() => {
      supplierBridgeLoading = false;
      if (appData.currentView === 'stage') renderCurrentView();
    });
  }
  return supplierTicketStore.raw.filter(ticket => ticket.sqeReview?.bound8DCaseId === caseId && (!type || ticket.ticketType === type));
}

function bridgeEscape(value) { return qmsUiEscape(value ?? ''); }
function bridgeQuantity(value) { return Number.isInteger(value) ? value.toLocaleString() + ' ea' : '미입력'; }
function bridgeStatus(ticket) { return typeof getSupplierStatusBadge === 'function' ? getSupplierStatusBadge(ticket.status) : bridgeEscape(ticket.status); }
function bridgeHeader(kicker, ticket, imported) {
  return `<div class="bridge-strip-header">
    <div class="bridge-badge-group">
      <span class="bridge-kicker-tag"><i data-lucide="factory" style="width:12px; height:12px;"></i> ${kicker}</span>
      <span class="bridge-status-pill ${imported ? 'pill-synced' : 'pill-urgent'}">${imported ? '가져옴 · 담당자 확인 필요' : '아직 가져오지 않음'}</span>
    </div>
    <div class="bridge-ticket-ref"><span>외주 접수:</span> <strong>${bridgeEscape(ticket.ticketId)}</strong><span class="bridge-sep">·</span><strong>${bridgeEscape(ticket.supplier?.companyName)}</strong><span class="bridge-sep">·</span>${bridgeStatus(ticket)}</div>
  </div>`;
}

/* ------------------------------ D3 ---------------------------------------- */

function renderD3SupplierBridgeBanner(c) {
  if (!c) return '';
  return getLinkedSupplierTickets(c.id, 'Issue').map(ticket => {
    const incident = ticket.incident || {};
    const marker = `외주 접수 ${ticket.ticketId}`;
    const imported = (c.d3?.materialFlow || []).some(row => String(row.evidence || '').includes(marker));
    return `<div class="supplier-bridge-strip d3-containment-bridge ${imported ? 'is-synced' : 'is-pending'}">
      ${bridgeHeader('외주 접수 연계 · D3 봉쇄', ticket, imported)}
      <div class="bridge-strip-body">
        <div class="bridge-metric-cards">
          <div class="bridge-metric-card"><div class="metric-label">외주사 보고 공정 / 라인 조치</div><div class="metric-val" style="font-size:0.85rem; font-weight:700;">${bridgeEscape(incident.processStep || '미입력')}</div><div class="metric-sub">${bridgeEscape(incident.lineAction || '라인 조치 미입력')}</div></div>
          <div class="bridge-metric-card"><div class="metric-label">투입 수량</div><div class="metric-val num-mono" style="font-size:1.05rem; font-weight:800;">${bridgeQuantity(incident.inputQty)}</div><div class="metric-sub">LOT ${bridgeEscape(ticket.targetProduct?.lotNo || '미입력')}</div></div>
          <div class="bridge-metric-card"><div class="metric-label">불량 수량</div><div class="metric-val num-mono" style="font-size:1.05rem; font-weight:800;">${bridgeQuantity(incident.defectQty)}</div><div class="metric-sub">${incident.defectRate ? bridgeEscape(incident.defectRate) + '%' : '불량률 계산 불가'}</div></div>
          <div class="bridge-metric-card"><div class="metric-label">격리 수량</div><div class="metric-val num-mono" style="font-size:1.05rem; font-weight:800;">${bridgeQuantity(incident.quarantineQty)}</div><div class="metric-sub">${bridgeEscape(incident.quarantineLocation || '격리 위치 미입력')}</div></div>
        </div>
        <div class="bridge-action-row">
          <div class="bridge-note-text"><i data-lucide="info" style="width:13px; height:13px;"></i> 외주사가 보고한 수량을 D3 재고 흐름의 [1. 원자재/협력사] 행과 봉쇄조치 목록에 옮깁니다. 상태는 미확인·Open으로 들어가며, 담당자가 원본을 확인한 뒤 직접 확정해야 합니다.</div>
          <button type="button" class="btn btn-primary btn-bridge-sync" onclick="syncSupplierContainmentToD3('${bridgeEscape(ticket.ticketId)}')"><i data-lucide="download" style="width:14px; height:14px;"></i> ${imported ? '보고값 다시 가져오기' : '외주사 보고값을 D3로 가져오기'}</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

function syncSupplierContainmentToD3(ticketId) {
  const c = getActiveCase();
  const ticket = c && getLinkedSupplierTickets(c.id, 'Issue').find(item => item.ticketId === ticketId);
  if (!ticket) { alert('이 Case에 연결된 외주 Issue 접수를 찾을 수 없습니다.'); return; }
  if (typeof captureD3Form === 'function' && document.getElementById('d3QualityForm')) captureD3Form(c);
  const d3 = ensureD3Structure(c);
  if (!Array.isArray(d3.materialFlow) || d3.materialFlow.length !== 7) d3.materialFlow = createD3MaterialFlowRows(c);
  const incident = ticket.incident || {};
  const supplierName = ticket.supplier?.companyName || '';
  const marker = `외주 접수 ${ticket.ticketId}`;
  const row = d3.materialFlow.find(item => String(item.area || '').includes('협력사')) || d3.materialFlow[0];
  // Only quantities the supplier entered are copied; blanks leave the existing value untouched.
  if (ticket.targetProduct?.lotNo) row.lot = ticket.targetProduct.lotNo;
  if (Number.isInteger(incident.inputQty)) row.totalQty = incident.inputQty;
  if (Number.isInteger(incident.quarantineQty)) row.holdQty = incident.quarantineQty;
  if (Number.isInteger(incident.defectQty)) row.ngQty = incident.defectQty;
  row.status = '미확인';
  row.evidence = `${marker} ${supplierName} 보고값 (사내 확인 전)`;
  d3.actions = Array.isArray(d3.actions) ? d3.actions : [];
  const actionId = `ICA-${ticket.ticketId}`;
  if (!d3.actions.some(action => action.id === actionId)) {
    d3.actions.push({
      id: actionId,
      target: `외주 ${supplierName}${ticket.supplier?.plant ? ' · ' + ticket.supplier.plant : ''}`,
      action: incident.containmentAction ? `[외주사 보고] ${incident.containmentAction}` : '[외주사 초동 조치 내용 확인 필요]',
      owner: '', due: '', status: 'Open', result: '', source: marker
    });
  }
  d3.approval = { ...(d3.approval || {}), status: 'Draft', humanConfirmed: false };
  window.QMS_SAVE_REASON = `Supplier ticket ${ticket.ticketId} imported into D3 of ${c.id}`;
  saveAppData();
  renderCurrentView();
  showBridgeToast(`${ticket.ticketId}의 보고값을 D3에 가져왔습니다. 미확인 상태이므로 원본 확인 후 확정해 주세요.`);
}

/* ------------------------------ D4 ---------------------------------------- */

function renderD4SupplierBridgeWidget(c) {
  if (!c) return '';
  const tickets = getLinkedSupplierTickets(c.id);
  if (!tickets.length) return '';
  const known = new Set((c.evidenceList || []).map(item => item.sha256).filter(Boolean));
  const rows = tickets.flatMap(ticket => (ticket.evidenceFiles || []).map(file => ({ ticket, file })));
  return `<div class="card quality-stage-card supplier-bridge-card d4-evidence-bridge">
    <div class="quality-tool-head inline-head"><div>
      <span class="quality-tool-kicker"><i data-lucide="folder-symlink" style="width:13px; height:13px;"></i> 외주 접수 연계 · D4 EVIDENCE</span>
      <h3>연결된 외주 접수의 제출 원본</h3>
      <p>외주사가 제출한 원본 파일을 이 Case의 D4 Evidence로 복사합니다. 복사해도 분석 결과나 원인 판정은 작성되지 않습니다.</p>
    </div></div>
    <div class="bridge-files-table-wrap"><table class="custom-table bridge-files-table">
      <thead><tr><th>외주 접수</th><th>파일</th><th>제출 구분</th><th>Case Evidence</th><th style="text-align:center;">작업</th></tr></thead>
      <tbody>${rows.length ? rows.map(({ ticket, file }) => {
        const imported = known.has(file.sha256);
        return `<tr class="${imported ? 'row-registered' : ''}">
          <td><strong class="num-mono">${bridgeEscape(ticket.ticketId)}</strong><div style="font-size:0.72rem; color:var(--text-muted);">${bridgeEscape(ticket.supplier?.companyName)}</div></td>
          <td><div style="font-weight:600;">${bridgeEscape(file.name)}</div><div style="font-size:0.7rem; color:var(--text-muted);">${bridgeEscape(file.size)}</div></td>
          <td>${file.phase === 'Resubmission' ? '보완 제출' : '최초 제출'}</td>
          <td><span class="badge-pill ${imported ? 'badge-ok' : 'badge-gray'}">${imported ? '등록됨' : '미등록'}</span></td>
          <td style="text-align:center;"><button type="button" class="btn btn-secondary btn-sm" onclick="downloadSupplierTicketFile('${bridgeEscape(ticket.ticketId)}','${bridgeEscape(file.id)}')">원본</button>
            <button type="button" class="btn btn-primary btn-sm" ${imported ? 'disabled' : ''} onclick="importSupplierFileToCaseEvidence('${bridgeEscape(ticket.ticketId)}','${bridgeEscape(file.id)}')">D4 Evidence로 복사</button></td>
        </tr>`;
      }).join('') : '<tr><td colspan="5" style="text-align:center; color:var(--text-muted);">연결된 외주 접수에 제출된 원본이 없습니다.</td></tr>'}</tbody>
    </table></div>
  </div>`;
}

async function importSupplierFileToCaseEvidence(ticketId, fileId) {
  const c = getActiveCase();
  const ticket = c && getLinkedSupplierTickets(c.id).find(item => item.ticketId === ticketId);
  const meta = ticket?.evidenceFiles?.find(item => item.id === fileId);
  if (!meta) { alert('이 Case에 연결된 외주 접수 원본을 찾을 수 없습니다.'); return; }
  if (typeof captureD4Form === 'function' && document.getElementById('d4QualityForm')) captureD4Form(c);
  try {
    saveAppData();
    await QMSApi.flushSaves();
    const response = await fetch(`/__api__/qms/supplier-tickets/${encodeURIComponent(ticketId)}/files/${encodeURIComponent(fileId)}`, { credentials: 'same-origin', cache: 'no-store' });
    if (!response.ok) throw new Error(`원본 요청 실패 (HTTP ${response.status})`);
    const file = new File([await response.blob()], meta.name);
    const result = await QMSApi.uploadCaseEvidence(c.id, file, 'User evidence', ['D4'], `외주 접수 ${ticketId} (${ticket.supplier?.companyName || ''}) 제출 원본`);
    // Original, metadata and revision are committed together by the server.
    Object.assign(c, result.case);
    saveAppData();
    await QMSApi.flushSaves();
    showBridgeToast(`${meta.name}을 D4 Evidence로 복사했습니다. 분석 결과는 담당자가 직접 작성해 주세요.`);
  } catch (error) {
    alert(`원본을 복사하지 못했습니다. ${error.message}`);
  }
  if (getActiveCase()?.id === c.id) renderCurrentView();
}

/* ------------------------------ D5 ---------------------------------------- */

function renderD5SupplierBridgeBanner(c) {
  if (!c) return '';
  return getLinkedSupplierTickets(c.id, 'PCN').map(ticket => {
    const details = ticket.details || {};
    const marker = `외주 PCN ${ticket.ticketId}`;
    const imported = (c.d5?.candidates || []).some(row => row.source === marker);
    const rows = details.comparisonTable || [];
    return `<div class="supplier-bridge-strip d5-pcn-bridge ${imported ? 'is-synced' : 'is-pending'}" style="margin-bottom:18px;">
      ${bridgeHeader('외주 접수 연계 · D5 대책 후보', ticket, imported)}
      <div class="bridge-strip-body">
        <div class="bridge-metric-cards">
          <div class="bridge-metric-card" style="grid-column: span 2;"><div class="metric-label">변경 요청 제목</div><div class="metric-val" style="font-size:0.88rem; font-weight:700;">${bridgeEscape(details.title)}</div><div class="metric-sub">${bridgeEscape(details.description)}</div></div>
          <div class="bridge-metric-card"><div class="metric-label">4M 구분 / 위험도</div><div class="metric-val" style="font-size:0.88rem; font-weight:700;">${bridgeEscape((ticket.classification?.change4M || []).join(', ') || '미입력')}</div><div class="metric-sub">${bridgeEscape(ticket.classification?.riskLevel)}</div></div>
          <div class="bridge-metric-card"><div class="metric-label">사내 심의</div><div class="metric-val" style="font-size:0.88rem; font-weight:700;">${bridgeEscape(ticket.sqeReview?.decision)}</div><div class="metric-sub">${bridgeEscape(ticket.sqeReview?.reviewer || '심의 전')}</div></div>
        </div>
        ${rows.length ? `<div class="bridge-note-text" style="margin-bottom:8px;">${rows.map(row => `${bridgeEscape(row.item)}: ${bridgeEscape(row.current)} → ${bridgeEscape(row.proposed)}`).join(' · ')}</div>` : ''}
        <div class="bridge-action-row">
          <div class="bridge-note-text"><i data-lucide="info" style="width:13px; height:13px;"></i> 변경 요청 내용을 D5 대책 후보에 미선정 상태로 추가합니다. 원인 구분·담당자·목표일·Evidence와 ECN·고객 승인 정보는 가져오지 않으며 담당자가 입력합니다.</div>
          <button type="button" class="btn btn-primary btn-bridge-sync" ${imported ? 'disabled' : ''} onclick="syncSupplierPcnToD5('${bridgeEscape(ticket.ticketId)}')"><i data-lucide="download" style="width:14px; height:14px;"></i> ${imported ? '대책 후보에 추가됨' : 'D5 대책 후보로 가져오기'}</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

function syncSupplierPcnToD5(ticketId) {
  const c = getActiveCase();
  const ticket = c && getLinkedSupplierTickets(c.id, 'PCN').find(item => item.ticketId === ticketId);
  if (!ticket) { alert('이 Case에 연결된 외주 PCN 접수를 찾을 수 없습니다.'); return; }
  if (typeof saveLateStage === 'function' && document.getElementById('lateStageForm') && !saveLateStage(false)) return;
  ensureLateStages(c);
  const marker = `외주 PCN ${ticket.ticketId}`;
  if (c.d5.candidates.some(row => row.source === marker)) return;
  const details = ticket.details || {};
  const comparison = (details.comparisonTable || []).map(row => `${row.item}: ${row.current} → ${row.proposed}`).join(' / ');
  c.d5.candidates.push({
    id: `D5-${ticket.ticketId}`,
    causeType: '',
    title: details.title || '',
    rationale: [`${marker} (${ticket.supplier?.companyName || ''}, 사내 심의 ${ticket.sqeReview?.decision || 'Pending'})`, details.description, comparison].filter(Boolean).join(' · ').slice(0, 4000),
    selected: false,
    source: marker
  });
  c.d5.approval = { status: 'Draft', humanConfirmed: false };
  window.QMS_SAVE_REASON = `Supplier ticket ${ticket.ticketId} imported into D5 of ${c.id}`;
  saveAppData();
  renderCurrentView();
  showBridgeToast(`${ticket.ticketId}의 변경 요청을 D5 대책 후보에 미선정 상태로 추가했습니다.`);
}

if (typeof window !== 'undefined') {
  window.getLinkedSupplierTickets = getLinkedSupplierTickets;
  window.renderD3SupplierBridgeBanner = renderD3SupplierBridgeBanner;
  window.syncSupplierContainmentToD3 = syncSupplierContainmentToD3;
  window.renderD4SupplierBridgeWidget = renderD4SupplierBridgeWidget;
  window.importSupplierFileToCaseEvidence = importSupplierFileToCaseEvidence;
  window.renderD5SupplierBridgeBanner = renderD5SupplierBridgeBanner;
  window.syncSupplierPcnToD5 = syncSupplierPcnToD5;
}
