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

const INITIAL_SUPPLIER_RECORDS = [];

function loadSupplierRecords() {
  try {
    const raw = localStorage.getItem(SUPPLIER_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn('[SupplierData] Stored data retained; unable to read records:', e);
    return [];
  }
  saveSupplierRecords(INITIAL_SUPPLIER_RECORDS);
  return INITIAL_SUPPLIER_RECORDS;
}

function saveSupplierRecords(records) {
  try {
    localStorage.setItem(SUPPLIER_STORAGE_KEY, JSON.stringify(records));
  } catch (e) {
    console.error('[SupplierData] Failed to save records:', e);
  }
}

function generateSupplierTicketId(type) {
  const prefix = type === 'PCN' ? 'PCN' : 'SQ';
  const year = new Date().getFullYear();
  const records = loadSupplierRecords();
  const seqs = records
    .map(r => r.ticketId)
    .filter(Boolean)
    .map(id => {
      const parts = id.split('-');
      return parts.length >= 3 ? parseInt(parts[2], 10) : 0;
    })
    .filter(n => !isNaN(n) && n > 0);
  const maxSeq = seqs.length ? Math.max(...seqs) : 0;
  const nextSeq = String(maxSeq + 1).padStart(3, '0');
  return `${prefix}-${year}-${nextSeq}`;
}

function determine4MRiskLevel(change4M = [], reasonType = '') {
  if (change4M.includes('Material') || reasonType === 'Process_Abnormal' || reasonType === 'Cost_Reduction_And_Reliability') {
    return 'MAJOR';
  }
  if (change4M.length >= 2) {
    return 'MAJOR';
  }
  return 'MINOR';
}

function createSupplierTicket(data) {
  const records = loadSupplierRecords();
  const ticketId = generateSupplierTicketId(data.ticketType || 'PCN');
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  const createdAt = `${yyyy}-${mm}-${dd} ${hh}:${min}`;

  const isIssue = (data.ticketType === 'Issue');
  const newTicket = {
    ticketId,
    ticketType: data.ticketType || 'PCN',
    status: 'Submitted',
    createdAt,
    supplier: {
      category: data.supplierCategory || 'OSAT_PKG',
      companyName: data.companyName || '미지정 협력사',
      plant: data.plant || '',
      submitter: data.submitter || '',
      email: data.email || '',
      phone: data.phone || ''
    },
    targetProduct: {
      customer: data.customer || 'LGE DTV',
      partName: data.partName || '16GB eMMC v5.1',
      partNumber: data.partNumber || 'RMS-EMMC-16G-LGE01',
      lotNo: data.lotNo || ''
    },
    classification: {
      change4M: Array.isArray(data.change4M) ? data.change4M : ['Material'],
      issueCategory: data.issueCategory || (isIssue ? 'Process_Abnormal' : '4M_Change_Request'),
      riskLevel: isIssue ? 'MAJOR' : determine4MRiskLevel(data.change4M, data.reasonType),
      reasonType: data.reasonType || (isIssue ? 'Process_Abnormal' : 'Quality_Improvement')
    },
    details: {
      title: data.title || (isIssue ? '[긴급 외주 품질이상 통보]' : '[4M 사전 변경 승인 요청]'),
      description: data.description || '',
      comparisonTable: Array.isArray(data.comparisonTable) && data.comparisonTable.length > 0 ? data.comparisonTable : [
        { item: '주요 사양/공정 조건', current: '현행 사양 (기존)', proposed: '신규 사양 (제안)', riskAssessment: '신뢰성 영향 평가 완료' }
      ],
      plannedSampleDate: data.plannedSampleDate || '',
      plannedMassDate: data.plannedMassDate || ''
    },
    incident: isIssue ? (data.incident || {
      defectCategory: data.defectCategory || 'Yield_Drop',
      processStep: data.processStep || 'Molding_Underfill',
      inputQty: Number(data.inputQty || 0),
      defectQty: Number(data.defectQty || 0),
      defectRate: data.defectRate || '0.00',
      lineAction: data.lineAction || 'Line_Stop',
      quarantineQty: Number(data.quarantineQty || 0),
      quarantineLocation: data.quarantineLocation || '',
      inTransitAction: data.inTransitAction || '',
      containmentAction: data.containmentAction || '',
      faReportDeadline: data.faReportDeadline || '',
      emergencySupportRequest: data.emergencySupportRequest || ''
    }) : null,
    evidenceFiles: Array.isArray(data.evidenceFiles) ? data.evidenceFiles : [],
    sqeReview: {
      reviewer: '미지정 (접수 대기)',
      reviewedAt: null,
      decision: 'Pending',
      comment: '',
      bound8DCaseId: null
    }
  };

  records.unshift(newTicket);
  saveSupplierRecords(records);
  return newTicket;
}

function updateSupplierTicketStatus(ticketId, decision, reviewComment = '', reviewerName = '') {
  const records = loadSupplierRecords();
  const ticket = records.find(r => r.ticketId === ticketId);
  if (!ticket) return null;

  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  const reviewedAt = `${yyyy}-${mm}-${dd} ${hh}:${min}`;

  ticket.status = decision;
  ticket.sqeReview = {
    reviewer: reviewerName || (window.CURRENT_USER ? window.CURRENT_USER.name : 'SQE 담당자'),
    reviewedAt,
    decision,
    comment: reviewComment,
    bound8DCaseId: ticket.sqeReview?.bound8DCaseId || null
  };

  saveSupplierRecords(records);
  return ticket;
}

function bindSupplierTicketTo8DCase(ticketId, caseId) {
  const records = loadSupplierRecords();
  const ticket = records.find(r => r.ticketId === ticketId);
  if (!ticket) return false;

  ticket.status = '8D_Escalated';
  if (!ticket.sqeReview) ticket.sqeReview = {};
  ticket.sqeReview.bound8DCaseId = caseId;
  ticket.sqeReview.decision = '8D_Escalated';
  saveSupplierRecords(records);
  return true;
}

// Global exports
if (typeof window !== 'undefined') {
  window.SUPPLIER_STORAGE_KEY = SUPPLIER_STORAGE_KEY;
  window.SUPPLIER_CATEGORIES = SUPPLIER_CATEGORIES;
  window.MASTER_SUPPLIERS = MASTER_SUPPLIERS;
  window.getOfficialSupplierForUser = getOfficialSupplierForUser;
  window.loadSupplierRecords = loadSupplierRecords;
  window.saveSupplierRecords = saveSupplierRecords;
  window.createSupplierTicket = createSupplierTicket;
  window.updateSupplierTicketStatus = updateSupplierTicketStatus;
  window.bindSupplierTicketTo8DCase = bindSupplierTicketTo8DCase;
}
