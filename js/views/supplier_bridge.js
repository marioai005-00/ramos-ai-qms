/* ========================================================================= */
/* RAMOS CLOSED-LOOP SUPPLIER-TO-INTERNAL 8D DATA PIPELINE (PRIORITY 2)      */
/* Real-time Bidirectional Bridges across D3, D4, and D5                     */
/* ========================================================================= */

/**
 * Toast notification for Bridge sync feedback
 */
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
  toast.innerHTML = `
    <div class="bridge-toast-icon">
      <i data-lucide="${type === 'success' ? 'check-circle-2' : type === 'warning' ? 'alert-triangle' : 'info'}"></i>
    </div>
    <div class="bridge-toast-msg">${message}</div>
    <button class="bridge-toast-close" onclick="this.parentElement.remove()">&times;</button>
  `;
  toastContainer.appendChild(toast);
  if (window.lucide) lucide.createIcons({ root: toast });

  setTimeout(() => {
    toast.style.animation = 'fadeOutToast 0.3s forwards ease-out';
    setTimeout(() => toast.remove(), 320);
  }, 4500);
}

/**
 * Find linked supplier records for the current 8D Case
 */
function getLinkedSupplierRecordsForCase(caseId) {
  const records = typeof loadSupplierRecords === 'function' ? loadSupplierRecords() : [];
  return {
    containmentRecord: records.find(r => r.ticketId === 'SQ-2026-002') || 
      records.find(r => (r.sqeReview?.bound8DCaseId === caseId || r.details?.bound8DCaseId === caseId) && r.ticketType === 'Issue') || 
      records.find(r => r.ticketType === 'Issue'),
    pcnRecord: records.find(r => r.ticketId === 'PCN-2026-001') || 
      records.find(r => (r.sqeReview?.bound8DCaseId === caseId || r.details?.bound8DCaseId === caseId) && r.ticketType === 'PCN') || 
      records.find(r => r.ticketType === 'PCN')
  };
}

/* ========================================================================= */
/* BRIDGE 1 (D3): SUBCONTRACTOR FACTORY QUARANTINE SYNC TO D3 CONTAINMENT     */
/* ========================================================================= */

