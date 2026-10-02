// E2E Headless Browser verification for Sidebar navigation, two-line labels, and dynamic indicators
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');

const browserPath = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'qms-sidebar-test-'));
const origin = process.env.QMS_TEST_ORIGIN;
if (!origin) throw new Error('Set QMS_TEST_ORIGIN to the running server');

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
  const evaluate = async expression => {
    const r = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };

  await call('Runtime.enable');
  await call('Page.enable');
  await call('Page.addScriptToEvaluateOnNewDocument', {
    source: 'window.alert=msg=>{window.lastAlert=msg;console.log("ALERT:",msg);};window.confirm=()=>true;window.lucide={createIcons(){}};'
  });

  console.log('Navigating to ' + origin + '...');
  await call('Page.navigate', { url: origin });

  for (let i = 0; i < 80; i++) {
    if (await evaluate(`typeof initApp === 'function'`)) break;
    await delay(150);
  }

  // 1. Quick login as sjkim
  await evaluate(`handleQuickLogin('sjkim');`);
  assert.equal(await evaluate(`document.getElementById('loginScreen').style.display`), 'none');
  console.log('✓ PASS: Login successful');

  // 2. Check sidebar container and width
  const sidebarWidth = await evaluate(`getComputedStyle(document.querySelector('.sidebar')).width`);
  console.log(`Sidebar width measured: ${sidebarWidth}`);
  assert.equal(sidebarWidth, '315px', 'Sidebar width should be 315px');
  console.log('✓ PASS: Sidebar width is 315px');

  // 3. Check vertical stepper line (.nav-stage-flow)
  const hasFlow = await evaluate(`document.querySelector('.nav-stage-flow') !== null`);
  assert.ok(hasFlow, 'Must contain .nav-stage-flow container');
  console.log('✓ PASS: .nav-stage-flow stepper container exists');

  // 4. Verify all 8 stages structure (Main Title + Sub Description)
  const expectedStages = [
    { stage: 'D1', main: 'D1. Cross-Functional Team', sub: 'CFT / 역할·책임 구성' },
    { stage: 'D2', main: 'D2. Problem Description', sub: '5W2H / 현상 규명' },
    { stage: 'D3', main: 'D3. Interim Containment Action', sub: 'ICA / 긴급 유출방지' },
    { stage: 'D4', main: 'D4. Root Cause & Escape Cause', sub: '5-Why & FA' },
    { stage: 'D5', main: 'D5. Permanent Corrective Action', sub: 'PCA' },
    { stage: 'D6', main: 'D6. Implementation & Validation', sub: '효과 검증' },
    { stage: 'D7', main: 'D7. Prevent Recurrence', sub: '재발방지 / 수평전개' },
    { stage: 'D8', main: 'D8. Closure & Recognition', sub: '최종 종결' }
  ];

  const actualStages = await evaluate(`
    Array.from(document.querySelectorAll('.nav-stage-item')).map(el => ({
      stage: el.getAttribute('data-stage'),
      main: el.querySelector('.nav-stage-main')?.innerText.trim(),
      sub: el.querySelector('.nav-stage-sub')?.innerText.trim()
    }))
  `);

  assert.equal(actualStages.length, 8, 'Must have exactly 8 stage items');
  for (let i = 0; i < 8; i++) {
    const exp = expectedStages[i];
    const act = actualStages[i];
    assert.equal(act.stage, exp.stage, `Stage mismatch at index ${i}`);
    assert.equal(act.main, exp.main, `Main title mismatch for ${exp.stage}`);
    assert.equal(act.sub, exp.sub, `Sub description mismatch for ${exp.stage}`);
    console.log(`✓ PASS: ${exp.stage} -> [${act.main}] / [${act.sub}]`);
  }

  // 5. Verify dynamic status indicators for default benchmark case
  const indicators = await evaluate(`
    ['D1','D2','D3','D4','D5','D6','D7','D8'].map(stage => {
      const el = document.getElementById('stageIndicator-' + stage);
      const span = el?.querySelector('.stage-badge-indicator');
      return {
        stage,
        text: span?.innerText.trim(),
        className: span?.className || ''
      };
    })
  `);

  console.log('Stage indicators measured for full benchmark case:', JSON.stringify(indicators));
  for (let i = 0; i < 8; i++) {
    assert.ok(indicators[i].className.includes('completed'), `${expectedStages[i].stage} should be completed in full D1~D8 case`);
    assert.equal(indicators[i].text, '✓', `${expectedStages[i].stage} should display checkmark in full D1~D8 case`);
  }
  console.log('✓ PASS: Master benchmark case status indicators (D1~D8: ✓) match 100% completed state!');

  // 6. Test navigation & active highlight
  await evaluate(`switchStage('D1');`);
  assert.equal(await evaluate(`appData.activeStage`), 'D1');
  const d1IsActive = await evaluate(`document.querySelector('[data-stage="D1"]').classList.contains('active')`);
  assert.ok(d1IsActive, 'D1 should have .active class');
  console.log('✓ PASS: switchStage("D1") highlights D1 menu item');

  await evaluate(`switchStage('D3');`);
  assert.equal(await evaluate(`appData.activeStage`), 'D3');
  const d3IsActive = await evaluate(`document.querySelector('[data-stage="D3"]').classList.contains('active')`);
  assert.ok(d3IsActive, 'D3 should have .active class');
  console.log('✓ PASS: switchStage("D3") highlights D3 menu item');

  await evaluate(`window.lastAlert = null; switchStage('D4');`);
  const activeStageD4 = await evaluate(`appData.activeStage`);
  assert.equal(activeStageD4, 'D4');
  const d4IsActive = await evaluate(`document.querySelector('[data-stage="D4"]').classList.contains('active')`);
  assert.ok(d4IsActive, 'D4 should have .active class');
  console.log('✓ PASS: switchStage("D4") highlights D4 menu item');

  await evaluate(`switchStage('D5');`);
  assert.equal(await evaluate(`appData.activeStage`), 'D5');
  console.log('✓ PASS: switchStage("D5") opens D5 freely on completed benchmark case');

  await evaluate(`switchStage('D8');`);
  assert.equal(await evaluate(`appData.activeStage`), 'D8');
  console.log('✓ PASS: switchStage("D8") opens D8 freely on completed benchmark case');

  // 7. Verify gated navigation (trying to jump to D5 before D4 is approved on an unapproved stage)
  await evaluate(`(function() {
    const c = getActiveCase();
    c.sourceIntakeId = 'TEST-INTAKE-LIVE';
    c.signOffHistory.D4 = { status: 'Draft' };
    c.d4.approval = { status: 'Draft', humanConfirmed: false };
    saveAppData();
    switchStage('D4');
    switchStage('D5');
  })()`);
  const stageAfterBlocked = await evaluate(`appData.activeStage`);
  assert.equal(stageAfterBlocked, 'D4', 'Should remain on D4 because D4 is unapproved');
  console.log('✓ PASS: Gated stage transition correctly blocks jumping to D5 before D4 approval');

  // Restore Case 1 full approval
  await evaluate(`(function() {
    const c = getActiveCase();
    delete c.sourceIntakeId;
    c.signOffHistory.D4 = { status: 'Approved' };
    c.d4.approval = { status: 'Approved', humanConfirmed: true };
    saveAppData();
  })()`);

  // 8. Test other navigation items
  await evaluate(`switchNav('dashboard');`);
  assert.equal(await evaluate(`appData.currentView`), 'dashboard');
  console.log('✓ PASS: switchNav("dashboard") activates dashboard item');

  await evaluate(`switchNav('actions-hub');`);
  assert.equal(await evaluate(`appData.currentView`), 'actions-hub');
  console.log('✓ PASS: Actions Hub renders correctly');

  // 9. Check no runtime errors
  assert.equal(errors.length, 0, 'Uncaught runtime errors:\n' + errors.join('\n'));
  console.log('✓ PASS: Zero uncaught runtime errors during entire browser lifecycle');

  console.log('\n=============================================');
  console.log('🎉 ALL SIDEBAR E2E BROWSER TESTS PASSED 100%!');
  console.log('=============================================\n');

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
