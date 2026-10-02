/* ========================================================================= */
/* NAVIGATION, AUTHENTICATION & NOTIFICATION CONTROLLER                      */
/* ========================================================================= */
let isBannerDismissed = false;

async function initApp() {
  try {
    initTheme();
    const isLoggedIn = await checkAuthSession();
    if (!isLoggedIn) {
      showLoginScreen();
      return;
    }

    if (typeof QMSApi !== 'undefined' && QMSApi.getState().available) {
      appData = await QMSApi.hydrateCentralState(appData);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
      window.appData = appData;
    }
    hideLoginScreen();
    if (typeof window !== 'undefined') window.CURRENT_USER = CURRENT_USER;
    const activeCase = getActiveCase();
    if (!activeCase && !(appData && appData._centralMode)) {
      appData = loadStoredAppData();
    }

    renderUserSwitcherHeader();
    renderCaseSelector();
    renderCurrentView();
    renderOrgTree();
    updateNotificationBadge();
    if (typeof startSlaWatchdogTimer === 'function') {
      startSlaWatchdogTimer();
    }
    void refreshServerEscalations();
    if (window.QMS_ESCALATION_TIMER) clearInterval(window.QMS_ESCALATION_TIMER);
    window.QMS_ESCALATION_TIMER = setInterval(refreshServerEscalations, 60000);

    window.QMS_APP_READY = true;

    if (window.lucide) {
      lucide.createIcons();
    }
  } catch (err) {
    console.error('Initialization error caught and recovered:', err);
    showLoginScreen();
    const errorMsg = document.getElementById('loginErrorMsg');
    if (errorMsg) {
      errorMsg.style.display = 'block';
      errorMsg.textContent = `중앙 QMS 초기화 실패: ${err.message}`;
    }
  }
}

// -------------------------------------------------------------------------
// THEME CONTROLLER (LIGHT MODE / DARK MODE)
// -------------------------------------------------------------------------
function initTheme() {
  const savedTheme = localStorage.getItem('RAMOS_THEME') || 'dark';
  applyTheme(savedTheme);
}

function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  applyTheme(newTheme);
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  try {
    localStorage.setItem('RAMOS_THEME', theme);
  } catch (e) {}

  const icon = document.getElementById('themeToggleIcon');
  const text = document.getElementById('themeToggleText');
  const btn = document.getElementById('themeToggleBtn');

  if (btn) {
    btn.setAttribute('data-current-theme', theme);
  }

  if (theme === 'light') {
    if (icon) {
      icon.setAttribute('data-lucide', 'moon');
      icon.style.color = '#c4b5fd';
    }
    if (text) text.innerText = '다크 모드';
    if (btn) {
      btn.setAttribute('aria-label', 'Dark Theme로 전환');
      btn.setAttribute('aria-pressed', 'true');
      btn.title = '다크 모드로 전환 (현재: 라이트 모드)';
    }
  } else {
    if (icon) {
      icon.setAttribute('data-lucide', 'sun');
      icon.style.color = '#fbbf24';
    }
    if (text) text.innerText = '라이트 모드';
    if (btn) {
      btn.setAttribute('aria-label', 'Light Theme로 전환');
      btn.setAttribute('aria-pressed', 'false');
      btn.title = '라이트 모드로 전환 (현재: 다크 모드)';
    }
  }

  if (window.lucide) {
    lucide.createIcons();
  }
}

// -------------------------------------------------------------------------
// AUTHENTICATION CONTROLLER (ID: email prefix, PW: 1)
// -------------------------------------------------------------------------
async function checkAuthSession() {
  try {
    const account = await QMSApi.me();
    if (!account) return false;
    CURRENT_USER = account;
    window.CURRENT_USER = account;
    sessionStorage.setItem('RAMOS_AUTH_USER', account.username);
    return true;
  } catch (error) {
    console.error('Central authentication unavailable:', error);
    const errorMsg = document.getElementById('loginErrorMsg');
    if (errorMsg) {
      errorMsg.style.display = 'block';
      errorMsg.textContent = error.message;
    }
    return false;
  }
}

