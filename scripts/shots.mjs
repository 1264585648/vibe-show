// Capture cover screenshots for showcase projects into web/public/shots/{prefix}.png.
// Usage: node scripts/shots.mjs [prefix ...]   (defaults to every project in the live /api/showcase)
// Requires a local Chrome. Override the path with CHROME=/path/to/chrome.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const chrome =
  process.env.CHROME ||
  ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome']
    .find((p) => fs.existsSync(p));
if (!chrome) throw new Error('Chrome not found; set CHROME=/path/to/chrome');

const outDir = path.resolve('web/public/shots');
fs.mkdirSync(outDir, { recursive: true });
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-shots-'));

const res = await fetch('https://vibe-show.com/api/showcase');
const { items } = await res.json();
const wanted = process.argv.slice(2);
const targets = items.filter((it) => !wanted.length || wanted.includes(it.prefix));

for (const it of targets) {
  const out = path.join(outDir, `${it.prefix}.png`);
  try {
    execFileSync(chrome, [
      '--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars',
      `--user-data-dir=${profile}`, '--window-size=1200,750', '--virtual-time-budget=8000',
      `--screenshot=${out}`, it.origin_url
    ], { stdio: 'ignore', timeout: 60_000 });
    console.log('ok  ', it.prefix, '<-', it.origin_url);
  } catch (e) {
    console.log('fail', it.prefix, e.message);
  }
}
fs.rmSync(profile, { recursive: true, force: true });
