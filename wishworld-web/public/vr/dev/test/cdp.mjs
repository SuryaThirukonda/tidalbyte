// A very small driver for headless Chrome over the DevTools protocol. No packages: Node 22+ (built-in WebSocket).
// Used by the scripts beside it to open the harness, press things, read the console and take pictures.
//
//   const browser = await launch({ flags: ['--use-fake-device-for-media-stream'] });
//   await browser.goto('http://localhost:8103/vr/dev/harness.html?tab=calm');
//   await browser.evaluate('window.__harness.ready');
//   await browser.screenshot('out.png');
//   await browser.close();

import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Chrome first; Edge (the same engine and flags) if Chrome will not start on this machine. BROWSER overrides both.
const BROWSERS = [
  process.env.BROWSER,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean);

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function start(exe, profile, flags, width, height) {
  const child = spawn(exe, [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    '--enable-unsafe-swiftshader', `--window-size=${width},${height}`,
    '--no-first-run', '--no-default-browser-check', '--mute-audio',
    // keep frames and timers running at full speed even though nobody is looking at the window
    '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
    ...flags, 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  return new Promise((resolve, reject) => {
    let text = '';
    const timer = setTimeout(() => reject(new Error('the browser did not start in 20 s')), 20000);
    child.stderr.on('data', (chunk) => {
      text += chunk;
      const found = text.match(/DevTools listening on (ws:\/\/\S+)/);
      if (found) { clearTimeout(timer); resolve({ child, browserUrl: found[1] }); }
    });
    child.on('error', (err) => { clearTimeout(timer); reject(err); });
    child.on('exit', (code) => { clearTimeout(timer); reject(new Error('exited with code ' + code)); });
  });
}

export async function launch({ flags = [], width = 1280, height = 800 } = {}) {
  const profile = mkdtempSync(join(tmpdir(), 'ww-chrome-'));
  let started = null;
  const problems = [];
  for (const exe of BROWSERS) {
    try {
      started = await start(exe, profile, flags, width, height);
      break;
    } catch (err) {
      problems.push(`${exe}: ${err.message}`);
    }
  }
  if (!started) throw new Error('No browser would start.\n' + problems.join('\n'));
  const { child, browserUrl } = started;

  const port = new URL(browserUrl).port;
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = targets.find((t) => t.type === 'page');
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });

  let nextId = 0;
  const waiting = new Map();
  const lines = [];   // { level, text, at } for everything the page printed or threw

  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const entry = waiting.get(message.id);
      waiting.delete(message.id);
      if (!entry) return;
      if (message.error) entry.reject(new Error(message.error.message));
      else entry.resolve(message.result);
      return;
    }
    if (message.method === 'Runtime.consoleAPICalled') {
      const p = message.params;
      const text = p.args.map((a) => (a.value !== undefined ? String(a.value) : a.description || a.type)).join(' ');
      lines.push({ level: p.type === 'warning' ? 'warn' : p.type, text, at: Date.now() });
    } else if (message.method === 'Runtime.exceptionThrown') {
      const d = message.params.exceptionDetails;
      lines.push({ level: 'error', text: 'Uncaught: ' + ((d.exception && d.exception.description) || d.text), at: Date.now() });
    } else if (message.method === 'Log.entryAdded') {
      const e = message.params.entry;
      lines.push({ level: e.level === 'warning' ? 'warn' : e.level, text: `${e.text}${e.url ? ' (' + e.url + ')' : ''}`, at: Date.now() });
    }
  };

  // Every command gets an answer or fails after 30 s, so a stuck page ends a test instead of hanging it.
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => {
      if (waiting.delete(id)) reject(new Error(`the browser did not answer ${method} in 30 s`));
    }, 30000);
    timer.unref();
    waiting.set(id, {
      resolve: (value) => { clearTimeout(timer); resolve(value); },
      reject: (err) => { clearTimeout(timer); reject(err); },
    });
    try {
      socket.send(JSON.stringify({ id, method, params }));
    } catch (err) {
      waiting.delete(id);
      clearTimeout(timer);
      reject(err);
    }
  });

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Log.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  // Without this a headless page turns "hidden" after a few seconds and stops drawing frames
  // (requestAnimationFrame stalls, and the shell pauses itself), which makes tests fail at random.
  await send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await send('Page.bringToFront');

  async function evaluate(expression) {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
    if (result.exceptionDetails) {
      const d = result.exceptionDetails;
      throw new Error('evaluate failed: ' + ((d.exception && d.exception.description) || d.text));
    }
    return result.result.value;
  }

  return {
    lines,
    send,
    evaluate,
    async goto(url) { await send('Page.navigate', { url }); },
    /** Wait until an expression is truthy in the page. */
    async until(expression, timeoutMs = 30000, stepMs = 200) {
      const end = Date.now() + timeoutMs;
      for (;;) {
        const value = await evaluate(expression);
        if (value) return value;
        if (Date.now() > end) throw new Error('timed out waiting for: ' + expression);
        await sleep(stepMs);
      }
    },
    async screenshot(file) {
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(file, Buffer.from(shot.data, 'base64'));
      return file;
    },
    async mouse(type, x, y) {
      await send('Input.dispatchMouseEvent', {
        type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1,
      });
    },
    async click(x, y) {
      await this.mouse('mouseMoved', x, y);
      await this.mouse('mousePressed', x, y);
      await sleep(60);
      await this.mouse('mouseReleased', x, y);
    },
    errors() { return lines.filter((l) => l.level === 'error'); },
    warnings() { return lines.filter((l) => l.level === 'warn'); },
    async close() {
      // Whatever went wrong in the page is worth seeing even when a test stops early.
      for (const line of lines) if (line.level === 'error' && !line.shown) { line.shown = true; console.log(`  [page error] ${line.text}`); }
      try {
        await Promise.race([send('Browser.close'), sleep(3000)]);
      } catch { /* already gone */ }
      await sleep(300);
      if (child.exitCode === null) child.kill();
      await sleep(200);
      try { rmSync(profile, { recursive: true, force: true }); } catch { /* Chrome may still hold a file */ }
    },
  };
}
