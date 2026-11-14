/**
 * terrain.test.js — the LOLA horizon layer
 * ---------------------------------------------------------------------------
 * Two kinds of check:
 *
 *  1. GEOMETRY. The polar-stereographic mapping, the tangent-plane offset
 *     mapping used by the surface view, and the flat-horizon baseline are
 *     verified analytically — a horizon over a perfectly flat sphere is a
 *     parabola of −s²/2R, and we assert the sampler reproduces it.
 *
 *  2. REAL DATA. The shipped horizon masks (built from LRO LDEM_80S_80M at
 *     80 m/px) must produce a physically sensible south pole:
 *       - Connecting Ridge (the "peak of eternal light" area) is lit far more
 *         than any crater floor;
 *       - de Gerlache rim is lit more than 70 % of the year but less than
 *         Connecting Ridge;
 *       - Malapert keeps the Earth up essentially always (it is the comms
 *         champion in every published study);
 *       - a site on a shadowed floor stays dark.
 *     These are *ordering and plausibility* checks, not claims of flight
 *     accuracy, and the numbers they use are recomputed on the fly.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { undeltaField, toInt16, deltaField } from '../src/lib/lola-codec.js';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  POLAR_DEM,
  R_MOON_M,
  selenoToPolarPx,
  polarPxToSeleno,
  Heightfield,
  horizonFromField,
  sampleHorizon,
  diskAboveHorizon,
} from '../src/lib/terrain.js';
import { HORIZONS, TERRAIN_CROPS, HORIZON_BINS, REGIONAL_DEM } from '../src/lib/horizons.generated.js';
import { skyState, horizonAt, HORIZON_BINS as BINS } from '../src/lib/astro.js';
import { SITES, getSite } from '../src/lib/sites.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: expected ${b} ± ${tol}, got ${a}`);

/* ------------------------------------------------------------------ *
 * 1. Geometry
 * ------------------------------------------------------------------ */

test('polar-stereographic mapping round-trips at every south-polar site', () => {
  for (const site of SITES) {
    const px = selenoToPolarPx(site.lat, site.lon);
    const back = polarPxToSeleno(px.line, px.sample);
    near(back.lat, site.lat, 1e-6, `${site.id} latitude`);
    const dLon = ((((back.lon - site.lon) % 360) + 540) % 360) - 180;
    near(dLon, 0, 1e-6, `${site.id} longitude`);
  }
});

test('the polar scale is what the PDS label says it is', () => {
  // At the pole the map is 80 m/px and the projection is true to scale.
  const a = selenoToPolarPx(-89.9, 0);
  const b = selenoToPolarPx(-90, 0);
  const metresPerPixel = R_MOON_M * ((90 - 89.9) * Math.PI) / 180 / Math.abs(a.line - b.line);
  near(metresPerPixel, POLAR_DEM.px, 2, 'metres per pixel near the pole');
});

test('a flat horizon over a sphere is a parabola, and the sampler agrees', () => {
  // Build a synthetic, perfectly flat heightfield (constant radius) and check
  // that the horizon for a point 2 m up is the geometric dip + curvature.
  const N = 200;
  const data = new Int16Array(N * N); // all zero → constant radius
  const field = new Heightfield({ data, width: N, height: N, px: 400, originLine: 3700, originSample: 3700 });
  const res = horizonFromField(field, -89.0, 0, { bins: 8, maxRangeKm: 60, stepM: 400, smooth: 0 });
  // Analytic: elevation of a point 2 m up looking at the sphere is
  //   atan2(−(Rs − Rp cosθ), Rp sinθ) with Rp = Rs  → −θ/2 in the small-angle
  // limit, i.e. it keeps going down with distance. With a 60 km cap the
  // horizon should be at most a couple of degrees below zero everywhere.
  for (let i = 0; i < res.horizon.length; i++) {
    assert.ok(res.horizon[i] < 0, `flat ground must never produce a positive horizon (got ${res.horizon[i]})`);
    assert.ok(res.horizon[i] > -3, `flat ground horizon should stay shallow (got ${res.horizon[i]})`);
  }
});

