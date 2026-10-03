// D8 closure assistant. The Case closes when the facilitator drafts and the leader and champion approve the
// 8D report; customer dispatch is not a condition (user decision 2026-10-03). This panel checks readiness,
// shows stage lead times, asks an AI for a consistency review and closure drafts, and plans follow-up checks.
// Nothing here ticks a checklist item, approves, or changes the closure decision.
const d8Assist = { loading: '', readiness: null };

function d8Esc(value) { return escapeWorkspaceValue(String(value ?? '')); }

async function d8Run(key, work) {
  if (d8Assist.loading) return;
  d8Assist.loading = key;
  renderCurrentView();
  try { await work(); }
  catch (error) { alert(error.message); }
  finally { d8Assist.loading = ''; renderCurrentView(); }
}

function d8Prepared(work) {
  const c = getActiveCase();
  if (!c || !saveLateStage(false)) return;
  return { c, run: key => d8Run(key, async () => { await QMSApi.flushSaves(); await work(c); }) };
}

function runD8Readiness() {
  const job = d8Prepared(async c => { d8Assist.readiness = { caseId: c.id, ...(await QMSApi.d8Readiness(c.id)) }; });
  job?.run('readiness');
}

function fillD8Checklist() {
  const c = getActiveCase();
  const fill = d8Assist.readiness?.caseId === c?.id ? d8Assist.readiness.checklistFill : null;
  if (!fill || !saveLateStage(false)) return;
  c.d8.checklist.forEach((row, i) => { if (fill[i] && !String(row.evidence || '').trim()) row.evidence = fill[i]; });
  c.d8.approval = { status: 'Draft', humanConfirmed: false };
  saveAppData();
  renderCurrentView();
  alert('비어 있던 종결 근거 칸을 기록에서 채웠습니다. 확인 체크는 원본을 보고 직접 하세요.');
}

function requestD8Review() {
  const job = d8Prepared(async c => { const r = await QMSApi.d8Review(c.id); if (getActiveCase() === c) { c.d8.consistencyReview = r; saveAppData(); } });
  job?.run('review');
}

function requestD8Draft() {
  const english = Boolean(document.getElementById('d8DraftEnglish')?.checked);
  const job = d8Prepared(async c => { const r = await QMSApi.d8Draft(c.id, english); if (getActiveCase() === c) { c.d8.closureDraft = r; saveAppData(); } });
  job?.run('draft');
}

// Copies a draft into the D8 fields. Text a person already wrote is replaced only after confirmation.
function applyD8Draft(part) {
  const c = getActiveCase();
  const draft = c?.d8?.closureDraft;
  if (!draft || !saveLateStage(false)) return;
  const put = (holder, key, value) => {
    if (!value) return;
    if (String(holder[key] || '').trim() && !confirm('이미 작성된 내용이 있습니다. 초안으로 바꿀까요?')) return;
    holder[key] = value;
  };
  if (part === 'risk') put(c.d8.closure, 'remainingRisk', draft.remainingRisk);
  if (part === 'team') put(c.d8, 'teamAppreciation', draft.teamAppreciation);
  c.d8.approval = { status: 'Draft', humanConfirmed: false };
  saveAppData();
  renderCurrentView();
}

function copyD8Summary(lang) {
  const text = lang === 'en' ? getActiveCase()?.d8?.closureDraft?.customerSummaryEn : getActiveCase()?.d8?.closureDraft?.customerSummaryKo;
  if (!text) return;
  navigator.clipboard?.writeText(text).then(() => alert('고객 종결 요약을 복사했습니다.'), () => alert('복사하지 못했습니다. 화면의 글을 직접 선택해 복사하세요.'));
}

function createD8Monitoring() {
  const days = (document.getElementById('d8MonitorDays')?.value || '').split(',').map(v => Number(v.trim())).filter(Boolean);
  const job = d8Prepared(async c => {
    const plan = await QMSApi.d8MonitoringPlan(c.id, days);
    if (getActiveCase() !== c) return;
    // Kept outside the D8 stage data so a plan made after closure does not reopen the approved 8D report.
    c.postClosureMonitoring = { ...plan, createdBy: CURRENT_USER.name, createdAt: qmsLocalTimestamp() };
    saveAppData();
  });
  job?.run('monitor');
}

function recordD8Monitoring(id) {
  const c = getActiveCase();
  const item = c?.postClosureMonitoring?.items?.find(row => row.id === id);
  if (!item) return;
  const result = document.getElementById(`d8MonResult-${id}`)?.value;
  const note = document.getElementById(`d8MonNote-${id}`)?.value.trim() || '';
  if (!result) { alert('확인 결과를 고르세요.'); return; }
  if (result === 'recurred' && !note) { alert('재발이면 내용을 적어 주세요.'); return; }
  Object.assign(item, { status: 'Done', result, note, checkedBy: CURRENT_USER.name, checkedAt: qmsLocalTimestamp() });
  saveAppData();
  renderCurrentView();
}

