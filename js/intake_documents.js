/* Original intake evidence and document content. Reuses the existing IndexedDB store. */
const INTAKE_MAX_FILE_BYTES = 30 * 1024 * 1024;
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

async function prepareIntakeEvidence(items) {
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
    item.storageKey = item.storageKey || `intake__${item.id || intakeFileId()}`;
    if (typeof putD4EvidenceFile === 'function') {
      await putD4EvidenceFile(item.storageKey, item.fileObj);
    }
    let hash = null;
    try {
      const bytes = await item.fileObj.arrayBuffer();
      if (globalThis.crypto?.subtle) {
        hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
      }
    } catch (e) {
      console.warn('Hash computation failed:', e);
    }
    result.push({
      id: `INT-EVD-${item.id || intakeFileId()}`,
      title: `[고객 접수 원본] ${item.name}`,
      file: item.name,
      type: 'Customer original',
      sourceType: typeof getIntakeSourceType === 'function' ? getIntakeSourceType() : 'Customer Portal',
      linkedStages: ['D2', 'D3'],
      storageKey: item.storageKey,
      mimeType: item.fileObj.type,
      sizeBytes: item.fileObj.size,
      sha256: hash,
      uploadedBy: (typeof CURRENT_USER !== 'undefined' && CURRENT_USER?.email) ? CURRENT_USER.email : 'portal',
      uploadedAt: new Date().toISOString(),
      parsingStatus: item.document?.status || 'Extracted'
    });
  }
  return result;
}

async function openStoredEvidence(storageKey) {
  try {
    if (typeof getD4EvidenceFile !== 'function') throw new Error('파일 저장소가 준비되지 않았습니다.');
    const file = await getD4EvidenceFile(storageKey);
    if (!file) throw new Error('이 브라우저 저장소에 원본 파일이 없습니다.');
    const link = document.createElement('a');
    const url = URL.createObjectURL(file);
    link.href = url;
    link.download = file.name || 'evidence';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) {
    alert(`원본 열람 실패: ${error.message}`);
  }
}

function intakeEvidenceLinks(items) {
  return (items || []).map(item => `
    <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
      <span>${typeof escapeWorkspaceValue === 'function' ? escapeWorkspaceValue(item.file) : item.file}</span>
      ${item.storageKey ? `<button type="button" class="btn btn-secondary btn-sm" onclick="openStoredEvidence('${item.storageKey}')" style="font-size:0.72rem; padding:2px 8px;">원본 다운로드</button>` : `<span style="font-size:0.72rem; color:#94a3b8;">(원본 미보관)</span>`}
    </div>
  `).join('');
}
