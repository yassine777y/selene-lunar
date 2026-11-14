import { useI18n } from '../../lib/i18n.jsx';

/**
 * TierChip — the reliability label that sits next to a number, where the number
 * is read, not in a footnote at the bottom of the page.
 *
 * Three values only (see `model-meta.js`): measured, derived, estimated. The
 * chip is deliberately quiet — it is a tag, not a badge — but it is real text,
 * never a colour alone, and it carries the definition in its title and in an
 * sr-only suffix so screen readers get the same information.
 */
const KEY = {
  measured: 'tierMeasured',
  derived: 'tierDerived',
  estimated: 'tierEstimated',
};

const DEF = {
  measured: 'tierMeasuredDef',
  derived: 'tierDerivedDef',
  estimated: 'tierEstimatedDef',
};

export function TierChip({ tier, className = '' }) {
  const { t } = useI18n();
  if (!KEY[tier]) return null;
  return (
    <span className={`tier-chip tier-chip--${tier} ${className}`.trim()} title={t(DEF[tier])}>
      <span className="tier-chip-text">{t(KEY[tier])}</span>
      <span className="sr-only"> — {t(DEF[tier])}</span>
    </span>
  );
}
