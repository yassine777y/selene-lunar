import { TriangleAlert } from 'lucide-react';
import { useCountUp } from './useCountUp.js';
import { TierChip } from './TierChip.jsx';
import { Tooltip } from './Tooltip.jsx';

/**
 * Metric — label + big number + unit + thick progress bar + explanation.
 * The colour always comes from `data-metric`, so Sun is amber and Earth is
 * teal in every card, chart and 3D marker.
 */
export function Metric({ metric = 'neutral', label, value, unit = '%', max = 100, decimals = 1, note, tip, tier, limits, size = 'lg', children }) {
  const display = useCountUp(value, { decimals });
  const ratio = Math.max(0, Math.min(1, (Number.isFinite(value) ? value : 0) / max));

  return (
    <div className={`metric metric--${size}`} data-metric={metric}>
      <div className="metric-label-row">
        <span className="metric-label">{label}</span>
        <TierChip tier={tier} />
        {tip && <Tooltip label={label} {...tip} />}
      </div>
      <p className="metric-value">
        <span className="metric-number num">{display}</span>
        <span className="metric-unit">{unit}</span>
        {max !== 100 && <span className="metric-max num">/ {max}</span>}
      </p>
      <div
        className="progress"
        role="progressbar"
        aria-valuenow={Number.isFinite(value) ? Number(value.toFixed(1)) : 0}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={label}
      >
        <span className="progress-fill" style={{ width: `${ratio * 100}%` }} />
      </div>
      {children}
      {note && <p className="metric-note">{note}</p>}
      {limits && (
        <p className="metric-limit">
          <TriangleAlert size={13} strokeWidth={2} aria-hidden="true" />
          <span>{limits}</span>
        </p>
      )}
    </div>
  );
}
