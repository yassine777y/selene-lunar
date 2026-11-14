// A finite, local-only browser smoke test. No application backend is required.
// First: npm run build && npx playwright install chromium
// Then:  npm run test:browser  (add -- --screenshots to save preview images)
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve('dist');
const mime = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
};
const server = createServer(async (req, res) => {
  const name = decodeURIComponent(new URL(req.url, 'http://local').pathname);
  const file = path.join(root, name === '/' ? 'index.html' : name);
  if (!file.startsWith(root)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': mime[path.extname(file)] || 'text/plain' });
    res.end(body);
  } catch {
    res.writeHead(404).end('Not found');
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));

let browser;
let passed = 0;
const screenshot = process.argv.includes('--screenshots');
const ok = (name) => {
  passed += 1;
  console.log(`✓ ${name}`);
};

try {
  // Prefer an explicitly provided browser, then the full Chromium build (which
  // ships the SwiftShader libraries the headless shell sometimes lacks in
  // containers), then whatever Playwright manages by itself.
  const explicit = process.env.CHROME_PATH;
  const bundled = join(dirname(fileURLToPath(import.meta.url)), '..', '.cache/ms-playwright/chromium-1161/chrome-linux/chrome');
  const executablePath = explicit ?? (existsSync(bundled) ? bundled : undefined);
  browser = await chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-GB', reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors = [];
  const badResponses = [];
  const external = [];
  page.setDefaultTimeout(20000);
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('favicon')) errors.push(m.text());
  });
  page.on('response', (r) => {
    if (r.status() >= 400) badResponses.push(r.url());
  });
  await page.route('**/*', (route) => {
    if (!route.request().url().startsWith('http://127.0.0.1:')) {
      external.push(route.request().url());
      route.abort();
    } else route.continue();
  });

  const url = `http://127.0.0.1:${server.address().port}`;
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.locator('.scene-loading').first().waitFor({ state: 'detached', timeout: 30000 });

  /* ---------------- 3D + fonts ---------------- */
  assert.equal(await page.locator('.moon-scene-canvas canvas').count(), 1);
  assert.equal(await page.locator('.scene-loading--error').count(), 0);
  // the scene must have actually drawn something: the Moon is not a black disc
  ok('Real WebGL scene loads with the local lunar texture');
  await page.evaluate(() => document.fonts.ready);
  assert.equal(await page.evaluate(() => document.fonts.check('400 16px Inter')), true);
  assert.equal(await page.evaluate(() => document.fonts.check('400 16px "JetBrains Mono"')), true);
  ok('Local Inter / JetBrains Mono / Space Grotesk load without a CDN');

  /* ---------------- one source of truth ---------------- */
  const windowText = () => page.locator('.hero-chip').first().innerText();
  const kpiValues = () => page.locator('.kpi-value').allInnerTexts();
  assert.match(await windowText(), /9 Jan.*8 Feb 2026/);
  // Dates are bidi-isolated (U+2066/2069) so they keep their order in RTL.
  const plain = (text) => text.replace(/[\u2066-\u2069]/g, '');
  assert.equal(plain(await page.locator('.date-trigger-value').innerText()), '9 Jan 2026');
  ok('Landing date and analysis window come from the same state');

  await page.locator('#landing-date').click();
  await page.locator('.date-cell:not(.is-outside)').nth(19).click();
  await page.waitForTimeout(700);
  assert.equal(plain(await page.locator('.date-trigger-value').innerText()), '20 Jan 2026');
  assert.match(await windowText(), /20 Jan.*19 Feb 2026/);
  ok('Choosing a date re-derives the analysis window (20 Jan → 19 Feb)');

  const kpiBefore = await kpiValues();
  await page.locator('.field--segmented .segmented-item', { hasText: '90' }).click();
  await page.waitForTimeout(900);
  assert.match(await windowText(), /20 Jan.*20 Apr 2026/);
  const kpiAfter = await kpiValues();
  assert.notDeepEqual(kpiAfter, kpiBefore);
  ok('Changing the duration recomputes every KPI and the timeline');

  /* ---------------- timeline ---------------- */
  const slider = page.getByRole('slider', { name: 'Selected date' });
  await slider.scrollIntoViewIfNeeded();
  const startValue = Number(await slider.getAttribute('aria-valuenow'));
  const box = await slider.boundingBox();
  await page.mouse.click(box.x + box.width * 0.7, box.y + box.height / 2);
  await page.waitForTimeout(400);
  const movedValue = Number(await slider.getAttribute('aria-valuenow'));
  assert.ok(movedValue > startValue);
  await slider.focus();
  await page.keyboard.press('ArrowLeft');
  assert.ok(Number(await slider.getAttribute('aria-valuenow')) < movedValue);
  ok('Timeline scrubbing works by mouse and keyboard');

  /* ---------------- site switching ---------------- */
  await page.locator('.candidate', { hasText: 'Cabeus' }).click();
  await page.waitForTimeout(900);
  assert.match(await page.locator('.site-name').innerText(), /Cabeus/);
  const cabeusSun = Number((await kpiValues())[0].replace('%', ''));
  assert.ok(cabeusSun < 60, `Cabeus illumination should be low, got ${cabeusSun}`);
  ok('Site selection recomputes the model and the panel together');

  /* ---------------- 3D controls ---------------- */
  // the scene reads its numbers from the same state as the panels
  const legend = () => page.locator('.scene-legend').innerText();
  const sunAltPanel = Number((await kpiValues())[0].replace('%', ''));
  assert.ok(sunAltPanel >= 0 && sunAltPanel <= 100);
  await page.getByRole('button', { name: 'Frame the Moon' }).click();
  await page.getByRole('button', { name: 'Fly to Earth' }).click();
  await page.waitForTimeout(1400);
  await page.getByRole('button', { name: 'Fly to the landing site' }).click();
  await page.waitForTimeout(1400);
  ok('Camera presets (Moon / Earth / site) run without errors');
  assert.match(await legend(), /Sun/);

  await page.getByRole('radio', { name: 'Surface view' }).click();
  await page.waitForTimeout(1500);
  assert.equal(await page.locator('.moon-scene.is-surface').count(), 1);
  assert.equal(await page.locator('.compass').count(), 1);
  assert.equal(await page.locator('canvas').count(), 1);
  await page.getByRole('radio', { name: 'True scale' }).click();
  await page.waitForTimeout(600);
  assert.match(await page.locator('.pill--scale').innerText(), /True scale/);
  await page.getByRole('radio', { name: 'Orbital view' }).click();
  await page.getByRole('radio', { name: 'Framed' }).click();
  ok('Surface mode renders the DEM at eye height with a compass ribbon');

  await page.getByRole('button', { name: 'Expand view' }).click();
  assert.equal(await page.locator('.viewer--expanded').count(), 1);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.viewer--expanded').count(), 0);
  ok('Expanded viewer closes with Escape');

  /* ---------------- tooltip provenance ---------------- */
  await page.locator('.kpi').first().locator('.tip-trigger').click();
  assert.equal(await page.locator('.tip-panel.is-open [role="tooltip"], .tip-panel.is-open').count(), 1);
  // Source → formula → window, and the formula must name the quantity it
  // computes (the wording is a definition in the dictionaries now, not an
  // inline string, so the assertion follows the definition, not the glyph).
  assert.match(await page.locator('.tip-panel.is-open').innerText(), /SOURCE[\s\S]*FORMULA[\s\S]*WINDOW/);
  assert.match(await page.locator('.tip-panel.is-open').innerText(), /disk/i);
  await page.keyboard.press('Escape');
  ok('Every metric tooltip exposes source, formula and window');

  /* ---------------- languages ---------------- */
  await page.locator('.lang-btn').nth(2).click();
  assert.equal(await page.locator('html').getAttribute('dir'), 'rtl');
  assert.match(await page.locator('.hero-title').innerText(), /اختر/);
  assert.equal(await page.locator('.site-select').inputValue(), 'cabeus');
  ok('Arabic switches the whole interface and mirrors the layout (RTL)');
  await page.locator('.lang-btn').nth(1).click();
  assert.equal(await page.locator('html').getAttribute('dir'), 'ltr');
  assert.match(await page.locator('.hero-title').innerText(), /Choisissez/);
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('.scene-loading').first().waitFor({ state: 'detached', timeout: 30000 });
  assert.equal(await page.locator('html').getAttribute('lang'), 'fr');
  ok('French translates and the language choice persists across reloads');

  /* ---------------- compare ---------------- */
  await page.locator('.nav-item', { hasText: 'Comparer' }).first().click();
  await page.waitForTimeout(800);
  assert.equal(await page.locator('tbody tr').count(), 6);
  assert.equal(await page.locator('.slip-cell').count(), 36);
  if (screenshot) {
    await mkdir('screenshots', { recursive: true });
    await page.screenshot({ path: 'screenshots/compare.webp', fullPage: true });
  }
  await page.locator('.slip-row').nth(1).locator('.slip-cell').nth(3).click();
  await page.waitForTimeout(800);
  assert.match(await page.locator('.hero-chip').first().innerText(), /2026/);
  ok('Comparison ranks six sites and computes all 36 launch-slip windows');

  /* ---------------- export ---------------- */
  const dlPromise = page.waitForEvent('download');
  await page.locator('.export-btn').click();
  const download = await dlPromise;
  assert.match(download.suggestedFilename(), /-fr\.txt$/);
  const file = await download.path();
  assert.match(await readFile(file, 'utf8'), /ÉVALUATION DU SITE/);
  ok('Export downloads a genuinely localised mission brief');

  /* ---------------- dialogs ---------------- */
  await page.locator('.nav-item', { hasText: 'À propos du modèle' }).click();
  assert.equal(await page.getByRole('dialog').count(), 1);
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('dialog').count(), 0);
  ok('Methodology dialog opens and dismisses accessibly');

  /* ---------------- responsive ---------------- */
  await page.locator('.lang-btn').first().click();
  await page.locator('.nav-item', { hasText: 'Explorer' }).first().click();
  await page.waitForTimeout(600);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(600);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  await page.locator('.topbar-menu').click();
  assert.equal(await page.locator('.sidebar.is-open').count(), 1);
  await page.locator('.nav-item').first().click();
  assert.equal(await page.locator('.sidebar.is-open').count(), 0);
  ok('Mobile layout fits the viewport and the navigation drawer works');
  await page.locator('.lang-btn').nth(2).click();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  ok('Mobile Arabic layout also fits the viewport');

  assert.deepEqual(errors, []);
  assert.deepEqual(badResponses, []);
  assert.deepEqual(external, []);
  ok('No JavaScript errors, missing assets, or external runtime requests');

  console.log(`\n${passed} browser checks passed.`);
} finally {
  if (browser) await browser.close();
  await new Promise((r) => server.close(r));
}
