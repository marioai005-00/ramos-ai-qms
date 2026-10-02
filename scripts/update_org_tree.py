import json

with open(r'g:\내 드라이브\AI_Place\Work\11_AI_Customer_Nonconformance_8D_System\index.html', encoding='utf-8') as f:
    content = f.read()

# Replace CSS for Tree
css_replacement = '''    /* Folder Tree Styling (Matching Corporate Org Chart) */
    .org-search-box {
      margin-bottom: 10px;
    }

    .org-tree-controls {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
      padding-bottom: 8px;
      border-bottom: 1px solid var(--border-subtle);
      font-size: 0.72rem;
      color: var(--text-muted);
    }

    .folder-tree-root {
      font-size: 0.8rem;
    }

    .tree-node-item {
      margin-left: 10px;
      position: relative;
    }

    .tree-node-item.root-level {
      margin-left: 0;
    }

    .tree-row {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 5px 6px;
      border-radius: var(--radius-sm);
      cursor: pointer;
      color: #e2e8f0;
      transition: background 0.12s ease;
      user-select: none;
    }

    .tree-row:hover {
      background: rgba(59, 130, 246, 0.08);
      color: #93c5fd;
    }

    .tree-toggle-box {
      width: 14px;
      height: 14px;
      border: 1px solid #334155;
      background: #0d1424;
      color: #94a3b8;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.7rem;
      font-weight: 700;
      border-radius: 2px;
      line-height: 1;
      flex-shrink: 0;
    }

    .tree-toggle-box:hover {
      border-color: #60a5fa;
      color: #fff;
    }

    .tree-folder-icon {
      color: #f59e0b;
      width: 16px;
      height: 16px;
      flex-shrink: 0;
      fill: rgba(245, 158, 11, 0.2);
    }

    .tree-node-name {
      font-size: 0.8rem;
      font-weight: 600;
      color: #f1f5f9;
      flex: 1;
    }

    .tree-member-badge {
      font-size: 0.65rem;
      background: rgba(59, 130, 246, 0.15);
      color: #60a5fa;
      padding: 1px 5px;
      border-radius: 9999px;
      font-weight: 700;
    }

    .tree-children-container {
      margin-left: 7px;
      border-left: 1px dashed #24324d;
      padding-left: 6px;
      margin-top: 2px;
      margin-bottom: 4px;
    }

    .tree-members-container {
      margin-left: 14px;
      border-left: 1px solid rgba(59, 130, 246, 0.2);
      padding-left: 8px;
      margin-top: 4px;
      margin-bottom: 6px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .org-user-card {
      background: #0c1322;
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-sm);
      padding: 6px 8px;
      display: flex;
      align-items: center;
      gap: 8px;
      transition: all 0.12s ease;
    }

    .org-user-card:hover {
      background: rgba(59, 130, 246, 0.08);
      border-color: #3b82f6;
    }

    .org-user-card.is-me {
      background: rgba(59, 130, 246, 0.15);
      border: 1px solid #3b82f6;
      box-shadow: 0 0 10px rgba(59, 130, 246, 0.2);
    }

    .org-avatar {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: #1e293b;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.65rem;
      font-weight: 700;
      color: #cbd5e1;
      flex-shrink: 0;
    }

    .org-avatar.me {
      background: linear-gradient(135deg, #2563eb, #7c3aed);
      color: #fff;
    }

    .badge-me {
      background: #2563eb;
      color: #fff;
      font-size: 0.6rem;
      padding: 1px 4px;
      border-radius: 4px;
      font-weight: 800;
    }'''

start_css = '    /* Org Tree Styling */'
end_css = '    .menu-cat {'

s_idx = content.find(start_css)
e_idx = content.find(end_css)

if s_idx != -1 and e_idx != -1:
    content = content[:s_idx] + css_replacement + '\n\n' + content[e_idx:]
    print('Updated Tree CSS successfully!')

