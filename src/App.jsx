import { useEffect } from 'react';
import { Check, X } from 'lucide-react';
import Sidebar from './components/Sidebar.jsx';
import TopBar from './components/TopBar.jsx';
import ExplorerPage from './components/pages/ExplorerPage.jsx';
import ComparePage from './components/pages/ComparePage.jsx';
import SummaryPage from './components/pages/SummaryPage.jsx';
import ValidationPage from './components/pages/ValidationPage.jsx';
import InfoModal from './components/InfoModal.jsx';
import { MissionProvider, useMission } from './lib/store.jsx';
import { useI18n } from './lib/i18n.jsx';
import { downloadText, makeBrief } from './lib/brief.js';

function Shell() {
  const i18n = useI18n();
  const { t } = i18n;
  const { tab, modal, toast, notify, site, metrics, rank, landingMs, days } = useMission();

  const onExport = () => {
    const text = makeBrief({ ...i18n, site, metrics, startMs: landingMs, days, rank });
    downloadText(text, `SELENE-${site.id}-${i18n.lang}.txt`);
    notify(t('exported'));
  };

  return (
    <div className="app">
      <Sidebar />
      <div className="app-main">
        <TopBar onExport={onExport} />
        <main className="app-content" id="main">
          {tab === 'explorer' && <ExplorerPage />}
          {tab === 'comparison' && <ComparePage />}
          {tab === 'brief' && <SummaryPage />}
          {tab === 'validation' && <ValidationPage />}
          <footer className="app-footer">
            <span>{t('footer')}</span>
            <span>{t('footerRight')}</span>
          </footer>
        </main>
      </div>
      {modal && <InfoModal type={modal} />}
      {toast && (
        <div className="toast" role="status" aria-live="polite">
          <Check size={16} aria-hidden="true" />
          <span>{toast}</span>
          <button type="button" className="icon-btn" aria-label={t('close')} onClick={() => notify('')}>
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <MissionProvider>
      <Shell />
    </MissionProvider>
  );
}
