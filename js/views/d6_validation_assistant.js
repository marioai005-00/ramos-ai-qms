// D6 validation assistant: sample size calculator, AI test plans, report reading against a registered report
// template, before/after comparison and application/release checks.
// Numbers come from formulas (server validation_stats.py) or from uploaded reports; the AI never supplies a
// count or a result, and nothing here sets a test result or the containment release decision.
const d6Assist = { loading: '', calc: null, compare: null, read: null, checks: null };
const D6_TEMPLATE_DEFAULT_FIELDS = [
  ['sampleSize', '시료 수'], ['failQty', '불량 수'], ['condition', '시험 조건'], ['lot', '시험 Lot'], ['testDate', '시험일'], ['verdict', '성적서 판정']
];

function d6Esc(value) { return escapeWorkspaceValue(String(value ?? '')); }
function d6Templates() { return Array.isArray(appData.reportTemplates) ? appData.reportTemplates : []; }
function d6OriginalPpm(c) {
  const fail = Number(c.defectQty), n = Number(c.inspectQty);
  return Number.isInteger(fail) && Number.isInteger(n) && fail > 0 && n >= fail ? Math.round(fail / n * 1e6) : '';
}

async function d6Run(key, work) {
  if (d6Assist.loading) return;
  d6Assist.loading = key;
  renderCurrentView();
  try { await work(); }
  catch (error) { alert(error.message); }
  finally { d6Assist.loading = ''; renderCurrentView(); }
}

// ---------------------------------------------------------------- sample size
function d6CalculateSampleSize() {
  const ppm = Number(document.getElementById('d6CalcPpm')?.value);
  const confidence = Number(document.getElementById('d6CalcConfidence')?.value);
  const allowed = Number(document.getElementById('d6CalcAllowed')?.value);
  if (!(ppm > 0 && ppm < 1e6)) { alert('목표 불량률(PPM)을 1 이상으로 입력하세요.'); return; }
  d6Run('calc', async () => {
    d6Assist.calc = await QMSApi.d6Statistics({ kind: 'sampleSize', targetPpm: ppm, confidence, allowedFailures: allowed });
  });
}

// ---------------------------------------------------------------- AI test plans
function requestD6TestPlan() {
  const c = getActiveCase();
  if (!c || !saveLateStage(false)) return;
  d6Run('plan', async () => {
    await QMSApi.flushSaves();
    const plan = await QMSApi.d6TestPlan(c.id);
    if (getActiveCase() !== c) return;
    c.d6.testPlanAdvice = plan;
    saveAppData();
  });
}

function applyD6TestPlans() {
  const c = getActiveCase();
  const advice = c?.d6?.testPlanAdvice;
  const keys = [...document.querySelectorAll('[data-d6-plan]:checked')].map(box => box.dataset.d6Plan);
  if (!advice || !keys.length) { alert('추가할 시험 계획에 체크해 주세요.'); return; }
  if (!saveLateStage(false)) return;
  advice.added = advice.added || [];
  for (const plan of advice.plans.filter(item => keys.includes(item.actionId) && !advice.added.includes(item.actionId))) {
    c.d6.validationTests.push({
      id: `D6-${intakeFileId()}`, actionId: plan.actionId, testName: plan.testName,
      condition: [plan.condition, plan.controlGroup ? `비교 대상: ${plan.controlGroup}` : ''].filter(Boolean).join(' / '),
      acceptanceCriteria: plan.acceptanceCriteria, sampleSize: '', failQty: '', result: 'Pending', owner: '', completedAt: '', evidence: '',
      // The calculated plan values travel with the row so later checks can compare against them.
      plannedSampleSize: plan.sampleSuggestion?.sampleSize || '', allowedFailures: 0,
      source: 'AI 시험 계획', generatedAt: advice.generatedAt
    });
    advice.added.push(plan.actionId);
  }
  c.d6.approval = { status: 'Draft', humanConfirmed: false };
  saveAppData();
  renderCurrentView();
}

