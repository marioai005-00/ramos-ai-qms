/* Authenticated UI tests use a disposable database and browser. */
const fs=require('node:fs'),path=require('node:path');
module.exports=async({call,evaluate,inspect,delay,out,label,errors})=>{
 const report={label,isolation:'Disposable DB and Edge; no production records, email or external AI',checks:[],cases:[],runtimeErrors:errors};
 const assert=async(code,name)=>{if(!await evaluate(code))throw new Error(name);report.checks.push(name)};
 const wait=async code=>{for(let i=0;i<100;i++){if(await evaluate(code))return;await delay(100)}throw new Error('UI wait '+code)};
 const shotDir=path.join(out,label);fs.mkdirSync(shotDir,{recursive:true});
 await evaluate('saveAppData=()=>{};persistCurrentEditor=()=>true;switchNav("internal-issues")');
 await wait("document.querySelector('#internalQualityTable')?.innerText.includes('신규 등록 버튼')");
 await assert("document.querySelector('#nav-internal-issues')&&document.querySelector('#nav-internal-pcn')&&document.querySelector('#nav-supplier-issues')",'distinct navigation');
 async function create(kind){
  await evaluate(`switchNav('${kind==='PCN'?'internal-pcn':'internal-issues'}')`);await delay(200);await evaluate('newInternalQuality()');
  const fields={title:kind==='PCN'?'내부 PCN 실제 입력 테스트 · 공정 조건 변경':'내부 부적합 실제 입력 테스트 · 제품 인식 실패',description:'확인된 현상 <img src=x onerror=window.INTERNAL_XSS=1> '+('긴 한글 설명 '.repeat(12)),department:'품질혁신팀',owner:'검증용 담당자',site:'Ramos 3Camp',process:'최종 검사',product:'eMMC 테스트용 제품',partNumber:'KEEP-PART-CODE-012345678901234567890123456789',lotNo:'KEEP-LOT-CODE-012345678901234567890123456789',issueType:'Nonconformance',occurredAt:'2026-10-02T09:30',inputQty:'1000',defectQty:'8',containment:'봉쇄 검토 중',beforeChange:'기존 조건',afterChange:'제안 조건',changeReason:'조건 관리 개선',validationPlan:'비교 시험 계획 · 결과 미확인',plannedDate:'2026-10-10'};
  await evaluate(`(()=>{const form=document.getElementById('internalQualityForm');for(const [key,value] of Object.entries(${JSON.stringify(fields)})){const el=form.elements.namedItem(key);if(el)el.value=value;}const box=form.querySelector('[name=change4M][value=Method]');if(box)box.checked=true;const t=new DataTransfer();t.items.add(new File(['actual original bytes'],'실측 원본 테스트.txt',{type:'text/plain'}));form.querySelector('[type=file]').files=t.files;internalQualityCapture(form);})()`);
  await evaluate('handleInternalQualitySubmit({preventDefault(){},target:document.getElementById("internalQualityForm")})');
  await wait("document.querySelector('.iq-success')?.innerText.includes('저장 완료')");
  return await evaluate("document.querySelector('.iq-card-heading .iq-code').innerText");
 }
 const issueId=await create('Issue'),pcnId=await create('PCN');
 await assert("window.INTERNAL_XSS!==1&&!document.querySelector('.iq-info img')",'stored text escaped');
 await assert(`(async()=>{const i=(await QMSApi.request('/__api__/qms/internal-quality?kind=Issue')).items,p=(await QMSApi.request('/__api__/qms/internal-quality?kind=PCN')).items;return i.length===1&&p.length===1&&i[0].ticketId==='${issueId}'&&p[0].ticketId==='${pcnId}'&&i[0].status==='Submitted'&&p[0].status==='Submitted'&&i[0].createdBy.username==='sjkim'})()`,'separate server lists and author');
 await assert(`(async()=>{const r=(await QMSApi.request('/__api__/qms/internal-quality/${issueId}')).record;const response=await fetch('/__api__/qms/internal-quality/'+r.ticketId+'/files/'+r.files[0].id);return await response.text()==='actual original bytes'})()`,'original download exact bytes');
 await evaluate(`switchNav('internal-issues');internalQualityOpen('detail','${issueId}')`);
 await evaluate(`(()=>{const f=document.getElementById('internalQualityUpdateForm');f.elements.namedItem('owner').value='수정한 담당자';f.elements.namedItem('comment').value='배정 확인';return handleInternalQualityUpdate({preventDefault(){},target:f})})()`);
 await assert("document.querySelector('.iq-info-grid').innerText.includes('수정한 담당자')",'owner update persisted');
 await evaluate(`(()=>{const f=document.getElementById('internalQualityUpdateForm');f.elements.namedItem('nextStatus').value='UnderReview';f.elements.namedItem('comment').value='품질 검토자 확인';return handleInternalQualityUpdate({preventDefault(){},target:f})})()`);
 await assert("document.querySelector('.iq-card-heading').innerText.includes('검토 중')",'human review transition');
 await evaluate(`(()=>{const f=document.getElementById('internalQualityUpdateForm');f.elements.namedItem('nextStatus').value='InProgress';f.elements.namedItem('comment').value='조치 시작';return handleInternalQualityUpdate({preventDefault(){},target:f})})()`);
 await evaluate(`(()=>{const f=document.getElementById('internalQualityUpdateForm');f.elements.namedItem('nextStatus').value='Closed';f.elements.namedItem('comment').value='검증 결과 없이 종결 시도';return handleInternalQualityUpdate({preventDefault(){},target:f})})()`);
 await assert("document.querySelector('#internalQualityError').innerText.includes('검증 결과')&&document.querySelector('.iq-card-heading').innerText.includes('조치 중')",'close without verification rejected in UI');
 await evaluate(`switchNav('internal-pcn');internalQualityOpen('detail','${pcnId}');editInternalQuality('${pcnId}')`);
 await evaluate(`(()=>{const f=document.getElementById('internalQualityForm');f.elements.namedItem('title').value='내부 PCN 수정 완료';f.elements.namedItem('comment').value='개요 수정';return handleInternalQualitySubmit({preventDefault(){},target:f})})()`);
 await assert("document.querySelector('.iq-card-heading').innerText.includes('내부 PCN 수정 완료')",'submitted PCN edits persisted');
 await evaluate("newInternalQuality();document.querySelector('[name=title]').value='작성 중 PCN 초안';internalQualityCapture(document.getElementById('internalQualityForm'));switchNav('internal-issues');switchNav('internal-pcn')");
 await assert("document.querySelector('[name=title]').value==='작성 중 PCN 초안'",'internal drafts survive navigation');
 const supplierRecords=['PCN','Issue'].map(type=>({ticketId:'SPLIT-'+type.toUpperCase(),ticketType:type,status:'Submitted',createdAt:'2026-10-02 09:00',supplier:{companyName:'TechL',category:'SMT_MODULE',submitter:'권태훈 부장',email:'thkwon@techl.co.kr'},targetProduct:{partName:'분리 '+type+' 품목',partNumber:type+'-PN',lotNo:type+'-LOT'},classification:{change4M:type==='PCN'?['Method']:[],riskLevel:'MINOR'},details:{title:'외주 '+type+' 구분용',description:'테스트'},sqeReview:{}}));
 await evaluate(`setSupplierTicketFixture(${JSON.stringify(supplierRecords)});switchNav('supplier-pcn');switchSupplierTab('watchtower')`);
 await assert("document.querySelector('.supplier-grid-table').innerText.includes('SPLIT-PCN')&&!document.querySelector('.supplier-grid-table').innerText.includes('SPLIT-ISSUE')",'supplier PCN list exclusive');
 await evaluate("switchNav('supplier-issues');switchSupplierTab('watchtower')");
 await assert("document.querySelector('.supplier-grid-table').innerText.includes('SPLIT-ISSUE')&&!document.querySelector('.supplier-grid-table').innerText.includes('SPLIT-PCN')",'supplier Issue list exclusive');
 await evaluate("supplierPortalState.section='PCN';supplierPortalState.intakeForm.ticketType='PCN';appData.currentView='supplier-issues';renderCurrentView()");
 await assert("document.querySelector('.qms-page-header h1').innerText.includes('Issue')&&supplierPortalState.section==='Issue'",'supplier Issue route restores section');
 await evaluate("switchNav('supplier-pcn');switchSupplierTab('intake');document.querySelector('[name=title]').value='PCN 초안 보존';captureSupplierIntake(document.getElementById('supplierIntakeForm'));switchNav('supplier-issues');switchSupplierTab('intake');document.querySelector('[name=title]').value='Issue 초안 보존';captureSupplierIntake(document.getElementById('supplierIntakeForm'));switchNav('supplier-pcn');switchSupplierTab('intake')");
 await assert("document.querySelector('[name=ticketType]').value==='PCN'&&document.querySelector('[name=title]').value==='PCN 초안 보존'",'supplier PCN draft independent');
 await evaluate("switchNav('supplier-issues');switchSupplierTab('intake')");
 await assert("document.querySelector('[name=ticketType]').value==='Issue'&&document.querySelector('[name=title]').value==='Issue 초안 보존'",'supplier Issue draft independent');
 const screens=[['internal-issue-list',"switchNav('internal-issues');internalQualityOpen('list')"],['internal-issue-new',"switchNav('internal-issues');newInternalQuality()"],['internal-issue-detail',`switchNav('internal-issues');internalQualityOpen('detail','${issueId}')`],['internal-pcn-list',"switchNav('internal-pcn');internalQualityOpen('list')"],['internal-pcn-new',"switchNav('internal-pcn');newInternalQuality()"],['internal-pcn-detail',`switchNav('internal-pcn');internalQualityOpen('detail','${pcnId}')`],['supplier-pcn-list',"switchNav('supplier-pcn');switchSupplierTab('watchtower')"],['supplier-pcn-new',"switchNav('supplier-pcn');switchSupplierTab('intake')"],['supplier-issue-list',"switchNav('supplier-issues');switchSupplierTab('watchtower')"],['supplier-issue-new',"switchNav('supplier-issues');switchSupplierTab('intake')"]];
 for(const theme of ['light','dark'])for(const width of [1280,1024,768,390]){
  await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});await evaluate(`applyTheme('${theme}');closeNavigationMenu()`);
  for(const [name,action] of screens){await evaluate(action);await delay(120);const r=await evaluate(inspect);r.name=name;report.cases.push(r);fs.writeFileSync(path.join(out,label+'.json'),JSON.stringify(report,null,2));if(process.env.QMS_AUDIT_SHOTS&&[1280,390].includes(width)&&['internal-issue-detail','internal-pcn-new','supplier-issue-list'].includes(name)){const shot=await call('Page.captureScreenshot',{format:'png',fromSurface:false,captureBeyondViewport:false});fs.writeFileSync(path.join(shotDir,`${theme}-${width}-${name}.png`),Buffer.from(shot.data,'base64'));}}
  console.log(theme+'/'+width+' internal and separated supplier screens checked');
 }
 await call('Page.reload',{ignoreCache:true});await delay(250);await wait('window.QMS_APP_READY===true');await evaluate("saveAppData=()=>{};persistCurrentEditor=()=>true;switchNav('internal-issues')");await wait(`document.querySelector('#internalQualityTable')?.innerText.includes('${issueId}')`);
 await assert("document.querySelector('#internalQualityTable').innerText.includes('수정한 담당자')",'server records survive reload');
 for(const username of ['thkwon','yspark','sangwook.ki','ojs']){
  await evaluate(`handleQuickLogin('${username}')`);await delay(250);await wait(`CURRENT_USER?.username==='${username}'`);
  await assert("getComputedStyle(document.getElementById('internalCompanyNavSection')).display==='none'",username+' internal menu hidden');
  await assert("(async()=>{try{await QMSApi.request('/__api__/qms/internal-quality?kind=Issue');return false}catch(e){return e.status===403}})()",username+' internal API denied');
  for(const theme of ['light','dark'])for(const width of [1280,390]){
   await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});await evaluate(`applyTheme('${theme}');closeNavigationMenu();document.getElementById('nav-supplier-issues').click();switchSupplierTab('watchtower')`);await delay(100);const r=await evaluate(inspect);r.name=username+'-supplier-issue';report.cases.push(r);
   await assert("appData.currentView==='supplier-issues'&&document.querySelector('.qms-page-header h1').innerText.includes('Issue')",username+' split navigation '+theme+'/'+width);
  }
 }
 const failed=report.cases.filter(r=>r.contrast.length||r.clipped.length||r.collisions.length||r.contentOverflow>2||r.mainOverflow>2);report.summary={functionalChecks:report.checks.length,screenChecks:report.cases.length,failures:failed.length,runtimeErrors:errors.length};fs.writeFileSync(path.join(out,label+'.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report.summary));if(failed.length||errors.length)throw new Error('UI audit failed '+failed.map(r=>r.theme+'/'+r.width+'/'+r.name).join(', '));
};
