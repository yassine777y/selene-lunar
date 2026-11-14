/**
 * ephemeris.js — real ephemerides + the Moon's true orientation
 * ---------------------------------------------------------------------------
 * This is the numerical backbone of Selene. Nothing in the app is allowed to
 * invent a position: the Moon's orientation, the Sun and the Earth directions,
 * the distances and the angular sizes all come from here.
 *
 * EPHEMERIS
 *   `astronomy-engine` (Don Cross) is used as the vector ephemeris. Its lunar
 *   theory is ELP-2000/82 truncated to a few hundred terms, and it reproduces
 *   JPL DE ephemerides to about 1 arcminute in the Moon's geocentric direction
 *   and a few km in distance over 1900–2100. The Sun and the Earth use VSOP87
 *   with a small relativistic correction. Cross-checked against JPL Horizons in
 *   `tests/ephemeris.test.js` (three dates, sub-observer / sub-solar points).
 *
 * MOON ORIENTATION
 *   Two ingredients, both real:
 *     1. the Moon's rotation pole, from `RotationAxis()`, which is the IAU
 *        north pole including the physical libration of the rotation axis;
 *     2. the optical libration, from `Libration()` — the selenographic
 *        longitude/latitude of the sub-Earth point (optical + physical).
 *   The body-fixed frame is then built as
 *        Z = pole,  X = rotate(projection of the Earth direction, -lon),
 *        Y = Z × X,
 *   which places the sub-Earth point at (lat = elat, lon = elon) and the
 *   sub-solar point where the real Sun puts it. Both were checked against
 *   Horizons: latitude to 0.001°, longitude to 0.01° on four dates.
 *
 * CONVENTIONS
 *   - Frames: EQJ (J2000 Earth equator/equinox) for vectors, selenographic
 *     body-fixed for everything the site sees. Public functions return plain
 *     `{x, y, z}` objects so this module stays free of Three.js and can run
 *     under `node --test`.
 *   - Selenographic: latitude +north, longitude +east, 0/0 = mean sub-Earth
 *     point (the IAU/ME convention used by every lunar map).
 *   - Azimuth: degrees clockwise from local north (toward the pole), through
 *     east. Altitude: degrees above the local horizontal, refraction ignored
 *     (the Moon has no meaningful atmosphere).
 *
 * Limits are listed in SCENE-NOTES.md. In short: arcminute-class direction
 * accuracy, kilometre-class distances, and no terrain-free horizon anywhere —
 * see terrain.js for the LOLA layer that decides light and shadow.
 */

import * as A from 'astronomy-engine';

/* ------------------------------------------------------------------ *
 * Constants (IAU 2015 nominal values)
 * ------------------------------------------------------------------ */
export const MS_DAY = 86400000;
export const MS_HOUR = 3600000;
export const AU_KM = 149597870.7;
export const R_MOON_KM = 1737.4;
export const R_EARTH_KM = 6371.0;
export const R_SUN_KM = 695700.0;

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

/* ------------------------------------------------------------------ *
 * Vector helpers (plain objects, no allocation-heavy classes)
 * ------------------------------------------------------------------ */
export const vec = (x = 0, y = 0, z = 0) => ({ x, y, z });
export const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross = (a, b) => vec(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
export const sub = (a, b) => vec(a.x - b.x, a.y - b.y, a.z - b.z);
export const scale = (a, s) => vec(a.x * s, a.y * s, a.z * s);
export const add = (a, b) => vec(a.x + b.x, a.y + b.y, a.z + b.z);
export const length = (a) => Math.hypot(a.x, a.y, a.z);
export const normalize = (a) => {
  const n = Math.hypot(a.x, a.y, a.z) || 1;
  return vec(a.x / n, a.y / n, a.z / n);
};
/** Reject the component of `a` parallel to unit `n`, then renormalise. */
export const project = (a, n) => normalize(sub(a, scale(n, dot(a, n))));

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const mod = (v, m) => ((v % m) + m) % m;
export const wrap360 = (deg) => mod(deg, 360);
export const angDiff = (a, b) => mod(a - b + 180, 360) - 180;

/* ------------------------------------------------------------------ *
 * Selenographic sphere
 * ------------------------------------------------------------------ */

/** Unit vector of a selenographic point in the body-fixed frame. */
export function selenoVector(latDeg, lonDeg) {
  const la = latDeg * DEG;
  const lo = lonDeg * DEG;
  return vec(Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la));
}

