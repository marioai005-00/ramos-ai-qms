import os

base_dir = r'g:\내 드라이브\AI_Place\Work\11_AI_Customer_Nonconformance_8D_System'

reports_js_updated = """/* ========================================================================= */
/* VIEW 6: 3-GATE APPROVAL & 8D REPORTS HUB (INITIAL 3D / INTERIM 5D / FINAL 8D) */
/* ========================================================================= */
let currentGateKey = 'gate3D'; // 'gate3D' (D1~D3), 'gate5D' (D4~D5), 'gate8D' (D6~D8)

function ensureCaseGates(c) {
  if (!c.gates) {
    c.gates = {
      gate3D: {
        title: 'Initial 3D Containment Report (D1~D3 봉쇄 확정)',
        reportType: 'initial',
        status: (c.currentStage === 'D1' || c.currentStage === 'D2') ? 'Pending' : 'Approved',
        internalApproved: true,
        dispatchedByQuality: true,
        dispatchDate: '2026-09-02 11:15',
        approvalDate: '2026-09-02 11:15',
        approvers: [
          { role: '1차: 물류/자재 격리 책임자', name: c.team?.find(t=>t.role.includes('Containment'))?.name || '이은산 센터장_상무', status: 'Approved', date: '2026-09-02 09:15', comment: '공장 완제품 45,000ea 출하 락 및 협력사 입고격리 완료' },
          { role: '2차: 8D Leader (연구소 주관)', name: c.team?.find(t=>t.role.includes('Leader'))?.name || '김현수 실장_상무', status: 'Approved', date: '2026-09-02 10:00', comment: '초동 선별 방안 수립 및 D3 봉쇄 유효성 검증 승인' },
          { role: '3차: 8D Champion (품질혁신)', name: c.team?.find(t=>t.role.includes('Champion'))?.name || '황승안 팀장_상무', status: 'Approved', date: '2026-09-02 11:00', comment: '전사 초동 대응 종합 승인 및 고객 송부 최종 결재' },
          { role: '4차: 8D 품질실무 (고객사 공식 송부)', name: '김성중 S.Pro', status: 'Approved', date: '2026-09-02 11:15', comment: `고객사(${c.customer} - ${c.customerContact || '최영수 책임'}) 앞 공식 3D Report 송부 완료 (SLA 18h 준수)` }
        ]
      },
      gate5D: {
        title: 'Interim 5D Root Cause & PCA Report (D4~D5 원인/영구대책)',
        reportType: 'interim',
        status: (c.currentStage === 'D6' || c.currentStage === 'D7' || c.currentStage === 'D8' || c.status === 'Closed') ? 'Approved' : (c.currentStage === 'D4' || c.currentStage === 'D5' ? 'Pending' : 'Locked'),
        internalApproved: (c.currentStage === 'D6' || c.currentStage === 'D7' || c.currentStage === 'D8' || c.status === 'Closed'),
        dispatchedByQuality: (c.currentStage === 'D6' || c.currentStage === 'D7' || c.currentStage === 'D8' || c.status === 'Closed'),
        dispatchDate: '2026-09-06 16:00',
        approvalDate: '2026-09-06 16:00',
        approvers: [
          { role: '1차: 불량 분석 리더 (FA)', name: c.team?.find(t=>t.role.includes('FA') || t.role.includes('Technical'))?.name || '박재환 팀장_S.Pro', status: (c.currentStage === 'D4' || c.currentStage === 'D5' || c.status === 'Closed') ? 'Approved' : 'Pending', date: '2026-09-05 14:00', comment: 'SEM 단면 Crack 및 Decap 탄화 물리적 입증 성적서(EVD-08) 검증' },
          { role: '2차: 8D Leader (연구소 주관)', name: c.team?.find(t=>t.role.includes('Leader'))?.name || '김현수 실장_상무', status: (c.currentStage === 'D5' || c.status === 'Closed') ? 'Approved' : 'Pending', date: '2026-09-06 11:00', comment: 'C102 MLCC X7R 125도 고온 보증 등급 설계 변경 ECN 승인' },
          { role: '3차: 8D Champion (품질혁신)', name: c.team?.find(t=>t.role.includes('Champion'))?.name || '황승안 팀장_상무', status: (c.status === 'Closed' || c.currentStage === 'D8') ? 'Approved' : 'Pending', date: '2026-09-06 15:30', comment: 'Interim 5D 영구대책 내부 결재 최종 승인' },
          { role: '4차: 8D 품질실무 (고객사 공식 송부)', name: '김성중 S.Pro', status: (c.status === 'Closed' || c.currentStage === 'D8') ? 'Approved' : 'Pending', date: '2026-09-06 16:00', comment: `고객사(${c.customer}) 앞 Interim 5D 정식 송부 완결` }
        ]
      },
      gate8D: {
        title: 'Final 8D Closure Report (D6~D8 효과검증 & 영구종결)',
        reportType: 'final',
        status: (c.status === 'Closed' || c.currentStage === 'D8') ? 'Approved' : 'Pending',
        internalApproved: (c.status === 'Closed'),
        dispatchedByQuality: (c.status === 'Closed'),
        dispatchDate: '2026-09-12 18:00',
        approvalDate: '2026-09-12 18:00',
        approvers: [
          { role: '1차: 8D Leader (연구소 주관)', name: c.team?.find(t=>t.role.includes('Leader'))?.name || '김현수 실장_상무', status: (c.status === 'Closed') ? 'Approved' : 'Pending', date: '2026-09-12 14:00', comment: 'HTOL 504시간 0 Fail 및 0 PPM 달성 검증' },
          { role: '2차: 알앤디부문장 (연구소장)', name: '박정훈 부문장_전무', status: (c.status === 'Closed') ? 'Approved' : 'Pending', date: '2026-09-12 15:30', comment: '전사 개발 표준 반영 및 설계 수평전개 승인' },
          { role: '3차: 8D Champion (품질혁신)', name: c.team?.find(t=>t.role.includes('Champion'))?.name || '황승안 팀장_상무', status: (c.status === 'Closed') ? 'Approved' : 'Pending', date: '2026-09-12 17:00', comment: 'Final 8D 내부 결재 최종 완료 및 고객 송부 승인' },
          { role: '4차: 8D 품질실무 (고객사 공식 송부)', name: '김성중 S.Pro', status: (c.status === 'Closed') ? 'Approved' : 'Pending', date: '2026-09-12 18:00', comment: `고객사(${c.customer}) 앞 Final 8D 완결본 공식 송부 및 종결 처리` }
        ]
      }
    };
  }
  return c.gates;
}

function renderReportsHubView(c) {
  const gates = ensureCaseGates(c);
  const activeGate = gates[currentGateKey];
  const reportType = activeGate.reportType;

  // Check if champion approved (step 3)
  const isChampionApproved = activeGate.approvers[2]?.status === 'Approved';
  const isQualityDispatched = activeGate.approvers[3]?.status === 'Approved';

  return `
    <!-- Top Bar -->
    <div class="no-print" style="margin-bottom: 16px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
      <div>
        <h1 style="font-size: 1.3rem; font-weight: 800; color: #f8fafc; display:flex; align-items:center; gap:8px;">
          <i data-lucide="shield-check" style="color: #38bdf8;"></i> 3단계 Gate 승인 & 8D 공식 리포트 발행 센터
        </h1>
        <p style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 4px;">
          결재 경로: <b>1차(물류/FA) ➔ 2차(8D Leader) ➔ 3차(8D Champion) [내부승인] ➔ 4차: 8D 품질실무(김성중 S.Pro) [고객사 공식 송부 및 SLA 확정]</b>
        </p>
      </div>

      <div style="display:flex; gap:10px;">
        <button class="btn btn-success btn-sm" onclick="window.print()">
          <i data-lucide="printer" style="width:14px; height:14px;"></i> 공식 리포트 A4 인쇄 / PDF 저장
        </button>
      </div>
    </div>

    <!-- 3-Gate Milestone Navigation Cards -->
    <div class="gate-nav-bar no-print">
      
      <!-- Gate 1: Initial 3D -->
      <div class="gate-nav-card ${currentGateKey === 'gate3D' ? 'active' : ''} ${gates.gate3D.status === 'Approved' ? 'approved' : 'in-progress'}" onclick="setGateTab('gate3D')">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
          <span style="font-size:0.7rem; font-weight:800; color:#38bdf8;">GATE 01 (최초 접수 ~ D3)</span>
          <span class="badge-pill ${gates.gate3D.status === 'Approved' ? 'badge-ok' : 'badge-warn'}" style="font-size:0.65rem;">
            ${gates.gate3D.status === 'Approved' ? '● 3D 고객 송부완료' : '🟡 3D 결재 진행중'}
          </span>
        </div>
        <div style="font-size:0.92rem; font-weight:800; color:#f8fafc;">Initial 3D Report</div>
        <div style="font-size:0.72rem; color:var(--text-muted); margin-top:4px;">
          물류격리 ➔ 8D리더 ➔ 챔피언 ➔ <b>김성중(고객사 송부)</b>
        </div>
      </div>

      <!-- Gate 2: Interim 5D -->
      <div class="gate-nav-card ${currentGateKey === 'gate5D' ? 'active' : ''} ${gates.gate5D.status === 'Approved' ? 'approved' : (gates.gate5D.status === 'Pending' ? 'in-progress' : 'locked')}" onclick="setGateTab('gate5D')">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
          <span style="font-size:0.7rem; font-weight:800; color:#a855f7;">GATE 02 (D3 확정 ~ D5)</span>
          <span class="badge-pill ${gates.gate5D.status === 'Approved' ? 'badge-ok' : (gates.gate5D.status === 'Pending' ? 'badge-warn' : 'badge-gray')}" style="font-size:0.65rem;">
            ${gates.gate5D.status === 'Approved' ? '● 5D 고객 송부완료' : (gates.gate5D.status === 'Pending' ? '🟡 5D 결재 진행중' : '⚪ 미도달')}
          </span>
        </div>
        <div style="font-size:0.92rem; font-weight:800; color:#f8fafc;">Interim 5D Report</div>
        <div style="font-size:0.72rem; color:var(--text-muted); margin-top:4px;">
          FA리더 ➔ 8D리더 ➔ 챔피언 ➔ <b>김성중(고객사 송부)</b>
        </div>
      </div>

      <!-- Gate 3: Final 8D -->
      <div class="gate-nav-card ${currentGateKey === 'gate8D' ? 'active' : ''} ${gates.gate8D.status === 'Approved' ? 'approved' : (gates.gate8D.status === 'Pending' ? 'in-progress' : 'locked')}" onclick="setGateTab('gate8D')">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
          <span style="font-size:0.7rem; font-weight:800; color:#10b981;">GATE 03 (D5 확정 ~ D8)</span>
          <span class="badge-pill ${gates.gate8D.status === 'Approved' ? 'badge-ok' : (gates.gate8D.status === 'Pending' ? 'badge-warn' : 'badge-gray')}" style="font-size:0.65rem;">
            ${gates.gate8D.status === 'Approved' ? '● 8D 최종 종결 송부완료' : '🟡 최종 결재 대기'}
          </span>
        </div>
        <div style="font-size:0.92rem; font-weight:800; color:#f8fafc;">Final 8D Closure Report</div>
        <div style="font-size:0.72rem; color:var(--text-muted); margin-top:4px;">
          8D리더 ➔ R&D부문장 ➔ 챔피언 ➔ <b>김성중(고객사 송부 및 종결)</b>
        </div>
      </div>

    </div>

    <!-- Electronic Approval & Quality Dispatch Panel (4 Columns) -->
    <div class="approval-flow-card no-print">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; border-bottom:1px solid rgba(255,255,255,0.08); padding-bottom:10px; flex-wrap:wrap; gap:10px;">
        <div style="display:flex; align-items:center; gap:8px;">
          <i data-lucide="stamp" style="width:18px; height:18px; color:#38bdf8;"></i>
          <span style="font-size:0.95rem; font-weight:800; color:#f8fafc;">
            ${activeGate.title} — 내부 결재선 & 고객사 송부 현황
          </span>
          <span class="badge-pill ${activeGate.status === 'Approved' ? 'badge-ok' : 'badge-warn'}">
            ${activeGate.status === 'Approved' ? `고객사 송부 완료 (${activeGate.dispatchDate})` : (isChampionApproved && !isQualityDispatched ? '내부승인완료 (고객송부 대기)' : '내부 결재 진행 중')}
          </span>
        </div>

        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <!-- Sign-off Button for Internal Approvers -->
          <button class="btn btn-primary btn-sm" onclick="promptSignoffApproval('${currentGateKey}')">
            <i data-lucide="edit-3" style="width:13px; height:13px;"></i> ✍️ 결재 서명 / 승인 처리
          </button>

          <!-- Dedicated Quality Facilitator Customer Dispatch Button -->
          ${isChampionApproved && !isQualityDispatched ? `
            <button class="btn btn-warning btn-sm" onclick="dispatchReportToCustomer('${currentGateKey}')" style="box-shadow:0 0 14px rgba(245,158,11,0.4); font-weight:800;">
              <i data-lucide="send" style="width:13px; height:13px;"></i> ✉️ [김성중 S.Pro] 고객사 공식 송부 실행
            </button>
          ` : ''}

          <!-- Gate Advance Buttons -->
          ${activeGate.status === 'Approved' && currentGateKey === 'gate3D' ? `
            <button class="btn btn-success btn-sm" onclick="advanceToNextGate('D4')">
              <i data-lucide="arrow-right" style="width:13px; height:13px;"></i> D4~D5 단계 공식 진입
            </button>
          ` : ''}
          ${activeGate.status === 'Approved' && currentGateKey === 'gate5D' ? `
            <button class="btn btn-success btn-sm" onclick="advanceToNextGate('D6')">
              <i data-lucide="arrow-right" style="width:13px; height:13px;"></i> D6~D8 단계 공식 진입
            </button>
          ` : ''}
        </div>
      </div>

      <!-- Approvers Sequence Grid (Exactly 4 Columns) -->
      <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:10px;">
        ${activeGate.approvers.map((appr, idx) => `
          <div style="background:#0e172a; border:1px solid ${appr.status === 'Approved' ? '#10b981' : (idx === 3 && isChampionApproved && !isQualityDispatched ? '#f59e0b' : '#334155')}; border-radius:6px; padding:12px 10px; text-align:center; position:relative;">
            <div style="font-size:0.68rem; color:#94a3b8; font-weight:700;">${appr.role}</div>
            <div style="font-size:0.86rem; font-weight:800; color:#f8fafc; margin-top:4px;">${appr.name}</div>
            
            <div style="margin:10px 0;">
              ${appr.status === 'Approved' ? `
                <div class="signoff-stamp-box">
                  ✔ ${idx === 3 ? '고객송부 완료 [송부]' : '승인완료 [인]'}<br>
                  <span style="font-size:9px; font-weight:600;">${appr.date}</span>
                </div>
              ` : (idx === 3 && isChampionApproved ? `
                <div style="border:1px solid #f59e0b; color:#fbbf24; background:rgba(245,158,11,0.1); border-radius:4px; padding:4px 6px; font-size:10.5px; font-weight:800; cursor:pointer;" onclick="dispatchReportToCustomer('${currentGateKey}')">
                  ✉️ 송부 실행 대기 (클릭)
                </div>
              ` : `
                <div class="signoff-pending-box">
                  ⏳ 결재 대기
                </div>
              `)}
            </div>

            <div style="font-size:0.68rem; color:#cbd5e1; background:rgba(15,23,42,0.8); border-radius:4px; padding:6px 8px; text-align:left; min-height:38px; line-height:1.25;">
              <b>비고:</b> ${appr.comment || '검토 의견 대기 중'}
            </div>
          </div>
        `).join('')}
      </div>
    </div>

    <!-- Official Report Paper (A4 Style) -->
    <div class="report-paper" id="reportPrintArea">
      
      <!-- Watermark per Report Stage -->
      <div class="report-watermark">
        ${reportType === 'initial' 
          ? 'INITIAL 3D REPORT — CONTAINMENT APPROVED & DISPATCHED' 
          : reportType === 'interim'
          ? 'INTERIM 5D REPORT — ROOT CAUSE & PCA DISPATCHED' 
          : 'FINAL 8D APPROVED — ZERO DEFECT CLOSED'}
      </div>

      <!-- Header Table -->
      <table class="report-header-table">
        <tr>
          <td rowspan="2" style="width: 25%; text-align:center; background:#f1f5f9;">
            <div style="font-size:18px; font-weight:900; color:#1e3a8a; letter-spacing:0.05em;">RAMOS</div>
            <div style="font-size:9px; color:#64748b; font-weight:700;">QUALITY MANAGEMENT SYSTEM</div>
          </td>
          <td colspan="2" style="text-align:center;">
            <div class="report-header-title">
              ${reportType === 'initial' ? 'INITIAL 3D CONTAINMENT REPORT (D1~D3)' : reportType === 'interim' ? 'INTERIM 5D CORRECTIVE ACTION REPORT (D1~D5)' : 'EIGHT DISCIPLINES (8D) QUALITY PROBLEM SOLVING REPORT'}
            </div>
          </td>
          <td style="width: 20%; font-size:11px;">
            <b>Report No:</b> ${c.id}<br>
            <b>Stage:</b> ${reportType.toUpperCase()} (Gate ${currentGateKey.replace('gate','')})<br>
            <b>Dispatch Date:</b> ${activeGate.dispatchDate || activeGate.approvalDate || new Date().toISOString().slice(0,10)}
          </td>
        </tr>
        <tr>
          <td><b>Customer:</b> ${c.customer}</td>
          <td><b>Product:</b> ${c.product}</td>
          <td><b>Status:</b> ${activeGate.status === 'Approved' ? 'DISPATCHED & APPROVED' : 'IN REVIEW'}</td>
        </tr>
      </table>

      <!-- General Incident Summary -->
      <table class="report-inner-table" style="margin-bottom:12px;">
        <tr>
          <th style="width:15%;">Part Number</th>
          <td style="width:35%;">${c.partNumber}</td>
          <th style="width:15%;">Lot Number</th>
          <td style="width:35%; font-weight:700;">${c.lotNumber}</td>
        </tr>
        <tr>
          <th>Defect Quantity</th>
          <td style="color:#b91c1c; font-weight:700;">${c.defectQty} / ${(c.inspectQty || 10000).toLocaleString()} ea (${c.ppm} PPM)</td>
          <th>Incident Site</th>
          <td>${c.incidentSite}</td>
        </tr>
        <tr>
          <th>Failure Symptom</th>
          <td colspan="3" style="font-weight:700; color:#0f172a;">${c.claimTitle}</td>
        </tr>
      </table>

      <!-- D1 Team -->
      <div class="report-section">
        <div class="report-sec-title"><span>D1. Cross-Functional Team (CFT)</span> <span>Completed</span></div>
        <div class="report-sec-content">
          <table class="report-inner-table">
            <tr>
              <th>8D Champion</th><td>${c.team[0]?.name || '황승안 팀장_상무'} (${c.team[0]?.dept || '품질혁신팀'})</td>
              <th>8D Leader</th><td>${c.team[1]?.name || '김현수 실장_상무'} (${c.team[1]?.dept || 'Flash 개발실'})</td>
            </tr>
            <tr>
              <th>Technical / FA Lead</th><td>${c.team[2]?.name || '박재환 팀장_S.Pro'} (${c.team[2]?.dept || 'Flash 개발2팀'})</td>
              <th>Quality Facilitator</th><td>김성중 S.Pro (품질혁신팀)</td>
            </tr>
          </table>
        </div>
      </div>

      <!-- D2 Problem -->
      <div class="report-section">
        <div class="report-sec-title"><span>D2. Problem Description & Fact</span> <span>Fact Confirmed</span></div>
        <div class="report-sec-content">
          <div style="font-size:12px; margin-bottom:6px;">
            <b>5W2H Definition:</b> ${c.d2?.problemWhat || c.claimTitle} (${c.d2?.problemWhere || c.incidentSite}, ${c.d2?.problemWhen || '초동 발견'})
          </div>
          <div style="font-size:11.5px; color:#334155;">
            <b>Electrical Measurement:</b> VCC-VSS Short 측정 (0.8Ω 저항 측정됨) / <b>BGA 상태:</b> X-Ray 상 외관 정상
          </div>
        </div>
      </div>

      <!-- D3 Containment -->
      <div class="report-section">
        <div class="report-sec-title"><span>D3. Interim Containment Actions</span> <span>100% Implemented</span></div>
        <div class="report-sec-content">
          <table class="report-inner-table">
            <tr>
              <th>Area</th><th>Total Qty</th><th>Hold / Screened</th><th>NG Qty</th><th>Containment Result</th>
            </tr>
            ${(c.d3?.materialFlow || []).map(mf => `
              <tr>
                <td><b>${mf.area}</b></td>
                <td>${mf.totalQty.toLocaleString()}</td>
                <td>${mf.holdQty.toLocaleString()}</td>
                <td style="color:${mf.ngQty > 0 ? '#b91c1c' : '#047857'}; font-weight:700;">${mf.ngQty}</td>
                <td>${mf.status} (${mf.evidence})</td>
              </tr>
            `).join('')}
          </table>
          <div style="font-size:11.5px; font-weight:700; color:#1e3a8a; margin-top:6px;">
            ✔ 봉쇄 유효성: ${c.d3?.effectivenessStatement || '고객사 출하 Lock 및 100% 전수 선별 완료'}
          </div>
        </div>
      </div>

      ${reportType !== 'initial' ? `
        <!-- D4 Root Cause -->
        <div class="report-section">
          <div class="report-sec-title"><span>D4. Root Cause Analysis (Occurrence & Escape)</span> <span>Root Cause Confirmed</span></div>
          <div class="report-sec-content">
            <div style="font-size:12px; margin-bottom:4px;">
              <b>1. Occurrence Root Cause:</b> ${c.d4?.candidateCauses[0]?.title || 'MLCC X5R 내열 마진 부족에 의한 Reflow 열응력 Crack 발생'}
              <div style="font-size:11px; color:#475569;">(Evidence: Decap 소손 확인 및 SEM Cross-Section 수직 Crack 성적서 EVD-08 입증 완료)</div>
            </div>
            <div style="font-size:12px; margin-top:6px;">
              <b>2. Escape Root Cause:</b> ${c.d4?.candidateCauses[1]?.title || 'BOM 승인 단계에서 고온 신뢰성 Rating 대조 Checklist 누락'}
            </div>
          </div>
        </div>

        <!-- D5 Corrective Action -->
        <div class="report-section">
          <div class="report-sec-title"><span>D5. Permanent Corrective Action (PCA)</span> <span>PCA Selected</span></div>
          <div class="report-sec-content">
            <div style="font-size:12px;">
              <b>PCA-01:</b> C102 MLCC X5R(85℃) → X7R(125℃ 고온 보증 등급) 100% 설계 변경 (ECN-260901 완료)<br>
              <b>PCA-02:</b> BOM 승인 절차 내 신뢰성 환경온도 크로스체크 항목 신설 완결
            </div>
          </div>
        </div>
      ` : ''}

      ${reportType === 'final' ? `
        <!-- D6 Validation -->
        <div class="report-section">
          <div class="report-sec-title"><span>D6. Implementation & Validation</span> <span>100% Verified</span></div>
          <div class="report-sec-content">
            <table class="report-inner-table">
              <tr><th>Test Name</th><th>Condition</th><th>Sample</th><th>Result</th></tr>
              <tr><td>HTOL 가속 수명 시험</td><td>125℃ / 504 Hours</td><td>231 ea</td><td style="color:#047857; font-weight:700;">0 Fail (PASS)</td></tr>
              <tr><td>LGE 실장 파일럿 시험</td><td>SMT Line 500ea 실장</td><td>500 ea</td><td style="color:#047857; font-weight:700;">0 Fail (PASS)</td></tr>
            </table>
            <div style="font-size:11.5px; font-weight:700; color:#047857; margin-top:4px;">
              ✔ Before: 1,200 PPM (12/10,000ea Fail) → After: 0 PPM (0 Defect 완결)
            </div>
          </div>
        </div>

        <!-- D7 Prevention -->
        <div class="report-section">
          <div class="report-sec-title"><span>D7. Prevent Recurrence & Horizontal Deployment</span> <span>Completed</span></div>
          <div class="report-sec-content">
            <div style="font-size:11.5px;">
              <b>System Updates:</b> DFMEA (RPN 180→24), PFMEA Rev.2.1, Control Plan Rev.2.0 개정 완결<br>
              <b>수평 전개:</b> 유사 제품군(eMMC 32GB) BOM 즉시 변경 및 ECN 배포 완료
            </div>
          </div>
        </div>
      ` : ''}

      <!-- Stage Gate Official Sign-off Box in Paper (4 Columns) -->
      <div class="report-section">
        <div class="report-sec-title">
          <span>${activeGate.title} — Internal Sign-off & Customer Dispatch</span>
          <span>${activeGate.status === 'Approved' ? 'DISPATCHED' : 'PENDING'}</span>
        </div>
        <div class="report-sec-content">
          <table class="report-inner-table" style="text-align:center;">
            <tr>
              ${activeGate.approvers.map(a => `<th style="width:25%; font-size:11px;">${a.role}</th>`).join('')}
            </tr>
            <tr>
              ${activeGate.approvers.map((a, i) => `
                <td style="padding:10px 4px;">
                  <div style="font-weight:700; font-size:11.5px; color:#1e3a8a;">${a.name}</div>
                  ${a.status === 'Approved' ? `
                    <div style="color:#059669; font-weight:800; font-size:10px; margin-top:4px;">
                      ✔ ${i === 3 ? '고객송부 완료' : '서명완료'} (${a.date})
                    </div>
                  ` : `
                    <div style="color:#94a3b8; font-size:10px; margin-top:4px;">⏳ 대기</div>
                  `}
                </td>
              `).join('')}
            </tr>
          </table>
        </div>
      </div>

    </div>
  `;
}

function setGateTab(gateKey) {
  currentGateKey = gateKey;
  renderCurrentView();
}

function promptSignoffApproval(gateKey) {
  const c = getActiveCase();
  const gates = ensureCaseGates(c);
  const gate = gates[gateKey];

  // Find next pending approver in internal steps (0, 1, 2)
  const pendingApprover = gate.approvers.find(a => a.status !== 'Approved' && !a.role.includes('송부'));
  if (!pendingApprover) {
    if (gate.approvers[3]?.status !== 'Approved') {
      alert('✔ 내부 결재가 모두 승인되었습니다!\\n\\n➔ 이제 [8D 품질실무 김성중 S.Pro] 님의 고객사 공식 송부 버튼을 눌러 발송을 완료하세요.');
    } else {
      alert(`[${gate.title}] 은 이미 모든 내부 승인 및 고객사 송부(${gate.dispatchDate})가 완결되었습니다!`);
    }
    return;
  }

  const comment = prompt(`[${pendingApprover.role}] ${pendingApprover.name} 님의 결재 승인 의견을 입력하세요:`, '내용 확인 및 승인 처리합니다.');
  if (comment === null) return;

  const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 16);
  pendingApprover.status = 'Approved';
  pendingApprover.date = nowStr;
  pendingApprover.comment = comment || '승인 처리됨';

  // Check if champion approved (3rd step)
  if (gate.approvers[2]?.status === 'Approved') {
    gate.internalApproved = true;
    alert(`✔ [8D Champion 황승안 상무] 내부 결재가 최종 승인되었습니다!\\n\\n➔ [8D 품질실무 김성중 S.Pro] 님에게 이관되어 고객사 송부 버튼이 활성화되었습니다.`);
  } else {
    alert(`✔ [${pendingApprover.name}] 님의 결재가 정상 승인되었습니다. (다음 결재선으로 전달됨)`);
  }

  saveAppData();
  renderCurrentView();
}

function dispatchReportToCustomer(gateKey) {
  const c = getActiveCase();
  const gates = ensureCaseGates(c);
  const gate = gates[gateKey];
  const dispatchApprover = gate.approvers[3]; // 김성중 S.Pro

  const confirmSend = confirm(`[김성중 S.Pro — 8D 품질 실무 간사]\\n\\n내부 결재가 완결된 [${gate.title}] 을(를) 고객사(${c.customer} - ${c.customerContact || '품질보증팀'})로 공식 송부하시겠습니까?`);
  if (!confirmSend) return;

  const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 16);
  dispatchApprover.status = 'Approved';
  dispatchApprover.date = nowStr;
  dispatchApprover.comment = `고객사(${c.customerContact || '고객품질팀'} 앞) 공식 8D Report 이메일 발송 완료 (SLA 준수)`;
  gate.dispatchedByQuality = true;
  gate.status = 'Approved';
  gate.dispatchDate = nowStr;
  gate.approvalDate = nowStr;

  saveAppData();
  renderCurrentView();
  alert(`✉️ [김성중 S.Pro] 고객사(${c.customer}) 앞 공식 송부가 성공적으로 완료되었습니다! (송부일시: ${nowStr})\\n\\n🎉 해당 Gate(${gateKey.replace('gate','')}) 가 공식 승인 완결되었습니다.`);
}

function advanceToNextGate(targetStage) {
  const c = getActiveCase();
  c.currentStage = targetStage;
  saveAppData();
  alert(`🚀 Case [${c.id}] 가 다음 단계인 [${targetStage}] 단계로 공식 승격되었습니다!`);
  switchStage(targetStage);
}

function renderCasesListView() {
  return renderDashboardView();
}
"""

with open(os.path.join(base_dir, 'js', 'views', 'reports.js'), 'w', encoding='utf-8') as f:
    f.write(reports_js_updated)
print('Updated reports.js to exactly 4-column internal sign-off + customer dispatch flow!')
