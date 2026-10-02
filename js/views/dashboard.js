/* VIEW 1: DASHBOARD (8D CASE MATRIX & GAP TRACKER)                          */
    /* ========================================================================= */
    function renderDashboardView() {
      const cases = appData.cases;

      return `
        ${renderQmsPageHeader({ title:'부적합 및 8D 종합 현황', icon:'layers', description:'부적합 Case별 D1~D8 진행 단계와 누락 항목을 확인하고 필요한 조치를 시작합니다.', actions:`<button class="btn btn-primary" onclick="switchNav('new-case')"><i data-lucide="plus-circle"></i> 신규 부적합 접수</button>` })}

        ${typeof renderDashboardSlaCoqStrip === 'function' ? renderDashboardSlaCoqStrip() : ''}

        ${renderIntakeQueueDashboardPanel()}

        <!-- Live Case List with Full D1~D8 Progress & GAP Trackers -->
        <div style="display:flex; flex-direction:column; gap:16px;">
          ${cases.length > 0 ? cases.map(c => renderCaseGapCardHTML(c)).join('') : `
            <section class="fresh-start-empty fresh-start-dashboard">
              <div class="fresh-start-code">CLEAN WORKSPACE · 0 CASES</div>
              <i data-lucide="clipboard-plus"></i>
              <h2>새 업무 흐름을 시작할 준비가 되었습니다.</h2>
              <p>등록된 부적합 Case가 없습니다. 첫 고객 부적합을 접수하면 STEP 02 품질 검토 대기함으로 전달됩니다.</p>
              <div style="display:flex;justify-content:center;gap:10px;flex-wrap:wrap;"><button class="btn btn-primary" onclick="switchNav('new-case')">첫 부적합 접수 시작</button></div>
            </section>
          `}
        </div>
      `;
    }

    function renderCaseGapCardHTML(c) {
      const stageOrder = ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8'];
      const curIdx = stageOrder.indexOf(c.currentStage);

      // Check gaps for D1~D8
      const stagesInfo = [
        {
          code: 'D1',
          name: 'Team (CFT)',
          isDone: c.team && c.team.length >= 4,
          statusText: c.team && c.team.length >= 4 ? `🟢 배속 완료 (${c.team.length}명)` : '🔴 누락 (팀원 미배속)',
          gapText: c.team && c.team.length >= 4 ? '' : 'CFT 리더십/팀원 누락'
        },
        {
          code: 'D2',
          name: 'Problem',
          isDone: !!(c.d2 && c.d2.problemWhat && c.d2.problemWhere),
          statusText: (c.d2 && c.d2.problemWhat) ? '🟢 Fact 확정' : '🔴 누락 (5W2H 미기록)',
          gapText: (c.d2 && c.d2.problemWhat) ? '' : '5W2H 물리적 Fact 누락'
        },
        {
          code: 'D3',
          name: 'Containment',
          isDone: !!(c.d3 && c.d3.materialFlow && c.d3.materialFlow.length > 0),
          statusText: (c.d3 && c.d3.materialFlow && c.d3.materialFlow.length > 0) ? '🟢 100% 격리 완결' : (curIdx >= 2 ? '🔴 누락 (출하 Lock 미확인)' : '🟡 초동 봉쇄 진행중'),
          gapText: (c.d3 && c.d3.materialFlow && c.d3.materialFlow.length > 0) ? '' : '고객/창고/자재 격리 필요'
        },
        {
          code: 'D4',
          name: 'Root Cause',
          isDone: !!(c.d4 && c.d4.candidateCauses && c.d4.candidateCauses.length > 0 && (c.evidenceList || []).some(e => (e.linkedStages || []).includes('D4'))),
          statusText: (c.d4 && c.d4.candidateCauses && c.d4.candidateCauses.length > 0) ? '🟢 물리적 입증 (EVD)' : (curIdx >= 3 ? '🔴 누락 (성적서 미연결)' : '⚪ 분석 대기'),
          gapText: (c.d4 && c.d4.candidateCauses && c.d4.candidateCauses.length > 0) ? '' : (curIdx >= 3 ? 'FA SEM/Decap 증거 누락' : '')
        },
        {
          code: 'D5',
          name: 'Corrective Action',
          isDone: !!(c.d5 && c.d5.candidates && c.d5.candidates.length > 0),
          statusText: (c.d5 && c.d5.candidates && c.d5.candidates.length > 0) ? '🟢 영구대책 수립' : (curIdx >= 4 ? '🔴 누락 (대책 미수립)' : '⚪ 수립 대기'),
          gapText: (c.d5 && c.d5.candidates && c.d5.candidates.length > 0) ? '' : (curIdx >= 4 ? 'BOM/공정 개선안 누락' : '')
        },
        {
          code: 'D6',
          name: 'Validation',
          isDone: !!(c.d6 && c.d6.validationTests && c.d6.validationTests.length > 0),
          statusText: (c.d6 && c.d6.validationTests && c.d6.validationTests.length > 0) ? '🟢 검증 시험 등록' : (curIdx >= 5 ? '🔴 누락 (검증 미실시)' : '⚪ 검증 대기'),
          gapText: (c.d6 && c.d6.validationTests && c.d6.validationTests.length > 0) ? '' : (curIdx >= 5 ? 'HTOL/양산 실장 검증 누락' : '')
        },
        {
          code: 'D7',
          name: 'Prevention',
          isDone: !!(c.d7 && c.d7.systemUpdates && c.d7.systemUpdates.length > 0),
          statusText: (c.d7 && c.d7.systemUpdates && c.d7.systemUpdates.length > 0) ? '🟢 FMEA/CP 개정' : (curIdx >= 6 ? '🔴 누락 (수평전개 미실시)' : '⚪ 전개 대기'),
          gapText: (c.d7 && c.d7.systemUpdates && c.d7.systemUpdates.length > 0) ? '' : (curIdx >= 6 ? 'DFMEA/PFMEA 개정 누락' : '')
        },
        {
          code: 'D8',
          name: 'Closure',
          isDone: c.status === 'Closed' || c.currentStage === 'D8',
          statusText: (c.status === 'Closed' || c.currentStage === 'D8') ? '🟢 종결 승인 완료' : '⚪ 승인 대기',
          gapText: (c.status === 'Closed' || c.currentStage === 'D8') ? '' : '최종 결재 미완료'
        }
      ];

      const missingGaps = stagesInfo.filter(s => s.gapText && !s.isDone && s.gapText !== '최종 결재 미완료');

      return `
        <div class="card" style="margin-bottom:0; border: 1px solid ${c.severityLevel === 'Critical' ? '#ef4444' : '#3b82f6'}; background: var(--bg-card);">

          <!-- Top Row: Case Title, Customer, PPM, SLA Due & Action Button -->
          <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(255,255,255,0.08); padding-bottom:12px; margin-bottom:12px; flex-wrap:wrap; gap:10px;">
            <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
              <span class="num-mono" style="font-size:1.05rem; font-weight:800; color:#60a5fa;">${c.id}</span>
              <span style="font-weight:700; font-size:0.95rem; color:var(--text-primary);">${c.customer}</span>
              <span class="badge-pill ${c.severityLevel === 'Critical' ? 'badge-fail' : 'badge-purple'}">${c.severityLevel}</span>
              <span class="badge-pill badge-warn" style="font-size:0.72rem;">현재: <b>${c.currentStage} 단계</b></span>
              ${c.lineStop ? `<span class="badge-pill badge-fail" style="font-size:0.7rem;"><i data-lucide="flame" style="width:11px;height:11px;"></i> Line Stop</span>` : ''}
            </div>

            <div style="display:flex; align-items:center; gap:12px;">
              <div style="text-align:right;">
                <span style="font-size:0.7rem; color:var(--text-muted);">SLA Due Date:</span>
                <div class="num-mono" style="font-size:0.78rem; font-weight:700; color:#fbbf24;">${c.dueDateInitial}</div>
              </div>
              ${typeof canDeleteQmsRecords === 'function' && canDeleteQmsRecords() ? `<button class="btn btn-secondary btn-sm" onclick="deleteQmsRecord('case','${c.id}')" title="시스템 관리자 전용 · 사유와 함께 서버에 보관됩니다"><i data-lucide="trash-2" style="width:13px;height:13px;"></i> Case 삭제</button>` : ''}
              <button class="btn btn-primary btn-sm" style="padding:7px 16px; font-weight:700;" onclick="appData.activeCaseId='${c.id}'; switchStage('${c.currentStage}');">
                <i data-lucide="external-link" style="width:14px; height:14px;"></i> 8D Workspace 진입
              </button>
            </div>
          </div>

          <!-- Middle Row: Product, Lot, PPM & Claim Description -->
          <div class="grid-4" style="font-size:0.8rem; margin-bottom:10px; color:var(--text-secondary); gap:10px;">
            <div><span style="color:var(--text-muted);">제품/Part:</span> <b style="color:var(--text-primary);">${c.product}</b></div>
            <div><span style="color:var(--text-muted);">Lot Number:</span> <b class="num-mono" style="color:#93c5fd;">${c.lotNumber}</b></div>
            <div><span style="color:var(--text-muted);">불량률:</span> <b class="num-mono" style="color:${c.ppm > 1000 ? '#f87171' : '#fbbf24'};">${c.defectQty} / ${c.inspectQty ? c.inspectQty.toLocaleString() : '10,000'}ea (${c.ppm} PPM)</b></div>
            <div><span style="color:var(--text-muted);">발생처:</span> <b>${c.incidentSite || '고객사 실장 라인'}</b></div>
          </div>

          <div style="font-size:0.78rem; color:var(--text-secondary); background:var(--bg-card-subtle); padding:8px 12px; border-radius:4px; margin-bottom:14px; border-left:3px solid #3b82f6;">
            <b style="color:#60a5fa;">불량 현상 (Claim Symptom):</b> ${c.claimTitle}
          </div>

          <!-- Bottom Row: Complete D1 ~ D8 Progression & GAP Check Status -->
          <div class="dashboard-gap-tracker-box">
            <div style="font-size:0.74rem; font-weight:700; color:var(--text-secondary); margin-bottom:10px; display:flex; justify-content:space-between; align-items:center;">
              <div style="display:flex; align-items:center; gap:6px;">
                <i data-lucide="git-commit" style="width:14px; height:14px; color:#38bdf8;"></i>
                <span>D1 ~ D8 문제 해결 단계별 진행 & 누락(GAP) 진단</span>
              </div>
              <div>
                ${missingGaps.length > 0 ? `
                  <span class="gap-status-pill gap-status-warn">
                    ⚠️ 누락/미완료 항목 ${missingGaps.length}건 보완 필요
                  </span>
                ` : `
                  <span class="gap-status-pill gap-status-ok">
                    ✔ 현 단계까지 누락 없이 정상 진행
                  </span>
                `}
              </div>
            </div>

            <!-- 8D Stage Flow Bar Grid (8 Columns) -->
            <div style="display:grid; grid-template-columns: repeat(8, 1fr); gap:6px;">
              ${stagesInfo.map((s, sIdx) => `
                <div class="dashboard-gap-step-cell ${s.isDone ? 'is-done' : (s.code === c.currentStage ? 'is-current' : '')}" onclick="appData.activeCaseId='${c.id}'; switchStage('${s.code}');">
                  <div class="gap-step-title">
                    ${s.code}. ${s.name}
                  </div>
                  <div class="gap-step-sub ${s.gapText ? 'is-gap' : ''}">
                    ${s.statusText}
                  </div>
                  ${s.gapText ? `
                    <div class="gap-step-badge">
                      누락: ${s.gapText}
                    </div>
                  ` : ''}
                </div>
              `).join('')}
            </div>
          </div>

        </div>
      `;
    }