function showLoginScreen() {
  const loginEl = document.getElementById('loginScreen');
  if (loginEl) loginEl.style.display = 'flex';
  const sidebar = document.querySelector('.sidebar');
  const main = document.querySelector('.main-area');
  if (sidebar) sidebar.style.display = 'none';
  if (main) main.style.display = 'none';
  if (window.lucide) lucide.createIcons();
}

function hideLoginScreen() {
  const loginEl = document.getElementById('loginScreen');
  if (loginEl) loginEl.style.display = 'none';
  const sidebar = document.querySelector('.sidebar');
  const main = document.querySelector('.main-area');
  if (sidebar) sidebar.style.display = 'flex';
  if (main) main.style.display = 'flex';
}

async function handleLoginSubmit(e) {
  if (e) e.preventDefault();
  const username = document.getElementById('loginUsername')?.value;
  const password = document.getElementById('loginPassword')?.value;
  const errorMsg = document.getElementById('loginErrorMsg');

  try {
    const account = await QMSApi.login(username, password);
    if (errorMsg) errorMsg.style.display = 'none';
    CURRENT_USER = account;
    if (typeof window !== 'undefined') window.CURRENT_USER = account;
    sessionStorage.setItem('RAMOS_AUTH_USER', account.username);
    isBannerDismissed = false;
    await initApp();

    if (account.isSupplier) {
      supplierPortalState.activeTab='watchtower';
      if (!['supplier-pcn','supplier-issues','supplier-notices'].includes(appData.currentView)) switchNav('supplier-pcn');
      else renderCurrentView();
    }

    // Check if user has urgent pending approvals and trigger modal
    setTimeout(() => {
      const approvals = getUnifiedUserTasks(CURRENT_USER).filter(t => t.isApproval);
      if (approvals.length > 0) {
        showPendingApprovalsLoginModal(approvals);
      }
    }, 400);
  } catch (error) {
    if (errorMsg) {
      errorMsg.style.display = 'block';
      errorMsg.textContent = `⚠️ ${error.message}`;
    }
  }
}

async function handleQuickLogin(username) {
  const uInput = document.getElementById('loginUsername');
  const pInput = document.getElementById('loginPassword');
  if (uInput) uInput.value = username;
  if (pInput) pInput.value = '1';
  await handleLoginSubmit();
}

async function handleLogout() {
  await QMSApi.logout();
  sessionStorage.removeItem('RAMOS_AUTH_USER');
  localStorage.removeItem('RAMOS_CURRENT_USER');
  CURRENT_USER = PRESET_USERS[0];
  showLoginScreen();
  alert('로그아웃 되었습니다.');
}

