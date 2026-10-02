// Whole-product light-mode visual/contrast audit using the installed Edge browser.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const browserPath = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const origin = process.env.QMS_TEST_ORIGIN;
const outputDir = process.env.QMS_LIGHT_AUDIT_DIR || path.resolve('light_audit_after');
if (!origin) throw new Error('Set QMS_TEST_ORIGIN');
fs.mkdirSync(outputDir, { recursive: true });

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'qms-light-audit-'));
const proc = spawn(browserPath, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'
], { windowsHide: true, stdio: 'ignore' });

let socket;
let seq = 0;
const pending = new Map();
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function send(method, params = {}, sessionId) {
  const id = ++seq;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error('CDP timeout: ' + method));
    }, 15000);
    pending.set(id, {
      resolve: value => { clearTimeout(timer); resolve(value); },
      reject
    });
    socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
}

(async () => {
  let port;
  for (let i = 0; i < 100; i++) {
    try {
      port = fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0];
      break;
    } catch {}
    await delay(120);
  }
  if (!port) throw new Error('Headless browser did not start');

  const info = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  socket = new WebSocket(info.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = reject;
  });
  socket.onmessage = event => {
    const msg = JSON.parse(event.data);
    if (!msg.id || !pending.has(msg.id)) return;
    const task = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? task.reject(new Error(msg.error.message)) : task.resolve(msg.result);
  };

  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const call = (method, params) => send(method, params, sessionId);
  const evaluate = async expression => {
    const result = await call('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    }
    return result.result.value;
  };

  await call('Runtime.enable');
  await call('Page.enable');
  await call('Emulation.setDeviceMetricsOverride', {
    width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false
  });
  await call('Page.addScriptToEvaluateOnNewDocument', {
    source: `localStorage.setItem('RAMOS_THEME','light');window.alert=()=>{};window.confirm=()=>true;window.lucide={createIcons(){}};`
  });
  await call('Page.navigate', { url: origin });
  for (let i = 0; i < 100; i++) {
    if (await evaluate(`typeof initApp === 'function' && document.readyState !== 'loading'`)) break;
    await delay(120);
  }
  await evaluate(`handleQuickLogin('sjkim');applyTheme('light');`);
  await delay(300);

  const views = [
    ['dashboard', `switchNav('dashboard')`],
    ['new-case', `switchNav('new-case')`],
    ['intake-triage', `switchNav('intake-triage')`],
    ['cases-list', `switchNav('cases-list')`],
    ['evidence-hub', `switchNav('evidence-hub')`],
    ['actions-hub', `switchNav('actions-hub')`],
    ['reports-hub', `switchNav('reports-hub')`],
    ['supplier-portal', `switchNav('supplier-portal')`],
    ['mission-control', `switchNav('mission-control')`],
    ['agent-operations', `switchNav('agent-operations')`],
    ...['D1','D2','D3','D4','D5','D6','D7','D8'].map(stage => [
      'stage-' + stage, `appData.currentView='stage';appData.activeStage='${stage}';renderCurrentView()`
    ])
  ];

  const auditExpression = `(() => {
    const parse = value => {
      const m = String(value).match(/rgba?\\(([^)]+)\\)/);
      if (!m) return [0, 0, 0, 0];
      const p = m[1].split(',').map(Number);
      return [p[0], p[1], p[2], Number.isFinite(p[3]) ? p[3] : 1];
    };
    const blend = (front, back) => {
      const alpha = front[3] + back[3] * (1 - front[3]);
      if (!alpha) return [255,255,255,1];
      return [
        (front[0] * front[3] + back[0] * back[3] * (1 - front[3])) / alpha,
        (front[1] * front[3] + back[1] * back[3] * (1 - front[3])) / alpha,
        (front[2] * front[3] + back[2] * back[3] * (1 - front[3])) / alpha,
        alpha
      ];
    };
    const background = element => {
      const layers = [];
      for (let node = element; node && node.nodeType === 1; node = node.parentElement) {
        layers.push(parse(getComputedStyle(node).backgroundColor));
      }
      let result = [255,255,255,1];
      for (let i = layers.length - 1; i >= 0; i--) result = blend(layers[i], result);
      return result;
    };
    const lum = rgb => {
      const values = rgb.slice(0,3).map(v => {
        v /= 255;
        return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4);
      });
      return .2126 * values[0] + .7152 * values[1] + .0722 * values[2];
    };
    const ratio = (a, b) => {
      const x = lum(a), y = lum(b);
      return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
    };
    const selector = el => {
      const cls = [...el.classList].slice(0,2).join('.');
      return el.tagName.toLowerCase() + (el.id ? '#' + el.id : cls ? '.' + cls : '');
    };
    const visible = el => {
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) > .05 &&
        r.width > 1 && r.height > 1;
    };
    const hasOwnText = el => [...el.childNodes].some(node =>
      node.nodeType === Node.TEXT_NODE && node.textContent.trim()
    );
    const bad = [];
    for (const el of document.querySelectorAll('body *')) {
      if (!visible(el) || !hasOwnText(el)) continue;
      const s = getComputedStyle(el);
      const bg = background(el);
      if (el.matches('.report-watermark, .stage-report-watermark') ||
          s.backgroundImage.includes('gradient')) continue;
      const fg = blend(parse(s.color), bg);
      const size = parseFloat(s.fontSize);
      const bold = Number(s.fontWeight) >= 700;
      const required = size >= 24 || (bold && size >= 18.66) ? 3 : 4.5;
      const value = ratio(fg, bg);
      if (value + .02 < required) {
        bad.push({
          sel: selector(el),
          text: [...el.childNodes].filter(n => n.nodeType === Node.TEXT_NODE)
            .map(n => n.textContent.trim()).filter(Boolean).join(' ').slice(0,90),
          ratio: Number(value.toFixed(2)),
          required,
          fg: s.color,
          bg: 'rgb(' + bg.slice(0,3).map(Math.round).join(', ') + ')'
        });
      }
    }
    const dark = [];
    for (const el of document.querySelectorAll('main *, #mainContentContainer *')) {
      if (!visible(el)) continue;
      if (el.closest('.agent-terminal-box, .mission-terminal-container')) continue;
      const r = el.getBoundingClientRect();
      const bg = background(el);
      if (r.width >= 280 && r.height >= 40 && lum(bg) < .08) {
        const item = selector(el);
        if (!dark.includes(item)) dark.push(item);
      }
    }
    return { badCount: bad.length, darkCount: dark.length, bad: bad.slice(0,100), dark: dark.slice(0,40) };
  })()`;

  const report = {};
  for (const [name, action] of views) {
    await evaluate(action);
    if (name.startsWith('stage-')) {
      const expectedStage = name.slice(6);
      const rendered = await evaluate(`appData.currentView === 'stage' && appData.activeStage === '${expectedStage}' && Boolean(document.querySelector('.stage-workspace-grid'))`);
      if (!rendered) throw new Error('Stage visual audit did not render ' + expectedStage);
    }
    await delay(180);
    report[name] = await evaluate(auditExpression);
    const metrics = await call('Page.getLayoutMetrics');
    const width = Math.min(1800, Math.max(1200, Math.ceil(metrics.cssContentSize.width)));
    const height = Math.min(8000, Math.max(900, Math.ceil(metrics.cssContentSize.height)));
    const shot = await call('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
      fromSurface: true,
      clip: { x: 0, y: 0, width, height, scale: 1 }
    });
    fs.writeFileSync(path.join(outputDir, name + '.png'), Buffer.from(shot.data, 'base64'));
    console.log(`${name}: low-contrast=${report[name].badCount}, dark-surfaces=${report[name].darkCount}`);
  }

  fs.writeFileSync(path.join(outputDir, 'audit.json'), JSON.stringify(report, null, 2));
  const total = Object.values(report).reduce((sum, item) => sum + item.badCount, 0);
  console.log(`TOTAL low-contrast items: ${total}`);
  if (total) throw new Error('Light-mode contrast audit found ' + total + ' low-contrast text items');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  if (socket?.readyState === 1) {
    try { await send('Browser.close'); } catch {}
    socket.close();
  }
  if (proc.exitCode === null) proc.kill();
});
