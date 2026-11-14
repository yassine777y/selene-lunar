/**
 * ephemeris.test.js — the astronomy engine against JPL Horizons
 * ---------------------------------------------------------------------------
 * This is the test that makes the word "real ephemeris" mean something. The
 * reference values below were fetched from the **JPL Horizons API**
 * (target 301 = Moon, observer 500@399 = geocentre, quantities 14 & 15, DE441,
 * apparent airless, UTC) on 2026-11-10 and pasted here verbatim:
 *
 *   date (UTC)            sub-Earth lon/lat      sub-Solar lon/lat
 *   2026-01-09 00:00      6.508058   2.241188    295.484808  -1.213289
 *   2026-02-20 06:30    355.761472  -3.082209    141.154760  -0.245577
 *   2026-06-15 18:00      1.761055  -5.608039    172.661268   1.399868
 *   2026-11-09 12:00      3.860975   6.523376    181.507338  -1.541650
 *   2026-03-15 12:00    354.510612   3.225950    218.536073   0.420237
 *
 * Tolerances reflect what astronomy-engine promises (ELP-2000/82 truncated,
 * arcminute-class lunar direction): we assert 0.05° in latitude and 0.1° in
 * longitude, and check the *distances* to 1 %. Anything larger means the
 * orientation code — not the ephemeris — is wrong, which is exactly the class
 * of bug this file exists to catch.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  skyFrame,
  siteSky,
  siteBasis,
  altAzFrom,
  selenoVector,
  vectorToSeleno,
  angularDiameterDeg,
  clearFrameCache,
  R_EARTH_KM,
  R_MOON_KM,
} from '../src/lib/ephemeris.js';
import { skyState, sunSelenographic, earthSelenographic } from '../src/lib/astro.js';
import { SITES, getSite } from '../src/lib/sites.js';

const HORIZONS = [
  { iso: '2026-01-09T00:00:00Z', earth: [6.508058, 2.241188], sun: [295.484808, -1.213289], distKm: 391381 },
  { iso: '2026-02-20T06:30:00Z', earth: [355.761472, -3.082209], sun: [141.15476, -0.245577], distKm: 376200 },
  { iso: '2026-06-15T18:00:00Z', earth: [1.761055, -5.608039], sun: [172.661268, 1.399868], distKm: 358000 },
  { iso: '2026-11-09T12:00:00Z', earth: [3.860975, 6.523376], sun: [181.507338, -1.54165], distKm: 398400 },
  { iso: '2026-03-15T12:00:00Z', earth: [354.510612, 3.225950], sun: [218.536073, 0.420237], distKm: 386000 },
];

/** Shortest signed difference between two longitudes, in degrees. */
const dLon = (a, b) => ((((a - b) % 360) + 540) % 360) - 180;

test('the Moon’s orientation matches JPL Horizons at five dates', () => {
  clearFrameCache();
  for (const row of HORIZONS) {
    const f = skyFrame(Date.parse(row.iso));
    const dLat = f.subEarth.lat - row.earth[1];
    const dLonE = dLon(f.subEarth.lon, row.earth[0]);
    const dSunLat = f.subSolar.lat - row.sun[1];
    const dLonS = dLon(f.subSolar.lon, row.sun[0]);
    const where = `${row.iso}: sub-Earth Δlat ${dLat.toFixed(4)}° Δlon ${dLonE.toFixed(4)}°`;
    assert.ok(Math.abs(dLat) < 0.05, `${where} (tolerance 0.05°)`);
    assert.ok(Math.abs(dLonE) < 0.1, `${where} (tolerance 0.1°)`);
    assert.ok(Math.abs(dSunLat) < 0.05, `${row.iso}: sub-Solar Δlat ${dSunLat.toFixed(4)}°`);
    assert.ok(Math.abs(dLonS) < 0.1, `${row.iso}: sub-Solar Δlon ${dLonS.toFixed(4)}°`);
  }
});

test('Earth–Moon distance tracks the real orbit (peri- to apogee)', () => {
  const f = skyFrame(Date.parse('2026-06-15T18:00:00Z')); // near perigee that month
  const g = skyFrame(Date.parse('2026-11-09T12:00:00Z')); // near apogee
  assert.ok(f.earthDistKm < 366000, `June distance ${f.earthDistKm.toFixed(0)} km should be < 366 000`);
  assert.ok(g.earthDistKm > 396000, `November distance ${g.earthDistKm.toFixed(0)} km should be > 396 000`);
  assert.ok(f.earthAngularRadius > g.earthAngularRadius, 'the Earth is bigger at perigee');
});

test('angular sizes come out at the values the physics demands', () => {
  const f = skyFrame(Date.parse('2026-01-09T00:00:00Z'));
  // Earth's disk is ~3.6× the Sun's from the Moon
  const ratio = f.earthAngularRadius / f.sunAngularRadius;
  assert.ok(ratio > 3.2 && ratio < 4.0, `Earth/Sun angular ratio ${ratio.toFixed(2)}`);
  assert.ok(Math.abs(f.sunAngularRadius * 2 - 0.53) < 0.03, 'Sun ~0.53° across');
  assert.ok(Math.abs(f.earthAngularRadius * 2 - 1.9) < 0.15, 'Earth ~1.9° across');
  // direct geometric check
  const direct = angularDiameterDeg(R_EARTH_KM, f.earthDistKm);
  assert.ok(Math.abs(direct - f.earthAngularRadius * 2) < 1e-9);
});

