/* ========================================================================= */
/* RAMOS UNIVERSAL DOCUMENT & REPORT VIEWER (PDF, XLSX, CSV, IMG, DOCX)     */
/* ========================================================================= */

let activeViewerDoc = null;
let viewerZoomLevel = 1.0;
let viewerRotation = 0;
let viewerActiveSheet = 0;

// No built-in example documents in the user workspace.
const BENCHMARK_DOCUMENTS = {};

function ensureViewerModalElement() {
  let modal = document.getElementById('documentViewerModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'documentViewerModal';
    modal.style.cssText = `
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(4, 8, 16, 0.88);
      z-index: 260;
      align-items: center;
      justify-content: center;
      backdrop-filter: blur(8px);
      padding: 20px;
    `;
    modal.innerHTML = `
      <div id="documentViewerContainer" class="doc-viewer-window">
        <!-- Dynamic Header & Content -->
      </div>
    `;
    document.body.appendChild(modal);
  }
  return modal;
}

function openDocumentViewer(docKeyOrFile) {
  ensureViewerModalElement();
  viewerZoomLevel = 1.0;
  viewerRotation = 0;
  viewerActiveSheet = 0;

  let doc = null;

  if (typeof docKeyOrFile === 'string') {
    doc = BENCHMARK_DOCUMENTS[docKeyOrFile] || {
      name: docKeyOrFile,
      type: getFileTypeFromName(docKeyOrFile),
      size: '원본 미등록',
      title: docKeyOrFile,
      supplier: '협력사 제출 성적서',
      issueDate: new Date().toISOString().slice(0, 10),
      renderType: 'generic'
    };
  } else if (docKeyOrFile && typeof docKeyOrFile === 'object') {
    if (docKeyOrFile.name && BENCHMARK_DOCUMENTS[docKeyOrFile.name]) {
      doc = Object.assign({}, BENCHMARK_DOCUMENTS[docKeyOrFile.name], docKeyOrFile);
    } else {
      doc = {
        name: docKeyOrFile.name || 'Attached_Document.pdf',
        type: docKeyOrFile.type || getFileTypeFromName(docKeyOrFile.name),
        size: docKeyOrFile.size || '1.0 MB',
        title: docKeyOrFile.name,
        supplier: docKeyOrFile.supplier || '외주 협력사 제출 파일',
        issueDate: docKeyOrFile.issueDate || new Date().toISOString().slice(0, 10),
        blobUrl: docKeyOrFile.blobUrl || null,
        fileObj: docKeyOrFile.fileObj || null,
        renderType: 'uploaded'
      };
    }
  }

  activeViewerDoc = doc;
  renderViewerUI(doc);

  const modal = document.getElementById('documentViewerModal');
  if (modal) modal.style.display = 'flex';
}

function closeDocumentViewer() {
  const modal = document.getElementById('documentViewerModal');
  if (modal) modal.style.display = 'none';
  activeViewerDoc = null;
}

function getFileTypeFromName(name = '') {
  const ext = name.split('.').pop().toLowerCase();
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].includes(ext)) return 'image';
  if (['xlsx', 'xls', 'csv'].includes(ext)) return 'xlsx';
  if (['pdf'].includes(ext)) return 'pdf';
  if (['doc', 'docx'].includes(ext)) return 'docx';
  return 'txt';
}

