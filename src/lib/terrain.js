/**
 * terrain.js — the LOLA layer: heights, and the horizon that decides light
 * ---------------------------------------------------------------------------
 * The poles of the Moon are not lit by the Sun's altitude above 0°. They are
 * lit by the Sun's altitude above *the local ridge line*, which is why a site
 * a few hundred metres higher sees the Sun for 80 % of the year while the
 * crater floor next to it never does. That ridge line is computed here, from
 * the real LRO LOLA digital elevation model.
 *
 * DATA
 *   The grids come from **LDEM_80S_80M** (PDS, LRO-L-LOLA-4-GDR, 80 m/px, polar
 *   stereographic, ~80°S–90°S), block averaged: 160 m/px (2×2) around each
 *   site for the surface scene, and 800 m/px for the whole-cap backdrop. The
 *   *horizon masks* shipped in `horizons.generated.js` are always computed from
 *   the native 80 m grid.
 *
 *   On disk each grid is a 2-D second difference of the Int16 heights, gzipped
 *   (`*.binz`, 1.4 MB for all seven grids instead of 6.2 MB). The transform
 *   is exact — see `lola-codec.js` — and is undone at load time with the
 *   platform's `DecompressionStream`, so no dependency is added.
 *
 * MATH
 *   For each azimuth the module ray-marches the DEM out to 302 km and keeps
 *   the maximum elevation angle above the local horizontal, including lunar
 *   curvature (a 30 km ridge is 260 m below the horizon plane — ignoring that
 *   would invent sunlight that does not exist).
 *
 *   elevation = atan2( Rₚ·cos θ − Rₛ , Rₚ·sin θ ),  θ = s / Rₛ
 *
 *   with Rₛ = R₀ + h(site), Rₚ = R₀ + h(point), s = ground distance.
 *   No atmospheric refraction (there is no atmosphere), no DEM void filling.
 *
 * Pure module: no DOM, no Three.js. `node --test` exercises it directly.
 */

import { decodeGrid } from './lola-codec.js';

export const R_MOON_M = 1737400.0;
export const POLAR_DEM = {
  lines: 7600,
  samples: 7600,
  px: 80, // metres per pixel at the pole
  lineOffset: 3799.5,
  sampleOffset: 3799.5,
};

/** Selenographic (lat, lon) → fractional (line, sample) in the polar DEM. */
export function selenoToPolarPx(latDeg, lonDeg, dem = POLAR_DEM) {
  const rho = 2 * R_MOON_M * Math.tan(((90 + latDeg) * Math.PI) / 180 / 2);
  const a = (lonDeg * Math.PI) / 180;
  return {
    line: dem.lineOffset - (rho * Math.cos(a)) / dem.px,
    sample: dem.sampleOffset + (rho * Math.sin(a)) / dem.px,
  };
}

/** Inverse: fractional (line, sample) → selenographic (lat, lon). */
export function polarPxToSeleno(line, sample, dem = POLAR_DEM) {
  const x = (sample - dem.sampleOffset) * dem.px;
  const y = (dem.lineOffset - line) * dem.px;
  const rho = Math.hypot(x, y);
  return {
    lat: -(90 - (2 * Math.atan(rho / (2 * R_MOON_M)) * 180) / Math.PI),
    lon: ((Math.atan2(x, y) * 180) / Math.PI + 360) % 360,
  };
}

/* ------------------------------------------------------------------ *
 * Height fields
 * ------------------------------------------------------------------ */

/**
 * A rectangular patch of a polar-stereographic DEM.
 * `data` is an Int16Array of metres; index = line * width + sample.
 */
export class Heightfield {
  /**
   * @param {object} o
   * @param {Int16Array} o.data       metres, row-major
   * @param {number} o.width          cells per row
   * @param {number} o.height         rows
   * @param {number} o.px             metres per cell of *this* grid
   * @param {number} o.originLine     polar-DEM pixel where cell (0,0) starts
   * @param {number} o.originSample   idem for the sample axis
   */
  constructor({ data, width, height, px, originLine = 0, originSample = 0, name = 'dem' }) {
    this.data = data;
    this.width = width;
    this.height = height;
    this.px = px;
    this.originLine = originLine;
    this.originSample = originSample;
    this.name = name;
    // scale from polar-DEM pixels to cells of this grid (80 m / 400 m = 0.2)
    this.cellsPerDemPx = POLAR_DEM.px / px;
  }

