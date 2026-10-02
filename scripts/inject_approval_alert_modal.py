import os

base_dir = r'g:\내 드라이브\AI_Place\Work\11_AI_Customer_Nonconformance_8D_System'

with open(os.path.join(base_dir, 'js', 'app.js'), 'r', encoding='utf-8') as f:
    app_js = f.read()

# Update handleLoginSubmit and handleQuickLogin to trigger approval modal if pending
old_login_submit = """  const account = authenticateUser(username, password);
  if (account) {
    if (errorMsg) errorMsg.style.display = 'none';
    CURRENT_USER = account;
    sessionStorage.setItem('RAMOS_AUTH_USER', account.username);
    localStorage.setItem('RAMOS_CURRENT_USER', account.name);
    isBannerDismissed = false;
    initApp();
  } else {"""

new_login_submit = """  const account = authenticateUser(username, password);
  if (account) {
    if (errorMsg) errorMsg.style.display = 'none';
    CURRENT_USER = account;
    sessionStorage.setItem('RAMOS_AUTH_USER', account.username);
    localStorage.setItem('RAMOS_CURRENT_USER', account.name);
    isBannerDismissed = false;
    initApp();

    // Check if user has urgent pending approvals and trigger modal
    setTimeout(() => {
      const approvals = getUserPendingTasks(CURRENT_USER).filter(t => t.isApproval);
      if (approvals.length > 0) {
        showPendingApprovalsLoginModal(approvals);
      }
    }, 400);
  } else {"""

if old_login_submit in app_js:
    app_js = app_js.replace(old_login_submit, new_login_submit, 1)

# Add showPendingApprovalsLoginModal & jumpToApprovalGate
approval_modal_code = """
function showPendingApprovalsLoginModal(approvals) {
  const modal = document.getElementById('globalModal');
  const modalTitle = document.getElementById('modalTitle');
  const modalBody = document.getElementById('modalBody');
  if (!modal) return;

  modalTitle.innerHTML = `<i data-lucide="stamp" style="width:20px;height:20px;color:#ef4444;"></i> ⚡ [${CURRENT_USER.name} ${CURRENT_USER.position}] 님, 결재 승인 대기 알림 (총 ${approvals.length}건)`;

  modalBody.innerHTML = `
    <div style="background:rgba(239,68,68,0.12); border:1px solid rgba(239,68,68,0.3); border-radius:6px; padding:12px 16px; margin-bottom:16px;">
      <div style="font-size:0.86rem; font-weight:800; color:#f87171; display:flex; align-items:center; gap:6px;">
        <i data-lucide="alert-circle" style="width:16px; height:16px;"></i> 전자 결재 승인/송부 처리가 필요한 건이 있습니다!
      </div>
      <div style="font-size:0.78rem; color:#cbd5e1; margin-top:4px;">
        품질 문제 해결 SLA 기한 준수를 위해 아래 보고서의 승인 서명 또는 고객사 공식 송부를 즉시 진행해 주시기 바랍니다.
      </div>
    </div>

    <div style="display:flex; flex-direction:column; gap:10px;">
      ${approvals.map(a => `
        <div style="background:#0e172a; border:1px solid #ef4444; border-radius:6px; padding:14px; display:flex; justify-content:space-between; align-items:center; gap:14px; box-shadow:0 0 15px rgba(239,68,68,0.15);">
          <div style="flex:1;">
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
              <span class="num-mono" style="font-weight:800; color:#60a5fa; font-size:0.9rem;">${a.caseId}</span>
              <span style="font-weight:700; color:#f8fafc; font-size:0.85rem;">${a.customer}</span>
              <span class="badge-pill badge-fail" style="font-size:0.7rem; font-weight:800;">${a.stageCode} (${a.stepNum}차)</span>
            </div>
            <div style="font-size:0.88rem; font-weight:800; color:#f8fafc; margin-bottom:4px;">
              ${a.title}
            </div>
            <div style="font-size:0.78rem; color:#94a3b8;">
              ${a.desc}
            </div>
          </div>
          <button class="btn btn-danger btn-sm" style="padding:8px 16px; font-weight:800; font-size:0.82rem; flex-shrink:0;" onclick="closeModal(); jumpToApprovalGate('${a.caseId}', '${a.gateKey || 'gate3D'}')">
            <i data-lucide="edit-3" style="width:13px; height:13px;"></i> ✍️ 결재 서명 바로가기
          </button>
        </div>
      `).join('')}
    </div>
  `;

  modal.classList.add('active');
  if (window.lucide) lucide.createIcons();
}

function jumpToApprovalGate(caseId, gateKey) {
  appData.activeCaseId = caseId;
  saveAppData();
  renderCaseSelector();
  switchNav('reports-hub');
  if (typeof setGateTab === 'function') {
    setGateTab(gateKey);
  }
}
"""

if 'showPendingApprovalsLoginModal' not in app_js:
    app_js += '\n' + approval_modal_code

# Also update jumpToUserTask to support gateKey
old_jump = """function jumpToUserTask(caseId, targetStage) {
  appData.activeCaseId = caseId;
  saveAppData();
  renderCaseSelector();

  if (targetStage === 'reports-hub') {
    switchNav('reports-hub');
  } else if (targetStage.startsWith('D')) {
    switchStage(targetStage);
  } else {
    switchNav(targetStage);
  }
}"""

new_jump = """function jumpToUserTask(caseId, targetStage, gateKey) {
  appData.activeCaseId = caseId;
  saveAppData();
  renderCaseSelector();

  if (targetStage === 'reports-hub') {
    switchNav('reports-hub');
    if (gateKey && typeof setGateTab === 'function') {
      setGateTab(gateKey);
    }
  } else if (targetStage.startsWith('D')) {
    switchStage(targetStage);
  } else {
    switchNav(targetStage);
  }
}"""

if old_jump in app_js:
    app_js = app_js.replace(old_jump, new_jump, 1)

# Update renderUserTaskBannerHTML jump button
old_card_btn = """onclick="jumpToUserTask('${t.caseId}', '${t.targetStage}')\""""
new_card_btn = """onclick="jumpToUserTask('${t.caseId}', '${t.targetStage}', '${t.gateKey || ''}')\""""
app_js = app_js.replace(old_card_btn, new_card_btn)

with open(os.path.join(base_dir, 'js', 'app.js'), 'w', encoding='utf-8') as f:
    f.write(app_js)
print('Updated js/app.js with automated login sign-off alert modal!')
