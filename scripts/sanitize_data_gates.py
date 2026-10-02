import os

base_dir = r'g:\내 드라이브\AI_Place\Work\11_AI_Customer_Nonconformance_8D_System'

with open(os.path.join(base_dir, 'js', 'data.js'), 'r', encoding='utf-8') as f:
    data_content = f.read()

old_load_block = """        // Case B: Parsed is appData object
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
        }"""

new_load_block = """        // Case B: Parsed is appData object
        if (parsed && typeof parsed === 'object') {
          let validCases = (Array.isArray(parsed.cases) && parsed.cases.length > 0) ? parsed.cases : INITIAL_CASES;
          
          // Strictly sanitize all gates across all cases to remove customer sign-off
          validCases.forEach(c => {
            if (c.gates) {
              ['gate3D', 'gate5D', 'gate8D'].forEach(gk => {
                if (c.gates[gk] && Array.isArray(c.gates[gk].approvers)) {
                  c.gates[gk].approvers = c.gates[gk].approvers.filter(a => !a.role.includes('고객사')).slice(0, 4);
                }
              });
            }
          });

          const validActiveId = validCases.some(c => c.id === parsed.activeCaseId) ? parsed.activeCaseId : validCases[0].id;
          return {
            cases: validCases,
            activeCaseId: validActiveId,
            currentView: parsed.currentView || 'dashboard',
            activeStage: parsed.activeStage || 'overview',
            sidebarTab: parsed.sidebarTab || 'menu'
          };
        }"""

if old_load_block in data_content:
    data_content = data_content.replace(old_load_block, new_load_block, 1)
    with open(os.path.join(base_dir, 'js', 'data.js'), 'w', encoding='utf-8') as f:
        f.write(data_content)
    print('Updated js/data.js to sanitize gates upon loading!')
else:
    print('Could not find old_load_block in data.js')
