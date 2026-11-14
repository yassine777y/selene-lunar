# Data, sources and limits

SELENE is an **educational trade-study prototype**. Everything below describes
exactly what the numbers are made of, and — just as importantly — what they are
not.

---

## 1. Ephemeris

| | |
|---|---|
| Library | [`astronomy-engine`](https://github.com/cosinekitty/astronomy) (MIT) |
| Lunar theory | ELP-2000/82 (truncated), ±1 arcmin class |
| Planetary theory | VSOP87 |
| Frame | Moon-fixed, IAU pole; input UTC, TDB internally |
| Validation | **JPL Horizons**, target 301, observer 500@399, DE441, quantities 14 & 15 |

**Agreement with Horizons** (`tests/ephemeris.test.js`, five dates):

| date (UTC) | Δ sub-Earth lat | Δ sub-Earth lon | Δ sub-Solar lat | Δ sub-Solar lon |
|---|---|---|---|---|
| 2026-01-09 00:00 | < 0.05° | < 0.10° | < 0.05° | < 0.10° |
| 2026-02-20 06:30 | ” | ” | ” | ” |
| 2026-03-15 12:00 | ” | ” | ” | ” |
| 2026-06-15 18:00 | ” | ” | ” | ” |
| 2026-11-09 12:00 | ” | ” | ” | ” |

Worst observed values are 0.03° in latitude and 0.006–0.03° in longitude.
The Moon's orientation is derived from the IAU rotation pole plus
`−Libration().elon`, which is the only combination that reproduced Horizons in
this codebase; every alternative (libration vectors, spin axis, sign flips) was
tested and rejected.

Constants: Moon 1737.4 km, Earth 6371 km, Sun 695 700 km, 1 AU = 149 597 870.7 km,
mean Earth–Moon distance 384 400 km. Real per-epoch distances are used for
angular sizes (Earth 1.8°–2.1°, Sun 0.52°–0.56°).

## 2. Terrain

| | |
|---|---|
| Source | **LRO LOLA** polar DEM, `LDEM_80S_80M.IMG` (NASA PDS, imbrium.mit.edu) |
| Native resolution | 80 m/px, south-polar stereographic |
| Shipped | `<site>-160m.binz` ×6 — 384², 160 m/px, 61 km around each site (surface view) |
| | `sp-800m.binz` — 760², 800 m/px, whole 80–90 °S cap (coverage artefact, not fetched by the app) |
| Encoding | 2-D second difference of the Int16 heights, gzip-compressed — **lossless** (`src/lib/lola-codec.js`) |
| Payload | 1.4 MB for all seven grids (raw Int16 was 6.2 MB); the unpacked grids stay in `assets-src/lola/` and are not shipped |
| Horizon masks | 720 bins (0.5°), per-azimuth, marched to 60 km from the **native 80 m** grid + 2 m eye height |

Lit/shadow and Earth-link decisions are made **only** by ray-marching this DEM.
Nothing is a synthetic cosine curve. The sub-100 m detail that decides a real
touchdown is *not* in this data.

The encoding is not a compression *of the science*: `deltaField` / `undeltaField`
are exact inverses, `tests/terrain.test.js` round-trips a deliberately spiky field
and asserts equality height for height, and asserts the packed set stays under
1.6 MB so the packing step cannot be skipped by accident.

## 3. Site coordinates

Landing points are chosen on the DEM near the published reference coordinates of
each candidate region, then snapped to a locally high, well-lit spot. The offset
from the published coordinate is stated in `src/lib/sites.js` (`coordSource`).

## 4. Imagery

| Layer | Source | Licence |
|---|---|---|
| Moon colour | NASA SVS **CGI Moon Kit** (LROC WAC mosaic), svs.gsfc.nasa.gov/4720 | public domain |
| Moon normal map | derived from LOLA elevation | public domain |
| Earth day | NASA **Blue Marble** | public domain |
| Earth night | NASA **VIIRS Black Marble** | public domain |
| Earth clouds / atmosphere | illustrative | — |
| Stars | Yale Bright Star Catalogue (4 200 brightest) | public |

## 5. Where the model disagrees with the literature

We publish the disagreement rather than tuning it away
(`src/lib/validation.js`, `npm run validate`):

| Check | Model | Published | Verdict |
|---|---|---|---|
| Shackleton illumination | 82.9 % | 79–89 % | inside |
| Shackleton Earth visibility | 58.0 % | 49–65 % | inside |
| **Connecting Ridge illumination** | **98.4 %** | **89.0 %** (Mazarico 2011, surface; 92.7 % at 2 m) — **76.0 %** on Gläser 2017's 20 m DTM | **high by ~9 pp vs Mazarico, ~22 pp vs Gläser** |
| Connecting Ridge Earth visibility | 62.8 % | derived band 40–64 % | inside |
| de Gerlache illumination | 83.0 % | 79–91 % (85 % Point C, Bussey) | inside |
| de Gerlache Earth visibility | 59.1 % | 50.5–66.5 % | inside |
| Malapert illumination | 61.5 % | 58–90 % | inside |
| Malapert Earth visibility | 100 % | ~100 % | inside |

**Why Connecting Ridge runs high:** the horizon mask is built from a 240 m block-mean
of the DEM so that the ray march stays affordable in the browser. On a ridge crest
that smoothing removes the small obstructions which shade a real summit, and the
percentage rises. Read it as an **upper bound**. A full-resolution march is the
obvious next improvement.

## 5a. Numbers, definitions and how far each one can be trusted

Two numbers that look like the same number are not the same number, and the app
labels both. Every figure in the interface also carries a **reliability tier**, in
the same three words everywhere (`src/lib/model-meta.js`, rendered by
`src/components/ui/TierChip.jsx`):

| Tier | Meaning | Examples |
|---|---|---|
| **Measured** | Taken from a published dataset; we consume it, we did not produce it | LRO LOLA elevation, LROC colour mosaic, JPL Horizons ephemerides |
| **Derived** | This model's arithmetic on measured inputs — repeatable, still not an observation of the real site | illumination %, Earth-visibility %, angular diameters, longest night |
| **Estimated** | An assumption or a product judgement | mission-score weights (45/35/20), battery sizing, comparison bands with no published figure |

Nothing in the app claims verification except the Horizons cross-check, which was
actually performed. The validation page prints `Pass` only when the model is within
5 pp of the published figure; when it only passes because the tolerance was set wide
the status reads `In range, ±N` and the row's reason is printed below the table.

### The Connecting Ridge numbers, reconciled

All of these are the *same model*; they answer different questions. This is the
table to check them against each other:

| Figure | Where it appears | Definition | Value |
|---|---|---|---|
| Window illumination | Explorer card, Compare table, brief | mean visible fraction of the solar disk over the *selected* window | e.g. 100.0 % for 9 Jan 2026 + 30 d |
| Annual disk mean | Explorer KPI tooltip (“annual average”) | the same quantity over 365 d from 9 Jan 2026 | 95.0 % |
| Annual any-part | **Data & validation** table, `npm run validate` | share of that year with *any part* of the disk above the LOLA terrain horizon — the definition published polar studies use | 98.4 % |
| Published | Mazarico et al. 2011 (cited in `src/lib/validation.js`) | annual average at 89.45 °S, 222.7 °E | 89.0 % at the surface, 92.7 % at 2 m |
| Published (2) | Gläser et al. 2017, Table 1 — same coordinates, 20 m DTM | annual average | 76.0 % at the surface, 81.3 % at 2 m |

Why the model is high: the shipped terrain is a **240 m block-mean** of the 80 m
LOLA DEM so the browser ray march stays affordable, and that smoothing deletes the
small obstructions that shade a real ridge crest. So the model's Connecting Ridge
illumination is an **upper bound**, and the UI says so where the number is shown
(Compare page legend, Data & validation, model dialog).

The same rule applies to the two "percent" columns everywhere else: the Explorer
cards show a *disk-mean over your window*, the validation table shows an
*any-part share of the reference year*. `valMethod` in the dictionaries states this
in all three languages; `tests/consistency.test.js` pins the constants.

## 5b. Cross-checks on the sky model itself

Every number the UI quotes about the sky is produced by **one** 400-day daily
scan of the ephemeris (`skyCycle()` in `src/lib/validation.js`), so the facts can
never disagree with each other or with the 3D scene. `tests/consistency.test.js`
locks each of them to its published value:

| Quantity | Model | Published | Note |
|---|---|---|---|
| Sub-solar latitude amplitude (Sun's ceiling at a pole) | 1.59° | 1.5424° (IAU obliquity) | +0.04° residual, inside the ±0.1° daily sampling of the scan; shown in the UI next to the value |
| Libration in latitude (Earth's up/down swing) | ±6.9° | ≈ ±6.7° (Kaguya/JPL) | Earth's elevation swing at Shackleton comes out −6.7° … +6.9° |
| Earth's apparent diameter from the Moon | 1.80°–2.05° | 1.8°–2.1° | live per-epoch distance, not a constant |
| Sun's apparent diameter from the Moon | 0.52°–0.54° | 0.52°–0.56° | |
| Earth-from-Moon vs Moon-from-Earth size | 3.7× | 3.7× | constant = radius ratio |
| Synodic month, measured full-moon to full-moon | 29.55 d | 29.5306 d | 12-interval mean on the ephemeris |

Values that used to be literals in the JSX — the 1.90° Earth disk, the
"1 kW · 90 % DoD · 150 Wh/kg" battery note, the 0.45 / 0.35 / 0.20 score
weights, the model version — now come from `power.js`, `metrics.js`
(`SCORE_WEIGHTS`) and `model-meta.js`. `tests/consistency.test.js` asserts that
the printed text and the calculation use the same numbers.

## 5c. Scope: six published regions, no custom coordinates

The site set is fixed: the six Artemis-era candidate regions this study compares
(Shackleton Rim, Connecting Ridge, de Gerlache Rim, Malapert Massif, Nobile Rim 1,
Cabeus B). Each landing point is snapped from its published reference coordinate
to a locally high, well-lit spot on the DEM, and the offset is stated in
`src/lib/sites.js`. **Custom or free-form coordinates are not supported** — the
horizon masks are precomputed per site from the 80 m DEM, so an arbitrary point
would need a new mask (a build step, not a text field). The brief lists that as an
optional idea, not a requirement; it is recorded here so nobody assumes it works.

## 5d. How much the terrain layer can move the answer

`node scripts/horizon-audit.mjs` rebuilds every shipped horizon mask from the
shipped 400 m cap grid with the shipped `horizonFromField`, at three cell sizes,
and reports the difference. It writes `tests/fixtures/horizon-audit.json`;
`tests/horizon-audit.test.js` turns that file into assertions.

The 400 m master (`assets-src/lola/sp-400m.bin`, 4.6 MB raw) is **not** in the
delivered archive — it would break the 5 MB budget. The script therefore has two
modes and says which one it used on its first line: with the master present it
reports 400 / 800 / 1600 m; without it, it decodes the shipped
`public/data/lola/sp-800m.binz` and reports 800 / 1600 m over the same 608 km
disc, leaving the saved fixture untouched (that fixture is the input of the test,
and a two-grid run must not silently replace a three-grid one). So a fresh clone
can audit itself; only the 400 m column needs the master back.

| Site | Shipped sun (annual, any-part) | Recomputed from the shipped DEM @400 m | Difference | Spread 400 → 1600 m | Reproduced by a shift of |
|---|---|---|---|---|---|
| Shackleton Rim | 82.9 % | 30.6 % | **+52.3 pp** | 3.9 pp | **0.45 km** (residual 0.16°) |
| Connecting Ridge | 98.4 % | 78.0 % | **+20.5 pp** | 12.1 pp | **0.87 km** (0.46°) |
| de Gerlache Rim | 83.0 % | 75.7 % | +7.3 pp | 8.8 pp | 1.03 km (0.47°) |
| Malapert Massif | 61.5 % | 40.4 % | +21.1 pp | **15.9 pp** | 12.4 km (1.66°) |
| Nobile Rim 1 | 38.1 % | 38.2 % | −0.1 pp | 0.5 pp | 0 km (0.04°) |
| Cabeus B | 39.8 % | 38.9 % | +0.9 pp | 1.0 pp | 0 km (1.16°) |

The "shipped" column is the app's own number: the script borrows `skyState()`
rather than carrying a second Sun/Earth geometry, so the audit and the screen
cannot disagree.

What this measures, and what it does not:

- **The shipped masks are not reproducible from the shipped 400 m grid.** They
  were produced offline from a finer DEM with a slightly different site
  coordinate. The audit shows the difference is **positional, not algorithmic**:
  a sub-kilometre move along the ridge reproduces the shipped mask almost
  exactly (matching the ray-march code, curvature term, azimuth convention and
  elevation limits), while Nobile and Cabeus — where a broad ridge top dominates
  the horizon — agree to 0.1 pp without any move at all. That agreement is the
  control: the geometry is right, the *localisation* is what differs.
- **Terrain cell size is not the dominant error term.** Collapsing the grid from
  400 m to 1600 m moves annual illumination by 0.5–15.9 pp. Moving a site by
  under a kilometre moves it by up to 52 pp. Siting uncertainty beats resolution
  uncertainty by an order of magnitude at the two knife-edge sites.
- **Higher resolution is not monotonically better here.** The 400/800/1600 m
  grids do not nest per site (a coarser cell can raise a crest slightly instead
  of smoothing it away), so no claim that "finer is always closer" is made.
- **Connecting Ridge is an upper bound because of smoothing**, as §5 says; the
  audit adds that its *neighbourhood* is knife-edged: within 0.9 km the annual
  figure moves tens of points. A single-site percentage is a band, and only the
  **ordering** between sites is robust. The UI says this under the validation
  table (`valHorizonBand`, EN/FR/AR).

## 5e. What makes the numbers move

`tests/sensitivity.test.js` holds the four behaviours a planner depends on, using
ordering and difference assertions rather than pinned values:

1. **Site matters.** Daily sun/Earth series differ by >5 pp on at least 10 % of a
   180-day sample for *every* pair of the six sites.
2. **Date matters.** Across five dates a week apart, every site's window mean
   moves — through sunlight where it can, and always through the Earth link,
   which is geometry, not terrain.
3. **Duration matters, and is a mean.** A 90-day mean lies inside the range of
   the three 30-day windows that tile it; 7 d and 90 d Earth visibility differ by
   more than the libration sampling noise.
4. **The sky model moves.** The Sun vector in the Moon-fixed frame moves >5°/day,
   the Earth vector >2°/week, and Earth's rotation advances.

One finding worth stating plainly: **a fully lit window can tie two different
sites**. In a 30-day window Shackleton (98.60 %) and de Gerlache Rim (98.62 %)
both round to 98.6 % sun, while their annual series differ on 75 of 180 sampled
days. The Compare page says so in the rank legend rather than letting a
one-place gap read as a verdict.

## 6. What this is not

- Not flight-grade, not a navigation tool, not a survival analysis.
- **Earth is above the terrain ≠ a working radio link.** Line of sight is all this
  model knows: no antenna pattern, no link budget, no multipath off a 1 km crater
  rim, no thermal noise, no relay. An “Earth visibility 52.5 %” means the disk was
  above the horizon half the time, nothing more.
- **Illumination ≠ power.** The polar Sun sits ~1.5° above the horizon, so a flat
  array collects a small fraction of normal-incidence flux; the array card states
  that its percentages are idealised incidence while sunlit, not delivered watts.
  No thermal model, no heater load, no degradation.
- The mission score (45 % sunlight + 35 % Earth link + 20 % night resilience,
  one definition in `SCORE_WEIGHTS`) is a product decision, not a physical law.
- Star colours, the Milky Way band, the solar bloom and the site pins are drawn
  overlays, never measurements.
- **Framed** mode compresses the Earth–Moon separation for legibility and always
  shows a “not to scale” badge. The Earth is placed by solving angles from the
  live camera (`src/components/scene/framing.js`): its disc never touches the
  Moon's limb and never leaves the frame, and when the Moon is zoomed in so far
  that no honest seat is left, the Earth is moved deeper — smaller — rather than
  drawn on top of the Moon. `tests/framing.test.js` asserts both invariants over
  105 camera/aspect/side combinations.
- **True scale** puts the Earth back 384,400 km away. From near the Moon the two
  bodies cannot both be in shot (the Earth is either behind the camera or hidden
  behind the Moon), so the vantage is the Moon's far side, swung 14° toward the
  Sun and tilted slightly poleward: the Earth then clears the limb and appears at
  its real ~1.9° — which is the point of the mode.
