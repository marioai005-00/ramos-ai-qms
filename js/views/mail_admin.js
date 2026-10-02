/* Notification mail: shows the server's SMTP settings (never the password), sends a test message, lists recent results. */
(function (global) {
  'use strict';
  const esc = value => qmsUiEscape(value ?? '');
  const statusLabels = { SENT: '발송됨', FAILED: '실패', DISABLED: '발송 꺼짐', NOT_CONFIGURED: '설정 필요', NO_RECIPIENT: '받는 사람 없음' };
  const statusTones = { SENT: 'success', FAILED: 'danger', DISABLED: 'neutral', NOT_CONFIGURED: 'warn', NO_RECIPIENT: 'warn' };

  function canUseMailAdmin() {
    return (CURRENT_USER?.roles || []).some(role => ['system_admin', 'quality_reviewer'].includes(role));
  }

  function render(status, message) {
    const row = (label, value) => `<div class="iq-info"><dt>${esc(label)}</dt><dd>${esc(value || '미설정')}</dd></div>`;
    return `
      <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border); padding-bottom:10px; margin-bottom:12px; gap:12px;">
        <div><h3 style="margin:0; font-size:1.05rem; font-weight:800;">알림 메일 설정 · 시험</h3>
          <p style="margin:2px 0 0; font-size:0.78rem; color:var(--text-secondary);">사내 알림 메일(SLA 기한 알림)만 보냅니다. 고객 보고서 송부는 포함되지 않습니다.</p></div>
        <button type="button" class="btn btn-secondary btn-sm" onclick="closeModal()">닫기</button>
      </div>
      <div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:10px;">
        <span class="qms-status-chip qms-tone-${status.ready ? 'success' : 'warn'}">${status.ready ? '발송 가능' : status.enabled ? '설정 부족' : '발송 꺼짐'}</span>
        <span class="qms-status-chip qms-tone-${status.testMode ? 'info' : 'danger'}">${status.testMode ? `시험 모드 · 모든 메일을 ${esc(status.testRecipient)}에게만 보냄` : '실제 발송 모드 · 대상자에게 직접 발송'}</span>
      </div>
      <dl class="iq-info-grid">${row('SMTP 서버', status.host ? `${status.host}:${status.port} (${status.security})` : '')}${row('로그인 계정', status.user)}${row('보내는 주소', status.sender)}
        ${row('비밀번호', status.passwordSet ? '설정됨' : '')}${row('SLA 메일 단계', status.slaLevels.join(', '))}</dl>
      ${status.missing.length ? `<div class="iq-note">.env에 다음 값을 넣고 서버를 다시 시작해야 합니다: ${status.missing.map(esc).join(', ')}</div>` : ''}
      ${!status.enabled ? '<div class="iq-note">.env에 QMS_MAIL_PROVIDER=SMTP, QMS_EXTERNAL_SEND_ENABLED=true 를 설정하고 서버를 다시 시작하면 발송이 켜집니다.</div>' : ''}
      ${message ? `<div class="${message.ok ? 'iq-success' : 'iq-error'}" role="status">${esc(message.text)}</div>` : ''}
      <div class="iq-actions"><button type="button" class="btn btn-primary" onclick="sendQmsTestMail(this)">시험 메일 1통 보내기</button><button type="button" class="btn btn-secondary" onclick="openMailAdminModal()">새로고침</button></div>
      <h3 style="font-size:0.9rem; margin:14px 0 6px;">최근 발송 기록 (${status.log.length})</h3>
      ${status.log.length ? `<div class="qms-table-scroll"><table class="iq-table"><thead><tr><th>시각</th><th>구분</th><th>제목</th><th>실제 수신</th><th>결과</th></tr></thead><tbody>${status.log.map(item => `<tr>
        <td class="num-mono">${esc(new Date(item.createdAt).toLocaleString('ko-KR', { hour12: false }))}</td><td>${esc(item.kind)}</td><td>${esc(item.subject)}</td>
        <td>${esc(item.actual.join(', '))}${item.testMode && item.intended.length ? `<small>원래 대상 ${item.intended.length}명</small>` : ''}</td>
        <td><span class="qms-status-chip qms-tone-${statusTones[item.status] || 'neutral'}">${esc(statusLabels[item.status] || item.status)}</span>${item.error ? `<small>${esc(item.error)}</small>` : ''}</td></tr>`).join('')}</tbody></table></div>`
        : renderQmsEmpty({ title: '발송 기록이 없습니다.', compact: true })}`;
  }

  async function openMailAdminModal(message) {
    if (!canUseMailAdmin()) { alert('메일 설정은 시스템 관리자와 품질 검토자만 볼 수 있습니다.'); return; }
    const modal = document.getElementById('globalModal'), container = document.getElementById('modalContainer');
    if (!modal || !container) return;
    try {
      const status = await QMSApi.request('/__api__/qms/mail/status');
      container.style.width = '820px'; container.style.maxWidth = '95vw';
      container.innerHTML = render(status, message);
      modal.style.display = 'flex';
      if (window.lucide) lucide.createIcons();
    } catch (error) {
      alert(`메일 설정을 불러오지 못했습니다. ${error.message}`);
    }
  }

  async function sendQmsTestMail(button) {
    if (button) button.disabled = true;
    let message;
    try {
      const result = await QMSApi.request('/__api__/qms/mail/test', { method: 'POST', body: {} });
      message = { ok: true, text: `시험 메일을 ${result.recipients.join(', ')}에게 보냈습니다. 받은편지함을 확인해 주세요.` };
    } catch (error) {
      message = { ok: false, text: `시험 메일을 보내지 못했습니다. ${error.message}` };
    }
    openMailAdminModal(message);
  }

  Object.assign(global, { openMailAdminModal, sendQmsTestMail, canUseMailAdmin });
})(typeof window !== 'undefined' ? window : globalThis);
