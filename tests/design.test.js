/**
 * design.test.js — guards the v6 design system and the "one source of truth"
 * promise. A visual redesign is easy to break silently; these tests make the
 * rules executable.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { colors } from '../src/design/tokens.js';
import { UI_STRINGS } from '../src/lib/ui-strings.js';
import { initialState, reducer, analysisWindowOf, MIN_DATE, MAX_DATE } from '../src/lib/mission-state.js';
import { pct, dec1, int, hours, isoDay } from '../src/lib/format.js';
import { MS_DAY } from '../src/lib/astro.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const read = (p) => readFileSync(resolve(root, p), 'utf8');

test('the design tokens in CSS and JS are the same palette', () => {
  const css = read('src/design/tokens.css');
  const cssVar = (name) => {
    const m = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
    return m?.[1]?.toLowerCase();
  };
  assert.equal(cssVar('bg'), colors.bg.toLowerCase());
  assert.equal(cssVar('surface'), colors.surface.toLowerCase());
  assert.equal(cssVar('elevated'), colors.elevated.toLowerCase());
  assert.equal(cssVar('text-primary'), colors.textPrimary.toLowerCase());
  assert.equal(cssVar('text-secondary'), colors.textSecondary.toLowerCase());
  assert.equal(cssVar('accent'), colors.accent.toLowerCase());
  assert.equal(cssVar('sun'), colors.sun.toLowerCase());
  assert.equal(cssVar('earth'), colors.earth.toLowerCase());
  // contrast floor: text-secondary must leave headroom above AA (4.5:1) on --surface
  const lum = (hex) => {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const lin = c.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
  };
  const ratio = (a, b) => {
    const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (l1 + 0.05) / (l2 + 0.05);
  };
  assert.ok(ratio(colors.textPrimary, colors.surface) > 12, 'primary text contrast');
  assert.ok(ratio(colors.textSecondary, colors.surface) >= 4.5, 'secondary text must clear WCAG AA');
  assert.ok(ratio(colors.sun, colors.surface) >= 4.5, 'sun amber must clear AA on a card');
  assert.ok(ratio(colors.earth, colors.surface) >= 4.5, 'earth teal must clear AA on a card');
});

test('no text is smaller than 12px anywhere in the stylesheet', () => {
  const css = read('src/styles.css') + read('src/design/tokens.css');
  const sizes = [...css.matchAll(/font-size:\s*([0-9.]+)px\s*;/g)].map((m) => Number(m[1]));
  assert.ok(sizes.length > 0, 'expected literal font sizes');
  const tooSmall = sizes.filter((s) => s < 12);
  assert.deepEqual(tooSmall, [], `font sizes below 12px: ${tooSmall.join(', ')}`);
});

test('the tokens declare the full type scale', () => {
  const css = read('src/design/tokens.css');
  for (const size of ['12', '14', '16', '20', '28', '40', '56']) {
    assert.match(css, new RegExp(`--fs-${size}:`), `missing --fs-${size}`);
  }
  assert.match(css, /--s-8: 56px/);
  assert.match(css, /--r-card: 16px/);
});

test('every interface string exists in EN, FR and AR', () => {
  const languages = Object.keys(UI_STRINGS);
  assert.deepEqual(languages.sort(), ['ar', 'en', 'fr']);
  const keys = Object.keys(UI_STRINGS.en).sort();
  // Words that are genuinely identical in English and French.
  const sharedInFrench = new Set(['minMax', 'siteCol', 'scoreCol', 'actionCol', 'sourceCol', 'sourcesTitle', 'tipSource']);
  for (const lang of languages) {
    assert.deepEqual(Object.keys(UI_STRINGS[lang]).sort(), keys, `${lang} key set differs`);
    for (const key of keys) {
      const value = UI_STRINGS[lang][key];
      assert.ok(typeof value === 'string' && value.trim().length > 0, `${lang}.${key} is empty`);
      // Template-only strings ('{start} → {end}') are identical by design.
      const isTemplate = UI_STRINGS.en[key].replace(/\{\w+\}/g, '').trim().length < 3;
      if (lang === 'fr' && !sharedInFrench.has(key) && !isTemplate) {
        assert.notEqual(value, UI_STRINGS.en[key], `fr.${key} is still English`);
      }
      if (lang === 'ar' && !/=|\d/.test(value)) {
        assert.match(value, /[\u0600-\u06FF]/, `ar.${key} contains no Arabic script`);
      }
    }
  }
});

test('no interface string carries a stray punctuation tail', () => {
  // A string that was edited by script and ended up as "…part.," reached the
  // validation page once already. Sentence punctuation is not a place where a
  // translation should be allowed to drift.
  for (const lang of Object.keys(UI_STRINGS)) {
    for (const [key, value] of Object.entries(UI_STRINGS[lang])) {
      assert.ok(!/[.,;:!?]\s*[.,;]\s*$/.test(value), `${lang}.${key} ends with doubled punctuation: ${JSON.stringify(value.slice(-24))}`);
      assert.ok(!/,\s*$/.test(value), `${lang}.${key} ends with a comma: ${JSON.stringify(value.slice(-24))}`);
    }
  }
});

test('the analysis window is always landing date + duration', () => {
  let state = reducer(initialState, { type: 'days', value: 30 });
  const win30 = analysisWindowOf(state);
  assert.equal(win30.days, 30);
  assert.equal(win30.endMs - win30.startMs, 30 * MS_DAY);
  assert.equal(win30.startMs, state.landingMs);

  const landing = Date.UTC(2026, 3, 12);
  state = reducer(state, { type: 'landing', value: landing });
  assert.equal(analysisWindowOf(state).startMs, landing);
  assert.equal(isoDay(analysisWindowOf(state).startMs), '2026-04-12');

  state = reducer(state, { type: 'days', value: 90 });
  const win90 = analysisWindowOf(state);
  assert.equal(isoDay(win90.endMs), isoDay(landing + 90 * MS_DAY));
  assert.equal(win90.endMs - win90.startMs, 90 * MS_DAY);

  // landing a new date resets the cursor into the new window
  state = reducer(state, { type: 'step', value: 5 });
  assert.ok(state.cursorMs >= win90.startMs && state.cursorMs <= win90.endMs);
  state = reducer(state, { type: 'landing', value: landing + 9 * MS_DAY });
  assert.equal(state.cursorMs, landing + 9 * MS_DAY);
});

test('the landing date cannot leave the supported range', () => {
  let state = reducer(initialState, { type: 'landing', value: MIN_DATE - 10 * MS_DAY });
  assert.equal(state.landingMs, MIN_DATE);
  state = reducer(state, { type: 'landing', value: MAX_DATE + 10 * MS_DAY });
  assert.equal(state.landingMs, MAX_DATE);
});

test('one rounding rule: percentages carry exactly one decimal', () => {
  assert.equal(pct(86.14), '86.1%');
  assert.equal(pct(100), '100.0%');
  assert.equal(pct(0.04), '0.0%');
  assert.equal(dec1(7.999), '8.0');
  assert.equal(int(84.6), '85');
  assert.equal(hours(0), '0 min');
  assert.equal(hours(5.25), '5.3 h');
  assert.equal(hours(72), '3.0 d');
});

test('the store drives every page: one site and one window object', () => {
  const state = reducer(reducer(initialState, { type: 'site', value: 'malapert' }), { type: 'days', value: 7 });
  assert.equal(state.siteId, 'malapert');
  const win = analysisWindowOf(state);
  assert.equal(win.days, 7);
  assert.equal(win.endMs - win.startMs, 7 * MS_DAY);
});
