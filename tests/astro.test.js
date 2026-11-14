import test from 'node:test';
import assert from 'node:assert/strict';

import {
  diskVisibleFraction,
  altAz,
  sunSelenographic,
  earthSelenographic,
  horizonAt,
  skyState,
  sunPosition,
  MS_DAY,
  EPOCH_MS,
  wrap360,
  angDiff,
  lunarLocalTime,
  moonPhase,
  moonPhaseAngle,
  skyFrame,
} from '../src/lib/astro.js';
import { SITES, getSite, compass } from '../src/lib/sites.js';
import { analyseWindow, series, longestRun, hoursToHuman } from '../src/lib/metrics.js';

const near = (a, b, tol, msg) =>
  assert.ok(Math.abs(a - b) <= tol, `${msg || ''} expected ${b} ± ${tol}, got ${a}`);

/* ---------------- coordinate transform ---------------- */

test('altAz: body at the zenith of the observer', () => {
  const { alt } = altAz(12, 40, 40, 12);
  near(alt, 90, 1e-5, 'altitude');
});

test('altAz: a sub-point 90° east of the observer is due east', () => {
  const { alt, az } = altAz(0, 0, 90, 0);
  near(alt, 0, 1e-6, 'altitude');
  near(az, 90, 1e-6, 'azimuth');
});

test('altAz: a sub-point 90° west of the observer is due west', () => {
  const { alt, az } = altAz(0, 0, -90, 0);
  near(alt, 0, 1e-6, 'altitude');
  near(az, 270, 1e-6, 'azimuth');
});

test('altAz: result is always a valid altitude/azimuth pair', () => {
  for (let lat = -90; lat <= 90; lat += 15) {
    for (let lon = 0; lon < 360; lon += 30) {
      const { alt, az } = altAz(lat, lon, lon + 137, lat * 0.2);
      assert.ok(Number.isFinite(alt) && alt >= -90.001 && alt <= 90.001, `alt ${alt}`);
      assert.ok(Number.isFinite(az) && az >= 0 && az < 360, `az ${az}`);
    }
  }
});

/* ---------------- sun / earth model ---------------- */

test('the Sun’s sub-point longitude sweeps 360° in one synodic month', () => {
  // The real synodic month varies a little (29.27–29.83 d); take the actual
  // interval between two successive alignments instead of a constant.
  const start = EPOCH_MS;
  const lonAt = (ms) => sunSelenographic(ms).lon;
  let sweep = 0;
  let prev = lonAt(start);
  let days = 0;
  // accumulate the eastward sweep until it reaches a full revolution
  for (let h = 1; h <= 24 * 40; h++) {
    const cur = lonAt(start + h * 3600000);
    sweep += Math.abs(angDiff(cur, prev));
    prev = cur;
    if (sweep >= 360) {
      days = (h * 3600000) / MS_DAY;
      break;
    }
  }
  assert.ok(days > 29.0 && days < 30.2, `synodic month came out at ${days.toFixed(2)} d`);
});

test('the Sun stays inside the Moon’s ±1.55° obliquity band', () => {
  let max = 0;
  for (let d = 0; d < 800; d += 0.5) {
    const { lat } = sunSelenographic(EPOCH_MS + d * MS_DAY);
    max = Math.max(max, Math.abs(lat));
  }
  // The Moon's equator is tilted 1.5424° to the ecliptic; including the small
  // extra from the node, the sub-solar latitude stays under ~1.6°.
  assert.ok(max > 1.4, `should reach the band, got ${max.toFixed(3)}`);
  assert.ok(max < 1.65, `sub-solar latitude overflow: ${max.toFixed(3)}`);
});

test('the sub-Earth point librates inside the real ±8° / ±7° envelope', () => {
  let latMax = 0;
  let lonMax = 0;
  for (let d = 0; d < 400; d += 0.25) {
    const e = earthSelenographic(EPOCH_MS + d * MS_DAY);
    latMax = Math.max(latMax, Math.abs(e.lat));
    lonMax = Math.max(lonMax, Math.abs(e.lon > 180 ? e.lon - 360 : e.lon));
  }
  assert.ok(latMax > 5.5 && latMax < 7.5, `libration in latitude ${latMax.toFixed(2)}°`);
  assert.ok(lonMax > 5.5 && lonMax < 9.0, `libration in longitude ${lonMax.toFixed(2)}°`);
});

