/* VIEW 5: INTEGRATED ACTIONS HUB (Dynamic Multi-Stage Aggregation)             */
/* ========================================================================= */
function renderActionsHubView(c) {
  const esc = typeof escapeWorkspaceValue === 'function' ? escapeWorkspaceValue : (v => String(v ?? '').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s])));
  const rows = [];

  // D3 Containment Actions
  (c.d3?.actions || []).forEach(act => rows.push({
    id: act.id || 'ACT-D3',
    stage: 'D3 Containment',
    stageBadge: 'badge-warn',
    title: `[${act.target || '봉쇄 대상'}] ${act.action || '조치 내용'}`,
    owner: act.owner || '미배정',
    due: act.due || '-',
    completedAt: act.completion || '-',
    status: act.status || 'Open'
  }));

  // D4 Analysis & Verification Tools
  (c.d4?.selectedTools || []).forEach(tool => {
    const toolMeta = typeof getD4ToolById === 'function' ? getD4ToolById(tool.id) : null;
    rows.push({
      id: tool.id || 'TOOL-D4',
      stage: 'D4 Root Cause',
      stageBadge: 'badge-purple',
      title: `[${toolMeta?.name || tool.id}] ${tool.hypothesis || '가설 검증 및 실증 분석'}`,
      owner: tool.owner || '-',
      due: '-',
      completedAt: tool.artifact?.updatedAt || '-',
      status: tool.artifact?.humanConfirmed ? 'Verified' : (tool.status || 'Testing')
    });
  });

  // D5 Corrective Actions (Candidates selected)
  (c.d5?.candidates || []).filter(action => action.selected).forEach(action => rows.push({
    id: action.id || 'PCA-D5',
    stage: 'D5 Corrective',
    stageBadge: 'badge-blue',
    title: `[${action.causeType || '원인 대응'}] ${action.title || '영구 시정조치 계획'}`,
    owner: action.owner || '선정 대책 담당',
    due: action.due || '-',
    completedAt: action.selected ? 'Selected' : '-',
    status: action.selected ? 'Selected' : 'Candidate'
  }));

  // D6 Implementation & Validation Tests
  (c.d6?.validationTests || []).forEach(test => rows.push({
    id: test.id || 'VAL-D6',
    stage: 'D6 Validation',
    stageBadge: 'badge-ok',
    title: `[${test.actionId || 'PCA 연결'}] ${test.testName || '효과 실측 시험'} (${test.condition || '표준 조건'})`,
    owner: test.owner || '검증 담당',
    due: '적용 LOT 완료',
    completedAt: test.completedAt || '-',
    status: test.result || 'Pending'
  }));

  // D7 System Standard Updates
  (c.d7?.systemUpdates || []).forEach(update => rows.push({
    id: update.id || 'STD-D7',
    stage: 'D7 System',
    stageBadge: 'badge-cyan',
    title: `[표준 개정] ${update.docName || update.docNo || '품질 문서'} (Rev: ${update.rev || '최신'}) - ${update.changeContent || '변경 내용 반영'}`,
    owner: update.owner || '표준화 담당',
    due: update.due || '-',
    completedAt: update.status === 'Completed' ? '개정 완료' : '-',
    status: update.status || 'Open'
  }));

  // D7 Horizontal Deployments
  (c.d7?.horizontalDeployment || []).forEach(item => rows.push({
    id: item.id || 'HOR-D7',
    stage: 'D7 Horizontal',
    stageBadge: 'badge-cyan',
    title: `[수평 전개] ${item.product || '유사 제품군'} · ${item.action || '확산 조치'}`,
    owner: item.owner || '전개 담당',
    due: '30일 이내',
    completedAt: item.status === 'Completed' ? '전개 완료' : '-',
    status: item.status || 'Open'
  }));

  // Compute status metrics
  const totalCount = rows.length;
  const completedCount = rows.filter(r => ['Completed', 'PASS', 'Verified', 'Closed', 'Selected'].includes(r.status)).length;
  const openCount = totalCount - completedCount;

  return `
    ${renderQmsPageHeader({title:'통합 조치 관리',icon:'list-todo',description:'D3 봉쇄부터 D7 표준화까지 조치 내용, 담당자, 기한과 완료 상태를 함께 확인합니다.',reference:c.id})}
    <div class="grid-4 qms-metric-grid">
      ${[
        {label:'전체 추적 조치',value:totalCount,tone:'info'},
        {label:'완료 / 검증 통과',value:completedCount,tone:'success'},
        {label:'진행 / 대기 중',value:openCount,tone:'warn'},
        {label:'조치 달성률',value:`${totalCount ? Math.round(completedCount/totalCount*100) : 0}%`,tone:'neutral'}
      ].map(item=>renderQmsMetric(item)).join('')}
    </div>

    <div class="card">
      <table class="custom-table">
        <thead>
          <tr>
            <th>Action ID</th>
            <th>Stage</th>
            <th>조치 대상 및 내용</th>
            <th>담당자</th>
            <th>Due Date</th>
            <th>완료 일시</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${rows.length ? rows.map(row => {
            const isDone = ['Completed', 'PASS', 'Verified', 'Closed', 'Selected'].includes(row.status);
            return `
              <tr>
                <td class="num-mono" style="font-weight:700; color:#38bdf8;">${esc(row.id)}</td>
                <td><span class="badge-pill ${row.stageBadge || 'badge-gray'}">${esc(row.stage)}</span></td>
                <td style="font-weight:600;">${esc(row.title)}</td>
                <td>${esc(row.owner)}</td>
                <td class="num-mono" style="font-size:0.75rem;">${esc(row.due)}</td>
                <td class="num-mono" style="font-size:0.75rem; color:${isDone ? '#34d399' : 'var(--text-muted)'};">${esc(row.completedAt)}</td>
                <td><span class="badge-pill ${isDone ? 'badge-ok' : (row.status === 'Open' ? 'badge-warn' : 'badge-gray')}">${esc(row.status)}</span></td>
              </tr>
            `;
          }).join('') : `
            <tr>
              <td colspan="7" style="text-align:center; padding:24px; color:var(--text-muted);">
                등록된 Action이 없습니다. D3, D4, D5, D6, D7 단계를 진행해 주세요.
              </td>
            </tr>
          `}
        </tbody>
      </table>
    </div>
  `;
}