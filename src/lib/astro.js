/**
 * astro.js — the app's astronomy façade
 * ---------------------------------------------------------------------------
 * Everything the interface asks about the sky comes through here, and every
 * answer is derived from two real datasets:
 *
 *   1. `ephemeris.js` — JPL-grade vector ephemerides + the Moon's true
 *      rotation (pole, optical & physical libration), so the Sun and Earth
 *      directions are the real ones for the selected instant.
 *   2. `horizons.generated.js` — per-site terrain horizon masks computed from
 *      the LRO LOLA LDEM_80S_80M elevation model at 80 m/px.
 *
 * That is why the south pole behaves the way it really does: the Sun and the
 * Earth never climb more than a couple of degrees above the horizontal, and
 * light versus shadow is decided by the ridge line, not by altitude > 0.
 *
 * Conventions
 *   alt  degrees above the local horizontal (no refraction — no atmosphere)
 *   az   degrees clockwise from local north (toward the pole), through east
 *   fraction  share of the body's *disk* above the terrain horizon (0…1)
 *
 * This module is deliberately free of React and Three.js: `node --test`
 * imports it directly, and the 3D scene consumes the same numbers.
 */

import {
  skyFrame,
  siteSky,
  siteBasis,
  altAzFrom,
  selenoVector,
  vectorToSeleno,
  angularDiameterDeg,
  clamp,
  mod,
  wrap360,
  angDiff,
  MS_DAY,
  MS_HOUR,
  AU_KM,
  R_MOON_KM,
  R_EARTH_KM,
  R_SUN_KM,
} from './ephemeris.js';
import { HORIZONS, HORIZON_BINS } from './horizons.generated.js';
import { sampleHorizon, diskAboveHorizon } from './terrain.js';

export {
  MS_DAY,
  MS_HOUR,
  AU_KM,
  R_MOON_KM,
  R_EARTH_KM,
  R_SUN_KM,
  clamp,
  mod,
  wrap360,
  angDiff,
  skyFrame,
  siteBasis,
  altAzFrom,
  selenoVector,
  vectorToSeleno,
};

/**
 * Simulation epoch. No longer an anchor for any model — the ephemeris is
 * absolute — but it stays as the identity of the "demo mission" date.
 * 2026-01-03 10:03 UTC = full Moon (NASA SkyCal / timeanddate).
 */
export const EPOCH_MS = Date.UTC(2026, 0, 3, 10, 3, 0);

/** Nominal apparent radii (deg) — the live values come from the ephemeris. */
export const SUN_ANGULAR_RADIUS = 0.266;
export const EARTH_ANGULAR_RADIUS = 0.95;

/* ------------------------------------------------------------------ *
 * Selenographic sub-points (real, from the ephemeris)
 * ------------------------------------------------------------------ */

/** Selenographic coordinates of the sub-solar point at `ms`. */
export function sunSelenographic(ms) {
  return skyFrame(ms).subSolar;
}

/** Selenographic coordinates of the sub-Earth point at `ms`. */
export function earthSelenographic(ms) {
  return skyFrame(ms).subEarth;
}

/** Moon phase angle in degrees (0 = new, 180 = full) as seen from Earth. */
export function moonPhaseAngle(ms) {
  return skyFrame(ms).moonPhaseAngle;
}

/* ------------------------------------------------------------------ *
 * Terrain horizon
 * ------------------------------------------------------------------ */

/** The horizon mask for a site (720 bins, from LOLA), or null if unknown. */
export function horizonMask(site) {
  if (!site) return null;
  if (site.horizon instanceof Float32Array || Array.isArray(site.horizon)) return site.horizon;
  const entry = HORIZONS[site.id];
  return entry ? entry.horizon : null;
}

/** Terrain elevation angle (deg) in the direction of `az` from a site. */
export function horizonAt(site, az) {
  const mask = horizonMask(site);
  if (!mask) return 0; // unknown site: an ideal, flat horizon (documented)
  return sampleHorizon(mask, az);
}

/** Distance to the terrain sample that defines the horizon, in km. */
export function horizonRangeAt(site, az) {
  const entry = HORIZONS[site?.id];
  if (!entry) return 0;
  return sampleHorizon(entry.rangeKm, az);
}

/** Height of the site above the 1737.4 km reference sphere, in metres. */
export function siteElevation(site) {
  return HORIZONS[site?.id]?.elevation ?? 0;
}

