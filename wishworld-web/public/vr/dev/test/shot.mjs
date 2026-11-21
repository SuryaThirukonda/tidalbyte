// Open a page in headless Chrome, optionally run some JavaScript in it, save a picture and print its console.
//
//   node shot.mjs <url> <out.png> [--wait "<js expression that becomes true>"] [--ms 1500]
//                 [--run "<js to run after the wait>"] [--after 800] [--size 1280x800] [--flag=--some-chrome-flag]
//
// Exit code 1 if the page logged an error.

import { launch, sleep } from './cdp.mjs';

const args = process.argv.slice(2);
const url = args[0];
const out = args[1];
if (!url || !out) {
  console.error('usage: node shot.mjs <url> <out.png> [--wait expr] [--ms n] [--run js] [--after n] [--size WxH]');
  process.exit(2);
}
const option = (name, fallback) => {
  const i = args.indexOf('--' + name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : fallback;
};
const flags = args.filter((a) => a.startsWith('--flag=')).map((a) => a.slice(7));
const [width, height] = option('size', '1280x800').split('x').map(Number);

const browser = await launch({ flags, width, height });
try {
  await browser.goto(url);
  const wait = option('wait', 'window.__harness && (window.__harness.ready || window.__harness.error)');
  await browser.until(wait, 60000);
  await sleep(Number(option('ms', 1500)));
  const run = option('run', '');
  if (run) {
    const value = await browser.evaluate(run);
    if (value !== undefined) console.log('run ->', JSON.stringify(value));
    await sleep(Number(option('after', 800)));
  }
  await browser.screenshot(out);
  for (const line of browser.lines) console.log(`[${line.level}] ${line.text}`);
  console.log(`saved ${out}; ${browser.errors().length} errors, ${browser.warnings().length} warnings`);
  process.exitCode = browser.errors().length ? 1 : 0;
} finally {
  await browser.close();
}
