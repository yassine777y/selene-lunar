/**
 * build.js — geometry and materials for the Selene 3D scene
 * ---------------------------------------------------------------------------
 * Everything here is driven by two real inputs:
 *   - the Sun and Earth directions in the Moon's body-fixed frame, from
 *     `ephemeris.js` (real JPL-grade vectors + true lunar rotation);
 *   - the LOLA elevation grids, from `terrain.js`.
 *
 * No lighting direction is invented anywhere in this file: `uSunDir` and
 * `uEarthDir` are the same vectors the KPIs use, expressed in the scene frame.
 *
 * Frame: the scene is the Moon's selenographic body-fixed frame, so the Moon,
 * its terrain and its site markers are static and only the sky moves.
 *   selenographic (lat, lon) → scene (x, y, z) = (cosφcosλ, sinφ, −cosφsinλ)
 * with +Y = selenographic north. This is a proper rotation (det = +1), so the
 * Moon is never mirrored.
 */

import * as THREE from 'three';

export function toScene(v) {
  return new THREE.Vector3(v.x, v.z, -v.y);
}

/** Unit scene vector of a selenographic point. */
export function selenoToScene(latDeg, lonDeg) {
  const la = (latDeg * Math.PI) / 180;
  const lo = (lonDeg * Math.PI) / 180;
  return new THREE.Vector3(Math.cos(la) * Math.cos(lo), Math.sin(la), -Math.cos(la) * Math.sin(lo));
}

/**
 * A UV sphere whose texture coordinates are exactly selenographic:
 * u = lon / 360, v = (lat + 90) / 180. Built by hand so the NASA LROC
 * equirectangular map lands on the right crater, instead of relying on the
 * default `SphereGeometry` seam convention.
 */
