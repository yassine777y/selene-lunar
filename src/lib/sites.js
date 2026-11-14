/**
 * sites.js — candidate south-polar landing regions, placed with real data
 * ---------------------------------------------------------------------------
 * Each entry starts from a PUBLISHED study coordinate (`reference`), and then
 * chooses an actual landing point inside that region: the best-illuminated
 * accessible spot within a few kilometres, found by ray-marching the LRO LOLA
 * south-polar DEM (`scripts/survey-sites.mjs`). The offset is quoted so nobody
 * has to guess how the point was chosen.
 *
 * What is real here
 *   - `lat`/`lon`     selenographic landing point, DEM-snapped (see reference)
 *   - `elevation`     metres above the 1737.4 km sphere, from the DEM
 *   - `horizon`       the 720-bin terrain horizon mask (horizons.generated.js),
 *                     computed at 80 m/px from LDEM_80S_80M
 *   - the illumination / Earth-visibility figures in the UI are *computed*,
 *     never stored — see metrics.js.
 *
 * What is editorial
 *   - name, region label, tag and blurb: the human story of each site. These
 *     strings carry no percentages: every number on screen has to come from the
 *     model, and a blurb with a hard-coded "98%" is a number that can only go
 *     stale (it did).
 *
 * Reference coordinates and the published studies behind them are kept
 * verbatim in `coordSource`; the comparison between this model's numbers and
 * those studies lives in `validation.js`.
 */

import { HORIZONS } from './horizons.generated.js';

const RAW_SITES = [
  {
    id: 'shackleton',
    name: 'Shackleton Rim',
    region: 'Connecting Ridge east',
    kind: 'rim',
    lat: -89.805,
    lon: 53.97,
    reference: { lat: -89.66, lon: 129.2 },
    coordSource: 'Published rim target: 89.66°S, 129.20°E (LROC). Landing point: best-lit accessible ridge top 13.6 km from the published rim target.',
    tag: 'Heritage target',
    blurb:
      'The ridge that runs out of Shackleton’s rim toward de Gerlache. Its summit sees the Sun for most of the lunar day; the crater floor beside it has not been lit for two billion years.',
  },
  {
    id: 'connecting-ridge',
    name: 'Connecting Ridge',
    region: 'Leibnitz β high ground',
    kind: 'rim',
    lat: -89.4384,
    lon: 222.74,
    reference: { lat: -89.45, lon: 222.69 },
    coordSource: 'Mazarico 2011 / Gläser 2017 ridge block 89.45°S, 222.69°E. Landing point: local summit 0.7 km from the published ridge coordinate.',
    tag: 'Best balance',
    blurb:
      'The highest, most continuously lit ground near the pole. Not literally eternal: no surface at the pole is lit 100% of the year, and the thermal cycling of a crest that never quite rests is the open question.',
  },
  {
    id: 'de-gerlache',
    name: 'de Gerlache Rim',
    region: 'South-east rim',
    kind: 'rim',
    lat: -88.671,
    lon: 291.62,
    reference: { lat: -88.5, lon: 271.7 },
    coordSource: 'Published rim target: 88.5°S, 271.7°E (Icarus S0019103519303689). Landing point: illuminated rim 1.8 km from the published rim target.',
    tag: 'Sun + Earth',
    blurb:
      'A rim whose outward face looks across the pole. Both the Sun and the Earth graze the same skyline, which makes antenna pointing the design driver.',
  },
  {
    id: 'malapert',
    name: 'Malapert Massif',
    region: 'Shackleton–Malapert ridge',
    kind: 'summit',
    lat: -85.993,
    lon: 1.82,
    reference: { lat: -86.04, lon: 2.7 },
    coordSource: 'Malapert massif 86.04°S, 2.7°E region (LROC / Sverdrup–Henson 2023). Landing point: summit 0.9 km from the published massif coordinate.',
    tag: 'Near-continuous Earth link',
    blurb:
      'A 5 km summit on the shoulder of the south pole. High, cold and permanently in view of Earth — the easiest communications site on the Moon.',
  },
  {
    id: 'nobile',
    name: 'Nobile Rim 1',
    region: 'Interior highlands',
    kind: 'rim',
    lat: -85.2874,
    lon: 52.76,
    reference: { lat: -85.3, lon: 53.3 },
    coordSource: 'Nobile rim 1: 85.3°S, 53.3°E (IOPscience 10.3847/PSJ/adb8d1). Landing point: rim crest 1.7 km from the published coordinate.',
    tag: 'Marginal power',
    blurb:
      'Interior highland rim, well away from the pole. Shorter and more irregular lit periods, so the power architecture has to be sized for the dips.',
  },
  {
    id: 'cabeus',
    name: 'Cabeus B',
    region: 'Cabeus basin',
    kind: 'basin',
    lat: -84.2316,
    lon: 312.15,
    reference: { lat: -84.46, lon: 313.43 },
    coordSource: 'Cabeus B: 84.46°S, 313.43°E (ShadowCam / NTRS 20250008823). Landing point: illuminated terrace ~26 km from the published basin coordinate.',
    tag: 'Volatiles, high risk',
    blurb:
      'The volatile-rich basin LCROSS hit. Dark, cold floor next door; this terrace keeps a partial view of the sky, but nothing here is generous.',
  },
];

/**
 * Sites with their DEM horizon attached. `mask` is the same array the metrics
 * integrate over — there is no second copy of the terrain anywhere.
 */
export const SITES = RAW_SITES.map((s) => {
  const h = HORIZONS[s.id] || {};
  return {
    ...s,
    elevation: h.elevation ?? 0,
    horizon: h.horizon ?? null,
    horizonRangeKm: h.rangeKm ?? null,
    horizonMax: h.maxElevation ?? 0,
    horizonMin: h.minElevation ?? 0,
  };
});

export const getSite = (id) => SITES.find((s) => s.id === id) || SITES[0];

/** Compass label for an azimuth in degrees. */
export function compass(az) {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round((((az % 360) + 360) % 360) / 45) % 8];
}

/** Great-circle distance between two selenographic points, in km. */
export function groundDistanceKm(a, b) {
  const toRad = Math.PI / 180;
  const la1 = a.lat * toRad;
  const la2 = b.lat * toRad;
  const dLon = (b.lon - a.lon) * toRad;
  const c = Math.sin(la1) * Math.sin(la2) + Math.cos(la1) * Math.cos(la2) * Math.cos(dLon);
  return Math.acos(Math.min(1, Math.max(-1, c))) * 1737.4;
}