/** Is the body's centre above the local terrain horizon? */
export function isVisible(site, alt, az) {
  return alt > horizonAt(site, az);
}

/**
 * Fraction of a circular disk standing above a straight horizon line.
 * Exact circular-segment geometry; the same function feeds the metrics, the
 * cards and the 3D shading, so they can never disagree.
 */
export function diskVisibleFraction(alt, horizon, radiusDeg) {
  return diskAboveHorizon(alt, horizon, radiusDeg);
}

/* ------------------------------------------------------------------ *
 * Topocentric state
 * ------------------------------------------------------------------ */

/** Sun altitude/azimuth from a site at an instant (geometry only). */
export function sunPosition(site, ms) {
  const s = siteSky(site, ms);
  return { alt: s.sun.alt, az: s.sun.az, distKm: s.sun.distKm };
}

/** Earth altitude/azimuth from a site at an instant (geometry only). */
export function earthPosition(site, ms) {
  const s = siteSky(site, ms);
  return { alt: s.earth.alt, az: s.earth.az, distKm: s.earth.distKm };
}

/**
 * Instantaneous state of both bodies as seen from a site.
 *
 * `fraction` is the share of the disk above the terrain — the honest quantity
 * and the one the KPIs average. `visible` keeps the simple "any part of the
 * disk is up" meaning used by the badges.
 */
export function skyState(site, ms) {
  const s = siteSky(site, ms);
  const sunHorizon = horizonAt(site, s.sun.az);
  const earthHorizon = horizonAt(site, s.earth.az);
  const sunRadius = s.sun.angularRadius;
  const earthRadius = s.earth.angularRadius;
  const sunFraction = diskAboveHorizon(s.sun.alt, sunHorizon, sunRadius);
  const earthFraction = diskAboveHorizon(s.earth.alt, earthHorizon, earthRadius);

  return {
    ms: Math.round(ms),
    sun: {
      alt: s.sun.alt,
      az: s.sun.az,
      horizon: sunHorizon,
      fraction: sunFraction,
      visible: sunFraction > 0,
      full: sunFraction > 0.999,
      distKm: s.sun.distKm,
      angularRadius: sunRadius,
      angularDiameter: 2 * sunRadius,
    },
    earth: {
      alt: s.earth.alt,
      az: s.earth.az,
      horizon: earthHorizon,
      fraction: earthFraction,
      visible: earthFraction > 0,
      full: earthFraction > 0.999,
      distKm: s.earth.distKm,
      angularRadius: earthRadius,
      angularDiameter: 2 * earthRadius,
      phaseAngle: s.earth.phaseAngle,
      illumination: s.earth.illum,
    },
    subSolar: s.sunSeleno,
    subEarth: s.earthSeleno,
    frame: s.frame,
  };
}

/* ------------------------------------------------------------------ *
 * Lunar calendar helpers
 * ------------------------------------------------------------------ */

/** Local solar hour at a site: 0 = Sun on the meridian, 12 = anti-meridian. */
export function lunarLocalTime(site, ms) {
  return wrap360(sunSelenographic(ms).lon - site.lon) / 15;
}

/** Moon phase as a fraction of the cycle: 0 = new, 0.5 = full (from Earth). */
export function moonPhase(ms) {
  return wrap360(moonPhaseAngle(ms)) / 360;
}

/** Human-readable lunar phase name. */
export function phaseName(p) {
  const names = [
    'New Moon',
    'Waxing Crescent',
    'First Quarter',
    'Waxing Gibbous',
    'Full Moon',
    'Waning Gibbous',
    'Last Quarter',
    'Waning Crescent',
  ];
  return names[Math.floor(mod(p * 8 + 0.5, 8)) % 8];
}

/**
 * Altitude/azimuth of a body from a site, given the body's selenographic
 * sub-point. Kept as the small spherical helper the tests exercise: it is the
 * closed form that `siteSky()` reproduces with vectors.
 */
export function altAz(siteLat, siteLon, bodyLon, bodyLat) {
  // Implemented through the same vector algebra the 3D scene uses, so the two
  // can never disagree: build the site's local frame, put the body on the unit
  // sphere at its sub-point, and project.
  return altAzFrom(siteBasis(siteLat, siteLon), selenoVector(bodyLat, bodyLon));
}

/** Apparent angular diameter (deg) of a body at a distance, from its radius. */
export { angularDiameterDeg, HORIZON_BINS };
