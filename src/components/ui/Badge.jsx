/**
 * Badge — status pill. Tones map to the semantic tokens; `metric` tones map to
 * the Sun / Earth / Score identity colours so a value keeps its colour.
 */
export function Badge({ tone = 'neutral', metric, icon: Icon, children, className = '', ...rest }) {
  return (
    <span className={`badge badge--${tone} ${className}`.trim()} data-metric={metric} {...rest}>
      {Icon && <Icon size={13} strokeWidth={2} aria-hidden="true" />}
      {children}
    </span>
  );
}

/** Small dot + label used in legends and the 3D HUD. */
export function LegendDot({ metric, label, value, title }) {
  return (
    <span className="legend-item" data-metric={metric} title={title}>
      <span className="legend-dot" aria-hidden="true" />
      <span className="legend-label">{label}</span>
      {value != null && <span className="legend-value num">{value}</span>}
    </span>
  );
}
