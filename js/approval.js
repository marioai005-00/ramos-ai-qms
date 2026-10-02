/* Shared approval consistency; browser-local identity, not server authentication. */
const QUALITY_STAGES = ['D1','D2','D3','D4','D5','D6','D7','D8'];
const REPORT_GATE_STAGES = {gate3D:3, gate5D:5, gate8D:8};
function approvalClone(value) { return JSON.parse(JSON.stringify(value)); }
function approvalContent(c, stage) {
  const {signOffHistory, gates, approvalAudit, ...businessData} = c;
  const copy = approvalClone(businessData);
  ensureLateStages(copy);
  ensureD2Structure(copy); ensureD3Structure(copy); ensureD4Structure(copy);
  copy.d5 = {candidates:[], ...copy.d5, pcnEcn:{ecnNumber:'',pcnRequired:null,customerApprovalStatus:'미확인',...copy.d5?.pcnEcn}};
  copy.d6 = {validationTests:[], ...copy.d6, implementationDetails:copy.d6?.implementationDetails||{}, beforeAfter:copy.d6?.beforeAfter||{}};
  const header = Object.fromEntries(['id','customer','customerContact','customerEmail','product','partNumber','internalPartNumber','lotNumber','incidentSite','incidentDate','defectQty','inspectQty','ppm','claimTitle','lineStop','safetyRisk','recurrentDefect'].map(k=>[k,copy[k]??null]));
  const ignored = new Set(['approval','aiDraft','isIsNotDraft','recommendations','savedAt','generatedAt']);
  function clean(value) {
    if(Array.isArray(value)) return value.map(clean);
    if(value && typeof value==='object') return Object.fromEntries(Object.keys(value).sort().filter(k=>!ignored.has(k)).map(k=>[k,clean(value[k])]));
    return value;
  }
  return JSON.stringify(clean({header, data:stage==='D1'?copy.team:copy[stage.toLowerCase()], evidence:(copy.evidenceList||[]).filter(item=>!item.stageScoped||(item.linkedStages||[]).includes(stage))}));
}
function approvalSnapshot(c, endStage) {
  return QUALITY_STAGES.slice(0,QUALITY_STAGES.indexOf(endStage)+1).map(stage=>approvalContent(c,stage));
}
function hasCurrentStageApproval(c, stage) {
  const sign=c.signOffHistory?.[stage];
  // A signed stage counts only when its champion approval carries the central server event.
  if(sign?.snapshot) return sign.status==='Approved' && Number.isInteger(sign.champion?.serverEventId) && (stage==='D1' ? c.cftRecommendation?.humanConfirmed===true&&c.cftRaci?.acknowledged===true : c[stage.toLowerCase()]?.approval?.status==='Approved'&&c[stage.toLowerCase()]?.approval?.humanConfirmed===true) && JSON.stringify(sign.snapshot)===JSON.stringify(approvalSnapshot(c,stage));
  if(c.approvalReviewFrom && QUALITY_STAGES.indexOf(stage)>=QUALITY_STAGES.indexOf(c.approvalReviewFrom)) return false;
  // Retain explicitly stored legacy approval for navigation until its content changes.
  if(stage==='D1') return isCFTAssignmentComplete(c)&&c.cftRecommendation?.humanConfirmed===true&&c.cftRaci?.acknowledged===true&&sign?.status==='Approved';
  return c[stage.toLowerCase()]?.approval?.status==='Approved'&&c[stage.toLowerCase()]?.approval?.humanConfirmed===true;
}
function invalidateApprovalFrom(c, stage, reason) {
  const index=QUALITY_STAGES.indexOf(stage); if(index<0)return;
  const affected=QUALITY_STAGES.slice(index);
  c.approvalAudit=c.approvalAudit||[];
  c.approvalAudit.push({at:new Date().toISOString(),by:CURRENT_USER?.email||'',reason,fromStage:stage,
    signOffHistory:approvalClone(c.signOffHistory||{}),gates:approvalClone(c.gates||{}),
    stageApprovals:Object.fromEntries(affected.map(s=>[s,approvalClone(c[s.toLowerCase()]?.approval||{})]))});
  c.approvalReviewFrom=QUALITY_STAGES[Math.min(index,c.approvalReviewFrom?QUALITY_STAGES.indexOf(c.approvalReviewFrom):index)];
  affected.forEach(s=>{
    if(c.signOffHistory?.[s]) c.signOffHistory[s]={status:'Draft',drafter:null,leader:null,champion:null};
    if(c[s.toLowerCase()])c[s.toLowerCase()].approval={status:'Draft',humanConfirmed:false};
  });
  if(stage==='D1') {
    c.cftRecommendation={...c.cftRecommendation,humanConfirmed:false};
    c.cftRaci={...c.cftRaci,acknowledged:false};
  }
  Object.entries(REPORT_GATE_STAGES).forEach(([key,last])=>{
    const gate=c.gates?.[key];if(!gate||last<=index)return;
    Object.assign(gate,{status:'Pending',internalApproved:false,dispatchedByQuality:false,dispatchDate:'',approvalDate:''});
    delete gate.snapshot;delete gate.dispatchEvidence;
    gate.approvers=(gate.approvers||[]).map(a=>({role:a.role,name:a.name,email:a.email,status:'Pending',date:'',comment:''}));
  });
  c.currentStage=c.approvalReviewFrom;
  if(c.status==='Closed')c.status='In Progress';
}
function reconcileApprovalChanges(c, previous) {
  if(!previous)return;
  const first=QUALITY_STAGES.find(s=>approvalContent(c,s)!==approvalContent(previous,s) || (previous[s.toLowerCase()]?.approval?.status==='Approved' && c[s.toLowerCase()]?.approval?.status!=='Approved') || (s==='D1'&&previous.signOffHistory?.D1?.status==='Approved'&&(!c.cftRecommendation?.humanConfirmed||!c.cftRaci?.acknowledged)));
  if(!first)return;
  const affected=QUALITY_STAGES.slice(QUALITY_STAGES.indexOf(first));
  const hasDecisions=affected.some(s=>c.signOffHistory?.[s]?.drafter||previous.signOffHistory?.[s]?.drafter||c[s.toLowerCase()]?.approval?.status==='Approved'||previous[s.toLowerCase()]?.approval?.status==='Approved')
    ||Object.values(c.gates||{}).some(g=>g.approvers?.some(a=>a.status==='Approved'));
  if(hasDecisions)invalidateApprovalFrom(c,first,`${first} 내용 변경 — 재검토 필요`);
}
function stageApprover(c, role) {
  const patterns={drafter:/Facilitator|실무/i,leader:/Leader/i,champion:/Champion/i};
  const member=c.team?.find(m=>patterns[role]?.test(m.role));
  const email=member?.contact||member?.email;
  return ALL_USER_ACCOUNTS.find(a=>a.email.toLowerCase()===String(email||'').toLowerCase())||null;
}
function stageReviewError(c, stage) {
  const index=QUALITY_STAGES.indexOf(stage);if(index<0)return '알 수 없는 단계입니다.';
  const missing=QUALITY_STAGES.slice(0,index).find(s=>!hasCurrentStageApproval(c,s));
  if(missing)return `${missing} 최종 승인 후 진행해 주세요.`;
  if(stage==='D1')return !isCFTAssignmentComplete(c)||!c.cftRaci?.acknowledged||!c.cftRecommendation?.humanConfirmed?'CFT와 RACI를 먼저 확인해 주세요.':'';
  const data=c[stage.toLowerCase()];
  if(!data?.approval?.humanConfirmed)return `${stage} 작성 화면에서 필수 항목과 사람 확인을 완료해 주세요.`;
  if(stage==='D2' && (['problemWhat','problemWhere','problemWhen','problemWho','problemWhich','problemHow','problemHowMany','problemStatement'].some(k=>!data[k])||!data.isIsNot?.length||data.isIsNot.some(r=>!r.factor||!r.is||!r.isNot||!r.difference||r.verificationStatus!=='Verified')||!d2EligibleEvidence(c).length))return 'D2 필수 사실·비교행·Evidence를 확인해 주세요.';
  if(stage==='D3') {
    const sources=data.inventorySources||{}, scope=data.lotScope||{};
    const quantities=row=>['totalQty','holdQty','screenQty','ngQty'].some(k=>!Number.isInteger(row[k])||row[k]<0)||row.holdQty>row.totalQty||row.screenQty>row.totalQty||row.ngQty>row.screenQty;
    if(['RAK4','RAK5'].some(code=>{const r=sources.erp?.[code];return !r?.verified||!r.evidence||!Number.isFinite(r.currentQty)||r.currentQty<0||!Number.isFinite(r.holdQty)||r.holdQty<0||r.holdQty>r.currentQty;})||!sources.mes?.verified||!sources.mes.processStocks?.length||sources.mes.processStocks.some(r=>!r.process||!r.evidence||r.status==='미확인'||!Number.isFinite(r.currentQty)||r.currentQty<0||!Number.isFinite(r.holdQty)||r.holdQty<0||r.holdQty>r.currentQty))return 'ERP·MES 재고 수량과 원본 확인이 필요합니다.';
    if(['affectedLot','adjacentLots','rawMaterialBatch','equipment','rationale'].some(k=>!scope[k])||data.materialFlow?.length!==7||data.materialFlow.some(r=>!r.area||!r.lot||!r.evidence||r.status==='미확인'||quantities(r)))return '7-Area 수량과 영향 범위를 확인해 주세요.';
    if(!data.actions?.length||data.actions.some(a=>!a.target||!a.action||!a.owner||!a.due||a.status!=='Completed'||!a.result)||['noAdditionalClaim','lineStable','stockReconciled'].some(k=>data.effectiveness?.[k]!=='yes')||!data.effectiveness?.verificationEvidence||!data.effectivenessStatement)return 'D3 봉쇄조치와 효과성 확인을 완료해 주세요.';
  }
  if(stage==='D4' && (D4_CORE_TOOL_IDS.some(id=>!data.selectedTools?.some(t=>t.id===id))||data.selectedTools.some(t=>!t.hypothesis||!t.evidence||!t.finding||!t.owner||['Planned','Testing'].includes(t.status)||!t.verified||!t.artifact?.humanConfirmed||(!t.artifact.rows?.length&&!t.artifact.attachments?.length))||['Occurrence','Escape','System'].some(type=>{const r=data.rootCauses?.[type];return !r?.statement||!r.evidence||!r.validationMethod||r.status!=='Confirmed'||['reproduced','removed','boundary','evidence'].some(k=>!r.checks?.[k]);})))return 'D4 원인과 Evidence의 실증 확인을 완료해 주세요.';
  if(['D5','D6','D7','D8'].includes(stage))return lateStageReviewError(c,stage);
  return '';
}
function reportReviewError(c, key) {
  const last=REPORT_GATE_STAGES[key];if(!last)return '알 수 없는 Report Gate입니다.';
  const missing=QUALITY_STAGES.slice(0,last).find(s=>!hasCurrentStageApproval(c,s));
  return missing?`${missing} 단계 최종 승인 후 보고서 결재를 진행해 주세요.`:'';
}
function reportApprover(approver) {
  if(approver?.email)return ALL_USER_ACCOUNTS.find(a=>a.email.toLowerCase()===approver.email.toLowerCase());
  // Legacy display names include titles. Match exactly one known personal name.
  const matches=ALL_USER_ACCOUNTS.filter(a=>String(approver?.name||'').split(/\s/)[0]===a.name);
  return matches.length===1?matches[0]:null;
}