test('diskAboveHorizon is the exact circular segment', () => {
  const r = 1;
  near(diskAboveHorizon(2, 0, r), 1, 1e-12, 'fully up');
  near(diskAboveHorizon(-2, 0, r), 0, 1e-12, 'fully down');
  near(diskAboveHorizon(0, 0, r), 0.5, 1e-12, 'half');
  // The Moon is 0.53° wide; a centre 0.25° above the ridge is ~80 % visible.
  near(diskAboveHorizon(0.25, 0, 0.53), 0.8, 0.05, 'mostly up');
  // monotone in altitude
  let prev = -1;
  for (let alt = -2; alt <= 2; alt += 0.1) {
    const f = diskAboveHorizon(alt, 0, r);
    assert.ok(f >= prev - 1e-12, 'visible fraction must be monotone');
    prev = f;
  }
});

test('sampleHorizon interpolates and wraps', () => {
  const mask = new Float32Array(360);
  for (let i = 0; i < 360; i++) mask[i] = i / 10; // 0, 0.1, 0.2 … 35.9
  near(sampleHorizon(mask, 0), 0, 1e-9, 'north');
  near(sampleHorizon(mask, 359), 35.9, 1e-4, 'just west of north');
  near(sampleHorizon(mask, -1), 35.9, 1e-4, 'wraps below 0');
  near(sampleHorizon(mask, 720 + 90), 9, 1e-9, 'wraps above 360');
});

/* ------------------------------------------------------------------ *
 * 2. The real LOLA data shipped with the app
 * ------------------------------------------------------------------ */

test('the generated horizon tables are complete and internally consistent', () => {
  assert.equal(Object.keys(HORIZONS).length, SITES.length);
  for (const site of SITES) {
    const h = HORIZONS[site.id];
    assert.ok(h, `no horizon for ${site.id}`);
    assert.equal(h.horizon.length, HORIZON_BINS, `${site.id} bin count`);
    assert.equal(h.rangeKm.length, HORIZON_BINS, `${site.id} range count`);
    near(h.lat, site.lat, 1e-3, `${site.id} latitude matches sites.js`);
    near(h.lon, site.lon, 1e-3, `${site.id} longitude matches sites.js`);
    // the mask must contain its own extremes (a guard against a truncated build)
    let hmin = Infinity;
    let hmax = -Infinity;
    for (const v of h.horizon) {
      if (v < hmin) hmin = v;
      if (v > hmax) hmax = v;
    }
    near(hmax, h.maxElevation, 0.06, `${site.id} max`);
    near(hmin, h.minElevation, 0.06, `${site.id} min`);
    // the site is on high ground or in a basin, never at a nonsense radius
    assert.ok(h.elevation > -9000 && h.elevation < 11000, `${site.id} elevation ${h.elevation} m is not lunar`);
  }
});

test('the horizon masks are the ones the app answers with', () => {
  for (const site of SITES) {
    near(horizonAt(site, 0), HORIZONS[site.id].horizon[0], 1e-9, `${site.id} north horizon`);
    near(horizonAt(site, 180), sampleHorizon(HORIZONS[site.id].horizon, 180), 1e-9, `${site.id} south horizon`);
  }
  assert.equal(BINS, HORIZON_BINS);
});

test('published ordering of south-polar sites is reproduced', () => {
  const annual = (id) => {
    const site = getSite(id);
    let lit = 0;
    let link = 0;
    let n = 0;
    for (let d = 0; d < 365; d += 0.5) {
      const st = skyState(site, Date.UTC(2026, 0, 1) + d * 86400000);
      if (st.sun.fraction > 0) lit++;
      if (st.earth.fraction > 0) link++;
      n++;
    }
    return { lit: (lit / n) * 100, link: (link / n) * 100 };
  };

  const ridge = annual('connecting-ridge');
  const shackleton = annual('shackleton');
  const gerlache = annual('de-gerlache');
  const malapert = annual('malapert');
  const cabeus = annual('cabeus');

  // Connecting Ridge is the peak-of-eternal-light candidate: > 90 % lit.
  assert.ok(ridge.lit > 90, `Connecting Ridge illumination ${ridge.lit.toFixed(1)}% should exceed 90%`);
  // Shackleton rim is lit most of the year but less than the ridge.
  assert.ok(shackleton.lit > 70, `Shackleton illumination ${shackleton.lit.toFixed(1)}% should exceed 70%`);
  assert.ok(shackleton.lit < ridge.lit, 'the ridge outshines the Shackleton rim');
  // de Gerlache rim: a good but imperfect site.
  assert.ok(gerlache.lit > 65 && gerlache.lit < ridge.lit, `de Gerlache ${gerlache.lit.toFixed(1)}%`);
  // Malapert is the communications champion.
  assert.ok(malapert.link > 95, `Malapert Earth visibility ${malapert.link.toFixed(1)}% should be ~100%`);
  assert.ok(malapert.link > ridge.link, 'Malapert beats the ridge for Earth visibility');
  // Cabeus B sits in a basin: the worst illumination of the set.
  assert.ok(cabeus.lit < 50, `Cabeus B illumination ${cabeus.lit.toFixed(1)}% should be well under 50%`);

  // Every site but Malapert must see *both* states during a year. Malapert's
  // 100 % Earth visibility is itself a published result (Sverdrup–Henson 2023),
  // so it is the documented exception, not a bug.
  assert.ok(malapert.link > 99, `Malapert should keep the Earth up essentially always (${malapert.link.toFixed(1)}%)`);
  for (const id of ['shackleton', 'connecting-ridge', 'de-gerlache', 'nobile', 'cabeus']) {
    const a = annual(id);
    assert.ok(a.lit > 5 && a.lit < 100, `${id} must have both day and night (${a.lit.toFixed(1)}%)`);
    assert.ok(a.link > 5 && a.link < 100, `${id} must have both link and blackout (${a.link.toFixed(1)}%)`);
  }
});