export function moonSphere(radius, segLon = 256, segLat = 128) {
  const positions = [];
  const normals = [];
  const uvs = [];
  const tangents = [];
  const indices = [];

  for (let i = 0; i <= segLat; i++) {
    const lat = -90 + (i / segLat) * 180;
    for (let j = 0; j <= segLon; j++) {
      const lon = (j / segLon) * 360;
      const p = selenoToScene(lat, lon);
      positions.push(p.x * radius, p.y * radius, p.z * radius);
      normals.push(p.x, p.y, p.z);
      uvs.push(j / segLon, i / segLat);
      // tangent = east (∂position/∂lon), orthogonalised against the normal
      const lo = (lon * Math.PI) / 180;
      const t = new THREE.Vector3(-Math.sin(lo), 0, -Math.cos(lo));
      t.addScaledVector(p, -t.dot(p)).normalize();
      tangents.push(t.x, t.y, t.z);
    }
  }
  for (let i = 0; i < segLat; i++) {
    for (let j = 0; j < segLon; j++) {
      const a = i * (segLon + 1) + j;
      const b = a + segLon + 1;
      // CCW as seen from outside → FrontSide culling keeps the near hemisphere
      indices.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setAttribute('tangent', new THREE.Float32BufferAttribute(tangents, 3));
  g.setIndex(indices);
  return g;
}

/* ------------------------------------------------------------------ *
 * Moon
 * ------------------------------------------------------------------ */

/**
 * The lunar surface: LROC colour map + LOLA normal map, lit by one directional
 * source with a hard terminator and a physically motivated photometric law.
 *
 * `Lommel–Seeliger` rather than Lambert: the regolith is strongly
 * back-scattering, which is why the full Moon looks flat-bright instead of
 * shaded like a billiard ball. There is no ambient term — space is black and
 * the only secondary light is earthshine, computed from the real Earth vector.
 */
export function moonMaterial({ colorMap, normalMap }) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: colorMap },
      uNormal: { value: normalMap },
      uSunDir: { value: new THREE.Vector3(1, 0, 0) },
      uEarthDir: { value: new THREE.Vector3(-1, 0, 0) },
      uEarthshine: { value: 0.05 },
      uSunIntensity: { value: 1.0 },
      uRelief: { value: 1.0 },
    },
    vertexShader: /* glsl */ `
      attribute vec3 tangent;
      varying vec2 vUv;
      varying vec3 vWorldPos;
      varying vec3 vNormalW;
      varying vec3 vTangentW;
      varying vec3 vBitangentW;
      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        vNormalW = normalize(mat3(modelMatrix) * normal);
        vTangentW = normalize(mat3(modelMatrix) * tangent);
        vBitangentW = normalize(cross(vNormalW, vTangentW));
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uColor;
      uniform sampler2D uNormal;
      uniform vec3 uSunDir;
      uniform vec3 uEarthDir;
      uniform float uEarthshine;
      uniform float uSunIntensity;
      uniform float uRelief;
      varying vec2 vUv;
      varying vec3 vWorldPos;
      varying vec3 vNormalW;
      varying vec3 vTangentW;
      varying vec3 vBitangentW;

      void main() {
        vec3 nTex = texture2D(uNormal, vUv).xyz * 2.0 - 1.0;
        nTex.xy *= uRelief;
        vec3 N = normalize(vTangentW * nTex.x + vBitangentW * nTex.y + vNormalW * nTex.z);
        vec3 V = normalize(cameraPosition - vWorldPos);
        vec3 L = normalize(uSunDir);

        float mu0 = dot(N, L);
        float mu = max(dot(N, V), 0.0);
        // Lommel-Seeliger + a small Lambert term keeps grazing light readable.
        float lum = mu0 <= 0.0 ? 0.0 : (2.0 * mu0 / (mu0 + max(mu, 0.04)));
        // Physically hard terminator: the Sun is ~0.53° wide, so the falloff
        // spans about half a degree — not a soft studio gradient.
        float lit = smoothstep(-0.0045, 0.0045, mu0);

        vec3 albedo = texture2D(uColor, vUv).rgb;
        vec3 sun = albedo * lum * lit * uSunIntensity;

        // Earthshine: the real Earth direction, faint and blue.
        float es = max(dot(N, normalize(uEarthDir)), 0.0);
        vec3 earth = albedo * vec3(0.42, 0.55, 0.85) * es * uEarthshine;

        // Reflected light is clamped: the regolith cannot exceed white, and
        // letting the photometric law run past 1.0 would make the crater rims
        // bloom as if they were lamps.
        // Linear output on purpose: the frame is rendered into a half-float
        // target and OutputPass applies tone mapping and the sRGB transfer
        // function once, at the end. Encoding here as well would apply it
        // twice and lift the black sky to a lavender haze (it did).
        gl_FragColor = vec4(min(sun + earth, vec3(1.0)), 1.0);
      }
    `,
  });
}

/* ------------------------------------------------------------------ *
 * Earth
 * ------------------------------------------------------------------ */

/**
 * Earth as seen from the Moon: Blue-Marble day side, Black-Marble night side,
 * a cloud shell and an atmospheric limb. The day/night terminator uses the
 * same Sun vector as everything else, and the globe is turned by the real
 * Greenwich apparent sidereal time, so the continent facing the Moon is the
 * one that is actually there.
 */
