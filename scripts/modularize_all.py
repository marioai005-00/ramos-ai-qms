import os
import re

base_dir = r'g:\내 드라이브\AI_Place\Work\11_AI_Customer_Nonconformance_8D_System'
os.makedirs(os.path.join(base_dir, 'css'), exist_ok=True)
os.makedirs(os.path.join(base_dir, 'js'), exist_ok=True)
os.makedirs(os.path.join(base_dir, 'js', 'views'), exist_ok=True)

with open(os.path.join(base_dir, 'index.html'), 'r', encoding='utf-8') as f:
    full_html = f.read()

# 1. Extract CSS
style_match = re.search(r'<style>(.*?)</style>', full_html, re.DOTALL)
if style_match:
    css_content = style_match.group(1).strip()
    with open(os.path.join(base_dir, 'css', 'styles.css'), 'w', encoding='utf-8') as f:
        f.write(css_content)
    print('Created css/styles.css')

# 2. Extract Script content
script_match = re.search(r'<script>(.*?)</script>\s*</body>', full_html, re.DOTALL)
if not script_match:
    print('Could not find script block!')
    exit(1)

script_text = script_match.group(1).strip()

# Markers in script:
# 1) DATA: from start to '/* ========================================================================= */\n    /* SIDEBAR TAB SWITCHING'
# 2) ORG_TREE: from '/* SIDEBAR TAB SWITCHING' to '/* ========================================================================= */\n    /* NAVIGATION & VIEW ROUTING'
# 3) APP / NAVIGATION: from '/* NAVIGATION & VIEW ROUTING' to '/* ========================================================================= */\n    /* VIEW 1: DASHBOARD'
# 4) DASHBOARD: from '/* VIEW 1: DASHBOARD' to '/* ========================================================================= */\n    /* VIEW 2: STEP 01'
# 5) INTAKE: from '/* VIEW 2: STEP 01' to '/* ========================================================================= */\n    /* VIEW 3: 8D WORKSPACE'
# 6) WORKSPACE: from '/* VIEW 3: 8D WORKSPACE' to '/* ========================================================================= */\n    /* VIEW 4: EVIDENCE'
# 7) EVIDENCE: from '/* VIEW 4: EVIDENCE' to '/* ========================================================================= */\n    /* VIEW 5: INTEGRATED'
# 8) ACTIONS: from '/* VIEW 5: INTEGRATED' to '/* ========================================================================= */\n    /* VIEW 6: OFFICIAL'
# 9) REPORTS: from '/* VIEW 6: OFFICIAL' to '/* ========================================================================= */\n    /* CFT ORG TREE MODAL'
# 10) CFT MODAL & INITIALIZATION: from '/* CFT ORG TREE MODAL' to end

def get_section(start_str, end_str=None):
    s_idx = script_text.find(start_str)
    if s_idx == -1:
        print(f'Warning: start_str not found: {start_str}')
        return ''
    if end_str:
        e_idx = script_text.find(end_str, s_idx)
        if e_idx == -1:
            print(f'Warning: end_str not found: {end_str}')
            return script_text[s_idx:]
        return script_text[s_idx:e_idx]
    return script_text[s_idx:]

data_sec = script_text[:script_text.find('/* ========================================================================= */\n    /* SIDEBAR TAB SWITCHING')]
# Add appData state helper to data.js
data_js = data_sec + """
    let appData = {
      cases: INITIAL_CASES,
      activeCaseId: 'RAMOS-8D-20260901-01',
      currentView: 'dashboard', // dashboard, new-case, cases-list, stage, evidence-hub, actions-hub, reports-hub
      activeStage: 'overview' // overview, D1, D2, D3, D4, D5, D6, D7, D8
    };

    function loadAppData() {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        try {
          appData = JSON.parse(saved);
        } catch (e) {
          console.error('Data corrupted, using defaults', e);
        }
      }
    }

    function saveAppData() {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
    }

    function getActiveCase() {
      return appData.cases.find(c => c.id === appData.activeCaseId) || appData.cases[0];
    }
"""

with open(os.path.join(base_dir, 'js', 'data.js'), 'w', encoding='utf-8') as f:
    f.write(data_js.strip())
print('Created js/data.js')

