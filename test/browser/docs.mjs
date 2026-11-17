// Browser test for the docs site: builds it, serves it, and presses Run on every playground of every page in Chromium.
// Each run must show the result its page prints (the same rows, cell for cell, as the grid shows them), or, for an
// example marked docs:error, fail with its code. Fails on any page error or console error.
//
//   node test/browser/docs.mjs [--no-build]
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { createReadStream, existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, extname, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const BASE = '/smaltml-simd/';

if (!process.argv.includes('--no-build')) {
  execFileSync(join(root, 'node_modules/.bin/vitepress'), ['build', 'docs'], { cwd: root, stdio: 'inherit' });
}
const dist = join(root, 'docs/.vitepress/dist');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (!p.startsWith(BASE)) return res.writeHead(404).end();
  p = join(dist, p.slice(BASE.length));
  if (existsSync(p) && statSync(p).isDirectory()) p = join(p, 'index.html');
  if (!existsSync(p) && existsSync(p + '.html')) p += '.html';
  if (!existsSync(p)) return res.writeHead(404).end();
  res.writeHead(200, { 'content-type': TYPES[extname(p)] ?? 'application/octet-stream' });
  createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const site = `http://localhost:${server.address().port}${BASE}`;

/** The built pages that have playgrounds. */
function pages(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return f === 'assets' ? [] : pages(p);
    return f.endsWith('.html') && f !== '404.html' ? [p] : [];
  });
}

let failures = 0;
let runs = 0;
const check = (cond, msg) => {
  if (!cond) {
    console.log(`  FAIL ${msg}`);
    failures++;
  }
};

const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

for (const file of pages(dist)) {
  const path = relative(dist, file).replace(/\.html$/, '').replace(/(^|\/)index$/, '$1');
  await page.goto(site + path);
  const count = await page.locator('.sw-play').count();
  if (count === 0) continue;
  console.log(`${path || '(home)'}: ${count} playgrounds`);
  for (let i = 0; i < count; i++) {
    const play = page.locator('.sw-play').nth(i);
    // What the page prints under the example: its tested table, or the code it is tested to fail with.
    const expected = await play.evaluate((el) => {
      const result = el.querySelector('.sw-play-result');
      const fails = result.querySelector('.sw-play-fails code')?.textContent ?? null;
      const rows = [...result.querySelectorAll('table tr')].map((tr) => [...tr.children].map((c) => c.textContent.trim()));
      return { fails, rows };
    });
    await play.locator('[data-play="run"]').click();
    await page.waitForFunction((el) => !el.hasAttribute('aria-busy') && /ms|Error|No runner/.test(el.querySelector('.sw-play-status').textContent), await play.elementHandle(), { timeout: 30000 });
    runs++;
    const got = await play.evaluate((el) => {
      const result = el.querySelector('.sw-play-result');
      const error = result.querySelector('.sw-play-error');
      if (error) return { error: error.querySelector('strong')?.textContent ?? '', message: error.textContent };
      const head = [...result.querySelectorAll('.sk-grid thead th, [role="columnheader"]')].map((c) => c.textContent.trim());
      const body = [...result.querySelectorAll('.sk-grid tbody tr:not(.sk-grid-spacer), [role="row"]:has([role="gridcell"])')].map((tr) =>
        [...tr.querySelectorAll('td, [role="gridcell"]')].map((c) => c.textContent.trim()),
      );
      // The grid's first column numbers the rows.
      const numbered = head[0] === '#';
      return { head: numbered ? head.slice(1) : head, body: numbered ? body.map((r) => r.slice(1)) : body, note: result.querySelector('.sw-play-note')?.textContent ?? null };
    });
    const where = `${path} playground ${i + 1}`;
    if (expected.fails) {
      check(got.error === expected.fails, `${where}: should fail with ${expected.fails}, got ${JSON.stringify(got)}`);
      continue;
    }
    check(!('error' in got), `${where}: ${got.message}`);
    if ('error' in got) continue;
    const [head, ...rows] = expected.rows;
    if (!head) {
      check(got.note !== null, `${where}: printed no table, but the run showed one`);
      continue;
    }
    check(JSON.stringify(got.head) === JSON.stringify(head), `${where}: columns ${JSON.stringify(got.head)}, page prints ${JSON.stringify(head)}`);
    // A long printed result shows its first rows, then "… N more rows".
    const shown = rows.filter((r) => !/^… \d+ more rows$/.test(r[0]));
    check(
      JSON.stringify(got.body.slice(0, shown.length)) === JSON.stringify(shown),
      `${where}: rows ${JSON.stringify(got.body.slice(0, shown.length))}, page prints ${JSON.stringify(shown)}`,
    );
  }
}

check(errors.length === 0, `page errors: ${errors.join(' | ')}`);
console.log(`${runs} playgrounds run, ${failures} failures`);
await browser.close();
server.close();
process.exit(failures ? 1 : 0);
