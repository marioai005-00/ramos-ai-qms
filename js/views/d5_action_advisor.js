// D5 corrective-action advice. The server asks an external AI to propose permanent corrective actions for
// the root causes a person confirmed in D4. Nothing is added until a person ticks the actions and applies
// them, and added actions stay unselected with no owner, date or evidence.
let d5ActionAdviceLoading = false;

function d5AdviceEscape(value) { return escapeWorkspaceValue(String(value ?? '')); }

async function requestD5ActionAdvice() {
  const c = getActiveCase();
  if (!c || d5ActionAdviceLoading) return;
  if (!saveLateStage(false)) return;
  d5ActionAdviceLoading = true;
  renderCurrentView();
  try {
    await QMSApi.flushSaves();
    const advice = await QMSApi.d5ActionAdvice(c.id);
    if (getActiveCase() !== c) { alert('화면이 변경되어 추천을 반영하지 않았습니다.'); return; }
    c.d5.actionAdvice = advice;
    saveAppData();
  } catch (error) {
    alert(`AI 대책 추천을 받지 못했습니다. 작성 내용은 그대로입니다.\n${error.message}`);
  } finally {
    d5ActionAdviceLoading = false;
    renderCurrentView();
  }
}

function discardD5ActionAdvice() {
  const c = getActiveCase();
  if (!c?.d5?.actionAdvice || !confirm('AI 대책 추천을 화면에서 지웁니다. 이미 추가한 대책은 그대로 남습니다.')) return;
  if (!saveLateStage(false)) return;
  delete c.d5.actionAdvice;
  saveAppData();
  renderCurrentView();
}

function applyD5ActionAdvice() {
  const c = getActiveCase();
  const advice = c?.d5?.actionAdvice;
  if (!advice?.actions?.length) return;
  const keys = [...document.querySelectorAll('[data-d5-advice-key]:checked')].map(box => box.dataset.d5AdviceKey);
  if (!keys.length) { alert('추가할 대책 후보에 체크해 주세요.'); return; }
  if (!saveLateStage(false)) return;
  const d5 = c.d5;
  advice.added = advice.added || [];
  for (const action of advice.actions.filter(item => keys.includes(item.key) && !advice.added.includes(item.key))) {
    d5.candidates.push({
      id: `D5-${intakeFileId()}`, causeType: action.causeType, title: action.title, rationale: action.mechanism,
      rootCauseElimination: [action.strengthLabel, action.strengthReason].filter(Boolean).join(' — '),
      feasibility: action.feasibility, costImpact: '', riskLevel: action.risks, owner: '', due: '',
      verificationPlan: action.verificationPlan, evidence: '', selected: false,
      source: 'AI 대책 추천', generatedAt: advice.generatedAt, generatedBy: advice.engine
    });
    advice.added.push(action.key);
  }
  d5.approval = { status: 'Draft', humanConfirmed: false };
  saveAppData();
  renderCurrentView();
  const needsPcn = advice.actions.some(item => keys.includes(item.key) && item.pcnLikely === 'yes');
  if (needsPcn) alert('추가한 대책 중 고객 변경 승인(PCN)이 필요할 수 있는 것이 있습니다. 아래 [PCN 필요 여부]를 직접 판단해 주세요.');
}

