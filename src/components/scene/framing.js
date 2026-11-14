/**
 * framing.js — where the Earth goes in "framed" mode, as plain trigonometry.
 * ---------------------------------------------------------------------------
 * The engine needs three numbers: the angle from the view axis, which side, and
 * how far away to put the Earth. Getting them wrong is what produced the
 * "Earth glued to the Moon" bug — a fixed 31° at a closer depth than the Moon,
 * which overlaps the lunar disc from most viewpoints.
 *
 * Rules enforced here (and asserted in tests/framing.test.js):
 *   1. the two discs never touch, at any zoom;
 *   2. the Earth's disc stays inside the frame whenever that is geometrically
 *      possible — when the Moon is zoomed in so far that no room is left, the
 *      Earth is pushed *deeper* (smaller, further) rather than overlapped;
 *   3. when even that fails, it is reported as not visible instead of drawn on
 *      top of the Moon.
 */

const DEG = Math.PI / 180;
const MIN_EARTH_DEG = 0.55; // smallest the drawn Earth is allowed to get

/**
 * @param {object} p
 * @param {number} p.camDist   camera → Moon centre distance (scene units)
 * @param {number} p.moonR     Moon radius (scene units)
 * @param {number} p.earthR    Earth radius in framed mode (scene units)
 * @param {number} p.fovDeg    vertical field of view
 * @param {number} p.aspect    width / height
 * @param {number} p.lateral   earthDir · right  (−1…1) — which side, how far
 * @param {number} p.vertical  earthDir · up     (−1…1) — damped below
 * @param {number} [p.gapDeg]  clear sky wanted between the two limbs
 * @returns {{ sepRad:number, limitRad:number, sideSign:number, dampedY:number, earthDist:number, earthAng:number, visible:boolean }}
 */
export function framedEarthAngles({ camDist, moonR, earthR, fovDeg, aspect, lateral, vertical, gapDeg = 7 }) {
  const moonAng = Math.asin(Math.min(0.999, moonR / camDist));
  const sideSign = lateral >= 0 ? 1 : -1;

  // The Earth belongs *beside* the Moon: a strong vertical direction would push
  // it into the toolbar (above) or off the bottom of a short frame.
  const dampedY = Math.max(-0.4, Math.min(0.4, vertical));
  const norm = Math.hypot(1, dampedY);
  const ux = 1 / norm;
  const uy = Math.abs(dampedY) / norm;

  const vHalf = (fovDeg * DEG) / 2;
  const hHalf = Math.atan(Math.tan(vHalf) * Math.max(0.5, aspect));
  // 86 % / 80 % of the half-frame: the rest is the label's margin.
  const limitX = (hHalf * 0.86) / Math.max(0.2, ux);
  const limitY = (vHalf * 0.8) / Math.max(0.2, uy);
  const limit = Math.max(0, Math.min(limitX, limitY)); // angle available, Earth centre
  const gap = gapDeg * DEG;

  // Can the Earth sit at the Moon's depth? That needs its disc plus the gap to
  // fit between the Moon's limb and the edge of the frame.
  let earthAng = Math.asin(Math.min(0.999, earthR / camDist));
  let earthDist = camDist;
  let sep = moonAng + earthAng + gap;

  if (sep > limit) {
    // Not enough room. Push the Earth deeper so its disc shrinks, and keep the
    // gap: this trades apparent size for a clean picture instead of an overlap.
    const spare = limit - moonAng - gap;
    if (spare <= MIN_EARTH_DEG * DEG) {
      // The Moon itself fills the frame: there is no honest place to draw it.
      sep = limit;
      earthAng = Math.max(0, limit - moonAng - gap);
    } else {
      earthAng = spare;
      earthDist = earthR / Math.sin(earthAng);
      sep = moonAng + earthAng + gap;
    }
  }

  const visible = earthDist / camDist < 60 && earthAng > 0.05 * DEG;
  return { sepRad: Math.min(sep, limit), limitRad: limit, sideSign, dampedY, earthDist, earthAng, visible };
}

/* ------------------------------------------------------------------ *
 * Earth phase on screen
 * ------------------------------------------------------------------ */

const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;

/**
 * The Sun direction that gives the Earth marker the *right* phase.
 *
 * A sphere in a renderer is lit by one direction, so the lit fraction you see
 * is fixed by the angle between (Earth → Sun) and (Earth → observer):
 *
 *   lit = (1 + cos α) / 2,   α = phase angle.
 *
 * That is correct as long as the observer really is where geometry says. In
 * "framed" mode the Earth is a marker parked a few scene units away for
 * composition — nine orders of magnitude closer than the real Moon–Earth
 * line — so the camera looks at it from a completely different angle than the
 * Moon does. Lighting it with the true Sun vector then shows a phase that
 * belongs to no observer at all: in testing the disc went from 0.33 to 0.24
 * lit while the model said 0.38 → 0.83. That is the "the Earth looks wrong
 * when time runs" symptom.
 *
 * Fix: light it with the direction that reproduces the phase an observer at
 * the Moon gets — i.e. the point on the cone of directions making the model's
 * phase angle α with (Earth → camera) that is closest to the true Sun vector.
 * The terminator therefore sits on the side the real Sun is on, and the lit
 * fraction on screen equals `illum` exactly. When the geometry *is* to scale
 * (true-scale mode, or the surface sky dome) this returns the true Sun vector
 * to within a fraction of a degree, so one rule serves both.
 *
 * @param {{x:number,y:number,z:number}} sun     true Earth → Sun unit vector
 * @param {{x:number,y:number,z:number}} toCam   Earth → camera (any length)
 * @param {number} illum  model illuminated fraction of the Earth's disc (0–1)
 * @param {{x:number,y:number,z:number}} [fallback] used if the Sun is exactly
 *        behind the marker, where the terminator is a ring and its direction
 *        carries no information
 * @returns {{x:number,y:number,z:number}} unit light direction
 */
export function earthMarkerSunDir(sun, toCam, illum, fallback) {
  const len = Math.hypot(toCam.x, toCam.y, toCam.z);
  if (!(len > 1e-9) || !Number.isFinite(len)) return { ...sun };
  const v = { x: toCam.x / len, y: toCam.y / len, z: toCam.z / len };
  const f = Math.max(0, Math.min(1, Number.isFinite(illum) ? illum : 0.5));
  const cosA = Math.max(-1, Math.min(1, 2 * f - 1));
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));

  // Component of the true Sun direction perpendicular to the view line: it
  // says which way round the illuminated limb goes.
  const s = dot(sun, v);
  let w = { x: sun.x - s * v.x, y: sun.y - s * v.y, z: sun.z - s * v.z };
  let wl = Math.hypot(w.x, w.y, w.z);
  if (!(wl > 1e-6)) {
    const fb = fallback ?? { x: 0, y: 1, z: 0 };
    const s2 = dot(fb, v);
    w = { x: fb.x - s2 * v.x, y: fb.y - s2 * v.y, z: fb.z - s2 * v.z };
    wl = Math.hypot(w.x, w.y, w.z);
    if (!(wl > 1e-6)) return { ...sun };
  }
  const out = {
    x: cosA * v.x + sinA * (w.x / wl),
    y: cosA * v.y + sinA * (w.y / wl),
    z: cosA * v.z + sinA * (w.z / wl),
  };
  const ol = Math.hypot(out.x, out.y, out.z);
  return { x: out.x / ol, y: out.y / ol, z: out.z / ol };
}
