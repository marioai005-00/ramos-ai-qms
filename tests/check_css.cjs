const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const browserPath = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'qms-test-eval-'));
const proc = spawn(browserPath, ['--headless=new', '--disable-gpu', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank']);

setTimeout(async () => {
  const port = fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0];
  const info = await (await fetch('http://127.0.0.1:' + port + '/json/version')).json();
  const ws = new WebSocket(info.webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);
  let id = 0;
  function send(method, params = {}) {
    return new Promise(resolve => {
      const curId = ++id;
      const handler = e => {
        const msg = JSON.parse(e.data);
        if (msg.id === curId) { ws.removeEventListener('message', handler); resolve(msg.result); }
      };
      ws.addEventListener('message', handler);
      ws.send(JSON.stringify({ id: curId, method, params }));
    });
  }
  await send('Page.navigate', { url: process.env.QMS_TEST_ORIGIN });
  await new Promise(r => setTimeout(r, 1500));
  const res = await send('Runtime.evaluate', { expression: `
    (() => {
      document.documentElement.setAttribute('data-theme', 'light');
      return {
        bgAppHtml: getComputedStyle(document.documentElement).getPropertyValue('--bg-app').trim(),
        bgAppBody: getComputedStyle(document.body).getPropertyValue('--bg-app').trim(),
        bodyBg: getComputedStyle(document.body).backgroundColor,
        htmlAttr: document.documentElement.getAttribute('data-theme'),
        styleSheetsCount: document.styleSheets.length
      };
    })()
  `, returnByValue: true });
  console.log('Result:', JSON.stringify(res.result.value));
  proc.kill();
  process.exit(0);
}, 1000);