function renderD5ActionAdvicePanel(c) {
  const advice = c?.d5?.actionAdvice;
  const button = `<button type="button" class="btn btn-primary" onclick="requestD5ActionAdvice()" ${d5ActionAdviceLoading ? 'disabled' : ''}><i data-lucide="sparkles"></i> ${d5ActionAdviceLoading ? 'AI가 확정 원인을 읽는 중…' : advice ? 'AI 대책 추천 다시 받기' : 'AI에게 대책 후보 추천받기'}</button>`;
  const head = `<div class="quality-tool-head inline-head"><div><span class="quality-tool-kicker">D5 · AI 대책 후보 추천</span><h3>확정된 원인마다 영구 대책 후보 받기</h3><p>D4에서 확정한 원인과 입증 자료를 외부 AI(Gemini/Groq)에 보내 대책 후보를 제안받습니다. AI는 대책을 선정하지 않으며 담당자·일정·Evidence도 쓰지 않습니다.</p></div>${button}</div>`;
  if (!advice) return `<div class="card quality-stage-card d4-advice-panel">${head}</div>`;
  const added = new Set(advice.added || []);
  const byCause = Object.entries(advice.causes || {}).map(([kind, label]) => {
    const rows = advice.actions.filter(item => item.causeType === kind);
    const statement = rows[0]?.causeStatement || '';
    return `<div class="d4-advice-block"><h4>${d5AdviceEscape(label)}${statement ? ` <span class="d5-advice-cause">${d5AdviceEscape(statement)}</span>` : ''}</h4>
      ${rows.length ? `<ol class="d4-advice-tools">${rows.map(item => `<li class="d4-advice-tool">
        <div><input type="checkbox" class="d5-advice-check" data-d5-advice-key="${d5AdviceEscape(item.key)}" ${added.has(item.key) ? 'disabled checked' : ''} aria-label="대책 후보 선택"></div>
        <div class="d4-advice-body">
          <div class="d4-advice-title"><strong>${d5AdviceEscape(item.title)}</strong><span class="d5-strength d5-strength-${d5AdviceEscape(item.strength)}">${d5AdviceEscape(item.strengthLabel)}</span>${item.pcnLikely === 'yes' ? '<span class="d4-advice-ready need">PCN 검토 필요</span>' : ''}${added.has(item.key) ? '<span class="d4-advice-added">대책 목록에 추가됨</span>' : ''}</div>
          <dl>
            ${item.mechanism ? `<dt>원인 제거 방식</dt><dd>${d5AdviceEscape(item.mechanism)}</dd>` : ''}
            ${item.strengthReason ? `<dt>강도 판단</dt><dd>${d5AdviceEscape(item.strengthReason)}</dd>` : ''}
            <dt>적용 위치</dt><dd>${d5AdviceEscape(item.changeSiteLabel)}${item.fourM?.length ? ` · 변경 4M: ${d5AdviceEscape(item.fourM.join(', '))}` : ''}</dd>
            <dt>고객 PCN</dt><dd>${d5AdviceEscape(item.pcnLabel)}${item.pcnReason ? ` — ${d5AdviceEscape(item.pcnReason)}` : ''}</dd>
            ${item.risks ? `<dt>부작용·위험</dt><dd>${d5AdviceEscape(item.risks)}</dd>` : ''}
            ${item.verificationPlan ? `<dt>검증 방법</dt><dd>${d5AdviceEscape(item.verificationPlan)}</dd>` : ''}
            ${item.feasibility ? `<dt>적용 제약</dt><dd>${d5AdviceEscape(item.feasibility)}</dd>` : ''}
          </dl>
        </div></li>`).join('')}</ol>` : '<p class="d4-advice-muted">대책 후보가 없습니다.</p>'}
    </div>`;
  }).join('');
  const warnings = [...(advice.gaps || []), ...(advice.weakWarnings || [])];
  const warnBlock = warnings.length ? `<div class="d4-advice-block warn"><h4>점검 결과</h4><ul class="d4-advice-plain">${warnings.map(item => `<li>${d5AdviceEscape(item)}</li>`).join('')}</ul></div>` : '';
  const notes = advice.notes?.length ? `<div class="d4-advice-block warn"><h4>선정 전에 확인할 사항</h4><ul class="d4-advice-plain">${advice.notes.map(item => `<li>${d5AdviceEscape(item)}</li>`).join('')}</ul></div>` : '';
  const generated = advice.generatedAt && !Number.isNaN(Date.parse(advice.generatedAt)) ? qmsLocalTimestamp(new Date(advice.generatedAt)) : '';
  return `<div class="card quality-stage-card d4-advice-panel">${head}
    <div class="d4-advice-meta"><span class="badge-pill badge-warn">AI 제안 · 사람 확인 필요</span><span>${d5AdviceEscape(advice.provider || '')} ${d5AdviceEscape(advice.model || '')} · ${d5AdviceEscape(generated)} 생성</span></div>
    ${warnBlock}${notes}${byCause}
    <div class="d4-selector-actions"><span>체크한 후보가 아래 대책 목록에 '선정 안 됨' 상태로 추가됩니다. 담당자·목표일·비용·Evidence와 선정 여부는 직접 정합니다.</span><button type="button" class="btn btn-secondary" onclick="discardD5ActionAdvice()">추천 지우기</button><button type="button" class="btn btn-primary" onclick="applyD5ActionAdvice()"><i data-lucide="list-plus"></i> 체크한 대책을 목록에 추가</button></div>
  </div>`;
}
