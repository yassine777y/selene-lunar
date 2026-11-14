/**
 * model-meta.js — one place for the model's identity and for *how far each
 * number can be trusted*.
 * The version shown in the UI, in `package.json` and in the export must be the
 * same string; change it here and the app follows.
 */
export const MODEL_VERSION = '2.1.0';
export const LAST_UPDATED = '2026-11-09';

/**
 * Reliability tiers.
 *
 * The brief for this build asked for one thing above all: never let a reader
 * mistake a calculation for a measurement. So every number in the interface
 * carries one of exactly three labels:
 *
 *   measured  — a value taken from a published dataset (LRO LOLA elevation,
 *               LROC imagery, JPL Horizons ephemerides). We did not produce it,
 *               we consume it.
 *   derived   — arithmetic this model performs on those measured inputs:
 *               illumination %, Earth-visibility %, angular diameters.
 *               Repeatable from the inputs; still not an observation of the
 *               real site.
 *   estimated — an assumption or a product judgement: mission-score weights,
 *               battery sizing, comparison bands with no published figure.
 *
 * These are ids only. The words, and the one-sentence explanation of each,
 * live in `ui-strings.js` so they are translated with the rest of the UI.
 */
export const TIERS = ['measured', 'derived', 'estimated'];

/** Which tier every headline figure belongs to. */
export const TIER_OF = {
  terrain: 'measured',
  ephemeris: 'measured',
  sunPct: 'derived',
  earthPct: 'derived',
  night: 'derived',
  disk: 'derived',
  score: 'estimated',
  battery: 'estimated',
};
