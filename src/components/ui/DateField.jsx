import { useEffect, useId, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { useI18n } from '../../lib/i18n.jsx';
import { isoDay } from '../../lib/format.js';

const DAY = 86400000;
const startOfDay = (ms) => Math.floor(ms / DAY) * DAY;

/**
 * DateField — a date picker that displays the date in the interface language
 * instead of the browser's locale (which is why the old screen showed
 * "01/09/2026" next to an "9 Jan" range). A real 6×7 grid, roving focus,
 * arrow-key navigation, Escape to close.
 */
export function DateField({ id, label, value, min, max, onChange }) {
  const { t, date, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => startOfDay(value));
  const rootRef = useRef(null);
  const gridRef = useRef(null);
  const inputId = id || useId();

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => setView(startOfDay(value)), [value]);

  const first = new Date(Date.UTC(new Date(view).getUTCFullYear(), new Date(view).getUTCMonth(), 1));
  const monthStart = first.getTime();
  // Monday-first weekday offset.
  const offset = (first.getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const cells = Array.from({ length: 42 }, (_, i) => {
    const dayMs = monthStart + (i - offset) * DAY;
    return { ms: dayMs, inMonth: i - offset >= 0 && i - offset < daysInMonth };
  });

  const monthLabel = new Date(monthStart).toLocaleDateString(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Date(Date.UTC(2024, 0, 1 + i)).toLocaleDateString(locale, { weekday: 'short', timeZone: 'UTC' })
  );

  const shiftMonth = (delta) =>
    setView(Date.UTC(new Date(view).getUTCFullYear(), new Date(view).getUTCMonth() + delta, 1));

  const onGridKeyDown = (e) => {
    const map = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (!(e.key in map)) return;
    e.preventDefault();
    const next = startOfDay(value) + map[e.key] * DAY;
    const clamped = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, next));
    onChange(clamped);
    setView(startOfDay(clamped));
  };

  const disabled = (ms) => (min && ms < startOfDay(min)) || (max && ms > startOfDay(max));

  return (
    <div className="field date-field" ref={rootRef}>
      <label className="field-label" htmlFor={inputId}>
        {label}
      </label>
      <button
        type="button"
        id={inputId}
        className="date-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <CalendarDays size={16} strokeWidth={1.75} aria-hidden="true" />
        <span className="date-trigger-value">{date(value)}</span>
        <span className="date-trigger-iso num">{isoDay(value)}</span>
      </button>

      {open && (
        <div className="date-pop" role="dialog" aria-label={label} ref={gridRef}>
          <div className="date-pop-head">
            <button type="button" className="icon-btn" aria-label={t('zoomOut')} onClick={() => shiftMonth(-1)}>
              <ChevronLeft size={16} aria-hidden="true" className="chev-prev" />
            </button>
            <strong className="date-pop-month">{monthLabel}</strong>
            <button type="button" className="icon-btn" aria-label={t('zoomIn')} onClick={() => shiftMonth(1)}>
              <ChevronRight size={16} aria-hidden="true" className="chev-next" />
            </button>
          </div>
          <div className="date-pop-weekdays" aria-hidden="true">
            {weekdays.map((w) => (
              <span key={w}>{w}</span>
            ))}
          </div>
          <div className="date-pop-grid" role="grid" onKeyDown={onGridKeyDown}>
            {cells.map((c) => {
              const selected = startOfDay(c.ms) === startOfDay(value);
              return (
                <button
                  key={c.ms}
                  type="button"
                  role="gridcell"
                  aria-selected={selected}
                  tabIndex={selected ? 0 : -1}
                  disabled={disabled(c.ms)}
                  className={`date-cell ${c.inMonth ? '' : 'is-outside'} ${selected ? 'is-selected' : ''}`}
                  onClick={() => {
                    onChange(c.ms);
                    setOpen(false);
                  }}
                >
                  <span className="num">{new Date(c.ms).getUTCDate()}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
