#!/usr/bin/env node
/**
 * build-horizons.mjs — turn the DEM survey output into a plain JS module.
 *
 * `public/data/lola/horizons.json` is written by `scripts/build-terrain.py`
 * (real LOLA LDEM_80S_80M data, 80 m/px horizon ray march to 302 km). The app
 * needs those masks *synchronously* — every metric, card and chart reads them
 * on the first render — so they are inlined here as a generated module instead
 * of being fetched. ~30 KB, gzip ~9 KB.
 *
 * Run:  node scripts/build-horizons.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';

const json = JSON.parse(readFileSync('public/data/lola/horizons.json', 'utf8'));
const round1 = (v) => Math.round(v * 10) / 10;

const lines = [];
lines.push('/**');
lines.push(' * horizons.generated.js — GENERATED FILE, DO NOT EDIT BY HAND.');
lines.push(' *');
lines.push(` * Source   : ${json.source}`);
lines.push(` * Method   : ${json.method}`);
lines.push(` * Azimuths : ${json.azimuthConvention}`);
lines.push(` * Generated: ${json.generated} by scripts/build-terrain.py + build-horizons.mjs`);
lines.push(' *');
lines.push(' * horizon[site][bin] = maximum terrain elevation angle (degrees) in that');
lines.push(' * azimuth sector, starting at north and going clockwise through east.');
lines.push(' * rangeKm[site][bin] = ground distance (km) to the terrain sample that');
lines.push(' * sets that angle. elevation = site height above the 1737.4 km sphere.');
lines.push(' */');
lines.push('');

const entries = Object.entries(json.sites);
lines.push('export const HORIZON_BINS = 720;');
lines.push('');
lines.push('const H = {');
for (const [id, s] of entries) {
  lines.push(`  '${id}': {`);
  lines.push(`    lat: ${json.sites[id].lat}, lon: ${json.sites[id].lon}, elevation: ${s.elevation},`);
  lines.push(`    maxElevation: ${s.maxElevation}, minElevation: ${s.minElevation},`);
  lines.push(`    horizon: [${s.horizon.map(round1).join(',')}],`);
  lines.push(`    rangeKm: [${s.rangeKm.map((v) => Math.round(v)).join(',')}],`);
  lines.push('  },');
}
lines.push('};');
lines.push('');
lines.push('export const HORIZONS = H;');
lines.push('');
lines.push('/** Local LOLA grids shipped for the 3D surface view (160 m/px, 61 km). */');
lines.push('export const TERRAIN_CROPS = {');
for (const [id, c] of Object.entries(json.crops)) {
  lines.push(
    `  '${id}': { file: 'data/lola/${id}-160m.binz', width: 384, height: 384, px: 160, originLine: ${c.centerLine - 384}, originSample: ${c.centerSample - 384}, elevation: ${c.centerElevation}, lat: ${json.sites[id].lat}, lon: ${json.sites[id].lon} },`
  );
}
lines.push('};');
lines.push('');
lines.push('// Whole-cap backdrop, 800 m/px — see scripts/pack-terrain.mjs.');
lines.push(`export const REGIONAL_DEM = { file: 'data/lola/sp-800m.binz', width: 760, height: 760, px: 800, originLine: 0, originSample: 0 };`);
lines.push('');
lines.push(`export const TERRAIN_META = ${JSON.stringify(
  {
    source: json.source,
    referenceRadiusKm: json.referenceRadiusKm,
    method: json.method,
    azimuthConvention: json.azimuthConvention,
    generated: json.generated,
  },
  null,
  2
)};`);
lines.push('');

writeFileSync('src/lib/horizons.generated.js', lines.join('\n'));
console.log(`wrote src/lib/horizons.generated.js (${entries.length} sites, ${(lines.join('\n').length / 1024).toFixed(1)} KB)`);
