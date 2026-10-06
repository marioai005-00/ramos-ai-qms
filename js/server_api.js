/* RAMOS QMS central server adapter: auth, shared state, approvals and audit. */
(function(global) {
  'use strict';

  const state = {
    available: null,
    authenticated: false,
    csrfToken: '',
    centralRevision: 0,
    user: null,
    saveRunning: false,
    pendingState: null,
    pendingReason: '',
    conflictShown: false,
    lastSaveError: null
  };

  async function request(path, options = {}) {
    const headers = { Accept: 'application/json', ...(options.headers || {}) };
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    if (options.method && options.method !== 'GET' && state.csrfToken) headers['X-QMS-CSRF'] = state.csrfToken;
    let response;
    try {
      response = await fetch(path, {
        method: options.method || 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body)
      });
      state.available = true;
    } catch (error) {
      state.available = false;
      const offline = new Error('중앙 QMS 서버에 연결할 수 없습니다. run_portal.bat로 실행해 주세요.');
      offline.code = 'SERVER_OFFLINE';
      offline.cause = error;
      throw offline;
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.error || `서버 요청 실패 (HTTP ${response.status})`);
      error.code = payload.code || `HTTP_${response.status}`;
      error.status = response.status;
      error.details = payload.details;
      throw error;
    }
    return payload;
  }

  function normalizeUser(user) {
    if (!user) return null;
    const preset = typeof PRESET_USERS !== 'undefined'
      ? PRESET_USERS.find(item => item.username === user.username || item.email === user.email) : null;
    return {
      ...(preset || {}),
      ...user,
      roles: Array.isArray(user.roles) ? user.roles : [],
      roleDesc: Array.isArray(user.roles) ? user.roles.join(', ') : '',
      isMaster: Boolean(user.isMaster),
      isSupplier: Boolean(user.isSupplier)
    };
  }

  async function me() {
    try {
      const payload = await request('/__api__/auth/me');
      state.authenticated = true;
      state.csrfToken = payload.csrfToken || '';
      state.user = normalizeUser(payload.user);
      return state.user;
    } catch (error) {
      if (error.status === 401) {
        state.available = true;
        state.authenticated = false;
        state.csrfToken = '';
        state.user = null;
        return null;
      }
      throw error;
    }
  }

  async function login(username, password) {
    const payload = await request('/__api__/auth/login', { method: 'POST', body: { username, password } });
    state.authenticated = true;
    state.csrfToken = payload.csrfToken || '';
    state.user = normalizeUser(payload.user);
    return state.user;
  }

  async function logout() {
    if (state.available && state.authenticated) {
      try { await request('/__api__/auth/logout', { method: 'POST', body: {} }); } catch (_) {}
    }
    state.authenticated = false;
    state.csrfToken = '';
    state.user = null;
  }

  function businessState(source) {
    return {
      cases: Array.isArray(source?.cases) ? source.cases : [],
      intakeQueue: Array.isArray(source?.intakeQueue) ? source.intakeQueue : [],
      // Report templates are shared by everyone who reads D6 test reports.
      reportTemplates: Array.isArray(source?.reportTemplates) ? source.reportTemplates : [],
      // The product list D7 horizontal deployment draws its candidates from.
      productCatalog: Array.isArray(source?.productCatalog) ? source.productCatalog : []
    };
  }

  async function hydrateCentralState(localData) {
    const payload = await request('/__api__/qms/state');
    const record = payload.record;
    if (!record) {
      // Supplier accounts cannot write Case state, so they never seed the first central record.
      if (state.user?.isSupplier) return { ...localData, cases: [], intakeQueue: [], _centralRevision: 0, _centralMode: true };
      const initial = businessState(localData);
      const saved = await request('/__api__/qms/state', {
        method: 'POST',
        body: { state: initial, expectedRevision: 0, reason: 'Initial browser data migration' }
      });
      state.centralRevision = saved.revision;
      return { ...localData, ...initial, _centralRevision: saved.revision, _centralMode: true };
    }
    state.centralRevision = Number(record.revision) || 0;
    const central = businessState(record.state);
    const activeCaseId = central.cases.some(item => item.id === localData?.activeCaseId)
      ? localData.activeCaseId
      : (central.cases[0]?.id || null);
    return {
      ...localData,
      ...central,
      activeCaseId,
      activeIntakeId: central.intakeQueue.some(item => item.intakeId === localData?.activeIntakeId) ? localData.activeIntakeId : null,
      _centralRevision: state.centralRevision,
      _centralMode: true,
      _centralUpdatedAt: record.updatedAt
    };
  }

  function queueCentralSave(source, reason = 'browser update') {
    if (!state.available || !state.authenticated || state.user?.isSupplier) return;
    state.pendingState = businessState(source);
    state.pendingReason = reason;
    if (!state.saveRunning) drainSaves();
  }

  async function drainSaves() {
    state.saveRunning = true;
    while (state.pendingState) {
      const snapshot = state.pendingState;
      const reason = state.pendingReason;
      state.pendingState = null;
      try {
        const result = await request('/__api__/qms/state', {
          method: 'POST',
          body: { state: snapshot, expectedRevision: state.centralRevision, reason }
        });
        state.centralRevision = result.revision;
        state.lastSaveError = null;
        if (global.appData) {
          global.appData._centralRevision = result.revision;
          global.appData._centralUpdatedAt = result.updatedAt;
        }
        state.conflictShown = false;
      } catch (error) {
        state.lastSaveError = error;
        console.error('Central QMS save failed:', error);
        if (error.code === 'REVISION_CONFLICT') {
          state.pendingState = null;
          if (!state.conflictShown) {
            state.conflictShown = true;
            alert('다른 사용자가 중앙 데이터를 먼저 저장했습니다. 현재 화면의 변경은 로컬에 보존되었지만 중앙 저장은 중단되었습니다. 새로고침 후 다시 확인해 주세요.');
          }
        } else if (error.code === 'APPROVAL_NOT_RECORDED') {
          // Retrying cannot succeed: the state claims an approval the server never recorded.
          state.pendingState = null;
          alert(`${error.message}\n새로고침하여 중앙 데이터를 다시 불러와 주세요.`);
        } else {
          state.pendingState = snapshot;
          break;
        }
      }
    }
    state.saveRunning = false;
  }

  async function flushSaves() {
    if (!state.authenticated) throw new Error('서버 로그인이 필요합니다.');
    if (!state.saveRunning && state.pendingState) await drainSaves();
    while (state.saveRunning) await new Promise(resolve => setTimeout(resolve, 30));
    if (state.lastSaveError) throw state.lastSaveError;
    if (state.pendingState) throw new Error('중앙 저장을 완료하지 못했습니다.');
  }

  async function uploadCaseEvidence(caseId, file, type, linkedStages, sourceNote) {
    await flushSaves();
    const dataUrl = await fileAsDataURL(file);
    const result = await request(`/__api__/qms/cases/${encodeURIComponent(caseId)}/evidence`, {
      method: 'POST', body: { filename: file.name, dataUrl, type, linkedStages, expectedRevision: state.centralRevision, ...(sourceNote ? { sourceNote } : {}) }
    });
    state.centralRevision = result.revision;
    return result;
  }

  async function fetchCaseEvidence(caseId, evidenceId) {
    const response = await fetch(`/__api__/qms/cases/${encodeURIComponent(caseId)}/evidence/${encodeURIComponent(evidenceId)}/file`, { credentials: 'same-origin', cache: 'no-store' });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || `원본 요청 실패 (HTTP ${response.status})`);
    }
    return response.blob();
  }

  // An intake has no Case yet, so its originals are stored under the intake number.
  async function uploadIntakeFile(intakeId, file) {
    const dataUrl = await fileAsDataURL(file);
    return (await request('/__api__/qms/intake-files', { method: 'POST', body: { intakeId, filename: file.name, dataUrl } })).file;
  }

  async function fetchIntakeFile(fileId) {
    const response = await fetch(`/__api__/qms/intake-files/${encodeURIComponent(fileId)}`, { credentials: 'same-origin', cache: 'no-store' });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || `원본 요청 실패 (HTTP ${response.status})`);
    }
    return response.blob();
  }

  // Copies the stored originals of the Case's source intake into the Case evidence.
  async function carryIntakeOriginals(caseId) {
    await flushSaves();
    const result = await request(`/__api__/qms/cases/${encodeURIComponent(caseId)}/intake-originals`, { method: 'POST', body: { expectedRevision: state.centralRevision } });
    state.centralRevision = result.revision;
    return result;
  }

  async function createStageVersion(caseId, stageKey, snapshot) {
    return request('/__api__/qms/stage-version', { method: 'POST', body: { caseId, stageKey, snapshot } });
  }

  async function recordApproval(payload) {
    return request('/__api__/qms/approval', { method: 'POST', body: payload });
  }

  async function prepareDispatch(payload) {

    return request('/__api__/qms/dispatch/prepare', { method: 'POST', body: payload });
  }

  async function evaluateEscalations() {
    const result = await request('/__api__/qms/escalations/evaluate', { method: 'POST', body: {} });
    return result.items || [];
  }

  async function similarCases(caseId, limit = 5) {
    const query = new URLSearchParams({ caseId, limit: String(limit) });
    const payload = await request(`/__api__/qms/similar-cases?${query}`);
    return payload.matches || [];
  }

  async function generateD1D3Draft(caseData) {
    const payload = await request('/__api__/qms/ai/d1-d3-draft', { method: 'POST', body: { case: caseData } });
    return payload.draft;
  }

  async function deleteRecord(type, id, reason) {
    // Pending edits are saved first so the server removes the record from the latest state.
    await flushSaves();
    const result = await request('/__api__/qms/records/delete', { method: 'POST', body: { type, id, reason, expectedRevision: state.centralRevision } });
    state.centralRevision = result.revision;
    return result;
  }

  async function d8Readiness(caseId) {
    return await request('/__api__/qms/d8/readiness', { method: 'POST', body: { caseId } });
  }

  async function d8MonitoringPlan(caseId, days) {
    return (await request('/__api__/qms/d8/monitoring-plan', { method: 'POST', body: { caseId, days } })).plan;
  }

  async function d8Review(caseId) {
    return (await request('/__api__/qms/ai/d8-review', { method: 'POST', body: { caseId } })).review;
  }

  async function d8Draft(caseId, english) {
    return (await request('/__api__/qms/ai/d8-draft', { method: 'POST', body: { caseId, english } })).draft;
  }

  async function d7SystemAdvice(caseId) {
    return (await request('/__api__/qms/ai/d7-system-advice', { method: 'POST', body: { caseId } })).advice;
  }

  async function d7DeploymentAdvice(caseId) {
    return (await request('/__api__/qms/ai/d7-deployment-advice', { method: 'POST', body: { caseId } })).advice;
  }

  async function d7Lessons(caseId) {
    return (await request('/__api__/qms/ai/d7-lessons', { method: 'POST', body: { caseId } })).lessons;
  }

  async function d7Checks(caseId) {
    return await request('/__api__/qms/d7/checks', { method: 'POST', body: { caseId } });
  }

  async function d6TestPlan(caseId) {
    return (await request('/__api__/qms/ai/d6-test-plan', { method: 'POST', body: { caseId } })).plan;
  }

  async function d6ReadReport(caseId, testId, template, file) {
    const dataUrl = await fileAsDataURL(file);
    return (await request('/__api__/qms/ai/d6-read-report', { method: 'POST', body: { caseId, testId, template, file: { name: file.name, dataUrl } } })).reading;
  }

  async function d6Statistics(body) {
    return (await request('/__api__/qms/d6/statistics', { method: 'POST', body })).result;
  }

  async function d6Checks(caseId) {
    return await request('/__api__/qms/d6/checks', { method: 'POST', body: { caseId } });
  }

  async function d5ActionAdvice(caseId) {
    const payload = await request('/__api__/qms/ai/d5-action-advice', { method: 'POST', body: { caseId } });
    return payload.advice;
  }

  async function d4ToolAdvice(caseId) {
    const payload = await request('/__api__/qms/ai/d4-tool-advice', { method: 'POST', body: { caseId } });
    return payload.advice;
  }

  async function generateStageDraft(caseId, stage) {
    const payload = await request('/__api__/qms/ai/stage-draft', { method: 'POST', body: { caseId, stage } });
    return payload.draft;
  }

  async function supplierSummary() {
    return request('/__api__/qms/supplier-summary');
  }

  async function downloadCaseReport(caseId, gateKey) {
    const response = await fetch(`/__api__/qms/cases/${encodeURIComponent(caseId)}/report.xlsx?gate=${encodeURIComponent(gateKey)}`, { credentials: 'same-origin', cache: 'no-store' });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || `보고서 요청 실패 (HTTP ${response.status})`);
    }
    const name = /filename\*=UTF-8''([^;]+)/.exec(response.headers.get('Content-Disposition') || '');
    return { blob: await response.blob(), filename: name ? decodeURIComponent(name[1]) : `${caseId}_${gateKey}.xlsx` };
  }

  async function listAgentRuns(filters = {}) {
    const query = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') query.set(key, String(value));
    });
    const payload = await request(`/__api__/qms/agent-runs?${query}`);
    return payload.items || [];
  }

  async function getAgentRun(runId) {
    const payload = await request(`/__api__/qms/agent-runs/${Number(runId)}`);
    return payload.run;
  }

  async function createAgentRun(payload) {
    const result = await request('/__api__/qms/agent-runs', { method: 'POST', body: payload });
    return result.run;
  }

  async function agentRunAction(runId, action, body = {}) {
    const result = await request(`/__api__/qms/agent-runs/${Number(runId)}/${action}`, { method: 'POST', body });
    return result.run;
  }

  async function listQualityFindings(caseId) {
    const payload = await request(`/__api__/qms/cases/${encodeURIComponent(caseId)}/quality-findings`);
    return payload.items || [];
  }

  async function resolveQualityFinding(findingId, status, comment) {
    const payload = await request(`/__api__/qms/quality-findings/${Number(findingId)}/resolve`, {
      method: 'POST', body: { status, comment }
    });
    return payload.finding;
  }

  async function listAgentSources(caseId) {
    const payload = await request(`/__api__/qms/cases/${encodeURIComponent(caseId)}/sources`);
    return payload.items || [];
  }

  async function registerAgentSource(caseId, source) {
    const payload = await request(`/__api__/qms/cases/${encodeURIComponent(caseId)}/sources`, { method: 'POST', body: source });
    return payload.source;
  }

  async function getAgentAdapters() {
    return request('/__api__/qms/agent/adapters');
  }

  async function listAgentNotifications(limit = 100) {
    const payload = await request(`/__api__/qms/agent/notifications?limit=${Number(limit)}`);
    return payload.items || [];
  }

  async function listPolicyRules() {
    const payload = await request('/__api__/qms/policy-rules');
    return payload.items || [];
  }

  async function evaluateScheduledJobs(force = false) {
    const payload = await request('/__api__/qms/scheduler/evaluate', { method: 'POST', body: { force } });
    return payload.jobs || [];
  }

  global.QMSApi = {
    state,
    request,
    me,
    login,
    logout,
    hydrateCentralState,
    queueCentralSave,
    flushSaves,
    uploadCaseEvidence,
    fetchCaseEvidence,
    uploadIntakeFile,
    fetchIntakeFile,
    carryIntakeOriginals,
    createStageVersion,
    recordApproval,
    prepareDispatch,
    similarCases,
    generateD1D3Draft,
    deleteRecord,
    generateStageDraft,
    d4ToolAdvice,
    d5ActionAdvice,
    d6TestPlan,
    d6ReadReport,
    d6Statistics,
    d6Checks,
    d7SystemAdvice,
    d7DeploymentAdvice,
    d7Lessons,
    d7Checks,
    d8Readiness,
    d8MonitoringPlan,
    d8Review,
    d8Draft,
    supplierSummary,
    downloadCaseReport,
    evaluateEscalations,
    listAgentRuns,
    getAgentRun,
    createAgentRun,
    agentRunAction,
    listQualityFindings,
    resolveQualityFinding,
    listAgentSources,
    registerAgentSource,
    getAgentAdapters,
    listAgentNotifications,
    listPolicyRules,
    evaluateScheduledJobs,
    getState: () => ({ ...state })
  };
})(typeof window !== 'undefined' ? window : globalThis);