function openApprovalHistory(stage) {
  const c=getActiveCase();if(!c)return;
  const entries=(c.approvalAudit||[]).filter(entry=>entry.signOffHistory?.[stage]);
  closeStageReviewModal();
  const modal=document.getElementById('globalModal'), container=document.getElementById('modalContainer');
  if(!modal||!container)return;
  container.innerHTML=`<h3>${escapeWorkspaceValue(stage)} 이전 결재 이력</h3><p>현재 승인과 구분하여 보존한 기록입니다.</p>${entries.length?entries.map(entry=>{
    const sign=entry.signOffHistory[stage];
    return `<section class="card"><p>${escapeWorkspaceValue(entry.at)} · ${escapeWorkspaceValue(entry.reason)}</p><p>${['drafter','leader','champion'].map(role=>`${role}: ${escapeWorkspaceValue(sign[role]?.name||'미서명')} (${escapeWorkspaceValue(sign[role]?.signedAt||'')})`).join('<br>')}</p><details><summary>기안 당시 내용 확인</summary><pre style="white-space:pre-wrap;overflow-wrap:anywhere;">${escapeWorkspaceValue(sign.snapshot?JSON.stringify(sign.snapshot.map(value=>JSON.parse(value)),null,2):'구형 결재 기록에는 내용 스냅샷이 없습니다.')}</pre></details></section>`;
  }).join(''):'<p>보존된 이전 결재 이력이 없습니다.</p>'}<button class="btn btn-secondary" onclick="closeModal();openStageReviewModal('${stage}')">현재 검토서로 돌아가기</button>`;
  modal.style.display='flex';
}