function renderD3SupplierBridgeBanner(c) {
  if (!c) return '';
  const { containmentRecord } = getLinkedSupplierRecordsForCase(c.id);
  if (!containmentRecord) return '';

  const rec = containmentRecord;
  const inc = rec.incident || {};
  const supplier = rec.supplier || {};

  // Check if D3 materialFlow has already synced this quarantine
  const isSynced = Array.isArray(c.d3?.materialFlow) && c.d3.materialFlow.some(r => 
    (r.area && ((supplier.companyName && r.area.includes(supplier.companyName)) || r.area.includes('외주'))) ||
    (r.evidence && r.evidence.includes(rec.ticketId)) ||
    (r.holdQty === inc.quarantineQty && inc.quarantineQty > 0)
  );

  return `
    <div class="supplier-bridge-strip d3-containment-bridge ${isSynced ? 'is-synced' : 'is-pending'}">
      <div class="bridge-strip-header">
        <div class="bridge-badge-group">
          <span class="bridge-kicker-tag">
            <i data-lucide="factory" style="width:12px; height:12px;"></i>
            EXTERNAL SUPPLIER PIPELINE · D3 CONTAINMENT SYNC
          </span>
          <span class="bridge-status-pill ${isSynced ? 'pill-synced' : 'pill-urgent'}">
            ${isSynced ? '<i data-lucide="check-check"></i> D3 실시간 동기화 완료' : '<i data-lucide="alert-triangle"></i> 외주 공장 격리 데이터 미동기화'}
          </span>
        </div>
        <div class="bridge-ticket-ref">
          <span>티켓번호:</span> <strong>${rec.ticketId}</strong>
          <span class="bridge-sep">·</span>
          <span>협력사:</span> <strong>${supplier.companyName} (${supplier.plant || '공장/라인 미등록'})</strong>
        </div>
      </div>

      <div class="bridge-strip-body">
        <div class="bridge-metric-cards">
          <div class="bridge-metric-card">
            <div class="metric-label">외주 라인 조치</div>
            <div class="metric-val text-danger" style="font-size:0.85rem; font-weight:700;">
              ${inc.lineActionLabel || '🔴 BGA Line #2 즉시 가동 중단 (Line Stop)'}
            </div>
            <div class="metric-sub">${inc.processStepLabel || 'Molding / Underfill 공정'}</div>
          </div>
          <div class="bridge-metric-card">
            <div class="metric-label">외주 격리 수량 (Q-Zone)</div>
            <div class="metric-val text-amber num-mono" style="font-size:1.15rem; font-weight:800;">
              ${(inc.quarantineQty || 4800).toLocaleString()} <span style="font-size:0.75rem; font-weight:600;">ea</span>
            </div>
            <div class="metric-sub">${inc.quarantineLocation || '외주사 Q-Zone RED HOLD 라벨 부착'}</div>
          </div>
          <div class="bridge-metric-card">
            <div class="metric-label">외주 이상/불량 적출</div>
            <div class="metric-val text-rose num-mono" style="font-size:1.15rem; font-weight:800;">
              ${(inc.defectQty || 864).toLocaleString()} <span style="font-size:0.75rem; font-weight:600;">ea</span>
              <span class="bridge-rate-pill">${inc.defectRate || '18.00'}%</span>
            </div>
            <div class="metric-sub">X-Ray 단면 보이드 불량 검출</div>
          </div>
          <div class="bridge-metric-card">
            <div class="metric-label">이상 원인 및 파라미터 이탈</div>
            <div class="metric-val" style="font-size:0.82rem; font-weight:700; color:var(--text-primary);">
              언더필 공압 센서 유격 (0.31 MPa)
            </div>
            <div class="metric-sub">정상 0.45 MPa 대비 31% 압력 급감</div>
          </div>
        </div>

        <div class="bridge-action-row">
          <div class="bridge-note-text">
            <i data-lucide="info" style="width:13px; height:13px; color:#38bdf8;"></i>
            협력사(${supplier.companyName}) 공장 내 불량격리창고(Q-Zone) ${(inc.quarantineQty || 4800).toLocaleString()}ea 전량 출하 락 상태를 사내 D3 7-Area Material Flow의 <strong>[1. 원자재/협력사]</strong> 영역과 긴급 봉쇄(ICA) 플랜에 1-Click으로 즉시 동기화합니다.
          </div>
          <button type="button" class="btn btn-primary btn-bridge-sync" onclick="syncSupplierContainmentToD3('${rec.ticketId}')" id="btnSyncSupplierD3">
            <i data-lucide="${isSynced ? 'refresh-cw' : 'zap'}" style="width:14px; height:14px;"></i>
            ${isSynced ? '외주 격리 수량(4,800ea) 재동기화' : '⚡ 1-Click D3 Material Flow에 외주 격리 즉시 반영'}
          </button>
        </div>
      </div>
    </div>
  `;
}

/**
 * 1-Click Synchronize Subcontractor Quarantine into D3 Material Flow & ICA
 */
