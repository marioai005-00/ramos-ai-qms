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


    /* ========================================================================= */
    /* RAMOS ORG SKILLS & R&R MANAGEMENT (Excel & Web UI Dual Mode)             */
    /* ========================================================================= */
    const DEFAULT_ORG_SKILLS = {
      'sahwang@ramostek.com': { jobDesc: '전사 품질 총괄, 8D Champion, 고객 공식 승인', products: '공통 (전제품)', skills: '품질경영, IATF16949, 고객감사' },
      'sjkim@ramostek.com': { jobDesc: '8D 품질 실무 간사, 단계별 Evidence 검증', products: 'eMMC, SSD, DRAM', skills: '품질실무, 25개 품질도구, 원인검증' },
      'shnam1228@ramostek.com': { jobDesc: '전략소싱팀 LGE DTV eMMC 영업 주관, 고객사 소통, 공급 계약', products: 'LGE DTV eMMC 5.1 (BGA153)', skills: 'LGE DTV 영업 대응, 납기/단가 조율, 계약 관리' },
      'lhyduddlgk@ramostek.com': { jobDesc: '전략소싱팀 LGE DTV eMMC CS 주관, 부적합 클레임 1차 접수 및 소통', products: 'LGE DTV eMMC 5.1 (BGA153)', skills: 'LGE DTV CS 대응, 초동 접수, 부적합 소통, 클레임 채널' },
      'hskim@ramostek.com': { jobDesc: 'Flash 개발 총괄, 8D Leader, 회로/설계 분석', products: 'eMMC, UFS, SSD', skills: 'Flash 아키텍처, 펌웨어, 설계검토' },
      'jhpark@ramostek.com': { jobDesc: 'Physical FA / eMMC 불량 분석 총괄, 시각 증거 검증', products: 'LGE DTV eMMC 5.1', skills: 'SEM 단면분석, Decap, Inked NAND Die 셀 마진 분석, EDS Inking 맵 대조' },
      'shk@ramostek.com': { jobDesc: 'LGE 전담 영업 및 고객 부적합 1차 소통', products: 'DTV eMMC, Flash', skills: '고객사 CS, 클레임 접수, 납기조율' },
      'anasta@ramostek.com': { jobDesc: '삼성전자 전담 영업 및 서버 SSD 고객 대응', products: 'PCIe SSD, Enterprise', skills: '고객사 CS, SSD 스펙 조율' },
      'jinyi711@ramostek.com': { jobDesc: 'SK하이닉스 전담 영업 및 DRAM 고객 대응', products: 'DDR4, DDR5 SODIMM', skills: '고객사 CS, 품질 통보 접수' },
      'chpark@ramostek.com': { jobDesc: 'DRAM 개발 총괄, 8D Leader', products: 'DDR4, DDR5, LPDDR', skills: 'DRAM 아키텍처, 타이밍 분석' },
      'satiou@ramostek.com': { jobDesc: 'DRAM 불량 분석 및 X-Ray Void 검사', products: 'DDR4, BGA PKG', skills: 'X-Ray 검사, Void율 분석, Ball Grid' },
      'eunsan.lee@ramostek.com': { jobDesc: '제조 총괄, 라인 통제, 완제품 창고(RAK4/5) 봉쇄', products: '전제품', skills: '라인스탑, WIP 봉쇄, ERP 재고관리' }
    };

    function getOrgMemberSkills(email) {
      appData.orgSkills = appData.orgSkills || {};
      return appData.orgSkills[email] || DEFAULT_ORG_SKILLS[email] || { jobDesc: '', products: '', skills: '' };
    }

    function saveOrgMemberSkills(email, data) {
      appData.orgSkills = appData.orgSkills || {};
      appData.orgSkills[email] = data;
      saveAppData();
      renderOrgTree();
      alert('임직원 담당 업무 및 전문 스킬 정보가 저장되었습니다.');
    }

    function openOrgMemberSkillModal(email) {
      const member = findOrgMemberByEmail(email);
      if (!member) return;
      const skills = getOrgMemberSkills(email);

      const modal = document.getElementById('globalModal');
      const container = document.getElementById('modalContainer');
      if (!modal || !container) return;

      container.style.width = '640px';
      container.style.maxWidth = '92vw';
      container.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:14px; border-bottom:1px solid var(--border); padding-bottom:12px;">
          <div>
            <div style="font-size:1.1rem; font-weight:800; color:var(--text-primary); display:flex; align-items:center; gap:8px;">
              <span style="display:inline-block; width:10px; height:10px; border-radius:50%; background:#38bdf8;"></span>
              ${member.name} ${member.position}
              <span style="font-size:0.75rem; color:#60a5fa; font-weight:600; background:rgba(56,189,248,0.12); padding:2px 7px; border-radius:4px;">${member.dept}</span>
            </div>
            <div style="font-size:0.72rem; color:var(--text-muted); margin-top:3px;" class="num-mono">${member.email}</div>
          </div>
          <button type="button" class="btn btn-secondary btn-sm" onclick="document.getElementById('globalModal').style.display='none'" style="padding:3px 8px;">✕ 닫기</button>
        </div>

        <form id="orgSkillEditForm" onsubmit="event.preventDefault(); handleSaveOrgSkill('${member.email}')">
          <div style="display:flex; flex-direction:column; gap:14px;">
            <div class="form-group">
              <label class="form-label" style="display:flex; justify-content:space-between;">
                <span>📋 담당 업무 (R&R)</span>
                <small style="color:#94a3b8; font-size:0.68rem;">주요 R&R 및 현업 역할</small>
              </label>
              <textarea id="editOrgJobDesc" class="form-control" rows="2" placeholder="예: 전략소싱팀 LGE eMMC 영업 담당, 고객사 소통">${skills.jobDesc || ''}</textarea>
            </div>

            <div class="form-group">
              <label class="form-label" style="display:flex; justify-content:space-between;">
                <span>🎯 주력 제품군 (Product Domain)</span>
                <small style="color:#94a3b8; font-size:0.68rem;">다루는 메모리/부품</small>
              </label>
              <input type="text" id="editOrgProducts" class="form-control" value="${skills.products || ''}" placeholder="예: eMMC, UFS, PCIe SSD, DDR4, BGA Package">
            </div>

            <div class="form-group">
              <label class="form-label" style="display:flex; justify-content:space-between;">
                <span>🔬 핵심 전문 역량 / 스킬셋 (쉼표로 구분)</span>
                <small style="color:#94a3b8; font-size:0.68rem;">불량 분석·영업·공정 특화 기술</small>
              </label>
              <input type="text" id="editOrgSkills" class="form-control" value="${skills.skills || ''}" placeholder="예: LGE 고객 영업, 납기/단가 조율, 계약 관리">
            </div>

            <div style="background:rgba(59,130,246,0.08); border:1px dashed #3b82f6; border-radius:6px; padding:10px 12px; font-size:0.72rem; color:#93c5fd; display:flex; align-items:center; gap:8px;">
              <i data-lucide="sparkles" style="width:16px; height:16px; flex-shrink:0;"></i>
              <span>여기서 등록된 업무와 스킬은 D1 CFT 자동 편성 및 인원 배정 시 AI 에이전트의 핵심 판단 근거로 즉시 반영됩니다.</span>
            </div>
          </div>

          <div style="display:flex; justify-content:space-between; align-items:center; margin-top:18px; border-top:1px solid var(--border); padding-top:12px;">
            <button type="button" class="btn btn-secondary btn-sm" onclick="assignOrgMemberToCFT('${member.name}', '${member.position}', '${member.dept}', '${member.email}'); document.getElementById('globalModal').style.display='none';">
              + D1 CFT에 직접 배속
            </button>
            <div style="display:flex; gap:8px;">
              <button type="button" class="btn btn-secondary btn-sm" onclick="document.getElementById('globalModal').style.display='none'">취소</button>
              <button type="submit" class="btn btn-primary btn-sm">💾 업무 및 스킬 저장</button>
            </div>
          </div>
        </form>
      `;
      modal.style.display = 'flex';
      lucide.createIcons();
    }

    function handleSaveOrgSkill(email) {
      const jobDesc = document.getElementById('editOrgJobDesc')?.value.trim() || '';
      const products = document.getElementById('editOrgProducts')?.value.trim() || '';
      const skills = document.getElementById('editOrgSkills')?.value.trim() || '';
      saveOrgMemberSkills(email, { jobDesc, products, skills });
      document.getElementById('globalModal').style.display = 'none';
    }

    function downloadOrgSkillExcel() {
      if (typeof XLSX === 'undefined') {
        alert('엑셀 라이브러리(SheetJS)가 로드되지 않았습니다.');
        return;
      }

      const allMembers = [];
      function visit(nodes) {
        (nodes || []).forEach(node => {
          (node.members || []).forEach(m => {
            const sk = getOrgMemberSkills(m.email);
            allMembers.push({
              '부문': node.name.includes('부문') || node.name.includes('직속') ? node.name : '',
              '팀/센터': node.name,
              '직위': m.position || 'Pro',
              '이름': m.name,
              '이메일': m.email,
              '담당업무 (R&R)': sk.jobDesc || '',
              '주력제품군': sk.products || '',
              '핵심스킬 (쉼표구분)': sk.skills || ''
            });
          });
          if (node.children) visit(node.children);
        });
      }
      visit(RAMOS_TREE);

      const ws = XLSX.utils.json_to_sheet(allMembers);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'RAmos 조직도 및 업무스킬');
      XLSX.writeFile(wb, 'RAmos_조직도_업무스킬_실시간.xlsx');
    }

    function triggerOrgSkillExcelUpload() {
      const input = document.getElementById('orgExcelUploadInput');
      if (input) input.click();
    }

    function handleOrgSkillExcelUpload(e) {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      if (typeof XLSX === 'undefined') {
        alert('엑셀 라이브러리가 로드되지 않았습니다.');
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const data = new Uint8Array(event.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const sheetName = workbook.SheetNames[0];
          const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

          let updatedCount = 0;
          appData.orgSkills = appData.orgSkills || {};

          rows.forEach(r => {
            const email = r['이메일'] || r['email'] || r['Email'];
            if (!email) return;
            const jobDesc = r['담당업무 (R&R)'] || r['담당업무'] || r['R&R'] || '';
            const products = r['주력제품군'] || r['제품군'] || '';
            const skills = r['핵심스킬 (쉼표구분)'] || r['핵심스킬'] || r['스킬'] || '';

            if (jobDesc || products || skills) {
              appData.orgSkills[email] = { jobDesc, products, skills };
              updatedCount++;
            }
          });

          saveAppData();
          renderOrgTree();
          alert(`총 ${updatedCount}명의 담당 업무 및 전문 스킬이 엑셀로부터 성공적으로 반영되었습니다!`);
        } catch (err) {
          alert('엑셀 파일 파싱 오류: ' + err.message);
        }
      };
      reader.readAsArrayBuffer(file);
    }

    function renderOrgTree(searchQuery = '') {
      const container = document.getElementById('orgTreeContainer');
      const q = searchQuery.toLowerCase().trim();

      // Top controls with Dual Excel Sync & Member Edit
      let html = `
        <input type="file" id="orgExcelUploadInput" style="display:none;" accept=".xlsx,.xls" onchange="handleOrgSkillExcelUpload(event)">
        <div class="org-tree-controls" style="flex-direction:column; gap:6px; align-items:stretch; margin-bottom:10px;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="font-weight:700; color:var(--text-secondary); font-size:0.75rem;">조직 계통도 (총 62명)</span>
            <div style="display:flex; gap:4px;">
              <button class="btn btn-secondary btn-sm" style="padding:2px 6px; font-size:0.65rem;" onclick="expandAllOrgTree(true)">+ 전체 펼치기</button>
              <button class="btn btn-secondary btn-sm" style="padding:2px 6px; font-size:0.65rem;" onclick="expandAllOrgTree(false)">- 전체 접기</button>
            </div>
          </div>
          <div class="org-sync-strip" style="display:flex; gap:6px; background:var(--bg-card-subtle); border:1px solid var(--border); border-radius:5px; padding:4px 8px; justify-content:space-between; align-items:center;">
            <span style="font-size:0.68rem; color:var(--accent); font-weight:700;">📋 R&R / 스킬 동기화:</span>
            <div style="display:flex; gap:4px;">
              <button class="btn btn-secondary btn-sm" style="padding:2px 6px; font-size:0.62rem;" onclick="downloadOrgSkillExcel()" title="현재 등록된 업무/스킬 정보를 엑셀로 내보냅니다.">📥 엑셀 내보내기</button>
              <button class="btn btn-primary btn-sm" style="padding:2px 6px; font-size:0.62rem;" onclick="triggerOrgSkillExcelUpload()" title="작성한 엑셀 파일을 올려 일괄 등록합니다.">📤 엑셀 가져오기</button>
            </div>
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
                      <div class="org-user-card ${m.isMe ? 'is-me' : ''}" onclick="openOrgMemberSkillModal('${m.email}')" title="클릭하여 담당 업무(R&R) 및 전문 스킬을 편집합니다." style="cursor:pointer;">
                        <div class="org-avatar ${m.isMe ? 'me' : ''}">
                          ${m.name.length > 2 ? m.name.slice(-2) : m.name}
                        </div>
                        <div style="flex:1; min-width:0; display:flex; flex-direction:column; gap:2px;">
                          <div style="display:flex; justify-content:space-between; align-items:center;">
                            <div style="font-size:0.82rem; font-weight:700; color:var(--text-primary); line-height:1.2;">
                              ${m.name} ${m.isMe ? `<span class="badge-me" style="font-size:0.6rem; padding:0 4px; border-radius:3px;">나</span>` : ''}
                            </div>
                            <span class="org-skill-tag" style="font-size:0.6rem; color:#2563eb; border:1px solid rgba(37,99,235,0.3); border-radius:3px; padding:0 3px;">R&R 설정 ➔</span>
                          </div>
                          <div style="font-size:0.72rem; color:#94a3b8; line-height:1.2;">
                            ${m.position || 'Pro'}
                          </div>
                          <div class="num-mono" style="font-size:0.68rem; color:#64748b; line-height:1.2; word-break:break-all;">
                            ${m.email}
                          </div>
                          ${(() => {
                            const sk = getOrgMemberSkills(m.email);
                            if (!sk.jobDesc && !sk.skills) return '';
                            return `
                              <div style="margin-top:4px; padding-top:4px; border-top:1px dashed var(--border); display:flex; flex-direction:column; gap:2px;">
                                ${sk.jobDesc ? `<div style="font-size:0.66rem; color:var(--text-secondary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">📝 ${sk.jobDesc}</div>` : ''}
                                ${sk.skills ? `<div style="font-size:0.62rem; color:#38bdf8; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">🔬 ${sk.skills}</div>` : ''}
                              </div>
                            `;
                          })()}
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
    }

    function filterOrgTree(val) {
      renderOrgTree(val);
    }

    function assignOrgMemberToCFT(name, position, dept, email) {
      const c = getActiveCase();
      const existing = c.team.find(t => t.name.includes(name));
      if (existing) {
        alert(`[${name} ${position}] 님은 이미 본 Case의 CFT (${existing.role})에 등록되어 있습니다.`);
        return;
      }
      
      let suggestedRole = 'CFT Member';
      if (dept.includes('품질혁신')) suggestedRole = '8D Leader (품질혁신)';
      else if (dept.includes('FA') || dept.includes('개발') || dept.includes('DRAM') || dept.includes('Flash')) suggestedRole = 'Technical / FA Lead';
      else if (dept.includes('영업') || dept.includes('소싱') || dept.includes('CQE')) suggestedRole = 'Customer Quality';
      else if (dept.includes('제조') || dept.includes('기획') || dept.includes('운영')) suggestedRole = 'Process Engineer';
      else if (position.includes('임원') || position.includes('상무') || position.includes('전무') || position.includes('부사장') || position.includes('대표이사')) suggestedRole = '8D Champion';
      
      c.team.push({
        role: suggestedRole,
        name: `${name} ${position}`,
        dept: dept,
        contact: email,
        status: 'Active'
      });
      c.cftRecommendation = { ...(c.cftRecommendation || {}), humanConfirmed: false, status: 'Human Review Required' };
      saveAppData();
      alert(`[${name} ${position}] 님이 현재 Case [${c.id}]의 D1 CFT (${suggestedRole}) 팀원으로 배정되었습니다!`);
      if (appData.activeStage === 'D1' && appData.currentView === 'stage') {
        renderCurrentView();
      }
    }

    const CFT_ROLE_RULES = [
      { key: 'champion', role: '8D Champion', matches: role => role.includes('Champion') },
      { key: 'leader', role: '8D Leader (연구소/개발 주관)', matches: role => role.includes('Leader') && !role.includes('Quality Facilitator') },
      { key: 'fa', role: 'Technical / FA Lead', matches: role => role.includes('Technical') || role.includes('FA') },
      { key: 'process', role: 'Process Engineer (공정기술)', matches: role => role.includes('Process Engineer') || role.includes('공정기술') },
      { key: 'containment', role: 'Material Containment Lead', matches: role => role.includes('Containment') || role.includes('Logistics') || role.includes('물류') },
      { key: 'osat', role: '외주(조립처) 물량 관리', matches: role => role.includes('외주') || role.includes('조립처') || role.includes('OSAT') },
      { key: 'ctst', role: 'CTST 라인·재공 관리', matches: role => role.includes('CTST') || role.includes('Line Control') || role.includes('재공') },
      { key: 'facilitator', role: '8D Quality Facilitator / 실무', matches: role => role.includes('Quality Facilitator') || role.includes('품질 실무') }
    ];

    function findOrgMemberByEmail(email) {
      let found = null;
      function visit(nodes) {
        (nodes || []).forEach(node => {
          (node.members || []).forEach(member => {
            if (member.email === email) found = { ...member, dept: member.dept || node.name };
          });
          if (!found) visit(node.children || []);
        });
      }
      visit(RAMOS_TREE);
      return found;
    }

    function getAICFTRecommendations(c = getActiveCase()) {
      if (!c) return [];
      const context = `${c.product || ''} ${c.partNumber || ''} ${c.leadDepartment || c.triageApproval?.leadDepartment || ''}`.toLowerCase();
      const isDram = context.includes('dram');
      const isFlash = !isDram && (context.includes('flash') || context.includes('emmc') || context.includes('ssd') || context.includes('nand'));
      const isUrgent = c.severityLevel === 'Critical' || c.lineStop || c.safetyRisk;
      const family = isDram ? 'DRAM' : isFlash ? 'Flash/eMMC/SSD' : '공통 품질';
      const pick = (email, role, defaultReason, key) => {
        const member = findOrgMemberByEmail(email);
        if (!member) return null;
        const sk = typeof getOrgMemberSkills === 'function' ? getOrgMemberSkills(email) : null;
        let dynamicReason = defaultReason;
        if (sk && (sk.jobDesc || sk.skills)) {
          const detailParts = [];
          if (sk.jobDesc) detailParts.push(`R&R: ${sk.jobDesc}`);
          if (sk.skills) detailParts.push(`전문역량: ${sk.skills}`);
          dynamicReason = `${defaultReason} [${detailParts.join(' · ')}]`;
        }
        return { key, role, member, reason: dynamicReason };
      };

      return [
        pick('sahwang@ramostek.com', '8D Champion', `${c.severityLevel || '품질'} Case의 전사 품질 의사결정 및 고객 송부 최종 승인`, 'champion'),
        pick(isDram ? 'chpark@ramostek.com' : isFlash ? 'hskim@ramostek.com' : 'gh8229@ramostek.com', '8D Leader (연구소/개발 주관)', `${family} 제품군과 Triage 주관부서 기준 개발 책임자`, 'leader'),
        pick(isDram ? 'satiou@ramostek.com' : 'jhpark@ramostek.com', 'Technical / FA Lead', `${family} 불량 분석·물리/전기적 원인 규명 역량 기준`, 'fa'),
        pick(isDram ? 'hope@ramostek.com' : 'fog1007@ramostek.com', 'Process Engineer (공정기술)', `${family} 설계·공정 상관성 및 재현 조건 분석 기준`, 'process'),
        pick('eunsan.lee@ramostek.com', 'Material Containment Lead', 'Line Stop/Critical 위험에 따른 전사 SCM·물류·창고 총괄 지휘', 'containment'),
        pick('loveskr@ramostek.com', '외주(조립처) 물량 관리', '외주 가공처(조립처/패키징) 실시간 생산 작업 중단 및 외주 가공 물량 통제 실행', 'osat'),
        pick('nrjcm@ramostek.com', 'CTST 라인·재공 관리', 'CTST 라인 MES 재공(WIP) 및 RAK4/5 창고 완제품 출하 잠금(Hold) 실행', 'ctst'),
        pick('sjkim@ramostek.com', '8D Quality Facilitator / 실무', '품질 Triage 승인자 및 8D 절차·Evidence 완결성 관리', 'facilitator')
      ].filter(Boolean);
    }

    function getCurrentCFTMemberForRule(c, ruleKey) {
      const rule = CFT_ROLE_RULES.find(item => item.key === ruleKey);
      return rule ? (c.team || []).find(member => rule.matches(member.role || '')) : null;
    }

    function isProtectedCFTMember(member) {
      const role = member?.role || '';
      return role.includes('Customer Response Owner') || role.includes('Quality Facilitator');
    }

    function isCFTAssignmentComplete(c) {
      return CFT_ROLE_RULES.every(rule => (c.team || []).some(member => rule.matches(member.role || '')));
    }

    function renderAICFTRecommendationPanel(c) {
      const recommendations = getAICFTRecommendations(c);
      const confirmed = c.cftRecommendation?.humanConfirmed === true;
      return `
        <section class="cft-ai-panel">
          <div class="cft-ai-head">
            <div>
              <span class="cft-ai-kicker">AI CFT ROUTING · HUMAN CONFIRMATION REQUIRED</span>
              <h3>조직도 기반 역할별 추천</h3>
              <p>제품군·Triage 주관부서·Severity·Line Stop 정보를 조직도와 대조한 추천입니다.</p>
            </div>
            <span class="cft-confirm-state ${confirmed ? 'is-confirmed' : ''}">${confirmed ? '사람 확정 완료' : '사람 확인 대기'}</span>
          </div>
          <div class="cft-recommendation-list">
            ${recommendations.map(rec => {
              const current = getCurrentCFTMemberForRule(c, rec.key);
              const isMatch = current?.contact === rec.member.email;
              return `
                <div class="cft-recommendation-row">
                  <div><span>${rec.role}</span><strong>${rec.member.name} ${rec.member.position}</strong><small>${rec.member.dept} · ${rec.member.email}</small></div>
                  <p>${rec.reason}</p>
                  <em class="${isMatch ? 'is-match' : ''}">${isMatch ? '추천 반영됨' : current ? `현재: ${current.name}` : '담당자 미지정'}</em>
                </div>
              `;
            }).join('')}
          </div>
          <div class="cft-ai-actions">
            <span>AI가 자동 확정하지 않습니다. 추천 적용 후 담당자를 검토·교체하고 최종 확정하세요.</span>
            <button class="btn btn-secondary" onclick="applyAICFTRecommendations()"><i data-lucide="sparkles" style="width:14px;height:14px;"></i> AI 추천 적용</button>
            <button class="btn btn-primary" onclick="confirmCFTAssignments()"><i data-lucide="user-check" style="width:14px;height:14px;"></i> 현재 구성 확정</button>
          </div>
        </section>
      `;
    }

    function applyAICFTRecommendations() {
      const c = getActiveCase();
      if (!c) return;
      if (!confirm('AI 추천 역할로 현재 Champion·Leader·FA·공정·물류 담당자를 교체하시겠습니까?\n\n고객 대응 담당과 품질 실무 간사는 유지됩니다.')) return;
      const recommendations = getAICFTRecommendations(c);
      const recommendationKeys = new Set(recommendations.map(rec => rec.key));
      c.team = (c.team || []).filter(member => {
        if (isProtectedCFTMember(member)) return true;
        const matchedRule = CFT_ROLE_RULES.find(rule => rule.matches(member.role || ''));
        return !matchedRule || !recommendationKeys.has(matchedRule.key);
      });
      recommendations.forEach(rec => {
        const existing = c.team.find(member => member.contact === rec.member.email);
        if (existing) {
          existing.role = rec.role;
          existing.assignment = 'AI Recommended / Human Review Required';
          existing.recommendationReason = rec.reason;
          return;
        }
        c.team.push({
          role: rec.role,
          name: `${rec.member.name} ${rec.member.position}`,
          dept: rec.member.dept,
          contact: rec.member.email,
          status: 'Active',
          assignment: 'AI Recommended / Human Review Required',
          recommendationReason: rec.reason
        });
      });
      c.cftRecommendation = {
        status: 'AI Suggested - Human Review Required',
        appliedAt: qmsLocalTimestamp(),
        humanConfirmed: false
      };
      saveAppData();
      renderCurrentView();
    }

    function confirmCFTAssignments() {
      const c = getActiveCase();
      if (!c) return;
      if (!isCFTAssignmentComplete(c)) {
        alert('CFT 필수 역할이 모두 지정되지 않았습니다.\n\nChampion, Leader, FA, 공정기술, 물류/봉쇄, 품질 실무 담당자를 확인해 주세요.');
        return;
      }
      const raciAcknowledged = document.getElementById('cftRaciAcknowledged');
      if (!raciAcknowledged?.checked) {
        alert('RACI 역할과 책임을 검토한 뒤 [RACI 책임 확인]에 체크해 주세요.');
        raciAcknowledged?.focus();
        return;
      }

      // Automatically validate and launch Official D1 Stage Review Report Modal
      c.cftRecommendation = {
        ...(c.cftRecommendation || {}),
        humanConfirmed: true
      };
      c.cftRaci = {
        acknowledged: true
      };
      saveAppData();
      if (typeof openStageReviewModal === 'function') {
        openStageReviewModal('D1');
      }
    }

    

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
              Active Case: <b class="num-mono" style="color:var(--text-primary);">${c.id}</b> | 조직도에서 배속할 팀원을 선택하십시오.
            </div>
          </div>
          <button type="button" class="btn btn-secondary btn-sm" onclick="document.getElementById('globalModal').style.display='none'">
            <i data-lucide="x" style="width:14px; height:14px;"></i> 닫기
          </button>
        </div>

        <!-- Role Selector & Search Bar -->
        <div style="background:var(--bg-card-subtle); border:1px solid var(--border); border-radius:var(--radius-sm); padding:12px 14px; margin-bottom:12px;">
          <div class="grid-2" style="gap:12px;">
            <div>
              <label class="form-label" style="font-weight:700; color:var(--text-secondary); margin-bottom:4px;">
                <span>배속할 CFT Role (역할 지정)</span>
              </label>
              <select id="modalCftRoleSelect" class="form-control">
                <option value="8D Champion">8D Champion (총괄 승인)</option>
                <option value="8D Leader (연구소/개발 주관)">8D Leader (연구소/개발 주관)</option>
                <option value="Technical / FA Lead">Technical / FA Lead (불량 분석)</option>
                <option value="Material Containment Lead">Material Containment Lead (물류/봉쇄)</option>
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
              <label class="form-label" style="font-weight:700; color:var(--text-secondary); margin-bottom:4px;">
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
        <div id="modalOrgTreeContainer" style="max-height:480px; overflow-y:auto; padding:12px; background:var(--bg-card); border:1px solid var(--border); border-radius:var(--radius-sm);">
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
            <div class="folder-header ${isOpen ? 'open' : ''}" onclick="toggleModalOrgNode('${node.id}', event)" style="padding:6px 10px; border-radius:4px; display:flex; align-items:center; gap:8px; cursor:pointer; background:var(--bg-card-subtle);">
              <span class="folder-toggle-icon" style="font-family:monospace; font-weight:800; font-size:0.75rem; color:#60a5fa;">[${isOpen ? '-' : '+'}]</span>
              <i data-lucide="${isOpen ? 'folder-open' : 'folder'}" style="width:15px; height:15px; color:#f59e0b;"></i>
              <span class="folder-name" style="font-weight:700; font-size:0.8rem; color:var(--text-primary);">${node.name}</span>
              <span class="folder-count-badge" style="margin-left:auto; font-size:0.65rem; background:var(--bg-card); color:var(--accent); border:1px solid var(--border); padding:1px 6px; border-radius:10px;">${totalMembers}명</span>
            </div>

            ${isOpen ? `
              <div class="folder-children" style="padding-left:16px; border-left:1px dashed rgba(59,130,246,0.25); margin-left:8px; margin-top:4px;">
                <!-- Members in this node -->
                ${filteredMembers.length > 0 ? `
                  <div class="folder-members-list" style="display:flex; flex-direction:column; gap:4px; margin-bottom:6px;">
                    ${filteredMembers.map(m => `
                      <div class="tree-member-card" style="display:flex; align-items:center; justify-content:space-between; padding:6px 10px; background:var(--bg-card-subtle); border:1px solid var(--border); border-radius:5px;">
                        <div style="display:flex; align-items:center; gap:10px;">
                          <div style="width:28px; height:28px; border-radius:50%; background:linear-gradient(135deg,#2563eb,#7c3aed); display:flex; align-items:center; justify-content:center; font-weight:700; font-size:0.7rem; color:#fff; flex-shrink:0;">
                            ${m.name.length > 2 ? m.name.slice(-2) : m.name}
                          </div>
                          <div style="display:flex; flex-direction:column; gap:2px;">
                            <div style="font-size:0.82rem; font-weight:700; color:var(--text-primary); line-height:1.2;">
                              ${m.name} ${m.isMe ? `<span class="badge-me" style="font-size:0.6rem; background:#2563eb; color:#fff; padding:0 4px; border-radius:3px;">나</span>` : ''}
                            </div>
                            <div style="font-size:0.72rem; color:#94a3b8; line-height:1.2;">
                              ${m.position || 'Pro'}
                            </div>
                            <div class="num-mono" style="font-size:0.68rem; color:#60a5fa; line-height:1.2; word-break:break-all;">
                              ${m.email}
                            </div>
                          </div>
                        </div>
                        <button type="button" class="btn btn-primary btn-sm" style="padding:4px 12px; font-size:0.74rem;" onclick="assignModalMemberToCFT('${m.name}', '${m.position || 'Pro'}', '${node.name}', '${m.email}')">
                          <i data-lucide="user-plus" style="width:12px; height:12px;"></i> 배속 추가
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
      c.cftRecommendation = { ...(c.cftRecommendation || {}), humanConfirmed: false, status: 'Human Review Required' };

      saveAppData();
      document.getElementById('globalModal').style.display = 'none';
      renderCurrentView();
      alert(`🎉 [${fullNameWithPos}] 님이 D1 CFT [${role}]으로 성공적으로 배속되었습니다!`);
    }

    function removeCFTMember(idx) {
      const c = getActiveCase();
      const member = c?.team?.[idx];
      if (!member) return;
      if (isProtectedCFTMember(member)) {
        alert('고객 대응 담당과 품질 실무 간사는 접수·Triage 승인 정보와 연결된 필수 담당자입니다. 담당자 변경은 해당 원본 라우팅에서 수행해 주세요.');
        return;
      }
      if (confirm(`[${member.name}] 님을 D1 CFT의 [${member.role}] 역할에서 제외하시겠습니까?`)) {
        c.team.splice(idx, 1);
        c.cftRecommendation = { ...(c.cftRecommendation || {}), humanConfirmed: false, status: 'Human Review Required' };
        saveAppData();
        renderCurrentView();
      }
    }


    function openAIAssistantModal() {
      if (typeof window.openCustomerAiGatekeeperModal === 'function') {
        window.openCustomerAiGatekeeperModal();
        return;
      }
      const c = getActiveCase();
      const modal = document.getElementById('globalModal');
      const container = document.getElementById('modalContainer');
      const esc = escapeWorkspaceValue;
      const selected = (c.d5?.candidates || []).filter(row => row.selected);
      const rootTypes = ['Occurrence','Escape','System'];
      const causeLinksOk = rootTypes.every(type => selected.some(row => row.causeType === type));
      const validationLinksOk = selected.length > 0 && selected.every(action => (c.d6?.validationTests || []).some(test => test.actionId === action.id && test.result === 'PASS' && test.evidence));
      const preventionRows = [...(c.d7?.systemUpdates || []), ...(c.d7?.horizontalDeployment || [])];
      const preventionLinksOk = preventionRows.length > 0 && preventionRows.every(row => selected.some(action => action.id === row.actionId) && ['Completed','Not Applicable'].includes(row.status) && row.evidence);
      const traceabilityOk = causeLinksOk && validationLinksOk && preventionLinksOk;
      const missingStages = QUALITY_STAGES.filter(stage => !hasCurrentStageApproval(c, stage));
      const reportReady = missingStages.length === 0 && !reportReviewError(c, 'gate8D');
      
      container.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; border-bottom:1px solid var(--border); padding-bottom:12px;">
          <div style="font-size:1.1rem; font-weight:800; color:#60a5fa; display:flex; align-items:center; gap:8px;">
            <i data-lucide="sparkles" style="color:#38bdf8;"></i> AI 전수 품질 감사 보고서 (Case: ${c.id})
          </div>
          <button class="btn btn-secondary btn-sm" onclick="document.getElementById('globalModal').style.display='none'">닫기</button>
        </div>

        <div style="font-size:0.84rem; line-height:1.6; color:var(--text-primary);">
          <div style="background:var(--bg-card-subtle); border:1px solid var(--border); border-radius:var(--radius-sm); padding:14px; margin-bottom:12px;">
            <div style="font-weight:700; color:${traceabilityOk?'#34d399':'#fbbf24'}; margin-bottom:4px;">1. 원인→대책→검증→예방 Traceability: ${traceabilityOk?'연결 확인':'보완 필요'}</div>
            <p style="color:var(--text-secondary); font-size:0.8rem;">발생·유출·시스템 원인별 D5 대책 ${causeLinksOk?'연결':'미연결'}, 선정 대책별 D6 PASS/Evidence ${validationLinksOk?'확인':'미완료'}, D7 개정·수평전개 Evidence ${preventionLinksOk?'확인':'미완료'}.</p>
          </div>

          <div style="background:var(--bg-card-subtle); border:1px solid var(--border); border-radius:var(--radius-sm); padding:14px; margin-bottom:12px;">
            <div style="font-weight:700; color:${missingStages.length?'#fbbf24':'#38bdf8'}; margin-bottom:4px;">2. 단계별 사람 승인: ${missingStages.length?'미완료':'D1~D8 완료'}</div>
            <p style="color:var(--text-secondary); font-size:0.8rem;">${missingStages.length?`미승인 단계: ${esc(missingStages.join(', '))}`:'모든 단계의 현재 내용이 기안·Leader·Champion 승인 스냅샷과 일치합니다.'}</p>
          </div>

          <div style="background:var(--bg-card-subtle); border:1px solid var(--border); border-radius:var(--radius-sm); padding:14px;">
            <div style="font-weight:700; color:${reportReady?'#34d399':'#fbbf24'}; margin-bottom:4px;">3. Final 8D 내부 검토 준비도: ${reportReady?'단계 승인 완료':'검토 필요'}</div>
            <p style="color:var(--text-secondary); font-size:0.8rem;">${reportReady?'Final Report Gate에서 별도 내부 결재와 고객 송부 증빙을 진행할 수 있습니다.':esc(reportReviewError(c,'gate8D') || 'D1~D8 승인 상태를 확인하세요.')}</p>
          </div>
        </div>

        <div style="display:flex; justify-content:flex-end; margin-top:20px;">
          <button class="btn btn-primary" onclick="document.getElementById('globalModal').style.display='none'; switchNav('reports-hub');">공식 리포트 인쇄 화면으로 이동</button>
        </div>
      `;
      modal.style.display = 'flex';
      lucide.createIcons();
    }
