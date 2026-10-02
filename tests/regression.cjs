// Offline regression checks: no real browser storage, customer files or AI requests.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const files = ['js/data.js','js/org_tree.js','js/ai_engine.js','js/views/dashboard.js','js/views/intake.js','js/views/workspace.js','js/views/evidence.js','js/views/actions.js','js/views/reports.js','js/views/d4_evidence.js','js/views/stage_preview.js','js/intake_documents.js','js/late_stages.js','js/approval.js','js/app.js'];
function sandbox() {
  const storage = new Map(), session = new Map(), elements = new Map(), alerts = [];
  const context = {console:{...console,error(){}}, alerts, elements,
    localStorage: {getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
    sessionStorage: {getItem:k=>session.get(k)||null,setItem:(k,v)=>session.set(k,v),removeItem:k=>session.delete(k)},
    document: {readyState:'loading',addEventListener(){},getElementById:id=>elements.get(id)||null,querySelector:()=>null,querySelectorAll:()=>[]},
    window: {addEventListener(){}}, alert:message=>alerts.push(message), confirm:()=>true, setTimeout(){},
  };
  vm.createContext(context);
  for (const file of files) new vm.Script(fs.readFileSync(path.join(root,file),'utf8'),{filename:file}).runInContext(context);
  return {context,storage,session,elements,alerts,run:code=>vm.runInContext(code,context)};
}
function freshCase(s) {
  return s.run(`appData.cases=[]; createCaseFromApprovedIntake({intakeId:'TEST-INTAKE',customer:'Test customer',product:'Test product',partNumber:'TEST-PART',lotNumber:'TEST-LOT',claimTitle:'Connector open',defectQty:0,inspectQty:100,ppm:0,triage:{finalSeverity:'Minor',slaHours:24},evidenceList:[]}); getActiveCase();`);
}
let count = 0;
function test(name, fn) { fn(); count++; console.log('PASS '+name); }
test('Customer data, intake and approval records survive reload',()=>{
  const s=sandbox();
  for(const customer of ['Samsung','hynix','삼성','하이닉스','Automotive','전장','LGE']) {
    s.context.customer=customer;
    s.run(`localStorage.setItem(STORAGE_KEY,JSON.stringify({cases:[{id:'keep',customer,gates:{gate3D:{approvers:[{role:'고객사 공식 송부',status:'Pending'}]}}}],intakeQueue:[{intakeId:'keep-intake'}],activeCaseId:'keep'}))`);
    const r=s.run('loadStoredAppData()');
    assert.equal(r.cases[0].customer,customer); assert.equal(r.intakeQueue.length,1); assert.equal(r.cases[0].gates.gate3D.approvers.length,1);
  }
});
test('New and existing cases render all eight stage bodies',()=>{
  const s=sandbox();
  for(const stage of ['D1','D2','D3','D4','D5','D6','D7','D8']) assert.ok(s.run(`renderStageContent(getActiveCase(),'${stage}')`).length);
  freshCase(s);
  for(const stage of ['D1','D2','D3','D4','D5','D6','D7','D8']) assert.ok(s.run(`renderStageContent(getActiveCase(),'${stage}')`).length);
});
test('Next-stage action uses existing gated navigation',()=>{
  const s=sandbox();s.run(`switchStage = stage => { window.reachedStage=stage; }; proceedToNextStage('D5');`);
  assert.equal(s.context.window.reachedStage,'D5');
});
test('Notification modal uses the existing modal container',()=>{
  const s=sandbox();for(const id of ['globalModal','modalContainer','modalTitle','modalBody'])s.elements.set(id,{style:{},innerHTML:''});
  s.run('openNotificationModal()');assert.equal(s.elements.get('globalModal').style.display,'flex');
  assert.ok(s.elements.get('modalContainer').innerHTML.includes('modalTitle'));
  s.run('closeModal()');assert.equal(s.elements.get('globalModal').style.display,'none');
});
test('Blank final report has no invented measurements, actions, PASS or dispatch',()=>{
  const s=sandbox();freshCase(s);
  const html=s.run(`currentGateKey='gate8D'; renderReportsHubView(getActiveCase())`);
  for(const token of ['0.8Ω','ECN-260901','0 Fail (PASS)','ZERO DEFECT CLOSED','HTOL 가속','RPN 180']) assert.ok(!html.includes(token),token);
  assert.ok(html.includes('D8.'));assert.ok(html.includes('DRAFT'));
  const gate=s.run('getActiveCase().gates.gate3D');assert.equal(gate.dispatchedByQuality,false);assert.equal(gate.dispatchDate,'');
  assert.ok(gate.approvers.every(a=>a.status==='Pending'&&!a.date&&!a.comment));
});
test('Report reflects edited root causes, PCA and validation instead of benchmark',()=>{
  const s=sandbox();freshCase(s);
  s.run(`const c=getActiveCase(); ensureD4Structure(c); c.d4.rootCauses.Occurrence.statement='CURRENT ROOT';c.d4.candidateCauses=[{title:'STALE ROOT'}];c.d5.candidates=[{title:'CURRENT PCA',selected:true}];c.d6.validationTests=[{testName:'CURRENT TEST',sampleSize:42,failQty:2,result:'FAIL'}];`);
  const html=s.run(`currentGateKey='gate8D'; renderReportsHubView(getActiveCase())`);
  assert.ok(html.includes('CURRENT ROOT'));assert.ok(!html.includes('STALE ROOT'));assert.ok(html.includes('CURRENT PCA'));assert.ok(html.includes('CURRENT TEST'));assert.ok(html.includes('FAIL'));
});
test('Report escapes user-entered markup',()=>{
  const s=sandbox();freshCase(s);s.run(`getActiveCase().d2.problemStatement='<img src=x onerror=alert(1)>'`);
  const html=s.run(`renderStageReportSection(getActiveCase(),'D2')`);assert.ok(!html.includes('<img'));assert.ok(html.includes('&lt;img'));
});
test('Quality audit panel never reports hard-coded PASS or readiness',()=>{
  const s=sandbox();freshCase(s);s.elements.set('globalModal',{style:{}});s.elements.set('modalContainer',{innerHTML:''});s.context.lucide={createIcons(){}};
  s.run('openAIAssistantModal()');const html=s.elements.get('modalContainer').innerHTML;
  assert.ok(html.includes('보완 필요'));assert.ok(html.includes('미승인 단계'));assert.ok(!html.includes('통과 (100%)'));assert.ok(!html.includes('즉시 제출 가능'));assert.ok(!html.includes('12ea'));
});
test('Existing gate history is not replaced by viewing reports',()=>{
  const s=sandbox();freshCase(s);s.run(`getActiveCase().gates={gate3D:{status:'Pending',approvers:[{role:'고객사 공식 송부',name:'Original',status:'Pending'}]}}`);
  const before=s.run('JSON.stringify(getActiveCase().gates.gate3D)');s.run('ensureCaseGates(getActiveCase())');assert.equal(s.run('JSON.stringify(getActiveCase().gates.gate3D)'),before);
});
test('Storage failures interrupt success flow and preserve corrupted source',()=>{
  const s=sandbox();s.run(`localStorage.setItem(STORAGE_KEY,'{broken');appData=loadStoredAppData()`);
  assert.throws(()=>s.run('saveAppData()'));assert.equal(s.run('localStorage.getItem(STORAGE_KEY)'),'{broken');
  const t=sandbox();t.context.localStorage.setItem=()=>{throw new Error('Quota exceeded')};assert.throws(()=>t.run('saveAppData()'));assert.ok(t.alerts.length);
});
function approvalFixture() {
  const s=sandbox();
  s.run(`renderCurrentView=()=>{};openStageReviewModal=()=>{};closeStageReviewModal=()=>{};
    const c=getActiveCase();c.d2={problemWhat:'fact',problemWhere:'site',problemWhen:'date',problemWho:'inspector',problemWhich:'lot',problemHow:'condition',problemHowMany:'1/100',problemStatement:'ORIGINAL',isIsNot:[{factor:'lot',is:'A',isNot:'B',difference:'date',verificationStatus:'Verified'}],approval:{humanConfirmed:true,status:'Draft'}};c.signOffHistory.D2={status:'Draft',drafter:null,leader:null,champion:null};localStorage.setItem(STORAGE_KEY,JSON.stringify(appData));`);
  return s;
}
function signAs(s,role){s.run(`CURRENT_USER=stageApprover(getActiveCase(),'${role}');executeStageSignOff('D2','${role}');`);}
test('Unauthorized identity and out-of-order stage approval rejected',()=>{
  const s=approvalFixture();s.run(`CURRENT_USER=stageApprover(getActiveCase(),'drafter');executeStageSignOff('D2','champion')`);
  assert.equal(s.run('getActiveCase().signOffHistory.D2.status'),'Draft');
  signAs(s,'champion');assert.equal(s.run('getActiveCase().signOffHistory.D2.status'),'Draft');
  assert.ok(s.alerts.length>=2);
});
test('Assigned drafter -> Leader -> Champion signs the same snapshot',()=>{
  const s=approvalFixture();assert.equal(s.run(`stageReviewError(getActiveCase(),'D2')`),'');
  signAs(s,'drafter');assert.equal(s.run('getActiveCase().signOffHistory.D2.status'),'Submitted');
  const snap=s.run('JSON.stringify(getActiveCase().signOffHistory.D2.snapshot)');
  signAs(s,'leader');assert.equal(s.run('getActiveCase().signOffHistory.D2.status'),'LeaderApproved');
  signAs(s,'champion');assert.equal(s.run('getActiveCase().signOffHistory.D2.status'),'Approved');
  assert.equal(s.run('JSON.stringify(getActiveCase().signOffHistory.D2.snapshot)'),snap);
  assert.equal(s.run(`hasCurrentStageApproval(getActiveCase(),'D2')`),true);
});
test('Changing signed facts archives signatures and invalidates downstream decisions',()=>{
  const s=approvalFixture();for(const r of ['drafter','leader','champion'])signAs(s,r);
  s.run(`getActiveCase().d2.problemStatement='REVISED';saveAppData()`);
  assert.equal(s.run('getActiveCase().signOffHistory.D2.status'),'Draft');
  assert.equal(s.run(`hasCurrentStageApproval(getActiveCase(),'D3')`),false);
  assert.equal(s.run(`getActiveCase().approvalAudit.at(-1).signOffHistory.D2.status`),'Approved');
  assert.ok(s.run(`JSON.stringify(getActiveCase().approvalAudit.at(-1).signOffHistory.D2.snapshot).includes('ORIGINAL')`));
  assert.equal(s.run(`canEnterQualityStage(getActiveCase(),'D3').allowed`),false);
});
test('Navigation/rendering do not invalidate an unchanged signed case',()=>{
  const s=approvalFixture();for(const r of ['drafter','leader','champion'])signAs(s,r);
  s.run(`for(const stage of QUALITY_STAGES)renderStageContent(getActiveCase(),stage);appData.currentView='dashboard';saveAppData()`);
  assert.equal(s.run('getActiveCase().signOffHistory.D2.status'),'Approved');
});
test('Report signoff and dispatch reject incomplete stages',()=>{
  const s=sandbox();freshCase(s);s.context.prompt=()=>{throw new Error('Should not prompt before gate validation')};
  s.run(`promptSignoffApproval('gate3D');dispatchReportToCustomer('gate8D')`);
  assert.equal(s.alerts.length,2);
});
test('Report reviewers and dispatcher must match assigned accounts',()=>{
  const s=approvalFixture();for(const r of ['drafter','leader','champion'])signAs(s,r);
  s.run(`delete getActiveCase().gates;ensureCaseGates(getActiveCase());saveAppData()`);s.context.prompt=()=> 'Synthetic external record';
  s.run(`CURRENT_USER=stageApprover(getActiveCase(),'drafter');promptSignoffApproval('gate3D')`);
  assert.equal(s.run('getActiveCase().gates.gate3D.approvers[0].status'),'Pending');
  for(let i=0;i<3;i++){s.run(`CURRENT_USER=reportApprover(getActiveCase().gates.gate3D.approvers[${i}]);promptSignoffApproval('gate3D')`);assert.equal(s.run(`getActiveCase().gates.gate3D.approvers[${i}].status`),'Approved');}
  s.run(`dispatchReportToCustomer('gate3D')`);assert.equal(s.run('getActiveCase().gates.gate3D.dispatchedByQuality'),false);
  s.run(`CURRENT_USER=reportApprover(getActiveCase().gates.gate3D.approvers[3]);dispatchReportToCustomer('gate3D')`);assert.equal(s.run('getActiveCase().gates.gate3D.dispatchedByQuality'),true);
});
test('Revoking approval without editing content resets the old signatures',()=>{
  const s=approvalFixture();for(const r of ['drafter','leader','champion'])signAs(s,r);
  s.run(`getActiveCase().d2.approval={status:'Draft',humanConfirmed:false};saveAppData()`);
  assert.equal(s.run('getActiveCase().signOffHistory.D2.status'),'Draft');
});
test('Submitted stages notify only the currently assigned reviewer',()=>{
  const s=approvalFixture();signAs(s,'drafter');
  const leader=s.run(`getUserPendingTasks(stageApprover(getActiveCase(),'leader')).filter(t=>t.targetStage==='D2'&&t.isApproval)`);
  const champion=s.run(`getUserPendingTasks(stageApprover(getActiveCase(),'champion')).filter(t=>t.targetStage==='D2'&&t.isApproval)`);
  assert.equal(leader.length,1);assert.equal(champion.length,0);
});
test('New intake starts blank and same-origin tab conflicts cannot overwrite newer data',()=>{
  const s=sandbox();
  const html=s.run('renderNewCaseView()');
  for(const value of ['value="LGE (LG전자)"','value="최영수 책임 (DTV 품질)"','value="MMACGD8J0F-HZRAF1-LPAGA00"','value="12"','value="10000"']) assert.ok(!html.includes(value),value);
  assert.ok(html.includes('<option value="false" selected>No (정상 가동)</option>'));
  s.run('saveAppData()');
  s.run(`const newer=JSON.parse(localStorage.getItem(STORAGE_KEY));newer._storageRevision+=1;newer._storageWriter='other-tab';localStorage.setItem(STORAGE_KEY,JSON.stringify(newer));`);
  assert.throws(()=>s.run('saveAppData()'),/다른 탭/);
});
test('D5-D8 traceability gates and dynamic Action Hub use actual case data',()=>{
  const s=sandbox();freshCase(s);
  s.run(`const c=getActiveCase();ensureD4Structure(c);ensureLateStages(c);
    c.d4.rootCauses={Occurrence:{status:'Confirmed'},Escape:{status:'Confirmed'},System:{status:'Confirmed'}};
    c.d5.pcnEcn={ecnNumber:'ECN-SYN',pcnRequired:false,customerApprovalStatus:'Not Required',evidence:'Synthetic review'};
    c.d5.candidates=['Occurrence','Escape','System'].map((causeType,i)=>({id:'PCA-'+(i+1),causeType,title:'Synthetic '+causeType,rationale:'Removes '+causeType,rootCauseElimination:'High',feasibility:'Feasible',costImpact:'Reviewed',riskLevel:'Controlled',owner:'Owner '+i,due:'2026-10-01',verificationPlan:'Synthetic test '+i,evidence:'EVD-SYN-'+i,selected:true}));`);
  assert.equal(s.run(`lateStageReviewError(getActiveCase(),'D5')`),'');
  s.run(`{const c=getActiveCase();c.d6.implementationDetails={bomRevision:'SYN-REV',appliedLot:'SYN-LOT',startDate:'2026-10-02',productionSite:'Synthetic site',evidence:'EVD-IMPL'};c.d6.beforeAfter={beforeMetric:'Before observed',afterMetric:'After observed',evidence:'EVD-COMP'};c.d6.containmentRelease={decision:'Released',rationale:'Criteria met',evidence:'EVD-REL'};c.d6.validationTests=c.d5.candidates.map((a,i)=>({id:'VAL-'+i,actionId:a.id,testName:'Synthetic validation '+i,condition:'Controlled condition',acceptanceCriteria:'0 failure required',sampleSize:10,failQty:0,result:'PASS',owner:'Validator',completedAt:'2026-10-03',evidence:'EVD-VAL-'+i}));}`);
  assert.equal(s.run(`lateStageReviewError(getActiveCase(),'D6')`),'');
  s.run(`{const c=getActiveCase();c.d7.systemUpdates=[{id:'SYS-1',actionId:'PCA-3',docName:'Synthetic procedure',docNo:'DOC-SYN',rev:'B',changeContent:'Added prevention gate',owner:'System owner',due:'2026-10-04',status:'Completed',evidence:'EVD-SYS'}];c.d7.horizontalDeployment=[{id:'HOR-1',actionId:'PCA-1',product:'Synthetic family',sameRisk:'Reviewed',action:'Applied same control',owner:'Deploy owner',status:'Completed',evidence:'EVD-HOR'}];}`);
  assert.equal(s.run(`lateStageReviewError(getActiveCase(),'D7')`),'');
  s.run(`{const c=getActiveCase();c.d8.checklist.forEach((r,i)=>{r.checked=true;r.evidence='EVD-CLOSE-'+i});c.d8.closure={remainingRisk:'Residual risk reviewed',customerAcceptance:'Synthetic closure condition met',evidence:'EVD-CUSTOMER'};c.d8.teamAppreciation='Synthetic recognition';}`);
  assert.equal(s.run(`lateStageReviewError(getActiveCase(),'D8')`),'');
  const actions=s.run('renderActionsHubView(getActiveCase())');assert.ok(actions.includes('D5 Corrective'));assert.ok(actions.includes('D6 Validation'));assert.ok(actions.includes('D7 System'));assert.ok(!actions.includes('ACT-PCA-01'));
  const report=s.run(`getActiveCase().d8.teamAppreciation='<img src=x>';renderLateStageReport(getActiveCase(),'D8')`);assert.ok(!report.includes('<img'));assert.ok(report.includes('&lt;img'));
});
test('D8 closes only after sequential approval and reopens when approved content changes',()=>{
  const s=sandbox();freshCase(s);
  s.run(`renderCurrentView=()=>{};openStageReviewModal=()=>{};closeStageReviewModal=()=>{};hasCurrentStageApproval=(c,stage)=>stage!=='D8';
    const c=getActiveCase();ensureLateStages(c);const accounts=ALL_USER_ACCOUNTS.slice(0,3);c.team=[{role:'8D Facilitator',contact:accounts[0].email},{role:'CFT Leader',contact:accounts[1].email},{role:'Executive Champion',contact:accounts[2].email}];
    c.d8.checklist.forEach((r,i)=>{r.checked=true;r.evidence='EVD-'+i});c.d8.closure={remainingRisk:'Reviewed',customerAcceptance:'Accepted',evidence:'EVD-CLOSE'};c.d8.approval={status:'Draft',humanConfirmed:true};(c.signOffHistory ||= {}).D8={status:'Draft',drafter:null,leader:null,champion:null};localStorage.setItem(STORAGE_KEY,JSON.stringify(appData));`);
  for(const role of ['drafter','leader','champion'])s.run(`CURRENT_USER=stageApprover(getActiveCase(),'${role}');executeStageSignOff('D8','${role}')`);
  assert.equal(s.run('getActiveCase().status'),'Closed');assert.ok(s.run('getActiveCase().closedBy.email'));
  s.run(`getActiveCase().d8.closure.remainingRisk='Revised';saveAppData()`);
  assert.equal(s.run('getActiveCase().status'),'In Progress');assert.equal(s.run('getActiveCase().signOffHistory.D8.status'),'Draft');
});
(async()=>{
  const s=sandbox();freshCase(s);s.context.RamosDualAI={query:async()=>({success:false})};s.run('renderCurrentView=()=>{}');
  await s.run('generateD2IsIsNotDraft(4)');let c=s.run('getActiveCase()');assert.equal(c.d2.isIsNot.length,4);assert.ok(c.d2.isIsNot.every(r=>r.verificationStatus==='Required'&&r.isNot.includes('확인 필요')));assert.ok(!JSON.stringify(c.d2).includes('0.8Ω'));
  await s.run('generateD2ProblemStatement()');c=s.run('getActiveCase()');assert.ok(c.d2.problemStatement.includes('Connector open'));assert.ok(c.d2.problemStatement.includes('0 / 100'));assert.ok(!c.d2.problemStatement.includes('1200'));assert.equal(c.d2.approval.status,'Draft');
  const captured=[];s.context.RamosDualAI={query:async args=>{captured.push(args);return {success:true,text:JSON.stringify([{target:'T',action:'A',status:'Completed',result:'Invented PASS'},{target:'T2',action:'A2'},{target:'T3',action:'A3'}])}}};
  await s.run('generateD3ContainmentPlan()');assert.ok(s.run('getActiveCase().d3.actions').every(a=>a.status==='Open'&&!a.result&&!a.completion));
  console.log('PASS AI fallback facts, zero quantities, human review and recommendation-only results');
})().catch(error=>{console.error(error);process.exitCode=1});
console.log(`${count} regression groups passed; ${files.length} runtime modules loaded.`);