  /** Polar-DEM fractional pixel → fractional index in this grid. */
  toLocal(line, sample) {
    return {
      line: (line - this.originLine) * this.cellsPerDemPx,
      sample: (sample - this.originSample) * this.cellsPerDemPx,
    };
  }

  /** From raw little-endian Int16 bytes (tests, and any unpacked grid). */
  static fromBuffer(buffer, meta) {
    const data = new Int16Array(buffer);
    return new Heightfield({ ...meta, data, width: meta.width, height: meta.height });
  }

  /** From already-decoded heights (the shipped `.binz` path). */
  static fromHeights(heights, meta) {
    return new Heightfield({ ...meta, data: heights, width: meta.width, height: meta.height });
  }

  /** Bilinear height at fractional (line, sample) inside this patch. */
  sample(line, sample) {
    const w = this.width;
    const h = this.height;
    const l = Math.min(h - 1.001, Math.max(0, line));
    const s = Math.min(w - 1.001, Math.max(0, sample));
    const l0 = Math.floor(l);
    const s0 = Math.floor(s);
    const fl = l - l0;
    const fs = s - s0;
    const i = l0 * w + s0;
    const a = this.data[i];
    const b = this.data[i + 1];
    const c = this.data[i + w];
    const d = this.data[i + w + 1];
    return a * (1 - fl) * (1 - fs) + b * fl * (1 - fs) + c * (1 - fl) * fs + d * fl * fs;
  }

  /**
   * Height averaged over a (2k+1)² cell box, in metres. LOLA's 80 m grid
   * carries single-pixel dropouts; a landing-site horizon should be computed on
   * a surface that is honest at the scale of a lander footprint and its
   * surrounding slopes, not at the scale of one noisy sample.
   */
  sampleBox(line, sample, k = 1) {
    let sum = 0;
    let n = 0;
    for (let dl = -k; dl <= k; dl++) {
      for (let ds = -k; ds <= k; ds++) {
        sum += this.sample(line + dl, sample + ds);
        n++;
      }
    }
    return sum / n;
  }

  /** Height at a selenographic coordinate (patch is in the whole-capon grid). */
  sampleSeleno(latDeg, lonDeg) {
    const p = selenoToPolarPx(latDeg, lonDeg);
    const l = this.toLocal(p.line, p.sample);
    return this.sample(l.line, l.sample);
  }
}

/* ------------------------------------------------------------------ *
 * Horizon masks
 * ------------------------------------------------------------------ */

/**
 * Maximum terrain elevation angle per azimuth, seen from (lat, lon).
 *
 * @param {Heightfield} field
 * @param {number} latDeg
 * @param {number} lonDeg
 * @param {object} opts { bins, maxRangeKm, stepM, smooth }
 *   `smooth` averages a (2·smooth+1)² box per sample (1 = 3×3, i.e. 240 m on
 *   the native grid) to suppress single-pixel LOLA dropouts.
 * @returns {{ horizon: Float32Array, rangeKm: Float32Array, elevation: number }}
 */
export function horizonFromField(field, latDeg, lonDeg, opts = {}) {
  const bins = opts.bins ?? 720;
  const maxRangeM = (opts.maxRangeKm ?? 302) * 1000;
  const stepM = opts.stepM ?? 80;
  const smooth = opts.smooth ?? 1;
  const centre = selenoToPolarPx(latDeg, lonDeg);

  // Local north in the map plane points at the pole (the map centre).
  const x0 = (centre.sample - POLAR_DEM.sampleOffset) * POLAR_DEM.px;
  const y0 = (POLAR_DEM.lineOffset - centre.line) * POLAR_DEM.px;
  const n0 = Math.hypot(x0, y0) || 1;
  const nx = -x0 / n0;
  const ny = -y0 / n0;
  const ex = -ny;
  const ey = nx;

  const local = field.toLocal(centre.line, centre.sample);
  const h0 = field.sampleBox(local.line, local.sample, smooth);
  const Rs = R_MOON_M + h0;

  const horizon = new Float32Array(bins);
  const rangeKm = new Float32Array(bins);
  const steps = Math.floor(maxRangeM / stepM);

  for (let b = 0; b < bins; b++) {
    const az = (b * 2 * Math.PI) / bins;
    const ca = Math.cos(az);
    const sa = Math.sin(az);
    const dx = ca * nx + sa * ex;
    const dy = ca * ny + sa * ey;
    let best = -90;
    let bestR = 0;
    for (let k = 1; k <= steps; k++) {
      const s = k * stepM;
      const px = x0 + dx * s;
      const py = y0 + dy * s;
      if (Math.hypot(px, py) > 303000) break; // outside the 80°S cap
      const line = POLAR_DEM.lineOffset - py / POLAR_DEM.px;
      const sample = POLAR_DEM.sampleOffset + px / POLAR_DEM.px;
      const loc = field.toLocal(line, sample);
      const h = field.sampleBox(loc.line, loc.sample, smooth) - smooth * 0;
      const th = s / Rs;
      const Rp = R_MOON_M + h;
      const elev = (Math.atan2(Rp * Math.cos(th) - Rs, Rp * Math.sin(th)) * 180) / Math.PI;
      if (elev > best) {
        best = elev;
        bestR = s;
      }
    }
    horizon[b] = best;
    rangeKm[b] = bestR / 1000;
  }
  return { horizon, rangeKm, elevation: h0 };
}

