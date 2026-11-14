/**
 * tokens.js — the JS mirror of `design/tokens.css`
 * -----------------------------------------------------------------------
 * Canvas, SVG and Three.js cannot read CSS variables reliably, so the same
 * palette lives here. `tests/design.test.js` asserts the two files agree, so
 * a colour can never drift between the DOM and the 3D scene.
 */

export const colors = {
  bg: '#07060f',
  surface: '#100e1c',
  elevated: '#191630',
  overlay: '#221e39',
  border: 'rgba(255,255,255,0.08)',
  textPrimary: '#f4f2fa',
  textSecondary: '#a9a4bf',
  textTertiary: '#8b86a3',
  accent: '#a78bfa',
  sun: '#fbbf24',
  earth: '#2dd4bf',
  score: '#a78bfa',
  night: '#93a4ff',
  success: '#34d399',
  warn: '#fbbf24',
  danger: '#fb7185',
  info: '#7dd3fc',
};

/** Colour for a metric key, used by charts, sparklines and 3D markers. */
export const metricColor = (key) =>
  ({ sun: colors.sun, earth: colors.earth, score: colors.score, night: colors.night }[key] ?? colors.textSecondary);

/** Score 0–100 → semantic tone. Used by badges and score rings. */
export const scoreTone = (score) => (score >= 80 ? 'success' : score >= 65 ? 'warn' : 'danger');

export const toneColor = (tone) =>
  ({ success: colors.success, warn: colors.warn, danger: colors.danger, info: colors.info }[tone] ?? colors.textSecondary);

/** Spacing / radius exposed to JS for inline SVG maths. */
export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 24, 6: 32, 7: 40, 8: 56, 9: 80 };
export const radius = { card: 16, control: 10, pill: 999 };
