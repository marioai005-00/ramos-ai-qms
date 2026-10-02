import codecs

with open(r'g:\내 드라이브\AI_Place\Work\11_AI_Customer_Nonconformance_8D_System\index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Let's fix the entire modal org tree section cleanly with pristine UTF-8 Korean strings
modal_code_clean = """    /* ========================================================================= */
    /* CFT ORG TREE MODAL & TEAM MANAGEMENT (62-PERSON TREE ENGINE)              */
    /* ========================================================================= */
    let modalOrgOpenNodes = { 'root': true, 'ceo': true, 'coo': true, 'mkt_div': true, 'rnd_div': true, 'mgmt_div': true };

    function openOrgTreeModalForCFT() {
      const c = getActiveCase();
      const modal = document.getElementById('globalModal');
      const container = document.getElementById('modalContainer');
      if (!modal || !container) return;

      container.style.width = '780px';
      container.style.maxWidth = '95vw';
      container.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; border-bottom:1px solid var(--border); padding-bottom:12px;">
          <div>
            <div style="font-size:1.15rem; font-weight:800; color:#60a5fa; display:flex; align-items:center; gap:8px;">
              <i data-lucide="network" style="color:#38bdf8; width:20px; height:20px;"></i> RAmos 전사 조직도 (총 62명) — D1 CFT 팀원 배속
            </div>
            <div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">
              Active Case: <b class="num-mono" style="color:#f8fafc;">${c.id}</b> | 조직도에서 배속할 팀원을 선택하십시오.
            </div>
          </div>
          <button type="button" class="btn btn-secondary btn-sm" onclick="document.getElementById('globalModal').style.display='none'">
            <i data-lucide="x" style="width:14px; height:14px;"></i> 닫기
          </button>
        </div>

        <!-- Role Selector & Search Bar -->
        <div style="background:rgba(15,23,42,0.8); border:1px solid var(--border); border-radius:var(--radius-sm); padding:12px 14px; margin-bottom:12px;">
          <div class="grid-2" style="gap:12px;">
            <div>
              <label class="form-label" style="font-weight:700; color:#cbd5e1; margin-bottom:4px;">
                <span>배속할 CFT Role (역할 지정)</span>
              </label>
              <select id="modalCftRoleSelect" class="form-control">
                <option value="Process Engineer (공정기술)" selected>Process Engineer (공정/제조기술)</option>
                <option value="Development Engineer (개발/설계)">Development Engineer (개발/설계엔지니어)</option>
                <option value="Quality Engineer (고객품질/CQE)">Quality Engineer (고객품질/CQE)</option>
                <option value="FA / Reliability Engineer (분석/신뢰성)">FA / Reliability Engineer (분석/신뢰성)</option>
                <option value="Firmware Engineer (FW 개발)">Firmware Engineer (FW 개발)</option>
                <option value="Supply Chain / Logistics (물류/자재)">Supply Chain / Logistics (물류/자재)</option>
                <option value="CFT Member (일반 팀원)">CFT Member (일반 팀원)</option>
              </select>
            </div>
            <div>
              <label class="form-label" style="font-weight:700; color:#cbd5e1; margin-bottom:4px;">
                <span>조직도 실시간 검색 (이름/부서/직급/이메일)</span>
              </label>
              <div style="position:relative;">
                <i data-lucide="search" style="position:absolute; left:10px; top:10px; width:14px; height:14px; color:var(--text-muted);"></i>
                <input type="text" id="modalOrgSearchInput" class="form-control" placeholder="예: 최현우, 개발, Pro, sjkim" style="padding-left:32px;" oninput="renderModalOrgTree(this.value)">
              </div>
            </div>
          </div>
        </div>

        <!-- Modal Org Tree Container -->
        <div id="modalOrgTreeContainer" style="max-height:480px; overflow-y:auto; padding:12px; background:#070d19; border:1px solid var(--border); border-radius:var(--radius-sm);">
        </div>
      `;

      modal.style.display = 'flex';
      renderModalOrgTree();
      lucide.createIcons();
    }

    function toggleModalOrgNode(nodeId, e) {
      if (e) e.stopPropagation();
      modalOrgOpenNodes[nodeId] = !modalOrgOpenNodes[nodeId];
      renderModalOrgTree(document.getElementById('modalOrgSearchInput')?.value || '');
    }

    function expandAllModalOrgTree(expand) {
      function traverse(nodes) {
        nodes.forEach(n => {
          modalOrgOpenNodes[n.id] = expand;
          if (n.children) traverse(n.children);
        });
      }
      modalOrgOpenNodes['root'] = expand;
      traverse(RAMOS_TREE);
      renderModalOrgTree(document.getElementById('modalOrgSearchInput')?.value || '');
    }

    function renderModalOrgTree(searchQuery = '') {
      const container = document.getElementById('modalOrgTreeContainer');
      if (!container) return;
      const q = searchQuery.toLowerCase().trim();

      let html = `
        <div class="org-tree-controls" style="margin-bottom:10px; display:flex; justify-content:space-between; align-items:center;">
          <span style="font-weight:700; color:#94a3b8; font-size:0.75rem;">조직 계통도 (총 62명)</span>
          <div style="display:flex; gap:6px;">
            <button type="button" class="btn btn-secondary btn-sm" style="padding:2px 8px; font-size:0.68rem;" onclick="expandAllModalOrgTree(true)">+ 전체 펼치기</button>
            <button type="button" class="btn btn-secondary btn-sm" style="padding:2px 8px; font-size:0.68rem;" onclick="expandAllModalOrgTree(false)">- 전체 접기</button>
          </div>
        </div>
      `;

      function renderModalNode(node, isRoot = false) {
        const isOpen = q ? true : !!modalOrgOpenNodes[node.id];
        const totalMembers = countTotalMembersInNode(node);
        const hasChildren = node.children && node.children.length > 0;
        const hasMembers = node.members && node.members.length > 0;

        // Filter members if query
        let filteredMembers = node.members || [];
        if (q) {
          filteredMembers = filteredMembers.filter(m => 
            m.name.toLowerCase().includes(q) || 
            (m.position && m.position.toLowerCase().includes(q)) || 
            (m.dept && m.dept.toLowerCase().includes(q)) ||
            (m.email && m.email.toLowerCase().includes(q))
          );
        }

        let childrenHtml = '';
        if (hasChildren) {
          childrenHtml = node.children.map(c => renderModalNode(c, false)).join('');
        }

        // If searching and nothing matches in this branch, hide
        if (q && filteredMembers.length === 0 && !childrenHtml.trim()) {
          return '';
        }

        return `
          <div class="folder-node" style="margin-bottom:4px;">
            <div class="folder-header ${isOpen ? 'open' : ''}" onclick="toggleModalOrgNode('${node.id}', event)" style="padding:6px 10px; border-radius:4px; display:flex; align-items:center; gap:8px; cursor:pointer; background:rgba(30,41,59,0.35);">
              <span class="folder-toggle-icon" style="font-family:monospace; font-weight:800; font-size:0.75rem; color:#60a5fa;">[${isOpen ? '-' : '+'}]</span>
              <i data-lucide="${isOpen ? 'folder-open' : 'folder'}" style="width:15px; height:15px; color:#f59e0b;"></i>
              <span class="folder-name" style="font-weight:700; font-size:0.8rem; color:#f8fafc;">${node.name}</span>
              <span class="folder-count-badge" style="margin-left:auto; font-size:0.65rem; background:#1e293b; color:#93c5fd; padding:1px 6px; border-radius:10px;">${totalMembers}명</span>
            </div>

            ${isOpen ? `
              <div class="folder-children" style="padding-left:16px; border-left:1px dashed rgba(59,130,246,0.25); margin-left:8px; margin-top:4px;">
                <!-- Members in this node -->
                ${filteredMembers.length > 0 ? `
                  <div class="folder-members-list" style="display:flex; flex-direction:column; gap:4px; margin-bottom:6px;">
                    ${filteredMembers.map(m => `
                      <div class="tree-member-card" style="display:flex; align-items:center; justify-content:space-between; padding:6px 10px; background:#0e172a; border:1px solid rgba(255,255,255,0.06); border-radius:5px;">
                        <div style="display:flex; align-items:center; gap:8px;">
                          <div style="width:26px; height:26px; border-radius:50%; background:linear-gradient(135deg,#2563eb,#7c3aed); display:flex; align-items:center; justify-content:center; font-weight:700; font-size:0.7rem; color:#fff;">
                            ${m.name.slice(0, 2)}
                          </div>
                          <div>
                            <div style="display:flex; align-items:center; gap:6px;">
                              <span style="font-size:0.8rem; font-weight:700; color:#f8fafc;">${m.name}</span>
                              <span style="font-size:0.68rem; color:#94a3b8;">${m.position || 'Pro'}</span>
                              ${m.isMe ? `<span class="badge-me" style="font-size:0.6rem; background:#2563eb; color:#fff; padding:0 4px; border-radius:3px;">나</span>` : ''}
                              <span style="font-size:0.62rem; color:#34d399;">● Online</span>
                            </div>
                            <div class="num-mono" style="font-size:0.65rem; color:#64748b;">${m.email}</div>
                          </div>
                        </div>
                        <button type="button" class="btn btn-primary btn-sm" style="padding:3px 10px; font-size:0.72rem;" onclick="assignModalMemberToCFT('${m.name}', '${m.position || 'Pro'}', '${node.name}', '${m.email}')">
                          <i data-lucide="user-plus" style="width:11px; height:11px;"></i> 배속 추가
                        </button>
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

      // Root
      const rootNode = {
        id: 'root',
        name: '라모스테크놀러지',
        children: RAMOS_TREE,
        members: []
      };

      html += `<div class="folder-tree-root">${renderModalNode(rootNode, true)}</div>`;
      container.innerHTML = html;
      lucide.createIcons();
    }

    function assignModalMemberToCFT(name, position, dept, email) {
      const c = getActiveCase();
      const roleSelect = document.getElementById('modalCftRoleSelect');
      const role = roleSelect ? roleSelect.value : 'Process Engineer (공정기술)';
      const fullNameWithPos = `${name} ${position}`;

      const existing = c.team.find(m => m.contact === email || m.name.includes(name));
      if (existing) {
        alert(`[${fullNameWithPos}] 님은 이미 CFT에 배속되어 있습니다. (${existing.role})`);
        return;
      }

      c.team.push({
        role: role,
        name: fullNameWithPos,
        dept: dept,
        contact: email,
        status: 'Active'
      });

      saveAppData();
      document.getElementById('globalModal').style.display = 'none';
      renderCurrentView();
      alert(`🎉 [${fullNameWithPos}] 님이 D1 CFT [${role}]으로 성공적으로 배속되었습니다!`);
    }

    function removeCFTMember(idx) {
      const c = getActiveCase();
      if (confirm(`[${c.team[idx].name}] 님을 D1 CFT에서 제외하시겠습니까?`)) {
        c.team.splice(idx, 1);
        saveAppData();
        renderCurrentView();
      }
    }
"""

s_marker = '    /* ========================================================================= */\n    /* CFT ORG TREE MODAL & TEAM MANAGEMENT'
e_marker = '    function renderCasesListView() {'

s_idx = content.find(s_marker)
e_idx = content.find(e_marker)

if s_idx != -1 and e_idx != -1:
    content = content[:s_idx] + modal_code_clean + '\n\n' + content[e_idx:]
    with open(r'g:\내 드라이브\AI_Place\Work\11_AI_Customer_Nonconformance_8D_System\index.html', 'w', encoding='utf-8') as f:
        f.write(content)
    print('Clean UTF-8 modal code applied successfully!')
else:
    print('Error finding markers')
