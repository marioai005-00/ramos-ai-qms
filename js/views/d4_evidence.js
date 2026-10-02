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

function createD4EvidenceArtifact(toolId,row,c) {
  const schema=getD4EvidenceSchema(toolId);
  const rows=Array.from({length:3},()=>({values:schema.columns.map(()=> '')}));
  return {version:1,documentNo:`${c?.id || 'CASE'}-D4-${schema.code}`,objective:row?.hypothesis||'',sourceEvidence:row?.evidence||'',conclusion:row?.finding||'',rows,attachments:[],humanConfirmed:false,updatedBy:'',updatedAt:''};
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
  row.artifact=row.artifact||createD4EvidenceArtifact(row.id,row,c);
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
  for(const file of [...fileList]){const extension=(file.name.split('.').pop()||'').toLowerCase();if(!D4_ALLOWED_EXTENSIONS.includes(extension)){alert(`${file.name}: 지원하지 않는 형식입니다.`);continue;}if(file.size>30*1024*1024){alert(`${file.name}: 파일당 30MB를 초과했습니다.`);continue;}const id=makeD4AttachmentId();const storageKey=`${c.id}__${row.id}__${id}`;try{await putD4EvidenceFile(storageKey,file);pendingD4NewKeys.push(storageKey);pendingD4Attachments.push({id,storageKey,name:file.name,type:file.type||'application/octet-stream',extension,size:file.size,previewType:file.type.startsWith('image/')?'image':extension==='pdf'?'pdf':'document',uploadedBy:CURRENT_USER.name,uploadedAt:qmsLocalTimestamp()});}catch(error){console.error(error);alert(`${file.name}: 브라우저 Evidence 저장소에 보관하지 못했습니다.`);}}
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
  row.hypothesis=objective;row.evidence=sources;row.finding=conclusion;row.artifact={version:1,documentNo:document.getElementById('d4EvDocNo').value.trim()||`${c.id}-D4-${schema.code}`,objective,sourceEvidence:sources,conclusion,rows,attachments:pendingD4Attachments.map(item=>({...item})),humanConfirmed:confirmed,updatedBy:CURRENT_USER.name,updatedAt:qmsLocalTimestamp()};
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
  const schema=getD4EvidenceSchema(row.id); const artifact=row.artifact||createD4EvidenceArtifact(row.id,row,c); const rows=artifact.rows||[];
  return `<article class="stage-report-paper d4-evidence-paper"><div class="stage-report-watermark">DRAFT · HUMAN APPROVAL REQUIRED</div><div class="d4-evidence-doc-head"><div><b>RAMOS</b><small>D4 ROOT CAUSE EVIDENCE</small></div><div><span>EVIDENCE ${String(index+1).padStart(2,'0')}</span><h2>${escapeD4Evidence(schema.title)}</h2></div><dl><dt>문서번호</dt><dd>${escapeD4Evidence(artifact.documentNo)}</dd><dt>확인상태</dt><dd class="${artifact.humanConfirmed?'ok':'wait'}">${artifact.humanConfirmed?'HUMAN VERIFIED':'DRAFT'}</dd></dl></div><div class="d4-evidence-purpose"><b>분석 목적 / 가설</b><p>${escapeD4Evidence(artifact.objective)||'작성 대기'}</p><small>Source · ${escapeD4Evidence(artifact.sourceEvidence)||'연결 Evidence 대기'}</small></div>${rows.length?renderD4EvidenceVisual(row.id,schema,rows):'<div class="d4-file-only-note">구조화 입력 대신 첨부된 완성 분석자료를 원본 Evidence로 사용합니다.</div>'}${renderD4ReportAttachments(artifact.attachments||[])}<div class="d4-evidence-result"><b>분석 결론</b><p>${escapeD4Evidence(artifact.conclusion)||'분석 결론 작성 대기'}</p></div><footer class="stage-report-foot"><span>작성/확인 · ${escapeD4Evidence(artifact.updatedBy)||'미확인'} ${escapeD4Evidence(artifact.updatedAt)}</span><span>${c.id} · D4-E${String(index+1).padStart(2,'0')}</span></footer></article>`;
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

/* D4 report gallery: only files the owner actually attached to the analysis tools. */
function renderD4VisualGallery(c) {
  const attachments = (c?.d4?.selectedTools || []).flatMap(t => t.artifact?.attachments || []);
  return `
    <div class="d4-fa-gallery-wrap">
      <div class="d4-gallery-header">
        <div style="display:flex; align-items:center; gap:8px;">
          <span class="d4-panel-tag">FAILURE ANALYSIS GALLERY</span>
          <h4 style="margin:0; font-size:12px; font-weight:800; color:var(--text-primary);">첨부된 분석 사진 및 성적서</h4>
        </div>
        <span style="font-size:10px; color:var(--text-muted);">첨부 ${attachments.length}건</span>
      </div>
      ${attachments.length ? renderD4ReportAttachments(attachments) : `
        <div class="d4-fa-gallery-empty" style="border:1px dashed var(--border); border-radius:6px; padding:24px 16px; text-align:center; background:var(--bg-card-subtle); margin-top:10px;">
          <strong style="font-size:12px; color:var(--text-primary);">첨부된 분석 자료가 없습니다</strong>
          <p style="font-size:10px; color:var(--text-muted); margin:4px auto 0; max-width:480px; line-height:1.4;">
            D4 Evidence 작성 창에서 사진과 성적서를 첨부하면 이 영역에 표시됩니다.
          </p>
        </div>`}
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
                  <td>${escapeD4Evidence(r.owner || '')}</td>
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