function syncSupplierContainmentToD3(ticketId) {
  const c = typeof getActiveCase === 'function' ? getActiveCase() : null;
  if (!c) {
    alert('활성화된 8D Case가 없습니다.');
    return;
  }

  const { containmentRecord } = getLinkedSupplierRecordsForCase(c.id);
  const rec = containmentRecord && containmentRecord.ticketId === ticketId ? containmentRecord : (containmentRecord || {
    ticketId: 'SQ-2026-002',
    supplier: { companyName: 'TechL', submitter: '권태훈 부장' },
    incident: { quarantineQty: 4800, defectQty: 864, quarantineLocation: 'TechL 불량격리구역 Q-Zone (RED HOLD 라벨 부착)' }
  });

  const inc = rec.incident || {};
  const qty = inc.quarantineQty || 4800;
  const ngQty = inc.defectQty || 864;
  const supplierName = rec.supplier?.companyName || 'TechL';
  const loc = inc.quarantineLocation || `${supplierName} Q-Zone (RED HOLD)`;

  // 1. Ensure D3 Material Flow
  if (typeof ensureD3Structure === 'function') ensureD3Structure(c);
  if (!c.d3) c.d3 = {};
  if (!Array.isArray(c.d3.materialFlow) || c.d3.materialFlow.length !== 7) {
    if (typeof createD3MaterialFlowRows === 'function') {
      c.d3.materialFlow = createD3MaterialFlowRows(c);
    } else {
      c.d3.materialFlow = [
        { area: '1. 원자재/외주 협력사', lot: c.lotNumber, totalQty: 0, holdQty: 0, screenQty: 0, ngQty: 0, status: '미확인', evidence: '' },
        { area: '2. 입고검사/원자재 창고', lot: c.lotNumber, totalQty: 0, holdQty: 0, screenQty: 0, ngQty: 0, status: '미확인', evidence: '' },
        { area: '3. 공정 재공품(WIP)', lot: c.lotNumber, totalQty: 0, holdQty: 0, screenQty: 0, ngQty: 0, status: '미확인', evidence: '' },
        { area: '4. 완제품 창고', lot: c.lotNumber, totalQty: 0, holdQty: 0, screenQty: 0, ngQty: 0, status: '미확인', evidence: '' },
        { area: '5. 출하 대기/운송 중', lot: c.lotNumber, totalQty: 0, holdQty: 0, screenQty: 0, ngQty: 0, status: '미확인', evidence: '' },
        { area: '6. 고객 창고', lot: c.lotNumber, totalQty: 0, holdQty: 0, screenQty: 0, ngQty: 0, status: '미확인', evidence: '' },
        { area: '7. 고객 생산라인', lot: c.lotNumber, totalQty: 0, holdQty: 0, screenQty: 0, ngQty: 0, status: '미확인', evidence: '' }
      ];
    }
  }

  // Update Supplier / Outsource Row (index 0)
  let supplierRow = c.d3.materialFlow.find(r => r.area && (r.area.includes('원자재') || r.area.includes('협력사') || r.area.includes('Supplier') || r.area.includes('외주')));
  if (!supplierRow) supplierRow = c.d3.materialFlow[0];

  supplierRow.area = `1. 외주 공장 (${supplierName} Q-Zone RED HOLD)`;
  supplierRow.lot = rec.targetProduct?.lotNo || c.lotNumber || '0QH321200A02-LPAGA00';
  supplierRow.totalQty = qty;
  supplierRow.holdQty = qty;
  supplierRow.screenQty = qty;
  supplierRow.ngQty = ngQty;
  supplierRow.status = 'Hold';
  supplierRow.evidence = `${rec.ticketId} (외주 라인스톱 및 전량 RED HOLD 격리 전표)`;

  // 2. Ensure ICA Action
  if (!Array.isArray(c.d3.actions)) c.d3.actions = [];
  const existingAction = c.d3.actions.find(a => a.id === 'ICA-SUP-01' || (a.target && a.target.includes(supplierName)));
  if (existingAction) {
    existingAction.action = `외주 BGA Line #2 가동 중단 및 Q-Zone ${qty.toLocaleString()}ea 전량 RED HOLD 태그 격리 완료`;
    existingAction.result = `${qty.toLocaleString()}ea 격리 완결 (NG ${ngQty.toLocaleString()}ea 적출), 공압 센서 교체 진행`;
    existingAction.status = 'Completed';
    existingAction.evidence = `${rec.ticketId} 라인스톱 접수증`;
  } else {
    c.d3.actions.unshift({
      id: 'ICA-SUP-01',
      target: `외주 가공처 (${supplierName}${rec.supplier?.plant ? ` · ${rec.supplier.plant}` : ''})`,
      action: `외주 BGA Line #2 가동 중단 및 Q-Zone ${qty.toLocaleString()}ea 전량 RED HOLD 태그 격리 완료`,
      owner: `${rec.supplier?.submitter || '권태훈 부장'} / 김혜원 Pro (라모스 외주운영)`,
      due: '2026-09-02 12:00',
      status: 'Completed',
      result: `${qty.toLocaleString()}ea 격리 완결 (NG ${ngQty.toLocaleString()}ea 적출), 공압 센서 교체 진행`,
      evidence: `${rec.ticketId} 라인스톱 접수증`
    });
  }

  // 3. Save and re-render
  if (typeof saveAppData === 'function') saveAppData();
  if (typeof renderCurrentView === 'function') renderCurrentView();

  showBridgeToast(`✅ ${supplierName} 외주 격리 수량(${qty.toLocaleString()}ea) 및 긴급 조치가 D3 Material Flow 및 ICA에 성공적으로 동기화되었습니다!`);
}

/* ========================================================================= */
/* BRIDGE 2 (D4): SUBCONTRACTOR FA EVIDENCE REGISTRATION TO D4 MATRIX        */
/* ========================================================================= */

