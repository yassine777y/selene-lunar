import { ChevronRight, Download, Globe2, Menu } from 'lucide-react';
import { Button } from './ui/Controls.jsx';
import { useI18n } from '../lib/i18n.jsx';
import { useMission } from '../lib/store.jsx';

const LANGS = [
  ['en', 'EN', 'English'],
  ['fr', 'FR', 'Français'],
  ['ar', 'عربي', 'العربية'],
];

/** TopBar — breadcrumb left; language, mode badge and export right, on one baseline. */
export default function TopBar({ onExport }) {
  const { t, lang, setLang } = useI18n();
  const { tab, setDrawer } = useMission();
  const label = { explorer: t('navExplorer'), comparison: t('navCompare'), brief: t('navSummary'), validation: t('navValidation') }[tab];

  return (
    <header className="topbar">
      <div className="topbar-left">
        <button type="button" className="icon-btn topbar-menu" aria-label={t('openMenu')} onClick={() => setDrawer(true)}>
          <Menu size={20} aria-hidden="true" />
        </button>
        <nav className="breadcrumb" aria-label={t('breadcrumb')}>
          <span className="breadcrumb-root">{t('breadcrumb')}</span>
          <ChevronRight size={14} aria-hidden="true" className="breadcrumb-sep" />
          <span className="breadcrumb-current" aria-current="page">
            {label}
          </span>
        </nav>
      </div>

      <div className="topbar-right">
        <span className="mode-badge">
          <span className="mode-dot" aria-hidden="true" />
          {t('simMode')}
        </span>
        <div className="toolbar lang-switch" role="group" aria-label={t('language')}>
          <Globe2 size={15} strokeWidth={1.75} aria-hidden="true" className="lang-icon" />
          {LANGS.map(([code, short, full]) => (
            <button
              key={code}
              type="button"
              lang={code}
              className={`lang-btn ${lang === code ? 'is-active' : ''}`}
              aria-pressed={lang === code}
              aria-label={full}
              onClick={() => setLang(code)}
            >
              {short}
            </button>
          ))}
        </div>
        <div className="toolbar topbar-actions">
          <Button variant="primary" size="sm" icon={Download} onClick={onExport} className="export-btn">
            {t('exportBrief')}
          </Button>
        </div>
      </div>
    </header>
  );
}
