import os

base_dir = r'g:\내 드라이브\AI_Place\Work\11_AI_Customer_Nonconformance_8D_System'

# 1. Update index.html Header
with open(os.path.join(base_dir, 'index.html'), 'r', encoding='utf-8') as f:
    html_content = f.read()

# Replace header in index.html
old_header = """    <!-- Top Sticky Header -->
    <header class="top-header">
      <div style="display: flex; align-items: center; gap: 16px;">
        <div class="case-selector">
          <i data-lucide="layers" style="width: 16px; height: 16px; color: #60a5fa;"></i>
          <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600;">ACTIVE CASE:</span>
          <select id="activeCaseSelect" onchange="onCaseChange(this.value)">
            <!-- Populated via JS -->
          </select>
        </div>
        <div id="headerStageBadge" class="badge-pill badge-warn">
          <i data-lucide="clock" style="width: 12px; height: 12px;"></i>
          <span>D3 Containment In-Progress</span>
        </div>
      </div>

      <div class="header-actions">
        <button class="btn btn-secondary btn-sm" onclick="openAIAssistantModal()">
          <i data-lucide="sparkles" style="width: 14px; height: 14px; color: #38bdf8;"></i>
          <span>AI 전수 품질 검토 (Quality Audit)</span>
        </button>
        <button class="btn btn-primary btn-sm" onclick="switchNav('reports-hub')">
          <i data-lucide="file-text" style="width: 14px; height: 14px;"></i>
          <span>고객 8D Report 생성</span>
        </button>
      </div>
    </header>"""

new_header = """    <!-- Top Sticky Header with User Persona Switcher & Live Notification Bell -->
    <header class="top-header">
      <div style="display: flex; align-items: center; gap: 14px;">
        <div class="case-selector">
          <i data-lucide="layers" style="width: 15px; height: 15px; color: #60a5fa;"></i>
          <span style="font-size: 0.72rem; color: var(--text-muted); font-weight: 700;">ACTIVE CASE:</span>
          <select id="activeCaseSelect" onchange="onCaseChange(this.value)" style="font-size:0.78rem;">
            <!-- Populated via JS -->
          </select>
        </div>
        <div id="headerStageBadge" class="badge-pill badge-warn">
          <i data-lucide="clock" style="width: 12px; height: 12px;"></i>
          <span>D3 Containment In-Progress</span>
        </div>
      </div>

      <div class="header-actions" style="display:flex; align-items:center; gap:10px;">
        <!-- User Switcher Dropdown (Persona Selector) -->
        <div style="display:flex; align-items:center; gap:6px; background:#0c1322; border:1px solid rgba(59,130,246,0.3); border-radius:5px; padding:3px 8px;">
          <i data-lucide="user-check" style="width:14px; height:14px; color:#38bdf8;"></i>
          <span style="font-size:0.7rem; color:#94a3b8; font-weight:600;">접속자:</span>
          <select id="currentUserSelect" class="user-selector-select" onchange="onUserSwitch(this.value)" style="background:transparent; border:none; padding:2px 4px; font-size:0.75rem;">
            <!-- Populated via JS -->
          </select>
        </div>

        <!-- Notification Bell with Live Badge -->
        <button class="notif-bell-btn" onclick="openNotificationModal()" title="내 할 일 / 긴급 Action 알림">
          <i data-lucide="bell" style="width:16px; height:16px;"></i>
          <span class="notif-badge-count" id="headerNotifBadge">0</span>
        </button>

        <button class="btn btn-secondary btn-sm" onclick="openAIAssistantModal()">
          <i data-lucide="sparkles" style="width: 13px; height: 13px; color: #38bdf8;"></i>
          <span>AI 품질 검토</span>
        </button>
        <button class="btn btn-primary btn-sm" onclick="switchNav('reports-hub')">
          <i data-lucide="file-text" style="width: 13px; height: 13px;"></i>
          <span>8D 리포트 & 결재</span>
        </button>
      </div>
    </header>"""

if old_header in html_content:
    html_content = html_content.replace(old_header, new_header, 1)
    with open(os.path.join(base_dir, 'index.html'), 'w', encoding='utf-8') as f:
        f.write(html_content)
    print('Updated index.html header with User Switcher and Notification Bell!')
else:
    print('Could not find old_header in index.html')

