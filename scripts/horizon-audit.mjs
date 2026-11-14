#!/usr/bin/env node
/**
 * horizon-audit.mjs — can the shipped horizon masks be reproduced?
 * ---------------------------------------------------------------------------
 * Every illumination and Earth-visibility number in the app comes from
 * `public/data/lola/horizons.json`: 720 azimuth bins per site, built offline
 * from LRO LOLA. That file was produced by a Python builder that is **not in
 * this repository**, from the native 80 m DEM, which is also **not in this
 * repository**. So the horizon layer — the layer that decides whether a site is
 * lit — was, until now, unfalsifiable from the shipped code.
 *
 * This script re-derives the masks with the code that *is* shipped:
 * `horizonFromField()` in `src/lib/terrain.js`, run on the shipped 800 m and
 * 400 m grids, and compares the result with `horizons.json`:
 *
 *   1. per-azimuth angular difference, in degrees;
 *   2. the annual illumination / Earth visibility each mask produces, so the
 *      difference can be read in the units the UI uses (percentage points)
 *      rather than in degrees nobody can feel;
 *   3. how much the answer moves when only the terrain *cell size* changes
 *      (400 m → 800 m → 1600 m, same data, same code), which is the honest way
 *      to measure "how much does DEM resolution matter".
 *
 * Output is a machine-readable fixture (`tests/fixtures/horizon-audit.json`) so
 * the numbers quoted in the docs are the numbers this script produces.
 *
 * Usage: node scripts/horizon-audit.mjs [--json]
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Heightfield, horizonFromField } from '../src/lib/terrain.js';
import { HORIZONS, HORIZON_BINS } from '../src/lib/horizons.generated.js';
import { SITES } from '../src/lib/sites.js';
import { EPOCH_MS, skyState } from '../src/lib/astro.js';
import { decodeGrid } from '../src/lib/lola-codec.js';
import { REGIONAL_DEM } from '../src/lib/horizons.generated.js';
import { CHECKS } from '../src/lib/validation.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DAYS = 365;
const STEP_H = 6;

/** Raw Int16 grid, the unpacked master that `pack-terrain.mjs` reads. */
function readMaster(name, side) {
  const buf = readFileSync(resolve(root, 'assets-src/lola', name));
  const data = new Int16Array(buf.buffer, buf.byteOffset, buf.byteLength >> 1);
  if (data.length !== side * side) throw new Error(`${name}: expected ${side}²`);
  return data;
}

/** Integer-factor block mean — the same operator the packer uses. */
function blockMean(data, side, factor) {
  const n = side / factor;
  if (!Number.isInteger(n)) throw new Error(`factor ${factor} does not divide ${side}`);
  const out = new Int16Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      let sum = 0;
      for (let di = 0; di < factor; di++) {
        for (let dj = 0; dj < factor; dj++) sum += data[(i * factor + di) * side + j * factor + dj];
      }
      out[i * n + j] = Math.round(sum / (factor * factor));
    }
  }
  return { data: out, side: n };
}

/**
 * Annual illumination and Earth visibility for one horizon mask.
 *
 * This deliberately calls the app's own `skyState()` with the candidate mask
 * swapped in, so the audit and the product differ in exactly one variable: the
 * horizon. An earlier version of this script carried its own Sun/Earth geometry
 * and its own mean apparent radii, which made the "shipped" row read 98.6 %
 * where the validation table — the number on screen — says 98.4 %. Two code
 * paths for one quantity is precisely the contradiction this audit is supposed
 * to find, so the audit now borrows the product's path.
 */
function annual(mask, site) {
  const probe = { ...site, horizon: mask };
  const n = Math.round((DAYS * 24) / STEP_H);
  let sunAny = 0;
  let sunDisk = 0;
  let earthAny = 0;
  let earthDisk = 0;
  for (let i = 0; i <= n; i++) {
    const s = skyState(probe, EPOCH_MS + i * STEP_H * 3600 * 1000);
    sunDisk += s.sun.fraction;
    earthDisk += s.earth.fraction;
    if (s.sun.fraction > 0) sunAny++;
    if (s.earth.fraction > 0) earthAny++;
  }
  const c = n + 1;
  return {
    sunAnyPct: (100 * sunAny) / c,
    sunPct: (100 * sunDisk) / c,
    earthAnyPct: (100 * earthAny) / c,
    earthPct: (100 * earthDisk) / c,
  };
}

const maskStats = (mask) => {
  let min = Infinity;
  let max = -Infinity;
  for (const v of mask) {
    min = Math.min(min, v);
    max = Math.max(max, v);
  }
  return { min, max };
};

const compare = (a, b) => {
  let sum = 0;
  let worst = 0;
  for (let i = 0; i < a.length; i++) {
    const d = Math.abs(a[i] - b[i]);
    sum += d;
    worst = Math.max(worst, d);
  }
  return { meanAbsDeg: sum / a.length, maxAbsDeg: worst };
};