function discardD6TestPlan() {
  const c = getActiveCase();
  if (!c?.d6?.testPlanAdvice || !saveLateStage(false)) return;
  delete c.d6.testPlanAdvice;
  saveAppData();
  renderCurrentView();
}

// ---------------------------------------------------------------- report templates
function openD6TemplateModal(templateId = '') {
  const template = d6Templates().find(item => item.id === templateId) || { id: '', name: '', issuer: '', description: '', fields: D6_TEMPLATE_DEFAULT_FIELDS.map(([key, label]) => ({ key, label, hint: '' })) };
  const rows = template.fields.map((field, i) => `<tr><td><input class="form-control" data-d6-tpl-label="${i}" value="${d6Esc(field.label)}" ${['sampleSize', 'failQty'].includes(field.key) ? 'readonly' : ''}><input type="hidden" data-d6-tpl-key="${i}" value="${d6Esc(field.key)}"></td><td><input class="form-control" data-d6-tpl-hint="${i}" value="${d6Esc(field.hint)}" placeholder="성적서에서 이 값이 적힌 위치나 표 이름"></td></tr>`).join('');
  const list = d6Templates().map(item => `<li><button type="button" class="btn btn-secondary btn-sm" onclick="openD6TemplateModal('${d6Esc(item.id)}')">${d6Esc(item.name)}</button>${item.issuer ? ` <small>${d6Esc(item.issuer)}</small>` : ''}</li>`).join('');
  const container = document.getElementById('modalContainer');
  container.style.width = '880px'; container.style.maxWidth = '96vw';
  container.innerHTML = `<div class="d6-template-modal">
    <header><div><span class="quality-tool-kicker">D6 · 성적서 양식</span><h3>${template.id ? '성적서 양식 수정' : '새 성적서 양식 등록'}</h3><p>받는 성적서의 모양을 적어 두면 AI가 그 기준으로 값을 찾습니다. 시료 수와 불량 수는 전·후 비교에 쓰이므로 꼭 있어야 합니다.</p></div><button class="btn btn-secondary btn-sm" onclick="document.getElementById('globalModal').style.display='none'">닫기</button></header>
    ${list ? `<div class="d6-template-list"><span>등록된 양식</span><ul>${list}</ul><button type="button" class="btn btn-secondary btn-sm" onclick="openD6TemplateModal('')">새 양식</button></div>` : ''}
    <div class="grid-3"><label class="form-group"><span class="form-label">양식 이름 *</span><input class="form-control" id="d6TplName" value="${d6Esc(template.name)}" placeholder="예: 신뢰성 시험 성적서"></label>
    <label class="form-group"><span class="form-label">발행처</span><input class="form-control" id="d6TplIssuer" value="${d6Esc(template.issuer)}" placeholder="외주사 또는 부서"></label></div>
    <label class="form-group"><span class="form-label">성적서 설명</span><textarea class="form-control" id="d6TplDescription" rows="3" placeholder="몇 쪽짜리인지, 결과표가 어디 있는지, 수량 단위 등">${d6Esc(template.description)}</textarea></label>
    <table class="custom-table"><thead><tr><th>항목</th><th>찾는 위치 안내</th></tr></thead><tbody id="d6TplRows">${rows}</tbody></table>
    <button type="button" class="btn btn-secondary btn-sm" onclick="addD6TemplateField()">항목 추가</button>
    <footer class="d4-selector-actions">${template.id ? `<button type="button" class="btn btn-secondary" onclick="deleteD6Template('${d6Esc(template.id)}')">이 양식 삭제</button>` : ''}<button type="button" class="btn btn-primary" onclick="saveD6Template('${d6Esc(template.id)}')">양식 저장</button></footer>
  </div>`;
  document.getElementById('globalModal').style.display = 'flex';
}

function addD6TemplateField() {
  const body = document.getElementById('d6TplRows');
  const i = body.querySelectorAll('tr').length;
  body.insertAdjacentHTML('beforeend', `<tr><td><input class="form-control" data-d6-tpl-label="${i}" placeholder="항목 이름"><input type="hidden" data-d6-tpl-key="${i}" value="extra${i}"></td><td><input class="form-control" data-d6-tpl-hint="${i}" placeholder="성적서에서 이 값이 적힌 위치나 표 이름"></td></tr>`);
}

