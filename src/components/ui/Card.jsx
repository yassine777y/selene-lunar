/**
 * Card — the one container primitive. Three surface levels, one border rule,
 * one radius, one padding. Nothing else in the app draws its own panel.
 */
export function Card({ as: Tag = 'section', level = 'card', metric, className = '', children, ...rest }) {
  const levelClass = level === 'elevated' ? 'card--elevated' : level === 'flat' ? 'card--flat' : '';
  return (
    <Tag className={`card ${levelClass} ${className}`.trim()} data-metric={metric} {...rest}>
      {children}
    </Tag>
  );
}

export function CardHeader({ title, subtitle, icon: Icon, actions, id }) {
  return (
    <header className="card-head">
      <div className="card-head-text">
        {title && (
          <h2 className="card-title" id={id}>
            {Icon && <Icon size={18} strokeWidth={1.75} aria-hidden="true" />}
            {title}
          </h2>
        )}
        {subtitle && <p className="card-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="card-actions">{actions}</div>}
    </header>
  );
}

export function CardBody({ className = '', children }) {
  return <div className={`card-body ${className}`.trim()}>{children}</div>;
}
