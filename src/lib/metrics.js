/**
 * metrics.js — trade-study metrics over a mission window.
 * Everything is sampled on a fixed grid so results are reproducible and
 * cheap enough to recompute on every date scrub (memoised in the UI).
 */

import { MS_DAY, skyState } from './astro.js';

/**
 * The single mission score. Weights live here and nowhere else: the headline
 * number, the sparkline and the "what is this?" text all read them from here.
 *   sun    — mean visible fraction of the solar disk over the window
 *   earth  — mean visible fraction of the Earth disk over the window
 *   night  — resilience: 1 minus a blackout term that saturates after 12.5 d
 */
export const SCORE_WEIGHTS = { sun: 0.45, earth: 0.35, night: 0.2 };
export const BLACKOUT_SATURATION_H = 300;

/** @param {number} sunFrac 0–1 @param {number} earthFrac 0–1 @param {number} blackoutPenalty 0–1 */
export function scoreOf(sunFrac, earthFrac, blackoutPenalty) {
  const w = SCORE_WEIGHTS;
  return w.sun * sunFrac + w.earth * earthFrac + w.night * (1 - blackoutPenalty);
}

/** Penalty term: a night longer than BLACKOUT_SATURATION_H costs the full 20%. */
export function blackoutPenaltyOf(maxOutageHours) {
  return Math.min(1, maxOutageHours / BLACKOUT_SATURATION_H);
}

/**
 * @param {object} site
 * @param {number} startMs
 * @param {number} days    window length
 * @param {number} stepHours sampling step
 */
export function analyseWindow(site, startMs, days = 30, stepHours = 1) {
  const n = Math.max(2, Math.round((days * 24) / stepHours));
  const stepMs = stepHours * 3600 * 1000;

  let sunOn = 0;
  let earthOn = 0;
  let sunFracSum = 0;   // share of the solar disk visible, summed
  let earthFracSum = 0; // share of the Earth disk visible, summed
  let powerSum = 0;
  let litSinSum = 0;
  let litCosSum = 0;
  let sunAltSum = 0;
  let sunAltMin = Infinity;
  let sunAltMax = -Infinity;
  let earthAltMax = -Infinity;

  let runSun = 0;
  let runEarth = 0;
  let maxSunOut = 0;
  let maxEarthOut = 0;

  for (let i = 0; i <= n; i++) {
    const t = startMs + i * stepMs;
    const { sun, earth } = skyState(site, t);

    // Partial occultation: a grazing Sun is partly hidden by the ridge, so we
    // average the visible share of the DISK rather than a binary up/down flag.
    // This is what published illumination studies report.
    sunFracSum += sun.fraction;
    earthFracSum += earth.fraction;

    if (sun.fraction > 0) {
      sunOn += 1;
      runSun = 0;
      // A horizontal array's current scales with sin(altitude). At the pole the
      // Sun grazes, so this is small by physics, not by bug — it is the reason
      // real polar landers fly vertical/mast-mounted arrays.
      const eff = Math.max(0, Math.sin((sun.alt * Math.PI) / 180)) * sun.fraction;
      powerSum += eff;
      litSinSum += eff;
      // A vertical, azimuth-tracked array faces the Sun square-on when the Sun
      // sits on the horizon — the polar engineer's trick.
      litCosSum += Math.max(0, Math.cos((sun.alt * Math.PI) / 180)) * sun.fraction;
    } else {
      runSun += 1;
      maxSunOut = Math.max(maxSunOut, runSun);
    }

    if (earth.fraction > 0) {
      earthOn += 1;
      runEarth = 0;
    } else {
      runEarth += 1;
      maxEarthOut = Math.max(maxEarthOut, runEarth);
    }

    sunAltSum += sun.alt;
    sunAltMin = Math.min(sunAltMin, sun.alt);
    sunAltMax = Math.max(sunAltMax, sun.alt);
    earthAltMax = Math.max(earthAltMax, earth.alt);
  }

  const total = n + 1;
  // Fraction-of-disk averaged illumination (the published definition).
  const sunFrac = sunFracSum / total;
  const earthFrac = earthFracSum / total;
  // Share of the window with at least some light / some Earth line-of-sight.
  const sunAnyShare = sunOn / total;
  const earthAnyShare = earthOn / total;

  // Array efficiency only makes sense over samples that are actually lit.
  const arrayEff = sunFracSum > 0 ? (litSinSum / sunFracSum) * 100 : 0;
  const verticalEff = sunFracSum > 0 ? (litCosSum / sunFracSum) * 100 : 0;
  // Energy through the window, as a fraction of a fully-lit horizontal array.
  const energyIndex = (powerSum / total) * 100;

  // Single mission score: illumination first, link second, then a blackout
  // penalty so a site cannot win with one catastrophic night.
  const blackoutPenalty = blackoutPenaltyOf(maxSunOut * stepHours);
  const score = scoreOf(sunFrac, earthFrac, blackoutPenalty);

  return {
    sunPct: sunFrac * 100,
    earthPct: earthFrac * 100,
    sunAnyPct: sunAnyShare * 100,
    earthAnyPct: earthAnyShare * 100,
    arrayEff, // horizontal array: mean sin(alt) while lit, %
    verticalEff, // vertical azimuth-tracked array: mean cos(alt) while lit, %
    energyIndex, // throughput of a horizontal array over the whole window, %
    maxSunOutageH: maxSunOut * stepHours,
    maxEarthOutageH: maxEarthOut * stepHours,
    meanSunAlt: sunAltSum / total,
    sunAltMin,
    sunAltMax,
    earthAltMax,
    score,
  };
}

/** Sampled series for charts. */
export function series(site, startMs, days, stepHours = 3) {
  const n = Math.max(2, Math.round((days * 24) / stepHours));
  const stepMs = stepHours * 3600 * 1000;
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = startMs + i * stepMs;
    const { sun, earth } = skyState(site, t);
    out.push({
      t,
      sunAlt: sun.alt,
      sunAz: sun.az,
      sunH: sun.horizon,
      sunVisible: sun.visible,
      sunFraction: sun.fraction,
      earthAlt: earth.alt,
      earthVisible: earth.visible,
      earthFraction: earth.fraction,
    });
  }
  return out;
}

/** Longest contiguous run of `true` in a boolean array, in samples. */
export function longestRun(flags) {
  let best = 0;
  let cur = 0;
  for (const f of flags) {
    if (f) cur = 0;
    else best = Math.max(best, ++cur);
  }
  return best;
}

export const hoursToHuman = (h) => {
  if (h >= 48) return `${(h / 24).toFixed(1)} d`;
  if (h >= 1) return `${h.toFixed(1)} h`;
  return `${Math.round(h * 60)} min`;
};

export const msToDate = (ms) =>
  new Date(ms).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

export const msToDateTime = (ms) =>
  new Date(ms).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  }) + ' UTC';

export { MS_DAY };
