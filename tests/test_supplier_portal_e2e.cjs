const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');

const browserPath = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'qms-supplier-test-'));
const origin = process.env.QMS_TEST_ORIGIN;
if (!origin) throw new Error('Set QMS_TEST_ORIGIN to the test server origin');

const proc = spawn(browserPath, [
  '--headless=new',
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  '--remote-debugging-port=0',
  `--user-data-dir=${profile}`,
  '--window-size=1600,2400',
  'about:blank'
], { windowsHide: true, stdio: 'ignore' });

let socket, seq = 0;
const pending = new Map();
const delay = ms => new Promise(r => setTimeout(r, ms));

async function send(method, params = {}, sessionId) {
  const id = ++seq;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error('CDP timeout: ' + method));
    }, 10000);
    pending.set(id, { resolve: v => { clearTimeout(timer); resolve(v); }, reject });
    socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
}

(async () => {
  let port;
  for (let i = 0; i < 80; i++) {
    try {
      port = fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0];
      break;
    } catch {}
    await delay(150);
  }
  if (!port) throw new Error('Headless browser port not found');

  const info = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  socket = new WebSocket(info.webSocketDebuggerUrl);
  await new Promise((r, j) => { socket.onopen = r; socket.onerror = j; });

  socket.onmessage = e => {
    const msg = JSON.parse(e.data);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result);
    }
  };

  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const call = (method, params) => send(method, params, sessionId);

  await call('Runtime.enable');
  await call('Page.enable');
  await call('Page.addScriptToEvaluateOnNewDocument', {
    source: 'window.alert=()=>{};window.confirm=()=>true;'
  });
  await call('Page.navigate', { url: origin });

  for (let i = 0; i < 80; i++) {
    const r = await call('Runtime.evaluate', { expression: `typeof initApp === 'function'`, returnByValue: true });
    if (r.result?.value) break;
    await delay(150);
  }

  // Quick Login
  await call('Runtime.evaluate', { expression: `handleQuickLogin('sjkim');` });
  await delay(400);

  // 1. Switch to supplier-portal
  console.log('--- Step 1: Navigating to Supplier Portal ---');
  await call('Runtime.evaluate', { expression: `switchNav('supplier-portal');` });
  await delay(500);

  const viewExists = (await call('Runtime.evaluate', { expression: `Boolean(document.querySelector('.supplier-portal-container'))`, returnByValue: true })).result.value;
  assert.ok(viewExists, 'Supplier portal container should exist');

  // Verify benchmark records in watchtower
  const tableRows = (await call('Runtime.evaluate', { expression: `document.querySelectorAll('.supplier-grid-table tbody tr').length`, returnByValue: true })).result.value;
  assert.ok(tableRows >= 3, 'Should render at least 3 benchmark records');
  console.log(`✓ PASS: Supplier watchtower rendered ${tableRows} records`);

  const outDir = path.resolve(__dirname, '..');

  // Capture Watchtower Screenshot
  const watchtowerShot = await call('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(outDir, 'verify_supplier_watchtower.png'), Buffer.from(watchtowerShot.data, 'base64'));
  console.log('✓ SAVED verify_supplier_watchtower.png');

  // 2. Switch to Intake Tab (Track A: PCN)
  console.log('--- Step 2: Testing Supplier Intake Form (Track A: PCN) ---');
  await call('Runtime.evaluate', { expression: `switchSupplierTab('intake');` });
  await delay(400);

  const formExists = (await call('Runtime.evaluate', { expression: `Boolean(document.getElementById('supplierIntakeForm'))`, returnByValue: true })).result.value;
  assert.ok(formExists, 'Supplier intake form should be rendered');

  const isPCNActive = (await call('Runtime.evaluate', { expression: `Boolean(document.querySelector('.comparison-table'))`, returnByValue: true })).result.value;
  assert.ok(isPCNActive, 'Comparison table should be rendered for PCN track');

  // Capture PCN Track Screenshot
  const pcnShot = await call('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(outDir, 'verify_supplier_intake_pcn.png'), Buffer.from(pcnShot.data, 'base64'));
  console.log('✓ SAVED verify_supplier_intake_pcn.png');

  // 3. Switch to Track B: Urgent Quality Incident (SCAR)
  console.log('--- Step 3: Switching to Track B: Urgent Quality Incident (SCAR) ---');
  await call('Runtime.evaluate', { expression: `setSupplierTicketType('Issue');` });
  await delay(400);

  const hasIncidentBanner = (await call('Runtime.evaluate', { expression: `Boolean(document.querySelector('.incident-alert-banner'))`, returnByValue: true })).result.value;
  assert.ok(hasIncidentBanner, 'Incident banner should be displayed in Issue track');

  const hasContainmentGrid = (await call('Runtime.evaluate', { expression: `Boolean(document.querySelector('.containment-3point-grid'))`, returnByValue: true })).result.value;
  assert.ok(hasContainmentGrid, '3-Point Containment grid should be displayed');

  // Test defect rate recalculation
  await call('Runtime.evaluate', { expression: `(() => {
    const inp = document.querySelector('input[name="inputQty"]');
    const def = document.querySelector('input[name="defectQty"]');
    if (inp && def) {
      inp.value = 10000;
      def.value = 500;
      recalculateDefectRate();
    }
  })()` });
  await delay(200);

  const calculatedRate = (await call('Runtime.evaluate', { expression: `document.getElementById('defectRateInput').value`, returnByValue: true })).result.value;
  assert.equal(calculatedRate, '5.00', 'Defect rate should be calculated as 5.00%');
  console.log(`✓ PASS: Defect rate calculated dynamically: ${calculatedRate}%`);

  // Capture Incident Track Screenshot
  const incidentShot = await call('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(outDir, 'verify_supplier_intake_incident.png'), Buffer.from(incidentShot.data, 'base64'));
  fs.writeFileSync(path.join(outDir, 'verify_supplier_intake_form.png'), Buffer.from(incidentShot.data, 'base64'));
  console.log('✓ SAVED verify_supplier_intake_incident.png');

  // 4. Submit New Urgent Incident Ticket
  console.log('--- Step 4: Submitting New Urgent Incident Ticket ---');
  const initialCount = (await call('Runtime.evaluate', { expression: `loadSupplierRecords().length`, returnByValue: true })).result.value;
  
  await call('Runtime.evaluate', { expression: `(() => {
    createSupplierTicket({
      ticketType: 'Issue',
      supplierCategory: 'OSAT_PKG',
      companyName: 'TechL',
      plant: '아산 1공장 PKG 3라인',
      submitter: '김영수 차장',
      email: 'thkwon@techl.co.kr',
      phone: '010-3344-9988',
      customer: 'LGE DTV',
      partName: '16GB eMMC v5.1',
      partNumber: 'RMS-EMMC-16G-LGE01',
      lotNo: 'HN260908-LIVE99',
      defectCategory: 'Machine_Drift',
      processStep: 'Molding_Underfill',
      inputQty: 10000,
      defectQty: 500,
      defectRate: '5.00',
      lineAction: 'Line_Stop',
      quarantineQty: 9500,
      quarantineLocation: '아산공장 Q-Hold Area A-12',
      inTransitAction: '운송 화물 1건 회수 완료',
      containmentAction: '디스펜서 공압 교정 및 직전 3개 로트 X-Ray 전수 검사',
      faReportDeadline: '2026-09-09 18:00',
      evidenceFiles: [
        { name: 'Xray_Void_Defect_Inspection.png', size: '3.1 MB', type: 'image' },
        { name: 'TechL_Dispenser_Pressure_Log.csv', size: '450 KB', type: 'csv' }
      ],
      title: '[긴급 E2E] 언더필 토출압 저하로 인한 보이드 급증',
      description: 'E2E 자동화 검증을 통한 긴급 공정 이상 발생 자진 신고 건입니다.'
    });
  })()` });
  await delay(300);

  const updatedCount = (await call('Runtime.evaluate', { expression: `loadSupplierRecords().length`, returnByValue: true })).result.value;
  assert.equal(updatedCount, initialCount + 1, 'Ticket count should increase by 1');
  console.log(`✓ PASS: Ticket submitted successfully (Total: ${updatedCount})`);

  // 5. Switch back to Watchtower and open Review Modal for Incident Ticket
  console.log('--- Step 5: Testing Incident Ticket Review Modal ---');
  await call('Runtime.evaluate', { expression: `switchSupplierTab('watchtower');` });
  await delay(400);

  await call('Runtime.evaluate', { expression: `openSupplierTicketModal('SQ-2026-002');` });
  await delay(400);

  const modalExists = (await call('Runtime.evaluate', { expression: `Boolean(document.querySelector('.modal-content'))`, returnByValue: true })).result.value;
  assert.ok(modalExists, 'Review modal should be opened');

  // Capture Review Modal Screenshot
  const modalShot = await call('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(outDir, 'verify_supplier_review_modal.png'), Buffer.from(modalShot.data, 'base64'));
  console.log('✓ SAVED verify_supplier_review_modal.png');

  // Submit Approval
  await call('Runtime.evaluate', { expression: `(() => {
    document.getElementById('modalDecision').value = '8D_Escalated';
    document.getElementById('modalComment').value = 'E2E 검증: 3-Point 봉쇄 확인 및 사내 8D 즉시 승격 조치.';
    submitSupplierReviewDecision('SQ-2026-002');
  })()` });
  await delay(300);

  // 6. Test Universal Document Viewer (PDF, Excel, X-Ray Image)
  console.log('--- Step 6: Testing Universal Document & Report Viewer ---');
  
  // 6-A: PDF SpecSheet Viewer
  console.log('Testing PDF SpecSheet Viewer...');
  await call('Runtime.evaluate', { expression: `openDocumentViewer('Murata_X7R_MLCC_SpecSheet.pdf');` });
  await delay(400);

  const viewerVisible = (await call('Runtime.evaluate', { expression: `document.getElementById('documentViewerModal').style.display`, returnByValue: true })).result.value;
  assert.equal(viewerVisible, 'flex', 'Document viewer modal should be visible');

  const pdfTitle = (await call('Runtime.evaluate', { expression: `document.querySelector('.doc-viewer-title').innerText`, returnByValue: true })).result.value;
  assert.ok(pdfTitle.includes('Murata'), 'Document viewer should display Murata spec');

  const pdfShot = await call('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(outDir, 'verify_pdf_viewer.png'), Buffer.from(pdfShot.data, 'base64'));
  console.log('✓ PASS: PDF Viewer opened successfully -> verify_pdf_viewer.png');

  // 6-B: Excel Reliability Report Viewer
  console.log('Testing Excel Reliability Report Viewer...');
  await call('Runtime.evaluate', { expression: `openDocumentViewer('TC_1000Cycles_Reliability_Report.xlsx');` });
  await delay(400);

  const hasExcelTable = (await call('Runtime.evaluate', { expression: `Boolean(document.querySelector('.excel-grid-table'))`, returnByValue: true })).result.value;
  assert.ok(hasExcelTable, 'Excel table should be rendered inside viewer');

  const excelShot = await call('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(outDir, 'verify_excel_viewer.png'), Buffer.from(excelShot.data, 'base64'));
  console.log('✓ PASS: Excel Viewer opened successfully -> verify_excel_viewer.png');

  // 6-C: X-Ray Defect Image Viewer & 90 deg rotation
  console.log('Testing X-Ray Defect Image Viewer...');
  await call('Runtime.evaluate', { expression: `openDocumentViewer('Xray_Void_Defect_Inspection.png');` });
  await delay(400);

  const hasDefectCallout = (await call('Runtime.evaluate', { expression: `document.body.innerText.includes('DEFECT: SOLDER VOID')`, returnByValue: true })).result.value;
  assert.ok(hasDefectCallout, 'X-Ray defect callout should be rendered');

  // Test rotation
  await call('Runtime.evaluate', { expression: `rotateViewerImage();` });
  await delay(200);

  const xrayShot = await call('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(outDir, 'verify_xray_viewer.png'), Buffer.from(xrayShot.data, 'base64'));
  console.log('✓ PASS: X-Ray Defect Viewer opened and rotated -> verify_xray_viewer.png');

  // Close Viewer
  await call('Runtime.evaluate', { expression: `closeDocumentViewer();` });
  await delay(200);

  const viewerClosed = (await call('Runtime.evaluate', { expression: `document.getElementById('documentViewerModal').style.display`, returnByValue: true })).result.value;
  assert.equal(viewerClosed, 'none', 'Document viewer modal should be closed');
  console.log('✓ PASS: Document Viewer closed cleanly');

  // 7. Test 8D Escalation Linkage
  console.log('--- Step 7: Testing 8D Escalation Linkage ---');
  await call('Runtime.evaluate', { expression: `handleEscalateTo8D('SQ-2026-002');` });
  await delay(400);

  const currentStage = (await call('Runtime.evaluate', { expression: `appData.activeStage`, returnByValue: true })).result.value;
  assert.equal(currentStage, 'D2', 'Should navigate to D2 stage upon escalation');
  console.log('✓ PASS: Successfully escalated to 8D Case and navigated to D2 workspace');

    // 7.5 Test Internal SQE AI Report Inspection & 1-Click Apply
  console.log('--- Step 7.5: Testing Internal SQE AI Report Inspection & 1-Click Apply ---');
  await call('Runtime.evaluate', { expression: `openSupplierTicketModal('PCN-2026-001');` });
  await delay(400);

  // Assert AI audit button exists for SQE
  const hasAiAuditBtn = (await call('Runtime.evaluate', { expression: `Boolean(document.querySelector('#modalContainer button[onclick*="runSupplierAiInspection"]'))`, returnByValue: true })).result.value;
  assert.ok(hasAiAuditBtn, 'Internal SQE should have [🤖 AI SQE 레포트 정밀 감사] button');

  // Trigger AI audit
  await call('Runtime.evaluate', { expression: `runSupplierAiInspection('PCN-2026-001');` });
  await delay(900);

  const hasAuditSheet = (await call('Runtime.evaluate', { expression: `Boolean(document.querySelector('.ai-audit-sheet'))`, returnByValue: true })).result.value;
  assert.ok(hasAuditSheet, 'AI audit sheet should be rendered');

  const auditScoreText = (await call('Runtime.evaluate', { expression: `document.querySelector('.ai-audit-grade-pill').innerText`, returnByValue: true })).result.value;
  assert.ok(auditScoreText.includes('76점'), 'AI audit score should be 76점');

  const hasDeficiency = (await call('Runtime.evaluate', { expression: `document.body.innerText.includes('DEF-01')`, returnByValue: true })).result.value;
  assert.ok(hasDeficiency, 'Deficiency DEF-01 (HAST 96h) should be detected by AI');

  // Capture AI Audit Sheet Screenshot
  const aiAuditShot = await call('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(outDir, 'verify_sqe_ai_audit_sheet.png'), Buffer.from(aiAuditShot.data, 'base64'));
  console.log('✓ PASS: AI Audit Sheet rendered with 76점 & DEF-01 -> verify_sqe_ai_audit_sheet.png');

  // Test 1-Click Apply
  await call('Runtime.evaluate', { expression: `applyAiRecommendationToReview('PCN-2026-001');` });
  await delay(300);

  const commentVal = (await call('Runtime.evaluate', { expression: `document.getElementById('modalComment').value`, returnByValue: true })).result.value;
  assert.ok(commentVal.includes('무라타 X7R MLCC 대체 PCN'), 'Comment should be auto-filled by 1-click apply');

  const decisionVal = (await call('Runtime.evaluate', { expression: `document.getElementById('modalDecision').value`, returnByValue: true })).result.value;
  assert.equal(decisionVal, 'Revision_Requested', 'Decision should be auto-selected to Revision_Requested');
  console.log('✓ PASS: 1-Click AI Recommendation successfully applied to review form');

  // Save SQE review decision
  await call('Runtime.evaluate', { expression: `submitSupplierReviewDecision('PCN-2026-001');` });
  await delay(300);

  const pcnStatus = (await call('Runtime.evaluate', { expression: `loadSupplierRecords().find(r=>r.ticketId==='PCN-2026-001').status`, returnByValue: true })).result.value;
  assert.equal(pcnStatus, 'Revision_Requested', 'Ticket status should be Revision_Requested');
  console.log('✓ PASS: SQE review decision submitted and status updated to Revision_Requested');

  // 8. Test Subcontractor Account Login & Dedicated External View (thkwon / TechL)
  console.log('--- Step 8: Testing Subcontractor Account View (thkwon - TechL) ---');
  
  // Switch to subcontractor account thkwon
  await call('Runtime.evaluate', { expression: `onUserSwitch('권태훈');` });
  await delay(500);

  // Assert user is supplier
  const isSupplierUser = (await call('Runtime.evaluate', { expression: `Boolean(CURRENT_USER.isSupplier)`, returnByValue: true })).result.value;
  assert.ok(isSupplierUser, 'Logged in user should have isSupplier flag true');

  const supplierCompany = (await call('Runtime.evaluate', { expression: `CURRENT_USER.company`, returnByValue: true })).result.value;
  assert.equal(supplierCompany, 'TechL', 'Subcontractor company should be TechL');

  // Verify external portal header
  const brandTitle = (await call('Runtime.evaluate', { expression: `document.querySelector('.portal-brand-title').innerText`, returnByValue: true })).result.value;
  assert.ok(brandTitle.includes('TechL'), 'Portal brand title should reflect TechL');

  // Verify data isolation: Only TechL tickets are visible
  const supplierRows = (await call('Runtime.evaluate', { expression: `document.querySelectorAll('.supplier-grid-table tbody tr').length`, returnByValue: true })).result.value;
  assert.ok(supplierRows >= 1, 'TechL tickets should be rendered');
  
  const hasWinPAC = (await call('Runtime.evaluate', { expression: `document.querySelector('.supplier-grid-table').innerText.includes('WinPAC')`, returnByValue: true })).result.value;
  assert.equal(hasWinPAC, false, 'WinPAC tickets must NOT be visible to TechL subcontractor');
  console.log('✓ PASS: Strict Subcontractor Data Isolation verified (WinPAC tickets hidden)');

  // Capture Subcontractor View Screenshot
  const suppViewShot = await call('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(outDir, 'verify_supplier_account_view.png'), Buffer.from(suppViewShot.data, 'base64'));
  console.log('✓ PASS: Subcontractor account watchtower view verified -> verify_supplier_account_view.png');

  // Open Hana Micron ticket review modal in subcontractor mode
  await call('Runtime.evaluate', { expression: `openSupplierTicketModal('PCN-2026-001');` });
  await delay(400);

  const hasOfficialNotice = (await call('Runtime.evaluate', { expression: `document.body.innerText.includes('라모스테크놀러지 품질본부(SQE) 공식 심의 결과 통보')`, returnByValue: true })).result.value;
  assert.ok(hasOfficialNotice, 'Review modal should display official SQE decision notification for subcontractor');

  const hasInternalSaveBtn = (await call('Runtime.evaluate', { expression: `Boolean(document.getElementById('modalDecision'))`, returnByValue: true })).result.value;
  assert.equal(hasInternalSaveBtn, false, 'Subcontractor must NOT have internal decision edit controls');
  console.log('✓ PASS: Subcontractor Review Modal is clean read-only official notice');

  const suppModalShot = await call('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(outDir, 'verify_supplier_account_modal.png'), Buffer.from(suppModalShot.data, 'base64'));
  console.log('✓ PASS: Subcontractor review modal verified -> verify_supplier_account_modal.png');

  // Test Subcontractor Revision Request Notice & Resubmission Modal
  console.log('--- Step 8.2: Testing Subcontractor Free-Format Report Resubmission ---');
  const hasResubmitBtn = (await call('Runtime.evaluate', { expression: `Boolean(document.querySelector('button[onclick*="openSupplierReportUploadModal"]'))`, returnByValue: true })).result.value;
  assert.ok(hasResubmitBtn, 'Subcontractor modal should have [📤 보완된 자체 레포트 파일 제출] button');

  // Open Resubmission Modal
  await call('Runtime.evaluate', { expression: `openSupplierReportUploadModal('PCN-2026-001');` });
  await delay(400);

  const resubmitModalShot = await call('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(outDir, 'verify_supplier_resubmission_modal.png'), Buffer.from(resubmitModalShot.data, 'base64'));
  console.log('✓ PASS: Subcontractor Resubmission modal opened -> verify_supplier_resubmission_modal.png');

  // Submit revised reports
  await call('Runtime.evaluate', { expression: `
    const form = document.querySelector('#modalContainer form');
    handleSupplierReportUploadSubmit({ preventDefault: () => {}, target: form }, 'PCN-2026-001');
  ` });
  await delay(400);

  const newTicketStatus = (await call('Runtime.evaluate', { expression: `loadSupplierRecords().find(r=>r.ticketId==='PCN-2026-001').status`, returnByValue: true })).result.value;
  assert.equal(newTicketStatus, 'Report_Submitted', 'Ticket status should be Report_Submitted after upload');

  const fileCount = (await call('Runtime.evaluate', { expression: `loadSupplierRecords().find(r=>r.ticketId==='PCN-2026-001').evidenceFiles.length`, returnByValue: true })).result.value;
  assert.ok(fileCount >= 3, 'Ticket evidenceFiles should contain revised files (at least 3 files)');
  console.log(`✓ PASS: Subcontractor successfully submitted Rev.2 free-format reports (Total files: ${fileCount}, Status: Report_Submitted)`);

  await call('Runtime.evaluate', { expression: `closeModal();` });
  await delay(200);

  // Verify strict sidebar and header isolation for subcontractor
  const internalNavDisplay = (await call('Runtime.evaluate', { expression: `getComputedStyle(document.getElementById('internalCompanyNavSection')).display`, returnByValue: true })).result.value;
  assert.equal(internalNavDisplay, 'none', 'Internal 8D sections must be completely hidden from subcontractor sidebar');

  const dashboardNavDisplay = (await call('Runtime.evaluate', { expression: `getComputedStyle(document.getElementById('navItemDashboard')).display`, returnByValue: true })).result.value;
  assert.equal(dashboardNavDisplay, 'none', 'Internal Dashboard must be completely hidden from subcontractor sidebar');

  const sidebarTabsDisplay = (await call('Runtime.evaluate', { expression: `getComputedStyle(document.querySelector('.sidebar-tabs')).display`, returnByValue: true })).result.value;
  assert.equal(sidebarTabsDisplay, 'none', 'Sidebar tabs (8D / RAmos Org) must be completely hidden from subcontractor');

  const caseZoneDisplay = (await call('Runtime.evaluate', { expression: `getComputedStyle(document.querySelector('.header-case-zone')).display`, returnByValue: true })).result.value;
  assert.equal(caseZoneDisplay, 'none', 'Header internal case zone must be completely hidden from subcontractor');

  const supplierNavItemText = (await call('Runtime.evaluate', { expression: `document.getElementById('navSupplierPortalText').innerText`, returnByValue: true })).result.value;
  assert.ok(supplierNavItemText.includes('외주 협력사 품질 & 4M PCN 접수 포털'), 'Supplier portal nav label should be 외주 협력사 품질 & 4M PCN 접수 포털');
  console.log('✓ PASS: All internal 8D menus, dashboard, org tree, and case selector strictly hidden from subcontractor');

  // Switch back to internal SQE
  await call('Runtime.evaluate', { expression: `onUserSwitch('김성중');` });
  await delay(400);

  const internalNavRestored = (await call('Runtime.evaluate', { expression: `getComputedStyle(document.getElementById('internalCompanyNavSection')).display`, returnByValue: true })).result.value;
  assert.notEqual(internalNavRestored, 'none', 'Internal 8D sections must be restored when switching back to SQE master');
  console.log('✓ PASS: Successfully switched back to Internal SQE Master account & restored internal menus');

  // =========================================================================
  // Step 9: Testing Priority 2 - Closed-Loop Supplier-to-Internal 8D Data Pipeline
  // =========================================================================
  console.log('--- Step 9: Testing Closed-Loop Supplier-to-Internal 8D Pipeline (Priority 2) ---');

  // 9.1 Bridge 1 (D3): Subcontractor Quarantine Sync into D3 Material Flow & ICA
  await call('Runtime.evaluate', { expression: `
    appData.activeCaseId = 'RAMOS-8D-20260901-01';
    const c = getActiveCase();
    if (c) {
      delete c.approvalReviewFrom;
      if (c.signOffHistory?.D2 && typeof approvalSnapshot === 'function') {
        c.signOffHistory.D2.snapshot = approvalSnapshot(c, 'D2');
        c.signOffHistory.D2.status = 'Approved';
      }
      if (c.d2?.approval) {
        c.d2.approval.status = 'Approved';
        c.d2.approval.humanConfirmed = true;
      }
      saveAppData();
    }
    switchStage('D3');
  ` });
  await delay(400);

  const d3BridgePresent = (await call('Runtime.evaluate', { expression: `!!document.querySelector('.d3-containment-bridge')`, returnByValue: true })).result.value;
  assert.ok(d3BridgePresent, 'D3 Containment Bridge widget must be present in D3 workspace');

  // Trigger 1-Click Sync in D3
  await call('Runtime.evaluate', { expression: `document.getElementById('btnSyncSupplierD3').click();` });
  await delay(400);

  const d3SyncResult = (await call('Runtime.evaluate', { expression: `(() => {
    const c = getActiveCase();
    const row = c.d3.materialFlow.find(r => r.area && (r.area.includes('ASE') || r.area.includes('외주')));
    const action = c.d3.actions.find(a => a.id === 'ICA-SUP-01' || (a.target && a.target.includes('ASE')));
    return {
      hasRow: !!row,
      holdQty: row?.holdQty,
      evidence: row?.evidence,
      hasAction: !!action,
      actionStatus: action?.status
    };
  })()`, returnByValue: true })).result.value;

  assert.ok(d3SyncResult.hasRow, 'D3 Material Flow must have TechL quarantine row');
  assert.equal(d3SyncResult.holdQty, 4800, 'D3 Material Flow TechL row must have 4,800ea hold quantity');
  assert.ok(d3SyncResult.evidence.includes('SQ-2026-002'), 'D3 Material Flow ASE row must link SQ-2026-002 ticket');
  assert.ok(d3SyncResult.hasAction, 'D3 ICA actions must contain ICA-SUP-01 for ASE');
  assert.equal(d3SyncResult.actionStatus, 'Completed', 'D3 ICA action status must be Completed');

  const d3Shot = await call('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(outDir, 'verify_supplier_d3_bridge.png'), Buffer.from(d3Shot.data, 'base64'));
  console.log('✓ PASS: Bridge 1 (D3 Containment 4,800ea sync) verified -> verify_supplier_d3_bridge.png');

  // 9.2 Bridge 2 (D4): Subcontractor FA Evidence & Logs Registration into D4 Matrix
  await call('Runtime.evaluate', { expression: `
    appData.activeStage = 'D4';
    appData.currentView = 'stage';
    saveAppData();
    renderCurrentView();
  ` });
  await delay(400);

  const d4BridgePresent = (await call('Runtime.evaluate', { expression: `!!document.querySelector('.d4-evidence-bridge')`, returnByValue: true })).result.value;
  assert.ok(d4BridgePresent, 'D4 FA Evidence Bridge widget must be present in D4 workspace');

  // Trigger 1-Click Sync in D4
  await call('Runtime.evaluate', { expression: `document.getElementById('btnSyncSupplierD4').click();` });
  await delay(400);

  const d4SyncResult = (await call('Runtime.evaluate', { expression: `(() => {
    const c = getActiveCase();
    const ev1 = c.evidenceList.find(e => e.id === 'EVD-SUP-01' || e.file === 'Xray_Void_Defect_Inspection.png');
    const ev2 = c.evidenceList.find(e => e.id === 'EVD-SUP-02' || e.file === 'TechL_Dispenser_Pressure_Log.csv');
    const faEntry = (c.d4.faMatrix || []).find(f => f.evidenceId === 'EVD-SUP-01');
    return {
      hasEv1: !!ev1,
      hasEv2: !!ev2,
      ev1Stage: ev1?.linkedStages,
      hasFaEntry: !!faEntry
    };
  })()`, returnByValue: true })).result.value;

  assert.ok(d4SyncResult.hasEv1, 'Evidence List must contain EVD-SUP-01 (X-Ray inspection)');
  assert.ok(d4SyncResult.hasEv2, 'Evidence List must contain EVD-SUP-02 (Dispenser pressure log)');
  assert.ok(d4SyncResult.ev1Stage.includes('D4'), 'EVD-SUP-01 must link to D4 stage');
  assert.ok(d4SyncResult.hasFaEntry, 'D4 FA Matrix must contain BGA Underfill X-Ray analysis entry');

  const d4Shot = await call('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(outDir, 'verify_supplier_d4_bridge.png'), Buffer.from(d4Shot.data, 'base64'));
  console.log('✓ PASS: Bridge 2 (D4 FA Evidence & Log registration) verified -> verify_supplier_d4_bridge.png');

  // 9.3 Bridge 3 (D5): Subcontractor 4M PCN Approval Sync into D5 PCA & ECN
  await call('Runtime.evaluate', { expression: `
    appData.activeStage = 'D5';
    appData.currentView = 'stage';
    saveAppData();
    renderCurrentView();
  ` });
  await delay(400);

  const d5BridgePresent = (await call('Runtime.evaluate', { expression: `!!document.querySelector('.d5-pcn-bridge')`, returnByValue: true })).result.value;
  assert.ok(d5BridgePresent, 'D5 PCN Bridge widget must be present in D5 workspace');

  // Trigger 1-Click Sync in D5
  await call('Runtime.evaluate', { expression: `document.getElementById('btnSyncSupplierD5').click();` });
  await delay(400);

  const d5SyncResult = (await call('Runtime.evaluate', { expression: `(() => {
    const c = getActiveCase();
    const murataCand = (c.d5.candidates || []).find(cand => cand.selected && ((cand.title || '').includes('무라타') || (cand.title || '').includes('X7R')));
    return {
      hasMurata: !!murataCand,
      murataSelected: murataCand?.selected,
      ecnNumber: c.d5.pcnEcn?.ecnNumber,
      pcnRequired: c.d5.pcnEcn?.pcnRequired,
      approvalStatus: c.d5.pcnEcn?.customerApprovalStatus
    };
  })()`, returnByValue: true })).result.value;

  assert.ok(d5SyncResult.hasMurata, 'D5 Candidates must include Murata X7R MLCC PCA');
  assert.equal(d5SyncResult.murataSelected, true, 'Murata X7R PCA candidate must be marked selected (true)');
  assert.equal(d5SyncResult.ecnNumber, 'ECN-260901-01', 'D5 ECN Number must be ECN-260901-01');
  assert.equal(d5SyncResult.pcnRequired, true, 'D5 PCN Required must be true');
  assert.ok(d5SyncResult.approvalStatus.includes('Approved by LGE'), 'D5 Approval status must reflect LGE approval');

  const d5Shot = await call('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(outDir, 'verify_supplier_d5_bridge.png'), Buffer.from(d5Shot.data, 'base64'));
  console.log('✓ PASS: Bridge 3 (D5 PCA selection & ECN sync) verified -> verify_supplier_d5_bridge.png');

  // --- Step 10: Testing Header Layout (Zero-Overlap) & Customer 8D 24h SLA Watchtower ---
  console.log('--- Step 10: Testing Header Layout (Zero-Overlap) & Customer 8D 24h SLA Watchtower ---');
  
  // 10.1 Verify Header Non-overlapping layout mathematically
  const headerLayout = (await call('Runtime.evaluate', { expression: `(() => {
    const caseZone = document.querySelector('.header-case-zone').getBoundingClientRect();
    const headerActions = document.querySelector('.header-actions').getBoundingClientRect();
    return {
      caseZoneRight: Math.round(caseZone.right),
      actionsLeft: Math.round(headerActions.left),
      overlap: caseZone.right > headerActions.left
    };
  })()`, returnByValue: true })).result.value;
  assert.ok(!headerLayout.overlap, `Header elements must NOT overlap: caseZoneRight (${headerLayout.caseZoneRight}px) <= actionsLeft (${headerLayout.actionsLeft}px)`);
  console.log(`✓ PASS: Header Zero-Overlap verified (caseZoneRight: ${headerLayout.caseZoneRight}px, actionsLeft: ${headerLayout.actionsLeft}px)`);

  // 10.2 Navigate to Dashboard and verify Pure 4-Milestone SLA Strip
  await call('Runtime.evaluate', { expression: `switchNav('dashboard');` });
  await delay(400);

  const hasDashStrip = (await call('Runtime.evaluate', { expression: `!!document.querySelector('.dashboard-sla-coq-strip')`, returnByValue: true })).result.value;
  assert.ok(hasDashStrip, 'Dashboard SLA 4-Milestone Strip must be present');

  const dashStripText = (await call('Runtime.evaluate', { expression: `document.querySelector('.dashboard-sla-coq-strip').innerText`, returnByValue: true })).result.value;
  assert.ok(dashStripText.includes('고객사 8D SLA 종합 준수율') && dashStripText.includes('D3 긴급 봉쇄(24h)'), 'Dashboard strip must display pure 8D SLA milestones');

  const dashShot = await call('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(outDir, 'verify_dashboard_sla_coq_strip.png'), Buffer.from(dashShot.data, 'base64'));
  console.log('✓ PASS: Dashboard SLA 4-Milestone Strip verified -> verify_dashboard_sla_coq_strip.png');

  // 10.3 Check Header SLA Watchdog Chip and Open Timeline Modal
  const slaChipText = (await call('Runtime.evaluate', { expression: `(() => {
    const chip = document.getElementById('headerSlaWatchdog');
    return chip ? chip.innerText : '';
  })()`, returnByValue: true })).result.value;
  assert.ok(slaChipText.includes('SLA'), 'Header SLA Watchdog Chip must display SLA status');

  await call('Runtime.evaluate', { expression: `document.getElementById('headerSlaWatchdog').click();` });
  await delay(400);

  const slaModalTitle = (await call('Runtime.evaluate', { expression: `(() => {
    const m = document.getElementById('modalContainer');
    return m ? m.innerText : '';
  })()`, returnByValue: true })).result.value;
  assert.ok(slaModalTitle.includes('8D 대응 규격 SLA 타임라인'), 'SLA Timeline Modal must open with SLA header');

  const slaShot = await call('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(outDir, 'verify_sla_timeline_modal.png'), Buffer.from(slaShot.data, 'base64'));
  console.log('✓ PASS: SLA Timeline Modal verified -> verify_sla_timeline_modal.png');

  // Close Timeline Modal
  await call('Runtime.evaluate', { expression: `closeModal();` });
  await delay(300);

  // 10.4 Test Customer SLA Delay Justification Notice Generator
  await call('Runtime.evaluate', { expression: `openSlaDelayNoticeModal();` });
  await delay(400);

  const delayNoticeText = (await call('Runtime.evaluate', { expression: `document.getElementById('txtDelayNotice')?.value || ''`, returnByValue: true })).result.value;
  assert.ok(delayNoticeText.includes('고객사 8D 일정 현황 및 잠정 원인분석 중간보고'), 'Delay notice must contain official memo text');

  const delayShot = await call('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(outDir, 'verify_sla_delay_notice.png'), Buffer.from(delayShot.data, 'base64'));
  console.log('✓ PASS: Customer SLA Delay Justification Notice verified -> verify_sla_delay_notice.png');

  await call('Runtime.evaluate', { expression: `closeModal();` });
  await delay(300);

  // 10.5 Navigate to Official Reports Hub, switch to Gate 03 (Final 8D) and verify clean cost-free report
  await call('Runtime.evaluate', { expression: `
    switchNav('reports-hub');
    setGateTab('gate8D');
  ` });
  await delay(500);

  const hasReportCoqTable = (await call('Runtime.evaluate', { expression: `!!document.querySelector('.report-coq-financial-box')`, returnByValue: true })).result.value;
  assert.ok(!hasReportCoqTable, 'Official 8D Report must be clean without CoQ cost tables per user request');
  console.log('✓ PASS: Official 8D Report is pure quality report without financial CoQ table');

  try { socket.close(); } catch {}
  try { proc.kill(); } catch {}
  console.log('\n=================================================');
  console.log('🎉 ALL DYNAMIC 2-TRACK SUPPLIER & DOC VIEWER E2E TESTS PASSED 100%!');
  console.log('=================================================');
  setTimeout(() => process.exit(0), 100);
})().catch(err => {
  console.error(err);
  try { socket.close(); } catch {}
  try { proc.kill(); } catch {}
  process.exit(1);
});
