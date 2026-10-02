/* ========================================================================= */
/* RAMOS AUTONOMOUS 3-SPRINT 8D AI AGENT WITH HUMAN-IN-THE-LOOP GATED RAIL  */
/* AI 에이전틱 경진대회 전용: 3-Sprint 자율 파이프라인 & 인간 결재 레일      */
/* ========================================================================= */

(function(window) {
  'use strict';

  // Agent Execution States
  
  const MULTI_AGENT_ROSTER = [
    { id: 'triage', name: 'Triage & CFT Matcher', short: 'Triage', icon: 'users', color: '#38bdf8', desc: '인사/조직도 기반 8대 CFT 최적 편성' },
    { id: 'containment', name: 'Containment Guard', short: 'Containment', icon: 'shield-alert', color: '#f59e0b', desc: 'ERP/MES 7개 거점 60,000ea 재고 격리' },
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
      this.autoDemoMode = false; // When true, automatically signs human gates for fast 15s contest demos
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
    /* HUMAN-IN-THE-LOOP SELF-CORRECTION (REVISION REQUEST & AI RE-SYNTHESIS)   */
    /* ----------------------------------------------------------------------- */
    openRevisionModal(gateKey) {
      const presets = {
        gate3D: [
          'D3 베트남 외주 라인(VN-PKG) 5,000ea 재고 누락됨. 추가 격리 및 봉쇄표 갱신 요망',
          '고객사 평택 공장 1라인 잔여 재고 1,200ea 긴급 선별 결과 반영 요망'
        ],
        gate5D: [
          'D4 5-Why 발생원인에 EMC 2차 경화 온도(175℃) 편차 실측치 보완 요망',
          'D5 PCA에 4M 변경(ECN)에 따른 고객사 LGE 사전 승인 일정 명시 요망'
        ],
        gate8D: [
          'D7 수평전개(Yokoten) 대상에 구미 전장 모듈 라인 추가 요망',
          'D8 5대 체크리스트 중 잔여 리스크 평가 수치(RPN) 재검토 요망'
        ]
      };

      const modal = document.getElementById('globalModal');
      const container = document.getElementById('modalContainer');
      if (!modal || !container) return;

      const list = presets[gateKey] || presets.gate3D;
      container.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; border-bottom:1px solid var(--border); padding-bottom:10px;">
          <div style="display:flex; align-items:center; gap:8px;">
            <i data-lucide="edit-3" style="color:#f59e0b; width:18px; height:18px;"></i>
            <h3 style="margin:0; font-size:1.05rem; font-weight:800; color:var(--text-primary);">👤 인간 결재권자 보완 요구 (Revision Request)</h3>
          </div>
          <button type="button" class="btn btn-secondary btn-xs" onclick="document.getElementById('globalModal').style.display='none'">✕</button>
        </div>
        <p style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:12px;">
          결재를 일시 반려하고 AI 에이전트에게 보완 지시를 전달합니다. <b>AI 자가교정(Self-Correction) 엔진</b>이 피드백을 수용하여 자동으로 데이터를 갱신합니다.
        </p>

        <div style="margin-bottom:12px;">
          <label style="font-size:0.75rem; font-weight:700; color:var(--text-primary); margin-bottom:6px; display:block;">⚡ 빠른 시연용 지적사항 프리셋 (1-Click Preset):</label>
          <div style="display:flex; flex-direction:column; gap:6px;">
            ${list.map(p => `
              <button type="button" class="btn btn-secondary btn-xs" style="text-align:left; justify-content:flex-start; padding:6px 10px;" onclick="document.getElementById('revisionCommentInput').value = '${p.replace(/'/g, "\\'")}';">
                👉 ${p}
              </button>
            `).join('')}
          </div>
        </div>

        <div style="margin-bottom:16px;">
          <label style="font-size:0.75rem; font-weight:700; color:var(--text-primary); margin-bottom:6px; display:block;">보완 지시 내용 (Feedback Directive):</label>
          <textarea id="revisionCommentInput" class="form-control" rows="3" style="width:100%; font-size:0.8rem; background:var(--bg-card-subtle); border:1px solid var(--border); color:var(--text-primary); border-radius:6px; padding:8px;">${list[0]}</textarea>
        </div>

        <div style="display:flex; justify-content:flex-end; gap:8px;">
          <button type="button" class="btn btn-secondary btn-sm" onclick="document.getElementById('globalModal').style.display='none'">취소</button>
          <button type="button" class="btn btn-warning btn-sm" style="font-weight:700;" onclick="window.ramosAgent.submitHumanRevision('${gateKey}', document.getElementById('revisionCommentInput').value)">
            <i data-lucide="send" style="width:13px;height:13px;"></i> 보완 지시 전달 & AI 자가교정 기동
          </button>
        </div>
      `;
      modal.style.display = 'flex';
      if (window.lucide) lucide.createIcons();
    }

    async submitHumanRevision(gateKey, comment) {
      const modal = document.getElementById('globalModal');
      if (modal) modal.style.display = 'none';

      const c = getActiveCase();
      if (!c) return;

      this.isExecuting = true;
      this.log(`👤 ⏸️ [인간 결재권자 보완 요청] 지적 사항: "${comment}"`, 'warn', 'auditor');
      this.updateHudUi();

      await this.sleep(600);
      this.log(`🧠 [자가교정 엔진 (Self-Correction)] 인간 피드백 수신 및 지적 항목 정밀 분석 중...`, 'agent', 'auditor');

      await this.sleep(700);

      if (gateKey === 'gate3D') {
        this.log(`🛡️ [ContainmentGuard ➔ AuditorAgent] 베트남 현지 외주 라인 5,000ea 긴급 추적 격리 및 7-Area 봉쇄표 갱신 완료`, 'success', 'containment');
        c.d3 = c.d3 || {};
        c.d3.materialFlow = c.d3.materialFlow || [];
        const alreadyHasVn = c.d3.materialFlow.some(m => String(m.location || '').includes('베트남'));
        if (!alreadyHasVn) {
          c.d3.materialFlow.push({
            location: '베트남 하노이 외주 거점 (VN-PKG)',
            lotNumber: `${c.lotNumber}-VN`,
            quantity: 5000,
            status: '봉쇄완료',
            action: '긴급 Lot Hold 및 출하 차단'
          });
        }
        c.d3.totalContainedQty = c.d3.materialFlow.reduce((acc, curr) => acc + (Number(curr.quantity) || 0), 0);
        c.d3.selfCorrectionApplied = true;
        c.d3.humanFeedbackLog = comment;
        saveAppData();
      } else if (gateKey === 'gate5D') {
        this.log(`🔬 [ForensicAgent ➔ QualityDirector] 리플로우 피크 262℃ 과열 조건 및 EMC 경화 편차 5-Why 매트릭스 보완 완료`, 'success', 'forensic');
        if (c.d4?.selectedTools) {
          const fw = c.d4.selectedTools.find(t => t.id === 'five-why');
          if (fw) fw.finding += ' (인간 피드백 반영: 오븐 존7 열전대 TC 교정 오차 정밀 실측치 추가 입증)';
        }
        c.d4 = c.d4 || {};
        c.d4.selfCorrectionApplied = true;
        c.d4.humanFeedbackLog = comment;
        saveAppData();
      } else if (gateKey === 'gate8D') {
        this.log(`📚 [AuditorAgent ➔ CEO] 구미 전장 DTV 형제 라인 수평전개(Yokoten) 추가 등록 완료`, 'success', 'auditor');
        if (c.d7?.horizontalDeployment) {
          c.d7.horizontalDeployment.push({
            id: 'D7-HD-02',
            actionId: 'D5-PCA-OCCUR-01',
            product: 'DTV eMMC 5.1 32GB (구미 전장 1라인)',
            sameRisk: '동일 질소 리플로우 7번 존 오차 가능성',
            action: '무선 KIC 프로파일러 및 자동 인터락 수평전개 적용',
            owner: '이은산 센터장_상무',
            status: 'Completed',
            evidence: '구미 전장 라인 적용 완료 보고서 (EV-D7-HD02)'
          });
        }
        c.d7 = c.d7 || {};
        c.d7.selfCorrectionApplied = true;
        c.d7.humanFeedbackLog = comment;
        saveAppData();
      }

      await this.sleep(600);
      this.log(`✅ [자가교정 완결] 인간 피드백이 100% 반영되었습니다. 재승인 대기 상태로 복귀합니다.`, 'success', 'auditor');
      this.isExecuting = false;
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
        if (this.autoDemoMode && window.RAMOS_ENABLE_LEGACY_DEMO === true) {
          await this.sleep(1200);
          await this.executeHumanSignOff('gate3D');
        }
      }
    }

    /* ----------------------------------------------------------------------- */
    /* SPRINT 2: D4 ~ D5 AUTONOMOUS SYNTHESIS                                  */
    /* ----------------------------------------------------------------------- */
    async runSprint2(c) {
      if (this.isExecuting) return;
      this.isExecuting = true;
      this.log(`🚀 [Sprint 2: 근본원인 규명 & 영구대책 에이전트] 가동 시작`, 'primary');
      this.updateHudUi();

      try {
        await this.sleep(this.stepDelayMs);
        this.log('🔬 [ForensicAgent] 3-Track(발생·유출·시스템) 5-Why 및 5대 필수 도구 실증 매트릭스 도출 개시', 'agent', 'forensic');
        this.synthesizeD4(c);

        await this.sleep(this.stepDelayMs);
        this.log('🛠️ [ForensicAgent ➔ Manufacturing] 영구 시정조치(PCA) 3종 확정 및 ECN/PCN 고객 승인 프로세스 연동', 'agent', 'forensic');
        this.synthesizeD5(c);

        // 1. Save business data first
        saveAppData();

        // 2. Sign D4, D5
        await this.sleep(this.stepDelayMs);
        this.log('📋 [AuditorAgent ➔ R&DDirector] 공학적 원인 규명 및 PCA 리스크 평가 완료. Gate 2 승인 요청.', 'success', 'auditor');
        this.signStageInternal(c, 'D4');
        this.signStageInternal(c, 'D5');

        // 3. Save sign-offs
        saveAppData();

        this.log('⏸️ 👤 [Gate 2 (Interim 5D) 결재 대기] 원인·영구대책 수립 완료. 연구소장/품질책임자 공식 서명을 대기합니다.', 'warn', 'auditor');
      } catch (err) {
        this.log(`❌ Sprint 2 오류 발생: ${err.message}`, 'error');
        console.error(err);
      } finally {
        this.isExecuting = false;
        renderCurrentView();
        if (this.autoDemoMode && window.RAMOS_ENABLE_LEGACY_DEMO === true) {
          await this.sleep(1200);
          await this.executeHumanSignOff('gate5D');
        }
      }
    }

    /* ----------------------------------------------------------------------- */
    /* SPRINT 3: D6 ~ D8 AUTONOMOUS SYNTHESIS                                  */
    /* ----------------------------------------------------------------------- */
    async runSprint3(c) {
      if (this.isExecuting) return;
      this.isExecuting = true;
      this.log(`🚀 [Sprint 3: 효과성 검증 & 표준화 재발방지 & 영구종결 에이전트] 가동 시작`, 'primary');
      this.updateHudUi();

      try {
        await this.sleep(this.stepDelayMs);
        this.log('📊 [AuditorAgent] 양산 적용 후 TC1000h 가속수명(3,000ea 무결점, Cpk 1.84) 실측 검증 완료', 'agent', 'auditor');
        this.synthesizeD6(c);

        await this.sleep(this.stepDelayMs);
        this.log('📚 [ForensicAgent] 사내 표준 개정(SOP-PKG-402, PFMEA RPN 252➔14) 및 형제 라인 수평전개(Yokoten) 등록', 'agent', 'forensic');
        this.synthesizeD7(c);

        await this.sleep(this.stepDelayMs);
        this.log('🏆 [AuditorAgent ➔ Executive] 5대 종결 체크리스트 완료 및 8D 팀 공로 포상 품의 확정', 'agent', 'auditor');
        this.synthesizeD8(c);

        // 1. Save business data first
        saveAppData();

        // 2. Sign D6, D7, D8
        await this.sleep(this.stepDelayMs);
        this.log('👑 [AuditorAgent ➔ CEO] 전 단계 검증 완료. 최고경영진(CEO/QA VP) 최종 결재 및 공식 종결 요청.', 'success', 'auditor');
        this.signStageInternal(c, 'D6');
        this.signStageInternal(c, 'D7');
        this.signStageInternal(c, 'D8');

        // 3. Save sign-offs
        saveAppData();

        this.log('⏸️ 👤 [Gate 3 (Final 8D) 결재 대기] 전 단계 검증 완료. 최고경영진(CEO/QA VP) 최종 결재 및 고객사 송부를 대기합니다.', 'warn', 'auditor');
      } catch (err) {
        this.log(`❌ Sprint 3 오류 발생: ${err.message}`, 'error');
        console.error(err);
      } finally {
        this.isExecuting = false;
        renderCurrentView();
        if (this.autoDemoMode && window.RAMOS_ENABLE_LEGACY_DEMO === true) {
          await this.sleep(1200);
          await this.executeHumanSignOff('gate8D');
        }
      }
    }

    /* ----------------------------------------------------------------------- */
    /* HUMAN-IN-THE-LOOP APPROVAL EXECUTION                                    */
    /* ----------------------------------------------------------------------- */
    async executeHumanSignOff(gateKey) {
      const c = getActiveCase();
      if (window.RAMOS_ENABLE_LEGACY_DEMO !== true) {
        alert('자동 결재는 비활성화되어 있습니다. 보고서 결재 센터에서 실제 계정으로 단계별 승인해 주세요.');
        switchNav('reports-hub');
        return;
      }
      if (!c) return;

      ensureCaseGates(c);
      const gate = c.gates[gateKey];
      if (!gate) return;

      this.log(`👤 [인간 결재 진행] ${gate.title} 공식 결재선 승인 및 고객사 송부 처리 중...`, 'primary');

      const now = new Date().toISOString();

      // Approve internal approvers (first 3)
      gate.approvers.slice(0, 3).forEach((a) => {
        a.status = 'Approved';
        a.date = now.replace('T', ' ').slice(0, 16);
        a.comment = `[공식 승인] IATF 16949 자동차용 반도체 품질 기준 적합 검토 완료 (Approved by ${a.name})`;
      });
      gate.internalApproved = true;

      // 4th Quality Facilitator Dispatch Approval
      const qualityApprover = gate.approvers[3];
      if (qualityApprover) {
        qualityApprover.status = 'Approved';
        qualityApprover.date = now.replace('T', ' ').slice(0, 16);
        qualityApprover.comment = `고객사 품질포털 공식 송부 완료 [Mail ID: 8D-${c.id}-${gateKey.toUpperCase()}]`;
      }

      gate.dispatchedByQuality = true;
      gate.status = 'Approved';
      gate.dispatchDate = now.replace('T', ' ').slice(0, 10);
      gate.dispatchEvidence = `고객사 품질 보증 시스템 공식 송부 및 접수 확인 완료`;

      const lastStage = QUALITY_STAGES[REPORT_GATE_STAGES[gateKey] - 1];
      gate.snapshot = approvalSnapshot(c, lastStage);

      saveAppData();
      this.log(`✅ ${gate.title} 인간 공식 결재 및 고객사 송부 승인 완료!`, 'success');

      if (gateKey === 'gate3D') {
        c.currentStage = 'D4';
        saveAppData();
        renderCurrentView();
        await this.sleep(600);
        await this.runSprint2(c);
      } else if (gateKey === 'gate5D') {
        c.currentStage = 'D6';
        saveAppData();
        renderCurrentView();
        await this.sleep(600);
        await this.runSprint3(c);
      } else if (gateKey === 'gate8D') {
        c.status = 'Closed';
        c.closedAt = now;
        c.closedBy = { name: '조장호 대표이사 (전결)', dept: '대표이사' };
        saveAppData();
        this.log(`🎉 [8D 공식 영구 종결] 모든 Sprint와 Human Gate 승인이 100% 완료되었습니다! 최종 8D 보고서가 공식 발행되었습니다.`, 'success');
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

    synthesizeD1(c) {
      c.team = [
        { role: '8D Champion', name: '황승안 팀장_상무', dept: '품질혁신팀', contact: 'sahwang@ramostek.com', status: 'Active' },
        { role: '8D Leader (연구소/개발 주관)', name: '김현수 실장_상무', dept: 'Flash 개발실', contact: 'hskim@ramostek.com', status: 'Active' },
        { role: 'Technical / FA Lead', name: '박재환 팀장_S.Pro', dept: 'Flash 개발2팀', contact: 'jhpark@ramostek.com', status: 'Active' },
        { role: 'Process Engineer (공정기술)', name: '이성우 팀장_P.Pro', dept: 'Flash 개발3팀', contact: 'fog1007@ramostek.com', status: 'Active' },
        { role: 'Material Containment Lead', name: '이은산 센터장_상무', dept: '제조기획센터', contact: 'eunsan.lee@ramostek.com', status: 'Active' },
        { role: '외주(조립처) 물량 관리', name: '공아름 그룹장_P.Pro', dept: '계획운영그룹', contact: 'loveskr@ramostek.com', status: 'Active' },
        { role: 'CTST 라인·재공 관리', name: '조철민 그룹장_P.Pro', dept: '자원운영그룹', contact: 'nrjcm@ramostek.com', status: 'Active' },
        { role: '8D Quality Facilitator / 실무', name: '김성중 S.Pro', dept: '품질혁신팀', contact: 'sjkim@ramostek.com', status: 'Active' }
      ];
      c.cftRecommendation = {
        recommendedAt: new Date().toISOString(),
        engine: 'RAMOS-AI-Agent-v5',
        humanConfirmed: true,
        status: 'Approved'
      };
      c.cftRaci = {
        acknowledged: true,
        acknowledgedAt: new Date().toISOString(),
        roles: {
          Accountable: '김현수 실장_상무',
          Responsible: '김성중 S.Pro',
          Consulted: '박재환 팀장_S.Pro, 이은산 센터장_상무',
          Informed: '황승안 팀장_상무'
        }
      };
      c.currentStage = 'D1';
    }

    synthesizeD2(c) {
      const d2 = ensureD2Structure(c);
      const prod = c.product || 'UFS 4.0 512GB';
      const lot = c.lotNumber || 'LT2026-0819-B';
      const cust = c.customer || 'LGE';

      d2.problemWhat = `${prod} 패키지 실장 후 고온 동작 테스트 중 I/O 신호 단절 및 부팅 불가 불량`;
      d2.problemWhere = `${cust} 평택 생산 3라인 메인보드 표면실장(SMT) 2공정 Reflow 이후 AOI/ICT 검사존`;
      d2.problemWhen = `${c.incidentDate || '2026-08-19'} 주간 가동 2교대 생산 Lot ${lot} 투입 2시간 경과 시점`;
      d2.problemWho = `${cust} 평택 품질보증팀 김민석 책임 및 라모스 본사 SQE 김성중 S.Pro 교차 확인`;
      d2.problemWhich = `${prod} (P/N: ${c.partNumber || 'THGBMNG5D1LBAIL'}), 사내코드: ${c.internalPartNumber || 'MMACGD8J0F-HZRAF1-LPAGA00'}`;
      d2.problemHow = `질소 리플로우 260°C 피크 구간 통과 시 Ball #B12 솔더 조인트 접합부 미세 크랙 및 솔더 보이드 발생`;
      d2.problemHowMany = `불량 수량: ${c.defectQty || 12}ea / 검사 수량: ${c.inspectQty || 25000}ea (불량률: ${c.ppm || 480} PPM)`;
      d2.problemStatement = `${cust} 평택 3라인에서 ${prod} (Lot: ${lot}) 실장 검사 중 260°C 리플로우 열충격으로 인한 BGA Ball #B12 접합부 계면 크랙 및 솔더 보이드로 12ea(${c.ppm || 480} PPM) 부팅 불량이 발생함.`;

      d2.isIsNot = [
        { factor: '제품 모델 (Product)', is: prod, isNot: `${prod.replace('512GB', '256GB')}`, difference: '512GB 대용량 모델에만 적층 다이(8-Stack Die) 및 고밀도 BGA 패키지 구조 적용됨', verificationStatus: 'Verified' },
        { factor: '생산 LOT (Production Lot)', is: lot, isNot: 'LT2026-0818-A (직전 정상 LOT)', difference: '불량 LOT은 연결된 외주 가공사 SMT 라인 3호기 노즐 교체 직후 초물 투입분임', verificationStatus: 'Verified' },
        { factor: '발생 위치 (Defect Site)', is: 'BGA Ball #B12 Corner Pin', isNot: 'Center Ball Array (#G10~#G14)', difference: '패키지 외곽 코너 핀에 열팽창계수(CTE) 미스매치에 의한 기계적 전단 응력 집중', verificationStatus: 'Verified' },
        { factor: '온도 조건 (Reflow Peak Temp)', is: 'Peak 262°C (상한선 근접)', isNot: '표준 프로파일 245~250°C', difference: '히터 존 7번 열전대 센서 편차로 30초 이상 고온 노출되어 솔더 산화 촉진', verificationStatus: 'Verified' },
        { factor: '검출 공정 (Detection Gate)', is: `${cust} 후공정 부팅 ICT 검사`, isNot: '본사 출하 전 2D AOI 자동 광학검사', difference: '2D AOI는 BGA 볼 하부 접합 계면의 마이크로 크랙 검출이 물리적으로 불가능함', verificationStatus: 'Verified' },
        { factor: '자재 릴 (Solder Paste Lot)', is: 'SP-2026-08-K3 (점도 195 Pa·s)', isNot: 'SP-2026-08-K1 (표준 점도 210 Pa·s)', difference: 'K3 릴의 개봉 후 대기시간 18시간 초과로 플럭스 휘발 및 점도 강하 발생', verificationStatus: 'Verified' }
      ];

      c.evidenceList = c.evidenceList || [];
      if (!c.evidenceList.length) {
        c.evidenceList = [
          { id: 'EV-01', title: '고객사 클레임 접수 공문 및 불량 시료 분석 의뢰서', file: 'LGE_Claim_Notice_20260819.pdf', category: 'Claim' },
          { id: 'EV-02', title: 'X-Ray CT 비파괴 검사 이미지 (BGA #B12 크랙 확인)', file: 'BGA_Ball_B12_CT_Scan.png', category: 'Analysis' },
          { id: 'EV-03', title: '리플로우 오븐 온도 프로파일 실측 로그', file: 'Reflow_Profile_Zone7_Log.csv', category: 'Process' }
        ];
      }

      d2.approval = { status: 'Draft', humanConfirmed: true, validatedAt: new Date().toISOString() };
      c.currentStage = 'D2';
    }

    synthesizeD3(c) {
      const d3 = ensureD3Structure(c);
      const lot = c.lotNumber || 'LT2026-0819-B';

      d3.inventorySources.erp.RAK4 = { warehouse: 'RAK4', lot, currentQty: 18500, holdQty: 18500, evidence: 'ERP WMS 재고 로케이션 RAK4 홀드 전산 태그 발송', verified: true };
      d3.inventorySources.erp.RAK5 = { warehouse: 'RAK5', lot, currentQty: 6500, holdQty: 6500, evidence: 'ERP WMS 보세창고 RAK5 긴급 출하 정지 등록', verified: true };
      d3.inventorySources.mes.verified = true;
      d3.inventorySources.mes.evidence = 'MES 공정 관제 시스템 실시간 WIP LOT 홀드 등록 완료';
      d3.inventorySources.mes.processStocks = [
        { process: 'SMT 실장 공정 (Line 3)', currentQty: 4200, holdQty: 4200, status: 'Hold', evidence: 'MES 작업지시서 취소 및 인터락 적용' },
        { process: 'Underfill 도포 및 큐어링', currentQty: 3800, holdQty: 3800, status: 'Hold', evidence: 'Curing Oven 챔버 내 LOT 전량 배출 및 격리' },
        { process: '모듈 최종 검사 및 포장', currentQty: 5500, holdQty: 5500, status: 'Hold', evidence: '포장 라인 트레이 적재분 100% 레드 태그 부착' }
      ];

      d3.lotScope = {
        affectedLot: lot,
        adjacentLots: 'LT2026-0819-A (직전 생산분), LT2026-0819-C (직후 생산분)',
        rawMaterialBatch: '솔더 페이스트 Batch: SP-2026-08-K3, BGA 기판 Substrate: SUB-2026-441',
        equipment: '외주 SMT 라인 3호기, 질소 리플로우 8존 오븐 #2호기',
        rationale: '해당 설비 7번 히터 존 온도 이상 및 특정 솔더 페이스트 배치 투입 구간 전후 24시간 생산분 전수 격리'
      };

      d3.materialFlow = [
        { area: '1. 본사 완제품 창고 (RAK4)', lot, totalQty: 18500, holdQty: 18500, screenQty: 18500, ngQty: 0, status: '격리완료', evidence: 'WMS Location Hold 전산 캡처 (EV-D3-01)' },
        { area: '2. 본사 보세/출하 대기장 (RAK5)', lot, totalQty: 6500, holdQty: 6500, screenQty: 6500, ngQty: 0, status: '격리완료', evidence: '수출 선적 보류 통보서 (EV-D3-02)' },
        { area: '3. 제조 공정 재고 (MES WIP)', lot, totalQty: 13500, holdQty: 13500, screenQty: 13500, ngQty: 8, status: '격리완료', evidence: 'MES 실시간 인터락 리포트 (EV-D3-03)' },
        { area: '4. 운송 중 재고 (In-Transit)', lot, totalQty: 5000, holdQty: 5000, screenQty: 5000, ngQty: 0, status: '회차완료', evidence: '물류 차량 회차증 및 입고증 (EV-D3-04)' },
        { area: '5. 고객사 창고 (Hub Warehouse)', lot, totalQty: 12000, holdQty: 12000, screenQty: 12000, ngQty: 4, status: '봉쇄완료', evidence: '고객사 자재창고 격리 스티커 사진 (EV-D3-05)' },
        { area: '6. 고객사 라인 투입 대기 (SMT WIP)', lot, totalQty: 4500, holdQty: 4500, screenQty: 4500, ngQty: 6, status: '회수완료', evidence: '고객 피더에서 탈착 후 전용 트레이 보관 (EV-D3-06)' },
        { area: '7. 클린 포인트 LOT (Clean Point)', lot: 'LT2026-0820-A', totalQty: 25000, holdQty: 0, screenQty: 25000, ngQty: 0, status: '정상공급', evidence: '개선 프로파일 적용 클린 LOT 인증 라벨 (EV-D3-07)' }
      ];

      d3.actions = [
        { id: 'ICA-01', target: '전 유통망 및 생산라인 재고 전수 격리', action: '7개 거점 재고 총 60,000ea 봉쇄 및 전산 홀드 태그 부착', owner: '이은산 센터장_상무', due: '2026-08-20', status: 'Completed', result: '100% 격리 완료 (미격리 유출 수량 0ea)' },
        { id: 'ICA-02', target: '고객사 보유 재고 및 라인 투입분 선별', action: '고객사 현장 파견 긴급 3D CT 비파괴 100% 전수 검사 진행', owner: '김성중 S.Pro', due: '2026-08-21', status: 'Completed', result: '16,500ea 전수 검사 완료, 추가 불량 10ea 검출 격리' },
        { id: 'ICA-03', target: '긴급 대체 클린 LOT 생산 및 긴급 공급', action: '온도 프로파일 및 솔더 신규 배치 투입 클린 LOT(LT2026-0820-A) 긴급 선적', owner: '조철민 그룹장_P.Pro', due: '2026-08-21', status: 'Completed', result: '고객사 라인 스톱 0시간 달성, 정상 가동 재개' }
      ];

      d3.effectiveness = {
        noAdditionalClaim: 'yes',
        lineStable: 'yes',
        stockReconciled: 'yes',
        verificationEvidence: '고객사 3라인 48시간 연속 가동 간 클레임 재발 0건 및 60,000ea 재고 정합성 100% 입증'
      };
      d3.effectivenessStatement = '7개 거점 총 60,000ea 재고 전수 격리 및 클린 LOT 투입을 통해 고객사 라인 스톱을 방지하였으며, 격리 후 48시간 동안 추가 불량 발생 0건으로 봉쇄 조치 유효성이 입증됨.';
      d3.approval = { status: 'Draft', humanConfirmed: true, validatedAt: new Date().toISOString() };
      c.currentStage = 'D3';
    }

    synthesizeD4(c) {
      const d4 = ensureD4Structure(c);
      d4.selectedTools = [
        {
          id: 'timeline',
          hypothesis: '고객사 발생 시점 기준 제조·출하 타임라인 상관관계 가설',
          evidence: '생산 Lot 실적 데이터 및 물류 출하 이력 (EV-D4-01)',
          finding: '8월 19일 14:00~18:00 제조 투입분에서 불량 집중 발생 확인',
          owner: '김성중 S.Pro',
          status: 'Completed',
          verified: true,
          artifact: { humanConfirmed: true, rows: [{ factor: 'Production Window', val: '2026-08-19 14:00', status: 'Verified' }] }
        },
        {
          id: 'process-flow',
          hypothesis: 'SMT 및 패키징 공정 흐름 상 열 스트레스 집중 지점 분석 가설',
          evidence: '표면실장 3호기 공정 흐름도 및 히터 존 배치도 (EV-D4-02)',
          finding: '리플로우 존 7 통과 구간에서 급격한 열 충격 발생 확인',
          owner: '이은산 센터장_상무',
          status: 'Completed',
          verified: true,
          artifact: { humanConfirmed: true, rows: [{ factor: 'Process Step', val: 'Reflow Zone 7', status: 'Identified' }] }
        },
        {
          id: 'change-point',
          hypothesis: '4M (Man, Machine, Material, Method) 변경점 추적 분석 가설',
          evidence: '외주 협력사 4M 변경 관리 대장 (EV-D4-03)',
          finding: '솔더 페이스트 신규 개봉 Batch SP-2026-08-K3 투입 시점과 일치함 확인',
          owner: '이성우 팀장_P.Pro',
          status: 'Completed',
          verified: true,
          artifact: { humanConfirmed: true, rows: [{ factor: '4M Point', val: 'Solder Batch Change', status: 'Correlated' }] }
        },
        {
          id: 'fishbone',
          hypothesis: '특성요인도(Fishbone) 기반 4M 잠재원인 종합 분석 가설',
          evidence: 'CFT 합동 Ishikawa 원인분석 다이어그램 (EV-D4-04)',
          finding: '설비(오븐 온도 센서 열화)와 자재(플럭스 휘발) 복합 요인으로 귀결',
          owner: '박재환 팀장_S.Pro',
          status: 'Completed',
          verified: true,
          artifact: { humanConfirmed: true, rows: [{ factor: 'Fishbone Category', val: 'Machine & Material', status: 'Selected' }] }
        },
        {
          id: 'five-why',
          hypothesis: '리플로우 고온 구간 노출 및 플럭스 잔류로 인한 솔더 보이드 및 크랙 발생 5-Why 가설',
          evidence: 'X-Ray 단면 분석 사진 및 리플로우 오븐 존7 온도 데이터 (EV-D4-05)',
          finding: '오븐 존7 열전대 열화로 인한 262°C 과열(표준 대비 +15°C) 및 2D AOI 한계 입증',
          owner: '박재환 팀장_S.Pro',
          status: 'Completed',
          verified: true,
          artifact: { humanConfirmed: true, rows: [{ factor: 'Zone 7 Temp', value: '262°C', spec: '245±5°C', judgment: 'NG' }] }
        }
      ];

      d4.rootCauses = {
        Occurrence: {
          type: 'Occurrence',
          statement: '질소 리플로우 7번 히터 존 온도 센서(TC) 교정 오차로 피크 온도가 262°C까지 비정상 상승하여 솔더 IMC 층이 4.8um 이상 과도 성장 및 취성 크랙 발생함',
          evidence: '리플로우 온도 프로파일 실측치 및 SEM 단면 계면 분석 데이터 (EV-D4-01)',
          validationMethod: '표준 245°C 프로파일 재현 실험 시 IMC 1.8um 정상 형성 및 크랙 0건 입증',
          status: 'Confirmed',
          checks: { reproduced: true, removed: true, boundary: true, evidence: true }
        },
        Escape: {
          type: 'Escape',
          statement: '기존 출하 검사 사양이 2D AOI(외관 중심)로만 구성되어 있어 BGA 볼 하부 계면의 마이크로 크랙을 물리적으로 투과 검출하지 못함',
          evidence: '검출 커버리지 분석 리포트 및 고객사 불량 시료 2D AOI 패스 재현 시험 (EV-D4-02)',
          validationMethod: '3D AXI(X-ray 자동 검사) 도입 시 보이드율 15% 초과 전수 100% 검출력 입증',
          status: 'Confirmed',
          checks: { reproduced: true, removed: true, boundary: true, evidence: true }
        },
        System: {
          type: 'System',
          statement: '신제품 개발 NPI Gate 3 단계에서 리플로우 설비 열전대 센서의 정기 공정 FMEA 관리 주기(월 1회)가 고밀도 PKG 실장 요구조건 대비 길게 설정됨',
          evidence: '기존 PFMEA-2025-PKG 개정 이력 및 설비 예방보전(PM) 체크리스트 (EV-D4-03)',
          validationMethod: '일일 프로파일 자동 모니터링 시스템 구축 및 PFMEA RPN 개정 반영 검증',
          status: 'Confirmed',
          checks: { reproduced: true, removed: true, boundary: true, evidence: true }
        }
      };

      d4.approval = { status: 'Draft', humanConfirmed: true, validatedAt: new Date().toISOString() };
      c.currentStage = 'D4';
    }

    synthesizeD5(c) {
      ensureLateStages(c);
      const d5 = c.d5;

      d5.pcnEcn = {
        ecnNumber: 'ECN-2026-QA-089',
        pcnRequired: true,
        customerApprovalStatus: '고객사(LGE) 품질승인 접수 완료 (PCN-2026-LGE-04)',
        evidence: '고객사 서명 완료 PCN 변경 승인 통보서 (EV-D5-PCN)'
      };

      d5.candidates = [
        {
          id: 'D5-PCA-OCCUR-01',
          causeType: 'Occurrence',
          title: '리플로우 오븐 실시간 무선 프로파일러(KIC RPI) 장착 및 자동 인터락 구축',
          rationale: '7번 히터 존 온도 편차 ±2°C 초과 시 컨베이어 벨트 자동 정지 시스템 도입',
          rootCauseElimination: '과열 노출 원천 차단으로 IMC 두께 1.8±0.3um 안정적 관리 (Cpk 1.82 달성)',
          feasibility: '우수 (기존 라인에 IoT 인터락 모듈 즉시 연동 완료)',
          costImpact: '낮음',
          riskLevel: '매우 낮음',
          owner: '이은산 센터장_상무',
          due: '2026-08-25',
          verificationPlan: '연속 50,000ea 실장 간 온도 편차 0건 검증',
          evidence: 'IoT 무선 인터락 설비 검교정 성적서 (EV-D5-01)',
          selected: true
        },
        {
          id: 'D5-PCA-ESCAPE-01',
          causeType: 'Escape',
          title: '인라인 3D AXI(인라인 X-ray 자동 단층검사기) 검사 게이트 신설',
          rationale: 'BGA 내부 솔더 보이드율 10% 초과 및 크랙 발생 시 100% 자동 NG 배출',
          rootCauseElimination: 'BGA 계면 보이드 및 미세 크랙 불량의 유출 가능성 0% 달성 (PPM 0)',
          feasibility: '양호 (사내 공용 3D AXI 검사 장비 라인 인라인화 완료)',
          costImpact: '보통',
          riskLevel: '낮음',
          owner: '박재환 팀장_S.Pro',
          due: '2026-08-26',
          verificationPlan: 'Known Defect Golden Sample 20개 반복 측정 100% 검출력 테스트',
          evidence: '3D AXI Gage R&R 평가 결과서 (EV-D5-02)',
          selected: true
        },
        {
          id: 'D5-PCA-SYSTEM-01',
          causeType: 'System',
          title: 'PFMEA 개정 및 리플로우 센서 일일 정밀 캘리브레이션 지침 표준화',
          rationale: '센서 점검 주기를 월 1회에서 매 교대(Shift) 시작 전 일 2회 자동 점검으로 격상',
          rootCauseElimination: '센서 드리프트로 인한 공정 산포 발생 위험 사전 원천 차단',
          feasibility: '즉시 적용 가능',
          costImpact: '없음',
          riskLevel: '없음',
          owner: '김성중 S.Pro',
          due: '2026-08-24',
          verificationPlan: '품질팀 주간 내부감사 시 표준 준수율 100% 점검',
          evidence: '사내 표준 작업지침서 개정 초안 (EV-D5-03)',
          selected: true
        }
      ];

      d5.approval = { status: 'Draft', humanConfirmed: true, validatedAt: new Date().toISOString() };
      c.currentStage = 'D5';
    }

    synthesizeD6(c) {
      ensureLateStages(c);
      const d6 = c.d6;

      d6.implementationDetails = {
        bomRevision: 'Rev. 1.2 (Solder Paste Spec & Reflow Recipe Rev C)',
        appliedLot: 'LT2026-0825-V1 ~ V3 (개선 대책 100% 적용 양산 검증 LOT)',
        startDate: '2026-08-25',
        productionSite: '라모스 본사 1공장 표면실장(SMT) 3라인',
        evidence: '양산 제조지시서 및 4M 변경 적용 작업일지 (EV-D6-01)'
      };

      d6.validationTests = [
        {
          id: 'TEST-01',
          actionId: 'D5-PCA-OCCUR-01',
          testName: '고온·저온 열충격 가속수명시험 (Thermal Shock Test -40°C ~ +125°C 1000h)',
          condition: 'JEDEC JESD22-A104 규격, -40°C 15분 ➔ +125°C 15분, 총 1,000 Cycle 연속 노출',
          acceptanceCriteria: '저항 변화율 ΔR < 10%, 크랙 발생 0ea, 전기적 오픈/쇼트 0건',
          sampleSize: 3000,
          failQty: 0,
          result: 'PASS',
          owner: '박재환 팀장_S.Pro',
          completedAt: '2026-08-28',
          evidence: '신뢰성 시험실 1000h 공인 시험 성적서 (EV-D6-TST01)'
        },
        {
          id: 'TEST-02',
          actionId: 'D5-PCA-ESCAPE-01',
          testName: '3D AXI 인라인 불량 검출력 및 오검출률(False Alarm) 실측 평가',
          condition: '실제 양산 제품 15,000ea 연속 통과 및 인위적 불량 시료 50ea 투입 교차 검증',
          acceptanceCriteria: '불량 검출력 100% (50/50ea 검출), 가성불량률(False Alarm) < 0.05%',
          sampleSize: 15050,
          failQty: 0,
          result: 'PASS',
          owner: '김성중 S.Pro',
          completedAt: '2026-08-28',
          evidence: '3D AXI 양산 검출력 데이터 로그 (EV-D6-TST02)'
        },
        {
          id: 'TEST-03',
          actionId: 'D5-PCA-SYSTEM-01',
          testName: '일일 리플로우 센서 자동 캘리브레이션 반복 정밀도 평가',
          condition: '연속 14일간 매 교대 2회 실측 프로파일 오차 추적 (30회 연속 점검)',
          acceptanceCriteria: '기준 온도 대비 편차 절대값 < 1.0°C 유지',
          sampleSize: 30,
          failQty: 0,
          result: 'PASS',
          owner: '이은산 센터장_상무',
          completedAt: '2026-08-28',
          evidence: '설비 일일 온도 보정 로그 시트 (EV-D6-TST03)'
        }
      ];

      d6.beforeAfter = {
        beforeMetric: '개선 전: 리플로우 피크 262°C 과열, IMC 두께 4.8um, 불량률 480 PPM (Cpk 0.82)',
        afterMetric: '개선 후: 리플로우 피크 246±1.5°C 안정, IMC 두께 1.8um, 불량률 0 PPM (Cpk 1.84 달성)',
        evidence: '개선 전후 Cpk 공정능력 분석 그래프 및 통계 보고서 (EV-D6-CPK)'
      };

      d6.containmentRelease = {
        decision: 'Released',
        rationale: 'PCA 대책 양산 적용 후 1,000 Cycle 가속 시험 무결점 PASS 및 고객사 30만개 무결점 입증으로 긴급 봉쇄 전면 해제 결정',
        evidence: '고객사 품질 승인 서한 및 라모스 품질위원회 봉쇄 해제 결재문 (EV-D6-REL)'
      };

      d6.approval = { status: 'Draft', humanConfirmed: true, validatedAt: new Date().toISOString() };
      c.currentStage = 'D6';
    }

    synthesizeD7(c) {
      ensureLateStages(c);
      const d7 = c.d7;

      d7.systemUpdates = [
        {
          id: 'D7-SYS-01',
          actionId: 'D5-PCA-OCCUR-01',
          docName: '표면실장 리플로우 오븐 온도 관리 및 인터락 운용 표준',
          docNo: 'SOP-2026-QA-089',
          rev: 'Rev. 3.0',
          changeContent: '무선 IoT 프로파일러 연동 자동 인터락 조건 및 일일 교대 캘리브레이션 의무화 신설',
          owner: '이은산 센터장_상무',
          due: '2026-08-29',
          status: 'Completed',
          evidence: '전사 그룹웨어 승인 완료 사내 표준 개정 문서 (EV-D7-SOP)'
        },
        {
          id: 'D7-SYS-02',
          actionId: 'D5-PCA-ESCAPE-01',
          docName: '공정 FMEA (PFMEA) 및 Control Plan (QC공정도) 개정',
          docNo: 'PFMEA-2026-SMT-03',
          rev: 'Rev. 4.1',
          changeContent: '고장모드(BGA Void/Crack) 심각도 S:7, 발생도 O:6➔2, 검출도 D:6➔1로 RPN 252 ➔ 14로 대폭 개선',
          owner: '김성중 S.Pro',
          due: '2026-08-29',
          status: 'Completed',
          evidence: '품질시스템 등록 완료 PFMEA 승인본 (EV-D7-PFMEA)'
        }
      ];

      d7.horizontalDeployment = [
        {
          id: 'D7-HOK-01',
          actionId: 'D5-PCA-OCCUR-01',
          product: '본사 SMT 1라인, 2라인 및 베트남 외주 생산 1~3라인',
          sameRisk: '동일 질소 리플로우 8존 오븐 사용 중인 모든 메모리 모듈 패키지 생산 라인',
          action: '동일 사양의 IoT 무선 프로파일러 인터락 100% 확대 장착 및 소프트웨어 패치',
          owner: '조철민 그룹장_P.Pro',
          status: 'Completed',
          evidence: '전 라인 횡전개 적용 점검표 및 설치 확인 사진 (EV-D7-YOKO1)'
        },
        {
          id: 'D7-HOK-02',
          actionId: 'D5-PCA-ESCAPE-01',
          product: '자동차용 eMMC 및 서버용 DDR5 모듈 전 라인',
          sameRisk: 'BGA 실장 구조를 채택한 모든 차량용/산업용 전장 고신뢰성 라인',
          action: '3D AXI 검사 소프트웨어 알고리즘 및 보이드 판정 룰셋 공통 표준 배포',
          owner: '박재환 팀장_S.Pro',
          status: 'Completed',
          evidence: '검사 룰셋 중앙 배포 완료 로그 (EV-D7-YOKO2)'
        }
      ];

      d7.approval = { status: 'Draft', humanConfirmed: true, validatedAt: new Date().toISOString() };
      c.currentStage = 'D7';
    }

    synthesizeD8(c) {
      ensureLateStages(c);
      const d8 = c.d8;

      d8.checklist = [
        { cat: 'D1~D4 근거', item: 'D1 CFT 조직 및 D2 사실 기반 5W2H, D4 3-Track 공학적 근본원인 100% 규명 완료', evidence: 'D1~D4 실측 데이터 및 CT/SEM 성적서 검증 완료', checked: true },
        { cat: 'D5~D6 조치', item: 'D5 영구 시정조치 양산 적용 및 D6 1000h 가속시험 무결점 검증, 봉쇄 해제 승인', evidence: 'D6 신뢰성 시험 성적서 PASS 및 봉쇄해제 승인서', checked: true },
        { cat: 'D7 표준화', item: 'SOP 사내 표준 개정 및 PFMEA RPN 252➔14 개선, 전사 횡전개 100% 완료', evidence: '개정 SOP-2026-QA-089 및 횡전개 확인서', checked: true },
        { cat: '고객사 승인', item: '고객사(LGE) 품질보증팀 8D 시정조치 결과 승인 및 클레임 공식 종결 합의', evidence: '고객사 공식 8D 수락 서한 (LGE-QC-ACCEPT-2026)', checked: true },
        { cat: '잔여 리스크', item: '공정능력 지수 Cpk 1.84 유지 확인 및 향후 잔여 품질 리스크 제거 완료', evidence: '양산 30일 공정능력 추적 모니터링 시트', checked: true }
      ];

      d8.closure = {
        remainingRisk: '공정능력 지수 Cpk 1.84 달성 및 3D AXI 100% 인라인 검사 체계가 구축되어 잔여 품질 리스크는 완전히 제거됨.',
        customerAcceptance: '고객사(LGE) 품질보증팀장 최종 승인 완료 — 클레임 공식 종결 및 정상 양산 납품 승인 완료.',
        evidence: '고객사 공식 승인 서한 LGE-8D-2026-CLOSURE.pdf 및 라모스 경영진 최종 보고서'
      };

      d8.teamAppreciation = '신속한 7개 거점 재고 봉쇄로 고객사 라인 스톱을 0시간으로 방어하고, 8D 전 과정을 과학적으로 해결한 Flash 개발실, 품질혁신팀, 제조기획센터 CFT 전원에게 2026년도 사내 품질혁신 우수 포상을 수여함.';
      d8.approval = { status: 'Draft', humanConfirmed: true, validatedAt: new Date().toISOString() };
      c.currentStage = 'D8';
    }

    /* ----------------------------------------------------------------------- */
    /* INTERNAL STAGE SIGN-OFF FOR INTEGRITY COMPLIANCE                        */
    /* ----------------------------------------------------------------------- */
    signStageInternal(c, stageKey) {
      c.signOffHistory = c.signOffHistory || {};
      const now = new Date().toISOString();
      const drafter = { name: '김성중 S.Pro', dept: '품질혁신팀', email: 'sjkim@ramostek.com', signedAt: now };
      const leader = { name: '김현수 실장_상무', dept: 'Flash 개발실', email: 'hskim@ramostek.com', signedAt: now };
      const champion = { name: '황승안 팀장_상무', dept: '품질혁신팀', email: 'sahwang@ramostek.com', signedAt: now };

      const snapshot = approvalSnapshot(c, stageKey);
      c.signOffHistory[stageKey] = {
        status: 'Approved',
        drafter,
        leader,
        champion,
        snapshot,
        reportHtml: `[AI Agent Validated Snapshot for ${stageKey}]`
      };

      if (stageKey !== 'D1') {
        const d = c[stageKey.toLowerCase()];
        if (d) {
          d.approval = {
            status: 'Approved',
            humanConfirmed: true,
            approvedAt: now,
            approvedBy: champion
          };
        }
      }
      c.approvalReviewFrom = null; // Clear review blocker
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
                <i data-lucide="trash-2" style="width:13px;height:13px;"></i> 🧹 예시 데이터 전체 삭제
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
              <span style="font-size:0.75rem; color:#94a3b8;">Sprint 완료 시 해당 Human Gate 승인 후 다음 스프린트로 자동 연쇄 가동</span>
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
                  <button type="button" class="mc-stage-btn ${c.d6?.validationTests?.length ? 'done' : ''}" onclick="switchStage('D6')">D6 실측검증 (TC1000h)</button>
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

    toggleAutoDemo(checked) {
      void checked;
      this.autoDemoMode = false;
      this.log('🔐 운영 보안 정책에 따라 자동 결재는 비활성화되어 있습니다.', 'warn');
      alert('자동 결재는 사용할 수 없습니다. 실제 결재자 계정으로 승인해 주세요.');
    }

    resetToCleanSlate() {
      const c = getActiveCase();
      if (!c) return;

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
      this.log('🧹 [클린 슬레이트] 기존 D1~D8 예시 데이터가 모두 삭제되었습니다. 순수 클레임 접수 정보만 남은 깨끗한 상태에서 AI 자율 작성을 시작할 수 있습니다.', 'primary');
      renderCurrentView();
    }

    startPipeline() {
      const c = getActiveCase();
      if (!c) return;
      if (c.status === 'Closed' || c.gates?.gate8D?.status === 'Approved') {
        this.resetToCleanSlate();
        this.log('🔄 새로운 8D 자율 해결 사이클을 위해 케이스 상태를 초기화하고 Sprint 1을 가동합니다.', 'primary');
      }
      this.runSprint1(c);
    }
  }

  // Global Singleton Instance
  window.Autonomous8DAgent = Autonomous8DAgent;
  window.ramosAgent = new Autonomous8DAgent();

})(window);
