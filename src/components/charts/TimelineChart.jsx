import { useMemo, useRef, useState } from 'react';
import { colors } from '../../design/tokens.js';
import { useI18n } from '../../lib/i18n.jsx';

/**
 * TimelineChart — Sun and Earth altitude across the mission window.
 * Pure SVG, no chart library. Includes a keyboard-operable scrubber, a
 * selected-date marker and a text alternative for screen readers.
 */
export default function TimelineChart({ data, startMs, endMs, cursorMs, onCursor, height = 230 }) {
  const { t, date, dateRange } = useI18n();
  const svgRef = useRef(null);
  const [hover, setHover] = useState(null);
  const W = 1000;
  const H = height;
  const PAD = { top: 18, right: 16, bottom: 28, left: 44 };

  const { sunPath, earthPath, sunArea, yOf, xOf, ticksY, minAlt, maxAlt, zeroY } = useMemo(() => {
    const values = data.flatMap((d) => [d.sunAlt, d.earthAlt]);
    const lo = Math.min(-8, Math.floor(Math.min(...values) - 3));
    const hi = Math.max(8, Math.ceil(Math.max(...values) + 3));
    const innerW = W - PAD.left - PAD.right;
    const innerH = H - PAD.top - PAD.bottom;
    const x = (i) => PAD.left + (i / (data.length - 1)) * innerW;
    const y = (alt) => PAD.top + innerH - ((alt - lo) / (hi - lo)) * innerH;
    const line = (key) => data.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d[key]).toFixed(1)}`).join(' ');
    const area = `${line('sunAlt')} L${x(data.length - 1).toFixed(1)},${y(0).toFixed(1)} L${x(0).toFixed(1)},${y(0).toFixed(1)} Z`;
    const step = hi - lo > 20 ? 10 : 5;
    const ys = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) ys.push(v);
    return { sunPath: line('sunAlt'), earthPath: line('earthAlt'), sunArea: area, yOf: y, xOf: x, ticksY: ys, minAlt: lo, maxAlt: hi, zeroY: y(0) };
  }, [data, H]);

  const cursorIndex = Math.round(((cursorMs - startMs) / (endMs - startMs)) * (data.length - 1));
  const cursorX = xOf(Math.max(0, Math.min(data.length - 1, cursorIndex)));

  const pick = (clientX) => {
    const box = svgRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - box.left) / box.width));
    onCursor(startMs + ratio * (endMs - startMs));
  };

  const onKeyDown = (e) => {
    const dayMs = 86400000;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      onCursor(Math.max(startMs, Math.min(endMs, cursorMs + (e.key === 'ArrowRight' ? dayMs : -dayMs))));
    }
  };

  const hoverPoint = hover != null ? data[hover] : null;

  return (
    <div
      className="timeline"
      onPointerDown={(e) => pick(e.clientX)}
      onPointerMove={(e) => {
        const box = svgRef.current.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (e.clientX - box.left) / box.width));
        setHover(Math.round(ratio * (data.length - 1)));
      }}
      onPointerLeave={() => setHover(null)}
    >
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="timeline-svg"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="sun-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={colors.sun} stopOpacity="0.26" />
            <stop offset="100%" stopColor={colors.sun} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* horizontal grid */}
        {ticksY.map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={W - PAD.right} y1={yOf(v)} y2={yOf(v)} stroke="rgba(255,255,255,.07)" strokeWidth="1" />
            <text x={PAD.left - 10} y={yOf(v) + 4} textAnchor="end" className="chart-axis">
              {v}°
            </text>
          </g>
        ))}

        {/* horizon */}
        <line x1={PAD.left} x2={W - PAD.right} y1={zeroY} y2={zeroY} stroke="rgba(255,255,255,.28)" strokeWidth="1" strokeDasharray="4 4" />
        <text x={PAD.left + 10} y={zeroY + 16} textAnchor="start" className="chart-axis--hint">
          {t('terrainHorizon')}
        </text>

        <path d={sunArea} fill="url(#sun-fill)" />
        <path d={earthPath} fill="none" stroke={colors.earth} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        <path d={sunPath} fill="none" stroke={colors.sun} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

        {/* hover guide */}
        {hoverPoint && (
          <line x1={xOf(hover)} x2={xOf(hover)} y1={PAD.top} y2={H - PAD.bottom} stroke="rgba(255,255,255,.18)" strokeWidth="1" />
        )}

        {/* selected date */}
        <line x1={cursorX} x2={cursorX} y1={PAD.top - 6} y2={H - PAD.bottom} stroke={colors.accent} strokeWidth="2" />
        <circle cx={cursorX} cy={PAD.top - 6} r="5" fill={colors.accent} />
      </svg>

      <div
        className="timeline-scrub"
        role="slider"
        tabIndex={0}
        aria-label={t('selectedDate')}
        aria-valuemin={startMs}
        aria-valuemax={endMs}
        aria-valuenow={cursorMs}
        aria-valuetext={date(cursorMs)}
        onKeyDown={onKeyDown}
      />

      <div className="timeline-axis">
        <span className="num">{date(startMs)}</span>
        <span className="timeline-axis-mid num">{dateRange(startMs, endMs)}</span>
        <span className="num">{date(endMs)}</span>
      </div>

      {hoverPoint && (
        <div className="timeline-readout" style={{ left: `${(xOf(hover) / W) * 100}%` }} aria-hidden="true">
          <span className="num">{date(hoverPoint.t)}</span>
          <span data-metric="sun" className="num">
            {t('sunAltitude')} {hoverPoint.sunAlt.toFixed(1)}°
          </span>
          <span data-metric="earth" className="num">
            {t('earthAltitude')} {hoverPoint.earthAlt.toFixed(1)}°
          </span>
        </div>
      )}

      <p className="sr-only">
        {`${t('timelineTitle')}: ${t('sunAltitude')} ${Math.min(...data.map((d) => d.sunAlt)).toFixed(1)}° to ${Math.max(
          ...data.map((d) => d.sunAlt)
        ).toFixed(1)}°, ${t('earthAltitude')} ${Math.min(...data.map((d) => d.earthAlt)).toFixed(1)}° to ${Math.max(
          ...data.map((d) => d.earthAlt)
        ).toFixed(1)}°. ${dateRange(startMs, endMs)}.`}
      </p>
    </div>
  );
}
