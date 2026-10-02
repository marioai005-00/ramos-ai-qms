// D4 quality-tool advice. The server asks an external AI to read the centrally saved Case and propose
// which analysis tools to use, in what order and why. The advice is a proposal: nothing is applied until a
// person presses the apply button, and it never fills a hypothesis, a finding or a root cause.
let d4ToolAdviceLoading = false;

function d4AdviceEscape(value) { return escapeWorkspaceValue(String(value ?? '')); }

async function requestD4ToolAdvice() {
  const c = getActiveCase();
  if (!c || d4ToolAdviceLoading) return;
  captureD4Form(c);
  saveAppData();
  d4ToolAdviceLoading = true;
  renderCurrentView();
  try {
    await QMSApi.flushSaves();
    const advice = await QMSApi.d4ToolAdvice(c.id);
    if (getActiveCase() !== c) { alert('화면이 변경되어 추천을 반영하지 않았습니다.'); return; }
    c.d4.toolAdvice = advice;
    saveAppData();
  } catch (error) {
    alert(`AI 추천을 받지 못했습니다. 작성 내용은 그대로입니다.\n${error.message}\n\n아래 [규칙 추천 다시 계산]은 AI 없이도 사용할 수 있습니다.`);
  } finally {
    d4ToolAdviceLoading = false;
    renderCurrentView();
  }
}

function discardD4ToolAdvice() {
  const c = getActiveCase();
  if (!c?.d4?.toolAdvice || !confirm('AI 추천 내용을 화면에서 지웁니다. 이미 작업대에 추가한 도구는 그대로 남습니다.')) return;
  captureD4Form(c);
  delete c.d4.toolAdvice;
  saveAppData();
  renderCurrentView();
}

// Puts the proposed profile and tools on the workbench. Tool rows are added empty: the person writes the
// hypothesis, evidence and finding.
function applyD4ToolAdvice() {
  const c = getActiveCase();
  const advice = c?.d4?.toolAdvice;
  if (!advice?.tools?.length) return;
  const d4 = captureD4Form(c);
  d4.analysisProfile = { ...d4.analysisProfile, ...advice.profile };
  d4.recommendations = advice.tools.map(tool => ({ id: tool.id, priority: tool.core ? '필수' : 'AI 추천', reason: tool.why || 'D4 필수 원인분석 흐름' }));
  advice.tools.forEach(tool => {
    if (getD4ToolById(tool.id) && !d4.selectedTools.some(row => row.id === tool.id)) {
      d4.selectedTools.push({ id: tool.id, source: 'AI', hypothesis: '', evidence: '', finding: '', owner: '', status: 'Planned', verified: false });
    }
  });
  // Keep the workbench in the proposed order; tools the team added by hand stay after them.
  const order = new Map(advice.tools.map(tool => [tool.id, tool.order]));
  d4.selectedTools.sort((a, b) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999));
  advice.appliedAt = qmsLocalTimestamp();
  d4.approval = { status: 'Draft', humanConfirmed: false };
  saveAppData();
  renderCurrentView();
}

// One line of guidance shown on a workbench tool card.
function renderD4ToolAdviceHint(c, toolId) {
  const tool = c?.d4?.toolAdvice?.tools?.find(item => item.id === toolId);
  if (!tool || tool.source !== 'ai' || (!tool.question && !tool.dataNeeded)) return '';
  return `<div class="d4-advice-hint"><span>AI 제안</span><div>${tool.question ? `<p><b>확인할 질문</b> ${d4AdviceEscape(tool.question)}</p>` : ''}${tool.dataNeeded ? `<p><b>필요 자료</b> ${d4AdviceEscape(tool.dataNeeded)}${tool.dataOwner ? ` · ${d4AdviceEscape(tool.dataOwner)}` : ''}</p>` : ''}</div></div>`;
}