function renderUserSwitcherHeader() {
  const select = document.getElementById('currentUserSelect');
  if (!select) return;

  select.innerHTML = `<option value="${CURRENT_USER.username || CURRENT_USER.name}">
    ${CURRENT_USER.isSupplier ? '🏭 [외주] ' : ''}${CURRENT_USER.name} ${CURRENT_USER.position}${CURRENT_USER.isMaster ? ' - MASTER' : ''}
  </option>`;
  select.disabled = true;
  select.title = `${CURRENT_USER.name} ${CURRENT_USER.position} · ${CURRENT_USER.dept}${typeof hasMasterAuthority === 'function' && hasMasterAuthority(CURRENT_USER) ? ' · MASTER' : ''}`;

  // Update left sidebar footer user profile
  const footerAvatar = document.querySelector('.sidebar > div:last-child > div:first-child');
  const footerName = document.querySelector('.sidebar > div:last-child > div:last-child > div:first-child');
  if (footerAvatar && footerName) {
    footerAvatar.innerText = CURRENT_USER.name.length > 2 ? CURRENT_USER.name.slice(-2) : CURRENT_USER.name;
    if (CURRENT_USER.isSupplier) {
      footerAvatar.style.background = 'linear-gradient(135deg, #f97316, #ea580c)';
      footerAvatar.style.boxShadow = '0 2px 8px rgba(249, 115, 22, 0.4)';
      footerName.innerHTML = `${CURRENT_USER.name} ${CURRENT_USER.position} <span style="font-size:0.68rem; color:#fb923c; font-weight:700;">(${CURRENT_USER.company || CURRENT_USER.dept})</span> <span class="badge-pill" style="background:#f97316; color:#ffffff; font-size:0.58rem; padding:1px 5px; font-weight:800;">외주 협력사</span>`;
    } else {
      footerAvatar.style.background = '';
      footerAvatar.style.boxShadow = '';
      footerName.innerHTML = `${CURRENT_USER.name} ${CURRENT_USER.position} <span style="font-size:0.68rem; color:#60a5fa; font-weight:600;">(${CURRENT_USER.dept})</span>${typeof hasMasterAuthority === 'function' && hasMasterAuthority(CURRENT_USER) ? ' <span class="badge-pill badge-warn" style="font-size:0.6rem;">MASTER</span>' : ''}`;
    }
  }

  // Header Mode Notice for Supplier
  let modeBadge = document.getElementById('supplierModeHeaderBadge');
  if (CURRENT_USER.isSupplier) {
    if (!modeBadge) {
      modeBadge = document.createElement('div');
      modeBadge.id = 'supplierModeHeaderBadge';
      const headerActions = document.querySelector('.header-actions');
      if (headerActions) headerActions.prepend(modeBadge);
    }
    modeBadge.style.display = 'inline-flex';
    modeBadge.innerHTML = `
      <div style="display:inline-flex; align-items:center; gap:6px; background:rgba(249,115,22,0.15); border:1px solid rgba(249,115,22,0.45); border-radius:6px; padding:3px 10px; font-size:0.75rem; color:#fb923c;">
        <i data-lucide="building-2" style="width:13px; height:13px;"></i>
        <span><b>${CURRENT_USER.company || 'TechL'}</b> 전용 접속 모드</span>
      </div>
    `;
  } else {
    if (modeBadge) modeBadge.style.display = 'none';
  }

  // Adapt sidebar view for Supplier
  adaptSidebarForUser();

  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
}

function adaptSidebarForUser() {
  const isSupplier = Boolean(CURRENT_USER && CURRENT_USER.isSupplier);
  const internalNav = document.getElementById('internalCompanyNavSection');
  const dashboardNav = document.getElementById('navItemDashboard');
  const supplierNav = document.getElementById('nav-supplier-portal');
  const supplierNavText = document.getElementById('navSupplierPortalText');
  const menuCatOverview = document.getElementById('menuCatOverview');
  const sidebarTabs = document.querySelector('.sidebar-tabs');

  if (isSupplier) {
    document.body.classList.add('supplier-mode');
    if (internalNav) internalNav.style.display = 'none';
    if (dashboardNav) dashboardNav.style.display = 'none';
    if (sidebarTabs) sidebarTabs.style.display = 'none';
    if (menuCatOverview) menuCatOverview.innerText = `외주 협력사 포털 (${CURRENT_USER.company || 'TechL'})`;
    if (supplierNavText) supplierNavText.innerText = 'PCN 변경 관리';
    if (supplierNav) supplierNav.classList.add('active');

    const orgView = document.getElementById('sidebarOrgView');
    const menuView = document.getElementById('sidebarMenuView');
    if (orgView) orgView.style.display = 'none';
    if (menuView) menuView.style.display = 'block';

    const banner = document.getElementById('sidebarSupplierNoticeBanner');
    if (banner) banner.style.display = 'none';
  } else {
    document.body.classList.remove('supplier-mode');
    if (internalNav) internalNav.style.display = '';
    if (dashboardNav) dashboardNav.style.display = '';
    if (sidebarTabs) sidebarTabs.style.display = '';
    if (menuCatOverview) menuCatOverview.innerText = 'Dashboard & Overview';
    if (supplierNavText) supplierNavText.innerText = 'PCN 변경 관리';
    const banner = document.getElementById('sidebarSupplierNoticeBanner');
    if (banner) banner.style.display = 'none';
  }
}

function onUserSwitch(userName) {
  void userName;
  alert('보안을 위해 화면에서 사용자를 전환할 수 없습니다. 로그아웃 후 해당 계정으로 다시 로그인해 주세요.');
  renderUserSwitcherHeader();
}

