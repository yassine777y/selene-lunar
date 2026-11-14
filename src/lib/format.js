/**
 * format.js — ONE rounding rule for the whole app.
 * -----------------------------------------------------------------------
 * Every percentage on screen is shown with exactly one decimal. Every score
 * is an integer. Every duration is hours with one decimal, or days above 48 h.
 * Centralising this is what stops "100%" and "100.0%" appearing on the same
 * screen (they did, in the previous design).
 */

/** 1-decimal percentage, always with the unit. e.g. "86.1%" */
export const pct = (v) => `${(Number.isFinite(v) ? v : 0).toFixed(1)}%`;

/** Number with 1 decimal, no unit. */
export const dec1 = (v) => (Number.isFinite(v) ? v : 0).toFixed(1);

/** Integer. */
export const int = (v) => String(Math.round(Number.isFinite(v) ? v : 0));

/** Signed degrees, 1 decimal, e.g. "+6.2°". */
export const deg = (v) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}°`;

/** Unsigned degrees with 2 decimals — coordinates and bearings. */
export const deg2 = (v) => `${Math.abs(v).toFixed(2)}°`;

/** Latitude as "89.45° S". */
export const lat = (v) => `${Math.abs(v).toFixed(2)}° ${v >= 0 ? 'N' : 'S'}`;
/** Longitude as "222.69° E". */
export const lon = (v) => `${(((v % 360) + 360) % 360).toFixed(2)}° E`;

/** Hours → "6.2 d" / "14.3 h" / "45 min". */
export function hours(h) {
  const v = Number.isFinite(h) ? h : 0;
  if (v >= 48) return `${(v / 24).toFixed(1)} d`;
  if (v >= 1) return `${v.toFixed(1)} h`;
  return `${Math.round(v * 60)} min`;
}

/** Hours → compact number only (unit supplied by the caller). */
export function hoursValue(h) {
  const v = Number.isFinite(h) ? h : 0;
  if (v >= 48) return { value: (v / 24).toFixed(1), unit: 'd' };
  return { value: v.toFixed(1), unit: 'h' };
}

/** ISO day (UTC) for <input type="date">. */
export const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);

/** Parse an <input type="date"> value as UTC midnight. */
export const parseDay = (value) => {
  const ms = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(ms) ? ms : null;
};

/** Days between two instants, 1 decimal. */
export const daysBetween = (a, b) => dec1((b - a) / 86400000);
