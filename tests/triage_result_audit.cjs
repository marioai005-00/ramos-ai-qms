/* Stored review rendering: isolated fixture, no business write or approval. */
const fs=require('node:fs'),path=require('node:path');
module.exports=async({call,evaluate,inspect,delay,out,label,errors})=>{
 const report={label,isolation:'Disposable server and browser; stored decision fixtures only; no live saves, AI or approvals',checks:[],cases:[],runtimeErrors:errors};
 const check=async(code,name)=>{if(!await evaluate(code))throw new Error(name);report.checks.push(name)};
 const note='**품질 검토 종합 의견 및 8D 발행 판정 근거**\n\n1. **발생 현상과 고객 영향**\n   - 최종 검사에서 **eMMC 부팅 인식 실패**가 접수되었습니다.\n   - 검사 수량 **8 / 1000 (8000 PPM)**과 원본을 확인한 화면 테스트입니다.\n\n2. **8D 발행 판단**\n   - 긴 품번 KEEP-PN-012345678901234567890123456789와 Lot KEEP-LOT-012345678901234567890123456789를 보존합니다.\n\n3. **초동 대응 계획**\n   - **24시간** 대응 계획을 검토하며 미확인 결과는 완료로 기록하지 않습니다.\n\n4. **원인 분석과 후속 조치**\n   - 테스트용 담당 부서에서 자료를 확인합니다.\n\n> **검토 결론**\n> 이 문서는 화면 점검용 저장 의견입니다.';
 await evaluate(`window.triageDisplayOriginal=JSON.stringify(appData);window.testReview=${JSON.stringify({status:'Approved',triage:{finalSeverity:'Critical',requires8D:true,slaHours:24,leadDepartment:'Flash 개발실',reviewNote:note,decidedAt:'2026-10-02 00:59',decidedBy:{name:'화면 점검 담당자',position:'Pro',dept:'품질혁신팀'},approvedCaseId:'UI-TEST-0001'}})};window.viewResult=(status='Approved',reviewNote=testReview.triage.reviewNote)=>{const item=appData.intakeQueue[0];Object.assign(item,{status,triage:{...testReview.triage,reviewNote,approvedCaseId:status==='Approved'?'UI-TEST-0001':''}});appData.activeIntakeId=item.intakeId;switchNav('intake-triage');};viewResult();`);
 await check("document.querySelector('.tdr-note')&&!document.querySelector('.tdr-note').open&&document.querySelector('.tdr-facts').innerText.includes('Critical')&&document.querySelector('.tdr-facts').innerText.includes('24시간')",'compact result with persisted decision values');
 await check("document.querySelector('.tdr-note-body').querySelectorAll('h4').length===4&&document.querySelector('.tdr-note-body').querySelectorAll('ul').length===4&&!document.querySelector('.tdr-note-body').innerText.includes('**')",'numbered sections lists and emphasis rendered');
 await check("document.querySelector('.tdr-note-body').textContent.includes('8 / 1000 (8000 PPM)')&&document.querySelector('.tdr-note-body').textContent.includes('KEEP-LOT-012345678901234567890123456789')&&appData.intakeQueue[0].triage.reviewNote===testReview.triage.reviewNote",'source identifiers numbers and saved opinion untouched');
 await check("document.querySelector('.tdr-note-body blockquote').textContent.includes('검토 결론')",'source conclusion displayed as quote');
 await evaluate("document.querySelector('.tdr-note>summary').click()");
 await check("document.querySelector('.tdr-note').open&&getComputedStyle(document.querySelector('.tdr-note-open')).display!=='none'",'native opinion expand works');
 await evaluate("document.querySelector('.tdr-note>summary').click()");await check("!document.querySelector('.tdr-note').open",'native opinion collapse works');
 await evaluate("window.triageDisplayOpenedId='';window.actualOpenIntakeCase=openApprovedIntakeCase;openApprovedIntakeCase=id=>{triageDisplayOpenedId=id};document.querySelector('.tdr-footer button').click();openApprovedIntakeCase=actualOpenIntakeCase");
 await check("triageDisplayOpenedId==='UI-TEST-0001'",'linked Case action retains exact ID');
 await evaluate("viewResult('Rejected','검토 입력 <img src=x onerror=window.REVIEW_XSS=1> **원본 확인**\\n다음 문장');document.querySelector('.tdr-note').open=true");
 await check("!document.querySelector('.tdr-result img')&&window.REVIEW_XSS!==1&&document.querySelector('.tdr-note-body').innerText.includes('<img src=x onerror=window.REVIEW_XSS=1>')",'HTML in saved opinion remains safe visible text');
 await evaluate("viewResult('Rejected','1. 일반 번호 목록\\n2. 다음 목록\\n\\n일반 문단\\n다음 줄');document.querySelector('.tdr-note').open=true");
 await check("document.querySelectorAll('.tdr-note-body ol li').length===2&&document.querySelector('.tdr-note-body p').innerText.includes('다음 줄')",'plain text ordered list and line breaks supported');
 await evaluate("viewResult('Revision Requested','')");await check("document.querySelector('.tdr-state').innerText.includes('보완')&&document.querySelector('.tdr-empty-note')&&!document.querySelector('.tdr-footer')",'missing opinion and no linked Case are honest');
 const cases=[['approved-compact',"viewResult();"],['approved-open',"viewResult();document.querySelector('.tdr-note').open=true"],['revision-open',"viewResult('Revision Requested');document.querySelector('.tdr-note').open=true"],['rejected-compact',"viewResult('Rejected')"],['empty-opinion',"viewResult('Approved','')"],['long-open',"viewResult('Approved',testReview.triage.reviewNote.repeat(5));document.querySelector('.tdr-note').open=true"]];
 fs.mkdirSync(path.join(out,label),{recursive:true});
 for(const theme of ['light','dark'])for(const width of [1600,1280,768,390]){
  await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});await evaluate(`applyTheme('${theme}');closeNavigationMenu()`);
  for(const [name,action]of cases){await evaluate(action);await delay(220);const r=await evaluate(inspect);r.name=name;report.cases.push(r);
   if(name==='approved-compact'){const height=await evaluate("document.querySelector('.tdr-result').getBoundingClientRect().height");if(width>=1280&&height>360)throw new Error('Compact review result too tall '+height);}
  }console.log(theme+'/'+width+' approval result states checked');
 }
 await evaluate("viewResult();window.originalRenderedNote=appData.intakeQueue[0].triage.reviewNote;for(let i=0;i<3;i++){renderCurrentView();document.querySelector('.tdr-note').open=true;document.querySelector('.tdr-note').open=false;}");await check("appData.intakeQueue[0].triage.reviewNote===originalRenderedNote",'repeated viewing never edits stored source');
 report.summary={functionalChecks:report.checks.length,screenChecks:report.cases.length,failures:report.cases.filter(c=>c.contrast.length||c.clipped.length||c.collisions.length||c.contentOverflow>2).length,runtimeErrors:errors.length};fs.writeFileSync(path.join(out,label+'.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report.summary));if(report.summary.failures||errors.length)throw new Error('Review layout issues: '+report.cases.filter(c=>c.contrast.length||c.clipped.length||c.collisions.length||c.contentOverflow>2).map(c=>c.theme+'/'+c.width+'/'+c.name).join(', '));
 if(process.env.QMS_AUDIT_TRIAGE_SHOT){
  for(const [theme,width,expanded]of [['light',1280,false],['light',1280,true],['dark',1280,true],['light',390,true]]){
   await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});
   await evaluate(`applyTheme('${theme}');viewResult();document.querySelector('.tdr-note').open=${expanded};document.querySelector('.tdr-result').scrollIntoView({block:'start'});`);await delay(300);
   const shot=await call('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false});fs.writeFileSync(path.join(out,label,`${theme}-${width}-${expanded?'open':'compact'}.png`),Buffer.from(shot.data,'base64'));
  }
 }
};
