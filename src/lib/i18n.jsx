import { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { dictionaries, SITE_TEXT, LOCALES } from './locales.js';
import { UI_STRINGS } from './ui-strings.js';

const merged = {
  en: { ...dictionaries.en, ...UI_STRINGS.en },
  fr: { ...dictionaries.fr, ...UI_STRINGS.fr },
  ar: { ...dictionaries.ar, ...UI_STRINGS.ar },
};

const I18nContext = createContext(null);

export function I18nProvider({ children }) {
  const [lang, setLang] = useState(() => {
    try {
      const saved = localStorage.getItem('selene-language');
      return merged[saved] ? saved : 'en';
    } catch {
      return 'en';
    }
  });

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    try {
      localStorage.setItem('selene-language', lang);
    } catch {
      /* private mode */
    }
  }, [lang]);

  const value = useMemo(() => {
    const t = (key, vars = {}) => {
      let result = merged[lang][key] ?? merged.en[key] ?? key;
      for (const [k, v] of Object.entries(vars)) result = result.replaceAll(`{${k}}`, String(v));
      return result;
    };
    const siteText = (s) => {
      const a = SITE_TEXT[lang]?.[s.id];
      return a ? { ...s, name: a[0], region: a[1], tag: a[2], blurb: a[3] } : s;
    };
    const locale = LOCALES[lang];
    // Gregorian dates are always written left-to-right, so isolate them: without
    // this, Arabic bidi reorders "9 Jan 2026" into "9 2026 Jan" on screen.
    const isolate = (text) => `\u2066${text}\u2069`;
    // Arabic: ISO order (2026-01-09). Mixed Arabic month names and Latin digits
    // are bidi-ambiguous and reorder on screen; the ISO form is unambiguous,
    // matches the mono numeric grid, and is what mission operations use.
    const iso = (ms, withTime = false) => {
      const d = new Date(ms);
      const day = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
      if (!withTime) return day;
      return `${day} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
    };
    const date = (ms, opts = {}) =>
      lang === 'ar' ? isolate(iso(ms)) : isolate(new Date(ms).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC', ...opts }));
    const dateTime = (ms) =>
      isolate(
        new Date(ms).toLocaleString(locale, {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'UTC',
          hour12: false,
        })
      );
    const dateLong = (ms) =>
      isolate(new Date(ms).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }));
    const dateRange = (a, b) =>
      lang === 'ar'
        ? isolate(`${iso(a)} → ${iso(b)}`)
        : isolate(
            `${new Date(a).toLocaleDateString(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' })} – ${new Date(b).toLocaleDateString(
              locale,
              { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }
            )}`
          );
    const time = (ms) =>
      new Date(ms).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'UTC' });
    const hours = (h) =>
      h >= 48 ? `${(h / 24).toFixed(1)} ${t('dayShort')}` : h >= 1 ? `${h.toFixed(1)} ${t('hourShort')}` : `${Math.round(h * 60)} ${t('minuteShort')}`;
    return { lang, setLang, t, siteText, date, dateLong, dateTime, dateRange, time, hours, rtl: lang === 'ar', locale };
  }, [lang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export const useI18n = () => useContext(I18nContext);
