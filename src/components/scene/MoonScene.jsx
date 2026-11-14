/**
 * <MoonScene /> — the reusable 3D view
 * ---------------------------------------------------------------------------
 * Public API (the contract the rest of the app codes against):
 *
 *   <MoonScene
 *     site        selected site object (lat, lon, id, horizon…)
 *     time        UTC milliseconds — the single time input
 *     mode        'framed' | 'real'
 *     view        'orbital' | 'surface'
 *     sites       all candidate sites (markers)
 *     onSiteSelect(site)   a marker was clicked
 *     onTimeChange(ms)     optional: the scene asked to move time
 *     className, caption
 *   />
 *
 * Everything drawn inside comes from `skyState(site, time)` — the same
 * function the KPI cards read — plus the LOLA heightfields fetched here. The
 * component owns no astronomy of its own.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { MoonSceneEngine } from './engine.js';
import { skyState, skyFrame } from '../../lib/astro.js';
import { TERRAIN_CROPS } from '../../lib/horizons.generated.js';
import { loadSiteTerrain } from '../../lib/terrain.js';
import { useI18n } from '../../lib/i18n.jsx';

/** Load once per session: the bright-star catalogue (Hipparcos/Yale, mag ≤ 6). */
let starCache = null;
async function loadStars() {
  if (starCache) return starCache;
  const res = await fetch(`${import.meta.env.BASE_URL ?? '/'}data/stars.bin`);
  if (!res.ok) throw new Error(`stars: ${res.status}`);
  const buf = await res.arrayBuffer();
  starCache = new Float32Array(buf);
  return starCache;
}

const terrainCache = new Map();
async function loadTerrainFor(siteId) {
  if (terrainCache.has(siteId)) return terrainCache.get(siteId);
  const meta = TERRAIN_CROPS[siteId];
  if (!meta) return null;
  const t = loadSiteTerrain(meta);
  terrainCache.set(siteId, t);
  return t;
}

const fmtDeg = (v, digits = 2) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(digits)}°`;

export default function MoonScene({
  site,
  time,
  mode = 'framed',
  view = 'orbital',
  sites = [],
  onSiteSelect,
  onTimeChange,
  apiRef,
  className = '',
}) {
  const hostRef = useRef(null);
  const engineRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [look, setLook] = useState({ azimuth: 0, altitude: 0 });
  const { t, lang } = useI18n();

  // The one computation everything in here shares with the rest of the app.
  const sky = useMemo(() => skyState(site, time), [site, time]);
  const frame = useMemo(() => skyFrame(time), [time]);

  /* ---------------- engine lifecycle ---------------- */
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    const engine = new MoonSceneEngine(host, {
      onSelect: (s) => onSiteSelect?.(s),
      onHover: () => {},
      onReady: () => setReady(true),
      onFrame: (v) => setLook(v),
    });
    engineRef.current = engine;
    if (apiRef) apiRef.current = engine;
    // `__scene` is a deliberate inspection hook: the integration check
    // (scripts/check-browser.mjs) reads real engine vectors through it to prove
    // that the numbers on the cards and the pixels in the canvas agree.
    window.__scene = engine;
    engine.setTerrainLoader(loadTerrainFor);
    engine._frame = frame;

    (async () => {
      try {
        const stars = await loadStars();
        const terrain = await loadTerrainFor(site.id);
        await engine.setData({ sites, stars, terrainLoader: loadTerrainFor });
        if (terrain) engine.terrainCrop = terrain;
        engine.setState({ sky, frame, site, view, mode });
      } catch (err) {
        console.error(err);
        setLoadError(err.message || 'scene failed to load');
      }
    })();

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------- data updates ---------------- */
  useEffect(() => {
    engineRef.current?.setData?.({ sites });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sites]);

  useEffect(() => {
    if (!engineRef.current) return;
    engineRef.current._frame = frame;
    engineRef.current.setState({ sky, frame, site, view, mode });
  }, [sky, frame, site, view, mode]);

  /* ---------------- label text ---------------- */
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const labels = {
      sun: {
        title: t('sceneSun'),
        sub: `${fmtDeg(sky.sun.alt)} · ${sky.sun.az.toFixed(0)}° · ${(sky.sun.angularDiameter ?? 0.53).toFixed(2)}°`,
      },
      earth: {
        title: t('sceneEarth'),
        sub: `${fmtDeg(sky.earth.alt)} · ${sky.earth.az.toFixed(0)}° · ${(sky.earth.angularDiameter ?? 1.9).toFixed(2)}°`,
      },
    };
    for (const s of sites) {
      labels[`site:${s.id}`] = {
        title: s.name,
        sub: `${Math.abs(s.lat).toFixed(2)}°S · ${s.lon.toFixed(1)}°E`,
      };
    }
    engine.setLabels(labels);
  }, [sites, sky, t, lang]);

  const surface = view === 'surface';
  const compass = ((look.azimuth % 360) + 360) % 360;
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

  return (
    <div className={`moon-scene ${surface ? 'is-surface' : ''} ${className}`}>
      <div className="moon-scene-canvas" ref={hostRef} />

      {!ready && !loadError && (
        <div className="scene-loading" role="status">
          <span className="scene-spinner" aria-hidden="true" />
          {t('sceneLoading')}
        </div>
      )}
      {loadError && (
        <div className="scene-loading scene-loading--error" role="alert">
          {t('sceneError')}
        </div>
      )}

      <div className="scene-badges">
        <span className={`pill pill--scale ${mode === 'real' ? 'is-real' : ''}`}>
          {mode === 'real' ? t('trueScale') : t('notToScale')}
        </span>
      </div>

      {surface && (
        <div className="compass" aria-hidden="true">
          <div className="compass-track">
            {Array.from({ length: 24 }, (_, i) => i * 15).map((a) => {
              const off = ((a - compass + 540) % 360) - 180;
              if (Math.abs(off) > 60) return null;
              const major = a % 45 === 0;
              return (
                <span
                  key={a}
                  className={`compass-tick ${major ? 'is-major' : ''}`}
                  style={{ transform: `translateX(${off * 2.6}px)` }}
                >
                  {major ? dirs[Math.round(a / 45) % 8] : ''}
                </span>
              );
            })}
            <span className="compass-needle">{compass.toFixed(0)}°</span>
          </div>
        </div>
      )}

      <dl className="scene-legend">
        <div>
          <dt>
            <span className="legend-dot legend-dot--sun" aria-hidden="true" />
            {t('sceneSun')}
          </dt>
          <dd className="num">{fmtDeg(sky.sun.alt)}</dd>
        </div>
        <div>
          <dt>
            <span className="legend-dot legend-dot--earth" aria-hidden="true" />
            {t('sceneEarth')}
          </dt>
          <dd className="num">{fmtDeg(sky.earth.alt)}</dd>
        </div>
        <div className="scene-legend-meta">
          <dt>{t('sceneTerrain')}</dt>
          <dd className="num">
            {fmtDeg(sky.sun.horizon, 1)} / {fmtDeg(sky.earth.horizon, 1)}
          </dd>
        </div>
      </dl>
    </div>
  );
}
