import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { useI18n } from '../lib/i18n.jsx';
import { useMission } from '../lib/store.jsx';
import { SCORE_WEIGHTS } from '../lib/metrics.js';

/** InfoModal — model scope and keyboard shortcuts, same shell as every dialog. */
export default function InfoModal({ type }) {
  const { t } = useI18n();
  const { openModal } = useMission();
  const closeRef = useRef(null);
  const panelRef = useRef(null);

  useEffect(() => {
    closeRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => {
      if (e.key === 'Escape') openModal(null);
      if (e.key !== 'Tab') return;
      const focusable = panelRef.current?.querySelectorAll('a[href], button:not([disabled])');
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [openModal]);

  const isModel = type === 'model';
  const title = isModel ? t('modelTitle') : t('shortcutTitle');

  return (
    <div className="modal-scrim" onMouseDown={(e) => e.target === e.currentTarget && openModal(null)}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" ref={panelRef}>
        <header className="modal-head">
          <h2 id="modal-title">{title}</h2>
          <button type="button" className="icon-btn" aria-label={t('close')} onClick={() => openModal(null)} ref={closeRef}>
            <X size={18} aria-hidden="true" />
          </button>
        </header>
        <div className="modal-body">
          {isModel ? (
            <>
              <p className="modal-lead">{t('modelIntro')}</p>
              <h3 className="modal-h3">{t('modelWhat')}</h3>
              <ul className="modal-list">
                {['model1', 'model2', 'model3', 'model4', 'model5'].map((k) => (
                  <li key={k}>{t(k)}</li>
                ))}
              </ul>
              <h3 className="modal-h3">{t('modelNot')}</h3>
              <ul className="modal-list">
                {['not1', 'not2', 'not3', 'not4', 'not5'].map((k) => (
                  <li key={k}>{t(k)}</li>
                ))}
              </ul>
              <p className="modal-note">
                {t('modelScore', {
                  sun: Math.round(SCORE_WEIGHTS.sun * 100),
                  earth: Math.round(SCORE_WEIGHTS.earth * 100),
                  night: Math.round(SCORE_WEIGHTS.night * 100),
                })}
              </p>
              <p className="modal-note">{t('textureCredit')}</p>
            </>
          ) : (
            <ul className="shortcut-list">
              <li>
                <span>{t('shortcutDays')}</span>
                <kbd>←</kbd>
                <kbd>→</kbd>
              </li>
              <li>
                <span>{t('shortcutPlay')}</span>
                <kbd>{t('space')}</kbd>
              </li>
              <li>
                <span>{t('shortcutCompare')}</span>
                <kbd>C</kbd>
              </li>
              <li>
                <span>{t('shortcutEscape')}</span>
                <kbd>Esc</kbd>
              </li>
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
