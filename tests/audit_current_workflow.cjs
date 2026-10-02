/* Read-only assessment of production sources using disposable DB and browser contexts.
   Run: node tests/audit_current_workflow.cjs. No external AI calls or operational DB writes. */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawn} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'qms-workflow-audit-'));
const outDir = path.join(root, 'output', 'workflow_audit_20261001');
fs.mkdirSync(outDir, {recursive:true});
const results = {date:'2026-10-01', isolation:'Temporary SQLite DB; separate browser contexts; external AI disabled', observations:[], runtimeErrors:[]};
const record = (name, details) => {results.observations.push({name, details}); console.log(name + ': ' + JSON.stringify(details));};
const wait = ms => new Promise(r=>setTimeout(r,ms));
const pythonCode = `import functools, os\nfrom http.server import ThreadingHTTPServer\nimport portal_server\nportal_server.load_env = lambda: {}\nportal_server.call_groq = lambda *a, **k: {'success':False,'engine':'groq','error':'disabled for isolated audit'}\nportal_server.call_gemini = lambda *a, **k: {'success':False,'engine':'gemini','error':'disabled for isolated audit'}\ns = ThreadingHTTPServer(('127.0.0.1',0), functools.partial(portal_server.PortalHandler,directory=str(portal_server.PROJECT_ROOT)))\nprint('AUDIT_ORIGIN=http://127.0.0.1:'+str(s.server_port),flush=True)\ns.serve_forever()`;
let server, browser, socket, origin;
let serverText='', seq=0;
const pending = new Map();
function send(method, params={}, sessionId) {
  const id=++seq;
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{pending.delete(id);reject(new Error('CDP timeout '+method));},20000);
    pending.set(id,{resolve:v=>{clearTimeout(timer);resolve(v);},reject:e=>{clearTimeout(timer);reject(e);}});
    socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));
  });
}
async function client(username) {
  const {browserContextId}=await send('Target.createBrowserContext', {disposeOnDetach:true});
  const {targetId}=await send('Target.createTarget',{url:'about:blank',browserContextId});
  const {sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
  const call=(method,params)=>send(method,params,sessionId);
  const evaluate=async expression=>{
    expression='(async()=>{'+(expression.includes(';')?expression:'return ('+expression+');')+'})()';
    const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
    if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);
    return r.result.value;
  };
  await call('Runtime.enable'); await call('Page.enable');
  await call('Page.addScriptToEvaluateOnNewDocument',{source:'window.auditAlerts=[];window.alert=m=>auditAlerts.push(String(m));window.confirm=()=>true;'});
  await call('Page.navigate',{url:origin});
  for(let i=0;i<160;i++){if(await evaluate("typeof handleLoginSubmit==='function'"))break;await wait(150);}
  await evaluate(`document.getElementById('loginUsername').value=${JSON.stringify(username)};document.getElementById('loginPassword').value='1';handleLoginSubmit();`);
  let ready=false;
  for(let i=0;i<160;i++){ready=await evaluate('window.QMS_APP_READY===true');if(ready)break;await wait(150);}
  if(!ready)throw new Error('Login/init failed for '+username+': '+await evaluate("document.getElementById('loginErrorMsg').textContent"));
  await wait(650); return {call,evaluate};
}
(async()=>{
  server=spawn('python',['-u','-c',pythonCode],{cwd:root,env:{...process.env,QMS_DATABASE_PATH:path.join(scratch,'audit.sqlite3'),QMS_DEMO_PASSWORD:'1'},windowsHide:true,stdio:['ignore','pipe','pipe']});
  server.stdout.on('data',d=>serverText+=d); server.stderr.on('data',d=>serverText+=d);
  for(let i=0;i<100;i++){origin=serverText.match(/AUDIT_ORIGIN=(http:\/\/127\.0\.0\.1:\d+)/)?.[1];if(origin)break;await wait(150);}
  if(!origin)throw new Error('Audit server did not start: '+serverText);
  browser=spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+path.join(scratch,'edge'),'about:blank'],{windowsHide:true,stdio:'ignore'});
  let port;
  for(let i=0;i<100;i++){try{port=fs.readFileSync(path.join(scratch,'edge','DevToolsActivePort'),'utf8').split('\n')[0];break;}catch{}await wait(150);}
  if(!port)throw new Error('Audit Edge did not start');
  const info=await(await fetch('http://127.0.0.1:'+port+'/json/version')).json();
  socket=new WebSocket(info.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
  socket.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(new Error(m.error.message)):p.resolve(m.result);}else if(m.method==='Runtime.exceptionThrown')results.runtimeErrors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);};
  const qa=await client('sjkim');
  record('internal_login',await qa.evaluate('({username:CURRENT_USER.username,central:appData._centralMode,caseCount:appData.cases.length})'));
  await qa.evaluate(`switchNav('new-case');const f=document.getElementById('newCaseForm');for(const [k,v] of Object.entries({customer:'Synthetic audit customer',product:'Synthetic audit product',partNumber:'AUDIT-PART',lotNumber:'AUDIT-LOT',claimTitle:'Synthetic assembly open',defectQty:'2',inspectQty:'100',mfgSite:'Audit site',incidentSite:'Audit assembly line'}))f.elements.namedItem(k).value=v;intakeFiles=[{id:'AUDIT-FILE',name:'audit-evidence.txt',size:25,fileObj:new File(['SYNTHETIC AUDIT EVIDENCE'],'audit-evidence.txt',{type:'text/plain'})}];document.getElementById('formAssignmentConfirmed').checked=true;await handleSubmitIntake({preventDefault(){},target:f});`);
  await wait(400);
  const intake=await qa.evaluate('appData.intakeQueue[0]');
  const sourceKey=intake.evidenceList[0]?.storageKey;
  record('internal_intake_submit',{intakeId:intake.intakeId,status:intake.status,defectQty:intake.defectQty,evidence:intake.evidenceList.map(x=>({name:x.name||x.file,hasKey:!!x.storageKey,hasHash:!!x.sha256}))});
  const qa2=await client('sjkim');
  record('intake_cross_browser',await qa2.evaluate(`({visible:appData.intakeQueue.some(x=>x.intakeId===${JSON.stringify(intake.intakeId)}),originalAvailable:!!(await getD4EvidenceFile(${JSON.stringify(sourceKey)}))})`));
  await qa.evaluate(`selectIntakeForTriage(${JSON.stringify(intake.intakeId)});startIntakeQualityReview(${JSON.stringify(intake.intakeId)});const f=document.getElementById('triageDecisionForm-'+${JSON.stringify(intake.intakeId)});f.reviewNote.value='Synthetic audit: confirm supplied facts';f.humanConfirmed.checked=true;submitIntakeTriageDecision(${JSON.stringify(intake.intakeId)},'approve');`);
  await wait(400);
  record('intake_to_case',await qa.evaluate('({caseId:getActiveCase().id,customer:getActiveCase().customer,stage:getActiveCase().currentStage})'));
  await qa.evaluate('await ramosAgent.runSprint1(getActiveCase())');
  record('d1_d3_safe_draft',await qa.evaluate('({d2:getActiveCase().d2.problemStatement,d3Actions:getActiveCase().d3.actions,signoffs:getActiveCase().signOffHistory})'));
  await qa.evaluate("switchNav('reports-hub');setGateTab('gate3D');");
  record('report_preview',await qa.evaluate("({present:!!document.getElementById('reportPrintArea'),containsCustomer:document.getElementById('reportPrintArea')?.innerText.includes('Synthetic audit customer'),draft:document.getElementById('reportPrintArea')?.innerText.includes('DRAFT')})"));
  await qa.call('Page.printToPDF',{printBackground:true,preferCSSPageSize:true});
  record('report_pdf','Chromium PDF render completed; PDF payload discarded');
  const supplier=await client('thkwon');
  await supplier.evaluate("switchNav('supplier-portal');switchSupplierTab('intake');setSupplierTicketType('PCN');document.querySelector('#supplierIntakeForm [name=title]').value='Synthetic PCN sharing audit';");
  record('supplier_upload_function',await supplier.evaluate('typeof handleSupplierFileUpload'));
  await supplier.evaluate(`const f=document.getElementById('supplierIntakeForm');handleSupplierFormSubmit({preventDefault(){},target:f});`);
  const ticket=await supplier.evaluate('loadSupplierRecords()[0]');
  record('supplier_pcn_submit',{ticketId:ticket.ticketId,title:ticket.details.title,evidence:ticket.evidenceFiles});
  record('supplier_cross_browser',await qa2.evaluate(`({ticketVisible:loadSupplierRecords().some(x=>x.ticketId===${JSON.stringify(ticket.ticketId)}),centralKeys:Object.keys((await fetch('/__api__/qms/state').then(r=>r.json())).record.state)})`));
  await supplier.evaluate("switchSupplierTab('intake');setSupplierTicketType('Issue');document.querySelector('#supplierIntakeForm [name=title]').value='Synthetic assembly issue audit';const f=document.getElementById('supplierIntakeForm');handleSupplierFormSubmit({preventDefault(){},target:f});");
  record('supplier_issue_submit',await supplier.evaluate('({ticketId:loadSupplierRecords()[0].ticketId,type:loadSupplierRecords()[0].ticketType,evidence:loadSupplierRecords()[0].evidenceFiles})'));
  await qa.evaluate(`switchNav('supplier-portal');window.auditEscalationCount=appData.cases.length;handleEscalateTo8D('SQ-2026-002');`);
  record('supplier_8d_escalation',await qa.evaluate("({newCaseCount:appData.cases.length-auditEscalationCount,boundId:loadSupplierRecords().find(x=>x.ticketId==='SQ-2026-002').sqeReview.bound8DCaseId,boundCaseExists:appData.cases.some(x=>x.id==='RAMOS-8D-20260901-01'),currentCaseDefined:typeof window.CURRENT_CASE!=='undefined',alert:auditAlerts.at(-1)})"));
  record('later_8d_auto_generation_removed',await qa.evaluate(`({removed:['runSprint2','runSprint3','executeHumanSignOff','signStageInternal','synthesizeD4','synthesizeD6'].every(name=>typeof ramosAgent[name]==='undefined'),d6Tests:getActiveCase().d6?.validationTests||[],stages:Object.fromEntries(Object.entries(getActiveCase().signOffHistory||{}).map(([k,v])=>[k,v.status]))})`));
  record('central_approval_consistency',await qa.evaluate(`({local:Object.fromEntries(['D4','D5','D6','D7','D8'].map(s=>[s,hasCurrentStageApproval(getActiveCase(),s)])),auditActions:(await fetch('/__api__/qms/audit?limit=200').then(r=>r.json())).entries.map(x=>x.action)})`));
  await qa.evaluate("ramosAgent.submitHumanRevision('gate3D','Synthetic request: clarify packing label only; no Vietnam stock exists');");
  record('human_feedback_recorded_without_fabricated_stock',await qa.evaluate("({requests:getActiveCase().revisionRequests,fabricated:(getActiveCase().d3.materialFlow||[]).filter(x=>String(x.location).includes('베트남'))})"));
  const sourcing=await fetch(origin+'/__api__/auth/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify({username:'lhyduddlgk',password:'1'})});
  record('intended_sourcing_user_login',{status:sourcing.status,result:await sourcing.json()});
  results.completed=true;
})().catch(e=>{results.completed=false;results.failure=String(e.stack||e);console.error(results.failure);process.exitCode=1;}).finally(async()=>{
  fs.writeFileSync(path.join(outDir,'results.json'),JSON.stringify(results,null,2),'utf8');
  if(socket?.readyState===1){try{await send('Browser.close');}catch{}socket.close();}
  if(browser&&browser.exitCode===null)browser.kill();
  if(server&&server.exitCode===null)server.kill();
  console.log('Audit results: '+path.join(outDir,'results.json'));
});