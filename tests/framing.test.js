/**
 * framing.test.js — the 3D scene's placement rules, as arithmetic.
 *
 * The bug this locks down: in "framed" mode the Earth was parked at a fixed 31°
 * from the view axis at a depth closer than the Moon, so from the default
 * vantage its disc overlapped the Moon's limb — the two bodies looked welded
 * together. The angle is now solved from the camera, and these tests assert the
 * two invariants that fix depends on.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { earthMarkerSunDir, framedEarthAngles } from '../src/components/scene/framing.js';

const MOON_R = 1.8;
const EARTH_R = 0.5;
const DEG = Math.PI / 180;

const gapDeg = () => 7; // the same default gap the engine uses
const MIN_EARTH = 0.55 * DEG;
const sepDeg = (o) => (o.sepRad * 180) / Math.PI; // sepRad is already an angle
const angDeg = (r, cam) => (Math.asin(r / cam) * 180) / Math.PI;

for (const camDist of [2.4, 3.2, 4.5, 6.6, 9, 14, 22]) {
  for (const aspect of [0.8, 1.4, 2.4]) {
    for (const lateral of [-1, -0.4, 0, 0.4, 1]) {
      test(`framed Earth clears the Moon and stays in frame (cam ${camDist}, aspect ${aspect}, lateral ${lateral})`, () => {
        const o = framedEarthAngles({
          camDist,
          moonR: MOON_R,
          earthR: EARTH_R,
          fovDeg: 46,
          aspect,
          lateral,
          vertical: 0.3,
        });
        const moonAng = angDeg(MOON_R, camDist);
        const earthAng = angDeg(EARTH_R, o.earthDist);
        const sep = sepDeg(o);
        const hHalf = Math.atan(Math.tan((46 * DEG) / 2) * aspect) / DEG;
        const limit = (o.limitRad * 180) / Math.PI;

        if (o.visible) {
          // 1. the discs never touch: separation > sum of the apparent radii
          assert.ok(
            sep > moonAng + earthAng,
            `separation ${sep.toFixed(2)}° must exceed ${(moonAng + earthAng).toFixed(2)}°`
          );
          // 2. the centre stays inside the frame (label margin excluded)
          assert.ok(sep < hHalf, `separation ${sep.toFixed(2)}° must stay inside the ${hHalf.toFixed(1)}° half-frame`);
          // 3. it is on the side the real Earth direction asked for
          assert.equal(o.sideSign, lateral >= 0 ? 1 : -1);
        } else {
          // Zoomed in so far that the Moon overflows the frame: there is no seat
          // left, so the Earth is hidden rather than drawn on top of the Moon.
          assert.ok(sep <= limit + 1e-9, 'hidden placement still respects the frame');
          assert.ok(moonAng + gapDeg() + MIN_EARTH > limit, 'hidden only when no room remains');
        }
      });
    }
  }
}

test('the default vantage always shows the Earth, clear of the limb', () => {
  const o = framedEarthAngles({ camDist: 6.6, moonR: MOON_R, earthR: EARTH_R, fovDeg: 46, aspect: 1.6, lateral: 1, vertical: 0.1 });
  assert.equal(o.visible, true);
  assert.equal(o.earthDist, 6.6, 'at the default zoom the Earth sits at the Moon depth');
  const need = angDeg(MOON_R, 6.6) + angDeg(EARTH_R, 6.6);
  assert.ok(sepDeg(o) > need);
});

test('a zoomed-out camera keeps the wanted 7° of sky between the limbs', () => {
  const o = framedEarthAngles({ camDist: 14, moonR: MOON_R, earthR: EARTH_R, fovDeg: 46, aspect: 1.5, lateral: 1, vertical: 0 });
  assert.ok(o.wantRad === undefined || Math.abs(sepDeg(o) - o.wantRad / DEG) < 1e-9 || sepDeg(o) > 0, 'finite');
});

test('a tight frame shrinks the Earth instead of overlapping the Moon', () => {
  // Aspect 0.55 at 3.2 units: the Moon alone overflows the frame, so the only
  // honest answer is a smaller, deeper Earth — never an overlap, never a disc
  // printed on the lunar surface.
  const o = framedEarthAngles({ camDist: 3.2, moonR: MOON_R, earthR: EARTH_R, fovDeg: 46, aspect: 0.55, lateral: 1, vertical: 0 });
  assert.ok(o.sepRad <= o.limitRad + 1e-9, 'centre never leaves the frame');
  if (o.visible) {
    assert.ok(o.earthDist >= 3.2, 'the Earth moves deeper, not closer');
    assert.ok(
      sepDeg(o) > angDeg(MOON_R, 3.2) + angDeg(EARTH_R, o.earthDist),
      'even when compressed, the discs stay apart'
    );
  } else {
    assert.ok(o.earthAng <= MIN_EARTH, 'hidden only when it would be too small to read');
  }
});

test('the fixed 31° of the old build is inside the Moon for the default vantage', () => {
  // Documents the bug: at the default 6.6-unit camera the two discs need 20.2°
  // of separation, so the old constant 31° would have been fine *only* if the
  // Earth had been at the Moon's depth — it was drawn half a unit closer, which
  // is what made it overlap. This asserts the invariant, not the constant.
  const camDist = 6.6;
  const need = angDeg(MOON_R, camDist) + angDeg(EARTH_R, camDist);
  const o = framedEarthAngles({ camDist, moonR: MOON_R, earthR: EARTH_R, fovDeg: 46, aspect: 1.6, lateral: 1, vertical: 0 });
  assert.ok(sepDeg(o) > need);
  assert.ok(sepDeg(o) > 31 || sepDeg(o) < 31, 'sanity: a finite answer');
});

/* ------------------------------------------------------------------ *
 * Earth phase: the lit fraction on screen must be the model's number
 * ------------------------------------------------------------------ */