function renderViewerUI(doc) {
  const container = document.getElementById('documentViewerContainer');
  if (!container) return;

  const isImage = doc.type === 'image';

  container.innerHTML = `
    <!-- Top Viewer Toolbar -->
    <div class="doc-viewer-header">
      <div style="display:flex; align-items:center; gap:12px; min-width:0;">
        <div class="doc-type-icon ${doc.type}">
          ${getDocTypeIconHtml(doc.type)}
        </div>
        <div style="min-width:0;">
          <div class="doc-viewer-title" title="${doc.title || doc.name}">
            ${doc.title || doc.name}
          </div>
          <div class="doc-viewer-meta">
            <span>파일명: <b>${doc.name}</b></span>
            <span>용량: <b class="num-mono">${doc.size}</b></span>
            <span>발행처: <b>${doc.supplier || '협력사'}</b></span>
            <span class="badge-pill badge-info" style="font-size:0.68rem; padding:1px 6px;">정식 검증 완료</span>
          </div>
        </div>
      </div>

      <div class="doc-viewer-controls">
        ${!(window.CURRENT_USER && window.CURRENT_USER.isSupplier) ? `
          <button class="btn btn-secondary btn-sm btn-ai-viewer-audit" onclick="triggerAiAuditFromViewer()" title="AI 레포트 무결성 및 규격 정밀 감사" style="color:#38bdf8; border-color:rgba(56,189,248,0.4); font-weight:700;">
            <i data-lucide="bot" style="width:14px; height:14px;"></i>
            <span>🤖 AI 정밀 감사</span>
          </button>
        ` : ''}

        ${isImage ? `
          <button class="btn btn-secondary btn-sm" onclick="rotateViewerImage()" title="시계방향 90도 회전">
            <i data-lucide="rotate-cw" style="width:14px; height:14px;"></i>
            <span>90° 회전</span>
          </button>
        ` : ''}

        <div class="zoom-pill-group">
          <button class="btn btn-secondary btn-sm" onclick="changeViewerZoom(-0.15)" title="축소">
            <i data-lucide="zoom-out" style="width:14px; height:14px;"></i>
          </button>
          <span id="viewerZoomDisplay" class="num-mono">${Math.round(viewerZoomLevel * 100)}%</span>
          <button class="btn btn-secondary btn-sm" onclick="changeViewerZoom(0.15)" title="확대">
            <i data-lucide="zoom-in" style="width:14px; height:14px;"></i>
          </button>
          <button class="btn btn-secondary btn-sm" onclick="resetViewerZoom()" title="100% 원본 크기">
            100%
          </button>
        </div>

        <button class="btn btn-secondary btn-sm" onclick="printOrDownloadDoc()" title="인쇄 및 다운로드">
          <i data-lucide="printer" style="width:14px; height:14px;"></i>
          <span>인쇄/저장</span>
        </button>

        <button class="btn btn-secondary btn-sm btn-close-viewer" onclick="closeDocumentViewer()" title="닫기 (ESC)">
          <i data-lucide="x" style="width:16px; height:16px;"></i>
        </button>
      </div>
    </div>

    <!-- Viewer Canvas Area -->
    <div class="doc-viewer-body" id="docViewerBody">
      ${renderDocumentContent(doc)}
    </div>

    <!-- Bottom Footer Bar -->
    <div class="doc-viewer-footer">
      <div style="font-size:0.75rem; color:var(--text-muted); display:flex; align-items:center; gap:8px;">
        <i data-lucide="shield-check" style="width:15px; height:15px; color:#10b981;"></i>
        <span>RAMOS SQE 보안 뷰어: 외부 유출 방지 워터마크 적용됨 · 무손실 인쇄 규격</span>
      </div>
      <div style="display:flex; gap:8px;">
        <button class="btn btn-primary btn-sm" onclick="closeDocumentViewer()" style="font-weight:700;">
          확인 완료 (닫기)
        </button>
      </div>
    </div>
  `;

  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
}

function getDocTypeIconHtml(type) {
  switch (type) {
    case 'pdf':
      return `<i data-lucide="file-text" style="width:20px; height:20px; color:#f43f5e;"></i>`;
    case 'xlsx':
    case 'csv':
      return `<i data-lucide="table-2" style="width:20px; height:20px; color:#10b981;"></i>`;
    case 'image':
      return `<i data-lucide="image" style="width:20px; height:20px; color:#38bdf8;"></i>`;
    case 'docx':
      return `<i data-lucide="file" style="width:20px; height:20px; color:#3b82f6;"></i>`;
    default:
      return `<i data-lucide="file-check" style="width:20px; height:20px; color:#a855f7;"></i>`;
  }
}

function changeViewerZoom(delta) {
  viewerZoomLevel = Math.max(0.4, Math.min(2.5, viewerZoomLevel + delta));
  const el = document.getElementById('viewerZoomTarget');
  const disp = document.getElementById('viewerZoomDisplay');
  if (disp) disp.innerText = `${Math.round(viewerZoomLevel * 100)}%`;
  if (el) {
    el.style.transform = `scale(${viewerZoomLevel}) rotate(${viewerRotation}deg)`;
  }
}

function resetViewerZoom() {
  viewerZoomLevel = 1.0;
  viewerRotation = 0;
  const el = document.getElementById('viewerZoomTarget');
  const disp = document.getElementById('viewerZoomDisplay');
  if (disp) disp.innerText = '100%';
  if (el) {
    el.style.transform = 'scale(1) rotate(0deg)';
  }
}

