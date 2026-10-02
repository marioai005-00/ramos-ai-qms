with open(r'g:\내 드라이브\AI_Place\Work\11_AI_Customer_Nonconformance_8D_System\index.html', encoding='utf-8') as f:
    content = f.read()

# 1. Update D1 Stage workspace button and table in renderStageContent
old_d1_block = '''        case 'D1':
          return `
            <div class="card">
              <div class="card-header">
                <div class="card-title"><i data-lucide="users" style="color:#60a5fa; width:16px; height:16px;"></i> D1. Cross-Functional Team (CFT 지정)</div>
                <button class="btn btn-secondary btn-sm" onclick="addCFTMemberPrompt()"><i data-lucide="plus" style="width:12px;height:12px;"></i> 팀원 추가</button>
              </div>
              <p style="font-size:0.78rem; color:var(--text-secondary); margin-bottom:14px;">
                문제 해결을 주도할 Champion, Leader, FA, 공정엔지니어, 품질 리드를 명확한 책임과 함께 지정합니다.
              </p>
              <table class="custom-table">
                <thead>
                  <tr>
                    <th>Role</th>
                    <th>담당자</th>
                    <th>소속 부서</th>
                    <th>연락처 / Email</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  ${c.team.map(m => `
                    <tr>
                      <td style="font-weight:700; color:#60a5fa;">${m.role}</td>
                      <td style="font-weight:600;">${m.name}</td>
                      <td>${m.dept}</td>
                      <td class="num-mono" style="color:var(--text-secondary);">${m.contact}</td>
                      <td><span class="badge-pill badge-ok">${m.status}</span></td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          `;'''

new_d1_block = '''        case 'D1':
          return `
            <div class="card">
              <div class="card-header">
                <div class="card-title"><i data-lucide="users" style="color:#60a5fa; width:16px; height:16px;"></i> D1. Cross-Functional Team (CFT 지정)</div>
                <button class="btn btn-primary btn-sm" onclick="openOrgTreeModalForCFT()">
                  <i data-lucide="network" style="width:14px;height:14px;"></i> 조직도에서 팀원 추가
                </button>
              </div>
              <p style="font-size:0.78rem; color:var(--text-secondary); margin-bottom:14px;">
                문제 해결을 주도할 Champion, Leader, FA, 공정엔지니어, 품질 실무자를 전사 조직도에서 명확한 역할과 함께 배속합니다.
              </p>
              <table class="custom-table">
                <thead>
                  <tr>
                    <th style="width:24%;">Role</th>
                    <th style="width:20%;">담당자</th>
                    <th style="width:20%;">소속 부서</th>
                    <th style="width:22%;">연락처 / Email</th>
                    <th style="width:8%;">Status</th>
                    <th style="width:6%; text-align:center;">관리</th>
                  </tr>
                </thead>
                <tbody>
                  ${c.team.map((m, idx) => `
                    <tr>
                      <td style="font-weight:700; color:#60a5fa;">${m.role}</td>
                      <td style="font-weight:600; color:#f8fafc;">${m.name}</td>
                      <td>${m.dept}</td>
                      <td class="num-mono" style="color:var(--text-secondary);">${m.contact}</td>
                      <td><span class="badge-pill badge-ok">${m.status}</span></td>
                      <td style="text-align:center;">
                        ${idx >= 5 ? `
                          <button class="btn btn-secondary btn-sm" style="padding:2px 6px; color:#f87171;" onclick="removeCFTMember(${idx})" title="팀원 제외">
                            <i data-lucide="trash-2" style="width:12px;height:12px;"></i>
                          </button>
                        ` : `<span style="font-size:0.68rem; color:var(--text-muted);">고정</span>`}
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          `;'''

if old_d1_block in content:
    content = content.replace(old_d1_block, new_d1_block, 1)
    print('Updated D1 stage table successfully!')
else:
    print('Could not find old_d1_block!')

