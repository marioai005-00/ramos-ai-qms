/* Case originals: visible D2/Hub upload, shared QMS files and legacy local files. */
let caseEvidenceUploading = false;
let caseEvidenceNotice = '';
let caseEvidenceNoticeCase = '';
let caseEvidencePreviewUrl = null;
const CASE_EVIDENCE_EXTENSIONS = ['png','jpg','jpeg','webp','pdf','xlsx','xls','csv','docx','eml','txt'];
const CASE_EVIDENCE_TYPES = { 'Customer original':'고객 원본 · 메일/Report', Measurement:'측정·검사 자료', 'FA Analysis':'FA 분석 자료', 'User evidence':'기타 근거 자료' };
function caseEvidenceEscape(value) { return escapeWorkspaceValue(String(value ?? '')); }
function d2EligibleEvidence(c) {
  return (c.evidenceList || []).filter(item => (item.linkedStages || []).includes('D2') && (item.serverFileId || item.storageKey) && item.type !== 'Metadata only');
}
function renderCaseEvidencePanel(c, stage = null) {
  const files = c.evidenceList || [];
  const selectedStage = stage || (/^D[1-8]$/.test(appData.activeStage) ? appData.activeStage : 'D2');
  const notice = caseEvidenceNoticeCase === c.id ? caseEvidenceNotice : '';
  return `<section class="case-evidence-panel" id="caseEvidencePanel" aria-label="근거 자료 첨부">
    <div class="case-evidence-heading"><div><h3><i data-lucide="paperclip"></i> 근거 자료 (Evidence)</h3><p>고객 메일·이미지·Report 또는 측정 자료를 첨부하세요. 선택한 단계에 연결하고 QMS에 원본을 보관합니다.</p></div><span class="badge-pill badge-blue">${files.filter(item => (item.linkedStages || []).includes(selectedStage)).length}건 · ${selectedStage}</span></div>
    <div class="case-evidence-upload" ondragover="event.preventDefault(); if(!caseEvidenceUploading)this.classList.add('is-dragging')" ondragleave="this.classList.remove('is-dragging')" ondrop="event.preventDefault();this.classList.remove('is-dragging');uploadSelectedCaseEvidence(event.dataTransfer.files)">
      <label>증거 유형<select class="form-control" id="caseEvidenceType">${Object.entries(CASE_EVIDENCE_TYPES).map(([value,label])=>`<option value="${value}">${label}</option>`).join('')}</select></label>
      ${stage ? `<input type="hidden" id="caseEvidenceStage" value="${stage}">` : `<label>연결 단계<select class="form-control" id="caseEvidenceStage">${Array.from({length:8},(_,i)=>'D'+(i+1)).map(value=>`<option ${value===selectedStage?'selected':''}>${value}</option>`).join('')}</select></label>`}
      <button type="button" id="caseEvidenceAttachButton" class="btn btn-primary" onclick="document.getElementById('caseEvidenceFileInput').click()" ${caseEvidenceUploading?'disabled':''}><i data-lucide="upload"></i> ${caseEvidenceUploading?'첨부 중…':'파일 첨부'}</button>
      <input type="file" id="caseEvidenceFileInput" hidden multiple accept="${CASE_EVIDENCE_EXTENSIONS.map(ext=>'.'+ext).join(',')}" onchange="uploadSelectedCaseEvidence(this.files)">
      <p class="case-evidence-help">여기로 파일을 끌어 놓아도 됩니다. 이미지·PDF·Excel·CSV·Word·EML·TXT / 파일당 30 MB</p>
    </div>
    ${renderIntakeOriginalsNotice(c)}
    <p id="caseEvidenceStatus" class="case-evidence-status" role="status" aria-live="polite">${caseEvidenceEscape(notice)}</p>
    ${stage ? renderCaseEvidenceList(c,stage) : ''}
  </section>`;
}
/* Shown only while the source intake still has originals on the server that this Case has not received. */
function renderIntakeOriginalsNotice(c) {
  const pending = typeof pendingIntakeOriginals === 'function' ? pendingIntakeOriginals(c) : [];
  if (!pending.length) return '';
  return `<div class="case-evidence-empty">접수 ${caseEvidenceEscape(c.sourceIntakeId)}의 원본 ${pending.length}건이 아직 이 Case의 Evidence로 넘어오지 않았습니다. <button type="button" class="btn btn-secondary btn-sm" onclick="importIntakeOriginals()" ${caseEvidenceUploading?'disabled':''}>접수 원본 가져오기</button></div>`;
}
async function importIntakeOriginals() {
  if (caseEvidenceUploading) return;
  const c = getActiveCase();
  if (!c) return;
  const reviewed = QUALITY_STAGES.slice(1).some(stage => c.signOffHistory?.[stage]?.drafter || c[stage.toLowerCase()]?.approval?.status === 'Approved');
  if (reviewed && !confirm('접수 원본은 D2·D3 Evidence로 등록됩니다. D2 이후 단계의 결재는 재검토 상태로 바뀌고 이전 결재는 이력에 보존됩니다. 계속할까요?')) return;
  if (document.getElementById('d2QualityForm')) captureD2Form(c);
  caseEvidenceUploading = true;
  try {
    saveAppData();
    const result = await carryIntakeOriginalsToCase(c);
    const missing = result.missing.length ? ` 서버에 원본이 없는 ${result.missing.length}건(${result.missing.map(item => item.file).join(', ')})은 옮기지 않았습니다. 원본을 다시 첨부해 주세요.` : '';
    setCaseEvidenceNotice(c, `접수 원본 ${result.carried.length}건을 D2·D3 Evidence로 옮겼습니다 · QMS 원본 보관.${missing}`);
  } catch (error) {
    setCaseEvidenceNotice(c, `접수 원본을 가져오지 못했습니다: ${error.message} 새로고침 후 다시 시도하세요.`);
  } finally {
    caseEvidenceUploading = false;
    if (getActiveCase()?.id === c.id) renderCurrentView();
  }
}
function renderCaseEvidenceList(c, stage = null) {
  const files = (c.evidenceList || []).map((item,index)=>({item,index})).filter(({item})=>!stage || (item.linkedStages || []).includes(stage));
  if (!files.length) return `<div class="case-evidence-empty">첨부된 자료가 없습니다. 위의 <strong>파일 첨부</strong>에서 원본을 등록하세요.</div>`;
  return `<ul class="case-evidence-list">${files.map(({item,index})=>`<li><div class="case-evidence-file"><strong>${caseEvidenceEscape(item.file || item.title)}</strong><span>${caseEvidenceEscape(CASE_EVIDENCE_TYPES[item.type] || item.type)} · ${item.sizeBytes ? formatD4FileSize(item.sizeBytes)+' · ' : ''}${item.serverFileId ? 'QMS 원본 보관' : item.storageKey ? '이전 방식 · 등록한 PC 브라우저에만 보관' : '원본 미보관'}</span><span>${caseEvidenceEscape((item.linkedStages || []).join(' · '))}</span></div><div class="case-evidence-file-actions">${item.serverFileId || item.storageKey ? `<button type="button" class="btn btn-secondary btn-sm" onclick="previewCaseEvidence(${index})">원본 보기</button><button type="button" class="btn btn-secondary btn-sm" onclick="downloadCaseEvidence(${index})">다운로드</button>` : '<span>원본을 첨부해 주세요.</span>'}</div></li>`).join('')}</ul>`;
}
function setCaseEvidenceNotice(c, message) {
  caseEvidenceNoticeCase = c.id;
  caseEvidenceNotice = message;
  const status = document.getElementById('caseEvidenceStatus');
  if (getActiveCase()?.id === c.id && status) status.textContent = message;
}
async function uploadSelectedCaseEvidence(fileList) {
  if (caseEvidenceUploading) return;
  const c = getActiveCase();
  const files = Array.from(fileList || []);
  if (!c || !files.length) return;
  const type = document.getElementById('caseEvidenceType')?.value || 'Customer original';
  const stage = document.getElementById('caseEvidenceStage')?.value || 'D2';
  const invalid = files.find(file => !CASE_EVIDENCE_EXTENSIONS.includes(file.name.split('.').pop().toLowerCase()) || !file.size || file.size > INTAKE_MAX_FILE_BYTES);
  if (invalid) { setCaseEvidenceNotice(c, `${invalid.name}: 지원하는 형식의 0 바이트 초과, 30 MB 이하 파일을 선택하세요.`); return; }
  if (document.getElementById('d2QualityForm')) captureD2Form(c);
  const form = document.getElementById('d2QualityForm');
  const humanChecked = Boolean(form?.elements.humanConfirmed?.checked);
  const controls = [...document.querySelectorAll('#d2QualityForm input, #d2QualityForm textarea, #d2QualityForm button, #d2QualityForm select, #caseEvidencePanel button, #caseEvidencePanel select')].map(el=>({el,disabled:el.disabled}));
  caseEvidenceUploading = true;
  controls.forEach(({el})=>el.disabled=true);
  let completed = 0;
  try {
    saveAppData();
    await QMSApi.flushSaves();
    for (const file of files) {
      setCaseEvidenceNotice(c, `${completed + 1}/${files.length} · ${file.name} 원본 저장 중…`);
      const result = await QMSApi.uploadCaseEvidence(c.id,file,type,[stage]);
      // Originals, metadata and revision are committed together by the server.
      Object.assign(c,result.case);
      saveAppData();
      await QMSApi.flushSaves();
      completed++;
    }
    setCaseEvidenceNotice(c, `${completed}건 첨부 완료 · ${stage} 연결 · QMS 원본 보관`);
  } catch (error) {
    setCaseEvidenceNotice(c, `${completed ? completed+'건 첨부 완료. ' : ''}첨부를 완료하지 못했습니다: ${error.message} 새로고침 후 목록을 확인하고 다시 첨부하세요.`);
  } finally {
    caseEvidenceUploading = false;
    controls.forEach(({el,disabled})=>el.disabled=disabled);
    if (getActiveCase()?.id === c.id) {
      renderCurrentView();
      if (humanChecked && c.d2?.approval?.status !== 'Approved') {
        const check = document.getElementById('d2QualityForm')?.elements.humanConfirmed;
        if (check) check.checked = true;
      }
    }
  }
}
async function retrieveCaseEvidenceFile(c, evidence) {
  let blob;
  if (evidence.serverFileId) blob = await QMSApi.fetchCaseEvidence(c.id,evidence.serverFileId);
  else if (evidence.intakeFileId) blob = await QMSApi.fetchIntakeFile(evidence.intakeFileId);
  else if (evidence.storageKey) blob = await getD4EvidenceFile(evidence.storageKey);
  if (!blob || !blob.size) throw new Error('원본 파일이 없습니다. 이전 방식으로 등록된 파일은 등록한 PC의 브라우저에서만 열립니다. 원본을 다시 첨부하세요.');
  return new File([blob], evidence.file || evidence.title || 'evidence', {type: evidence.mimeType || blob.type || 'application/octet-stream'});
}
async function verifyD2Evidence(c) {
  const candidates = d2EligibleEvidence(c);
  for (const evidence of candidates) {
    try { await retrieveCaseEvidenceFile(c,evidence); return true; } catch (_) {}
  }
  setCaseEvidenceNotice(c, candidates.length ? '원본을 열 수 없습니다. QMS 연결을 확인하세요. 이전 방식으로 등록된 파일은 등록한 PC에서만 열리므로 파일을 다시 첨부하세요.' : 'D2에 연결된 고객 원본 또는 측정 자료가 필요합니다. 파일 첨부에서 등록해 주세요.');
  alert(caseEvidenceNotice);
  return false;
}
async function downloadCaseEvidence(index) {
  const c = getActiveCase(), evidence = c?.evidenceList?.[index];
  if (!evidence) return;
  try {
    const file = await retrieveCaseEvidenceFile(c,evidence), url = URL.createObjectURL(file);
    const link = document.createElement('a');link.href=url;link.download=file.name;document.body.appendChild(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),10000);
  } catch(error) { setCaseEvidenceNotice(c,`원본 다운로드 실패: ${error.message}`); }
}
function closeCaseEvidencePreview() {
  closeModal();
  if (caseEvidencePreviewUrl) URL.revokeObjectURL(caseEvidencePreviewUrl);
  caseEvidencePreviewUrl = null;
}
async function previewCaseEvidence(index) {
  const c = getActiveCase(), evidence = c?.evidenceList?.[index];
  if (!evidence) return;
  try {
    const file = await retrieveCaseEvidenceFile(c,evidence);
    closeCaseEvidencePreview();
    const url = URL.createObjectURL(file);caseEvidencePreviewUrl=url;
    setTimeout(()=>{URL.revokeObjectURL(url);if(caseEvidencePreviewUrl===url)caseEvidencePreviewUrl=null;},600000);
    const ext = file.name.split('.').pop().toLowerCase();
    let content = '<p>이 형식은 다운로드하여 원본 프로그램에서 확인하세요.</p>';
    if (['png','jpg','jpeg','webp'].includes(ext)) content=`<img src="${url}" alt="${caseEvidenceEscape(file.name)}">`;
    else if (ext === 'pdf') content=`<iframe src="${url}" title="Evidence PDF 원본" sandbox="allow-same-origin"></iframe>`;
    else if (['txt','csv','eml'].includes(ext) && file.size <= 2*1024*1024) content=`<pre>${caseEvidenceEscape(await file.text())}</pre>`;
    const container=document.getElementById('modalContainer');
    container.innerHTML=`<div class="case-evidence-preview"><div class="case-evidence-heading"><h3>${caseEvidenceEscape(file.name)}</h3><button type="button" class="btn btn-secondary btn-sm" onclick="closeCaseEvidencePreview()">닫기</button></div><p>${evidence.serverFileId?'QMS 원본':'이전 방식 · 이 브라우저에 보관된 원본'} ·${formatD4FileSize(file.size)}</p><div class="case-evidence-preview-content">${content}</div><button type="button" class="btn btn-primary" onclick="downloadCaseEvidence(${index})">원본 다운로드</button></div>`;
    document.getElementById('globalModal').style.display='flex';
  } catch(error) { setCaseEvidenceNotice(c,`원본 열람 실패: ${error.message}`); }
}