function getServerEscalationTasks(user = CURRENT_USER) {
  const roles = new Set(user?.roles || []);
  return (window.QMS_ESCALATIONS || [])
    .filter(item => user?.isMaster || (item.recipientRoles || []).some(role => roles.has(role)))
    .map(item => ({
      caseId:item.caseId,
      customer:(item.targetType === 'intake'
        ? (appData.intakeQueue || []).find(q => q.intakeId === item.caseId)
        : (appData.cases || []).find(c => c.id === item.caseId))?.customer || '',
      // A deadline on an intake that is still waiting for review opens the review queue, not a report.
      targetStage:item.targetType === 'intake' ? 'intake-triage' : 'reports-hub',
      gateKey:item.targetType === 'intake' ? '' : {D3:'gate3D',D5:'gate5D',D8:'gate8D'}[item.milestone],
      stageCode:`${item.milestone} SLA`,
      urgency:item.level === 'L3_OVERDUE' ? 'critical' : 'high',
      isApproval:false,
      title:`[${item.level}] ${item.reason}`,
      desc:`기한 ${item.dueAt} · 시스템 외부 알림/이메일 발송 없음`
    }));
}

function getAgentNotificationTasks(user = CURRENT_USER) {
  const roles = new Set(user?.roles || []);
  return (window.QMS_AGENT_NOTIFICATIONS || [])
    .filter(item => user?.isMaster || !(item.recipientRoles || []).length || (item.recipientRoles || []).some(role => roles.has(role)))
    .map(item => ({
      caseId:item.caseId,
      customer:(appData.cases || []).find(c => c.id === item.caseId)?.customer || '',
      targetStage:'agent-operations',
      stageCode:'AGENT',
      urgency:['CRITICAL','HIGH'].includes(item.severity) ? 'critical' : 'high',
      isApproval:item.type === 'AGENT_APPROVAL_REQUIRED',
      title:item.title,
      desc:`${item.message} · 외부 알림/이메일 발송 없음`
    }));
}

function getUnifiedUserTasks(user = CURRENT_USER) {
  return [...getAgentNotificationTasks(user), ...getServerEscalationTasks(user), ...getUserPendingTasks(user)];
}

async function refreshServerEscalations() {
  if (typeof QMSApi === 'undefined' || !QMSApi.getState().authenticated || CURRENT_USER?.isSupplier) return;
  try {
    const [escalations, agentNotifications] = await Promise.all([
      QMSApi.evaluateEscalations(),
      QMSApi.listAgentNotifications(100)
    ]);
    window.QMS_ESCALATIONS = escalations;
    window.QMS_AGENT_NOTIFICATIONS = agentNotifications;
    updateNotificationBadge();
  } catch (error) {
    console.warn('Central notification refresh failed:', error);
  }
}

function updateNotificationBadge() {
  const tasks = getUnifiedUserTasks(CURRENT_USER);
  const badge = document.getElementById('headerNotifBadge');
  const intakeBadge = document.getElementById('nav-intake-count');
  const pendingIntakeCount = (appData.intakeQueue || []).filter(item =>
    ['Quality Review Pending', 'Quality Review In Progress'].includes(item.status)
  ).length;
  if (badge) {
    badge.innerText = tasks.length;
    badge.style.display = tasks.length > 0 ? 'flex' : 'none';
  }
  if (intakeBadge) {
    intakeBadge.innerText = pendingIntakeCount;
    intakeBadge.style.display = pendingIntakeCount > 0 ? 'inline-flex' : 'none';
  }
}

