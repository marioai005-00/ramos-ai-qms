/* D4 structured quality-tool evidence builder and report appendix */
const D4_EVIDENCE_SCHEMAS = {
  'timeline': { code:'TL', title:'발생 타임라인 분석서', columns:[['time','일시/LOT'],['event','확인 사실'],['change','변경점'],['evidence','원본 Evidence']] },
  'process-flow': { code:'PF', title:'Process Flow / SIPOC 분석서', columns:[['step','공정 단계'],['input','Input/조건'],['control','관리·검사'],['finding','발생/유출 판단']] },
  'change-point': { code:'CP', title:'Change Point 비교 분석서', columns:[['factor','4M1E/설계'],['normal','정상 조건'],['failed','불량 조건'],['evidence','차이 입증 Evidence']] },
  'fishbone': { code:'FB', title:'Fishbone 8M 원인 후보 분석서', columns:[['category','8M 분류'],['cause','원인 후보'],['fact','확인 사실/시험'],['decision','판정']] },
  'five-why': { code:'5W', title:'발생·유출·시스템 3-Track 5 Why', columns:[['track','Track'],['level','Why 단계'],['why','Why / Because'],['evidence','Evidence']] },
  'genealogy': { code:'LG', title:'LOT Genealogy 추적서', columns:[['stage','Trace 단계'],['lot','LOT/Batch'],['source','공급사·공정'],['evidence','연결 Evidence']] },
  'test-coverage': { code:'TC', title:'검사 Coverage Gap 분석서', columns:[['failure','Failure Mode'],['test','검사 항목/조건'],['coverage','검출 가능성'],['gap','Gap 및 Evidence']] },
  'physical-fa': { code:'FA', title:'Physical FA 분석 흐름도', columns:[['sequence','분석 순서'],['method','분석 방법'],['finding','관찰 결과'],['evidence','성적서/이미지']] }
};

function getD4EvidenceSchema(toolId) {
  const tool = typeof getD4ToolById === 'function' ? getD4ToolById(toolId) : null;
  return D4_EVIDENCE_SCHEMAS[toolId] || {code:'QA',title:`${tool?.name || toolId} 분석 Evidence`,columns:[['item','분석 항목'],['fact','관찰 사실'],['comparison','비교/검증 결과'],['evidence','원본 Evidence']]};
}

function seedD4EvidenceRows(toolId) {
  const seeds = {
    'timeline': [
      ['2026-08-20 / EM2608-DTV00','마지막 정상 LOT 출하','변경 전 X7R 자재 사용','ERP 출하이력, EVD-01'],
      ['2026-08-22 / AS260828-A','외주 Assembly 자재 투입','C102 MLCC X7R → X5R','Supplier 4M Change Notice'],
      ['2026-08-28 / EM2608-DTV01','Reflow 및 상온 Final Test 완료','고온 Stress 검사 없음','Assembly Traveler, FT Log'],
      ['2026-08-31 / 고객 SMT','12ea CID Read Timeout 발생','변경 LOT에서 최초 발생','고객 불량 통보서'],
      ['2026-09-02 / FA Lab','MLCC 탈거 후 Short 해소','C102 원인 경로 지지','EVD-07, EVD-08']
    ],
    'process-flow': [
      ['MLCC 공급','X5R, C102','CoC·외관검사','자재 Grade 변경 유입'],['외주 Assembly','Reflow 245℃','Profile 확인','열응력 Crack 발생 가능'],['외주 Final Test','상온 기능검사','FT Program Rev.1','잠재 Crack 미검출'],['RAK4/RAK5 입고','완제품 LOT','입고검사','동일 LOT 전량 이동'],['고객 SMT','재 Reflow','ICT','열응력 누적 후 Short 검출']
    ],
    'change-point': [
      ['Material','C102 MLCC X7R','C102 MLCC X5R','4M Change Notice #C102'],['Method','변경품 신뢰성 재평가','외관·상온 전기만 승인','BOM Review Log'],['Measurement','125℃ Stress 포함','상온 FT만 적용','FT Program Rev.1'],['Supplier','승인 전 사전 통보','납기 대응 선투입','Supplier Audit 회신']
    ],
    'fishbone': [
      ['Man','변경 승인자 온도 Grade 검토 누락','승인 Checklist 확인','Supported'],['Machine','Reflow Profile 상한 초과','Logger 재측정 정상','Rejected'],['Material','X5R 고온 마진 부족','X7R/X5R A-B 시험','Confirmed'],['Method','변경품 신뢰성 평가 누락','BOM 승인 절차 검토','Confirmed'],['Measurement','상온 FT만 수행','125℃ Stress 비교','Confirmed'],['Environment','고객 2차 Reflow 열응력','온도 이력 확인','Supported'],['Design','C102 정격 Derating 부족','회로/BOM Review','Supported'],['Supplier','사전 변경통보 미준수','4M 통보 이력 확인','Confirmed']
    ],
    'five-why': [
      ['발생','Why 1','VCC-VSS Short → C102 MLCC 내부 Crack','EVD-07, EVD-08'],['발생','Why 2','내부 Crack → Reflow 열응력과 X5R 내열 마진 부족','SEM, 온도 Profile'],['발생','Why 3','X5R 적용 → 공급사 자재 Grade 변경','4M Change Notice'],['유출','Why 1','출하검사 Pass → 잠재 Crack이 상온에서 미검출','FT Log'],['유출','Why 2','미검출 → 고온 Stress 항목 미포함','Coverage Review'],['시스템','Why 1','변경 승인 → 온도등급 대조 항목 부재','BOM Checklist'],['시스템','Why 2','항목 부재 → 외주 변경관리 기준에 신뢰성 Gate 누락','Supplier Audit']
    ],
    'genealogy': [
      ['자재','C102-X5R-B240822','MLCC Supplier','CoC / Packing List'],['Assembly','AS260828-A','외주 Assembly A3','Assembly Traveler'],['Final Test','TS260829-B','외주 Tester T-07','FT Lot Summary'],['당사 입고','EM2608-DTV01','RAK4 → 고객 전량 출하','ERP 입출고 이력'],['고객','LGE-DTV-0831','평택 SMT','고객 LOT Trace 회신']
    ],
    'test-coverage': [
      ['MLCC 잠재 Crack','상온 Continuity / 25℃','낮음','열응력 전에는 False Pass · FT Rev.1'],['MLCC Short','ICT VCC-VSS 저항','높음','고객 2차 Reflow 후 검출 · 고객 ICT Log'],['고온 열화','125℃ Stress + 저항','높음','기존 미적용 · Coverage Gap'],['간헐 CID Timeout','Boot 반복 100 cycle','중간','Guard Band 추가 필요 · 재현시험']
    ],
    'physical-fa': [
      ['01','외관·3D X-Ray','BGA Joint 특이점 없음','EVD-05'],['02','IV/저항 측정','VCC-VSS 0.8Ω Short','EVD-04'],['03','Decap / 부품 탈거','C102 탈거 후 저항 정상 복귀','EVD-06, EVD-07'],['04','SEM Cross Section','MLCC 유전체 수직 Crack','EVD-08'],['05','정상 X7R A-B 검증','동일 Stress 0/30 Fail','Validation Report']
    ]
  };
  return (seeds[toolId] || []).map(values => ({values}));
}

function createD4EvidenceArtifact(toolId,row,c,useExample=false) {
  const schema=getD4EvidenceSchema(toolId);
  const rows=useExample ? seedD4EvidenceRows(toolId) : Array.from({length:3},()=>({values:schema.columns.map(()=> '')}));
  return {version:1,documentNo:`${c?.id || 'CASE'}-D4-${schema.code}`,objective:row?.hypothesis||'',sourceEvidence:row?.evidence||'',conclusion:row?.finding||'',rows,attachments:[],humanConfirmed:Boolean(useExample),updatedBy:useExample?'김성중 Senior Pro':'',updatedAt:useExample?'2026-09-05 15:40':''};
}

function escapeD4Evidence(value) {
  return String(value ?? '').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}

