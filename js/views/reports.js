/* ========================================================================= */
/* VIEW 6: 3-GATE APPROVAL & 8D REPORTS HUB (INITIAL 3D / INTERIM 5D / FINAL 8D) */
/* ========================================================================= */
let currentGateKey = 'gate3D'; // 'gate3D' (D1~D3), 'gate5D' (D4~D5), 'gate8D' (D6~D8)

function ensureCaseGates(c) {
  const member = (role, fallback) => c.team?.find(t => String(t.role).includes(role))?.name || fallback;
  const leader = member('Leader', '김현수 실장_상무');
  const champion = member('Champion', '황승안 팀장_상무');
  const definitions = {
    gate3D: ['Initial 3D Containment Report (D1~D3 봉쇄 확정)', 'initial', [
      ['1차: 물류/자재 격리 책임자', member('Containment', '이은산 센터장_상무')],
      ['2차: 8D Leader (연구소 주관)', leader], ['3차: 8D Champion (품질혁신)', champion]
    ]],
    gate5D: ['Interim 5D Root Cause & PCA Report (D4~D5 원인/영구대책)', 'interim', [
      ['1차: 불량 분석 리더 (FA)', member('FA', '박재환 팀장_S.Pro')],
      ['2차: 8D Leader (연구소 주관)', leader], ['3차: 8D Champion (품질혁신)', champion]
    ]],
    gate8D: ['Final 8D Closure Report (D6~D8 효과검증 & 영구종결)', 'final', [
      ['1차: 8D Leader (연구소 주관)', leader], ['2차: 알앤디부문장 (연구소장)', '박정훈 부문장_전무'],
      ['3차: 8D Champion (품질혁신)', champion]
    ]]
  };
  c.gates = c.gates || {};
  Object.entries(definitions).forEach(([key, [title, reportType, roles]]) => {
    if (c.gates[key]) return; // Preserve existing decisions; never recreate history on render.
    c.gates[key] = {
      title, reportType, status:'Pending', internalApproved:false, dispatchedByQuality:false,
      dispatchDate:'', approvalDate:'',
      approvers:[...roles, ['4차: 8D 품질실무 (고객사 공식 송부)', '김성중 S.Pro']].map(([role,name]) =>
        ({role,name,status:'Pending',date:'',comment:''}))
    };
  });
  return c.gates;
}

