# SELENE v6 — redesign notes

## What was wrong, and what changed

| # | Problem in v5 | What I did |
| --- | --- | --- |
| 1 | Text far too small (8–10 px in labels, axes, chips) | A fixed type scale — **12 / 14 / 16 / 20 / 28 / 40 / 56** — and a test that fails the build if any literal `font-size` in the CSS drops below 12 px. All numbers use JetBrains Mono with `tabular-nums`. |
| 2 | Low-contrast purple-on-dark typography | New token palette with measured contrast: primary `#F4F2FA` (≈15:1 on the background), secondary `#A9A4BF` (≈7:1), tertiary `#8B86A3` (≈5.3:1). `tests/design.test.js` asserts WCAG AA ratios for body text **and** for the amber/teal metric colours. |
| 3 | Cluttered 3D: label over the Earth, orbit line across the Moon, Moon too dark, Earth too dominant | Orbit line replaced by a faint dashed polar guide; labels moved **outside** the spheres with SVG leader lines; the Sun now lights the Moon from the real sub-solar vector with a terminator; the Earth became a small sky inset in the corner with its **phase** computed from the Sun–Moon–Earth angle; the surface camera now starts behind the lander looking toward the Earth's real azimuth, and the Earth/Sun discs are drawn at their **true 1.8–2.05° / 0.52–0.54°** angular size. |
| 4 | Date said 01/09/2026 while the range said 9 Jan – 8 Feb | One store (`src/lib/store.jsx` + pure reducer in `src/lib/mission-state.js`). The analysis window is *defined* as `landingDate … landingDate + duration`; every card, chart, the 3D date chip and the export read that object. A test proves it, and a browser test changes the date and checks that every KPI moves. |
| 5 | "Longest night: none" with a flat chart | The KPI now shows a real empty state — a dashed placeholder, the badge **No night**, and a sentence explaining that the Sun never sets in this window and suggesting a longer window. The battery card shows `—` instead of a fake `0 kg`. |
| 6 | Uneven cards, random spacing, cut-off sections | Everything is on an 8 px grid: 24 px card padding, 24 px gaps, 16 px radius, 10 px controls. Row heights are equalised (viewer + site panel use `height:100%`), and the page ends with a real footer instead of a clipped card. |
| 7 | Arabic translated but not RTL | `dir="rtl"` now mirrors the shell (sidebar on the right), flips icons and leader offsets, mirrors the timeline and the date popover, uses **IBM Plex Sans Arabic**, and keeps every numeric run LTR-isolated so `89.45° S` and `100.0%` never break. |

## Design system

* `src/design/tokens.css` — the single source of truth: 3 surface levels, borders, text colours, metric colours (Sun amber, Earth teal, Score violet, Night indigo), semantic colours, the type scale, the 8 px spacing scale, radii, three shadow levels, motion durations/easings, and layout constants.
* `src/design/tokens.js` — the same palette for canvas/SVG/Three.js. A test asserts the CSS and JS values are identical.
* Metric identity is enforced with `data-metric="sun|earth|score|night"`: one attribute colours the card, the progress bar, the sparkline, the chart series, the legend dot and the 3D marker.

## Reusable components

`src/components/ui/`

| Component | Purpose |
| --- | --- |
| `Card` / `CardHeader` | the only container primitive (3 levels) |
| `Metric` | label + big number + unit + thick progress bar + provenance tooltip |
| `Sparkline` / `ScoreRing` | KPI trend line with a text alternative, score ring |
| `SegmentedControl` | 7 / 30 / 90 days, roving tabindex + arrow keys |
| `DateField` | the date picker: displays the date in the interface language, 6×7 grid, keyboard navigation |
| `Badge` / `LegendDot` | status pills and legends |
| `Tooltip` | source + formula + window for every metric, hover **and** focus |
| `SidebarItem` | navigation row with active state |
| `ChartPanel` | chart frame with legend slot and a real empty state |

