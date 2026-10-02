/* Governed Agent Operations console: runs, evidence lineage, findings and approval. */
(function(global) {
  'use strict';

  const ops = {
    runs: [], findings: [], sources: [], notifications: [], adapters: null,
    selectedRunId: null, loading: false, error: ''
  };

  const escapeHtml = value => String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');

  const statusLabel = {
    CREATED:'생성', PARSING_REQUEST:'요청 해석', COLLECTING:'자료 수집', VALIDATING:'데이터 검증',
    ANALYZING:'분석', DRAFT_READY:'초안 준비', AWAITING_CONFIRMATION:'사용자 확인 대기',
    AWAITING_APPROVAL:'사람 승인 대기', APPROVED:'승인됨', EXECUTING:'공식 반영', COMPLETED:'완료',
    RETRY_SCHEDULED:'재시도 예약', NEEDS_HUMAN:'담당자 확인 필요', FAILED:'실패', CANCELLED:'취소'
  };

  const unitLabel = {
    NATURAL_LANGUAGE_INTERPRETATION: '요청 해석', DOCUMENT_COLLECTION: '근거 수집',
    STANDARDIZATION: '자료 표준화', DATA_VALIDATION: '데이터 검증', AGGREGATION: '자료 집계',
    CROSS_CHECK: '상호 대조', RISK_AND_POLICY: '위험·정책 검토', GENERATION: '초안 작성'
  };

  function getActiveCaseSafe() {
    return typeof getActiveCase === 'function' ? getActiveCase() : null;
  }

  function selectedRun() {
    return ops.runs.find(item => item.id === ops.selectedRunId) || ops.runs[0] || null;
  }

  function renderAgentOperationsView() {
    const c = getActiveCaseSafe();
    setTimeout(() => refreshAgentOperations(), 0);
    return `
      <section class="agent-ops-shell">
        ${renderQmsPageHeader({ title:'Agent Operations · 실행 및 검토', icon:'workflow', description:'근거에 기반한 AI 초안을 검토합니다. 공식 Case 변경은 실제 권한자의 승인 후 적용됩니다.', className:'agent-ops-commandbar', badges:[{label:'MES/ERP WRITE OFF',tone:'neutral'},{label:'AUDIT ON',tone:'success'}], actions: typeof canUseMailAdmin === 'function' && canUseMailAdmin() ? `<button type="button" class="btn btn-secondary" onclick="openMailAdminModal()"><i data-lucide="mail"></i> 알림 메일 설정·시험</button>` : '' })}

        <div class="agent-ops-requestline">
          <div class="agent-request-context">
            <span>ACTIVE CASE</span>
            <strong>${escapeHtml(c?.id || '선택 필요')}</strong>
          </div>
          <textarea id="agentRequestText" rows="2" placeholder="예: ${escapeHtml(c?.id || 'CASE-...')} D1~D3 초안을 작성해줘"></textarea>
          <button class="btn btn-primary" onclick="submitAgentOperation()" ${c ? '' : 'disabled'}>
            <i data-lucide="play"></i> Agent 실행
          </button>
        </div>
        <div class="agent-ops-presets">
          <button onclick="setAgentRequestPreset('draft')">D1~D3 초안</button>
          <button onclick="setAgentRequestPreset('validate')">Case 품질 검증</button>
          <button onclick="setAgentRequestPreset('root')">D4 원인 분석</button>
          <button onclick="setAgentRequestPreset('similar')">과거 유사 Case</button>
          <button onclick="openAgentSourceModal()">Evidence Source 등록</button>
          <button onclick="runAgentSchedulerNow()">Scheduler 즉시 점검</button>
        </div>

        <div id="agentOpsStatus" class="agent-ops-statusline">중앙 Agent Runtime에서 상태를 불러오는 중입니다.</div>
        <div id="agentOpsMetrics" class="agent-ops-metrics"></div>

        <div class="agent-ops-grid">
          <section class="agent-ops-ledger">
            <div class="agent-panel-title">
              <div><span>RUN LEDGER</span><strong>실행 이력</strong></div>
              <button onclick="refreshAgentOperations()" title="새로고침"><i data-lucide="refresh-cw"></i></button>
            </div>
            <div id="agentRunLedger" class="agent-run-ledger"><div class="agent-empty">불러오는 중…</div></div>
          </section>

          <section class="agent-ops-inspector">
            <div class="agent-panel-title"><div><span>RUN INSPECTOR</span><strong>근거·단계·승인</strong></div></div>
            <div id="agentRunInspector" class="agent-run-inspector"><div class="agent-empty">실행을 선택하십시오.</div></div>
          </section>
        </div>

        <div class="agent-ops-lower-grid">
          <section class="agent-quality-panel">
            <div class="agent-panel-title"><div><span>DATA QUALITY</span><strong>검증 항목</strong></div></div>
            <div id="agentQualityFindings"><div class="agent-empty">Case를 선택하십시오.</div></div>
          </section>
          <section class="agent-source-panel">
            <div class="agent-panel-title"><div><span>SOURCE LINEAGE</span><strong>Evidence 출처</strong></div></div>
            <div id="agentSourceList"><div class="agent-empty">등록된 Source가 없습니다.</div></div>
          </section>
          <section class="agent-adapter-panel">
            <div class="agent-panel-title"><div><span>CONTROL PLANE</span><strong>연결 및 내부 알림</strong></div></div>
            <div id="agentControlPlane"><div class="agent-empty">연결 상태 확인 중…</div></div>
          </section>
        </div>
      </section>`;
  }

  async function refreshAgentOperations(options = {}) {
    if (ops.loading || !global.QMSApi || appData?.currentView !== 'agent-operations') return;
    ops.loading = true;
    ops.error = '';
    const c = getActiveCaseSafe();
    try {
      const [runs, findings, sources, notifications, adapters] = await Promise.all([
        QMSApi.listAgentRuns(c ? { caseId: c.id, limit: 100 } : { limit: 100 }),
        c ? QMSApi.listQualityFindings(c.id) : Promise.resolve([]),
        c ? QMSApi.listAgentSources(c.id) : Promise.resolve([]),
        QMSApi.listAgentNotifications(100),
        QMSApi.getAgentAdapters()
      ]);
      ops.runs = runs;
      ops.findings = findings;
      ops.sources = sources;
      ops.notifications = notifications;
      ops.adapters = adapters;
      global.QMS_AGENT_NOTIFICATIONS = notifications;
      if (options.selectRunId) ops.selectedRunId = Number(options.selectRunId);
      if (!ops.selectedRunId || !runs.some(item => item.id === ops.selectedRunId)) ops.selectedRunId = runs[0]?.id || null;
    } catch (error) {
      ops.error = error.message;
    } finally {
      ops.loading = false;
      paintAgentOperations();
      if (typeof updateNotificationBadge === 'function') updateNotificationBadge();
    }
  }

  function paintAgentOperations() {
    if (appData?.currentView !== 'agent-operations') return;
    const status = document.getElementById('agentOpsStatus');
    if (status) {
      status.className = `agent-ops-statusline ${ops.error ? 'is-error' : ''}`;
      status.textContent = ops.error || `중앙 Runtime 연결됨 · ${ops.runs.length}개 Run · 외부 이메일/메신저 발송 없음`;
    }
    const pending = ops.runs.filter(item => item.status === 'AWAITING_APPROVAL').length;
    const needsHuman = ops.runs.filter(item => ['NEEDS_HUMAN','FAILED','RETRY_SCHEDULED'].includes(item.status)).length;
    const critical = ops.findings.filter(item => item.status === 'OPEN' && item.severity === 'CRITICAL').length;
    const metrics = document.getElementById('agentOpsMetrics');
    if (metrics) metrics.innerHTML = [
      ['실행 건수',ops.runs.length,'neutral','현재 Case의 실행 이력'],
      ['승인 대기',pending,pending ? 'warn' : 'neutral','권한자의 검토 필요'],
      ['담당자 확인',needsHuman,needsHuman ? 'warn' : 'neutral','확인 또는 재시도 필요'],
      ['중대 검증 항목',critical,critical ? 'danger' : 'neutral','해결되지 않은 품질 항목'],
      ['근거 자료',ops.sources.length,'info','등록된 자료 출처']
    ].map(([label,value,tone,note])=>renderQmsMetric({label,value,tone,note,className:'agent-metric'})).join('');
    paintRunLedger();
    paintRunInspector();
    paintFindings();
    paintSources();
    paintControlPlane();
    if (global.lucide) lucide.createIcons();
  }

  function paintRunLedger() {
    const target = document.getElementById('agentRunLedger');
    if (!target) return;
    if (!ops.runs.length) {
      target.innerHTML = renderQmsEmpty({title:'Agent 실행 이력이 없습니다.',description:'요청을 입력하거나 위의 실행 항목을 선택해 시작하세요.',compact:true});
      return;
    }
    target.innerHTML = ops.runs.map(run => `
      <button class="agent-run-row ${run.id === ops.selectedRunId ? 'selected' : ''}" onclick="selectAgentRun(${run.id})">
        <span class="agent-run-id">RUN-${String(run.id).padStart(4,'0')}</span>
        <span class="agent-run-body"><strong>${escapeHtml(run.requestText)}</strong><small>${escapeHtml(run.intent)} · ${escapeHtml(run.requestedBy)}</small></span>
        <span class="agent-status ${run.status.toLowerCase().replaceAll('_','-')}">${escapeHtml(statusLabel[run.status] || run.status)}</span>
        <span class="agent-run-time">${escapeHtml((run.updatedAt || '').replace('T',' ').slice(0,16))}</span>
      </button>`).join('');
  }

  function selectAgentRun(runId) {
    ops.selectedRunId = Number(runId);
    paintRunLedger();
    paintRunInspector();
    if (global.lucide) lucide.createIcons();
  }

  function paintRunInspector() {
    const target = document.getElementById('agentRunInspector');
    if (!target) return;
    const run = selectedRun();
    if (!run) {
      target.innerHTML = renderQmsEmpty({title:'확인할 실행을 선택하세요.',description:'실행 이력에서 근거와 처리 단계, 승인 상태를 확인할 수 있습니다.',compact:true});
      return;
    }
    const result = run.result || {};
    const actions = [];
    if (run.status === 'AWAITING_CONFIRMATION') actions.push(`<button class="btn btn-primary btn-sm" onclick="confirmAgentRun(${run.id})">대상 확인</button>`);
    if (run.status === 'AWAITING_APPROVAL') {
      actions.push(`<button class="btn btn-primary btn-sm" onclick="approveAgentRun(${run.id})">검토 후 승인</button>`);
      actions.push(`<button class="btn btn-secondary btn-sm" onclick="rejectAgentRun(${run.id})">반려</button>`);
    }
    if (['RETRY_SCHEDULED','NEEDS_HUMAN','FAILED'].includes(run.status)) actions.push(`<button class="btn btn-primary btn-sm" onclick="retryAgentRun(${run.id})">재시도</button>`);
    if (!['COMPLETED','FAILED','CANCELLED'].includes(run.status)) actions.push(`<button class="btn btn-secondary btn-sm" onclick="cancelAgentRun(${run.id})">취소</button>`);
    target.innerHTML = `
      <div class="agent-inspector-head">
        <div><span>RUN-${String(run.id).padStart(4,'0')}</span><strong>${escapeHtml(run.intent)}</strong></div>
        <span class="agent-risk risk-${String(run.riskLevel).toLowerCase()}">${escapeHtml(run.riskLevel)}</span>
      </div>
      <div class="agent-contract-strip">
        <span>${escapeHtml(run.policyVersion)}</span><span>${escapeHtml(run.modelContractVersion)}</span>
        <span>CASE REV ${run.caseRevision ?? '-'}</span><span>RETRY ${run.retryCount}</span>
      </div>
      <ol class="agent-ops-step-timeline" aria-label="Agent 실행 단계">
        ${(run.steps || []).map(step => `<li class="agent-ops-step">
          <span class="agent-ops-step-marker ${step.status === 'COMPLETED' ? 'done' : ''}" aria-hidden="true"></span>
          <div class="agent-ops-step-body">
            <div class="agent-ops-step-heading">
              <strong>${escapeHtml(step.agentName)}</strong>
              <span class="agent-ops-step-status ${step.status === 'COMPLETED' ? 'done' : ''}">${escapeHtml(statusLabel[step.status] || step.status)}</span>
            </div>
            <span class="agent-ops-step-unit" title="${escapeHtml(step.unitType)}">${escapeHtml(unitLabel[step.unitType] || step.unitType)}</span>
          </div>
          <time>${escapeHtml((step.completedAt || step.startedAt || '').replace('T',' ').slice(0,16))}</time>
        </li>`).join('') || '<li class="agent-empty">단계 기록 없음</li>'}
      </ol>
      <div class="agent-evidence-summary">
        <h4>판단 요약</h4><p>${escapeHtml(result.reasoningSummary || '아직 결과가 생성되지 않았습니다.')}</p>
        <div class="agent-result-columns">
          <div><span>FACTS</span><strong>${(result.facts || []).length}</strong></div>
          <div><span>INFERENCES</span><strong>${(result.inferences || []).length}</strong></div>
          <div><span>UNKNOWNS</span><strong>${(result.unknowns || []).length}</strong></div>
          <div><span>CONFIDENCE</span><strong>${result.confidence == null ? '-' : Math.round(result.confidence * 100) + '%'}</strong></div>
        </div>
        ${(result.unknowns || []).map(item => `<div class="agent-unknown">확인 필요 · ${escapeHtml(item)}</div>`).join('')}
        ${(result.policyViolations || []).map(item => `<div class="agent-violation">${escapeHtml(item.code || 'POLICY')} · ${escapeHtml(item.message || item)}</div>`).join('')}
      </div>
      <div class="agent-inspector-actions">${actions.join('')}</div>`;
  }

  function paintFindings() {
    const target = document.getElementById('agentQualityFindings');
    if (!target) return;
    if (!ops.findings.length) {
      target.innerHTML = '<div class="agent-empty agent-empty-ok">열린 데이터 품질 항목이 없습니다.</div>';
      return;
    }
    target.innerHTML = ops.findings.map(item => `<div class="agent-finding severity-${item.severity.toLowerCase()}">
      <div><span>${escapeHtml(item.severity)}</span><strong>${escapeHtml(item.code)}</strong><p>${escapeHtml(item.description)}</p></div>
      <div class="agent-finding-side"><small>${escapeHtml(item.field || 'CASE')}</small><b>${escapeHtml(item.status)}</b>
      ${item.status === 'OPEN' ? `<button onclick="resolveAgentFinding(${item.id})">해결 기록</button>` : ''}</div>
    </div>`).join('');
  }

  function paintSources() {
    const target = document.getElementById('agentSourceList');
    if (!target) return;
    if (!ops.sources.length) {
      target.innerHTML = '<div class="agent-empty">등록된 Evidence Source가 없습니다.</div>';
      return;
    }
    target.innerHTML = ops.sources.map(item => `<div class="agent-source-row">
      <i data-lucide="file-search"></i><div><strong>${escapeHtml(item.originalName)}</strong><small>${escapeHtml(item.sourceType)} · ${escapeHtml(item.extractionStatus)} · 본문 중앙 미보관</small></div>
      <code title="${escapeHtml(item.sha256)}">${escapeHtml(item.sha256.slice(0,12))}</code>
    </div>`).join('');
  }

  function paintControlPlane() {
    const target = document.getElementById('agentControlPlane');
    if (!target) return;
    const a = ops.adapters || {};
    const rows = [
      ['CENTRAL RUNTIME', true, 'SQLite · schema v3'],
      ['AUDIT LEDGER', true, '모든 Run/승인/실패 기록'],
      ['INTERNAL SYSTEM', Boolean(a.internalSystems?.available), `${a.internalSystems?.provider || 'UNCONFIGURED'} · WRITE OFF`],
      ['EMAIL', false, `${a.email?.provider || 'UNDECIDED'} · SEND OFF · INBOUND OFF`],
      ['EXTERNAL INFO', Boolean(a.externalInformation?.available), a.externalInformation?.provider || 'UNCONFIGURED']
    ];
    target.innerHTML = `<div class="agent-control-list">${rows.map(([label,on,desc]) => `<div><span class="agent-control-dot ${on ? 'on' : 'off'}"></span><strong>${label}</strong><small>${escapeHtml(desc)}</small></div>`).join('')}</div>
      <div class="agent-notification-list"><h4>내부 알림 ${ops.notifications.length}</h4>${ops.notifications.slice(0,5).map(item => `<button onclick="${item.runId ? `selectAgentRun(${item.runId})` : ''}"><span>${escapeHtml(item.severity)}</span><div><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.message)}</small></div></button>`).join('') || '<div class="agent-empty">현재 역할의 열린 알림이 없습니다.</div>'}</div>`;
  }

  function setAgentRequestPreset(kind) {
    const input = document.getElementById('agentRequestText');
    const c = getActiveCaseSafe();
    if (!input || !c) return;
    const map = {
      draft:`${c.id} D1~D3 초안을 작성해줘`, validate:`${c.id} Case 데이터와 Evidence 품질을 검증해줘`,
      root:`${c.id} D4 발생원인과 유출원인 후보를 분석해줘`, similar:`${c.id} 과거 유사 Case와 재발 대책을 찾아줘`
    };
    input.value = map[kind] || '';
    input.focus();
  }

  async function submitAgentOperation() {
    const input = document.getElementById('agentRequestText');
    const c = getActiveCaseSafe();
    if (!input || !c || !input.value.trim()) return alert('Agent 요청 내용을 입력해 주세요.');
    try {
      const run = await QMSApi.createAgentRun({
        caseId: c.id, requestText: input.value.trim(), triggerType: 'NATURAL_LANGUAGE',
        idempotencyKey: `ui:${c.id}:${Date.now()}:${Math.random().toString(16).slice(2)}`
      });
      input.value = '';
      await refreshAgentOperations({ selectRunId: run.id });
    } catch (error) { alert(`Agent 실행 실패: ${error.message}`); }
  }

  async function approveAgentRun(runId) {
    const run = ops.runs.find(item => item.id === Number(runId));
    if (!run) return;
    const comment = prompt('검토 및 승인 의견을 입력해 주세요.');
    if (!comment) return;
    const critical = ops.findings.filter(item => item.runId === run.id && item.status === 'OPEN' && item.severity === 'CRITICAL');
    let overrideReason = '';
    if (critical.length) {
      overrideReason = prompt(`Critical 품질 항목 ${critical.length}건이 열려 있습니다. 관리자 전결 사유를 10자 이상 입력하거나 취소하십시오.`) || '';
    }
    try {
      const applyToCase = ['CREATE_D1_D3_DRAFT','ANALYZE_ROOT_CAUSE','CREATE_CORRECTIVE_ACTION_DRAFT','CREATE_REPORT_DRAFT'].includes(run.intent);
      const result = await QMSApi.agentRunAction(run.id, 'approve', {
        comment, overrideReason, applyToCase, expectedRevision: QMSApi.getState().centralRevision
      });
      if (applyToCase && result.status === 'COMPLETED') {
        alert('승인된 Agent 초안이 중앙 Case에 반영되었습니다. 최신 revision을 불러옵니다.');
        location.reload();
        return;
      }
      await refreshAgentOperations({ selectRunId: run.id });
    } catch (error) { alert(`승인 실패: ${error.message}`); }
  }

  async function rejectAgentRun(runId) {
    const comment = prompt('반려 사유를 입력해 주세요.');
    if (!comment) return;
    try { await QMSApi.agentRunAction(runId, 'reject', { comment }); await refreshAgentOperations({ selectRunId: runId }); }
    catch (error) { alert(`반려 실패: ${error.message}`); }
  }

  async function confirmAgentRun(runId) {
    const c = getActiveCaseSafe();
    const caseId = prompt('대상 Case 번호를 확인해 주세요.', c?.id || '');
    if (!caseId) return;
    const run = ops.runs.find(item => item.id === Number(runId));
    try { await QMSApi.agentRunAction(runId, 'confirm', { caseId, intent: run?.intent }); await refreshAgentOperations({ selectRunId: runId }); }
    catch (error) { alert(`확인 실패: ${error.message}`); }
  }

  async function retryAgentRun(runId) {
    try { await QMSApi.agentRunAction(runId, 'retry', {}); await refreshAgentOperations({ selectRunId: runId }); }
    catch (error) { alert(`재시도 실패: ${error.message}`); }
  }

  async function cancelAgentRun(runId) {
    const comment = prompt('취소 사유를 입력해 주세요.');
    if (!comment) return;
    try { await QMSApi.agentRunAction(runId, 'cancel', { comment }); await refreshAgentOperations({ selectRunId: runId }); }
    catch (error) { alert(`취소 실패: ${error.message}`); }
  }

  async function resolveAgentFinding(findingId) {
    const comment = prompt('확인하거나 해결한 내용과 근거를 입력해 주세요.');
    if (!comment) return;
    const status = confirm('완전히 해결된 항목입니까?\n확인: RESOLVED / 취소: ACKNOWLEDGED') ? 'RESOLVED' : 'ACKNOWLEDGED';
    try { await QMSApi.resolveQualityFinding(findingId, status, comment); await refreshAgentOperations(); }
    catch (error) { alert(`품질 항목 처리 실패: ${error.message}`); }
  }

  async function runAgentSchedulerNow() {
    try { const jobs = await QMSApi.evaluateScheduledJobs(true); alert(`Scheduler 점검 완료: ${jobs.length}개 Job 처리`); await refreshAgentOperations(); }
    catch (error) { alert(`Scheduler 점검 실패: ${error.message}`); }
  }

  function openAgentSourceModal() {
    const c = getActiveCaseSafe();
    if (!c) return alert('Case를 먼저 선택해 주세요.');
    const modal = document.getElementById('globalModal');
    const container = document.getElementById('modalContainer');
    if (!modal || !container) return;
    container.innerHTML = `<div class="agent-source-modal"><header><div><span>SOURCE LINEAGE</span><h3>Evidence Source 등록</h3></div><button onclick="closeModal()">✕</button></header>
      <p>원본 본문은 중앙 DB에 저장하지 않으며 SHA-256, 파일 메타데이터와 추출 결과만 기록합니다. 최대 2MB.</p>
      <label>파일<input id="agentSourceFile" type="file" accept=".pdf,.png,.jpg,.jpeg,.xlsx,.xls,.csv,.txt"></label>
      <label>출처 유형<select id="agentSourceType"><option>DOCUMENT</option><option>INSPECTION_RESULT</option><option>LEDGER</option><option>IMAGE</option></select></label>
      <label>페이지/시트<input id="agentSourcePage" placeholder="예: Page 2 / Sheet 검사결과"></label>
      <div class="agent-source-modal-actions"><button class="btn btn-secondary" onclick="closeModal()">취소</button><button class="btn btn-primary" onclick="registerAgentSourceFromModal()">등록</button></div></div>`;
    modal.style.display = 'flex';
  }

  async function registerAgentSourceFromModal() {
    const c = getActiveCaseSafe();
    const file = document.getElementById('agentSourceFile')?.files?.[0];
    if (!c || !file) return alert('등록할 파일을 선택해 주세요.');
    if (file.size > 2 * 1024 * 1024) return alert('현재 Source 등록 한도는 2MB입니다. 원본 저장소 연결 후 확장할 수 있습니다.');
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = '';
      bytes.forEach(byte => { binary += String.fromCharCode(byte); });
      await QMSApi.registerAgentSource(c.id, {
        originalName:file.name, mimeType:file.type || 'application/octet-stream', byteSize:file.size,
        contentBase64:btoa(binary), sourceType:document.getElementById('agentSourceType').value,
        pageOrSheet:document.getElementById('agentSourcePage').value
      });
      closeModal();
      await refreshAgentOperations();
    } catch (error) { alert(`Source 등록 실패: ${error.message}`); }
  }

  Object.assign(global, {
    renderAgentOperationsView, refreshAgentOperations, selectAgentRun, setAgentRequestPreset,
    submitAgentOperation, approveAgentRun, rejectAgentRun, confirmAgentRun, retryAgentRun,
    cancelAgentRun, resolveAgentFinding, runAgentSchedulerNow, openAgentSourceModal,
    registerAgentSourceFromModal
  });
})(typeof window !== 'undefined' ? window : globalThis);