function renderCaseSelector() {
  const select = document.getElementById('activeCaseSelect');
  if (!select) return;

  const validCases = (appData && Array.isArray(appData.cases)) ? appData.cases : [];
  select.disabled = validCases.length === 0;
  select.innerHTML = validCases.length === 0 ? '<option value="">정식 Case 없음 · 접수부터 시작</option>' : validCases.map(c => `
    <option value="${c.id}" ${c.id === appData.activeCaseId ? 'selected' : ''}>
      ${c.id} | ${c.customer} (${c.product})
    </option>
  `).join('');
  const openCount = document.getElementById('nav-open-count');
  if (openCount) openCount.innerText = validCases.filter(c => c.status !== 'Closed').length;

  const c = getActiveCase();
  const badge = document.getElementById('headerStageBadge');
  if (badge && c) {
    const isClosed = c.status === 'Closed';
    const statusLabel = isClosed ? '완결' : (c.status === 'Draft' ? '초안' : '진행중');
    badge.className = `header-stage-state ${isClosed ? 'completed' : (c.severityLevel === 'Critical' ? 'critical' : '')}`;
    badge.innerHTML = `<i data-lucide="activity"></i><strong>${c.currentStage || 'D1'}</strong><span>${statusLabel}</span>`;
    badge.title = `${c.currentStage || 'D1'} · ${c.status || 'In Progress'} · ${c.severityLevel || ''}`;
  } else if (badge) {
    badge.className = 'header-stage-state';
    badge.innerHTML = '<i data-lucide="circle-dashed"></i><span>대기</span>';
  }
  if (typeof updateHeaderSlaWidget === 'function') {
    updateHeaderSlaWidget();
  }
  if (window.lucide) lucide.createIcons();
}

function onCaseChange(caseId) {
  if (!caseId) return;
  if (typeof persistCurrentEditor === 'function' && !persistCurrentEditor()) return;
  appData.activeCaseId = caseId;
  saveAppData();
  renderCaseSelector();
  renderCurrentView();
}

function switchNav(viewName, el) {
  if(viewName==='supplier-portal')viewName='supplier-pcn';
  if (typeof persistCurrentEditor === 'function' && !persistCurrentEditor()) return;
  if (CURRENT_USER && CURRENT_USER.isSupplier && !['supplier-portal','supplier-pcn','supplier-issues','supplier-notices'].includes(viewName)) {
    return;
  }
  if (['supplier-pcn','supplier-issues'].includes(viewName) && typeof setSupplierSection === 'function') setSupplierSection(viewName==='supplier-pcn'?'PCN':'Issue',false);
  appData.currentView = viewName;
  saveAppData();
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  if (el) el.classList.add('active');
  renderCurrentView();
}

function switchStage(stageName) {
  if (CURRENT_USER && CURRENT_USER.isSupplier) {
    return;
  }
  if (typeof persistCurrentEditor === 'function' && !persistCurrentEditor()) return;
  const activeCase = getActiveCase();
  if (typeof canEnterQualityStage === 'function' && activeCase) {
    const gate = canEnterQualityStage(activeCase, stageName);
    if (!gate.allowed) {
      alert(gate.message);
      return;
    }
  }
  appData.currentView = 'stage';
  appData.activeStage = stageName;
  saveAppData();
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  renderCurrentView();
}

function renderUserTaskBannerHTML() {
  if (isBannerDismissed) return '';
  const tasks = getUnifiedUserTasks(CURRENT_USER);
  if (tasks.length === 0) return '';
  const first = tasks[0];

  return `
    <div class="user-task-banner-slim no-print">
      <div class="task-slim-left">
        <i data-lucide="bell-ring" style="width:14px; height:14px; color:#38bdf8; flex-shrink:0;"></i>
        <span style="font-size:0.78rem; font-weight:700; color:var(--text-primary);">
          <b>${CURRENT_USER.name}</b>님 To-Do:
        </span>
        <span class="num-mono" style="font-size:0.75rem; font-weight:800; color:#60a5fa;">${first.caseId}</span>
        <span class="badge-pill ${first.urgency === 'critical' ? 'badge-fail' : 'badge-warn'}" style="font-size:0.6rem;">${first.stageCode}</span>
        <span style="font-size:0.75rem; color:var(--text-primary); text-overflow:ellipsis; overflow:hidden; white-space:nowrap; max-width:450px;">
          ${first.title}
        </span>
      </div>
      <div style="display:flex; align-items:center; gap:8px; flex-shrink:0;">
        <button class="btn btn-primary btn-xs" style="font-size:0.7rem; padding:2px 8px;" onclick="jumpToUserTask('${first.caseId}', '${first.targetStage}', '${first.gateKey || ''}')">
          조치 바로가기 ➔
        </button>
        ${tasks.length > 1 ? `
          <button type="button" class="btn btn-secondary btn-xs" style="font-size:0.68rem; padding:2px 6px;" onclick="openNotificationModal()" title="전체 ${tasks.length}건 보기">
            전체 ${tasks.length}건
          </button>
        ` : ''}
        <button type="button" onclick="isBannerDismissed=true; renderCurrentView();" style="background:transparent; border:none; color:#94a3b8; cursor:pointer; font-size:0.72rem; padding:0 4px;" title="배너 접기">
          ✕
        </button>
      </div>
    </div>
  `;
}

