/**
 * engine.js — the Three.js engine behind <MoonScene />
 * ---------------------------------------------------------------------------
 * TWO SCENES, ONE SOURCE OF TRUTH
 *
 *   orbital  A camera orbiting the Moon. The globe is lit by the real Sun
 *            direction and the Earth hangs where the ephemeris puts it. Two
 *            display modes:
 *              framed      bodies enlarged and moved in for readability;
 *                          the "not to scale" badge is mandatory here.
 *              real        true radii and true distances (Earth is 225 Moon
 *                          radii away and ~1.9° wide — it looks like a star
 *                          with a disk, because that is what it is).
 *
 *   surface  A first-person camera standing 2 m above the selected site on the
 *            LOLA heightfield, looking at the horizon. Sun and Earth are drawn
 *            at their true angular size *in the correct direction*, and the
 *            far silhouette is the terrain horizon mask that decides light and
 *            shadow in the metrics — the ridge you see is the ridge that
 *            blocks.
 *
 * Numbers never enter this file: `setState()` receives the same `skyState`
 * object the cards read, plus the ephemeris frame for orientation.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import {
  moonSphere,
  moonMaterial,
  earthMaterial,
  sunMaterial,
  terrainMaterial,
  starFieldStars,
  starMaterial,
  toScene,
  selenoToScene,
  glowTexture,
} from './build.js';
import { earthMarkerSunDir, framedEarthAngles } from './framing.js';

const R_MOON_KM = 1737.4;
const MOON_R = 1.8; // scene units for the Moon's radius
const KM = MOON_R / R_MOON_KM; // scene units per kilometre
const FRAMED_EARTH_R = 0.5;
const FRAMED_EARTH_DIST = 3.5; // kept for the "distance ÷ N" readout
// In framed mode the two disks keep this much empty sky between their limbs.
const FRAMED_GAP_DEG = 7;
// The Sun is 1 AU away; no scene can show that and the Moon at once. In framed
// mode it is drawn on a 16-unit dome, enlarged (badge says "not to scale").
// In true-scale mode it sits on a 900-unit dome at its REAL angular size, so
// what you see is the actual 0.52–0.54° disk.
const SUN_DOME_FRAMED = 16;
const SUN_DOME_REAL = 900;
const SUN_ANG_R_FRAMED = 2.2; // degrees, readability only
const STAR_DOME = MOON_R * 500;
const EARTH_VIEW_DIST = 430; // true-scale: just outside the Moon, heading to the Earth

/*
 * Texture sets. The first name is the HD master and the second is the always
 * present base file; the loader starts on the base so the first frame is never
 * black, then swaps in the HD map when it arrives. Shipping the HD set or not
 * is then a packaging decision (`scripts/pack-textures.py`), not a code change —
 * the same build runs with either.
 */
const TEXTURES = {
  moonColor: { base: 'moon-color.webp', hd: 'moon-color-4k.webp', srgb: true },
  moonNormal: { base: 'moon-normal.webp', hd: 'moon-normal-4k.webp', srgb: false },
  earthDay: { base: 'earth.webp', hd: 'earth-2k.webp', srgb: true },
  earthNight: { base: 'earth-lights.webp', hd: 'earth-lights-2k.webp', srgb: true },
  earthClouds: { base: 'earth-clouds.webp', hd: 'earth-clouds-2k.webp', srgb: true },
  earthSpec: { base: 'earth-specular.webp', hd: 'earth-specular-2k.webp', srgb: false },
  // Optional: no base variant — without it the Earth simply keeps its flat,
  // unrelieved look instead of failing.
  earthNormal: { base: null, hd: 'earth-normal-2k.webp', srgb: false },
};

/** Bloom: quarter-resolution, so it costs a fraction of a full-size pass. */
// Threshold sits ABOVE 1.0 on purpose. The render targets are half-float, so a
// shader can output more than white; only the bodies that actually emit light
// (the solar disk, its glow sprite) are allowed past 1.0. Everything that
// merely *reflects* light is clamped to 1.0 where it is written. The result is
// a bloom that belongs to the Sun and to nothing else — a threshold below 1.0
// blooms the brightest regolith and the clouds too, which washes the whole sky
// into a haze instead of making a highlight.
const BLOOM = { strength: 0.9, radius: 0.55, threshold: 1.02 };

const DEG = Math.PI / 180;