function saveD6Template(templateId) {
  const name = document.getElementById('d6TplName').value.trim();
  if (!name) { alert('양식 이름을 입력하세요.'); return; }
  const fields = [...document.querySelectorAll('[data-d6-tpl-key]')].map(input => {
    const i = input.dataset.d6TplKey === undefined ? '' : input.getAttribute('data-d6-tpl-key');
    return { key: input.value, label: document.querySelector(`[data-d6-tpl-label="${i}"]`)?.value.trim() || '', hint: document.querySelector(`[data-d6-tpl-hint="${i}"]`)?.value.trim() || '' };
  }).filter(field => field.label);
  const template = { id: templateId || `TPL-${intakeFileId()}`, name, issuer: document.getElementById('d6TplIssuer').value.trim(), description: document.getElementById('d6TplDescription').value.trim(), fields, updatedBy: CURRENT_USER.name, updatedAt: qmsLocalTimestamp() };
  appData.reportTemplates = [...d6Templates().filter(item => item.id !== template.id), template];
  saveAppData();
  document.getElementById('globalModal').style.display = 'none';
  renderCurrentView();
}

function deleteD6Template(templateId) {
  if (!confirm('이 성적서 양식을 삭제합니다. 이미 읽은 결과는 남습니다.')) return;
  appData.reportTemplates = d6Templates().filter(item => item.id !== templateId);
  saveAppData();
  document.getElementById('globalModal').style.display = 'none';
  renderCurrentView();
}

// ---------------------------------------------------------------- report reading
function readD6Report() {
  const c = getActiveCase();
  const testId = document.getElementById('d6ReadTest')?.value;
  const template = d6Templates().find(item => item.id === document.getElementById('d6ReadTemplate')?.value);
  const file = document.getElementById('d6ReadFile')?.files?.[0];
  if (!c || !testId || !template || !file) { alert('시험 행, 성적서 양식, 성적서 파일을 모두 선택하세요.'); return; }
  if (!saveLateStage(false)) return;
  d6Run('read', async () => {
    await QMSApi.flushSaves();
    // The report is kept as D6 evidence first, so what the AI read is the stored original.
    const stored = await QMSApi.uploadCaseEvidence(c.id, file, 'Measurement', ['D6'], `D6 시험 성적서 · ${template.name}`);
    Object.assign(c, stored.case);
    saveAppData();
    await QMSApi.flushSaves();
    const result = await QMSApi.d6ReadReport(c.id, testId, template, file);
    d6Assist.read = { ...result, testId, fileName: file.name, templateName: template.name };
  });
}

function applyD6ReportValues() {
  const c = getActiveCase();
  const read = d6Assist.read;
  const test = c?.d6?.validationTests?.find(row => row.id === read?.testId);
  if (!read || !test) return;
  if (!saveLateStage(false)) return;
  if (read.sampleSize != null) test.sampleSize = read.sampleSize;
  if (read.failQty != null) test.failQty = read.failQty;
  if (read.testDate) test.completedAt = read.testDate;
  test.evidence = [test.evidence, read.fileName].filter(Boolean).join(', ');
  test.reportReading = { fileName: read.fileName, template: read.templateName, values: read.values, proposal: read.proposal, mismatches: read.mismatches, readAt: read.generatedAt };
  c.d6.approval = { status: 'Draft', humanConfirmed: false };
  saveAppData();
  renderCurrentView();
  alert('시료 수·불량 수·시험일·Evidence를 시험 행에 옮겼습니다. 판정(PASS/FAIL)은 직접 선택하세요.');
}

// ---------------------------------------------------------------- before / after
function d6AfterTotals(c, actionId) {
  const rows = (c.d6.validationTests || []).filter(row => (!actionId || row.actionId === actionId) && Number.isInteger(Number(row.sampleSize)) && Number(row.sampleSize) > 0 && row.failQty !== '' && Number.isInteger(Number(row.failQty)));
  return { fail: rows.reduce((sum, row) => sum + Number(row.failQty), 0), n: rows.reduce((sum, row) => sum + Number(row.sampleSize), 0), count: rows.length };
}