function renderReportsHubView(c) {
  ensureCaseGates(c);
  const reportCase = c;
  c = escapeReportData(c);
  const gates = c.gates;
  const activeGate = gates[currentGateKey];
  const reportType = activeGate.reportType;

  // Check if champion approved (step 3)
  const isChampionApproved = activeGate.approvers[2]?.status === 'Approved';
  const isQualityDispatched = activeGate.approvers[3]?.status === 'Approved';

  return `
    <!-- Top Bar -->
    ${renderQmsPageHeader({title:'8D 공식 리포트 및 결재',icon:'shield-check',description:'물류·FA 검토, Leader·Champion 승인 후 품질 실무 담당자가 고객 송부를 준비합니다.',reference:reportCase.id,className:'no-print',actions:`<button class="btn btn-secondary" onclick="openCustomerAiGatekeeperModal(null,currentGateKey)" title="고객사 송부 전 자료 확인"><i data-lucide="sparkles"></i> 송부 전 AI 검토</button><button class="btn btn-primary" onclick="window.print()"><i data-lucide="printer"></i> A4 인쇄 / PDF 저장</button>`})}

    <!-- 3-Gate Milestone Navigation Cards -->
    <div class="gate-nav-bar no-print">
      
      <!-- Gate 1: Initial 3D -->
      <div class="gate-nav-card ${currentGateKey === 'gate3D' ? 'active' : ''} ${gates.gate3D.status === 'Approved' ? 'approved' : 'in-progress'}" onclick="setGateTab('gate3D')">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
          <span style="font-size:0.7rem; font-weight:800; color:#38bdf8;">GATE 01 (최초 접수 ~ D3)</span>
          <span class="badge-pill ${gates.gate3D.status === 'Approved' ? 'badge-ok' : 'badge-warn'}" style="font-size:0.65rem;">
            ${gates.gate3D.status === 'Approved' ? '● 3D 고객 송부완료' : '🟡 3D 결재 진행중'}
          </span>
        </div>
        <div style="font-size:0.92rem; font-weight:800; color:var(--text-primary);">Initial 3D Report</div>
        <div style="font-size:0.72rem; color:var(--text-muted); margin-top:4px;">
          물류격리 ➔ 8D리더 ➔ 챔피언 ➔ <b>김성중(고객사 송부)</b>
        </div>
      </div>

      <!-- Gate 2: Interim 5D -->
      <div class="gate-nav-card ${currentGateKey === 'gate5D' ? 'active' : ''} ${gates.gate5D.status === 'Approved' ? 'approved' : (gates.gate5D.status === 'Pending' ? 'in-progress' : 'locked')}" onclick="setGateTab('gate5D')">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
          <span style="font-size:0.7rem; font-weight:800; color:#a855f7;">GATE 02 (D3 확정 ~ D5)</span>
          <span class="badge-pill ${gates.gate5D.status === 'Approved' ? 'badge-ok' : (gates.gate5D.status === 'Pending' ? 'badge-warn' : 'badge-gray')}" style="font-size:0.65rem;">
            ${gates.gate5D.status === 'Approved' ? '● 5D 고객 송부완료' : (gates.gate5D.status === 'Pending' ? '🟡 5D 결재 진행중' : '⚪ 미도달')}
          </span>
        </div>
        <div style="font-size:0.92rem; font-weight:800; color:var(--text-primary);">Interim 5D Report</div>
        <div style="font-size:0.72rem; color:var(--text-muted); margin-top:4px;">
          FA리더 ➔ 8D리더 ➔ 챔피언 ➔ <b>김성중(고객사 송부)</b>
        </div>
      </div>

      <!-- Gate 3: Final 8D -->
      <div class="gate-nav-card ${currentGateKey === 'gate8D' ? 'active' : ''} ${gates.gate8D.status === 'Approved' ? 'approved' : (gates.gate8D.status === 'Pending' ? 'in-progress' : 'locked')}" onclick="setGateTab('gate8D')">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
          <span style="font-size:0.7rem; font-weight:800; color:#10b981;">GATE 03 (D5 확정 ~ D8)</span>
          <span class="badge-pill ${gates.gate8D.status === 'Approved' ? 'badge-ok' : (gates.gate8D.status === 'Pending' ? 'badge-warn' : 'badge-gray')}" style="font-size:0.65rem;">
            ${gates.gate8D.status === 'Approved' ? '● 8D 최종 종결 송부완료' : '🟡 최종 결재 대기'}
          </span>
        </div>
        <div style="font-size:0.92rem; font-weight:800; color:var(--text-primary);">Final 8D Closure Report</div>
        <div style="font-size:0.72rem; color:var(--text-muted); margin-top:4px;">
          8D리더 ➔ R&D부문장 ➔ 챔피언 ➔ <b>김성중(고객사 송부 및 종결)</b>
        </div>
      </div>

    </div>

    <!-- Electronic Approval & Quality Dispatch Panel (4 Columns) -->
    <div class="approval-flow-card no-print">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; border-bottom:1px solid rgba(255,255,255,0.08); padding-bottom:10px; flex-wrap:wrap; gap:10px;">
        <div style="display:flex; align-items:center; gap:8px;">
          <i data-lucide="stamp" style="width:18px; height:18px; color:#38bdf8;"></i>
          <span style="font-size:0.95rem; font-weight:800; color:var(--text-primary);">
            ${activeGate.title} — 내부 결재선 & 고객사 송부 현황
          </span>
          <span class="badge-pill ${activeGate.status === 'Approved' ? 'badge-ok' : 'badge-warn'}">
            ${activeGate.status === 'Approved' ? `고객사 송부 완료 (${activeGate.dispatchDate})` : (isChampionApproved && !isQualityDispatched ? '내부승인완료 (고객송부 대기)' : '내부 결재 진행 중')}
          </span>
        </div>

        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <!-- Sign-off Button for Internal Approvers -->
          <button class="btn btn-primary btn-sm" onclick="promptSignoffApproval('${currentGateKey}')">
            <i data-lucide="edit-3" style="width:13px; height:13px;"></i> ✍️ 결재 서명 / 승인 처리
          </button>

          ${typeof hasMasterAuthority === 'function' && hasMasterAuthority(CURRENT_USER) ? `
            <button class="btn btn-warning btn-sm" onclick="promptMasterSignoffApproval('${currentGateKey}')" style="background:#f59e0b; border-color:#d97706; color:#000; font-weight:800; box-shadow:0 0 14px rgba(245,158,11,0.4);">
              <i data-lucide="shield-check" style="width:13px; height:13px;"></i> 👑 마스터 전결 승인
            </button>
          ` : ''}

          <!-- Dedicated Quality Facilitator Customer Dispatch Button -->
          ${isChampionApproved && !isQualityDispatched ? `
            <button class="btn btn-warning btn-sm" onclick="dispatchReportToCustomer('${currentGateKey}')" style="box-shadow:0 0 14px rgba(245,158,11,0.4); font-weight:800;">
              <i data-lucide="send" style="width:13px; height:13px;"></i> ✉️ [김성중 S.Pro] 외부 송부 이력 기록
            </button>
          ` : ''}

          <!-- Gate Advance Buttons -->
          ${activeGate.status === 'Approved' && currentGateKey === 'gate3D' ? `
            <button class="btn btn-success btn-sm" onclick="advanceToNextGate('D4')">
              <i data-lucide="arrow-right" style="width:13px; height:13px;"></i> D4~D5 단계 공식 진입
            </button>
          ` : ''}
          ${activeGate.status === 'Approved' && currentGateKey === 'gate5D' ? `
            <button class="btn btn-success btn-sm" onclick="advanceToNextGate('D6')">
              <i data-lucide="arrow-right" style="width:13px; height:13px;"></i> D6~D8 단계 공식 진입
            </button>
          ` : ''}
        </div>
      </div>

      <!-- Approvers Sequence Grid (Exactly 4 Columns) -->
      <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:10px;">
        ${activeGate.approvers.map((appr, idx) => `
          <div style="background:var(--bg-card-subtle); border:1px solid ${appr.status === 'Approved' ? '#10b981' : (idx === 3 && isChampionApproved && !isQualityDispatched ? '#f59e0b' : '#334155')}; border-radius:6px; padding:12px 10px; text-align:center; position:relative;">
            <div style="font-size:0.68rem; color:#94a3b8; font-weight:700;">${appr.role}</div>
            <div style="font-size:0.86rem; font-weight:800; color:var(--text-primary); margin-top:4px;">${appr.name}</div>
            
            <div style="margin:10px 0;">
              ${appr.status === 'Approved' ? `
                <div class="signoff-stamp-box">
                  ✔ ${idx === 3 ? '고객송부 완료 [송부]' : '승인완료 [인]'}<br>
                  <span style="font-size:9px; font-weight:600;">${appr.date}</span>
                </div>
              ` : (idx === 3 && isChampionApproved ? `
                <div style="border:1px solid #f59e0b; color:#fbbf24; background:rgba(245,158,11,0.1); border-radius:4px; padding:4px 6px; font-size:10.5px; font-weight:800; cursor:pointer;" onclick="dispatchReportToCustomer('${currentGateKey}')">
                  ✉️ 송부 이력 입력 (클릭)
                </div>
              ` : `
                <div class="signoff-pending-box">
                  ⏳ 결재 대기
                </div>
              `)}
            </div>

            <div style="font-size:0.68rem; color:var(--text-secondary); background:var(--bg-card-subtle); border-radius:4px; padding:6px 8px; text-align:left; min-height:38px; line-height:1.25;">
              <b>비고:</b> ${appr.comment || '검토 의견 대기 중'}
            </div>
          </div>
        `).join('')}
      </div>
    </div>

    <!-- Official Report Paper (A4 Style) -->
    <div class="report-paper" id="reportPrintArea">
      
      <!-- Watermark per Report Stage -->
      <div class="report-watermark">
        ${c.isExampleCase ? 'SAMPLE · TRAINING DATA' : 'DRAFT · HUMAN REVIEW REQUIRED'}
        ${reportType === 'initial' ? 'INITIAL 3D · ROOT CAUSE UNDER INVESTIGATION' : reportType === 'interim' ? 'INTERIM 5D' : 'FINAL 8D REVIEW'}
      </div>

      <!-- Header Table -->
      <table class="report-header-table">
        <tr>
          <td rowspan="2" style="width: 25%; text-align:center; background:#f1f5f9;">
            <div style="font-size:18px; font-weight:900; color:#1e3a8a; letter-spacing:0.05em;">RAMOS</div>
            <div style="font-size:9px; color:#64748b; font-weight:700;">QUALITY MANAGEMENT SYSTEM</div>
          </td>
          <td colspan="2" style="text-align:center;">
            <div class="report-header-title">
              ${reportType === 'initial' ? 'INITIAL 3D CONTAINMENT REPORT (D1~D3)' : reportType === 'interim' ? 'INTERIM 5D CORRECTIVE ACTION REPORT (D1~D5)' : 'EIGHT DISCIPLINES (8D) QUALITY PROBLEM SOLVING REPORT'}
            </div>
          </td>
          <td style="width: 20%; font-size:11px;">
            <b>Report No:</b> ${c.id}<br>
            <b>Stage:</b> ${reportType.toUpperCase()} (Gate ${currentGateKey.replace('gate','')})<br>
            <b>Dispatch Date:</b> ${activeGate.dispatchDate || '송부 기록 없음'}
          </td>
        </tr>
        <tr>
          <td><b>Customer:</b> ${c.customer}</td>
          <td><b>Product:</b> ${c.product}</td>
          <td><b>Status:</b> ${activeGate.status === 'Approved' ? 'DISPATCHED & APPROVED' : 'IN REVIEW'}</td>
        </tr>
      </table>

      <!-- General Incident Summary -->
      <table class="report-inner-table" style="margin-bottom:12px;">
        <tr>
          <th style="width:15%;">Part Number</th>
          <td style="width:35%;">${c.partNumber}</td>
          <th style="width:15%;">Lot Number</th>
          <td style="width:35%; font-weight:700;">${c.lotNumber}</td>
        </tr>
        <tr>
          <th>Defect Quantity</th>
          <td style="color:#b91c1c; font-weight:700;">${c.defectQty} / ${c.inspectQty == null ? '미입력' : Number(c.inspectQty).toLocaleString()} ea (${c.ppm} PPM)</td>
          <th>Incident Site</th>
          <td>${c.incidentSite}</td>
        </tr>
        <tr>
          <th>Failure Symptom</th>
          <td colspan="3" style="font-weight:700; color:#0f172a;">${c.claimTitle}</td>
        </tr>
      </table>

      ${['D1','D2','D3', ...(reportType !== 'initial' ? ['D4','D5'] : []), ...(reportType === 'final' ? ['D6','D7','D8'] : [])].map(stage => `
        <div class="report-section">
          <div class="report-sec-title"><span>${stage}. ${(typeof getStageTitleText === 'function' ? getStageTitleText(stage) : stage).replace(new RegExp(`^${stage}[.:\\s-]*`, 'i'), '').trim()}</span><span>사용자 입력 · 검토 필요</span></div>
          <div class="report-sec-content">${renderStageReportSection(reportCase, stage).replace(/^<section[^>]*><h3>.*?<\/h3>/, '').replace(/<\/section>$/, '').replace(/<table>/g, '<table class="report-inner-table">')}</div>
        </div>
      `).join('')}

      <!-- Stage Gate Official Sign-off Box in Paper (4 Columns) -->
      <div class="report-section">
        <div class="report-sec-title">
          <span>${activeGate.title} — Internal Sign-off & Customer Dispatch</span>
          <span>${activeGate.status === 'Approved' ? 'DISPATCHED' : 'PENDING'}</span>
        </div>
        <div class="report-sec-content">
          <table class="report-inner-table" style="text-align:center;">
            <tr>
              ${activeGate.approvers.map(a => `<th style="width:25%; font-size:11px;">${a.role}</th>`).join('')}
            </tr>
            <tr>
              ${activeGate.approvers.map((a, i) => `
                <td style="padding:10px 4px;">
                  <div style="font-weight:700; font-size:11.5px; color:#1e3a8a;">${a.name}</div>
                  ${a.status === 'Approved' ? `
                    <div style="color:#059669; font-weight:800; font-size:10px; margin-top:4px;">
                      ✔ ${i === 3 ? '고객송부 완료' : '서명완료'} (${a.date})
                    </div>
                  ` : `
                    <div style="color:#94a3b8; font-size:10px; margin-top:4px;">⏳ 대기</div>
                  `}
                </td>
              `).join('')}
            </tr>
          </table>
        </div>
      </div>

      ${reportType !== 'initial' && typeof renderD4EvidenceAppendix === 'function' ? `
        <!-- D4 Quality Evidence Appendix Dossier (A4 독립 부록 패키지) -->
        <div class="report-appendix-divider no-print" style="margin: 36px 0 20px; border-top: 2px dashed #38bdf8; padding-top: 14px; text-align: center;">
          <span style="background: var(--bg-card); border: 1px solid #38bdf8; color: #38bdf8; font-size: 11px; font-weight: 800; padding: 6px 16px; border-radius: 20px; letter-spacing: 0.05em; display: inline-flex; align-items: center; gap: 6px;">
            <i data-lucide="file-check-2" style="width:14px; height:14px;"></i> D4 고객사 제출용 독립 Evidence 분석 성적서 부록 (E01~E06 Standalone A4 Dossier)
          </span>
        </div>
        ${renderD4EvidenceAppendix(reportCase)}
      ` : ''}

    </div>
  `;
}

