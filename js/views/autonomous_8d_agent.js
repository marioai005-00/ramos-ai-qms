/* ========================================================================= */
/* RAMOS AUTONOMOUS 3-SPRINT 8D AI AGENT WITH HUMAN-IN-THE-LOOP GATED RAIL  */
/* AI 에이전틱 경진대회 전용: 3-Sprint 자율 파이프라인 & 인간 결재 레일      */
/* ========================================================================= */

(function(window) {
  'use strict';

  // Agent Execution States
  
  const MULTI_AGENT_ROSTER = [
    { id: 'triage', name: 'Triage & CFT Matcher', short: 'Triage', icon: 'users', color: '#38bdf8', desc: '인사/조직도 기반 8대 CFT 최적 편성' },
    { id: 'containment', name: 'Containment Guard', short: 'Containment', icon: 'shield-alert', color: '#f59e0b', desc: '영향 범위 확인과 봉쇄조치 제안' },
    { id: 'forensic', name: 'RootCause Forensic', short: 'Forensic', icon: 'microscope', color: '#a855f7', desc: '3-Track 5-Why 및 5대 도구 인과 규명' },
    { id: 'auditor', name: 'Compliance Auditor', short: 'Auditor', icon: 'file-check-2', color: '#10b981', desc: 'IATF 16949 감사 및 반려위험 진단' }
  ];

  const AGENT_STATES = {
    IDLE: 'IDLE',
    SPRINT_1_RUNNING: 'SPRINT_1_RUNNING',
    GATE_1_PENDING: 'GATE_1_PENDING',
    SPRINT_2_RUNNING: 'SPRINT_2_RUNNING',
    GATE_2_PENDING: 'GATE_2_PENDING',
    SPRINT_3_RUNNING: 'SPRINT_3_RUNNING',
    GATE_3_PENDING: 'GATE_3_PENDING',
    COMPLETED: 'COMPLETED'
  };

  class Autonomous8DAgent {
    constructor() {
      this.isExecuting = false;
      this.logs = [];
      this.stepDelayMs = 400;
      this.activeAgentId = 'triage'; // Visual pacing for demo audience
    }

    /* ----------------------------------------------------------------------- */
    /* LOGGING & TELEMETRY STREAM                                              */
    /* ----------------------------------------------------------------------- */
    log(message, type = 'info', agentId = null) {
      if (agentId) this.activeAgentId = agentId;
      const timestamp = new Date().toTimeString().split(' ')[0];
      const entry = { timestamp, message, type, agentId: agentId || this.activeAgentId };
      this.logs.unshift(entry);
      if (this.logs.length > 60) this.logs.pop();
      this.updateHudUi();
    }

    sleep(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }

    /* ----------------------------------------------------------------------- */
    /* DETERMINE CURRENT PIPELINE STATE                                        */
    /* ----------------------------------------------------------------------- */
    getPipelineState(c) {
      if (!c) return AGENT_STATES.IDLE;
      ensureCaseGates(c);

      if (c.status === 'Closed' || c.gates?.gate8D?.status === 'Approved') {
        return AGENT_STATES.COMPLETED;
      }

      const hasD1 = typeof isD1StageComplete === 'function' ? isD1StageComplete(c) : false;
      const hasD2 = typeof isD2StageComplete === 'function' ? isD2StageComplete(c) : false;
      const hasD3 = typeof isD3StageComplete === 'function' ? isD3StageComplete(c) : false;
      const hasD4 = typeof isD4StageComplete === 'function' ? isD4StageComplete(c) : false;
      const hasD5 = typeof hasCurrentStageApproval === 'function' ? hasCurrentStageApproval(c, 'D5') : false;
      const hasD6 = typeof hasCurrentStageApproval === 'function' ? hasCurrentStageApproval(c, 'D6') : false;
      const hasD7 = typeof hasCurrentStageApproval === 'function' ? hasCurrentStageApproval(c, 'D7') : false;
      const hasD8 = typeof hasCurrentStageApproval === 'function' ? hasCurrentStageApproval(c, 'D8') : false;

      const gate3D = c.gates?.gate3D?.status === 'Approved';
      const gate5D = c.gates?.gate5D?.status === 'Approved';
      const gate8D = c.gates?.gate8D?.status === 'Approved';

      if (!gate3D) {
        if (hasD1 && hasD2 && hasD3) return AGENT_STATES.GATE_1_PENDING;
        return AGENT_STATES.IDLE;
      }

      if (!gate5D) {
        if (hasD4 && hasD5) return AGENT_STATES.GATE_2_PENDING;
        return AGENT_STATES.SPRINT_2_RUNNING;
      }

      if (!gate8D) {
        if (hasD6 && hasD7 && hasD8) return AGENT_STATES.GATE_3_PENDING;
        return AGENT_STATES.SPRINT_3_RUNNING;
      }

      return AGENT_STATES.COMPLETED;
    }

    
    /* ----------------------------------------------------------------------- */
    /* HUMAN REVISION REQUEST (RECORDED ONLY — NO AUTOMATIC DATA CHANGES)      */
    /* ----------------------------------------------------------------------- */
    openRevisionModal(gateKey) {
      const modal = document.getElementById('globalModal');
      const container = document.getElementById('modalContainer');
      if (!modal || !container) return;

      container.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; border-bottom:1px solid var(--border); padding-bottom:10px;">
          <div style="display:flex; align-items:center; gap:8px;">
            <i data-lucide="edit-3" style="color:#f59e0b; width:18px; height:18px;"></i>
            <h3 style="margin:0; font-size:1.05rem; font-weight:800; color:var(--text-primary);">보완 요청 기록</h3>
          </div>
          <button type="button" class="btn btn-secondary btn-xs" onclick="document.getElementById('globalModal').style.display='none'">✕</button>
        </div>
        <p style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:12px;">
          보완이 필요한 내용을 기록합니다. 이 요청은 Case에 기록만 되며, 수량·시험 결과·조치 상태는 자동으로 바뀌지 않습니다. 담당자가 해당 단계에서 실제 근거를 확인해 직접 수정해야 합니다.
        </p>

        <div style="margin-bottom:16px;">
          <label style="font-size:0.75rem; font-weight:700; color:var(--text-primary); margin-bottom:6px; display:block;">보완 요청 내용</label>
          <textarea id="revisionCommentInput" class="form-control" rows="4" style="width:100%; font-size:0.8rem; background:var(--bg-card-subtle); border:1px solid var(--border); color:var(--text-primary); border-radius:6px; padding:8px;"></textarea>
        </div>

        <div style="display:flex; justify-content:flex-end; gap:8px;">
          <button type="button" class="btn btn-secondary btn-sm" onclick="document.getElementById('globalModal').style.display='none'">취소</button>
          <button type="button" class="btn btn-warning btn-sm" style="font-weight:700;" onclick="window.ramosAgent.submitHumanRevision('${gateKey}', document.getElementById('revisionCommentInput').value)">
            <i data-lucide="send" style="width:13px;height:13px;"></i> 보완 요청 기록
          </button>
        </div>
      `;
      modal.style.display = 'flex';
      if (window.lucide) lucide.createIcons();
    }

    submitHumanRevision(gateKey, comment) {
      const text = String(comment || '').trim();
      if (!text) {
        alert('보완 요청 내용을 입력해 주세요.');
        return;
      }
      const c = getActiveCase();
      if (!c) return;

      const modal = document.getElementById('globalModal');
      if (modal) modal.style.display = 'none';

      // Record the request only. Quantities, findings and action status stay as the owner entered them.
      c.revisionRequests = Array.isArray(c.revisionRequests) ? c.revisionRequests : [];
      c.revisionRequests.push({
        gateKey,
        comment: text,
        requestedAt: new Date().toISOString(),
        requestedBy: { name: CURRENT_USER?.name || '', email: CURRENT_USER?.email || '' },
        status: 'Open'
      });
      window.QMS_SAVE_REASON = `Revision request recorded for ${c.id} ${gateKey}`;
      saveAppData();
      this.log(`👤 [보완 요청 기록] ${gateKey}: 담당자의 실제 확인과 수정이 필요합니다.`, 'warn', 'auditor');
      renderCurrentView();
    }

    /* ----------------------------------------------------------------------- */
    /* SPRINT 1: D1 ~ D3 AUTONOMOUS SYNTHESIS                                  */
    /* ----------------------------------------------------------------------- */
    async runSprint1(c) {
      if (this.isExecuting) return;
      this.isExecuting = true;
      this.log(`🚀 [Sprint 1: 즉시 봉쇄 에이전트] 가동 시작 — 클레임 ID: ${c.id}`, 'primary');
      this.updateHudUi();

      try {
        await this.sleep(this.stepDelayMs);
        this.log(`🤖 [TriageAgent ➔ ContainmentGuard] ${c.customer || '고객'} 접수 데이터 분석 개시: ${c.claimTitle || c.product || c.id}`, 'agent', 'triage');
        const draft = await QMSApi.generateD1D3Draft(c);
        this.applySafeD1D3Draft(c, draft);

        await this.sleep(this.stepDelayMs);
        this.log('📝 [TriageAgent] 접수 사실 기반 5W2H 및 Is/Is-Not 검토 초안 생성 완료', 'agent', 'triage');

        await this.sleep(this.stepDelayMs);
        this.log('🛡️ [ContainmentGuard ➔ AuditorAgent] 실제 수량·Evidence 입력 전 상태의 봉쇄조치 제안 생성 완료', 'agent', 'containment');

        // 1. Save synthesized business data first
        saveAppData();

        await this.sleep(this.stepDelayMs);
        this.log('⏸️ 👤 [D1~D3 사람 검토 대기] AI는 초안만 작성했습니다. 담당자가 실제 ERP/MES/WMS 수량과 Evidence를 확인한 뒤 단계별 결재를 진행해야 합니다.', 'warn', 'auditor');
      } catch (err) {
        this.log(`❌ Sprint 1 오류 발생: ${err.message}`, 'error');
        console.error(err);
      } finally {
        this.isExecuting = false;
        renderCurrentView();
      }
    }

    /* ----------------------------------------------------------------------- */
    /* SYNTHESIS ENGINES (DATA GENERATORS COMPLIANT WITH APPROVAL.JS)           */
    /* ----------------------------------------------------------------------- */
    applySafeD1D3Draft(c, draft) {
      if (!draft || draft.caseId !== c.id) throw new Error('서버 초안의 Case ID가 일치하지 않습니다.');
      const recommendations = typeof getAICFTRecommendations === 'function' ? getAICFTRecommendations(c) : [];
      c.team = recommendations.map(rec => ({
        role: rec.role,
        name: `${rec.member.name} ${rec.member.position || ''}`.trim(),
        dept: rec.member.dept,
        contact: rec.member.email,
        status: 'AI Suggested - Human Review Required',
        recommendationReason: rec.reason
      }));
      c.cftRecommendation = {
        recommendedAt: draft.generatedAt,
        engine: draft.engine,
        humanConfirmed: false,
        status: 'Human Review Required',
        basis: draft.d1?.recommendationBasis || []
      };
      c.cftRaci = { acknowledged: false, roles: {} };

      const d2 = ensureD2Structure(c);
      Object.assign(d2, draft.d2 || {});
      d2.approval = { status: 'Draft', humanConfirmed: false };

      const d3 = ensureD3Structure(c);
      Object.assign(d3, {
        lotScope: draft.d3?.lotScope || d3.lotScope,
        materialFlow: [],
        actions: Array.isArray(draft.d3?.actions) ? draft.d3.actions : [],
        effectiveness: draft.d3?.effectiveness || {
          noAdditionalClaim:'pending', lineStable:'pending', stockReconciled:'pending', verificationEvidence:''
        },
        effectivenessStatement: '',
        sourceReferences: draft.d3?.sourceReferences || [],
        approval: { status: 'Draft', humanConfirmed: false }
      });
      c.currentStage = 'D1';
      c.agentDraftMeta = {
        scope: 'D1-D3',
        generatedAt: draft.generatedAt,
        engine: draft.engine,
        guardrails: draft.guardrails,
        confirmedFacts: draft.confirmedFacts || [],
        missingInformation: draft.missingInformation || [],
        status: 'Human Review Required'
      };
      window.QMS_SAVE_REASON = `AI D1-D3 review draft generated for ${c.id}`;
    }

    /* ----------------------------------------------------------------------- */
    /* RENDER AUTONOMOUS AGENT HUD (COMPACT SLIM MINI-HUD FOR DAILY WORKSPACE) */
    /* ----------------------------------------------------------------------- */
    renderHud(c) {
      if (!c) return '';
      const state = this.getPipelineState(c);

      const isGate1Pending = state === AGENT_STATES.GATE_1_PENDING;
      const isGate2Pending = state === AGENT_STATES.GATE_2_PENDING;
      const isGate3Pending = state === AGENT_STATES.GATE_3_PENDING;
      const isCompleted = state === AGENT_STATES.COMPLETED;

      let statusBadgeClass = 'badge-idle';
      let statusText = '대기 중';
      if (this.isExecuting) {
        statusBadgeClass = 'badge-running';
        statusText = '⚡ AI 자율 가동 중';
      } else if (isCompleted) {
        statusBadgeClass = 'badge-done';
        statusText = '🎉 8D 완결 종결';
      } else if (isGate1Pending) {
        statusBadgeClass = 'badge-waiting';
        statusText = '👤 Gate 1 (3D) 결재 대기';
      } else if (isGate2Pending) {
        statusBadgeClass = 'badge-waiting';
        statusText = '👤 Gate 2 (5D) 결재 대기';
      } else if (isGate3Pending) {
        statusBadgeClass = 'badge-waiting';
        statusText = '👤 Gate 3 (8D) 결재 대기';
      }

      return `
        <div class="agent-mini-hud no-print" id="agentAutonomousHud">
          <!-- Left: Compact Status Pill -->
          <div class="mini-hud-left">
            <span class="mini-hud-pulse ${this.isExecuting ? 'pulsing' : (isCompleted ? 'completed' : 'ready')}"></span>
            <span class="mini-hud-title">🤖 자율 8D AI:</span>
            <span class="agent-hud-badge ${statusBadgeClass}">${statusText}</span>
          </div>

          <!-- Center/Right: Action Buttons & Links -->
          <div class="mini-hud-actions">
            ${state === AGENT_STATES.IDLE ? `
              <button type="button" class="btn btn-primary btn-xs" onclick="window.ramosAgent.startPipeline()" ${this.isExecuting ? 'disabled' : ''}>
                <i data-lucide="play" style="width:12px;height:12px;"></i> 🚀 Sprint 1 가동 (D1~D3)
              </button>
            ` : ''}

            ${isGate1Pending ? `
              <button type="button" class="btn btn-warning btn-xs" onclick="switchNav('reports-hub');setGateTab('gate3D')">
                <i data-lucide="stamp" style="width:12px;height:12px;"></i> 👤 Gate 1 결재 화면
              </button>
              <button type="button" class="btn btn-secondary btn-xs" onclick="window.ramosAgent.openRevisionModal('gate3D')" title="AI에게 지적사항 전달 및 자가교정 요청">
                <i data-lucide="edit-3" style="width:11px;height:11px;"></i> 보완요청
              </button>
            ` : ''}

            ${isGate2Pending ? `
              <button type="button" class="btn btn-warning btn-xs" onclick="switchNav('reports-hub');setGateTab('gate5D')">
                <i data-lucide="stamp" style="width:12px;height:12px;"></i> 👤 Gate 2 결재 화면
              </button>
              <button type="button" class="btn btn-secondary btn-xs" onclick="window.ramosAgent.openRevisionModal('gate5D')" title="AI에게 지적사항 전달 및 자가교정 요청">
                <i data-lucide="edit-3" style="width:11px;height:11px;"></i> 보완요청
              </button>
            ` : ''}

            ${isGate3Pending ? `
              <button type="button" class="btn btn-success btn-xs" onclick="switchNav('reports-hub');setGateTab('gate8D')">
                <i data-lucide="award" style="width:12px;height:12px;"></i> 🏛️ Gate 3 결재 화면
              </button>
              <button type="button" class="btn btn-secondary btn-xs" onclick="window.ramosAgent.openRevisionModal('gate8D')" title="AI에게 지적사항 전달 및 자가교정 요청">
                <i data-lucide="edit-3" style="width:11px;height:11px;"></i> 보완요청
              </button>
            ` : ''}

            ${isCompleted ? `
              <button type="button" class="btn btn-secondary btn-xs" onclick="switchNav('reports-hub'); setGateTab('gate8D');">
                <i data-lucide="file-check" style="width:12px;height:12px;color:#10b981;"></i> 📄 최종 보고서
              </button>
            ` : ''}

            <label class="mini-hud-toggle" title="서버 로그인 계정 기반 실제 결재 모드">
              <input type="checkbox" disabled>
              <span>🔐 실제 결재</span>
            </label>

            <button type="button" class="btn btn-xs btn-secondary" onclick="window.ramosAgent.resetToCleanSlate()" title="D1~D8 데이터 백지로 리셋">
              <i data-lucide="trash-2" style="width:11px;height:11px;"></i> 리셋
            </button>

            <button type="button" class="btn btn-xs btn-secondary" onclick="switchNav('mission-control')" title="전체 화면 전용 미션 컨트롤 관제탑 열기">
              <i data-lucide="monitor" style="width:11px;height:11px;"></i> 미션 컨트롤 ➔
            </button>

            <button type="button" class="btn btn-xs btn-secondary" onclick="window.ramosAgent.toggleMiniTerminal()" title="실행 터미널 로그 펼치기/접기">
              <i data-lucide="terminal" style="width:11px;height:11px;"></i> <span>${this.miniTerminalOpen ? '▲ 로그 닫기' : '▼ 로그'}</span>
            </button>
          </div>
        </div>

        ${this.miniTerminalOpen ? `
          <div class="agent-mini-terminal-drawer no-print" id="agentMiniTerminalDrawer">
            <div class="agent-terminal-header">
              <span style="display:flex; align-items:center; gap:6px;">
                <span class="terminal-dot red"></span>
                <span class="terminal-dot yellow"></span>
                <span class="terminal-dot green"></span>
                <span style="color:#94a3b8; font-weight:700; font-size:0.7rem; margin-left:6px;">AI Agent Reasoning & Execution Log Stream</span>
              </span>
              <span style="font-size:0.65rem; color:#60a5fa;">Realtime Engine</span>
            </div>
            <div class="agent-terminal-logs" id="agentHudLogStream" style="max-height:130px;">
              ${this.renderLogLines()}
            </div>
          </div>
        ` : ''}
      `;
    }

    /* ----------------------------------------------------------------------- */
    /* RENDER DEDICATED MISSION CONTROL COCKPIT VIEW                           */
    /* ----------------------------------------------------------------------- */
    renderMissionControlView(c) {
      if (!c) return '<div class="p-4">Active Case Not Found</div>';
      const state = this.getPipelineState(c);

      const isGate1Pending = state === AGENT_STATES.GATE_1_PENDING;
      const isGate2Pending = state === AGENT_STATES.GATE_2_PENDING;
      const isGate3Pending = state === AGENT_STATES.GATE_3_PENDING;
      const isCompleted = state === AGENT_STATES.COMPLETED;

      let statusBadgeClass = 'badge-idle';
      let statusText = '대기 중';
      if (this.isExecuting) {
        statusBadgeClass = 'badge-running';
        statusText = '⚡ AI 자율 가동 중';
      } else if (isCompleted) {
        statusBadgeClass = 'badge-done';
        statusText = '🎉 8D 완결 종결';
      } else if (isGate1Pending) {
        statusBadgeClass = 'badge-waiting';
        statusText = '👤 Gate 1 인간 결재 대기';
      } else if (isGate2Pending) {
        statusBadgeClass = 'badge-waiting';
        statusText = '👤 Gate 2 인간 결재 대기';
      } else if (isGate3Pending) {
        statusBadgeClass = 'badge-waiting';
        statusText = '👤 Gate 3 인간 결재 대기';
      }

      return `
        <div class="mission-control-view no-print">
          <!-- Hero Banner -->
          ${renderQmsPageHeader({title:'AI 8D 미션 컨트롤',icon:isCompleted ? 'award' : 'bot',description:'3개 Sprint의 초안 진행 상태와 실제 담당자의 Gate 검토·승인을 확인합니다.',badges:[{label:statusText,tone:isCompleted ? 'success' : this.isExecuting ? 'info' : 'neutral'}],actions:`            <div class="hero-actions">
              <button type="button" class="btn btn-secondary btn-sm" onclick="window.ramosAgent.resetToCleanSlate()" title="D1~D8 데이터 백지로 리셋">
                <i data-lucide="trash-2" style="width:13px;height:13px;"></i> 작성 내용 초기화
              </button>

              <label class="agent-toggle-label" title="화면 사용자 전환과 자동 결재가 차단된 운영 모드">
                <input type="checkbox" checked disabled>
                <span>🔐 중앙 인증 · 실제 결재 모드</span>
              </label>

              ${state === AGENT_STATES.IDLE ? `
                <button type="button" class="btn btn-primary btn-sm" onclick="window.ramosAgent.startPipeline()" ${this.isExecuting ? 'disabled' : ''} style="font-weight:700;">
                  <i data-lucide="play" style="width:14px;height:14px;"></i> 🚀 AI 자율 8D 에이전트 시작 (Sprint 1)
                </button>
              ` : ''}

              ${isGate1Pending ? `
                <button type="button" class="btn btn-warning btn-sm" onclick="switchNav('reports-hub');setGateTab('gate3D')" style="font-weight:700;">
                  <i data-lucide="stamp" style="width:14px;height:14px;"></i> 👤 Gate 1 실제 결재 센터로 이동
                </button>
                <button type="button" class="btn btn-secondary btn-sm" onclick="window.ramosAgent.openRevisionModal('gate3D')" style="border-color:#f59e0b; color:#fbbf24;">
                  <i data-lucide="edit-3" style="width:13px;height:13px;"></i> ✍️ 인간 보완 요구
                </button>
              ` : ''}

              ${isGate2Pending ? `
                <button type="button" class="btn btn-warning btn-sm" onclick="switchNav('reports-hub');setGateTab('gate5D')" style="font-weight:700;">
                  <i data-lucide="stamp" style="width:14px;height:14px;"></i> 👤 Gate 2 실제 결재 센터로 이동
                </button>
                <button type="button" class="btn btn-secondary btn-sm" onclick="window.ramosAgent.openRevisionModal('gate5D')" style="border-color:#f59e0b; color:#fbbf24;">
                  <i data-lucide="edit-3" style="width:13px;height:13px;"></i> ✍️ 인간 보완 요구
                </button>
              ` : ''}

              ${isGate3Pending ? `
                <button type="button" class="btn btn-success btn-sm" onclick="switchNav('reports-hub');setGateTab('gate8D')" style="font-weight:700;">
                  <i data-lucide="award" style="width:14px;height:14px;"></i> 🏛️ Gate 3 실제 결재 센터로 이동
                </button>
                <button type="button" class="btn btn-secondary btn-sm" onclick="window.ramosAgent.openRevisionModal('gate8D')" style="border-color:#10b981; color:#34d399;">
                  <i data-lucide="edit-3" style="width:13px;height:13px;"></i> ✍️ 인간 보완 요구
                </button>
              ` : ''}

              <button type="button" class="btn btn-secondary btn-sm" onclick="switchNav('stage');" title="기존 8D 워크스페이스로 이동">
                <i data-lucide="arrow-left" style="width:14px;height:14px;"></i> 워크스페이스로 복귀
              </button>
            </div>`})}

          <!-- Case Context Ribbon -->
          <div class="mission-control-case-strip">
            <div class="case-meta-item"><span>클레임 ID</span><b>${c.id}</b></div>
            <div class="case-meta-item"><span>고객사</span><b>${c.customer}</b></div>
            <div class="case-meta-item"><span>대상 제품</span><b>${c.product}</b></div>
            <div class="case-meta-item"><span>생산 LOT</span><b>${c.lotNumber}</b></div>
            <div class="case-meta-item"><span>불량률</span><b style="color:#f87171;">${c.defectQty} / ${(c.inspectQty || 0).toLocaleString()}ea (${c.ppm} PPM)</b></div>
            <div class="case-meta-item"><span>진행 단계</span><b>${c.status} (${c.currentStage})</b></div>
          </div>

          <!-- Multi-Agent Orchestration Roster -->
          <div class="mission-agent-roster">
            ${MULTI_AGENT_ROSTER.map(a => `
              <div class="agent-roster-chip ${this.activeAgentId === a.id ? 'active' : ''}">
                <span class="agent-chip-dot" style="background:${a.color};"></span>
                <span class="agent-chip-name">${a.name}</span>
                <span class="agent-chip-desc">${a.desc}</span>
                <span class="agent-chip-state ${this.activeAgentId === a.id ? 'active' : ''}">${this.activeAgentId === a.id ? '⚡ ACTIVE' : 'STANDBY'}</span>
              </div>
            `).join('')}
          </div>

          <!-- 3-Sprint & 3-Gate Wide Pipeline Strip -->
          <div class="mission-control-pipeline-card">
            <div class="pipeline-header">
              <div style="display:flex; align-items:center; gap:8px;">
                <i data-lucide="git-commit" style="width:18px;height:18px;color:#38bdf8;"></i>
                <span style="font-size:0.92rem; font-weight:800; color:var(--text-primary);">3-Sprint & Human-in-the-Loop Gated Approval Rail</span>
              </div>
              <span style="font-size:0.75rem; color:#94a3b8;">AI 초안은 D1~D3만 생성합니다. D4~D8은 담당자가 실제 근거로 작성하고 각 Gate는 실제 결재자가 승인합니다</span>
            </div>

            <div class="agent-pipeline-strip wide-pipeline">
              <!-- SPRINT 1 -->
              <div class="agent-step-node ${['SPRINT_1_RUNNING','GATE_1_PENDING','SPRINT_2_RUNNING','GATE_2_PENDING','SPRINT_3_RUNNING','GATE_3_PENDING','COMPLETED'].includes(state) ? 'active' : ''} ${c.gates?.gate3D?.status === 'Approved' ? 'passed' : ''}" onclick="switchStage('D1')">
                <div class="node-icon">🤖</div>
                <div class="node-body">
                  <div class="node-title">Sprint 1 (D1 ~ D3)</div>
                  <div class="node-desc">CFT · 5W2H · 7-Area 봉쇄</div>
                </div>
              </div>

              <div class="agent-arrow ${c.gates?.gate3D?.status === 'Approved' ? 'passed' : ''}"><i data-lucide="arrow-right" style="width:14px;height:14px;"></i></div>

              <!-- GATE 1 (HUMAN) -->
              <div class="agent-gate-node ${isGate1Pending ? 'pending' : (c.gates?.gate3D?.status === 'Approved' ? 'passed' : '')}" onclick="switchNav('reports-hub'); setGateTab('gate3D');">
                <div class="gate-icon">👤</div>
                <div class="gate-body">
                  <div class="gate-title">Gate 1: Initial 3D</div>
                  <div class="gate-desc">${c.gates?.gate3D?.status === 'Approved' ? '✅ 인간 승인완료' : (isGate1Pending ? '🟡 품질책임자 결재대기' : '대기')}</div>
                </div>
              </div>

              <div class="agent-arrow ${c.gates?.gate5D?.status === 'Approved' ? 'passed' : ''}"><i data-lucide="arrow-right" style="width:14px;height:14px;"></i></div>

              <!-- SPRINT 2 -->
              <div class="agent-step-node ${['SPRINT_2_RUNNING','GATE_2_PENDING','SPRINT_3_RUNNING','GATE_3_PENDING','COMPLETED'].includes(state) ? 'active' : ''} ${c.gates?.gate5D?.status === 'Approved' ? 'passed' : ''}" onclick="switchStage('D4')">
                <div class="node-icon">🤖</div>
                <div class="node-body">
                  <div class="node-title">Sprint 2 (D4 ~ D5)</div>
                  <div class="node-desc">3-Track 5-Why · PCA 대책</div>
                </div>
              </div>

              <div class="agent-arrow ${c.gates?.gate5D?.status === 'Approved' ? 'passed' : ''}"><i data-lucide="arrow-right" style="width:14px;height:14px;"></i></div>

              <!-- GATE 2 (HUMAN) -->
              <div class="agent-gate-node ${isGate2Pending ? 'pending' : (c.gates?.gate5D?.status === 'Approved' ? 'passed' : '')}" onclick="switchNav('reports-hub'); setGateTab('gate5D');">
                <div class="gate-icon">👤</div>
                <div class="gate-body">
                  <div class="gate-title">Gate 2: Interim 5D</div>
                  <div class="gate-desc">${c.gates?.gate5D?.status === 'Approved' ? '✅ 인간 승인완료' : (isGate2Pending ? '🟡 연구소장 결재대기' : '미도달')}</div>
                </div>
              </div>

              <div class="agent-arrow ${c.gates?.gate8D?.status === 'Approved' ? 'passed' : ''}"><i data-lucide="arrow-right" style="width:14px;height:14px;"></i></div>

              <!-- SPRINT 3 -->
              <div class="agent-step-node ${['SPRINT_3_RUNNING','GATE_3_PENDING','COMPLETED'].includes(state) ? 'active' : ''} ${c.gates?.gate8D?.status === 'Approved' ? 'passed' : ''}" onclick="switchStage('D6')">
                <div class="node-icon">🤖</div>
                <div class="node-body">
                  <div class="node-title">Sprint 3 (D6 ~ D8)</div>
                  <div class="node-desc">실측검증 · 표준화 · 종결</div>
                </div>
              </div>

              <div class="agent-arrow ${c.gates?.gate8D?.status === 'Approved' ? 'passed' : ''}"><i data-lucide="arrow-right" style="width:14px;height:14px;"></i></div>

              <!-- GATE 3 (HUMAN) -->
              <div class="agent-gate-node ${isGate3Pending ? 'pending' : (isCompleted ? 'passed' : '')}" onclick="switchNav('reports-hub'); setGateTab('gate8D');">
                <div class="gate-icon">👑</div>
                <div class="gate-body">
                  <div class="gate-title">Gate 3: Final 8D</div>
                  <div class="gate-desc">${isCompleted ? '🏆 CEO/VP 전결완결' : (isGate3Pending ? '🟡 최고경영진 결재대기' : '미도달')}</div>
                </div>
              </div>
            </div>
          </div>

          <!-- Bottom 2-Column Cockpit Grid -->
          <div class="mission-control-bottom-grid">
            <!-- Left: Wide Live Terminal -->
            <div class="agent-terminal-box wide-terminal">
              <div class="agent-terminal-header">
                <span style="display:flex; align-items:center; gap:6px;">
                  <span class="terminal-dot red"></span>
                  <span class="terminal-dot yellow"></span>
                  <span class="terminal-dot green"></span>
                  <span style="color:#94a3b8; font-weight:700; font-size:0.75rem; margin-left:6px;">AI Agent Reasoning & Execution Log Stream</span>
                </span>
                <span style="font-size:0.7rem; color:#60a5fa;">Realtime Engine Connected</span>
              </div>
              <div class="agent-terminal-logs" id="agentMissionControlLogStream" style="height:320px;">
                ${this.renderLogLines()}
              </div>
            </div>

            <!-- Right: Stage Quick Jump & Verification Cards -->
            <div class="mission-control-quick-sidebar">
              <div class="mc-card">
                <div class="mc-card-title"><i data-lucide="layers" style="width:14px;height:14px;color:#38bdf8;"></i> 8D 단계별 작성 현황 바로가기</div>
                <div class="mc-stage-grid">
                  <button type="button" class="mc-stage-btn ${c.d1Complete || c.team?.length ? 'done' : ''}" onclick="switchStage('D1')">D1 팀구성 (${c.team?.length || 0}명)</button>
                  <button type="button" class="mc-stage-btn ${c.d2?.problemStatement ? 'done' : ''}" onclick="switchStage('D2')">D2 문제정의 (5W2H)</button>
                  <button type="button" class="mc-stage-btn ${c.d3?.materialFlow?.length ? 'done' : ''}" onclick="switchStage('D3')">D3 재고봉쇄 (${c.d3?.materialFlow?.length || 0}개역)</button>
                  <button type="button" class="mc-stage-btn ${c.d4?.selectedTools?.length ? 'done' : ''}" onclick="switchStage('D4')">D4 5대도구 원인분석</button>
                  <button type="button" class="mc-stage-btn ${c.d5?.candidates?.length ? 'done' : ''}" onclick="switchStage('D5')">D5 영구대책 (PCA)</button>
                  <button type="button" class="mc-stage-btn ${c.d6?.validationTests?.length ? 'done' : ''}" onclick="switchStage('D6')">D6 효과성 검증</button>
                  <button type="button" class="mc-stage-btn ${c.d7?.systemUpdates?.length ? 'done' : ''}" onclick="switchStage('D7')">D7 표준개정 & Yokoten</button>
                  <button type="button" class="mc-stage-btn ${c.d8?.checklist?.length ? 'done' : ''}" onclick="switchStage('D8')">D8 5대체크리스트 종결</button>
                </div>
              </div>

              <div class="mc-card" style="margin-top:10px;">
                <div class="mc-card-title"><i data-lucide="file-check-2" style="width:14px;height:14px;color:#34d399;"></i> 공식 3단계 리포트 발행 현황</div>
                <div style="display:flex; flex-direction:column; gap:6px; font-size:0.75rem;">
                  <div style="display:flex; justify-content:space-between; align-items:center; padding:6px 10px; background:var(--bg-card-subtle); border-radius:6px;">
                    <span><b>Initial 3D Report</b> (초동 봉쇄)</span>
                    <span class="badge-pill ${c.gates?.gate3D?.status === 'Approved' ? 'badge-pass' : 'badge-idle'}">${c.gates?.gate3D?.status === 'Approved' ? '승인완료' : '미승인'}</span>
                  </div>
                  <div style="display:flex; justify-content:space-between; align-items:center; padding:6px 10px; background:var(--bg-card-subtle); border-radius:6px;">
                    <span><b>Interim 5D Report</b> (원인/PCA)</span>
                    <span class="badge-pill ${c.gates?.gate5D?.status === 'Approved' ? 'badge-pass' : 'badge-idle'}">${c.gates?.gate5D?.status === 'Approved' ? '승인완료' : '미승인'}</span>
                  </div>
                  <div style="display:flex; justify-content:space-between; align-items:center; padding:6px 10px; background:var(--bg-card-subtle); border-radius:6px;">
                    <span><b>Final 8D Report</b> (완결 종결)</span>
                    <span class="badge-pill ${c.gates?.gate8D?.status === 'Approved' ? 'badge-pass' : 'badge-idle'}">${c.gates?.gate8D?.status === 'Approved' ? '전결완결' : '미승인'}</span>
                  </div>
                </div>
                <button type="button" class="btn btn-secondary btn-sm" style="width:100%; margin-top:8px;" onclick="switchNav('reports-hub')">
                  <i data-lucide="printer" style="width:13px;height:13px;"></i> 전체 8D 리포트 센터 바로가기
                </button>
              </div>
            </div>
          </div>
        </div>
      `;
    }

    renderLogLines() {
      if (!this.logs || !this.logs.length) {
        return `<div class="agent-log-line info"><span class="log-time">[${new Date().toTimeString().split(' ')[0]}]</span><span class="log-msg">에이전트 대기 중. [🚀 AI 자율 8D 에이전트 시작] 버튼을 누르면 Sprint 1이 자동 가동됩니다.</span></div>`;
      }
      return this.logs.map(l => `
        <div class="agent-log-line ${l.type}">
          <span class="log-time">[${l.timestamp}]</span>
          <span class="log-msg">${l.message}</span>
        </div>
      `).join('');
    }

    toggleMiniTerminal() {
      this.miniTerminalOpen = !this.miniTerminalOpen;
      renderCurrentView();
    }

    updateHudUi() {
      const targets = [
        document.getElementById('agentHudLogStream'),
        document.getElementById('agentMissionControlLogStream'),
        document.getElementById('agentSidePanelLogStream')
      ];
      const html = this.renderLogLines();
      targets.forEach(el => {
        if (el) {
          el.innerHTML = html;
          el.scrollTop = el.scrollHeight;
        }
      });
    }

    resetToCleanSlate() {
      const c = getActiveCase();
      if (!c) return;
      // Approval and dispatch records are audit evidence; a draft reset must never erase them.
      const hasApproval = Object.values(c.signOffHistory || {}).some(entry => entry?.status === 'Approved')
        || Object.values(c.gates || {}).some(gate => gate?.status === 'Approved' || gate?.internalApproved);
      if (c.status === 'Closed' || hasApproval) {
        alert('결재 또는 종결 기록이 있는 Case는 초기화할 수 없습니다.');
        return;
      }
      if (!confirm(`${c.id}의 D1~D8 작성 내용과 Evidence 목록을 모두 지웁니다. 계속하시겠습니까?`)) return;

      c.status = 'In Progress';
      c.currentStage = 'D1';
      delete c.gates;
      ensureCaseGates(c);
      c.signOffHistory = {};
      c.approvalReviewFrom = null;
      c.approvalAudit = [];
      c.team = [];
      c.cftRecommendation = { humanConfirmed: false, status: 'Draft' };
      c.cftRaci = { acknowledged: false };

      if (typeof QUALITY_STAGES !== 'undefined') {
        QUALITY_STAGES.forEach(s => {
          const key = s.toLowerCase();
          if (c[key]) {
            c[key].approval = { status: 'Draft', humanConfirmed: false };
          }
        });
      }

      c.d2 = {
        problemStatement: '',
        problemWhat: '',
        problemWhere: '',
        problemWhen: '',
        problemWho: '',
        problemWhich: '',
        problemHow: '',
        problemHowMany: '',
        isIsNot: [],
        hypotheses: []
      };
      c.d3 = { materialFlow: [], actions: [], effectivenessStatement: '' };
      c.d4 = { faMatrix: [], occurrence5Why: [], escape5Why: [], systemic5Why: [], candidateCauses: [] };
      c.d5 = { candidates: [] };
      c.d6 = { validationTests: [] };
      c.d7 = { systemUpdates: [], horizontalDeployment: [] };
      c.d8 = { checklist: [], approvalFlow: [] };
      c.evidenceList = [];

      saveAppData();
      this.logs = [];
      this.log('D1~D8 작성 내용을 초기화했습니다. 접수 정보만 남아 있습니다.', 'primary');
      renderCurrentView();
    }

    startPipeline() {
      const c = getActiveCase();
      if (!c) return;
      if (c.status === 'Closed' || c.gates?.gate8D?.status === 'Approved') {
        alert('종결된 Case에서는 AI 초안을 다시 생성할 수 없습니다.');
        return;
      }
      this.runSprint1(c);
    }
  }

  // Global Singleton Instance
  window.Autonomous8DAgent = Autonomous8DAgent;
  window.ramosAgent = new Autonomous8DAgent();

})(window);