function d6FillAfter() {
  const c = getActiveCase();
  const totals = d6AfterTotals(c, document.getElementById('d6CmpAction')?.value || '');
  document.getElementById('d6CmpAfterFail').value = totals.count ? totals.fail : '';
  document.getElementById('d6CmpAfterN').value = totals.count ? totals.n : '';
}

function d6Compare() {
  const get = id => document.getElementById(id)?.value;
  const nums = ['d6CmpBeforeFail', 'd6CmpBeforeN', 'd6CmpAfterFail', 'd6CmpAfterN'].map(id => Number(get(id)));
  if (nums.some(v => !Number.isInteger(v) || v < 0)) { alert('적용 전·후 불량 수와 시료 수를 0 이상의 정수로 입력하세요.'); return; }
  const target = Number(get('d6CmpTarget'));
  d6Run('compare', async () => {
    d6Assist.compare = await QMSApi.d6Statistics({ kind: 'compare', before: { fail: nums[0], n: nums[1] }, after: { fail: nums[2], n: nums[3] }, confidence: Number(get('d6CmpConfidence')), ...(target > 0 ? { targetPpm: target } : {}) });
  });
}

function applyD6Compare() {
  const c = getActiveCase();
  const result = d6Assist.compare;
  if (!c || !result || !saveLateStage(false)) return;
  const ba = c.d6.beforeAfter;
  ba.beforeMetric = ba.beforeMetric || `불량 ${result.before.fail}/${result.before.n} (${result.before.ppm.toLocaleString()} PPM)`;
  ba.afterMetric = ba.afterMetric || `불량 ${result.after.fail}/${result.after.n} (${result.after.ppm.toLocaleString()} PPM, 상한 ${result.after.upperBoundPpm.toLocaleString()} PPM)`;
  ba.statistics = { ...result, recordedAt: qmsLocalTimestamp(), recordedBy: CURRENT_USER.name };
  c.d6.approval = { status: 'Draft', humanConfirmed: false };
  saveAppData();
  renderCurrentView();
}

// ---------------------------------------------------------------- checks
function runD6Checks() {
  const c = getActiveCase();
  if (!c || !saveLateStage(false)) return;
  d6Run('checks', async () => {
    await QMSApi.flushSaves();
    d6Assist.checks = { caseId: c.id, ...(await QMSApi.d6Checks(c.id)) };
  });
}