/*
 * Two ways in, because the best base grid is too large to ship:
 *
 *   FULL   — `assets-src/lola/sp-400m.bin` is present (it is a 4.6 MB master,
 *            excluded from the deliverable for size). Gives 400 / 800 / 1600 m.
 *   SHIPPED— otherwise, decode `public/data/lola/sp-800m.binz`, which this
 *            project does ship and the app itself streams. Gives 800 / 1600 m,
 *            still over the same 608 km disc, so the ray march and the 302 km
 *            range are unchanged.
 *
 * The full run is the one whose numbers are quoted in the docs; the shipped run
 * exists so that a fresh clone of the deliverable can audit itself instead of
 * failing on a missing file. It says which mode it is in on the first line.
 */
let base;
let baseLabel;
let grids;
try {
  base = readMaster('sp-400m.bin', 1520);
  baseLabel = 'assets-src/lola/sp-400m.bin (full)';
  grids = [
    { label: '400 m', data: base, side: 1520, px: 400, stepM: 400 },
    { label: '800 m', ...blockMean(base, 1520, 2), px: 800, stepM: 800 },
    { label: '1600 m', ...blockMean(base, 1520, 4), px: 1600, stepM: 1600 },
  ];
} catch {
  const packed = readFileSync(resolve(root, 'public', REGIONAL_DEM.file));
  const decoded = await decodeGrid(packed, REGIONAL_DEM.width, REGIONAL_DEM.height);
  base = decoded;
  baseLabel = `${REGIONAL_DEM.file} (shipped 800 m — assets-src master not present)`;
  grids = [
    { label: '800 m', data: base, side: REGIONAL_DEM.width, px: 800, stepM: 800 },
    { label: '1600 m', ...blockMean(base, REGIONAL_DEM.width, 2), px: 1600, stepM: 1600 },
  ];
}
const FULL = grids.length === 3;

const out = {
  generatedBy: 'scripts/horizon-audit.mjs',
  window: { days: DAYS, stepH: STEP_H, epochMs: EPOCH_MS, bins: HORIZON_BINS },
  note:
    'Masks recomputed from the shipped 400 m cap grid with the shipped terrain.js. ' +
    'They are NOT the masks the app uses: horizons.json was built offline from the ' +
    'native 80 m grid by a generator that is not in this repository.',
  base: baseLabel,
  grids: grids.map((g) => g.label),
  sites: [],
};