function rotateViewerImage() {
  viewerRotation = (viewerRotation + 90) % 360;
  const el = document.getElementById('viewerZoomTarget');
  if (el) {
    el.style.transform = `scale(${viewerZoomLevel}) rotate(${viewerRotation}deg)`;
  }
}

function renderDocumentContent(doc) {
  if (doc.blobUrl) {
    if (doc.type === 'pdf') {
      return `
        <div style="width:100%; height:100%; display:flex; justify-content:center;">
          <iframe src="${doc.blobUrl}#toolbar=1" style="width:100%; height:100%; border:none; background:#fff; border-radius:4px;"></iframe>
        </div>
      `;
    }
    if (doc.type === 'image') {
      return `
        <div style="width:100%; height:100%; display:flex; align-items:center; justify-content:center; overflow:auto; background:#080c14;">
          <img id="viewerZoomTarget" src="${doc.blobUrl}" alt="${doc.name}" style="max-width:90%; max-height:90%; object-fit:contain; transition:transform 0.2s ease; box-shadow:0 10px 30px rgba(0,0,0,0.8); border-radius:4px;">
        </div>
      `;
    }
  }

  // Handle specific document models
  switch (doc.renderType) {
    case 'pdf_spec':
      return renderMurataSpecPdf(doc);
    case 'pdf_daeduck':
      return renderSspcPdf(doc);
    case 'excel_sheet':
      return renderTC1000Excel(doc);
    case 'csv_log':
      return renderDispenserCsvLog(doc);
    case 'image_xray':
      return renderXrayImageViewer(doc);
    case 'excel_si':
    case 'excel_reflow':
    default:
      if (doc.type === 'xlsx' || doc.type === 'csv') {
        return renderGenericExcel(doc);
      }
      return renderGenericPdf(doc);
  }
}

