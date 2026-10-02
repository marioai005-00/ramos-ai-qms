/* Supplier quality overview: per-supplier counts computed by the server from stored tickets and notices. */
(function (global) {
  'use strict';
  const state = { actor: '', data: null, loading: false, error: '' };
  const esc = value => qmsUiEscape(value ?? '');
  const user = () => QMSApi.getState().user;
  const categories = { OSAT_PKG: 'OSAT 패키지', SMT_MODULE: 'SMT 모듈 조립', TEST_HOUSE: '테스트 하우스' };

  async function load(force = false) {
    const actor = user()?.username || '';
    if (actor !== state.actor) Object.assign(state, { actor, data: null, loading: false, error: '' });
    if (!actor || state.loading || (state.data && !force)) return;
    state.loading = true; state.error = '';
    try {
      const result = await QMSApi.supplierSummary();
      if (user()?.username === actor) state.data = result;
    } catch (error) {
      if (user()?.username === actor) state.error = error.message;
    } finally {
      state.loading = false;
      if (appData.currentView === 'supplier-dashboard') renderCurrentView();
    }
  }

  const count = value => Number(value || 0).toLocaleString();
  // A missing value means "nothing recorded to compute from", which is different from zero.
  const optional = (value, unit) => value == null ? '기록 없음' : `${value}${unit}`;

  function supplierCard(s) {
    const t = s.tickets, n = s.notices, q = s.issueQuantities;
    const needsAction = t.awaitingReview + n.overdue;
    return `<article class="sq-card ${needsAction ? 'needs-action' : ''}">
      <header><div><h3>${esc(s.name)}</h3><p>${esc(categories[s.category] || s.category)} · ${esc(s.contact)}</p></div>
        <span class="qms-status-chip qms-tone-${needsAction ? 'warn' : 'success'}">${needsAction ? `조치 필요 ${needsAction}건` : '대기 건 없음'}</span></header>
      <div class="sq-grid">
        <div><span>외주 접수 (PCN / Issue)</span><strong class="num-mono">${count(t.total)}</strong><small>${count(t.pcn)} / ${count(t.issue)}</small></div>
        <div><span>사내 심의 대기</span><strong class="num-mono">${count(t.awaitingReview)}</strong><small>외주사 보완 대기 ${count(t.awaitingSupplier)}</small></div>
        <div><span>승인 / 반려</span><strong class="num-mono">${count(t.approved)} / ${count(t.rejected)}</strong><small>8D 연결 ${count(t.linkedTo8D)}</small></div>
        <div><span>Issue 보고 불량률</span><strong class="num-mono">${optional(q.defectRatePct, '%')}</strong><small>${q.reportedTickets ? `${count(q.defectQty)} / ${count(q.inputQty)} · 수량 입력 ${count(q.reportedTickets)}건` : '수량이 입력된 Issue 없음'}</small></div>
        <div><span>부적합 통보 (회신 대기)</span><strong class="num-mono">${count(n.total)}</strong><small>회신 대기 ${count(n.awaitingReply)} · 기한 초과 ${count(n.overdue)}</small></div>
        <div><span>평균 첫 회신 시간</span><strong class="num-mono">${optional(n.averageFirstReplyHours, 'h')}</strong><small>${n.repliedCount ? `회신 ${count(n.repliedCount)}건 기준` : '회신 기록 없음'} · 종결 ${count(n.closed)}</small></div>
      </div>
      ${s.repeatedParts.length ? `<p class="sq-repeat"><i data-lucide="repeat"></i> 같은 품번으로 Issue가 반복 접수됨: ${s.repeatedParts.map(p => `<b class="num-mono">${esc(p.partNumber)}</b> (${p.ticketIds.map(esc).join(', ')})`).join(' · ')}</p>` : ''}
    </article>`;
  }

  function attentionTable(items) {
    if (!items.length) return renderQmsEmpty({ title: '지금 조치가 필요한 외주 건이 없습니다.', icon: 'check-circle-2', compact: true });
    return `<div class="quality-table-wrap"><table class="custom-table"><thead><tr><th>구분</th><th>번호</th><th>외주사</th><th>제목</th><th>사유</th><th>경과</th><th></th></tr></thead><tbody>${items.map(item => `<tr>
      <td>${item.kind === 'notice' ? '부적합 통보' : '외주 접수'}</td><td class="num-mono">${esc(item.id)}</td><td>${esc(item.supplier)}</td><td>${esc(item.title)}</td><td>${esc(item.reason)}</td>
      <td>${item.days == null ? '—' : item.days + '일'}</td>
      <td><button type="button" class="btn btn-secondary btn-sm" onclick="switchNav('${item.kind === 'notice' ? 'supplier-notices' : item.id.startsWith('PCN') ? 'supplier-pcn' : 'supplier-issues'}')">목록 열기</button></td></tr>`).join('')}</tbody></table></div>`;
  }

  function renderSupplierDashboardView() {
    if (user()?.isSupplier) return renderQmsEmpty({ title: '사내 계정에서만 조회할 수 있습니다.' });
    load();
    const header = renderQmsPageHeader({
      title: '외주사 품질 현황', icon: 'bar-chart-3',
      description: '외주 접수와 부적합 통보의 저장된 기록을 외주사별로 집계합니다. 추정값은 표시하지 않습니다.',
      badges: state.data ? [{ label: `기준 ${new Date(state.data.generatedAt).toLocaleString('ko-KR', { hour12: false })}`, tone: 'neutral' }] : [],
      actions: `<button type="button" class="btn btn-secondary" onclick="refreshSupplierDashboard()"><i data-lucide="refresh-cw"></i> 새로고침</button>`
    });
    let body;
    if (state.error) body = renderQmsEmpty({ title: '현황을 불러오지 못했습니다.', description: state.error, icon: 'alert-triangle' });
    else if (!state.data) body = renderQmsEmpty({ title: '현황을 불러오는 중입니다.', icon: 'loader-circle' });
    else {
      const d = state.data;
      const sum = pick => d.suppliers.reduce((total, s) => total + pick(s), 0);
      const metrics = [
        { label: '외주 접수', value: count(d.totals.tickets), note: '외주사가 제출한 PCN·Issue' },
        { label: '사내 심의 대기', value: count(sum(s => s.tickets.awaitingReview)), note: '접수·보완 제출 후 판정 전', tone: sum(s => s.tickets.awaitingReview) ? 'warn' : 'success' },
        { label: '공개된 부적합 통보', value: count(d.totals.notices), note: '우리 회사 → 외주사' },
        { label: '회신 기한 초과', value: count(sum(s => s.notices.overdue)), note: '외주사 회신 대기 중', tone: sum(s => s.notices.overdue) ? 'danger' : 'success' }
      ];
      body = `<div class="iq-metrics">${metrics.map(renderQmsMetric).join('')}</div>
        <section class="iq-card"><h2 class="sq-section-title">조치가 필요한 건</h2>${attentionTable(d.attention)}</section>
        <div class="sq-cards">${d.suppliers.map(supplierCard).join('')}</div>`;
    }
    return `<div class="internal-quality-workspace supplier-dashboard">${header}${body}</div>`;
  }

  global.renderSupplierDashboardView = renderSupplierDashboardView;
  global.refreshSupplierDashboard = () => load(true);
})(typeof window !== 'undefined' ? window : globalThis);