function jumpToUserTask(caseId, targetStage, gateKey) {
  if (targetStage === 'intake-triage') {
    appData.activeIntakeId = caseId;
    saveAppData();
    switchNav('intake-triage');
    return;
  }
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
}

function closeModal() {
  const modal = document.getElementById('globalModal');
  if (modal) modal.style.display = 'none';
}

function openNotificationModal() {
  const tasks = getUnifiedUserTasks(CURRENT_USER);
  const modal = document.getElementById('globalModal');
  const container = document.getElementById('modalContainer');
  if (!modal || !container) return;
  container.innerHTML = '<div style="display:flex;justify-content:space-between;gap:12px;margin-bottom:14px;"><h3 id="modalTitle"></h3><button class="btn btn-secondary btn-sm" onclick="closeModal()">닫기</button></div><div id="modalBody"></div>';
  const modalTitle = document.getElementById('modalTitle');
  const modalBody = document.getElementById('modalBody');

  modalTitle.innerHTML = `<i data-lucide="bell" style="width:18px;height:18px;color:#38bdf8;"></i> [${CURRENT_USER.name} ${CURRENT_USER.position}] 님의 8D 개인 알림 센터`;
  
  modalBody.innerHTML = `
    <div style="margin-bottom:14px; font-size:0.82rem; color:var(--text-secondary); background:var(--bg-card-subtle); padding:10px 14px; border-radius:6px;">
      소속: <b>${CURRENT_USER.dept}</b> | 역할: <b>${CURRENT_USER.roleDesc}</b> | 이메일: <b>${CURRENT_USER.email}</b><br>
      현재 전사 8D 케이스 중 <b>${CURRENT_USER.name}</b> 님의 승인/검토/조치가 대기 중인 항목입니다.
    </div>

    ${tasks.length === 0 ? `
      <div style="text-align:center; padding:30px; color:#34d399;">
        <i data-lucide="check-circle-2" style="width:40px; height:40px; margin-bottom:8px;"></i>
        <div style="font-weight:700; font-size:0.95rem;">현재 대기 중인 To-Do 조치 사항이 없습니다!</div>
        <div style="font-size:0.75rem; color:#94a3b8; margin-top:4px;">모든 담당 단계가 정상 진행/완료 상태입니다.</div>
      </div>
    ` : `
      <div style="display:flex; flex-direction:column; gap:10px;">
        ${tasks.map(t => `
          <div style="background:var(--bg-card-subtle); border:1px solid ${t.urgency === 'critical' ? '#ef4444' : '#3b82f6'}; border-radius:6px; padding:12px; display:flex; justify-content:space-between; align-items:center; gap:14px;">
            <div style="flex:1;">
              <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
                <span class="num-mono" style="font-weight:800; color:#60a5fa; font-size:0.88rem;">${t.caseId}</span>
                <span style="font-weight:700; color:var(--text-primary); font-size:0.84rem;">고객사: ${t.customer}</span>
                <span class="badge-pill ${t.urgency === 'critical' ? 'badge-fail' : 'badge-warn'}">${t.stageCode}</span>
              </div>
              <div style="font-size:0.84rem; font-weight:700; color:var(--text-primary); margin-bottom:2px;">
                ${t.title}
              </div>
              <div style="font-size:0.76rem; color:#94a3b8;">
                ${t.desc}
              </div>
            </div>
            <button class="btn btn-primary btn-sm" style="padding:6px 14px; font-weight:700;" onclick="closeModal(); jumpToUserTask('${t.caseId}', '${t.targetStage}')">
              조치 실행 ➔
            </button>
          </div>
        `).join('')}
      </div>
    `}
  `;

  modal.style.display = 'flex';
  if (window.lucide) lucide.createIcons();
}

