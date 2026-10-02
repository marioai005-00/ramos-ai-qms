/* Current case stage report preview; no example case registration. */
function openStageReportPreview(stage) {
  const c = getActiveCase();
  if (!c) return;
  if (stage === 'D2' && typeof captureD2Form === 'function') captureD2Form(c);
  if (stage === 'D3' && typeof captureD3Form === 'function') captureD3Form(c);
  if (stage === 'D4' && typeof captureD4Form === 'function') captureD4Form(c);
  const modal = document.getElementById('globalModal');
  const container = document.getElementById('modalContainer');
  if (!modal || !container) return;
  container.style.width = '1080px';
  container.style.maxWidth = '96vw';
  container.innerHTML = `<div class="stage-preview-shell">
    <header class="stage-preview-header no-print"><div><span>LIVE REPORT PREVIEW</span><h2>${stage} 단계 고객 보고서 미리보기</h2><p>현재 화면에 입력된 내용을 고객 제출 문서 구조로 변환한 초안입니다.</p></div><div><button class="btn btn-secondary btn-sm" onclick="document.getElementById('globalModal').style.display='none';switchNav('reports-hub')">공식 Report Hub</button><button class="btn btn-secondary btn-sm" onclick="document.getElementById('globalModal').style.display='none'">닫기</button></div></header>
    ${renderStageReportPreview(c,stage)}
  </div>`;
  modal.style.display = 'flex';
  if (stage === 'D4' && typeof hydrateD4EvidenceAttachments === 'function') setTimeout(() => hydrateD4EvidenceAttachments(container), 0);
  if (window.lucide) lucide.createIcons();
}

function reportEmpty(value, fallback='작성 대기') { return (value === 0 ? '0' : value) || `<span class="stage-report-empty">${fallback}</span>`; }
function reportRows(rows, emptyCols, mapper) { return rows?.length ? rows.map(mapper).join('') : `<tr><td colspan="${emptyCols}" class="stage-report-empty">등록된 내용 없음</td></tr>`; }

function renderStageReportPreview(c, stage) {
  const stageMeta = {
    D1:['Cross-Functional Team','CFT 구성과 역할·책임'], D2:['Problem Description','5W2H와 문제 경계'],
    D3:['Interim Containment','영향 범위와 봉쇄조치'], D4:['Root Cause Analysis','발생·유출·시스템 원인'],
    D5:['Permanent Corrective Action','영구대책 선정'], D6:['Implementation & Validation','대책 적용과 효과검증'],
    D7:['Prevent Recurrence','표준 개정과 수평전개'], D8:['Closure & Recognition','최종 승인과 종결']
  }[stage] || ['8D Report','단계 미선택'];
  return `<article class="stage-report-paper">
    <div class="stage-report-watermark">DRAFT · HUMAN APPROVAL REQUIRED</div>
    <table class="stage-report-head"><tr><td class="brand"><b>RAMOS</b><small>QUALITY MANAGEMENT SYSTEM</small></td><td><h1>${stage}. ${stageMeta[0]}</h1><p>${stageMeta[1]}</p></td><td><b>Report No.</b><span>${c.id}</span><b>Status</b><span>${c.status}</span></td></tr></table>
    <table class="stage-report-summary"><tr><th>Customer</th><td>${c.customer}</td><th>Product / P.N</th><td>${c.product}<br>${c.partNumber}</td></tr><tr><th>LOT</th><td>${c.lotNumber}</td><th>Failure</th><td>${c.defectQty}/${Number(c.inspectQty||0).toLocaleString()}ea · ${c.ppm} PPM</td></tr><tr><th>Symptom</th><td colspan="3">${c.claimTitle}</td></tr></table>
    ${renderStageReportSection(c,stage)}
    <footer class="stage-report-foot"><span>Evidence 기반 자동 편집 초안 · AI 판단은 품질 담당자의 승인을 대체하지 않습니다.</span><span>${stage} / ${new Date().toISOString().slice(0,10)}</span></footer>
  </article>${stage==='D4'&&typeof renderD4EvidenceAppendix==='function'?renderD4EvidenceAppendix(c):''}`;
}

function escapeReportData(value) {
  if (typeof value === 'string') return escapeWorkspaceValue(value);
  if (Array.isArray(value)) return value.map(escapeReportData);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v]) => [k,escapeReportData(v)]));
  return value;
}

