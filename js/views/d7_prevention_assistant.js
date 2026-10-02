// D7 recurrence prevention assistant: document revisions and a PFMEA draft, a product list, horizontal
// deployment, lessons learned and rule checks. The AI proposes; rows are added open with no document number,
// revision, owner, date or evidence, and deployment candidates come only from recorded data.
const d7Assist = { loading: '', checks: null, lessonsDraft: null };

function d7Esc(value) { return escapeWorkspaceValue(String(value ?? '')); }
function d7Products() { return Array.isArray(appData.productCatalog) ? appData.productCatalog : []; }
function d7Selected(c) { return (c.d5?.candidates || []).filter(row => row.selected); }

async function d7Run(key, work) {
  if (d7Assist.loading) return;
  d7Assist.loading = key;
  renderCurrentView();
  try { await work(); }
  catch (error) { alert(error.message); }
  finally { d7Assist.loading = ''; renderCurrentView(); }
}

function d7Request(key, call, store) {
  const c = getActiveCase();
  if (!c || !saveLateStage(false)) return;
  d7Run(key, async () => {
    await QMSApi.flushSaves();
    const result = await call(c.id);
    if (getActiveCase() !== c) return;
    store(c, result);
    saveAppData();
  });
}

function requestD7SystemAdvice() { d7Request('system', QMSApi.d7SystemAdvice, (c, r) => { c.d7.systemAdvice = r; }); }
function requestD7DeploymentAdvice() { d7Request('deploy', QMSApi.d7DeploymentAdvice, (c, r) => { c.d7.deploymentAdvice = r; }); }
function requestD7Lessons() { d7Request('lessons', QMSApi.d7Lessons, (c, r) => { d7Assist.lessonsDraft = r; }); }

function d7Checked(attr) { return [...document.querySelectorAll(`[${attr}]:checked:not(:disabled)`)].map(box => box.getAttribute(attr)); }

function applyD7SystemAdvice() {
  const c = getActiveCase();
  const advice = c?.d7?.systemAdvice;
  const docs = d7Checked('data-d7-doc'), rows = d7Checked('data-d7-fm'), notify = d7Checked('data-d7-notify');
  if (!advice || !(docs.length || rows.length || notify.length)) { alert('반영할 항목에 체크해 주세요.'); return; }
  if (!saveLateStage(false)) return;
  const d7 = c.d7;
  advice.added = advice.added || [];
  for (const doc of advice.documents.filter(item => docs.includes(item.key) && !advice.added.includes(item.key))) {
    d7.systemUpdates.push({ id: `D7-${intakeFileId()}`, actionId: doc.actionId, docName: doc.docName, docNo: '', rev: '', changeContent: doc.changeContent,
      owner: '', due: '', status: 'Open', evidence: '', source: 'AI 개정 추천', generatedAt: advice.generatedAt });
    advice.added.push(doc.key);
  }
  d7.pfmeaDraft = Array.isArray(d7.pfmeaDraft) ? d7.pfmeaDraft : [];
  for (const row of advice.pfmea.filter(item => rows.includes(item.key) && !advice.added.includes(item.key))) {
    // Severity, occurrence and detection ratings are left for the PFMEA team.
    d7.pfmeaDraft.push({ ...row, severity: '', occurrence: '', detectionRating: '', source: 'AI PFMEA 초안', generatedAt: advice.generatedAt });
    advice.added.push(row.key);
  }
  d7.notifyPlan = Array.isArray(d7.notifyPlan) ? d7.notifyPlan : [];
  for (const item of advice.notify.filter(n => notify.includes(n.target) && !d7.notifyPlan.some(p => p.target === n.target))) {
    d7.notifyPlan.push({ target: item.target, reason: item.reason, notified: false });
  }
  d7.approval = { status: 'Draft', humanConfirmed: false };
  saveAppData();
  renderCurrentView();
}

