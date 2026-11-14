import { metricColor } from '../../design/tokens.js';

/**
 * Sparkline — a 32px trend line for KPI cards. Purely decorative in layout,
 * but it carries a text alternative (aria-label with min/max) so screen
 * readers get the same information.
 */
export function Sparkline({ values = [], metric = 'neutral', label, min, max, height = 40 }) {
  const color = metricColor(metric);
  const data = values.filter((v) => Number.isFinite(v));
  if (data.length < 2) return <div className="spark spark--empty" style={{ height }} aria-hidden="true" />;

  const lo = min ?? Math.min(...data);
  const hi = max ?? Math.max(...data);
  const span = hi - lo || 1;
  const W = 100;
  const H = 30;
  const pts = data.map((v, i) => [(i / (data.length - 1)) * W, H - ((v - lo) / span) * (H - 4) - 2]);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
  const area = `${line} L${W},${H} L0,${H} Z`;
  const gid = `spark-${metric}-${Math.round(lo * 10)}-${Math.round(hi * 10)}`;

  return (
    <figure className="spark" style={{ height }}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={label}>
        <title>{label}</title>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${gid})`} />
        <path d={line} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
    </figure>
  );
}

/** Small SVG ring used for the mission score. */
export function ScoreRing({ value = 0, size = 96, stroke = 8, metric = 'score', label }) {
  const color = metricColor(metric);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value)) / 100;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="score-ring" role="img" aria-label={label}>
      <title>{label}</title>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.09)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${(c * pct).toFixed(2)} ${c.toFixed(2)}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}
