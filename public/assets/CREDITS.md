# Asset credits

## Moon

Main lunar texture: Solar System Scope, `2k_moon.jpg`.

- https://www.solarsystemscope.com/textures/download/2k_moon.jpg
- https://www.solarsystemscope.com/textures/
- Licence: Creative Commons Attribution 4.0 International — https://creativecommons.org/licenses/by/4.0/
- Changes: staged colour and lighting; the albedo image is also used as an illustrative bump map. It is not a measured elevation model.

Small sidebar lunar image:
https://threejs.org/examples/textures/planets/moon_1024.jpg

## Earth

Earth is rendered by a custom shader (`src/components/earth.js`) from five maps.
All are bundled locally — nothing is fetched at runtime.

| File | What it is | Source | Licence |
| --- | --- | --- | --- |
| `earth.jpg` | True-colour day map (Blue Marble style) | `three.js/examples/textures/planets/earth_atmos_2048.jpg` | MIT (three.js repository) |
| `earth-normal.jpg` | Relief normal map (land only in the shader) | `three.js/examples/textures/planets/earth_normal_2048.jpg` | MIT (three.js repository) |
| `earth-specular.jpg` | Land/ocean mask — white = water, used for the sun-glint | `three.js/examples/textures/planets/earth_specular_2048.jpg` | MIT (three.js repository) |
| `earth-lights.png` | City radiance (VIIRS-style night lights) | `three.js/examples/textures/planets/earth_lights_2048.png` | MIT (three.js repository) |
| `earth-clouds.png` | Global cloud field, 2048×1024 | `turban/webgl-earth` — `fair_clouds_4k.png`, downscaled | CC BY 3.0 |
| `earth-night.png` | **Derived** night-lights mask | Generated from `earth-lights.png` with `scripts/make-night-mask` logic (threshold + premultiplied alpha) | inherits the above |

Original imagery is NASA / USGS (Blue Marble, VIIRS Earth at Night). The derived
`earth-night.png` is stored pre-multiplied so city lights can be added with additive
blending and stay true black where there is no city.

The Earth shader models: a day/night terminator, city lights on the dark side, a
specular ocean glint, relief from the normal map (land only) and a thin scattering
limb that reddens toward the terminator. Earth is lit from the same direction as the
Moon in the scene. **It is an illustrative model, not an ephemeris visualisation.**

## Fonts

Local fonts from Google Fonts. Licence text included in `fonts/`:

- Space Grotesk — https://fonts.google.com/specimen/Space+Grotesk
- Manrope — https://fonts.google.com/specimen/Manrope
- Tajawal — https://fonts.google.com/specimen/Tajawal

All three font families use the SIL Open Font License 1.1.

## Icons and 3D

Lucide React icons, ISC licence: https://lucide.dev/license
Three.js rendering engine, MIT licence: https://threejs.org/

The lander, terrain geometry, orbit path, selection markers, and interface
composition are original procedural elements created for this project. Celestial
distances, scene lighting, and surface terrain are illustrative.

## HD texture pack (3D showcase build)

`scripts/pack-textures.py` writes larger companions from the masters in
`assets-src/textures/`, and the scene prefers them automatically:

| File | Size | From | Source / licence |
| --- | --- | --- | --- |
| `moon-color-4k.webp` | 4096×2048 | `moon-color.jpg` | NASA SVS CGI Moon Kit (LROC WAC), public domain |
| `moon-normal-4k.webp` | 4096×2048 | `moon-normal.png` | LOLA-derived relief |
| `earth-2k.webp` | 2048×1024 | `earth.jpg` | three.js `earth_atmos_2048.jpg` (MIT), original NASA Blue Marble |
| `earth-normal-2k.webp` | 2048×1024 | `earth-normal.jpg` | three.js (MIT) |
| `earth-clouds-2k.webp` | 2048×1024 | `earth-clouds.png` | CC BY 3.0, see above |
| `earth-lights-2k.webp` | 2048×1024 | `earth-lights.png` | NASA VIIRS, via three.js (MIT) |
| `earth-specular-2k.webp` | 2048×1024 | `earth-specular.jpg` | three.js (MIT) |

Nothing is upscaled — each file is written at its master's native size. If the
pack is absent the scene falls back to the 1–2K set and looks identical in
composition, only softer; the HD maps are also skipped on devices reporting
less than 4 GB of memory.