function renderD8AssistantPanel(c) {
  const d8 = c.d8;
  const busy = key => d8Assist.loading === key ? 'disabled' : '';
  const label = (key, idle, active) => d8Assist.loading === key ? active : idle;
  const icon = { block: '차단', warn: '확인', ok: '통과', info: '참고' };

  const ready = d8Assist.readiness?.caseId === c.id ? d8Assist.readiness : null;
  const leadTone = { on_time: 'd6-check-ok', late: 'd6-check-block', overdue: 'd6-check-block', open: 'd6-check-warn', unknown: 'd6-check-warn' };
  const readyBlock = `<div class="d4-advice-block"><h4>① 종결 준비 점검 · 처리 기간 <span class="d6-formula">규칙·계산 · AI 아님</span></h4>
    <div class="d4-advice-title"><button type="button" class="btn btn-secondary btn-sm" onclick="runD8Readiness()" ${busy('readiness')}>${label('readiness', '저장된 내용으로 점검', '점검 중…')}</button><span class="d4-advice-muted">종결은 간사 기안 → 리더 → 챔피언의 8D Report 결재로 끝납니다. 고객 송부는 종결 조건이 아닙니다.</span></div>
    ${ready ? `<ul class="d6-checks">${ready.items.map(i => `<li class="d6-check-${i.level === 'info' ? 'ok' : i.level}"><b>${icon[i.level]}</b> <span class="d8-area">${d8Esc(i.area)}</span> ${d8Esc(i.text)}</li>`).join('')}</ul>
      <h5 class="d7-sub">처리 기간 (접수 → 챔피언 승인, 기준 3D 24시간 · 5D 14일 · 8D 30일)</h5>
      <ul class="d6-checks">${ready.leadTimes.map(r => `<li class="${leadTone[r.status]}"><b>${d8Esc(r.label)}</b> ${d8Esc(r.text)}${r.dueAt ? ` <span class="d4-advice-muted">기한 ${d8Esc(r.dueAt)}${r.doneAt ? ` · 승인 ${d8Esc(r.doneAt)}` : ''}</span>` : ''}</li>`).join('')}</ul>
      <div class="d4-selector-actions"><span>${ready.ready ? '종결을 막는 항목이 없습니다.' : '차단 항목을 먼저 해결하세요.'} 종결 점검표의 빈 근거 칸을 이 결과로 채울 수 있습니다.</span><button type="button" class="btn btn-primary" onclick="fillD8Checklist()">종결 점검표 근거 채우기</button></div>` : ''}
  </div>`;

  const review = d8.consistencyReview;
  const sevTone = { high: 'd6-check-block', medium: 'd6-check-warn', low: 'd6-check-ok' };
  const reviewBlock = `<div class="d4-advice-block"><h4>② 전체 일관성 검토</h4>
    <div class="d4-advice-title"><button type="button" class="btn btn-primary btn-sm" onclick="requestD8Review()" ${busy('review')}><i data-lucide="sparkles"></i> ${label('review', review ? '다시 검토' : 'AI에게 D1~D7 일관성 검토받기', 'AI가 전체 기록을 읽는 중…')}</button><span class="d4-advice-muted">D2 문제와 D4 원인, 원인과 대책, 대책과 D6 검증, 수량·Lot·날짜가 서로 맞는지 봅니다. 승인 여부는 판정하지 않습니다.</span></div>
    ${review ? `<div class="d4-advice-meta"><span class="badge-pill badge-warn">AI 제안 · 사람 확인 필요</span><span>${d8Esc(review.provider)} ${d8Esc(review.model)}</span></div>
      ${review.summary ? `<p class="d6-result">${d8Esc(review.summary)}</p>` : ''}
      ${review.findings.length ? `<ul class="d6-checks">${review.findings.map(f => `<li class="${sevTone[f.severity]}"><b>${d8Esc(f.severityLabel)}</b> <span class="d8-area">${d8Esc(f.stage)}${f.relatedStage ? '↔' + d8Esc(f.relatedStage) : ''}</span> ${d8Esc(f.issue)}${f.suggestion ? `<br><span class="d4-advice-muted">확인: ${d8Esc(f.suggestion)}</span>` : ''}</li>`).join('')}</ul>` : '<p class="d4-advice-muted">지적 사항이 없습니다.</p>'}` : ''}
  </div>`;

  const draft = d8.closureDraft;
  const draftBlock = `<div class="d4-advice-block"><h4>③ 잔여 위험 · 고객 종결 요약 · 팀 인정 초안</h4>
    <div class="d4-advice-title"><label class="d8-english"><input type="checkbox" id="d8DraftEnglish" ${draft?.customerSummaryEn ? 'checked' : ''}> 영문 요약도 만들기</label><button type="button" class="btn btn-primary btn-sm" onclick="requestD8Draft()" ${busy('draft')}><i data-lucide="sparkles"></i> ${label('draft', draft ? '다시 받기' : 'AI에게 종결 초안 받기', 'AI가 정리하는 중…')}</button><span class="d4-advice-muted">결재된 기록과 점검 결과만 씁니다.</span></div>
    ${draft ? `<div class="d4-advice-meta"><span class="badge-pill badge-warn">AI 초안 · 사람 확인 필요</span><span>${d8Esc(draft.provider)} ${d8Esc(draft.model)}</span></div>
      <dl class="d8-draft"><dt>잔여 위험</dt><dd>${d8Esc(draft.remainingRisk)}<div><button type="button" class="btn btn-secondary btn-sm" onclick="applyD8Draft('risk')">잔여 위험 칸에 넣기</button></div></dd>
      <dt>고객 종결 요약</dt><dd>${d8Esc(draft.customerSummaryKo)}<div><button type="button" class="btn btn-secondary btn-sm" onclick="copyD8Summary('ko')">복사</button></div></dd>
      ${draft.customerSummaryEn ? `<dt>영문 요약</dt><dd>${d8Esc(draft.customerSummaryEn)}<div><button type="button" class="btn btn-secondary btn-sm" onclick="copyD8Summary('en')">복사</button></div></dd>` : ''}
      ${draft.teamAppreciation ? `<dt>팀 인정</dt><dd>${d8Esc(draft.teamAppreciation)}<div><button type="button" class="btn btn-secondary btn-sm" onclick="applyD8Draft('team')">팀 인정 칸에 넣기</button></div></dd>` : ''}</dl>` : ''}
  </div>`;

  const mon = c.postClosureMonitoring;
  const resultLabel = { none: '재발 없음', recurred: '재발', unknown: '확인 불가' };
  const today = qmsLocalTimestamp().slice(0, 10);
  const monBlock = `<div class="d4-advice-block"><h4>④ 종결 후 재발 모니터링</h4>
    <div class="d6-inline-form"><label>확인 시점 (종결 후 일수, 쉼표 구분)<input class="form-control" id="d8MonitorDays" value="${d8Esc((mon?.items || []).map(i => i.days).join(', ') || '30, 60, 90')}"></label>
    <button type="button" class="btn btn-secondary" onclick="createD8Monitoring()" ${busy('monitor')}>${label('monitor', mon ? '일정 다시 만들기' : '모니터링 일정 만들기', '만드는 중…')}</button></div>
    <p class="d4-advice-muted">기한이 되면 알림 메일이 Case 팀에게 갑니다(평가 기간에는 시험 수신자 한 명). 이 일정은 D8 결재 내용에 들어가지 않아 종결 후에 만들어도 결재가 다시 열리지 않습니다.</p>
    ${mon ? `<p class="d4-advice-muted">기준일 ${d8Esc(mon.baseDate)}${mon.baseIsClosure ? ' (종결일)' : ' (아직 종결 전 — 오늘 기준. 종결 후 다시 만들면 종결일 기준)'}</p>
      <div class="quality-table-wrap"><table class="custom-table"><thead><tr><th>시점</th><th>기한</th><th>상태</th><th>결과</th><th>내용</th><th></th></tr></thead><tbody>${mon.items.map(i => `<tr><td>${i.days}일</td><td>${d8Esc(i.dueDate)}${i.status === 'Open' && i.dueDate <= today ? ' <span class="d6-warn">기한 도래</span>' : ''}</td><td>${i.status === 'Done' ? '완료' : '대기'}</td>
        <td>${i.status === 'Done' ? d8Esc(resultLabel[i.result] || i.result) : `<select class="form-control" id="d8MonResult-${d8Esc(i.id)}"><option value="">선택</option><option value="none">재발 없음</option><option value="recurred">재발</option><option value="unknown">확인 불가</option></select>`}</td>
        <td>${i.status === 'Done' ? `${d8Esc(i.note)} <span class="d4-advice-muted">${d8Esc(i.checkedBy)} ${d8Esc(i.checkedAt)}</span>` : `<input class="form-control" id="d8MonNote-${d8Esc(i.id)}" placeholder="확인한 자료·클레임 여부">`}</td>
        <td>${i.status === 'Done' ? '' : `<button type="button" class="btn btn-secondary btn-sm" onclick="recordD8Monitoring('${d8Esc(i.id)}')">기록</button>`}</td></tr>`).join('')}</tbody></table></div>` : ''}
  </div>`;

  return `<div class="card quality-stage-card d4-advice-panel"><div class="quality-tool-head"><span class="quality-tool-kicker">D8 · 종결 도우미</span><h3>종결 도우미</h3><p>종결 = 간사 기안 → 리더 승인 → 챔피언 승인(8D Report). 점검·처리 기간은 규칙과 계산으로, 일관성 검토와 문안은 AI로 합니다. 점검표 확인과 결재는 사람이 합니다.</p></div>
    ${readyBlock}${reviewBlock}${draftBlock}${monBlock}</div>`;
}