test('the Moon’s phase angle and the site’s local solar time stay in range', () => {
  for (let d = 0; d < 60; d++) {
    const ms = EPOCH_MS + d * MS_DAY * 0.37;
    const angle = moonPhaseAngle(ms);
    assert.ok(angle >= 0 && angle < 360, `phase angle ${angle}`);
    // the epoch is a full Moon, so the phase angle must start near 180°
    if (d === 0) assert.ok(Math.abs(angle - 180) < 25, `epoch phase angle ${angle.toFixed(1)}° should be near full`);
  }
});

test('lunar local time and phase stay in range', () => {
  const site = getSite('shackleton');
  for (let d = 0; d < 60; d++) {
    const t = EPOCH_MS + d * MS_DAY * 0.37;
    const llt = lunarLocalTime(site, t);
    const ph = moonPhase(t);
    assert.ok(llt >= 0 && llt < 24, `llt ${llt}`);
    assert.ok(ph >= 0 && ph < 1, `phase ${ph}`);
  }
});

/* ---------------- terrain + visibility ---------------- */

test('horizon profile is deterministic and finite', () => {
  for (const s of SITES) {
    for (let az = 0; az < 360; az += 7) {
      const h = horizonAt(s, az);
      assert.ok(Number.isFinite(h));
      assert.equal(h, horizonAt(s, az));
    }
  }
});

test('skyState reports a coherent partially-occulted disk', () => {
  const site = getSite('malapert');
  for (let d = 0; d < 40; d++) {
    const st = skyState(site, EPOCH_MS + d * MS_DAY);
    // A disk is visible while ANY part of it is above terrain, i.e. while the
    // centre plus its angular radius still clears the horizon.
    assert.equal(st.sun.visible, st.sun.fraction > 0);
    assert.equal(st.earth.visible, st.earth.fraction > 0);
    assert.equal(st.sun.fraction === 1, st.sun.alt - st.sun.angularRadius > st.sun.horizon);
    assert.equal(st.earth.fraction === 1, st.earth.alt - st.earth.angularRadius > st.earth.horizon);
    assert.ok(st.sun.fraction >= 0 && st.sun.fraction <= 1);
    assert.ok(st.earth.fraction >= 0 && st.earth.fraction <= 1);
  }
});

test('diskVisibleFraction: exact circular-segment geometry', () => {
  const r = 1;
  assert.equal(diskVisibleFraction(2, 0, r), 1);   // fully above
  assert.equal(diskVisibleFraction(-2, 0, r), 0);  // fully below
  assert.ok(Math.abs(diskVisibleFraction(0, 0, r) - 0.5) < 1e-12); // centre on horizon → half
  // monotonic in altitude
  let prev = -1;
  for (let alt = -1.2; alt <= 1.2; alt += 0.1) {
    const f = diskVisibleFraction(alt, 0, r);
    assert.ok(f >= prev - 1e-12, `must not decrease with altitude (alt=${alt})`);
    prev = f;
  }
  // a degenerate radius falls back to a hard test
  assert.equal(diskVisibleFraction(0.01, 0, 0), 1);
  assert.equal(diskVisibleFraction(-0.01, 0, 0), 0);
});

/* ---------------- trade-study metrics ---------------- */

test('analyseWindow returns bounded, self-consistent metrics', () => {
  for (const s of SITES) {
    const m = analyseWindow(s, EPOCH_MS, 30, 2);
    for (const k of ['sunPct', 'earthPct', 'arrayEff', 'verticalEff', 'energyIndex']) {
      assert.ok(m[k] >= 0 && m[k] <= 100, `${s.id}.${k} = ${m[k]}`);
    }
    assert.ok(m.score >= 0 && m.score <= 1, `${s.id}.score = ${m.score}`);
    assert.ok(m.maxSunOutageH >= 0 && m.maxEarthOutageH >= 0);
    assert.ok(m.sunAltMin <= m.sunAltMax);
  }
});