export class MoonSceneEngine {
  constructor(container, opts = {}) {
    this.container = container;
    this.opts = opts;
    this.reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
    this.view = 'orbital';
    this.mode = 'framed';
    this.ready = false;
    this.disposed = false;
    this.labels = {};
    this.markerMeshes = [];
    this.hovered = null;
    this.clock = new THREE.Clock();

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      logarithmicDepthBuffer: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    // The canvas is cleared to deep space, converted to LINEAR by hand. The
    // frame is rendered into a half-float target and colour-managed once, at the
    // end, by OutputPass; `THREE.Color('#0d0b16')` keeps the sRGB code values, so
    // handing it over unconverted made the darkest colour on screen the
    // brightest thing in the pipeline — the black sky arrived as
    // rgb(47, 40, 78), a lavender haze. Measured, then fixed.
    this.renderer.setClearColor(new THREE.Color('#0d0b16').convertSRGBToLinear(), 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.setAttribute('aria-hidden', 'true');
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';

    this.labelLayer = document.createElement('div');
    this.labelLayer.className = 'scene-labels';
    container.appendChild(this.labelLayer);

    this._buildOrbital();
    this._buildSurface();
    this._buildComposers();
    this._bindPointer();
    this._resizeObserver = new ResizeObserver(() => this.resize());
    this._resizeObserver.observe(container);
    this.resize();
    this._loop = this._loop.bind(this);
    this._raf = requestAnimationFrame(this._loop);
  }

  /* ---------------------------------------------------------------- *
   * Construction
   * ---------------------------------------------------------------- */

  /**
   * Post-processing: one bloom pass per scene, so the solar disk, the Earth's
   * limb and the sun glint on the ocean read as light rather than as paint.
   *
   * Bloom is the only effect, and it is deliberately small: strength 0.55 at a
   * quarter of the canvas resolution. It is not a filter over the whole image —
   * `threshold` is set above the regolith's brightest albedo, so the ground
   * never bleeds into it. What glows is what is actually bright: the Sun, the
   * specular glint, the Earth's atmosphere.
   */
  _buildComposers() {
    const make = (scene, cam) => {
      const size = new THREE.Vector2(this.width || 1, this.height || 1);
      // A multisampled target keeps the edges the renderer's own `antialias`
      // would have given us: once you render through a composer, the canvas
      // attribute no longer does anything.
      const target = new THREE.WebGLRenderTarget(size.x, size.y, {
        type: THREE.HalfFloatType,
        samples: 4,
      });
      const composer = new EffectComposer(this.renderer, target);
      composer.addPass(new RenderPass(scene, cam));
      const bloom = new UnrealBloomPass(size.clone().multiplyScalar(0.25), BLOOM.strength, BLOOM.radius, BLOOM.threshold);
      composer.addPass(bloom);
      composer.addPass(new OutputPass());
      return { composer, bloom };
    };
    const o = make(this.orbital.scene, this.orbital.cam);
    const s = make(this.surface.scene, this.surface.cam);
    this.composerOrbital = o.composer;
    this.composerSurface = s.composer;
    this.bloomOrbital = o.bloom;
    this.bloomSurface = s.bloom;
  }

  _camera() {
    const cam = new THREE.PerspectiveCamera(46, 1, 0.001, 4000);
    cam.position.set(3.1, -3.4, 4.4);
    return cam;
  }

  /**
   * Where the camera should sit for the current sky.
   *
   * The south pole is only ever grazed by sunlight, so a "nice" portrait of the
   * Moon is also an honest one: we stand part-way between the Earth direction
   * (the near side) and the south pole (the region the app is about), which
   * puts the terminator on screen and keeps all six candidate sites visible.
   * The Sun and Earth keep their true directions; only the *camera* moves.
   */
  _frameCamera() {
    const e = this.earthDirScene;
    if (!e) return;
    const south = new THREE.Vector3(0, -1, 0);
    const dir = e.clone().multiplyScalar(0.55).addScaledVector(south, 0.84).normalize();
    this._framedDir = dir;
    this.orbital.cam.position.copy(dir).multiplyScalar(this._framedDistance());
    this.orbital.controls.target.set(0, 0, 0);
    this.orbital.controls.update();
  }

  /**
   * The framed-mode camera distance. 6.6 units on a wide viewport; on a phone
   * the frame is nearly square, and at 6.6 the Moon alone would fill it, leaving
   * nowhere to put the Earth. Backing off in proportion to the aspect ratio
   * keeps both bodies in shot with a real gap between them.
   */
  _framedDistance() {
    const aspect = Math.max(0.5, this.orbital?.cam?.aspect ?? 1.4);
    return 6.6 * Math.max(1, Math.min(1.9, 1.45 / aspect));
  }

  /**
   * Load one texture set: base immediately, HD as an upgrade.
   *
   * Both files are local; the HD one exists only if the HD asset pack is
   * present. A failed HD request is expected and silent — the base map is
   * already on screen and stays there.
   */
  _tex(set, onUpgrade) {
    const loader = this._texLoader || (this._texLoader = new THREE.TextureLoader());
    const aniso = Math.min(16, this.renderer.capabilities.getMaxAnisotropy());
    const apply = (t, srgb) => {
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.anisotropy = aniso;
      t.wrapS = THREE.RepeatWrapping;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.generateMipmaps = true;
      return t;
    };
    const base = set.base ? apply(loader.load(`assets/textures/${set.base}`), set.srgb) : null;
    // Skip the HD set on devices that report very little memory: the 4K Moon
    // pair alone is ~96 MB once decoded on the GPU, which a 2 GB phone cannot
    // afford. The base maps are still a complete, correct picture.
    const mem = typeof navigator !== 'undefined' ? navigator.deviceMemory : undefined;
    const hdAllowed = mem === undefined || mem >= 4;
    if (set.hd && hdAllowed) {
      loader.load(
        `assets/textures/${set.hd}`,
        (t) => {
          apply(t, set.srgb);
          this.opts.onTextureTier?.(set.hd);
          onUpgrade?.(t);
        },
        undefined,
        () => {
          /* no HD pack: keep the base map */
        }
      );
    }
    return base;
  }

  _buildOrbital() {
    const scene = new THREE.Scene();
    const cam = this._camera();
    const controls = new OrbitControls(cam, this.renderer.domElement);
    controls.enableDamping = !this.reduced;
    controls.dampingFactor = 0.07;
    controls.rotateSpeed = 0.55;
    controls.zoomSpeed = 0.75;
    controls.enablePan = false;
    controls.minDistance = MOON_R * 1.22;
    controls.maxDistance = 24;
    controls.target.set(0, 0, 0);
    this.orbital = { scene, cam, controls };

    // --- Moon -------------------------------------------------------
    const moonMat = moonMaterial({ colorMap: null, normalMap: null });
    moonMat.uniforms.uColor.value = this._tex(TEXTURES.moonColor, (t) => {
      moonMat.uniforms.uColor.value = t;
    });
    moonMat.uniforms.uNormal.value = this._tex(TEXTURES.moonNormal, (t) => {
      moonMat.uniforms.uNormal.value = t;
    });
    this.textures = { moonMat };

    // 512 × 256 segments: at the closest allowed zoom one texel of the 4K map
    // spans roughly one triangle, so the silhouette and the terminator stay
    // smooth instead of showing the old faceting.
    const moon = new THREE.Mesh(moonSphere(MOON_R, 512, 256), moonMat);
    this.moon = moon;
    this.moonMat = moonMat;
    scene.add(moon);

    // --- markers ----------------------------------------------------
    this.markers = new THREE.Group();
    scene.add(this.markers);

    // --- Sun --------------------------------------------------------
    const sun = new THREE.Group();
    const sunDisk = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 24), sunMaterial());
    sun.add(sunDisk);
    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture(),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        opacity: 0.9,
      })
    );
    glow.scale.setScalar(12);
    sun.add(glow);
    this.sunDisk = sunDisk;
    this.sunGlow = glow;
    this.sunGroup = sun;
    scene.add(sun);

    // --- Earth ------------------------------------------------------
    const earth = new THREE.Group();
    const earthMat = earthMaterial({
      dayMap: this._tex(TEXTURES.earthDay, (t) => (earthMat.uniforms.uDay.value = t)),
      nightMap: this._tex(TEXTURES.earthNight, (t) => (earthMat.uniforms.uNight.value = t)),
      cloudMap: this._tex(TEXTURES.earthClouds, (t) => (earthMat.uniforms.uClouds.value = t)),
      specMap: this._tex(TEXTURES.earthSpec, (t) => (earthMat.uniforms.uSpec.value = t)),
      normalMap: this._tex(TEXTURES.earthNormal, (t) => {
        earthMat.uniforms.uNormalMap.value = t;
        earthMat.uniforms.uRelief.value = 0.55;
      }),
    });
    this.earthTextures = earthMat;
    const earthMesh = new THREE.Mesh(moonSphere(1, 192, 96), earthMat);
    earth.add(earthMesh);
    // thin atmosphere shell, additive
    const atmo = new THREE.Mesh(
      new THREE.SphereGeometry(1.035, 64, 40),
      new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color('#3f8fe0') } },
        vertexShader: `varying vec3 vN; varying vec3 vP;
          void main(){ vN = normalize(mat3(modelMatrix)*normal); vec4 wp = modelMatrix*vec4(position,1.0); vP = wp.xyz;
          gl_Position = projectionMatrix*viewMatrix*wp; }`,
        fragmentShader: `uniform vec3 uColor; varying vec3 vN; varying vec3 vP;
          void main(){ vec3 V = normalize(cameraPosition - vP); float rim = pow(1.0 - max(dot(normalize(vN), V), 0.0), 2.6);
          gl_FragColor = vec4(uColor * rim * 1.4, rim * 0.9); }`,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.FrontSide,
      })
    );
    earth.add(atmo);
    this.earthGroup = earth;
    this.earthMesh = earthMesh;
    this.earthMat = earthMat;
    this.earthAtmo = atmo;
    scene.add(earth);

    // --- stars ------------------------------------------------------
    this.starsOrbital = new THREE.Group();
    scene.add(this.starsOrbital);
  }

  _buildSurface() {
    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(48, 1, 0.0015, 4000);
    cam.position.set(0, 0.002, 0);
    this.surface = {
      scene,
      cam,
      terrain: null,
      ring: null,
      yaw: 0,
      pitch: 0.06,
      drag: null,
      sun: null,
      earth: null,
      stars: null,
      skyRadius: 260, // km — the "sky dome" radius for Sun/Earth/stars
    };
    const sky = this.surface.skyRadius;

    const sunDisk = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 24), sunMaterial());
    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture(),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        opacity: 0.75,
      })
    );
    this.surface.sun = new THREE.Group();
    this.surface.sun.add(sunDisk, glow);
    this.surface.sunDisk = sunDisk;
    this.surface.sunGlow = glow;
    scene.add(this.surface.sun);

    // The surface sky's Earth used to be an untextured sphere — a black disc in
    // a 1.9° hole, which is the one place where the reader is looking straight
    // at the thing the whole app is about. It now shares the orbital Earth's
    // texture objects (no extra GPU memory, no second fetch) and therefore
    // shows the same continents and the same phase as the orbital view at the
    // same instant.
    const earthMat = earthMaterial({ dayMap: null, nightMap: null, cloudMap: null, specMap: null });
    this.surface.earthMat = earthMat;
    this.surface.earth = new THREE.Mesh(moonSphere(1, 128, 64), earthMat);
    scene.add(this.surface.earth);

    // Share the orbital Earth's maps. Same texture objects: one upload, one set
    // of mipmaps, and a guaranteed identical disc in both views.
    if (this.earthTextures) {
      for (const k of ['uDay', 'uNight', 'uClouds', 'uSpec', 'uNormalMap']) {
        earthMat.uniforms[k].value = this.earthTextures.uniforms[k].value;
      }
      earthMat.uniforms.uRelief.value = this.earthTextures.uniforms.uRelief.value;
    }

    this.surface.stars = new THREE.Group();
    scene.add(this.surface.stars);
  }

  /** Called once the store has data: builds markers, terrain and star fields. */
  async setData({ sites, stars, terrainLoader }) {
    if (!sites) return;
    this.sites = sites;

    // --- site markers -------------------------------------------------
    this.markerMeshes.forEach((m) => {
      m.geometry.dispose();
      this.markers.remove(m);
    });
    this.markerMeshes = [];
    const dotGeo = new THREE.SphereGeometry(MOON_R * 0.011, 16, 12);
    const ringGeo = new THREE.RingGeometry(MOON_R * 0.022, MOON_R * 0.03, 48);
    sites.forEach((site) => {
      const dir = selenoToScene(site.lat, site.lon);
      const hit = new THREE.Mesh(
        new THREE.SphereGeometry(MOON_R * 0.05, 10, 8),
        new THREE.MeshBasicMaterial({ visible: false })
      );
      hit.position.copy(dir).multiplyScalar(MOON_R);
      hit.userData.siteId = site.id;
      const dot = new THREE.Mesh(
        dotGeo,
        new THREE.MeshBasicMaterial({ color: new THREE.Color('#a78bfa'), transparent: true, opacity: 0.95 })
      );
      dot.position.copy(dir).multiplyScalar(MOON_R * 1.002);
      const stem = new THREE.Mesh(
        new THREE.CylinderGeometry(MOON_R * 0.0018, MOON_R * 0.0018, MOON_R * 0.05, 6),
        new THREE.MeshBasicMaterial({ color: new THREE.Color('#a78bfa'), transparent: true, opacity: 0.8 })
      );
      stem.position.copy(dir).multiplyScalar(MOON_R * 1.027);
      stem.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      const halo = new THREE.Mesh(
        ringGeo,
        new THREE.MeshBasicMaterial({
          color: new THREE.Color('#a78bfa'),
          transparent: true,
          opacity: 0.55,
          side: THREE.DoubleSide,
          depthWrite: false,
        })
      );
      halo.position.copy(dir).multiplyScalar(MOON_R * 1.004);
      halo.lookAt(dir.clone().multiplyScalar(MOON_R * 2));
      hit.userData.decor = [dot, stem, halo];
      this.markers.add(hit, dot, stem, halo);
      this.markerMeshes.push(hit);
    });

    // --- stars --------------------------------------------------------
    if (stars) {
      const mk = (radius, group) => {
        const geo = starFieldStars(stars, this._frame, radius);
        const pts = new THREE.Points(geo, starMaterial(this.renderer.getPixelRatio()));
        group.add(pts);
        return pts;
      };
      if (this.starsOrbital) {
        this.starsOrbital.clear();
        mk(STAR_DOME, this.starsOrbital);
      }
      if (this.surface) {
        this.surface.stars.clear();
        // in the surface scene one unit is one kilometre
        mk(this.surface.skyRadius * 1.4, this.surface.stars);
      }
    }

    // --- terrain ------------------------------------------------------
    if (terrainLoader && this.site) {
      await this._loadTerrain(this.site, terrainLoader);
    }
    this.ready = true;
    this.opts.onReady?.();
  }

  async _loadTerrain(site, loader) {
    try {
      const crop = await loader(site.id);
      if (!crop) return;
      this.terrainCrop = crop;
      this.terrainSiteId = site.id;
      this._rebuildTerrain(site, crop);
    } catch (err) {
      console.warn('[scene] terrain unavailable', err);
    }
  }

  /**
   * The surface heightfield: a 64 km × 64 km window of the LOLA DEM resampled
   * to 224² vertices, in kilometres, with the lunar curvature removed about
   * the site (otherwise the ground would bend upwards at the edges).
   */
  _rebuildTerrain(site, crop) {
    const { scene } = this.surface;
    if (this.surface.terrain) {
      scene.remove(this.surface.terrain);
      this.surface.terrain.geometry.dispose();
      this.surface.terrain.material.dispose();
    }
    if (this.surface.ring) {
      scene.remove(this.surface.ring);
      this.surface.ring.geometry.dispose();
      this.surface.ring.material.dispose();
    }
    if (this.surface.sunMat) this.surface.sunMat.dispose();

    // 320² vertices over 24 km = 75 m cells, i.e. about two cells per DEM texel
    // of the 160 m source grid. Denser than that would add triangles without
    // adding information; sparser (the old 192², 125 m) rounded off the ridge
    // that decides whether the Sun is up, which is the one thing this view has
    // to show honestly.
    const N = 320;
    const halfKm = 12; // a 24 km window: fine enough that slopes read at eye level
    const cellKm = (halfKm * 2) / (N - 1);
    const h0 = crop.centerHeight;
    const positions = new Float32Array(N * N * 3);
    const Rkm = R_MOON_KM;

    // local north/east in the DEM's polar-stereographic plane
    const { nx, ny, ex, ey } = crop.mapBasis;

    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const eastKm = -halfKm + i * cellKm;
        const northKm = -halfKm + j * cellKm;
        // metres in the DEM's metric plane
        const mx = eastKm * 1000 * ex + northKm * 1000 * nx;
        const my = eastKm * 1000 * ey + northKm * 1000 * ny;
        const h = crop.sampleOffset(mx, my); // metres above the 1737.4 km sphere
        const d2 = eastKm * eastKm + northKm * northKm;
        const drop = (d2 * 1e6) / (2 * Rkm * 1000); // metres, curvature
        const y = (h - h0 - drop) / 1000; // km
        const k = (j * N + i) * 3;
        positions[k] = eastKm;
        positions[k + 1] = y;
        positions[k + 2] = -northKm; // +Z = south, so the camera's forward is −Z
      }
    }
    const indices = [];
    for (let j = 0; j < N - 1; j++) {
      for (let i = 0; i < N - 1; i++) {
        const a = j * N + i;
        // CCW seen from above, so the computed normals point at the sky
        indices.push(a, a + 1, a + N, a + N, a + 1, a + N + 1);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    // Per-vertex sun exposure, filled by _castShadows(). One byte would do;
    // float keeps the attribute upload simple and the cost is 400 kB.
    geo.setAttribute('aShadow', new THREE.BufferAttribute(new Float32Array(N * N), 1));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    const sunDir = this.surfaceSunDir || new THREE.Vector3(1, 0, 0);
    const earthDir = this.surfaceEarthDir || new THREE.Vector3(0, -1, 0);
    const mat = terrainMaterial({ sunDir, earthDir, earthshine: this.surfaceEarthshine || 0 });
    this.surface.sunMat = mat;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    scene.add(mesh);
    this.surface.terrain = mesh;
    this.surface.crop = crop;
    this.surface.terrainN = N;
    this.surface.terrainHalfKm = halfKm;
    this.surface.shadowKey = null;

    // --- the ground beyond the crop -----------------------------------
    // The 24 km heightfield above is all the *LOLA* crop the app carries at
    // 160 m. Past its edge there is real terrain out to the skyline, and the
    // horizon mask knows its shape: 720 bearings, each holding the highest
    // terrain angle along that bearing. So the far ground is built from the
    // mask itself — an annulus from the crop's edge out to a 120 km skyline,
    // whose height rises to exactly the mask angle at the far edge.
    //
    // Two things follow, and both matter more than they look:
    //   - there is no gap. The old code dropped a vertical curtain at 60 km,
    //     which left black sky between the crop edge and the silhouette and
    //     made the ground read as a floating band;
    //   - the skyline you see is the function that decides whether the Sun is
    //     up. Look at the ridge, then look at the "Horizon" readout: the same
    //     number.
    const mask = site.horizon;
    if (mask && mask.length) {
      const seg = Math.max(360, mask.length); // one bearing per mask bin, at least
      const rings = [11.5, 14, 18, 24, 33, 46, 64, 88, 120]; // km, geometric-ish
      const far = rings[rings.length - 1];
      const pos = [];
      const idx = [];
      const maskAt = (i) => {
        const idxAz = (i / seg) * mask.length;
        const i0 = Math.floor(idxAz) % mask.length;
        const i1 = (i0 + 1) % mask.length;
        const f = idxAz - Math.floor(idxAz);
        return mask[i0] * (1 - f) + mask[i1] * f;
      };
      for (let i = 0; i <= seg; i++) {
        const hDeg = maskAt(i);
        const az = ((i / seg) * 360) * DEG;
        const east = Math.sin(az);
        const north = Math.cos(az);
        for (const r of rings) {
          // A curved profile: flat where the crop ends, bending up (or down)
          // to meet the mask angle exactly at the skyline. A straight ramp
          // would put ground *above* the sight line at intermediate ranges
          // and contradict the mask.
          const y = Math.tan(hDeg * DEG) * r * (r / far);
          pos.push(east * r, y, -north * r);
        }
      }
      const R = rings.length;
      for (let i = 0; i < seg; i++) {
        for (let j = 0; j < R - 1; j++) {
          const a = i * R + j;
          const b = a + R;
          idx.push(a, b, a + 1, a + 1, b, b + 1);
        }
      }
      const rgeo = new THREE.BufferGeometry();
      rgeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      rgeo.setIndex(idx);
      rgeo.computeVertexNormals();
      const rmat = terrainMaterial({ sunDir, earthDir, earthshine: this.surfaceEarthshine || 0 });
      // Slightly cooler and darker than the crop: it is the same regolith, but
      // far enough away that the eye needs a different value to read depth.
      rmat.uniforms.uRegolith.value = new THREE.Color('#6a6672');
      const ring = new THREE.Mesh(rgeo, rmat);
      ring.frustumCulled = false;
      scene.add(ring);
      this.surface.ring = ring;
    }
  }

  /**
   * Cast shadows from the real LOLA heightfield, at the current Sun angle.
   *
   * The surface view had no shadows at all: every triangle was shaded by its
   * own normal, so a ridge never darkened the ground behind it and a grazing
   * Sun produced a flat, evenly-lit plane — the opposite of what the poles look
   * like. This walks the terrain along the Sun's bearing, from each vertex
   * outward, and keeps the highest obstacle angle it meets. If that angle beats
   * the Sun's altitude the vertex is in shadow; the transition is spread over
   * the solar disk's half-degree so the shadow edge is a penumbra, not a stair.
   *
   * It uses the same `sampleOffset()` sampler the mesh was built from, and the
   * lunar curvature term, so it cannot disagree with the geometry on screen.
   * Recomputed only when the Sun actually moves (≈0.03° of altitude), which at
   * 6 h sampling means a handful of times per scrubbed day rather than per frame.
   */
  _castShadows(sunAlt, sunAz) {
    const mesh = this.surface.terrain;
    const crop = this.surface.crop;
    if (!mesh || !crop) return;
    const key = `${sunAlt.toFixed(3)}|${sunAz.toFixed(2)}`;
    if (this.surface.shadowKey === key) return;
    this.surface.shadowKey = key;

    const N = this.surface.terrainN;
    const halfKm = this.surface.terrainHalfKm;
    const cellKm = (halfKm * 2) / (N - 1);
    const Rm = R_MOON_KM * 1000;
    const az = (sunAz * Math.PI) / 180;
    const eAz = Math.sin(az);
    const nAz = Math.cos(az);
    const sunR = 0.27; // degrees, solar radius
    const tanAlt = Math.tan((sunAlt * Math.PI) / 180);
    const attr = mesh.geometry.getAttribute('aShadow');
    const arr = attr.array;

    // Distances to sample, in metres: fine near the vertex (where a boulder
    // would matter) then geometric out to the crop edge.
    const dists = [];
    for (let d = 30; d <= 1200; d += 30) dists.push(d);
    for (let d = 1600; d <= halfKm * 1000; d *= 1.35) dists.push(d);

    let shadowed = 0;
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const eastM = (-halfKm + i * cellKm) * 1000;
        const northM = (-halfKm + j * cellKm) * 1000;
        const h0 = crop.sampleOffset(eastM, northM);
        let worst = -Infinity;
        for (let k = 0; k < dists.length; k++) {
          const d = dists[k];
          const hd = crop.sampleOffset(eastM + eAz * d, northM + nAz * d);
          // Curvature drops the far ground away; ignoring it would invent
          // shadow at the edge of the crop.
          const drop = (d * d) / (2 * Rm);
          const ang = Math.atan2(hd - h0 - drop, d);
          if (ang > worst) worst = ang;
        }
        const worstDeg = (worst * 180) / Math.PI;
        // 1 = fully lit, 0 = fully shadowed, smooth over the solar disc.
        let v = (sunAlt + sunR - worstDeg) / (2 * sunR);
        v = v < 0 ? 0 : v > 1 ? 1 : v;
        arr[j * N + i] = v * v * (3 - 2 * v);
        if (v < 0.5) shadowed++;
      }
    }
    attr.needsUpdate = true;
    this.surface.shadowFraction = shadowed / (N * N);
  }

  /* ---------------------------------------------------------------- *
   * State
   * ---------------------------------------------------------------- */

  /**
   * @param {object} s
   * @param {object} s.sky         the same skyState the cards use
   * @param {object} s.frame       ephemeris skyFrame (for the Earth's spin)
   * @param {object} s.site        selected site
   * @param {object} s.sites       all sites
   * @param {'orbital'|'surface'} s.view
   * @param {'framed'|'real'} s.mode
   */
  setState(s) {
    const { sky, frame, site, view, mode } = s;
    if (s.sites) this.sites = s.sites;
    if (frame) this._frame = frame;
    if (view && view !== this.view) {
      this.view = view;
      this._applyView();
      if (view === 'surface') this.surface.aimed = false;
    }
    if (mode && mode !== this.mode) {
      this.mode = mode;
      this._applyMode();
    }
    if (site && site !== this.site) {
      const prev = this.site;
      this.site = site;
      this._selectSite(prev);
    }
    if (!sky || !frame) return;

    this.sky = sky;
    const firstFrame = !this.earthDirScene;
    const sunDir = toScene(frame.sunBody).normalize();
    const earthDir = toScene(frame.earthBody).normalize();
    this.sunDirScene = sunDir;
    this.earthDirScene = earthDir;
    if (firstFrame || this._needsReframe) {
      this._needsReframe = false;
      this._frameCamera();
    }

    // --- Moon & its lighting ---
    this.moonMat.uniforms.uSunDir.value.copy(sunDir);
    this.moonMat.uniforms.uEarthDir.value.copy(earthDir);
    // Earthshine is real light: ~0.1 lux-equivalent, i.e. a few percent.
    this.moonMat.uniforms.uEarthshine.value = 0.045 * (sky.earth.illumination ?? 0.5);

    // --- Sun: correct direction always, size depends on the display mode ---
    const framed = this.mode === 'framed';
    const sunAngR = framed ? SUN_ANG_R_FRAMED : frame.sunAngularRadius;
    const sunDome = framed ? SUN_DOME_FRAMED : SUN_DOME_REAL;
    const sunR = sunDome * Math.tan(sunAngR * DEG);
    this.sunGroup.position.copy(sunDir).multiplyScalar(sunDome);
    this.sunDisk.scale.setScalar(sunR);
    this.sunGlow.scale.setScalar(sunR * (framed ? 9 : 14));

    // --- Earth in the orbital scene ---
    const realDist = frame.earthDistKm * KM;
    const realR = (6371 / R_MOON_KM) * MOON_R;
    const dist = framed ? FRAMED_EARTH_DIST : realDist;
    const rad = framed ? FRAMED_EARTH_R : realR;
    if (framed) {
      // "Framed" compresses the Earth–Moon separation so both bodies fit in one
      // shot. The Earth used to be parked at a fixed 31° from the view axis at a
      // closer depth than the Moon — from most camera positions that put its
      // disc *on* the Moon's limb (they looked welded together).
      //
      // Instead the clearance is solved in angles, from this camera, every
      // frame: separation = Moon radius + Earth radius + a real gap of sky. The
      // Earth keeps the side the true Earth direction projects to, it sits at
      // the Moon's depth so the two disks scale together, and the gap survives
      // zooming and orbiting.
      const cam = this.orbital.cam;
      const camDist = Math.max(0.01, cam.position.length());
      const toMoon = cam.position.clone().negate().normalize(); // camera → Moon
      const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), toMoon);
      if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
      right.normalize();
      const up = new THREE.Vector3().crossVectors(toMoon, right).normalize();

      // Which side of the frame? The real Earth direction picks left or right;
      // the angle is solved by framing.js so the discs never touch and never
      // leave the frame, whatever the zoom (see that file's tests).
      // Genuine RTL: the composition mirrors, so the Earth sits where a
      // right-to-left reader starts, exactly as the side panel switches sides.
      const rtl = typeof document !== 'undefined' && document.documentElement.dir === 'rtl';
      const { sepRad, sideSign, dampedY, earthDist, visible } = framedEarthAngles({
        camDist,
        moonR: MOON_R,
        earthR: rad,
        fovDeg: cam.fov,
        aspect: cam.aspect,
        lateral: (rtl ? -1 : 1) * earthDir.dot(right),
        vertical: earthDir.dot(up),
      });
      const u = right
        .clone()
        .multiplyScalar(sideSign)
        .addScaledVector(up, dampedY)
        .normalize();

      const dirE = toMoon
        .clone()
        .multiplyScalar(Math.cos(sepRad))
        .addScaledVector(u, Math.sin(sepRad))
        .normalize();
      this.earthGroup.position.copy(cam.position).addScaledVector(dirE, earthDist);
      this.earthGroup.visible = visible;
    } else {
      this.earthGroup.position.copy(earthDir).multiplyScalar(dist);
      this.earthGroup.visible = true;
    }
    this.earthMesh.scale.setScalar(rad);
    this.earthAtmo.scale.setScalar(rad * 1.035);
    // The Earth is lit by the Sun, i.e. along the (Earth → Sun) direction — the
    // Moon → Sun vector to within 0.16° (the baseline is 0.26 % of 1 AU), so the
    // same unit vector that lights the Moon lights the Earth.
    //
    // It used to be `sunGroup.position − earthGroup.position`: a vector between
    // two *decorative* markers (a 16-unit sun dome and a marker-sized Earth),
    // which is not a real direction at all. Worse, in framed mode the Earth is
    // parked a few units away for composition, so the camera's view of it is
    // nothing like the Moon's view, and the phase on screen belonged to no
    // observer: 0.33 → 0.24 lit while the model said 0.38 → 0.83.
    //
    // `earthMarkerSunDir` keeps the real Sun's *side* and adjusts the direction
    // along the cone that reproduces the model's phase angle for the actual
    // viewing geometry — so the lit fraction you see is `sky.earth.illumination`,
    // the number the cards report. See framing.js for the derivation.
    const eye = this.orbital.cam.position.clone().sub(this.earthGroup.position);
    const lit = earthMarkerSunDir(sunDir, eye, sky.earth.illumination ?? 0.5, this.orbital.cam.up);
    this.earthLightDir = lit;
    this.earthMat.uniforms.uSunDir.value.set(lit.x, lit.y, lit.z);
    this.earthMat.uniforms.uExposure.value = framed ? 1.0 : 2.2;
    this._orientEarth(this.earthMesh, frame);
    this._orientEarth(this.surface.earth, frame);

    // --- surface scene -------------------------------------------------
    // The sun vector is computed every frame, not only when a terrain mesh
    // happens to exist: the mesh is built asynchronously, and it used to be
    // lit from a stale/absent direction until the next state change — which is
    // exactly the "the ground is a black void" bug.
    const surfSun = this._surfaceSunVector(sunDir);
    this.surfaceSunDir = surfSun;
    const surfEarth = this._surfaceSunVector(earthDir);
    this.surfaceEarthDir = surfEarth;
    // Earthshine is only light the ground can see: it is switched off when the
    // Earth is below this site's terrain horizon in that azimuth — the same
    // mask that decides the Earth-link number.
    const earthUp = sky.earth.visible ?? sky.earth.fraction > 0;
    const earthshine = earthUp
      ? 0.035 * (sky.earth.illumination ?? 0.5) * Math.min(1, sky.earth.fraction * 1.5)
      : 0;
    this.surfaceEarthshine = earthshine;
    // Cast shadows are a function of the Sun only, so they are recomputed here
    // — on a state change — and never inside the frame loop.
    this._castShadows(sky.sun.alt, sky.sun.az);
    if (this.surface.terrain) {
      this.surface.terrain.material.uniforms.uSunDir.value.copy(surfSun);
      this.surface.terrain.material.uniforms.uEarthDir.value.copy(surfEarth);
      this.surface.terrain.material.uniforms.uEarthshine.value = earthshine;
    }
    if (this.surface.ring) {
      this.surface.ring.material.uniforms.uSunDir.value.copy(surfSun);
      this.surface.ring.material.uniforms.uEarthDir.value.copy(surfEarth);
      this.surface.ring.material.uniforms.uEarthshine.value = earthshine;
    }
    const skyR = this.surface.skyRadius;
    const sSun = surfSun;
    const sEarth = surfEarth;
    this.surface.sun.position.copy(sSun).multiplyScalar(skyR);
    const trueSunScale = skyR * Math.tan(frame.sunAngularRadius * DEG);
    this.surface.sunDisk.scale.setScalar(trueSunScale);
    this.surface.sunScale = trueSunScale;
    this.surface.sunGlow.scale.setScalar(trueSunScale * 3.2);
    this.surface.sunGlow.material.opacity = 0.55;
    this.surface.earth.position.copy(sEarth).multiplyScalar(skyR);
    this.surface.earth.scale.setScalar(skyR * Math.tan((sky.earth.angularRadius ?? 0.95) * DEG));
    // Same rule in the surface sky: Sun and Earth are markers on one dome, so
    // the vector between them is meaningless. The Sun's *direction* lights the
    // Earth's disc, and it is the direction the model computed. The dome is far
    // compared with the step the camera can take inside the scene, so this is
    // the to-scale case — the phase matches the number in the readout, and it
    // matches the orbital view's Earth at the same instant.
    const sEye = this.surface.cam.position.clone().sub(this.surface.earth.position);
    const sLit = earthMarkerSunDir(sSun, sEye, sky.earth.illumination ?? 0.5, this.surface.cam.up);
    this.surface.earthMat.uniforms.uSunDir.value.set(sLit.x, sLit.y, sLit.z);
    this.surface.earthMat.uniforms.uExposure.value = 1.2;

    if (this._pendingReframe) {
      const kind = this._pendingReframe;
      this._pendingReframe = null;
      if (kind === 'framed') {
        // _frameCamera() snaps; fly instead so the change of scale is legible.
        const e = this.earthDirScene;
        const south = new THREE.Vector3(0, -1, 0);
        const dir = e.clone().multiplyScalar(0.55).addScaledVector(south, 0.84).normalize();
        this._animateTo(dir.multiplyScalar(this._framedDistance()), new THREE.Vector3(0, 0, 0));
      } else {
        this._frameTrueScale();
      }
    }

    if (this.view === 'surface' && !this.surface.aimed) {
      this.surface.aimed = true;
      this._aimSurfaceAtSun();
    }
    this._refreshLabelText();
  }

  /** Sun direction expressed in the surface scene's local (az/alt) frame. */
  _surfaceSunVector(dir) {
    // The surface scene is built in local ENU about the site: +X east,
    // +Y up, −Z north-ish (camera forward is −Z). Convert from body frame.
    const b = this._siteBasis;
    if (!b) return dir.clone();
    const up = b.up.dot(dir);
    const east = b.east.dot(dir);
    const north = b.north.dot(dir);
    return new THREE.Vector3(east, up, -north).normalize();
  }

  _siteBasisFor(site) {
    const la = (site.lat * Math.PI) / 180;
    const lo = (site.lon * Math.PI) / 180;
    const upB = { x: Math.cos(la) * Math.cos(lo), y: Math.cos(la) * Math.sin(lo), z: Math.sin(la) };
    const eastB = { x: -Math.sin(lo), y: Math.cos(lo), z: 0 };
    const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
    const northB = {
      x: upB.y * eastB.z - upB.z * eastB.y,
      y: upB.z * eastB.x - upB.x * eastB.z,
      z: upB.x * eastB.y - upB.y * eastB.x,
    };
    return { up: toScene(upB), east: toScene(eastB), north: toScene(northB) };
  }

  /**
   * Earth's orientation: the globe is turned so that the meridian facing the
   * Moon is the one the real Greenwich sidereal time puts there.
   */
  _orientEarth(mesh, frame) {
    const gast = frame.gast ?? 0;
    const th = (gast / 24) * 2 * Math.PI;
    // Greenwich meridian direction in EQJ, and Earth's pole in EQJ.
    const gEqj = { x: Math.cos(th), y: Math.sin(th), z: 0 };
    const pEqj = { x: 0, y: 0, z: 1 };
    const toB = frame.toBody;
    const g = toScene(toB(gEqj)).normalize();
    const p = toScene(toB(pEqj)).normalize();
    const x = g.clone().normalize();
    const y = p.clone().addScaledVector(x, -p.dot(x)).normalize();
    const z = new THREE.Vector3().crossVectors(x, y).normalize();
    const m = new THREE.Matrix4().makeBasis(x, y, z);
    mesh.quaternion.setFromRotationMatrix(m);
  }

  _selectSite(prev) {
    if (!this.site) return;
    this._siteBasis = this._siteBasisFor(this.site);
    // start looking where the Sun is: it is the only bright thing in a polar sky
    this._aimSurfaceAtSun();
    this.markerMeshes.forEach((m) => {
      const isSel = m.userData.siteId === this.site.id;
      m.userData.decor.forEach((d) => {
        d.material.opacity = isSel ? 1 : 0.55;
        d.material.color.set(isSel ? '#a78bfa' : '#6f6a86');
      });
      const halo = m.userData.decor[2];
      halo.visible = isSel;
    });
    if (this.terrainCrop && this.terrainSiteId === this.site.id) {
      this._rebuildTerrain(this.site, this.terrainCrop);
    } else if (this._terrainLoader) {
      // a new site: pull its LOLA crop, then rebuild
      this.terrainCrop = null;
      this.terrainSiteId = null;
      if (this.surface.terrain) {
        this.surface.scene.remove(this.surface.terrain);
        this.surface.terrain = null;
      }
      this._loadTerrain(this.site, this._terrainLoader);
    }
  }

  /** Point the surface camera at the Sun's azimuth, slightly below it. */
  _aimSurfaceAtSun() {
    const sky = this.sky;
    if (!sky) return;
    const az = sky.sun?.az ?? 0;
    this.surface.yaw = (az * Math.PI) / 180;
    this.surface.pitch = Math.max(-0.02, Math.min(0.5, ((sky.sun?.alt ?? 0) + 3) * (Math.PI / 180)));
  }

  /**
   * Smooth camera travel. Presets exist so the toggles visibly do something:
   *   'moon'   close portrait of the globe
   *   'earth'  pull back (or jump out) to where the Earth really is
   *   'site'   dive toward the selected landing site
   * The move is a damped interpolation of the orbit radius and direction; the
   * camera never teleports, and `prefers-reduced-motion` cuts it short.
   */
  flyTo(preset) {
    const cam = this.orbital.cam;
    const controls = this.orbital.controls;
    const earthPos = this.earthGroup.position.clone();
    const from = cam.position.clone();
    const fromTarget = controls.target.clone();
    let to;
    let toTarget = new THREE.Vector3(0, 0, 0);

    if (preset === 'earth') {
      // Travel to the Earth. At true scale it is 384,400 km away; from here the
      // Moon is the distant dot and the Earth fills the view. That distance is
      // the point of the mode, so the camera is allowed to cross it.
      const axis = earthPos.clone().normalize();
      let perp = new THREE.Vector3(0, 1, 0).cross(axis);
      if (perp.lengthSq() < 1e-4) perp = new THREE.Vector3(1, 0, 0);
      perp.normalize();
      const r = this.earthMesh.scale.x;
      to = earthPos
        .clone()
        .addScaledVector(perp, r * 3.4)
        .addScaledVector(axis, r * 1.2)
        .addScaledVector(new THREE.Vector3(0, 1, 0), r * 1.1);
      toTarget = earthPos.clone();
    } else if (preset === 'site') {
      const d = selenoToScene(this.site?.lat ?? -89.4, this.site?.lon ?? 0).normalize();
      to = d.clone().multiplyScalar(MOON_R * 2.5);
      toTarget = d.clone().multiplyScalar(MOON_R * 0.92);
    } else {
      to = from.clone().normalize().multiplyScalar(6.6);
    }

    this._fly = {
      from,
      to,
      fromTarget,
      toTarget,
      t: 0,
      dur: this.reduced ? 0.001 : 0.95,
    };
  }

  /** Animate the camera to a position + target. (Not named `_fly`: that is the
   *  in-flight state object the render loop reads.) */
  _animateTo(pos, target) {
    this._fly = {
      from: this.orbital.cam.position.clone(),
      to: pos.clone(),
      fromTarget: this.orbital.controls.target.clone(),
      toTarget: target.clone(),
      t: 0,
      dur: this.reduced ? 0.001 : 0.9,
    };
  }

  setTerrainLoader(fn) {
    this._terrainLoader = fn;
  }

  _applyView() {
    const surface = this.view === 'surface';
    // At the pole the Sun grazes the horizon: the ground receives ~2 % of
    // normal-incidence light. A sensor would record black; a dark-adapted eye
    // does not. The surface view therefore raises exposure (and only exposure —
    // no added lights) so the scene reads the way an astronaut would see it.
    this.renderer.toneMappingExposure = surface ? 2.35 : 1.05;
    this.orbital.controls.enabled = !surface;
    this.labelLayer.dataset.view = this.view;
  }

  _applyMode() {
    const framed = this.mode === 'framed';
    const controls = this.orbital.controls;
    controls.maxDistance = framed ? 22 : Math.max(600, (this._frame?.earthDistKm ?? 384400) * KM * 1.4);
    controls.minDistance = framed ? MOON_R * 1.22 : 0.4;
    // Both scales need a new vantage, and only afterwards can it be computed:
    // switching scale used to leave the camera where it was, so true scale
    // pointed at empty space (the Earth is 221 lunar radii away) and framed
    // mode often looked off-centre. The reframe happens in setState, once the
    // two bodies are where they belong.
    this._pendingReframe = framed ? 'framed' : 'real';
  }

  /**
   * True-scale vantage: stand off the Moon looking at it, with the Earth on the
   * same sight line at its real 384,400 km. The Earth is then a ~2° disc —
   * small, and that is the point of the mode — but it is on screen and clearly
   * separated from the Moon instead of being nowhere.
   */
  _frameTrueScale() {
    const axis = (this.earthDirScene ?? new THREE.Vector3(1, 0, 0)).clone().normalize();
    const sun = (this.sunDirScene ?? new THREE.Vector3(1, 0, 0)).clone().normalize();
    const south = new THREE.Vector3(0, -1, 0);

    // True scale has a hard geometric fact in it: from anywhere near the Moon
    // the Earth is either behind the camera or hidden behind the Moon itself —
    // the two only co-exist in one frame from far away. So the vantage is the
    // Moon's far side, swung 14° toward the Sun (so its disc is half lit rather
    // than a black circle) and tilted a little toward the pole. From there the
    // Earth clears the limb and appears at its real 1.9°, 384,400 km out.
    const perpSun = sun.clone().addScaledVector(axis, -sun.dot(axis));
    if (perpSun.lengthSq() < 1e-6) perpSun.copy(south);
    perpSun.normalize();
    const camDist = MOON_R * 7.5;
    // 14°: enough to clear the Moon's limb with room to spare, small enough
    // that the Earth (2.5° off the view axis from here) stays well inside it.
    const delta = (14 * Math.PI) / 180;
    const pos = axis
      .clone()
      .multiplyScalar(-Math.cos(delta))
      .addScaledVector(perpSun, Math.sin(delta))
      .multiplyScalar(camDist)
      .addScaledVector(south, camDist * 0.08);
    this._animateTo(pos, new THREE.Vector3(0, 0, 0));
  }

  /* ---------------------------------------------------------------- *
   * Labels (DOM, projected each frame)
   * ---------------------------------------------------------------- */

  setLabels(labels) {
    this.labels = labels;
    this._refreshLabelText();
  }

  _labelEl(key) {
    if (!this._labelEls) this._labelEls = new Map();
    let el = this._labelEls.get(key);
    if (!el) {
      el = document.createElement('div');
      el.className = `scene-label scene-label--${key.split(':')[0]}`;
      el.innerHTML = '<span class="scene-label-title"></span><span class="scene-label-sub"></span>';
      this.labelLayer.appendChild(el);
      this._labelEls.set(key, el);
    }
    return el;
  }

  _refreshLabelText() {
    if (!this.labels) return;
    for (const [key, data] of Object.entries(this.labels)) {
      const el = this._labelEl(key);
      el.querySelector('.scene-label-title').textContent = data.title || '';
      el.querySelector('.scene-label-sub').textContent = data.sub || '';
    }
  }

  /**
   * Rectangles (in canvas space) that labels must not cover: the legend, the
   * scale badge and the compass ribbon. Read from the DOM so the layout stays
   * authoritative.
   */
  _overlayRects() {
    if (!this._rects || this._rects.at(-1).t < 800) {
      const host = this.container.getBoundingClientRect();
      const rects = [];
      for (const sel of ['.scene-legend', '.scene-badges', '.compass', '.scrubber']) {
        const node = this.container.parentElement?.querySelector(sel) || document.querySelector(sel);
        if (!node) continue;
        const r = node.getBoundingClientRect();
        rects.push({ x0: r.left - host.left - 12, y0: r.top - host.top - 12, x1: r.right - host.left + 12, y1: r.bottom - host.top + 12 });
      }
      this._rects = rects.length ? rects.map((r) => ({ ...r, t: 900 })) : [];
    }
    return this._rects;
  }

  _placeLabel(el, worldPos, camera, opts = {}) {
    if (!worldPos) {
      el.style.opacity = '0';
      return;
    }
    const v = worldPos.clone().project(camera);
    const behind = v.z > 1;
    const x = (v.x * 0.5 + 0.5) * this.width;
    const y = (-v.y * 0.5 + 0.5) * this.height;
    const off = x < 0 || x > this.width || y < 0 || y > this.height;
    if (behind || off || opts.hidden) {
      el.style.opacity = '0';
      el.style.pointerEvents = 'none';
      el.dataset.placed = '0';
      return;
    }
    // keep labels out of the overlay chrome
    for (const r of this._overlayRects()) {
      if (x > r.x0 && x < r.x1 && y > r.y0 && y < r.y1) {
        el.style.opacity = '0';
        el.dataset.placed = '0';
        return;
      }
    }
    const taken = this._taken || [];
    this._taken = taken;
    el.style.opacity = '1';
    el.dataset.placed = '1';
    // A label sits *outside* the body it annotates. Both sides are scored —
    // does the text stay in frame, does it land on the Moon's disc — and the
    // better one wins. (Before this, an Earth parked beside the Moon always got
    // its label printed on top of the lunar surface.)
    const gapPx = (opts.bodyRadiusPx ?? 0) + 14;
    const boxW = 190;
    const boxH = 46;
    const overlap = (a, b) =>
      Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) *
      Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
    const moonRect = opts.avoid
      ? {
          x0: opts.avoid.x - opts.avoid.r,
          x1: opts.avoid.x + opts.avoid.r,
          y0: opts.avoid.y - opts.avoid.r,
          y1: opts.avoid.y + opts.avoid.r,
        }
      : null;

    // Four candidate seats. Sides first (the usual arrangement, outside the
    // body), then above/below — which is the only room left when a body sits in
    // the narrow gutter beside a Moon that fills most of the frame.
    const seats = [
      { id: 'right', box: { x0: x + gapPx, x1: x + gapPx + boxW, y0: y - boxH / 2, y1: y + boxH / 2 }, css: `translate3d(${Math.round(x + gapPx)}px, ${Math.round(y)}px, 0) translate3d(0, -50%, 0)` },
      { id: 'left', box: { x0: x - gapPx - boxW, x1: x - gapPx, y0: y - boxH / 2, y1: y + boxH / 2 }, css: `translate3d(${Math.round(x - gapPx)}px, ${Math.round(y)}px, 0) translate3d(-100%, -50%, 0)` },
      { id: 'below', box: { x0: x - boxW / 2, x1: x + boxW / 2, y0: y + gapPx, y1: y + gapPx + boxH }, css: `translate3d(${Math.round(x)}px, ${Math.round(y + gapPx)}px, 0) translate3d(-50%, 0, 0)` },
      { id: 'above', box: { x0: x - boxW / 2, x1: x + boxW / 2, y0: y - gapPx - boxH, y1: y - gapPx }, css: `translate3d(${Math.round(x)}px, ${Math.round(y - gapPx)}px, 0) translate3d(-50%, -100%, 0)` },
    ];
    // Three separate verdicts, because they are not equally bad:
    //   offFrame — clipped by the frame: fatal, hide the label.
    //   onLabel  — covers another label: fatal, hide (text over text is noise).
    //   onMoon   — overlaps a large disc: allowed. The pill has its own
    //              background and reads fine, and dropping the Earth's name
    //              because it sits near the limb is a worse answer.
    const verdict = (seat) => {
      const b = seat.box;
      const offFrame = b.x0 < 4 || b.x1 > this.width - 4 || b.y0 < 4 || b.y1 > this.height - 4;
      const onMoon = moonRect ? overlap(b, moonRect) : 0;
      let onLabel = 0;
      for (const t of taken) onLabel = Math.max(onLabel, overlap(b, t));
      return { offFrame, onLabel, onMoon };
    };
    const score = (seat) => {
      const v = verdict(seat);
      return (v.offFrame ? 1e9 : 0) + v.onLabel * 10 + v.onMoon * 3;
    };
    // preference: outward from the frame edge the body is nearest to, then the
    // other side, then below, then above
    const order = x < this.width / 2 ? [0, 2, 1, 3] : [1, 2, 0, 3];
    let best = seats[order[0]];
    let bestScore = score(best);
    for (const i of order.slice(1)) {
      const sc = score(seats[i]);
      if (sc < bestScore) {
        best = seats[i];
        bestScore = sc;
      }
    }
    // Only an off-frame seat is fatal — a label with no room at all is worse
    // than useless. Landing partly over a large disc is accepted: the pill has
    // its own background, and hiding the Earth's name entirely is not an
    // improvement on printing it near the Moon's limb.
    const seatVerdict = verdict(best);
    if (seatVerdict.offFrame || seatVerdict.onLabel > 0) {
      el.style.opacity = '0';
      el.dataset.placed = '0';
      return;
    }
    el.dataset.side = best.id;
    el.style.transform = best.css;
    taken.push(best.box);
  }

  /* ---------------------------------------------------------------- *
   * Interaction
   * ---------------------------------------------------------------- */

  _bindPointer() {
    const el = this.renderer.domElement;
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();

    const pick = (ev) => {
      if (this.view !== 'orbital') return null;
      const r = el.getBoundingClientRect();
      this.pointer.x = ((ev.clientX - r.left) / r.width) * 2 - 1;
      this.pointer.y = -((ev.clientY - r.top) / r.height) * 2 + 1;
      this.raycaster.setFromCamera(this.pointer, this.orbital.cam);
      const hits = this.raycaster.intersectObjects(this.markerMeshes, false);
      if (!hits.length) return null;
      const id = hits[0].object.userData.siteId;
      return this.sites?.find((s) => s.id === id) || null;
    };

    this._onPointerMove = (ev) => {
      if (this.view === 'surface') {
        if (!this.surface.drag) return;
        const dx = ev.clientX - this.surface.drag.x;
        const dy = ev.clientY - this.surface.drag.y;
        this.surface.drag = { x: ev.clientX, y: ev.clientY };
        this.surface.yaw -= dx * 0.0032;
        this.surface.pitch = Math.max(-0.5, Math.min(0.9, this.surface.pitch - dy * 0.0032));
        return;
      }
      const hit = pick(ev);
      const id = hit?.id ?? null;
      if (id !== this.hovered) {
        this.hovered = id;
        el.style.cursor = id ? 'pointer' : 'grab';
        this.opts.onHover?.(hit);
      }
    };
    this._onPointerDown = (ev) => {
      if (this.view === 'surface') {
        this.surface.drag = { x: ev.clientX, y: ev.clientY };
      }
    };
    this._onPointerUp = (ev) => {
      if (this.view === 'surface') {
        this.surface.drag = null;
        return;
      }
      const hit = pick(ev);
      if (hit) this.opts.onSelect?.(hit);
    };
    this._onPointerLeave = () => {
      this.surface.drag = null;
      if (this.hovered) {
        this.hovered = null;
        this.opts.onHover?.(null);
      }
    };
    el.addEventListener('pointermove', this._onPointerMove);
    el.addEventListener('pointerdown', this._onPointerDown);
    el.addEventListener('pointerup', this._onPointerUp);
    el.addEventListener('pointerleave', this._onPointerLeave);

    // Touch look-around on the surface view.
    el.addEventListener(
      'touchstart',
      (ev) => {
        if (this.view === 'surface' && ev.touches[0]) {
          this.surface.drag = { x: ev.touches[0].clientX, y: ev.touches[0].clientY };
        }
      },
      { passive: true }
    );
  }

  /* ---------------------------------------------------------------- *
   * Frame loop
   * ---------------------------------------------------------------- */

  resize() {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.width = w;
    this.height = h;
    this.renderer.setSize(w, h, false);
    this.orbital.cam.aspect = w / h;
    this.orbital.cam.updateProjectionMatrix();
    this.surface.cam.aspect = w / h;
    this.surface.cam.updateProjectionMatrix();
    this.composerOrbital?.setSize(w, h);
    this.composerSurface?.setSize(w, h);
    const quarter = new THREE.Vector2(w, h).multiplyScalar(0.25);
    this.bloomOrbital?.setSize(quarter.x, quarter.y);
    this.bloomSurface?.setSize(quarter.x, quarter.y);
  }

  _loop() {
    if (this.disposed) return;
    this._raf = requestAnimationFrame(this._loop);
    const dt = Math.min(0.1, this.clock.getDelta() || 0.016);
    const t = this.clock.elapsedTime;
    const pulse = this.reduced ? 1 : 1 + 0.12 * Math.sin(t * 2.2);

    if (this.view === 'surface') {
      // camera look-around
      const { cam, yaw, pitch } = this.surface;
      cam.position.set(0, 0.002, 0);
      const dir = new THREE.Vector3(
        Math.sin(yaw) * Math.cos(pitch),
        Math.sin(pitch),
        -Math.cos(yaw) * Math.cos(pitch)
      );
      cam.lookAt(dir);
      if (this.surface.sunScale) this.surface.sunGlow.scale.setScalar(this.surface.sunScale * 3.2 * pulse);
      this.composerSurface.render();
      this._updateSurfaceLabels();
      this.opts.onFrame?.({ azimuth: ((yaw * 180) / Math.PI) % 360, altitude: (pitch * 180) / Math.PI });
    } else {
      if (this._fly) {
        // Own the camera while flying: OrbitControls' damping would otherwise
        // fight the interpolation and stop the move half-way.
        const f = this._fly;
        this.orbital.controls.enabled = false;
        f.t = Math.min(1, f.t + dt / f.dur);
        const e = f.t < 0.5 ? 2 * f.t * f.t : 1 - Math.pow(-2 * f.t + 2, 2) / 2; // ease-in-out
        this.orbital.cam.position.lerpVectors(f.from, f.to, e);
        this.orbital.controls.target.lerpVectors(f.fromTarget, f.toTarget, e);
        this.orbital.cam.lookAt(this.orbital.controls.target);
        if (f.t >= 1) {
          this._fly = null;
          this.orbital.controls.enabled = this.view !== 'surface';
          this.orbital.controls.update();
        }
      } else {
        this.orbital.controls.update();
      }
      const sel = this.markerMeshes.find((m) => m.userData.siteId === this.site?.id);
      if (sel) sel.userData.decor[2].scale.setScalar(pulse);
      this.composerOrbital.render();
      this._updateOrbitalLabels();
    }
  }

  _occludedByMoon(worldPos) {
    const cam = this.orbital.cam;
    const toPoint = worldPos.clone().sub(cam.position);
    const toCentre = new THREE.Vector3().subVectors(new THREE.Vector3(0, 0, 0), cam.position);
    const dPoint = toPoint.length();
    const dCentre = toCentre.length();
    if (dPoint < dCentre) return false; // in front of the Moon
    const cos = toPoint.normalize().dot(toCentre.normalize());
    const ang = Math.acos(Math.min(1, Math.max(-1, cos)));
    const moonAng = Math.asin(Math.min(0.999, MOON_R / dCentre));
    return ang < moonAng;
  }

  _updateOrbitalLabels() {
    const cam = this.orbital.cam;
    this._taken = [];
    const sunPos = this.sunGroup.position;
    const earthPos = this.earthGroup.position;
    const pxRadius = (worldRadius, worldPos) => {
      const d = worldPos.distanceTo(cam.position);
      const halfH = this.height / 2;
      return (worldRadius / d) * (halfH / Math.tan((cam.fov * DEG) / 2));
    };
    this._placeLabel(this._labelEl('sun'), sunPos, cam, {
      hidden: this._occludedByMoon(sunPos),
      bodyRadiusPx: pxRadius(this.sunDisk.scale.x, sunPos),
    });
    // Screen-space disc of the Moon, so the Earth's label can keep clear of it.
    const moonPx = new THREE.Vector3(0, 0, 0).project(cam);
    const moonDisc = {
      x: (moonPx.x * 0.5 + 0.5) * this.width,
      y: (-moonPx.y * 0.5 + 0.5) * this.height,
      r: pxRadius(MOON_R, new THREE.Vector3(0, 0, 0)),
    };
    this._placeLabel(this._labelEl('earth'), earthPos, cam, {
      hidden: this._occludedByMoon(earthPos),
      bodyRadiusPx: pxRadius(this.earthMesh.scale.x, earthPos),
      avoid: moonDisc,
    });
    this._placeOffscreenSun(sunPos, cam);
    // the selected site is labelled first, then the rest
    const ordered = [...(this.sites || [])].sort(
      (a, b) => (a.id === this.site?.id ? -1 : 0) - (b.id === this.site?.id ? -1 : 0)
    );
    for (const site of ordered) {
      const el = this._labelEl(`site:${site.id}`);
      const dir = selenoToScene(site.lat, site.lon).multiplyScalar(MOON_R * 1.06);
      // A point is on the visible hemisphere when it is in front of the
      // Moon's limb circle as seen from the camera.
      const camDist = cam.position.length();
      const hidden = dir.clone().normalize().dot(cam.position.clone().normalize()) < MOON_R / camDist;
      this._placeLabel(el, dir, cam, { hidden });
      el.dataset.selected = site.id === this.site?.id ? 'true' : 'false';
    }
  }

  /**
   * When the Sun is outside the field of view (it usually is: from the pole it
   * sits within a couple of degrees of the horizon, ~90° from the sub-solar
   * point), a chevron on the frame edge points at it. That is a direction
   * indicator, never a fake position.
   */
  _placeOffscreenSun(worldPos, camera) {
    const el = this._labelEl('sunHint');
    const v = worldPos.clone().project(camera);
    const behind = v.z > 1;
    const onScreen = !behind && Math.abs(v.x) < 0.96 && Math.abs(v.y) < 0.94;
    if (onScreen) {
      el.style.opacity = '0';
      return;
    }
    // direction from the frame centre toward the Sun, in screen space
    let dx = v.x;
    let dy = -v.y;
    if (behind) {
      dx = -dx;
      dy = -dy;
    }
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const x = this.width / 2 + dx * (this.width / 2 - 46);
    const y = this.height / 2 + dy * (this.height / 2 - 40);
    // Never park the hint on top of a body or a label that is already placed.
    const box = { x0: x - 66, y0: y - 16, x1: x + 66, y1: y + 16 };
    for (const b of this._taken || []) {
      if (box.x0 < b.x1 && box.x1 > b.x0 && box.y0 < b.y1 && box.y1 > b.y0) {
        el.style.opacity = '0';
        return;
      }
    }
    for (const r of this._overlayRects()) {
      if (box.x0 < r.x1 && box.x1 > r.x0 && box.y0 < r.y1 && box.y1 > r.y0) {
        el.style.opacity = '0';
        return;
      }
    }
    const deg = (Math.atan2(dy, dx) * 180) / Math.PI;
    el.style.opacity = '1';
    el.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0) translate(-50%, -50%)`;
    el.style.setProperty('--hint-angle', `${deg}deg`);
  }

  _updateSurfaceLabels() {
    const cam = this.surface.cam;
    this._taken = [];
    const skyR = this.surface.skyRadius;
    const sunPos = new THREE.Vector3().copy(this.surface.sun.position);
    const earthPos = new THREE.Vector3().copy(this.surface.earth.position);
    const pxRadius = (worldRadius, worldPos) => {
      const d = worldPos.distanceTo(cam.position);
      const halfH = this.height / 2;
      return (worldRadius / d) * (halfH / Math.tan((cam.fov * DEG) / 2));
    };
    this._placeLabel(this._labelEl('sun'), sunPos, cam, { bodyRadiusPx: pxRadius(this.surface.sunDisk.scale.x, sunPos) });
    this._placeLabel(this._labelEl('earth'), earthPos, cam, { bodyRadiusPx: pxRadius(this.surface.earth.scale.x, earthPos) });
    for (const site of this.sites || []) {
      this._labelEl(`site:${site.id}`).style.opacity = '0';
    }
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this._raf);
    this._resizeObserver?.disconnect();
    const el = this.renderer.domElement;
    el.removeEventListener('pointermove', this._onPointerMove);
    el.removeEventListener('pointerdown', this._onPointerDown);
    el.removeEventListener('pointerup', this._onPointerUp);
    el.removeEventListener('pointerleave', this._onPointerLeave);
    this.orbital.controls.dispose();
    this.orbital.scene.traverse((o) => {
      o.geometry?.dispose?.();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => {
          Object.values(m.uniforms || {}).forEach((u) => u.value?.isTexture && u.value.dispose());
          m.dispose();
        });
      }
    });
    this.surface.scene.traverse((o) => {
      o.geometry?.dispose?.();
      o.material?.dispose?.();
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.labelLayer.remove();
  }
}