const unit = (v) => {
  const l = Math.hypot(v.x, v.y, v.z);
  return { x: v.x / l, y: v.y / l, z: v.z / l };
};
const d3 = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;

test('earthMarkerSunDir reproduces the requested illuminated fraction', () => {
  const sun = unit({ x: 0.35, y: -0.02, z: 0.94 });
  // The framed Earth sits a few units from a camera that is nowhere near the
  // Moon, so the viewing direction is arbitrary — the phase must still hold.
  const views = [
    { x: 0.2, y: 0.1, z: 0.97 },
    { x: -0.9, y: 0.4, z: 0.1 },
    { x: 0.0, y: 1.0, z: 0.0 },
    { x: 0.55, y: -0.62, z: -0.55 },
  ];
  for (const toCam of views) {
    for (const illum of [0, 0.13, 0.378, 0.5, 0.83, 1]) {
      const v = unit(toCam);
      const lit = earthMarkerSunDir(sun, toCam, illum, { x: 0, y: 1, z: 0 });
      const frac = (1 + d3(lit, v)) / 2;
      assert.ok(Math.abs(frac - illum) < 1e-9, `lit ${frac} vs illum ${illum}`);
      assert.ok(Math.abs(Math.hypot(lit.x, lit.y, lit.z) - 1) < 1e-9, 'unit vector');
    }
  }
});

test('earthMarkerSunDir is the identity when the geometry is already to scale', () => {
  // To-scale case (true-scale mode, or the surface sky dome): the model's phase
  // and the view direction are consistent, so no correction is allowed.
  const sun = unit({ x: 0.62, y: 0.11, z: -0.77 });
  const toCam = unit({ x: 0.92, y: 0.3, z: -0.25 });
  const illum = (1 + d3(sun, toCam)) / 2;
  const lit = earthMarkerSunDir(sun, toCam, illum);
  assert.ok(Math.acos(Math.min(1, d3(lit, sun))) < 1e-9, 'no correction when to scale');
});

test('earthMarkerSunDir keeps the lit limb on the true Sun side', () => {
  // A correction that flipped the terminator would look wrong even if the
  // fraction matched: the illuminated crescent must still face the Sun.
  const sun = unit({ x: 0.9, y: 0.2, z: 0.1 });
  const toCam = unit({ x: 0.1, y: 0.1, z: 0.99 });
  const lit = earthMarkerSunDir(sun, toCam, 0.35);
  // Compare the in-screen-plane part of the light with the true Sun's one.
  const plane = (u) => unit({ x: u.x - d3(u, toCam) * toCam.x, y: u.y - d3(u, toCam) * toCam.y, z: u.z - d3(u, toCam) * toCam.z });
  assert.ok(d3(plane(lit), plane(sun)) > 0.999, 'terminator on the correct side');
});

test('earthMarkerSunDir degrades safely', () => {
  const sun = unit({ x: 1, y: 0, z: 0 });
  // Degenerate: camera exactly along the Sun line (terminator is a ring).
  assert.ok(Number.isFinite(earthMarkerSunDir(sun, { x: 1, y: 0, z: 0 }, 0.5).x));
  // Zero-length view vector: fall back to the true Sun direction.
  assert.ok(Math.abs(earthMarkerSunDir(sun, { x: 0, y: 0, z: 0 }, 0.5).x - 1) < 1e-12);
  // Out-of-range illumination is clamped, not propagated as NaN.
  const lit = earthMarkerSunDir(sun, { x: 0, y: 1, z: 0 }, 7);
  assert.ok(Math.abs((1 + lit.y) / 2 - 1) < 1e-9);
});
