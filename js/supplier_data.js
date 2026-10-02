/* ========================================================================= */
/* RAMOS SUPPLIER QUALITY & 4M PCN DATA MANAGEMENT LAYER                     */
/* ========================================================================= */

const SUPPLIER_STORAGE_KEY = 'RAMOS_SUPPLIER_RECORDS_V3_USER_WORKSPACE';

const SUPPLIER_CATEGORIES = {
  OSAT_PKG: 'OSAT 패키지',
  SMT_MODULE: 'SMT 모듈 조립',
  TEST_HOUSE: '테스트 하우스'
};

const MASTER_SUPPLIERS = [
  { id: 'SUP-TECHL', username: 'thkwon', name: 'TechL', category: 'SMT_MODULE', plant: '', defaultContact: '권태훈 부장', email: 'thkwon@techl.co.kr', phone: '' },
  { id: 'SUP-WINPAC', username: 'yspark', name: 'WinPAC', category: 'OSAT_PKG', plant: '', defaultContact: '박영수 차장', email: 'yspark@winpac.co.kr', phone: '' },
  { id: 'SUP-SSPC', username: 'sangwook.ki', name: 'SSPC', category: 'OSAT_PKG', plant: '', defaultContact: '기상욱 팀장', email: 'sangwook.ki@sfasemicon.com', phone: '' },
  { id: 'SUP-CTST', username: 'ojs', name: 'CTST', category: 'TEST_HOUSE', plant: '', defaultContact: '오재수 그룹장', email: 'ojs@ctst.co.kr', phone: '' }
];

function getOfficialSupplierForUser(user) {
  if (!user) return null;
  return MASTER_SUPPLIERS.find(supplier => supplier.username === user.username) || null;
}

const SUPPLIER_TICKET_API = '/__api__/qms/supplier-tickets';

// Central records: `raw` is what the server returned, `display` is the HTML-escaped copy the views render.
const supplierTicketStore = { actor: '', raw: [], display: [], loaded: false, loading: false, error: '' };

function escapeSupplierDisplay(value) {
  if (typeof value === 'string') return value.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  if (Array.isArray(value)) return value.map(escapeSupplierDisplay);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, escapeSupplierDisplay(item)]));
  return value;
}

function setSupplierRecords(records) {
  supplierTicketStore.raw = records;
  supplierTicketStore.display = escapeSupplierDisplay(records);
}

function supplierTicketActor() {
  const actor = (typeof QMSApi !== 'undefined' && QMSApi.getState().user?.username) || '';
  if (actor !== supplierTicketStore.actor) {
    Object.assign(supplierTicketStore, { actor, loaded: false, loading: false, error: '' });
    setSupplierRecords([]);
  }
  return actor;
}

function loadSupplierRecords() {
  supplierTicketActor();
  return supplierTicketStore.display;
}

function getSupplierTicketRaw(ticketId) {
  return supplierTicketStore.raw.find(record => record.ticketId === ticketId) || null;
}

async function refreshSupplierRecords(force = false) {
  const actor = supplierTicketActor();
  if (!actor || supplierTicketStore.loading || (supplierTicketStore.loaded && !force)) return supplierTicketStore.display;
  supplierTicketStore.loading = true;
  supplierTicketStore.error = '';
  try {
    const result = await QMSApi.request(SUPPLIER_TICKET_API);
    if (supplierTicketActor() === actor) setSupplierRecords(result.items || []);
  } catch (error) {
    if (supplierTicketActor() === actor) supplierTicketStore.error = error.message;
  } finally {
    if (supplierTicketStore.actor === actor) Object.assign(supplierTicketStore, { loading: false, loaded: true });
  }
  return supplierTicketStore.display;
}

function applySupplierRecord(record) {
  const others = supplierTicketStore.raw.filter(item => item.ticketId !== record.ticketId);
  setSupplierRecords([record, ...others]);
  return record;
}