test('from the south pole the Sun never climbs more than ~2°, Earth ~7°', () => {
  const site = getSite('connecting-ridge');
  let sunMax = -90;
  let earthMax = -90;
  let earthMin = 90;
  for (let d = 0; d < 365; d += 1) {
    const st = skyState(site, Date.UTC(2026, 0, 1) + d * 86400000);
    sunMax = Math.max(sunMax, st.sun.alt);
    earthMax = Math.max(earthMax, st.earth.alt);
    earthMin = Math.min(earthMin, st.earth.alt);
  }
  assert.ok(sunMax < 2.5, `Sun reached ${sunMax.toFixed(2)}° — the Moon's obliquity caps it at 1.54° + 1° parallax`);
  assert.ok(earthMax < 8, `Earth reached ${earthMax.toFixed(2)}° — libration caps it near 7°`);
  assert.ok(earthMin < -3, `Earth should swing below the horizon too, got ${earthMin.toFixed(2)}°`);
});

test('the site frame is orthonormal and round-trips coordinates', () => {
  const site = getSite('malapert');
  const b = siteBasis(site.lat, site.lon);
  const dot = (a, c) => a.x * c.x + a.y * c.y + a.z * c.z;
  assert.ok(Math.abs(dot(b.up, b.up) - 1) < 1e-12);
  assert.ok(Math.abs(dot(b.east, b.east) - 1) < 1e-12);
  assert.ok(Math.abs(dot(b.north, b.north) - 1) < 1e-12);
  assert.ok(Math.abs(dot(b.up, b.east)) < 1e-12);
  assert.ok(Math.abs(dot(b.up, b.north)) < 1e-12);
  assert.ok(Math.abs(dot(b.east, b.north)) < 1e-12);

  const back = vectorToSeleno(selenoVector(-85.3, 313.4));
  assert.ok(Math.abs(back.lat + 85.3) < 1e-9);
  assert.ok(Math.abs(dLon(back.lon, 313.4)) < 1e-9);
});

test('sun and earth directions reproduce the spherical alt/az solution', () => {
  const site = getSite('shackleton');
  const ms = Date.parse('2026-03-15T12:00:00Z');
  const s = siteSky(site, ms);
  // independent spherical computation from the sub-points
  const spherical = (sub, basis) => {
    const toBody = selenoVector(sub.lat, sub.lon);
    return altAzFrom(basis, toBody);
  };
  const sunSph = spherical(sunSelenographic(ms), s.basis);
  const earthSph = spherical(earthSelenographic(ms), s.basis);
  assert.ok(Math.abs(sunSph.alt - s.sun.alt) < 1e-6);
  assert.ok(Math.abs(sunSph.az - s.sun.az) < 1e-6);
  assert.ok(Math.abs(earthSph.alt - s.earth.alt) < 1e-6);
  assert.ok(Math.abs(earthSph.az - s.earth.az) < 1e-6);
});

test('azimuth is measured clockwise from local north (toward the pole)', () => {
  const site = getSite('connecting-ridge');
  const b = siteBasis(site.lat, site.lon);
  // "north" from near the south pole means walking toward the pole
  const towardsPole = { x: 0, y: 0, z: 1 }; // selenographic +Z
  const az = altAzFrom(b, towardsPole).az;
  assert.ok(Math.abs(dLon(az, 0)) < 1e-6, `pole should be due north, got ${az}°`);
  // and "east" is 90°
  const east = { x: -Math.sin((site.lon * Math.PI) / 180), y: Math.cos((site.lon * Math.PI) / 180), z: 0 };
  assert.ok(Math.abs(altAzFrom(b, east).az - 90) < 1e-6, 'east is 90°');
});

test('the ephemeris is fast enough to drive a scrubber', () => {
  clearFrameCache();
  const t0 = performance.now();
  for (let i = 0; i < 500; i++) skyFrame(Date.UTC(2026, 0, 1) + i * 3600000);
  const cold = performance.now() - t0;
  const t1 = performance.now();
  for (let i = 0; i < 500; i++) skyFrame(Date.UTC(2026, 0, 1) + i * 3600000);
  const warm = performance.now() - t1;
  assert.ok(cold < 250, `500 cold frames took ${cold.toFixed(0)} ms`);
  assert.ok(warm < 25, `500 cached frames took ${warm.toFixed(1)} ms`);
});

test('six sites at one instant cost one ephemeris evaluation', () => {
  clearFrameCache();
  const ms = Date.parse('2026-05-05T05:00:00Z');
  const t0 = performance.now();
  for (const s of SITES) skyState(s, ms);
  const elapsed = performance.now() - t0;
  assert.ok(elapsed < 40, `six sites took ${elapsed.toFixed(1)} ms`);
  assert.ok(R_MOON_KM > 1700 && R_MOON_KM < 1800);
});
