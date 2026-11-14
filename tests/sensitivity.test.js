/**
 * sensitivity.test.js — do the results actually respond to the inputs?
 * ---------------------------------------------------------------------------
 * A mission planner's numbers are only meaningful if they move when the inputs
 * move. Two failure modes are easy to ship by accident and invisible in a
 * screenshot:
 *
 *   1. every site returns the same number (the horizon mask is not being used);
 *   2. the date does nothing (a cached or constant ephemeris).
 *
 * Writing these tests turned up a third behaviour that is *not* a bug but is
 * worth protecting: **window means saturate**. In a 30-day window two ridge
 * sites can both round to 100 % sunlight and become indistinguishable, even
 * though their whole-year time series differ on half their days. So the test
 * that follows checks distinctness where it is real (the daily series) and
 * checks that saturation is detected rather than pretended away.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { SITES, getSite } from '../src/lib/sites.js';
import { analyseWindow } from '../src/lib/metrics.js';
import { skyState, skyFrame, EPOCH_MS, MS_DAY } from '../src/lib/astro.js';

const at = (days) => EPOCH_MS + days * MS_DAY;

/** Daily sun/earth fractions for one site over `n` days. */
function dailySeries(site, n = 180) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const s = skyState(site, at(i));
    out.push({ sun: s.sun.fraction * 100, earth: s.earth.fraction * 100 });
  }
  return out;
}

test('every pair of sites is distinguishable in its daily series', () => {
  const series = Object.fromEntries(SITES.map((s) => [s.id, dailySeries(s)]));
  const ids = SITES.map((s) => s.id);
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = series[ids[i]];
      const b = series[ids[j]];
      let days = 0;
      for (let k = 0; k < a.length; k++) {
        if (Math.abs(a[k].sun - b[k].sun) > 5 || Math.abs(a[k].earth - b[k].earth) > 5) days++;
      }
      // Half a year of daily samples: two genuinely different sites cannot
      // agree on 90 % of them.
      assert.ok(days > a.length * 0.1, `${ids[i]} and ${ids[j]} agree on ${a.length - days}/${a.length} days`);
    }
  }
});

test('…but a fully-lit window can tie two different sites, and the app must not pretend otherwise', () => {
  // Measured: Shackleton and de Gerlache both light up a 30-day January window
  // to within a fraction of a point. If that ever stops being true, the
  // Compare-page caveat about rank ties can be removed.
  const sh = analyseWindow(getSite('shackleton'), EPOCH_MS, 30, 6);
  const dg = analyseWindow(getSite('de-gerlache'), EPOCH_MS, 30, 6);
  assert.ok(sh.sunPct > 98 && dg.sunPct > 98, 'both ridge sites are essentially fully lit in this window');
  assert.ok(Math.abs(sh.sunPct - dg.sunPct) < 1, 'and their window means tie');

  // The wide spread that makes the ranking meaningful is at the other end.
  const ca = analyseWindow(getSite('cabeus'), EPOCH_MS, 30, 6);
  assert.ok(sh.sunPct - ca.sunPct > 40, 'the lit / unlit comparison is not a tie');
});

test('changing the date changes the numbers, at every site', () => {
  const offsets = [0, 7, 14, 21, 28];
  for (const site of SITES) {
    const sun = offsets.map((d) => analyseWindow(site, at(d), 7, 6).sunPct);
    const earth = offsets.map((d) => analyseWindow(site, at(d), 7, 6).earthPct);
    const sunSpread = Math.max(...sun) - Math.min(...sun);
    const earthSpread = Math.max(...earth) - Math.min(...earth);
    // A permanently lit site may keep its sunlight at 100 % — but its Earth
    // link must still move, because that is geometry, not terrain.
    assert.ok(
      sunSpread > 0.5 || earthSpread > 2,
      `${site.id}: nothing moved across five dates (Δsun ${sunSpread.toFixed(2)}, Δearth ${earthSpread.toFixed(2)})`
    );
  }
  for (const id of ['cabeus', 'nobile', 'malapert']) {
    const sun = [0, 7, 14, 21, 28].map((d) => analyseWindow(getSite(id), at(d), 7, 6).sunPct);
    assert.ok(Math.max(...sun) - Math.min(...sun) > 15, `${id} should swing with the date`);
  }
});

test('changing the duration changes the average, and a longer window is a mean not a sum', () => {
  const site = getSite('connecting-ridge');
  const w7 = analyseWindow(site, EPOCH_MS, 7, 6);
  const w90 = analyseWindow(site, EPOCH_MS, 90, 6);
  for (const w of [w7, w90]) {
    assert.ok(w.sunPct >= 0 && w.sunPct <= 100);
    assert.ok(w.earthPct >= 0 && w.earthPct <= 100);
  }
  // A 90-day mean must lie inside the range of the 30-day windows that tile it.
  const tiles = [0, 30, 60].map((d) => analyseWindow(site, at(d), 30, 6).sunPct);
  const lo = Math.min(...tiles);
  const hi = Math.max(...tiles);
  assert.ok(
    w90.sunPct >= lo - 1 && w90.sunPct <= hi + 1,
    `90 d mean ${w90.sunPct.toFixed(1)} sits outside the tiled 30 d means [${lo.toFixed(1)}, ${hi.toFixed(1)}]`
  );
  // The Earth link over the shorter window must differ from the longer one:
  // the libration cycle is 27 d, so 7 d and 90 d cannot agree by accident.
  assert.ok(Math.abs(w7.earthPct - w90.earthPct) > 0.5);
});

test('the sky model itself moves with the date: Sun, Earth and Earth rotation', () => {
  const ang = (a, b) => {
    const d = a.x * b.x + a.y * b.y + a.z * b.z;
    return (Math.acos(Math.max(-1, Math.min(1, d))) * 180) / Math.PI;
  };
  const f0 = skyFrame(EPOCH_MS);
  const f1 = skyFrame(at(1));
  const f7 = skyFrame(at(7));
  // The Moon rotates 13.2°/day under the sky, so the Sun vector in the body
  // frame moves by that much per day — not by the 0.5° the Moon moves in orbit.
  assert.ok(ang(f0.sunBody, f1.sunBody) > 5, 'the Sun vector must move between consecutive days');
  assert.ok(ang(f0.earthBody, f7.earthBody) > 2, 'the Earth vector must move across a week');
  assert.notEqual(f0.gast.toFixed(3), f7.gast.toFixed(3), 'Earth’s rotation must advance');
});
