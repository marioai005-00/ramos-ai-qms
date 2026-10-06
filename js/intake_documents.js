/* Original intake evidence and document content. Originals are stored on the central QMS server under the
   intake number; files kept by older versions in this browser's IndexedDB store stay readable. */
const INTAKE_MAX_FILE_BYTES = 30 * 1024 * 1024;
const INTAKE_ORIGINAL_EXTENSIONS = ['pdf','docx','doc','xlsx','xls','csv','pptx','ppt','eml','msg','txt','png','jpg','jpeg','webp','gif','bmp'];
let intakeRequestVersion = 0;
let intakeSubmitting = false;
let intakeExtraction = null;

function intakeFileId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function fileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error || new Error('파일 읽기 실패'));
    r.readAsDataURL(file);
  });
}

async function readIntakeDocument(item) {
  const file = item.fileObj;
  if (!file) return { status: 'Manual review', text: '', reason: '원본 파일 없음 (예제/구형 메타데이터)' };
  const ext = file.name.split('.').pop().toLowerCase();
  const media = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' }[ext];
  if (media) {
    if (file.size > 18 * 1024 * 1024) return { status: 'Manual review', text: '', reason: '직접 전송 한도 18 MB 초과' };
    return { status: 'Media ready', text: '', media: { name: file.name, dataUrl: await fileAsDataURL(new File([file], file.name, { type: media })) } };
  }
  if (['xlsx', 'xls', 'csv'].includes(ext)) {
    if (typeof XLSX === 'undefined') throw new Error('Excel 파서를 사용할 수 없습니다.');
    const book = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const text = book.SheetNames.map(name => `[Sheet: ${name}]\n${XLSX.utils.sheet_to_csv(book.Sheets[name])}`).join('\n');
    return { status: 'Text extracted', text: text.slice(0, 100000), truncated: text.length > 100000 };
  }
  if (['txt', 'eml', 'docx'].includes(ext)) {
    if (file.size > 20 * 1024 * 1024) return { status: 'Manual review', text: '', reason: '로컬 해석 한도 20 MB 초과 — 원본을 직접 확인하세요.' };
    const response = await fetch('/__api__/documents/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: file.name, dataUrl: await fileAsDataURL(file) })
    });
    if (!response.ok) throw new Error(`문서 해석 실패 (HTTP ${response.status})`);
    const result = await response.json();
    if (!result.success) throw new Error(result.error || '문서 해석 실패');
    return { status: 'Text extracted', text: result.text, truncated: result.truncated };
  }
  return { status: 'Manual review', text: '', reason: `.${ext} 자동 해석 미지원 — 원본을 직접 확인하세요.` };
}

async function prepareIntakeEvidence(items, intakeId) {
  const result = [];
  for (const item of items) {
    if (!item.fileObj) {
      result.push({
        id: `INT-EVD-${item.id || intakeFileId()}`,
        title: `[예제/구형 파일명] ${item.name}`,
        file: item.name,
        type: 'Metadata only',
        linkedStages: ['D2'],
        sourceType: typeof getIntakeSourceType === 'function' ? getIntakeSourceType() : 'Customer Portal'
      });
      continue;
    }
    // The server stores the bytes and returns the size and SHA-256 it computed; a failed upload stops the intake.
    // A retry reuses what is already stored for the same intake number.
    if (item.central?.intakeId !== intakeId) item.central = await QMSApi.uploadIntakeFile(intakeId, item.fileObj);
    result.push({
      id: `INT-EVD-${item.id || intakeFileId()}`,
      title: `[고객 접수 원본] ${item.name}`,
      file: item.name,
      type: 'Customer original',
      sourceType: typeof getIntakeSourceType === 'function' ? getIntakeSourceType() : 'Customer Portal',
      linkedStages: ['D2', 'D3'],
      storageLocation: 'QMS',
      intakeFileId: item.central.intakeFileId,
      mimeType: item.central.mimeType,
      sizeBytes: item.central.sizeBytes,
      sha256: item.central.sha256,
      uploadedBy: item.central.uploadedBy,
      uploadedAt: item.central.uploadedAt,
      parsingStatus: item.document?.status || 'Extracted'
    });
  }
  return result;
}

function saveIntakeOriginal(blob, name) {
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = name || 'evidence';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function openIntakeOriginal(fileId) {
  try {
    const entry = (appData.intakeQueue || []).flatMap(item => item.evidenceList || []).find(item => item.intakeFileId === fileId);
    saveIntakeOriginal(await QMSApi.fetchIntakeFile(fileId), entry?.file);
  } catch (error) {
    alert(`원본 열람 실패: ${error.message}`);
  }
}

/* Files attached by older versions exist only in the browser that registered them. */
async function openStoredEvidence(storageKey) {
  try {
    if (typeof getD4EvidenceFile !== 'function') throw new Error('파일 저장소가 준비되지 않았습니다.');
    const file = await getD4EvidenceFile(storageKey);
    if (!file) throw new Error('이전 방식으로 등록된 원본이라 등록한 PC의 브라우저에서만 열립니다.');
    saveIntakeOriginal(file, file.name);
  } catch (error) {
    alert(`원본 열람 실패: ${error.message}`);
  }
}

function intakeEvidenceLinks(items) {
  const note = text => `<span style="font-size:0.72rem; color:#94a3b8;">${text}</span>`;
  const button = call => `<button type="button" class="btn btn-secondary btn-sm" onclick="${call}" style="font-size:0.72rem; padding:2px 8px;">원본 다운로드</button>`;
  return (items || []).map(item => `
    <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
      <span>${typeof escapeWorkspaceValue === 'function' ? escapeWorkspaceValue(item.file) : item.file}</span>
      ${/^[A-Za-z0-9-]+$/.test(item.intakeFileId || '') ? `${button(`openIntakeOriginal('${item.intakeFileId}')`)}${note('QMS 원본 보관')}`
        : item.storageKey ? `${button(`openStoredEvidence('${item.storageKey}')`)}${note('이전 방식 · 등록한 PC 브라우저에만 보관')}`
        : note('(원본 미보관)')}
    </div>
  `).join('');
}

/* Intake originals the server holds that this Case does not have yet. The server copies them; the browser
   never writes those evidence entries itself. */
function pendingIntakeOriginals(c) {
  const intake = (appData.intakeQueue || []).find(item => item.intakeId === c?.sourceIntakeId);
  const carried = new Set((c?.evidenceList || []).map(item => item.intakeFileId).filter(Boolean));
  return (intake?.evidenceList || []).filter(item => item.intakeFileId && !carried.has(item.intakeFileId));
}

async function carryIntakeOriginalsToCase(c) {
  if (!pendingIntakeOriginals(c).length) return { carried: [], missing: [] };
  const result = await QMSApi.carryIntakeOriginals(c.id);
  if (result.carried.length) {
    // Originals, Evidence entries (D2·D3) and revision are committed together by the server.
    Object.assign(c, result.case);
    saveAppData();
    await QMSApi.flushSaves();
  }
  return result;
}
