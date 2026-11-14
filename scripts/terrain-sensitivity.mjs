#!/usr/bin/env node
/**
 * terrain-sensitivity.mjs — how much does DEM resolution move the answer?
 * ---------------------------------------------------------------------------
 * The audit's central question: the app reports Connecting Ridge illumination
 * far above the published figure, and the explanation offered in the UI and the
 * docs is "the shipped terrain is smoothed, so read it as an upper bound".
 * That is a *claim*. This script tests it.
 *
 * Method — the same ray march, the same ephemeris, the same disk-occlusion
 * formula, applied to the same patch of the Moon at four resolutions:
 *
 *   160 m   the shipped per-site crop, one sample per cell
 *   480 m   3×3 block mean of that crop
 *   800 m   5×5 block mean of that crop
 *   800 m*  the whole-cap 800 m grid (independent data path, coarser source)
 *
 * Everything except the terrain resolution is held fixed: 365 days from the
 * reference epoch, 6 h sampling, ±302 km march with lunar curvature, 720
 * azimuth bins, the Sun's apparent disk from the ephemeris.
 *
 * What it shows: illumination rises monotonically as the terrain gets coarser,
 * and the rise is largest exactly where the published disagreement is largest
 * (Connecting Ridge, a ridge crest). That is the evidence for "upper bound" —
 * and it is also a warning: at this DEM resolution a ridge percentage is not
 * a prediction, it is a ceiling.
 *
 * Usage: node scripts/terrain-sensitivity.mjs [--json]
 */
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { undeltaField, toInt16 } from '../src/lib/lola-codec.js';
import { Heightfield, horizonFromField, sampleHorizon, diskAboveHorizon } from '../src/lib/terrain.js';
import { TERRAIN_CROPS, REGIONAL_DEM } from '../src/lib/horizons.generated.js';
import { sunPosition, earthPosition, diskVisibleFraction, EPOCH_MS, MS_DAY } from '../src/lib/astro.js';
import { SITES } from '../src/lib/sites.js';
import { checkValue, CHECKS } from '../src/lib/validation.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DAYS = 365;
const STEP_H = 6;
const SUN_R_DEG = 0.266;
const EARTH_R_DEG = 0.95;

const load = (meta) => {
  const raw = new Uint8Array(gunzipSync(readFileSync(resolve(root, 'public', meta.file))));
  return undeltaField(toInt16(raw), meta.width, meta.height);
};

/** Block-average a grid by an integer factor. Keeps the same physical extent. */
function blockMean(data, side, factor) {
  if (factor === 1) return { data, side, px: null };
  const out = new Int16Array((side / factor) ** 2);
  const n = side / factor;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      let sum = 0;
      for (let di = 0; di < factor; di++) {
        for (let dj = 0; dj < factor; dj++) sum += data[(i * factor + di) * side + j * factor + dj];
      }
      out[i * n + j] = Math.round(sum / factor ** 2);
    }
  }
  return { data: out, side: n, px: factor };
}

/** Annual illumination + Earth visibility under a given horizon mask. */
function annual(mask, site) {
  const n = Math.round((DAYS * 24) / STEP_H);
  const stepMs = STEP_H * 3600 * 1000;
  let sunAny = 0;
  let sunFrac = 0;
  let earthAny = 0;
  let earthFrac = 0;
  for (let i = 0; i <= n; i++) {
    const t = EPOCH_MS + i * stepMs;
    const s = sunPosition(site, t);
    const e = earthPosition(site, t);
    const sf = diskAboveHorizon(s.alt, sampleHorizon(mask, s.az), SUN_R_DEG);
    const ef = diskAboveHorizon(e.alt, sampleHorizon(mask, e.az), EARTH_R_DEG);
    sunFrac += sf;
    earthFrac += ef;
    if (sf > 0) sunAny++;
    if (ef > 0) earthAny++;
  }
  return {
    sunAnyPct: (100 * sunAny) / (n + 1),
    sunPct: (100 * sunFrac) / (n + 1),
    earthAnyPct: (100 * earthAny) / (n + 1),
    earthPct: (100 * earthFrac) / (n + 1),
  };
}

