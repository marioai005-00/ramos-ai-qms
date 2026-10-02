import os

base_dir = r'g:\내 드라이브\AI_Place\Work\11_AI_Customer_Nonconformance_8D_System'

# 1. Update js/data.js with bulletproof load/save
with open(os.path.join(base_dir, 'js', 'data.js'), 'r', encoding='utf-8') as f:
    data_content = f.read()

# Replace data loading block at bottom of data.js
old_data_tail = """    // Load or initialize Data
    let appData = {
      cases: JSON.parse(localStorage.getItem(STORAGE_KEY)) || INITIAL_CASES,
      activeCaseId: INITIAL_CASES[0].id,
      currentView: 'dashboard', // dashboard, new-case, cases-list, stage, evidence-hub, actions-hub, reports-hub
      activeStage: 'overview', // overview, D1, D2, D3, D4, D5, D6, D7, D8
      sidebarTab: 'menu' // menu, org
    };

    function saveAppData() {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
    }

    function getActiveCase() {
      return appData.cases.find(c => c.id === appData.activeCaseId) || appData.cases[0];
    }"""

new_data_tail = """    // Bulletproof Data State Management (Prevents any corrupt localStorage or blank screen)
    function loadStoredAppData() {
      const defaultState = {
        cases: INITIAL_CASES,
        activeCaseId: INITIAL_CASES[0]?.id || 'RAMOS-8D-20260901-01',
        currentView: 'dashboard',
        activeStage: 'overview',
        sidebarTab: 'menu'
      };

      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return defaultState;
        const parsed = JSON.parse(raw);

        // Case A: Parsed is legacy array of cases
        if (Array.isArray(parsed)) {
          return {
            ...defaultState,
            cases: parsed.length > 0 ? parsed : INITIAL_CASES
          };
        }

        // Case B: Parsed is appData object
        if (parsed && typeof parsed === 'object') {
          const validCases = (Array.isArray(parsed.cases) && parsed.cases.length > 0) ? parsed.cases : INITIAL_CASES;
          const validActiveId = validCases.some(c => c.id === parsed.activeCaseId) ? parsed.activeCaseId : validCases[0].id;
          return {
            cases: validCases,
            activeCaseId: validActiveId,
            currentView: parsed.currentView || 'dashboard',
            activeStage: parsed.activeStage || 'overview',
            sidebarTab: parsed.sidebarTab || 'menu'
          };
        }
      } catch (err) {
        console.warn('Recovered from corrupted localStorage state:', err);
      }
      return defaultState;
    }

    let appData = loadStoredAppData();

    function saveAppData() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
      } catch (e) {
        console.error('Failed to save to localStorage', e);
      }
    }

    function getActiveCase() {
      if (!appData || !Array.isArray(appData.cases) || appData.cases.length === 0) {
        appData.cases = INITIAL_CASES;
      }
      let found = appData.cases.find(c => c.id === appData.activeCaseId);
      if (!found) {
        found = appData.cases[0];
        appData.activeCaseId = found.id;
      }
      return found;
    }"""

if old_data_tail in data_content:
    data_content = data_content.replace(old_data_tail, new_data_tail, 1)
    with open(os.path.join(base_dir, 'js', 'data.js'), 'w', encoding='utf-8') as f:
        f.write(data_content)
    print('Updated js/data.js with bulletproof load/save logic!')
else:
    print('Could not find old_data_tail in data.js')

# 2. Update js/app.js with try-catch and resilient lifecycle
new_app_js = """/* ========================================================================= */
/* NAVIGATION & VIEW ROUTING CONTROLLER                                      */
/* ========================================================================= */
function initApp() {
  try {
    // 1. Ensure valid case selected
    const activeCase = getActiveCase();
    if (!activeCase) {
      appData = loadStoredAppData();
    }

    // 2. Render Header Selector & Active Case
    renderCaseSelector();

    // 3. Render Center Main View
    renderCurrentView();

    // 4. Render Sidebar Org Tree
    renderOrgTree();

    // 5. Initialize Lucide Icons
    if (window.lucide) {
      lucide.createIcons();
    }
  } catch (err) {
    console.error('Initialization error caught and recovered:', err);
    // Hard fallback: reset to defaults and render
    appData = {
      cases: INITIAL_CASES,
      activeCaseId: INITIAL_CASES[0].id,
      currentView: 'dashboard',
      activeStage: 'overview',
      sidebarTab: 'menu'
    };
    renderCaseSelector();
    renderCurrentView();
    renderOrgTree();
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

function renderCurrentView() {
  const container = document.getElementById('mainContentContainer');
  if (!container) return;

  const c = getActiveCase();

  switch (appData.currentView) {
    case 'dashboard':
      container.innerHTML = renderDashboardView();
      break;
    case 'new-case':
      container.innerHTML = renderNewCaseView();
      break;
    case 'cases-list':
      container.innerHTML = renderCasesListView();
      break;
    case 'stage':
      container.innerHTML = renderStageWorkspaceView(c, appData.activeStage);
      break;
    case 'evidence-hub':
      container.innerHTML = renderEvidenceHubView(c);
      break;
    case 'actions-hub':
      container.innerHTML = renderActionsHubView(c);
      break;
    case 'reports-hub':
      container.innerHTML = renderReportsHubView(c);
      break;
    default:
      container.innerHTML = renderDashboardView();
      break;
  }

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
print('Updated js/app.js with robust error recovery & safe DOMContentLoaded!')
