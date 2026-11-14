/**
 * compliance.test.js — the challenge brief, as executable checks
 * ---------------------------------------------------------------------------
 * An audit can say "about 90 % compliant" and be right today and wrong next
 * week: prose rots the moment a string is edited. This file turns the brief's
 * criteria into assertions, and — more importantly — turns its *caveats* into
 * assertions too, so a future change cannot quietly delete the sentence that
 * makes a number honest.
 *
 * It deliberately does NOT compute a compliance percentage. A percentage needs
 * a weighting nobody has published, and this project's rule is that it does not
 * claim a number it cannot derive. What it can do is prove, criterion by
 * criterion, that the capability exists and that the limit is stated.
 *
 * Criteria come from the brief: plan a mission at the lunar south pole, compare
 * sites and dates, show the Sun and Earth against the horizon, show light and
 * communications, and be usable by non-specialists.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { SITES } from '../src/lib/sites.js';
import { runValidation, CHECKS, SOURCES } from '../src/lib/validation.js';
import { UI_STRINGS } from '../src/lib/ui-strings.js';
import { dictionaries } from '../src/lib/locales.js';
import { SCORE_WEIGHTS } from '../src/lib/metrics.js';
import { LOAD_KW, DEPTH_OF_DISCHARGE, PACK_WH_PER_KG } from '../src/lib/power.js';
import { TIER_OF } from '../src/lib/model-meta.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const read = (p) => readFileSync(resolve(root, p), 'utf8');
const LANGS = ['en', 'fr', 'ar'];

/* ------------------------------------------------------------------ *
 * 1. The capabilities the brief asks for
 * ------------------------------------------------------------------ */

/* Each entry names the brief requirement, the code that implements it, and a
 * check that the implementation is still there. A missing file or a renamed
 * export fails the test rather than silently emptying the UI. */