const json = process.argv.includes('--json');
const rows = [];
const cache = new Map();
const capGrid = load(REGIONAL_DEM);

for (const site of SITES) {
  const meta = TERRAIN_CROPS[site.id];
  if (!meta) continue;
  const cropData = load(meta);
  const crop = { ...meta, data: cropData, width: meta.width, height: meta.height };

  const configs = [
    { label: '160 m (crop, raw)', field: new Heightfield({ ...crop, data: cropData }), stepM: 160, smooth: 0 },
  ];
  for (const factor of [3, 5]) {
    const bm = blockMean(cropData, meta.width, factor);
    configs.push({
      label: `${160 * factor} m (${factor}×${factor} mean)`,
      field: new Heightfield({ ...crop, data: bm.data, width: bm.side, height: bm.side, px: 160 * factor }),
      stepM: 160 * factor,
      smooth: 0,
    });
  }
  // Independent path: the whole-cap 800 m grid around the same coordinate.
  const capResult = horizonFromField(
    new Heightfield({
      data: capGrid,
      width: REGIONAL_DEM.width,
      height: REGIONAL_DEM.height,
      px: REGIONAL_DEM.px,
      originLine: 0,
      originSample: 0,
    }),
    site.lat,
    site.lon,
    { bins: 720, maxRangeKm: 302, stepM: 800, smooth: 0 }
  );

  const out = { site: site.id, name: site.name, published: null, levels: [] };
  const check = CHECKS.find((c) => c.siteId === site.id && c.metric === 'sunPct');
  if (check && check.confidence === 'published') out.published = check.published;

  for (const cfg of configs) {
    const key = `${site.id}:${cfg.label}`;
    if (!cache.has(key)) {
      const { horizon } = horizonFromField(cfg.field, site.lat, site.lon, {
        bins: 720,
        maxRangeKm: 302,
        stepM: cfg.stepM,
        smooth: cfg.smooth,
      });
      cache.set(key, annual(horizon, site));
    }
    out.levels.push({ res: cfg.label, ...cache.get(key) });
  }
  out.levels.push({ res: '800 m (whole-cap grid)', ...annual(capResult.horizon, site) });

  const first = out.levels[0].sunAnyPct;
  const last = out.levels[out.levels.length - 1].sunAnyPct;
  out.rise = last - first;
  rows.push(out);
}

if (json) {
  console.log(JSON.stringify(rows, null, 2));
  process.exit(0);
}

const pad = (s, n) => String(s).padEnd(n);
const num = (v, n = 5) => v.toFixed(1).padStart(n);

console.log('\nSELENE · terrain-resolution sensitivity');
console.log('365 days from the reference epoch · 6 h sampling · 720 azimuth bins · ±302 km march\n');
for (const r of rows) {
  console.log(`${r.name}${r.published != null ? `   (published ${r.published}%)` : '   (no published figure — derived band)'}`);
  console.log(`  ${pad('terrain', 26)} ${pad('sun any-part', 13)} ${pad('sun disk mean', 14)} ${pad('Earth any-part', 15)} Earth disk mean`);
  for (const l of r.levels) {
    console.log(`  ${pad(l.res, 26)} ${num(l.sunAnyPct, 13)} ${num(l.sunPct, 14)} ${num(l.earthAnyPct, 15)} ${num(l.earthPct)}`);
  }
  console.log(`  → coarsening 160 m → 800 m moves annual illumination by ${r.rise >= 0 ? '+' : ''}${r.rise.toFixed(1)} pp\n`);
}

// What the app itself reports, so the reader can tie the table to the UI.
console.log('What the app reports (shipped masks, annual, 6 h):');
for (const check of CHECKS.filter((c) => c.metric === 'sunPct')) {
  const v = checkValue(check);
  console.log(
    `  ${pad(v.site.name, 20)} ${num(v.value, 5)}%  ${check.confidence === 'published' ? `published ${check.published} ± ${check.tol}` : 'derived band'}`
  );
}
console.log('');