# 2. Update js/app.js to render User Banner, Notification Modal, and Persona Switcher
new_app_js = """/* ========================================================================= */
/* NAVIGATION, USER PERSONA & NOTIFICATION CONTROLLER                        */
/* ========================================================================= */
let isBannerDismissed = false;

function initApp() {
  try {
    loadCurrentUser();
    const activeCase = getActiveCase();
    if (!activeCase) {
      appData = loadStoredAppData();
    }

    renderUserSwitcherHeader();
    renderCaseSelector();
    renderCurrentView();
    renderOrgTree();
    updateNotificationBadge();

    if (window.lucide) {
      lucide.createIcons();
    }
  } catch (err) {
    console.error('Initialization error caught and recovered:', err);
    appData = {
      cases: INITIAL_CASES,
      activeCaseId: INITIAL_CASES[0].id,
      currentView: 'dashboard',
      activeStage: 'overview',
      sidebarTab: 'menu'
    };
    renderUserSwitcherHeader();
    renderCaseSelector();
    renderCurrentView();
    renderOrgTree();
  }
}

function renderUserSwitcherHeader() {
  const select = document.getElementById('currentUserSelect');
  if (!select) return;

  select.innerHTML = PRESET_USERS.map(u => `
    <option value="${u.name}" ${u.name === CURRENT_USER.name ? 'selected' : ''}>
      ${u.name} ${u.position} (${u.dept})
    </option>
  `).join('');

  // Update left sidebar footer user profile
  const footerAvatar = document.querySelector('.sidebar > div:last-child > div:first-child');
  const footerName = document.querySelector('.sidebar > div:last-child > div:last-child > div:first-child');
  if (footerAvatar && footerName) {
    footerAvatar.innerText = CURRENT_USER.name.length > 2 ? CURRENT_USER.name.slice(-2) : CURRENT_USER.name;
    footerName.innerHTML = `${CURRENT_USER.name} ${CURRENT_USER.position} <span style="font-size:0.68rem; color:#60a5fa; font-weight:600;">(${CURRENT_USER.dept})</span>`;
  }
}

function onUserSwitch(userName) {
  setCurrentUser(userName);
  isBannerDismissed = false; // re-show banner for newly logged-in user
  renderUserSwitcherHeader();
  updateNotificationBadge();
  renderCurrentView();
}

function updateNotificationBadge() {
  const tasks = getUserPendingTasks(CURRENT_USER);
  const badge = document.getElementById('headerNotifBadge');
  if (badge) {
    badge.innerText = tasks.length;
    badge.style.display = tasks.length > 0 ? 'flex' : 'none';
  }
}

function renderCaseSelector() {
  const select = document.getElementById('activeCaseSelect');
  if (!select) return;

  const validCases = (appData && Array.isArray(appData.cases) && appData.cases.length > 0) ? appData.cases : INITIAL_CASES;
  select.innerHTML = validCases.map(c => `
    <option value="${c.id}" ${c.id === appData.activeCaseId ? 'selected' : ''}>
      ${c.id} | ${c.customer} (${c.product})
    </option>
  `).join('');

  const c = getActiveCase();
  const badge = document.getElementById('headerStageBadge');
  if (badge && c) {
    badge.className = `badge-pill ${c.severityLevel === 'Critical' ? 'badge-fail' : 'badge-warn'}`;
    badge.innerHTML = `<i data-lucide="activity" style="width:12px;height:12px;"></i> ${c.currentStage} ${c.status || 'In-Progress'} (${c.severityLevel})`;
  }
  if (window.lucide) lucide.createIcons();
}

function onCaseChange(caseId) {
  appData.activeCaseId = caseId;
  saveAppData();
  renderCaseSelector();
  renderCurrentView();
}

function switchNav(viewName, el) {
  appData.currentView = viewName;
  saveAppData();
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  if (el) el.classList.add('active');
  renderCurrentView();
}

function switchStage(stageName) {
  appData.currentView = 'stage';
  appData.activeStage = stageName;
  saveAppData();
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  renderCurrentView();
}

function renderUserTaskBannerHTML() {
  if (isBannerDismissed) return '';
  const tasks = getUserPendingTasks(CURRENT_USER);
  if (tasks.length === 0) return '';

  return `
    <div class="user-task-banner no-print">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
        <div style="display:flex; align-items:center; gap:8px;">
          <i data-lucide="bell-ring" style="width:16px; height:16px; color:#38bdf8;"></i>
          <span style="font-size:0.86rem; font-weight:800; color:#f8fafc;">
            👋 <b>${CURRENT_USER.name} ${CURRENT_USER.position}</b> (${CURRENT_USER.dept} — ${CURRENT_USER.roleDesc}) 님에게 할당된 긴급 To-Do
          </span>
          <span style="font-size:0.7rem; background:#ef4444; color:#fff; padding:1px 7px; border-radius:10px; font-weight:800;">
            ${tasks.length}건 대기
          </span>
        </div>
        <button type="button" onclick="isBannerDismissed=true; renderCurrentView();" style="background:transparent; border:none; color:#94a3b8; cursor:pointer; font-size:0.75rem; font-weight:600;">
          ✕ 배너 접기
        </button>
      </div>

      <div style="display:flex; flex-direction:column; gap:6px;">
        ${tasks.map(t => `
          <div class="user-task-card">
            <div style="display:flex; align-items:center; gap:10px; min-width:0; flex:1;">
              <span class="num-mono" style="font-size:0.78rem; font-weight:800; color:#60a5fa; flex-shrink:0;">${t.caseId}</span>
              <span class="badge-pill ${t.urgency === 'critical' ? 'badge-fail' : 'badge-warn'}" style="font-size:0.65rem; flex-shrink:0;">${t.stageCode}</span>
              <div style="min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:0.8rem; color:#f8fafc; font-weight:600;">
                ${t.title}
                <span style="font-size:0.72rem; color:#94a3b8; font-weight:400; margin-left:6px;">— ${t.desc}</span>
              </div>
            </div>
            <button class="btn btn-primary btn-sm" style="padding:3px 10px; font-size:0.72rem; flex-shrink:0;" onclick="jumpToUserTask('${t.caseId}', '${t.targetStage}')">
              조치 바로가기 ➔
            </button>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function jumpToUserTask(caseId, targetStage) {
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
}

function openNotificationModal() {
  const tasks = getUserPendingTasks(CURRENT_USER);
  const modal = document.getElementById('globalModal');
  const modalTitle = document.getElementById('modalTitle');
  const modalBody = document.getElementById('modalBody');

  modalTitle.innerHTML = `<i data-lucide="bell" style="width:18px;height:18px;color:#38bdf8;"></i> [${CURRENT_USER.name} ${CURRENT_USER.position}] 님의 8D 개인 알림 센터`;
  
  modalBody.innerHTML = `
    <div style="margin-bottom:14px; font-size:0.82rem; color:#cbd5e1; background:rgba(30,41,59,0.5); padding:10px 14px; border-radius:6px;">
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
          <div style="background:#0e172a; border:1px solid ${t.urgency === 'critical' ? '#ef4444' : '#3b82f6'}; border-radius:6px; padding:12px; display:flex; justify-content:space-between; align-items:center; gap:14px;">
            <div style="flex:1;">
              <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
                <span class="num-mono" style="font-weight:800; color:#60a5fa; font-size:0.88rem;">${t.caseId}</span>
                <span style="font-weight:700; color:#f8fafc; font-size:0.84rem;">고객사: ${t.customer}</span>
                <span class="badge-pill ${t.urgency === 'critical' ? 'badge-fail' : 'badge-warn'}">${t.stageCode}</span>
              </div>
              <div style="font-size:0.84rem; font-weight:700; color:#f8fafc; margin-bottom:2px;">
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

  modal.classList.add('active');
  if (window.lucide) lucide.createIcons();
}

function renderCurrentView() {
  const container = document.getElementById('mainContentContainer');
  if (!container) return;

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
    case 'cases-list':
      viewHtml = renderCasesListView();
      break;
    case 'stage':
      viewHtml = renderStageWorkspaceView(c, appData.activeStage);
      break;
    case 'evidence-hub':
      viewHtml = renderEvidenceHubView(c);
      break;
    case 'actions-hub':
      viewHtml = renderActionsHubView(c);
      break;
    case 'reports-hub':
      viewHtml = renderReportsHubView(c);
      break;
    default:
      viewHtml = renderDashboardView();
      break;
  }

  container.innerHTML = bannerHtml + viewHtml;
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

  if (window.lucide) {
    lucide.createIcons();
  }
}

// App Initialization - Safe DOMContentLoaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
"""

with open(os.path.join(base_dir, 'js', 'app.js'), 'w', encoding='utf-8') as f:
    f.write(new_app_js)
print('Updated js/app.js with User Task Banner and Notification Modal!')