function renderStageReportSection(c,stage) {
  if(['D5','D6','D7','D8'].includes(stage))return renderLateStageReport(c,stage);
  c = escapeReportData(c);
  if(stage==='D1') return `<section class="stage-report-section"><h3>D1 · CFT Assignment & RACI</h3><table><thead><tr><th>Role</th><th>Name</th><th>Department</th><th>Status</th></tr></thead><tbody>${reportRows(c.team,4,m=>`<tr><td>${m.role}</td><td><b>${m.name}</b></td><td>${m.dept}</td><td>${m.status}</td></tr>`)}</tbody></table><div class="stage-report-callout">RACI 확인: ${c.cftRaci?.acknowledged?'완료':'대기'} · AI 추천 사람 확정: ${c.cftRecommendation?.humanConfirmed?'완료':'대기'}</div></section>`;
  if(stage==='D2') return `<section class="stage-report-section"><h3>D2 · Verified Problem Statement</h3><p class="stage-report-statement">${reportEmpty(c.d2?.problemStatement,c.d2?.problemWhat)}</p><table><thead><tr><th>5W2H</th><th>Verified Fact</th></tr></thead><tbody>${[['What',c.d2?.problemWhat],['Where',c.d2?.problemWhere],['When',c.d2?.problemWhen],['Who',c.d2?.problemWho],['Which',c.d2?.problemWhich],['How',c.d2?.problemHow],['How Many',c.d2?.problemHowMany]].map(r=>`<tr><th>${r[0]}</th><td>${reportEmpty(r[1])}</td></tr>`).join('')}</tbody></table><h4>IS / IS NOT Boundary</h4><table><thead><tr><th>Factor</th><th>IS</th><th>IS NOT</th><th>Difference</th></tr></thead><tbody>${reportRows(c.d2?.isIsNot,4,r=>`<tr><td>${r.factor}</td><td>${r.is}</td><td>${r.isNot}</td><td>${reportEmpty(r.difference)}</td></tr>`)}</tbody></table></section>`;
  if(stage==='D3'){const erp=c.d3?.inventorySources?.erp||{};const mes=c.d3?.inventorySources?.mes?.processStocks||[];return `<section class="stage-report-section"><h3>D3 · Containment Scope & Inventory</h3><table><thead><tr><th>Source</th><th>LOT</th><th>Current</th><th>Hold</th><th>Evidence</th></tr></thead><tbody>${['RAK4','RAK5'].map(code=>`<tr><td>ERP ${code}</td><td>${reportEmpty(erp[code]?.lot)}</td><td>${Number(erp[code]?.currentQty||0).toLocaleString()}</td><td>${Number(erp[code]?.holdQty||0).toLocaleString()}</td><td>${reportEmpty(erp[code]?.evidence)}</td></tr>`).join('')}${reportRows(mes,5,r=>`<tr><td>${r.process}</td><td>${r.lot}</td><td>${Number(r.currentQty||0).toLocaleString()}</td><td>${Number(r.holdQty||0).toLocaleString()}</td><td>${r.evidence}</td></tr>`)}</tbody></table><h4>Interim Actions</h4><table><thead><tr><th>ID</th><th>Target</th><th>Action</th><th>Owner</th><th>Result</th></tr></thead><tbody>${reportRows(c.d3?.actions,5,r=>`<tr><td>${r.id}</td><td>${r.target}</td><td>${r.action}</td><td>${r.owner}</td><td>${r.result}</td></tr>`)}</tbody></table><div class="stage-report-callout">Effectiveness: ${reportEmpty(c.d3?.effectivenessStatement)}</div></section>`;}
  if(stage==='D4') return typeof renderD4ReportSection === 'function' ? renderD4ReportSection(c) : `<section class="stage-report-section"><h3>D4 · Root Cause Proof</h3></section>`;
  if(stage==='D5') return `<section class="stage-report-section"><h3>D5 · Permanent Corrective Action Selection</h3><table><thead><tr><th>Candidate</th><th>Root Cause Elimination</th><th>Feasibility</th><th>Risk</th><th>Decision</th></tr></thead><tbody>${reportRows(c.d5?.candidates,5,r=>`<tr><td><b>${r.title}</b><br><small>${r.rationale||''}</small></td><td>${r.rootCauseElimination}</td><td>${r.feasibility}</td><td>${r.riskLevel}</td><td>${r.selected?'SELECTED':'NOT SELECTED'}</td></tr>`)}</tbody></table></section>`;
  if(stage==='D6') return `<section class="stage-report-section"><h3>D6 · Implementation & Validation</h3><div class="stage-report-callout">Before: ${reportEmpty(c.d6?.beforeAfter?.beforeMetric)} → After: ${reportEmpty(c.d6?.beforeAfter?.afterMetric)}</div><table><thead><tr><th>Validation Test</th><th>Condition</th><th>Sample</th><th>Fail</th><th>Result</th></tr></thead><tbody>${reportRows(c.d6?.validationTests,5,r=>`<tr><td>${r.testName}</td><td>${r.condition}</td><td>${r.sampleSize}</td><td>${r.failQty}</td><td>${r.result}</td></tr>`)}</tbody></table></section>`;
  if(stage==='D7') return `<section class="stage-report-section"><h3>D7 · System Prevention & Horizontal Deployment</h3><h4>System Documents</h4><table><thead><tr><th>Document</th><th>Revision</th><th>Change</th><th>Owner</th></tr></thead><tbody>${reportRows(c.d7?.systemUpdates,4,r=>`<tr><td>${r.docName}<br><small>${r.docNo}</small></td><td>${r.rev}</td><td>${r.changeContent}</td><td>${r.owner}</td></tr>`)}</tbody></table><h4>Horizontal Deployment</h4><table><thead><tr><th>Product</th><th>Same Risk</th><th>Action</th><th>Status</th></tr></thead><tbody>${reportRows(c.d7?.horizontalDeployment,4,r=>`<tr><td>${r.product}</td><td>${r.sameRisk}</td><td>${r.action}</td><td>${r.status}</td></tr>`)}</tbody></table></section>`;
  return `<section class="stage-report-section"><h3>D8 · Closure Checklist & Approval</h3><table><thead><tr><th>Category</th><th>Closure Requirement</th><th>Result</th></tr></thead><tbody>${reportRows(c.d8?.checklist,3,r=>`<tr><td>${r.cat}</td><td>${r.item}</td><td>${r.checked?'PASS':'OPEN'}</td></tr>`)}</tbody></table><h4>Approval Flow</h4><table><thead><tr><th>Step</th><th>Approver</th><th>Date</th><th>Status</th></tr></thead><tbody>${reportRows(c.d8?.approvalFlow,4,r=>`<tr><td>${r.step}</td><td>${r.approver}</td><td>${r.date}</td><td>${r.status}</td></tr>`)}</tbody></table><div class="stage-report-callout">Team Recognition · ${reportEmpty(c.d8?.teamAppreciation)}</div></section>`;
}
