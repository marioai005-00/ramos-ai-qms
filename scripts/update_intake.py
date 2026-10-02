import json

with open(r'g:\내 드라이브\AI_Place\Work\11_AI_Customer_Nonconformance_8D_System\index.html', encoding='utf-8') as f:
    content = f.read()

# Add CSS for Intake Hub
css_addition = '''    /* AI Ingest Dropzone & Intake Styles */
    .intake-hero-card {
      background: linear-gradient(135deg, rgba(30, 41, 59, 0.9), rgba(15, 23, 42, 0.95));
      border: 1px solid #3b82f6;
      box-shadow: 0 8px 30px rgba(59, 130, 246, 0.15);
      border-radius: var(--radius-md);
      padding: 20px;
      margin-bottom: 22px;
    }

    .dropzone-box {
      border: 2px dashed #3b82f6;
      background: rgba(13, 21, 39, 0.6);
      border-radius: var(--radius-md);
      padding: 24px 20px;
      text-align: center;
      cursor: pointer;
      transition: all 0.2s ease;
      position: relative;
    }

    .dropzone-box:hover, .dropzone-box.dragover {
      background: rgba(59, 130, 246, 0.12);
      border-color: #60a5fa;
      box-shadow: 0 0 16px rgba(59, 130, 246, 0.3);
    }

    .preset-pill-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: #1e293b;
      border: 1px solid var(--border);
      color: #e2e8f0;
      padding: 6px 12px;
      border-radius: 9999px;
      font-size: 0.76rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .preset-pill-btn:hover {
      background: #2563eb;
      color: #fff;
      border-color: #3b82f6;
      box-shadow: 0 2px 8px rgba(37, 99, 235, 0.3);
    }

    .file-chip {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: rgba(59, 130, 246, 0.15);
      border: 1px solid #3b82f6;
      color: #93c5fd;
      padding: 5px 12px;
      border-radius: 6px;
      font-size: 0.78rem;
      font-weight: 600;
      margin-top: 10px;
    }'''

start_css = '    .main-area {'
s_idx = content.find(start_css)

if s_idx != -1:
    content = content[:s_idx] + css_addition + '\n\n' + content[s_idx:]
    print('Added Dropzone CSS successfully!')

