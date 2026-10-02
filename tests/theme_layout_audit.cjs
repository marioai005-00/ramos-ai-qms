/* Full UI audit in a disposable DB/browser. No live approvals, AI, email or data writes. */
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),out=path.join(root,'output','theme_layout_20261002'),scratch=fs.mkdtempSync(path.join(os.tmpdir(),'qms-theme-layout-'));
const label=process.env.QMS_AUDIT_LABEL||'verified';
const visualCase=JSON.parse(fs.readFileSync(path.join(root,'tests/fixtures/ui_case.json'),'utf8'));
let server,browser,socket,seq=0,serverText='';const pending=new Map(),errors=[];
const delay=ms=>new Promise(r=>setTimeout(r,ms));
function send(method,params={},sessionId){const id=++seq;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(new Error('CDP timeout '+method));},40000);pending.set(id,{resolve:v=>{clearTimeout(timer);resolve(v);},reject:e=>{clearTimeout(timer);reject(e);}});socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));});}
const inspect=String.raw`(()=>{
const own=el=>[...el.childNodes].filter(n=>n.nodeType===3&&n.textContent.trim());
const sel=el=>el.tagName.toLowerCase()+(el.id?'#'+el.id:'.'+[...el.classList].join('.'));
const visible=el=>{const s=getComputedStyle(el),r=el.getBoundingClientRect();return r.width>1&&r.height>1&&s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity)>.05&&!el.closest('.sr-only,.report-watermark,.stage-report-watermark');};
const parse=v=>{const m=v.match(/rgba?\(([^)]+)\)/);if(!m)return[0,0,0,0];const p=m[1].split(',').map(Number);return[p[0],p[1],p[2],p[3]??1];};
const blend=(a,b)=>{const k=a[3]+b[3]*(1-a[3]);return k?[0,1,2].map(i=>(a[i]*a[3]+b[i]*b[3]*(1-a[3]))/k).concat(k):[255,255,255,1];};
const bg=el=>{const layers=[];for(let n=el;n;n=n.parentElement)layers.push(parse(getComputedStyle(n).backgroundColor));return layers.reverse().reduce((b,a)=>blend(a,b),[255,255,255,1]);};
const lum=a=>a.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
const scrollRoot=el=>{for(let p=el.parentElement;p;p=p.parentElement){const st=getComputedStyle(p);if(['auto','scroll'].includes(st.overflowY)||['auto','scroll'].includes(st.overflowX))return p;}return null;};const rect=r=>({x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(r.height)});
const contrast=[],clipped=[],small=[],overflow=[],textRects=[];
for(const el of document.querySelectorAll('body *')){
 if(!visible(el)||el.closest('svg')||[...document.querySelectorAll('details:not([open])')].some(d=>d.contains(el)&&!d.querySelector('summary')?.contains(el)))continue;const modal=[document.getElementById('stageReviewModalBackdrop'),document.getElementById('documentViewerModal'),document.getElementById('globalModal')].find(m=>m&&getComputedStyle(m).display!=='none');if(modal&&getComputedStyle(modal).display!=='none'&&!modal.contains(el))continue;const nodes=own(el),s=getComputedStyle(el),r=el.getBoundingClientRect();
 if(el.scrollWidth>el.clientWidth+3&&el.clientWidth>20&&s.overflowX==='hidden'&&!el.matches('svg,*[class*=icon]')&&!el.closest('.sr-only'))overflow.push({sel:sel(el),style:el.getAttribute('style'),diff:el.scrollWidth-el.clientWidth,text:el.innerText?.slice(0,65)});
 if(!nodes.length)continue;const text=nodes.map(n=>n.textContent.trim()).join(' ').slice(0,90),size=parseFloat(s.fontSize);
 const b=bg(el),fg=blend(parse(s.color),b),a=lum(fg),z=lum(b),ratio=(Math.max(a,z)+.05)/(Math.min(a,z)+.05),required=size>=24||(Number(s.fontWeight)>=700&&size>=18.66)?3:4.5;
 if(!s.backgroundImage.includes('gradient')&&ratio+.03<required)contrast.push({sel:sel(el),text,ratio:+ratio.toFixed(2),fg:s.color,bg:b.slice(0,3).map(Math.round).join(','),size});
 if(size<11.5)small.push({sel:sel(el),text,size});
 for(const n of nodes){const range=document.createRange();range.selectNodeContents(n);for(const tr of range.getClientRects()){
  if(tr.width<2||tr.height<2)continue;
  textRects.push({el,root:scrollRoot(el),sel:sel(el),text:n.textContent.trim().slice(0,50),r:tr});
  let scrollX=false,scrollY=false;for(let p=el;p;p=p.parentElement){const ps=getComputedStyle(p),pr=p.getBoundingClientRect();if(['auto','scroll'].includes(ps.overflowX))scrollX=true;if(['auto','scroll'].includes(ps.overflowY))scrollY=true;const cx=!scrollX&&['hidden','clip'].includes(ps.overflowX),cy=!scrollY&&['hidden','clip'].includes(ps.overflowY);if((cx&&(tr.left<pr.left-2||tr.right>pr.right+2))||(cy&&(tr.top<pr.top-2||tr.bottom>pr.bottom+2))){clipped.push({sel:sel(el),parent:sel(p),text,axis:cx&&tr.right>pr.right+2?'x':'y',textRect:rect(tr),parentRect:rect(pr)});break;}if(p===document.body)break;}
 }}
}
const collisions=[];textRects.sort((a,b)=>a.r.top-b.r.top);
for(let i=0;i<textRects.length;i++)for(let j=i+1;j<textRects.length&&textRects[j].r.top<textRects[i].r.bottom-2;j++){
 const a=textRects[i],b=textRects[j];if(a.root!==b.root||a.el===b.el||a.el.contains(b.el)||b.el.contains(a.el)||a.el.closest('.modal-overlay')!==b.el.closest('.modal-overlay'))continue;
 if(Math.min(a.r.right,b.r.right)>Math.max(a.r.left,b.r.left)+3&&Math.min(a.r.bottom,b.r.bottom)>Math.max(a.r.top,b.r.top)+3)collisions.push({a:a.sel,b:b.sel,text:a.text+' / '+b.text});
}
const widths=[...document.querySelectorAll('#mainContentContainer *')].filter(el=>visible(el)&&!el.closest('svg,.qms-table-scroll')&&el.scrollWidth>el.clientWidth+3&&!['auto','scroll'].includes(getComputedStyle(el).overflowX)).map(el=>({sel:sel(el),diff:el.scrollWidth-el.clientWidth,style:el.getAttribute('style'),text:el.innerText?.slice(0,65)})).slice(0,20);const content=document.querySelector('.content-body'),main=document.querySelector('#mainContentContainer');
const wide=[...main.querySelectorAll('*')].filter(el=>visible(el)&&!el.closest('svg,.qms-table-scroll')&&el.getBoundingClientRect().right>main.getBoundingClientRect().right+3).slice(0,15).map(el=>({sel:sel(el),rect:rect(el.getBoundingClientRect()),style:el.getAttribute('style')}));return{widths,wide,theme:document.documentElement.dataset.theme,view:appData?.currentView,width:innerWidth,contentWidth:content?.clientWidth,contentOverflow:content?content.scrollWidth-content.clientWidth:0,mainOverflow:main?main.scrollWidth-main.clientWidth:0,textCount:textRects.length,contrast,small,clipped,collisions,overflow};
})()`;
(async()=>{
 const py=`import functools\nfrom http.server import ThreadingHTTPServer\nimport portal_server\nportal_server.load_env=lambda:{}\nportal_server.call_groq=lambda *a,**k: {'success':False,'error':'disabled for UI audit'}\nportal_server.call_gemini=lambda *a,**k: {'success':False,'error':'disabled for UI audit'}\ns=ThreadingHTTPServer(('127.0.0.1',0),functools.partial(portal_server.PortalHandler,directory=str(portal_server.PROJECT_ROOT)))\nprint('ORIGIN=http://127.0.0.1:'+str(s.server_port),flush=True)\ns.serve_forever()`;
 server=spawn('python',['-u','-c',py],{cwd:root,windowsHide:true,env:{...process.env,QMS_DATABASE_PATH:path.join(scratch,'ui.sqlite3'),QMS_DEMO_PASSWORD:'1',PYTHONIOENCODING:'utf-8'},stdio:['ignore','pipe','pipe']});
 server.stdout.on('data',d=>serverText+=d);server.stderr.on('data',d=>serverText+=d);
 let origin;for(let i=0;i<100;i++){origin=serverText.match(/ORIGIN=(http:\/\/127\.0\.0\.1:\d+)/)?.[1];if(origin)break;await delay(100);}if(!origin)throw new Error(serverText);
 browser=spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+path.join(scratch,'edge'),'about:blank'],{windowsHide:true,stdio:'ignore'});
 let port;for(let i=0;i<100;i++){try{port=fs.readFileSync(path.join(scratch,'edge','DevToolsActivePort'),'utf8').split('\n')[0];break;}catch{}await delay(100);}if(!port)throw new Error('Browser not started');
 const info=await(await fetch('http://127.0.0.1:'+port+'/json/version')).json();socket=new WebSocket(info.webSocketDebuggerUrl);await new Promise((r,j)=>{socket.onopen=r;socket.onerror=j;});
 socket.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(new Error(m.error.message)):p.resolve(m.result);}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);};
 const {targetId}=await send('Target.createTarget',{url:'about:blank'}),{sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});const call=(m,p)=>send(m,p,sessionId);
 const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
 await call('Runtime.enable');await call('Page.enable');await call('Network.enable');await call('Network.setBlockedURLs',{urls:['*api.groq.com*','*generativelanguage.googleapis.com*']});
 await call('Emulation.setDeviceMetricsOverride',{width:1600,height:1000,deviceScaleFactor:1,mobile:false});
 const oldStorageFixture=process.env.QMS_AUDIT_EMPTY_ONLY ? "if(!localStorage.getItem('UI_TEST_LEGACY_SEEDED')){localStorage.setItem('AI_QMS_8D_DATA_V9_CLEAN_AUTONOMOUS_SLATE',JSON.stringify({cases:[{id:'OLD-EXAMPLE'}],intakeQueue:[]}));localStorage.setItem('RAMOS_SUPPLIER_RECORDS_V2',JSON.stringify([{ticketId:'OLD-PCN'}]));sessionStorage.setItem('RAMOS_INTAKE_FORM_DRAFT_V1','old-draft');localStorage.setItem('RAMOS_THEME','light');localStorage.setItem('UI_TEST_KEEP_MASTER','preserved');localStorage.setItem('UI_TEST_LEGACY_SEEDED','true');}" : '';
 await call('Page.addScriptToEvaluateOnNewDocument',{source:"window.alert=()=>{};window.confirm=()=>false;"+oldStorageFixture});await call('Page.navigate',{url:origin});
 for(let i=0;i<150;i++){if(await evaluate("typeof handleLoginSubmit==='function'"))break;await delay(100);}
 const loginChecks=[];for(const theme of ['dark','light'])for(const width of [1600,390]){await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});await evaluate(`applyTheme('${theme}')`);await delay(100);const c=await evaluate(inspect);c.name='login';loginChecks.push(c);}await call('Emulation.setDeviceMetricsOverride',{width:1600,height:1000,deviceScaleFactor:1,mobile:false});await evaluate("document.getElementById('loginUsername').value='sjkim';document.getElementById('loginPassword').value='1';handleLoginSubmit();");
 for(let i=0;i<150;i++){if(await evaluate('window.QMS_APP_READY===true'))break;await delay(100);}if(!await evaluate('window.QMS_APP_READY===true'))throw new Error('App init failed: '+JSON.stringify(await evaluate("({message:document.getElementById('loginErrorMsg')?.textContent,ready:window.QMS_APP_READY})"))+' runtime='+JSON.stringify(errors));

 if(process.env.QMS_AUDIT_EMPTY_ONLY){
  const assert=async(expression,label)=>{if(!await evaluate(expression))throw new Error('Empty workspace check: '+label);};
  await assert("appData.cases.length===0&&appData.intakeQueue.length===0&&loadSupplierRecords().length===0",'starts empty');
  await assert("localStorage.getItem('RAMOS_THEME')==='light'&&localStorage.getItem('UI_TEST_KEEP_MASTER')==='preserved'",'theme and unrelated storage preserved');
  await assert("JSON.parse(localStorage.getItem('RAMOS_RECOVERY_BEFORE_CLEAN_START_20261002')).local.RAMOS_SUPPLIER_RECORDS_V2.includes('OLD-PCN')&&sessionStorage.getItem('RAMOS_INTAKE_FORM_DRAFT_V1')===null",'legacy browser recovery and draft cleanup');
  await assert("MASTER_SUPPLIERS.length===4&&RAMOS_TREE.length>0&&typeof loadInteractiveExampleCase==='undefined'&&Object.keys(INTAKE_PRESETS).length===0&&Object.keys(BENCHMARK_DOCUMENTS).length===0",'masters present and example entry points removed');
  const emptyViews=[['dashboard',"switchNav('dashboard')"],['new-case',"switchNav('new-case')"],['intake-triage',"switchNav('intake-triage')"],['cases-list',"switchNav('cases-list')"],['evidence-hub',"switchNav('evidence-hub')"],['actions-hub',"switchNav('actions-hub')"],['reports-hub',"switchNav('reports-hub')"],['mission-control',"switchNav('mission-control')"],['agent-operations',"switchNav('agent-operations')"],['supplier-watchtower',"switchNav('supplier-portal');switchSupplierTab('watchtower')"],['supplier-pcn',"switchNav('supplier-portal');switchSupplierTab('intake');setSupplierTicketType('PCN')"],['supplier-issue',"switchNav('supplier-portal');switchSupplierTab('intake');setSupplierTicketType('Issue')"],...['D1','D2','D3','D4','D5','D6','D7','D8'].map(stage=>['stage-'+stage,`appData.currentView='stage';appData.activeStage='${stage}';renderCurrentView()`])];
  const emptyReport={label,cases:[],runtimeErrors:errors,isolation:'Disposable DB and browser; no live writes'};fs.mkdirSync(path.join(out,label),{recursive:true});
  for(const theme of ['dark','light'])for(const width of [1280,390]){
   await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});await evaluate(`applyTheme('${theme}');closeNavigationMenu()`);
   for(const [name,action] of emptyViews){await evaluate(action);await delay(100);const result=await evaluate(inspect);result.name=name;emptyReport.cases.push(result);
    if(name==='new-case')await assert("!document.getElementById('formClaimTitle').value&&!document.getElementById('inputDefectQty').value",'blank nonconformance form');
    if(name==='supplier-pcn'||name==='supplier-issue')await assert("!document.querySelector('[name=title]').value&&!document.querySelector('[name=description]').value&&!document.querySelector('#mainContentContainer').innerText.includes('Xray_Void_Defect_Inspection.png')",'blank supplier form and no mock attachments');
    if(width===1280&&['dashboard','supplier-watchtower'].includes(name)){const shot=await call('Page.captureScreenshot',{format:'png',fromSurface:true});fs.writeFileSync(path.join(out,label,`${theme}-${width}-${name}.png`),Buffer.from(shot.data,'base64'));}
   }
   console.log(theme+'/'+width+' empty views checked');
  }
  await evaluate("setSupplierTicketFixture([])");await assert("loadSupplierRecords().length===0",'stored empty supplier list remains empty');
  await evaluate("switchNav('new-case');document.getElementById('formClaimTitle').value='직접 작성한 새 임시 접수';saveIntakeDraft();");
  await call('Page.reload',{ignoreCache:true});await delay(300);for(let i=0;i<150;i++){if(await evaluate('window.QMS_APP_READY===true'))break;await delay(100);}await evaluate("switchNav('new-case')");
  await assert("document.getElementById('formClaimTitle').value==='직접 작성한 새 임시 접수'",'new intake draft persists after migration');
  await evaluate("switchNav('supplier-portal');switchSupplierTab('intake');setSupplierTicketType('PCN');");
  await evaluate(`(()=>{const form=document.querySelector('#mainContentContainer form');for(const [name,value] of Object.entries({customer:'UI 테스트 고객',partName:'UI 테스트 품목',partNumber:'UI-TEST-PART',lotNo:'UI-TEST-LOT',title:'직접 등록한 테스트 PCN',description:'테스트용 직접 입력',plant:'UI 테스트 Site',plannedSampleDate:'2026-10-03',plannedMassDate:'2026-10-10'})){const el=form.elements.namedItem(name);if(el)el.value=value;}for(const el of form.querySelectorAll('select[required]'))if(!el.value)el.selectedIndex=1;const file=new File(['actual test contents'],'actual-user-file.txt',{type:'text/plain'});handleSupplierFileUpload({target:{files:[file]}},'PCN');handleSupplierFormSubmit({preventDefault(){},target:form});appData.cases=[${JSON.stringify(visualCase)}];appData.activeCaseId=appData.cases[0].id;appData.currentView='dashboard';saveAppData();})()`);
  await assert("loadSupplierRecords().length===1&&loadSupplierRecords()[0].evidenceFiles.length===1&&loadSupplierRecords()[0].evidenceFiles[0].name==='actual-user-file.txt'",'manual PCN and only chosen file metadata');
  for(let i=0;i<150;i++){if(await evaluate('!QMSApi.getState().saveRunning'))break;await delay(100);}
  for(let reload=0;reload<2;reload++){await call('Page.reload',{ignoreCache:true});await delay(300);for(let i=0;i<150;i++){if(await evaluate('window.QMS_APP_READY===true'))break;await delay(100);}await assert("window.QMS_APP_READY===true&&appData.cases.length===1&&appData.cases[0].id==='UI-TEST-0001'&&loadSupplierRecords().length===1&&loadSupplierRecords()[0].details.title==='직접 등록한 테스트 PCN'",'new records persist after reload '+reload);}
  const failures=emptyReport.cases.filter(c=>c.contrast.length||c.clipped.length||c.collisions.length||c.contentOverflow>2);emptyReport.summary={checked:emptyReport.cases.length,failures:failures.length,runtimeErrors:errors.length,manualRecordReloads:2,legacyRecovery:true,mastersPreserved:true};fs.writeFileSync(path.join(out,label+'.json'),JSON.stringify(emptyReport,null,2));console.log(JSON.stringify(emptyReport.summary));if(failures.length||errors.length)throw new Error('Empty UI audit failed: '+failures.map(c=>c.theme+'/'+c.width+'/'+c.name).join(', '));return;
 }
 if(process.env.QMS_AUDIT_SUPPLIER_NOTICES_ONLY){
   await require('./supplier_notices_audit.cjs')({call,evaluate,inspect,delay,out,label,errors});return;
  }
  if(process.env.QMS_AUDIT_INTERNAL_ONLY){
  await require('./internal_quality_audit.cjs')({call,evaluate,inspect,delay,root,out,label,errors,origin});return;
 }
 if(process.env.QMS_AUDIT_EVIDENCE_ONLY){
  await require('./case_evidence_audit.cjs')({call,send,evaluate,inspect,delay,root,out,label,errors,visualCase,origin});return;
 }
 await evaluate(`saveAppData=()=>{};persistCurrentEditor=()=>true;appData.cases=[${JSON.stringify(visualCase)}];appData.activeCaseId=appData.cases[0].id;appData.intakeQueue=[{...JSON.parse(JSON.stringify(appData.cases[0])),intakeId:'UI-DEMO-001',status:'Quality Review Pending',submittedAt:'2026-10-02 10:30',evidenceList:[],intakeRouting:{registeredBy:{name:'UI 점검용 사용자',dept:'품질혁신팀'},primaryOwner:{name:'점검 담당자'}},riskSignals:{}}];setSupplierTicketFixture([{ticketId:'UI-TEST-PCN',ticketType:'PCN',status:'Submitted',createdAt:'2026-10-02 10:00',supplier:{category:'SMT_MODULE',companyName:'TechL',plant:'',submitter:'UI 점검 담당자',email:'ui@example.invalid'},targetProduct:{customer:'UI 점검 고객',partName:'UI 점검 품목',partNumber:'UI-TEST-PART',lotNo:'UI-TEST-LOT'},classification:{change4M:['Method'],riskLevel:'MINOR',reasonType:'Quality_Improvement'},details:{title:'UI 점검용 변경 요청',description:'운영 등록 아님',comparisonTable:[],plannedSampleDate:'',plannedMassDate:''},evidenceFiles:[],sqeReview:{}}]);renderCaseSelector();renderCurrentView();`);

 if(process.env.QMS_AUDIT_TRIAGE_RESULT_ONLY){
  await require('./triage_result_audit.cjs')({call,evaluate,inspect,delay,out,label,errors});return;
 }
 if(process.env.QMS_AUDIT_D2_KOREAN_ONLY){
  await require('./d2_korean_audit.cjs')({call,evaluate,inspect,delay,root,out,label,errors});return;
 }
 if(process.env.QMS_AUDIT_DESIGN_ONLY){
  await require('./ui_design_audit.cjs')({call,send,evaluate,inspect,delay,root,out,label,errors,visualCase});return;
 }
 if(process.env.QMS_AUDIT_CONSISTENCY_ONLY){
  const report={label,isolation:'Disposable database/browser; synthetic UI data only; no business approvals or external AI',cases:[],runtimeErrors:errors,headerStyles:[]};
  const action=async(name,code,theme,width)=>{
   await evaluate("closeStageReviewModal();closeDocumentViewer();closeModal();document.getElementById('globalModal').style.display='none';switchSidebarTab('menu');"+code);await delay(200);
   const result=await evaluate(inspect);result.name=name;report.cases.push(result);
   if(name.startsWith('header-')){
    const style=await evaluate("(()=>{const header=document.querySelector('.qms-page-header'),title=header?.querySelector('h1,h2,.portal-brand-title');if(!header||!title)return null;const h=getComputedStyle(header),t=getComputedStyle(title);return{radius:h.borderRadius,background:h.backgroundColor,titleSize:t.fontSize,titleWeight:t.fontWeight,titleFont:t.fontFamily,width:header.getBoundingClientRect().width,mainWidth:(()=>{const main=document.getElementById('mainContentContainer'),s=getComputedStyle(main);return main.clientWidth-parseFloat(s.paddingLeft)-parseFloat(s.paddingRight)})()};})()");
    if(!style||Math.abs(style.width-style.mainWidth)>2)throw new Error('Shared heading width mismatch '+name+' '+JSON.stringify(style));
    report.headerStyles.push({name,theme,viewportWidth:width,...style});
   }
   if(['header-agent','header-triage','header-supplier','header-stage-D1','review-D1','review-D4'].includes(name)&&(width===1600||width===390)){
    const shot=await call('Page.captureScreenshot',{format:'png',fromSurface:true});
    fs.writeFileSync(path.join(out,label,theme+'-'+width+'-'+name+'.png'),Buffer.from(shot.data,'base64'));
   }
   fs.writeFileSync(path.join(out,label+'.json'),JSON.stringify(report,null,2));
  };
  fs.mkdirSync(path.join(out,label),{recursive:true});
  const headers=[['agent',"switchNav('agent-operations')"],['triage',"switchNav('intake-triage')"],['supplier',"switchNav('supplier-portal');switchSupplierTab('watchtower')"],['stage-D1',"appData.currentView='stage';appData.activeStage='D1';renderCurrentView()"]];
  for(const theme of ['dark','light'])for(const width of [1600,1280,1024,768,390]){
   await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});await evaluate("applyTheme('"+theme+"');closeNavigationMenu()");
   for(const [name,code] of headers)await action('header-'+name,code,theme,width);
   if(theme==='dark')for(const stage of ['D2','D3','D4','D5','D6','D7','D8'])await action('stage-'+stage,"appData.currentView='stage';appData.activeStage='"+stage+"';renderCurrentView()",theme,width);
   for(const stage of ['D1','D2','D3','D4','D5','D6','D7','D8'])await action('review-'+stage,"appData.currentView='stage';appData.activeStage='"+stage+"';renderCurrentView();openStageReviewModal('"+stage+"')",theme,width);
   if(width===1280||width===390)for(const state of ['Submitted','LeaderApproved','Approved']){
    const actor={name:'UI 점검용 담당자',dept:'테스트 조직',signedAt:'2026-10-02 10:20'};
    await action('review-state-'+state,"getActiveCase().signOffHistory.D1="+JSON.stringify({status:state,drafter:actor,leader:state==='Submitted'?null:actor,champion:state==='Approved'?actor:null})+";openStageReviewModal('D1')",theme,width);
    await evaluate("getActiveCase().signOffHistory.D1={status:'Draft',drafter:null,leader:null,champion:null}");
   }
   console.log(theme+'/'+width+' shared headings and stage review modals checked');
  }
  await evaluate("closeStageReviewModal()");
  const failures=report.cases.filter(c=>c.contrast.length||c.clipped.length||c.collisions.length||c.contentOverflow>2);
  for(const theme of ['dark','light'])for(const width of [1600,1280,1024,768,390]){
   const styles=report.headerStyles.filter(s=>s.theme===theme&&s.viewportWidth===width);
   if(new Set(styles.map(s=>JSON.stringify([s.radius,s.background,s.titleSize,s.titleWeight,s.titleFont]))).size!==1)throw new Error('Page heading styles diverged: '+JSON.stringify(styles));
  }
  report.summary={checked:report.cases.length,failures:failures.length,runtimeErrors:errors.length,consistentHeadings:report.headerStyles.length};
  fs.writeFileSync(path.join(out,label+'.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report.summary));
  if(failures.length||errors.length)throw new Error('Consistency/modal audit failed: '+failures.map(c=>c.theme+'/'+c.width+'/'+c.name).join(', '));
  return;
 }

 const views=[['dashboard',"switchNav('dashboard')"],['new-case',"switchNav('new-case')"],['intake-triage',"switchNav('intake-triage')"],['cases-list',"switchNav('cases-list')"],['case-overview',"appData.currentView='stage';appData.activeStage='overview';renderCurrentView()"],['evidence-hub',"switchNav('evidence-hub')"],['actions-hub',"switchNav('actions-hub')"],...['gate3D','gate5D','gate8D'].map(g=>['report-'+g,`switchNav('reports-hub');setGateTab('${g}')`]),['supplier-watchtower',"switchNav('supplier-portal');switchSupplierTab('watchtower')"],['supplier-pcn',"switchNav('supplier-portal');switchSupplierTab('intake');setSupplierTicketType('PCN')"],['supplier-issue',"switchNav('supplier-portal');switchSupplierTab('intake');setSupplierTicketType('Issue')"],['supplier-detail',"switchNav('supplier-portal');switchSupplierTab('watchtower');openSupplierTicketModal(loadSupplierRecords()[0].ticketId)"],['mission-control',"switchNav('mission-control')"],['agent-operations',"switchNav('agent-operations')"],...['D1','D2','D3','D4','D5','D6','D7','D8'].map(s=>['stage-'+s,`appData.currentView='stage';appData.activeStage='${s}';renderCurrentView()`]),['organization',"switchNav('dashboard');switchSidebarTab('org');expandAllOrgTree(true)"],['document-viewer',"switchNav('supplier-portal');openDocumentViewer('UI_DEMO_Murata_Specification_with_a_very_long_file_name_for_readability.pdf')"],['coq-popup',"switchNav('dashboard');openCoqSimulatorModal()"],['notification-popup',"switchNav('dashboard');openNotificationModal()"],['sla-popup',"switchNav('dashboard');openSlaTimelineModal()"],['ai-assistant-popup',"switchNav('dashboard');openAIAssistantModal()"],['pre-submission-popup',"switchNav('reports-hub');openCustomerAiGatekeeperModal(null,'gate3D')"]];
 const report={label,isolation:'Disposable SQLite and browser; built-in benchmark case and in-memory synthetic intake; no operational writes or external AI',cases:loginChecks,runtimeErrors:errors};
 fs.mkdirSync(path.join(out,label),{recursive:true});
 for(const theme of ['dark','light'])for(const width of (process.env.QMS_AUDIT_EDGE_ONLY?[390]:[1600,1280,1024,768,390])){
  await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});await evaluate(`applyTheme('${theme}')`);
  for(const [name,action]of (process.env.QMS_AUDIT_EDGE_ONLY?views.filter(v=>['report-gate3D','report-gate5D','report-gate8D','document-viewer','supplier-pcn'].includes(v[0])):views)){await evaluate("closeNavigationMenu()");await evaluate("closeDocumentViewer();closeModal();document.getElementById('globalModal').style.display='none';switchSidebarTab('menu');"+action);if(name==='organization'&&width<=900)await evaluate("toggleNavigationMenu()");if(name==='stage-D4')await evaluate("document.querySelectorAll('.d4-library-group').forEach(d=>d.open=true)");await delay(250);const r=await evaluate(inspect);r.name=name;report.cases.push(r);
   if((width===1600||width===768||width===390)&&['dashboard','new-case','supplier-pcn','supplier-issue','stage-D2','stage-D4','report-gate3D','agent-operations','organization'].includes(name)){const shot=await call('Page.captureScreenshot',{format:'png',fromSurface:true});fs.writeFileSync(path.join(out,label,`${theme}-${width}-${name}.png`),Buffer.from(shot.data,'base64'));}
  }
  console.log(theme+' '+width+': checked '+views.length+' screens');fs.writeFileSync(path.join(out,label+'.json'),JSON.stringify(report,null,2));
 }
 // Verify that both themes persist and that mobile navigation can reopen and close.
 await call('Emulation.setDeviceMetricsOverride',{width:390,height:1000,deviceScaleFactor:1,mobile:false});
 const navigation=await evaluate(`(()=>{closeNavigationMenu();toggleNavigationMenu();const opened=document.getElementById('mobileNavToggle').getAttribute('aria-expanded')==='true'&&getComputedStyle(document.getElementById('sidebarMenuView')).display!=='none';document.querySelector('#navItemDashboard').click();const closed=document.getElementById('mobileNavToggle').getAttribute('aria-expanded')==='false'&&getComputedStyle(document.getElementById('sidebarMenuView')).display==='none';applyTheme('light');const light=localStorage.getItem('RAMOS_THEME')==='light';applyTheme('dark');const dark=localStorage.getItem('RAMOS_THEME')==='dark';const warning=document.querySelector('.header-sla-chip.sla-badge-overdue');const warningReadable=!!warning&&getComputedStyle(warning).animationName==='none'&&getComputedStyle(warning).opacity==='1'&&getComputedStyle(warning.querySelector('.sla-chip-title')).opacity==='1';return{opened,closed,light,dark,warningReadable};})()`);
 report.navigation=navigation;
 if(!Object.values(navigation).every(Boolean))throw new Error('Theme/navigation check failed '+JSON.stringify(navigation));
 report.printChecks=[];await call('Emulation.setDeviceMetricsOverride',{width:1600,height:1000,deviceScaleFactor:1,mobile:false});
 for(const gate of ['gate3D','gate5D','gate8D']){await evaluate(`closeDocumentViewer();closeModal();switchNav('reports-hub');setGateTab('${gate}')`);const pdf=await call('Page.printToPDF',{printBackground:true,preferCSSPageSize:true});report.printChecks.push({gate,bytes:Buffer.from(pdf.data,'base64').length});}
 for(const username of ['thkwon','yspark','sangwook.ki','ojs']){
 await evaluate(`handleQuickLogin('${username}')`);await delay(300);
 for(const theme of ['dark','light'])for(const width of [1600,390]){
  await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});await evaluate(`applyTheme('${theme}');closeNavigationMenu()`);
  for(const [suffix,action]of [['watchtower',"switchNav('supplier-portal');switchSupplierTab('watchtower')"],['pcn',"switchSupplierTab('intake');setSupplierTicketType('PCN')"],['issue',"switchSupplierTab('intake');setSupplierTicketType('Issue')"]]){
   await evaluate(action);await delay(100);const r=await evaluate(inspect);r.name=username+'-'+suffix;r.account=await evaluate('CURRENT_USER.username');if(r.account!==username)throw new Error('Wrong supplier account '+r.account);report.cases.push(r);
  }
 }
 console.log('Checked supplier '+username);fs.writeFileSync(path.join(out,label+'.json'),JSON.stringify(report,null,2));
}
const failures=report.cases.filter(c=>c.contrast.length||c.clipped.length||c.collisions.length||c.contentOverflow>2);report.summary={checked:report.cases.length,failures:failures.length,runtimeErrors:errors.length};fs.writeFileSync(path.join(out,label+'.json'),JSON.stringify(report,null,2));console.log('Completed '+report.cases.length+' screen checks; failures '+failures.length+'; runtime errors '+errors.length);if(failures.length||errors.length)throw new Error('UI audit failed: '+failures.map(c=>c.theme+'/'+c.width+'/'+c.name).join(', '));
})().catch(e=>{console.error(e.stack);process.exitCode=1;}).finally(async()=>{if(socket?.readyState===1){try{await send('Browser.close');}catch{}socket.close();}if(browser?.exitCode===null)browser.kill();if(server?.exitCode===null)server.kill();});