Plus `useCountUp` (respects `prefers-reduced-motion`), `TimelineChart` (pure SVG, scrubbable by mouse and keyboard, with a `<p class="sr-only">` text alternative).

## Pages

1. **Explorer** — hero, 3D viewer (8 cols) + selected-site panel (4 cols) at equal height, four KPI cards, timeline chart, and the six candidates as a compact switcher.
2. **Compare** — ranked table (same dates, same sampling) plus the 6 × 6 launch-slip matrix, now with a legend and readable cells.
3. **Mission summary** — assessment, score ring, recommendation, battery estimate, polar power advantage, rank.
4. **Data & validation** — 12 checks against published ranges, model version + last-updated date, the polar-sky geometry facts, the full source list, and the method limits printed under the table.

## Data integrity

Nothing about the physics changed in v6. Landing-site coordinates, the 2026-01-03 10:03 UTC epoch, the illumination model and the published-data checks are exactly the ones checked in v5 (`npm run validate` → 12/12 inside the published range). What changed is that **every number on screen is now visibly tied to the selected date and duration**, and every metric card can explain itself: tooltip → source, formula, window.

## Accessibility

Visible focus rings on every control, `aria-label` on all icon buttons, `aria-pressed` / `aria-current` / `aria-selected` states, charts described in text, dialogs with focus trap + Escape, skip-to-content link, and reduced-motion support (count-ups, camera tweens and the 3D loop all respect it).

## Verification

* `npm test` — **230 unit tests** (the new `tests/design.test.js` covers tokens, contrast, the 12 px floor, EN/FR/AR string parity, the single source of truth for the window, and the one-decimal rounding rule).
* `npm run validate` — 12/12 published-range checks.
* `npm run test:browser` — **19 real-browser checks** (WebGL, local fonts, date → window → KPI consistency, keyboard scrubbing, site switching, 3D controls, tooltips, RTL, persistence, comparison, export, dialogs, mobile drawer, no console errors or external requests).
* Screenshots for every page, both themes of the 3D view, and 1440 / 1024 / 390 px are in `screenshots/` (WebP, 0.5 MB for all nine — the PNG set alone was 3 MB of the download).

## v11 — reliability labels, and the numbers said out loud

The audit against the challenge brief found four gaps; none of them needed a new
feature, all of them needed the existing numbers to be honest about themselves.

1. **A tier on every figure.** `src/lib/model-meta.js` now holds one taxonomy —
   *measured* / *derived* / *estimated* — and `TierChip` renders it next to the
   number, in the card, the KPI, the compare headers and the validation table.
   Words come from the dictionaries, so the Arabic UI gets Arabic chips.
   `tests/consistency.test.js` fails if a tier id has no words in EN, FR or AR.
2. **The limits belong where the number is.** Illumination is now labelled “time in
   sunlight, not energy”, Earth visibility “line of sight only: no antenna, link
   budget or terrain scattering”, the score “a product decision”, the night
   “the longest gap in a 2 h sample”. The model dialog gained two lines (`not4`,
   `not5`) making the same points at length.
3. **One number, one definition.** The Explorer cards report a disk-mean over the
   window; the validation table reports the any-part annual share. Both are now
   named where they appear, the Compare table carries a column legend, and
   `SOURCES-AND-LIMITS.md` §5a reconciles Connecting Ridge's four numbers
   (100.0 % window · 95.0 % annual disk mean · 98.4 % annual any-part · 89.0 %
   published at the surface, 92.7 % at 2 m) instead of leaving the reader to guess.
4. **A passing check is not a passing match.** Rows that only pass on a wide
   tolerance now read `In range, ±N` with a warning tint and print the reason;
   the table footnote says in three languages that twelve green rows are a
   calibration against published statistics, not certification.

Removed as stale and false: `valFootNote` (horizon dips “equivalent to a few
hundred metres”), the README's hand-copied results table (it still carried the
pre-LOLA numbers), its “synthetic / calibrated horizons” claims, and the
label that claimed verification on a date that only records an update (it now
reads “Last updated”, which is what the date actually means).
