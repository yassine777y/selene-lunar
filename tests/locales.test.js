import test from 'node:test';
import assert from 'node:assert/strict';
import { dictionaries, SITE_TEXT } from '../src/lib/locales.js';
import { SITES, getSite } from '../src/lib/sites.js';
import { recommendation, makeBrief } from '../src/lib/brief.js';
import { analyseWindow } from '../src/lib/metrics.js';
import { EPOCH_MS, MS_DAY } from '../src/lib/astro.js';

for (const lang of ['fr', 'ar']) {
  test(`${lang}: every English interface key has a nonempty translation`, () => {
    for (const key of Object.keys(dictionaries.en)) assert.ok(typeof dictionaries[lang][key] === 'string' && dictionaries[lang][key].trim(), `${lang}: ${key}`);
    assert.deepEqual(Object.keys(dictionaries[lang]).sort(), Object.keys(dictionaries.en).sort());
  });
  test(`${lang}: all landing sites have translated names, regions and descriptions`, () => {
    for (const s of SITES) {
      assert.equal(SITE_TEXT[lang][s.id].length, 4);
      assert.ok(SITE_TEXT[lang][s.id].every(x => x.trim().length > 0));
    }
  });
}

test('recommendations distinguish power problems from communication problems', () => {
  assert.equal(recommendation({ sunPct: 85, earthPct: 90, maxSunOutageH: 60 }), 'go');
  assert.equal(recommendation({ sunPct: 86, earthPct: 52, maxSunOutageH: 56 }), 'conditional');
  assert.equal(recommendation({ sunPct: 63, earthPct: 100, maxSunOutageH: 266 }), 'power');
  assert.equal(recommendation({ sunPct: 36, earthPct: 60, maxSunOutageH: 330 }), 'risk');
});

test('all three languages produce a complete, localised mission brief', () => {
  const site = getSite('connecting-ridge'), startMs = EPOCH_MS + 6 * MS_DAY;
  const metrics = analyseWindow(site, startMs, 30, 2);
  for (const lang of ['en', 'fr', 'ar']) {
    const t = (key, vars = {}) => Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, v), dictionaries[lang][key]);
    const siteText = (s) => SITE_TEXT[lang][s.id] ? { ...s, name: SITE_TEXT[lang][s.id][0], region: SITE_TEXT[lang][s.id][1] } : s;
    const text = makeBrief({ t, siteText, date: () => '2026-01-09', hours: h => `${h} h`, site, metrics, startMs, days: 30, rank: 1 });
    assert.ok(text.includes(dictionaries[lang].assessment));
    assert.ok(text.includes(dictionaries[lang].modelIntro));
    assert.ok(text.includes(siteText(site).name));
    assert.ok(text.includes(`${metrics.sunPct.toFixed(1)}%`), 'brief must quote the computed illumination');
    assert.ok(!text.includes('undefined'));
    assert.ok(!/\{\w+\}/.test(text));
  }
});