// ---------------------------------------------------------------- panel
function renderD6AssistantPanel(c) {
  const d6 = c.d6, tests = d6.validationTests || [], templates = d6Templates();
  const busy = key => d6Assist.loading === key ? 'disabled' : '';
  const label = (key, idle, active) => d6Assist.loading === key ? active : idle;
  const original = d6OriginalPpm(c);
  const calc = d6Assist.calc;
  const calcBlock = `<div class="d4-advice-block"><h4>① 필요한 시료 수 계산 <span class="d6-formula">통계 공식 · AI 아님</span></h4>
    <div class="d6-inline-form"><label>목표 불량률 (PPM)<input class="form-control" id="d6CalcPpm" type="number" min="1" value="${d6Esc(original)}" placeholder="원래 불량률"></label>
    <label>신뢰도<select class="form-control" id="d6CalcConfidence"><option value="0.8">80%</option><option value="0.9" selected>90%</option><option value="0.95">95%</option></select></label>
    <label>허용 불량 수<select class="form-control" id="d6CalcAllowed"><option>0</option><option>1</option><option>2</option></select></label>
    <button type="button" class="btn btn-secondary" onclick="d6CalculateSampleSize()" ${busy('calc')}>${label('calc', '계산', '계산 중…')}</button></div>
    ${original ? `<p class="d4-advice-muted">기본값은 이 Case의 원래 불량률(${c.defectQty}/${c.inspectQty})입니다.</p>` : ''}
    ${calc ? `<p class="d6-result"><b>${Number(calc.sampleSize).toLocaleString()}개</b> — ${d6Esc(calc.statement)}</p>` : ''}</div>`;

  const plan = d6.testPlanAdvice;
  const added = new Set(plan?.added || []);
  const planBlock = `<div class="d4-advice-block"><h4>② AI 시험 계획 추천</h4>
    <div class="d4-advice-title"><button type="button" class="btn btn-primary btn-sm" onclick="requestD6TestPlan()" ${busy('plan')}><i data-lucide="sparkles"></i> ${label('plan', plan ? '다시 받기' : 'D5 선정 대책으로 시험 계획 받기', 'AI가 대책을 읽는 중…')}</button><span class="d4-advice-muted">선정 대책·확정 원인·재현 방법을 외부 AI(Gemini/Groq)에 보냅니다. 시료 수는 공식으로 계산해 붙입니다.</span></div>
    ${plan ? `<div class="d4-advice-meta"><span class="badge-pill badge-warn">AI 제안 · 사람 확인 필요</span><span>${d6Esc(plan.provider)} ${d6Esc(plan.model)}</span></div>
      ${plan.actionsWithoutPlan?.length ? `<p class="d6-warn">시험 계획이 오지 않은 대책: ${d6Esc(plan.actionsWithoutPlan.join(', '))}</p>` : ''}
      ${plan.notes?.length ? `<ul class="d4-advice-plain">${plan.notes.map(n => `<li>${d6Esc(n)}</li>`).join('')}</ul>` : ''}
      <ol class="d4-advice-tools">${plan.plans.map(p => `<li class="d4-advice-tool"><div><input type="checkbox" class="d5-advice-check" data-d6-plan="${d6Esc(p.actionId)}" ${added.has(p.actionId) ? 'checked disabled' : ''} aria-label="시험 계획 선택"></div><div class="d4-advice-body">
        <div class="d4-advice-title"><strong>${d6Esc(p.testName)}</strong><span class="d4-priority adaptive">${d6Esc(p.methodLabel)}</span>${added.has(p.actionId) ? '<span class="d4-advice-added">시험 목록에 추가됨</span>' : ''}</div>
        <dl><dt>대상 대책</dt><dd>${d6Esc(p.causeLabel)} · ${d6Esc(p.actionTitle)}</dd>
        ${p.purpose ? `<dt>증명할 것</dt><dd>${d6Esc(p.purpose)}</dd>` : ''}${p.condition ? `<dt>시험 조건</dt><dd>${d6Esc(p.condition)}</dd>` : ''}
        ${p.acceptanceCriteria ? `<dt>합격 기준</dt><dd>${d6Esc(p.acceptanceCriteria)}</dd>` : ''}${p.controlGroup ? `<dt>비교 대상</dt><dd>${d6Esc(p.controlGroup)}</dd>` : ''}
        <dt>계획 시료 수</dt><dd>${p.sampleSuggestion ? `<b>${Number(p.sampleSuggestion.sampleSize).toLocaleString()}개</b> — ${d6Esc(p.sampleSuggestion.statement)}` : '문서·체계 확인 시험이라 계산하지 않습니다.'}</dd>
        ${p.notes ? `<dt>주의</dt><dd>${d6Esc(p.notes)}</dd>` : ''}</dl></div></li>`).join('')}</ol>
      <div class="d4-selector-actions"><span>체크한 계획이 아래 검증 시험 목록에 '대기' 상태로 추가됩니다. 시료 수·불량 수·판정·담당·시험일은 비어 있습니다.</span><button type="button" class="btn btn-secondary" onclick="discardD6TestPlan()">추천 지우기</button><button type="button" class="btn btn-primary" onclick="applyD6TestPlans()">체크한 계획을 시험 목록에 추가</button></div>` : ''}
  </div>`;

  const read = d6Assist.read;
  const proposalTone = { PASS: 'ready', FAIL: 'need', UNKNOWN: 'need' };
  const readBlock = `<div class="d4-advice-block"><h4>③ 성적서 읽기</h4>
    <div class="d6-inline-form">
      <label>검증 시험<select class="form-control" id="d6ReadTest">${tests.map(t => `<option value="${d6Esc(t.id)}">${d6Esc(t.testName || t.id)}${t.actionId ? '' : ' (대책 미연결)'}</option>`).join('') || '<option value="">시험 행이 없습니다</option>'}</select></label>
      <label>성적서 양식<select class="form-control" id="d6ReadTemplate">${templates.map(t => `<option value="${d6Esc(t.id)}">${d6Esc(t.name)}</option>`).join('') || '<option value="">등록된 양식이 없습니다</option>'}</select></label>
      <button type="button" class="btn btn-secondary" onclick="openD6TemplateModal('')">양식 등록·관리</button>
      <label>성적서 파일<input class="form-control" id="d6ReadFile" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.xlsx,.csv,.txt"></label>
      <button type="button" class="btn btn-primary" onclick="readD6Report()" ${busy('read')}>${label('read', '성적서 읽기', 'AI가 성적서를 읽는 중…')}</button>
    </div>
    <p class="d4-advice-muted">성적서는 먼저 D6 근거 자료로 보관한 뒤 외부 AI(PDF·이미지는 Gemini)에 보냅니다. AI는 양식의 항목만 옮겨 적고, PASS/FAIL 제안은 옮겨 적은 숫자로 규칙에 따라 계산합니다.</p>
    ${read ? `<div class="d6-read-result"><div class="d4-advice-title"><strong>${d6Esc(read.fileName)}</strong><span>${d6Esc(read.templateName)} · ${d6Esc(read.provider)}</span><span class="d4-advice-ready ${proposalTone[read.proposal.result]}">판정 제안: ${d6Esc({ PASS: 'PASS', FAIL: 'FAIL', UNKNOWN: '판단 불가' }[read.proposal.result])}</span></div>
      <p>${d6Esc(read.proposal.reason)}</p>
      <table class="custom-table"><thead><tr><th>항목</th><th>성적서 값</th><th>찾은 위치</th></tr></thead><tbody>${Object.values(read.values).map(v => `<tr><td>${d6Esc(v.label)}</td><td><b>${d6Esc(v.value)}</b></td><td>${d6Esc(v.source)}</td></tr>`).join('') || '<tr><td colspan="3">찾은 값이 없습니다.</td></tr>'}</tbody></table>
      ${read.mismatches?.length ? `<ul class="d4-advice-plain d6-warn">${read.mismatches.map(m => `<li>${d6Esc(m)}</li>`).join('')}</ul>` : ''}
      ${read.notes?.length ? `<ul class="d4-advice-plain">${read.notes.map(n => `<li>${d6Esc(n)}</li>`).join('')}</ul>` : ''}
      <div class="d4-selector-actions"><span>값을 성적서 원본과 대조한 뒤 옮기세요. 판정은 옮긴 뒤 직접 선택합니다.</span><button type="button" class="btn btn-primary" onclick="applyD6ReportValues()">이 값으로 시험 행 채우기</button></div></div>` : ''}
  </div>`;

  const cmp = d6Assist.compare;
  const actions = (c.d5?.candidates || []).filter(r => r.selected);
  const cmpTone = { improved: 'ready', inconclusive: 'need', not_improved: 'need' };
  const recorded = d6.beforeAfter?.statistics;
  const cmpBlock = `<div class="d4-advice-block"><h4>④ 개선 전·후 비교 <span class="d6-formula">통계 공식 · AI 아님</span></h4>
    <div class="d6-inline-form">
      <label>적용 전 불량<input class="form-control" id="d6CmpBeforeFail" type="number" min="0" value="${d6Esc(c.defectQty ?? '')}"></label>
      <label>적용 전 시료<input class="form-control" id="d6CmpBeforeN" type="number" min="1" value="${d6Esc(c.inspectQty ?? '')}"></label>
      <label>대책<select class="form-control" id="d6CmpAction" onchange="d6FillAfter()"><option value="">전체 시험 합계</option>${actions.map(a => `<option value="${d6Esc(a.id)}">${d6Esc(String(a.title || '').slice(0, 40))}</option>`).join('')}</select></label>
      <label>적용 후 불량<input class="form-control" id="d6CmpAfterFail" type="number" min="0"></label>
      <label>적용 후 시료<input class="form-control" id="d6CmpAfterN" type="number" min="1"></label>
      <label>기준 PPM<input class="form-control" id="d6CmpTarget" type="number" min="1" placeholder="비우면 적용 전"></label>
      <label>신뢰도<select class="form-control" id="d6CmpConfidence"><option value="0.8">80%</option><option value="0.9" selected>90%</option><option value="0.95">95%</option></select></label>
      <button type="button" class="btn btn-secondary" onclick="d6FillAfter()">시험 결과 불러오기</button>
      <button type="button" class="btn btn-secondary" onclick="d6Compare()" ${busy('compare')}>${label('compare', '비교', '계산 중…')}</button>
    </div>
    ${cmp ? `<div class="d6-read-result"><div class="d4-advice-title"><strong>적용 전 ${cmp.before.ppm.toLocaleString()} PPM → 적용 후 ${cmp.after.ppm.toLocaleString()} PPM (상한 ${cmp.after.upperBoundPpm.toLocaleString()} PPM)</strong><span class="d4-advice-ready ${cmpTone[cmp.verdict]}">${d6Esc(cmp.verdictLabel)}</span></div>
      <p>${d6Esc(cmp.reason)}</p><p class="d4-advice-muted">${d6Esc(cmp.twoSample)}${cmp.verdict !== 'improved' && cmp.sampleNeededForClaim ? ` 개선을 말하려면 적용 후 불량 ${cmp.after.fail}개 기준으로 시료 ${Number(cmp.sampleNeededForClaim).toLocaleString()}개가 필요합니다.` : ''}</p>
      <div class="d4-selector-actions"><span>기록하면 개선 전·후 칸이 비어 있을 때만 채우고, 계산 결과를 함께 남깁니다.</span><button type="button" class="btn btn-primary" onclick="applyD6Compare()">비교 결과 기록</button></div></div>` : ''}
    ${recorded ? `<p class="d4-advice-muted">기록된 비교: ${d6Esc(recorded.verdictLabel)} · ${d6Esc(recorded.recordedAt)} ${d6Esc(recorded.recordedBy)}</p>` : ''}
  </div>`;

  const checks = d6Assist.checks?.caseId === c.id ? d6Assist.checks : null;
  const icon = { block: '차단', warn: '확인', ok: '통과' };
  const checkBlock = `<div class="d4-advice-block"><h4>⑤ 적용·봉쇄 해제 점검 <span class="d6-formula">규칙 · AI 아님</span></h4>
    <div class="d4-advice-title"><button type="button" class="btn btn-secondary btn-sm" onclick="runD6Checks()" ${busy('checks')}>${label('checks', '저장된 내용으로 점검', '점검 중…')}</button><span class="d4-advice-muted">선정 대책별 시험, 계획 대비 시료 수, 적용일과 시험일, 고객 PCN 승인, 봉쇄 해제 조건을 확인합니다.</span></div>
    ${checks ? `<ul class="d6-checks">${checks.items.map(item => `<li class="d6-check-${item.level}"><b>${icon[item.level]}</b> ${d6Esc(item.text)}</li>`).join('')}</ul>` : ''}
  </div>`;

  return `<div class="card quality-stage-card d4-advice-panel"><div class="quality-tool-head"><span class="quality-tool-kicker">D6 · 검증 도우미</span><h3>대책 효과 검증 도우미</h3><p>시료 수 계산과 전·후 비교는 통계 공식으로, 시험 계획과 성적서 읽기는 AI로, 해제 점검은 규칙으로 합니다. 결과 판정과 봉쇄 해제 결정은 사람이 합니다.</p></div>
    ${calcBlock}${planBlock}${readBlock}${cmpBlock}${checkBlock}</div>`;
}
