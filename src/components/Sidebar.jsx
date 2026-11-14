import { Compass, GitCompareArrows, FileText, ShieldCheck, HelpCircle, Keyboard, X, Orbit, ChevronDown } from 'lucide-react';
import { SidebarItem } from './ui/SidebarItem.jsx';
import { useI18n } from '../lib/i18n.jsx';
import { useMission } from '../lib/store.jsx';

/**
 * Sidebar — 248px, sticky, three zones: identity, navigation, resources.
 * The decorative promo panel from v5 is gone; only a single-line tagline
 * remains at the bottom, as a footer rather than a card.
 */
export default function Sidebar() {
  const { t, siteText } = useI18n();
  const { tab, setTab, sites, site, selectSite, drawerOpen, setDrawer, openModal } = useMission();
  const translated = siteText(site);

  const items = [
    { id: 'explorer', label: t('navExplorer'), icon: Compass },
    { id: 'comparison', label: t('navCompare'), icon: GitCompareArrows, count: sites.length },
    { id: 'brief', label: t('navSummary'), icon: FileText },
    { id: 'validation', label: t('navValidation'), icon: ShieldCheck },
  ];

  return (
    <>
      <div className={`sidebar-scrim ${drawerOpen ? 'is-open' : ''}`} onClick={() => setDrawer(false)} aria-hidden="true" />
      <aside className={`sidebar ${drawerOpen ? 'is-open' : ''}`} aria-label={t('navGroupWorkspace')}>
        <div className="sidebar-head">
          <a className="brand" href="#main" aria-label="Selene">
            <span className="brand-mark" aria-hidden="true">
              <Orbit size={22} strokeWidth={1.6} />
            </span>
            <span className="brand-text">
              <strong>Selene</strong>
              <span>Lunar mission planner</span>
            </span>
          </a>
          <button type="button" className="icon-btn sidebar-close" aria-label={t('closeMenu')} onClick={() => setDrawer(false)}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="mission-switch">
          <div className="mission-switch-top">
            <span className="mission-badge-mark" aria-hidden="true">01</span>
            <div className="mission-switch-text">
              <span className="mission-switch-label">{t('mission')}</span>
              <strong>{t('polar')}</strong>
            </div>
          </div>
          <div className="select-wrap">
            <select
              id="site-switcher"
              className="site-select"
              aria-label={t('selectedSite')}
              value={site.id}
              onChange={(e) => selectSite(e.target.value)}
            >
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {siteText(s).name}
                </option>
              ))}
            </select>
            <ChevronDown size={16} aria-hidden="true" className="select-chevron" />
          </div>
        </div>

        <nav className="nav" aria-label={t('navGroupWorkspace')}>
          <p className="nav-group">{t('navGroupWorkspace')}</p>
          {items.map((item) => (
            <SidebarItem
              key={item.id}
              icon={item.icon}
              label={item.label}
              count={item.count}
              active={tab === item.id}
              onClick={() => setTab(item.id)}
            />
          ))}
        </nav>

        <div className="sidebar-foot">
          <p className="nav-group">{t('navGroupResources')}</p>
          <SidebarItem icon={HelpCircle} label={t('aboutModel')} onClick={() => openModal('model')} />
          <SidebarItem icon={Keyboard} label={t('shortcuts')} onClick={() => openModal('shortcuts')} />
          <p className="sidebar-tagline">{translated.name} · {t('tagline')}</p>
        </div>
      </aside>
    </>
  );
}