function renderCurrentView() {
  const container = document.getElementById('mainContentContainer');
  if (!container) return;

  if (CURRENT_USER && CURRENT_USER.isSupplier && !['supplier-portal','supplier-pcn','supplier-issues','supplier-notices'].includes(appData.currentView)) {
    appData.currentView = 'supplier-pcn';
  }

  const c = getActiveCase();
  const bannerHtml = renderUserTaskBannerHTML();

  let viewHtml = '';
  switch (appData.currentView) {
    case 'dashboard':
      viewHtml = renderDashboardView();
      break;
    case 'new-case':
      viewHtml = renderNewCaseView();
      break;
    case 'intake-triage':
      viewHtml = renderIntakeTriageView();
      break;
    case 'cases-list':
      viewHtml = renderCasesListView();
      break;
    case 'stage':
      viewHtml = c ? renderStageWorkspaceView(c, appData.activeStage) : renderNoActiveCaseView('8D Workspace');
      break;
    case 'evidence-hub':
      viewHtml = c ? renderEvidenceHubView(c) : renderNoActiveCaseView('Evidence 관리');
      break;
    case 'actions-hub':
      viewHtml = c ? renderActionsHubView(c) : renderNoActiveCaseView('Action 관리');
      break;
    case 'reports-hub':
      viewHtml = c ? renderReportsHubView(c) : renderNoActiveCaseView('8D Report');
      break;
    case 'internal-issues':
      viewHtml = renderInternalQualityView('Issue');
      break;
    case 'internal-pcn':
      viewHtml = renderInternalQualityView('PCN');
      break;
    case 'supplier-notices':
      viewHtml = renderSupplierNoticesView();
      break;
    case 'supplier-dashboard':
      viewHtml = renderSupplierDashboardView();
      break;
    case 'assembly-defects':
      viewHtml = renderAssemblyDefectsView();
      break;
    case 'supplier-pcn':
    case 'supplier-issues':
    case 'supplier-portal':
      viewHtml = typeof renderSupplierPortalView === 'function' ? renderSupplierPortalView() : '<div>Supplier Portal Loading...</div>';
      break;
    case 'mission-control':
      viewHtml = c && window.ramosAgent && typeof window.ramosAgent.renderMissionControlView === 'function' ? window.ramosAgent.renderMissionControlView(c) : renderNoActiveCaseView('자율 8D AI 미션 컨트롤');
      break;
    case 'agent-operations':
      viewHtml = typeof renderAgentOperationsView === 'function' ? renderAgentOperationsView() : renderNoActiveCaseView('Agent Operations');
      break;
    default:
      viewHtml = renderDashboardView();
      break;
  }

  container.dataset.workspaceView = appData.currentView;
  container.innerHTML = bannerHtml + viewHtml;
  if (appData.currentView === 'new-case' && typeof restoreIntakeDraft === 'function') {
    restoreIntakeDraft();
  }
  if (appData.currentView === 'reports-hub' && typeof hydrateD4EvidenceAttachments === 'function') {
    setTimeout(() => hydrateD4EvidenceAttachments(container), 0);
  }
  updateNotificationBadge();

  // Update active sidebar nav highlight
  document.querySelectorAll('.nav-item').forEach(n => {
    n.classList.remove('active');
    const onclickAttr = n.getAttribute('onclick') || '';
    if (appData.currentView === 'stage' && onclickAttr.includes(`switchStage('${appData.activeStage}')`)) {
      n.classList.add('active');
    } else if (appData.currentView !== 'stage' && onclickAttr.includes(`switchNav('${appData.currentView}'`)) {
      n.classList.add('active');
    }
  });

  // Synchronize Top Header action buttons active state
  document.querySelectorAll('.header-action-button').forEach(btn => {
    btn.classList.remove('active');
  });
  if (appData.currentView === 'mission-control') {
    const mcBtn = document.getElementById('headerNav-mission-control');
    if (mcBtn) mcBtn.classList.add('active');
  } else if (appData.currentView === 'reports-hub') {
    const rptBtn = document.getElementById('headerNav-reports-hub');
    if (rptBtn) rptBtn.classList.add('active');
  } else if (['supplier-portal','supplier-pcn','supplier-issues'].includes(appData.currentView)) {
    const spBtn = document.getElementById('headerNav-supplier-portal');
    if (spBtn) spBtn.classList.add('active');
  }

  updateSidebarStageStatusIndicators(c);

  if (window.lucide) {
    lucide.createIcons();
  }
}