const CRITERIA = [
  {
    id: 'site-selection',
    brief: 'Plan a mission at a specific lunar south-pole site',
    where: 'src/lib/sites.js + src/components/pages/ExplorerPage.jsx',
    check: () => {
      assert.equal(SITES.length, 6, 'six candidate regions ship with the app');
      for (const s of SITES) {
        assert.ok(Math.abs(s.lat) > 84 && Math.abs(s.lat) <= 90, `${s.id} is not a polar site`);
        assert.match(s.coordSource ?? '', /published|Mazarico|Gläser|LROC|Icarus|ShadowCam/i, `${s.id} cites no coordinate source`);
      }
      assert.match(read('src/components/pages/ExplorerPage.jsx'), /DateField/);
    },
  },
  {
    id: 'date-window',
    brief: 'Choose a landing date and a mission duration, and see that window',
    where: 'src/lib/mission-state.js (analysisWindowOf)',
    check: () => {
      const src = read('src/lib/mission-state.js');
      assert.match(src, /analysisWindowOf/);
      assert.match(read('src/lib/store.jsx'), /analysisWindowOf/);
      for (const d of ['7', '30', '90']) {
        assert.ok(read('src/components/pages/ExplorerPage.jsx').includes(`value: ${d}`), `duration ${d} d missing`);
      }
    },
  },
  {
    id: 'sun-and-earth',
    brief: 'Show where the Sun and the Earth are relative to the horizon',
    where: 'src/lib/astro.js (skyState) + src/components/scene/*',
    check: () => {
      const src = read('src/lib/astro.js');
      assert.match(src, /export function skyState/);
      assert.match(src, /horizon/);
      const engine = read('src/components/scene/engine.js');
      assert.match(engine, /sunDirScene/);
      assert.match(engine, /earthDirScene/);
      // The HUD that prints Sun / Earth / Horizon next to the scene.
      assert.match(engine, /horizon/i);
    },
  },
  {
    id: 'light-and-comms',
    brief: 'Show illumination and the Earth-communications outlook',
    where: 'src/lib/metrics.js (analyseWindow) + KPI cards',
    check: () => {
      const src = read('src/lib/metrics.js');
      for (const key of ['sunPct', 'earthPct', 'maxSunOutageH', 'maxEarthOutageH']) {
        assert.match(src, new RegExp(key), `metric ${key} is gone`);
      }
      const page = read('src/components/pages/ExplorerPage.jsx');
      assert.match(page, /label=\{t\('illumination'\)\}/);
      assert.match(page, /label=\{t\('earthVisibility'\)\}/);
    },
  },
  {
    id: 'compare-sites',
    brief: 'Compare the candidate sites on the same dates',
    where: 'src/components/pages/ComparePage.jsx',
    check: () => {
      const page = read('src/components/pages/ComparePage.jsx');
      assert.match(page, /ranking\.map/);
      assert.match(page, /SLIPS/); // launch-slip matrix
      assert.ok(SITES.length > 1);
    },
  },
  {
    id: 'timeline',
    brief: 'Let the user scrub time and watch the conditions change',
    where: 'src/components/scene/TimeScrubber.jsx + TimelineChart.jsx',
    check: () => {
      assert.match(read('src/components/scene/TimeScrubber.jsx'), /stepDay/);
      assert.match(read('src/components/charts/TimelineChart.jsx'), /series|values/);
    },
  },
  {
    id: 'real-data',
    brief: 'Use real ephemerides and real terrain, not invented numbers',
    where: 'src/lib/ephemeris.js (astronomy-engine) + src/lib/terrain.js (LRO LOLA)',
    check: () => {
      assert.match(read('src/lib/ephemeris.js'), /astronomy-engine/);
      assert.match(read('src/lib/terrain.js'), /LDEM_80S_80M/);
      assert.ok(SOURCES.length >= 5, 'the source list is populated');
      for (const s of SOURCES) assert.match(s.url, /^https:\/\//, `${s.id} has no link`);
    },
  },
  {
    id: 'provenance-visible',
    brief: 'Explain the data to a non-specialist',
    where: 'Data & validation page, metric tooltips, About-the-model dialog',
    check: () => {
      assert.match(read('src/components/pages/ValidationPage.jsx'), /SOURCES\.map/);
      assert.match(read('src/components/ui/Tooltip.jsx'), /tipSource/);
      assert.match(read('src/components/InfoModal.jsx'), /modelWhat/);
      const report = runValidation();
      assert.equal(report.total, CHECKS.length);
      assert.ok(report.passed > 0);
    },
  },
  {
    id: 'bilingual-rtl',
    brief: 'Be usable in Arabic, with a genuine right-to-left layout',
    where: 'src/lib/i18n.jsx, src/lib/locales.js, src/lib/ui-strings.js',
    check: () => {
      assert.equal(dictionaries.ar !== undefined, true);
      assert.match(read('src/lib/i18n.jsx'), /rtl/);
      assert.match(read('src/styles.css'), /\[dir='rtl'\]|dir\s*=\s*'rtl'/);
      // The 3D composition mirrors too, not just the text.
      assert.match(read('src/components/scene/engine.js'), /documentElement\.dir === 'rtl'/);
    },
  },
];

for (const c of CRITERIA) {
  test(`brief criterion “${c.brief}” is implemented (${c.where})`, () => {
    c.check();
  });
}

/* ------------------------------------------------------------------ *
 * 2. The caveats. These are the part an audit marks down, so they are
 *    the part that must not be removable by accident.
 * ------------------------------------------------------------------ */

test('caveat 1 — the app never presents itself as a certified planning tool', () => {
  for (const lang of LANGS) {
    const intro = dictionaries[lang].modelIntro ?? '';
    assert.ok(intro.length > 40, `${lang}: no model statement`);
    assert.ok(dictionaries[lang].footer, `${lang}: no footer disclaimer`);
  }
  // "flight-grade", "certified", "not for navigation" — at least one explicit
  // statement per language, and the English one must be unambiguous.
  assert.match(dictionaries.en.footer, /not for navigation/i);
  assert.match(dictionaries.en.modelIntro, /prototype/i);
  assert.match(dictionaries.en.not2, /no .*certification|not .*certif/i);
  // The validation page must say, in every language, that twelve green rows are
  // a calibration and not a certification.
  for (const lang of LANGS) {
    assert.ok(UI_STRINGS[lang].valNotCertification.length > 40, `${lang}: no certification caveat`);
  }
  assert.match(UI_STRINGS.en.valNotCertification, /not an independent|calibration/i);
  // …and the word "certified" is never used as a claim about this tool.
  for (const lang of LANGS) {
    for (const [k, v] of Object.entries({ ...UI_STRINGS[lang], ...dictionaries[lang] })) {
      if (typeof v !== 'string') continue;
      assert.ok(!/\b(is|are) certified\b/i.test(v), `${lang}.${k} claims certification`);
      assert.ok(!/\bflight[- ]certified\b/i.test(v), `${lang}.${k} claims flight certification`);
    }
  }
});

test('caveat 2 — the Connecting Ridge disagreement is disclosed, not smoothed over', () => {
  const row = runValidation().rows.find((r) => r.id === 'connecting-sun');
  assert.ok(row, 'the connecting-ridge illumination check is gone');
  assert.equal(row.confidence, 'published');
  // The model really is above the published figure — if this ever stops being
  // true, the disclosure text must be rewritten, and this test says so.
  assert.ok(row.value > row.published, `model ${row.value} is no longer above ${row.published}`);
  assert.match(row.why, /upper bound/i, 'the row must call the figure an upper bound');
  assert.match(row.why, /smoothed|240 m/i, 'the row must name the cause');

  for (const lang of LANGS) {
    const text = UI_STRINGS[lang].comparePublished;
    assert.ok(text.length > 80, `${lang}: compare-page disclosure is missing`);
    assert.match(text, /98[.,]4/, `${lang}: no model figure in the disclosure`);
    assert.match(text, /89[.,]0/, `${lang}: no published surface figure in the disclosure`);
    // …and the numbers in the sentence are the numbers the model produces.
    assert.ok(Math.abs(row.value - 98.4) < 0.35, `disclosure says 98.4 %, model says ${row.value.toFixed(1)}`);
    // Corrected in the scientific review: Mazarico's Connecting Ridge C1 is
    // 89.0 % at the surface, not 86.7 % — 86.7 % is Shackleton's surface value
    // in the same table (Gläser et al. 2017, Table 1). The disclosure, the row
    // and this assertion move together.
    assert.equal(row.published, 89);
  }
});

test('caveat 3 — “Earth is visible” is never sold as a working radio link', () => {
  const page = read('src/components/pages/ExplorerPage.jsx');
  assert.match(page, /limitEarth/, 'the Explorer card must carry the link caveat');
  for (const lang of LANGS) {
    assert.ok(UI_STRINGS[lang].limitEarth.length > 20, `${lang}: no Earth-link caveat`);
  }
  assert.match(UI_STRINGS.en.limitEarth, /line of sight/i);
  assert.match(UI_STRINGS.en.limitEarth, /link budget|antenna/i);
  // Nothing in the interface may assert that a link *works*.
  for (const lang of LANGS) {
    for (const [k, v] of Object.entries({ ...UI_STRINGS[lang], ...dictionaries[lang] })) {
      if (typeof v !== 'string') continue;
      assert.ok(!/link (is )?guaranteed|verified link|working link/i.test(v), `${lang}.${k} oversells the link`);
    }
  }
});

test('caveat 4 — an illumination percentage is not sold as available power', () => {
  const page = read('src/components/pages/ExplorerPage.jsx');
  assert.match(page, /limitSun/, 'the KPI must carry the power caveat');
  for (const lang of LANGS) {
    assert.ok(UI_STRINGS[lang].limitSun.length > 20, `${lang}: no power caveat`);
  }
  assert.match(UI_STRINGS.en.limitSun, /not energy/i);
  // Battery numbers print their own assumptions, and those assumptions are the
  // ones the arithmetic uses.
  const summary = read('src/components/pages/SummaryPage.jsx');
  assert.match(summary, /batteryNote/);
  assert.match(summary, /LOAD_KW/);
  assert.match(summary, /PACK_WH_PER_KG/);
  assert.equal(LOAD_KW, 1.0);
  assert.equal(DEPTH_OF_DISCHARGE, 0.9);
  assert.equal(PACK_WH_PER_KG, 150);
  // The array card must say its percentages are geometry, not delivered watts.
  assert.match(dictionaries.en.arrayNote, /not delivered power|pas une puissance délivrée/i);
});

test('caveat 5 — the site set is a published six, and that scope is stated', () => {
  assert.equal(SITES.length, 6);
  // No free-form coordinates: the only text inputs are dates.
  for (const f of ['src/components/pages/ExplorerPage.jsx', 'src/components/pages/ComparePage.jsx']) {
    const src = read(f);
    assert.ok(!/placeholder=.*lat|latitude/i.test(src), `${f} accepts free coordinates`);
  }
  const doc = read('SOURCES-AND-LIMITS.md');
  assert.match(doc, /six|6 candidate/i, 'the docs must state the fixed site scope');
  assert.match(doc, /custom coordinates|free-form coordinates/i, 'the docs must name the missing capability');
});

/* ------------------------------------------------------------------ *
 * 3. What the brief does not require, and what we still cannot claim
 * ------------------------------------------------------------------ */

test('the reliability tiering covers every headline figure', () => {
  for (const key of ['sunPct', 'earthPct', 'score', 'battery', 'terrain', 'ephemeris']) {
    assert.ok(TIER_OF[key], `${key} has no tier`);
  }
  // The score is a product judgement, and must be labelled as one.
  assert.equal(TIER_OF.score, 'estimated');
  assert.ok(Math.abs(SCORE_WEIGHTS.sun + SCORE_WEIGHTS.earth + SCORE_WEIGHTS.night - 1) < 1e-12);
  assert.match(UI_STRINGS.en.limitScore, /product decision/i);
});

test('no file claims a compliance percentage or independent validation', () => {
  // Claims, not mentions: a sentence explaining *why* something is not
  // "verified" is exactly what we want to allow.
  const banned = [
    /100\s*%?\s*compliant/i,
    /fully compliant/i,
    /independently validated/i,
    /\bverified (by|against|with|model|data|numbers|results)\b/i,
    /\b(is|are|was|were) verified\b/i,
    /\bflight[- ]certified\b/i,
  ];
  const files = [
    'README.md',
    'SOURCES-AND-LIMITS.md',
    'DESIGN-NOTES.md',
    'COMPLIANCE.md',
    'src/lib/ui-strings.js',
    'src/lib/locales.js',
    'src/lib/validation.js',
  ];
  for (const f of files) {
    const text = read(f);
    for (const re of banned) {
      // "checked against JPL Horizons" is allowed; the word for it is not
      // "verified", because a cross-check is not a verification of the model.
      const hit = text.match(re);
      assert.equal(hit, null, `${f} contains “${hit?.[0]}”`);
    }
  }
});
