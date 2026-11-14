/**
 * SidebarItem — one navigation row: icon, label, optional count, active state.
 * Renders as a real button (or an anchor when `href` is set) so keyboard and
 * screen-reader behaviour come for free.
 */
export function SidebarItem({ icon: Icon, label, active = false, count, onClick, href, external = false }) {
  const content = (
    <>
      <span className="nav-icon">{Icon && <Icon size={20} strokeWidth={1.75} aria-hidden="true" />}</span>
      <span className="nav-label">{label}</span>
      {count != null && <span className="nav-count num">{count}</span>}
    </>
  );
  if (href) {
    return (
      <a className={`nav-item ${active ? 'is-active' : ''}`} href={href} {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}>
        {content}
      </a>
    );
  }
  return (
    <button type="button" className={`nav-item ${active ? 'is-active' : ''}`} aria-current={active ? 'page' : undefined} onClick={onClick}>
      {content}
    </button>
  );
}
