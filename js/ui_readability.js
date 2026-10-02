/* Presentation only: preserve business data, permissions, approvals and theme preference. */
(() => {
  const mobile = window.matchMedia('(max-width: 900px)');
  let scheduled = false;
  function setMenuOpen(open) {
    document.body.dataset.sidebarOpen = String(open);
    const button = document.getElementById('mobileNavToggle');
    if (button) { button.setAttribute('aria-expanded', String(open)); button.textContent = open ? '메뉴 닫기' : '메뉴'; }
  }
  window.toggleNavigationMenu = () => setMenuOpen(document.body.dataset.sidebarOpen !== 'true');
  window.closeNavigationMenu = () => setMenuOpen(false);
  function enhanceContent() {
    scheduled = false;
    for (const area of document.querySelectorAll('#mainContentContainer,#modalContainer,#documentViewerContainer,#stageReviewModalBackdrop,.sidebar,.top-header,#loginScreen')) {
      for (const table of area.querySelectorAll('table')) {
        if (table.parentElement.classList.contains('qms-table-scroll')) continue;
        const wrapper = document.createElement('div');
        wrapper.className = 'qms-table-scroll' + (table.closest('.report-paper,.stage-report-paper') ? ' qms-paper-table' : '');
        wrapper.tabIndex = 0;
        wrapper.setAttribute('role', 'region');
        wrapper.setAttribute('aria-label', '표 내용 — 좌우로 스크롤하여 전체 열 보기');
        table.before(wrapper);
        wrapper.append(table);
      }
      for (const element of area.querySelectorAll('*')) {
        if (element.closest('svg,.sr-only') || element.classList.contains('qms-small-text')) continue;
        if (![...element.childNodes].some(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim())) continue;
        if (parseFloat(getComputedStyle(element).fontSize) < 12) element.classList.add('qms-small-text');
      }
    }
  }
  function scheduleEnhancement() {
    if (!scheduled) { scheduled = true; queueMicrotask(enhanceContent); }
  }
  function init() {
    setMenuOpen(false);
    document.querySelector('.sidebar').addEventListener('click', event => {
      if (mobile.matches && event.target.closest('.nav-item')) setMenuOpen(false);
    });
    mobile.addEventListener('change', () => setMenuOpen(false));
    const observer = new MutationObserver(scheduleEnhancement);
    observer.observe(document.body, { childList:true, subtree:true });
    enhanceContent();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
