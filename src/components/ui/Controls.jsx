/** SegmentedControl — 7 / 30 / 90 days. Roving tabindex, arrow keys. */
export function SegmentedControl({ label, options, value, onChange, size = 'md' }) {
  const onKeyDown = (e) => {
    const i = options.findIndex((o) => o.value === value);
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      onChange(options[(i + 1) % options.length].value);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      onChange(options[(i - 1 + options.length) % options.length].value);
    }
  };
  return (
    <div className={`segmented segmented--${size}`} role="group" aria-label={label} onKeyDown={onKeyDown}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          tabIndex={o.value === value ? 0 : -1}
          className={`segmented-item ${o.value === value ? 'is-active' : ''}`}
          onClick={() => onChange(o.value)}
        >
          {o.icon && <o.icon size={15} strokeWidth={1.9} aria-hidden="true" />}
          <span>{o.label}</span>
        </button>
      ))}
    </div>
  );
}

/** Button — one primary action per screen, everything else is secondary. */
export function Button({ variant = 'secondary', size, icon: Icon, children, className = '', ...rest }) {
  return (
    <button
      type="button"
      className={`btn btn--${variant} ${size ? `btn--${size}` : ''} ${className}`.trim()}
      {...rest}
    >
      {Icon && <Icon size={16} strokeWidth={1.9} aria-hidden="true" />}
      <span>{children}</span>
    </button>
  );
}

/** IconButton — 36×36, tooltip via title + aria-label. */
export function IconButton({ icon: Icon, label, active, className = '', ...rest }) {
  return (
    <button
      type="button"
      className={`icon-btn ${active ? 'is-active' : ''} ${className}`.trim()}
      aria-label={label}
      title={label}
      aria-pressed={active}
      {...rest}
    >
      <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
    </button>
  );
}