function applyD7Deployment() {
  const c = getActiveCase();
  const advice = c?.d7?.deploymentAdvice;
  const keys = d7Checked('data-d7-deploy');
  if (!advice || !keys.length) { alert('수평전개에 추가할 후보에 체크해 주세요.'); return; }
  if (!saveLateStage(false)) return;
  advice.added = advice.added || [];
  const fallback = d7Selected(c)[0]?.id || '';
  for (const item of advice.assessments.filter(a => keys.includes(a.key) && !advice.added.includes(a.key))) {
    c.d7.horizontalDeployment.push({ id: `D7-${intakeFileId()}`, actionId: item.actionId || fallback, product: item.name,
      sameRisk: [item.riskLabel, item.reason].filter(Boolean).join(' — '), action: item.action, owner: '', status: 'Open', evidence: '',
      source: 'AI 수평전개 추천', candidate: item.key, generatedAt: advice.generatedAt });
    advice.added.push(item.key);
  }
  c.d7.approval = { status: 'Draft', humanConfirmed: false };
  saveAppData();
  renderCurrentView();
}

function saveD7Lessons() {
  const c = getActiveCase();
  if (!c || !saveLateStage(false)) return;
  const value = id => document.getElementById(id)?.value.trim() || '';
  const lessons = { phenomenon: value('d7LsPhenomenon'), cause: value('d7LsCause'), action: value('d7LsAction'), effect: value('d7LsEffect'), lesson: value('d7LsLesson'),
    keywords: value('d7LsKeywords').split(',').map(k => k.trim()).filter(Boolean), savedBy: CURRENT_USER.name, savedAt: qmsLocalTimestamp() };
  if (!lessons.phenomenon || !lessons.lesson) { alert('현상과 교훈은 비울 수 없습니다.'); return; }
  c.d7.lessonsLearned = lessons;
  d7Assist.lessonsDraft = null;
  saveAppData();
  renderCurrentView();
}

function runD7Checks() {
  const c = getActiveCase();
  if (!c || !saveLateStage(false)) return;
  d7Run('checks', async () => {
    await QMSApi.flushSaves();
    d7Assist.checks = { caseId: c.id, ...(await QMSApi.d7Checks(c.id)) };
  });
}

// ---------------------------------------------------------------- product list
function d7ProductRow(p = {}) {
  return `<tr data-d7-product="${d7Esc(p.id || '')}">${['name', 'family', 'package', 'supplier', 'site', 'processes', 'customers'].map(key => `<td><input class="form-control" data-key="${key}" value="${d7Esc(p[key] || '')}"></td>`).join('')}<td><button type="button" class="icon-danger-btn" onclick="this.closest('tr').remove()" title="삭제"><i data-lucide="trash-2"></i></button></td></tr>`;
}

function addD7ProductRow() {
  document.getElementById('d7ProductRows').insertAdjacentHTML('beforeend', d7ProductRow());
  if (window.lucide) lucide.createIcons();
}

function openD7ProductModal() {
  const products = d7Products();
  const container = document.getElementById('modalContainer');
  container.style.width = '1180px'; container.style.maxWidth = '97vw';
  container.innerHTML = `<div class="d6-template-modal">
    <header><div><span class="quality-tool-kicker">D7 · 제품 목록</span><h3>수평전개용 제품·공정 목록</h3><p>여기에 등록한 제품만 수평전개 후보가 됩니다(다른 Case·외주 조립 불량 기록의 제품과 외주사 3곳도 함께). AI는 이 목록에 없는 제품을 만들지 않습니다.</p></div><button class="btn btn-secondary btn-sm" onclick="document.getElementById('globalModal').style.display='none'">닫기</button></header>
    <div class="quality-table-wrap"><table class="custom-table"><thead><tr><th>제품명 *</th><th>제품군</th><th>패키지</th><th>외주사</th><th>생산 Site</th><th>거치는 공정</th><th>고객사</th><th></th></tr></thead><tbody id="d7ProductRows">${products.map(item => d7ProductRow(item)).join('') || d7ProductRow()}</tbody></table></div>
    <button type="button" class="btn btn-secondary btn-sm" onclick="addD7ProductRow()">행 추가</button>
    <footer class="d4-selector-actions"><span>제품명이 빈 행은 저장하지 않습니다.</span><button type="button" class="btn btn-primary" onclick="saveD7Products()">목록 저장</button></footer>
  </div>`;
  document.getElementById('globalModal').style.display = 'flex';
  if (window.lucide) lucide.createIcons();
}

