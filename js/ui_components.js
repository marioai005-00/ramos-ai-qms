/* Shared presentation components. No business state, approval or persistence changes. */
function qmsUiEscape(value) { return String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;'); }
function qmsUiTone(value) { return ['neutral','info','success','warn','danger'].includes(value) ? value : 'neutral'; }
function renderQmsPageHeader({ title, description, icon = 'panels-top-left', actions = '', badges = [], reference = '', className = '' }) {
  const safeIcon = /^[a-z0-9-]+$/.test(icon) ? icon : 'panels-top-left';
  return `<header class="qms-page-header ${className}"><div class="qms-page-lead"><span class="qms-page-icon" aria-hidden="true"><i data-lucide="${safeIcon}"></i></span><div class="qms-page-copy"><h1>${qmsUiEscape(title)}</h1><p>${qmsUiEscape(description)}</p>${badges.length ? `<div class="qms-page-badges">${badges.map(item=>`<span class="qms-status-chip qms-tone-${qmsUiTone(item.tone)}">${qmsUiEscape(item.label)}</span>`).join('')}</div>` : ''}</div></div>${reference || actions ? `<div class="qms-page-actions">${reference ? `<span class="qms-case-reference num-mono">${qmsUiEscape(reference)}</span>` : ''}${actions}</div>` : ''}</header>`;
}
function renderQmsMetric({ label, value, note = '', tone = 'neutral', className = '' }) {
  return `<div class="qms-metric-card qms-tone-${qmsUiTone(tone)} ${className}"><span class="qms-metric-label">${qmsUiEscape(label)}</span><strong class="qms-metric-value num-mono">${qmsUiEscape(value)}</strong>${note ? `<small class="qms-metric-note">${qmsUiEscape(note)}</small>` : ''}</div>`;
}
function renderQmsEmpty({ title, description = '', icon = 'inbox', compact = false }) {
  return `<div class="qms-empty-state ${compact ? 'is-compact' : ''}"><i data-lucide="${/^[a-z0-9-]+$/.test(icon) ? icon : 'inbox'}" aria-hidden="true"></i><strong>${qmsUiEscape(title)}</strong>${description ? `<p>${qmsUiEscape(description)}</p>` : ''}</div>`;
}
// Timestamps shown and compared as local time are written as local time ("YYYY-MM-DD HH:MM").
// Writing the UTC clock here made every deadline start nine hours early in Korea.
function qmsLocalTimestamp(date = new Date()) {
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
