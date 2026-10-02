/* Reuses the disposable server/browser harness; actual picker, storage and bytes. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
module.exports=async function({call,send,evaluate,inspect,delay,root,out,label,errors,visualCase,origin}){
 const report={label,isolation:'Disposable SQLite and browser; no production records or signing events, no external AI.',checks:[],cases:[],runtimeErrors:errors};
 const checked=async(expression,name)=>{const pass=await evaluate(expression);report.checks.push({name,pass});if(!pass)throw new Error(name+' '+JSON.stringify(await evaluate("({notice:caseEvidenceNotice,alerts:window.evidenceAlerts})")));};
 await evaluate(`window.evidenceAlerts=[];window.alert=message=>evidenceAlerts.push(message);appData.cases=[${JSON.stringify(visualCase)}];appData.activeCaseId=appData.cases[0].id;appData.currentView='stage';appData.activeStage='D2';renderCurrentView();saveAppData();QMSApi.flushSaves()`);
 fs.mkdirSync(path.join(out,label),{recursive:true});
 await checked("!!document.querySelector('#d2QualityForm #caseEvidenceAttachButton')",'Visible direct D2 upload');
 await checked("(async()=>{const ok=await verifyD2Evidence(getActiveCase());return !ok&&document.getElementById('caseEvidenceStatus').innerText.includes('파일 첨부');})()",'Empty Evidence blocks with direct upload guidance');
 const originalPath=path.join(root,'output/imagegen/20261002_emmc_email/emmc_nonconformance_email_test.png');
 const originalBytes=fs.readFileSync(originalPath),hash=crypto.createHash('sha256').update(originalBytes).digest('hex');
 await evaluate("document.querySelector('[name=problemWhat]').value='작성 중인 사실은 첨부 후에도 유지';document.getElementById('caseEvidenceType').value='Customer original'");
 await call('DOM.enable');const doc=await call('DOM.getDocument',{depth:-1});const picker=await call('DOM.querySelector',{nodeId:doc.root.nodeId,selector:'#caseEvidenceFileInput'});
 await call('DOM.setFileInputFiles',{nodeId:picker.nodeId,files:[originalPath]});
 for(let i=0;i<300;i++){if(await evaluate("!caseEvidenceUploading&&getActiveCase().evidenceList.length===1"))break;await delay(100);}
 await checked("getActiveCase().evidenceList.length===1&&!!getActiveCase().evidenceList[0].serverFileId&&getActiveCase().evidenceList[0].linkedStages.join()==='D2'",'Real picker stores original and D2 link');
 await checked("getActiveCase().d2.problemWhat==='작성 중인 사실은 첨부 후에도 유지'&&document.querySelector('[name=problemWhat]').value==='작성 중인 사실은 첨부 후에도 유지'",'Unsaved D2 text preserved');
 await checked(`getActiveCase().evidenceList[0].sha256==='${hash}'`,'Stored SHA256 equals image original');
 await checked("retrieveCaseEvidenceFile(getActiveCase(),getActiveCase().evidenceList[0]).then(f=>f.size==="+originalBytes.length+")",'Real original retrieval');
 await checked("collectD2EvidencePayload(getActiveCase(),getD2IntakeSourceContext(getActiveCase())).then(p=>p.attachments.length===1&&p.loadedNames.length===1)",'AI input receives real image without AI call');
 await evaluate('QMSApi.flushSaves()');await call('Page.reload',{ignoreCache:true});await delay(200);
 for(let i=0;i<150;i++){if(await evaluate('window.QMS_APP_READY===true'))break;await delay(100);}
 await evaluate("appData.currentView='stage';appData.activeStage='D2';renderCurrentView()");
 await checked("getActiveCase().evidenceList.length===1&&document.querySelector('.case-evidence-list').innerText.includes('QMS 원본 보관')",'Original linkage survives reload');
 const separate=await send('Target.createBrowserContext'),secondTarget=await send('Target.createTarget',{url:origin,browserContextId:separate.browserContextId}),second=await send('Target.attachToTarget',{targetId:secondTarget.targetId,flatten:true});
 const secondEval=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},second.sessionId);if(r.exceptionDetails)throw new Error(r.exceptionDetails.text);return r.result.value;};
 for(let i=0;i<150;i++){if(await secondEval("typeof QMSApi !== 'undefined'"))break;await delay(100);}
 const separateHash=await secondEval("(async()=>{await QMSApi.login('hskim','1');const p=await QMSApi.request('/__api__/qms/state'),c=p.record.state.cases[0],file=await QMSApi.fetchCaseEvidence(c.id,c.evidenceList[0].serverFileId);return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer())),v=>v.toString(16).padStart(2,'0')).join('');})()");
 report.checks.push({name:'Separate browser and reviewer retrieves byte-identical original',pass:separateHash===hash});if(separateHash!==hash)throw new Error('Shared original differs');await send('Target.disposeBrowserContext',{browserContextId:separate.browserContextId});
 await checked("(async()=>{const count=getActiveCase().evidenceList.length,real=QMSApi.uploadCaseEvidence;QMSApi.uploadCaseEvidence=async()=>{throw new Error('isolated upload failure')};try{await uploadSelectedCaseEvidence([new File(['test'],'failure.txt',{type:'text/plain'})]);return getActiveCase().evidenceList.length===count&&document.getElementById('caseEvidenceStatus').innerText.includes('완료하지 못했습니다');}finally{QMSApi.uploadCaseEvidence=real}})()",'Failed upload creates no pretend file');
 await evaluate("caseEvidenceNotice='';caseEvidenceNoticeCase='';renderCurrentView()");
 for(const theme of ['dark','light'])for(const width of [1280,390]){
  await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});await evaluate("applyTheme('"+theme+"');closeNavigationMenu()");
  for(const [name,action] of [['d2',"appData.currentView='stage';appData.activeStage='D2';renderCurrentView()"],['evidence-hub',"switchNav('evidence-hub')"],['original-preview',"previewCaseEvidence(0)"]]){
   await evaluate("closeCaseEvidencePreview();"+action);await delay(180);const result=await evaluate(inspect);result.name=name;report.cases.push(result);
   const shot=await call('Page.captureScreenshot',{format:'png',fromSurface:true});fs.writeFileSync(path.join(out,label,theme+'-'+width+'-'+name+'.png'),Buffer.from(shot.data,'base64'));
   if(name==='original-preview')await checked("!!document.querySelector('.case-evidence-preview img')&&document.querySelector('.case-evidence-preview img').naturalWidth>0",'Real image preview '+theme+'/'+width);
  }
  await evaluate('closeCaseEvidencePreview()');
 }
 await evaluate("appData.currentView='stage';appData.activeStage='D2';renderCurrentView()");
 // Existing D1 signing is represented only by a disposable fixture, without a real approval API call.
 await evaluate("(()=>{const c=getActiveCase();c.team=getAICFTRecommendations(c).map(m=>({...m,status:'Active',acknowledged:true}));c.cftRecommendation.humanConfirmed=true;c.cftRaci.acknowledged=true;c.signOffHistory={D1:{status:'Approved',drafter:{name:'UI fixture'},leader:{name:'UI fixture'},champion:{name:'UI fixture'}}};c.signOffHistory.D1.snapshot=approvalSnapshot(c,'D1');c.d2.isIsNot=[{factor:'LOT',is:'시험 LOT',isNot:'비교 LOT',difference:'원본 확인 차이',verificationStatus:'Verified'}];renderCurrentView();for(const field of d2SourceFieldNames())document.querySelector('[name='+field+']').value='테스트에서 사람이 확인한 '+field;document.querySelector('[name=humanConfirmed]').checked=true;})()");
 await checked("isD1StageComplete(getActiveCase())",'Signed D1 prerequisite fixture valid');
 // Save the signed fixture before the test edits so normal approval reconciliation does not interpret them as D1 edits.
 await evaluate("localStorage.setItem(STORAGE_KEY,JSON.stringify(appData));evidenceAlerts=[];saveD2ProblemDefinition(true)");
 await checked("!!document.querySelector('#stageReviewModalBackdrop .report-paper, #stageReviewModalBackdrop .stage-report-paper')&&getActiveCase().signOffHistory.D2?.status!=='Approved'&&!evidenceAlerts.length",'D2 opens human review without auto approval');
 await evaluate('closeStageReviewModal()');
 await checked("(()=>{const c=getActiveCase(),before=approvalContent(c,'D1');c.evidenceList.push({id:'scope-test',stageScoped:true,linkedStages:['D2'],serverFileId:'scope-test',type:'Measurement'});const same=before===approvalContent(c,'D1');c.evidenceList.pop();return same;})()",'D2 attachment leaves existing D1 snapshot valid');
 await checked("(async()=>{const c=getActiveCase(),old=c.evidenceList;c.evidenceList=[{id:'missing',linkedStages:['D2'],storageKey:'nonexistent',type:'Customer original'},{id:'D4-only',linkedStages:['D4'],serverFileId:old[0].serverFileId,type:'FA Analysis'}];try{return !await verifyD2Evidence(c);}finally{c.evidenceList=old;}})()",'Missing and D4-only originals do not bypass D2');
 await evaluate("switchNav('evidence-hub');document.getElementById('caseEvidenceStage').value='D3';document.getElementById('caseEvidenceType').value='Measurement';uploadSelectedCaseEvidence([new File(['actual measurement test'],'measurement.csv',{type:'text/csv'})])");
 await checked("getActiveCase().evidenceList.length===2&&getActiveCase().evidenceList[1].linkedStages.join()==='D3'&&getActiveCase().evidenceList[1].type==='Measurement'",'Hub preserves selected stage and type');
 await checked("isD1StageComplete(getActiveCase())",'Real subsequent upload keeps D1 signature valid');
 const downloadDir=path.join(out,label,'downloads');fs.mkdirSync(downloadDir,{recursive:true});await send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:downloadDir});await evaluate('downloadCaseEvidence(0)');
 const downloaded=path.join(downloadDir,path.basename(originalPath));for(let i=0;i<100&&!fs.existsSync(downloaded);i++)await delay(100);
 const downloadOK=fs.existsSync(downloaded)&&fs.readFileSync(downloaded).equals(originalBytes);report.checks.push({name:'Downloaded original is byte-identical',pass:downloadOK});if(!downloadOK)throw new Error('Download failed');
 const failures=report.cases.filter(c=>c.contrast.length||c.clipped.length||c.collisions.length||c.contentOverflow>2);report.summary={functionalChecks:report.checks.length,screenChecks:report.cases.length,failures:failures.length,runtimeErrors:errors.length};fs.writeFileSync(path.join(out,label+'.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report.summary));if(failures.length||errors.length)throw new Error('Evidence UI audit failed: '+failures.map(c=>c.theme+'/'+c.width+'/'+c.name).join(', '));
};
