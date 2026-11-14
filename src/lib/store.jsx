/**
 * store.jsx — the single source of truth for the whole application
 * -----------------------------------------------------------------------
 * Every card, chart, 3D scene and export reads the *same* derived object, so
 * a number can never disagree with the date picker or with the 3D view.
 * The analysis window is always `landingDate … landingDate + duration`, and
 * nothing else in the app is allowed to compute a date of its own.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from 'react';
import { SITES, getSite } from './sites.js';
import { EPOCH_MS, MS_DAY, MS_HOUR, skyState } from './astro.js';
import { analyseWindow, series as buildSeries } from './metrics.js';
import { initialState, reducer, analysisWindowOf } from './mission-state.js';

const MissionContext = createContext(null);

export function MissionProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  /* ---------- derived data: computed once, consumed everywhere ---------- */
  const site = getSite(state.siteId);

  const summaries = useMemo(
    () => Object.fromEntries(SITES.map((s) => [s.id, analyseWindow(s, state.landingMs, state.days, 2)])),
    [state.landingMs, state.days]
  );

  const metrics = summaries[state.siteId] || summaries['connecting-ridge'];

  const ranking = useMemo(
    () => [...SITES].sort((a, b) => summaries[b.id].score - summaries[a.id].score),
    [summaries]
  );
  const rank = ranking.findIndex((s) => s.id === state.siteId) + 1;

  const series = useMemo(
    () => buildSeries(site, state.landingMs, state.days, state.days > 45 ? 6 : 3),
    [site, state.landingMs, state.days]
  );

  const sky = useMemo(() => skyState(site, state.cursorMs), [site, state.cursorMs]);

  /** Published figures are annual averages — shown next to the window value. */
  const annual = useMemo(() => analyseWindow(site, EPOCH_MS, 365, 12), [site]);

  // NB: named `analysisWindow`, not `window` — a local `window` binding would
  // shadow the global one used by the keyboard listener below.
  const analysisWindow = useMemo(() => analysisWindowOf(state), [state.landingMs, state.days]);

  /* --------------------------- actions -------------------------------- */
  const actions = useMemo(
    () => ({
      setTab: (value) => dispatch({ type: 'tab', value }),
      selectSite: (value) => dispatch({ type: 'site', value }),
      setLanding: (value) => dispatch({ type: 'landing', value }),
      setDays: (value) => dispatch({ type: 'days', value }),
      setCursor: (value) => dispatch({ type: 'cursor', value }),
      stepDay: (dir) => dispatch({ type: 'step', value: dir }),
      setPlaying: (value) => dispatch({ type: 'play', value }),
      setSpeed: (value) => dispatch({ type: 'speed', value }),
      setDrawer: (value) => dispatch({ type: 'drawer', value }),
      openModal: (value) => dispatch({ type: 'modal', value }),
      notify: (value) => dispatch({ type: 'toast', value }),
      goToSite: (value) => {
        dispatch({ type: 'site', value });
        dispatch({ type: 'tab', value: 'explorer' });
      },
    }),
    []
  );

  /* Toast auto-dismiss. */
  const toastTimer = useRef(null);
  useEffect(() => {
    if (!state.toast) return undefined;
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => dispatch({ type: 'toast', value: '' }), 3200);
    return () => clearTimeout(toastTimer.current);
  }, [state.toast]);

  /**
   * Playback: advances the *cursor* at a physical rate (state.speed = simulated
   * hours per real second) and wraps at the end of the window. The reducer's
   * 'cursor' action stops playback, so we dispatch a dedicated tick action that
   * keeps it running.
   */
  const cursorRef = useRef(state.cursorMs);
  cursorRef.current = state.cursorMs;
  useEffect(() => {
    if (!state.playing) return undefined;
    let raf;
    let last = performance.now();
    let value = cursorRef.current;
    const span = state.days * MS_DAY;
    const perMs = (state.speed * MS_HOUR) / 1000; // simulated ms per real ms
    const tick = (now) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(80, now - last);
      last = now;
      value += dt * perMs;
      if (value > state.landingMs + span) value = state.landingMs;
      dispatch({ type: 'tick', value });
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [state.playing, state.landingMs, state.days, state.speed]);

  /* Keyboard: space = play/pause, ←/→ = step a day, c = compare, esc = close. */
  useEffect(() => {
    const onKey = (e) => {
      const el = document.activeElement;
      const typing =
        el && (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(el.tagName) || el.isContentEditable || el.getAttribute('role') === 'slider');
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Escape') {
        dispatch({ type: 'modal', value: null });
        dispatch({ type: 'drawer', value: false });
        return;
      }
      if (typeaheadTarget(e)) return;
      if (e.key === ' ') {
        e.preventDefault();
        dispatch({ type: 'play' });
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        dispatch({ type: 'step', value: e.key === 'ArrowRight' ? 1 : -1 });
      } else if (e.key.toLowerCase() === 'c') {
        dispatch({ type: 'tab', value: 'comparison' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const value = useMemo(
    () => ({
      ...state,
      site,
      sites: SITES,
      summaries,
      metrics,
      ranking,
      rank,
      series,
      sky,
      annual,
      window: analysisWindow,
      ...actions,
    }),
    [state, site, summaries, metrics, ranking, rank, series, sky, annual, analysisWindow, actions]
  );

  return <MissionContext.Provider value={value}>{children}</MissionContext.Provider>;
}

export function useMission() {
  const ctx = useContext(MissionContext);
  if (!ctx) throw new Error('useMission must be used inside <MissionProvider>');
  return ctx;
}

/** Don't hijack single-letter shortcuts while the user is typing a name. */
const typeaheadTarget = (e) => e.target instanceof HTMLElement && e.target.matches('input, textarea, select');
