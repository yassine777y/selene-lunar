/**
 * TimeScrubber — the mission clock under the 3D view.
 * ---------------------------------------------------------------------------
 * One slider, three speeds, and a band strip that shows what the next days
 * hold: sunlight, darkness and Earth line-of-sight, sampled from the same
 * `series()` the charts use. Dragging it moves the 3D scene, the cards and the
 * timeline chart together, because all of them read `cursorMs` from the store.
 */

import { useMemo } from 'react';
import { CalendarDays, MoveHorizontal, Pause, Play } from 'lucide-react';
import { useI18n } from '../../lib/i18n.jsx';
import { useMission } from '../../lib/store.jsx';

const SPEEDS = [
  { id: '1', hoursPerSecond: 1 },
  { id: '6', hoursPerSecond: 6 },
  { id: '24', hoursPerSecond: 24 },
];

export default function TimeScrubber({ series = [] }) {
  const { t, dateTime } = useI18n();
  const { window: win, cursorMs, setCursor, playing, setPlaying, speed, setSpeed, stepDay } = useMission();

  const span = win.endMs - win.startMs || 1;
  const pct = Math.max(0, Math.min(100, ((cursorMs - win.startMs) / span) * 100));

  /* Bands: one cell per sample, lit / earth-visible combinations. */
  const cells = useMemo(() => {
    if (!series.length) return [];
    return series.map((s) => ({
      lit: s.sunVisible,
      link: s.earthVisible,
      t: s.t,
    }));
  }, [series]);

  const onScrub = (e) => {
    const value = Number(e.target.value);
    setCursor(win.startMs + (value / 1000) * span);
  };

  return (
    <div className="scrubber">
      <div className="scrubber-row">
        <button
          type="button"
          className={`scrubber-play ${playing ? 'is-playing' : ''}`}
          onClick={() => setPlaying(!playing)}
          aria-label={playing ? t('pause') : t('play')}
          aria-pressed={playing}
        >
          {playing ? <Pause size={18} strokeWidth={2} /> : <Play size={18} strokeWidth={2} />}
        </button>

        <div className="scrubber-slider">
          <div className="scrubber-bands" aria-hidden="true">
            {cells.map((c, i) => (
              <span
                key={c.t}
                className={`band ${c.lit ? 'is-lit' : 'is-dark'} ${c.link ? 'is-link' : ''}`}
                style={{ left: `${(i / Math.max(1, cells.length - 1)) * 100}%` }}
              />
            ))}
          </div>
          <input
            id="mission-clock"
            className="scrubber-input"
            type="range"
            min={0}
            max={1000}
            step={1}
            value={Math.round(pct * 10)}
            onChange={onScrub}
            aria-label={t('scrubber')}
            aria-valuetext={dateTime(cursorMs)}
          />
          <span className="scrubber-progress" style={{ width: `${pct}%` }} aria-hidden="true" />
        </div>

        <div className="toolbar scrubber-speeds" role="group" aria-label={t('speed')}>
          {SPEEDS.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`chip ${speed === s.hoursPerSecond ? 'is-active' : ''}`}
              onClick={() => setSpeed(s.hoursPerSecond)}
              aria-pressed={speed === s.hoursPerSecond}
            >
              {s.hoursPerSecond === 1 ? t('speedHour') : s.hoursPerSecond === 6 ? t('speedSix') : t('speedDay')}
            </button>
          ))}
        </div>

        <button
          type="button"
          className="icon-btn scrubber-step"
          onClick={() => stepDay(1)}
          aria-label={t('nextDay')}
          title={t('nextDay')}
        >
          <CalendarDays size={18} strokeWidth={1.9} />
        </button>
      </div>

      <div className="scrubber-meta">
        <output className="scrubber-readout num" htmlFor="mission-clock">
          {dateTime(cursorMs)}
        </output>
        <span className="scrubber-hint">
          <MoveHorizontal size={13} strokeWidth={2} aria-hidden="true" />
          {t('scrubberHint')}
        </span>
      </div>
    </div>
  );
}