async function supplierTicketFilePayload(files) {
  const selected = Array.from(files || []);
  return Promise.all(selected.map(async file => ({ filename: file.name, dataUrl: await fileAsDataURL(file) })));
}

async function createSupplierTicket(data, files) {
  const result = await QMSApi.request(SUPPLIER_TICKET_API, { method: 'POST', body: { ...data, files: await supplierTicketFilePayload(files) } });
  return applySupplierRecord(result.record);
}

async function updateSupplierTicket(ticketId, body, files) {
  const current = getSupplierTicketRaw(ticketId);
  if (!current) throw new Error('해당 접수 건을 찾을 수 없습니다. 목록을 새로고침해 주세요.');
  const result = await QMSApi.request(`${SUPPLIER_TICKET_API}/${encodeURIComponent(ticketId)}`, {
    method: 'POST', body: { ...body, expectedRevision: current.revision, files: await supplierTicketFilePayload(files) }
  });
  return applySupplierRecord(result.record);
}

function reviewSupplierTicket(ticketId, decision, comment) {
  return updateSupplierTicket(ticketId, { action: 'review', decision, comment });
}

function bindSupplierTicketTo8DCase(ticketId, caseId) {
  return updateSupplierTicket(ticketId, { action: 'bind', caseId, comment: '' });
}

function resubmitSupplierTicket(ticketId, reportTitle, comment, files) {
  return updateSupplierTicket(ticketId, { action: 'resubmit', reportTitle, comment }, files);
}

async function downloadSupplierTicketFile(ticketId, fileId) {
  const file = getSupplierTicketRaw(ticketId)?.evidenceFiles?.find(item => item.id === fileId);
  if (!file) return alert('첨부 원본을 찾을 수 없습니다.');
  const response = await fetch(`${SUPPLIER_TICKET_API}/${encodeURIComponent(ticketId)}/files/${encodeURIComponent(fileId)}`, { credentials: 'same-origin', cache: 'no-store' });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    return alert(error.error || `원본 요청 실패 (HTTP ${response.status})`);
  }
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// UI audit scripts render the views from in-memory records; nothing is sent to or stored on the server.
function setSupplierTicketFixture(records) {
  supplierTicketActor();
  setSupplierRecords(records);
  supplierTicketStore.loaded = true;
}

// Tickets saved by earlier versions stay in this browser only. They are never deleted or uploaded automatically.
function legacyBrowserSupplierRecords() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SUPPLIER_STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function exportLegacyBrowserSupplierRecords() {
  const records = legacyBrowserSupplierRecords();
  if (!records.length) return alert('이 브라우저에 남아 있는 이전 접수 기록이 없습니다.');
  const url = URL.createObjectURL(new Blob([JSON.stringify(records, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'supplier_tickets_browser_backup.json';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Global exports
if (typeof window !== 'undefined') {
  window.SUPPLIER_STORAGE_KEY = SUPPLIER_STORAGE_KEY;
  window.SUPPLIER_CATEGORIES = SUPPLIER_CATEGORIES;
  window.MASTER_SUPPLIERS = MASTER_SUPPLIERS;
  window.getOfficialSupplierForUser = getOfficialSupplierForUser;
  window.supplierTicketStore = supplierTicketStore;
  window.loadSupplierRecords = loadSupplierRecords;
  window.getSupplierTicketRaw = getSupplierTicketRaw;
  window.refreshSupplierRecords = refreshSupplierRecords;
  window.setSupplierTicketFixture = setSupplierTicketFixture;
  window.createSupplierTicket = createSupplierTicket;
  window.reviewSupplierTicket = reviewSupplierTicket;
  window.bindSupplierTicketTo8DCase = bindSupplierTicketTo8DCase;
  window.resubmitSupplierTicket = resubmitSupplierTicket;
  window.downloadSupplierTicketFile = downloadSupplierTicketFile;
  window.legacyBrowserSupplierRecords = legacyBrowserSupplierRecords;
  window.exportLegacyBrowserSupplierRecords = exportLegacyBrowserSupplierRecords;
}