/** Inverse of `selenoVector`. */
export function vectorToSeleno(v) {
  const n = normalize(v);
  return { lat: Math.asin(clamp(n.z, -1, 1)) * RAD, lon: wrap360(Math.atan2(n.y, n.x) * RAD) };
}

/**
 * Orthonormal local basis at a site, expressed in the body-fixed frame:
 * `up` (radial), `north` (toward the pole along the surface), `east`.
 */
export function siteBasis(latDeg, lonDeg) {
  const la = latDeg * DEG;
  const lo = lonDeg * DEG;
  const up = selenoVector(latDeg, lonDeg);
  const east = vec(-Math.sin(lo), Math.cos(lo), 0);
  const north = cross(up, east); // right-handed (east, north, up)
  return { up, east, north };
}

/** Altitude / azimuth of a body-fixed direction as seen from a site basis. */
export function altAzFrom(basis, dir) {
  const alt = Math.asin(clamp(dot(dir, basis.up), -1, 1)) * RAD;
  const az = wrap360(Math.atan2(dot(dir, basis.east), dot(dir, basis.north)) * RAD);
  return { alt, az };
}

/* ------------------------------------------------------------------ *
 * Frame: EQJ → selenographic body-fixed
 * ------------------------------------------------------------------ */
const frameCache = new Map();
const CACHE_LIMIT = 6000;

/**
 * The Moon's orientation and the geometry of Sun/Earth at instant `ms`.
 * Site-independent, memoised — evaluating six sites at the same timestamp
 * costs one ephemeris pass, which is what keeps the scrubber at 60 fps.
 */
export function skyFrame(ms) {
  const key = Math.round(ms);
  const hit = frameCache.get(key);
  if (hit) return hit;

  const t = A.MakeTime(new Date(key));
  const axis = A.RotationAxis(A.Body.Moon, t);
  const lib = A.Libration(t);
  const moon = A.GeoVector(A.Body.Moon, t, true); // geocentric, EQJ, AU
  const sun = A.GeoVector(A.Body.Sun, t, true);

  // Selenographic axes in EQJ.
  const P = normalize(vec(axis.north.x, axis.north.y, axis.north.z)); // +Z (north pole)
  const earthGeo = normalize(scale(moon, -1)); // Moon → Earth
  const sunGeo = normalize(sub(sun, moon)); // Moon → Sun
  const X0 = project(earthGeo, P);
  const Y0 = cross(P, X0);
  const th = -lib.elon * DEG; // validated against Horizons sub-Earth longitude
  const X = add(scale(X0, Math.cos(th)), scale(Y0, Math.sin(th)));
  const Y = sub(scale(Y0, Math.cos(th)), scale(X0, Math.sin(th)));

  const toBody = (v) => vec(dot(v, X), dot(v, Y), dot(v, P));

  const earthDistKm = length(moon) * AU_KM;
  const sunDistKm = length(sub(sun, moon)) * AU_KM;

  // Earth's illuminated fraction as seen from the Moon.
  const sunToEarth = normalize(sub(moon, sun)); // Sun → Earth
  const earthToMoon = normalize(scale(moon, -1)); // Earth → Moon
  const phaseAngle = Math.acos(clamp(dot(sunToEarth, earthToMoon), -1, 1)) * RAD;
  const earthIllum = (1 + Math.cos(phaseAngle * DEG)) / 2;

  const frame = {
    ms: key,
    axes: { X, Y, P }, // body → EQJ
    toBody,
    toEqj: (v) => add(add(scale(X, v.x), scale(Y, v.y)), scale(P, v.z)),
    sunBody: toBody(sunGeo),
    earthBody: toBody(earthGeo),
    sunEqj: sunGeo,
    earthEqj: earthGeo,
    earthDistKm,
    sunDistKm,
    earthAngularRadius: Math.asin(Math.min(1, R_EARTH_KM / earthDistKm)) * RAD,
    sunAngularRadius: Math.asin(Math.min(1, R_SUN_KM / sunDistKm)) * RAD,
    earthPhaseAngle: phaseAngle,
    earthIllum,
    // Sub-Earth point taken from our own body frame rather than from the
    // Libration() shortcut: same number to 0.02°, but derived from the same
    // axes that place the texture, so the map and the numbers cannot drift
    // apart. (Both were checked against Horizons in tests/ephemeris.test.js.)
    subEarth: vectorToSeleno(toBody(earthGeo)),
    subSolar: vectorToSeleno(toBody(sunGeo)),
    /** Greenwich apparent sidereal time (hours) — drives the Earth's spin. */
    gast: A.SiderealTime(t),
    moonPhaseAngle: A.MoonPhase(t),
    libration: { elat: lib.elat, elon: lib.elon, mlat: lib.mlat, mlon: lib.mlon },
  };

  if (frameCache.size > CACHE_LIMIT) frameCache.clear();
  frameCache.set(key, frame);
  return frame;
}