test('array efficiency obeys the polar grazing-Sun geometry', () => {
  const m = analyseWindow(getSite('connecting-ridge'), EPOCH_MS, 30, 1);
  // A flat array sees a Sun within ~2° of the horizon: ~sin(2°) ≈ 3.5%, never more.
  assert.ok(m.arrayEff < 10, `flat array should be very low at the pole, got ${m.arrayEff}`);
  // A vertical, Sun-facing array is almost square-on: near 100%.
  assert.ok(m.verticalEff > 95, `vertical array should be near rated, got ${m.verticalEff}`);
  assert.ok(m.verticalEff > m.arrayEff, 'vertical must beat flat at the pole');
});

test('energy throughput never exceeds illumination fraction times efficiency', () => {
  for (const s of SITES) {
    const m = analyseWindow(s, EPOCH_MS, 30, 2);
    assert.ok(m.energyIndex <= m.arrayEff * (m.sunPct / 100) + 1e-9);
  }
});

test('known physics: Malapert keeps Earth up, Shackleton does not', () => {
  const mala = analyseWindow(getSite('malapert'), EPOCH_MS, 30, 1);
  const shack = analyseWindow(getSite('shackleton'), EPOCH_MS, 30, 1);
  assert.ok(mala.earthPct > 95, `Malapert DTE should be near-continuous, got ${mala.earthPct}`);
  assert.ok(shack.earthPct < mala.earthPct, 'Shackleton must be worse for DTE than Malapert');
  assert.ok(shack.sunPct > 70, `Shackleton rim should be sun-rich, got ${shack.sunPct}`);
  assert.ok(shack.sunPct > shack.earthPct, 'Shackleton: sun-rich, Earth-poor');
});

test('the basin and interior-highland sites are the weakest on sunlight', () => {
  // Real terrain puts Nobile and Cabeus at the bottom of the illumination
  // ranking; the three polar-rim sites must clearly beat both.
  const m = Object.fromEntries(SITES.map((s) => [s.id, analyseWindow(s, EPOCH_MS, 30, 2)]));
  const weakest = Math.min(m.nobile.sunPct, m.cabeus.sunPct);
  for (const id of ['shackleton', 'connecting-ridge', 'de-gerlache']) {
    assert.ok(m[id].sunPct > weakest + 10, `${id} should out-shine the basins by >10 pp`);
  }
});

test('longer window never reports a shorter blackout than a sub-window', () => {
  const site = getSite('nobile');
  const short = analyseWindow(site, EPOCH_MS, 7, 1);
  const long = analyseWindow(site, EPOCH_MS, 60, 1);
  assert.ok(long.maxSunOutageH >= short.maxSunOutageH);
});

test('series sampling matches the requested length', () => {
  const site = getSite('connecting-ridge');
  const s = series(site, EPOCH_MS, 10, 3); // 10 days at 3 h → 81 samples
  assert.equal(s.length, 81);
  assert.ok(s.every((p) => Number.isFinite(p.sunAlt) && Number.isFinite(p.earthAlt)));
});

/* ---------------- helpers ---------------- */

test('longestRun counts the longest gap', () => {
  assert.equal(longestRun([true, false, false, false, true, false]), 3);
  assert.equal(longestRun([true, true]), 0);
});

test('hoursToHuman formats sensibly', () => {
  assert.match(hoursToHuman(0.5), /min/);
  assert.match(hoursToHuman(6), /h/);
  assert.match(hoursToHuman(72), /d/);
});

test('compass maps azimuths to cardinals', () => {
  assert.equal(compass(0), 'N');
  assert.equal(compass(90), 'E');
  assert.equal(compass(180), 'S');
  assert.equal(compass(271), 'W');
  assert.equal(compass(359), 'N');
});

test('angDiff is signed and wraps', () => {
  assert.equal(angDiff(10, 350), 20);
  assert.equal(angDiff(350, 10), -20);
  assert.equal(angDiff(0, 180), -180);
});

test('getSite falls back safely', () => {
  assert.equal(getSite('does-not-exist').id, SITES[0].id);
  assert.equal(getSite('malapert').name, 'Malapert Massif');
});

test('sunPosition is a thin wrapper that agrees with altAz', () => {
  const site = getSite('de-gerlache');
  const t = EPOCH_MS + 12.5 * MS_DAY;
  const s = sunSelenographic(t);
  const a = altAz(site.lat, site.lon, s.lon, s.lat);
  const b = sunPosition(site, t);
  near(b.alt, a.alt, 1e-9);
  near(b.az, a.az, 1e-9);
});