# Replace renderOrgTree JS logic
js_replacement = '''    /* ========================================================================= */
    /* SIDEBAR TAB SWITCHING & EXACT FOLDER ORG TREE RENDER                      */
    /* ========================================================================= */
    function switchSidebarTab(tabName) {
      appData.sidebarTab = tabName;
      document.getElementById('tabBtnMenu').className = `sidebar-tab-btn ${tabName === 'menu' ? 'active' : ''}`;
      document.getElementById('tabBtnOrg').className = `sidebar-tab-btn ${tabName === 'org' ? 'active' : ''}`;
      
      document.getElementById('sidebarMenuView').style.display = tabName === 'menu' ? 'block' : 'none';
      document.getElementById('sidebarOrgView').style.display = tabName === 'org' ? 'block' : 'none';

      if (tabName === 'org') {
        renderOrgTree();
      }
    }

    // Tree Node Open/Closed State Cache
    let orgOpenNodes = {
      'root': true,
      'ceo': true,
      'coo': true,
      'mfg_center': true,
      'goc': true,
      'strat_mkt': true,
      'sales_div': true,
      'rnd': true,
      'dram_div': true,
      'flash_div': true,
      'strat_mgmt': true
    };

    function toggleTreeNode(nodeId, e) {
      if (e) e.stopPropagation();
      orgOpenNodes[nodeId] = !orgOpenNodes[nodeId];
      renderOrgTree(document.getElementById('orgSearchInput')?.value || '');
    }

    function expandAllOrgTree(expand) {
      function traverse(nodes) {
        nodes.forEach(n => {
          orgOpenNodes[n.id] = expand;
          if (n.children) traverse(n.children);
        });
      }
      orgOpenNodes['root'] = expand;
      traverse(RAMOS_TREE);
      renderOrgTree(document.getElementById('orgSearchInput')?.value || '');
    }

    function countTotalMembersInNode(node) {
      let cnt = (node.members || []).length;
      if (node.children) {
        node.children.forEach(c => cnt += countTotalMembersInNode(c));
      }
      return cnt;
    }

    function renderOrgTree(searchQuery = '') {
      const container = document.getElementById('orgTreeContainer');
      const q = searchQuery.toLowerCase().trim();

      // Top controls
      let html = `
        <div class="org-tree-controls">
          <span style="font-weight:700; color:#94a3b8;">조직 계통도 (총 62명)</span>
          <div style="display:flex; gap:4px;">
            <button class="btn btn-secondary btn-sm" style="padding:1px 5px; font-size:0.62rem;" onclick="expandAllOrgTree(true)">+ 전체 펼치기</button>
            <button class="btn btn-secondary btn-sm" style="padding:1px 5px; font-size:0.62rem;" onclick="expandAllOrgTree(false)">- 전체 접기</button>
          </div>
        </div>
      `;

      function renderNode(node, isRoot = false) {
        const isOpen = q ? true : !!orgOpenNodes[node.id];
        const totalMembers = countTotalMembersInNode(node);
        const hasChildren = node.children && node.children.length > 0;
        const hasMembers = node.members && node.members.length > 0;

        // Filter check
        const matchesName = node.name.toLowerCase().includes(q);
        const filteredMembers = (node.members || []).filter(m => 
          !q || m.name.toLowerCase().includes(q) || (m.position && m.position.toLowerCase().includes(q)) || (m.email && m.email.toLowerCase().includes(q))
        );

        let childrenHtml = '';
        if (hasChildren) {
          childrenHtml = node.children.map(c => renderNode(c, false)).join('');
        }

        if (q && !matchesName && filteredMembers.length === 0 && !childrenHtml) {
          return '';
        }

        return `
          <div class="tree-node-item ${isRoot ? 'root-level' : ''}">
            <div class="tree-row" onclick="toggleTreeNode('${node.id}', event)">
              <div class="tree-toggle-box">
                ${(hasChildren || hasMembers) ? (isOpen ? '−' : '+') : '•'}
              </div>
              <i data-lucide="${isOpen ? 'folder-open' : 'folder'}" class="tree-folder-icon"></i>
              <span class="tree-node-name">${node.name}</span>
              <span class="tree-member-badge num-mono">${totalMembers}명</span>
            </div>

            ${isOpen ? `
              <div class="tree-children-container">
                <!-- Direct Node Members -->
                ${(q ? filteredMembers : (node.members || [])).length > 0 ? `
                  <div class="tree-members-container">
                    ${(q ? filteredMembers : node.members).map(m => `
                      <div class="org-user-card ${m.isMe ? 'is-me' : ''}">
                        <div class="org-avatar ${m.isMe ? 'me' : ''}">
                          ${m.name.length > 2 ? m.name.slice(-2) : m.name}
                        </div>
                        <div style="flex:1; min-width:0;">
                          <div style="display:flex; align-items:center; gap:5px;">
                            <span style="font-size:0.8rem; font-weight:700; color:#f8fafc;">${m.name}</span>
                            <span style="font-size:0.68rem; color:#94a3b8;">${m.position || 'Pro'}</span>
                            ${m.isMe ? `<span class="badge-me">나</span>` : ''}
                            <span style="margin-left:auto; font-size:0.62rem; color:#34d399;">● Online</span>
                          </div>
                          <div style="display:flex; justify-content:space-between; align-items:center; margin-top:3px;">
                            <span class="num-mono" style="font-size:0.65rem; color:#64748b;">${m.email}</span>
                            <button class="btn btn-secondary btn-sm" style="padding:1px 6px; font-size:0.65rem;" onclick="event.stopPropagation(); assignOrgMemberToCFT('${m.name}', '${m.position}', '${node.name}', '${m.email}')" title="현재 Case의 D1 CFT 팀에 배정">
                              <i data-lucide="user-plus" style="width:10px; height:10px; color:#38bdf8;"></i> CFT
                            </button>
                          </div>
                        </div>
                      </div>
                    `).join('')}
                  </div>
                ` : ''}

                <!-- Sub-folders -->
                ${childrenHtml}
              </div>
            ` : ''}
          </div>
        `;
      }

      // Root level: 회사구분 > 라모스테크놀러지
      const rootNode = {
        id: 'root',
        name: '라모스테크놀러지',
        children: RAMOS_TREE,
        members: []
      };

      html += `<div class="folder-tree-root">${renderNode(rootNode, true)}</div>`;
      container.innerHTML = html;
      lucide.createIcons();
    }'''

start_js = '    /* ========================================================================= */\n    /* SIDEBAR TAB SWITCHING & ORG TREE RENDER                                   */'
end_js = '    function filterOrgTree(val)'

s_jidx = content.find(start_js)
e_jidx = content.find(end_js)

if s_jidx != -1 and e_jidx != -1:
    content = content[:s_jidx] + js_replacement + '\n\n' + content[e_jidx:]
    print('Updated renderOrgTree JS successfully!')
else:
    print('JS marker error:', s_jidx, e_jidx)

with open(r'g:\내 드라이브\AI_Place\Work\11_AI_Customer_Nonconformance_8D_System\index.html', 'w', encoding='utf-8') as f:
    f.write(content)
print('All changes saved to index.html!')