function renderD4SupplierBridgeWidget(c) {
  if (!c) return '';
  const { containmentRecord, pcnRecord } = getLinkedSupplierRecordsForCase(c.id);

  const containmentSupplierName = containmentRecord?.supplier?.companyName || 'TechL';
  const pcnSupplierName = pcnRecord?.supplier?.companyName || 'WinPAC';
  const pressureLogFile = containmentRecord?.evidenceFiles?.find(file => file.type === 'csv')?.name || 'TechL_Dispenser_Pressure_Log.csv';
  // Inbound files from supplier tickets
  const inboundFiles = [
    {
      fileId: 'EVD-SUP-01',
      fileName: 'Xray_Void_Defect_Inspection.png',
      fileSize: '3.1 MB',
      fileType: 'image',
      title: `${containmentSupplierName} BGA 단면 X-Ray 보이드 18.2% 결함 검사 성적서`,
      supplierName: containmentSupplierName,
      ticketId: containmentRecord?.ticketId || 'SQ-2026-002',
      stage: 'D4',
      analysisType: 'FA Analysis (X-Ray / Non-Destructive)'
    },
    {
      fileId: 'EVD-SUP-02',
      fileName: pressureLogFile,
      fileSize: '450 KB',
      fileType: 'csv',
      title: `${containmentSupplierName} BGA Line #2 노즐 디스펜서 공압 이상(0.31MPa) 설비 로그`,
      supplierName: containmentSupplierName,
      ticketId: containmentRecord?.ticketId || 'SQ-2026-002',
      stage: 'D4',
      analysisType: 'Machine Drift Data (공압 센서 로그)'
    },
    {
      fileId: 'EVD-SUP-03',
      fileName: 'Murata_X7R_MLCC_SpecSheet.pdf',
      fileSize: '1.4 MB',
      fileType: 'pdf',
      title: '무라타 X7R 125℃ 고온보증 MLCC 사양서 및 1,000h 신뢰성 성적서',
      supplierName: pcnSupplierName,
      ticketId: pcnRecord?.ticketId || 'PCN-2026-001',
      stage: 'D4/D5',
      analysisType: 'Component Reliability (소재 신뢰성 시험)'
    }
  ];

  // Check registration status in c.evidenceList
  const registeredKeys = (c.evidenceList || []).map(e => e.file || e.id);
  const allSynced = inboundFiles.slice(0, 2).every(f => registeredKeys.includes(f.fileName) || registeredKeys.includes(f.fileId));

  return `
    <div class="card quality-stage-card supplier-bridge-card d4-evidence-bridge">
      <div class="quality-tool-head inline-head">
        <div>
          <span class="quality-tool-kicker" style="color:#a855f7;">
            <i data-lucide="folder-symlink" style="width:13px; height:13px;"></i>
            EXTERNAL SUPPLIER PIPELINE · D4 ROOT CAUSE EVIDENCE SYNC
          </span>
          <h3>협력사 제출 FA 분석자료 & 설비 로그 실시간 연계</h3>
          <p>외주사(협력사) 포털을 통해 접수된 X-Ray 단면 분석 성적서 및 공압 센서 로그를 사내 D4 Evidence Matrix로 1-Click 정식 등록합니다.</p>
        </div>
        <div class="bridge-action-controls">
          <button type="button" class="btn btn-primary btn-bridge-sync" onclick="syncSupplierFilesToD4Evidence('${containmentRecord?.ticketId || 'SQ-2026-002'}')" id="btnSyncSupplierD4">
            <i data-lucide="${allSynced ? 'refresh-cw' : 'sparkles'}" style="width:14px; height:14px;"></i>
            ${allSynced ? 'FA 증거자료 재동기화' : '⚡ 1-Click 외주사 FA 증거자료 정식 등록'}
          </button>
        </div>
      </div>

      <div class="bridge-files-table-wrap">
        <table class="custom-table bridge-files-table">
          <thead>
            <tr>
              <th style="width:100px;">증거 ID</th>
              <th>분석 명칭 및 출처</th>
              <th style="width:140px;">분석 유형</th>
              <th style="width:180px;">협력사 원본 파일</th>
              <th style="width:110px;">등록 상태</th>
              <th style="width:110px; text-align:center;">성적서 열람</th>
            </tr>
          </thead>
          <tbody>
            ${inboundFiles.map(f => {
              const isRegistered = registeredKeys.includes(f.fileName) || registeredKeys.includes(f.fileId);
              return `
                <tr class="${isRegistered ? 'row-registered' : ''}">
                  <td class="num-mono" style="font-weight:700; color:var(--accent);">${f.fileId}</td>
                  <td>
                    <div style="font-weight:700; color:var(--text-primary);">${f.title}</div>
                    <div style="font-size:0.72rem; color:var(--text-muted);">
                      <i data-lucide="building-2" style="width:11px; height:11px;"></i> ${f.supplierName} (티켓: <span class="num-mono">${f.ticketId}</span>)
                    </div>
                  </td>
                  <td>
                    <span class="badge-pill badge-purple" style="font-size:0.72rem;">${f.analysisType}</span>
                  </td>
                  <td>
                    <div class="num-mono" style="font-size:0.75rem; color:var(--text-primary); font-weight:600;">${f.fileName}</div>
                    <div style="font-size:0.7rem; color:var(--text-muted);">${f.fileSize} · ${f.fileType.toUpperCase()}</div>
                  </td>
                  <td>
                    <span class="badge-pill ${isRegistered ? 'badge-ok' : 'badge-gray'}">
                      ${isRegistered ? '✓ D4 등록 완료' : '대기중'}
                    </span>
                  </td>
                  <td style="text-align:center;">
                    <button type="button" class="btn btn-secondary btn-sm" onclick="openReportViewerModal('${f.fileName}', '${f.title}', '${f.fileType}', '${f.ticketId}')" title="성적서 뷰어로 원본 열람">
                      <i data-lucide="eye" style="width:12px; height:12px;"></i> 열람
                    </button>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

/**
 * 1-Click Synchronize Subcontractor FA Reports & Machine Logs to D4 Evidence Matrix
 */
function syncSupplierFilesToD4Evidence(ticketId) {
  const c = typeof getActiveCase === 'function' ? getActiveCase() : null;
  if (!c) {
    alert('활성화된 8D Case가 없습니다.');
    return;
  }

  const { containmentRecord } = getLinkedSupplierRecordsForCase(c.id);
  const supplierName = containmentRecord?.supplier?.companyName || 'TechL';
  const pressureLogFile = containmentRecord?.evidenceFiles?.find(file => file.type === 'csv')?.name || 'TechL_Dispenser_Pressure_Log.csv';

  if (!Array.isArray(c.evidenceList)) c.evidenceList = [];

  const evidenceToRegister = [
    {
      id: 'EVD-SUP-01',
      title: `${supplierName} BGA 단면 X-Ray 보이드 18.2% 결함 검사 성적서`,
      type: 'FA Analysis',
      file: 'Xray_Void_Defect_Inspection.png',
      linkedStages: ['D4']
    },
    {
      id: 'EVD-SUP-02',
      title: `${supplierName} BGA Line #2 노즐 디스펜서 공압 이상(0.31MPa) 설비 로그`,
      type: 'Process Log',
      file: pressureLogFile,
      linkedStages: ['D4']
    },
    {
      id: 'EVD-SUP-03',
      title: '무라타 X7R 125℃ 고온보증 MLCC 사양서 및 1,000h 신뢰성 성적서',
      type: 'Reliability',
      file: 'Murata_X7R_MLCC_SpecSheet.pdf',
      linkedStages: ['D4', 'D5']
    }
  ];

  let addedCount = 0;
  evidenceToRegister.forEach(item => {
    const idx = c.evidenceList.findIndex(e => e.id === item.id || e.file === item.file);
    if (idx >= 0) {
      c.evidenceList[idx] = { ...c.evidenceList[idx], ...item };
    } else {
      c.evidenceList.push(item);
      addedCount++;
    }
  });

  // Also ensure D4 FA Matrix has an entry
  if (c.d4) {
    if (!Array.isArray(c.d4.faMatrix)) c.d4.faMatrix = [];
    const faIdx = c.d4.faMatrix.findIndex(f => f.evidenceId === 'EVD-SUP-01');
    if (faIdx < 0) {
      c.d4.faMatrix.push({
        test: 'BGA Underfill X-Ray Void Inspection',
        sample: `12ea / 4,800ea (${supplierName})`,
        lab: `${supplierName} 신뢰성분석실`,
        result: '18.2% Void NG (규격 < 5%)',
        evidenceId: 'EVD-SUP-01'
      });
    }
  }

  // Save and re-render
  if (typeof saveAppData === 'function') saveAppData();
  if (typeof renderCurrentView === 'function') renderCurrentView();

  showBridgeToast(`✅ 외주사 FA 증거자료 3건(X-Ray 성적서, 설비 압력 로그, 부품 사양서)이 사내 D4 Evidence Matrix에 정식 등록되었습니다!`);
}

/* ========================================================================= */
/* BRIDGE 3 (D5): SUBCONTRACTOR 4M PCN APPROVAL SYNC TO D5 PCA & ECN         */
/* ========================================================================= */

function renderD5SupplierBridgeBanner(c) {
  if (!c) return '';
  const { pcnRecord } = getLinkedSupplierRecordsForCase(c.id);
  if (!pcnRecord) return '';

  const rec = pcnRecord;
  const supplier = rec.supplier || {};
  const details = rec.details || {};

  // Check if D5 PCA candidate has Murata X7R selected & ECN updated
  const hasMurataSelected = Array.isArray(c.d5?.candidates) && c.d5.candidates.some(cand => 
    cand.selected && ((cand.title || '').includes('무라타') || (cand.title || '').includes('X7R'))
  );
  const isEcnSynced = c.d5?.pcnEcn?.ecnNumber === 'ECN-260901-01' && c.d5?.pcnEcn?.pcnRequired === true;
  const isSynced = hasMurataSelected && isEcnSynced;

  return `
    <div class="supplier-bridge-strip d5-pcn-bridge ${isSynced ? 'is-synced' : 'is-pending'}" style="margin-bottom:18px;">
      <div class="bridge-strip-header">
        <div class="bridge-badge-group">
          <span class="bridge-kicker-tag" style="background:rgba(14, 165, 233, 0.15); color:#38bdf8; border-color:rgba(14, 165, 233, 0.3);">
            <i data-lucide="cpu" style="width:12px; height:12px;"></i>
            EXTERNAL SUPPLIER PIPELINE · D5 PCA & 4M PCN SYNC
          </span>
          <span class="bridge-status-pill ${isSynced ? 'pill-synced' : 'pill-urgent'}">
            ${isSynced ? '<i data-lucide="check-check"></i> D5 대책 & ECN 동기화 완료' : '<i data-lucide="clock"></i> 외주 PCN 승인정보 미동기화'}
          </span>
        </div>
        <div class="bridge-ticket-ref">
          <span>티켓번호:</span> <strong>${rec.ticketId}</strong>
          <span class="bridge-sep">·</span>
          <span>협력사:</span> <strong>${supplier.companyName} (${supplier.plant || '아산 사업장'})</strong>
        </div>
      </div>

      <div class="bridge-strip-body">
        <div class="bridge-metric-cards">
          <div class="bridge-metric-card" style="grid-column: span 2;">
            <div class="metric-label">4M 변경 신청 제목 및 대책 내용</div>
            <div class="metric-val text-cyan" style="font-size:0.88rem; font-weight:700;">
              ${details.title || 'C102 수동소자 제조사 대체(무라타 X7R 125℃) 및 SMT 리플로우 피크온도 250℃ 조정'}
            </div>
            <div class="metric-sub">
              기존 85℃ 정격 X5R ➔ 125℃ 고온보증 X7R 대체 (신뢰성 마진 40℃ 대폭 확보)
            </div>
          </div>
          <div class="bridge-metric-card">
            <div class="metric-label">사내 SQE 심사 판정</div>
            <div class="metric-val text-emerald" style="font-size:0.95rem; font-weight:800;">
              <i data-lucide="check-circle" style="width:13px; height:13px; display:inline-block; vertical-align:-1px;"></i>
              Under_Review / Approved
            </div>
            <div class="metric-sub">김성중 Senior Pro (SQE Master) 심사 완료</div>
          </div>
          <div class="bridge-metric-card">
            <div class="metric-label">연계 ECN 및 고객사(LGE) 승인</div>
            <div class="metric-val num-mono text-cyan" style="font-size:1.05rem; font-weight:800;">
              ECN-260901-01
            </div>
            <div class="metric-sub">LGE 고객사 승인 완료 (2026.09.04)</div>
          </div>
        </div>

        <div class="bridge-action-row">
          <div class="bridge-note-text">
            <i data-lucide="info" style="width:13px; height:13px; color:#38bdf8;"></i>
            외주 협력사(${supplier.companyName})의 4M 부품 변경 건을 사내 8D <strong>D5 Permanent Corrective Action(대책 선정 매트릭스)</strong>의 최종 채택 대책(★)으로 지정하고, <strong>ECN/고객 PCN 승인 정보</strong>에 1-Click 자동 연동합니다.
          </div>
          <button type="button" class="btn btn-primary btn-bridge-sync" onclick="syncSupplierPcnToD5('${rec.ticketId}')" id="btnSyncSupplierD5">
            <i data-lucide="${isSynced ? 'refresh-cw' : 'check-check'}" style="width:14px; height:14px;"></i>
            ${isSynced ? 'D5 대책 및 ECN 승인정보 재동기화' : '⚡ 1-Click D5 대책 매트릭스 & ECN 정보에 즉시 동기화'}
          </button>
        </div>
      </div>
    </div>
  `;
}

/**
 * 1-Click Synchronize Subcontractor PCN into D5 PCA Candidates & ECN
 */
function syncSupplierPcnToD5(ticketId) {
  const c = typeof getActiveCase === 'function' ? getActiveCase() : null;
  if (!c) {
    alert('활성화된 8D Case가 없습니다.');
    return;
  }

  const { pcnRecord } = getLinkedSupplierRecordsForCase(c.id);
  const supplierName = pcnRecord?.supplier?.companyName || 'WinPAC';
  const pcnTicketId = pcnRecord?.ticketId || ticketId || 'PCN-2026-001';
  if (!c.d5) c.d5 = { candidates: [] };
  if (!Array.isArray(c.d5.candidates)) c.d5.candidates = [];

  // Find or create Murata candidate
  let murataCand = c.d5.candidates.find(cand => 
    (cand.title || '').includes('무라타') || 
    (cand.title || '').includes('X7R') || 
    (cand.title || '').includes('C102')
  );

  if (murataCand) {
    murataCand.selected = true;
    murataCand.title = 'C102 MLCC 제조사 무라타 X7R(125℃ 고온보증) 교체 및 SMT 리플로우 피크온도 250℃ 하향 제어';
    murataCand.rationale = `${supplierName} ${pcnTicketId} 승인 및 LGE 승인 연동 완료. 열응력 40% 완화 및 BGA Void율 4.2% 합격 달성.`;
    murataCand.rootCauseElimination = '99.9% (고온 내열마진 40℃ 확보)';
    murataCand.feasibility = 'High';
    murataCand.costImpact = 'Neutral';
    murataCand.riskLevel = 'Low';
  } else {
    c.d5.candidates.unshift({
      id: 'PCA-01',
      causeType: 'Occurrence',
      title: 'C102 MLCC 제조사 무라타 X7R(125℃ 고온보증) 교체 및 SMT 리플로우 피크온도 250℃ 하향 제어',
      rationale: `${supplierName} ${pcnTicketId} 승인 및 LGE 승인 연동 완료. 열응력 40% 완화 및 BGA Void율 4.2% 합격 달성.`,
      rootCauseElimination: '99.9% (고온 내열마진 40℃ 확보)',
      feasibility: 'High',
      costImpact: 'Neutral',
      riskLevel: 'Low',
      owner: '박재환 팀장_S.Pro (Flash개발2팀)',
      due: '2026-09-05',
      selected: true
    });
  }

  // Ensure other candidates are not conflicting
  c.d5.candidates.forEach(cand => {
    if (cand !== murataCand && !cand.title.includes('무라타')) {
      // keep candidate as is or unselect if only one can be selected
    }
  });

  // Update ECN / PCN Information
  c.d5.pcnEcn = c.d5.pcnEcn || {};
  c.d5.pcnEcn.ecnNumber = 'ECN-260901-01';
  c.d5.pcnEcn.pcnRequired = true;
  c.d5.pcnEcn.customerApprovalStatus = `Approved by LGE (2026.09.04) / ${supplierName} ${pcnTicketId} 승인 연동`;
  c.d5.pcnEcn.evidence = 'PCN-2026-001 및 ECN-260901-01 승인 공문';

  // Save and re-render
  if (typeof saveAppData === 'function') saveAppData();
  if (typeof renderCurrentView === 'function') renderCurrentView();

  showBridgeToast(`✅ ${supplierName} ${pcnTicketId} 승인 내역이 D5 영구대책(PCA) 및 ECN-260901-01 정보에 성공적으로 동기화되었습니다!`);
}