function setGateTab(gateKey) {
  currentGateKey = gateKey;
  renderCurrentView();
}

async function promptSignoffApproval(gateKey, forceMaster = false) {
  const c=getActiveCase();if(!c)return;
  saveAppData();
  const error=reportReviewError(c,gateKey);if(error){alert(error);return;}
  const gate=ensureCaseGates(c)[gateKey];
  const lastStage=QUALITY_STAGES[REPORT_GATE_STAGES[gateKey]-1];
  const snapshot=approvalSnapshot(c,lastStage);
  if(gate.approvers.some(a=>a.status==='Approved') && (!gate.snapshot||JSON.stringify(snapshot)!==JSON.stringify(gate.snapshot))){
    const first=reportApprover(gate.approvers[0]);
    if(!first||first.email!==CURRENT_USER.email){
      if (forceMaster || (typeof hasMasterAuthority === 'function' && hasMasterAuthority(CURRENT_USER) && typeof window !== 'undefined' && window.document?.body)) {
        c.approvalAudit=c.approvalAudit||[];
        c.approvalAudit.push({at:new Date().toISOString(),by:CURRENT_USER.email,reason:'[마스터 전결] 기존 보고서 결재 재검토',gateKey,gates:{[gateKey]:approvalClone(gate)}});
        gate.approvers=gate.approvers.map(a=>({role:a.role,name:a.name,email:a.email,status:'Pending',date:'',comment:''}));
        Object.assign(gate,{status:'Pending',internalApproved:false,dispatchedByQuality:false,dispatchDate:'',approvalDate:''});
        delete gate.dispatchEvidence;delete gate.snapshot;
        saveAppData();
      } else {
        alert(`${gate.approvers[0]?.name} 계정으로 기존 보고서 결재를 재검토해 주세요.`);return;
      }
    } else {
      c.approvalAudit=c.approvalAudit||[];
      c.approvalAudit.push({at:new Date().toISOString(),by:CURRENT_USER.email,reason:'기존 보고서 결재 재검토',gateKey,gates:{[gateKey]:approvalClone(gate)}});
      gate.approvers=gate.approvers.map(a=>({role:a.role,name:a.name,email:a.email,status:'Pending',date:'',comment:''}));
      Object.assign(gate,{status:'Pending',internalApproved:false,dispatchedByQuality:false,dispatchDate:'',approvalDate:''});
      delete gate.dispatchEvidence;delete gate.snapshot;
      saveAppData();
    }
  }
  const pending=gate.approvers.slice(0,3).find(a=>a.status!=='Approved');
  if(!pending){alert('내부 결재가 완료되었습니다. 실제 외부 송부 후 이력을 기록해 주세요.');return;}
  const assigned=reportApprover(pending);
  if(!assigned||assigned.email!==CURRENT_USER.email){
    if (forceMaster) {
      promptMasterSignoffApproval(gateKey);
      return;
    }
    if (typeof hasMasterAuthority === 'function' && hasMasterAuthority(CURRENT_USER) && typeof window !== 'undefined' && window.document?.body) {
      const doMaster = confirm(`현재 [${pending.role}: ${pending.name}] 결재 순서입니다.\n\n귀하는 전사 최고 관리자(MASTER) 권한을 보유하고 있습니다.\n마스터 전결 권한으로 즉시 승인 처리하시겠습니까?\n\n[확인] ➔ 마스터 전결 승인 진행\n[취소] ➔ [${pending.name}] 결재자 계정으로 자동 전환`);
      if (doMaster) {
        promptMasterSignoffApproval(gateKey);
        return;
      }
    }
    alert(`${pending.name} 결재자 계정으로 다시 로그인해 주세요.`);
    return;
  const pendingIndex=gate.approvers.indexOf(pending);
  const roleKey=['drafter','leader','champion'][pendingIndex];
  let serverEvent;
  try {
    serverEvent=await QMSApi.recordApproval({
      caseId:c.id, scopeType:'report_gate', scopeKey:gateKey, roleKey,
      decision:'APPROVED', comment:comment.trim(), expectedApproverEmail:assigned.email,
      masterOverride:false, snapshot
    });
  } catch(serverError) {
    alert(`중앙 결재를 기록하지 못했습니다. 화면 상태는 변경되지 않았습니다.\n${serverError.message}`);
    return;
  }
  }
  const comment=prompt(`[${pending.role}] ${assigned.name} 결재 의견:`);
  if(!comment?.trim())return;
  gate.snapshot=snapshot;
  Object.assign(pending,{status:'Approved',email:assigned.email,date:new Date().toISOString(),comment:comment.trim(),serverEventId:serverEvent.eventId});
  gate.internalApproved=gate.approvers.slice(0,3).every(a=>a.status==='Approved');
  saveAppData();renderCurrentView();
}