# Replace renderNewCaseView and Add Preset & Drop logic in JS
new_view_code = '''    /* ========================================================================= */
    /* VIEW 2: STEP 01. NEW CASE INTAKE (AI 스마트 인입 & SEVERITY 엔진)             */
    /* ========================================================================= */
    let intakeFiles = [];

    const INTAKE_PRESETS = {
      lge: {
        customer: 'LGE (LG전자)',
        customerContact: '최영수 책임 (DTV 품질보증팀)',
        customerEmail: 'ys.choi@lge.com',
        product: 'eMMC 5.1 64GB (BGA153)',
        partNumber: 'RM-EM51-064G-X1',
        lotNumber: 'EM2608-DTV01',
        mfgSite: 'RAMOS 오창 1공장 SMT 3라인',
        incidentSite: 'LGE 평택 DTV Main Board 실장 라인',
        defectQty: 12,
        inspectQty: 10000,
        claimTitle: 'LGE DTV Main Board SMT Post-Reflow 시 eMMC Boot CID Read Timeout 및 12ea VCC-VSS Short 단락 측정됨.',
        lineStop: 'true',
        safetyRisk: 'false',
        recurrentDefect: 'false',
        sampleFileName: 'LGE_Groupware_Claim_Mail_Capture.png (그룹웨어 메일 캡쳐)'
      },
      samsung: {
        customer: 'Samsung Electronics (메모리사업부)',
        customerContact: '강민규 프로 (SSD QA팀)',
        customerEmail: 'mg.kang@samsung.com',
        product: 'PCIe Gen4 Enterprise SSD 3.84TB',
        partNumber: 'RM-SSD4-384T',
        lotNumber: 'SS2608-NV04',
        mfgSite: 'RAMOS 오창 2공장 SSD 라인',
        incidentSite: 'Samsung Server System Validation Lab',
        defectQty: 2,
        inspectQty: 500,
        claimTitle: '서버 챔버 70℃ High-Temperature 4K Random Read Stress 중 PCIe Gen4 Link Drop 및 Controller Hang 발생',
        lineStop: 'false',
        safetyRisk: 'false',
        recurrentDefect: 'false',
        sampleFileName: 'Samsung_SSD_Defect_Notice.xlsx (불량통보서 엑셀)'
      },
      hynix: {
        customer: 'SK hynix (DRAM 사업부)',
        customerContact: '윤태석 수석 (고객지원실)',
        customerEmail: 'ts.yoon@skhynix.com',
        product: 'DDR4 SODIMM 16GB (3200Mbps)',
        partNumber: 'RM-DDR4-16G-SO',
        lotNumber: 'HY2608-DM02',
        mfgSite: 'RAMOS 오창 1공장 PKG 라인',
        incidentSite: 'SK hynix 이천 모듈 테스트 라인',
        defectQty: 5,
        inspectQty: 2000,
        claimTitle: 'DRAM Ball Grid BGA X-Ray 검사 시 Center 패드 Void율 28% 초과 (규격 < 15%) 기준 미달 적출',
        lineStop: 'true',
        safetyRisk: 'false',
        recurrentDefect: 'true',
        sampleFileName: 'SK_Hynix_Quality_Claim_Official.pdf (고객사 공식 공문 PDF)'
      }
    };

    function renderNewCaseView() {
      return `
        <div style="max-width: 960px; margin: 0 auto;">
          <div style="margin-bottom: 20px;">
            <h1 style="font-size: 1.35rem; font-weight: 800; color: #f8fafc; display:flex; align-items:center; gap:8px;">
              <i data-lucide="plus-circle" style="color: #38bdf8;"></i> STEP 01. 신규 부적합 접수 & 8D Case 생성
            </h1>
            <p style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 4px;">
              그룹웨어 메일 캡쳐(이미지), 고객 공문(PDF/Word), 불량 내역(Excel)을 <b>드래그 또는 붙여넣기(Ctrl+V)</b>하면 AI가 자동으로 폼을 완성합니다.
            </p>
          </div>

          <!-- TOP AI SMART INGEST HERO CARD -->
          <div class="intake-hero-card">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
              <div style="font-size:0.92rem; font-weight:800; color:#60a5fa; display:flex; align-items:center; gap:7px;">
                <i data-lucide="sparkles" style="color:#38bdf8; width:18px; height:18px;"></i>
                AI 스마트 문서 파싱 & 자동 입력 (Auto-Ingest)
              </div>
              <span class="badge-pill badge-ok">OCR & Document AI Engine Active</span>
            </div>

            <!-- Drag & Drop Zone + Clipboard Paste Zone -->
            <div id="intakeDropZone" class="dropzone-box" onclick="document.getElementById('intakeFileInput').click()" ondragover="handleDragOver(event)" ondragleave="handleDragLeave(event)" ondrop="handleFileDrop(event)">
              <input type="file" id="intakeFileInput" style="display:none;" multiple accept=".pdf,.docx,.xlsx,.xls,.eml,.msg,.txt,.png,.jpg,.jpeg" onchange="handleFileSelect(event)">
              
              <div style="display:flex; flex-direction:column; align-items:center; gap:8px;">
                <div style="width:44px; height:44px; border-radius:50%; background:rgba(59, 130, 246, 0.15); display:flex; align-items:center; justify-content:center;">
                  <i data-lucide="upload-cloud" style="width:24px; height:24px; color:#38bdf8;"></i>
                </div>
                <div style="font-size:0.9rem; font-weight:700; color:#f8fafc;">
                  그룹웨어 메일 캡쳐 / 엑셀 / PDF / Word 파일을 여기에 끌어다 놓으세요
                </div>
                <div style="font-size:0.75rem; color:#94a3b8;">
                  또는 화면 캡쳐 후 어디서든 <b style="color:#60a5fa; background:#1e293b; padding:2px 6px; border-radius:4px;">Ctrl + V</b> 로 즉시 붙여넣기 가능 (PDF, DOCX, XLSX, PNG, JPG, EML)
                </div>
              </div>

              <!-- Attached Files Display -->
              <div id="attachedFilesList" style="display:flex; flex-wrap:wrap; justify-content:center; gap:8px; margin-top:10px;"></div>
            </div>

            <!-- Demo Quick Presets & AI Parse Button -->
            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:16px; flex-wrap:wrap; gap:10px;">
              <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                <span style="font-size:0.72rem; color:var(--text-muted); font-weight:700;">빠른 시나리오 프리셋:</span>
                <button type="button" class="preset-pill-btn" onclick="applyIntakePreset('lge')">
                  <i data-lucide="image" style="width:12px; height:12px; color:#60a5fa;"></i> [LGE] eMMC Boot Fail 메일 캡쳐
                </button>
                <button type="button" class="preset-pill-btn" onclick="applyIntakePreset('samsung')">
                  <i data-lucide="file-spreadsheet" style="width:12px; height:12px; color:#10b981;"></i> [삼성전자] SSD Link Drop 통보서.xlsx
                </button>
                <button type="button" class="preset-pill-btn" onclick="applyIntakePreset('hynix')">
                  <i data-lucide="file-text" style="width:12px; height:12px; color:#fbbf24;"></i> [SK하이닉스] DRAM Void 공문.pdf
                </button>
              </div>

              <button type="button" class="btn btn-primary" onclick="triggerAIExtraction()" style="box-shadow: 0 4px 14px rgba(37,99,235,0.4);">
                <i data-lucide="wand-2" style="width:14px; height:14px;"></i> ✨ AI 스마트 자동 추출 & 폼 채우기
              </button>
            </div>

            <div id="aiParseNotification" style="display:none; margin-top:12px; background:rgba(16,185,129,0.15); border:1px solid #10b981; border-radius:6px; padding:10px 14px; font-size:0.8rem; color:#34d399; font-weight:600; display:flex; align-items:center; gap:8px;">
              <i data-lucide="check-circle" style="width:16px; height:16px;"></i>
              <span id="aiParseNotificationText">문서에서 14개 품질 메타데이터가 성공적으로 추출되어 하단 폼에 자동 입력되었습니다.</span>
            </div>
          </div>

          <!-- FORM START -->
          <form id="newCaseForm" onsubmit="handleCreateCase(event)">
            <div class="card">
              <div class="card-header">
                <div class="card-title">
                  <i data-lucide="info" style="color:#60a5fa; width:16px; height:16px;"></i> 기본 접수 정보 (Customer & Product)
                </div>
                <span class="badge-pill badge-ok" id="formAutofillBadge">READY</span>
              </div>

              <div class="grid-3">
                <div class="form-group">
                  <label class="form-label">고객사 <span class="required">*</span></label>
                  <input type="text" id="formCustomer" name="customer" class="form-control" placeholder="예: LGE (LG전자)" required value="LGE (LG전자)">
                </div>
                <div class="form-group">
                  <label class="form-label">고객 담당자 <span class="required">*</span></label>
                  <input type="text" id="formCustomerContact" name="customerContact" class="form-control" placeholder="예: 최영수 책임" required value="최영수 책임 (DTV 품질)">
                </div>
                <div class="form-group">
                  <label class="form-label">고객 이메일</label>
                  <input type="email" id="formCustomerEmail" name="customerEmail" class="form-control" placeholder="ys.choi@lge.com" value="ys.choi@lge.com">
                </div>
              </div>

              <div class="grid-3">
                <div class="form-group">
                  <label class="form-label">제품명 (Product) <span class="required">*</span></label>
                  <input type="text" id="formProduct" name="product" class="form-control" placeholder="예: eMMC 5.1 64GB" required value="eMMC 5.1 64GB (BGA153)">
                </div>
                <div class="form-group">
                  <label class="form-label">Part Number</label>
                  <input type="text" id="formPartNumber" name="partNumber" class="form-control" placeholder="RM-EM51-064G-X1" value="RM-EM51-064G-X1">
                </div>
                <div class="form-group">
                  <label class="form-label">Lot Number <span class="required">*</span></label>
                  <input type="text" id="formLotNumber" name="lotNumber" class="form-control" placeholder="EM2608-DTV01" required value="EM2608-DTV01">
                </div>
              </div>

              <div class="grid-2">
                <div class="form-group">
                  <label class="form-label">생산 Site (당사 공장)</label>
                  <input type="text" id="formMfgSite" name="mfgSite" class="form-control" value="RAMOS 오창 1공장 SMT 3라인">
                </div>
                <div class="form-group">
                  <label class="form-label">발생 Site (고객사 공정)</label>
                  <input type="text" id="formIncidentSite" name="incidentSite" class="form-control" value="LGE 평택 DTV Main Board 실장 라인">
                </div>
              </div>

              <div class="grid-3">
                <div class="form-group">
                  <label class="form-label">불량수량 (Defect Qty) <span class="required">*</span></label>
                  <input type="number" id="inputDefectQty" name="defectQty" class="form-control" value="12" required oninput="calculatePPM()">
                </div>
                <div class="form-group">
                  <label class="form-label">검사/투입 수량 (Inspect Qty) <span class="required">*</span></label>
                  <input type="number" id="inputInspectQty" name="inspectQty" class="form-control" value="10000" required oninput="calculatePPM()">
                </div>
                <div class="form-group">
                  <label class="form-label">불량률 (PPM)</label>
                  <input type="text" id="calculatedPPM" class="form-control num-mono" value="1,200 PPM" readonly style="background:#1e293b; color:#fbbf24; font-weight:700;">
                </div>
              </div>

              <div class="form-group">
                <label class="form-label">Claim 내용 및 고객 불만 현상 <span class="required">*</span></label>
                <textarea id="formClaimTitle" name="claimTitle" class="form-control" rows="3" required placeholder="고객사에서 인입된 불량 현상을 상세히 기록하십시오.">LGE DTV Main Board SMT Post-Reflow 시 eMMC Boot CID Read Timeout 및 12ea VCC-VSS Short 단락 측정됨.</textarea>
              </div>
            </div>

            <!-- Severity & AI Rule Decision Card -->
            <div class="card">
              <div class="card-header">
                <div class="card-title">
                  <i data-lucide="shield-alert" style="color:#ef4444; width:16px; height:16px;"></i> Severity & 8D 트리거 판정 요소
                </div>
              </div>

              <div class="grid-3">
                <div class="form-group">
                  <label class="form-label">고객사 Line Stop 여부</label>
                  <select id="formLineStop" name="lineStop" class="form-control" onchange="autoEvaluateSeverity()">
                    <option value="true" selected>Yes (라인 중단 발생 - Critical)</option>
                    <option value="false">No (정상 가동)</option>
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label">Safety / 화재 리스크</label>
                  <select id="formSafetyRisk" name="safetyRisk" class="form-control" onchange="autoEvaluateSeverity()">
                    <option value="false" selected>No (해당 없음)</option>
                    <option value="true">Yes (발화/폭발/안전 위협)</option>
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label">동일 불량 재발 여부</label>
                  <select id="formRecurrentDefect" name="recurrentDefect" class="form-control" onchange="autoEvaluateSeverity()">
                    <option value="false" selected>No (최초 발생)</option>
                    <option value="true">Yes (과거 유사 재발 이력 있음)</option>
                  </select>
                </div>
              </div>

              <!-- AI Auto Decision Result Box -->
              <div id="aiDecisionResultBox" style="background: rgba(59, 130, 246, 0.08); border: 1px solid #3b82f6; border-radius: var(--radius-sm); padding: 14px 16px; margin-top: 10px;">
                <div style="font-size:0.85rem; font-weight:700; color:#60a5fa; display:flex; align-items:center; gap:6px;">
                  <i data-lucide="sparkles" style="width:16px; height:16px;"></i> AI 시스템 자동 판정 결과
                </div>
                <div style="margin-top: 8px; font-size:0.8rem; color:#e2e8f0; display:grid; grid-template-columns: repeat(3, 1fr); gap:12px;">
                  <div>
                    <span style="color:var(--text-muted);">8D Report 필요 여부:</span>
                    <span id="decision8DRequired" style="font-weight:700; color:#34d399;">● 8D 필수 발행 대상 (Mandatory)</span>
                  </div>
                  <div>
                    <span style="color:var(--text-muted);">긴급 대응 Level:</span>
                    <span id="decisionSeverityLevel" style="font-weight:700; color:#f87171;">● CRITICAL (Level 1)</span>
                  </div>
                  <div>
                    <span style="color:var(--text-muted);">Initial 3D SLA Due:</span>
                    <span id="decisionSlaDue" style="font-weight:700; color:#fbbf24;" class="num-mono">24시간 이내 (D3 봉쇄 필수)</span>
                  </div>
                </div>
              </div>
            </div>

            <div style="display:flex; justify-content:flex-end; gap:12px; margin-bottom:40px;">
              <button type="button" class="btn btn-secondary" onclick="switchNav('dashboard')">취소</button>
              <button type="submit" class="btn btn-primary" style="padding: 10px 24px;">
                <i data-lucide="check" style="width:16px; height:16px;"></i> Case 생성 및 8D Workspace 진입
              </button>
            </div>
          </form>
        </div>
      `;
    }

    /* Ingest Drag & Drop & Clipboard Handlers */
    function handleDragOver(e) {
      e.preventDefault();
      document.getElementById('intakeDropZone').classList.add('dragover');
    }

    function handleDragLeave(e) {
      e.preventDefault();
      document.getElementById('intakeDropZone').classList.remove('dragover');
    }

    function handleFileDrop(e) {
      e.preventDefault();
      document.getElementById('intakeDropZone').classList.remove('dragover');
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        processIncomingFiles(e.dataTransfer.files);
      }
    }

    function handleFileSelect(e) {
      if (e.target.files && e.target.files.length > 0) {
        processIncomingFiles(e.target.files);
      }
    }

    // Global Clipboard Paste (Ctrl+V)
    window.addEventListener('paste', (e) => {
      if (appData.currentView !== 'new-case') return;
      
      const items = (e.clipboardData || e.originalEvent.clipboardData).items;
      let pastedFiles = [];
      for (let index in items) {
        const item = items[index];
        if (item.kind === 'file') {
          const blob = item.getAsFile();
          const fileName = `Groupware_Screenshot_${new Date().toISOString().slice(0,10)}_${Date.now()}.png`;
          const fileObj = new File([blob], fileName, { type: blob.type });
          pastedFiles.push(fileObj);
        } else if (item.kind === 'string' && item.type === 'text/plain') {
          item.getAsString((text) => {
            if (text && text.trim().length > 10) {
              parseRawTextIntoForm(text);
            }
          });
        }
      }
      if (pastedFiles.length > 0) {
        processIncomingFiles(pastedFiles);
      }
    });

    function processIncomingFiles(files) {
      for (let i = 0; i < files.length; i++) {
        intakeFiles.push({
          name: files[i].name,
          size: (files[i].size / 1024).toFixed(1) + ' KB',
          fileObj: files[i]
        });
      }
      renderAttachedFilesList();
      triggerAIExtraction();
    }

    function renderAttachedFilesList() {
      const container = document.getElementById('attachedFilesList');
      if (!container) return;
      container.innerHTML = intakeFiles.map((f, idx) => `
        <div class="file-chip">
          <i data-lucide="paperclip" style="width:12px; height:12px;"></i>
          <span>${f.name} (${f.size})</span>
          <i data-lucide="x" style="width:12px; height:12px; cursor:pointer; color:#f87171;" onclick="event.stopPropagation(); removeIntakeFile(${idx})"></i>
        </div>
      `).join('');
      lucide.createIcons();
    }

    function removeIntakeFile(idx) {
      intakeFiles.splice(idx, 1);
      renderAttachedFilesList();
    }

    function applyIntakePreset(presetKey) {
      const p = INTAKE_PRESETS[presetKey];
      if (!p) return;

      intakeFiles = [{
        name: p.sampleFileName,
        size: '1.4 MB',
        fileObj: null
      }];
      renderAttachedFilesList();

      document.getElementById('formCustomer').value = p.customer;
      document.getElementById('formCustomerContact').value = p.customerContact;
      document.getElementById('formCustomerEmail').value = p.customerEmail;
      document.getElementById('formProduct').value = p.product;
      document.getElementById('formPartNumber').value = p.partNumber;
      document.getElementById('formLotNumber').value = p.lotNumber;
      document.getElementById('formMfgSite').value = p.mfgSite;
      document.getElementById('formIncidentSite').value = p.incidentSite;
      document.getElementById('inputDefectQty').value = p.defectQty;
      document.getElementById('inputInspectQty').value = p.inspectQty;
      document.getElementById('formClaimTitle').value = p.claimTitle;
      document.getElementById('formLineStop').value = p.lineStop;
      document.getElementById('formSafetyRisk').value = p.safetyRisk;
      document.getElementById('formRecurrentDefect').value = p.recurrentDefect;

      calculatePPM();
      autoEvaluateSeverity();

      const notif = document.getElementById('aiParseNotification');
      const notifText = document.getElementById('aiParseNotificationText');
      if (notif && notifText) {
        notifText.innerText = `[${p.customer}] 첨부 문서 (${p.sampleFileName})로부터 14개 품질 메타데이터가 완벽하게 추출되었습니다!`;
        notif.style.display = 'flex';
      }
    }

    function triggerAIExtraction() {
      // Simulate quick intelligent extraction from attached files
      const notif = document.getElementById('aiParseNotification');
      const notifText = document.getElementById('aiParseNotificationText');
      if (notif && notifText) {
        notif.style.display = 'flex';
        notifText.innerText = '🧠 AI 문서 인식 엔진이 그룹웨어 메일 및 첨부파일을 파싱하여 폼을 자동으로 완성하였습니다!';
      }
      calculatePPM();
      autoEvaluateSeverity();
    }

    function parseRawTextIntoForm(text) {
      // Auto fill claim title if raw text pasted
      const claimInput = document.getElementById('formClaimTitle');
      if (claimInput && (!claimInput.value || claimInput.value.includes('LGE DTV'))) {
        claimInput.value = text.trim();
      }
      triggerAIExtraction();
    }

    function autoEvaluateSeverity() {
      const lineStop = document.getElementById('formLineStop')?.value === 'true';
      const safetyRisk = document.getElementById('formSafetyRisk')?.value === 'true';
      const recurrent = document.getElementById('formRecurrentDefect')?.value === 'true';

      const req = document.getElementById('decision8DRequired');
      const sev = document.getElementById('decisionSeverityLevel');
      const sla = document.getElementById('decisionSlaDue');

      if (lineStop || safetyRisk) {
        if (req) req.innerHTML = '● 8D 필수 발행 대상 (Mandatory)';
        if (sev) sev.innerHTML = '● CRITICAL (Level 1 긴급)';
        if (sla) sla.innerHTML = '24시간 이내 (D3 봉쇄 필수)';
      } else if (recurrent) {
        if (req) req.innerHTML = '● 8D 필수 발행 대상 (재발 방지)';
        if (sev) sev.innerHTML = '● MAJOR (Level 2)';
        if (sla) sla.innerHTML = '48시간 이내 (D3 봉쇄)';
      } else {
        if (req) req.innerHTML = '○ 8D 발행 권고 (Standard)';
        if (sev) sev.innerHTML = '○ MINOR (Level 3)';
        if (sla) sla.innerHTML = '72시간 이내';
      }
    }'''

start_fn = '    /* ========================================================================= */\n    /* VIEW 2: STEP 01. NEW CASE INTAKE (신규 부적합 접수 & SEVERITY 엔진)          */'
end_fn = '    function handleCreateCase(e) {'

s_fidx = content.find(start_fn)
e_fidx = content.find(end_fn)

if s_fidx != -1 and e_fidx != -1:
    content = content[:s_fidx] + new_view_code + '\n\n    ' + content[e_fidx:]
    print('Updated renderNewCaseView and Ingest JS successfully!')
else:
    print('Error finding function markers:', s_fidx, e_fidx)

with open(r'g:\내 드라이브\AI_Place\Work\11_AI_Customer_Nonconformance_8D_System\index.html', 'w', encoding='utf-8') as f:
    f.write(content)
print('All changes saved to index.html!')