/** Linear interpolation of a horizon mask at an azimuth (degrees). */
export function sampleHorizon(mask, azDeg) {
  if (!mask || !mask.length) return -90;
  const n = mask.length;
  const x = (((azDeg % 360) + 360) % 360) * (n / 360);
  const i0 = Math.floor(x) % n;
  const i1 = (i0 + 1) % n;
  const f = x - Math.floor(x);
  return mask[i0] * (1 - f) + mask[i1] * f;
}

/**
 * Fraction of a disk of angular radius `radiusDeg` centred at `altDeg` that
 * stands above a straight horizon at `horizonDeg`.
 * Straight-edge approximation: exact enough at 0.27°, and it is the same
 * formula the metrics use, so the UI and the scene cannot disagree.
 */
export function diskAboveHorizon(altDeg, horizonDeg, radiusDeg) {
  const d = altDeg - horizonDeg; // centre above the horizon line
  if (d >= radiusDeg) return 1;
  if (d <= -radiusDeg) return 0;
  // Visible part = whole disk minus the circular cap that sits below the
  // horizon line. With the centre `d` above the line, the cap has height r − d,
  // so its area is  r²·acos(d/r) − d·√(r² − d²).
  const r = radiusDeg;
  const a = Math.acos(Math.max(-1, Math.min(1, d / r)));
  const cap = r * r * a - d * Math.sqrt(Math.max(0, r * r - d * d));
  return Math.max(0, Math.min(1, 1 - cap / (Math.PI * r * r)));
}

/* ------------------------------------------------------------------ *
 * Browser loaders
 * ------------------------------------------------------------------ */

/**
 * Fetch and decode one of the shipped LOLA crops and return everything the 3D
 * scene needs: heights, the local map basis, and a sampler that takes metres
 * east/north of the site.
 */
export async function loadSiteTerrain(meta) {
  const res = await fetch(`${import.meta.env.BASE_URL ?? '/'}${meta.file}`);
  if (!res.ok) throw new Error(`terrain ${meta.file}: ${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  const heights = await decodeGrid(buf, meta.width, meta.height);
  const field = Heightfield.fromHeights(heights, meta);

  // Local north/east inside the polar-stereographic plane at this site.
  const centre = selenoToPolarPx(meta.lat, meta.lon);
  const x0 = (centre.sample - POLAR_DEM.sampleOffset) * POLAR_DEM.px;
  const y0 = (POLAR_DEM.lineOffset - centre.line) * POLAR_DEM.px;
  const n0 = Math.hypot(x0, y0) || 1;
  const nx = -x0 / n0;
  const ny = -y0 / n0;
  const ex = -ny;
  const ey = nx;

  const local = field.toLocal(centre.line, centre.sample);
  const centerHeight = field.sample(local.line, local.sample);

  return {
    centerHeight,
    mapBasis: { nx, ny, ex, ey },
    /** Height (m) at an offset in metres east/north of the site. */
    sampleOffset(eastM, northM) {
      const mx = eastM * ex + northM * nx;
      const my = eastM * ey + northM * ny;
      const line = centre.line - my / POLAR_DEM.px;
      const sample = centre.sample + mx / POLAR_DEM.px;
      const l = field.toLocal(line, sample);
      return field.sample(l.line, l.sample);
    },
  };
}