async function promptMasterSignoffApproval(gateKey) {
  const c = getActiveCase();
  if (!c) return;
  saveAppData();
  const error = reportReviewError(c, gateKey);
  if (error) { alert(error); return; }
  const gate = ensureCaseGates(c)[gateKey];
  const lastStage = QUALITY_STAGES[REPORT_GATE_STAGES[gateKey]-1];
  const snapshot = approvalSnapshot(c, lastStage);
  const pending = gate.approvers.slice(0, 3).find(a => a.status !== 'Approved');
  if (!pending) {
    alert('내부 결재 3단계가 이미 완료되었습니다. [외부 송부 이력 기록] 버튼을 통해 고객사 송부를 진행해 주세요.');
    return;
  }
  const assigned = reportApprover(pending);
  const defaultComment = `[마스터 전결] ${pending.role} (${pending.name}) 품질 기술 분석 및 IATF 16949 요구사항 충족 확인 완료 (Master QA Approval)`;
  const comment = prompt(`[👑 마스터 전결 권한 승인]\n\n현재 결재 대상: [${pending.role}] ${pending.name}\n\n전사 최고 관리자(MASTER) 권한으로 전결 승인하시겠습니까?\n결재 의견을 입력해 주세요:`, defaultComment);
  if (!comment?.trim()) return;
  gate.snapshot = snapshot;
  const pendingIndex=gate.approvers.indexOf(pending);
  const roleKey=['drafter','leader','champion'][pendingIndex];
  let serverEvent;
  try {
    serverEvent=await QMSApi.recordApproval({
      caseId:c.id, scopeType:'report_gate', scopeKey:gateKey, roleKey,
      decision:'APPROVED', comment:comment.trim(), expectedApproverEmail:assigned?.email || '',
      masterOverride:true, snapshot
    });
  } catch(serverError) {
    alert(`중앙 전결을 기록하지 못했습니다. 화면 상태는 변경되지 않았습니다.\n${serverError.message}`);
    return;
  }
  Object.assign(pending, {
    status: 'Approved',
    name: `${pending.name} (마스터 전결)`,
    email: assigned?.email || CURRENT_USER.email,
    date: new Date().toISOString(),
    comment: comment.trim(),
    masterApprovedBy: CURRENT_USER.name,
    serverEventId: serverEvent.eventId
  });
  gate.internalApproved = gate.approvers.slice(0, 3).every(a => a.status === 'Approved');
  saveAppData();
  renderCurrentView();
  alert(`[${pending.role}: ${pending.name}] 단계가 마스터 전결 권한으로 정상 승인되었습니다!`);
}

