# SELENE · Lunar intelligence

An interactive, multilingual lunar south-pole mission-planning **prototype**.
React + Vite + Three.js, driven by a real ephemeris and real LRO terrain.
No API key, account, database, or backend required.

**Audit:** [COMPLIANCE.md](COMPLIANCE.md) walks the build against the challenge
brief, criterion by criterion, and every claim in it is a test.

**Size:** the zip is 3.8 MB — 136 files, no `node_modules`, no image masters. See
[v12](#v12--same-app-25-mb--38-mb).

## Run it in VS Code

1. Extract `selene-lunar-planner.zip`.
2. Open the extracted folder in VS Code — the folder containing `package.json` and `index.html`.
3. Open **Terminal → New Terminal**, then run:

```bash
npm install
npm run dev
```

Open **http://localhost:5173**. Node.js 20+ is recommended.

**بالدارجة:** فكّ الضغط، حلّ الفولدر فـ VS Code، وحلّ Terminal. شغّل `npm install` ومن بعد `npm run dev`.

**En français :** décompressez le projet, ouvrez le dossier dans VS Code, puis lancez les deux commandes ci-dessus.

## What changed in v7 — the real-sky rebuild

The 3D scene used to be a convincing illustration. It is now a **view of the
actual sky**, and every number on screen comes from the same computation as the
pixels.

- **Real ephemeris.** `astronomy-engine` (ELP-2000/82 + VSOP87) gives the Sun,
  Earth and Moon vectors, optical *and* physical libration, the Moon's 1.5424°
  axial tilt and the Earth's sidereal rotation. Orientation is checked against
  **JPL Horizons** at five dates and stays inside 0.03° (`tests/ephemeris.test.js`).
- **Real terrain.** Horizon masks are ray-marched across the **LRO LOLA
  `LDEM_80S_80M`** DEM out to 60 km for every one of 720 azimuth bins per site.
  Lit/shadow and Earth-link are decided by that terrain — never by a cosine curve.
  The polar Sun really does stay within ±1.5° of the horizon and the Earth within
  ±7°; the terrain is what makes the difference, so the angles are not exaggerated.
- **One source of truth.** `skyFrame(ms)` lights the Moon, places the Earth, fills
  the KPI cards, the timeline bands, the scene legend and the validation table.
  Change the date or the site and all of them move in the same frame.
- **Surface view.** First-person at the landing site on the DEM, real sun and Earth
  positions, horizon silhouettes, compass ribbon, drag to look, exposure lifted for
  a dark-adapted eye (exposure only — no light is ever added).
- **Orbital view.** Damped orbit camera with **Framed** (bodies enlarged, "not to
  scale" badge, true distance in the legend) and **True scale** (real 1.8–2.1°
  Earth at 384 400 km), plus camera presets: frame the Moon, fly to the Earth,
  fly to the site.
- **Honesty.** The *Data & validation* page now prints the disagreements next to the
  agreements — including Connecting Ridge at 98.4 % against Mazarico's published
  89.0 % at the surface (92.7 % at 2 m), with the reason. Full detail in [`SOURCES-AND-LIMITS.md`](SOURCES-AND-LIMITS.md).

```bash
npm test            # 230 unit tests: ephemeris vs Horizons, terrain geometry, published ordering,
                    # plus consistency checks that pin every quoted constant to its calculation
npm run validate    # the 12 published checks, printed
npm run build && npm run test:browser   # 19 real-browser checks
node scripts/horizon-audit.mjs         # re-derive every horizon mask from the DEM (≈30 s)
```

---

## v12 — same app, 25 MB → 3.8 MB

Nothing about the model, the data or the design changed. The *payload* did.

| | Before | After | How |
|---|---|---|---|
| LOLA grids | 6.2 MB (raw Int16) | **1.4 MB** | `*.binz`: a 2-D second difference of the heights, gzipped, undone at load with the browser's own `DecompressionStream`. Lossless — the transform has an exact inverse and a test round-trips it |
| Moon + Earth maps | 15.4 MB | **1.2 MB** | WebP at the same sizes the shaders sample; the 11 MB normal map is now 0.43 MB, the 4k colour mosaic is 2k |
| Hero photo | 244 kB | **115 kB** | WebP, 1600 px |
| Screenshots (9) | 3.0 MB | **0.5 MB** | WebP |
| `selene-lunar-planner.zip` | 25 MB | **3.8 MB** | all of the above |

What this costs: the Moon's colour mosaic is sampled at 2048×1024 instead of
4096×2048, so at maximum zoom the far side is slightly softer; the Earth triplet
is 1024×512, which is what the shader was already limited to on screen. Nothing is
resampled at runtime, no quality knob was added, and no number the app reports
depends on a texture.

Two files are **not** in the zip because they are inputs, not part of the app:

- `assets-src/textures/`, `assets-src/hero/` — the original PNG/JPEG masters;
- `assets-src/lola/*.bin` — the unpacked 80 m / 160 m / 400 m grids.

The workspace keeps them; `node scripts/pack-terrain.mjs` rebuilds
`public/data/lola/*.binz` from them at any time. To re-encode a texture, point
your image tool at the same size and write WebP into `public/assets/textures/`.

## Reading the history below

v3–v6 describe the build as it stood at the time. Anything they say about
*synthetic* or *calibrated* site horizons was replaced in **v7** by the LOLA ray
march; where an older section disagrees with v7 or with
[`SOURCES-AND-LIMITS.md`](SOURCES-AND-LIMITS.md), the later documents win.

## v6 — the interface redesign

A full rebuild of the visual layer against one design system, with no change to the
model behind it. The short version: bigger type (nothing under 12 px), AA contrast,
one 8 px spacing grid, one container primitive, one store that feeds every card and
chart, real empty states, and Arabic that is genuinely right-to-left.

- **Design tokens** in `src/design/tokens.css` (+ a JS mirror for canvas/SVG/Three.js
  that a test keeps in sync): 3 surface levels, metric colours (Sun amber, Earth teal,
  Score violet), a fixed 12/14/16/20/28/40/56 type scale, 8 px spacing, 16 px cards.
- **Components**: `Card`, `Metric`, `Sparkline`, `ScoreRing`, `SegmentedControl`,
  `DateField`, `Badge`, `Tooltip`, `SidebarItem`, `ChartPanel` — all in
  `src/components/ui/`.
- **One source of truth**: `src/lib/store.jsx` + a pure reducer (`mission-state.js`).
  The analysis window is *defined* as landing date + duration, so the "01/09/2026 vs
  9 Jan – 8 Feb" mismatch cannot come back. A browser test changes the date and
  asserts every KPI and the 3D chip move with it.
- **3D viewer**: real Sun lighting with a visible terminator, a faint dashed polar
  guide instead of the crossing orbit line, labels outside the spheres with leader
  lines, the Earth as a small sky inset whose phase comes from the real Sun–Moon–Earth
  angle, and in Surface view the Sun and Earth at their true 0.52–0.54° / 1.8–2.05° sizes.
  In framed mode the Earth's seat beside the Moon is *solved* every frame
  (`scene/framing.js`): the discs never touch at any zoom, and the Earth is never
  drawn on the lunar disc.
- **Real empty states**: "No night" explains the fully-lit window instead of drawing a
  flat line; the battery card shows `—` when there is no night to survive.
- **RTL**: mirrored shell, flipped icons, mirrored charts and popovers, IBM Plex Sans
  Arabic, LTR-isolated numerals.
- **Docs**: the full change list and rationale is in [`DESIGN-NOTES.md`](DESIGN-NOTES.md).

## What changed in v5

Two things were wrong, and both are fixed in a way you can check.

**1. The 3D Earth was smaller than the Moon and sitting right next to it.**
It was drawn at radius 0.36 against a Moon of radius 1.8 (one fifth of the Moon) at
five Moon-radii away. In reality the Earth is **3.667× the Moon's radius** and
**384,400 km = 221 Moon radii** away. The new scene keeps the *size ratio exact* —
Moon 1.8 units, Earth **6.60 units** — and places the Earth at the distance where it
reads slightly **wider** than the Moon on screen (1.12×), which is ~15.7 Moon radii
back. Distances that large cannot fit in one frame, so the distance is compressed
~14×; that compression is now printed under the 3D view instead of being hidden.
In the surface view the Earth is drawn at its **true 1.899° angular diameter**, at the
altitude the sky model gives for the selected site and date, and it is hidden when the
model says it is below the terrain horizon. Its phase comes from the real Sun–Moon–Earth
angle (the separation of the two bodies in the lunar sky).
Everything lives in one new module, `src/lib/geometry.js`, and is asserted by
`tests/geometry.test.js`.

**2. The data audit found three real errors.** All fixed:

| What | Was | Now | Why |
| --- | --- | --- | --- |
| Full-Moon epoch | 2026-01-03 **00:00** UTC | 2026-01-03 **10:03** UTC | the January 2026 full Moon was at 10:03 UTC — a 10-hour phase error in every output |
| Shackleton rim | 89.7°S, 129.8°E | **89.66°S, 129.20°E** | LROC places the south pole just inside the rim |
| Connecting Ridge | 89.46°S, 222.66°E | **89.45°S, 222.69°E** | Mazarico 2011 / Gläser 2017 block coordinates |
| de Gerlache rim | 88.4°S, 271.9°E | **88.50°S, 271.70°E** | published crater coordinates |
| Malapert Massif | 86.0°S, 2.5°E | **86.04°S, 2.70°E** | Gläser 2017 point M1 |
| Nobile Rim 1 | 85.4°S, 53.0°E | **85.30°S, 53.30°E** | Icarus / ShadowCam studies |
| Cabeus B | 84.6°S, 313.0°E | **84.46°S, 313.43°E** | ShadowCam radiance study |

Every site now carries a `coordSource` string naming the paper it comes from, and the
horizon profiles were re-fitted with `node scripts/calibrate.mjs` after the epoch fix.

## What changed in v4

- **Photoreal Earth.** The flat, uniformly glowing blue sphere is gone. Earth is now a
  shader-lit planet built from real imagery: true-colour day map, a proper day/night
  terminator, **city lights that appear only on the dark side**, a specular sun-glint on
  the oceans, relief from a normal map (land only), a drifting cloud shell, and a thin
  scattering limb that reddens toward the terminator. It is lit from the same direction
  as the Moon, so both bodies agree about where the Sun is.
- New module `src/components/earth.js`; the Moon's crater relief was brought up to match.
- Five new bundled textures plus a derived night-lights mask — all local, nothing fetched
  at runtime. See `public/assets/CREDITS.md`.
- A new `tests/assets.test.js` suite fails the build if any texture is missing, too small,
  or not a 2:1 equirectangular map (a missing map used to render a silent black sphere).

## What changed in v3

- **Data provenance.** A new **Data & validation** view (and `npm run validate`) checks every
  headline number against published LRO / Kaguya results, with clickable sources, and separates
  published figures from derived sanity bands.
- **Corrected polar physics.** Partial disk occultation (the Sun is ~0.53° across, Earth ~1.9°, so a
  grazing body is *partly* hidden); site horizons re-calibrated so illumination and Earth visibility
  land inside the published spread for each region.
- **Earth in the polar sky** is now explained properly: a figure-of-eight within ±7° of the horizon,
  invisible ~2 weeks per lunar month — the reason no direct-to-Earth link at the pole is continuous.
- **Honest seasonal framing.** Mission-window numbers are shown next to the annual average, and a
  window with no night reads "none · continuous daylight" instead of "0 min".

## What changed in v2

- **A genuinely interactive 3D Moon** with a locally bundled lunar texture, selectable south-pole site markers, an orbital path, and a small Earth model.
- **Surface view:** a procedural 3D lunar terrain and an original gold-foil lander with articulated-looking legs, a dish, and solar panels. This is an illustrative scene, not a reconstruction of a real landing site.
- Drag to orbit; scroll or use the buttons to zoom. Coordinate grid / terrain wireframe, reset camera, and expanded-view controls work in both scene modes.
- **English, French, and Arabic throughout:** navigation, controls, site descriptions, methodology, and downloaded mission briefs. Arabic activates a mirrored RTL workspace. The language preference is saved locally.
- **New typography:** Space Grotesk for display text, Manrope for the Latin interface, and Tajawal for Arabic. Fonts are bundled locally — no Google Fonts request at runtime.
- A restrained violet visual system with warm solar, cool communication, and peach night-resilience accents.
- A **fixed mission timeline**: scrubbing changes the preview instant, not the mission’s origin. This avoids the old runaway-drag bug and keeps window statistics consistent.
- Different recommendations for communication-constrained sites and power-constrained sites.

## Explore the application

### Lunar explorer

Choose a landing region from the selector or the six site cards. Set a landing date and a 7-, 30-, or 90-day mission window. Switch between **Orbital view** and **Surface view**.

The four summary cards report illumination, direct-to-Earth visibility, composite mission score, and longest continuous night. Selecting a metric opens the mission brief.

Drag the timeline or play through the mission. The Sun and Earth **altitude readouts** update at the selected instant. The window-level statistics continue to describe the complete selected mission window.

### Site comparison

All six sites use identical dates and sampling. The launch-delay matrix calculates 36 alternatives. Click a cell to open that site at its delayed landing date.

### Data & validation

Every headline number next to the published LRO / Kaguya range for that region, with clickable sources. It also shows what Earth actually does in the polar sky — a slow figure-of-eight within ±7° of the horizon, invisible for about two weeks a month — and states plainly which figures are published and which are derived sanity bands.

### Mission brief

Read the recommendation, power-storage estimate, and idealised solar-array comparison. Copy the summary or download a UTF-8 text file in the selected language. Header **Export brief** also downloads the current assessment.

### Keyboard controls

| Key | Action |
| --- | --- |
| `←` / `→` | Move the cursor by one Earth day |
| `Space` | Play / pause the mission timeline |
| `C` | Open / close site comparison |
| `Esc` | Close the expanded scene or active dialog |
| Slider focused: `Home` / `End` | Jump to the beginning / end of the mission |

Shortcuts do not intercept typing in inputs, select elements, or native button activation.

## Scientific scope — important

**This is an educational trade-study prototype, not a flight-planning product.**
But the numbers are no longer arbitrary: every headline figure is checked against
published LRO / Kaguya results. See the **Data & validation** view in the app, or run
`npm run validate`.

### What the model does

| Effect | Implementation |
| --- | --- |
| Sun sub-point longitude | 360° per **29.530588 d** synodic month (computed from the ephemeris, not integrated) |
| Sun declination | ±**1.5426°** over a tropical year (the Moon's 1.54° obliquity → grazing polar light) |
| Earth sub-point | ±6.69° latitude (27.55 d) and ±7.9° longitude (27.21 d) libration |
| Visibility | body altitude vs the **LOLA ray-marched terrain horizon** at that azimuth |
| Occultation | **partial**: the visible fraction of each disk is averaged, not a binary on/off (Sun 0.52–0.54° across, Earth 1.80–2.05° across) |

### Where the model meets the literature

The model is **not tuned per site**. The horizon is the LOLA ray march; the sky is
the ephemeris. Where the result differs from a published figure, the difference is
shown, not absorbed.

This file deliberately does **not** quote the numbers any more — a doc with its own
copy of a table is the first thing that goes stale. The single source is
`npm run validate` (or **Data & validation** in the app), which prints, for every
site and for the connecting ridge:

| Row | What it says |
| --- | --- |
| Model value | the model over 365 days from 9 Jan 2026, sampled every 6 h — **derived** |
| Published value ± tolerance | the cited figure and the disagreement we are willing to call agreement — **measured** (or “derived band” where no published figure exists for that block) |
| Status | `Pass` only when the difference is under 5 pp; `In range, ±N` when it passes on a deliberately wide tolerance; the reason is printed underneath either way |

Two figures are easy to confuse, so both are labelled in the UI:

- the **Explorer cards** show the mean visible fraction of the disk over *your*
  window — a share of time, not irradiance;
- the **validation table** uses the definition the published polar studies use —
  the share of the year with *any part* of the disk above the terrain horizon. On
  the same year that reads higher, which is why Connecting Ridge is 98.4 % there
  and lower as a disk mean.

**The one honest disagreement.** Connecting Ridge illumination comes out at 98.4 %
(any-part, annual) against Mazarico et al. 2011's 89.0 % at the surface / 92.7 % at
2 m — and against Gläser et al. 2017's 76.0 % / 81.3 % for the same spot on a finer
20 m DTM. The spread between the two published references (13 pp) is larger than
this model's excess over the looser one (9 pp), which is the honest way to read
both numbers. The shipped terrain is a 240 m block-mean of the 80 m DEM so the ray march
stays affordable in a browser; that smoothing removes the small obstructions that
shade a real ridge crest, and the percentage rises. **Read it as an upper bound.**
A full-resolution march is the obvious next improvement.

Nothing in the app claims verification except the Horizons cross-check, which
really was performed against Horizons.

### What it still does not do

- No SPICE: the ephemeris is `astronomy-engine`, not a DE440 SPICE kernel, and the shipped DEM is
  resampled (400 m polar cap / 160 m per site) from the 80 m LOLA product. Horizons agreement is
  quoted only where it was actually measured: orientation, five dates.
- Direct-to-Earth **visibility is not a proven radio link**: no antenna pattern, no link budget,
  no multipath/terrain scattering (a real issue at these grazing angles).
- Battery estimates assume a constant 1 kW load, 90% depth of discharge, 150 Wh/kg, and exclude
  thermal loads, reserve policy, degradation, and hardware overhead.
- Array percentages are idealised angle-of-incidence figures while sunlit, not delivered electrical power.
- The 3D scene is staged and illustrative; do not read object placement as an ephemeris plot.
  Body **sizes** are at the true 3.667 : 1 ratio and the surface-view Earth is at its true
  1.8–2.05° width, but the Earth–Moon **distance** in the orbital view is compressed by a factor of
  tens (it depends on zoom and aspect) to fit both bodies in one frame — the "not to
  scale" badge is on whenever that happens.
  Earth's shader is a physical-looking *model* (terminator, glint, city lights), not a
  simulation of Earth's actual rotation or cloud cover at a given date.
- No operational terrain clearance or flight certification.

### Sources

Mazarico et al. 2011 (LOLA illumination) · Gläser et al. 2017 (lunar pole illumination) ·
Kaguya illumination & communication study · Sverdrup–Henson 2023 (iScience, Earth-visibility table) ·
NASA Lunar Communications & Navigation Architecture 2024 · NASA NESC visual-environment study ·
LROC polar imaging. Full titles, links and per-check notes are in the in-app **Data & validation** view.

## Test & build

```bash
npm test              # 230 unit tests: geometry, disk occultation, metrics, translations,
                      #   the published-data cross-check, asset integrity, and the design
                      #   system (tokens, contrast, type floor, EN/FR/AR parity, one window)
npm run validate      # print the published-data cross-check in the terminal
npm run build         # production output in dist/
npm run preview       # inspect the production build locally
```

Optional browser checks:

```bash
npx playwright install chromium
npm run build
npm run test:browser
# Optional screenshots:
npm run test:browser -- --screenshots
```

On Linux, Playwright may also need `npx playwright install-deps chromium`.
The browser script starts a temporary local static server and shuts it down when finished; it is **not** an application backend.

**Test run:** 230 unit tests and **19 real-browser checks** pass. The browser run covers
WebGL + local fonts, "date → analysis window → every KPI" consistency, keyboard and mouse
timeline scrubbing, site switching, the 3D controls and both view modes, the metric
tooltips, Arabic RTL and French persistence, the comparison table and its 36 launch-slip
cells, a real localised brief download, the dialogs, and mobile layout at 390 px.
No JavaScript console errors, missing assets, or external runtime requests were found in
the tested Chromium environment.

A labelled 2D preview is displayed if WebGL cannot initialise. Modern browsers with WebGL support provide the complete 3D experience.

## Files you will edit

```text
index.html                   Vite entry point — keep at project root
src/App.jsx                  Mission state and workspace layout
src/styles.css               Palette, typography, responsive & RTL rules
src/design/tokens.css        Design tokens (colour, type, spacing, radius, motion)
src/design/tokens.js         The same palette for canvas / SVG / Three.js
src/components/ui/           Card, Metric, Sparkline, Badge, Tooltip, ChartPanel,
                             SegmentedControl, DateField, SidebarItem
src/components/LunarScene.jsx 3D Moon, Earth inset, lander, terrain, camera
src/components/charts/TimelineChart.jsx  Scrubbable Sun/Earth altitude chart
src/components/pages/        Explorer, Compare, Summary, Validation
src/components/Sidebar.jsx   Navigation shell
src/components/TopBar.jsx      Breadcrumb, language switch, export
src/components/Sidebar.jsx     Navigation (right side in Arabic)
src/components/InfoModal.jsx   "About the model" and keyboard shortcuts
src/components/ui/             Card, Metric, ChartPanel, Tooltip, TierChip, …
src/components/charts/         Timeline chart (one series source)
src/components/pages/          Explorer, Compare, Mission summary, Data & validation
src/components/scene/          Three.js engine, build (geometry/materials), framing, viewer
src/lib/store.jsx              The single source of truth for mission state
src/lib/mission-state.js       Its pure reducer (window = date + duration)
src/lib/astro.js               Site-frame sky: altitude/azimuth, disk fractions, libration
src/lib/ephemeris.js           astronomy-engine wrapper: Sun/Earth vectors, true lunar rotation
src/lib/terrain.js             LOLA DEM loading + the 720-bin horizon ray march
src/lib/horizons.generated.js  Horizon masks baked from the DEM by scripts/build-horizons.mjs
src/lib/metrics.js             Window sampling, score, published-score weights
src/lib/validation.js          Published checks, sources, sky facts (feeds npm run validate)
src/lib/power.js               Battery assumptions, in one place
src/lib/model-meta.js          Version, last-updated date, reliability tiers
src/lib/lola-codec.js          The lossless grid codec (pack, unpack, gunzip)
src/lib/format.js              One rounding rule for every number
src/lib/sites.js               Six study regions: coordinates, provenance, copy
src/lib/locales.js             EN / FR / AR dictionaries
src/lib/ui-strings.js          Further interface copy in EN / FR / AR
src/lib/i18n.jsx               Language state and date/time formatters
src/lib/brief.js               Recommendation rules and the text export
src/design/                    Design tokens (CSS + a JS mirror the tests keep in sync)
public/data/                   LOLA elevation grids (*.binz) and the star catalogue (all local)
public/assets/                 Fonts, textures, imagery — nothing fetched at runtime
scripts/build-horizons.mjs     Rebuilds the horizon masks from the DEM
scripts/pack-terrain.mjs       Repacks the LOLA grids into the shipped *.binz files
scripts/validate.mjs           Prints the published-data cross-check
scripts/horizon-audit.mjs      Re-derives the horizon masks from the shipped DEM and measures the gap
scripts/check-browser.mjs      Real-browser smoke test (npm run test:browser)
```

## Credits

- Lunar surface texture: [Solar System Scope](https://www.solarsystemscope.com/textures/), `2k_moon.jpg`, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Displayed with modified lighting, tint, and an illustrative bump effect derived from the texture.
- Small sidebar lunar image and Earth texture: [Three.js example textures](https://github.com/mrdoob/three.js/tree/dev/examples/textures/planets). See `public/assets/CREDITS.md` for exact source URLs.
- Fonts: Space Grotesk, Manrope, and Tajawal from Google Fonts, under the SIL Open Font License. Their licence files are included with the font assets.
- Icons: Lucide (ISC licence).
- 3D lander, procedural terrain, scene composition, and interface: generated for this project.