for (const site of SITES) {
  const shipped = HORIZONS[site.id];
  if (!shipped) continue;
  const row = {
    id: site.id,
    name: site.name,
    published: CHECKS.find((c) => c.siteId === site.id && c.metric === 'sunPct' && c.confidence === 'published')?.published ?? null,
    shippedMask: maskStats(shipped.horizon),
    shipped: annual(shipped.horizon, site),
    recomputed: [],
  };
  for (const g of grids) {
    const field = new Heightfield({ data: g.data, width: g.side, height: g.side, px: g.px });
    const { horizon } = horizonFromField(field, site.lat, site.lon, {
      bins: HORIZON_BINS,
      maxRangeKm: 302,
      stepM: g.stepM,
      smooth: 0,
    });
    row.recomputed.push({
      grid: g.label,
      mask: maskStats(horizon),
      vsShipped: compare(horizon, shipped.horizon),
      ...annual(horizon, site),
    });
  }
  // Is the disagreement a *position* difference rather than a *resolution*
  // difference? A polar horizon is a knife-edge quantity: a sub-kilometre
  // displacement along the ridge can swing it by several degrees. Search a
  // small latitude/longitude neighbourhood for the point whose mask best
  // reproduces the shipped one, and report how far that point is from the
  // site the app actually uses.
  const cap400 = grids[0];
  const field = new Heightfield({ data: cap400.data, width: cap400.side, height: cap400.side, px: cap400.px });
  const meanErr = (a, b) => {
    let sum = 0;
    for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
    return sum / a.length;
  };
  let best = { err: Infinity, dLat: 0, dLon: 0 };
  for (let dLat = -0.4; dLat <= 0.4001; dLat += 0.1) {
    for (let dLon = -2; dLon <= 2.0001; dLon += 0.4) {
      const lat = Math.max(-90, Math.min(-80, site.lat + dLat));
      const lon = (site.lon + dLon + 360) % 360;
      const { horizon } = horizonFromField(field, lat, lon, { bins: HORIZON_BINS, maxRangeKm: 302, stepM: 400, smooth: 0 });
      const e = meanErr(horizon, shipped.horizon);
      if (e < best.err) best = { err: e, dLat, dLon, lat, lon };
    }
  }
  row.bestPositionMatch = {
    dLatDeg: Number(best.dLat.toFixed(2)),
    dLonDeg: Number(best.dLon.toFixed(2)),
    // Ground distance of that offset, using the site's own latitude.
    groundKm: Number(
      (
        Math.hypot(best.dLat * 111.2, best.dLon * 111.2 * Math.cos((site.lat * Math.PI) / 180)) || 0
      ).toFixed(2)
    ),
    meanAbsDeg: Number(best.err.toFixed(2)),
    unshiftedMeanAbsDeg: Number(row.recomputed[0].vsShipped.meanAbsDeg.toFixed(2)),
  };

  const suns = row.recomputed.map((r) => r.sunAnyPct);
  row.resolutionSpreadPp = Math.max(...suns) - Math.min(...suns);
  row.shippedVsRecomputedPp = row.shipped.sunAnyPct - row.recomputed[0].sunAnyPct;
  out.sites.push(row);
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(out, null, 2));
} else {
  const f = (v, n = 6, d = 1) => v.toFixed(d).padStart(n);
  console.log('\nSELENE · horizon layer audit — can the shipped masks be reproduced?');
  console.log('Reference window: 365 d from the epoch, 6 h sampling, 720 azimuth bins');
  console.log(`Base grid: ${baseLabel}`);
  if (!FULL) {
    const saved = JSON.parse(readFileSync(resolve(root, 'tests/fixtures/horizon-audit.json'), 'utf8'));
    console.log(`Saved fixture was made in full mode from ${saved.base || 'the 400 m master'}; this run does not overwrite it.\n`);
  } else {
    console.log('');
  }
  if (!FULL) {
    console.log('NOTE  The 400 m master (assets-src/lola/sp-400m.bin) is not in this');
    console.log('      checkout, so the 400 m column is absent and the numbers will');
    console.log('      differ slightly from the table in SOURCES-AND-LIMITS.md §5d,\n      which was produced in full mode. Nothing else changes.\n');
  }
  for (const s of out.sites) {
    console.log(`${s.name}${s.published != null ? `   (published ${s.published}% illumination)` : ''}`);
    console.log(`  shipped mask      horizon ${f(s.shippedMask.min)} … ${f(s.shippedMask.max)}°   sun ${f(s.shipped.sunAnyPct)}%   earth ${f(s.shipped.earthAnyPct)}%`);
    for (const r of s.recomputed) {
      console.log(
        `  recomputed ${r.grid.padEnd(7)} horizon ${f(r.mask.min)} … ${f(r.mask.max)}°   sun ${f(r.sunAnyPct)}%   earth ${f(r.earthAnyPct)}%   ` +
          `Δmask ${f(r.vsShipped.meanAbsDeg, 5, 2)}° (max ${f(r.vsShipped.maxAbsDeg, 5, 2)}°)`
      );
    }
    console.log(
      `  → shipped − recomputed(${grids[0].label}) = ${s.shippedVsRecomputedPp >= 0 ? '+' : ''}${s.shippedVsRecomputedPp.toFixed(1)} pp` +
        `   ·   cell-size spread ${grids[0].label}→${grids[grids.length - 1].label} = ${s.resolutionSpreadPp.toFixed(1)} pp`
    );
    const b = s.bestPositionMatch;
    console.log(
      `  → best positional match: ${b.dLatDeg >= 0 ? '+' : ''}${b.dLatDeg}° lat, ${b.dLonDeg >= 0 ? '+' : ''}${b.dLonDeg}° lon ` +
        `(${b.groundKm} km on the ground) reduces the mask difference from ${b.unshiftedMeanAbsDeg}° to ${b.meanAbsDeg}°\n`
    );
  }
  const worst = out.sites.reduce((a, s) => (Math.abs(s.shippedVsRecomputedPp) > Math.abs(a.shippedVsRecomputedPp) ? s : a));
  console.log(
    `Largest disagreement: ${worst.name}, ${worst.shippedVsRecomputedPp.toFixed(1)} pp between the shipped mask and a ` +
      `recomputation from the shipped DEM.\n`
  );
  if (FULL) console.log('Writing tests/fixtures/horizon-audit.json …');
}

// The fixture is the input of `tests/horizon-audit.test.js`, which asserts a
// three-grid audit. A reduced run must not quietly replace it with a two-grid
// one, so it only writes in full mode (or on an explicit --write).
if (FULL || process.argv.includes('--write')) {
  mkdirSync(resolve(root, 'tests/fixtures'), { recursive: true });
  writeFileSync(resolve(root, 'tests/fixtures/horizon-audit.json'), JSON.stringify(out, null, 2));
  if (!process.argv.includes('--json')) console.log('done.');
} else if (!process.argv.includes('--json')) {
  console.log('done (fixture left untouched).');
}