async function dispatchReportToCustomer(gateKey) {
  const c = getActiveCase();
  if (!c) return;
  saveAppData();
  const error=reportReviewError(c,gateKey);if(error){alert(error);return;}
  const gate = ensureCaseGates(c)[gateKey];
  const assigned=reportApprover(gate?.approvers?.[3]);
  if(!assigned||assigned.email!==CURRENT_USER.email){alert('지정된 품질 송부 담당자 계정으로 접속해 주세요.');return;}
  if(!gate.snapshot||JSON.stringify(gate.snapshot)!==JSON.stringify(approvalSnapshot(c,QUALITY_STAGES[REPORT_GATE_STAGES[gateKey]-1]))){alert('현재 내용의 보고서 결재가 필요합니다.');return;}
  if (!gate || !gate.approvers.slice(0, 3).every(a => a.status === 'Approved')) {
    alert('내부 결재 3단계가 완료되어야 송부 이력을 기록할 수 있습니다.'); return;
  }
  const evidence = prompt('이 시스템은 이메일을 발송하지 않습니다. 외부에서 실제 송부한 메일의 수신자·송부시각·보관 위치를 입력해 주세요.');
  if (!evidence?.trim()) return;
  const now = new Date().toISOString();
  let outbox;
  let serverEvent;
  try {
    outbox = await QMSApi.prepareDispatch({
      caseId:c.id,
      gateKey,
      subject:`[RAMOS 8D] ${c.id} ${gate.title}`,
      recipients:[],
      cc:[],
      evidenceNote:evidence.trim(),
      reportSnapshot:gate.snapshot
    });
    serverEvent = await QMSApi.recordApproval({
      caseId:c.id, scopeType:'report_gate', scopeKey:gateKey,
      roleKey:'quality_dispatcher', decision:'APPROVED', comment:evidence.trim(),
      expectedApproverEmail:assigned.email, masterOverride:false, snapshot:gate.snapshot
    });
  } catch(serverError) {
    alert(`송부 준비함 또는 증빙을 중앙 서버에 기록하지 못했습니다. 화면 상태는 변경되지 않았습니다.\n${serverError.message}`);
    return;
  }
  const approver = gate.approvers[3];
  if (!approver) return;
  Object.assign(approver, {status:'Approved', date:now, comment:evidence.trim(), recordedBy:CURRENT_USER.email, serverEventId:serverEvent.eventId});
  Object.assign(gate, {dispatchedByQuality:true, status:'Approved', dispatchDate:now, dispatchEvidence:evidence.trim(), dispatchPrepared:true, outboxId:outbox.outboxId, mailProvider:'UNDECIDED', externalSendBySystem:false});
  saveAppData(); renderCurrentView();
  alert(`외부 송부 증빙과 발송 준비함 #${outbox.outboxId}을 기록했습니다. 이 시스템은 이메일을 발송하지 않았습니다.`);

  // Autonomous 8D Agent Auto-Chaining Rail
  if (window.ramosAgent && typeof window.ramosAgent.runSprint2 === 'function') {
    if (gateKey === 'gate3D') {
      window.ramosAgent.log('👤 [Gate 1 공식 송부 완료] D4 진입 및 Sprint 2(D4~D5) 자율 가동을 시작합니다.', 'success');
      setTimeout(() => window.ramosAgent.runSprint2(c), 600);
    } else if (gateKey === 'gate5D') {
      window.ramosAgent.log('👤 [Gate 2 공식 송부 완료] D6 진입 및 Sprint 3(D6~D8) 자율 가동을 시작합니다.', 'success');
      setTimeout(() => window.ramosAgent.runSprint3(c), 600);
    } else if (gateKey === 'gate8D') {
      c.status = 'Closed';
      c.closedAt = now;
      saveAppData();
      window.ramosAgent.log('🎉 [Gate 3 최종 송부 완료] 8D 전 과정 영구 종결 완료!', 'success');
      renderCurrentView();
    }
  }
}

function advanceToNextGate(targetStage) {
  const c=getActiveCase();if(!c)return;
  const key={D4:'gate3D',D6:'gate5D'}[targetStage];
  if(!key||reportReviewError(c,key)||!c.gates?.[key]?.dispatchedByQuality){alert('선행 단계 승인과 보고서 송부 기록을 먼저 완료해 주세요.');return;}
  switchStage(targetStage);
}

function renderCasesListView() {
  return renderDashboardView();
}