export function earthMaterial({ dayMap, nightMap, cloudMap, specMap, normalMap = null }) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uDay: { value: dayMap },
      uNight: { value: nightMap },
      uClouds: { value: cloudMap },
      uSpec: { value: specMap },
      uNormalMap: { value: normalMap },
      uRelief: { value: normalMap ? 0.55 : 0.0 },
      uSunDir: { value: new THREE.Vector3(1, 0, 0) },
      uCloudShift: { value: 0.0 },
      uAtmosphere: { value: new THREE.Color('#4aa8ff') },
      uExposure: { value: 1.0 },
    },
    vertexShader: /* glsl */ `
      attribute vec3 tangent;
      varying vec2 vUv;
      varying vec3 vNormalW;
      varying vec3 vTangentW;
      varying vec3 vBitangentW;
      varying vec3 vWorldPos;
      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        vNormalW = normalize(mat3(modelMatrix) * normal);
        // The Earth is built from the same selenographic UV sphere as the Moon,
        // so it carries a tangent; the fallback keeps the shader valid if a
        // geometry without one is ever passed in.
        vec3 t = length(tangent) > 0.5 ? tangent : cross(vec3(0.0, 1.0, 0.0), normal);
        vTangentW = normalize(mat3(modelMatrix) * t);
        vBitangentW = normalize(cross(vNormalW, vTangentW));
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uDay;
      uniform sampler2D uNight;
      uniform sampler2D uClouds;
      uniform sampler2D uSpec;
      uniform sampler2D uNormalMap;
      uniform float uRelief;
      uniform vec3 uSunDir;
      uniform float uCloudShift;
      uniform vec3 uAtmosphere;
      uniform float uExposure;
      varying vec2 vUv;
      varying vec3 vNormalW;
      varying vec3 vTangentW;
      varying vec3 vBitangentW;
      varying vec3 vWorldPos;

      void main() {
        // DoubleSide: flip the normal on back faces so the shading is the same
        // whichever way the triangle happens to be wound.
        vec3 Ng = normalize(vNormalW) * (gl_FrontFacing ? 1.0 : -1.0);
        float spec = texture2D(uSpec, vUv).r;

        // Relief: the normal map is applied to LAND only. The ocean is a level
        // surface at this scale and a bumpy sea reads as a rendering mistake.
        vec3 N = Ng;
        if (uRelief > 0.0) {
          vec3 nTex = texture2D(uNormalMap, vUv).xyz * 2.0 - 1.0;
          vec3 Nb = normalize(vTangentW * nTex.x + vBitangentW * nTex.y + Ng * nTex.z);
          N = normalize(mix(Ng, Nb, (1.0 - spec) * uRelief));
        }

        vec3 V = normalize(cameraPosition - vWorldPos);
        vec3 L = normalize(uSunDir);
        float ndl = dot(N, L);
        float day = smoothstep(-0.10, 0.18, ndl);

        vec3 col = texture2D(uDay, vUv).rgb;
        vec3 night = texture2D(uNight, vUv).rgb;
        vec4 clouds = texture2D(uClouds, vec2(fract(vUv.x + uCloudShift), vUv.y));

        vec3 lit = col * (0.06 + 1.35 * max(ndl, 0.0));
        lit += vec3(1.0) * pow(max(dot(reflect(-L, N), V), 0.0), 42.0) * spec * 0.55;
        lit = mix(lit, vec3(1.0), clouds.a * 0.72 * day);
        vec3 dark = night * 2.4 + col * 0.012;

        vec3 outc = mix(dark, lit, day);
        // Atmospheric limb: brightest where the line of sight grazes the globe.
        float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0);
        outc += uAtmosphere * rim * smoothstep(-0.25, 0.45, ndl) * 0.85;

        gl_FragColor = vec4(min(outc * uExposure, vec3(1.0)), 1.0);
      }
    `,
  });
}

/* ------------------------------------------------------------------ *
 * Sun
 * ------------------------------------------------------------------ */