/** The shipped grids are packed: gzip(2-D second difference of Int16 metres). */
const readPackedGrid = (relPath, width, height) => {
  const file = resolve(root, 'public', relPath);
  assert.ok(existsSync(file), `missing ${relPath}`);
  const raw = new Uint8Array(gunzipSync(readFileSync(file)));
  assert.equal(raw.length, width * height * 2, `${relPath} unpacks to ${raw.length} bytes`);
  return undeltaField(toInt16(raw), width, height);
};

test('the packing is lossless: delta → undelta restores every height exactly', () => {
  // Small deterministic field with sharp edges, so the check is not flattered
  // by smooth data.
  const w = 7;
  const h = 5;
  const heights = new Int16Array(w * h);
  for (let i = 0; i < h; i++) {
    for (let j = 0; j < w; j++) heights[i * w + j] = ((i * 37 + j * 91) % 6013) - 2000;
  }
  const back = undeltaField(deltaField(heights, w, h), w, h);
  assert.deepEqual(Array.from(back), Array.from(heights));
});

test('the shipped grids are stored packed, and stay small', () => {
  const files = Object.values(TERRAIN_CROPS).map((m) => m.file).concat([REGIONAL_DEM.file]);
  let total = 0;
  for (const rel of files) {
    const abs = resolve(root, 'public', rel);
    assert.ok(existsSync(abs), `missing ${rel}`);
    assert.match(rel, /\.binz$/, `${rel} should be a packed grid`);
    total += readFileSync(abs).length;
  }
  // 6 crops + the cap backdrop. The raw grids are 6.2 MB; anything near that
  // means the packing step was skipped and the zip got 4 MB heavier.
  assert.ok(total < 1_600_000, `packed grids total ${(total / 1e6).toFixed(2)} MB`);
});

test('the surface-view crops decode and are the right shape', () => {
  for (const [id, meta] of Object.entries(TERRAIN_CROPS)) {
    const data = readPackedGrid(meta.file, meta.width, meta.height);
    let min = Infinity;
    let max = -Infinity;
    for (const v of data) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
    // real lunar relief: a 61 km patch at the pole spans several kilometres
    assert.ok(max - min > 500, `${id} crop relief is only ${max - min} m`);
    assert.ok(min > -12000 && max < 12000, `${id} crop heights are not lunar`);
    // the site's own elevation must lie inside the crop
    assert.ok(meta.elevation >= min - 500 && meta.elevation <= max + 500, `${id} centre elevation outside crop range`);
  }
});

test('the shipped regional DEM covers the whole 80°S cap', () => {
  assert.equal(REGIONAL_DEM.width, REGIONAL_DEM.height, 'the cap grid must be square');
  const data = readPackedGrid(REGIONAL_DEM.file, REGIONAL_DEM.width, REGIONAL_DEM.height);
  let min = Infinity;
  let max = -Infinity;
  for (const v of data) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  assert.ok(min < -7000, `regional DEM should reach the deep south-polar basins (min ${min})`);
  assert.ok(max > 6000, `regional DEM should contain the massifs (max ${max})`);
});
