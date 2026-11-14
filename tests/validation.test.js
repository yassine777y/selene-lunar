/**
 * validation.test.js — guards the "does our physics match published data?"
 * claim. If a future change pushes a site outside its published range,
 * this suite fails loudly instead of silently drifting.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { runValidation, runSkyChecks, CHECKS, SOURCES, checkValue, MODEL_FACTS } from '../src/lib/validation.js';
import { SITES, getSite } from '../src/lib/sites.js';
import { analyseWindow } from '../src/lib/metrics.js';
import { earthPosition, EPOCH_MS, MS_DAY } from '../src/lib/astro.js';

test('every reference check reproduces a value inside its published range', () => {
  const report = runValidation();
  const failures = report.rows.filter((r) => !r.pass);
  assert.deepEqual(
    failures.map((r) => `${r.site.name} ${r.label}: ${r.value.toFixed(1)} outside [${r.min}, ${r.max}]`),
    [],
    'site results drifted outside the published ranges'
  );
  assert.equal(report.passed, report.total);
});

test('the report separates published figures from derived sanity bands', () => {
  const report = runValidation();
  const published = report.rows.filter((r) => r.confidence === 'published');
  assert.ok(published.length >= 7, 'most checks should cite a published value');
  // every published check must point at a real source entry
  for (const row of published) {
    assert.ok(row.sources.length > 0, `${row.id} is marked published but cites nothing`);
    for (const id of row.sources) {
      assert.ok(SOURCES.some((s) => s.id === id), `${row.id} cites unknown source ${id}`);
    }
  }
  // derived rows may cite *context*, but must always explain why they are derived
  for (const row of report.rows.filter((r) => r.confidence === 'derived')) {
    assert.ok(row.why.length > 40, `${row.id} is derived but does not explain its band`);
    for (const id of row.sources) {
      assert.ok(SOURCES.some((s) => s.id === id), `${row.id} cites unknown source ${id}`);
    }
  }
});

test('every source has a resolvable-looking URL and a note', () => {
  for (const src of SOURCES) {
    assert.match(src.url, /^https?:\/\/\S+$/, `${src.id} needs a URL`);
    assert.ok(src.note.length > 40, `${src.id} needs an explanatory note`);
    assert.ok(src.title.length > 20, `${src.id} needs a full title`);
  }
});

test('Earth geometry matches the published polar-sky description', () => {
  const sky = runSkyChecks();
  // Kaguya: Earth stays within roughly ±6.5° in elevation. Allow ±8° for the
  // longitude-libration term at a site away from the central meridian.
  assert.ok(Math.abs(sky.earthAltMax) < 8.6, `Earth rose too high: ${sky.earthAltMax}`);
  assert.ok(Math.abs(sky.earthAltMin) < 8.6, `Earth fell too low: ${sky.earthAltMin}`);
  // NASA: visible for about half of each sidereal month.
  assert.ok(sky.earthAboveLimbShare > 45 && sky.earthAboveLimbShare < 60,
    `Earth above the limb ${sky.earthAboveLimbShare.toFixed(1)}% of the time — expected ≈50%`);
});

test('Earth dips below the horizon every synodic month (no continuous DTE)', () => {
  const site = getSite('shackleton');
  const SYNODIC_MONTH = 29.530588853;
  let transitions = 0;
  let prev = null;
  for (let d = 0; d < SYNODIC_MONTH * 1.02; d += 0.25) {
    const alt = earthPosition(site, EPOCH_MS + d * MS_DAY).alt;
    const now = alt > 0;
    if (prev !== null && now !== prev) transitions += 1;
    prev = now;
  }
  assert.ok(transitions >= 2, `expected Earth to set and rise within one month, saw ${transitions} crossings`);
});

test('the Sun never climbs high at the pole (grazing illumination)', () => {
  for (const s of SITES) {
    const m = analyseWindow(s, EPOCH_MS, 365, 12);
    assert.ok(m.sunAltMax < 12, `${s.id}: Sun reached ${m.sunAltMax.toFixed(1)}° — the pole is grazing-light only`);
    // the Sun's altitude can never exceed (90° − |latitude|) + the Moon's
    // 1.54° obliquity + the Sun's own 0.27° radius
    assert.ok(m.sunAltMax <= 90 - Math.abs(s.lat) + 1.54 + 0.27 + 0.1, `${s.id} sun altitude is impossible`);
  }
});

test('illumination stays bounded and monotone in window length', () => {
  for (const s of SITES) {
    const short = analyseWindow(s, EPOCH_MS, 30, 6);
    const long = analyseWindow(s, EPOCH_MS, 365, 6);
    for (const m of [short, long]) {
      assert.ok(m.sunPct >= 0 && m.sunPct <= 100);
      assert.ok(m.earthPct >= 0 && m.earthPct <= 100);
    }
    assert.ok(long.maxSunOutageH >= short.maxSunOutageH - 1);
  }
});

test('Earth visibility ordering matches the literature', () => {
  const rank = (id) => analyseWindow(getSite(id), EPOCH_MS, 365, 12).earthPct;
  // the comms champion beats the near-pole crater rims, every time
  assert.ok(rank('malapert') > rank('shackleton'));
  assert.ok(rank('malapert') > rank('de-gerlache'));
  assert.ok(rank('malapert') > 90, 'Malapert should be near-continuous for DTE');
});

test('illumination ordering matches the literature', () => {
  const sun = (id) => analyseWindow(getSite(id), EPOCH_MS, 365, 12).sunPct;
  // connecting ridge is the best-lit of the study set; the basin is the worst
  assert.ok(sun('connecting-ridge') > sun('cabeus'));
  assert.ok(sun('shackleton') > sun('cabeus'));
  assert.ok(sun('connecting-ridge') > 80);
  assert.ok(sun('cabeus') < 60);
});

test('checkValue is pure and repeatable', () => {
  const check = CHECKS[0];
  const a = checkValue(check);
  const b = checkValue(check);
  assert.equal(a.value, b.value);
  assert.equal(a.pass, b.pass);
});

test('model constants quoted in the UI come live from the ephemeris', () => {
  // The Moon's equator is tilted 1.5424° to the ecliptic (IAU 2015).
  assert.ok(Math.abs(MODEL_FACTS.eclipticObliquityDeg - 1.5424) < 1e-4);
  // angular sizes move with the real distances: Earth 1.8–2.1°, Sun 0.52–0.56°
  assert.ok(MODEL_FACTS.earthDiskDeg > 1.7 && MODEL_FACTS.earthDiskDeg < 2.2, `Earth disk ${MODEL_FACTS.earthDiskDeg}`);
  assert.ok(MODEL_FACTS.sunDiskDeg > 0.50 && MODEL_FACTS.sunDiskDeg < 0.58, `Sun disk ${MODEL_FACTS.sunDiskDeg}`);
  // distance is a live number, not a constant
  assert.ok(MODEL_FACTS.earthDistanceKm > 350000 && MODEL_FACTS.earthDistanceKm < 410000);
  assert.equal(MODEL_FACTS.siteCount, SITES.length);
  // libration amplitudes are real (a few degrees), not placeholders
  assert.ok(MODEL_FACTS.librationLatDeg >= 0 && MODEL_FACTS.librationLatDeg <= 8);
  assert.ok(MODEL_FACTS.librationLonDeg >= 0 && MODEL_FACTS.librationLonDeg <= 9);
});