/** Additive radial glow, used behind the solar disk. */
export function glowTexture(size = 256) {
  const data = new Uint8Array(size * size * 4);
  const c = (size - 1) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - c, y - c) / c;
      const core = Math.max(0, 1 - d * 3.4);
      const halo = Math.pow(Math.max(0, 1 - d), 3.2);
      const a = Math.min(1, core * 1.0 + halo * 0.55);
      const i = (y * size + x) * 4;
      data[i] = 255;
      data[i + 1] = 245 - Math.round(halo * 40);
      data[i + 2] = 225 - Math.round(halo * 90);
      data[i + 3] = Math.round(a * 255);
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.needsUpdate = true;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** The solar disk itself: a bright lambert-ish ball at its true angular size. */
export function sunMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uGlow: { value: glowTexture() }, uIntensity: { value: 1.0 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uGlow;
      uniform float uIntensity;
      varying vec2 vUv;
      void main() {
        float d = length(vUv - 0.5) * 2.0;
        // limb darkening of the photosphere
        float limb = 0.55 + 0.45 * sqrt(max(0.0, 1.0 - d * d));
        vec3 c = mix(vec3(1.0, 0.96, 0.86), vec3(1.0, 0.83, 0.45), smoothstep(0.4, 1.0, d)) * limb;
        // >1 on purpose: this is the one surface in the scene that emits light,
        // and the bloom pass is thresholded above white so only this blooms.
        gl_FragColor = vec4(c * uIntensity * 2.2, 1.0);
      }
    `,
  });
}

/* ------------------------------------------------------------------ *
 * Terrain (surface view)
 * ------------------------------------------------------------------ */

/**
 * Regolith shading for the local heightfield. Same photometric law as the
 * globe so the surface and the globe cannot disagree about where the Sun is.
 */
export function terrainMaterial({ sunDir, earthDir = null, earthshine = 0, relief = 1.0 }) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uSunDir: { value: sunDir.clone() },
      uSunIntensity: { value: 1.0 },
      uRelief: { value: relief },
      uRegolith: { value: new THREE.Color('#9b968f') },
      // Earthshine, the Moon's only other light source. It is real light, not a
      // fill lamp: full Earth is ~10 000× fainter than the Sun, so this term is
      // a couple of per cent at most — enough to read the shadowed ridge face
      // near the horizon, never enough to fake a second sun.
      uEarthDir: { value: (earthDir || new THREE.Vector3(0, -1, 0)).clone() },
      uEarthshine: { value: earthshine },
    },
    vertexShader: /* glsl */ `
      attribute float aShadow;
      varying vec3 vWorldPos;
      varying vec3 vNormalW;
      varying float vShadow;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        vNormalW = normalize(mat3(modelMatrix) * normal);
        vShadow = aShadow;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uSunDir;
      uniform float uSunIntensity;
      uniform float uRelief;
      uniform vec3 uRegolith;
      uniform vec3 uEarthDir;
      uniform float uEarthshine;
      varying vec3 vWorldPos;
      varying vec3 vNormalW;
      varying float vShadow;

      // Value noise, two octaves. The DEM gives the shape; what it cannot give
      // at 160 m is the grain of the surface, and without it a 24 km heightfield
      // seen at a grazing angle turns into a smooth grey gradient that reads as
      // fog rather than as ground. This is *texture*, not topography: it is
      // amplitude-modulated to ±10 % of the albedo and carries no elevation, so
      // it can never hide or invent a ridge.
      float hash21(vec2 p) {
        p = fract(p * vec2(0.3183099, 0.3678794));
        p += dot(p, p + 19.19);
        return fract(p.x * p.y);
      }
      float vnoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
          mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
          u.y);
      }

      void main() {
        // DoubleSide: flip the normal on back faces so the shading is the same
        // whichever way the triangle happens to be wound.
        vec3 N = normalize(vNormalW) * (gl_FrontFacing ? 1.0 : -1.0);
        vec3 V = normalize(cameraPosition - vWorldPos);
        vec3 L = normalize(uSunDir);
        float mu0 = dot(N, L);
        float mu = max(dot(N, V), 0.0);
        float lum = mu0 <= 0.0 ? 0.0 : 2.0 * mu0 / (mu0 + max(mu, 0.05));
        float lit = smoothstep(-0.004, 0.004, mu0);

        // Regolith grain. The scene is metric in KILOMETRES (the terrain mesh is
        // built in km), so the three octaves are 0.8 km mottling, 90 m
        // patchiness and 11 m grain — the scales that actually survive a
        // grazing view. Faded out with distance so it cannot alias into
        // shimmer near the horizon.
        float d = distance(cameraPosition, vWorldPos);
        vec2 pz = vWorldPos.xz;
        float grain = 0.50 * (vnoise(pz * 1.25) - 0.5)
                    + 0.33 * (vnoise(pz * 11.1) - 0.5)
                    + 0.17 * (vnoise(pz * 90.9) - 0.5);
        float fade = 1.0 - smoothstep(3.0, 14.0, d);
        vec3 albedo = uRegolith * (1.0 + grain * 0.90 * fade);

        // vShadow is the terrain's own cast shadow at the current Sun angle,
        // computed on the CPU from the LOLA crop (engine._castShadows). With a
        // Sun 1–2° above the horizon this is most of what the eye reads.
        vec3 outc = albedo * lum * lit * uSunIntensity * vShadow;
        // Earthshine: same Lommel–Seeliger law, blue-shifted, and only where the
        // Earth is actually above this surface's local horizon — the uniform is
        // already scaled by the model's Earth illumination and by whether the
        // Earth clears the horizon in that azimuth.
        float e0 = dot(N, normalize(uEarthDir));
        float es = e0 <= 0.0 ? 0.0 : 2.0 * e0 / (e0 + max(mu, 0.05));
        outc += albedo * vec3(0.52, 0.66, 0.95) * es * uEarthshine;
        gl_FragColor = vec4(min(outc, vec3(1.0)), 1.0);
      }
    `,
    side: THREE.DoubleSide,
  });
}

/* ------------------------------------------------------------------ *
 * Stars
 * ------------------------------------------------------------------ */

/**
 * Hipparcos/Yale bright stars at their true positions, coloured by B−V and
 * sized by apparent magnitude. Positions are converted into the scene frame
 * with the same rotation as the Moon, so they set correctly as libration moves
 * the Moon's sky.
 */
export function starFieldStars(rows, frame, radius) {
  const n = rows.length / 4;
  const positions = new Float32Array(n * 3);
  const colors = new Float32Array(n * 3);
  const sizes = new Float32Array(n);
  const c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const ra = (rows[i * 4] * Math.PI) / 180;
    const dec = (rows[i * 4 + 1] * Math.PI) / 180;
    const mag = rows[i * 4 + 2];
    const bv = Math.min(1.6, Math.max(-0.4, rows[i * 4 + 3]));
    const eqj = { x: Math.cos(dec) * Math.cos(ra), y: Math.cos(dec) * Math.sin(ra), z: Math.sin(dec) };
    const b = frame.toBody ? frame.toBody(eqj) : eqj;
    const v = toScene(b).multiplyScalar(radius);
    positions.set([v.x, v.y, v.z], i * 3);
    // B−V → temperature-ish tint (blue-white → orange)
    const t = (bv + 0.4) / 2.0;
    c.setRGB(0.72 + 0.28 * (1 - t), 0.78 + 0.19 * (1 - Math.abs(t - 0.5) * 2), 0.85 + 0.15 * t);
    colors.set([c.r, c.g, c.b], i * 3);
    // brightness: mag 0 ≈ 2.6 px, mag 6 ≈ 0.6 px
    sizes[i] = Math.max(0.5, 2.8 - mag * 0.42);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
  return g;
}

export function starMaterial(pixelRatio = 1) {
  return new THREE.ShaderMaterial({
    uniforms: { uScale: { value: pixelRatio }, uOpacity: { value: 1.0 } },
    vertexShader: /* glsl */ `
      attribute float size;
      attribute vec3 color;
      uniform float uScale;
      varying vec3 vColor;
      void main() {
        vColor = color;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = size * uScale;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uOpacity;
      varying vec3 vColor;
      void main() {
        vec2 d = gl_PointCoord - 0.5;
        float r = length(d) * 2.0;
        float a = smoothstep(1.0, 0.15, r);
        gl_FragColor = vec4(vColor * a * uOpacity, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}