function updateSidebarStageStatusIndicators(activeCase) {
  const stages = ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8'];
  stages.forEach(stage => {
    const el = document.getElementById(`stageIndicator-${stage}`);
    if (!el) return;

    if (!activeCase) {
      el.innerHTML = '<span class="stage-badge-indicator not-started" title="미착수">○</span>';
      return;
    }

    const isApproved = typeof hasCurrentStageApproval === 'function' ? hasCurrentStageApproval(activeCase, stage) : false;
    const isCurrentActive = appData.currentView === 'stage' && appData.activeStage === stage;
    const caseCurrentStage = activeCase.currentStage || 'D1';

    if (isApproved) {
      el.innerHTML = '<span class="stage-badge-indicator completed" title="승인 완료">✓</span>';
    } else if (isCurrentActive || stage === caseCurrentStage) {
      el.innerHTML = '<span class="stage-badge-indicator in-progress" title="진행 중">◐</span>';
    } else {
      const stageOrder = stages.indexOf(stage);
      const currentOrder = stages.indexOf(caseCurrentStage);
      if (stageOrder < currentOrder) {
        el.innerHTML = '<span class="stage-badge-indicator in-progress" title="작성/검토 중">◐</span>';
      } else {
        el.innerHTML = '<span class="stage-badge-indicator not-started" title="미착수">○</span>';
      }
    }
  });
}

function persistCurrentEditor(silent = false) {
  try {
    if (appData.currentView === 'new-case' && typeof saveIntakeDraft === 'function') {
      saveIntakeDraft();
    }
    const c = getActiveCase();
    let captured = false;
    if (c && document.getElementById('d2QualityForm') && typeof captureD2Form === 'function') {
      captureD2Form(c); captured = true;
    }
    if (c && document.getElementById('d3QualityForm') && typeof captureD3Form === 'function') {
      captureD3Form(c); captured = true;
    }
    if (c && document.getElementById('d4QualityForm') && typeof captureD4Form === 'function') {
      captureD4Form(c); captured = true;
    }
    const lateForm = document.getElementById('lateStageForm');
    if (c && lateForm && typeof captureLateStageForm === 'function') {
      captureLateStageForm(c, lateForm.dataset.stage); captured = true;
    }
    if (captured) saveAppData();
    return true;
  } catch (error) {
    console.error('Current editor could not be persisted:', error);
    if (!silent) alert(`화면 이동 전에 작성 내용을 저장하지 못했습니다.\n${error.message}`);
    return false;
  }
}

window.addEventListener('beforeunload', () => {
  persistCurrentEditor(true);
});

function renderNoActiveCaseView(requestedArea = '8D Workspace') {
  return `
    ${renderQmsPageHeader({title:requestedArea,icon:'panels-top-left',description:'진행할 정식 Case를 선택하면 업무 화면이 열립니다.',className:'no-print'})}
    <section class="fresh-start-empty">
      <div class="fresh-start-code">NO ACTIVE CASE</div>
      <i data-lucide="workflow"></i>
      <h1>${requestedArea}를 시작할 정식 Case가 없습니다.</h1>
      <p>고객 부적합을 접수하고 품질 Triage 승인을 완료하면 정식 Case ID와 D1 Workspace가 생성됩니다.</p>
      <div class="fresh-start-flow">
        <span class="is-current">STEP 01 접수</span><b>→</b><span>STEP 02 품질 검토</span><b>→</b><span>Case 승인</span><b>→</b><span>D1 CFT</span>
      </div>
      <button class="btn btn-primary" onclick="switchNav('new-case')"><i data-lucide="inbox" style="width:15px;height:15px;"></i> 첫 부적합 접수 시작</button>
    </section>
  `;
}

// App Initialization - Safe DOMContentLoaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
