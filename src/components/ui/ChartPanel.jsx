import { Card, CardHeader } from './Card.jsx';

/**
 * ChartPanel — the frame every chart sits in: title, subtitle, actions,
 * a legend slot, the chart itself, and a real empty state (never a flat line
 * pretending to be data).
 */
export function ChartPanel({
  title,
  subtitle,
  icon,
  actions,
  legend,
  footer,
  empty,
  height = 260,
  children,
  className = '',
}) {
  return (
    <Card className={`chart-panel ${className}`.trim()}>
      <CardHeader title={title} subtitle={subtitle} icon={icon} actions={actions} />
      {legend && <div className="chart-legend">{legend}</div>}
      <div className="chart-area" style={{ minHeight: height }}>
        {empty ? <div className="chart-empty">{empty}</div> : children}
      </div>
      {footer && <div className="chart-footer">{footer}</div>}
    </Card>
  );
}