function saveD7Products() {
  const rows = [...document.querySelectorAll('#d7ProductRows tr')].map(tr => {
    const item = { id: tr.dataset.d7Product || `PRD-${intakeFileId()}` };
    tr.querySelectorAll('[data-key]').forEach(input => { item[input.dataset.key] = input.value.trim(); });
    return item;
  }).filter(item => item.name);
  appData.productCatalog = rows.map(item => ({ ...item, updatedBy: CURRENT_USER.name, updatedAt: qmsLocalTimestamp() }));
  saveAppData();
  document.getElementById('globalModal').style.display = 'none';
  renderCurrentView();
}

// ---------------------------------------------------------------- panel
function renderD7AssistantPanel(c) {
  const d7 = c.d7;
  const busy = key => d7Assist.loading === key ? 'disabled' : '';
  const label = (key, idle, active) => d7Assist.loading === key ? active : idle;
  const meta = advice => `<div class="d4-advice-meta"><span class="badge-pill badge-warn">AI 제안 · 사람 확인 필요</span><span>${d7Esc(advice.provider)} ${d7Esc(advice.model)}</span></div>`;
  const check = (attr, value, done) => `<input type="checkbox" class="d5-advice-check" ${attr}="${d7Esc(value)}" ${done ? 'checked disabled' : ''} aria-label="선택">`;

  const sys = d7.systemAdvice, sysAdded = new Set(sys?.added || []), notified = new Set((d7.notifyPlan || []).map(n => n.target));
  const sysBlock = `<div class="d4-advice-block"><h4>① 개정할 문서 · PFMEA 초안 · 전파 대상</h4>
    <div class="d4-advice-title"><button type="button" class="btn btn-primary btn-sm" onclick="requestD7SystemAdvice()" ${busy('system')}><i data-lucide="sparkles"></i> ${label('system', sys ? '다시 받기' : 'AI에게 개정 대상 추천받기', 'AI가 대책을 읽는 중…')}</button><span class="d4-advice-muted">확정 원인·선정 대책·D6 검증 결과를 외부 AI(Gemini/Groq)에 보냅니다. 문서번호·Revision·PFMEA 점수는 비워 둡니다.</span></div>
    ${sys ? `${meta(sys)}
      ${sys.actionsWithoutDocument?.length ? `<p class="d6-warn">개정 문서가 제안되지 않은 대책: ${d7Esc(sys.actionsWithoutDocument.join(', '))}</p>` : ''}
      ${sys.notes?.length ? `<ul class="d4-advice-plain">${sys.notes.map(n => `<li>${d7Esc(n)}</li>`).join('')}</ul>` : ''}
      <h5 class="d7-sub">개정할 문서</h5>
      <ol class="d4-advice-tools">${sys.documents.map(d => `<li class="d4-advice-tool"><div>${check('data-d7-doc', d.key, sysAdded.has(d.key))}</div><div class="d4-advice-body">
        <div class="d4-advice-title"><strong>${d7Esc(d.docName)}</strong><span class="d4-priority adaptive">${d7Esc(d.docTypeLabel)}</span>${sysAdded.has(d.key) ? '<span class="d4-advice-added">개정 목록에 추가됨</span>' : ''}</div>
        <dl><dt>대상 대책</dt><dd>${d7Esc(d.actionTitle)}</dd><dt>바꿀 내용</dt><dd>${d7Esc(d.changeContent)}</dd>${d.reason ? `<dt>이유</dt><dd>${d7Esc(d.reason)}</dd>` : ''}</dl></div></li>`).join('') || '<li class="d4-advice-muted">제안 없음</li>'}</ol>
      <h5 class="d7-sub">PFMEA 행 초안 <span class="d4-advice-muted">심각도·발생도·검출도는 PFMEA 담당이 매깁니다</span></h5>
      <div class="quality-table-wrap"><table class="custom-table d7-pfmea"><thead><tr><th></th><th>원인 구분</th><th>공정</th><th>고장모드</th><th>영향</th><th>원인</th><th>예방 관리</th><th>검출 관리</th></tr></thead><tbody>${sys.pfmea.map(r => `<tr><td>${check('data-d7-fm', r.key, sysAdded.has(r.key))}</td><td>${d7Esc(r.causeLabel)}</td><td>${d7Esc(r.process)}</td><td>${d7Esc(r.failureMode)}</td><td>${d7Esc(r.effect)}</td><td>${d7Esc(r.cause)}</td><td>${d7Esc(r.prevention)}</td><td>${d7Esc(r.detection)}</td></tr>`).join('') || '<tr><td colspan="8">제안 없음</td></tr>'}</tbody></table></div>
      <h5 class="d7-sub">전파 대상</h5>
      <ul class="d4-advice-plain d7-notify">${sys.notify.map(n => `<li>${check('data-d7-notify', n.target, notified.has(n.target))} <b>${d7Esc(n.target)}</b> ${d7Esc(n.reason)}</li>`).join('') || '<li>제안 없음</li>'}</ul>
      <div class="d4-selector-actions"><span>체크한 문서는 개정 목록에 '진행 중'으로, PFMEA 행은 아래 PFMEA 초안에, 전파 대상은 전파 계획에 들어갑니다.</span><button type="button" class="btn btn-primary" onclick="applyD7SystemAdvice()">체크한 항목 반영</button></div>` : ''}
    ${d7.pfmeaDraft?.length ? `<h5 class="d7-sub">저장된 PFMEA 초안 (${d7.pfmeaDraft.length}행)</h5><div class="quality-table-wrap"><table class="custom-table d7-pfmea"><thead><tr><th>공정</th><th>고장모드</th><th>원인</th><th>예방 관리</th><th>검출 관리</th><th>S/O/D</th></tr></thead><tbody>${d7.pfmeaDraft.map(r => `<tr><td>${d7Esc(r.process)}</td><td>${d7Esc(r.failureMode)}</td><td>${d7Esc(r.cause)}</td><td>${d7Esc(r.prevention)}</td><td>${d7Esc(r.detection)}</td><td>${d7Esc([r.severity, r.occurrence, r.detectionRating].filter(Boolean).join('/') || '미평가')}</td></tr>`).join('')}</tbody></table></div>` : ''}
    ${d7.notifyPlan?.length ? `<p class="d4-advice-muted">전파 계획: ${d7Esc(d7.notifyPlan.map(n => n.target).join(', '))}</p>` : ''}
  </div>`;

  const dep = d7.deploymentAdvice, depAdded = new Set(dep?.added || []);
  const riskTone = { high: 'need', unknown: 'need', low: 'ready' };
  const depBlock = `<div class="d4-advice-block"><h4>② 수평전개</h4>
    <div class="d4-advice-title"><button type="button" class="btn btn-secondary btn-sm" onclick="openD7ProductModal()">제품 목록 관리 (${d7Products().length}개)</button><button type="button" class="btn btn-primary btn-sm" onclick="requestD7DeploymentAdvice()" ${busy('deploy')}><i data-lucide="sparkles"></i> ${label('deploy', dep ? '다시 받기' : 'AI에게 동일 위험 판단받기', 'AI가 후보를 판단하는 중…')}</button><span class="d4-advice-muted">후보는 등록 제품·다른 Case 제품·외주 조립 불량 기록 제품·외주사 3곳에서만 만듭니다.</span></div>
    ${dep ? `${meta(dep)}
      <div class="quality-table-wrap"><table class="custom-table"><thead><tr><th></th><th>후보</th><th>동일 위험</th><th>판단 이유</th><th>전개 조치</th><th>더 확인할 것</th></tr></thead><tbody>${dep.assessments.map(a => `<tr><td>${check('data-d7-deploy', a.key, depAdded.has(a.key))}</td><td><b>${d7Esc(a.name)}</b><br><small>${d7Esc(a.kind)}</small></td><td><span class="d4-advice-ready ${riskTone[a.risk]}">${d7Esc(a.riskLabel)}</span></td><td>${d7Esc(a.reason)}</td><td>${d7Esc(a.action)}</td><td>${d7Esc(a.needToCheck)}</td></tr>`).join('')}</tbody></table></div>
      ${dep.unassessed?.length ? `<p class="d6-warn">AI가 판단하지 않은 후보: ${d7Esc(dep.unassessed.join(', '))}</p>` : ''}
      <div class="d4-selector-actions"><span>체크한 후보가 수평전개 목록에 '진행 중'으로 들어갑니다. 해당 없음 판정과 근거, 담당은 직접 기록합니다.</span><button type="button" class="btn btn-primary" onclick="applyD7Deployment()">체크한 후보를 수평전개에 추가</button></div>` : ''}
  </div>`;

  const saved = d7.lessonsLearned, draft = d7Assist.lessonsDraft || saved;
  const field = (id, name, value, rows = 2) => `<label class="form-group"><span class="form-label">${name}</span><textarea class="form-control" id="${id}" rows="${rows}">${d7Esc(value || '')}</textarea></label>`;
  const lessonsBlock = `<div class="d4-advice-block"><h4>③ 교훈 (Lessons Learned)</h4>
    <div class="d4-advice-title"><button type="button" class="btn btn-primary btn-sm" onclick="requestD7Lessons()" ${busy('lessons')}><i data-lucide="sparkles"></i> ${label('lessons', saved ? 'AI 요약 다시 받기' : 'AI에게 교훈 요약받기', 'AI가 정리하는 중…')}</button><span class="d4-advice-muted">기록된 원인·대책·검증 결과만으로 요약합니다. 저장된 교훈은 다음 Case의 대책 추천에서 유사 사례로 쓰입니다.</span></div>
    ${draft ? `<div class="d7-lessons">${field('d7LsPhenomenon', '현상 *', draft.phenomenon)}${field('d7LsCause', '원인', draft.cause)}${field('d7LsAction', '대책', draft.action)}${field('d7LsEffect', '효과', draft.effect)}${field('d7LsLesson', '교훈 *', draft.lesson, 3)}
      <label class="form-group"><span class="form-label">핵심어 (쉼표 구분)</span><input class="form-control" id="d7LsKeywords" value="${d7Esc((draft.keywords || []).join(', '))}"></label></div>
      <div class="d4-selector-actions"><span>${saved && !d7Assist.lessonsDraft ? `${d7Esc(saved.savedAt)} ${d7Esc(saved.savedBy)} 저장` : '내용을 확인·수정한 뒤 저장하세요.'}</span><button type="button" class="btn btn-primary" onclick="saveD7Lessons()">교훈 저장</button></div>` : ''}
  </div>`;

  const checks = d7Assist.checks?.caseId === c.id ? d7Assist.checks : null;
  const icon = { block: '차단', warn: '확인', ok: '통과' };
  const checkBlock = `<div class="d4-advice-block"><h4>④ 빠진 곳 점검 <span class="d6-formula">규칙 · AI 아님</span></h4>
    <div class="d4-advice-title"><button type="button" class="btn btn-secondary btn-sm" onclick="runD7Checks()" ${busy('checks')}>${label('checks', '저장된 내용으로 점검', '점검 중…')}</button><span class="d4-advice-muted">대책별 문서 개정, 시스템원인의 PFMEA·Control Plan, 완료 근거, 해당 없음 근거, 적용 외주사 수평전개, 교훈 기록을 확인합니다.</span></div>
    ${checks ? `<ul class="d6-checks">${checks.items.map(item => `<li class="d6-check-${item.level}"><b>${icon[item.level]}</b> ${d7Esc(item.text)}</li>`).join('')}</ul>` : ''}
  </div>`;

  return `<div class="card quality-stage-card d4-advice-panel"><div class="quality-tool-head"><span class="quality-tool-kicker">D7 · 재발방지 도우미</span><h3>재발방지·수평전개 도우미</h3><p>개정 대상·PFMEA 초안·동일 위험 판단·교훈은 AI가 제안하고, 점검은 규칙으로 합니다. 문서 개정·점수 평가·전개 확정은 사람이 합니다.</p></div>
    ${sysBlock}${depBlock}${lessonsBlock}${checkBlock}</div>`;
}
