const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');

const browserPath = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'qms-agent-test-'));
const origin = process.env.QMS_TEST_ORIGIN;
if (!origin) throw new Error('Set QMS_TEST_ORIGIN to the test server origin');

const proc = spawn(browserPath, [
  '--headless=new',
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  '--remote-debugging-port=0',
  `--user-data-dir=${profile}`,
  '--window-size=1600,2200',
  'about:blank'
], { windowsHide: true, stdio: 'ignore' });

let socket, seq = 0;
const pending = new Map();
const delay = ms => new Promise(r => setTimeout(r, ms));

async function send(method, params = {}, sessionId) {
  const id = ++seq;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error('CDP timeout: ' + method));
    }, 15000);
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
  if (!port) throw new Error('Headless browser port not found');

  const info = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  socket = new WebSocket(info.webSocketDebuggerUrl);
  await new Promise((r, j) => { socket.onopen = r; socket.onerror = j; });

  socket.onmessage = e => {
    const msg = JSON.parse(e.data);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result);
    }
  };

  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const call = (method, params) => send(method, params, sessionId);

  await call('Runtime.enable');
  await call('Page.enable');
  await call('Page.addScriptToEvaluateOnNewDocument', {
    source: 'window.alert=()=>{};window.confirm=()=>true;window.prompt=(msg,def)=>def||"Verified OK";'
  });
  await call('Page.navigate', { url: origin });

  for (let i = 0; i < 80; i++) {
    const r = await call('Runtime.evaluate', { expression: `typeof initApp === 'function'`, returnByValue: true });
    if (r.result?.value) break;
    await delay(150);
  }

  // Step 0: Quick Login as sjkim
  console.log('--- Step 0: Logging in as sjkim ---');
  await call('Runtime.evaluate', { expression: `handleQuickLogin('sjkim');` });
  await delay(400);

  // Step 1: Switch to Stage Workspace
  console.log('--- Step 1: Navigating to 8D Workspace ---');
  await call('Runtime.evaluate', { expression: `switchNav('stage');` });
  await delay(500);

  // Verify HUD mounted
  const hudExists = (await call('Runtime.evaluate', { expression: `Boolean(document.getElementById('agentAutonomousHud'))`, returnByValue: true })).result.value;
  assert.ok(hudExists, 'Autonomous Agent HUD should be mounted in the workspace');
  console.log('✓ PASS: Autonomous Agent HUD is prominently mounted');

  // Step 2: Reset Case to clean In Progress state for fresh 3-Sprint execution
  console.log('--- Step 2: Initializing Clean In-Progress Case for 3-Sprint Run ---');
  await call('Runtime.evaluate', { expression: `window.ramosAgent.resetToCleanSlate();` });
  await delay(300);

  // Capture Clean Slate Screenshot
  const outDirectory = path.resolve(__dirname, '..');
  const shotClean = await call('Page.captureScreenshot', { format: 'png' });
  const shotCleanPath = path.join(outDirectory, 'clean_slate_before_ai.png');
  fs.writeFileSync(shotCleanPath, Buffer.from(shotClean.data, 'base64'));
  console.log('✓ Clean slate screenshot saved to:', shotCleanPath);

  const cleanCheck = (await call('Runtime.evaluate', { expression: `
    (() => {
      const c = getActiveCase();
      return {
        teamCount: c.team?.length || 0,
        d2Statement: Boolean(c.d2?.problemStatement),
        d3MaterialFlowCount: c.d3?.materialFlow?.length || 0,
        d4ToolsCount: c.d4?.selectedTools?.length || 0,
        d5CandidatesCount: c.d5?.candidates?.length || 0,
        d6TestsCount: c.d6?.validationTests?.length || 0,
        d7UpdatesCount: c.d7?.systemUpdates?.length || 0,
        d8ChecklistCount: c.d8?.checklist?.length || 0
      };
    })()
  `, returnByValue: true })).result.value;
  console.log('✓ Clean State Metrics:', JSON.stringify(cleanCheck));
  assert.equal(cleanCheck.teamCount, 0, 'Team must be empty in clean state');
  assert.equal(cleanCheck.d2Statement, false, 'D2 Problem Statement must be empty in clean state');
  assert.equal(cleanCheck.d3MaterialFlowCount, 0, 'D3 Material Flow must be empty in clean state');

  const initialState = (await call('Runtime.evaluate', { expression: `window.ramosAgent.getPipelineState(getActiveCase())`, returnByValue: true })).result.value;
  assert.equal(initialState, 'IDLE', 'Pipeline state must be IDLE before launch');
  console.log('✓ PASS: Case reset to IDLE state ready for Sprint 1');

  // Step 3: Trigger Sprint 1 (D1 ~ D3)
  console.log('--- Step 3: Launching Sprint 1 (D1 ~ D3 Autonomous Synthesis) ---');
  await call('Runtime.evaluate', { expression: `
    window.ramosAgent.stepDelayMs = 50;
    window.ramosAgent.startPipeline();
  ` });

  let sprint1Done = false;
  for (let i = 0; i < 40; i++) {
    await delay(200);
    const state = (await call('Runtime.evaluate', { expression: `window.ramosAgent.getPipelineState(getActiveCase())`, returnByValue: true })).result.value;
    const isExec = (await call('Runtime.evaluate', { expression: `window.ramosAgent.isExecuting`, returnByValue: true })).result.value;
    console.log(`Poll [${i}]: state=${state}, isExecuting=${isExec}`);
    if (state === 'GATE_1_PENDING') {
      sprint1Done = true;
      break;
    }
  }
  if (!sprint1Done) {
    const logs = (await call('Runtime.evaluate', { expression: `window.ramosAgent.logs`, returnByValue: true })).result.value;
    console.log('Agent logs on failure:', JSON.stringify(logs, null, 2));
    const cInfo = (await call('Runtime.evaluate', { expression: `
      (() => {
        const c = getActiveCase();
        return {
          d1: isD1StageComplete(c),
          d2: isD2StageComplete(c),
          d3: isD3StageComplete(c),
          gate3D: c.gates?.gate3D?.status,
          reviewFrom: c.approvalReviewFrom,
          audit: c.approvalAudit?.map(a => ({ from: a.fromStage, reason: a.reason })),
          signD1: c.signOffHistory?.D1?.status
        };
      })()
    `, returnByValue: true })).result.value;
    console.log('Stage check on failure:', JSON.stringify(cInfo, null, 2));
  }
  assert.ok(sprint1Done, 'Sprint 1 must complete and transition to GATE_1_PENDING');
  console.log('✓ PASS: Sprint 1 completed and paused at GATE_1_PENDING');

  // Verify D1, D2, D3 data completeness & zero review errors
  const d1Check = (await call('Runtime.evaluate', { expression: `isD1StageComplete(getActiveCase())`, returnByValue: true })).result.value;
  const d2Check = (await call('Runtime.evaluate', { expression: `isD2StageComplete(getActiveCase())`, returnByValue: true })).result.value;
  const d3Check = (await call('Runtime.evaluate', { expression: `isD3StageComplete(getActiveCase())`, returnByValue: true })).result.value;
  assert.ok(d1Check, 'D1 must be complete');
  assert.ok(d2Check, 'D2 must be complete');
  assert.ok(d3Check, 'D3 must be complete');

  const gate3DError = (await call('Runtime.evaluate', { expression: `reportReviewError(getActiveCase(), 'gate3D')`, returnByValue: true })).result.value;
  assert.equal(gate3DError, '', 'gate3D review error must be empty string');
  console.log('✓ PASS: D1~D3 data complete, Gate 1 (3D Report) review validation passed (0 errors)');

  // Step 4: Human Approver executes Gate 1 Sign-Off (gate3D)
  console.log('--- Step 4: Human Approver signs Gate 1 (gate3D) & auto-triggers Sprint 2 ---');
  await call('Runtime.evaluate', { expression: `window.ramosAgent.executeHumanSignOff('gate3D');` });

  let sprint2Done = false;
  for (let i = 0; i < 50; i++) {
    await delay(200);
    const state = (await call('Runtime.evaluate', { expression: `window.ramosAgent.getPipelineState(getActiveCase())`, returnByValue: true })).result.value;
    if (state === 'GATE_2_PENDING') {
      sprint2Done = true;
      break;
    }
  }
  assert.ok(sprint2Done, 'Sprint 2 must complete and transition to GATE_2_PENDING');
  console.log('✓ PASS: Sprint 2 completed and paused at GATE_2_PENDING');

  // Verify D4, D5 data completeness & zero review errors
  const d4Check = (await call('Runtime.evaluate', { expression: `isD4StageComplete(getActiveCase())`, returnByValue: true })).result.value;
  const d5Check = (await call('Runtime.evaluate', { expression: `hasCurrentStageApproval(getActiveCase(), 'D5')`, returnByValue: true })).result.value;
  assert.ok(d4Check, 'D4 must be complete');
  assert.ok(d5Check, 'D5 must be complete');

  const gate5DError = (await call('Runtime.evaluate', { expression: `reportReviewError(getActiveCase(), 'gate5D')`, returnByValue: true })).result.value;
  assert.equal(gate5DError, '', 'gate5D review error must be empty string');
  console.log('✓ PASS: D4~D5 data complete, Gate 2 (5D Report) review validation passed (0 errors)');

  // Step 5: Human Approver executes Gate 2 Sign-Off (gate5D)
  console.log('--- Step 5: Human Approver signs Gate 2 (gate5D) & auto-triggers Sprint 3 ---');
  await call('Runtime.evaluate', { expression: `window.ramosAgent.executeHumanSignOff('gate5D');` });

  let sprint3Done = false;
  for (let i = 0; i < 60; i++) {
    await delay(200);
    const state = (await call('Runtime.evaluate', { expression: `window.ramosAgent.getPipelineState(getActiveCase())`, returnByValue: true })).result.value;
    if (state === 'GATE_3_PENDING') {
      sprint3Done = true;
      break;
    }
  }
  assert.ok(sprint3Done, 'Sprint 3 must complete and transition to GATE_3_PENDING');
  console.log('✓ PASS: Sprint 3 completed and paused at GATE_3_PENDING');

  // Verify D6, D7, D8 data completeness & zero review errors
  const d6Check = (await call('Runtime.evaluate', { expression: `hasCurrentStageApproval(getActiveCase(), 'D6')`, returnByValue: true })).result.value;
  const d7Check = (await call('Runtime.evaluate', { expression: `hasCurrentStageApproval(getActiveCase(), 'D7')`, returnByValue: true })).result.value;
  const d8Check = (await call('Runtime.evaluate', { expression: `hasCurrentStageApproval(getActiveCase(), 'D8')`, returnByValue: true })).result.value;
  assert.ok(d6Check, 'D6 must be complete');
  assert.ok(d7Check, 'D7 must be complete');
  assert.ok(d8Check, 'D8 must be complete');

  const gate8DError = (await call('Runtime.evaluate', { expression: `reportReviewError(getActiveCase(), 'gate8D')`, returnByValue: true })).result.value;
  assert.equal(gate8DError, '', 'gate8D review error must be empty string');
  console.log('✓ PASS: D6~D8 data complete, Gate 3 (8D Final Report) review validation passed (0 errors)');

  // Step 6: Executive Approver executes Gate 3 Sign-Off (gate8D)
  console.log('--- Step 6: Executive signs Gate 3 (gate8D) for official 8D closure ---');
  await call('Runtime.evaluate', { expression: `window.ramosAgent.executeHumanSignOff('gate8D');` });
  await delay(500);

  const finalCase = (await call('Runtime.evaluate', { expression: `getActiveCase().status`, returnByValue: true })).result.value;
  assert.equal(finalCase, 'Closed', 'Case status must be officially Closed');

  const finalState = (await call('Runtime.evaluate', { expression: `window.ramosAgent.getPipelineState(getActiveCase())`, returnByValue: true })).result.value;
  assert.equal(finalState, 'COMPLETED', 'Pipeline must be in COMPLETED state');
  console.log('✓ PASS: 8D Case is officially CLOSED with COMPLETED pipeline!');

  // Capture verification screenshots
  const outDir = path.resolve(__dirname, '..');
  const shot = await call('Page.captureScreenshot', { format: 'png' });
  const shotPath = path.join(outDir, 'autonomous_8d_agent_verified.png');
  fs.writeFileSync(shotPath, Buffer.from(shot.data, 'base64'));
  console.log(`✓ Verification screenshot saved to: ${shotPath}`);

  // Clean exit
  await send('Target.closeTarget', { targetId });
  socket.close();
  proc.kill();
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}

  console.log('\n================================================================');
  console.log('🎉 ALL 3-SPRINT AUTONOMOUS 8D AI AGENT E2E TESTS 100% PASSED! 🎉');
  console.log('================================================================\n');
  process.exit(0);
})().catch(err => {
  console.error('Test Execution Error:', err);
  proc.kill();
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
  process.exit(1);
});
