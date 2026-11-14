import { useId, useState } from 'react';
import { Info } from 'lucide-react';
import { useI18n } from '../../lib/i18n.jsx';

/**
 * Tooltip — an info button that reveals provenance for one metric:
 * source, formula and the exact time window it was computed over.
 * Opens on hover AND on focus (keyboard), closes on Escape and blur.
 */
export function Tooltip({ label, source, formula, window: windowText, children, placement = 'top' }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const id = useId();

  return (
    <span
      className="tip"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
    >
      <button
        type="button"
        className="tip-trigger"
        aria-label={t('moreInfo', { label })}
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onFocus={() => setOpen(true)}
        // Focus already opens the panel, so a click must not toggle it shut.
        // Escape, blur or moving the pointer away closes it.
        onClick={() => setOpen(true)}
      >
        {children ?? <Info size={14} strokeWidth={2} aria-hidden="true" />}
      </button>
      <span role="tooltip" id={id} className={`tip-panel tip-panel--${placement} ${open ? 'is-open' : ''}`}>
        <strong className="tip-title">{label}</strong>
        {source && (
          <span className="tip-row">
            <span className="tip-key">{t('tipSource')}</span>
            <span className="tip-val">{source}</span>
          </span>
        )}
        {formula && (
          <span className="tip-row">
            <span className="tip-key">{t('tipFormula')}</span>
            <span className="tip-val tip-val--mono">{formula}</span>
          </span>
        )}
        {windowText && (
          <span className="tip-row">
            <span className="tip-key">{t('tipWindow')}</span>
            <span className="tip-val">{windowText}</span>
          </span>
        )}
      </span>
    </span>
  );
}
