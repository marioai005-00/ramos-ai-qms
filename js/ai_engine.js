/* RAMOS AI-QMS Dual AI Engine Adapter (Groq LPU + Google Gemini Multimodal) */
(function(global) {
  'use strict';

  const AI_STATUS_ENDPOINT = '/__api__/ai/status';
  const AI_DISPATCH_ENDPOINT = '/__api__/ai/dispatch';

  let cachedStatus = {
    checked: false,
    available: false,
    groqAvailable: false,
    geminiAvailable: false,
    activeEngines: []
  };

  async function checkAIEngineStatus() {
    try {
      const res = await fetch(AI_STATUS_ENDPOINT, { method: 'GET', cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        cachedStatus = {
          checked: true,
          available: (data.activeEngines || []).length > 0,
          groqAvailable: Boolean(data.groq?.available),
          geminiAvailable: Boolean(data.gemini?.available),
          activeEngines: data.activeEngines || []
        };
        updateHeaderBadge();
        return cachedStatus;
      }
    } catch (e) {
      // Local server not running or API offline - fallback to simulated mode
    }
    cachedStatus = {
      checked: true,
      available: false,
      groqAvailable: false,
      geminiAvailable: false,
      activeEngines: []
    };
    updateHeaderBadge();
    return cachedStatus;
  }

  async function queryAI({ prompt, systemPrompt = '', task = 'quick_draft', engine = 'auto', imageBase64 = '', attachments = [] }) {
    if (!cachedStatus.checked) {
      await checkAIEngineStatus();
    }

    if (!cachedStatus.available) {
      return { success: false, fallback: true, error: '외부 AI 키(.env의 GEMINI_API_KEY 또는 GROQ_API_KEY)가 설정되지 않아 문서 내용을 읽지 못했습니다. 값을 직접 입력해 주세요.' };
    }

    try {
      const payload = { prompt, systemPrompt, task, engine, imageBase64 };
      if (Array.isArray(attachments) && attachments.length) payload.attachments = attachments;
      const res = await fetch(AI_DISPATCH_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const data = await res.json();
        return data;
      }
      return { success: false, fallback: true, error: `HTTP ${res.status}` };
    } catch (e) {
      return { success: false, fallback: true, error: e.message };
    }
  }

  function renderAIEngineBadgeHTML() {
    const groq = cachedStatus.groqAvailable;
    const gemini = cachedStatus.geminiAvailable;

    if (!groq && !gemini) {
      return `<div class="ai-engine-status-badge offline" title="로컬 서버 미가동 시 내장 룰베이스 엔진으로 안전 작동합니다."><span class="ai-dot offline"></span> AI 룰베이스 엔진</div>`;
    }

    return `<div class="ai-engine-status-badge online" title="Groq(초고속 텍스트/5Why) 및 Gemini(멀티모달/비전) 활성화됨">
      <span class="ai-dot online"></span>
      <strong>DUAL AI ACTIVE</strong>
      ${groq ? '<span class="ai-badge-sub groq">Groq ⚡</span>' : ''}
      ${gemini ? '<span class="ai-badge-sub gemini">Gemini 👁️</span>' : ''}
    </div>`;
  }

  function updateHeaderBadge() {
    if (typeof document === 'undefined') return;
    const el = document.getElementById('headerAIEngineBadge');
    if (el) {
      el.innerHTML = renderAIEngineBadgeHTML();
    }
  }

  // Auto initialize on DOM ready
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        checkAIEngineStatus();
      });
    } else {
      setTimeout(checkAIEngineStatus, 100);
    }
  }

  global.RamosDualAI = {
    checkStatus: checkAIEngineStatus,
    query: queryAI,
    renderBadge: renderAIEngineBadgeHTML,
    updateBadge: updateHeaderBadge,
    getStatus: () => cachedStatus
  };

})(typeof window !== 'undefined' ? window : globalThis);
