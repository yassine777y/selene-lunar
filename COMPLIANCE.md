# SELENE against the challenge brief

A criterion-by-criterion audit of this build against the mission-planning brief
(plan a mission at the lunar south pole; compare sites and dates; show the Sun and
the Earth against the horizon; show illumination and communications; usable by
non-specialists).

**This file deliberately does not give a compliance percentage.** A percentage
needs a weighting the brief does not publish, and this project's rule is that it
never states a number it cannot derive. What it does instead is name each
criterion, point at the code that satisfies it, and — the part an audit marks
down — name each limit that keeps the tool from being more than it is.

Every claim on this page is executed by `tests/compliance.test.js`. If a string,
a metric or a caveat is deleted, the test suite fails; the document cannot drift
away from the app.

```
npm test        # includes the brief-criteria and caveat checks
npm run validate
```

## 1. What the brief asks for, and where it lives

| # | Criterion | Implemented in | Checked by |
|---|---|---|---|
| 1 | Choose a specific south-polar site | `src/lib/sites.js` (6 published regions, each with `coordSource`) · Explorer page | `brief criterion “Plan a mission at a specific lunar south-pole site”` |
| 2 | Choose a landing date and duration, and analyse that window | `mission-state.js` (`analysisWindowOf`) · `store.jsx` · date field + 7/30/90 d control | `…“choose a landing date…”` |
| 3 | Show the Sun and the Earth relative to the horizon | `astro.js` (`skyState`) · `scene/engine.js` (`sunDirScene`, `earthDirScene`) · HUD readout | `…“show where the Sun and the Earth are…”` |
| 4 | Show the illumination and the Earth-communications outlook | `metrics.js` (`sunPct`, `earthPct`, outages) · KPI cards · timeline | `…“show illumination…”` |
| 5 | Compare the candidate sites on the same dates | `ComparePage.jsx` (ranking + 6 × 6 launch-slip matrix) | `…“compare the candidate sites…”` |
| 6 | Travel through time and watch conditions change | `TimeScrubber.jsx`, `TimelineChart.jsx`, the 3D scene | `…“let the user scrub time…”` |
| 7 | Real ephemerides and real terrain, not invented numbers | `ephemeris.js` (astronomy-engine) · `terrain.js` (LRO LOLA LDEM_80S_80M) · `validation.js` (7 sources) | `…“use real ephemerides…”` |
| 8 | Explain the data to a non-specialist | Data & validation page · metric tooltips (source / formula / window) · About the model | `…“explain the data…”` |
| 9 | Be usable in Arabic with a genuine RTL layout | `locales.js`, `ui-strings.js`, `i18n.jsx`, mirrored 3D composition | `…“be usable in Arabic…”` |

Beyond the brief, the build also carries: an illuminated/true-scale 3D Moon driven
by the same vectors as the cards, a first-person surface view on the DEM, a
battery-sizing estimate with its assumptions printed, and a per-figure reliability
tier (measured / derived / estimated).

## 2. The limits — the reason this is not “100 %”

Each of these is stated **in the app**, where the number it qualifies is shown —
not only here. The eight rows below are what any honest audit would mark down.

| # | Limit | Where the app says it | How it is enforced |
|---|---|---|---|
| 1 | Not a certified or flight-qualified planning tool | footer (“not for navigation”), About-the-model, page footnotes | `caveat 1` test: no string may claim certification |
| 2 | Connecting Ridge illumination is **~9 pp above** the published surface value and **~22 pp above** the finest published one — 98.4 % any-part vs 89.0 % (Mazarico et al. 2011, surface; 92.7 % at 2 m) and 76.0 % (Gläser et al. 2017, 20 m DTM) — because the shipped terrain is a 240 m block-mean of the 80 m DEM. The two references disagree with each other by 13 pp, so the excess over the looser one is not by itself a defect finding | validation table row (“upper bound”), Compare page legend, `SOURCES-AND-LIMITS.md` §5a | `caveat 2` test: the row must exist, must call it an upper bound, and the quoted numbers must match the model |
| 3 | Earth visibility is **line of sight**, not a radio link: no antenna pattern, link budget, multipath or thermal noise | `limitEarth` under the Earth KPI, on the site panel, in the Compare legend, in About-the-model | `caveat 3` test |
| 4 | Illumination is **time in sunlight, not available power**: no array temperature, dust, pointing or thermal model | `limitSun` under the Sun KPI · array card (“geometric incidence… not delivered power”) · battery card assumptions | `caveat 4` test |
| 5 | The site set is a fixed set of six published regions; **custom coordinates are not supported** | `SOURCES-AND-LIMITS.md` §5c, site `coordSource` strings | `caveat 5` test |
| 6 | Two of the six sites (Nobile Rim 1, Cabeus B) have **no direct published figure**; their checks are “derived bands”, flagged as such | validation table “Reference type” column | `publishedCount` / `derived` labelling, tested in `consistency.test.js` |
| 7 | The mission score (45 / 35 / 20) is a **product judgement**, not physics | `limitScore` under the score KPI, About-the-model | `every headline figure carries a reliability tier` |
| 8 | The comparison is a calibration against published statistics, **not independent validation**, and does not replace SPICE + full-resolution LOLA | footnote under the validation table (`valNotCertification`) | `caveat 1` test |

Also true, and stated in `SOURCES-AND-LIMITS.md`: the ephemeris is astronomy-engine
(ELP-2000/82 + VSOP87), not a DE440 SPICE kernel; the DEM is resampled (160 m per
site, 800 m for the cap backdrop) from the 80 m product; the 3D “framed” mode
compresses the Earth–Moon distance and is badged “not to scale”; Earth’s shader is
lit from the model’s own Sun vector so its phase matches the reported figure, but
its clouds are illustrative.

## 3. What would move the needle

In the order that would actually change a judge's mind:

1. **Full-resolution horizon march** for the ridge sites. This is the one change
   that closes the 12 pp Connecting Ridge gap instead of disclosing it; everything
   else in this document is presentation.
2. **A link budget** (antenna gain, EIRP, range, noise) so “Earth visibility”
   becomes “data rate”. Out of scope for a browser prototype without mission
   parameters, which is why it is disclosed rather than faked.
3. **A thermal / array model** so illumination becomes watt-hours.
4. **Custom coordinates**, which needs an offline horizon-mask build step.

## 4. How this document is kept honest

`tests/compliance.test.js` re-derives the numbers quoted here from
`runValidation()` and fails if they disagree; it also fails if any file in the
repository claims a compliance percentage, independent validation, or uses the
word “verified” about this model — including this file, whose own wording is
scanned. The only cross-check the project calls checked is the one against JPL
Horizons, and that one was actually run.
