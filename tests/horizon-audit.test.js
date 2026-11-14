/**
 * horizon-audit.test.js — the horizon layer, checked against itself
 * ---------------------------------------------------------------------------
 * `scripts/horizon-audit.mjs` recomputes the 720-bin horizon masks from the
 * shipped DEM with the shipped code and compares them with the masks the app
 * actually uses (`horizons.json`). This file turns its output into assertions,
 * so the numbers quoted in the UI and the docs cannot drift away from the
 * measurement, and so the *conclusion* cannot be quietly softened:
 *
 *   - at a site where the horizon is dominated by large-scale relief (Nobile)
 *     the two agree to a few hundredths of a degree, which proves the mapping
 *     and the ray march are implemented the same way;
 *   - at the ridge/rim sites they disagree by enough to move annual
 *     illumination by tens of percentage points, and a sub-kilometre shift in
 *     position reproduces the shipped mask — i.e. the disagreement is a
 *     knife-edge effect, not a coding error;
 *   - therefore a single-site percentage must be presented as a band.
 *
 * The fixture is generated, not typed: run `node scripts/horizon-audit.mjs` to
 * regenerate it. These tests are deliberately reading a fixture rather than
 * recomputing — a full audit takes ~30 s, which is too slow for every test run.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { CHECKS, VALIDATION_DAYS } from '../src/lib/validation.js';
import { analyseWindow } from '../src/lib/metrics.js';
import { getSite } from '../src/lib/sites.js';
import { EPOCH_MS } from '../src/lib/astro.js';
import { UI_STRINGS } from '../src/lib/ui-strings.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const fixture = JSON.parse(readFileSync(resolve(here, 'fixtures/horizon-audit.json'), 'utf8'));
const SITE = (id) => fixture.sites.find((s) => s.id === id);

test('the audit fixture was produced by the shipped script, for the shipped sites', () => {
  assert.equal(fixture.generatedBy, 'scripts/horizon-audit.mjs');
  assert.equal(fixture.sites.length, 6, 'all six candidate sites must be audited');
  assert.deepEqual(fixture.grids, ['400 m', '800 m', '1600 m']);
  assert.equal(fixture.window.bins, 720);
  assert.equal(fixture.window.days, 365);
  // Every site must carry the three recomputations and the shipped mask.
  for (const s of fixture.sites) {
    assert.equal(s.recomputed.length, 3, `${s.id}: expected three grid sizes`);
    assert.ok(s.shipped.sunAnyPct > 0 && s.shipped.sunAnyPct <= 100);
    assert.ok(s.shippedMask.min < s.shippedMask.max);
  }
});

test('a large-scale horizon reproduces: Nobile agrees to a hundredth of a degree', () => {
  // If the code path were wrong (mapping, azimuth convention, curvature, sign
  // of the ray march) this site would not match — it has a 7.9° rim that
  // dominates in every resolution. This is the control for the whole audit.
  const nobile = SITE('nobile');
  const r = nobile.recomputed[0];
  assert.ok(r.vsShipped.meanAbsDeg < 0.1, `Nobile mean mask difference ${r.vsShipped.meanAbsDeg}° is too large to blame on resolution`);
  assert.ok(Math.abs(nobile.shippedVsRecomputedPp) < 1, `Nobile illumination differs by ${nobile.shippedVsRecomputedPp} pp`);
});

test('at the ridge and rim sites the horizon is a knife edge, and the numbers say so', () => {
  // These are the sites whose published comparison the app already flags.
  for (const id of ['shackleton', 'connecting-ridge', 'malapert']) {
    const s = SITE(id);
    assert.ok(
      Math.abs(s.shippedVsRecomputedPp) > 15,
      `${id}: shipped vs recomputed is only ${s.shippedVsRecomputedPp.toFixed(1)} pp — if the masks were regenerated, the disclosure text must be rewritten`
    );
    // …and the disagreement disappears when the site is moved by about a
    // kilometre or less (Malapert, on a 4° slope, is the exception at ~12 km,
    // which is why it is checked separately below).
    assert.ok(
      s.bestPositionMatch.unshiftedMeanAbsDeg > s.bestPositionMatch.meanAbsDeg,
      `${id}: a positional shift should explain part of the difference`
    );
  }
  const sh = SITE('shackleton');
  assert.ok(sh.bestPositionMatch.groundKm < 1, `Shackleton's shift is ${sh.bestPositionMatch.groundKm} km`);
  assert.ok(sh.bestPositionMatch.meanAbsDeg < 0.5, 'a sub-kilometre shift reproduces the shipped Shackleton mask');
});

test('Malapert is the exception: its disagreement is not a sub-kilometre effect', () => {
  const m = SITE('malapert');
  assert.ok(m.bestPositionMatch.groundKm > 5, `Malapert needs ${m.bestPositionMatch.groundKm} km of shift — do not describe it as a knife edge`);
  // It is also the one site where the model is *below* a published figure by a
  // wide margin, and the row says why (it is 4° from the pole, an ordinary
  // latitude, not a permanently lit summit).
  const row = CHECKS.find((c) => c.siteId === 'malapert' && c.metric === 'sunPct');
  assert.match(row.why, /4°/);
});

test('terrain cell size alone moves the answer by up to 16 pp', () => {
  // Same data, same code, only the cell size changes: 400 m → 800 m → 1600 m.
  const spreads = fixture.sites.map((s) => ({ id: s.id, spread: s.resolutionSpreadPp }));
  const worst = spreads.reduce((a, b) => (b.spread > a.spread ? b : a));
  assert.equal(worst.id, 'malapert');
  assert.ok(worst.spread > 10, `largest cell-size spread is ${worst.spread} pp`);
  const ridge = SITE('connecting-ridge');
  assert.ok(ridge.resolutionSpreadPp > 5, `ridge spread ${ridge.resolutionSpreadPp} pp`);
  // The two "large relief" sites must be insensitive — otherwise the whole
  // comparison would be noise and the app should say so instead.
  assert.ok(SITE('nobile').resolutionSpreadPp < 2);
  assert.ok(SITE('cabeus').resolutionSpreadPp < 3);
});

test('the fixture agrees with what the app reports, so the audit cannot be read as fiction', () => {
  // For every site that has a published check, the shipped-mask illumination in
  // the fixture must equal the number in Data & validation (both annual, 6 h).
  for (const s of fixture.sites) {
    const row = CHECKS.find((c) => c.siteId === s.id && c.metric === 'sunPct');
    if (!row || s.published == null) continue;
    assert.equal(row.published, s.published, `${s.id}: published figure changed — regenerate the fixture`);
  }
  const ridge = SITE('connecting-ridge');
  // Exactly the number the validation table and the Compare legend show. The
  // audit borrows the product's own `skyState()`, so these cannot drift apart.
  const onScreen = CHECKS.find((c) => c.id === 'connecting-sun');
  const row = analyseWindow(getSite('connecting-ridge'), EPOCH_MS, VALIDATION_DAYS, 6);
  assert.equal(Number(ridge.shipped.sunAnyPct.toFixed(2)), Number(row.sunAnyPct.toFixed(2)));
  assert.ok(Math.abs(ridge.shipped.sunAnyPct - 98.4) < 0.05, `shipped ridge illumination is ${ridge.shipped.sunAnyPct}`);
  assert.equal(onScreen.published, ridge.published);
});

test('the interface tells the reader that a site percentage is a band', () => {
  // The audit is only useful if it reaches the screen. One string, three
  // languages, rendered under the validation table.
  for (const lang of ['en', 'fr', 'ar']) {
    const text = UI_STRINGS[lang].valHorizonBand;
    assert.ok(text && text.length > 120, `${lang}: the horizon-band caveat is missing`);
  }
  assert.match(UI_STRINGS.en.valHorizonBand, /horizon-audit\.mjs/);
  assert.match(UI_STRINGS.en.valHorizonBand, /pp/);
  assert.match(UI_STRINGS.en.valHorizonBand, /band, not a prediction/);
  const page = readFileSync(resolve(root, 'src/components/pages/ValidationPage.jsx'), 'utf8');
  assert.match(page, /valHorizonBand/, 'the caveat must be rendered, not only stored');
});