# ORG_TREE
org_sidebar_sec = get_section('/* SIDEBAR TAB SWITCHING', '/* ========================================================================= */\n    /* NAVIGATION & VIEW ROUTING')
cft_modal_sec = get_section('/* CFT ORG TREE MODAL & TEAM MANAGEMENT', '// App Initialization')
org_tree_js = org_sidebar_sec + '\n\n' + cft_modal_sec
with open(os.path.join(base_dir, 'js', 'org_tree.js'), 'w', encoding='utf-8') as f:
    f.write(org_tree_js.strip())
print('Created js/org_tree.js')

# DASHBOARD
dashboard_sec = get_section('/* VIEW 1: DASHBOARD', '/* ========================================================================= */\n    /* VIEW 2: STEP 01')
with open(os.path.join(base_dir, 'js', 'views', 'dashboard.js'), 'w', encoding='utf-8') as f:
    f.write(dashboard_sec.strip())
print('Created js/views/dashboard.js')

# INTAKE
intake_sec = get_section('/* VIEW 2: STEP 01', '/* ========================================================================= */\n    /* VIEW 3: 8D WORKSPACE')
with open(os.path.join(base_dir, 'js', 'views', 'intake.js'), 'w', encoding='utf-8') as f:
    f.write(intake_sec.strip())
print('Created js/views/intake.js')

# WORKSPACE
workspace_sec = get_section('/* VIEW 3: 8D WORKSPACE', '/* ========================================================================= */\n    /* VIEW 4: EVIDENCE')
with open(os.path.join(base_dir, 'js', 'views', 'workspace.js'), 'w', encoding='utf-8') as f:
    f.write(workspace_sec.strip())
print('Created js/views/workspace.js')

# EVIDENCE
evidence_sec = get_section('/* VIEW 4: EVIDENCE', '/* ========================================================================= */\n    /* VIEW 5: INTEGRATED')
with open(os.path.join(base_dir, 'js', 'views', 'evidence.js'), 'w', encoding='utf-8') as f:
    f.write(evidence_sec.strip())
print('Created js/views/evidence.js')

# ACTIONS
actions_sec = get_section('/* VIEW 5: INTEGRATED', '/* ========================================================================= */\n    /* VIEW 6: OFFICIAL')
with open(os.path.join(base_dir, 'js', 'views', 'actions.js'), 'w', encoding='utf-8') as f:
    f.write(actions_sec.strip())
print('Created js/views/actions.js')

# REPORTS
reports_sec = get_section('/* VIEW 6: OFFICIAL', '/* ========================================================================= */\n    /* CASES LIST VIEW')
cases_list_sec = get_section('/* CASES LIST VIEW', '/* ========================================================================= */\n    /* CFT ORG TREE')
reports_js = reports_sec + '\n\n' + cases_list_sec
with open(os.path.join(base_dir, 'js', 'views', 'reports.js'), 'w', encoding='utf-8') as f:
    f.write(reports_js.strip())
print('Created js/views/reports.js')

# APP.JS
nav_sec = get_section('/* NAVIGATION & VIEW ROUTING', '/* ========================================================================= */\n    /* VIEW 1: DASHBOARD')
app_init_sec = get_section('// App Initialization')
app_js = nav_sec + '\n\n' + app_init_sec
with open(os.path.join(base_dir, 'js', 'app.js'), 'w', encoding='utf-8') as f:
    f.write(app_js.strip())
print('Created js/app.js')

# HTML Skeleton
body_start = full_html.find('</style>') + 8
body_end = full_html.find('<script>')
body_html = full_html[body_start:body_end].strip()

new_index_html = f"""<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>RAMOS AI-Based 8D Quality Problem Solving Platform</title>

  <!-- Lucide Icons -->
  <script src="https://unpkg.com/lucide@latest"></script>
  <!-- Chart.js for Visual Watchtowers -->
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>

  <!-- Modular Portal Stylesheet -->
  <link rel="stylesheet" href="css/styles.css">
</head>
{body_html}

  <!-- Modular JavaScript Architecture -->
  <script src="js/data.js"></script>
  <script src="js/org_tree.js"></script>
  <script src="js/views/dashboard.js"></script>
  <script src="js/views/intake.js"></script>
  <script src="js/views/workspace.js"></script>
  <script src="js/views/evidence.js"></script>
  <script src="js/views/actions.js"></script>
  <script src="js/views/reports.js"></script>
  <script src="js/app.js"></script>
</body>
</html>
"""

with open(os.path.join(base_dir, 'index.html'), 'w', encoding='utf-8') as f:
    f.write(new_index_html)
print('Successfully generated new modular index.html!')