/** Clear the memo (tests call this when they want a cold run). */
export function clearFrameCache() {
  frameCache.clear();
}

/* ------------------------------------------------------------------ *
 * What a site sees
 * ------------------------------------------------------------------ */

/**
 * Topocentric Sun/Earth geometry for a selenographic site, at instant `ms`.
 * No horizon here: `alt`/`az` are geometric. Terrain occlusion is applied by
 * `horizonAt()` in astro.js, so the two layers stay separable and testable.
 */
export function siteSky(site, ms) {
  const frame = skyFrame(ms);
  const basis = siteBasis(site.lat, site.lon);
  const sun = altAzFrom(basis, frame.sunBody);
  const earth = altAzFrom(basis, frame.earthBody);
  return {
    frame,
    basis,
    sun: { alt: sun.alt, az: sun.az, distKm: frame.sunDistKm, angularRadius: frame.sunAngularRadius },
    earth: {
      alt: earth.alt,
      az: earth.az,
      distKm: frame.earthDistKm,
      angularRadius: frame.earthAngularRadius,
      phaseAngle: frame.earthPhaseAngle,
      illum: frame.earthIllum,
    },
    sunSeleno: frame.subSolar,
    earthSeleno: frame.subEarth,
  };
}

/** Body-fixed unit direction of the Sun / Earth at `ms` (for the 3D scene). */
export function bodyDirections(ms) {
  const f = skyFrame(ms);
  return { sun: f.sunBody, earth: f.earthBody, axes: f.axes, frame: f };
}

/* ------------------------------------------------------------------ *
 * Small shared helpers used by the UI and the charts
 * ------------------------------------------------------------------ */
export const angularDiameterDeg = (radiusKm, distKm) => 2 * Math.asin(Math.min(1, radiusKm / distKm)) * RAD;

/** Lunar phase name from the phase angle (0 = new, 180 = full). */
export function phaseName(angleDeg) {
  const a = mod(angleDeg, 360);
  if (a < 22.5 || a >= 337.5) return 'new';
  if (a < 67.5) return 'waxing crescent';
  if (a < 112.5) return 'first quarter';
  if (a < 157.5) return 'waxing gibbous';
  if (a < 202.5) return 'full';
  if (a < 247.5) return 'waning gibbous';
  if (a < 292.5) return 'last quarter';
  return 'waning crescent';
}

/** Format a signed angle with the precision these tiny polar angles deserve. */
export function formatAngle(deg, digits = 2) {
  const sign = deg < 0 ? '−' : '+';
  return `${sign}${Math.abs(deg).toFixed(digits)}°`;
}
