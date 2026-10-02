/* Outsourced assembly defects by product: authenticated server records, totals computed by the server. */
(function (global) {
  'use strict';
  const API = '/__api__/qms/assembly-defects';
  const labels = { Open: '접수', InAction: '조치 중', Closed: '종결' };
  const tones = { Open: 'info', InAction: 'warn', Closed: 'success' };
  const next = { Open: ['InAction'], InAction: ['Closed', 'Open'], Closed: ['InAction'] };
  const state = { actor: '', data: null, loading: false, error: '', screen: 'list', selected: '', draft: {}, message: '', part: '', supplier: '', status: '', search: '' };
  const esc = value => qmsUiEscape(value ?? '');
  const user = () => QMSApi.getState().user;
  const roles = () => user()?.roles || [];
  const canWrite = () => !user()?.isSupplier && roles().some(r => ['system_admin', 'quality_reviewer', 'case_facilitator', 'stage_drafter', 'stage_leader', 'stage_champion', 'customer_dispatcher'].includes(r));
  const canReview = () => !user()?.isSupplier && roles().some(r => ['system_admin', 'quality_reviewer'].includes(r));
  const current = () => appData.currentView === 'assembly-defects';
  const records = () => state.data?.items || [];
  const selected = () => records().find(r => r.recordId === state.selected);
  const count = value => Number(value || 0).toLocaleString();
  const quantity = value => Number.isInteger(value) ? count(value) : '미입력';
  const rate = value => value == null ? '기록 없음' : value + '%';
  const badge = r => `<span class="qms-status-chip qms-tone-${tones[r.status] || 'neutral'}">${esc(labels[r.status] || r.status)}</span>`;
  const info = (label, value) => `<div class="iq-info"><dt>${esc(label)}</dt><dd>${esc(value === 0 ? 0 : value || '미등록')}</dd></div>`;

  async function load(force = false) {
    const actor = user()?.username || '';
    if (actor !== state.actor) Object.assign(state, { actor, data: null, loading: false, error: '', screen: 'list', selected: '', draft: {}, message: '', part: '', supplier: '', status: '', search: '' });
    if (!actor || user()?.isSupplier || state.loading || (state.data && !force)) return;
    state.loading = true; state.error = '';
    try { const result = await QMSApi.request(API); if (user()?.username === actor) state.data = result; }
    catch (error) { if (user()?.username === actor) state.error = error.message; }
    finally { state.loading = false; if (current()) renderCurrentView(); }
  }

  function field(label, name, value = '', options = {}) {
    const { required = false, type = 'text', wide = false, textarea = false, choices = null } = options;
    const common = `name="${name}" ${required ? 'required' : ''}`;
    let control;
    if (choices) control = `<select ${common}>${choices.map(([v, t]) => `<option value="${esc(v)}" ${value === v ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
    else if (textarea) control = `<textarea ${common} rows="3" maxlength="8000">${esc(value)}</textarea>`;
    else control = `<input ${common} type="${type}" value="${esc(value ?? '')}" ${type === 'number' ? 'min="0" step="1"' : 'maxlength="240"'}>`;
    return `<label class="iq-field ${wide ? 'iq-wide' : ''}"><span>${esc(label)}${required ? ' <b aria-label="필수">*</b>' : ''}</span>${control}</label>`;
  }
  const filesField = () => `<label class="iq-field iq-wide"><span>불량 사진·성적서 원본 첨부</span><input type="file" name="evidence" multiple accept=".png,.jpg,.jpeg,.webp,.pdf,.xlsx,.xls,.csv,.docx,.eml,.txt"><small>최대 10개, 합계 30 MB. 저장 후 원본을 내려받을 수 있습니다.</small></label>`;
  const supplierChoices = () => [['', '외주사 선택'], ...MASTER_SUPPLIERS.map(s => [s.id, s.name])];

  function formFields(f) {
    const tickets = (typeof supplierTicketStore !== 'undefined' ? supplierTicketStore.raw : []).filter(t => !f.supplierId || t.supplier?.id === f.supplierId);
    return `${field('외주사', 'supplierId', f.supplierId || f.supplier?.id || '', { required: true, choices: supplierChoices() })}
      ${field('품목코드 (P/N)', 'partNumber', f.partNumber, { required: true })}${field('품명', 'productName', f.productName)}${field('Lot No.', 'lotNo', f.lotNo)}
      ${field('발생일', 'occurredDate', f.occurredDate, { required: true, type: 'date' })}${field('조립 공정', 'process', f.process)}${field('불량 유형', 'defectType', f.defectType, { required: true })}
      ${field('투입 수량 (ea)', 'inputQty', f.inputQty ?? '', { type: 'number' })}${field('불량 수량 (ea)', 'defectQty', f.defectQty ?? '', { required: true, type: 'number' })}${field('사내 담당자', 'owner', f.owner)}
      ${field('불량 내용 / 확인된 현상', 'description', f.description, { wide: true, textarea: true })}${field('외주사 조치 / 봉쇄 내용', 'containment', f.containment, { wide: true, textarea: true })}
      ${field('외주 접수 연결 (선택)', 'linkedTicketId', f.linkedTicketId || '', { choices: [['', '연결하지 않음'], ...tickets.map(t => [t.ticketId, `${t.ticketId} · ${t.details?.title || ''}`])] })}
      ${field('8D Case 연결 (선택)', 'linkedCaseId', f.linkedCaseId || '', { choices: [['', '연결하지 않음'], ...(appData.cases || []).map(c => [c.id, `${c.id} · ${c.claimTitle || c.customer || ''}`])] })}`;
  }

  function formView() {
    const editing = state.screen === 'edit', rec = editing ? selected() : null;
    const f = editing ? { ...rec, supplierId: rec.supplier.id, ...state.draft } : state.draft;
    return `<section class="iq-card"><div class="iq-card-heading"><h2>${editing ? '조립 불량 기록 수정' : '외주 조립 불량 등록'}</h2><span class="qms-status-chip qms-tone-neutral">${editing ? esc(rec.recordId) : '로그인 계정으로 등록'}</span></div>
      <form id="assemblyDefectForm" onsubmit="handleAssemblyDefectSubmit(event)" oninput="assemblyDefectCapture(this)" onchange="assemblyDefectCapture(this)">
      <div class="iq-form-grid">${formFields(f)}${editing ? field('수정 사유', 'comment', '', { required: true, wide: true, textarea: true }) : ''}${filesField()}</div>
      <div class="iq-note">확인된 수량만 입력하세요. 투입 수량을 모르면 비워 두며, 그 기록은 불량률 계산에서 빠집니다.</div>
      <p id="assemblyDefectError" class="iq-error" role="alert"></p>
      <div class="iq-actions"><button type="button" class="btn btn-secondary" onclick="assemblyDefectOpen('list')">목록</button><button class="btn btn-primary" type="submit">${editing ? '수정 내용 저장' : '등록'}</button></div></form></section>`;
  }

  function productTable() {
    const products = state.data.products;
    if (!products.length) return '';
    return `<section class="iq-card"><h2 class="sq-section-title">제품별 집계</h2><div class="qms-table-scroll"><table class="iq-table"><thead><tr><th>품목코드 / 품명</th><th>기록</th><th>미종결</th><th>불량 수량</th><th>불량률</th><th>외주사별 불량 수량</th><th>주요 불량 유형</th><th>최근 발생</th><th></th></tr></thead><tbody>${products.map(p => `<tr class="${state.part === p.partNumber ? 'ad-selected' : ''}">
      <td><strong class="iq-code">${esc(p.partNumber)}</strong><small>${esc(p.productName)}</small></td><td class="num-mono">${count(p.records)}</td><td class="num-mono">${count(p.open)}</td><td class="num-mono">${count(p.defectQty)}</td>
      <td><span class="num-mono">${rate(p.defectRatePct)}</span><small>${p.measuredRecords ? `${count(p.measuredDefectQty)} / ${count(p.measuredInputQty)} · 수량 입력 ${count(p.measuredRecords)}건` : '투입 수량 입력 없음'}</small></td>
      <td>${p.suppliers.map(s => `${esc(s.name)} ${count(s.defectQty)}`).join(' · ')}</td><td>${p.defectTypes.slice(0, 3).map(d => `${esc(d.type)} ${count(d.defectQty)}`).join(' · ')}</td><td class="num-mono">${esc(p.lastOccurredDate)}</td>
      <td><button type="button" class="btn btn-secondary btn-sm" data-part="${esc(p.partNumber)}" onclick="assemblyDefectPart(this.dataset.part)">${state.part === p.partNumber ? '전체 보기' : '이 제품만'}</button></td></tr>`).join('')}</tbody></table></div></section>`;
  }

  function recordTable() {
    const q = state.search.trim().toLowerCase();
    const rows = records().filter(r => (!state.part || r.partNumber === state.part) && (!state.supplier || r.supplier.id === state.supplier) && (!state.status || r.status === state.status)
      && (!q || [r.recordId, r.partNumber, r.productName, r.lotNo, r.defectType, r.process, r.owner].join(' ').toLowerCase().includes(q)));
    if (!rows.length) return renderQmsEmpty({ title: '조건에 맞는 조립 불량 기록이 없습니다.', description: records().length ? '검색 조건을 바꿔 보세요.' : '등록 버튼으로 첫 기록을 남기세요.' });
    return `<div class="qms-table-scroll"><table class="iq-table"><thead><tr><th>번호 / 발생일</th><th>품목코드 / Lot</th><th>외주사 / 공정</th><th>불량 유형</th><th>불량 / 투입</th><th>상태</th><th>상세</th></tr></thead><tbody>${rows.map(r => `<tr>
      <td><strong class="iq-code">${esc(r.recordId)}</strong><small>${esc(r.occurredDate)}</small></td><td><strong>${esc(r.partNumber)}</strong><small>${esc(r.lotNo || 'Lot 미등록')}</small></td>
      <td>${esc(r.supplier.name)}<small>${esc(r.process || '공정 미등록')}</small></td><td>${esc(r.defectType)}</td><td class="num-mono">${count(r.defectQty)} / ${quantity(r.inputQty)}</td><td>${badge(r)}</td>
      <td><button type="button" class="btn btn-secondary btn-sm" onclick="assemblyDefectOpen('detail','${esc(r.recordId)}')">열기</button></td></tr>`).join('')}</tbody></table></div>`;
  }

  function listView() {
    const all = records(), products = state.data.products;
    const measuredDefect = products.reduce((sum, p) => sum + p.measuredDefectQty, 0), measuredInput = products.reduce((sum, p) => sum + p.measuredInputQty, 0);
    const metrics = [
      { label: '등록 기록', value: count(all.length), note: `제품 ${count(products.length)}종`, tone: 'info' },
      { label: '미종결', value: count(all.filter(r => r.status !== 'Closed').length), note: '접수·조치 중', tone: all.some(r => r.status !== 'Closed') ? 'warn' : 'success' },
      { label: '불량 수량 합계', value: count(all.reduce((sum, r) => sum + r.defectQty, 0)), note: '등록된 기록 전체' },
      { label: '전체 불량률', value: measuredInput ? (Math.round(measuredDefect / measuredInput * 1000000) / 10000) + '%' : '기록 없음', note: measuredInput ? `${count(measuredDefect)} / ${count(measuredInput)} · 투입 수량 입력 건 기준` : '투입 수량 입력 없음' }
    ];
    return `<div class="iq-metrics">${metrics.map(renderQmsMetric).join('')}</div>${productTable()}
      <section class="iq-card"><form class="iq-filters" onsubmit="event.preventDefault()" oninput="assemblyDefectFilter(this)">
        <label>검색<input name="search" value="${esc(state.search)}" placeholder="품목코드, Lot, 불량 유형, 담당자"></label>
        <label>외주사<select name="supplier"><option value="">전체 외주사</option>${MASTER_SUPPLIERS.map(s => `<option value="${esc(s.id)}" ${state.supplier === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>
        <label>상태<select name="status"><option value="">전체 상태</option>${Object.entries(labels).map(([k, v]) => `<option value="${k}" ${state.status === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        ${state.part ? `<span class="qms-status-chip qms-tone-info">제품 ${esc(state.part)}</span>` : ''}</form>
        <div id="assemblyDefectTable">${recordTable()}</div></section>`;
  }

  function detailView() {
    const r = selected();
    if (!r) return renderQmsEmpty({ title: '기록을 찾을 수 없습니다.' });
    return `<section class="iq-card"><div class="iq-card-heading"><div><span class="iq-code">${esc(r.recordId)}</span><h2>${esc(r.partNumber)} · ${esc(r.defectType)}</h2></div>${badge(r)}</div>
      <dl class="iq-info-grid">${info('외주사 / 공정', `${r.supplier.name} / ${r.process || '미등록'}`)}${info('품명 / Lot', `${r.productName || '미등록'} / ${r.lotNo || '미등록'}`)}${info('발생일', r.occurredDate)}
        ${info('불량 / 투입 수량', `${count(r.defectQty)} / ${quantity(r.inputQty)}`)}${info('사내 담당자', r.owner)}${info('연결', [r.linkedTicketId, r.linkedCaseId].filter(Boolean).join(' · '))}</dl>
      ${info('불량 내용', r.description)}${info('외주사 조치 / 봉쇄', r.containment)}${info('조치 결과', r.actionResult)}
      <h3>첨부 원본 (${r.files.length})</h3><ul class="iq-file-list">${r.files.length ? r.files.map(f => `<li><a href="${API}/${esc(r.recordId)}/files/${esc(f.id)}" download>${esc(f.name)}</a><small>${(f.size / 1024).toFixed(1)} KB · ${esc(f.uploadedBy.name)}</small></li>`).join('') : '<li>첨부된 원본이 없습니다.</li>'}</ul>
      ${canWrite() ? `<details class="iq-manage" open><summary>조치 관리</summary><form id="assemblyDefectUpdateForm" onsubmit="handleAssemblyDefectUpdate(event)"><div class="iq-form-grid">
        ${field('관리 작업', 'nextStatus', 'note', { choices: [['note', '상태 유지 · 내용 기록'], ...(next[r.status] || []).filter(k => canReview() || (k !== 'Closed' && r.status !== 'Closed')).map(k => [k, labels[k] + '(으)로 변경'])] })}
        ${field('조치 결과 (종결 시 필수)', 'actionResult', r.actionResult, { wide: true, textarea: true })}${field('조치 / 변경 내용', 'comment', '', { required: true, wide: true, textarea: true })}${filesField()}</div>
        <div class="iq-note">종결과 재검토는 품질 검토 권한자가 수행하며 로그인 계정으로 기록됩니다. 외주 접수·8D Case 연결은 참조만 남깁니다.</div>
        <p id="assemblyDefectError" class="iq-error" role="alert"></p><div class="iq-actions"><button class="btn btn-primary" type="submit">저장</button></div></form></details>` : ''}
      <h3>이력</h3><ol class="iq-history">${[...r.history].reverse().map(h => `<li><div><strong>${esc(h.actor.name)} · ${esc(h.actor.dept)}</strong><span>${esc(labels[h.status] || h.status)} · ${esc(new Date(h.at).toLocaleString('ko-KR', { hour12: false }))}</span></div><p>${esc(h.comment)}</p></li>`).join('')}</ol>
      <div class="iq-actions"><button class="btn btn-secondary" onclick="assemblyDefectOpen('list')">목록</button>${canWrite() && r.status !== 'Closed' ? `<button class="btn btn-secondary" onclick="assemblyDefectOpen('edit','${esc(r.recordId)}')">기록 수정</button>` : ''}</div></section>`;
  }

  function renderAssemblyDefectsView() {
    if (user()?.isSupplier) return renderQmsEmpty({ title: '사내 계정에서만 조회할 수 있습니다.' });
    load();
    if (typeof refreshSupplierRecords === 'function') refreshSupplierRecords();
    const header = renderQmsPageHeader({
      title: '제품별 외주 조립 불량 관리', icon: 'package-search',
      description: '외주 조립에서 발생한 불량을 제품(품목코드)별로 등록하고 외주사·불량 유형·수량과 조치 상태를 관리합니다.',
      badges: [{ label: '사내 관리', tone: 'info' }],
      actions: `<button type="button" class="btn btn-secondary" onclick="refreshAssemblyDefects()"><i data-lucide="refresh-cw"></i> 새로고침</button>${canWrite() ? `<button type="button" class="btn btn-primary" onclick="assemblyDefectOpen('new')"><i data-lucide="plus"></i> 조립 불량 등록</button>` : ''}`
    });
    let body;
    if (state.error) body = renderQmsEmpty({ title: '기록을 불러오지 못했습니다.', description: state.error, icon: 'alert-triangle' });
    else if (!state.data) body = renderQmsEmpty({ title: '기록을 불러오는 중입니다.', icon: 'loader-circle' });
    else body = state.screen === 'new' || state.screen === 'edit' ? formView() : state.screen === 'detail' ? detailView() : listView();
    return `<div class="internal-quality-workspace assembly-defects">${header}${state.message ? `<div class="iq-success" role="status">${esc(state.message)}</div>` : ''}${body}</div>`;
  }

  async function readFiles(form) {
    const files = [...(form.querySelector('[name=evidence]')?.files || [])];
    if (files.length > 10 || files.reduce((sum, f) => sum + f.size, 0) > 30 * 1024 * 1024) throw new Error('첨부는 최대 10개, 합계 30 MB까지 가능합니다.');
    return Promise.all(files.map(async file => ({ filename: file.name, dataUrl: await fileAsDataURL(file) })));
  }
  function put(record) {
    state.data.items = [record, ...records().filter(r => r.recordId !== record.recordId)];
    Object.assign(state, { selected: record.recordId, screen: 'detail', draft: {}, message: '저장 완료 · ' + record.recordId });
    load(true);
  }
  const numeric = value => value === '' || value == null ? null : Number(value);

  async function handleAssemblyDefectSubmit(event) {
    event.preventDefault();
    const form = event.target, button = form.querySelector('[type=submit]');
    if (button.disabled || !form.reportValidity()) return;
    button.disabled = true;
    try {
      const values = Object.fromEntries([...new FormData(form)].filter(([, v]) => !(v instanceof File)));
      const editing = state.screen === 'edit', record = selected();
      const body = { ...values, inputQty: numeric(values.inputQty), defectQty: numeric(values.defectQty), files: await readFiles(form) };
      if (editing) Object.assign(body, { action: 'edit', expectedRevision: record.revision });
      const result = await QMSApi.request(API + (editing ? '/' + encodeURIComponent(record.recordId) : ''), { method: 'POST', body });
      put(result.record);
      if (current()) renderCurrentView();
    } catch (error) { form.querySelector('#assemblyDefectError').textContent = error.message; }
    finally { button.disabled = false; }
  }

  async function handleAssemblyDefectUpdate(event) {
    event.preventDefault();
    const form = event.target, button = form.querySelector('[type=submit]'), record = selected();
    if (button.disabled || !form.reportValidity()) return;
    button.disabled = true;
    let failed = '';
    try {
      const values = Object.fromEntries([...new FormData(form)].filter(([, v]) => !(v instanceof File)));
      const body = { action: values.nextStatus === 'note' ? 'note' : 'status', status: values.nextStatus, comment: values.comment, actionResult: values.actionResult, expectedRevision: record.revision, files: await readFiles(form) };
      const result = await QMSApi.request(`${API}/${encodeURIComponent(record.recordId)}`, { method: 'POST', body });
      put(result.record);
    } catch (error) { failed = error.message; }
    finally {
      button.disabled = false;
      if (failed) form.querySelector('#assemblyDefectError').textContent = failed;
      else if (current()) renderCurrentView();
    }
  }

  Object.assign(global, {
    renderAssemblyDefectsView, handleAssemblyDefectSubmit, handleAssemblyDefectUpdate,
    assemblyDefectOpen: (screen, id) => { Object.assign(state, { screen, selected: id || '', draft: {}, message: '' }); renderCurrentView(); },
    assemblyDefectCapture: form => { state.draft = Object.fromEntries([...new FormData(form)].filter(([, v]) => !(v instanceof File))); },
    assemblyDefectPart: part => { state.part = state.part === part ? '' : part; renderCurrentView(); },
    assemblyDefectFilter: form => { state.search = form.querySelector('[name=search]').value; state.supplier = form.querySelector('[name=supplier]').value; state.status = form.querySelector('[name=status]').value; document.getElementById('assemblyDefectTable').innerHTML = recordTable(); },
    refreshAssemblyDefects: () => load(true)
  });
})(typeof window !== 'undefined' ? window : globalThis);