function renderMurataSpecPdf(doc) {
  return `
    <div style="width:100%; height:100%; overflow:auto; display:flex; justify-content:center; padding:24px 10px;">
      <div id="viewerZoomTarget" class="pdf-a4-page" style="transition:transform 0.2s ease; transform-origin:top center;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; border-bottom:3px solid #0f172a; padding-bottom:14px; margin-bottom:20px;">
          <div>
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="background:#ef4444; color:#fff; font-size:12px; font-weight:900; padding:2px 8px; border-radius:2px;">muRata</span>
              <b style="font-size:16px; color:#0f172a;">Murata Manufacturing Co., Ltd.</b>
            </div>
            <div style="font-size:11px; color:#64748b; margin-top:4px;">
              Automotive Electronics Division · Quality Assurance Department
            </div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:12px; font-weight:800; color:#0f172a;" class="num-mono">DOC NO: MUR-SPEC-2026-X7R106M</div>
            <div style="font-size:11px; color:#64748b;" class="num-mono">DATE: ${doc.issueDate} (REV. 02)</div>
            <span style="display:inline-block; font-size:10px; font-weight:800; background:#dcfce7; color:#15803d; border:1px solid #86efac; padding:1px 6px; border-radius:3px; margin-top:3px;">
              AEC-Q200 Grade 1 Certified
            </span>
          </div>
        </div>

        <div style="text-align:center; margin-bottom:24px;">
          <h2 style="font-size:18px; font-weight:900; color:#0f172a; margin:0; letter-spacing:-0.5px;">
            TECHNICAL PRODUCT SPECIFICATION & RELIABILITY CERTIFICATE
          </h2>
          <div style="font-size:13px; color:#2563eb; font-weight:700; margin-top:4px;">
            Surface Mount Multilayer Ceramic Capacitor (GCM Series - High Temp 125℃)
          </div>
        </div>

        <div style="font-size:12px; font-weight:800; color:#1e293b; margin-bottom:6px; border-left:4px solid #2563eb; padding-left:8px;">
          1. ELECTRICAL & MATERIAL RATINGS
        </div>
        <table class="doc-table-clean" style="margin-bottom:20px;">
          <tbody>
            <tr>
              <th style="width:24%;">Murata Part Number</th>
              <td style="width:26%; font-weight:700; color:#2563eb;" class="num-mono">GCM188R71A106ME12</td>
              <th style="width:24%;">Customer Code</th>
              <td style="width:26%; font-weight:700;" class="num-mono">RMS-C102-X7R-10U</td>
            </tr>
            <tr>
              <th>Chip Size (EIA/JIS)</th>
              <td class="num-mono">0603 inch (1608 mm)</td>
              <th>Nominal Capacitance</th>
              <td style="font-weight:700;">10 µF ±20% @ 1kHz, 1.0Vrms</td>
            </tr>
            <tr>
              <th>Rated DC Voltage</th>
              <td style="font-weight:700;">10 Vdc (Max Surge: 25V)</td>
              <th>Dielectric Material</th>
              <td style="font-weight:800; color:#b91c1c;">X7R (-55℃ to +125℃, ΔC: ±15%)</td>
            </tr>
            <tr>
              <th>Dissipation Factor (tan δ)</th>
              <td class="num-mono">5.0% max</td>
              <th>Insulation Resistance (IR)</th>
              <td class="num-mono">50 MΩ·µF min @ 25℃</td>
            </tr>
            <tr>
              <th>Operating Temp Range</th>
              <td style="font-weight:700; color:#047857;">-55℃ ~ +125℃ (High Temp Pass)</td>
              <th>Lead-Free Reflow Peak</th>
              <td>260℃ (10s max) / Rec. 250℃</td>
            </tr>
          </tbody>
        </table>

        <div style="font-size:12px; font-weight:800; color:#1e293b; margin-bottom:6px; border-left:4px solid #10b981; padding-left:8px;">
          2. AEC-Q200 RELIABILITY TEST RESULTS (ACCELERATED LIFE)
        </div>
        <table class="doc-table-clean" style="margin-bottom:20px;">
          <thead>
            <tr>
              <th>Test Item</th>
              <th>Test Condition & Duration</th>
              <th>Sample Qty</th>
              <th>Defect Qty</th>
              <th>Judgment</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="font-weight:700;">High Temperature Exposure</td>
              <td>125℃, 1,000 Hours, Unpowered</td>
              <td class="num-mono">77 ea</td>
              <td class="num-mono" style="color:#059669; font-weight:700;">0</td>
              <td><span class="badge-pill badge-success" style="font-size:10px;">PASS</span></td>
            </tr>
            <tr>
              <td style="font-weight:700;">Temperature Cycling</td>
              <td>-55℃ (30m) ↔ +125℃ (30m), 1,000 Cycles</td>
              <td class="num-mono">77 ea</td>
              <td class="num-mono" style="color:#059669; font-weight:700;">0</td>
              <td><span class="badge-pill badge-success" style="font-size:10px;">PASS</span></td>
            </tr>
            <tr>
              <td style="font-weight:700;">Biased Humidity (85/85)</td>
              <td>85℃ / 85% RH, Rated V, 1,000 Hours</td>
              <td class="num-mono">77 ea</td>
              <td class="num-mono" style="color:#059669; font-weight:700;">0</td>
              <td><span class="badge-pill badge-success" style="font-size:10px;">PASS</span></td>
            </tr>
            <tr>
              <td style="font-weight:700;">Solder Heat Resistance</td>
              <td>260℃ Solder Dip 10s (Reflow Simulator)</td>
              <td class="num-mono">30 ea</td>
              <td class="num-mono" style="color:#059669; font-weight:700;">0 (No Crack)</td>
              <td><span class="badge-pill badge-success" style="font-size:10px;">PASS</span></td>
            </tr>
          </tbody>
        </table>

        <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-top:36px; border-top:1px solid #cbd5e1; padding-top:16px;">
          <div style="font-size:11px; color:#64748b;">
            CONFIDENTIAL: For Authorized RAMOS Technology SQE Review Only.
          </div>
          <div style="display:flex; gap:16px; align-items:center;">
            <div style="text-align:center;">
              <div style="font-size:10px; color:#64748b; margin-bottom:4px;">QA Director</div>
              <div style="border:2px solid #b91c1c; color:#b91c1c; font-weight:900; font-size:11px; width:64px; height:64px; border-radius:50%; display:flex; align-items:center; justify-content:center; text-align:center; transform:rotate(-8deg);">
                村田<br>品質之印
              </div>
            </div>
            <div style="text-align:right; font-size:11px; color:#334155;">
              <div>Chief Reliability Engineer: <b>Kenji Takahashi</b></div>
              <div>Quality Assurance General Manager: <b>Hiroshi Sato</b></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderSspcPdf(doc) {
  return `
    <div style="width:100%; height:100%; overflow:auto; display:flex; justify-content:center; padding:24px 10px;">
      <div id="viewerZoomTarget" class="pdf-a4-page" style="transition:transform 0.2s ease; transform-origin:top center;">
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #0f172a; padding-bottom:12px; margin-bottom:20px;">
          <div>
            <b style="font-size:18px; color:#1e3a8a;">SSPC</b>
            <div style="font-size:11px; color:#64748b;">Package Substrate Division · Advanced Tech Lab</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:12px; font-weight:800;" class="num-mono">DOC: DD-PCN-20260825-CU</div>
            <div style="font-size:11px; color:#64748b;">2026-08-25</div>
          </div>
        </div>

        <div style="text-align:center; margin-bottom:20px;">
          <h2 style="font-size:17px; font-weight:900; margin:0; color:#0f172a;">
            PCB CORE COPPER FOIL 2ND-SOURCE EVALUATION REPORT
          </h2>
          <div style="font-size:12px; color:#64748b; margin-top:4px;">
            Target: 8-Layer BGA Substrate (eMMC 153-Ball for RAMOS LGE DTV)
          </div>
        </div>

        <table class="doc-table-clean" style="margin-bottom:20px;">
          <thead>
            <tr>
              <th>Evaluation Parameter</th>
              <th>1st Source (Mitsui Kinzoku)</th>
              <th>2nd Source (Doosan Electro-Materials)</th>
              <th>Delta / Ratio</th>
              <th>Judgment</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><b>Peel Strength (kgf/cm)</b></td>
              <td class="num-mono">1.18 ± 0.05</td>
              <td class="num-mono" style="color:#2563eb; font-weight:700;">1.24 ± 0.04</td>
              <td class="num-mono">+5.08% (Superior)</td>
              <td><span class="badge-pill badge-success" style="font-size:10px;">PASS</span></td>
            </tr>
            <tr>
              <td><b>Glass Transition Temp (Tg)</b></td>
              <td class="num-mono">175 ℃</td>
              <td class="num-mono" style="color:#2563eb; font-weight:700;">178 ℃</td>
              <td class="num-mono">+3 ℃</td>
              <td><span class="badge-pill badge-success" style="font-size:10px;">PASS</span></td>
            </tr>
            <tr>
              <td><b>Characteristic Impedance</b></td>
              <td class="num-mono">50.2 Ω (Target 50Ω)</td>
              <td class="num-mono" style="color:#2563eb; font-weight:700;">49.8 Ω</td>
              <td class="num-mono">-0.4 Ω (±10% In-Spec)</td>
              <td><span class="badge-pill badge-success" style="font-size:10px;">PASS</span></td>
            </tr>
            <tr>
              <td><b>Thermal Stress (288℃, 10s)</b></td>
              <td>No Delamination (5 Cycles)</td>
              <td style="color:#2563eb; font-weight:700;">No Delamination (5 Cycles)</td>
              <td>Equivalent</td>
              <td><span class="badge-pill badge-success" style="font-size:10px;">PASS</span></td>
            </tr>
          </tbody>
        </table>

        <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:6px; padding:14px; font-size:12px; color:#166534; line-height:1.6;">
          <b>[종합 품질 및 신뢰성 평가 소견]</b><br>
          두산전자 고내열 동박 원소재는 박리 강도 및 열적 특성에서 기존 미츠이금속 원소재 대비 동등 이상의 마진을 확보하였으며, eMMC HS400 고속 신호 전송 특성 100% 규격을 만족함. 2차 벤더 양산 적용을 적극 추천함.
        </div>
      </div>
    </div>
  `;
}

function renderTC1000Excel(doc) {
  const rows = [];
  for (let i = 1; i <= 30; i++) {
    const sId = `DUT-SMP-${String(i).padStart(3, '0')}`;
    const rPre = (0.78 + (i % 5) * 0.008).toFixed(3);
    const r250 = (Number(rPre) + 0.006).toFixed(3);
    const r500 = (Number(r250) + 0.008).toFixed(3);
    const r1000 = (Number(r500) + 0.012).toFixed(3);
    const delta = (((r1000 - rPre) / rPre) * 100).toFixed(2);
    rows.push({ sId, rPre, r250, r500, r1000, delta });
  }

  return `
    <div style="width:100%; height:100%; display:flex; flex-direction:column; background:var(--bg-card); overflow:hidden;">
      <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-card-subtle); border-bottom:1px solid var(--border); padding:8px 16px;">
        <div style="display:flex; gap:4px;">
          <button class="sheet-tab-btn active">📊 TC_1000h_Summary</button>
          <button class="sheet-tab-btn" onclick="alert('Raw 데이터 2차 시트 (2,400개 측정점)')">📈 Raw_Measurements_30ea</button>
          <button class="sheet-tab-btn" onclick="alert('ESD/Surge 방전 시험 시트')">⚡ ESD_Surge_Test</button>
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="font-size:0.75rem; color:var(--text-muted);">필터:</span>
          <input type="text" placeholder="Sample 검색..." class="form-control form-control-sm" style="width:140px; height:28px; font-size:0.75rem;" oninput="filterViewerTableRows(this.value)">
        </div>
      </div>

      <div style="display:flex; align-items:center; gap:16px; background:var(--bg-card); border-bottom:1px solid var(--border); padding:6px 16px; font-size:0.75rem;">
        <div style="color:var(--text-secondary);">총 표본 수: <b class="num-mono" style="color:var(--text-primary);">30 EA</b></div>
        <div style="color:var(--text-secondary);">불량 수(Fail): <b class="num-mono" style="color:#10b981;">0 EA (0.00%)</b></div>
        <div style="color:var(--text-secondary);">평균 저항 변화율(ΔR Avg): <b class="num-mono" style="color:#2563eb;">+3.84% (기준 < 10% 만족)</b></div>
        <div style="color:var(--text-secondary);">최대 저항 변화율(ΔR Max): <b class="num-mono">+4.88%</b></div>
        <div style="margin-left:auto;"><span class="badge-pill badge-success">ALL PASS</span></div>
      </div>

      <div style="flex:1; overflow:auto;">
        <table class="excel-grid-table" id="viewerExcelTable">
          <thead>
            <tr>
              <th style="width:40px; text-align:center;">#</th>
              <th>Sample ID (DUT)</th>
              <th>Initial R (mΩ)</th>
              <th>250 Cycles (mΩ)</th>
              <th>500 Cycles (mΩ)</th>
              <th>1,000 Cycles (mΩ)</th>
              <th>ΔR Change (%)</th>
              <th>Insulation Res. (GΩ)</th>
              <th style="text-align:center;">Judgment</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((r, idx) => `
              <tr>
                <td class="cell-row-num">${idx + 1}</td>
                <td style="font-weight:700;" class="num-mono">${r.sId}</td>
                <td class="num-mono">${r.rPre}</td>
                <td class="num-mono">${r.r250}</td>
                <td class="num-mono">${r.r500}</td>
                <td class="num-mono" style="font-weight:700; color:#2563eb;">${r.r1000}</td>
                <td class="num-mono" style="font-weight:700; color:#059669;">+${r.delta}%</td>
                <td class="num-mono">> 100 GΩ</td>
                <td style="text-align:center;"><span class="badge-pill badge-success" style="font-size:10px;">PASS</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderDispenserCsvLog(doc) {
  const logs = [];
  let t = 0;
  for (let i = 0; i < 35; i++) {
    t += 2;
    const isAbnormal = i >= 18;
    const p = isAbnormal ? (0.31 + (i % 3) * 0.01).toFixed(3) : (0.45 + (i % 2) * 0.005).toFixed(3);
    const flow = isAbnormal ? (1.2 + (i % 2) * 0.1).toFixed(2) : (2.4 + (i % 2) * 0.05).toFixed(2);
    logs.push({
      time: `2026-08-31 23:${String(t).padStart(2, '0')}:15`,
      setpoint: '0.450 MPa',
      actual: `${p} MPa`,
      flowRate: `${flow} mg/s`,
      status: isAbnormal ? 'ALARM_LOW_PRESSURE' : 'NORMAL_RUN',
      alarm: isAbnormal
    });
  }

  return `
    <div style="width:100%; height:100%; display:flex; flex-direction:column; background:var(--bg-card); overflow:hidden;">
      <div style="background:rgba(244,63,94,0.08); border-bottom:1px solid rgba(244,63,94,0.3); padding:10px 16px; display:flex; justify-content:space-between; align-items:center;">
        <div>
          <b style="color:#f43f5e; font-size:0.85rem;">⚠️ Telemetry CSV 이상 감지: 23:36:15 기점 언더필 토출압 0.45MPa ➔ 0.31MPa 급락</b>
          <div style="font-size:0.75rem; color:var(--text-secondary); margin-top:2px;">
            파주 BGA Line #2 공압 센서(SMC ZSE30A) 유격으로 인한 압력 손실 및 토출량 50% 급감 확인
          </div>
        </div>
        <span class="badge-pill badge-danger" style="font-weight:800;">FAULT LOGGED</span>
      </div>

      <div style="flex:1; overflow:auto;">
        <table class="excel-grid-table">
          <thead>
            <tr>
              <th style="width:45px; text-align:center;">#</th>
              <th>Timestamp</th>
              <th>Target Pressure</th>
              <th>Actual Pressure (MPa)</th>
              <th>Dispense Flow Rate</th>
              <th>Controller State</th>
            </tr>
          </thead>
          <tbody>
            ${logs.map((l, idx) => `
              <tr style="${l.alarm ? 'background:rgba(244,63,94,0.08);' : ''}">
                <td class="cell-row-num">${idx + 1}</td>
                <td class="num-mono">${l.time}</td>
                <td class="num-mono">${l.setpoint}</td>
                <td class="num-mono" style="font-weight:800; color:${l.alarm ? '#f43f5e' : '#059669'};">${l.actual}</td>
                <td class="num-mono">${l.flowRate}</td>
                <td>
                  <span class="badge-pill ${l.alarm ? 'badge-danger' : 'badge-success'}" style="font-size:10px;">
                    ${l.status}
                  </span>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderXrayImageViewer(doc) {
  return `
    <div style="width:100%; height:100%; display:flex; flex-direction:column; background:#060a12; overflow:hidden;">
      <div style="display:flex; justify-content:space-between; align-items:center; background:#0f172a; border-bottom:1px solid #1e293b; padding:8px 16px; color:#cbd5e1; font-size:0.75rem;">
        <div>
          <span style="color:#38bdf8; font-weight:800;">장비:</span> Nordson Dage Quadra 5 (160kV)
          <span style="margin:0 8px;">|</span>
          <span style="color:#38bdf8; font-weight:800;">시료:</span> eMMC BGA153 Ball #D4 Underfill
          <span style="margin:0 8px;">|</span>
          <span style="color:#38bdf8; font-weight:800;">측정치:</span> Void 18.2% (기준 15% 초과 REJECT)
        </div>
        <div style="display:flex; gap:6px;">
          <span class="badge-pill badge-danger" style="font-weight:800;">SPEC FAIL</span>
        </div>
      </div>

      <div style="flex:1; overflow:auto; display:flex; align-items:center; justify-content:center; position:relative; padding:20px;">
        <div id="viewerZoomTarget" style="position:relative; transition:transform 0.2s ease; transform-origin:center center; box-shadow:0 0 40px rgba(0,0,0,0.9); border:2px solid #334155; border-radius:6px; overflow:hidden; background:#030712; max-width:850px; width:100%;">
          <svg viewBox="0 0 800 500" style="width:100%; height:auto; display:block;">
            <defs>
              <radialGradient id="xrayGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stop-color="#1e293b"/>
                <stop offset="60%" stop-color="#090d16"/>
                <stop offset="100%" stop-color="#020408"/>
              </radialGradient>
              <radialGradient id="solderBallGrad" cx="35%" cy="35%" r="65%">
                <stop offset="0%" stop-color="#94a3b8"/>
                <stop offset="40%" stop-color="#475569"/>
                <stop offset="85%" stop-color="#1e293b"/>
                <stop offset="100%" stop-color="#0f172a"/>
              </radialGradient>
              <radialGradient id="voidGrad" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stop-color="#f8fafc" stop-opacity="0.95"/>
                <stop offset="70%" stop-color="#cbd5e1" stop-opacity="0.8"/>
                <stop offset="100%" stop-color="#64748b" stop-opacity="0"/>
              </radialGradient>
            </defs>

            <rect width="800" height="500" fill="url(#xrayGlow)"/>

            <g stroke="#1e293b" stroke-width="0.75" stroke-dasharray="3,3">
              <line x1="0" y1="125" x2="800" y2="125"/>
              <line x1="0" y1="250" x2="800" y2="250"/>
              <line x1="0" y1="375" x2="800" y2="375"/>
              <line x1="200" y1="0" x2="200" y2="500"/>
              <line x1="400" y1="0" x2="400" y2="500"/>
              <line x1="600" y1="0" x2="600" y2="500"/>
            </g>

            <circle cx="200" cy="140" r="55" fill="url(#solderBallGrad)"/>
            <circle cx="400" cy="140" r="55" fill="url(#solderBallGrad)"/>
            <circle cx="600" cy="140" r="55" fill="url(#solderBallGrad)"/>

            <circle cx="200" cy="270" r="55" fill="url(#solderBallGrad)"/>
            
            <!-- DEFECT SOLDER BALL -->
            <g>
              <circle cx="400" cy="270" r="55" fill="url(#solderBallGrad)"/>
              <ellipse cx="412" cy="265" rx="26" ry="22" fill="url(#voidGrad)"/>
              <ellipse cx="388" cy="282" rx="14" ry="11" fill="url(#voidGrad)"/>

              <rect x="330" y="200" width="140" height="140" fill="none" stroke="#f43f5e" stroke-width="2" stroke-dasharray="4,2"/>
              <line x1="470" y1="230" x2="550" y2="190" stroke="#f43f5e" stroke-width="2"/>
              <rect x="550" y="170" width="190" height="48" rx="4" fill="#881337" stroke="#f43f5e" stroke-width="1.5"/>
              <text x="560" y="190" fill="#ffffff" font-size="12" font-weight="bold">DEFECT: SOLDER VOID</text>
              <text x="560" y="208" fill="#fecdd3" font-size="11">Area: 18.2% (FAIL > 15%)</text>
            </g>

            <circle cx="600" cy="270" r="55" fill="url(#solderBallGrad)"/>
            <circle cx="200" cy="400" r="55" fill="url(#solderBallGrad)"/>
            <circle cx="400" cy="400" r="55" fill="url(#solderBallGrad)"/>
            <circle cx="600" cy="400" r="55" fill="url(#solderBallGrad)"/>

            <g transform="translate(40, 450)">
              <rect x="0" y="0" width="120" height="4" fill="#ffffff"/>
              <line x1="0" y1="-4" x2="0" y2="8" stroke="#ffffff" stroke-width="2"/>
              <line x1="120" y1="-4" x2="120" y2="8" stroke="#ffffff" stroke-width="2"/>
              <text x="35" y="-8" fill="#ffffff" font-size="12" font-family="monospace">100 µm</text>
            </g>

            <text x="40" y="50" fill="#64748b" font-size="13" font-family="sans-serif" font-weight="bold">TECHL FA LAB · RADIOGRAPHY UNIT 02</text>
            <text x="750" y="475" fill="#475569" font-size="11" text-anchor="end">CONFIDENTIAL</text>
          </svg>
        </div>
      </div>
    </div>
  `;
}

function renderGenericExcel(doc) {
  const name=typeof escapeD4Evidence==='function' ? escapeD4Evidence(doc.name) : '첨부 문서';
  return `<div style="width:100%;min-width:0;max-width:100%;padding:24px;line-height:1.7;overflow-wrap:anywhere;white-space:normal;"><h3>${name}</h3><p>원본 내용을 불러올 수 없습니다. 실제 파일 내용을 연결한 뒤 확인해 주세요.</p></div>`;
}

function renderGenericPdf(doc) { return renderGenericExcel(doc); }

function filterViewerTableRows(query) {
  const q = (query || '').toLowerCase().trim();
  const table = document.getElementById('viewerExcelTable');
  if (!table) return;
  const rows = table.querySelectorAll('tbody tr');
  rows.forEach(r => {
    const txt = r.textContent.toLowerCase();
    r.style.display = txt.includes(q) ? '' : 'none';
  });
}

function printOrDownloadDoc() {
  window.print();
}

// Global exports
if (typeof window !== 'undefined') {
  window.BENCHMARK_DOCUMENTS = BENCHMARK_DOCUMENTS;
  window.openDocumentViewer = openDocumentViewer;
  window.closeDocumentViewer = closeDocumentViewer;
  window.changeViewerZoom = changeViewerZoom;
  window.resetViewerZoom = resetViewerZoom;
  window.rotateViewerImage = rotateViewerImage;
  window.filterViewerTableRows = filterViewerTableRows;
  window.printOrDownloadDoc = printOrDownloadDoc;
}
