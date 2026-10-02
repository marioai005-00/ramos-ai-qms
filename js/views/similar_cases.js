/* Server-backed historical case similarity and recurrence-prevention suggestions. */
(function(global) {
  'use strict';

  const esc = value => String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');

  function countermeasureText(item) {
    if (typeof item === 'string') return item;
    return item?.title || item?.action || item?.rationale || JSON.stringify(item || {});
  }

  async function openSimilarCaseRecommendations() {
    const c = typeof getActiveCase === 'function' ? getActiveCase() : null;
    if (!c) return;
    const modal = document.getElementById('globalModal');
    const container = document.getElementById('modalContainer');
    if (!modal || !container) return;
    container.innerHTML = '<h3>과거 유사 Case 검색 중…</h3><p>중앙 DB의 종결 Case를 현재 접수 사실과 비교하고 있습니다.</p>';
    modal.style.display = 'flex';
    try {
      const matches = await QMSApi.similarCases(c.id, 5);
      container.innerHTML = `
        <div style="display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:14px;">
          <div><h3 style="margin:0;">과거 Case 유사도 · 재발대책 참고</h3><p style="margin:5px 0 0;color:var(--text-secondary);font-size:.78rem;">현재 Case ${esc(c.id)}와 중앙 DB의 종결 Case를 비교했습니다. 추천은 참고용이며 복사·승인은 사람이 결정합니다.</p></div>
          <button class="btn btn-secondary btn-sm" onclick="closeModal()">닫기</button>
        </div>
        ${matches.length ? matches.map(match => `
          <section class="card" style="margin-bottom:10px;padding:14px;">
            <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;">
              <div><strong>${esc(match.caseId)} · ${esc(match.customer || '')}</strong><div style="font-size:.78rem;color:var(--text-secondary);margin-top:3px;">${esc(match.product || '')} · ${esc(match.claimTitle || '')}</div></div>
              <span class="badge-pill badge-ok">유사도 ${Math.round(Number(match.score || 0) * 100)}%</span>
            </div>
            <p style="font-size:.75rem;margin:10px 0 6px;"><b>근거:</b> ${esc((match.reasons || []).join(' · ') || '공통 키워드 기반')}</p>
            <details><summary style="cursor:pointer;font-weight:700;">확인된 원인·대책 보기</summary>
              <div style="font-size:.75rem;line-height:1.55;margin-top:8px;">
                <b>원인:</b><pre style="white-space:pre-wrap;overflow-wrap:anywhere;">${esc(JSON.stringify(match.rootCauses || {}, null, 2))}</pre>
                <b>영구대책:</b><ul>${(match.countermeasures || []).map(item => `<li>${esc(countermeasureText(item))}</li>`).join('') || '<li>등록된 대책 없음</li>'}</ul>
              </div>
            </details>
          </section>`).join('') : '<div class="card" style="padding:18px;">비교 가능한 종결 Case가 아직 없습니다. Case가 종결되면 자동으로 검색 대상에 포함됩니다.</div>'}
      `;
    } catch (error) {
      container.innerHTML = `<h3>유사 Case 검색 실패</h3><p>${esc(error.message)}</p><button class="btn btn-secondary" onclick="closeModal()">닫기</button>`;
    }
    if (global.lucide) global.lucide.createIcons();
  }

  global.openSimilarCaseRecommendations = openSimilarCaseRecommendations;
})(window);
