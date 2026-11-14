/**
 * Viewer — the mission viewer: 3D scene + view/mode toggles + mission clock.
 * The scene is fed only `site`, `time`, `view` and `mode`; every number it
 * draws comes from the same `skyState()` the cards use.
 */

import { useEffect, useRef, useState } from 'react';
import { Maximize2, Minimize2, Globe2, MapPin, Moon, Orbit, Camera, Frame, Ruler } from 'lucide-react';
import { SegmentedControl, IconButton } from '../ui/Controls.jsx';
import MoonScene from './MoonScene.jsx';
import TimeScrubber from './TimeScrubber.jsx';
import { useI18n } from '../../lib/i18n.jsx';
import { useMission } from '../../lib/store.jsx';

export default function Viewer() {
  const { t, date } = useI18n();
  const { site, sites, sitesText, cursorMs, selectSite, series } = useMission();
  const [view, setView] = useState('orbital');
  const [mode, setMode] = useState('framed');
  const [expanded, setExpanded] = useState(false);
  const sceneRef = useRef(null);

  // Escape leaves the expanded view; scrolling is locked while it is open.
  useEffect(() => {
    if (!expanded) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setExpanded(false);
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [expanded]);

  return (
    <section className={`viewer ${expanded ? 'viewer--expanded' : ''}`} aria-label={t('viewerLabel')}>
      <header className="viewer-top">
        <div className="toolbar viewer-toolbar">
          <SegmentedControl
            label={t('viewLabel')}
            size="sm"
            value={view}
            onChange={setView}
            options={[
              { value: 'orbital', label: t('orbitalView'), icon: Orbit },
              { value: 'surface', label: t('surfaceView'), icon: Camera },
            ]}
          />
          <span className="toolbar-divider" aria-hidden="true" />
          <SegmentedControl
            label={t('scaleLabel')}
            size="sm"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'framed', label: t('framedScale'), icon: Frame },
              { value: 'real', label: t('realScale'), icon: Ruler },
            ]}
          />
          <span className="toolbar-divider" aria-hidden="true" />
          <div className="viewer-tools" role="group" aria-label={t('cameraPresets')}>
            {[
              { id: 'moon', icon: Moon, label: t('flyMoon') },
              { id: 'earth', icon: Globe2, label: t('flyEarth') },
              { id: 'site', icon: MapPin, label: t('flySite') },
            ].map((b) => (
              <IconButton key={b.id} icon={b.icon} label={b.label} onClick={() => sceneRef.current?.flyTo(b.id)} />
            ))}
          </div>
        </div>
        {/* date + expand travel together: if the row is tight they wrap as
            one right-aligned group instead of the icon dropping on its own */}
        <div className="viewer-meta">
          <span className="viewer-date num">{date(cursorMs)}</span>
          <IconButton
            icon={expanded ? Minimize2 : Maximize2}
            label={expanded ? t('collapse') : t('expand')}
            onClick={() => setExpanded((v) => !v)}
          />
        </div>
      </header>

      <MoonScene
        apiRef={sceneRef}
        site={site}
        time={cursorMs}
        mode={mode}
        view={view}
        sites={sites}
        onSiteSelect={(s) => selectSite(s.id)}
      />

      <TimeScrubber series={series} />
    </section>
  );
}
