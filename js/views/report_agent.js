/* 8D report agent: one request in plain language, a live step log, and the finished report file. */
(function(global) {
  'use strict';

  const TAG_CLASS = { '의도 분석': 'intent', '계획 수립': 'plan', '스스로 수집': 'collect', '처리': 'process', '판단': 'judge', '결과 생성': 'output' };
  const STATUS_LABEL = { RUNNING: '실행 중', COMPLETED: '완료', NEEDS_INPUT: '확인 필요', FAILED: '실패' };
  const LEVEL_LABEL = { block: '확인 필요', warn: '주의', info: '참고' };
  // shown: how many log steps are on screen. Steps are revealed one at a time so the run can be followed.
  const view = { run: null, runs: [], shown: 0, fresh: 0, busy: false, error: '', pollTimer: null, revealTimer: null, loaded: false };

  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const seconds = ms => (ms / 1000).toFixed(ms < 10000 ? 1 : 0);
  const localTime = iso => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? String(iso || '') : typeof qmsLocalTimestamp === 'function' ? qmsLocalTimestamp(d) : d.toLocaleString(); };
  const onScreen = () => document.getElementById('raLog');

  function requestChips() {
    const chips = [];
    const active = typeof getActiveCase === 'function' ? getActiveCase() : null;
    if (active) chips.push({ label: `지금 열린 Case (${active.id})`, text: `${active.id} 8D 보고서 작성해줘` });
    (appData.cases || []).slice().reverse().filter(c => c.customer && c.claimTitle).slice(0, 3)
      .forEach(c => chips.push({ label: `${c.customer} · ${c.claimTitle}`, text: `${c.customer} ${c.claimTitle} 건 8D 보고서 작성해줘` }));
    return chips;
  }

  function logHtml() {
    const run = view.run;
    if (!run) {
      return `<div class="ra-empty"><i data-lucide="bot"></i><strong>에이전트가 기다리고 있습니다</strong>
        <span>위에 맡길 일을 적고 [에이전트 실행]을 누르면, 여기에 에이전트가 하는 일이 순서대로 나타납니다.</span></div>`;
    }
    const steps = (run.steps || []).slice(0, view.shown);
    const revealing = view.shown < (run.steps || []).length;
    const done = !revealing && run.status !== 'RUNNING';
    const result = run.result || {};
    return `<div class="ra-log-head"><span>에이전트 실행 로그 · #${run.id}</span><b class="ra-status ${run.status.toLowerCase()}">${revealing ? '실행 중' : STATUS_LABEL[run.status] || run.status}</b></div>
      <div class="ra-request"><i data-lucide="message-square"></i><span>${esc(run.requestText)}</span></div>
      <ol class="ra-steps">${steps.map(step => `<li class="ra-step ${esc(step.status)}${step.n === view.fresh ? ' fresh' : ''}">
        <div class="ra-step-mark">${step.status === 'running' ? '<span class="ra-spin"></span>' : step.n}</div>
        <div class="ra-step-body">
          <div class="ra-step-title"><span class="ra-tag ${TAG_CLASS[step.tag] || ''}">${esc(step.tag)}</span><strong>${esc(step.title)}</strong>
            <time>${step.status === 'running' ? '진행 중…' : seconds(step.ms) + '초'}</time></div>
          ${(step.lines || []).map(line => `<p class="${line.startsWith('⚠') || line.startsWith('✖') ? 'warn' : ''}">${esc(line)}</p>`).join('')}
        </div></li>`).join('')}</ol>
      ${done && run.status === 'COMPLETED' ? `<div class="ra-done"><i data-lucide="file-check-2"></i><div><strong>${esc(run.fileName)} 생성 완료</strong>
        <span>소요 ${seconds(result.elapsedMs || 0)}초 · ${result.slides}장 · 외부 AI 호출 ${(result.aiCalls || []).length}회</span></div>
        <button type="button" class="btn btn-primary" onclick="downloadReportAgentFile(${run.id})"><i data-lucide="download" style="width:14px;height:14px;"></i> 보고서 내려받기</button></div>` : ''}
      ${done && run.status === 'NEEDS_INPUT' ? `<div class="ra-ask-back"><strong>${esc(result.message)}</strong>
        ${(result.candidates || []).map(c => `<button type="button" onclick="startReportAgent(${esc(JSON.stringify(c.id + ' 8D 보고서 작성해줘'))})">
          <b>${esc(c.id)}</b><span>${esc(c.customer)} · ${esc(c.claimTitle)} · ${esc(c.status)}</span></button>`).join('')}</div>` : ''}
      ${done && run.status === 'FAILED' ? `<div class="ra-ask-back failed"><strong>에이전트가 일을 끝내지 못했습니다.</strong><span>${esc(result.message || '')}</span></div>` : ''}`;
  }

  function sideHtml() {
    const run = view.run;
    const finished = run && run.status === 'COMPLETED' && view.shown >= (run.steps || []).length;
    const result = finished ? run.result : null;
    const checks = result ? result.checks.slice().sort((a, b) => ['block', 'warn', 'info'].indexOf(a.level) - ['block', 'warn', 'info'].indexOf(b.level)) : [];
    return `${result ? `<section class="ra-card"><h3>사람이 확인할 것 <b>${checks.filter(c => c.level !== 'info').length}</b></h3>
        ${checks.length ? `<ul class="ra-checks">${checks.map(c => `<li class="${esc(c.level)}"><span>${LEVEL_LABEL[c.level]}${c.stage ? ' · ' + esc(c.stage) : ''}${c.source === 'AI' ? ' · AI' : ''}</span>${esc(c.text)}</li>`).join('')}</ul>`
          : '<p class="ra-muted">규칙 점검과 AI 검토에서 확인할 항목이 나오지 않았습니다.</p>'}</section>
      ${result.summary ? `<section class="ra-card"><h3>요약 초안 <em>AI 초안 · 사람 확인 필요</em></h3><p class="ra-headline">${esc(result.summary.headline)}</p>
        <ul class="ra-points">${result.summary.points.map(p => `<li>${esc(p)}</li>`).join('')}</ul></section>` : ''}
      <section class="ra-card"><h3>에이전트가 하지 않은 것</h3><ul class="ra-points">${(result.notDone || []).map(line => `<li>${esc(line)}</li>`).join('')}</ul></section>` : ''}
      <section class="ra-card"><h3>최근 실행</h3>
        ${view.runs.length ? `<div class="ra-runs">${view.runs.map(item => `<button type="button" class="${run && run.id === item.id ? 'selected' : ''}" onclick="openReportAgentRun(${item.id})">
          <b class="ra-status ${item.status.toLowerCase()}">${STATUS_LABEL[item.status] || item.status}</b><span>${esc(item.requestText)}</span>
          <small>#${item.id} · ${esc(item.requestedBy)} · ${esc(localTime(item.createdAt))}</small></button>`).join('')}</div>`
          : '<p class="ra-muted">아직 실행 기록이 없습니다.</p>'}</section>`;
  }

  function paint() {
    const log = onScreen();
    if (!log) return;
    log.innerHTML = logHtml();
    document.getElementById('raSide').innerHTML = sideHtml();
    const button = document.getElementById('raRun');
    if (button) button.disabled = view.busy;
    const error = document.getElementById('raError');
    if (error) { error.textContent = view.error; error.hidden = !view.error; }
    if (global.lucide) global.lucide.createIcons();
    const last = log.querySelector('.ra-step:last-child, .ra-done, .ra-ask-back');
    if (view.busy && last) last.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  // Reveals one more step every 450 ms until the screen has caught up with the server.
  function reveal() {
    clearTimeout(view.revealTimer);
    const total = (view.run?.steps || []).length;
    if (view.shown < total) {
      view.shown += 1;
      view.fresh = view.shown;   // only the step that just appeared fades in
      paint();
      view.revealTimer = setTimeout(reveal, 450);
    } else if (view.run && view.run.status !== 'RUNNING') {
      view.busy = false;
      view.fresh = 0;
      paint();
      loadRuns();
    }
  }

  async function poll(runId) {
    clearTimeout(view.pollTimer);
    try {
      view.run = (await QMSApi.request(`/__api__/qms/report-agent/runs/${runId}`)).run;
    } catch (error) {
      view.error = error.message; view.busy = false; paint();
      return;
    }
    reveal();
    if (view.run.status === 'RUNNING') view.pollTimer = setTimeout(() => poll(runId), 600);
  }

  async function loadRuns() {
    try {
      view.runs = (await QMSApi.request('/__api__/qms/report-agent/runs')).items || [];
      view.loaded = true;
      if (onScreen()) document.getElementById('raSide').innerHTML = sideHtml();
    } catch (error) { /* the list is a convenience; the run itself reports errors */ }
  }

  async function startReportAgent(text) {
    const box = document.getElementById('raRequest');
    if (typeof text === 'string' && box) box.value = text;
    const requestText = (box ? box.value : text || '').trim();
    if (view.busy) return;
    if (requestText.length < 2) { view.error = '맡길 일을 한 문장으로 적어 주세요.'; paint(); return; }
    view.busy = true; view.error = ''; view.run = null; view.shown = 0; view.fresh = 0;
    paint();
    try {
      if (typeof QMSApi.flushSaves === 'function') await QMSApi.flushSaves();  // the agent reads the centrally saved record
      const active = typeof getActiveCase === 'function' ? getActiveCase() : null;
      const run = (await QMSApi.request('/__api__/qms/report-agent/runs', { method: 'POST', body: { requestText, caseId: active ? active.id : '' } })).run;
      view.run = run;
      poll(run.id);
    } catch (error) {
      view.busy = false; view.error = error.message; paint();
    }
  }

  async function openReportAgentRun(runId) {
    if (view.busy) return;
    try {
      view.run = (await QMSApi.request(`/__api__/qms/report-agent/runs/${runId}`)).run;
      view.shown = (view.run.steps || []).length;
      view.fresh = 0;
      view.error = '';
      paint();
      if (view.run.status === 'RUNNING') { view.busy = true; poll(runId); }
    } catch (error) { view.error = error.message; paint(); }
  }

  async function downloadReportAgentFile(runId) {
    try {
      const response = await fetch(`/__api__/qms/report-agent/runs/${runId}/file`, { credentials: 'same-origin', cache: 'no-store' });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || `보고서 요청 실패 (HTTP ${response.status})`);
      const name = /filename\*=UTF-8''([^;]+)/.exec(response.headers.get('Content-Disposition') || '');
      const url = URL.createObjectURL(await response.blob());
      const link = Object.assign(document.createElement('a'), { href: url, download: name ? decodeURIComponent(name[1]) : `8D_Report_${runId}.pptx` });
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { view.error = error.message; paint(); }
  }

  function renderReportAgentView() {
    if (!view.loaded) loadRuns();
    const chips = requestChips();
    setTimeout(paint, 0);
    return `<div class="ra-shell">
      <header class="ra-hero">
        <div><span class="ra-kicker">AI AGENT</span><h1>8D 보고서 에이전트</h1>
          <p>한 문장으로 맡기면, 에이전트가 Case 기록과 보관된 근거 원본을 스스로 모아 계산·점검하고 사내 발표 양식의 8D 보고서(PPT)를 만듭니다.</p></div>
        <ol class="ra-flow"><li><b>1</b>요청 한 문장</li><li><b>2</b>자료를 스스로 수집</li><li><b>3</b>계산하고 점검</li><li><b>4</b>보고서 완성</li></ol>
      </header>
      <section class="ra-ask">
        <textarea id="raRequest" rows="2" maxlength="400" aria-label="에이전트에게 맡길 일" placeholder="에이전트에게 맡길 일을 한 문장으로 적으세요"
          onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();startReportAgent();}"></textarea>
        <button type="button" id="raRun" class="btn btn-primary" onclick="startReportAgent()"><i data-lucide="play" style="width:15px;height:15px;"></i> 에이전트 실행</button>
        ${chips.length ? `<div class="ra-chips"><span>등록된 Case로 바로 요청</span>${chips.map(chip => `<button type="button" onclick="startReportAgent(${esc(JSON.stringify(chip.text))})">${esc(chip.label)}</button>`).join('')}</div>`
          : '<div class="ra-chips"><span>등록된 Case가 없습니다. 고객 부적합을 접수해 Case가 생기면 여기에서 바로 요청할 수 있습니다.</span></div>'}
        <p id="raError" class="ra-error" hidden></p>
      </section>
      <div class="ra-grid"><section class="ra-log" id="raLog" aria-live="polite"></section><aside class="ra-side" id="raSide"></aside></div>
    </div>`;
  }

  Object.assign(global, { renderReportAgentView, startReportAgent, openReportAgentRun, downloadReportAgentFile });
})(typeof window !== 'undefined' ? window : globalThis);
