// Isolated Chromium profile; run against a server with AI credentials disabled.
const fs=require('node:fs'), os=require('node:os'), path=require('node:path');
const {spawn}=require('node:child_process'); const assert=require('node:assert/strict');
const browserPath='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'qms-audit-browser-'));
const origin=process.env.QMS_TEST_ORIGIN;
if(!origin) throw new Error('Set QMS_TEST_ORIGIN to the isolated AI-disabled server');
const proc=spawn(browserPath,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
let socket, seq=0; const pending=new Map(); const errors=[];
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function send(method,params={},sessionId){const id=++seq;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(new Error('CDP timeout: '+method))},12000);pending.set(id,{resolve:v=>{clearTimeout(timer);resolve(v)},reject});socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));});}
(async()=>{
 let port;
 for(let i=0;i<80;i++){try{port=fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0];break}catch{}await delay(150)}
 if(!port)throw new Error('Headless browser did not start');
 const info=await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
 socket=new WebSocket(info.webSocketDebuggerUrl);await new Promise((r,j)=>{socket.onopen=r;socket.onerror=j});
 socket.onmessage=e=>{const msg=JSON.parse(e.data);if(msg.id&&pending.has(msg.id)){const p=pending.get(msg.id);pending.delete(msg.id);msg.error?p.reject(new Error(msg.error.message)):p.resolve(msg.result)}else if(msg.method==='Runtime.exceptionThrown')errors.push(msg.params.exceptionDetails.text+': '+(msg.params.exceptionDetails.exception?.description||''));};
 const {targetId}=await send('Target.createTarget',{url:'about:blank'});const {sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
 const call=(method,params)=>send(method,params,sessionId);
 const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value};
 await call('Runtime.enable');await call('Page.enable');
 await call('Page.addScriptToEvaluateOnNewDocument',{source:'window.alert=()=>{};window.confirm=()=>true;window.lucide={createIcons(){}};'});
 await call('Page.navigate',{url:origin});
 for(let i=0;i<80;i++){if(await evaluate(`typeof initApp==='function'`))break;await delay(150)}
 await evaluate(`handleQuickLogin('sjkim');`);
 assert.equal(await evaluate(`document.getElementById('loginScreen').style.display`),'none');
 await evaluate('openNotificationModal();closeModal();');
 console.log('PASS browser login and notification');
 await evaluate(`switchNav('new-case');if(document.getElementById('formCustomer').value)throw new Error('New intake must start blank');document.getElementById('formCustomer').value='SYNTHETIC DRAFT';saveIntakeDraft();switchNav('dashboard');switchNav('new-case');`);
 assert.equal(await evaluate(`document.getElementById('formCustomer').value`),'SYNTHETIC DRAFT');
 await evaluate(`clearIntakeDraft();switchNav('dashboard');switchNav('new-case');`);
 assert.equal(await evaluate(`document.getElementById('formCustomer').value`),'');
 console.log('PASS browser blank intake and draft restore');
 await evaluate(`(()=>{const c=getActiveCase();c.d2={problemWhat:'fact',problemWhere:'site',problemWhen:'date',problemWho:'inspector',problemWhich:'lot',problemHow:'condition',problemHowMany:'1/100',problemStatement:'ORIGINAL SIGNED CONTENT',isIsNot:[{factor:'lot',is:'A',isNot:'B',difference:'date',verificationStatus:'Verified'}],approval:{humanConfirmed:true,status:'Draft'}};c.signOffHistory.D2={status:'Draft',drafter:null,leader:null,champion:null};localStorage.setItem(STORAGE_KEY,JSON.stringify(appData));})()`);
 for(const [role,status] of [['drafter','Submitted'],['leader','LeaderApproved'],['champion','Approved']]){
   await evaluate(`handleQuickLogin(stageApprover(getActiveCase(),'${role}').username);openStageReviewModal('D2');`);
   assert.equal(await evaluate(`document.querySelectorAll('#stageReviewModalBackdrop').length`),1);
   await evaluate(`document.querySelector('[onclick="executeStageSignOff(\\'D2\\', \\'${role}\\')"]').click()`);
   assert.equal(await evaluate('getActiveCase().signOffHistory.D2.status'),status);
 }
 await evaluate(`closeStageReviewModal();switchStage('D2');document.querySelector('[name="problemStatement"]').value='REVISED CONTENT';saveD2ProblemDefinition(false);switchStage('D3');`);
 assert.equal(await evaluate('appData.activeStage'),'D2');
 assert.equal(await evaluate('getActiveCase().signOffHistory.D2.status'),'Draft');
 await evaluate(`openApprovalHistory('D2');`);
 assert.ok((await evaluate(`document.getElementById('modalContainer').textContent`)).includes('ORIGINAL SIGNED CONTENT'));
 await evaluate(`closeModal();handleQuickLogin('sjkim')`);
 console.log('PASS browser assigned approvals, single modal, revision gate and snapshot history');

 await evaluate(`switchNav('new-case');window.autoUploadCalls=[];window.RamosDualAI.query=async args=>{autoUploadCalls.push(args);return {success:true,parsedJson:{},engine:'mock'}};window.uploadFixtures=[new File(['SYNTHETIC TXT'],'claim.txt'),new File(['Subject: Synthetic\\r\\nContent-Type: text/plain; charset=utf-8\\r\\n\\r\\nSYNTHETIC EML'],'claim.eml'),new File(['customer,qty\\nSynthetic,0'],'claim.csv'),new File([Uint8Array.from(atob('UEsDBBQAAAAAAJRsJ11HY8hkoAAAAKAAAAARAAAAd29yZC9kb2N1bWVudC54bWw8dzpkb2N1bWVudCB4bWxuczp3PSJodHRwOi8vc2NoZW1hcy5vcGVueG1sZm9ybWF0cy5vcmcvd29yZHByb2Nlc3NpbmdtbC8yMDA2L21haW4iPjx3OmJvZHk+PHc6cD48dzpyPjx3OnQ+U1lOVEhFVElDIERPQ1g8L3c6dD48L3c6cj48L3c6cD48L3c6Ym9keT48L3c6ZG9jdW1lbnQ+UEsBAhQAFAAAAAAAlGwnXUdjyGSgAAAAoAAAABEAAAAAAAAAAAAAAIABAAAAAHdvcmQvZG9jdW1lbnQueG1sUEsFBgAAAAABAAEAPwAAAM8AAAAAAA=='),c=>c.charCodeAt(0))],'claim.docx')];const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['Synthetic',0]]),'Claim');uploadFixtures.push(new File([XLSX.write(book,{type:'array',bookType:'xlsx'})],'claim.xlsx'));processIncomingFiles(uploadFixtures);`);
 assert.equal(await evaluate('autoUploadCalls.length'),1);
 assert.deepEqual(await evaluate('intakeFiles.map(f=>f.document.status)'),Array(5).fill('Text extracted'));
 assert.ok((await evaluate('autoUploadCalls[0].prompt')).includes('SYNTHETIC EML'));
 await evaluate(`parseRawTextIntoForm('SYNTHETIC PASTED CUSTOMER TEXT');`);
 assert.equal(await evaluate('autoUploadCalls.length'),2);
 await evaluate('intakeFiles=[];intakeRequestVersion++');
 console.log('PASS automatic external AI for parsed TXT/EML/CSV/DOCX/XLSX and pasted text');
 await evaluate(`switchNav('new-case');window.intakeCalls=[];window.RamosDualAI.query=async args=>{intakeCalls.push(args);return {success:true,parsedJson:{defectQty:0,lineStop:false},engine:'mock'}};processIncomingFiles([new File(['SYNTHETIC SOURCE: quantity 0'],'source.txt',{type:'text/plain'})]);`);
 assert.equal(await evaluate('intakeCalls.length'),1);
 assert.ok((await evaluate('intakeCalls[0].prompt')).includes('SYNTHETIC SOURCE: quantity 0'));
 assert.equal(await evaluate("document.getElementById('inputDefectQty').value"),'0');
 await evaluate(`window.RamosDualAI.query=()=>new Promise(resolve=>window.resolveIntake=resolve);window.pendingExtraction=triggerAIExtraction('SYNTHETIC',true);void 0;`);
 for(let i=0;i<60;i++){if(await evaluate('typeof resolveIntake==="function"'))break;await delay(50)}
 await evaluate(`document.getElementById('formCustomer').value='USER KEPT';resolveIntake({success:true,parsedJson:{customer:'AI OVERWRITE'}});pendingExtraction;`);
 assert.equal(await evaluate("document.getElementById('formCustomer').value"),'USER KEPT');
 await evaluate(`window.mediaCalls=[];window.RamosDualAI.query=async args=>{mediaCalls.push(args);return {success:true,parsedJson:{},engine:'mock'}};processIncomingFiles([new File(['%PDF synthetic'],'source.pdf',{type:'application/pdf'}),new File(['synthetic image'],'source.png',{type:'image/png'})]);`);
 assert.equal(await evaluate('mediaCalls.length'),1);
 assert.equal(await evaluate('mediaCalls[0].attachments.length'),2);
 assert.deepEqual(await evaluate('intakeFiles.slice(-2).map(f=>f.document.status)'),['Media ready','Media ready']);
 const excel=await evaluate(`(async()=>{const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['Synthetic Excel',0]]),'Claim');return (await readIntakeDocument({fileObj:new File([XLSX.write(book,{type:'array',bookType:'xlsx'})],'claim.xlsx')})).text;})()`);
 assert.ok(excel.includes('Synthetic Excel,0'));
 await evaluate(`window.savedPut=putD4EvidenceFile;window.queueBefore=(appData.intakeQueue||[]).length;putD4EvidenceFile=async()=>{throw new Error('Synthetic quota failure')};document.getElementById('formAssignmentConfirmed').checked=true;handleSubmitIntake({preventDefault(){},target:document.querySelector('#mainContentContainer form')});`);
 assert.equal(await evaluate('(appData.intakeQueue||[]).length'),await evaluate('queueBefore'));
 assert.equal(await evaluate('intakeFiles.length'),3);
 await evaluate('putD4EvidenceFile=savedPut');
 console.log('PASS text/Excel parsing, PDF/image forwarding, zero value, user edit race and failed storage preservation');
 await evaluate(`const form=document.querySelector('#mainContentContainer form');form.customer.value='Synthetic Audit Customer';form.product.value='Synthetic Product';form.partNumber.value='AUDIT-PART';form.lotNumber.value='AUDIT-LOT';form.claimTitle.value='Connector open';form.defectQty.value=0;form.inspectQty.value=100;document.getElementById('formAssignmentConfirmed').checked=true;handleSubmitIntake({preventDefault(){},target:form});`);
 const intakeId=await evaluate('appData.intakeQueue[0].intakeId');
 assert.equal(await evaluate(`(async()=>{const ev=appData.intakeQueue[0].evidenceList[0];window.originalIntakeKey=ev.storageKey;if(!ev.sha256||ev.sha256.length!==64)throw new Error('Missing SHA256');return (await getD4EvidenceFile(ev.storageKey)).text()})()`),'SYNTHETIC SOURCE: quantity 0');
 await evaluate(`selectIntakeForTriage(${JSON.stringify(intakeId)});startIntakeQualityReview(${JSON.stringify(intakeId)});const review=document.getElementById('triageDecisionForm-'+${JSON.stringify(intakeId)});review.reviewNote.value='Synthetic browser verification';review.humanConfirmed.checked=true;submitIntakeTriageDecision(${JSON.stringify(intakeId)},'approve');`);
 assert.equal(await evaluate('getActiveCase().customer'),'Synthetic Audit Customer');
 assert.equal(await evaluate('getActiveCase().evidenceList[0].storageKey'),await evaluate('originalIntakeKey'));
 console.log('PASS browser intake -> quality review -> new Case');
 // Render downstream bodies without claiming the unfinished workflow is approved.
 await evaluate(`document.getElementById('mainContentContainer').innerHTML=renderStageContent(getActiveCase(),'D5');`);
 await evaluate(`document.getElementById('mainContentContainer').innerHTML=renderStageContent(getActiveCase(),'D6');`);
 await evaluate(`appData.currentView='stage';appData.activeStage='D2';renderCurrentView();window.RamosDualAI.query=async()=>({success:false});`);
 await evaluate('generateD2IsIsNotDraft(4)');await evaluate('generateD2ProblemStatement()');
 await evaluate(`document.querySelector('[name="problemStatement"]').value='USER EDITED PROBLEM';saveD2ProblemDefinition(false);`);
 assert.equal(await evaluate('getActiveCase().d2.problemStatement'),'USER EDITED PROBLEM');
 console.log('PASS browser D2 fallback, user edit and save');
 await evaluate(`appData.activeStage='D4';renderCurrentView();addD4Tool('timeline');openD4EvidenceBuilder(0);`);
 await evaluate(`handleD4EvidenceFiles([new File(['SYNTHETIC EVIDENCE'],'audit.txt',{type:'text/plain'})])`);
 await evaluate(`document.getElementById('d4EvObjective').value='Synthetic objective';document.getElementById('d4EvConclusion').value='Synthetic observation';saveD4EvidenceArtifact();`);
 assert.equal(await evaluate('getActiveCase().d4.selectedTools[0].artifact.attachments.length'),1);
 await evaluate(`openD4EvidenceBuilder(0);handleD4EvidenceFiles([new File(['CANCELLED EVIDENCE'],'cancelled.txt',{type:'text/plain'})]);`);
 const cancelledKey=await evaluate('pendingD4NewKeys[0]');
 await evaluate('closeD4EvidenceBuilder()');
 assert.equal(await evaluate(`getD4EvidenceFile(${JSON.stringify(cancelledKey)}).then(Boolean)`),false);
 assert.equal(await evaluate('getActiveCase().d4.selectedTools[0].artifact.attachments.length'),1);
 console.log('PASS browser cancelled D4 attachments are rolled back');
 assert.equal(await evaluate(`(async()=>{const f=await getD4EvidenceFile(getActiveCase().d4.selectedTools[0].artifact.attachments[0].storageKey);return f.text()})()`),'SYNTHETIC EVIDENCE');
 console.log('PASS browser D4 attachment storage and retrieval');
 // Establish synthetic, internally consistent D1-D4 approvals so the new late-stage workflow can be exercised independently.
 await evaluate(`(function(){const c=getActiveCase();ensureD2Structure(c);ensureD3Structure(c);ensureD4Structure(c);ensureLateStages(c);const accounts=ALL_USER_ACCOUNTS.slice(0,3);c.team=[{role:'8D Facilitator',contact:accounts[0].email},{role:'CFT Leader',contact:accounts[1].email},{role:'Executive Champion',contact:accounts[2].email}];c.cftRecommendation={...(c.cftRecommendation||{}),humanConfirmed:true};c.cftRaci={...(c.cftRaci||{}),acknowledged:true};for(const stage of ['D2','D3','D4'])c[stage.toLowerCase()].approval={status:'Approved',humanConfirmed:true};c.d4.rootCauses={Occurrence:{status:'Confirmed',statement:'Synthetic occurrence',evidence:'EVD-O'},Escape:{status:'Confirmed',statement:'Synthetic escape',evidence:'EVD-E'},System:{status:'Confirmed',statement:'Synthetic system',evidence:'EVD-S'}};c.signOffHistory ||= {};for(const stage of ['D1','D2','D3','D4'])c.signOffHistory[stage]={status:'Approved',snapshot:approvalSnapshot(c,stage)};appData.currentView='dashboard';localStorage.setItem(STORAGE_KEY,JSON.stringify(appData));renderCurrentView();})()`);
 await evaluate(`switchStage('D5');window.RamosDualAI.query=()=>new Promise(resolve=>window.resolveLateAI=resolve);window.pendingLateAI=generateLateStageAI('D5');void 0`);
 for(let i=0;i<60;i++){if(await evaluate('typeof resolveLateAI==="function"'))break;await delay(50)}
 await evaluate(`document.querySelector('[data-late-path="pcnEcn.ecnNumber"]').value='USER CHANGED DURING AI';resolveLateAI({success:true,engine:'mock',parsedJson:{groups:{candidates:[]}}});pendingLateAI`);
 assert.equal(await evaluate('getActiveCase().d5.aiDraft'),undefined);assert.equal(await evaluate('getActiveCase().d5.pcnEcn.ecnNumber'),'USER CHANGED DURING AI');
 await evaluate(`switchStage('D5');window.RamosDualAI.query=async()=>({success:true,engine:'mock',parsedJson:{confirmedFacts:[],inferences:['Synthetic inference'],missingInformation:['Evidence required'],recommendations:['Review'],groups:{candidates:[{causeType:'Occurrence',title:'AI PCA draft',rationale:'Recommendation only',selected:true,evidence:'INVENTED-EVIDENCE'}]}}});generateLateStageAI('D5')`);
 await evaluate(`applyLateStageAI('D5')`);
 assert.equal(await evaluate('getActiveCase().d5.candidates[0].selected'),false);assert.equal(await evaluate('getActiveCase().d5.candidates[0].evidence'),undefined);
 await evaluate(`(function(){const c=getActiveCase();c.d5.pcnEcn={ecnNumber:'ECN-SYN',pcnRequired:false,customerApprovalStatus:'Not Required',evidence:'EVD-PCN'};c.d5.candidates=['Occurrence','Escape','System'].map((causeType,i)=>({id:'PCA-'+(i+1),causeType,title:'Synthetic '+causeType,rationale:'Removes '+causeType,rootCauseElimination:'High',feasibility:'Feasible',costImpact:'Reviewed',riskLevel:'Controlled',owner:'Owner '+i,due:'2026-10-01',verificationPlan:'Synthetic validation '+i,evidence:'EVD-PCA-'+i,selected:true}));c.d5.approval={status:'Draft',humanConfirmed:true};saveAppData();renderCurrentView();})()`);
 await evaluate(`document.querySelector('[data-late-path="candidates.0.title"]').value='Synthetic Occurrence PCA edited';document.getElementById('lateHumanConfirmed').checked=true;saveLateStage(false)`);
 assert.equal(await evaluate(`lateStageReviewError(getActiveCase(),'D5')`),'');
 await evaluate(`for(const role of ['drafter','leader','champion']){CURRENT_USER=stageApprover(getActiveCase(),role);executeStageSignOff('D5',role)}`);
 assert.equal(await evaluate(`hasCurrentStageApproval(getActiveCase(),'D5')`),true);

 await evaluate(`switchStage('D6');window.RamosDualAI.query=async()=>({success:true,engine:'mock',parsedJson:{confirmedFacts:[],inferences:[],missingInformation:['Run test'],recommendations:[],groups:{validationTests:[{actionId:'PCA-1',testName:'AI validation draft',condition:'Synthetic',sampleSize:10,failQty:0,result:'PASS',completedAt:'2026-10-02',evidence:'INVENTED'}]}}});generateLateStageAI('D6')`);
 await evaluate(`applyLateStageAI('D6')`);
 assert.equal(await evaluate('getActiveCase().d6.validationTests[0].result'),'Pending');assert.equal(await evaluate('getActiveCase().d6.validationTests[0].sampleSize'),'');assert.equal(await evaluate('getActiveCase().d6.validationTests[0].evidence'),undefined);
 await evaluate(`(function(){const c=getActiveCase();c.d6.implementationDetails={bomRevision:'SYN-B',appliedLot:'SYN-LOT',startDate:'2026-10-02',productionSite:'Synthetic site',evidence:'EVD-IMPL'};c.d6.beforeAfter={beforeMetric:'Before observed',afterMetric:'After observed',evidence:'EVD-COMP'};c.d6.containmentRelease={decision:'Released',rationale:'Acceptance criteria met',evidence:'EVD-REL'};c.d6.validationTests=c.d5.candidates.map((a,i)=>({id:'VAL-'+i,actionId:a.id,testName:'Synthetic test '+i,condition:'Controlled',acceptanceCriteria:'0 failure',sampleSize:10,failQty:0,result:'PASS',owner:'Validator',completedAt:'2026-10-03',evidence:'EVD-VAL-'+i}));c.d6.approval={status:'Draft',humanConfirmed:true};saveAppData();renderCurrentView();})()`);
 assert.equal(await evaluate(`lateStageReviewError(getActiveCase(),'D6')`),'');
 await evaluate(`for(const role of ['drafter','leader','champion']){CURRENT_USER=stageApprover(getActiveCase(),role);executeStageSignOff('D6',role)}`);

 await evaluate(`switchStage('D7');window.RamosDualAI.query=async()=>({success:true,engine:'mock',parsedJson:{confirmedFacts:[],inferences:[],missingInformation:['Complete update'],recommendations:[],groups:{systemUpdates:[{actionId:'PCA-3',docName:'AI system draft',docNo:'AI-DOC',rev:'B',changeContent:'Recommended update',owner:'Owner',status:'Completed',evidence:'INVENTED'}],horizontalDeployment:[]}}});generateLateStageAI('D7')`);
 await evaluate(`applyLateStageAI('D7')`);assert.equal(await evaluate('getActiveCase().d7.systemUpdates[0].status'),'Open');assert.equal(await evaluate('getActiveCase().d7.systemUpdates[0].evidence'),undefined);
 await evaluate(`(function(){const c=getActiveCase();c.d7.systemUpdates=[{id:'SYS-1',actionId:'PCA-3',docName:'Synthetic procedure',docNo:'DOC-SYN',rev:'B',changeContent:'Added prevention gate',owner:'System owner',due:'2026-10-04',status:'Completed',evidence:'EVD-SYS'}];c.d7.horizontalDeployment=[{id:'HOR-1',actionId:'PCA-1',product:'Synthetic family',sameRisk:'Reviewed',action:'Applied same control',owner:'Deploy owner',status:'Completed',evidence:'EVD-HOR'}];c.d7.approval={status:'Draft',humanConfirmed:true};saveAppData();renderCurrentView();})()`);
 assert.equal(await evaluate(`lateStageReviewError(getActiveCase(),'D7')`),'');
 await evaluate(`for(const role of ['drafter','leader','champion']){CURRENT_USER=stageApprover(getActiveCase(),role);executeStageSignOff('D7',role)}`);

 await evaluate(`switchStage('D8');window.RamosDualAI.query=async()=>({success:true,engine:'mock',parsedJson:{confirmedFacts:[],inferences:[],missingInformation:['Customer evidence'],recommendations:[],groups:{checklist:[{cat:'AI review',item:'Review customer evidence',checked:true,evidence:'INVENTED'}]}}});generateLateStageAI('D8')`);
 await evaluate(`applyLateStageAI('D8')`);assert.equal(await evaluate('getActiveCase().d8.checklist.at(-1).checked'),false);assert.equal(await evaluate('getActiveCase().d8.checklist.at(-1).evidence'),undefined);
 await evaluate(`(function(){const c=getActiveCase();c.d8.checklist.forEach((r,i)=>{r.checked=true;r.evidence='EVD-CLOSE-'+i});c.d8.closure={remainingRisk:'Residual risk reviewed',customerAcceptance:'Synthetic acceptance',evidence:'EVD-CUSTOMER'};c.d8.teamAppreciation='Synthetic team recognition';c.d8.approval={status:'Draft',humanConfirmed:true};saveAppData();renderCurrentView();})()`);
 assert.equal(await evaluate(`lateStageReviewError(getActiveCase(),'D8')`),'');
 await evaluate(`for(const role of ['drafter','leader','champion']){CURRENT_USER=stageApprover(getActiveCase(),role);executeStageSignOff('D8',role)}`);
 assert.equal(await evaluate('getActiveCase().status'),'Closed');assert.equal(await evaluate(`hasCurrentStageApproval(getActiveCase(),'D8')`),true);
 const lateReport=await evaluate(`['D5','D6','D7','D8'].map(stage=>renderStageReportSection(getActiveCase(),stage)).join('')`);assert.ok(lateReport.includes('Synthetic Occurrence PCA edited'));assert.ok(lateReport.includes('EVD-VAL-0'));assert.ok(lateReport.includes('DOC-SYN'));assert.ok(lateReport.includes('Synthetic team recognition'));
 const actionHub=await evaluate(`renderActionsHubView(getActiveCase())`);assert.ok(actionHub.includes('D5 Corrective'));assert.ok(actionHub.includes('D6 Validation'));assert.ok(actionHub.includes('D7 System'));assert.ok(!actionHub.includes('ACT-PCA-01'));
 await evaluate(`openAIAssistantModal()`);const auditText=await evaluate(`document.getElementById('modalContainer').innerText`);assert.ok(auditText.includes('Traceability: 연결 확인'));assert.ok(auditText.includes('D1~D8 완료'));assert.ok(!auditText.includes('통과 (100%)'));
 console.log('PASS browser D5-D8 AI drafts, human evidence, sequential approval, closure, reports and Action Hub');
 await evaluate(`switchNav('reports-hub');setGateTab('gate8D');`);
 const report=await evaluate(`document.getElementById('reportPrintArea').innerText`);assert.ok(report.includes('USER EDITED PROBLEM'));assert.ok(!report.includes('0 Fail (PASS)'));assert.ok(report.includes('DRAFT'));
 await call('Page.printToPDF',{printBackground:true,preferCSSPageSize:true});
 console.log('PASS browser report preview and PDF generation');
 await call('Page.reload');
 for(let i=0;i<80;i++){if(await evaluate(`typeof getActiveCase==='function' && document.readyState==='complete'`))break;await delay(150)}
 assert.equal(await evaluate('getActiveCase().d2.problemStatement'),'USER EDITED PROBLEM');assert.equal(await evaluate('getActiveCase().d4.selectedTools[0].artifact.attachments.length'),1);
 assert.equal(await evaluate(`(async()=>{return (await getD4EvidenceFile(getActiveCase().evidenceList[0].storageKey)).text()})()`),'SYNTHETIC SOURCE: quantity 0');
 assert.equal(errors.length,0,errors.join('\n'));
 console.log('PASS browser reload persistence; no uncaught runtime errors');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{
 if(socket?.readyState===1){try{await send('Browser.close')}catch{}socket.close()}
 // Only terminate the browser process spawned by this test.
 if(proc.exitCode===null)proc.kill();
 console.log('Isolated test profile: '+profile);
});