function renderD4ToolAdvicePanel(c) {
  const advice = c?.d4?.toolAdvice;
  const button = `<button type="button" class="btn btn-primary" onclick="requestD4ToolAdvice()" ${d4ToolAdviceLoading ? 'disabled' : ''}><i data-lucide="sparkles"></i> ${d4ToolAdviceLoading ? 'AI가 Case를 읽는 중…' : advice ? 'AI 추천 다시 받기' : 'AI에게 도구 추천받기'}</button>`;
  const head = `<div class="quality-tool-head inline-head"><div><span class="quality-tool-kicker">D4 · AI 품질도구 추천</span><h3>어떤 도구를 어떤 순서로 쓸지 추천받기</h3><p>저장된 접수 내용·D2 문제 정의·첨부 자료 목록을 외부 AI(Gemini/Groq)에 보내 도구와 순서를 제안받습니다. AI는 원인을 정하지 않으며, 제안은 사람이 확인한 뒤 적용합니다.</p></div>${button}</div>`;
  if (!advice) return `<div class="card quality-stage-card d4-advice-panel">${head}</div>`;
  const selected = new Set((c.d4.selectedTools || []).map(row => row.id));
  const profileKeys = [['failureMode', '불량 유형'], ['pattern', '발생 패턴'], ['dataScope', '확보 데이터'], ['productionModel', '생산 형태'], ['escapeConcern', '검사 유출 의심']];
  const profile = profileKeys.map(([key, label]) => `<div class="d4-advice-profile-item"><span>${label}</span><strong>${d4AdviceEscape(advice.profileLabels?.[key] || '미확정')}</strong><p>${d4AdviceEscape(advice.profileReasons?.[key] || '이유가 제시되지 않았습니다.')}</p></div>`).join('');
  const tools = advice.tools.map(tool => `<li class="d4-advice-tool">
      <div class="d4-advice-order">${tool.order}</div>
      <div class="d4-advice-body">
        <div class="d4-advice-title"><strong>${d4AdviceEscape(tool.name)}</strong><span class="d4-priority ${tool.core ? 'core' : 'adaptive'}">${tool.core ? '필수' : 'AI 추천'}</span><span class="d4-advice-ready ${tool.readiness === 'ready' ? 'ready' : 'need'}">${tool.readiness === 'ready' ? '지금 자료로 시작 가능' : '자료 먼저 필요'}</span>${selected.has(tool.id) ? '<span class="d4-advice-added">작업대에 있음</span>' : ''}</div>
        ${tool.source !== 'ai' ? '<p class="d4-advice-muted">AI가 설명하지 않은 필수 도구입니다.</p>' : `
        <dl>
          ${tool.why ? `<dt>왜 필요한가</dt><dd>${d4AdviceEscape(tool.why)}</dd>` : ''}
          ${tool.question ? `<dt>확인할 질문</dt><dd>${d4AdviceEscape(tool.question)}</dd>` : ''}
          ${tool.dataNeeded ? `<dt>필요 자료</dt><dd>${d4AdviceEscape(tool.dataNeeded)}${tool.dataOwner ? ` <em>(${d4AdviceEscape(tool.dataOwner)})</em>` : ''}</dd>` : ''}
          ${tool.nextIf ? `<dt>다음 단계</dt><dd>${d4AdviceEscape(tool.nextIf)}</dd>` : ''}
        </dl>`}
      </div>
    </li>`).join('');
  const excluded = advice.excluded?.length ? `<div class="d4-advice-block"><h4>이번에는 쓰지 않는 도구</h4><ul class="d4-advice-plain">${advice.excluded.map(item => `<li><b>${d4AdviceEscape(item.name)}</b> ${d4AdviceEscape(item.reason)}</li>`).join('')}</ul></div>` : '';
  const questions = advice.openQuestions?.length ? `<div class="d4-advice-block warn"><h4>먼저 확인할 사실</h4><ul class="d4-advice-plain">${advice.openQuestions.map(item => `<li>${d4AdviceEscape(item)}</li>`).join('')}</ul></div>` : '';
  return `<div class="card quality-stage-card d4-advice-panel">${head}
    <div class="d4-advice-meta"><span class="badge-pill badge-warn">AI 제안 · 사람 확인 필요</span><span>${d4AdviceEscape(advice.provider || '')} ${d4AdviceEscape(advice.model || '')} · ${d4AdviceEscape(advice.generatedAt && !Number.isNaN(Date.parse(advice.generatedAt)) ? qmsLocalTimestamp(new Date(advice.generatedAt)) : '')} 생성${advice.appliedAt ? ` · ${d4AdviceEscape(advice.appliedAt)} 적용` : ''}</span></div>
    ${questions}
    <div class="d4-advice-block"><h4>AI가 읽은 Case 특성</h4><div class="d4-advice-profile">${profile}</div></div>
    <div class="d4-advice-block"><h4>추천 도구와 순서</h4><ol class="d4-advice-tools">${tools}</ol></div>
    ${excluded}
    <div class="d4-selector-actions"><span>적용하면 Case 특성 5개 항목과 도구 목록이 작업대에 들어갑니다. 가설·Evidence·결과는 비어 있는 채로 추가됩니다.</span><button type="button" class="btn btn-secondary" onclick="discardD4ToolAdvice()">추천 지우기</button><button type="button" class="btn btn-primary" onclick="applyD4ToolAdvice()"><i data-lucide="wand-sparkles"></i> 이 추천을 작업대에 적용</button></div>
  </div>`;
}