# 2. Implement openOrgTreeModalForCFT, filterOrgTreeForCFT, assignMemberFromModal, removeCFTMember
cft_modal_code = '''    /* ========================================================================= */
    /* CFT ORG TREE MODAL & TEAM MANAGEMENT                                     */
    /* ========================================================================= */
    let selectedCftRole = 'Process Engineer (공정기술)';

    function openOrgTreeModalForCFT() {
      const c = getActiveCase();
      const modal = document.getElementById('globalModal');
      const container = document.getElementById('modalContainer');
      if (!modal || !container) return;

      container.style.width = '840px';
      container.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; border-bottom:1px solid var(--border); padding-bottom:12px;">
          <div>
            <div style="font-size:1.15rem; font-weight:800; color:#60a5fa; display:flex; align-items:center; gap:8px;">
              <i data-lucide="network" style="color:#38bdf8; width:20px; height:20px;"></i> RAmos 전사 조직도 — D1 CFT 팀원 배속
            </div>
            <div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">
              Case: <b>${c.id}</b> | 조직도에서 팀원을 검색하고 부여할 Role을 지정하여 CFT에 즉시 추가합니다.
            </div>
          </div>
          <button class="btn btn-secondary btn-sm" onclick="document.getElementById('globalModal').style.display='none'">
            <i data-lucide="x" style="width:14px; height:14px;"></i> 닫기
          </button>
        </div>

        <!-- Role Selector & Search Bar -->
        <div style="background:rgba(15,23,42,0.8); border:1px solid var(--border); border-radius:var(--radius-sm); padding:14px; margin-bottom:14px;">
          <div class="grid-2" style="gap:12px; margin-bottom:10px;">
            <div>
              <label class="form-label" style="font-weight:700; color:#cbd5e1;">
                <span>배속할 Role (역할 지정)</span>
              </label>
              <select id="modalCftRoleSelect" class="form-control" onchange="selectedCftRole = this.value">
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
              <label class="form-label" style="font-weight:700; color:#cbd5e1;">
                <span>조직도 실시간 검색 (이름/부서/직급/이메일)</span>
              </label>
              <div style="position:relative;">
                <i data-lucide="search" style="position:absolute; left:10px; top:10px; width:14px; height:14px; color:var(--text-muted);"></i>
                <input type="text" id="modalOrgSearchInput" class="form-control" placeholder="예: 최현우, 개발, Pro, sjkim" style="padding-left:32px;" oninput="filterModalOrgTree(this.value)">
              </div>
            </div>
          </div>
        </div>

        <!-- Org Tree Display Area inside Modal -->
        <div id="modalOrgTreeContainer" style="max-height:460px; overflow-y:auto; padding:10px; background:#070d19; border:1px solid var(--border); border-radius:var(--radius-sm);">
          ${renderModalOrgTreeHTML(RAMOS_TREE)}
        </div>
      `;

      modal.style.display = 'flex';
      lucide.createIcons();
    }

    function renderModalOrgTreeHTML(nodes) {
      if (!nodes || nodes.length === 0) return '';
      return `
        <div style="display:flex; flex-direction:column; gap:8px;">
          ${nodes.map(node => renderModalOrgNodeHTML(node)).join('')}
        </div>
      `;
    }

    function renderModalOrgNodeHTML(node) {
      if (node.type === 'unit') {
        return `
          <div class="org-unit" style="margin-bottom:6px; border:1px solid rgba(59,130,246,0.15); border-radius:6px; background:rgba(15,23,42,0.6); overflow:hidden;">
            <div style="padding:8px 12px; background:rgba(30,41,59,0.5); font-weight:700; font-size:0.82rem; color:#93c5fd; display:flex; align-items:center; justify-content:space-between; cursor:pointer;" onclick="toggleModalUnit(this)">
              <div style="display:flex; align-items:center; gap:6px;">
                <i data-lucide="folder" style="width:14px; height:14px; color:#38bdf8;"></i>
                <span>${node.name}</span>
              </div>
              <span style="font-size:0.7rem; color:var(--text-muted);">▼</span>
            </div>
            <div class="unit-children" style="padding:8px 12px; display:flex; flex-direction:column; gap:6px;">
              ${node.children ? node.children.map(ch => renderModalOrgNodeHTML(ch)).join('') : ''}
            </div>
          </div>
        `;
      } else if (node.type === 'person') {
        return `
          <div class="modal-person-card" style="display:flex; align-items:center; justify-content:space-between; padding:8px 12px; background:#0e172a; border:1px solid rgba(255,255,255,0.06); border-radius:6px;" data-search="${node.name} ${node.title} ${node.dept} ${node.email}">
            <div style="display:flex; align-items:center; gap:10px;">
              <div style="width:30px; height:30px; border-radius:50%; background:linear-gradient(135deg,#3b82f6,#8b5cf6); display:flex; align-items:center; justify-content:center; font-weight:700; font-size:0.75rem; color:#fff; flex-shrink:0;">
                ${node.name.slice(0, 2)}
              </div>
              <div>
                <div style="font-size:0.82rem; font-weight:700; color:#f8fafc;">
                  ${node.name} <span style="font-size:0.72rem; color:#94a3b8; font-weight:500;">(${node.title})</span>
                </div>
                <div style="font-size:0.7rem; color:#60a5fa;">
                  ${node.dept} · <span class="num-mono" style="color:#94a3b8;">${node.email}</span>
                </div>
              </div>
            </div>
            <button class="btn btn-secondary btn-sm" style="padding:4px 10px; font-size:0.75rem; border-color:#3b82f6; color:#60a5fa;" onclick="assignMemberToActiveCFT('${node.name} ${node.title}', '${node.dept}', '${node.email}')">
              <i data-lucide="user-plus" style="width:12px; height:12px;"></i> 배속 추가
            </button>
          </div>
        `;
      }
      return '';
    }

    function toggleModalUnit(headerEl) {
      const childrenEl = headerEl.nextElementSibling;
      if (childrenEl) {
        childrenEl.style.display = childrenEl.style.display === 'none' ? 'flex' : 'none';
      }
    }

    function filterModalOrgTree(query) {
      const q = query.toLowerCase().trim();
      const cards = document.querySelectorAll('.modal-person-card');
      cards.forEach(card => {
        const text = (card.getAttribute('data-search') || '').toLowerCase();
        if (!q || text.includes(q)) {
          card.style.display = 'flex';
        } else {
          card.style.display = 'none';
        }
      });
    }

    function assignMemberToActiveCFT(nameWithTitle, dept, email) {
      const c = getActiveCase();
      const roleSelect = document.getElementById('modalCftRoleSelect');
      const role = roleSelect ? roleSelect.value : selectedCftRole;

      // Check if already in team
      const existing = c.team.find(m => m.contact === email || m.name === nameWithTitle);
      if (existing) {
        alert(`[${nameWithTitle}] 님은 이미 CFT에 배속되어 있습니다. (${existing.role})`);
        return;
      }

      c.team.push({
        role: role,
        name: nameWithTitle,
        dept: dept,
        contact: email,
        status: 'Active'
      });

      saveAppData();
      document.getElementById('globalModal').style.display = 'none';
      renderCurrentView();
      alert(`🎉 [${nameWithTitle}] 님이 D1 CFT [${role}]으로 성공적으로 배속되었습니다!`);
    }

    function removeCFTMember(idx) {
      const c = getActiveCase();
      if (confirm(`[${c.team[idx].name}] 님을 D1 CFT에서 제외하시겠습니까?`)) {
        c.team.splice(idx, 1);
        saveAppData();
        renderCurrentView();
      }
    }
'''

# Replace old addCFTMemberPrompt with new cft modal code
old_prompt_func = '''    function addCFTMemberPrompt() {
      const name = prompt('추가할 CFT 팀원 성명 및 직급을 입력하세요:', '최현우 선임');
      if (!name) return;
      const role = prompt('담당 Role을 입력하세요 (예: SMT 제조엔지니어):', 'SMT 공정엔지니어');
      const c = getActiveCase();
      c.team.push({
        role: role || 'CFT Member',
        name: name,
        dept: '제조기술팀',
        contact: 'hw.choi@ramos.com',
        status: 'Active'
      });
      saveAppData();
      renderCurrentView();
    }'''

if old_prompt_func in content:
    content = content.replace(old_prompt_func, cft_modal_code, 1)
    print('Replaced addCFTMemberPrompt with openOrgTreeModalForCFT!')
else:
    print('Could not find old_prompt_func, appending cft_modal_code...')
    content = content.replace('function renderCasesListView() {', cft_modal_code + '\n\n    function renderCasesListView() {', 1)

with open(r'g:\내 드라이브\AI_Place\Work\11_AI_Customer_Nonconformance_8D_System\index.html', 'w', encoding='utf-8') as f:
    f.write(content)
print('All changes saved to index.html successfully!')
