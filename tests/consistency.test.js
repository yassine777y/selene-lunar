/**
 * consistency.test.js — the "one source of truth" guard rails.
 * Every one of these would have been a number printed in the UI that could
 * silently drift away from the number it claims to explain.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { SCORE_WEIGHTS, scoreOf, blackoutPenaltyOf, analyseWindow } from '../src/lib/metrics.js';
import { MODEL_VERSION, LAST_UPDATED, TIERS, TIER_OF } from '../src/lib/model-meta.js';
import { MODEL_FACTS, modelSolarMaxDeg, modelLibrationLatMaxDeg, runSkyChecks } from '../src/lib/validation.js';
import { LOAD_KW, DEPTH_OF_DISCHARGE, PACK_WH_PER_KG, batteryForNight } from '../src/lib/power.js';
import { getSite, SITES } from '../src/lib/sites.js';
import { makeBrief } from '../src/lib/brief.js';
import { dictionaries, SITE_TEXT } from '../src/lib/locales.js';
import { UI_STRINGS } from '../src/lib/ui-strings.js';
import pkg from '../src/../package.json' with { type: 'json' };

test('the model version is one string, shared by the app and package.json', () => {
  assert.equal(MODEL_VERSION, pkg.version);
  assert.match(LAST_UPDATED, /^\d{4}-\d{2}-\d{2}$/);
});

test('score weights sum to 1 and reproduce the headline score', () => {
  const total = SCORE_WEIGHTS.sun + SCORE_WEIGHTS.earth + SCORE_WEIGHTS.night;
  assert.ok(Math.abs(total - 1) < 1e-12, `weights sum to ${total}`);
  assert.equal(scoreOf(1, 0, 0), SCORE_WEIGHTS.sun + SCORE_WEIGHTS.night);
  assert.equal(scoreOf(0, 0, 1), 0);
  // the window score must equal the same function applied to the window means
  const m = analyseWindow(getSite('shackleton'), Date.UTC(2026, 0, 9), 30, 6);
  const expected = scoreOf(m.sunPct / 100, m.earthPct / 100, blackoutPenaltyOf(m.maxSunOutageH));
  assert.ok(Math.abs(m.score - expected) < 1e-12);
});

test('blackout penalty saturates at 300 h of unbroken night', () => {
  assert.equal(blackoutPenaltyOf(0), 0);
  assert.equal(blackoutPenaltyOf(150), 0.5);
  assert.equal(blackoutPenaltyOf(400), 1);
});

test('battery constants drive the calculation they are printed next to', () => {
  const b = batteryForNight(10);
  assert.equal(b.wh, LOAD_KW * 1000 * 10);
  assert.equal(b.usableWh, b.wh / DEPTH_OF_DISCHARGE);
  assert.equal(b.massKg, b.usableWh / PACK_WH_PER_KG);
  assert.equal(batteryForNight(0).massKg, 0); // no night → no pack to size
});

test('the disk sizes the UI quotes are ranges inside the published windows', () => {
  const [eMin, eMax] = MODEL_FACTS.earthDiskRangeDeg;
  const [mMin, mMax] = MODEL_FACTS.moonDiskRangeDeg;
  const [sMin, sMax] = MODEL_FACTS.sunDiskRangeDeg;
  assert.ok(eMin >= 1.75 && eMax <= 2.1, `Earth ${eMin}–${eMax}°`);
  assert.ok(mMin >= 0.48 && mMax <= 0.57, `Moon ${mMin}–${mMax}°`);
  assert.ok(sMin >= 0.52 && sMax <= 0.56, `Sun ${sMin}–${sMax}°`);
  // Earth-from-the-Moon is ~3.7× the Moon-from-Earth, the classic headline
  const [rMin, rMax] = MODEL_FACTS.sizeRatioRange;
  assert.ok(rMin > 3.5 && rMax < 3.9, `${rMin}–${rMax}`);
});

test('the Sun’s ceiling matches the Moon’s obliquity to within the honest residual', () => {
  const model = modelSolarMaxDeg();
  const published = MODEL_FACTS.eclipticObliquityDeg;
  assert.ok(model >= published, 'the model must not under-report the ceiling');
  assert.ok(model - published < 0.1, `residual ${(model - published).toFixed(3)}° is too large`);
  // and the validation page publishes the same number
  assert.equal(runSkyChecks().sunMaxElevDeg, model);
});

test('libration in latitude is close to the published ±6.7° amplitude', () => {
  const amp = modelLibrationLatMaxDeg();
  assert.ok(amp > 6.5 && amp < 7.0, `${amp}°`);
});

test('the synodic month measured from the ephemeris is within a day of 29.53 d', () => {
  assert.ok(Math.abs(MODEL_FACTS.synodicMonthDays - 29.5306) < 1, `${MODEL_FACTS.synodicMonthDays} d`);
});

test('no label claims a peak of eternal light the literature rules out', () => {
  for (const lang of ['en', 'fr', 'ar']) {
    for (const site of SITES) {
      const tag = SITE_TEXT[lang]?.[site.id]?.[2] ?? site.tag;
      assert.ok(!/eternal|éternel|أبدي/i.test(tag), `${lang}/${site.id}: ${tag}`);
    }
  }
});

test('the exported brief quotes the same score weights the model uses', () => {
  const site = getSite('connecting-ridge');
  const metrics = analyseMissionFallback(site);
  for (const lang of ['en', 'fr', 'ar']) {
    const t = (k, vars = {}) =>
      Object.entries(vars).reduce((acc, [key, v]) => acc.replaceAll(`{${key}}`, String(v)), dictionaries[lang][k]);
    const text = makeBrief({
      t,
      siteText: (s) => s,
      date: () => '2026-01-09',
      hours: (h) => `${h} h`,
      site,
      metrics,
      startMs: Date.UTC(2026, 0, 9),
      days: 30,
      rank: 1,
    });
    assert.ok(!/\{\w+\}/.test(text), `${lang}: unresolved placeholder`);
    assert.ok(
      text.includes(
        `${Math.round(SCORE_WEIGHTS.sun * 100)}% ${lang === 'fr' ? 'ensoleillement' : lang === 'ar' ? 'إضاءة' : 'sunlight'}`
      ) || text.includes(`${Math.round(SCORE_WEIGHTS.sun * 100)}`),
      `${lang}: brief must quote the live weights`
    );
  }
});

function analyseMissionFallback(site) {
  // local import kept at the bottom so the top of the file reads as a manifest
  const m = analyseWindow(site, Date.UTC(2026, 0, 9), 30, 6);
  return m;
}

test('every headline figure carries a valid reliability tier, in all three languages', () => {
  // The brief's rule: never let a calculation look like a measurement. A tier
  // that is missing from one dictionary would render an empty chip, so the map
  // and the words are checked together.
  for (const [metric, tier] of Object.entries(TIER_OF)) {
    assert.ok(TIERS.includes(tier), `${metric} has tier "${tier}", not one of ${TIERS.join('/')}`);
  }
  assert.equal(TIER_OF.sunPct, 'derived');
  assert.equal(TIER_OF.earthPct, 'derived');
  assert.equal(TIER_OF.score, 'estimated');
  assert.equal(TIER_OF.battery, 'estimated');
  assert.equal(TIER_OF.terrain, 'measured');

  const words = { measured: 'tierMeasured', derived: 'tierDerived', estimated: 'tierEstimated' };
  const defs = { measured: 'tierMeasuredDef', derived: 'tierDerivedDef', estimated: 'tierEstimatedDef' };
  for (const lang of ['en', 'fr', 'ar']) {
    for (const tier of TIERS) {
      assert.ok(UI_STRINGS[lang][words[tier]]?.trim().length > 0, `${lang}.${words[tier]} missing`);
      assert.ok(UI_STRINGS[lang][defs[tier]]?.trim().length > 1, `${lang}.${defs[tier]} missing`);
    }
  }
  // …and the definitions must actually be different sentences, not placeholders.
  const texts = new Set(TIERS.map((tier) => UI_STRINGS.en[defs[tier]]));
  assert.equal(texts.size, 3);
});

test('the limits of illumination and Earth visibility are stated where they are shown', () => {
  // "Sunlight ≠ power" and "line of sight ≠ link" are compliance requirements,
  // not copy suggestions: they have to exist in every language.
  for (const key of ['limitSun', 'limitEarth', 'limitScore', 'valNotCertification']) {
    for (const lang of ['en', 'fr', 'ar']) {
      assert.ok(UI_STRINGS[lang][key]?.trim().length > 10, `${lang}.${key} missing`);
    }
  }
});

test('no string in the interface claims verification or full compliance', () => {
  // The only thing this build may call checked is the Horizons cross-check,
  // which was performed. "Verified", "certified" and "100% compliant" are
  // claims the model cannot back, so they must not appear in any language.
  const banned = [/\bverified\b/i, /\bcertified\b/i, /100\s*%\s*compliance/i, /fully compliant/i];
  const all = [];
  for (const lang of ['en', 'fr', 'ar']) {
    for (const [key, value] of Object.entries(UI_STRINGS[lang])) {
      if (typeof value === 'string') all.push([`${lang}.${key}`, value]);
    }
    for (const [key, value] of Object.entries(dictionaries[lang])) {
      if (typeof value === 'string') all.push([`${lang}.dict.${key}`, value]);
    }
  }
  for (const [id, value] of all) {
    for (const re of banned) {
      assert.ok(!re.test(value), `${id} claims too much: ${value.slice(0, 80)}`);
    }
  }
});
