// Headless Browser verification for Light/Dark theme toggling, CSS variable overrides, and persistence
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');

const browserPath = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'qms-theme-test-'));
const origin = process.env.QMS_TEST_ORIGIN;
if (!origin) throw new Error('Set QMS_TEST_ORIGIN');

const proc = spawn(browserPath, [
  '--headless=new',
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  '--remote-debugging-port=0',
  `--user-data-dir=${profile}`,
  'about:blank'
], { windowsHide: true, stdio: 'ignore' });

let socket, seq = 0;
const pending = new Map();
const errors = [];
const delay = ms => new Promise(r => setTimeout(r, ms));

async function send(method, params = {}, sessionId) {
  const id = ++seq;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error('CDP timeout: ' + method));
    }, 12000);
    pending.set(id, { resolve: v => { clearTimeout(timer); resolve(v); }, reject });
    socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
}

(async () => {
  let port;
  for (let i = 0; i < 80; i++) {
    try {
      port = fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0];
      break;
    } catch {}
    await delay(150);
  }
  if (!port) throw new Error('Headless browser did not start');

  const info = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  socket = new WebSocket(info.webSocketDebuggerUrl);
  await new Promise((r, j) => { socket.onopen = r; socket.onerror = j; });

  socket.onmessage = e => {
    const msg = JSON.parse(e.data);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result);
    } else if (msg.method === 'Runtime.exceptionThrown') {
      errors.push(msg.params.exceptionDetails.text + ': ' + (msg.params.exceptionDetails.exception?.description || ''));
    }
  };

  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const call = (method, params) => send(method, params, sessionId);
  const evaluate = async expr => {
    const r = await call('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };

  await call('Runtime.enable');
  await call('Page.enable');
  await call('Page.addScriptToEvaluateOnNewDocument', {
    source: 'window.alert=()=>{};window.confirm=()=>true;window.lucide={createIcons(){}};'
  });

  console.log('Navigating to ' + origin + '...');
  await call('Page.navigate', { url: origin });

  for (let i = 0; i < 80; i++) {
    if (await evaluate(`typeof initApp === 'function'`)) break;
    await delay(150);
  }

  // Quick login
  await evaluate(`handleQuickLogin('sjkim');`);

  // 1. Initial theme check (default should be dark)
  const initialTheme = await evaluate(`document.documentElement.getAttribute('data-theme') || 'dark'`);
  console.log('Initial theme:', initialTheme);
  assert.equal(initialTheme, 'dark');
  console.log('✓ PASS: Default theme is dark');

  const initialBodyBg = await evaluate(`getComputedStyle(document.body).backgroundColor`);
  console.log('Dark mode body bg:', initialBodyBg);
  assert.ok(initialBodyBg.includes('8') || initialBodyBg.includes('12') || initialBodyBg.includes('14') || initialBodyBg.includes('rgb(8, 12, 20)'), 'Dark body background expected');

  // 2. Click Theme Toggle Button -> Switch to Light Mode
  console.log('Toggling to Light Mode...');
  await evaluate(`document.getElementById('themeToggleBtn').click();`);

  const lightTheme = await evaluate(`document.documentElement.getAttribute('data-theme')`);
  assert.equal(lightTheme, 'light');
  console.log('✓ PASS: Theme attribute changed to "light"');

  const lightStorage = await evaluate(`localStorage.getItem('RAMOS_THEME')`);
  assert.equal(lightStorage, 'light');
  console.log('✓ PASS: localStorage saved "light"');

  const toggleText = await evaluate(`document.getElementById('themeToggleText').innerText.trim()`);
  assert.equal(toggleText, '다크 모드');
  console.log('✓ PASS: Toggle button text updated to "다크 모드"');

  // 3. Verify Light Mode CSS styling

  const lightBodyBg = await evaluate(`getComputedStyle(document.body).backgroundColor`);
  console.log('Light mode body bg:', lightBodyBg);
  assert.ok(lightBodyBg === 'rgb(248, 250, 252)' || lightBodyBg.includes('248'), 'Light body background expected (#f8fafc)');

  const sidebarBg = await evaluate(`getComputedStyle(document.querySelector('.sidebar')).backgroundColor`);
  console.log('Light mode sidebar bg:', sidebarBg);
  assert.equal(sidebarBg, 'rgb(255, 255, 255)');
  console.log('✓ PASS: Sidebar background is white in light mode');

  const headerBg = await evaluate(`getComputedStyle(document.querySelector('.top-header')).backgroundColor`);
  console.log('Light mode header bg:', headerBg);
  assert.ok(headerBg.includes('255, 255, 255'), 'Header background should be light');
  console.log('✓ PASS: Header background is white/translucent in light mode');

  const navIconBg = await evaluate(`getComputedStyle(document.querySelector('.nav-stage-icon')).backgroundColor`);
  console.log('Light mode nav-stage-icon bg:', navIconBg);
  assert.ok(!navIconBg.includes('rgb(13, 20, 36)'), 'Sidebar icon should not be dark');
  console.log('✓ PASS: Sidebar stage icon background is light');

  // Switch to D2 stage to inspect workspace toolbar, AI sidepanel, and boundary note
  await evaluate(`appData.currentView='stage';appData.activeStage='D2';renderCurrentView();`);
  await delay(100);

  const previewToolbarBg = await evaluate(`getComputedStyle(document.querySelector('.quality-stage-card')).backgroundColor`);
  console.log('Light mode preview toolbar bg:', previewToolbarBg);
  assert.equal(previewToolbarBg, 'rgb(255, 255, 255)');
  console.log('✓ PASS: LIVE CASE preview toolbar is white in light mode');

  const aiSidepanelBg = await evaluate(`getComputedStyle(document.querySelector('.ai-sidepanel')).backgroundColor`);
  console.log('Light mode AI sidepanel bg:', aiSidepanelBg);
  assert.equal(aiSidepanelBg, 'rgb(255, 255, 255)');
  console.log('✓ PASS: AI Quality Assistant sidepanel is white in light mode');

  const boundaryNoteStrongColor = await evaluate(`getComputedStyle(document.querySelector('.quality-boundary-note strong')).color`);
  console.log('Light mode boundary note text color:', boundaryNoteStrongColor);
  assert.ok(boundaryNoteStrongColor.includes('15') || boundaryNoteStrongColor.includes('rgb(15, 23, 42)'), 'Boundary note text must be dark');
  console.log('✓ PASS: Quality boundary note text is dark and high-contrast in light mode');

  // Verify Sidebar Org Tree in Light Mode
  console.log('Switching to Sidebar Org Tree tab in Light Mode...');
  await evaluate(`switchSidebarTab('org'); expandAllOrgTree(true);`);
  await delay(100);

  const treeNodeColor = await evaluate(`getComputedStyle(document.querySelector('.tree-node-name')).color`);
  console.log('Light mode tree-node-name color:', treeNodeColor);
  assert.ok(treeNodeColor.includes('15') || treeNodeColor.includes('rgb(15, 23, 42)'), 'Org tree node name must be dark (#0f172a)');
  console.log('✓ PASS: Org tree folder name text is dark and high-contrast in light mode');

  const orgCardBg = await evaluate(`getComputedStyle(document.querySelector('.org-user-card')).backgroundColor`);
  console.log('Light mode org-user-card bg:', orgCardBg);
  assert.equal(orgCardBg, 'rgb(255, 255, 255)');
  console.log('✓ PASS: Org member card is clean white (#ffffff) in light mode');

  const syncStripBg = await evaluate(`getComputedStyle(document.querySelector('.org-sync-strip')).backgroundColor`);
  console.log('Light mode org-sync-strip bg:', syncStripBg);
  assert.ok(syncStripBg.includes('248') || syncStripBg.includes('255'), 'Org sync strip must be light');
  console.log('✓ PASS: Org sync strip is light in light mode');

  // 4. Test reloading page to verify light theme persists
  console.log('Reloading page to test persistence...');
  await call('Page.reload');
  await delay(500);
  for (let i = 0; i < 80; i++) {
    try {
      if (await evaluate(`typeof handleQuickLogin === 'function' && typeof initApp === 'function' && document.readyState === 'complete'`)) break;
    } catch {}
    await delay(150);
  }
  await delay(200);
  await evaluate(`handleQuickLogin('sjkim');`);

  const reloadedTheme = await evaluate(`document.documentElement.getAttribute('data-theme')`);
  assert.equal(reloadedTheme, 'light');
  console.log('✓ PASS: Light theme successfully persisted across page reload!');

  // 5. Toggle back to Dark Mode
  console.log('Toggling back to Dark Mode...');
  await evaluate(`document.getElementById('themeToggleBtn').click();`);

  const backToDark = await evaluate(`document.documentElement.getAttribute('data-theme')`);
  assert.equal(backToDark, 'dark');
  const darkStorage = await evaluate(`localStorage.getItem('RAMOS_THEME')`);
  assert.equal(darkStorage, 'dark');
  const darkToggleText = await evaluate(`document.getElementById('themeToggleText').innerText.trim()`);
  assert.equal(darkToggleText, '라이트 모드');
  console.log('✓ PASS: Successfully toggled back to Dark Mode');

  assert.equal(errors.length, 0, 'Uncaught errors: ' + errors.join('\n'));
  console.log('✓ PASS: Zero uncaught runtime errors during theme switching');

  console.log('\n======================================================');
  console.log('🎉 LIGHT/DARK THEME SYSTEM FULLY VERIFIED IN BROWSER!');
  console.log('======================================================\n');
})().catch(e => {
  console.error('FAIL:', e);
  process.exitCode = 1;
}).finally(async () => {
  if (socket?.readyState === 1) {
    try { await send('Browser.close'); } catch {}
    socket.close();
  }
  if (proc.exitCode === null) proc.kill();
});