const D4_FILE_DB='ramos-qms-d4-files-v1';
const D4_FILE_STORE='evidenceFiles';
const D4_ALLOWED_EXTENSIONS=['png','jpg','jpeg','webp','gif','bmp','pdf','ppt','pptx','xls','xlsx','doc','docx','csv','txt'];
let activeD4EvidenceIndex = -1;
let pendingD4Attachments=[];
let pendingD4DeletedKeys=[];
let pendingD4NewKeys=[];
let d4EvidenceSaving=false;
let d4AttachmentObjectUrls=[];
function openD4FileDatabase(){return new Promise((resolve,reject)=>{const request=indexedDB.open(D4_FILE_DB,1);request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(D4_FILE_STORE))request.result.createObjectStore(D4_FILE_STORE);};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
async function putD4EvidenceFile(key,file){const db=await openD4FileDatabase();return new Promise((resolve,reject)=>{const tx=db.transaction(D4_FILE_STORE,'readwrite');tx.objectStore(D4_FILE_STORE).put(file,key);tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>{db.close();reject(tx.error);};});}
async function getD4EvidenceFile(key){const db=await openD4FileDatabase();return new Promise((resolve,reject)=>{const request=db.transaction(D4_FILE_STORE,'readonly').objectStore(D4_FILE_STORE).get(key);request.onsuccess=()=>{db.close();resolve(request.result);};request.onerror=()=>{db.close();reject(request.error);};});}
async function deleteD4EvidenceFile(key){const db=await openD4FileDatabase();return new Promise((resolve,reject)=>{const tx=db.transaction(D4_FILE_STORE,'readwrite');tx.objectStore(D4_FILE_STORE).delete(key);tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>{db.close();reject(tx.error);};});}
function makeD4AttachmentId(){return globalThis.crypto?.randomUUID?.()||`d4-${Date.now()}-${Math.random().toString(16).slice(2)}`;}
function formatD4FileSize(size){if(size<1024)return `${size} B`;if(size<1048576)return `${(size/1024).toFixed(1)} KB`;return `${(size/1048576).toFixed(1)} MB`;}
function openD4EvidenceBuilder(index) {
  const c=getActiveCase(); if(!c)return;
  const d4=captureD4Form(c); const row=d4.selectedTools[index]; if(!row)return;
  row.artifact=row.artifact||createD4EvidenceArtifact(row.id,row,c,false);
  row.artifact.attachments=Array.isArray(row.artifact.attachments)?row.artifact.attachments:[];
  pendingD4Attachments=row.artifact.attachments.map(item=>({...item}));pendingD4DeletedKeys=[];pendingD4NewKeys=[];d4EvidenceSaving=false;
  activeD4EvidenceIndex=index;
  const schema=getD4EvidenceSchema(row.id); const artifact=row.artifact;
  const modal=document.getElementById('globalModal'); const container=document.getElementById('modalContainer');
  container.style.width='1180px'; container.style.maxWidth='97vw';
  container.innerHTML=`<div class="d4-evidence-builder"><header><div><span>STRUCTURED D4 EVIDENCE</span><h2>${escapeD4Evidence(schema.title)}</h2><p>요약문이 아니라 원본 사실을 구조화하여 고객 보고서의 독립 Evidence 페이지를 만듭니다.</p></div><button class="btn btn-secondary btn-sm" onclick="closeD4EvidenceBuilder()">닫기</button></header>
    <div class="d4-evidence-meta"><label>문서번호<input class="form-control" id="d4EvDocNo" value="${escapeD4Evidence(artifact.documentNo)}"></label><label>분석 목적·가설<textarea class="form-control" id="d4EvObjective">${escapeD4Evidence(artifact.objective)}</textarea></label><label>원본 자료 / Evidence ID<textarea class="form-control" id="d4EvSources">${escapeD4Evidence(artifact.sourceEvidence)}</textarea></label></div>
    <div class="d4-evidence-grid-wrap"><table><thead><tr>${schema.columns.map(col=>`<th>${col[1]}</th>`).join('')}<th>관리</th></tr></thead><tbody id="d4EvidenceRows">${artifact.rows.map(item=>renderD4EvidenceBuilderRow(schema,item)).join('')}</tbody></table></div>
    <button type="button" class="btn btn-secondary btn-sm d4-add-evidence-row" onclick="addD4EvidenceBuilderRow()"><i data-lucide="plus"></i> 분석 행 추가</button>
    <section class="d4-file-evidence-panel"><header><div><span>SOURCE FILE ATTACHMENTS</span><h3>완성된 분석자료 직접 첨부</h3><p>이미지·PDF는 Report 안에 바로 표시됩니다. PPT·Excel·Word는 원본 첨부 카드로 표시되며, 대표 화면 이미지를 함께 넣으면 Report에 같이 나타납니다.</p></div><label class="btn btn-secondary"><i data-lucide="paperclip"></i> 파일 선택<input type="file" multiple hidden accept="image/*,.pdf,.ppt,.pptx,.xls,.xlsx,.doc,.docx,.csv,.txt" onchange="handleD4EvidenceFiles(this.files);this.value=''"/></label></header><div class="d4-file-drop-hint">최대 30MB/파일 · 파일은 이 PC의 브라우저 Evidence 저장소에 보관됩니다.</div><div id="d4AttachmentList" class="d4-attachment-list">${renderD4AttachmentList()}</div></section>
    <label class="d4-evidence-conclusion">분석 결론<textarea class="form-control" id="d4EvConclusion">${escapeD4Evidence(artifact.conclusion)}</textarea></label>
    <footer><label class="quality-human-check"><input type="checkbox" id="d4EvConfirmed" ${artifact.humanConfirmed?'checked':''}><span><strong>분석 Evidence 확인</strong> · 직접 작성한 분석 또는 첨부 원본을 검토했으며 이 문서를 D4 근본원인 입증자료로 사용합니다.</span></label><div><button class="btn btn-secondary" onclick="closeD4EvidenceBuilder()">취소</button><button class="btn btn-primary" onclick="saveD4EvidenceArtifact()"><i data-lucide="file-check-2"></i> Evidence 문서 저장</button></div></footer></div>`;
  modal.style.display='flex'; if(window.lucide)lucide.createIcons();
}

function renderD4EvidenceBuilderRow(schema,item={values:[]}) {
  return `<tr>${schema.columns.map((col,i)=>`<td><textarea class="form-control" data-d4-evidence-cell="${i}" placeholder="${escapeD4Evidence(col[1])}">${escapeD4Evidence(item.values?.[i]||'')}</textarea></td>`).join('')}<td><button type="button" class="icon-danger-btn" onclick="this.closest('tr').remove()" title="행 삭제"><i data-lucide="trash-2"></i></button></td></tr>`;
}
function addD4EvidenceBuilderRow(){const c=getActiveCase();const row=c?.d4?.selectedTools?.[activeD4EvidenceIndex];if(!row)return;const schema=getD4EvidenceSchema(row.id);document.getElementById('d4EvidenceRows').insertAdjacentHTML('beforeend',renderD4EvidenceBuilderRow(schema));if(window.lucide)lucide.createIcons();}
function renderD4AttachmentList(){
  return pendingD4Attachments.length?pendingD4Attachments.map((item,index)=>`
    <div class="d4-attachment-row">
      <span class="d4-file-kind d4-kind-${escapeD4Evidence(item.previewType||'doc')}">${escapeD4Evidence((item.extension||'FILE').toUpperCase())}</span>
      <div>
        <b>${escapeD4Evidence(item.name)}</b>
        <small>${formatD4FileSize(item.size||0)} · ${item.previewType==='image'?'Report 고해상도 이미지 표시':item.previewType==='pdf'?'Report 공식 PDF 뷰어 내장':'원본 첨부 카드 (다운로드)'}</small>
      </div>
      <div class="d4-attach-item-actions">
        <button type="button" class="btn btn-secondary btn-sm" onclick="previewPendingD4Attachment(${index})" title="미리보기"><i data-lucide="eye"></i> 보기</button>
        <button type="button" class="icon-danger-btn" onclick="removePendingD4Attachment(${index})" title="첨부 제외"><i data-lucide="trash-2"></i></button>
      </div>
    </div>`).join(''):'<div class="d4-no-attachment">첨부된 분석자료가 없습니다. 직접 양식을 작성하거나 완성된 원본 파일을 첨부하세요.</div>';
}

async function previewPendingD4Attachment(index){
  const item=pendingD4Attachments[index];
  if(!item)return;
  try{
    const blob=await getD4EvidenceFile(item.storageKey);
    if(!blob){alert('원본 파일을 불러오지 못했습니다.');return;}
    const url=URL.createObjectURL(blob);
    if(item.previewType==='image'){
      openD4ImageLightbox(url, item.name);
    }else{
      window.open(url, '_blank');
    }
  }catch(e){
    console.error(e);
    alert('파일 미리보기를 열 수 없습니다.');
  }
}
async function handleD4EvidenceFiles(fileList){
  const c=getActiveCase();const row=c?.d4?.selectedTools?.[activeD4EvidenceIndex];if(!row)return;
  for(const file of [...fileList]){const extension=(file.name.split('.').pop()||'').toLowerCase();if(!D4_ALLOWED_EXTENSIONS.includes(extension)){alert(`${file.name}: 지원하지 않는 형식입니다.`);continue;}if(file.size>30*1024*1024){alert(`${file.name}: 파일당 30MB를 초과했습니다.`);continue;}const id=makeD4AttachmentId();const storageKey=`${c.id}__${row.id}__${id}`;try{await putD4EvidenceFile(storageKey,file);pendingD4NewKeys.push(storageKey);pendingD4Attachments.push({id,storageKey,name:file.name,type:file.type||'application/octet-stream',extension,size:file.size,previewType:file.type.startsWith('image/')?'image':extension==='pdf'?'pdf':'document',uploadedBy:CURRENT_USER.name,uploadedAt:new Date().toISOString().replace('T',' ').slice(0,16)});}catch(error){console.error(error);alert(`${file.name}: 브라우저 Evidence 저장소에 보관하지 못했습니다.`);}}
  document.getElementById('d4AttachmentList').innerHTML=renderD4AttachmentList();if(window.lucide)lucide.createIcons();
}
function removePendingD4Attachment(index){
  const [removed]=pendingD4Attachments.splice(index,1);
  if(removed?.storageKey){
    const newIndex=pendingD4NewKeys.indexOf(removed.storageKey);
    if(newIndex>=0){
      pendingD4NewKeys.splice(newIndex,1);
      deleteD4EvidenceFile(removed.storageKey).catch(err=>console.warn('Staged D4 file cleanup failed:',err));
    }else{
      pendingD4DeletedKeys.push(removed.storageKey);
    }
  }
  document.getElementById('d4AttachmentList').innerHTML=renderD4AttachmentList();if(window.lucide)lucide.createIcons();
}
async function closeD4EvidenceBuilder(){
  if(!d4EvidenceSaving && pendingD4NewKeys.length){
    const cleanup=await Promise.allSettled(pendingD4NewKeys.map(deleteD4EvidenceFile));
    cleanup.filter(item=>item.status==='rejected').forEach(item=>console.warn('Cancelled D4 file cleanup failed:',item.reason));
  }
  document.getElementById('globalModal').style.display='none';
  activeD4EvidenceIndex=-1;
  pendingD4Attachments=[];
  pendingD4DeletedKeys=[];
  pendingD4NewKeys=[];
  d4EvidenceSaving=false;
}
async function saveD4EvidenceArtifact(){
  const c=getActiveCase(); const row=c?.d4?.selectedTools?.[activeD4EvidenceIndex]; if(!row)return;
  const schema=getD4EvidenceSchema(row.id); const rows=[...document.querySelectorAll('#d4EvidenceRows tr')].map(tr=>({values:schema.columns.map((_,i)=>tr.querySelector(`[data-d4-evidence-cell="${i}"]`)?.value.trim()||'')})).filter(item=>item.values.some(Boolean));
  const objective=document.getElementById('d4EvObjective').value.trim(); const typedSources=document.getElementById('d4EvSources').value.trim(); const sources=typedSources||pendingD4Attachments.map(item=>item.name).join(', '); const conclusion=document.getElementById('d4EvConclusion').value.trim(); const confirmed=document.getElementById('d4EvConfirmed').checked;
  if(!objective||!conclusion||(!rows.length&&!pendingD4Attachments.length)){alert('분석 목적과 결론을 작성하고, 분석 양식 또는 완성된 분석자료 파일 중 하나를 등록해 주세요.');return;}
  if(confirmed&&rows.some(item=>item.values.some(value=>!value))){alert('사람 확인 전에 각 분석 행의 모든 칸을 작성해 주세요.');return;}
  const previous={hypothesis:row.hypothesis,evidence:row.evidence,finding:row.finding,artifact:row.artifact,approval:c.d4.approval};
  row.hypothesis=objective;row.evidence=sources;row.finding=conclusion;row.artifact={version:1,documentNo:document.getElementById('d4EvDocNo').value.trim()||`${c.id}-D4-${schema.code}`,objective,sourceEvidence:sources,conclusion,rows,attachments:pendingD4Attachments.map(item=>({...item})),humanConfirmed:confirmed,updatedBy:CURRENT_USER.name,updatedAt:new Date().toISOString().replace('T',' ').slice(0,16)};
  c.d4.approval={status:'Draft',humanConfirmed:false};
  try{
    saveAppData();
  }catch(error){
    row.hypothesis=previous.hypothesis;row.evidence=previous.evidence;row.finding=previous.finding;row.artifact=previous.artifact;c.d4.approval=previous.approval;
    const cleanup=await Promise.allSettled(pendingD4NewKeys.map(deleteD4EvidenceFile));
    cleanup.filter(item=>item.status==='rejected').forEach(item=>console.warn('Failed D4 save cleanup failed:',item.reason));
    pendingD4NewKeys=[];
    return;
  }
  const cleanup=await Promise.allSettled([...new Set(pendingD4DeletedKeys)].map(deleteD4EvidenceFile));
  cleanup.filter(item=>item.status==='rejected').forEach(item=>console.warn('Removed D4 file cleanup failed:',item.reason));
  d4EvidenceSaving=true;
  pendingD4NewKeys=[];
  await closeD4EvidenceBuilder();
  renderCurrentView();
  alert(`${schema.title}가 D4 Evidence 문서로 저장되었습니다.`);
}

function renderD4EvidenceAppendix(c) {
  const tools=c.d4?.selectedTools||[];
  return tools.map((row,index)=>renderD4EvidenceSheet(c,row,index)).join('');
}
function renderD4EvidenceSheet(c,row,index) {
  const schema=getD4EvidenceSchema(row.id); const artifact=row.artifact||createD4EvidenceArtifact(row.id,row,c,false); const rows=artifact.rows||[];
  return `<article class="stage-report-paper d4-evidence-paper"><div class="stage-report-watermark">${c.isExampleCase?'SAMPLE · TRAINING DATA':'DRAFT · HUMAN APPROVAL REQUIRED'}</div><div class="d4-evidence-doc-head"><div><b>RAMOS</b><small>D4 ROOT CAUSE EVIDENCE</small></div><div><span>EVIDENCE ${String(index+1).padStart(2,'0')}</span><h2>${escapeD4Evidence(schema.title)}</h2></div><dl><dt>문서번호</dt><dd>${escapeD4Evidence(artifact.documentNo)}</dd><dt>확인상태</dt><dd class="${artifact.humanConfirmed?'ok':'wait'}">${artifact.humanConfirmed?'HUMAN VERIFIED':'DRAFT'}</dd></dl></div><div class="d4-evidence-purpose"><b>분석 목적 / 가설</b><p>${escapeD4Evidence(artifact.objective)||'작성 대기'}</p><small>Source · ${escapeD4Evidence(artifact.sourceEvidence)||'연결 Evidence 대기'}</small></div>${rows.length?renderD4EvidenceVisual(row.id,schema,rows):'<div class="d4-file-only-note">구조화 입력 대신 첨부된 완성 분석자료를 원본 Evidence로 사용합니다.</div>'}${renderD4ReportAttachments(artifact.attachments||[])}<div class="d4-evidence-result"><b>분석 결론</b><p>${escapeD4Evidence(artifact.conclusion)||'분석 결론 작성 대기'}</p></div><footer class="stage-report-foot"><span>작성/확인 · ${escapeD4Evidence(artifact.updatedBy)||'미확인'} ${escapeD4Evidence(artifact.updatedAt)}</span><span>${c.id} · D4-E${String(index+1).padStart(2,'0')}</span></footer></article>`;
}
function renderD4ReportAttachments(attachments){
  if(!attachments.length)return '';
  return `<section class="d4-report-attachments">
    <div class="d4-report-attach-head">
      <div class="d4-attach-title">
        <span class="d4-attach-tag">SOURCE EVIDENCE ARTIFACTS</span>
        <h3>완성 분석자료 및 시험 성적서 원본 (${attachments.length}건)</h3>
      </div>
      <div class="d4-attach-meta">
        <span>이미지·PDF 리포트 직접 인라인 검토</span>
        <span>Office 원본 보존</span>
      </div>
    </div>
    <div class="d4-report-attachments-grid">
      ${attachments.map((item,idx)=>`<div class="d4-report-attachment d4-attachment-card-${item.previewType||'document'}" data-d4-file-key="${escapeD4Evidence(item.storageKey)}" data-d4-file-name="${escapeD4Evidence(item.name)}" data-d4-preview-type="${escapeD4Evidence(item.previewType)}" data-d4-file-size="${item.size||0}" data-d4-file-uploader="${escapeD4Evidence(item.uploadedBy||'CFT 담당자')}" data-d4-file-date="${escapeD4Evidence(item.uploadedAt||'')}"><div class="d4-attachment-loading"><div class="d4-attach-spinner"></div><b>${escapeD4Evidence(item.name)}</b><span>${formatD4FileSize(item.size||0)} · 원본 분석자료 로딩 중...</span></div></div>`).join('')}
    </div>
  </section>`;
}

function releaseD4AttachmentUrls(){
  d4AttachmentObjectUrls.forEach(url=>URL.revokeObjectURL(url));
  d4AttachmentObjectUrls=[];
}

async function hydrateD4EvidenceAttachments(root=document){
  releaseD4AttachmentUrls();
  const nodes=[...root.querySelectorAll('[data-d4-file-key]')];
  for(const node of nodes){
    const key=node.dataset.d4FileKey;
    const name=node.dataset.d4FileName;
    const previewType=node.dataset.d4PreviewType;
    const size=Number(node.dataset.d4FileSize||0);
    const uploader=node.dataset.d4FileUploader||'CFT 담당자';
    const uploadDate=node.dataset.d4FileDate||'';
    const ext=((name.split('.').pop()||'FILE')).toLowerCase();
    try{
      const blob=await getD4EvidenceFile(key);
      if(!blob){
        node.innerHTML=`<div class="d4-attachment-missing">
          <div class="d4-missing-icon"><i data-lucide="alert-triangle"></i></div>
          <div class="d4-missing-content">
            <b>${escapeD4Evidence(name)}</b>
            <span>이 PC의 브라우저 Evidence 저장소(IndexedDB)에 원본 파일이 없습니다.</span>
            <small>※ 다중 PC 자동 동기화는 차기 중앙 파일 저장소 연동 시 제공됩니다. 원본을 등록한 PC에서 확인하거나 다시 첨부해 주십시오.</small>
          </div>
        </div>`;
        continue;
      }
      const url=URL.createObjectURL(blob);
      d4AttachmentObjectUrls.push(url);

      if(previewType==='image'){
        node.innerHTML=`<div class="d4-evidence-image-card">
          <div class="d4-evidence-card-bar">
            <div class="d4-card-badge-group">
              <span class="d4-evidence-pill d4-pill-img">IMAGE EVIDENCE</span>
              <span class="d4-ext-pill">${escapeD4Evidence(ext.toUpperCase())}</span>
              <strong class="d4-evidence-filename" title="${escapeD4Evidence(name)}">${escapeD4Evidence(name)}</strong>
            </div>
            <div class="d4-card-action-group no-print">
              <span class="d4-evidence-filesize">${formatD4FileSize(size)}</span>
              <button type="button" class="btn-evidence-action" onclick="openD4ImageLightbox('${url}','${escapeD4Evidence(name)}')"><i data-lucide="zoom-in"></i> 원본 확대</button>
              <a href="${url}" download="${escapeD4Evidence(name)}" class="btn-evidence-action btn-evidence-dl"><i data-lucide="download"></i> 다운로드</a>
            </div>
          </div>
          <div class="d4-image-viewport" onclick="openD4ImageLightbox('${url}','${escapeD4Evidence(name)}')">
            <img src="${url}" alt="${escapeD4Evidence(name)}" loading="lazy" class="d4-inspect-img">
            <div class="d4-image-hover-hint no-print"><span><i data-lucide="maximize-2"></i> 클릭하여 고해상도 확대 보기</span></div>
          </div>
          <div class="d4-evidence-footer-bar">
            <span class="d4-foot-label"><i data-lucide="microscope"></i> 물리/전기 분석 실측 증거 자료</span>
            <span class="d4-foot-uploader">등록: ${escapeD4Evidence(uploader)} ${escapeD4Evidence(uploadDate)}</span>
          </div>
        </div>`;
      } else if(previewType==='pdf'){
        node.innerHTML=`<div class="d4-evidence-pdf-card">
          <div class="d4-evidence-card-bar d4-pdf-bar">
            <div class="d4-card-badge-group">
              <span class="d4-evidence-pill d4-pill-pdf">OFFICIAL PDF EVIDENCE</span>
              <span class="d4-ext-pill">PDF</span>
              <strong class="d4-evidence-filename" title="${escapeD4Evidence(name)}">${escapeD4Evidence(name)}</strong>
            </div>
            <div class="d4-card-action-group no-print">
              <span class="d4-evidence-filesize">${formatD4FileSize(size)}</span>
              <button type="button" class="btn-evidence-action" onclick="window.open('${url}','_blank')"><i data-lucide="external-link"></i> 새 탭 전체화면</button>
              <a href="${url}" download="${escapeD4Evidence(name)}" class="btn-evidence-action btn-evidence-dl"><i data-lucide="download"></i> PDF 다운로드</a>
            </div>
          </div>
          <div class="d4-pdf-viewport">
            <iframe src="${url}#view=FitH" class="d4-pdf-frame" title="${escapeD4Evidence(name)}"></iframe>
            <div class="d4-pdf-fallback-strip no-print">
              <span><i data-lucide="file-text"></i> 브라우저 내장 뷰어가 표시되지 않을 경우</span>
              <button type="button" class="btn-evidence-link" onclick="window.open('${url}','_blank')">새 탭에서 성적서 열람하기 ➔</button>
            </div>
          </div>
          <div class="d4-evidence-footer-bar">
            <span class="d4-foot-label"><i data-lucide="file-check"></i> 공식 시험 / 분석 성적서 PDF</span>
            <span class="d4-foot-uploader">등록: ${escapeD4Evidence(uploader)} ${escapeD4Evidence(uploadDate)}</span>
          </div>
        </div>`;
      } else {
        node.innerHTML=`<div class="d4-document-attachment">
          <span class="d4-doc-icon ${escapeD4Evidence(ext)}">${escapeD4Evidence(ext.toUpperCase())}</span>
          <div class="d4-doc-info">
            <b title="${escapeD4Evidence(name)}">${escapeD4Evidence(name)}</b>
            <small>${formatD4FileSize(size)} · PPT·Excel·Word 원본 분석자료 (등록: ${escapeD4Evidence(uploader)} ${escapeD4Evidence(uploadDate)})</small>
          </div>
          <a href="${url}" download="${escapeD4Evidence(name)}" class="btn-evidence-action btn-evidence-dl"><i data-lucide="download"></i> 원본 저장</a>
        </div>`;
      }
    }catch(error){
      console.error(error);
      node.innerHTML=`<div class="d4-attachment-missing"><div class="d4-missing-icon"><i data-lucide="alert-circle"></i></div><div class="d4-missing-content"><b>${escapeD4Evidence(name)}</b><span>원본 파일을 불러오지 못했습니다.</span></div></div>`;
    }
  }
  if(window.lucide)lucide.createIcons();
}

function openD4ImageLightbox(imageUrl, title){
  let lb=document.getElementById('d4ImageLightboxModal');
  if(!lb){
    lb=document.createElement('div');
    lb.id='d4ImageLightboxModal';
    lb.className='d4-image-lightbox-modal';
    document.body.appendChild(lb);
  }
  lb.innerHTML=`<div class="d4-lightbox-backdrop" onclick="closeD4ImageLightbox()"></div>
    <div class="d4-lightbox-container">
      <header class="d4-lightbox-header">
        <div class="d4-lightbox-title"><i data-lucide="microscope"></i><b>${escapeD4Evidence(title)}</b><span>고해상도 실측 분석 Evidence</span></div>
        <div class="d4-lightbox-actions">
          <a href="${imageUrl}" download="${escapeD4Evidence(title)}" class="btn btn-secondary btn-sm"><i data-lucide="download"></i> 다운로드</a>
          <button type="button" class="btn btn-secondary btn-sm" onclick="closeD4ImageLightbox()"><i data-lucide="x"></i> 닫기</button>
        </div>
      </header>
      <div class="d4-lightbox-body">
        <img src="${imageUrl}" alt="${escapeD4Evidence(title)}" class="d4-lightbox-img">
      </div>
    </div>`;
  lb.style.display='flex';
  if(window.lucide)lucide.createIcons();
}

function closeD4ImageLightbox(){
  const lb=document.getElementById('d4ImageLightboxModal');
  if(lb)lb.style.display='none';
}

function renderD4EvidenceVisual(toolId,schema,rows){
  const cells=item=>schema.columns.map((col,i)=>escapeD4Evidence(item.values?.[i] ?? item[col[0]])||'—');
  if(toolId==='timeline')return `<div class="d4-report-timeline">${rows.map(item=>{const v=cells(item);return `<div><time>${v[0]}</time><section><b>${v[1]}</b><p>${v[2]}</p><small>${v[3]}</small></section></div>`}).join('')}</div>`;
  if(['process-flow','genealogy','physical-fa'].includes(toolId))return `<div class="d4-report-flow">${rows.map(item=>{const v=cells(item);return `<div><span>${v[0]}</span><b>${v[1]}</b><p>${v[2]}</p><small>${v[3]}</small></div>`}).join('')}</div>`;
  if(toolId==='fishbone')return `<div class="d4-report-fishbone"><div class="fish-spine"><span>FAILURE MODE</span></div>${rows.map(item=>{const v=cells(item);return `<section><b>${v[0]}</b><p>${v[1]}</p><small>${v[2]} · ${v[3]}</small></section>`}).join('')}</div>`;
  if(toolId==='five-why'){const tracks=[...new Set(rows.map(item=>(Array.isArray(item.values)?item.values[0]:item.track)||'Track'))];return `<div class="d4-report-why">${tracks.map(track=>`<section><h4>${escapeD4Evidence(track)}</h4>${rows.filter(item=>((Array.isArray(item.values)?item.values[0]:item.track)||'Track')===track).map(item=>{const v=cells(item);return `<div><b>${v[1]}</b><p>${v[2]}</p><small>${v[3]}</small></div>`}).join('')}</section>`).join('')}</div>`;}
  return `<table class="d4-evidence-report-table"><thead><tr>${schema.columns.map(col=>`<th>${escapeD4Evidence(col[1])}</th>`).join('')}</tr></thead><tbody>${rows.length?rows.map(item=>`<tr>${cells(item).map(value=>`<td>${value}</td>`).join('')}</tr>`).join(''):`<tr><td colspan="${schema.columns.length}">구조화된 분석 행 작성 대기</td></tr>`}</tbody></table>`;
}

/* ========================================================================= */
/* D4 HIGH-RESOLUTION FAILURE ANALYSIS (FA) VISUAL GALLERY & SVG FIGURES    */
/* ========================================================================= */

function renderSvgFigureDecap() {
  return `
    <svg viewBox="0 0 460 260" class="d4-figure-svg" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="decapGlow" cx="62%" cy="48%" r="40%">
          <stop offset="0%" stop-color="#22c55e" stop-opacity="0.25"/>
          <stop offset="100%" stop-color="#0f291e" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="460" height="260" fill="#0d2318" rx="6"/>
      <rect x="20" y="20" width="420" height="220" fill="#132e20" stroke="#22543d" stroke-width="2" rx="4"/>
      <path d="M 40 130 L 160 130 L 220 100 L 260 100" stroke="#d97706" stroke-width="3" fill="none" opacity="0.85"/>
      <path d="M 40 150 L 160 150 L 220 180 L 320 180" stroke="#b45309" stroke-width="3" fill="none" opacity="0.85"/>
      <path d="M 280 60 L 280 100 L 340 100 L 400 130" stroke="#d97706" stroke-width="2" fill="none" opacity="0.7"/>
      <g fill="#4ade80" opacity="0.3">
        <circle cx="50" cy="60" r="3"/><circle cx="70" cy="60" r="3"/><circle cx="90" cy="60" r="3"/><circle cx="110" cy="60" r="3"/><circle cx="130" cy="60" r="3"/>
        <circle cx="50" cy="80" r="3"/><circle cx="70" cy="80" r="3"/><circle cx="90" cy="80" r="3"/><circle cx="110" cy="80" r="3"/><circle cx="130" cy="80" r="3"/>
        <circle cx="50" cy="100" r="3"/><circle cx="70" cy="100" r="3"/><circle cx="90" cy="100" r="3"/><circle cx="110" cy="100" r="3"/><circle cx="130" cy="100" r="3"/>
        <circle cx="50" cy="120" r="3"/><circle cx="70" cy="120" r="3"/><circle cx="90" cy="120" r="3"/><circle cx="110" cy="120" r="3"/><circle cx="130" cy="120" r="3"/>
      </g>
      <rect x="180" y="50" width="220" height="160" fill="#1e293b" stroke="#475569" stroke-width="1.5" rx="3"/>
      <text x="195" y="75" fill="#94a3b8" font-size="10" font-family="'Consolas', monospace" font-weight="bold">eMMC CONTROLLER &amp; NAND DIE</text>
      <circle cx="285" cy="125" r="45" fill="url(#decapGlow)"/>
      <circle cx="285" cy="125" r="32" stroke="#ef4444" stroke-width="1.5" stroke-dasharray="4 2" fill="none"/>
      <rect x="270" y="115" width="30" height="20" fill="#64748b" stroke="#cbd5e1" stroke-width="1.5"/>
      <rect x="268" y="115" width="5" height="20" fill="#e2e8f0"/>
      <rect x="297" y="115" width="5" height="20" fill="#e2e8f0"/>
      <line x1="285" y1="125" x2="360" y2="70" stroke="#f43f5e" stroke-width="1.5"/>
      <circle cx="285" cy="125" r="3" fill="#f43f5e"/>
      <rect x="330" y="52" width="105" height="26" fill="#881337" stroke="#f43f5e" rx="3"/>
      <text x="336" y="65" fill="#fff" font-size="8.5" font-family="'Consolas', monospace" font-weight="bold">C102 (0603 MLCC)</text>
      <text x="336" y="74" fill="#fecdd3" font-size="7.5" font-family="sans-serif">탈거 전 저항: 0.8Ω</text>
      <rect x="195" y="155" width="190" height="42" fill="#064e3b" stroke="#10b981" stroke-width="1" rx="3"/>
      <text x="202" y="171" fill="#a7f3d0" font-size="9" font-family="sans-serif" font-weight="bold">✔ 탈거 후 저항: &gt;10MΩ 정상 복구</text>
      <text x="202" y="187" fill="#ecfdf5" font-size="8" font-family="sans-serif">단락 경로 C102 소자 내부로 100% 특정</text>
      <rect x="28" y="28" width="170" height="22" fill="#0f172a" opacity="0.85" rx="3"/>
      <text x="34" y="42" fill="#38bdf8" font-size="8.5" font-family="'Consolas', monospace" font-weight="bold">OPTICAL MICROSCOPE (50X)</text>
      <line x1="35" y1="225" x2="95" y2="225" stroke="#fff" stroke-width="2"/>
      <text x="45" y="220" fill="#fff" font-size="8" font-family="'Consolas', monospace">500 μm</text>
    </svg>
  `;
}

function renderSvgFigureXRay() {
  return `
    <svg viewBox="0 0 460 260" class="d4-figure-svg" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="solderBallGrad" cx="35%" cy="35%" r="65%">
          <stop offset="0%" stop-color="#67e8f9"/>
          <stop offset="40%" stop-color="#0284c7"/>
          <stop offset="90%" stop-color="#0c2340"/>
          <stop offset="100%" stop-color="#050d1a"/>
        </radialGradient>
      </defs>
      <rect width="460" height="260" fill="#070d1e" rx="6"/>
      <g stroke="#1e293b" stroke-width="0.5" stroke-dasharray="2 4">
        <line x1="10" y1="40" x2="450" y2="40"/><line x1="10" y1="80" x2="450" y2="80"/><line x1="10" y1="120" x2="450" y2="120"/>
        <line x1="10" y1="160" x2="450" y2="160"/><line x1="10" y1="200" x2="450" y2="200"/><line x1="10" y1="240" x2="450" y2="240"/>
        <line x1="60" y1="10" x2="60" y2="250"/><line x1="120" y1="10" x2="120" y2="250"/><line x1="180" y1="10" x2="180" y2="250"/>
        <line x1="240" y1="10" x2="240" y2="250"/><line x1="300" y1="10" x2="300" y2="250"/><line x1="360" y1="10" x2="360" y2="250"/>
      </g>
      <g>
        ${[70,115,160,205].map(cy => 
          [80,135,190,245,300,355].map(cx => `
            <circle cx="${cx}" cy="${cy}" r="18" fill="url(#solderBallGrad)" stroke="#38bdf8" stroke-width="1"/>
            <circle cx="${cx-3}" cy="${cy-3}" r="3" fill="#ecfeff" opacity="0.8"/>
            <circle cx="${cx+4}" cy="${cy+5}" r="2" fill="#082f49" opacity="0.6"/>
          `).join('')
        ).join('')}
      </g>
      <circle cx="245" cy="115" r="26" stroke="#22c55e" stroke-width="1.5" fill="none"/>
      <line x1="210" y1="115" x2="280" y2="115" stroke="#22c55e" stroke-width="1" stroke-dasharray="2 2"/>
      <line x1="245" y1="80" x2="245" y2="150" stroke="#22c55e" stroke-width="1" stroke-dasharray="2 2"/>
      <rect x="280" y="88" width="160" height="52" fill="#091e14" stroke="#10b981" stroke-width="1.5" rx="4"/>
      <text x="290" y="104" fill="#4ade80" font-size="9" font-family="'Consolas', monospace" font-weight="bold">BGA SOLDER BALL #C-04</text>
      <text x="290" y="120" fill="#ecfdf5" font-size="8.5" font-family="sans-serif">Void Area Ratio: 4.2% (기준 &lt; 15%)</text>
      <text x="290" y="132" fill="#a7f3d0" font-size="8" font-family="sans-serif">Bridge / Splash: ZERO [합격]</text>
      <rect x="20" y="18" width="220" height="22" fill="#0f172a" opacity="0.9" rx="3"/>
      <text x="28" y="32" fill="#38bdf8" font-size="8.5" font-family="'Consolas', monospace" font-weight="bold">3D X-RAY RADIOGRAPHY · 160kV</text>
      <rect x="20" y="222" width="140" height="24" fill="#047857" rx="3"/>
      <text x="28" y="238" fill="#fff" font-size="8.5" font-family="'Consolas', monospace" font-weight="bold">✔ BGA SOLERING PASS</text>
    </svg>
  `;
}

function renderSvgFigureSEM() {
  return `
    <svg viewBox="0 0 460 260" class="d4-figure-svg" xmlns="http://www.w3.org/2000/svg">
      <rect width="460" height="260" fill="#080b12" rx="6"/>
      <g>
        ${[45,58,71,84,97,110,123,136,149,162,175,188].map((y, idx) => `
          <rect x="40" y="${y}" width="380" height="7" fill="${idx%2===0?'#1e293b':'#243247'}"/>
          <line x1="${idx%2===0?40:70}" y1="${y+3.5}" x2="${idx%2===0?390:420}" y2="${y+3.5}" stroke="#94a3b8" stroke-width="2.5" stroke-linecap="round"/>
        `).join('')}
      </g>
      <rect x="25" y="40" width="22" height="162" fill="#475569" stroke="#64748b"/>
      <rect x="413" y="40" width="22" height="162" fill="#475569" stroke="#64748b"/>
      <text x="27" y="125" fill="#cbd5e1" font-size="8" font-family="'Consolas', monospace" transform="rotate(-90 32 125)">EXT-ELECTRODE</text>
      <path d="M 230 40 Q 235 65 228 85 T 238 115 T 225 145 T 236 175 T 230 202" stroke="#ef4444" stroke-width="3.5" fill="none" stroke-linecap="round"/>
      <path d="M 230 40 Q 235 65 228 85 T 238 115 T 225 145 T 236 175 T 230 202" stroke="#fca5a5" stroke-width="1.2" fill="none"/>
      <line x1="216" y1="115" x2="246" y2="115" stroke="#fbbf24" stroke-width="1.5"/>
      <line x1="216" y1="108" x2="216" y2="122" stroke="#fbbf24" stroke-width="1.5"/>
      <line x1="246" y1="108" x2="246" y2="122" stroke="#fbbf24" stroke-width="1.5"/>
      <text x="202" y="103" fill="#fde047" font-size="8.5" font-family="'Consolas', monospace" font-weight="bold">&lt; 3.8 μm &gt;</text>
      <rect x="260" y="80" width="165" height="42" fill="#450a0a" stroke="#ef4444" stroke-width="1.5" rx="3"/>
      <text x="268" y="96" fill="#fecaca" font-size="8.5" font-family="'Consolas', monospace" font-weight="bold">★ DIELECTRIC VERTICAL CRACK</text>
      <text x="268" y="112" fill="#fff" font-size="8" font-family="sans-serif">내부 전극 간 열응력 전파 파괴 입증</text>
      <rect x="0" y="222" width="460" height="38" fill="#0f172a" stroke="#334155" stroke-width="1"/>
      <text x="14" y="244" fill="#38bdf8" font-size="9" font-family="'Consolas', monospace" font-weight="bold">RAMOS FA LAB · HITACHI SU-8010</text>
      <text x="185" y="244" fill="#94a3b8" font-size="8" font-family="'Consolas', monospace">15.0kV 8.4mm x2.50k SE</text>
      <line x1="340" y1="242" x2="400" y2="242" stroke="#fff" stroke-width="3"/>
      <text x="358" y="238" fill="#fff" font-size="7.5" font-family="'Consolas', monospace">10 μm</text>
      <text x="410" y="244" fill="#10b981" font-size="8" font-family="'Consolas', monospace" font-weight="bold">[EVD-08]</text>
    </svg>
  `;
}

function renderSvgFigureIVCurve() {
  return `
    <svg viewBox="0 0 460 260" class="d4-figure-svg" xmlns="http://www.w3.org/2000/svg">
      <rect width="460" height="260" fill="#080f1e" rx="6"/>
      <g stroke="#1e293b" stroke-width="1">
        <line x1="40" y1="30" x2="420" y2="30"/><line x1="40" y1="60" x2="420" y2="60"/><line x1="40" y1="90" x2="420" y2="90"/>
        <line x1="40" y1="120" x2="420" y2="120"/><line x1="40" y1="150" x2="420" y2="150"/><line x1="40" y1="180" x2="420" y2="180"/><line x1="40" y1="210" x2="420" y2="210"/>
        <line x1="40" y1="30" x2="40" y2="210"/><line x1="103" y1="30" x2="103" y2="210"/><line x1="166" y1="30" x2="166" y2="210"/>
        <line x1="230" y1="30" x2="230" y2="210"/><line x1="293" y1="30" x2="293" y2="210"/><line x1="356" y1="30" x2="356" y2="210"/><line x1="420" y1="30" x2="420" y2="210"/>
      </g>
      <line x1="40" y1="120" x2="420" y2="120" stroke="#64748b" stroke-width="2"/>
      <line x1="230" y1="30" x2="230" y2="210" stroke="#64748b" stroke-width="2"/>
      <text x="424" y="124" fill="#94a3b8" font-size="8.5" font-family="'Consolas', monospace">V (V)</text>
      <text x="224" y="24" fill="#94a3b8" font-size="8.5" font-family="'Consolas', monospace">I (A)</text>
      <text x="218" y="132" fill="#64748b" font-size="7.5" font-family="'Consolas', monospace">0</text>
      <text x="352" y="132" fill="#64748b" font-size="7.5" font-family="'Consolas', monospace">+1.5V</text>
      <text x="96" y="132" fill="#64748b" font-size="7.5" font-family="'Consolas', monospace">-1.5V</text>
      <line x1="40" y1="120" x2="420" y2="120" stroke="#38bdf8" stroke-width="2.5" stroke-dasharray="5 3"/>
      <line x1="120" y1="210" x2="340" y2="30" stroke="#ef4444" stroke-width="3"/>
      <circle cx="280" cy="79" r="4" fill="#ef4444"/>
      <rect x="290" y="45" width="135" height="34" fill="#450a0a" stroke="#ef4444" rx="3"/>
      <text x="296" y="59" fill="#fca5a5" font-size="8" font-family="'Consolas', monospace" font-weight="bold">● 불량시료: 0.8Ω Short</text>
      <text x="296" y="71" fill="#fff" font-size="7.5" font-family="sans-serif">선형 옴성 저항 단락 커브</text>
      <circle cx="360" cy="120" r="4" fill="#38bdf8"/>
      <rect x="280" y="145" width="145" height="34" fill="#0c4a6e" stroke="#38bdf8" rx="3"/>
      <text x="286" y="159" fill="#7dd3fc" font-size="8" font-family="'Consolas', monospace" font-weight="bold">● 탈거 후 정상: &gt;10MΩ</text>
      <text x="286" y="171" fill="#fff" font-size="7.5" font-family="sans-serif">누설전류 차단 (High-Z)</text>
      <rect x="0" y="222" width="460" height="38" fill="#0f172a" stroke="#334155" stroke-width="1"/>
      <text x="14" y="244" fill="#38bdf8" font-size="9" font-family="'Consolas', monospace" font-weight="bold">KEITHLEY 2400 SMU · 4-WIRE KELVIN</text>
      <text x="260" y="244" fill="#94a3b8" font-size="8" font-family="'Consolas', monospace">Range: ±2.0V / ±2.0A</text>
      <text x="400" y="244" fill="#10b981" font-size="8" font-family="'Consolas', monospace" font-weight="bold">[EVD-04]</text>
    </svg>
  `;
}

function renderD4VisualGallery(c) {
  const isExample = Boolean(c?.isExampleCase || c?.id === 'RAMOS-8D-20260901-01' || (c?.d4?.selectedTools?.some(t => t.id === 'physical-fa' && t.status === 'Confirmed')));
  const tools = c?.d4?.selectedTools || [];
  const attachments = tools.flatMap(t => t.artifact?.attachments || []);

  if (!isExample && !attachments.length) {
    return `
      <div class="d4-fa-gallery-wrap">
        <div class="d4-gallery-header">
          <div style="display:flex; align-items:center; gap:8px;">
            <span class="d4-panel-tag">FAILURE ANALYSIS GALLERY</span>
            <h4 style="margin:0; font-size:12px; font-weight:800; color:var(--text-primary);">
              📷 실물 분석 사진 및 공인 시험 성적서 갤러리 (FA Visual Gallery)
            </h4>
          </div>
          <span style="font-size:10px; color:var(--text-muted);">실측 검사 데이터 및 광학/전자현미경 증빙</span>
        </div>
        <div class="d4-fa-gallery-empty" style="border:1px dashed var(--border); border-radius:6px; padding:24px 16px; text-align:center; background:var(--bg-card-subtle); margin-top:10px;">
          <div style="font-size:24px; margin-bottom:6px;">🔬</div>
          <strong style="font-size:12px; color:var(--text-primary);">실물 불량분석(FA) 사진 및 공인 시험 성적서 등록 대기</strong>
          <p style="font-size:10px; color:var(--text-muted); margin:4px auto 0; max-width:480px; line-height:1.4;">
            D4 Evidence 작성 창에서 현미경 사진, SEM 단면, 3D X-Ray, 전기적 I-V 측정 성적서를 첨부하면 고객사 제출용 리포트 갤러리가 실시간으로 자동 구성됩니다.
          </p>
        </div>
      </div>
    `;
  }

  return `
    <div class="d4-fa-gallery-wrap">
      <div class="d4-gallery-header">
        <div style="display:flex; align-items:center; gap:8px;">
          <span class="d4-panel-tag">FAILURE ANALYSIS GALLERY</span>
          <h4 style="margin:0; font-size:12px; font-weight:800; color:var(--text-primary);">
            📷 실물 분석 사진 및 공인 시험 성적서 갤러리 (FA Visual Gallery)
          </h4>
        </div>
        <span style="font-size:10px; color:var(--text-muted);">실측 검사 데이터 및 광학/전자현미경 증빙 4건 완비</span>
      </div>

      <div class="d4-fa-gallery-grid">
        <!-- Figure 1 -->
        <div class="d4-figure-card">
          <div class="d4-figure-card-head">
            <span class="d4-figure-tag">FIG 1 · OPTICAL DECAP</span>
            <span class="d4-figure-badge pass">✔ PASS</span>
          </div>
          <div class="d4-figure-svg-wrap">
            ${renderSvgFigureDecap()}
          </div>
          <div class="d4-figure-meta">
            <b style="color:var(--text-primary); font-size:10px; display:block;">광학 현미경 &amp; 소자 탈거(Decap) 분석</b>
            <span style="color:var(--text-secondary); font-size:9px;">eMMC 기판상 C102 MLCC 탈거 후 저항 정상 복구 확인</span>
            <div style="margin-top:4px; font-size:8px; color:var(--text-muted);">
              장비: Olympus STM6 · 50X Zoom · 성적서 <b>#EVD-07</b>
            </div>
          </div>
        </div>

        <!-- Figure 2 -->
        <div class="d4-figure-card">
          <div class="d4-figure-card-head">
            <span class="d4-figure-tag">FIG 2 · 3D X-RAY RADIOGRAPHY</span>
            <span class="d4-figure-badge pass">✔ PASS</span>
          </div>
          <div class="d4-figure-svg-wrap">
            ${renderSvgFigureXRay()}
          </div>
          <div class="d4-figure-meta">
            <b style="color:var(--text-primary); font-size:10px; display:block;">3D X-Ray BGA 접합부 비파괴 검사</b>
            <span style="color:var(--text-secondary); font-size:9px;">BGA Void율 4.2% (기준 &lt; 15% 합격), 솔더 브릿지 결함 전무 확인</span>
            <div style="margin-top:4px; font-size:8px; color:var(--text-muted);">
              장비: Nordson Dage Quadra 5 · 160kV · 성적서 <b>#EVD-05</b>
            </div>
          </div>
        </div>

        <!-- Figure 3 -->
        <div class="d4-figure-card">
          <div class="d4-figure-card-head">
            <span class="d4-figure-tag">FIG 3 · SEM CROSS-SECTION</span>
            <span class="d4-figure-badge root-cause">★ ROOT CAUSE</span>
          </div>
          <div class="d4-figure-svg-wrap">
            ${renderSvgFigureSEM()}
          </div>
          <div class="d4-figure-meta">
            <b style="color:var(--text-primary); font-size:10px; display:block;">전자현미경(SEM) 단면 유전체 수직 크랙 실측</b>
            <span style="color:var(--text-secondary); font-size:9px;">C102 세라믹 유전체 수직 열응력 Crack(폭 3.8μm) 및 전극 단락 100% 입증</span>
            <div style="margin-top:4px; font-size:8px; color:var(--text-muted);">
              장비: Hitachi SU-8010 · 2,500X · SE Det · 성적서 <b>#EVD-08</b>
            </div>
          </div>
        </div>

        <!-- Figure 4 -->
        <div class="d4-figure-card">
          <div class="d4-figure-card-head">
            <span class="d4-figure-tag">FIG 4 · I-V ELECTRICAL CURVE</span>
            <span class="d4-figure-badge root-cause">★ SHORT PROOF</span>
          </div>
          <div class="d4-figure-svg-wrap">
            ${renderSvgFigureIVCurve()}
          </div>
          <div class="d4-figure-meta">
            <b style="color:var(--text-primary); font-size:10px; display:block;">전기적 I-V 커브 트레이서 특성 분석</b>
            <span style="color:var(--text-secondary); font-size:9px;">VCC-VSS 불량품 저항성 단락 vs 탈거 후 &gt;10MΩ 정상 곡선 비교</span>
            <div style="margin-top:4px; font-size:8px; color:var(--text-muted);">
              장비: Keithley 2400 SMU · 4-Wire Kelvin · 성적서 <b>#EVD-04</b>
            </div>
          </div>
        </div>
      </div>

      <!-- Additional User-Uploaded Attachments (if any) -->
      ${renderD4ReportAttachments(attachments)}
    </div>
  `;
}

function renderD4Visual5Why(c) {
  const tracks = [
    {
      name: 'OCCURRENCE TRACK (발생)',
      color: '#f43f5e',
      bg: 'rgba(244,63,94,0.08)',
      border: '#f43f5e',
      steps: [
        { label: 'Why 1', text: 'eMMC VCC-VSS 단락 발생 ➔ CID Read Timeout', ev: 'EVD-04' },
        { label: 'Why 2', text: 'C102 MLCC 내부 세라믹 유전체 수직 열응력 Crack 발생', ev: 'EVD-07, EVD-08' },
        { label: 'Why 3', text: 'SMT Reflow(260℃) 열응력 누적 대비 X5R 부품 내열 마진 부족', ev: 'Profile Log' },
        { label: 'ROOT CAUSE', text: 'C102 MLCC가 85℃ 보증 X5R 등급 부품으로 선정 투입됨', ev: '4M Notice', isRoot: true }
      ]
    },
    {
      name: 'ESCAPE TRACK (유출)',
      color: '#f59e0b',
      bg: 'rgba(245,158,11,0.08)',
      border: '#f59e0b',
      steps: [
        { label: 'Why 1', text: '외주 양산 Final Test(FT) 전수검사 통과 후 고객사 출하', ev: 'FT Lot Log' },
        { label: 'Why 2', text: '양산 FT가 상온(25℃) 기능검사만 수행하여 잠재 크랙 미검출', ev: 'FT Program Rev.1' },
        { label: 'ROOT CAUSE', text: '125℃ 고온 가속 스트레스 검사항목 결여 (Coverage Gap)', ev: 'PFMEA Gap', isRoot: true }
      ]
    },
    {
      name: 'SYSTEM TRACK (시스템)',
      color: '#38bdf8',
      bg: 'rgba(56,189,248,0.08)',
      border: '#38bdf8',
      steps: [
        { label: 'Why 1', text: 'C102 X5R 자재 변경 승인 및 긴급 납기 대응 선투입', ev: 'BOM Review' },
        { label: 'Why 2', text: '신규 부품 승인 시 공정 온도와 부품 정격 온도 교차검증 절차 누락', ev: 'SOP-RD-044' },
        { label: 'ROOT CAUSE', text: '외주 변경관리 기준에 신뢰성 평가 Gate 누락 및 기준서 부재', ev: 'Supplier Audit', isRoot: true }
      ]
    }
  ];

  return `
    <div class="d4-5why-visual-tree">
      ${tracks.map(track => `
        <div class="d4-5why-track-row" style="background:${track.bg}; border-left:4px solid ${track.border}; border-radius:4px; padding:10px; margin-bottom:10px;">
          <div style="font-size:10px; font-weight:800; color:${track.color}; margin-bottom:8px; display:flex; align-items:center; gap:6px;">
            <i data-lucide="corner-down-right" style="width:12px; height:12px;"></i> ${track.name}
          </div>
          <div class="d4-5why-steps-flow">
            ${track.steps.map((step, idx) => `
              <div class="d4-5why-step-node ${step.isRoot ? 'is-root' : ''}">
                <div class="d4-5why-step-tag" style="${step.isRoot ? 'background:#ef4444; color:#fff;' : `background:${track.color}; color:#000;`}">${step.label}</div>
                <p class="d4-5why-step-text">${step.text}</p>
                <div class="d4-5why-step-ev">Evidence: ${step.ev}</div>
              </div>
              ${idx < track.steps.length - 1 ? `<div class="d4-5why-step-arrow">➔</div>` : ''}
            `).join('')}
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderD4VisualFishbone(c) {
  const bones = [
    { cat: 'Man (인적 요인)', causes: ['변경 승인자 온도 Grade 검토 누락 [Supported]'], status: 'supported' },
    { cat: 'Machine (설비/Reflow)', causes: ['Reflow 온도 프로파일 상한 초과 [Rejected: Logger 정상]'], status: 'rejected' },
    { cat: 'Material (원자재) ★', causes: ['C102 MLCC X5R 고온 내열 마진 부족 [★ ROOT CAUSE]'], status: 'root' },
    { cat: 'Method (작업방법) ★', causes: ['BOM 변경품 신뢰성 평가 절차 누락 [Confirmed]'], status: 'confirmed' },
    { cat: 'Measurement (측정/검사) ★', causes: ['상온 FT만 수행, 125℃ Stress 검사 누락 [★ ESCAPE CAUSE]'], status: 'root' },
    { cat: 'Environment (환경)', causes: ['고객사 SMT 2차 Reflow 열이력 누적 [Supported]'], status: 'supported' },
    { cat: 'Design (회로설계)', causes: ['C102 정격 전압/온도 Derating 설계 마진 부족 [Supported]'], status: 'supported' },
    { cat: 'Supplier (협력사)', causes: ['4M 사전 변경 통보 미준수 [Confirmed]'], status: 'confirmed' }
  ];

  return `
    <div class="d4-fishbone-visual">
      <div class="d4-fishbone-spine">
        <span class="d4-fishbone-spine-label">8M CAUSE &amp; EFFECT AXIS</span>
      </div>
      <div class="d4-fishbone-head">
        <span style="font-size:8px; color:#f87171; font-weight:800;">FAILURE MODE</span>
        <b style="font-size:9.5px; color:#fff; display:block; margin-top:2px;">eMMC CID Timeout<br>(VCC-VSS 단락)</b>
      </div>
      <div class="d4-fishbone-grid">
        ${bones.map(b => `
          <div class="d4-fishbone-rib rib-${b.status}">
            <div class="d4-rib-header">${b.cat}</div>
            <ul class="d4-rib-causes">
              ${b.causes.map(cause => `<li>${cause}</li>`).join('')}
            </ul>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function renderD4VisualFAPipeline(c) {
  const steps = [
    { num: '01', title: '외관 & 3D X-Ray', method: 'Nordson 160kV 비파괴 검사', result: 'BGA Void율 4.2% 합격, 브릿지 결함 없음', status: 'PASS', badgeClass: 'badge-ok' },
    { num: '02', title: 'I-V 전기 저항 측정', method: 'Keithley 2400 4-Wire Kelvin', result: 'VCC-VSS 단락 저항성 Short 확인', status: 'NG (단락)', badgeClass: 'badge-danger' },
    { num: '03', title: 'Decap & 소자 탈거', method: 'Olympus STM6 국소 디솔더링', result: 'C102 탈거 후 기판 저항 >10MΩ 정상 복구', status: 'PASS (원인특정)', badgeClass: 'badge-ok' },
    { num: '04', title: 'SEM 단면 고배율 관찰', method: 'Hitachi SU-8010 2,500X SE', result: '세라믹 유전체 수직 열응력 Crack(3.8μm) 관찰', status: 'CONFIRMED', badgeClass: 'badge-danger' },
    { num: '05', title: 'X7R 대체품 A-B 검증', method: '동일 Reflow 조건 가속 스트레스', result: '고내열 X7R 대체 시 0/30 Fail 무결함 검증', status: 'VERIFIED', badgeClass: 'badge-ok' }
  ];

  return `
    <div class="d4-fa-pipeline-flow">
      ${steps.map((step, idx) => `
        <div class="d4-pipeline-step">
          <div class="d4-step-num">${step.num}</div>
          <div class="d4-step-body">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
              <strong style="font-size:10px; color:var(--text-primary);">${step.title}</strong>
              <span class="badge-pill ${step.badgeClass}" style="font-size:8px;">${step.status}</span>
            </div>
            <div style="font-size:8.5px; color:var(--text-secondary); margin-bottom:2px;"><b>분석:</b> ${step.method}</div>
            <div style="font-size:8.5px; color:var(--text-primary);"><b>결과:</b> ${step.result}</div>
          </div>
        </div>
        ${idx < steps.length - 1 ? `<div class="d4-pipeline-arrow">➔</div>` : ''}
      `).join('')}
    </div>
  `;
}

function renderD4ReportSection(c) {
  c = escapeReportData(c);
  const roots = Object.fromEntries(['Occurrence','Escape','System'].map(type => {
    const legacy = c.d4?.candidateCauses?.find(row => String(row.type).toLowerCase() === type.toLowerCase());
    return [type, c.d4?.rootCauses?.[type] ?? {statement: legacy?.title, evidence: legacy?.supportingEvidence?.join(', ')}];
  }));
  const tools = c.d4?.selectedTools || [];
  const isExample = Boolean(c?.isExampleCase || c?.id === 'RAMOS-8D-20260901-01' || (c?.d4?.selectedTools?.some(t => t.id === 'physical-fa' && t.status === 'Confirmed')));
  const hasTools = tools.length > 0;

  return `
    <section class="stage-report-section d4-report-full-section">
      <h3>D4 · Root Cause Proof & Comprehensive Evidence Package</h3>
      
      <!-- Part 1: Executive 3-Track Root Cause Cards -->
      <div class="d4-report-roots-grid">
        <div class="d4-root-card d4-root-occurrence">
          <div class="d4-root-card-head">
            <span class="d4-root-badge occurrence">OCCURRENCE · 발생 근원인</span>
            <span class="d4-root-status ${roots.Occurrence?.status === 'Confirmed' ? 'confirmed' : 'review'}">
              ${roots.Occurrence?.status === 'Confirmed' ? '✔ CONFIRMED' : '⏳ CANDIDATE'}
            </span>
          </div>
          <h4 class="d4-root-title">${reportEmpty(roots.Occurrence?.statement) || '발생 원인 분석 대기'}</h4>
          <div class="d4-root-detail">
            <div class="d4-root-field"><b>실증 Evidence:</b> <span>${reportEmpty(roots.Occurrence?.evidence) || '성적서 대기'}</span></div>
            ${roots.Occurrence?.validationMethod ? `<div class="d4-root-field"><b>검증 방법:</b> <span>${roots.Occurrence.validationMethod}</span></div>` : ''}
            ${roots.Occurrence?.contraryEvidence ? `<div class="d4-root-field d4-contrary"><b>기각 가설:</b> <span>${roots.Occurrence.contraryEvidence}</span></div>` : ''}
          </div>
        </div>

        <div class="d4-root-card d4-root-escape">
          <div class="d4-root-card-head">
            <span class="d4-root-badge escape">ESCAPE · 유출 근원인</span>
            <span class="d4-root-status ${roots.Escape?.status === 'Confirmed' ? 'confirmed' : 'review'}">
              ${roots.Escape?.status === 'Confirmed' ? '✔ CONFIRMED' : '⏳ CANDIDATE'}
            </span>
          </div>
          <h4 class="d4-root-title">${reportEmpty(roots.Escape?.statement) || '유출 원인 분석 대기'}</h4>
          <div class="d4-root-detail">
            <div class="d4-root-field"><b>실증 Evidence:</b> <span>${reportEmpty(roots.Escape?.evidence) || '검사 로그 대기'}</span></div>
            ${roots.Escape?.validationMethod ? `<div class="d4-root-field"><b>검증 방법:</b> <span>${roots.Escape.validationMethod}</span></div>` : ''}
            ${roots.Escape?.contraryEvidence ? `<div class="d4-root-field d4-contrary"><b>기각 가설:</b> <span>${roots.Escape.contraryEvidence}</span></div>` : ''}
          </div>
        </div>

        <div class="d4-root-card d4-root-system">
          <div class="d4-root-card-head">
            <span class="d4-root-badge system">SYSTEM · 시스템 근원인</span>
            <span class="d4-root-status ${roots.System?.status === 'Confirmed' ? 'confirmed' : 'review'}">
              ${roots.System?.status === 'Confirmed' ? '✔ CONFIRMED' : '⏳ CANDIDATE'}
            </span>
          </div>
          <h4 class="d4-root-title">${reportEmpty(roots.System?.statement) || '시스템 원인 분석 대기'}</h4>
          <div class="d4-root-detail">
            <div class="d4-root-field"><b>실증 Evidence:</b> <span>${reportEmpty(roots.System?.evidence) || '기준서 대기'}</span></div>
            ${roots.System?.validationMethod ? `<div class="d4-root-field"><b>검증 방법:</b> <span>${roots.System.validationMethod}</span></div>` : ''}
            ${roots.System?.contraryEvidence ? `<div class="d4-root-field d4-contrary"><b>기각 가설:</b> <span>${roots.System.contraryEvidence}</span></div>` : ''}
          </div>
        </div>
      </div>

      <!-- Part 2: Failure Analysis (FA) Inspection Photo & Test Certificate Gallery -->
      ${renderD4VisualGallery(c)}

      <!-- Part 3: Interactive & Printable Visual Quality Tool Diagrams -->
      ${hasTools || isExample ? `
        <div class="d4-report-visual-tools-panel">
          <div class="d4-panel-header">
            <div>
              <span class="d4-panel-tag">QUALITY ENGINEERING DIAGRAMS</span>
              <h4 style="margin:2px 0; font-size:12px; font-weight:800; color:var(--text-primary);">품질 분석 도구별 실물 시각화 다이어그램 (Visual Quality Tool Diagrams)</h4>
            </div>
            <span style="font-size:10px; color:var(--text-muted);">발생·유출 5-Why 계통도 &amp; 8M Fishbone &amp; FA 파이프라인</span>
          </div>

          <!-- 3-Track 5-Why Flowchart -->
          <div class="d4-diagram-block">
            <div class="d4-diagram-title">
              <i data-lucide="git-merge" style="width:14px; height:14px; color:#38bdf8;"></i>
              <strong>3-Track 5 Why 원인 분석 인과관계 계통도 (Occurrence · Escape · System)</strong>
            </div>
            ${renderD4Visual5Why(c)}
          </div>

          <!-- Ishikawa 8M Fishbone Diagram -->
          <div class="d4-diagram-block" style="margin-top:16px;">
            <div class="d4-diagram-title">
              <i data-lucide="git-fork" style="width:14px; height:14px; color:#a855f7;"></i>
              <strong>8M Ishikawa 특성요인도 (Fishbone Cause-and-Effect Diagram)</strong>
            </div>
            ${renderD4VisualFishbone(c)}
          </div>

          <!-- Physical FA Sequential Pipeline -->
          <div class="d4-diagram-block" style="margin-top:16px;">
            <div class="d4-diagram-title">
              <i data-lucide="activity" style="width:14px; height:14px; color:#10b981;"></i>
              <strong>Physical FA 5단계 분석 흐름 파이프라인 (Diagnostic Pipeline)</strong>
            </div>
            ${renderD4VisualFAPipeline(c)}
          </div>
        </div>
      ` : ''}

      <!-- Part 4: Evidence Tools Package Summary Table -->
      <div style="margin-top:16px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <h4 style="margin:0; font-size:11px; font-weight:800; color:var(--text-primary);">
            품질도구별 실증 분석 Evidence 목록 (${tools.length}건)
          </h4>
          <span style="font-size:10px; color:#64748b;">
            ※ 본문 요약 뒤쪽에 품질도구별 독립 분석 Evidence ${tools.length}페이지가 A4 공식 부록으로 첨부됩니다.
          </span>
        </div>
        <table class="report-inner-table">
          <thead>
            <tr>
              <th style="width:12%;">Evidence ID</th>
              <th style="width:24%;">품질 분석 도구명</th>
              <th style="width:36%;">분석 목적 / 핵심 발견 사실</th>
              <th style="width:14%;">담당자</th>
              <th style="width:14%; text-align:center;">검증 상태</th>
            </tr>
          </thead>
          <tbody>
            ${tools.length ? tools.map((r, i) => {
              const tool = typeof getD4ToolById === 'function' ? getD4ToolById(r.id) : null;
              const name = tool?.name || r.id;
              const isOk = r.artifact?.humanConfirmed || r.verified;
              return `
                <tr>
                  <td><b>E${String(i+1).padStart(2,'0')}</b> <span style="font-size:9px; color:#64748b;">(${r.id})</span></td>
                  <td><b>${name}</b></td>
                  <td>${escapeD4Evidence(r.finding || r.hypothesis || '분석 진행 중')}</td>
                  <td>${escapeD4Evidence(r.owner || 'CFT 담당자')}</td>
                  <td style="text-align:center;">
                    <span class="badge-pill ${isOk ? 'badge-ok' : 'badge-warn'}" style="font-size:9px;">
                      ${isOk ? '✔ VERIFIED' : '🟡 DRAFT'}
                    </span>
                  </td>
                </tr>
              `;
            }).join('') : `
              <tr>
                <td colspan="5" style="text-align:center; color:#94a3b8; padding:14px;">
                  등록된 D4 분석 도구가 없습니다. D4 Workspace에서 품질 도구를 선택하여 분석을 등록해 주십시오.
                </td>
              </tr>
            `}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

